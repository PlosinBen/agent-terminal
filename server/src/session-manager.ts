import type { UpstreamMessage, DownstreamMessage } from './shared/protocol.js';
import type { WsServer } from './ws-server.js';
import { ClaudeBackend } from './backend/claude/backend.js';
import type { AgentBackend, PermissionRequest } from './backend/types.js';
import { createProject, type ProjectConfig } from './core/workspace.js';
import { executeCommand } from './core/commands.js';
import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './core/logger.js';

interface ProjectSession {
  project: ProjectConfig;
  backend: AgentBackend;
  loading: boolean;
  permissionResolvers: Map<string, (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void>;
  turns: number;
}

function getGitBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '-';
  }
}

let permRequestCounter = 0;

export class SessionManager {
  private sessions = new Map<string, ProjectSession>();

  handleMessage(msg: UpstreamMessage, send: (reply: DownstreamMessage) => void, wsServer: WsServer) {
    switch (msg.type) {
      case 'project:create':
        this.handleProjectCreate(msg, send);
        break;
      case 'project:list':
        this.handleProjectList(msg, send);
        break;
      case 'folder:list':
        this.handleFolderList(msg, send);
        break;
      case 'agent:query':
        this.handleAgentQuery(msg, send, wsServer);
        break;
      case 'agent:stop':
        this.handleAgentStop(msg);
        break;
      case 'agent:command':
        this.handleAgentCommand(msg, send);
        break;
      case 'permission:response':
        this.handlePermissionResponse(msg);
        break;
      case 'pty:input':
      case 'pty:resize':
        // Phase 4
        break;
    }
  }

  private handleProjectCreate(
    msg: { id: string; cwd: string; requestId: string; sessionId?: string; model?: string; permissionMode?: string; effort?: string },
    send: (reply: DownstreamMessage) => void,
  ) {
    // Client owns the project id and config (localStorage is source of truth)
    const project = createProject(msg.id, msg.cwd);
    if (msg.sessionId) project.sessionId = msg.sessionId;
    if (msg.model) project.model = msg.model;
    if (msg.permissionMode) project.permissionMode = msg.permissionMode;
    if (msg.effort) project.effort = msg.effort;

    const backend = new ClaudeBackend({
      sessionId: project.sessionId,
      model: project.model,
      permissionMode: project.permissionMode,
      effort: project.effort,
    });

    const session: ProjectSession = {
      project,
      backend,
      loading: false,
      permissionResolvers: new Map(),
      turns: 0,
    };

    this.sessions.set(project.id, session);

    // Update in-memory project config after backend init
    backend.onInit(() => {
      session.project = {
        ...session.project,
        model: backend.getModel(),
        permissionMode: backend.getPermissionMode(),
        effort: backend.getEffort(),
      };
    });

    send({
      type: 'project:created',
      requestId: msg.requestId,
      project: { id: project.id, name: project.name, cwd: project.cwd },
    });
  }

  private handleProjectList(msg: { requestId: string }, send: (reply: DownstreamMessage) => void) {
    // Return in-memory sessions (client localStorage is source of truth)
    const projects = Array.from(this.sessions.values()).map(s => ({
      id: s.project.id, name: s.project.name, cwd: s.project.cwd,
    }));
    send({
      type: 'project:list_result',
      requestId: msg.requestId,
      projects,
    });
  }

