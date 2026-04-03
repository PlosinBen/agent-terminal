import type { ProviderDefinition } from '../types.js';
import { ClaudeBackend } from './backend.js';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { logger } from '../../core/logger.js';

export const provider: ProviderDefinition = {
  name: 'claude',
  displayName: 'Claude',

  createBackend: (opts) => new ClaudeBackend(opts),

  checkAvailable: async () => {
    // 1. Check user-configured path from config
    const { loadConfig } = await import('../../core/config.js');
    const configPath = loadConfig().providerPaths?.claude;
    if (configPath) {
      try {
        if (fs.statSync(configPath).isFile()) {
          logger.info(`[provider:claude] Found binary from config: ${configPath}`);
          return true;
        }
      } catch {}
      logger.warn(`[provider:claude] Config path "${configPath}" not found, trying auto-detect`);
    }

    // 2. Check well-known candidate paths
    const candidates = [
      path.join(os.homedir(), '.local', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];
    for (const p of candidates) {
      try {
        if (fs.statSync(p).isFile()) {
          logger.info(`[provider:claude] Found binary at ${p}`);
          return true;
        }
      } catch {}
    }

    // 3. Fallback: which
    try {
      const result = execFileSync('which', ['claude'], { encoding: 'utf8', timeout: 3000 }).trim();
      if (result) {
        logger.info(`[provider:claude] Found binary via which: ${result}`);
        return true;
      }
    } catch {}
    logger.warn('[provider:claude] Binary not found, provider unavailable');
    return false;
  },
};
