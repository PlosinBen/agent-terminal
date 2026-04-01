import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all providers before importing registry
vi.mock('./claude/index.js', () => ({
  provider: {
    name: 'claude',
    displayName: 'Claude',
    createBackend: vi.fn(),
    checkAvailable: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('./gemini/index.js', () => ({
  provider: {
    name: 'gemini',
    displayName: 'Gemini',
    createBackend: vi.fn(),
    checkAvailable: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('./copilot/index.js', () => ({
  provider: {
    name: 'copilot',
    displayName: 'GitHub Copilot',
    createBackend: vi.fn(),
    checkAvailable: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('./mock/index.js', () => ({
  provider: {
    name: 'mock',
    displayName: 'Mock (Testing)',
    createBackend: vi.fn(),
    checkAvailable: vi.fn().mockResolvedValue(false),
  },
}));

import { initRegistry, listProviders, getProvider } from './registry.js';
import { provider as claude } from './claude/index.js';
import { provider as gemini } from './gemini/index.js';
import { provider as copilot } from './copilot/index.js';
import { provider as mock } from './mock/index.js';

describe('Provider Registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset defaults: only claude available
    vi.mocked(claude.checkAvailable).mockResolvedValue(true);
    vi.mocked(gemini.checkAvailable).mockResolvedValue(false);
    vi.mocked(copilot.checkAvailable).mockResolvedValue(false);
    vi.mocked(mock.checkAvailable).mockResolvedValue(false);
  });

  it('initRegistry filters to only available providers', async () => {
    await initRegistry();

    const providers = listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('claude');
  });

  it('getProvider returns available provider by name', async () => {
    await initRegistry();

    const p = getProvider('claude');
    expect(p).toBeDefined();
    expect(p!.name).toBe('claude');
    expect(p!.displayName).toBe('Claude');
  });

  it('getProvider returns undefined for unavailable provider', async () => {
    await initRegistry();

    expect(getProvider('gemini')).toBeUndefined();
    expect(getProvider('copilot')).toBeUndefined();
  });

  it('getProvider returns undefined for unknown provider', async () => {
    await initRegistry();

    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('handles checkAvailable errors gracefully', async () => {
    vi.mocked(claude.checkAvailable).mockRejectedValueOnce(new Error('auth failed'));
    vi.mocked(gemini.checkAvailable).mockResolvedValueOnce(true);

    await initRegistry();

    const providers = listProviders();
    // claude threw error (excluded), gemini available
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('gemini');
  });

  it('lists all available providers when all pass', async () => {
    vi.mocked(claude.checkAvailable).mockResolvedValueOnce(true);
    vi.mocked(gemini.checkAvailable).mockResolvedValueOnce(true);
    vi.mocked(copilot.checkAvailable).mockResolvedValueOnce(true);
    vi.mocked(mock.checkAvailable).mockResolvedValueOnce(true);

    await initRegistry();

    const providers = listProviders();
    expect(providers).toHaveLength(4);
    expect(providers.map(p => p.name).sort()).toEqual(['claude', 'copilot', 'gemini', 'mock']);
  });

  it('returns empty list when no providers available', async () => {
    vi.mocked(claude.checkAvailable).mockResolvedValueOnce(false);

    await initRegistry();

    expect(listProviders()).toHaveLength(0);
    expect(getProvider('claude')).toBeUndefined();
  });
});
