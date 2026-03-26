import { WebSocketServer, WebSocket } from 'ws';
import type { UpstreamMessage, DownstreamMessage } from './shared/protocol.js';
import { logger } from './core/logger.js';

export type MessageHandler = (msg: UpstreamMessage, send: (msg: DownstreamMessage) => void) => void;

export class WsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private handler: MessageHandler | null = null;
  private port = 0;

  onMessage(handler: MessageHandler) {
    this.handler = handler;
  }

  start(preferredPort = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: preferredPort });

      this.wss.on('listening', () => {
        const addr = this.wss!.address();
        this.port = typeof addr === 'object' && addr ? addr.port : 0;
        logger.debug(`WS server listening on port ${this.port}`);
        resolve(this.port);
      });

      this.wss.on('error', (err) => {
        logger.error(`WS server error: ${err.message}`);
        reject(err);
      });

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        logger.debug(`WS client connected (total: ${this.clients.size})`);

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as UpstreamMessage;
            this.handler?.(msg, (reply) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(reply));
              }
            });
          } catch (err) {
            logger.error(`WS parse error: ${err}`);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          logger.debug(`WS client disconnected (total: ${this.clients.size})`);
        });
      });
    });
  }

  /** Broadcast a message to all connected clients */
  broadcast(msg: DownstreamMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  getPort(): number {
    return this.port;
  }

  stop() {
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }
}
