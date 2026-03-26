import { useRef, useState, useEffect, useCallback } from 'react';
import type { UpstreamMessage, DownstreamMessage } from '@shared/protocol';

type MessageHandler = (msg: DownstreamMessage) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  const connect = useCallback((port: number) => {
    if (wsRef.current) return;

    const ws = new WebSocket(`ws://localhost:${port}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Auto-reconnect after 2s
      setTimeout(() => connect(port), 2000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as DownstreamMessage;
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch { /* ignore parse errors */ }
    };

    wsRef.current = ws;
  }, []);

  const send = useCallback((msg: UpstreamMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { connected, connect, send, onMessage };
}
