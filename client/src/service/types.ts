import type { DownstreamMessage } from '@shared/protocol';

// ── Service Events ──

export const ServiceEvent = {
  // Agent streaming events (keyed by projectId)
  AgentText: 'agent:text',
  AgentToolUse: 'agent:tool_use',
  AgentResult: 'agent:result',
  AgentDone: 'agent:done',
  AgentError: 'agent:error',

  // Permission
  PermissionRequest: 'permission:request',

  // Status
  StatusUpdate: 'status:update',

  // PTY
  PtyOutput: 'pty:output',
  PtyExit: 'pty:exit',

  // Connection lifecycle
  ConnectionChanged: 'connection:changed',
} as const;

export type ServiceEventType = typeof ServiceEvent[keyof typeof ServiceEvent];

// ── Event Payloads ──

/** All project-scoped downstream messages carry projectId */
export type ProjectEvent = Extract<DownstreamMessage, { projectId: string }>;

export interface ConnectionChangedPayload {
  host: string;
  status: 'connected' | 'reconnecting' | 'disconnected' | 'error';
}

// ── Service Event Handler types ──

export type ServiceEventHandler = (payload: DownstreamMessage | ConnectionChangedPayload) => void;
