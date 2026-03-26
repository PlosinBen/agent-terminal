/**
 * WebSocket protocol — shared message types between main process and renderer.
 */
export interface AgentQueryMsg {
    type: 'agent:query';
    projectId: string;
    prompt: string;
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
    result: {
        behavior: 'allow';
    } | {
        behavior: 'deny';
        message: string;
    };
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
    cwd: string;
    requestId: string;
}
export interface ProjectListMsg {
    type: 'project:list';
    requestId: string;
}
export type UpstreamMessage = AgentQueryMsg | AgentStopMsg | AgentCommandMsg | PermissionResponseMsg | PtyInputMsg | PtyResizeMsg | ProjectCreateMsg | ProjectListMsg;
export interface AgentTextMsg {
    type: 'agent:text';
    projectId: string;
    content: string;
}
export interface AgentToolUseMsg {
    type: 'agent:tool_use';
    projectId: string;
    toolName: string;
    content: string;
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
export interface PermissionRequestMsg {
    type: 'permission:request';
    projectId: string;
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    title?: string;
}
export interface PtyOutputMsg {
    type: 'pty:output';
    projectId: string;
    data: string;
}
export interface StatusUpdateMsg {
    type: 'status:update';
    projectId: string;
    segments: {
        label?: string;
        value: string;
        color?: string;
    }[];
    agentStatus: 'idle' | 'running' | 'attention';
    gitBranch: string;
}
export interface ProjectCreatedMsg {
    type: 'project:created';
    requestId: string;
    project: {
        id: string;
        name: string;
        cwd: string;
    };
}
export interface ProjectListResultMsg {
    type: 'project:list_result';
    requestId: string;
    projects: {
        id: string;
        name: string;
        cwd: string;
    }[];
}
export interface CommandResultMsg {
    type: 'command:result';
    projectId: string;
    requestId: string;
    message: string;
    updated?: {
        model?: string;
        permissionMode?: string;
        effort?: string;
    };
}
export type DownstreamMessage = AgentTextMsg | AgentToolUseMsg | AgentResultMsg | AgentDoneMsg | AgentErrorMsg | PermissionRequestMsg | PtyOutputMsg | StatusUpdateMsg | ProjectCreatedMsg | ProjectListResultMsg | CommandResultMsg;
