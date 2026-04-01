import type { DownstreamMessage } from '../shared/protocol.js';
import type { WsServer } from '../ws-server.js';
import type { ProjectSession } from '../session-manager.js';
import { getProvider } from '../providers/registry.js';
import { createProject } from '../core/workspace.js';
import { TaskTracker } from '../core/task.js';
import { watchGitHead, broadcastStatus, getGitBranch } from './git-watcher.js';
import { logger } from '../core/logger.js';

export function handleProjectCreate(
  msg: { id: string; cwd: string; requestId: string; sessionId?: string; provider?: string },
  send: (reply: DownstreamMessage) => void,
  sessions: Map<string, ProjectSession>,
  wsServer: WsServer | null,
): void {
  const providerName = msg.provider ?? 'claude';
  const providerDef = getProvider(providerName);

  if (!providerDef) {
    send({
      type: 'project:created',
      requestId: msg.requestId,
      project: { id: msg.id, name: '', cwd: msg.cwd },
      error: `Provider "${providerName}" is not available`,
    } as DownstreamMessage);
    return;
  }

  const project = createProject(msg.id, msg.cwd, providerName);
  if (msg.sessionId) project.sessionId = msg.sessionId;

  const backend = providerDef.createBackend({
    sessionId: project.sessionId,
  });

  const taskTracker = new TaskTracker((tasks) => {
    if (wsServer) wsServer.broadcast({ type: 'task:update', projectId: project.id, tasks });
  });
  taskTracker.start();

  const session: ProjectSession = {
    project,
    backend,
    loading: false,
    permissionResolvers: new Map(),
    turns: 0,
    ptyProcess: null,
    gitWatcher: null,
    taskTracker,
  };

  sessions.set(project.id, session);

  // Watch .git/HEAD for branch changes — send only gitBranch
  watchGitHead(session, project.id, project.cwd, () => {
    if (wsServer) broadcastStatus(session, project.id, wsServer, {
      gitBranch: getGitBranch(project.cwd),
    });
  });

  // Broadcast status after backend init (provider config becomes available)
  backend.onInit(() => {
    if (wsServer) broadcastStatus(session, project.id, wsServer);
  });

  send({
    type: 'project:created',
    requestId: msg.requestId,
    project: {
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      provider: providerName,
      providerDisplayName: providerDef.displayName,
    },
  });

  // Warm-up: initialize SDK to get provider config (models, commands) early
  // First status:update will be sent via backend.onInit() callback above
  if (backend.warmup) {
    backend.warmup(project.cwd).catch((err) => {
      logger.error(`[warmup] Failed for project ${project.id}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

export function handleProjectList(
  msg: { requestId: string },
  send: (reply: DownstreamMessage) => void,
  sessions: Map<string, ProjectSession>,
): void {
  const projects = Array.from(sessions.values()).map(s => ({
    id: s.project.id, name: s.project.name, cwd: s.project.cwd,
    provider: s.project.provider,
  }));
  send({
    type: 'project:list_result',
    requestId: msg.requestId,
    projects,
  });
}
