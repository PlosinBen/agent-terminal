import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index.js';
import type {
  AgentBackend, AgentMessage, PermissionHandler, RawUsageData, CommandInfo, ProviderCommandResult,
} from '../types.js';
import { getProviderCache, setProviderCache } from '../../core/provider-cache.js';
import { logger } from '../../core/logger.js';
import { CopilotAuth } from './auth.js';
import { TOOLS, TOOL_SPECS } from './tools.js';

const COPILOT_BASE_URL = 'https://api.githubcopilot.com';

const DEFAULT_MODEL = 'gpt-4.1';

const KNOWN_MODELS = [
  { value: 'gpt-4.1', displayName: 'GPT-4.1', description: 'Latest GPT-4.1 — fast and capable' },
  { value: 'gpt-4o', displayName: 'GPT-4o', description: 'Multimodal, fast responses' },
  { value: 'o3-mini', displayName: 'o3-mini', description: 'Reasoning model (low effort)' },
  { value: 'o4-mini', displayName: 'o4-mini', description: 'Reasoning model, fast' },
  { value: 'claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet', description: 'Via Copilot (if available)' },
];

const PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions'];

/** Maps our effort levels to OpenAI reasoning_effort values. */
const EFFORT_TO_REASONING: Record<string, 'low' | 'medium' | 'high'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'high',
};

export class CopilotBackend implements AgentBackend {
  private auth = new CopilotAuth();
  private permissionHandler: PermissionHandler | null = null;
  private initialized = false;
  private onInitCallback: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private conversation: ChatCompletionMessageParam[] = [];
  private permissionMode = 'default';

  // Usage accumulation
  private totalCostUsd = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private numTurns = 0;

