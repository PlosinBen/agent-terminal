import * as pty from 'node-pty';
import type { AgentBackend, AgentMessage, PermissionHandler, StatusSegment, CommandInfo, ProviderCommandResult } from '../types.js';

export class GeminiBackend implements AgentBackend {
  private ptyProcess: pty.IPty | null = null;
  private permissionHandler: PermissionHandler | null = null;
  private initialized = false;
  private initCallback: (() => void) | null = null;

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  async *query(prompt: string, opts?: { cwd?: string }): AsyncGenerator<AgentMessage> {
    const cwd = opts?.cwd ?? process.cwd();

    yield { type: 'system', content: 'Starting Gemini CLI...' };

    try {
      const ptyProc = pty.spawn('gemini', [prompt], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env: process.env as Record<string, string>,
      });

      this.ptyProcess = ptyProc;

      if (!this.initialized) {
        this.initialized = true;
        this.initCallback?.();
      }

      const output = await new Promise<string>((resolve, reject) => {
        let buffer = '';

        ptyProc.onData((data: string) => {
          buffer += data;
        });

        ptyProc.onExit(({ exitCode }) => {
          if (exitCode === 0) {
            resolve(buffer);
          } else {
            reject(new Error(`Gemini CLI exited with code ${exitCode}`));
          }
        });
      });

      const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

      yield { type: 'result', content: clean };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      yield { type: 'system', content: `Gemini error: ${errMsg}` };
    } finally {
      this.ptyProcess = null;
    }
  }

  stop(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  getStatusSegments(): StatusSegment[] {
    return [{ value: 'gemini' }];
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getModel(): string {
    return 'gemini';
  }

  getPermissionMode(): string {
    return 'default';
  }

  getEffort(): string {
    return 'medium';
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
}
