import * as pty from 'node-pty';
import type { AgentBackend, AgentMessage, PermissionHandler, RawUsageData, CommandInfo, ProviderCommandResult } from '../types.js';
import { getProviderCache, setProviderCache } from '../../core/provider-cache.js';
import { logger } from '../../core/logger.js';
import { loadConfig } from '../../core/config.js';

export class GeminiBackend implements AgentBackend {
  private ptyProcess: pty.IPty | null = null;
  private permissionHandler: PermissionHandler | null = null;
  private initialized = false;
  private initCallback: (() => void) | null = null;
  private sessionId: string | undefined;

  constructor(opts?: { sessionId?: string }) {
    if (opts?.sessionId) this.sessionId = opts.sessionId;
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  async warmup(cwd: string): Promise<void> {
    if (getProviderCache('gemini')) {
      this.initialized = true;
      this.initCallback?.();
      return;
    }

    logger.info(`[gemini:warmup] starting, cwd=${cwd}`);

    setProviderCache('gemini', {
      models: [
        { value: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', description: 'Fast and capable' },
        { value: 'gemini-2.0-pro-exp', displayName: 'Gemini 2.0 Pro (Exp)', description: 'Most powerful experimental model' },
        { value: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', description: 'Complex reasoning' },
      ],
      slashCommands: [
        { name: 'clear', description: 'Clear session history', argumentHint: '' },
        { name: 'compact', description: 'Compact context window', argumentHint: '' },
      ],
      permissionModes: ['default', 'auto_edit', 'yolo', 'plan'],
      effortLevels: [],
    });

    this.initialized = true;
    this.initCallback?.();
  }

  async *query(prompt: string, opts?: { cwd?: string; model?: string; permissionMode?: string; effort?: string; images?: string[] }): AsyncGenerator<AgentMessage> {
    const cwd = opts?.cwd ?? process.cwd();
    const args = ['-o', 'stream-json'];

    if (opts?.model) args.push('--model', opts.model);
    if (opts?.permissionMode) args.push('--approval-mode', opts.permissionMode);
    if (this.sessionId) args.push('--resume', this.sessionId);

    args.push('-p', prompt || ' ');

    const geminiCmd = loadConfig().providerPaths?.gemini || 'gemini';
    logger.info(`[gemini] spawning: ${geminiCmd} ${args.join(' ')}`);

    try {
      const ptyProc = pty.spawn(geminiCmd, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env: process.env as Record<string, string>,
      });

      this.ptyProcess = ptyProc;

      const messageQueue: AgentMessage[] = [];
      let resolveNext: ((value: void) => void) | null = null;
      let exited = false;

      const cleanup = ptyProc.onData((data: string) => {
        const lines = data.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const msg = this.mapGeminiToAgentMessage(parsed);
            if (msg) {
              messageQueue.push(msg);
              if (resolveNext) {
                const res = resolveNext;
                resolveNext = null;
                res();
              }
            }
          } catch {
            if (line.includes('Error')) {
              messageQueue.push({ type: 'system', content: line.trim() });
            }
          }
        }
      });

      ptyProc.onExit(() => {
        exited = true;
        if (resolveNext) {
          const res = resolveNext;
          resolveNext = null;
          res();
        }
        cleanup.dispose();
      });

      while (!exited || messageQueue.length > 0) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else {
          await new Promise<void>(res => { resolveNext = res; });
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      yield { type: 'system', content: `Gemini error: ${errMsg}` };
    } finally {
      this.ptyProcess = null;
    }
  }

  private mapGeminiToAgentMessage(parsed: Record<string, unknown>): AgentMessage | null {
    if (parsed.type === 'text') return { type: 'text', content: parsed.content as string };
    if (parsed.type === 'thinking') return { type: 'thinking', content: parsed.content as string };
    if (parsed.type === 'tool_use') return {
      type: 'tool_use',
      toolName: parsed.toolName as string,
      toolInput: parsed.toolInput as Record<string, unknown>,
      toolUseId: parsed.toolUseId as string,
      content: `${parsed.toolName}: ${JSON.stringify(parsed.toolInput)}`,
    };
    if (parsed.type === 'tool_result') return {
      type: 'tool_result',
      toolUseId: parsed.toolUseId as string,
      content: parsed.content as string,
    };
    if (parsed.type === 'session_id' && !this.sessionId) {
      this.sessionId = parsed.sessionId as string;
    }
    if (parsed.type === 'result') {
      const usage = parsed.usage as Record<string, number> | undefined;
      return {
        type: 'result',
        content: parsed.content as string,
        sessionId: this.sessionId,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
      };
    }
    return null;
  }

  stop(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  getRawUsage(): RawUsageData {
    return {
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      contextUsedTokens: 0,
      contextWindow: 0,
      numTurns: 1,
      rateLimits: [],
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async setPermissionMode(_mode: string): Promise<void> {
    // Permission mode is passed per-query via --approval-mode flag
  }

  getProviderCommands(): CommandInfo[] {
    const cache = getProviderCache('gemini');
    return [
      {
        name: 'model',
        description: 'Set model',
        argumentHint: '<name>',
        options: () => (cache?.models ?? []).map(m => ({ value: m.value, desc: m.displayName })),
      },
      {
        name: 'mode',
        description: 'Set permission mode',
        argumentHint: '<mode>',
        options: () => (cache?.permissionModes ?? ['default', 'auto_edit', 'yolo', 'plan']).map(m => ({ value: m, desc: '' })),
      },
    ];
  }

  getSlashCommands(): CommandInfo[] {
    return (getProviderCache('gemini')?.slashCommands ?? []).map(c => ({
      name: c.name,
      description: c.description,
      argumentHint: c.argumentHint,
    }));
  }

  async executeCommand(_name: string, _args: string): Promise<ProviderCommandResult | null> {
    return null;
  }

  onInit(callback: () => void): void {
    this.initCallback = callback;
  }
}
