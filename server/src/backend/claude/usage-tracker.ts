import type { SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import type { StatusSegment } from '../types.js';

const PERMISSION_MODE_DISPLAY: Record<string, { label: string; color?: string }> = {
  default: { label: 'Prompt', color: '#ffffff' },
  acceptEdits: { label: 'AcceptEdits', color: '#e5c07b' },
  bypassPermissions: { label: 'BypassPermissions', color: '#e06c75' },
  plan: { label: 'Plan', color: '#56b6c2' },
  dontAsk: { label: 'AutoDeny' },
};

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
    this.inputTokens = result.usage.input_tokens;
    this.outputTokens = result.usage.output_tokens;

    if (result.modelUsage) {
      let totalUsed = 0;
      let maxWindow = 0;
      for (const mu of Object.values(result.modelUsage)) {
        totalUsed += mu.inputTokens + mu.cacheReadInputTokens + mu.cacheCreationInputTokens;
        if (mu.contextWindow > maxWindow) maxWindow = mu.contextWindow;
      }
      this.contextUsedTokens = totalUsed;
      this.contextWindow = maxWindow;
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

  getStatusSegments(model: string, permissionMode: string, effort: string): StatusSegment[] {
    const tokens = `${(this.inputTokens / 1000).toFixed(0)}k+${(this.outputTokens / 1000).toFixed(0)}k`;
    const ctxPct = this.contextWindow > 0
      ? `${Math.round((this.contextUsedTokens / this.contextWindow) * 100)}%`
      : null;
    const ctxColor = this.contextWindow > 0
      ? (this.contextUsedTokens / this.contextWindow >= 0.8 ? '#e06c75' : this.contextUsedTokens / this.contextWindow >= 0.5 ? '#e5c07b' : undefined)
      : undefined;
    const segments: StatusSegment[] = [
      { id: 'model', value: model },
      { id: 'permissionMode', value: (PERMISSION_MODE_DISPLAY[permissionMode]?.label ?? permissionMode), rawValue: permissionMode, color: PERMISSION_MODE_DISPLAY[permissionMode]?.color },
      { id: 'effort', label: 'effort', value: effort },
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
