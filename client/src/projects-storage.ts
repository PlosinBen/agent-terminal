const STORAGE_KEY = 'agent-terminal:projects';

export function generateProjectId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface SavedProject {
  id: string;
  name: string;
  cwd: string;
  serverHost: string;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
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
