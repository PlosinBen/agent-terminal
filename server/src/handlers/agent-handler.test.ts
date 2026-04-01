import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DownstreamMessage } from '../shared/protocol.js';
import type { AgentMessage } from '../providers/types.js';
import { createMockBackend } from '../__test__/mock-backend.js';
import { createMockSession } from '../__test__/mock-session.js';
import {
  handleAgentQuery,
  handleAgentStop,
  handleAgentCommand,
  handlePermissionResponse,
} from './agent-handler.js';

vi.mock('./git-watcher.js', () => ({
  broadcastStatus: vi.fn(),
}));

function createMockWsServer() {
  return { broadcast: vi.fn() } as any;
}

describe('handleAgentQuery', () => {
  it('forwards all agent message types and sends done', async () => {
    const messages: AgentMessage[] = [
      { type: 'text', content: 'Hello' },
      { type: 'thinking', content: 'thinking...' },
      { type: 'tool_use', content: '', toolName: 'bash', toolUseId: 'tu1', toolInput: { command: 'ls' } },
      { type: 'tool_result', content: 'file.txt', toolUseId: 'tu1' },
      { type: 'system', content: 'compacted' },
      { type: 'result', content: '', sessionId: 'sid1' },
    ];

    const backend = createMockBackend({
      query: async function* () { for (const m of messages) yield m; },
    });
    const session = createMockSession({ backend });
    const replies: DownstreamMessage[] = [];

    await handleAgentQuery(
      session,
      { projectId: 'p1', prompt: 'test' },
      (m) => replies.push(m),
      createMockWsServer(),
    );

    const types = replies.map(r => r.type);
    expect(types).toEqual([
      'agent:text', 'agent:thinking', 'agent:tool_use', 'agent:tool_result',
      'agent:system', 'agent:result', 'agent:done',
    ]);
    expect(session.loading).toBe(false);
    expect(session.turns).toBe(1);
  });

  it('stores sessionId from result message', async () => {
    const backend = createMockBackend({
      query: async function* () {
        yield { type: 'result' as const, content: '', sessionId: 'new-sid' };
      },
    });
    const session = createMockSession({ backend });

    await handleAgentQuery(session, { projectId: 'p1', prompt: 'test' }, vi.fn(), createMockWsServer());
    expect(session.project.sessionId).toBe('new-sid');
  });

  it('sends error and done on backend failure', async () => {
    const backend = createMockBackend({
      query: async function* () { throw new Error('API error'); },
    });
    const session = createMockSession({ backend });
    const replies: DownstreamMessage[] = [];

    await handleAgentQuery(session, { projectId: 'p1', prompt: 'test' }, (m) => replies.push(m), createMockWsServer());

    const types = replies.map(r => r.type);
    expect(types).toEqual(['agent:error', 'agent:done']);
    expect((replies[0] as any).error).toBe('API error');
    expect(session.loading).toBe(false);
  });

  it('sets up permission handler on backend', async () => {
    const backend = createMockBackend();
    const session = createMockSession({ backend });

    await handleAgentQuery(session, { projectId: 'p1', prompt: 'test' }, vi.fn(), createMockWsServer());
    expect(backend.setPermissionHandler).toHaveBeenCalled();
  });

  it('broadcasts permission request and resolves via handlePermissionResponse', async () => {
    const wsServer = createMockWsServer();
    let capturedHandler: any;

    const backend = createMockBackend({
      setPermissionHandler: vi.fn((handler) => { capturedHandler = handler; }),
      query: async function* () {
        yield { type: 'text' as const, content: 'done' };
      },
    });
    const session = createMockSession({ backend });

    await handleAgentQuery(session, { projectId: 'p1', prompt: 'test' }, vi.fn(), wsServer);

    // Now simulate permission request
    expect(capturedHandler).toBeDefined();
    const permPromise = capturedHandler({ toolName: 'bash', input: { command: 'ls' } });

    // Verify broadcast was called with permission:request
    const broadcastCall = wsServer.broadcast.mock.calls.find(
      (c: any) => c[0].type === 'permission:request'
    );
    expect(broadcastCall).toBeDefined();
    const requestId = broadcastCall[0].requestId;

    // Resolve via handlePermissionResponse
    handlePermissionResponse(session, { requestId, result: { behavior: 'allow' } });

    const result = await permPromise;
    expect(result).toEqual({ behavior: 'allow' });
    expect(session.permissionResolvers.size).toBe(0);
  });
});

describe('handleAgentStop', () => {
  it('stops backend and clears loading', () => {
    const session = createMockSession({ loading: true });
    handleAgentStop(session);
    expect(session.backend.stop).toHaveBeenCalled();
    expect(session.loading).toBe(false);
  });
});

describe('handleAgentCommand', () => {
  it('handles app command (clear)', async () => {
    const session = createMockSession();
    const replies: DownstreamMessage[] = [];

    await handleAgentCommand(
      session,
      { projectId: 'p1', command: 'clear', args: '', requestId: 'r1' },
      (m) => replies.push(m),
    );

    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe('command:result');
    expect((replies[0] as any).message).toBe('Screen cleared');
  });

  it('delegates to provider command', async () => {
    const backend = createMockBackend({
      executeCommand: vi.fn().mockResolvedValue({ message: 'Model set to opus' }),
    });
    const session = createMockSession({ backend });
    const replies: DownstreamMessage[] = [];

    await handleAgentCommand(
      session,
      { projectId: 'p1', command: 'model', args: 'opus', requestId: 'r2' },
      (m) => replies.push(m),
    );

    expect(backend.executeCommand).toHaveBeenCalledWith('model', 'opus');
    expect((replies[0] as any).message).toBe('Model set to opus');
  });

  it('returns unknown for unrecognized command', async () => {
    const session = createMockSession();
    const replies: DownstreamMessage[] = [];

    await handleAgentCommand(
      session,
      { projectId: 'p1', command: 'foobar', args: '', requestId: 'r3' },
      (m) => replies.push(m),
    );

    expect((replies[0] as any).message).toBe('Unknown command: /foobar');
  });
});

describe('handlePermissionResponse', () => {
  it('ignores unknown requestId', () => {
    const session = createMockSession();
    // Should not throw
    handlePermissionResponse(session, { requestId: 'unknown', result: { behavior: 'allow' } });
  });

  it('resolves and removes resolver', () => {
    const session = createMockSession();
    const resolver = vi.fn();
    session.permissionResolvers.set('req1', resolver);

    handlePermissionResponse(session, { requestId: 'req1', result: { behavior: 'deny', message: 'no' } });

    expect(resolver).toHaveBeenCalledWith({ behavior: 'deny', message: 'no' });
    expect(session.permissionResolvers.has('req1')).toBe(false);
  });
});
