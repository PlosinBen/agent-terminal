/**
 * Compute display segments from raw usage data (ported from server-side UsageTracker).
 * All display formatting logic lives here on the client.
 */
import type { RawUsageData, StatusSegment } from '@shared/types';

export function computeUsageSegments(usage: RawUsageData | undefined | null): StatusSegment[] {
  if (!usage) return [];
  const tokens = `${(usage.inputTokens / 1000).toFixed(0)}k+${(usage.outputTokens / 1000).toFixed(0)}k`;

  // Context %: same approach as better-agent-terminal reference.
  // contextUsedTokens (cumulative input incl. cache) + outputTokens as a ratio of contextWindow.
  // This is a monotonically increasing proxy for context consumption — not exact current
  // occupancy, but a useful indicator of how much of the window has been used.
  const ctxUsed = usage.contextUsedTokens + usage.outputTokens;
  const ctxRatio = usage.contextWindow > 0 ? ctxUsed / usage.contextWindow : 0;
  const ctxPct = usage.contextWindow > 0
    ? `${Math.round(ctxRatio * 100)}%`
    : null;
  const ctxColor = usage.contextWindow > 0
    ? (ctxRatio >= 0.8 ? '#e06c75' : ctxRatio >= 0.5 ? '#e5c07b' : undefined)
    : undefined;

  const segments: StatusSegment[] = [
    ...(ctxPct ? [{ label: 'ctx', value: ctxPct, color: ctxColor }] : []),
    { value: tokens },
    { value: `$${usage.costUsd.toFixed(3)}` },
  ];

  // Rate limit segments
  const labelMap: Record<string, string> = {
    five_hour: '5h',
    seven_day: '7d',
    seven_day_opus: '7d-opus',
    seven_day_sonnet: '7d-sonnet',
  };

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

  return segments;
}
