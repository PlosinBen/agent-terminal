export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type AgentStatus = 'idle' | 'running' | 'attention';

/** Runtime project state — includes both persisted config and transient UI state. */
export interface ProjectInfo {
  id: string;
  name: string;
  cwd: string;
  serverHost: string;
  agentStatus: AgentStatus;
  connectionStatus: ConnectionStatus;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
}

/** Subset of ProjectInfo that gets persisted to localStorage. */
export interface SavedProject {
  id: string;
  name: string;
  cwd: string;
  serverHost: string;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
}
