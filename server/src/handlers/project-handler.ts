import type { DownstreamMessage } from '../shared/protocol.js';
import type { WsServer } from '../ws-server.js';
import type { ProjectSession } from '../session-manager.js';
import { ClaudeBackend } from '../backend/claude/backend.js';
import { createProject } from '../core/workspace.js';
import { watchGitHead, broadcastStatus } from './git-watcher.js';

export function handleProjectCreate(
  msg: { id: string; cwd: string; requestId: string; sessionId?: string; model?: string; permissionMode?: string; effort?: string },
  send: (reply: DownstreamMessage) => void,
  sessions: Map<string, ProjectSession>,
  wsServer: WsServer | null,
): void {
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
    ptyProcess: null,
    gitWatcher: null,
  };

  sessions.set(project.id, session);

  // Watch .git/HEAD for branch changes
  watchGitHead(session, project.id, project.cwd, () => {
    if (wsServer) broadcastStatus(session, project.id, wsServer);
  });

  // Update in-memory project config after backend init
  backend.onInit(() => {
    session.project = {
      ...session.project,
      model: backend.getModel(),
      permissionMode: backend.getPermissionMode(),
      effort: backend.getEffort(),
    };
    if (wsServer) broadcastStatus(session, project.id, wsServer);
  });

  send({
    type: 'project:created',
    requestId: msg.requestId,
    project: { id: project.id, name: project.name, cwd: project.cwd },
  });

  // Send initial status (git branch, etc.) immediately
  if (wsServer) broadcastStatus(session, project.id, wsServer);
}

export function handleProjectList(
  msg: { requestId: string },
  send: (reply: DownstreamMessage) => void,
  sessions: Map<string, ProjectSession>,
): void {
  const projects = Array.from(sessions.values()).map(s => ({
    id: s.project.id, name: s.project.name, cwd: s.project.cwd,
  }));
  send({
    type: 'project:list_result',
    requestId: msg.requestId,
    projects,
  });
}
