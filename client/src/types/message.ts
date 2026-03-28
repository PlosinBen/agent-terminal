export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType?: 'text' | 'thinking' | 'tool_use' | 'result' | 'error';
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  collapsible?: boolean;
}

export interface StatusInfo {
  segments: { id?: string; label?: string; value: string; rawValue?: string; color?: string }[];
  agentStatus: 'idle' | 'running' | 'attention';
  gitBranch: string;
}

export interface ProviderConfig {
  models: { value: string; displayName: string; description: string }[];
  permissionModes: string[];
  effortLevels: string[];
}

export interface PermissionReq {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
}
