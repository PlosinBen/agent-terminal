import type { DownstreamMessage } from '@shared/protocol';

// ── Service Events ──

export const ServiceEvent = {
  // Agent streaming events (keyed by projectId)
  AgentText: 'agent:text',
  AgentThinking: 'agent:thinking',
  AgentToolUse: 'agent:tool_use',
  AgentToolResult: 'agent:tool_result',
  AgentResult: 'agent:result',
  AgentDone: 'agent:done',
  AgentError: 'agent:error',
  AgentSystem: 'agent:system',

  // Permission
  PermissionRequest: 'permission:request',

  // Commands
  CommandResult: 'command:result',

  // Status
  StatusUpdate: 'status:update',

  // PTY
  PtyOutput: 'pty:output',
  PtyExit: 'pty:exit',

  // Task tracking
  TaskUpdate: 'task:update',

  // Provider
  ProviderList: 'provider:list',

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
