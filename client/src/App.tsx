import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useService, ServiceEvent } from './service';
import type { ConnectionChangedPayload } from './service';
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

const DEFAULT_SERVER_HOST = 'localhost:9100';

export function App() {
  const service = useService();
  const [serverHost, setServerHost] = useState(DEFAULT_SERVER_HOST);
  const [connected, setConnected] = useState(false);

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
          ...(update.agentStatus !== undefined && { agentStatus: update.agentStatus }),
        };
      });
      saveSavedProjects(next.map(p => ({
        id: p.id, name: p.name, cwd: p.cwd, serverHost: p.serverHost,
        sessionId: p.sessionId, model: p.model,
        permissionMode: p.permissionMode, effort: p.effort,
      })));
      return next;
    });
  }, []);

  const { getState, addUserMessage, clearPermission, initProject, removeProject } = useProjects(service, handleConfigUpdate);

  const [projects, setProjects] = useState<ProjectInfo[]>(() => {
    return loadSavedProjects().map(p => ({
      ...p,
      serverHost: p.serverHost || DEFAULT_SERVER_HOST,
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
  const serverHostRef = useRef(serverHost);
  serverHostRef.current = serverHost;

  // Acquire WS connection on mount + fetch home path
  useEffect(() => {
    let host = DEFAULT_SERVER_HOST;
    const init = async () => {
      const port = window.electronAPI
        ? await window.electronAPI.getWsPort()
        : 9100;
      host = `localhost:${port}`;
      setServerHost(host);
      service.acquireConnection(host);

      // Check if already connected (in case onopen fired before listener was ready)
      if (service.isConnected(host)) {
        setConnected(true);
      }

      if (window.electronAPI) {
        const home = await window.electronAPI.getHomePath();
        setHomePath(home);
      }
    };
    init();
    return () => {
      service.releaseConnection(host);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist projects to localStorage whenever they change
  const persistProjects = useCallback((list: ProjectInfo[]) => {
    saveSavedProjects(list.map(p => ({
      id: p.id, name: p.name, cwd: p.cwd, serverHost: p.serverHost,
      sessionId: p.sessionId, model: p.model,
      permissionMode: p.permissionMode, effort: p.effort,
    })));
  }, []);

  // Connect a project to the server (send project:create)
  const connectProject = useCallback(async (project: ProjectInfo) => {
    if (project.connectionStatus === 'connected' || project.connectionStatus === 'connecting') return;

    // Ensure project uses the current server host
    const projectWithHost = { ...project, serverHost: serverHostRef.current };

    // Mark as connecting
    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, serverHost: serverHostRef.current, connectionStatus: 'connecting' as const } : p
    ));

    await service.connectProject(projectWithHost);

    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, connectionStatus: 'connected' as const } : p
    ));
    initProject(project.id);
  }, [service, initProject]);

  // Track connection status — use ref for host comparison to avoid race conditions
  useEffect(() => {
    return service.on(ServiceEvent.ConnectionChanged, (payload) => {
      const ev = payload as ConnectionChangedPayload;
      if (ev.host !== serverHostRef.current) return;

      setConnected(ev.status === 'connected');

      if (ev.status === 'reconnecting') {
        // Mark all projects on this server as reconnecting
        setProjects(prev => prev.map(p =>
          p.serverHost === ev.host && p.connectionStatus === 'connected'
            ? { ...p, connectionStatus: 'reconnecting' as const }
            : p
        ));
      } else if (ev.status === 'connected') {
        // Re-register projects that were reconnecting
        const toReconnect = projectsRef.current.filter(
          p => p.serverHost === ev.host && p.connectionStatus === 'reconnecting'
        );
        for (const project of toReconnect) {
          // Reset to disconnected so connectProject will proceed
          setProjects(prev => prev.map(p =>
            p.id === project.id ? { ...p, connectionStatus: 'disconnected' as const } : p
          ));
          connectProject({ ...project, connectionStatus: 'disconnected' });
        }
      }
    });
  }, [service, connectProject]);

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
    const p: ProjectInfo = { id, name, cwd, serverHost, agentStatus: 'idle', connectionStatus: 'disconnected' };

    setProjects(prev => {
      const next = [...prev, p];
      persistProjects(next);
      return next;
    });
    setActiveProjectId(id);

    // Connect immediately since user explicitly created this project
    // Use setTimeout to let state update first
    setTimeout(() => connectProject(p), 0);
  }, [connectProject, persistProjects, serverHost]);

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
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (!project) return;

    if (text.startsWith('/')) {
      const spaceIdx = text.indexOf(' ');
      const command = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1);
      const args = spaceIdx > 0 ? text.slice(spaceIdx + 1) : '';
      service.sendCommand(project, command, args);
      addUserMessage(activeProjectId, text);
      return;
    }

    service.sendQuery(project, text);
    addUserMessage(activeProjectId, text);
  }, [activeProjectId, service, addUserMessage]);

  const handleStop = useCallback(() => {
    if (!activeProjectId) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (project) service.stopAgent(project);
  }, [activeProjectId, service]);

  const handlePermission = useCallback((result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => {
    if (!activeProjectId || !activeState?.permissionReq) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (!project) return;
    service.respondPermission(project, activeState.permissionReq.requestId, result);
    clearPermission(activeProjectId);
  }, [activeProjectId, activeState, service, clearPermission]);

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
              project={activeProject!}
              visible={activeTab === 'terminal'}
              service={service}
            />
            <StatusLine status={status} project={activeProject} />
            {permissionReq && (
              <PermissionPopup req={permissionReq} onRespond={handlePermission} />
            )}
            {activeProject?.connectionStatus === 'reconnecting' && (
              <div className="reconnecting-overlay">Reconnecting...</div>
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
          service={service}
          serverHost={serverHost}
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
