import type { AgentStatus, RawUsageData } from '@shared/types';

export type { ProviderConfig } from '@shared/types';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  messageType?: 'text' | 'thinking' | 'tool_use' | 'result' | 'error' | 'compact';
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  parentToolUseId?: string;
  collapsible?: boolean;
}

export interface StatusInfo {
  usage: RawUsageData;
  agentStatus: AgentStatus;
  gitBranch: string;
}

export interface PermissionReq {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
}
