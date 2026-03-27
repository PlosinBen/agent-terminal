import path from 'path';

export interface ProjectConfig {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  lastOpenedAt: string;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
}

/**
 * Create an in-memory ProjectConfig. No disk persistence —
 * client localStorage is the source of truth.
 */
export function createProject(id: string, cwd: string): ProjectConfig {
  return {
    id,
    name: path.basename(cwd),
    cwd,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  };
}
