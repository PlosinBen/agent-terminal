import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ProjectConfig {
  id: string;
  name: string;
  cwd: string;
  createdAt: string;
  lastOpenedAt: string;
  sessionId?: string;
}

const PROJECTS_DIR = path.join(os.homedir(), '.config', 'agent-terminal', 'projects');

function ensureDir(): void {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function projectPath(id: string): string {
  return path.join(PROJECTS_DIR, `${id}.json`);
}

function generateProjectId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveProject(config: ProjectConfig): void {
  ensureDir();
  fs.writeFileSync(projectPath(config.id), JSON.stringify(config, null, 2));
}

export function loadProject(id: string): ProjectConfig | null {
  try {
    const raw = fs.readFileSync(projectPath(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function listProjects(): ProjectConfig[] {
  ensureDir();
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json'));
  const projects: ProjectConfig[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
      projects.push(JSON.parse(raw));
    } catch {
      // Skip corrupted files
    }
  }

  return projects.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export function deleteProject(id: string): void {
  try {
    fs.unlinkSync(projectPath(id));
  } catch {
    // Ignore
  }
}

export function findProjectByCwd(cwd: string): ProjectConfig | undefined {
  return listProjects().find(p => p.cwd === cwd);
}

export function createProject(cwd: string): ProjectConfig {
  const existing = findProjectByCwd(cwd);
  if (existing) {
    existing.lastOpenedAt = new Date().toISOString();
    saveProject(existing);
    return existing;
  }

  const config: ProjectConfig = {
    id: generateProjectId(),
    name: path.basename(cwd),
    cwd,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  };
  saveProject(config);
  return config;
}
