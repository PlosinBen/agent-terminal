import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from './session-manager.js';
import { createMockSession } from './__test__/mock-session.js';

// Mock all handlers
vi.mock('./handlers/agent-handler.js', () => ({
  handleAgentQuery: vi.fn(),
  handleAgentStop: vi.fn(),
  handleAgentCommand: vi.fn(),
  handlePermissionResponse: vi.fn(),
  handleSetPermissionMode: vi.fn(),
}));

vi.mock('./handlers/project-handler.js', () => ({
  handleProjectCreate: vi.fn(),
  handleProjectList: vi.fn(),
}));

vi.mock('./handlers/folder-handler.js', () => ({
  handleFolderList: vi.fn(),
  handleServerInfo: vi.fn(),
}));

vi.mock('./handlers/pty-handler.js', () => ({
  handlePtySpawn: vi.fn(),
  handlePtyInput: vi.fn(),
  handlePtyResize: vi.fn(),
  cleanupPty: vi.fn(),
}));

// Import mocked handlers to verify calls
import { handleAgentQuery, handleAgentStop, handleAgentCommand, handlePermissionResponse } from './handlers/agent-handler.js';
import { handleProjectCreate, handleProjectList } from './handlers/project-handler.js';
import { handleFolderList, handleServerInfo } from './handlers/folder-handler.js';
import { handlePtySpawn } from './handlers/pty-handler.js';

describe('SessionManager', () => {
  let sm: SessionManager;
  const send = vi.fn();
  const wsServer = { broadcast: vi.fn() } as any;

  beforeEach(() => {
    sm = new SessionManager();
    vi.clearAllMocks();
  });

  it('routes project:create to project handler', () => {
    sm.handleMessage({ type: 'project:create', id: 'p1', cwd: '/tmp', requestId: 'r1' }, send, wsServer);
    expect(handleProjectCreate).toHaveBeenCalled();
  });

  it('routes project:list to project handler', () => {
    sm.handleMessage({ type: 'project:list', requestId: 'r1' }, send, wsServer);
    expect(handleProjectList).toHaveBeenCalled();
  });

  it('routes folder:list to folder handler', () => {
    sm.handleMessage({ type: 'folder:list', path: '/tmp', requestId: 'r1' }, send, wsServer);
    expect(handleFolderList).toHaveBeenCalled();
  });

  it('routes server:info to folder handler', () => {
    sm.handleMessage({ type: 'server:info', requestId: 'r1' }, send, wsServer);
    expect(handleServerInfo).toHaveBeenCalled();
  });

  it('sends error for agent:query with unknown projectId', () => {
    sm.handleMessage(
      { type: 'agent:query', projectId: 'unknown', prompt: 'hi', model: 'opus', permissionMode: 'default', effort: 'high' },
      send,
      wsServer,
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent:error', error: 'Unknown project' }),
    );
    expect(handleAgentQuery).not.toHaveBeenCalled();
  });

  it('routes agent:query to agent handler when session exists', () => {
    // Inject a session directly
    (sm as any).sessions.set('p1', createMockSession());

    sm.handleMessage(
      { type: 'agent:query', projectId: 'p1', prompt: 'hi', model: 'opus', permissionMode: 'default', effort: 'high' },
      send,
      wsServer,
    );
    expect(handleAgentQuery).toHaveBeenCalled();
  });

  it('routes agent:stop to agent handler', () => {
    (sm as any).sessions.set('p1', createMockSession());
    sm.handleMessage({ type: 'agent:stop', projectId: 'p1' }, send, wsServer);
    expect(handleAgentStop).toHaveBeenCalled();
  });

  it('routes pty:spawn to pty handler', () => {
    (sm as any).sessions.set('p1', createMockSession());
    sm.handleMessage(
      { type: 'pty:spawn', projectId: 'p1', cols: 80, rows: 24 },
      send,
      wsServer,
    );
    expect(handlePtySpawn).toHaveBeenCalled();
  });

  describe('dispose', () => {
    it('stops all backends and clears sessions', () => {
      const session1 = createMockSession();
      const session2 = createMockSession();
      (sm as any).sessions.set('p1', session1);
      (sm as any).sessions.set('p2', session2);

      sm.dispose();

      expect(session1.backend.stop).toHaveBeenCalled();
      expect(session2.backend.stop).toHaveBeenCalled();
      expect((sm as any).sessions.size).toBe(0);
    });
  });
});
