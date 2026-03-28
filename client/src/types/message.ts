export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType?: 'text' | 'thinking' | 'tool_use' | 'result' | 'error';
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  collapsible?: boolean;
}

export interface StatusInfo {
  segments: { label?: string; value: string; color?: string }[];
  agentStatus: 'idle' | 'running' | 'attention';
  gitBranch: string;
}

export interface PermissionReq {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
}
