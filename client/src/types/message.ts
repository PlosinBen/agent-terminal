export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType?: 'text' | 'tool_use' | 'result' | 'error';
  toolName?: string;
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
