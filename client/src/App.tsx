import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useService, ServiceEvent } from './service';
import type { ConnectionChangedPayload } from './service';
import { useProjects } from './hooks/useProjects';
import { Sidebar } from './components/Sidebar';
import type { ProjectInfo } from './types/project';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { PermissionPopup } from './components/PermissionPopup';
import { FolderPicker } from './components/FolderPicker';
import { Terminal } from './components/Terminal';
import { loadKeybindings, formatBinding } from './keybindings';
import { keyboard } from './services/keyboard';
import { useKeyboardScope } from './hooks/useKeyboardScope';
import { loadSavedProjects, saveSavedProjects, generateProjectId } from './projects-storage';
import { useServerStore } from './stores/server-store';
import type { ConfigUpdate } from './hooks/useProjects';

declare global {
  interface Window {
    electronAPI?: {
      revealInFinder: (path: string) => void;
    };
  }
}

const DEFAULT_SERVER_HOST = window.electronAPI ? 'localhost:9100' : location.host;

export function App() {
  const service = useService();
  const {
    servers, localHost, homePath, localConnected,
    setLocalHost, setHomePath, setLocalConnected,
    addServer, removeServer, ensureServer,
  } = useServerStore();

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

  const keybindings = useMemo(() => loadKeybindings(), []);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeRef = useRef(activeProjectId);
  activeRef.current = activeProjectId;

  // Start keyboard service once
  useEffect(() => {
    keyboard.start();
    return () => keyboard.stop();
  }, []);

  // Acquire WS connection on mount + fetch home path via server:info
  useEffect(() => {
    const host = DEFAULT_SERVER_HOST;
    setLocalHost(host);
    service.acquireConnection(host);
    ensureServer({ host, name: 'localhost' });

    if (service.isConnected(host)) {
      setLocalConnected(true);
      service.getServerInfo(host).then(info => {
        setHomePath(info.homePath);
      }).catch(() => {});
    }

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

    // Ensure we have a connection to the project's server
    service.acquireConnection(project.serverHost);

    // Mark as connecting
    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, connectionStatus: 'connecting' as const } : p
    ));

    await service.connectProject(project);

    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, connectionStatus: 'connected' as const } : p
    ));
    initProject(project.id);
  }, [service, initProject]);

  // Track connection status for all servers
  useEffect(() => {
    return service.on(ServiceEvent.ConnectionChanged, (payload) => {
      const ev = payload as ConnectionChangedPayload;

      // Track local server connected state for the empty-state UI
      if (ev.host === useServerStore.getState().localHost) {
        setLocalConnected(ev.status === 'connected');
        if (ev.status === 'connected') {
          service.getServerInfo(ev.host).then(info => {
            setHomePath(info.homePath);
          }).catch(() => {});
        }
      }

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
          setProjects(prev => prev.map(p =>
            p.id === project.id ? { ...p, connectionStatus: 'disconnected' as const } : p
          ));
          connectProject({ ...project, connectionStatus: 'disconnected' });
        }
      }
    });
  }, [service, connectProject]);

  // Create a new project from FolderPicker and immediately connect
  const createProjectWithCwd = useCallback((cwd: string, targetServerHost: string) => {
    // Check if project with same cwd + server already exists
    const existing = projectsRef.current.find(p => p.cwd === cwd && p.serverHost === targetServerHost);
    if (existing) {
      setActiveProjectId(existing.id);
      if (existing.connectionStatus === 'disconnected') connectProject(existing);
      return;
    }

    const id = generateProjectId();
    const name = cwd.split('/').pop() ?? 'project';
    const p: ProjectInfo = { id, name, cwd, serverHost: targetServerHost, agentStatus: 'idle', connectionStatus: 'disconnected' };

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
    if (!localConnected || projectsRef.current.length > 0) return;
    setShowFolderPicker(true);
  }, [localConnected]);

  // Connect the active project explicitly
  const connectActiveProject = useCallback(() => {
    if (!localConnected || !activeProjectId) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (project && project.connectionStatus === 'disconnected') {
      connectProject(project);
    }
  }, [localConnected, activeProjectId, connectProject]);

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

  // App-scope keyboard shortcuts (only active when no modal is open)
  useKeyboardScope('app', useMemo(() => ({
    [keybindings.toggleSidebar]: () => setSidebarVisible(v => !v),
    [keybindings.newProject]: () => openFolderPicker(),
    [keybindings.nextProject]: () => {
      const list = projectsRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex(p => p.id === activeRef.current);
      const id = list[(idx + 1) % list.length].id;
      setActiveProjectId(id);
    },
    [keybindings.prevProject]: () => {
      const list = projectsRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex(p => p.id === activeRef.current);
      const id = list[(idx - 1 + list.length) % list.length].id;
      setActiveProjectId(id);
    },
    [keybindings.toggleTerminal]: () => setActiveTab(t => t === 'agent' ? 'terminal' : 'agent'),
    [keybindings.closeProject]: () => {
      const pid = activeRef.current;
      if (pid) closeProject(pid);
    },
  }), [keybindings, openFolderPicker, closeProject]), { autoScope: false });

  const activeState = getState(activeProjectId);

  // Client-side config update for model/mode/effort
  const updateProjectConfig = useCallback((command: string, args: string) => {
    if (!activeProjectId) return;
    const configMap: Record<string, string> = { model: 'model', mode: 'permissionMode', effort: 'effort' };
    const key = configMap[command];
    if (!key) return;

    // Update client state
    handleConfigUpdate({ projectId: activeProjectId, [key]: args });

    // If permissionMode changed while agent is running, notify server for runtime switch
    if (key === 'permissionMode') {
      const project = projectsRef.current.find(p => p.id === activeProjectId);
      if (project?.agentStatus === 'running') {
        service.sendSetPermissionMode(project, args);
      }
    }
  }, [activeProjectId, handleConfigUpdate, service]);

  // Handle all slash commands from InputArea autocomplete or direct typing
  const handleCommand = useCallback((command: string, args: string) => {
    if (!activeProjectId) return;

    // Client-side app commands
    if (command === 'clear') {
      addUserMessage(activeProjectId, '/clear', false);
      // TODO: implement clear messages in useProjects
      return;
    }
    if (command === 'help') {
      addUserMessage(activeProjectId, '/help', false);
      return;
    }

    // Client-side config commands
    if (['model', 'mode', 'effort'].includes(command)) {
      if (args) {
        updateProjectConfig(command, args);
      }
      return;
    }

    // SDK slash commands — send as query prompt (SDK handles /command internally)
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (project) {
      const prompt = `/${command}${args ? ' ' + args : ''}`;
      service.sendQuery(project, prompt);
      addUserMessage(activeProjectId, prompt);
    }
  }, [activeProjectId, service, addUserMessage, updateProjectConfig]);

  const handleSubmit = useCallback((text: string, images?: string[]) => {
    if (!activeProjectId) return;
    const project = projectsRef.current.find(p => p.id === activeProjectId);
    if (!project) return;

    if (text.startsWith('/')) {
      const spaceIdx = text.indexOf(' ');
      const command = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1);
      const args = spaceIdx > 0 ? text.slice(spaceIdx + 1).trim() : '';
      handleCommand(command, args);
      return;
    }

    service.sendQuery(project, text, images);
    const label = images?.length ? `${text || ''} [${images.length} image${images.length > 1 ? 's' : ''}]` : text;
    addUserMessage(activeProjectId, label);
  }, [activeProjectId, service, addUserMessage, handleCommand]);

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
  const providerConfig = activeState?.providerConfig ?? null;
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
            {(activeProject.connectionStatus === 'connected' || activeProject.connectionStatus === 'reconnecting') && (
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
        {activeProjectId && (activeProject?.connectionStatus === 'connected' || activeProject?.connectionStatus === 'reconnecting') ? (
          <>
            <div className="agent-view" style={{ display: activeTab === 'agent' ? 'flex' : 'none' }}>
              <MessageList messages={messages} loading={loading} cwd={activeProject?.cwd} />
              <InputArea disabled={loading} cwd={activeProject?.cwd} providerConfig={providerConfig} onSubmit={handleSubmit} onStop={handleStop} onCommand={handleCommand} />
            </div>
            <Terminal
              project={activeProject!}
              visible={activeTab === 'terminal'}
              service={service}
            />
            <StatusLine status={status} project={activeProject} providerConfig={providerConfig} onCommand={updateProjectConfig} />
            {permissionReq && (
              <PermissionPopup req={permissionReq} onRespond={handlePermission} cwd={activeProject?.cwd} />
            )}
            {activeProject?.connectionStatus === 'reconnecting' && (
              <div className="reconnecting-overlay">Reconnecting...</div>
            )}
          </>
        ) : activeProjectId && activeProject ? (
          <div
            className="empty-state connect-prompt"
            onClick={connectActiveProject}
            onKeyDown={(e) => { if (e.key === 'Enter') connectActiveProject(); }}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            {activeProject.connectionStatus === 'connecting'
              ? <>Connecting to <strong>&nbsp;{activeProject.name}</strong>...</>
              : <>Click or press Enter to connect to <strong>&nbsp;{activeProject.name}</strong></>}
          </div>
        ) : (
          <div className="empty-state">
            {localConnected ? `Press ${formatBinding(keybindings.newProject)} to open a project` : 'Connecting...'}
          </div>
        )}
      </div>
      {showFolderPicker && (
        <FolderPicker
          service={service}
          servers={servers}
          initialServerHost={localHost}
          initialPath={homePath}
          onSelect={(folderPath, selectedHost) => {
            setShowFolderPicker(false);
            createProjectWithCwd(folderPath, selectedHost);
          }}
          onCancel={() => setShowFolderPicker(false)}
          onAddServer={addServer}
          onRemoveServer={removeServer}
        />
      )}
    </div>
  );
}
