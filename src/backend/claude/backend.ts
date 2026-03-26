import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultSuccess, SDKResultError, CanUseTool, PermissionMode, Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBackend, AgentMessage, PermissionHandler, StatusSegment, CommandInfo, ProviderCommandResult } from '../types.js';
import { loadProviderCache, saveProviderCache } from '../../core/provider-cache.js';

const PERMISSION_MODE_DISPLAY: Record<string, { label: string; color?: string }> = {
  default: { label: 'Prompt' },
  acceptEdits: { label: 'AcceptEdits', color: 'yellow' },
  bypassPermissions: { label: 'BypassPermissions', color: 'red' },
  plan: { label: 'Plan', color: 'cyan' },
  dontAsk: { label: 'AutoDeny' },
};

export class ClaudeBackend implements AgentBackend {
  private permissionHandler: PermissionHandler | null = null;
  private sessionId: string | undefined;
  private activeQuery: Query | null = null;
  private model = 'opus';
  private permissionMode: string = 'default';
  private effort: string = 'high';
  private costUsd = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private rateLimits = new Map<string, { utilization: number; resetsAt?: number }>();
  private initialized = false;
  private onInitCallback: (() => void) | null = null;

  constructor(opts?: { model?: string; permissionMode?: string; effort?: string }) {
    if (opts?.model) this.model = opts.model;
    if (opts?.permissionMode) this.permissionMode = opts.permissionMode;
    if (opts?.effort) this.effort = opts.effort;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getModel(): string {
    return this.model;
  }

  getPermissionMode(): string {
    return this.permissionMode;
  }

  getEffort(): string {
    return this.effort;
  }

  getProviderCommands(): CommandInfo[] {
    const cache = loadProviderCache('claude');
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
    return (loadProviderCache('claude')?.slashCommands ?? []).map(c => ({
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

  async *query(prompt: string, opts?: { cwd?: string }): AsyncGenerator<AgentMessage> {
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      if (!this.permissionHandler) {
        return { behavior: 'allow' as const };
      }
      return this.permissionHandler({
        toolName,
        input,
        title: options.title,
      });
    };

    const generator = sdkQuery({
      prompt,
      options: {
        cwd: opts?.cwd ?? process.cwd(),
        canUseTool,
        model: this.model,
        permissionMode: this.permissionMode as PermissionMode,
        effort: this.effort as 'low' | 'medium' | 'high' | 'max',
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    });
    this.activeQuery = generator;

    for await (const message of generator) {
      const msg = message as SDKMessage;

      // Capture session ID
      if ('session_id' in msg && msg.session_id && !this.sessionId) {
        this.sessionId = msg.session_id;
      }

      switch (msg.type) {
        case 'assistant': {
          // Extract text content from BetaMessage
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

        case 'result': {
          const result = msg as SDKResultSuccess | SDKResultError;
          if (result.subtype === 'success') {
            const success = result as SDKResultSuccess;
            this.costUsd += success.total_cost_usd ?? 0;
            this.inputTokens = success.usage.input_tokens;
            this.outputTokens = success.usage.output_tokens;
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
          // Capture model name from init message
          if (sysMsg.subtype === 'init') {
            if (sysMsg.model) this.model = String(sysMsg.model);
            if (sysMsg.permissionMode) this.permissionMode = String(sysMsg.permissionMode);
            if (!this.initialized) {
              this.initialized = true;
              Promise.all([
                generator.supportedModels().catch(() => []),
                generator.supportedCommands().catch(() => []),
              ]).then(([models, commands]) => {
                saveProviderCache('claude', {
                  models: models.map(m => ({ value: m.value, displayName: m.displayName, description: m.description })),
                  slashCommands: commands.map(c => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
                  permissionModes: ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'],
                  effortLevels: ['low', 'medium', 'high', 'max'],
                  cachedAt: new Date().toISOString(),
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
          if (info?.utilization != null && info?.rateLimitType) {
            this.rateLimits.set(String(info.rateLimitType), {
              utilization: Number(info.utilization),
              resetsAt: info.resetsAt != null ? Number(info.resetsAt) : undefined,
            });
          }
          break;
        }

        default:
          break;
      }
    }
  }

  getStatusSegments(): StatusSegment[] {
    if (!this.initialized) return [];
    const tokens = `${(this.inputTokens / 1000).toFixed(0)}k+${(this.outputTokens / 1000).toFixed(0)}k`;
    const segments: StatusSegment[] = [
      { value: this.model },
      { value: (PERMISSION_MODE_DISPLAY[this.permissionMode]?.label ?? this.permissionMode), color: PERMISSION_MODE_DISPLAY[this.permissionMode]?.color },
      { label: 'effort', value: this.effort },
      { value: tokens },
      { value: `$${this.costUsd.toFixed(3)}` },
    ];
    const labelMap: Record<string, string> = {
      five_hour: '5h',
      seven_day: '7d',
      seven_day_opus: '7d-opus',
      seven_day_sonnet: '7d-sonnet',
    };
    for (const [type, info] of this.rateLimits) {
      const pct = Math.round(info.utilization);
      const color = pct >= 80 ? 'red' : pct >= 50 ? 'yellow' : undefined;
      let value = `${pct}%`;
      if (info.resetsAt) {
        const diff = info.resetsAt - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 60000);
          value += mins >= 60 ? ` ↻${(mins / 60).toFixed(1)}h` : ` ↻${mins}m`;
        }
      }
      segments.push({ label: labelMap[type] ?? type, value, color });
    }
    return segments;
  }

  async executeCommand(name: string, args: string): Promise<ProviderCommandResult | null> {
    switch (name) {
      case 'model':
        if (!args) return { message: 'Usage: /model <name>' };
        this.model = args;
        return { message: `Model set to: ${args}`, updated: { model: args } };

      case 'mode':
        if (!args) return { message: 'Usage: /mode <mode>' };
        this.permissionMode = args;
        if (this.activeQuery) {
          await this.activeQuery.setPermissionMode(args as PermissionMode);
        }
        return { message: `Permission mode set to: ${args}`, updated: { permissionMode: args } };

      case 'effort':
        if (!args) return { message: 'Usage: /effort <low|medium|high|max>' };
        this.effort = args;
        return { message: `Effort set to: ${args}`, updated: { effort: args } };

      default:
        return null;
    }
  }

  stop(): void {
    // TODO: implement abort via SDK when available
  }
}
