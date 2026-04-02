import type { SavedProject } from './types/project';
import { storageKey } from './storage/namespace';

const STORAGE_KEY = storageKey('agent-terminal:projects');

export function generateProjectId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSavedProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveSavedProjects(projects: SavedProject[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}
