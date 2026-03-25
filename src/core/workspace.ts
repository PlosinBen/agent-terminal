import path from 'path';

export interface Project {
  cwd: string;
  name: string;
  sessionId?: string;
}

export function createProject(cwd: string): Project {
  return {
    cwd,
    name: path.basename(cwd),
  };
}
