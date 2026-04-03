import type { DownstreamMessage } from '../shared/protocol.js';
import type { WsServer } from '../ws-server.js';
import { loadConfig, saveConfig } from '../core/config.js';
import { initRegistry, listProviders } from '../providers/registry.js';
import { logger } from '../core/logger.js';
import { execFileSync } from 'child_process';
import fs from 'fs';

/**
 * Verify a binary path is valid and executable.
 */
export function handleProviderVerify(
  msg: { requestId: string; provider: string; binaryPath: string },
  send: (reply: DownstreamMessage) => void,
): void {
  const { requestId, provider, binaryPath } = msg;

  try {
    // Check file exists
    if (!fs.existsSync(binaryPath)) {
      send({ type: 'provider:verifyResult', requestId, provider, valid: false, error: 'File not found' });
      return;
    }

    // Check file is executable
    fs.accessSync(binaryPath, fs.constants.X_OK);

    // Try to get version
    let version: string | undefined;
    try {
      const output = execFileSync(binaryPath, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
      version = output.split('\n')[0].slice(0, 100);
    } catch {
      // --version not supported, but file is executable — still valid
    }

    send({ type: 'provider:verifyResult', requestId, provider, valid: true, version });
  } catch (err) {
    send({
      type: 'provider:verifyResult',
      requestId,
      provider,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Save a provider binary path and re-initialize the registry.
 */
export async function handleProviderSetPath(
  msg: { requestId: string; provider: string; binaryPath: string },
  send: (reply: DownstreamMessage) => void,
  wsServer: WsServer,
): Promise<void> {
  const { requestId, provider, binaryPath } = msg;

  try {
    const config = loadConfig();
    if (!config.providerPaths) config.providerPaths = {};

    if (binaryPath) {
      config.providerPaths[provider] = binaryPath;
    } else {
      delete config.providerPaths[provider];
    }

    saveConfig(config);
    logger.info(`[provider-handler] Saved path for "${provider}": ${binaryPath || '(auto-detect)'}`);

    // Re-initialize registry with updated paths
    await initRegistry();

    const providers = listProviders().map(p => ({ name: p.name, displayName: p.displayName }));

    // Reply to requesting client
    send({
      type: 'provider:pathUpdated',
      requestId,
      provider,
      binaryPath,
      providers,
    });

    // Broadcast updated provider list to all clients
    wsServer.broadcast({ type: 'provider:list', providers });
  } catch (err) {
    logger.error(`[provider-handler] Failed to set path for "${provider}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get current provider paths from config.
 */
export function handleProviderGetPaths(
  msg: { requestId: string },
  send: (reply: DownstreamMessage) => void,
): void {
  const config = loadConfig();
  send({
    type: 'provider:pathsResult',
    requestId: msg.requestId,
    paths: config.providerPaths ?? {},
  });
}
