import type { DownstreamMessage, ProviderConfig } from '../shared/protocol.js';
import type { WsServer } from '../ws-server.js';
import type { ProjectSession } from '../session-manager.js';
import { execSync } from 'child_process';
import { watch, existsSync } from 'fs';
import path from 'path';
import { logger } from '../core/logger.js';
import { getProviderCache } from '../core/provider-cache.js';

export function getGitBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '-';
  }
}

export function watchGitHead(
  session: ProjectSession,
  projectId: string,
  cwd: string,
  onChanged: () => void,
): void {
  const gitHeadPath = path.join(cwd, '.git', 'HEAD');
  if (!existsSync(gitHeadPath)) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    session.gitWatcher = watch(gitHeadPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onChanged, 100);
    });

    session.gitWatcher.on('error', (err) => {
      logger.warn(`[git-watch] error for ${projectId}: ${err.message}`);
      session.gitWatcher?.close();
      session.gitWatcher = null;
    });
  } catch (err) {
    logger.warn(`[git-watch] failed to watch ${gitHeadPath}: ${err instanceof Error ? err.message : err}`);
  }
}

export function broadcastStatus(
  session: ProjectSession,
  projectId: string,
  wsServer: WsServer,
): void {
  const agentStatus = session.permissionResolvers.size > 0
    ? 'attention' as const
    : session.loading
      ? 'running' as const
      : 'idle' as const;

  const cache = getProviderCache('claude');
  const providerConfig: ProviderConfig | undefined = cache
    ? { models: cache.models, permissionModes: cache.permissionModes, effortLevels: cache.effortLevels, slashCommands: cache.slashCommands }
    : undefined;

  wsServer.broadcast({
    type: 'status:update',
    projectId,
    segments: session.backend.getStatusSegments(),
    agentStatus,
    gitBranch: getGitBranch(session.project.cwd),
    providerConfig,
  });
}
