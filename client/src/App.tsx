import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useService } from './service';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { StatusLine } from './components/StatusLine';
import { FolderPicker } from './components/FolderPicker';
import { Terminal } from './components/Terminal';
import { loadKeybindings, formatBinding, type KeybindingConfig } from './keybindings';
import { loadSettings, type AppSettings } from './settings';
import { SettingsPanel } from './components/SettingsPanel';
import { keyboard } from './services/keyboard';
import { useKeyboardScope } from './hooks/useKeyboardScope';
import { useServerStore } from './stores/server-store';
import { useProjectStore } from './stores/project-store';
import { rotateOldMessages } from './storage/chat-history';
import { exportMarkdown, exportJSON, downloadFile } from './utils/export';
import { SearchBar } from './components/SearchBar';

declare global {
  interface Window {
    electronAPI?: {
      revealInFinder: (path: string) => void;
    };
  }
}

const TABS = ['agent', 'terminal'] as const;
type Tab = typeof TABS[number];

function ExportMenu({ onExport }: { onExport: (format: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="export-menu" ref={ref}>
      <button className="export-menu-btn" onClick={() => setOpen(v => !v)} title="Export chat">
        Export
      </button>
      {open && (
        <div className="export-menu-dropdown">
          <button onClick={() => { onExport('md'); setOpen(false); }}>Markdown</button>
          <button onClick={() => { onExport('json'); setOpen(false); }}>JSON</button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const service = useService();
  const {
    servers, localHost, homePath, localConnected,
    addServer, removeServer,
  } = useServerStore();

  // Project store
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const setActiveProjectId = useProjectStore(s => s.setActiveProjectId);
  const activeProject = useProjectStore(s => s.activeProject());
  const activeState = useProjectStore(s => s.activeState());
  const { createProject, closeProject, reorderProjects, connectProject,
    addUserMessage, clearMessages, clearPermission, clearAgentNotify, applyConfigUpdate, loadMoreHistory } = useProjectStore.getState();

  // UI state
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('agent');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatchIndices, setSearchMatchIndices] = useState<Set<number>>(new Set());
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const [keybindings, setKeybindings] = useState<KeybindingConfig>(loadKeybindings);
  const reloadKeybindings = useCallback(() => setKeybindings(loadKeybindings()), []);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const reloadSettings = useCallback(() => setSettings(loadSettings()), []);

  // Close search when switching projects
  useEffect(() => {
    setSearchOpen(false);
    setSearchMatchIndices(new Set());
    setActiveMatchIndex(-1);
  }, [activeProjectId]);

  // Start keyboard service once
  useEffect(() => {
    keyboard.start();
    return () => keyboard.stop();
  }, []);

  // Initialize stores with service
  useEffect(() => {
    useServerStore.getState().init(service);
    useProjectStore.getState().init(service);

    // Rotate old history at startup
    const s = loadSettings();
    rotateOldMessages(s.history.rotateDays).catch(() => {});

    return () => {
      useProjectStore.getState().dispose();
      useServerStore.getState().dispose();
    };
  }, [service]);

  // Open folder picker
  const openFolderPicker = useCallback(() => {
    setShowFolderPicker(true);
  }, []);

  // Auto-open folder picker on first connect if no saved projects
  useEffect(() => {
    if (!localConnected || homePath === '/' || useProjectStore.getState().projects.length > 0) return;
    setShowFolderPicker(true);
  }, [localConnected, homePath]);

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

  const focusActiveTab = useCallback((tab?: Tab) => {
    requestAnimationFrame(() => {
      const target = tab ?? activeTab;
      if (target === 'terminal') {
        // Focus xterm terminal
        (document.querySelector('.terminal-container .xterm-helper-textarea') as HTMLElement)?.focus();
      } else {
        (document.querySelector('.input-field') as HTMLElement)?.focus();
      }
    });
  }, [activeTab]);

  const switchTab = (direction: 1 | -1) => {
    if (!isConnected()) return;
    const currentIdx = TABS.indexOf(activeTab);
    const next = TABS[(currentIdx + direction + TABS.length) % TABS.length];
    if (next === 'agent' && activeProjectId) clearAgentNotify(activeProjectId);
    setActiveTab(next);
    focusActiveTab(next);
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
    [keybindings.searchMessages]: () => setSearchOpen(true),
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

    if (command === 'export') {
      const format = args || 'md';
      const msgs = activeState?.messages ?? [];
      const name = activeProject?.name ?? 'chat';
      if (format === 'json') {
        downloadFile(exportJSON(msgs, name), `${name}-chat.json`, 'application/json');
      } else {
        downloadFile(exportMarkdown(msgs, name), `${name}-chat.md`, 'text/markdown');
      }
      return;
    }

    if (['model', 'mode', 'effort'].includes(command)) {
      if (args) {
        updateProjectConfig(command, args);
        // Show feedback: echo the command and confirm the change
        addUserMessage(activeProjectId, `/${command} ${args}`, false);
      }
      return;
    }

    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
    if (project) {
      const prompt = `/${command}${args ? ' ' + args : ''}`;
      service.sendQuery(project, prompt);
      addUserMessage(activeProjectId, prompt);
    }
  }, [activeProjectId, activeState, activeProject, service, addUserMessage, updateProjectConfig, clearMessages]);

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

  const { addAutoAllowTool } = useProjectStore();

  const handlePermission = useCallback((response: { result: { behavior: 'allow' } | { behavior: 'deny'; message: string }; alwaysAllow?: boolean }) => {
    if (!activeProjectId || !activeState?.permissionReq) return;
    const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
    if (!project) return;
    if (response.alwaysAllow) {
      addAutoAllowTool(activeProjectId, activeState.permissionReq.toolName);
    }
    service.respondPermission(project, activeState.permissionReq.requestId, response.result);
    clearPermission(activeProjectId);
  }, [activeProjectId, activeState, service, clearPermission, addAutoAllowTool]);

  // Auto-respond to permission requests for always-allowed tools
  useEffect(() => {
    if (!activeProjectId || !activeState?.permissionReq) return;
    if (activeState.autoAllowTools.has(activeState.permissionReq.toolName)) {
      const project = useProjectStore.getState().projects.find(p => p.id === activeProjectId);
      if (!project) return;
      service.respondPermission(project, activeState.permissionReq.requestId, { behavior: 'allow' });
      clearPermission(activeProjectId);
    }
  }, [activeProjectId, activeState?.permissionReq, activeState?.autoAllowTools, service, clearPermission]);

  const loading = activeState?.loading ?? false;
  const messages = activeState?.messages ?? [];
  const status = activeState?.status ?? { usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, contextUsedTokens: 0, contextWindow: 0, numTurns: 1, rateLimits: [] }, agentStatus: 'idle' as const, gitBranch: '-' };
  const permissionReq = activeState?.permissionReq ?? null;
  const providerConfig = activeState?.providerConfig ?? null;
  const tasks = activeState?.tasks ?? [];
  const agentNotify = activeState?.agentNotify ?? false;
  const showAgentBadge = activeTab !== 'agent' && (permissionReq !== null || agentNotify);

  // Focus active tab when project fully ready (connected + providerConfig arrived → UI mounted)
  const isProjectReady = activeProject?.connectionStatus === 'connected' && !!providerConfig;
  useEffect(() => {
    if (isProjectReady) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (activeTab === 'terminal') {
          (document.querySelector('.terminal-container .xterm-helper-textarea') as HTMLElement)?.focus();
        } else {
          (document.querySelector('.input-field') as HTMLElement)?.focus();
        }
      }));
    }
  }, [isProjectReady]);

  const switchToAgent = useCallback(() => {
    setActiveTab('agent');
    if (activeProjectId) clearAgentNotify(activeProjectId);
    focusActiveTab('agent');
  }, [activeProjectId, clearAgentNotify, focusActiveTab]);

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
                  onClick={switchToAgent}
                >Agent{showAgentBadge && <span className="tab-badge" />}</button>
                <button
                  className={`tab-btn${activeTab === 'terminal' ? ' active' : ''}`}
                  onClick={() => { setActiveTab('terminal'); focusActiveTab('terminal'); }}
                >Terminal</button>
                <div className="tab-bar-spacer" />
                <ExportMenu onExport={(fmt) => handleCommand('export', fmt)} />
              </>
            )}
          </div>
        )}
        {activeProjectId && (activeProject?.connectionStatus === 'connected' || activeProject?.connectionStatus === 'reconnecting') && providerConfig ? (
          <>
            <div className="agent-view" style={{ display: activeTab === 'agent' ? 'flex' : 'none' }}>
              {searchOpen && (
                <SearchBar
                  messages={messages}
                  onClose={() => {
                    setSearchOpen(false);
                    setSearchMatchIndices(new Set());
                    setActiveMatchIndex(-1);
                  }}
                  onMatchChange={(matches, currentIndex) => {
                    setSearchMatchIndices(new Set(matches));
                    setActiveMatchIndex(currentIndex);
                  }}
                  listRef={listRef}
                />
              )}
              <MessageList
                messages={messages}
                loading={loading}
                cwd={activeProject?.cwd}
                display={settings.display}
                hasMoreHistory={activeState?.hasMoreHistory}
                loadingHistory={activeState?.loadingHistory}
                onLoadMore={() => activeProjectId && loadMoreHistory(activeProjectId)}
                listRef={listRef}
                tasks={tasks}
                permissionReq={permissionReq}
                onPermissionRespond={handlePermission}
                searchMatchIndices={searchOpen ? searchMatchIndices : undefined}
                activeMatchIndex={searchOpen ? activeMatchIndex : undefined}
              />
              <InputArea disabled={loading} cwd={activeProject?.cwd} providerConfig={providerConfig} onSubmit={handleSubmit} onStop={handleStop} onCommand={handleCommand} />
            </div>
            <div style={{ display: activeTab === 'terminal' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
              {showAgentBadge && (
                <div className="agent-notify-banner" onClick={switchToAgent}>
                  {permissionReq
                    ? `Agent requires permission — ${permissionReq.toolName}`
                    : 'Agent has finished'}
                  <span className="agent-notify-banner-action">Switch to Agent →</span>
                </div>
              )}
              <Terminal
                project={activeProject!}
                visible={activeTab === 'terminal'}
                service={service}
                appearance={settings.appearance}
              />
            </div>
            <StatusLine status={status} project={activeProject} providerConfig={providerConfig} onCommand={updateProjectConfig} />
            {activeProject?.connectionStatus === 'reconnecting' && (
              <div className="reconnecting-overlay">Reconnecting...</div>
            )}
          </>
        ) : activeProjectId && activeProject && (activeProject.connectionStatus === 'connected' || activeProject.connectionStatus === 'connecting') ? (
          <div className="empty-state">
            {activeProject.connectionStatus === 'connecting'
              ? <>Connecting to <strong>&nbsp;{activeProject.name}</strong>...</>
              : <>Initializing agent...</>}
          </div>
        ) : activeProjectId && activeProject ? (
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