  constructor(opts?: { sessionId?: string }) {
    // sessionId not used for Copilot (conversation kept in-memory)
    void opts;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  onInit(callback: () => void): void {
    this.onInitCallback = callback;
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  async setPermissionMode(mode: string): Promise<void> {
    this.permissionMode = mode;
  }

  getProviderCommands(): CommandInfo[] {
    const cache = getProviderCache('copilot');
    return [
      {
        name: 'model',
        description: 'Set model',
        argumentHint: '<name>',
        options: () => (cache?.models ?? KNOWN_MODELS).map(m => ({ value: m.value, desc: m.displayName })),
      },
      {
        name: 'mode',
        description: 'Set permission mode',
        argumentHint: '<mode>',
        options: () => PERMISSION_MODES.map(m => ({ value: m, desc: '' })),
      },
      {
        name: 'effort',
        description: 'Set reasoning effort (for reasoning models)',
        argumentHint: '<level>',
        options: () => ['low', 'medium', 'high', 'max'].map(l => ({ value: l, desc: '' })),
      },
    ];
  }

  getSlashCommands(): CommandInfo[] {
    return [];
  }

  async executeCommand(_name: string, _args: string): Promise<ProviderCommandResult | null> {
    return null;
  }

  async warmup(cwd: string): Promise<void> {
    if (getProviderCache('copilot')) {
      this.initialized = true;
      this.onInitCallback?.();
      return;
    }

    logger.info(`[copilot:warmup] starting, cwd=${cwd}`);

    try {
      await this.auth.getToken();
      setProviderCache('copilot', {
        models: KNOWN_MODELS,
        slashCommands: [],
        permissionModes: PERMISSION_MODES,
        effortLevels: ['low', 'medium', 'high', 'max'],
      });
      this.initialized = true;
      this.onInitCallback?.();
      logger.info('[copilot:warmup] initialized');
    } catch (err) {
      logger.error(`[copilot:warmup] failed: ${err instanceof Error ? err.message : String(err)}`);
      // Still mark initialized so UI doesn't wait forever
      this.initialized = true;
      this.onInitCallback?.();
    }
  }

  async *query(
    prompt: string,
    opts?: { cwd?: string; model?: string; permissionMode?: string; effort?: string; images?: string[] },
  ): AsyncGenerator<AgentMessage> {
    const cwd = opts?.cwd ?? process.cwd();
    const model = opts?.model ?? DEFAULT_MODEL;
    const effort = opts?.effort ?? 'high';
    const permissionMode = opts?.permissionMode ?? this.permissionMode;
    this.abortController = new AbortController();

    // Build user message (text + optional images)
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    if (opts?.images?.length) {
      for (const dataUrl of opts.images) {
        if (dataUrl.startsWith('data:image/')) {
          userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
        }
      }
    }
    userContent.push({ type: 'text', text: prompt || ' ' });

    this.conversation.push({
      role: 'user',
      content: userContent.length === 1 ? (userContent[0].text ?? '') : (userContent as never),
    });

    this.numTurns++;

    try {
      yield* this.agentLoop(cwd, model, effort, permissionMode);
    } finally {
      this.abortController = null;
    }
  }

  private async *agentLoop(
    cwd: string,
    model: string,
    effort: string,
    permissionMode: string,
  ): AsyncGenerator<AgentMessage> {
    const isReasoningModel = /^o[0-9]/i.test(model);

    while (true) {
      if (this.abortController?.signal.aborted) break;

      let token: string;
      try {
        token = await this.auth.getToken();
      } catch (err) {
        yield { type: 'system', content: `Copilot auth error: ${err instanceof Error ? err.message : String(err)}` };
        break;
      }

      const client = new OpenAI({
        apiKey: token,
        baseURL: COPILOT_BASE_URL,
        defaultHeaders: {
          'Copilot-Integration-Id': 'vscode-chat',
          'Editor-Version': 'agent-terminal/0.3',
        },
      });

      // Build params
      const params: Parameters<typeof client.chat.completions.create>[0] = {
        model,
        messages: this.conversation,
        tools: TOOL_SPECS,
        tool_choice: 'auto',
        stream: true,
        stream_options: { include_usage: true },
      };

      // Reasoning model specific params
      if (isReasoningModel) {
        const reasoningEffort = EFFORT_TO_REASONING[effort] ?? 'high';
        (params as unknown as Record<string, unknown>).reasoning_effort = reasoningEffort;
        delete params.tools;
        delete params.tool_choice;
      }

      let textBuffer = '';
      const toolCallBuffers: Record<number, { id: string; name: string; arguments: string }> = {};
      let finishReason: string | null = null;

      try {
        const stream = await client.chat.completions.create(params, {
          signal: this.abortController?.signal,
        }) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

        for await (const chunk of stream) {
          if (this.abortController?.signal.aborted) break;

          // Accumulate usage from final chunk
          if (chunk.usage) {
            this.totalInputTokens += chunk.usage.prompt_tokens ?? 0;
            this.totalOutputTokens += chunk.usage.completion_tokens ?? 0;
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          finishReason = choice.finish_reason ?? finishReason;
          const delta = choice.delta;

          // Thinking / reasoning content
          const reasoning = (delta as Record<string, unknown>).reasoning_content;
          if (reasoning && typeof reasoning === 'string' && reasoning.length > 0) {
            yield { type: 'thinking', content: reasoning };
          }

          // Text content
          if (delta.content) {
            textBuffer += delta.content;
            yield { type: 'text', content: delta.content };
          }

          // Tool calls accumulation
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallBuffers[idx]) {
                toolCallBuffers[idx] = { id: tc.id ?? '', name: '', arguments: '' };
              }
              if (tc.id) toolCallBuffers[idx].id = tc.id;
              if (tc.function?.name) toolCallBuffers[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallBuffers[idx].arguments += tc.function.arguments;
            }
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') break;
        yield { type: 'system', content: `Copilot API error: ${err instanceof Error ? err.message : String(err)}` };
        break;
      }

      const toolCalls = Object.values(toolCallBuffers);

      // Add assistant message to conversation
      const assistantMsg: ChatCompletionMessageParam = {
        role: 'assistant',
        content: textBuffer || null,
        ...(toolCalls.length > 0 ? {
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        } : {}),
      };
      this.conversation.push(assistantMsg);

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        yield {
          type: 'result',
          content: textBuffer,
          inputTokens: this.totalInputTokens,
          outputTokens: this.totalOutputTokens,
          costUsd: this.totalCostUsd,
        };
        break;
      }

      // Process tool calls
      const toolResults: ChatCompletionMessageParam[] = [];

      for (const tc of toolCalls) {
        const toolName = tc.name;
        let toolInput: Record<string, unknown> = {};
        const toolUseId = tc.id || `tool_${Date.now()}`;

        try {
          toolInput = JSON.parse(tc.arguments || '{}');
        } catch {
          toolInput = { raw: tc.arguments };
        }

        // Yield tool_use for UI display
        yield {
          type: 'tool_use',
          content: `${toolName}: ${JSON.stringify(toolInput)}`,
          toolName,
          toolInput,
          toolUseId,
        };

        const tool = TOOLS[toolName];
        let resultContent: string;

        if (!tool) {
          resultContent = `Unknown tool: ${toolName}`;
        } else {
          // Check permission for tools that require it
          const shouldAskPermission =
            tool.requiresPermission &&
            permissionMode !== 'bypassPermissions' &&
            permissionMode !== 'acceptEdits' &&
            this.permissionHandler;

          if (shouldAskPermission && this.permissionHandler) {
            const permResult = await this.permissionHandler({ toolName, input: toolInput });
            if (permResult.behavior === 'deny') {
              resultContent = `Permission denied: ${permResult.message ?? 'User declined.'}`;
              yield { type: 'tool_result', content: resultContent, toolUseId };
              toolResults.push({ role: 'tool', tool_call_id: toolUseId, content: resultContent });
              continue;
            }
          } else if (tool.requiresPermission && permissionMode === 'acceptEdits') {
            // acceptEdits: auto-allow file edits but ask for bash
            if (toolName === 'Bash' && this.permissionHandler) {
              const permResult = await this.permissionHandler({ toolName, input: toolInput });
              if (permResult.behavior === 'deny') {
                resultContent = `Permission denied: ${permResult.message ?? 'User declined.'}`;
                yield { type: 'tool_result', content: resultContent, toolUseId };
                toolResults.push({ role: 'tool', tool_call_id: toolUseId, content: resultContent });
                continue;
              }
            }
          }

          // Execute the tool
          try {
            resultContent = await tool.execute(toolInput, cwd);
          } catch (err) {
            resultContent = `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        yield {
          type: 'tool_result',
          content: resultContent.slice(0, 5000),
          toolUseId,
        };

        toolResults.push({
          role: 'tool',
          tool_call_id: toolUseId,
          content: resultContent.slice(0, 5000),
        });
      }

      // Add tool results to conversation and continue the loop
      this.conversation.push(...toolResults);
    }
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  getRawUsage(): RawUsageData {
    return {
      costUsd: this.totalCostUsd,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      contextUsedTokens: this.totalInputTokens + this.totalOutputTokens,
      contextWindow: 0,
      numTurns: Math.max(1, this.numTurns),
      rateLimits: [],
    };
  }
}
