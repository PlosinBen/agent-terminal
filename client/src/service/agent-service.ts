import type { UpstreamMessage, DownstreamMessage, FolderListResultMsg, ProjectCreatedMsg, CommandResultMsg, ServerInfoResultMsg } from '@shared/protocol';
import type { ProjectInfo } from '../types/project';
import type { ServerConfig } from '../types/server';
import type { ServiceEventHandler, ConnectionChangedPayload } from './types';
import { ServiceEvent } from './types';
import { ConnectionManager } from './connection-manager';

type EventCallback = ServiceEventHandler;

let requestCounter = 0;
function nextRequestId(): string {
  return `req_${++requestCounter}`;
}

export class AgentService {
  private cm = new ConnectionManager();
  private listeners = new Map<string, Set<EventCallback>>();
  private messageUnsubs = new Map<string, () => void>();

  // ── Request-Response Helper ──

  private request<T extends DownstreamMessage>(
    host: string,
    upstream: UpstreamMessage & { requestId: string },
    responseType: string,
  ): Promise<T> {
    return new Promise((resolve) => {
      const unsub = this.cm.onMessage(host, (msg) => {
        if (msg.type === responseType && 'requestId' in msg && msg.requestId === upstream.requestId) {
          unsub();
          resolve(msg as T);
        }
      });
      this.cm.send(host, upstream);
    });
  }

  // ── Event Emitter ──

