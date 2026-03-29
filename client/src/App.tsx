import { useState, useEffect, useCallback, useMemo } from 'react';
import { useService } from './service';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { PermissionPopup } from './components/PermissionPopup';
import { FolderPicker } from './components/FolderPicker';
import { Terminal } from './components/Terminal';
import { loadKeybindings, formatBinding, type KeybindingConfig } from './keybindings';
import { loadSettings, type AppSettings } from './settings';
import { SettingsPanel } from './components/SettingsPanel';
import { keyboard } from './services/keyboard';
import { useKeyboardScope } from './hooks/useKeyboardScope';
import { useServerStore } from './stores/server-store';
import { useProjectStore } from './stores/project-store';

declare global {
  interface Window {
    electronAPI?: {
      revealInFinder: (path: string) => void;
    };
  }
}

const DEFAULT_SERVER_HOST = window.electronAPI ? 'localhost:9100' : location.host;
const TABS = ['agent', 'terminal'] as const;
type Tab = typeof TABS[number];

export function App() {
  const service = useService();
  const {
    servers, localHost, homePath, localConnected,
    setLocalHost, setHomePath, setLocalConnected,
    addServer, removeServer, ensureServer,
  } = useServerStore();

  // Project store
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const setActiveProjectId = useProjectStore(s => s.setActiveProjectId);
  const activeProject = useProjectStore(s => s.activeProject());
  const activeState = useProjectStore(s => s.activeState());
  const { createProject, closeProject, reorderProjects, connectProject,
    addUserMessage, clearMessages, clearPermission, applyConfigUpdate } = useProjectStore.getState();

  // UI state
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('agent');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [keybindings, setKeybindings] = useState<KeybindingConfig>(loadKeybindings);
  const reloadKeybindings = useCallback(() => setKeybindings(loadKeybindings()), []);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const reloadSettings = useCallback(() => setSettings(loadSettings()), []);

  // Start keyboard service once
  useEffect(() => {
    keyboard.start();
    return () => keyboard.stop();
  }, []);

  // Initialize project store with service
  useEffect(() => {
    useProjectStore.getState().init(service);
    return () => useProjectStore.getState().dispose();
  }, [service]);

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

  // Open folder picker
  const openFolderPicker = useCallback(() => {
    setShowFolderPicker(true);
  }, []);

  // Auto-open folder picker on first connect if no saved projects
  useEffect(() => {
    if (!localConnected || useProjectStore.getState().projects.length > 0) return;
    setShowFolderPicker(true);
  }, [localConnected]);

  // Connect the active project explicitly
  const connectActiveProject = useCallback(() => {
    if (!localConnected || !activeProjectId) return;
    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
    if (project && project.connectionStatus === 'disconnected') {
      connectProject(project);
    }
  }, [localConnected, activeProjectId, connectProject]);

  const revealInFinder = useCallback((cwd: string) => {
    window.electronAPI?.revealInFinder(cwd);
  }, []);

  const isConnected = () => {
    const s = useProjectStore.getState();
    const p = s.projects.find(p => p.id === s.activeProjectId);
    return p?.connectionStatus === 'connected' || p?.connectionStatus === 'reconnecting';
  };

  const switchTab = (direction: 1 | -1) => {
    if (!isConnected()) return;
    setActiveTab(t => {
      const idx = TABS.indexOf(t);
      return TABS[(idx + direction + TABS.length) % TABS.length];
    });
  };

  // App-scope keyboard shortcuts (only active when no modal is open)
  useKeyboardScope('app', useMemo(() => ({
    [keybindings.toggleSidebar]: () => setSidebarVisible(v => !v),
    [keybindings.newProject]: () => openFolderPicker(),
    [keybindings.nextProject]: () => {
      const { projects: list, activeProjectId: curId } = useProjectStore.getState();
      if (list.length === 0) return;
      const idx = list.findIndex(p => p.id === curId);
      setActiveProjectId(list[(idx + 1) % list.length].id);
    },
    [keybindings.prevProject]: () => {
      const { projects: list, activeProjectId: curId } = useProjectStore.getState();
      if (list.length === 0) return;
      const idx = list.findIndex(p => p.id === curId);
      setActiveProjectId(list[(idx - 1 + list.length) % list.length].id);
    },
    [keybindings.toggleTerminal]: () => switchTab(1),
    [keybindings.nextTab]: () => switchTab(1),
    [keybindings.prevTab]: () => switchTab(-1),
    [keybindings.closeProject]: () => {
      const pid = useProjectStore.getState().activeProjectId;
      if (pid) closeProject(pid);
    },
  }), [keybindings, openFolderPicker, closeProject, setActiveProjectId]), { autoScope: false });

  // Client-side config update for model/mode/effort
  const updateProjectConfig = useCallback((command: string, args: string) => {
    if (!activeProjectId) return;
    const configMap: Record<string, string> = { model: 'model', mode: 'permissionMode', effort: 'effort' };
    const key = configMap[command];
    if (!key) return;

    applyConfigUpdate({ projectId: activeProjectId, [key]: args });

    // If permissionMode changed while agent is running, notify server for runtime switch
    if (key === 'permissionMode') {
      const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
      if (project?.agentStatus === 'running') {
        service.sendSetPermissionMode(project, args);
      }
    }
  }, [activeProjectId, applyConfigUpdate, service]);

  // Handle all slash commands from InputArea autocomplete or direct typing
  const handleCommand = useCallback((command: string, args: string) => {
    if (!activeProjectId) return;

    if (command === 'clear') {
      clearMessages(activeProjectId);
      return;
    }

    if (['model', 'mode', 'effort'].includes(command)) {
      if (args) updateProjectConfig(command, args);
      return;
    }

    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
    if (project) {
      const prompt = `/${command}${args ? ' ' + args : ''}`;
      service.sendQuery(project, prompt);
      addUserMessage(activeProjectId, prompt);
    }
  }, [activeProjectId, service, addUserMessage, updateProjectConfig, clearMessages]);

  const handleSubmit = useCallback((text: string, images?: string[]) => {
    if (!activeProjectId) return;
    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
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
    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
    if (project) service.stopAgent(project);
  }, [activeProjectId, service]);

  const handlePermission = useCallback((result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => {
    if (!activeProjectId || !activeState?.permissionReq) return;
    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
    if (!project) return;
    service.respondPermission(project, activeState.permissionReq.requestId, result);
    clearPermission(activeProjectId);
  }, [activeProjectId, activeState, service, clearPermission]);

  const loading = activeState?.loading ?? false;
  const messages = activeState?.messages ?? [];
  const status = activeState?.status ?? { segments: [], agentStatus: 'idle' as const, gitBranch: '-' };
  const permissionReq = activeState?.permissionReq ?? null;
  const providerConfig = activeState?.providerConfig ?? null;

  return (
    <div className="app-layout">
      <Sidebar
        visible={sidebarVisible}
        onNew={openFolderPicker}
        onRevealInFinder={window.electronAPI ? revealInFinder : undefined}
        onOpenSettings={() => setShowSettings(true)}
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
              <MessageList messages={messages} loading={loading} cwd={activeProject?.cwd} display={settings.display} />
              <InputArea disabled={loading} cwd={activeProject?.cwd} providerConfig={providerConfig} onSubmit={handleSubmit} onStop={handleStop} onCommand={handleCommand} />
            </div>
            <Terminal
              project={activeProject!}
              visible={activeTab === 'terminal'}
              service={service}
              appearance={settings.appearance}
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
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onKeybindingsChanged={reloadKeybindings}
          onSettingsChanged={reloadSettings}
        />
      )}
      {showFolderPicker && (
        <FolderPicker
          service={service}
          servers={servers}
          initialServerHost={localHost}
          initialPath={homePath}
          keybindings={keybindings}
          onSelect={(folderPath, selectedHost) => {
            setShowFolderPicker(false);
            createProject(folderPath, selectedHost);
          }}
          onCancel={() => setShowFolderPicker(false)}
          onAddServer={addServer}
          onRemoveServer={removeServer}
        />
      )}
    </div>
  );
}
