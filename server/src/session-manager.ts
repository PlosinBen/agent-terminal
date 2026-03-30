import type { UpstreamMessage, DownstreamMessage } from './shared/protocol.js';
import type { WsServer } from './ws-server.js';
import type { AgentBackend } from './backend/types.js';
import type { ProjectConfig } from './core/workspace.js';
import type { FSWatcher } from 'fs';
import type * as pty from 'node-pty';
import type { TaskTracker } from './core/task.js';
import { logger } from './core/logger.js';

// Handlers
import { handlePtySpawn, handlePtyInput, handlePtyResize, cleanupPty } from './handlers/pty-handler.js';
import { handleFolderList, handleServerInfo } from './handlers/folder-handler.js';
import { handleProjectCreate, handleProjectList } from './handlers/project-handler.js';
import { handleAgentQuery, handleAgentStop, handleAgentCommand, handlePermissionResponse, handleSetPermissionMode } from './handlers/agent-handler.js';

export interface ProjectSession {
  project: ProjectConfig;
  backend: AgentBackend;
  loading: boolean;
  permissionResolvers: Map<string, (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void>;
  turns: number;
  ptyProcess: pty.IPty | null;
  gitWatcher: FSWatcher | null;
  taskTracker: TaskTracker;
}

export class SessionManager {
  private sessions = new Map<string, ProjectSession>();
  wsServer: WsServer | null = null;

  handleMessage(msg: UpstreamMessage, send: (reply: DownstreamMessage) => void, wsServer: WsServer) {
    this.wsServer = wsServer;
    logger.info(`[ws] received: ${msg.type}`);

    switch (msg.type) {
      case 'project:create':
        handleProjectCreate(msg, send, this.sessions, this.wsServer);
        break;
      case 'project:list':
        handleProjectList(msg, send, this.sessions);
        break;
      case 'folder:list':
        handleFolderList(msg, send);
        break;
      case 'server:info':
        handleServerInfo(msg, send);
        break;
      case 'agent:query': {
        const session = this.sessions.get(msg.projectId);
        if (!session) {
          send({ type: 'agent:error', projectId: msg.projectId, error: 'Unknown project' });
          return;
        }
        handleAgentQuery(session, msg, send, wsServer);
        break;
      }
      case 'agent:stop': {
        const session = this.sessions.get(msg.projectId);
        if (session) handleAgentStop(session);
        break;
      }
      case 'agent:command': {
        const session = this.sessions.get(msg.projectId);
        if (session) handleAgentCommand(session, msg, send);
        break;
      }
      case 'permission:response': {
        const session = this.sessions.get(msg.projectId);
        if (session) handlePermissionResponse(session, msg);
        break;
      }
      case 'set:permissionMode': {
        const session = this.sessions.get(msg.projectId);
        if (session) handleSetPermissionMode(session, msg);
        break;
      }
      case 'pty:spawn': {
        const session = this.sessions.get(msg.projectId);
        if (session) handlePtySpawn(session, msg, send);
        else logger.warn(`[pty:spawn] no session for project ${msg.projectId}`);
        break;
      }
      case 'pty:input': {
        const session = this.sessions.get(msg.projectId);
        if (session) handlePtyInput(session, msg);
        break;
      }
      case 'pty:resize': {
        const session = this.sessions.get(msg.projectId);
        if (session) handlePtyResize(session, msg);
        break;
      }
    }
  }

  dispose() {
    for (const session of this.sessions.values()) {
      session.backend.stop();
      session.taskTracker.stop();
      session.gitWatcher?.close();
      session.gitWatcher = null;
      cleanupPty(session);
    }
    this.sessions.clear();
  }
}
