import { execFileSync } from 'child_process';
import { WsServer } from './ws-server.js';
import { SessionManager } from './session-manager.js';
import { logger } from './core/logger.js';
import type { UpstreamMessage, DownstreamMessage } from './shared/protocol.js';

/** Fix PATH for GUI-launched apps on macOS */
export function fixMacOsPath(): void {
  if (process.platform !== 'darwin') return;
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const rawPath = execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
      timeout: 3000,
      encoding: 'utf8',
    }).trim();
    if (rawPath) process.env.PATH = rawPath;
  } catch {
    const extra = ['/opt/homebrew/bin', '/usr/local/bin'];
    process.env.PATH = `${extra.join(':')}:${process.env.PATH || ''}`;
  }
}

export interface ServerCore {
  wsServer: WsServer;
  sessionManager: SessionManager;
}

/** Create and wire up WsServer + SessionManager */
export function createServerCore(): ServerCore {
  const wsServer = new WsServer();
  const sessionManager = new SessionManager();

  wsServer.onMessage((msg: UpstreamMessage, send: (reply: DownstreamMessage) => void) => {
    sessionManager.handleMessage(msg, send, wsServer);
  });

  return { wsServer, sessionManager };
}

const DEFAULT_PORT = 9100;

/** Parse preferred port: --port arg > AGENT_TERMINAL_PORT env > 9100 */
export function getPreferredPort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsed = parseInt(process.argv[portArgIdx + 1], 10);
    if (parsed > 0) return parsed;
  }
  const envPort = parseInt(process.env.AGENT_TERMINAL_PORT || '', 10);
  if (envPort > 0) return envPort;
  return DEFAULT_PORT;
}

/** Graceful shutdown helper */
export function setupGracefulShutdown(core: ServerCore): void {
  const shutdown = () => {
    logger.debug('Shutting down...');
    core.sessionManager.dispose();
    core.wsServer.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