  on(event: string, callback: EventCallback): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
    return () => { set!.delete(callback); };
  }

  private emit(event: string, payload: DownstreamMessage | ConnectionChangedPayload): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) cb(payload);
    }
  }

  // ── Connection Management ──

  /** Acquire a connection to a server and start routing its messages to service events. */
  acquireConnection(host: string): void {
    this.cm.acquire(host);

    // Only subscribe once per host
    if (!this.messageUnsubs.has(host)) {
      const unsub = this.cm.onMessage(host, (msg) => {
        this.routeMessage(msg);
      });

      const statusUnsub = this.cm.onStatusChange(host, (status) => {
        this.emit(ServiceEvent.ConnectionChanged, { host, status });
      });

      this.messageUnsubs.set(host, () => { unsub(); statusUnsub(); });
    }
  }

  /** Release a connection. When refCount reaches 0, the connection closes. */
  releaseConnection(host: string): void {
    this.cm.release(host);
    // Note: we keep the message subscription alive as long as the pool entry exists.
    // The ConnectionManager handles cleanup internally.
  }

  isConnected(host: string): boolean {
    return this.cm.isConnected(host);
  }

  // ── Project Operations ──

  /** Create a project on the server. Returns when project:created is received. */
  async connectProject(project: ProjectInfo): Promise<ProjectCreatedMsg['project']> {
    const msg = await this.request<ProjectCreatedMsg>(project.serverHost, {
      type: 'project:create', id: project.id, cwd: project.cwd,
      requestId: nextRequestId(),
      sessionId: project.sessionId,
      provider: project.provider,
    }, 'project:created');
    return msg.project;
  }

  /** Send an agent query (streaming — results come via events). */
  sendQuery(project: ProjectInfo, prompt: string, images?: string[]): void {
    this.cm.send(project.serverHost, {
      type: 'agent:query',
      projectId: project.id,
      prompt,
      model: project.model,
      permissionMode: project.permissionMode,
      effort: project.effort,
      ...(images?.length ? { images } : {}),
    });
  }

  /** Send runtime permission mode change (only effective during active query). */
  sendSetPermissionMode(project: ProjectInfo, mode: string): void {
    this.cm.send(project.serverHost, {
      type: 'set:permissionMode',
      projectId: project.id,
      mode,
    });
  }

  /** Stop the running agent. */
  stopAgent(project: ProjectInfo): void {
    this.cm.send(project.serverHost, {
      type: 'agent:stop',
      projectId: project.id,
    });
  }

  /** Send a slash command. Returns when command:result is received. */
  sendCommand(project: ProjectInfo, command: string, args: string): Promise<CommandResultMsg> {
    return this.request<CommandResultMsg>(project.serverHost, {
      type: 'agent:command', projectId: project.id,
      command, args, requestId: nextRequestId(),
    }, 'command:result');
  }

  /** Respond to a permission request. */
  respondPermission(
    project: ProjectInfo,
    requestId: string,
    result: { behavior: 'allow' } | { behavior: 'deny'; message: string },
  ): void {
    this.cm.send(project.serverHost, {
      type: 'permission:response',
      projectId: project.id,
      requestId,
      result,
    });
  }

  // ── Server Info ──

  /** Get server info (home path, hostname). */
  getServerInfo(host: string): Promise<ServerInfoResultMsg> {
    return this.request<ServerInfoResultMsg>(host, {
      type: 'server:info', requestId: nextRequestId(),
    }, 'server:info_result');
  }

  // ── Folder Listing (server-level, no projectId) ──

  /** List folders at a path on a server. Returns a Promise. */
  listFolders(server: ServerConfig, path: string): Promise<FolderListResultMsg> {
    return this.request<FolderListResultMsg>(server.host, {
      type: 'folder:list', path, requestId: nextRequestId(),
    }, 'folder:list_result');
  }

  // ── PTY Operations ──

  /** Spawn a PTY for a project. Resolves when pty:spawned is received. */
  async spawnPty(project: ProjectInfo): Promise<void> {
    await this.request(project.serverHost, {
      type: 'pty:spawn', projectId: project.id, requestId: nextRequestId(),
    }, 'pty:spawned');
  }

  /** Send input to a project's PTY. */
  sendPtyInput(project: ProjectInfo, data: string): void {
    this.cm.send(project.serverHost, {
      type: 'pty:input',
      projectId: project.id,
      data,
    });
  }

  /** Resize a project's PTY. */
  resizePty(project: ProjectInfo, cols: number, rows: number): void {
    this.cm.send(project.serverHost, {
      type: 'pty:resize',
      projectId: project.id,
      cols,
      rows,
    });
  }

  // ── Cleanup ──

  dispose(): void {
    for (const unsub of this.messageUnsubs.values()) unsub();
    this.messageUnsubs.clear();
    this.listeners.clear();
    this.cm.dispose();
  }

  // ── Internal ──

  /** Route a downstream message to the appropriate service event. */
  private routeMessage(msg: DownstreamMessage): void {
    switch (msg.type) {
      case 'agent:text':
        this.emit(ServiceEvent.AgentText, msg);
        break;
      case 'agent:thinking':
        this.emit(ServiceEvent.AgentThinking, msg);
        break;
      case 'agent:tool_use':
        this.emit(ServiceEvent.AgentToolUse, msg);
        break;
      case 'agent:tool_result':
        this.emit(ServiceEvent.AgentToolResult, msg);
        break;
      case 'agent:result':
        this.emit(ServiceEvent.AgentResult, msg);
        break;
      case 'agent:done':
        this.emit(ServiceEvent.AgentDone, msg);
        break;
      case 'agent:error':
        this.emit(ServiceEvent.AgentError, msg);
        break;
      case 'agent:system':
        this.emit(ServiceEvent.AgentSystem, msg);
        break;
      case 'permission:request':
        this.emit(ServiceEvent.PermissionRequest, msg);
        break;
      case 'status:update':
        this.emit(ServiceEvent.StatusUpdate, msg);
        break;
      case 'pty:output':
        this.emit(ServiceEvent.PtyOutput, msg);
        break;
      case 'pty:exit':
        this.emit(ServiceEvent.PtyExit, msg);
        break;
      case 'command:result':
        this.emit(ServiceEvent.CommandResult, msg);
        break;
      case 'task:update':
        this.emit(ServiceEvent.TaskUpdate, msg);
        break;
      case 'provider:list':
        this.emit(ServiceEvent.ProviderList, msg);
        break;
      // project:created, folder:list_result are handled by Promise resolvers
      // project:list_result not currently used
    }
  }
}
