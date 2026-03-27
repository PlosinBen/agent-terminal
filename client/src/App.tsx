import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useProjects } from './hooks/useProjects';
import { Sidebar, type ProjectInfo } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { PermissionPopup } from './components/PermissionPopup';
import { FolderPicker } from './components/FolderPicker';
import { Terminal } from './components/Terminal';
import { loadKeybindings, matchesBinding, formatBinding } from './keybindings';
import { loadSavedProjects, saveSavedProjects, generateProjectId } from './projects-storage';
import type { ConfigUpdate } from './hooks/useProjects';

declare global {
  interface Window {
    electronAPI?: {
      getWsPort: () => Promise<number>;
      getHomePath: () => Promise<string>;
      revealInFinder: (path: string) => void;
    };
  }
}

let requestCounter = 0;

export function App() {
  const { connected, connect, send, onMessage } = useWebSocket();
  const handleConfigUpdate = useCallback((update: ConfigUpdate) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== update.projectId) return p;
        return {
          ...p,
          ...(update.sessionId !== undefined && { sessionId: update.sessionId }),
          ...(update.model !== undefined && { model: update.model }),
          ...(update.permissionMode !== undefined && { permissionMode: update.permissionMode }),
          ...(update.effort !== undefined && { effort: update.effort }),
        };
      });
      saveSavedProjects(next.map(p => ({ id: p.id, name: p.name, cwd: p.cwd, sessionId: p.sessionId, model: p.model, permissionMode: p.permissionMode, effort: p.effort })));
      return next;
    });
  }, []);

  const { getState, addUserMessage, clearPermission, initProject, removeProject } = useProjects(onMessage, handleConfigUpdate);

  const [projects, setProjects] = useState<ProjectInfo[]>(() => {
    return loadSavedProjects().map(p => ({
      ...p,
      agentStatus: 'idle' as const,
      connectionStatus: 'disconnected' as const,
    }));
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'agent' | 'terminal'>('agent');
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

  // Persist projects to localStorage whenever they change
  const persistProjects = useCallback((list: ProjectInfo[]) => {
    saveSavedProjects(list.map(p => ({
      id: p.id, name: p.name, cwd: p.cwd,
      sessionId: p.sessionId, model: p.model,
      permissionMode: p.permissionMode, effort: p.effort,
    })));
  }, []);

  // Connect a project to the server (send project:create)
  const connectProject = useCallback((project: ProjectInfo) => {
    if (project.connectionStatus === 'connected' || project.connectionStatus === 'connecting') return;

    // Mark as connecting
    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, connectionStatus: 'connecting' as const } : p
    ));

    const requestId = `req_${++requestCounter}`;
    const unsub = onMessage((msg) => {
      if (msg.type === 'project:created' && msg.requestId === requestId) {
        setProjects(prev => prev.map(p =>
          p.id === project.id ? { ...p, connectionStatus: 'connected' as const } : p
        ));
        initProject(project.id);
        unsub();
      }
    });

    send({
      type: 'project:create', id: project.id, cwd: project.cwd, requestId,
      sessionId: project.sessionId, model: project.model,
      permissionMode: project.permissionMode, effort: project.effort,
    });
  }, [send, onMessage, initProject]);

  // Create a new project from FolderPicker and immediately connect
  const createProjectWithCwd = useCallback((cwd: string) => {
    // Check if project with same cwd already exists
    const existing = projectsRef.current.find(p => p.cwd === cwd);
    if (existing) {
      setActiveProjectId(existing.id);
      if (existing.connectionStatus === 'disconnected') connectProject(existing);
      return;
    }

    const id = generateProjectId();
    const name = cwd.split('/').pop() ?? 'project';
    const p: ProjectInfo = { id, name, cwd, agentStatus: 'idle', connectionStatus: 'disconnected' };

    setProjects(prev => {
      const next = [...prev, p];
      persistProjects(next);
      return next;
    });
    setActiveProjectId(id);

    // Connect immediately since user explicitly created this project
    // Use setTimeout to let state update first
    setTimeout(() => connectProject(p), 0);
  }, [connectProject, persistProjects]);

  // Open folder picker
  const openFolderPicker = useCallback(() => {
    setShowFolderPicker(true);
  }, []);

  // Auto-open folder picker on first connect if no saved projects
  useEffect(() => {
    if (!connected || projectsRef.current.length > 0) return;
    setShowFolderPicker(true);
  }, [connected]);

  // Connect the active project explicitly
  const connectActiveProject = useCallback(() => {
    if (!connected || !activeProjectId) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (project && project.connectionStatus === 'disconnected') {
      connectProject(project);
    }
  }, [connected, activeProjectId, connectProject]);

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

  const closeProject = useCallback((targetId: string) => {
    const list = projectsRef.current;
    const idx = list.findIndex(p => p.id === targetId);
    removeProject(targetId);
    const next = list.filter(p => p.id !== targetId);
    setProjects(next);
    persistProjects(next);
    if (next.length > 0) {
      if (activeRef.current === targetId) {
        const nextIdx = Math.min(idx, next.length - 1);
        setActiveProjectId(next[nextIdx]?.id ?? null);
      }
    } else {
      setActiveProjectId(null);
    }
  }, [removeProject, persistProjects]);

  const revealInFinder = useCallback((cwd: string) => {
    window.electronAPI?.revealInFinder(cwd);
  }, []);

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

      if (matchesBinding(e, keybindings.toggleTerminal)) {
        e.preventDefault();
        setActiveTab(t => t === 'agent' ? 'terminal' : 'agent');
        return;
      }

      if (matchesBinding(e, keybindings.closeProject)) {
        e.preventDefault();
        const pid = activeRef.current;
        if (pid) closeProject(pid);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keybindings, openFolderPicker, closeProject]);

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

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setProjects(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persistProjects(next);
      return next;
    });
  }, [persistProjects]);

  return (
    <div className="app-layout">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        visible={sidebarVisible}
        onSelect={setActiveProjectId}
        onNew={openFolderPicker}
        onReorder={handleReorder}
        onCloseProject={closeProject}
        onRevealInFinder={window.electronAPI ? revealInFinder : undefined}
        newProjectShortcut={formatBinding(keybindings.newProject)}
      />
      <div className="main-area">
        {activeProject && (
          <div className="tab-bar">
            <span className="tab-bar-project-name">{activeProject.name}</span>
            {activeProject.connectionStatus !== 'disconnected' && (
              <>
                <button
                  className={`tab-btn${activeTab === 'agent' ? ' active' : ''}`}
                  onClick={() => setActiveTab('agent')}
                >Agent</button>
                <button
                  className={`tab-btn${activeTab === 'terminal' ? ' active' : ''}`}
                  onClick={() => setActiveTab('terminal')}
                >Terminal</button>
              </>
            )}
          </div>
        )}
        {activeProjectId && activeProject?.connectionStatus !== 'disconnected' ? (
          <>
            <div className="agent-view" style={{ display: activeTab === 'agent' ? 'flex' : 'none' }}>
              <MessageList messages={messages} loading={loading} />
              <InputArea disabled={loading} onSubmit={handleSubmit} onStop={handleStop} />
            </div>
            <Terminal
              projectId={activeProjectId}
              visible={activeTab === 'terminal'}
              connected={activeProject?.connectionStatus === 'connected'}
              send={send}
              onMessage={onMessage}
            />
            <StatusLine status={status} connected={connected} projectName={activeProject?.name} />
            {permissionReq && (
              <PermissionPopup req={permissionReq} onRespond={handlePermission} />
            )}
          </>
        ) : activeProjectId && activeProject?.connectionStatus === 'disconnected' ? (
          <div
            className="empty-state connect-prompt"
            onClick={connectActiveProject}
            onKeyDown={(e) => { if (e.key === 'Enter') connectActiveProject(); }}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            Click or press Enter to connect to <strong>&nbsp;{activeProject.name}</strong>
          </div>
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
