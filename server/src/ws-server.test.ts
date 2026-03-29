import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { WsServer } from './ws-server.js';
import { connectWs } from './__test__/ws-helpers.js';

describe('WsServer', () => {
  let server: WsServer;
  let port: number;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    server = new WsServer();
    port = await server.start(0); // ephemeral port
  });

  afterEach(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    clients.length = 0;
    server.stop();
  });

  async function connect(): Promise<WebSocket> {
    const ws = await connectWs(port);
    clients.push(ws);
    return ws;
  }

  it('accepts client connections', async () => {
    const ws = await connect();
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('receives and parses messages via onMessage handler', async () => {
    const handler = vi.fn();
    server.onMessage(handler);

    const ws = await connect();
    ws.send(JSON.stringify({ type: 'server:info', requestId: 'r1' }));

    // Wait for handler to be called
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });

    const [msg, send] = handler.mock.calls[0];
    expect(msg.type).toBe('server:info');
    expect(msg.requestId).toBe('r1');
    expect(typeof send).toBe('function');
  });

  it('sends reply back to the client via send callback', async () => {
    server.onMessage((_msg, send) => {
      send({ type: 'server:info_result', requestId: 'r1', homePath: '/home', hostname: 'test' } as any);
    });

    const ws = await connect();
    const replyPromise = new Promise<any>((resolve) => {
      ws.on('message', (raw) => resolve(JSON.parse(raw.toString())));
    });

    ws.send(JSON.stringify({ type: 'server:info', requestId: 'r1' }));
    const reply = await replyPromise;
    expect(reply.type).toBe('server:info_result');
  });

  it('broadcasts to all connected clients', async () => {
    const ws1 = await connect();
    const ws2 = await connect();

    const p1 = new Promise<any>((resolve) => {
      ws1.on('message', (raw) => resolve(JSON.parse(raw.toString())));
    });
    const p2 = new Promise<any>((resolve) => {
      ws2.on('message', (raw) => resolve(JSON.parse(raw.toString())));
    });

    server.broadcast({ type: 'agent:done', projectId: 'p1' } as any);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.type).toBe('agent:done');
    expect(r2.type).toBe('agent:done');
  });

  it('handles client disconnect gracefully', async () => {
    const ws = await connect();
    ws.close();

    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 100));

    // Broadcast should not throw
    expect(() => {
      server.broadcast({ type: 'agent:done', projectId: 'p1' } as any);
    }).not.toThrow();
  });

  it('does not crash on invalid JSON', async () => {
    server.onMessage(vi.fn());
    const ws = await connect();
    ws.send('not json');

    // Give server time to process
    await new Promise((r) => setTimeout(r, 100));

    // Server should still work
    const ws2 = await connect();
    expect(ws2.readyState).toBe(WebSocket.OPEN);
  });

  it('closes all connections on stop', async () => {
    const ws = await connect();

    const closePromise = new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
    });

    server.stop();
    await closePromise;

    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it('returns assigned port', () => {
    expect(server.getPort()).toBe(port);
    expect(port).toBeGreaterThan(0);
  });
});
