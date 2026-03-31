/**
 * Shared types — used by both client and server.
 */

// ── Status ──

export type AgentStatus = 'idle' | 'running' | 'attention';

export interface StatusSegment {
  label?: string;
  value: string;
  color?: string;
}

export interface RateLimitData {
  type: string;
  status: string;
  utilization?: number;
  resetsAt?: number;
}

export interface RawUsageData {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  contextUsedTokens: number;
  contextWindow: number;
  numTurns: number;
  rateLimits: RateLimitData[];
}

// ── Provider ──

export interface ProviderConfig {
  models: { value: string; displayName: string; description: string }[];
  permissionModes: string[];
  effortLevels: string[];
  slashCommands?: { name: string; description: string; argumentHint: string }[];
}

// ── Permission Mode Display ──

export const PERMISSION_MODE_LABELS: Record<string, string> = {
  default: 'Prompt',
  acceptEdits: 'AcceptEdits',
  bypassPermissions: 'BypassPermissions',
  plan: 'Plan',
  dontAsk: 'AutoDeny',
};
