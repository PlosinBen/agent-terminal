import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultSuccess, SDKResultError, CanUseTool, PermissionMode, Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBackend, AgentMessage, PermissionHandler, StatusSegment, CommandInfo, ProviderCommandResult } from '../types.js';
import { getProviderCache, setProviderCache } from '../../core/provider-cache.js';
import { UsageTracker } from './usage-tracker.js';

export class ClaudeBackend implements AgentBackend {
  private permissionHandler: PermissionHandler | null = null;
  private sessionId: string | undefined;
  private activeQuery: Query | null = null;
  private usage = new UsageTracker();
  private initialized = false;
  private onInitCallback: (() => void) | null = null;
  private abortController: AbortController | null = null;

  constructor(opts?: { sessionId?: string }) {
    if (opts?.sessionId) this.sessionId = opts.sessionId;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getProviderCommands(): CommandInfo[] {
    const cache = getProviderCache('claude');
    return [
      {
        name: 'model',
        description: '設定模型',
        argumentHint: '<name>',
        options: () => (cache?.models ?? []).map(m => ({ value: m.value, desc: m.displayName })),
      },
      {
        name: 'mode',
        description: '設定權限模式',
        argumentHint: '<mode>',
        options: () => (cache?.permissionModes ?? ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']).map(m => ({ value: m, desc: '' })),
      },
      {
        name: 'effort',
        description: '設定思考程度',
        argumentHint: '<level>',
        options: () => (cache?.effortLevels ?? ['low', 'medium', 'high', 'max']).map(l => ({ value: l, desc: '' })),
      },
    ];
  }

  getSlashCommands(): CommandInfo[] {
    return (getProviderCache('claude')?.slashCommands ?? []).map(c => ({
      name: c.name,
      description: c.description,
      argumentHint: c.argumentHint,
    }));
  }

  onInit(callback: () => void): void {
    this.onInitCallback = callback;
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  /**
   * Warm-up: initialize SDK and populate provider cache without consuming tokens.
   * Aborts immediately after receiving init message.
   */
  async warmup(cwd: string): Promise<void> {
    if (getProviderCache('claude')) {
      this.initialized = true;
      this.onInitCallback?.();
      return;
    }

    const abortController = new AbortController();
    const generator = sdkQuery({
      prompt: ' ',
      options: {
        cwd,
        permissionMode: 'plan' as PermissionMode,
        abortController,
      },
    });

    try {
      for await (const message of generator) {
        const msg = message as SDKMessage;
        if (msg.type === 'system') {
          const sysMsg = msg as Record<string, unknown>;
          if (sysMsg.subtype === 'init' && !this.initialized) {
            this.initialized = true;
            const [models, commands] = await Promise.all([
              generator.supportedModels().catch(() => []),
              generator.supportedCommands().catch(() => []),
            ]);
            setProviderCache('claude', {
              models: models.map(m => ({ value: m.value, displayName: m.displayName, description: m.description })),
              slashCommands: commands.map(c => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
              permissionModes: ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'],
              effortLevels: ['low', 'medium', 'high', 'max'],
            });
            this.onInitCallback?.();
            abortController.abort();
            break;
          }
        }
      }
    } catch {
      // Abort throws — expected
    }
  }

  private createSdkQuery(prompt: string, opts: { cwd?: string; model?: string; permissionMode?: string; effort?: string }): Query {
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      if (!this.permissionHandler) {
        return { behavior: 'allow' as const, updatedInput: input };
      }
      const result = await this.permissionHandler({
        toolName,
        input,
        title: options.title,
      });
      if (result.behavior === 'allow') {
        return { behavior: 'allow' as const, updatedInput: input };
      }
      return result;
    };

    this.abortController = new AbortController();
    return sdkQuery({
      prompt,
      options: {
        cwd: opts.cwd ?? process.cwd(),
        canUseTool,
        model: opts.model ?? 'opus',
        permissionMode: (opts.permissionMode ?? 'default') as PermissionMode,
        effort: (opts.effort ?? 'high') as 'low' | 'medium' | 'high' | 'max',
        abortController: this.abortController,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    });
  }

  async *query(prompt: string, opts?: { cwd?: string; model?: string; permissionMode?: string; effort?: string }): AsyncGenerator<AgentMessage> {
    const generator = this.createSdkQuery(prompt, opts ?? {});
    this.activeQuery = generator;

    const retryWithoutSession = yield* this.processMessages(generator);
    if (retryWithoutSession) {
      yield { type: 'system', content: 'Session expired, starting fresh...' };
      this.sessionId = undefined;
      const freshGenerator = this.createSdkQuery(prompt, opts ?? {});
      this.activeQuery = freshGenerator;
      yield* this.processMessages(freshGenerator);
    }
  }

  /**
   * Process SDK messages from a generator. Returns true if session resume failed and a retry is needed.
   */
  private async *processMessages(generator: Query): AsyncGenerator<AgentMessage, boolean> {
    for await (const message of generator) {
      const msg = message as SDKMessage;

      // Capture session ID
      if ('session_id' in msg && msg.session_id && !this.sessionId) {
        this.sessionId = msg.session_id;
      }

      switch (msg.type) {
        case 'assistant': {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              yield { type: 'text', content: block.text };
            } else if (block.type === 'thinking') {
              yield { type: 'thinking', content: block.thinking };
            } else if (block.type === 'tool_use') {
              yield {
                type: 'tool_use',
                content: `${block.name}: ${JSON.stringify(block.input)}`,
                toolName: block.name,
                toolInput: block.input as Record<string, unknown>,
                toolUseId: block.id,
              };
            }
          }
          break;
        }

        case 'user': {
          const userContent = (msg as Record<string, unknown>).message as { content?: unknown[] } | undefined;
          if (Array.isArray(userContent?.content)) {
            for (const block of userContent.content) {
              const b = block as Record<string, unknown>;
              if (b.type === 'tool_result') {
                const resultContent = typeof b.content === 'string'
                  ? b.content
                  : JSON.stringify(b.content ?? '');
                yield {
                  type: 'tool_result',
                  content: resultContent.slice(0, 5000),
                  toolUseId: String(b.tool_use_id || ''),
                };
              }
            }
          }
          break;
        }

        case 'result': {
          const result = msg as SDKResultSuccess | SDKResultError;
          if (result.subtype === 'success') {
            const success = result as SDKResultSuccess;
            this.usage.update(success);
            yield {
              type: 'result',
              content: success.result,
              sessionId: success.session_id,
              costUsd: success.total_cost_usd,
              inputTokens: success.usage.input_tokens,
              outputTokens: success.usage.output_tokens,
            };
          } else {
            const error = result as SDKResultError;
            // If session resume failed, signal retry
            if (this.sessionId && error.errors.some(e => /session|resume/i.test(e))) {
              return true;
            }
            yield {
              type: 'system',
              content: `Error: ${error.subtype} — ${error.errors.join(', ')}`,
              sessionId: error.session_id,
            };
          }
          break;
        }

        case 'system': {
          const sysMsg = msg as Record<string, unknown>;
          if (sysMsg.subtype === 'init') {
            if (!this.initialized) {
              this.initialized = true;
              Promise.all([
                generator.supportedModels().catch(() => []),
                generator.supportedCommands().catch(() => []),
              ]).then(([models, commands]) => {
                setProviderCache('claude', {
                  models: models.map(m => ({ value: m.value, displayName: m.displayName, description: m.description })),
                  slashCommands: commands.map(c => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
                  permissionModes: ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'],
                  effortLevels: ['low', 'medium', 'high', 'max'],
                });
              });
              this.onInitCallback?.();
            }
          }
          if ('subtype' in msg) {
            yield { type: 'system', content: `[${sysMsg.subtype}]` };
          }
          break;
        }

        case 'rate_limit_event': {
          const rle = msg as Record<string, unknown>;
          const info = rle.rate_limit_info as Record<string, unknown> | undefined;
          if (info) this.usage.updateRateLimit(info);
          break;
        }

        default: {
          // Handle SDK-specific message types (compact, etc.)
          const anyMsg = msg as Record<string, unknown>;
          if (anyMsg.displayText) {
            yield { type: 'system', content: String(anyMsg.displayText) };
          }
          break;
        }
      }
    }
    return false;
  }

  getStatusSegments(): StatusSegment[] {
    return this.usage.getStatusSegments();
  }

  async setPermissionMode(mode: string): Promise<void> {
    if (this.activeQuery) {
      await this.activeQuery.setPermissionMode(mode as PermissionMode);
    }
  }

  async executeCommand(_name: string, _args: string): Promise<ProviderCommandResult | null> {
    // All commands handled client-side or sent as query prompts
    return null;
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
