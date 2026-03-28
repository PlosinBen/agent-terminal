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
  segments: { label?: string; value: string; color?: string }[];
  agentStatus: 'idle' | 'running' | 'attention';
  gitBranch: string;
}

export interface ProviderConfig {
  models: { value: string; displayName: string; description: string }[];
  permissionModes: string[];
  effortLevels: string[];
  slashCommands?: { name: string; description: string; argumentHint: string }[];
}

export interface PermissionReq {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
}
