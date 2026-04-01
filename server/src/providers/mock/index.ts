import type { ProviderDefinition, AgentBackend, AgentMessage, PermissionHandler, CommandInfo, ProviderCommandResult, RawUsageData } from '../types.js';
import { setProviderCache } from '../../core/provider-cache.js';

/**
 * Mock provider for E2E testing.
 * Provides predictable responses without requiring any external API or CLI.
 *
 * Enable via: AGENT_PROVIDERS=mock
 */

class MockBackend implements AgentBackend {
  private initCallback: (() => void) | null = null;
  private permissionHandler: PermissionHandler | null = null;
  private usage: RawUsageData = {
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    contextUsedTokens: 0,
    contextWindow: 200_000,
    numTurns: 0,
    rateLimits: [],
  };

  async *query(prompt: string): AsyncGenerator<AgentMessage> {
    this.usage.numTurns = (this.usage.numTurns ?? 0) + 1;
    this.usage.inputTokens = (this.usage.inputTokens ?? 0) + prompt.length;

    // Special test commands
    if (prompt.startsWith('__mock:')) {
      const cmd = prompt.slice(7).trim();
      if (cmd.startsWith('error')) {
        yield { type: 'system', content: `Error: ${cmd.slice(6).trim() || 'mock error'}` };
        return;
      }
      if (cmd.startsWith('delay')) {
        const ms = parseInt(cmd.slice(6).trim(), 10) || 1000;
        await new Promise(r => setTimeout(r, ms));
      }
    }

    // Simulate thinking
    yield { type: 'thinking', content: `Processing: ${prompt.slice(0, 50)}...` };

    // Simulate text response
    const response = `Mock response to: ${prompt}`;
    this.usage.outputTokens = (this.usage.outputTokens ?? 0) + response.length;
    yield { type: 'text', content: response };

    // Result
    yield { type: 'result', content: response, costUsd: 0, inputTokens: prompt.length, outputTokens: response.length };
  }

  stop(): void {
    // no-op
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  async setPermissionMode(_mode: string): Promise<void> {
    // no-op
  }

  getRawUsage(): RawUsageData {
    return { ...this.usage };
  }

  isInitialized(): boolean {
    return true;
  }

  getProviderCommands(): CommandInfo[] {
    return [];
  }

  getSlashCommands(): CommandInfo[] {
    return [];
  }

  async executeCommand(_name: string, _args: string): Promise<ProviderCommandResult | null> {
    return null;
  }

  onInit(callback: () => void): void {
    this.initCallback = callback;
  }

  async warmup(_cwd: string): Promise<void> {
    // Populate provider cache so the client receives providerConfig
    setProviderCache('mock', {
      models: [],
      permissionModes: [],
      effortLevels: [],
      slashCommands: [],
    });

    // Fire init callback — triggers status:update broadcast to client
    if (this.initCallback) {
      this.initCallback();
    }
  }
}

export const provider: ProviderDefinition = {
  name: 'mock',
  displayName: 'Mock (Testing)',

  createBackend: () => new MockBackend(),

  checkAvailable: async () => true,
};
