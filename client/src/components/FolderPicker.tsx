import { useState, useEffect, useRef, useCallback } from 'react';
import type { UpstreamMessage, DownstreamMessage } from '@shared/protocol';
import './FolderPicker.css';

interface Props {
  send: (msg: UpstreamMessage) => void;
  onMessage: (handler: (msg: DownstreamMessage) => void) => () => void;
  initialPath: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

let reqCounter = 0;

export function FolderPicker({ send, onMessage, initialPath, onSelect, onCancel }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const requestFolder = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    setFilter('');
    setSelectedIndex(0);

    const requestId = `folder_${++reqCounter}`;
    const unsub = onMessage((msg) => {
      if (msg.type === 'folder:list_result' && msg.requestId === requestId) {
        setCurrentPath(msg.path);
        setEntries(msg.entries);
        setError(msg.error ?? null);
        setLoading(false);
        unsub();
      }
    });

    send({ type: 'folder:list', path, requestId });
  }, [send, onMessage]);

  // Initial load
  useEffect(() => {
    requestFolder(initialPath);
  }, [initialPath, requestFolder]);

  // Filtered entries — need a ref for the keydown handler
  const filtered = filter
    ? entries.filter(name => name.toLowerCase().includes(filter.toLowerCase()))
    : entries;
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // +1 because first item is ".."
    const item = list.children[selectedIndex + 1] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const goUp = useCallback(() => {
    const parent = currentPathRef.current.replace(/\/[^/]+\/?$/, '') || '/';
    if (parent !== currentPathRef.current) {
      requestFolder(parent);
    }
  }, [requestFolder]);

  // Global keydown — captures all keyboard input regardless of focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if modifier keys are held (except shift for typing)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(0, i - 1));
          break;

        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(filteredRef.current.length - 1, i + 1));
          break;

        case 'ArrowRight': {
          e.preventDefault();
          const entry = filteredRef.current[selectedIndexRef.current];
          if (entry) {
            requestFolder(currentPathRef.current + '/' + entry);
          }
          break;
        }

        case 'ArrowLeft':
          e.preventDefault();
          goUp();
          break;

        case 'Enter':
          e.preventDefault();
          onSelect(currentPathRef.current);
          break;

        case 'Escape':
          e.preventDefault();
          onCancel();
          break;

        case 'Backspace':
          e.preventDefault();
          setFilter(f => f.slice(0, -1));
          break;

        default:
          // Single printable character → append to filter
          if (e.key.length === 1) {
            e.preventDefault();
            setFilter(f => f + e.key);
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [requestFolder, goUp, onSelect, onCancel]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  return (
    <div className="folder-picker-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <div className="folder-picker">
        <div className="folder-picker-header">
          <div className="folder-picker-title">Open Project</div>
          <div className="folder-picker-path">{currentPath}</div>
        </div>

        <div className="folder-picker-filter">
          {filter || <span className="folder-picker-filter-placeholder">Type to filter...</span>}
        </div>

        {error && <div className="folder-picker-error">{error}</div>}

        <div className="folder-picker-list" ref={listRef}>
          {/* Go up item */}
          <div
            className="folder-picker-item"
            onClick={goUp}
          >
            <span className="folder-picker-item-icon">{'\u2190'}</span>
            <span className="folder-picker-item-name">..</span>
          </div>

          {loading ? (
            <div className="folder-picker-empty">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="folder-picker-empty">
              {filter ? 'No matches' : 'No subdirectories'}
            </div>
          ) : (
            filtered.map((name, i) => (
              <div
                key={name}
                className={`folder-picker-item${i === selectedIndex ? ' selected' : ''}`}
                onClick={() => requestFolder(currentPath + '/' + name)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="folder-picker-item-icon">{'\uD83D\uDCC1'}</span>
                <span className="folder-picker-item-name">{name}</span>
              </div>
            ))
          )}
        </div>

        <div className="folder-picker-footer">
          <span className="folder-picker-hint"><kbd>{'\u2191\u2193'}</kbd> select</span>
          <span className="folder-picker-hint"><kbd>{'\u2192'}</kbd> enter</span>
          <span className="folder-picker-hint"><kbd>{'\u2190'}</kbd> up</span>
          <span className="folder-picker-hint"><kbd>Enter</kbd> confirm</span>
          <span className="folder-picker-hint"><kbd>Esc</kbd> cancel</span>
        </div>
      </div>
    </div>
  );
}
