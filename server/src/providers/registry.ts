import type { ProviderDefinition } from './types.js';
import { provider as claude } from './claude/index.js';
import { provider as gemini } from './gemini/index.js';
import { logger } from '../core/logger.js';

const allProviders: ProviderDefinition[] = [claude, gemini];
let availableProviders: ProviderDefinition[] = [];

/**
 * Initialize the provider registry.
 * Runs checkAvailable() on each provider and stores the available ones.
 * Should be called once at server startup.
 */
export async function initRegistry(): Promise<void> {
  availableProviders = [];
  for (const p of allProviders) {
    try {
      const ok = await p.checkAvailable();
      if (ok) {
        availableProviders.push(p);
        logger.info(`[registry] Provider "${p.name}" is available`);
      } else {
        logger.info(`[registry] Provider "${p.name}" is not available`);
      }
    } catch (err) {
      logger.warn(`[registry] Error checking provider "${p.name}": ${err instanceof Error ? err.message : err}`);
    }
  }
  logger.info(`[registry] ${availableProviders.length}/${allProviders.length} providers available: ${availableProviders.map(p => p.name).join(', ')}`);
}

/**
 * Get the list of available providers (after initRegistry has been called).
 */
export function listProviders(): ProviderDefinition[] {
  return availableProviders;
}

/**
 * Get a specific provider by name. Returns undefined if not available.
 */
export function getProvider(name: string): ProviderDefinition | undefined {
  return availableProviders.find(p => p.name === name);
}
