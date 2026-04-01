import type { ProviderDefinition } from '../types.js';
import { GeminiBackend } from './backend.js';
import { execFileSync } from 'child_process';
import { logger } from '../../core/logger.js';

export const provider: ProviderDefinition = {
  name: 'gemini',
  displayName: 'Gemini',

  createBackend: (opts) => new GeminiBackend(opts),

  checkAvailable: async () => {
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
