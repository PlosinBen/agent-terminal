import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import type { StatusSegment } from '../types.js';
import { logger } from '../../core/logger.js';


interface RateLimitInfo {
  status: string;
  utilization?: number;
  resetsAt?: number;
}

export class UsageTracker {
  costUsd = 0;
  inputTokens = 0;
  outputTokens = 0;
  contextWindow = 0;
  contextUsedTokens = 0;
  rateLimits = new Map<string, RateLimitInfo>();

  update(result: SDKResultSuccess): void {
    this.costUsd += result.total_cost_usd ?? 0;

    // Only update tokens when there's actual usage (avoid /context compact resetting to 0)
    if (result.usage.input_tokens > 0 || result.usage.output_tokens > 0) {
      this.inputTokens = result.usage.input_tokens;
      this.outputTokens = result.usage.output_tokens;
    }

    if (result.modelUsage) {
      const numTurns = Math.max(1, result.num_turns ?? 1);

      // Log raw modelUsage for debugging
      for (const [model, mu] of Object.entries(result.modelUsage)) {
        const cumulative = mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
        logger.info(`[usage] model=${model} numTurns=${numTurns} input=${mu.inputTokens} cacheRead=${mu.cacheReadInputTokens} cacheCreation=${mu.cacheCreationInputTokens} cumulative=${cumulative} window=${mu.contextWindow}`);
      }

      // modelUsage tokens are CUMULATIVE across all internal API calls in this query.
      // Each internal turn sends roughly the full context, so:
      //   cumulative ≈ numTurns × avgContextSize
      //   avgContextSize ≈ cumulative / numTurns
      //
      // This is a reasonable approximation of current context window occupancy.
      // Pick the main model (largest context window).
      let bestUsed = 0;
      let bestWindow = 0;
      for (const mu of Object.values(result.modelUsage)) {
        const cumulative = mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
        const estimatedContext = Math.round(cumulative / numTurns);

        if (mu.contextWindow > bestWindow || (mu.contextWindow === bestWindow && estimatedContext > bestUsed)) {
          bestUsed = estimatedContext;
          bestWindow = mu.contextWindow;
        }
      }
      this.contextUsedTokens = bestUsed;
      this.contextWindow = bestWindow;

      logger.info(`[usage] ctx estimate: ${bestUsed}/${bestWindow} = ${bestWindow > 0 ? Math.round(bestUsed / bestWindow * 100) : 0}%`);
    }
  }

  updateRateLimit(info: Record<string, unknown>): void {
    if (info.rateLimitType) {
      this.rateLimits.set(String(info.rateLimitType), {
        status: String(info.status ?? 'allowed'),
        utilization: info.utilization != null ? Number(info.utilization) : undefined,
        resetsAt: info.resetsAt != null ? Number(info.resetsAt) : undefined,
      });
    }
  }

  getStatusSegments(): StatusSegment[] {
    const tokens = `${(this.inputTokens / 1000).toFixed(0)}k+${(this.outputTokens / 1000).toFixed(0)}k`;
    const ctxPct = this.contextWindow > 0
      ? `${Math.round((this.contextUsedTokens / this.contextWindow) * 100)}%`
      : null;
    const ctxColor = this.contextWindow > 0
      ? (this.contextUsedTokens / this.contextWindow >= 0.8 ? '#e06c75' : this.contextUsedTokens / this.contextWindow >= 0.5 ? '#e5c07b' : undefined)
      : undefined;
    const segments: StatusSegment[] = [
      ...(ctxPct ? [{ label: 'ctx', value: ctxPct, color: ctxColor }] : []),
      { value: tokens },
      { value: `$${this.costUsd.toFixed(3)}` },
    ];

    const labelMap: Record<string, string> = {
      five_hour: '5h',
      seven_day: '7d',
      seven_day_opus: '7d-opus',
      seven_day_sonnet: '7d-sonnet',
    };
    for (const [type, info] of this.rateLimits) {
      let value: string;
      let color: string | undefined;
      if (info.utilization != null) {
        const pct = Math.round(info.utilization);
        color = pct >= 80 ? '#e06c75' : pct >= 50 ? '#e5c07b' : undefined;
        value = `${pct}%`;
      } else {
        color = info.status === 'rejected' ? '#e06c75' : info.status === 'allowed_warning' ? '#e5c07b' : undefined;
        value = info.status === 'allowed' ? 'ok' : info.status;
      }
      if (info.resetsAt) {
        const diff = info.resetsAt * 1000 - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 60000);
          value += mins >= 60 ? ` ↻${(mins / 60).toFixed(1)}h` : ` ↻${mins}m`;
        }
      }
      segments.push({ label: labelMap[type] ?? type, value, color });
    }
    return segments;
  }
}
