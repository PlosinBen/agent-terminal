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
