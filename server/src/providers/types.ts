import type { RawUsageData } from '../shared/types.js';
export type { RawUsageData } from '../shared/types.js';

export interface AgentMessage {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system' | 'result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
  parentToolUseId?: string;
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
  { behavior: 'allow'; updatedInput?: Record<string, unknown> } | { behavior: 'deny'; message: string }
>;

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
  query(prompt: string, opts?: { cwd?: string; model?: string; permissionMode?: string; effort?: string; images?: string[] }): AsyncGenerator<AgentMessage>;
  stop(): void;
  setPermissionHandler(handler: PermissionHandler): void;
  setPermissionMode(mode: string): Promise<void>;
  getRawUsage(): RawUsageData;
  isInitialized(): boolean;
  getProviderCommands(): CommandInfo[];
  getSlashCommands(): CommandInfo[];
  executeCommand(name: string, args: string): Promise<ProviderCommandResult | null>;
  onInit(callback: () => void): void;
  warmup?(cwd: string): Promise<void>;
}

/**
 * Provider definition — each provider folder exports one of these.
 * Contains metadata + factory for creating backend instances.
 */
export interface ProviderDefinition {
  /** Unique key, e.g. 'claude', 'gemini' */
  name: string;
  /** Display name for UI, e.g. 'Claude', 'Gemini' */
  displayName: string;
  /** Create a new backend instance */
  createBackend(opts?: { sessionId?: string }): AgentBackend;
  /** Check if this provider is available on the current machine */
  checkAvailable(): Promise<boolean>;
}
