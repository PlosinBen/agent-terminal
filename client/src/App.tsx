import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useProject } from './hooks/useProject';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { PermissionPopup } from './components/PermissionPopup';

declare global {
  interface Window {
    electronAPI?: {
      getWsPort: () => Promise<number>;
    };
  }
}

let requestCounter = 0;

export function App() {
  const { connected, connect, send, onMessage } = useWebSocket();
  const [projectId, setProjectId] = useState<string | null>(null);
  const { messages, loading, status, permissionReq, clearPermission, addUserMessage } = useProject(projectId, onMessage);

  // Connect to WS on mount
  useEffect(() => {
    const init = async () => {
      const port = window.electronAPI
        ? await window.electronAPI.getWsPort()
        : 9100;
      connect(port);
    };
    init();
  }, [connect]);

  // Create default project once connected
  useEffect(() => {
    if (!connected || projectId) return;

    const requestId = `req_${++requestCounter}`;
    const unsub = onMessage((msg) => {
      if (msg.type === 'project:created' && msg.requestId === requestId) {
        setProjectId(msg.project.id);
        unsub();
      }
    });

    // In browser, process.env is not available; server will use its own cwd
    send({ type: 'project:create', cwd: '/tmp', requestId });
  }, [connected, projectId, send, onMessage]);

  const handleSubmit = useCallback((text: string) => {
    if (!projectId) return;

    if (text.startsWith('/')) {
      const spaceIdx = text.indexOf(' ');
      const command = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1);
      const args = spaceIdx > 0 ? text.slice(spaceIdx + 1) : '';
      const requestId = `req_${++requestCounter}`;
      send({ type: 'agent:command', projectId, command, args, requestId });
      addUserMessage(text);
      return;
    }

    send({ type: 'agent:query', projectId, prompt: text });
    addUserMessage(text);
  }, [projectId, send, addUserMessage]);

  const handleStop = useCallback(() => {
    if (projectId) {
      send({ type: 'agent:stop', projectId });
    }
  }, [projectId, send]);

  const handlePermission = useCallback((result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => {
    if (!projectId || !permissionReq) return;
    send({
      type: 'permission:response',
      projectId,
      requestId: permissionReq.requestId,
      result,
    });
    clearPermission();
  }, [projectId, permissionReq, send, clearPermission]);

  return (
    <div className="app">
      <MessageList messages={messages} loading={loading} />
      <InputArea disabled={loading} onSubmit={handleSubmit} onStop={handleStop} />
      <StatusLine status={status} connected={connected} />
      {permissionReq && (
        <PermissionPopup req={permissionReq} onRespond={handlePermission} />
      )}
    </div>
  );
}
