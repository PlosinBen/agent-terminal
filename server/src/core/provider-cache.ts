import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ModelOption, CommandInfo } from '../backend/types.js';

export interface ProviderCache {
  models: ModelOption[];
  slashCommands: CommandInfo[];
  permissionModes: string[];
  effortLevels: string[];
  cachedAt: string;
}

const PROVIDERS_DIR = path.join(os.homedir(), '.config', 'agent-terminal', 'providers');

function ensureDir(): void {
  fs.mkdirSync(PROVIDERS_DIR, { recursive: true });
}

function cachePath(provider: string): string {
  return path.join(PROVIDERS_DIR, `${provider}.json`);
}

// In-memory cache to avoid repeated file reads
const memCache = new Map<string, ProviderCache>();

export function loadProviderCache(provider: string): ProviderCache | null {
  const cached = memCache.get(provider);
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(cachePath(provider), 'utf8');
    const data = JSON.parse(raw) as ProviderCache;
    memCache.set(provider, data);
    return data;
  } catch {
    return null;
  }
}

export function saveProviderCache(provider: string, cache: ProviderCache): void {
  ensureDir();
  fs.writeFileSync(cachePath(provider), JSON.stringify(cache, null, 2));
  memCache.set(provider, cache);
}
