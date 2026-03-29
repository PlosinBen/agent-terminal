import { describe, it, expect, vi } from 'vitest';
import type { DownstreamMessage } from '../shared/protocol.js';
import type { ProjectSession } from '../session-manager.js';
import { createMockBackend } from '../__test__/mock-backend.js';
import { handleProjectCreate, handleProjectList } from './project-handler.js';

vi.mock('../backend/claude/backend.js', () => ({
  ClaudeBackend: vi.fn().mockImplementation(() => ({
    query: async function* () {},
    stop: vi.fn(),
    setPermissionHandler: vi.fn(),
    setPermissionMode: vi.fn().mockResolvedValue(undefined),
    getStatusSegments: vi.fn().mockReturnValue([]),
    isInitialized: vi.fn().mockReturnValue(true),
    getProviderCommands: vi.fn().mockReturnValue([]),
    getSlashCommands: vi.fn().mockReturnValue([]),
    executeCommand: vi.fn().mockResolvedValue(null),
    onInit: vi.fn(),
    warmup: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('./git-watcher.js', () => ({
  watchGitHead: vi.fn(),
  broadcastStatus: vi.fn(),
}));

describe('handleProjectCreate', () => {
  it('adds session to map and sends project:created', () => {
    const sessions = new Map<string, ProjectSession>();
    const replies: DownstreamMessage[] = [];
    const wsServer = { broadcast: vi.fn() } as any;

    handleProjectCreate(
      { id: 'p1', cwd: '/tmp/myproject', requestId: 'r1' },
      (m) => replies.push(m),
      sessions,
      wsServer,
    );

    expect(sessions.has('p1')).toBe(true);
    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe('project:created');
    const result = replies[0] as any;
    expect(result.project.id).toBe('p1');
    expect(result.project.name).toBe('myproject');
    expect(result.project.cwd).toBe('/tmp/myproject');
  });

  it('stores sessionId when provided', () => {
    const sessions = new Map<string, ProjectSession>();

    handleProjectCreate(
      { id: 'p2', cwd: '/tmp/test', requestId: 'r2', sessionId: 'sid-123' },
      vi.fn(),
      sessions,
      null,
    );

    expect(sessions.get('p2')!.project.sessionId).toBe('sid-123');
  });
});

describe('handleProjectList', () => {
  it('returns all projects', () => {
    const sessions = new Map<string, ProjectSession>();
    // Create projects via handleProjectCreate
    handleProjectCreate({ id: 'a', cwd: '/tmp/a', requestId: 'r' }, vi.fn(), sessions, null);
    handleProjectCreate({ id: 'b', cwd: '/tmp/b', requestId: 'r' }, vi.fn(), sessions, null);

    const replies: DownstreamMessage[] = [];
    handleProjectList({ requestId: 'r3' }, (m) => replies.push(m), sessions);

    const result = replies[0] as any;
    expect(result.type).toBe('project:list_result');
    expect(result.projects).toHaveLength(2);
    expect(result.projects.map((p: any) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty list when no projects', () => {
    const sessions = new Map<string, ProjectSession>();
    const replies: DownstreamMessage[] = [];
    handleProjectList({ requestId: 'r4' }, (m) => replies.push(m), sessions);

    const result = replies[0] as any;
    expect(result.projects).toEqual([]);
  });
});
