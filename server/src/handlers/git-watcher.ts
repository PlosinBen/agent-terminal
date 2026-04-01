import type { ProviderConfig, StatusUpdateMsg } from '../shared/protocol.js';
import type { AgentStatus, RawUsageData } from '../shared/types.js';
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

/**
 * Partial status update fields. Only provided fields will be sent to the client.
 */
interface StatusFields {
  agentStatus?: AgentStatus;
  usage?: RawUsageData;
  gitBranch?: string;
  providerConfig?: ProviderConfig;
}

/**
 * Broadcast a partial status update. Only sends the fields provided.
 * Client merges incoming fields with existing state (fields not sent are preserved).
 */
export function broadcastStatus(
  session: ProjectSession,
  projectId: string,
  wsServer: WsServer,
  fields?: StatusFields,
): void {
  // If no specific fields provided, send everything (backward compat)
  if (!fields) {
    const agentStatus = session.permissionResolvers.size > 0
      ? 'attention' as const
      : session.loading
        ? 'running' as const
        : 'idle' as const;

    const cache = getProviderCache(session.project.provider);
    const providerConfig: ProviderConfig | undefined = cache
      ? { models: cache.models, permissionModes: cache.permissionModes, effortLevels: cache.effortLevels, slashCommands: cache.slashCommands }
      : undefined;

    wsServer.broadcast({
      type: 'status:update',
      projectId,
      usage: session.backend.getRawUsage(),
      agentStatus,
      gitBranch: getGitBranch(session.project.cwd),
      providerConfig,
    });
    return;
  }

  // Partial update: only send provided fields
  const msg: StatusUpdateMsg = {
    type: 'status:update',
    projectId,
    ...fields,
  };
  wsServer.broadcast(msg);
}
