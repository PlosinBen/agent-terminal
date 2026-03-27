import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useProjects } from './hooks/useProjects';
import { Sidebar, type ProjectInfo } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { PermissionPopup } from './components/PermissionPopup';
import { FolderPicker } from './components/FolderPicker';
import { loadKeybindings, matchesBinding, formatBinding } from './keybindings';

declare global {
  interface Window {
    electronAPI?: {
      getWsPort: () => Promise<number>;
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
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [homePath, setHomePath] = useState('/');

  const keybindings = useMemo(() => loadKeybindings(), []);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeRef = useRef(activeProjectId);
  activeRef.current = activeProjectId;

  // Connect to WS on mount + fetch home path
  useEffect(() => {
    const init = async () => {
      const port = window.electronAPI
        ? await window.electronAPI.getWsPort()
        : 9100;
      connect(port);

      if (window.electronAPI) {
        const home = await window.electronAPI.getHomePath();
        setHomePath(home);
      }
    };
    init();
  }, [connect]);

  // Create project with a given cwd
  const createProjectWithCwd = useCallback((cwd: string) => {
    const requestId = `req_${++requestCounter}`;
    const unsub = onMessage((msg) => {
      if (msg.type === 'project:created' && msg.requestId === requestId) {
        const p: ProjectInfo = {
          id: msg.project.id,
          name: msg.project.name ?? cwd.split('/').pop() ?? 'project',
          cwd,
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

  // Open folder picker
  const openFolderPicker = useCallback(() => {
    setShowFolderPicker(true);
  }, []);

  // Auto-open folder picker on first connect
  useEffect(() => {
    if (!connected || projectsRef.current.length > 0) return;
    setShowFolderPicker(true);
  }, [connected]);

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
      if (matchesBinding(e, keybindings.toggleSidebar)) {
        e.preventDefault();
        setSidebarVisible(v => !v);
        return;
      }

      if (matchesBinding(e, keybindings.newProject)) {
        e.preventDefault();
        openFolderPicker();
        return;
      }

      if (matchesBinding(e, keybindings.nextProject)) {
        e.preventDefault();
        const list = projectsRef.current;
        if (list.length < 2) return;
        const idx = list.findIndex(p => p.id === activeRef.current);
        setActiveProjectId(list[(idx + 1) % list.length].id);
        return;
      }

      if (matchesBinding(e, keybindings.prevProject)) {
        e.preventDefault();
        const list = projectsRef.current;
        if (list.length < 2) return;
        const idx = list.findIndex(p => p.id === activeRef.current);
        setActiveProjectId(list[(idx - 1 + list.length) % list.length].id);
        return;
      }

      if (matchesBinding(e, keybindings.closeProject)) {
        e.preventDefault();
        const pid = activeRef.current;
        if (!pid) return;
        const list = projectsRef.current;
        const idx = list.findIndex(p => p.id === pid);
        removeProject(pid);
        setProjects(prev => prev.filter(p => p.id !== pid));
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
  }, [keybindings, openFolderPicker, removeProject]);

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
        onNew={openFolderPicker}
        newProjectShortcut={formatBinding(keybindings.newProject)}
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
            {connected ? `Press ${formatBinding(keybindings.newProject)} to open a project` : 'Connecting...'}
          </div>
        )}
      </div>
      {showFolderPicker && (
        <FolderPicker
          send={send}
          onMessage={onMessage}
          initialPath={homePath}
          onSelect={(folderPath) => {
            setShowFolderPicker(false);
            createProjectWithCwd(folderPath);
          }}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}
    </div>
  );
}
