import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { UpstreamMessage, DownstreamMessage } from './shared/protocol.js';
import { logger } from './core/logger.js';

export type MessageHandler = (msg: UpstreamMessage, send: (msg: DownstreamMessage) => void) => void;
export type ConnectHandler = (send: (msg: DownstreamMessage) => void) => void;

export class WsServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private handler: MessageHandler | null = null;
  private connectHandler: ConnectHandler | null = null;
  private port = 0;

  onMessage(handler: MessageHandler) {
    this.handler = handler;
  }

  /** Register a handler called when a new client connects */
  onConnect(handler: ConnectHandler) {
    this.connectHandler = handler;
  }

  /** Start a standalone WS server on the given port (used by Electron mode) */
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

      this.setupConnectionHandler();
    });
  }

  /** Attach WS to an existing HTTP server (used by standalone mode) */
  attachToServer(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({ server: httpServer });
    this.setupConnectionHandler();
  }

  private setupConnectionHandler(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.debug(`WS client connected (total: ${this.clients.size})`);

      // Send initial data to newly connected client
      const sendToClient = (reply: DownstreamMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(reply));
        }
      };
      this.connectHandler?.(sendToClient);

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
