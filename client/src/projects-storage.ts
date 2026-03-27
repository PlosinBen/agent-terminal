const STORAGE_KEY = 'agent-terminal:projects';

export interface SavedProject {
  id: string;
  name: string;
  cwd: string;
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
