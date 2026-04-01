/**
 * Compute display segments from raw usage data (ported from server-side UsageTracker).
 * All display formatting logic lives here on the client.
 * Data-driven: only generates segments for fields that have values.
 */
import type { RawUsageData, StatusSegment } from '@shared/types';

export function computeUsageSegments(usage: RawUsageData | undefined | null): StatusSegment[] {
  if (!usage) return [];

  const segments: StatusSegment[] = [];

  // Context %: only show if contextWindow is provided and > 0
  if (usage.contextWindow != null && usage.contextWindow > 0 &&
      usage.contextUsedTokens != null && usage.outputTokens != null) {
    const ctxUsed = usage.contextUsedTokens + usage.outputTokens;
    const ctxRatio = ctxUsed / usage.contextWindow;
    const ctxPct = `${Math.round(ctxRatio * 100)}%`;
    const ctxColor = ctxRatio >= 0.8 ? '#e06c75' : ctxRatio >= 0.5 ? '#e5c07b' : undefined;
    segments.push({ label: 'ctx', value: ctxPct, color: ctxColor });
  }

  // Token count: only show if both input and output tokens are provided
  if (usage.inputTokens != null && usage.outputTokens != null) {
    const tokens = `${(usage.inputTokens / 1000).toFixed(0)}k+${(usage.outputTokens / 1000).toFixed(0)}k`;
    segments.push({ value: tokens });
  }

  // Cost: only show if costUsd is provided
  if (usage.costUsd != null) {
    segments.push({ value: `$${usage.costUsd.toFixed(3)}` });
  }

  // Rate limit segments: only show if rateLimits array is provided
  const labelMap: Record<string, string> = {
    five_hour: '5h',
    seven_day: '7d',
    seven_day_opus: '7d-opus',
    seven_day_sonnet: '7d-sonnet',
  };

  if (usage.rateLimits) {
    for (const rl of usage.rateLimits) {
      let value: string;
      let color: string | undefined;
      if (rl.utilization != null) {
        const pct = Math.round(rl.utilization);
        color = pct >= 80 ? '#e06c75' : pct >= 50 ? '#e5c07b' : undefined;
        value = `${pct}%`;
      } else {
        color = rl.status === 'rejected' ? '#e06c75' : rl.status === 'allowed_warning' ? '#e5c07b' : undefined;
        value = rl.status === 'allowed' ? 'ok' : rl.status;
      }
      if (rl.resetsAt) {
        const diff = rl.resetsAt * 1000 - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 60000);
          value += mins >= 60 ? ` \u21bb${(mins / 60).toFixed(1)}h` : ` \u21bb${mins}m`;
        }
      }
      segments.push({ label: labelMap[rl.type] ?? rl.type, value, color });
    }
  }

  return segments;
}
