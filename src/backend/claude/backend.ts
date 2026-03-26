import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultSuccess, SDKResultError, CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import type { AgentBackend, AgentMessage, PermissionHandler, StatusSegment } from '../types.js';

export class ClaudeBackend implements AgentBackend {
  private permissionHandler: PermissionHandler | null = null;
  private sessionId: string | undefined;
  private model = 'opus';
  private costUsd = 0;
  private inputTokens = 0;
  private outputTokens = 0;

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
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    });

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
          if (sysMsg.subtype === 'init' && sysMsg.model) {
            this.model = String(sysMsg.model);
          }
          if ('subtype' in msg) {
            yield { type: 'system', content: `[${sysMsg.subtype}]` };
          }
          break;
        }

        // Skip other message types for now (stream_event, status, etc.)
        default:
          break;
      }
    }
  }

  getStatusSegments(): StatusSegment[] {
    const tokens = `${(this.inputTokens / 1000).toFixed(0)}k+${(this.outputTokens / 1000).toFixed(0)}k`;
    return [
      { value: this.model },
      { value: tokens },
      { value: `$${this.costUsd.toFixed(3)}` },
    ];
  }

  stop(): void {
    // TODO: implement abort via SDK when available
  }
}
