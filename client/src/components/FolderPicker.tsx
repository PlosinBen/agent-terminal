import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AgentService } from '../service/agent-service';
import type { ServerConfig } from '../types/server';
import { ServiceEvent } from '../service/types';
import type { ConnectionChangedPayload } from '../service/types';
import { useKeyboardScope } from '../hooks/useKeyboardScope';
import { useAppStore } from '../stores/app-store';
import { PRINTABLE } from '../services/keyboard';
import { type KeybindingConfig } from '../keybindings';
import { ServerPanel, type ServerStatus } from './ServerPanel';
import { FolderBrowser } from './FolderBrowser';
import './FolderPicker.css';

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
  // ── Browser state ──
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Server state ──
  const [activeHost, setActiveHost] = useState(initialServerHost);
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>(() => {
    const init: Record<string, ServerStatus> = {};
    for (const s of servers) {
      init[s.host] = service.isConnected(s.host) ? 'connected' : 'disconnected';
    }
    return init;
  });

  // ── Refs for keyboard callbacks (avoid stale closures) ──
  const listRef = useRef<HTMLDivElement>(null);
  const filteredRef = useRef<string[]>([]);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;
  const activeHostRef = useRef(activeHost);
  activeHostRef.current = activeHost;
  const requestSeqRef = useRef(0);
  const serversRef = useRef(servers);
  serversRef.current = servers;

  // ── Folder loading ──
  const requestFolder = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    setFilter('');
    setSelectedIndex(0);

    const seq = ++requestSeqRef.current;
    const maxRetries = 2;

    const attempt = (retry: number) => {
      const timeoutId = setTimeout(() => {
        if (requestSeqRef.current === seq && retry < maxRetries) {
          attempt(retry + 1);
        }
      }, 3000);

      service.listFolders({ host: activeHostRef.current, name: '' }, path).then((result) => {
        clearTimeout(timeoutId);
        if (requestSeqRef.current !== seq) return;
        setCurrentPath(result.path);
        setEntries(result.entries);
        setError(result.error ?? null);
        setLoading(false);
      }).catch(() => {
        clearTimeout(timeoutId);
        if (requestSeqRef.current !== seq) return;
        if (retry < maxRetries) {
          attempt(retry + 1);
        } else {
          setError('Failed to list folders');
          setLoading(false);
        }
      });
    };

    attempt(0);
  }, [service]);

  // ── Track server connection statuses ──
  useEffect(() => {
    return service.on(ServiceEvent.ConnectionChanged, (payload) => {
      const ev = payload as ConnectionChangedPayload;
      setServerStatuses(prev => ({
        ...prev,
        [ev.host]: ev.status === 'reconnecting' ? 'connecting' : ev.status,
      }));
    });
  }, [service]);

  // ── Initial load ──
  useEffect(() => {
    requestFolder(initialPath);
  }, [initialPath, requestFolder]);

  // ── Filtered entries ──
  const filtered = filter
    ? entries.filter(name => name.toLowerCase().includes(filter.toLowerCase()))
    : entries;
  filteredRef.current = filtered;

  // ── Scroll selected item into view ──
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

  // ── Reset selection when filter changes ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // ── Scope management: block keyboard when form/loading is active ──
  useEffect(() => {
    if (!loading) return;
    const { pushScope, removeScope } = useAppStore.getState();
    pushScope('folder-picker-form');
    return () => removeScope('folder-picker-form');
  }, [loading]);

  // ── Server switching ──
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

  const cycleServer = useCallback((direction: 1 | -1) => {
    const list = serversRef.current;
    if (list.length <= 1) return;
    const idx = list.findIndex(s => s.host === activeHostRef.current);
    const next = (idx + direction + list.length) % list.length;
    switchServer(list[next].host);
  }, [switchServer]);

  // ── Keyboard scope ──
  useKeyboardScope('folder-picker', useMemo(() => ({
    'ArrowUp': () => setSelectedIndex(i => Math.max(-1, i - 1)),
    'ArrowDown': () => setSelectedIndex(i => Math.min(filteredRef.current.length - 1, i + 1)),
    'ArrowRight': () => {
      if (selectedIndexRef.current === -1) { goUp(); return; }
      const entry = filteredRef.current[selectedIndexRef.current];
      if (entry) requestFolder(currentPathRef.current + '/' + entry);
    },
    'ArrowLeft': () => goUp(),
    'Enter': () => {
      if (selectedIndexRef.current === -1) { goUp(); return; }
      const entry = filteredRef.current[selectedIndexRef.current];
      const path = entry ? `${currentPathRef.current}/${entry}` : currentPathRef.current;
      onSelect(path, activeHostRef.current);
    },
    'Escape': () => onCancel(),
    [keybindings.fpNextServer]: () => cycleServer(1),
    [keybindings.fpPrevServer]: () => cycleServer(-1),
    'Backspace': () => setFilter(f => f.slice(0, -1)),
    [PRINTABLE]: (e: KeyboardEvent) => setFilter(f => f + e.key),
  }), [keybindings, requestFolder, goUp, onSelect, onCancel, cycleServer]));

  // ── Render ──
  return (
    <div className="folder-picker-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <div className="folder-picker">
        <div className="fp-header">Open Project</div>
        <div className="fp-body">
          <ServerPanel
            servers={servers}
            activeHost={activeHost}
            serverStatuses={serverStatuses}
            initialServerHost={initialServerHost}
            onSwitchServer={switchServer}
            onAddServer={onAddServer}
            onRemoveServer={onRemoveServer}
          />
          <FolderBrowser
            currentPath={currentPath}
            filtered={filtered}
            selectedIndex={selectedIndex}
            filter={filter}
            loading={loading}
            error={error}
            listRef={listRef}
            onSelectIndex={setSelectedIndex}
            onNavigate={requestFolder}
            onGoUp={goUp}
          />
        </div>
      </div>
    </div>
  );
}
