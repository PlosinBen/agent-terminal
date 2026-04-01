import type { ProjectSession } from '../session-manager.js';
import { createMockBackend } from './mock-backend.js';

function createMockTaskTracker() {
  return {
    start: () => {},
    stop: () => {},
    register: () => {},
    progress: () => {},
    complete: () => {},
    stopTask: () => {},
    getActiveTasks: () => [],
    getAllTasks: () => [],
  } as unknown as ProjectSession['taskTracker'];
}

export function createMockSession(overrides?: Partial<ProjectSession>): ProjectSession {
  return {
    project: {
      id: 'test-project',
      name: 'test',
      cwd: '/tmp/test',
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      provider: 'claude',
    },
    backend: createMockBackend(),
    loading: false,
    permissionResolvers: new Map(),
    turns: 0,
    ptyProcess: null,
    gitWatcher: null,
    taskTracker: createMockTaskTracker(),
    ...overrides,
  };
}
