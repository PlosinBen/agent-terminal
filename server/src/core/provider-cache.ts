import type { ModelOption, CommandInfo } from '../backend/types.js';

export interface ProviderCache {
  models: ModelOption[];
  slashCommands: CommandInfo[];
  permissionModes: string[];
  effortLevels: string[];
}

// In-memory only — not persisted to disk.
// Populated on first SDK init, shared across all projects of the same provider type.
const memCache = new Map<string, ProviderCache>();

export function getProviderCache(provider: string): ProviderCache | null {
  return memCache.get(provider) ?? null;
}

export function setProviderCache(provider: string, cache: ProviderCache): void {
  memCache.set(provider, cache);
}
