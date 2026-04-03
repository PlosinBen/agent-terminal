import type { ProviderDefinition } from '../types.js';
import { GeminiBackend } from './backend.js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { logger } from '../../core/logger.js';
import { loadConfig } from '../../core/config.js';

export const provider: ProviderDefinition = {
  name: 'gemini',
  displayName: 'Gemini',

  createBackend: (opts) => new GeminiBackend(opts),

  checkAvailable: async () => {
    // 1. Check user-configured path from config
    const configPath = loadConfig().providerPaths?.gemini;
    if (configPath) {
      try {
        if (fs.statSync(configPath).isFile()) {
          logger.info(`[provider:gemini] Found binary from config: ${configPath}`);
          return true;
        }
      } catch {}
      logger.warn(`[provider:gemini] Config path "${configPath}" not found, trying auto-detect`);
    }

    // 2. Fallback: which
    try {
      const result = execFileSync('which', ['gemini'], { encoding: 'utf8', timeout: 3000 }).trim();
      if (result) {
        logger.info(`[provider:gemini] Found binary: ${result}`);
        return true;
      }
    } catch {}
    logger.info('[provider:gemini] Binary not found, provider unavailable');
    return false;
  },
};
