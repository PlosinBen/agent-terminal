import { WebSocket } from 'ws';
import type { DownstreamMessage, UpstreamMessage } from '../shared/protocol.js';

/** Connect a WebSocket client to the given port, resolves when open. */
export function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Send a message and wait for a reply matching the given type. */
export function sendAndWait(
  ws: WebSocket,
  msg: UpstreamMessage,
  waitForType: string,
  timeout = 5000,
): Promise<DownstreamMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${waitForType}`)), timeout);
    const handler = (raw: WebSocket.RawData) => {
      const reply = JSON.parse(raw.toString()) as DownstreamMessage;
      if (reply.type === waitForType) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(reply);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

/** Collect all messages until one matches the given type. */
export function collectUntil(
  ws: WebSocket,
  untilType: string,
  timeout = 5000,
): Promise<DownstreamMessage[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${untilType}`)), timeout);
    const collected: DownstreamMessage[] = [];
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as DownstreamMessage;
      collected.push(msg);
      if (msg.type === untilType) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(collected);
      }
    };
    ws.on('message', handler);
  });
}
