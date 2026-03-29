import { vi } from 'vitest';
import type { AgentBackend, AgentMessage, PermissionHandler, CommandInfo, ProviderCommandResult, StatusSegment } from '../backend/types.js';

export interface MockBackend extends AgentBackend {
  warmup: ReturnType<typeof vi.fn>;
}

export function createMockBackend(overrides?: Partial<MockBackend>): MockBackend {
  return {
    query: async function* (_prompt: string): AsyncGenerator<AgentMessage> {},
    stop: vi.fn(),
    setPermissionHandler: vi.fn(),
    setPermissionMode: vi.fn().mockResolvedValue(undefined),
    getStatusSegments: vi.fn().mockReturnValue([] as StatusSegment[]),
    isInitialized: vi.fn().mockReturnValue(true),
    getProviderCommands: vi.fn().mockReturnValue([] as CommandInfo[]),
    getSlashCommands: vi.fn().mockReturnValue([] as CommandInfo[]),
    executeCommand: vi.fn().mockResolvedValue(null as ProviderCommandResult | null),
    onInit: vi.fn(),
    warmup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
