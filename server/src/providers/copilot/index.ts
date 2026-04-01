import type { ProviderDefinition } from '../types.js';
import { CopilotBackend } from './backend.js';
import { CopilotAuth } from './auth.js';
import { logger } from '../../core/logger.js';

export const provider: ProviderDefinition = {
  name: 'copilot',
  displayName: 'GitHub Copilot',

  createBackend: (opts) => new CopilotBackend(opts),

  checkAvailable: async () => {
    try {
      const auth = new CopilotAuth();
      const available = await auth.isAvailable();
      if (available) {
        logger.info('[provider:copilot] GitHub Copilot is available');
      } else {
        logger.info('[provider:copilot] GitHub Copilot is not available (auth failed)');
      }
      return available;
    } catch (err) {
      logger.info(`[provider:copilot] Not available: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  },
};