  private handleFolderList(msg: { path: string; requestId: string }, send: (reply: DownstreamMessage) => void) {
    try {
      // Resolve ~ to home directory
      const resolvedPath = msg.path.startsWith('~')
        ? path.join(os.homedir(), msg.path.slice(1))
        : path.resolve(msg.path);

      const entries = readdirSync(resolvedPath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort((a, b) => {
          // dot-files after normal entries
          const aDot = a.startsWith('.');
          const bDot = b.startsWith('.');
          if (aDot !== bDot) return aDot ? 1 : -1;
          return a.localeCompare(b);
        });

      send({
        type: 'folder:list_result',
        requestId: msg.requestId,
        path: resolvedPath,
        entries,
      });
    } catch (err) {
      send({
        type: 'folder:list_result',
        requestId: msg.requestId,
        path: msg.path,
        entries: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleAgentQuery(
    msg: { projectId: string; prompt: string },
    send: (reply: DownstreamMessage) => void,
    wsServer: WsServer,
  ) {
    const session = this.sessions.get(msg.projectId);
    if (!session) {
      send({ type: 'agent:error', projectId: msg.projectId, error: 'Unknown project' });
      return;
    }

    session.loading = true;
    session.turns++;

    // Set up permission handler for this query
    session.backend.setPermissionHandler((req: PermissionRequest) => {
      return new Promise((resolve) => {
        const requestId = `perm_${++permRequestCounter}`;
        session.permissionResolvers.set(requestId, resolve);
        wsServer.broadcast({
          type: 'permission:request',
          projectId: msg.projectId,
          requestId,
          toolName: req.toolName,
          input: req.input,
          title: req.title,
        });
      });
    });

    // Broadcast status
    this.broadcastStatus(msg.projectId, wsServer);

    try {
      const gen = session.backend.query(msg.prompt, { cwd: session.project.cwd });

      for await (const agentMsg of gen) {
        if (agentMsg.type === 'text') {
          send({ type: 'agent:text', projectId: msg.projectId, content: agentMsg.content });
        } else if (agentMsg.type === 'tool_use') {
          send({
            type: 'agent:tool_use',
            projectId: msg.projectId,
            toolName: agentMsg.toolName || 'unknown',
            content: agentMsg.content,
          });
        } else if (agentMsg.type === 'result') {
          // result content duplicates the streamed text; only send sessionId
          send({
            type: 'agent:result',
            projectId: msg.projectId,
            content: '',
            sessionId: agentMsg.sessionId,
          });
          // Update in-memory sessionId (client persists via agent:result msg)
          if (agentMsg.sessionId) {
            session.project = { ...session.project, sessionId: agentMsg.sessionId };
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      send({ type: 'agent:error', projectId: msg.projectId, error });
    } finally {
      session.loading = false;
      send({ type: 'agent:done', projectId: msg.projectId });
      this.broadcastStatus(msg.projectId, wsServer);
    }
  }

  private handleAgentStop(msg: { projectId: string }) {
    const session = this.sessions.get(msg.projectId);
    if (session) {
      session.backend.stop();
      session.loading = false;
    }
  }

  private async handleAgentCommand(
    msg: { projectId: string; command: string; args: string; requestId: string },
    send: (reply: DownstreamMessage) => void,
  ) {
    const session = this.sessions.get(msg.projectId);
    if (!session) return;

    // Try app-level command
    const appResult = executeCommand(msg.command);
    if (appResult) {
      send({
        type: 'command:result',
        projectId: msg.projectId,
        requestId: msg.requestId,
        message: appResult.content,
      });
      return;
    }

    // Try provider command
    const providerResult = await session.backend.executeCommand(msg.command, msg.args);
    if (providerResult) {
      send({
        type: 'command:result',
        projectId: msg.projectId,
        requestId: msg.requestId,
        message: providerResult.message,
        updated: providerResult.updated,
      });
      if (providerResult.updated) {
        session.project = { ...session.project, ...providerResult.updated };
      }
      return;
    }

    send({
      type: 'command:result',
      projectId: msg.projectId,
      requestId: msg.requestId,
      message: `Unknown command: /${msg.command}`,
    });
  }

  private handlePermissionResponse(msg: { projectId: string; requestId: string; result: { behavior: 'allow' } | { behavior: 'deny'; message: string } }) {
    const session = this.sessions.get(msg.projectId);
    if (!session) return;

    const resolver = session.permissionResolvers.get(msg.requestId);
    if (resolver) {
      resolver(msg.result);
      session.permissionResolvers.delete(msg.requestId);
    }
  }

  private broadcastStatus(projectId: string, wsServer: WsServer) {
    const session = this.sessions.get(projectId);
    if (!session) return;

    const agentStatus = session.permissionResolvers.size > 0
      ? 'attention' as const
      : session.loading
        ? 'running' as const
        : 'idle' as const;

    wsServer.broadcast({
      type: 'status:update',
      projectId,
      segments: session.backend.getStatusSegments(),
      agentStatus,
      gitBranch: getGitBranch(session.project.cwd),
    });
  }

  dispose() {
    for (const session of this.sessions.values()) {
      session.backend.stop();
    }
    this.sessions.clear();
  }
}
