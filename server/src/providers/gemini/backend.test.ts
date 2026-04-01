import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiBackend } from './backend.js';
import * as pty from 'node-pty';
import { getProviderCache, setProviderCache } from '../../core/provider-cache.js';

vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../core/provider-cache.js', () => ({
  getProviderCache: vi.fn(),
  setProviderCache: vi.fn(),
}));

describe('GeminiBackend', () => {
  let backend: GeminiBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new GeminiBackend();
  });

  it('warmup populates provider cache', async () => {
    vi.mocked(getProviderCache).mockReturnValue(null);

    await backend.warmup('/test/cwd');

    expect(setProviderCache).toHaveBeenCalledWith('gemini', expect.objectContaining({
      models: expect.any(Array),
      slashCommands: expect.any(Array),
      permissionModes: expect.any(Array),
    }));
    expect(backend.isInitialized()).toBe(true);
  });

  it('warmup skips if cache already exists', async () => {
    vi.mocked(getProviderCache).mockReturnValue({
      models: [], slashCommands: [], permissionModes: [], effortLevels: [],
    });

    await backend.warmup('/test/cwd');

    expect(setProviderCache).not.toHaveBeenCalled();
    expect(backend.isInitialized()).toBe(true);
  });

  it('mapGeminiToAgentMessage correctly maps JSON output', () => {
    const backendAny = backend as any;

    // Text message
    expect(backendAny.mapGeminiToAgentMessage({ type: 'text', content: 'hello' }))
      .toEqual({ type: 'text', content: 'hello' });

    // Tool use
    expect(backendAny.mapGeminiToAgentMessage({
      type: 'tool_use',
      toolName: 'ls',
      toolInput: { dir: '.' },
      toolUseId: 'tu1',
    })).toEqual({
      type: 'tool_use',
      toolName: 'ls',
      toolInput: { dir: '.' },
      toolUseId: 'tu1',
      content: 'ls: {"dir":"."}',
    });

    // Session ID
    backendAny.mapGeminiToAgentMessage({ type: 'session_id', sessionId: 'sid123' });
    expect(backendAny.sessionId).toBe('sid123');

    // Result with usage
    const resultMsg = backendAny.mapGeminiToAgentMessage({
      type: 'result',
      content: 'done',
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    expect(resultMsg).toEqual({
      type: 'result',
      content: 'done',
      sessionId: 'sid123',
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  it('query spawns pty with correct args', async () => {
    const mockPty = {
      onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onExit: vi.fn(),
      kill: vi.fn(),
    };
    vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

    const queryPromise = (async () => {
      const gen = backend.query('hello', { model: 'gemini-pro', permissionMode: 'yolo' });
      for await (const _ of gen) { /* consume */ }
    })();

    // Trigger exit to finish the generator
    setTimeout(() => {
      const exitHandler = vi.mocked(mockPty.onExit).mock.calls[0][0];
      exitHandler({ exitCode: 0 });
    }, 10);

    await queryPromise;

    expect(pty.spawn).toHaveBeenCalledWith('gemini', expect.arrayContaining([
      '-o', 'stream-json',
      '--model', 'gemini-pro',
      '--approval-mode', 'yolo',
      '-p', 'hello',
    ]), expect.any(Object));
  });
});
