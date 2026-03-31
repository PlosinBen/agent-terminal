import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import type { RawUsageData } from '../../shared/types.js';
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
  numTurns = 0;
  rateLimits = new Map<string, RateLimitInfo>();

  update(result: SDKResultSuccess): void {
    this.costUsd += result.total_cost_usd ?? 0;

    // Only update values when there's actual usage (avoid /context compact resetting to 0)
    const incomingTurns = result.num_turns ?? 0;
    if (incomingTurns > 0) {
      this.numTurns = incomingTurns;
    }

    if (result.usage.input_tokens > 0 || result.usage.output_tokens > 0) {
      this.inputTokens = result.usage.input_tokens;
      this.outputTokens = result.usage.output_tokens;
    }

    if (result.modelUsage) {
      // Log raw modelUsage for debugging
      for (const [model, mu] of Object.entries(result.modelUsage)) {
        const cumulative = mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
        logger.info(`[usage] model=${model} numTurns=${this.numTurns} input=${mu.inputTokens} cacheRead=${mu.cacheReadInputTokens} cacheCreation=${mu.cacheCreationInputTokens} cumulative=${cumulative} window=${mu.contextWindow}`);
      }

      // Pick the main model (largest context window) and store raw cumulative tokens.
      // The client is responsible for computing the display percentage.
      let bestCumulative = 0;
      let bestWindow = 0;
      for (const mu of Object.values(result.modelUsage)) {
        const cumulative = mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
        if (mu.contextWindow > bestWindow || (mu.contextWindow === bestWindow && cumulative > bestCumulative)) {
          bestCumulative = cumulative;
          bestWindow = mu.contextWindow;
        }
      }

      // Skip update when modelUsage returns zeroed data (e.g. after /context compact)
      if (bestCumulative > 0 || bestWindow > 0) {
        this.contextUsedTokens = bestCumulative;
        this.contextWindow = bestWindow;
      }
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

  getRawUsage(): RawUsageData {
    return {
      costUsd: this.costUsd,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      contextUsedTokens: this.contextUsedTokens,
      contextWindow: this.contextWindow,
      numTurns: Math.max(1, this.numTurns),
      rateLimits: Array.from(this.rateLimits.entries()).map(([type, info]) => ({
        type,
        status: info.status,
        utilization: info.utilization,
        resetsAt: info.resetsAt,
      })),
    };
  }
}
