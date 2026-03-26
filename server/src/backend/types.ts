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

export interface StatusSegment {
  label?: string;   // optional title, e.g. "5d"
  value: string;    // content, e.g. "$12.30"
  color?: string;   // value color, e.g. "cyan"
}

export interface CommandInfo {
  name: string;
  description: string;
  argumentHint: string;
  options?: () => { value: string; desc: string }[];
}

export interface ProviderCommandResult {
  message: string;
  updated?: { model?: string; permissionMode?: string; effort?: string };
}

export interface ModelOption {
  value: string;
  displayName: string;
  description: string;
}

export interface AgentBackend {
  query(prompt: string, opts?: { cwd?: string }): AsyncGenerator<AgentMessage>;
  stop(): void;
  setPermissionHandler(handler: PermissionHandler): void;
  getStatusSegments(): StatusSegment[];
  isInitialized(): boolean;
  getModel(): string;
  getPermissionMode(): string;
  getEffort(): string;
  getProviderCommands(): CommandInfo[];
  getSlashCommands(): CommandInfo[];
  executeCommand(name: string, args: string): Promise<ProviderCommandResult | null>;
  onInit(callback: () => void): void;
}
