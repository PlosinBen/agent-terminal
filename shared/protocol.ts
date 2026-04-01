/**
 * WebSocket protocol — shared message types between main process and renderer.
 */

import type { AgentStatus, RawUsageData, ProviderConfig } from './types.js';
export type { ProviderConfig } from './types.js';

// ── Renderer → Main ──

export interface AgentQueryMsg {
  type: 'agent:query';
  projectId: string;
  prompt: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  images?: string[];
}

export interface AgentStopMsg {
  type: 'agent:stop';
  projectId: string;
}

export interface AgentCommandMsg {
  type: 'agent:command';
  projectId: string;
  command: string;
  args: string;
  requestId: string;
}

export interface PermissionResponseMsg {
  type: 'permission:response';
  projectId: string;
  requestId: string;
  result: { behavior: 'allow' } | { behavior: 'deny'; message: string };
}

export interface PtySpawnMsg {
  type: 'pty:spawn';
  projectId: string;
  requestId: string;
}

export interface PtyInputMsg {
  type: 'pty:input';
  projectId: string;
  data: string;
}

export interface PtyResizeMsg {
  type: 'pty:resize';
  projectId: string;
  cols: number;
  rows: number;
}

export interface ProjectCreateMsg {
  type: 'project:create';
  id: string;
  cwd: string;
  requestId: string;
  sessionId?: string;
  provider?: string;
}

export interface ProjectListMsg {
  type: 'project:list';
  requestId: string;
}

export interface FolderListMsg {
  type: 'folder:list';
  path: string;
  requestId: string;
}

export interface ServerInfoMsg {
  type: 'server:info';
  requestId: string;
}

export interface SetPermissionModeMsg {
  type: 'set:permissionMode';
  projectId: string;
  mode: string;
}

export type UpstreamMessage =
  | AgentQueryMsg
  | AgentStopMsg
  | AgentCommandMsg
  | PermissionResponseMsg
  | PtySpawnMsg
  | PtyInputMsg
  | PtyResizeMsg
  | ProjectCreateMsg
  | ProjectListMsg
  | FolderListMsg
  | ServerInfoMsg
  | SetPermissionModeMsg;

// ── Main → Renderer ──

export interface AgentTextMsg {
  type: 'agent:text';
  projectId: string;
  content: string;
  parentToolUseId?: string;
}

export interface AgentThinkingMsg {
  type: 'agent:thinking';
  projectId: string;
  content: string;
  parentToolUseId?: string;
}

export interface AgentToolUseMsg {
  type: 'agent:tool_use';
  projectId: string;
  toolName: string;
  toolUseId: string;
  toolInput: Record<string, unknown>;
  content: string;
  parentToolUseId?: string;
}

export interface AgentToolResultMsg {
  type: 'agent:tool_result';
  projectId: string;
  toolUseId: string;
  content: string;
  parentToolUseId?: string;
}

export interface AgentResultMsg {
  type: 'agent:result';
  projectId: string;
  content: string;
  sessionId?: string;
}

export interface AgentDoneMsg {
  type: 'agent:done';
  projectId: string;
}

export interface AgentErrorMsg {
  type: 'agent:error';
  projectId: string;
  error: string;
}

export interface AgentSystemMsg {
  type: 'agent:system';
  projectId: string;
  content: string;
  parentToolUseId?: string;
}

export interface PermissionRequestMsg {
  type: 'permission:request';
  projectId: string;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
}

export interface PtySpawnedMsg {
  type: 'pty:spawned';
  projectId: string;
  requestId: string;
}

export interface PtyOutputMsg {
  type: 'pty:output';
  projectId: string;
  data: string;
}

export interface PtyExitMsg {
  type: 'pty:exit';
  projectId: string;
  exitCode: number;
}

export interface StatusUpdateMsg {
  type: 'status:update';
  projectId: string;
  usage?: RawUsageData;
  agentStatus?: AgentStatus;
  gitBranch?: string;
  providerConfig?: ProviderConfig;
}

export interface ProjectCreatedMsg {
  type: 'project:created';
  requestId: string;
  project: { id: string; name: string; cwd: string; provider?: string; providerDisplayName?: string };
  error?: string;
}

export interface ProjectListResultMsg {
  type: 'project:list_result';
  requestId: string;
  projects: { id: string; name: string; cwd: string; provider?: string }[];
}

export interface FolderListResultMsg {
  type: 'folder:list_result';
  requestId: string;
  path: string;
  entries: string[];
  error?: string;
}

export interface ServerInfoResultMsg {
  type: 'server:info_result';
  requestId: string;
  homePath: string;
  hostname: string;
}

export interface CommandResultMsg {
  type: 'command:result';
  projectId: string;
  requestId: string;
  message: string;
  updated?: { model?: string; permissionMode?: string; effort?: string };
}

export type TaskStatus = 'running' | 'stalled' | 'completed' | 'stopped' | 'error';

export interface TaskInfo {
  id: string;
  description: string;
  status: TaskStatus;
  startedAt: number;
  lastProgressAt: number;
}

export interface TaskUpdateMsg {
  type: 'task:update';
  projectId: string;
  tasks: TaskInfo[];
}

export interface ProviderListMsg {
  type: 'provider:list';
  providers: { name: string; displayName: string }[];
}

export type DownstreamMessage =
  | AgentTextMsg
  | AgentThinkingMsg
  | AgentToolUseMsg
  | AgentToolResultMsg
  | AgentResultMsg
  | AgentDoneMsg
  | AgentErrorMsg
  | AgentSystemMsg
  | PermissionRequestMsg
  | PtySpawnedMsg
  | PtyOutputMsg
  | PtyExitMsg
  | StatusUpdateMsg
  | ProjectCreatedMsg
  | ProjectListResultMsg
  | FolderListResultMsg
  | ServerInfoResultMsg
  | CommandResultMsg
  | TaskUpdateMsg
  | ProviderListMsg;
