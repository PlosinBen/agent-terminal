import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultSuccess, SDKResultError, CanUseTool, PermissionMode, Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBackend, AgentMessage, PermissionHandler, RawUsageData, CommandInfo, ProviderCommandResult } from '../types.js';
import { getProviderCache, setProviderCache } from '../../core/provider-cache.js';
import { UsageTracker } from './usage-tracker.js';
import { logger } from '../../core/logger.js';
import { loadConfig } from '../../core/config.js';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

function findClaudeBinary(): string | undefined {
  // 1. Check user-configured path from config
  try {
    const configPath = loadConfig().providerPaths?.claude;
    if (configPath) {
      try { if (fs.statSync(configPath).isFile()) return configPath; } catch {}
    }
  } catch {}

  // 2. Check common locations for the native binary
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ];
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  // 3. Fallback: which
  try {
    return execFileSync('which', ['claude'], { encoding: 'utf8', timeout: 3000 }).trim() || undefined;
  } catch { return undefined; }
}

function dataUrlToContentBlock(dataUrl: string): { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | null {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) return null;
  const base64 = match[2];
  // Skip images > 20MB base64 to avoid API rejection
  if (base64.length > 20 * 1024 * 1024) return null;
  return {
    type: 'image',
    source: { type: 'base64', media_type: match[1], data: base64 },
  };
}

export class ClaudeBackend implements AgentBackend {
  private permissionHandler: PermissionHandler | null = null;
  private sessionId: string | undefined;
  private activeQuery: Query | null = null;
  private usage = new UsageTracker();
  private initialized = false;
  private onInitCallback: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private claudeBinaryPath: string | undefined;

  constructor(opts?: { sessionId?: string }) {
    if (opts?.sessionId) this.sessionId = opts.sessionId;
    this.claudeBinaryPath = findClaudeBinary();
    if (this.claudeBinaryPath) {
      logger.info(`[claude] Found native binary: ${this.claudeBinaryPath}`);
    } else {
      logger.warn('[claude] Native binary not found, SDK will use node fallback');
    }
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

    logger.info(`[warmup] starting, cwd=${cwd}`);

    const abortController = new AbortController();
    const generator = sdkQuery({
      prompt: ' ',
      options: {
        cwd,
        permissionMode: 'plan' as PermissionMode,
        abortController,
        ...(this.claudeBinaryPath ? { pathToClaudeCodeExecutable: this.claudeBinaryPath } : {}),
      },
    });

    logger.info('[warmup] sdkQuery created, iterating messages...');

    try {
      for await (const message of generator) {
        const msg = message as SDKMessage;
        logger.info(`[warmup] received message: type=${msg.type}, subtype=${'subtype' in msg ? (msg as Record<string, unknown>).subtype : 'n/a'}`);
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
            logger.info(`[warmup] initialized, ${models.length} models, ${commands.length} commands`);
            logger.info(`[warmup] models: ${JSON.stringify(models.map(m => ({ value: m.value, displayName: m.displayName, description: m.description })))}`);
            this.onInitCallback?.();
            abortController.abort();
            break;
          }
        }
      }
    } catch (err) {
      const errObj = err as Record<string, unknown>;
      logger.error(`[warmup] generator ended: ${err instanceof Error ? err.message : String(err)}`);
      if (errObj.stderr) logger.error(`[warmup] stderr: ${errObj.stderr}`);
      if (errObj.stdout) logger.error(`[warmup] stdout: ${errObj.stdout}`);
      if (err instanceof Error && err.stack) logger.error(`[warmup] stack: ${err.stack}`);
    }
  }

  private createSdkQuery(prompt: string, opts: { cwd?: string; model?: string; permissionMode?: string; effort?: string; images?: string[] }): Query {
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
        return { behavior: 'allow' as const, updatedInput: result.updatedInput ?? input };
      }
      return result;
    };

    this.abortController = new AbortController();

    // Build prompt: if images attached, use async generator with content blocks
    let promptArg: unknown = prompt || ' ';
    if (opts.images?.length) {
      const imageBlocks = opts.images
        .map(dataUrl => dataUrlToContentBlock(dataUrl))
        .filter(Boolean) as Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
      if (imageBlocks.length > 0) {
        const contentBlocks = [
          ...imageBlocks,
          ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
        ];
        const userMessage = {
          type: 'user' as const,
          message: { role: 'user' as const, content: contentBlocks },
        };
        async function* singleMessage() {
          yield userMessage;
        }
        promptArg = singleMessage();
      }
    }

    return sdkQuery({
      prompt: promptArg as Parameters<typeof sdkQuery>[0]['prompt'],
      options: {
        cwd: opts.cwd ?? process.cwd(),
        canUseTool,
        model: opts.model ?? this.getDefaultModel(),
        permissionMode: (opts.permissionMode ?? 'default') as PermissionMode,
        effort: (opts.effort ?? 'high') as 'low' | 'medium' | 'high' | 'max',
        abortController: this.abortController,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        ...(this.claudeBinaryPath ? { pathToClaudeCodeExecutable: this.claudeBinaryPath } : {}),
      },
    });
  }

  async *query(prompt: string, opts?: { cwd?: string; model?: string; permissionMode?: string; effort?: string; images?: string[] }): AsyncGenerator<AgentMessage> {
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
          const parentId = (msg as Record<string, unknown>).parent_tool_use_id as string | undefined;
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              yield { type: 'text', content: block.text, ...(parentId && { parentToolUseId: parentId }) };
            } else if (block.type === 'thinking') {
              yield { type: 'thinking', content: block.thinking, ...(parentId && { parentToolUseId: parentId }) };
            } else if (block.type === 'tool_use') {
              yield {
                type: 'tool_use',
                content: `${block.name}: ${JSON.stringify(block.input)}`,
                toolName: block.name,
                toolInput: block.input as Record<string, unknown>,
                toolUseId: block.id,
                ...(parentId && { parentToolUseId: parentId }),
              };
            }
          }
          break;
        }

        case 'user': {
          const parentId = (msg as Record<string, unknown>).parent_tool_use_id as string | undefined;
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
                  ...(parentId && { parentToolUseId: parentId }),
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
          // Extract subagent results from task_notification
          if (sysMsg.subtype === 'task_notification' && sysMsg.summary && sysMsg.tool_use_id) {
            yield {
              type: 'tool_result',
              content: String(sysMsg.summary),
              toolUseId: String(sysMsg.tool_use_id),
            };
          } else if (sysMsg.subtype !== 'init') {
            // Surface any unhandled system subtypes instead of silently dropping
            const text = sysMsg.displayText ?? sysMsg.summary ?? sysMsg.message ?? sysMsg.content;
            if (text) {
              const clean = String(text).replace(/\x1b\[[0-9;]*m/g, '');
              yield { type: 'system', content: clean };
            }
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
          // Surface any unhandled message types instead of silently dropping
          const anyMsg = msg as Record<string, unknown>;
          const text = anyMsg.displayText ?? anyMsg.summary ?? anyMsg.message ?? anyMsg.content;
          if (text) {
            const clean = String(text).replace(/\x1b\[[0-9;]*m/g, '');
            yield { type: 'system', content: clean };
          }
          break;
        }
      }
    }
    return false;
  }

  private getDefaultModel(): string {
    const cache = getProviderCache('claude');
    return cache?.models[0]?.value ?? 'default';
  }

  getRawUsage(): RawUsageData {
    return this.usage.getRawUsage();
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
