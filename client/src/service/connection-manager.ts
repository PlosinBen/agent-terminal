import type { UpstreamMessage, DownstreamMessage } from '@shared/protocol';

type MessageHandler = (msg: DownstreamMessage) => void;

interface PoolEntry {
  ws: WebSocket | null;
  refCount: number;
  handlers: Set<MessageHandler>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  statusListeners: Set<(status: 'connected' | 'reconnecting' | 'disconnected' | 'error') => void>;
  lastDelay: number;
  retryCount: number;
  pendingMessages: string[];
}

// Reconnect: lastDelay + retryCount * STEP + random jitter, capped at MAX
const RECONNECT_STEP = 1000;
const RECONNECT_JITTER = 1000;
const RECONNECT_MAX = 30000;

export class ConnectionManager {
  private pool = new Map<string, PoolEntry>();

  /** Acquire a connection to a host. Creates if needed, increments ref count. */
  acquire(host: string): void {
    const entry = this.pool.get(host);
    if (entry) {
      entry.refCount++;
      if (!entry.ws) {
        // Re-acquire after release — reconnect
        this.connect(host, entry);
      }
      return;
    }
    const newEntry: PoolEntry = {
      ws: null,
      refCount: 1,
      handlers: new Set(),
      reconnectTimer: null,
      statusListeners: new Set(),
      lastDelay: 0,
      retryCount: 0,
      pendingMessages: [],
    };
    this.pool.set(host, newEntry);
    this.connect(host, newEntry);
  }

  /** Release a connection. Decrements ref count, closes WS if 0 but keeps entry for re-acquire. */
  release(host: string): void {
    const entry = this.pool.get(host);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
      if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
        entry.reconnectTimer = null;
      }
      entry.ws?.close();
      entry.ws = null;
      // Keep entry in pool (with handlers/statusListeners) so re-acquire works
    }
  }

  /** Send a message to a specific host. Queues if not yet connected. */
  send(host: string, msg: UpstreamMessage): void {
    const entry = this.pool.get(host);
    if (!entry) return;
    const data = JSON.stringify(msg);
    if (entry.ws?.readyState === WebSocket.OPEN) {
      entry.ws.send(data);
    } else {
      entry.pendingMessages.push(data);
    }
  }

  /** Subscribe to messages from a specific host. Returns unsubscribe function. */
  onMessage(host: string, handler: MessageHandler): () => void {
    let entry = this.pool.get(host);
    if (!entry) {
      // Create entry without incrementing refCount — caller should acquire first
      entry = {
        ws: null,
        refCount: 0,
        handlers: new Set(),
        reconnectTimer: null,
        statusListeners: new Set(),
        lastDelay: 0,
        retryCount: 0,
        pendingMessages: [],
      };
      this.pool.set(host, entry);
    }
    entry.handlers.add(handler);
    return () => { entry.handlers.delete(handler); };
  }

  /** Subscribe to connection status changes for a host. */
  onStatusChange(host: string, listener: (status: 'connected' | 'reconnecting' | 'disconnected' | 'error') => void): () => void {
    const entry = this.pool.get(host);
    if (!entry) return () => {};
    entry.statusListeners.add(listener);
    return () => { entry.statusListeners.delete(listener); };
  }

  /** Check if a host connection is open. */
  isConnected(host: string): boolean {
    const entry = this.pool.get(host);
    return entry?.ws?.readyState === WebSocket.OPEN;
  }

  /** Close all connections. */
  dispose(): void {
    for (const [host, entry] of this.pool) {
      this.cleanup(host, entry);
    }
    this.pool.clear();
  }

  private connect(host: string, entry: PoolEntry): void {
    const ws = new WebSocket(`ws://${host}`);

    ws.onopen = () => {
      entry.lastDelay = 0;
      entry.retryCount = 0;
      // Flush queued messages
      for (const data of entry.pendingMessages) {
        ws.send(data);
      }
      entry.pendingMessages = [];
      for (const listener of entry.statusListeners) listener('connected');
    };

    ws.onclose = () => {
      entry.ws = null;
      if (entry.refCount > 0) {
        // Will auto-reconnect — emit reconnecting, not disconnected
        for (const listener of entry.statusListeners) listener('reconnecting');
        entry.retryCount++;
        const delay = Math.min(
          entry.lastDelay + entry.retryCount * RECONNECT_STEP + Math.random() * RECONNECT_JITTER,
          RECONNECT_MAX,
        );
        entry.lastDelay = delay;
        entry.reconnectTimer = setTimeout(() => this.connect(host, entry), delay);
      } else {
        // No refs — truly disconnected
        for (const listener of entry.statusListeners) listener('disconnected');
      }
    };

    ws.onerror = () => {
      for (const listener of entry.statusListeners) listener('error');
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as DownstreamMessage;
        for (const handler of entry.handlers) {
          handler(msg);
        }
      } catch { /* ignore parse errors */ }
    };

    entry.ws = ws;
  }

  private cleanup(_host: string, entry: PoolEntry): void {
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    entry.ws?.close();
    entry.ws = null;
    entry.handlers.clear();
    entry.statusListeners.clear();
  }
}
