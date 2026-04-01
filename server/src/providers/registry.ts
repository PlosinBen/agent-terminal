import type { ProviderDefinition } from './types.js';
import { provider as claude } from './claude/index.js';
import { provider as gemini } from './gemini/index.js';
import { provider as copilot } from './copilot/index.js';
import { provider as mock } from './mock/index.js';
import { logger } from '../core/logger.js';

const allProviders: ProviderDefinition[] = [claude, gemini, copilot, mock];
let availableProviders: ProviderDefinition[] = [];

/**
 * Initialize the provider registry.
 * Runs checkAvailable() on each provider and stores the available ones.
 * Should be called once at server startup.
 *
 * If AGENT_PROVIDERS env var is set (comma-separated names), only those
 * providers are considered. This is useful for E2E testing with the mock provider.
 * Example: AGENT_PROVIDERS=mock
 */
export async function initRegistry(): Promise<void> {
  const envFilter = process.env.AGENT_PROVIDERS?.split(',').map(s => s.trim()).filter(Boolean);
  availableProviders = [];
  const candidates = envFilter
    ? allProviders.filter(p => envFilter.includes(p.name))
    : allProviders;

  if (envFilter) {
    logger.info(`[registry] AGENT_PROVIDERS filter: ${envFilter.join(', ')}`);
  }

  for (const p of candidates) {
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
