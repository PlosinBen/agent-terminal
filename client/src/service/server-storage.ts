import type { ServerConfig } from './types';

const STORAGE_KEY = 'agent-terminal:servers';

export function loadServers(): ServerConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveServers(servers: ServerConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}
