import type { ProjectSession } from '../session-manager.js';
import { createMockBackend } from './mock-backend.js';

export function createMockSession(overrides?: Partial<ProjectSession>): ProjectSession {
  return {
    project: {
      id: 'test-project',
      name: 'test',
      cwd: '/tmp/test',
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    },
    backend: createMockBackend(),
    loading: false,
    permissionResolvers: new Map(),
    turns: 0,
    ptyProcess: null,
    gitWatcher: null,
    ...overrides,
  };
}
