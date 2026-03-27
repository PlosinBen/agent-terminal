import type { UpstreamMessage, DownstreamMessage, FolderListResultMsg, ProjectCreatedMsg, CommandResultMsg, ServerInfoResultMsg } from '@shared/protocol';
import type { ProjectInfo } from '../components/Sidebar';
import type { ServerConfig, ServiceEventHandler, ConnectionChangedPayload } from './types';
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
  connectProject(project: ProjectInfo): Promise<ProjectCreatedMsg['project']> {
    const requestId = nextRequestId();
    return new Promise((resolve) => {
      const unsub = this.cm.onMessage(project.serverHost, (msg) => {
        if (msg.type === 'project:created' && msg.requestId === requestId) {
          unsub();
          resolve(msg.project);
        }
      });

      this.cm.send(project.serverHost, {
        type: 'project:create',
        id: project.id,
        cwd: project.cwd,
        requestId,
        sessionId: project.sessionId,
        model: project.model,
        permissionMode: project.permissionMode,
        effort: project.effort,
      });
    });
  }

  /** Send an agent query (streaming — results come via events). */
  sendQuery(project: ProjectInfo, prompt: string): void {
    this.cm.send(project.serverHost, {
      type: 'agent:query',
      projectId: project.id,
      prompt,
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
    const requestId = nextRequestId();
    return new Promise((resolve) => {
      const unsub = this.cm.onMessage(project.serverHost, (msg) => {
        if (msg.type === 'command:result' && msg.requestId === requestId) {
          unsub();
          resolve(msg);
        }
      });

      this.cm.send(project.serverHost, {
        type: 'agent:command',
        projectId: project.id,
        command,
        args,
        requestId,
      });
    });
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
    const requestId = nextRequestId();
    return new Promise((resolve) => {
      const unsub = this.cm.onMessage(host, (msg) => {
        if (msg.type === 'server:info_result' && msg.requestId === requestId) {
          unsub();
          resolve(msg);
        }
      });

      this.cm.send(host, {
        type: 'server:info',
        requestId,
      });
    });
  }

  // ── Folder Listing (server-level, no projectId) ──

  /** List folders at a path on a server. Returns a Promise. */
  listFolders(server: ServerConfig, path: string): Promise<FolderListResultMsg> {
    const requestId = nextRequestId();
    return new Promise((resolve) => {
      const unsub = this.cm.onMessage(server.host, (msg) => {
        if (msg.type === 'folder:list_result' && msg.requestId === requestId) {
          unsub();
          resolve(msg);
        }
      });

      this.cm.send(server.host, {
        type: 'folder:list',
        path,
        requestId,
      });
    });
  }

  // ── PTY Operations ──

  /** Spawn a PTY for a project. Resolves when pty:spawned is received. */
  spawnPty(project: ProjectInfo): Promise<void> {
    const requestId = nextRequestId();
    return new Promise((resolve) => {
      const unsub = this.cm.onMessage(project.serverHost, (msg) => {
        if (msg.type === 'pty:spawned' && 'projectId' in msg && msg.projectId === project.id) {
          unsub();
          resolve();
        }
      });

      this.cm.send(project.serverHost, {
        type: 'pty:spawn',
        projectId: project.id,
        requestId,
      });
    });
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
      case 'agent:tool_use':
        this.emit(ServiceEvent.AgentToolUse, msg);
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
      // project:created, folder:list_result, command:result are handled by Promise resolvers
      // project:list_result not currently used
    }
  }
}
