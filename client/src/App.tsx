import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useProjects } from './hooks/useProjects';
import { Sidebar, type ProjectInfo } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { PermissionPopup } from './components/PermissionPopup';

declare global {
  interface Window {
    electronAPI?: {
      getWsPort: () => Promise<number>;
      selectFolder: () => Promise<string | null>;
      getHomePath: () => Promise<string>;
    };
  }
}

let requestCounter = 0;

export function App() {
  const { connected, connect, send, onMessage } = useWebSocket();
  const { getState, addUserMessage, clearPermission, initProject, removeProject } = useProjects(onMessage);

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeRef = useRef(activeProjectId);
  activeRef.current = activeProjectId;

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

  // Create a new project
  const createProject = useCallback(async () => {
    let cwd: string | null = null;

    if (window.electronAPI) {
      cwd = await window.electronAPI.selectFolder();
      if (!cwd) {
        cwd = await window.electronAPI.getHomePath();
      }
    }

    if (!cwd) cwd = '/tmp';

    const requestId = `req_${++requestCounter}`;
    const unsub = onMessage((msg) => {
      if (msg.type === 'project:created' && msg.requestId === requestId) {
        const p: ProjectInfo = {
          id: msg.project.id,
          name: msg.project.name ?? cwd!.split('/').pop() ?? 'project',
          cwd: cwd!,
          agentStatus: 'idle',
        };
        setProjects(prev => [...prev, p]);
        setActiveProjectId(msg.project.id);
        initProject(msg.project.id);
        unsub();
      }
    });

    send({ type: 'project:create', cwd, requestId });
  }, [send, onMessage, initProject]);

  // Auto-create first project on connect
  useEffect(() => {
    if (!connected || projectsRef.current.length > 0) return;
    createProject();
  }, [connected, createProject]);

  // Sync agent status from project state back to sidebar
  useEffect(() => {
    const interval = setInterval(() => {
      setProjects(prev => {
        let changed = false;
        const next = prev.map(p => {
          const state = getState(p.id);
          if (!state) return p;
          const newStatus = state.status.agentStatus;
          if (p.agentStatus !== newStatus) {
            changed = true;
            return { ...p, agentStatus: newStatus };
          }
          return p;
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [getState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+B: toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setSidebarVisible(v => !v);
        return;
      }

      // Ctrl+O: new project
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        createProject();
        return;
      }

      // Ctrl+ArrowUp / Ctrl+ArrowDown: switch project
      if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const list = projectsRef.current;
        if (list.length < 2) return;
        const idx = list.findIndex(p => p.id === activeRef.current);
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % list.length
          : (idx - 1 + list.length) % list.length;
        setActiveProjectId(list[next].id);
        return;
      }

      // Ctrl+W: close active project
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        const pid = activeRef.current;
        if (!pid) return;
        const list = projectsRef.current;
        const idx = list.findIndex(p => p.id === pid);
        removeProject(pid);
        setProjects(prev => prev.filter(p => p.id !== pid));
        // Switch to adjacent project
        if (list.length > 1) {
          const nextIdx = Math.min(idx, list.length - 2);
          setActiveProjectId(list.filter(p => p.id !== pid)[nextIdx]?.id ?? null);
        } else {
          setActiveProjectId(null);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createProject, removeProject]);

  const activeState = getState(activeProjectId);

  const handleSubmit = useCallback((text: string) => {
    if (!activeProjectId) return;

    if (text.startsWith('/')) {
      const spaceIdx = text.indexOf(' ');
      const command = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1);
      const args = spaceIdx > 0 ? text.slice(spaceIdx + 1) : '';
      const requestId = `req_${++requestCounter}`;
      send({ type: 'agent:command', projectId: activeProjectId, command, args, requestId });
      addUserMessage(activeProjectId, text);
      return;
    }

    send({ type: 'agent:query', projectId: activeProjectId, prompt: text });
    addUserMessage(activeProjectId, text);
  }, [activeProjectId, send, addUserMessage]);

  const handleStop = useCallback(() => {
    if (activeProjectId) {
      send({ type: 'agent:stop', projectId: activeProjectId });
    }
  }, [activeProjectId, send]);

  const handlePermission = useCallback((result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => {
    if (!activeProjectId || !activeState?.permissionReq) return;
    send({
      type: 'permission:response',
      projectId: activeProjectId,
      requestId: activeState.permissionReq.requestId,
      result,
    });
    clearPermission(activeProjectId);
  }, [activeProjectId, activeState, send, clearPermission]);

  const loading = activeState?.loading ?? false;
  const messages = activeState?.messages ?? [];
  const status = activeState?.status ?? { segments: [], agentStatus: 'idle' as const, gitBranch: '-' };
  const permissionReq = activeState?.permissionReq ?? null;
  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <div className="app-layout">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        visible={sidebarVisible}
        onSelect={setActiveProjectId}
        onNew={createProject}
      />
      <div className="main-area">
        {activeProjectId ? (
          <>
            <MessageList messages={messages} loading={loading} />
            <InputArea disabled={loading} onSubmit={handleSubmit} onStop={handleStop} />
            <StatusLine status={status} connected={connected} projectName={activeProject?.name} />
            {permissionReq && (
              <PermissionPopup req={permissionReq} onRespond={handlePermission} />
            )}
          </>
        ) : (
          <div className="empty-state">
            {connected ? 'Press Ctrl+O to open a project' : 'Connecting...'}
          </div>
        )}
      </div>
    </div>
  );
}
