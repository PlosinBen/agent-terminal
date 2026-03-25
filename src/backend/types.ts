export interface AgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system' | 'result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  sessionId?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface PermissionRequest {
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
}

export type PermissionHandler = (req: PermissionRequest) => Promise<
  { behavior: 'allow' } | { behavior: 'deny'; message: string }
>;

export interface AgentBackend {
  query(prompt: string, opts?: { cwd?: string }): AsyncGenerator<AgentMessage>;
  stop(): void;
  setPermissionHandler(handler: PermissionHandler): void;
}
