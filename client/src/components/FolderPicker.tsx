import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AgentService } from '../service/agent-service';
import type { ServerConfig } from '../types/server';
import { ServiceEvent } from '../service/types';
import type { ConnectionChangedPayload } from '../service/types';
import { useKeyboardScope } from '../hooks/useKeyboardScope';
import { useAppStore } from '../stores/app-store';
import { PRINTABLE } from '../services/keyboard';
import { type KeybindingConfig, loadKeybindings, formatBinding } from '../keybindings';
import './FolderPicker.css';

type ServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface Props {
  service: AgentService;
  servers: ServerConfig[];
  initialServerHost: string;
  initialPath: string;
  keybindings: KeybindingConfig;
  onSelect: (path: string, serverHost: string) => void;
  onCancel: () => void;
  onAddServer: (name: string, host: string) => void;
  onRemoveServer: (host: string) => void;
}

export function FolderPicker({
  service, servers, initialServerHost, initialPath, keybindings,
  onSelect, onCancel, onAddServer, onRemoveServer,
}: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeHost, setActiveHost] = useState(initialServerHost);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addHost, setAddHost] = useState('');
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>(() => {
    const init: Record<string, ServerStatus> = {};
    for (const s of servers) {
      init[s.host] = service.isConnected(s.host) ? 'connected' : 'disconnected';
    }
    return init;
  });

  const listRef = useRef<HTMLDivElement>(null);
  const filteredRef = useRef<string[]>([]);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const activeHostRef = useRef(activeHost);
  activeHostRef.current = activeHost;

  const requestFolder = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    setFilter('');
    setSelectedIndex(0);

    service.listFolders({ host: activeHostRef.current, name: '' }, path).then((result) => {
      setCurrentPath(result.path);
      setEntries(result.entries);
      setError(result.error ?? null);
      setLoading(false);
    });
  }, [service]);

  // Track server connection statuses
  useEffect(() => {
    return service.on(ServiceEvent.ConnectionChanged, (payload) => {
      const ev = payload as ConnectionChangedPayload;
      setServerStatuses(prev => ({
        ...prev,
        [ev.host]: ev.status === 'reconnecting' ? 'connecting' : ev.status,
      }));
    });
  }, [service]);

  // Initial load
  useEffect(() => {
    requestFolder(initialPath);
  }, [initialPath, requestFolder]);

  // Filtered entries
  const filtered = filter
    ? entries.filter(name => name.toLowerCase().includes(filter.toLowerCase()))
    : entries;
  filteredRef.current = filtered;

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex + 1] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const goUp = useCallback(() => {
    const parent = currentPathRef.current.replace(/\/[^/]+\/?$/, '') || '/';
    if (parent !== currentPathRef.current) {
      requestFolder(parent);
    }
  }, [requestFolder]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // ── Scope management: switch between folder-picker and folder-picker-form ──
  const shouldBlock = showAddForm || loading;
  useEffect(() => {
    if (!shouldBlock) return;
    const { pushScope, removeScope } = useAppStore.getState();
    pushScope('folder-picker-form');
    return () => removeScope('folder-picker-form');
  }, [shouldBlock]);

  // Folder-picker scope keybindings (active when not in form/loading)
  useKeyboardScope('folder-picker', useMemo(() => ({
    [keybindings.fpUp]: () => setSelectedIndex(i => Math.max(-1, i - 1)),
    [keybindings.fpDown]: () => setSelectedIndex(i => Math.min(filteredRef.current.length - 1, i + 1)),
    [keybindings.fpEnter]: () => {
      if (selectedIndexRef.current === -1) { goUp(); return; }
      const entry = filteredRef.current[selectedIndexRef.current];
      if (entry) requestFolder(currentPathRef.current + '/' + entry);
    },
    [keybindings.fpBack]: () => goUp(),
    [keybindings.fpConfirm]: () => {
      if (selectedIndexRef.current === -1) { goUp(); return; }
      const entry = filteredRef.current[selectedIndexRef.current];
      const path = entry ? `${currentPathRef.current}/${entry}` : currentPathRef.current;
      onSelect(path, activeHostRef.current);
    },
    [keybindings.fpCancel]: () => onCancel(),
    'Backspace': () => setFilter(f => f.slice(0, -1)),
    [PRINTABLE]: (e: KeyboardEvent) => setFilter(f => f + e.key),
  }), [keybindings, requestFolder, goUp, onSelect, onCancel]));

  const switchServer = useCallback((host: string) => {
    if (host === activeHostRef.current) return;

    setActiveHost(host);
    activeHostRef.current = host;
    setLoading(true);
    setEntries([]);
    setError(null);

    if (!service.isConnected(host)) {
      setServerStatuses(prev => ({ ...prev, [host]: 'connecting' }));
    }
    service.acquireConnection(host);
    service.getServerInfo(host).then((info) => {
      requestFolder(info.homePath);
    });
  }, [service, requestFolder]);

  const handleAddServer = useCallback(() => {
    const name = addName.trim();
    const host = addHost.trim();
    if (!name || !host) return;

    onAddServer(name, host);
    setShowAddForm(false);
    setAddName('');
    setAddHost('');
    switchServer(host);
  }, [addName, addHost, onAddServer, switchServer]);

  return (
    <div className="folder-picker-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <div className="folder-picker">
        <div className="fp-header">Open Project</div>
        <div className="fp-body">
        {/* ── Left: Server List ── */}
        <div className="fp-servers">
          <div className="fp-servers-header">
            <span>Servers</span>
            <button className="fp-servers-add-btn" onClick={() => setShowAddForm(true)} title="Add Server">+</button>
          </div>
          <div className="fp-servers-list">
            {servers.map(s => {
              const status = serverStatuses[s.host] ?? 'disconnected';
              return (
                <div
                  key={s.host}
                  className={`fp-server-item${s.host === activeHost ? ' active' : ''}`}
                  onClick={() => switchServer(s.host)}
                >
                  <div className="fp-server-name">
                    <span className={`fp-server-status ${status}`} title={status} />
                    {s.name}
                  </div>
                  <div className="fp-server-host">{s.host}</div>
                  {servers.length > 1 && (
                    <button
                      className="fp-server-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveServer(s.host);
                        if (s.host === activeHost) {
                          const other = servers.find(o => o.host !== s.host);
                          if (other) switchServer(other.host);
                        }
                      }}
                      title="Remove server"
                    >{'\u00D7'}</button>
                  )}
                </div>
              );
            })}
          </div>

          {showAddForm ? (
            <div className="fp-add-form">
              <input
                className="fp-add-input"
                placeholder="Name"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddServer();
                  if (e.key === 'Escape') { setShowAddForm(false); e.stopPropagation(); }
                }}
              />
              <input
                className="fp-add-input"
                placeholder="host:port"
                value={addHost}
                onChange={e => setAddHost(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddServer();
                  if (e.key === 'Escape') { setShowAddForm(false); e.stopPropagation(); }
                }}
              />
              <div className="fp-add-actions">
                <button className="fp-add-ok" onClick={handleAddServer}>Connect</button>
                <button className="fp-add-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Right: Folder Browser ── */}
        <div className="fp-browser">
          {loading && <div className="fp-browser-loading-overlay">Loading...</div>}

          <div className="fp-browser-header">
            <div className="fp-browser-path">{filtered[selectedIndex] ? `${currentPath}/${filtered[selectedIndex]}` : currentPath}</div>
          </div>

          <div className="fp-browser-filter">
            {filter || <span className="fp-browser-filter-placeholder">Type to filter...</span>}
          </div>

          {error && <div className="fp-browser-error">{error}</div>}

          <div className="fp-browser-list" ref={listRef}>
            <div className={`folder-picker-item${selectedIndex === -1 ? ' selected' : ''}`} onClick={() => setSelectedIndex(-1)} onDoubleClick={goUp}>
              <span className="folder-picker-item-icon">{'\u2190'}</span>
              <span className="folder-picker-item-name">..</span>
            </div>

            {filtered.length === 0 ? (
              <div className="fp-browser-empty">
                {filter ? 'No matches' : 'No subdirectories'}
              </div>
            ) : (
              filtered.map((name, i) => (
                <div
                  key={name}
                  className={`folder-picker-item${i === selectedIndex ? ' selected' : ''}`}
                  onClick={() => setSelectedIndex(i)}
                  onDoubleClick={() => requestFolder(currentPath + '/' + name)}
                >
                  <span className="folder-picker-item-icon">{'\uD83D\uDCC1'}</span>
                  <span className="folder-picker-item-name">{name}</span>
                </div>
              ))
            )}
          </div>

          <div className="fp-browser-footer">
            <div className="fp-browser-hints">
              <span className="fp-hint"><kbd>{formatBinding(keybindings.fpUp)}/{formatBinding(keybindings.fpDown)}</kbd> select</span>
              <span className="fp-hint"><kbd>{formatBinding(keybindings.fpEnter)}</kbd> enter</span>
              <span className="fp-hint"><kbd>{formatBinding(keybindings.fpBack)}</kbd> up</span>
              <span className="fp-hint"><kbd>{formatBinding(keybindings.fpConfirm)}</kbd> confirm</span>
              <span className="fp-hint"><kbd>{formatBinding(keybindings.fpCancel)}</kbd> cancel</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
