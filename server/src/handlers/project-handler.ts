import type { DownstreamMessage } from '../shared/protocol.js';
import type { WsServer } from '../ws-server.js';
import type { ProjectSession } from '../session-manager.js';
import { ClaudeBackend } from '../backend/claude/backend.js';
import { createProject } from '../core/workspace.js';
import { watchGitHead, broadcastStatus } from './git-watcher.js';

export function handleProjectCreate(
  msg: { id: string; cwd: string; requestId: string; sessionId?: string },
  send: (reply: DownstreamMessage) => void,
  sessions: Map<string, ProjectSession>,
  wsServer: WsServer | null,
): void {
  const project = createProject(msg.id, msg.cwd);
  if (msg.sessionId) project.sessionId = msg.sessionId;

  const backend = new ClaudeBackend({
    sessionId: project.sessionId,
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

  // Broadcast status after backend init (provider config becomes available)
  backend.onInit(() => {
    if (wsServer) broadcastStatus(session, project.id, wsServer);
  });

  send({
    type: 'project:created',
    requestId: msg.requestId,
    project: { id: project.id, name: project.name, cwd: project.cwd },
  });

  // Send initial status (git branch, etc.) immediately
  if (wsServer) broadcastStatus(session, project.id, wsServer);

  // Warm-up: initialize SDK to get provider config (models, commands) early
  backend.warmup(project.cwd).catch(() => {});
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
