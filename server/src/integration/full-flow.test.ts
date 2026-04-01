import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createMockBackend } from '../__test__/mock-backend.js';
import { connectWs, sendAndWait, collectUntil } from '../__test__/ws-helpers.js';
import type { AgentMessage } from '../providers/types.js';

// Mock provider registry to return a mock Claude backend
const mockBackendFactory = vi.fn().mockImplementation(() => ({
  query: async function* () {},
  stop: vi.fn(),
  setPermissionHandler: vi.fn(),
  setPermissionMode: vi.fn().mockResolvedValue(undefined),
  getRawUsage: vi.fn().mockReturnValue({ costUsd: 0, inputTokens: 0, outputTokens: 0, contextUsedTokens: 0, contextWindow: 0, numTurns: 1, rateLimits: [] }),
  isInitialized: vi.fn().mockReturnValue(true),
  getProviderCommands: vi.fn().mockReturnValue([]),
  getSlashCommands: vi.fn().mockReturnValue([]),
  executeCommand: vi.fn().mockResolvedValue(null),
  onInit: vi.fn(),
  warmup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../providers/registry.js', () => ({
  getProvider: vi.fn().mockReturnValue({
    name: 'claude',
    displayName: 'Claude',
    createBackend: (...args: any[]) => mockBackendFactory(...args),
    checkAvailable: vi.fn().mockResolvedValue(true),
  }),
  listProviders: vi.fn().mockReturnValue([{
    name: 'claude',
    displayName: 'Claude',
  }]),
  initRegistry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../handlers/git-watcher.js', () => ({
  watchGitHead: vi.fn(),
  broadcastStatus: vi.fn(),
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  })),
}));

import { createServerCore } from '../server-core.js';

describe('Full-flow integration', () => {
  let wsServer: ReturnType<typeof createServerCore>['wsServer'];
  let sessionManager: ReturnType<typeof createServerCore>['sessionManager'];
  let port: number;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    const core = createServerCore();
    wsServer = core.wsServer;
    sessionManager = core.sessionManager;
    port = await wsServer.start(0);
  });

  afterEach(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    clients.length = 0;
    sessionManager.dispose();
    wsServer.stop();
  });

  async function connect(): Promise<WebSocket> {
    const ws = await connectWs(port);
    clients.push(ws);
    return ws;
  }

  it('sends provider:list on new connection', async () => {
    // Register message listener BEFORE connection opens to catch the initial message
    const received: any[] = [];
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('message', (raw) => {
      received.push(JSON.parse(raw.toString()));
    });
    clients.push(ws);

    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Wait for the initial provider:list message
    await vi.waitFor(() => {
      expect(received.some(m => m.type === 'provider:list')).toBe(true);
    });

    const providerList = received.find(m => m.type === 'provider:list');
    expect(Array.isArray(providerList.providers)).toBe(true);
    expect(providerList.providers).toContainEqual({ name: 'claude', displayName: 'Claude' });
  });

  it('project create and list lifecycle', async () => {
    const ws = await connect();

    // Create project
    const created = await sendAndWait(ws, {
      type: 'project:create',
      id: 'p1',
      cwd: '/tmp/test-project',
      requestId: 'r1',
    }, 'project:created') as any;

    expect(created.project.id).toBe('p1');
    expect(created.project.name).toBe('test-project');
    expect(created.project.provider).toBe('claude');
    expect(created.project.providerDisplayName).toBe('Claude');

    // List projects
    const listed = await sendAndWait(ws, {
      type: 'project:list',
      requestId: 'r2',
    }, 'project:list_result') as any;

    expect(listed.projects).toHaveLength(1);
    expect(listed.projects[0].id).toBe('p1');
    expect(listed.projects[0].provider).toBe('claude');
  });

  it('agent query streams messages and sends done', async () => {
    const messages: AgentMessage[] = [
      { type: 'text', content: 'Hello world' },
      { type: 'result', content: '', sessionId: 'sid1' },
    ];

    // Configure the mock to yield messages
    mockBackendFactory.mockImplementation(() =>
      createMockBackend({
        query: async function* () { for (const m of messages) yield m; },
      }),
    );

    const ws = await connect();

    // Create project first
    await sendAndWait(ws, {
      type: 'project:create',
      id: 'p2',
      cwd: '/tmp/test',
      requestId: 'r1',
    }, 'project:created');

    // Start collecting before sending query
    const collecting = collectUntil(ws, 'agent:done');

    ws.send(JSON.stringify({
      type: 'agent:query',
      projectId: 'p2',
      prompt: 'hello',
      model: 'opus',
      permissionMode: 'default',
      effort: 'high',
    }));

    const collected = await collecting;
    const agentMessages = collected.filter(m =>
      m.type.startsWith('agent:') || m.type === 'status:update'
    );
    const types = agentMessages.map(m => m.type);

    expect(types).toContain('agent:text');
    expect(types).toContain('agent:result');
    expect(types[types.length - 1]).toBe('agent:done');
  });

  it('server info returns valid data', async () => {
    const ws = await connect();

    const result = await sendAndWait(ws, {
      type: 'server:info',
      requestId: 'r1',
    }, 'server:info_result') as any;

    expect(result.homePath).toBeTruthy();
    expect(result.hostname).toBeTruthy();
  });

  it('folder list returns entries', async () => {
    const ws = await connect();

    const result = await sendAndWait(ws, {
      type: 'folder:list',
      path: '/tmp',
      requestId: 'r1',
    }, 'folder:list_result') as any;

    expect(result.type).toBe('folder:list_result');
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it('agent query with unknown project returns error', async () => {
    const ws = await connect();

    const result = await sendAndWait(ws, {
      type: 'agent:query',
      projectId: 'nonexistent',
      prompt: 'hello',
      model: 'opus',
      permissionMode: 'default',
      effort: 'high',
    }, 'agent:error') as any;

    expect(result.error).toBe('Unknown project');
  });
});
