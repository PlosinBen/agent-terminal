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

  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Focus filter input on mount
  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  // Filtered entries
  const filtered = filter
    ? entries.filter(name => name.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // +1 because first item is ".."
    const item = list.children[selectedIndex + 1] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i - 1));
        break;

      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(filtered.length - 1, i + 1));
        break;

      case 'ArrowRight': {
        e.preventDefault();
        const entry = filtered[selectedIndex];
        if (entry) {
          requestFolder(currentPath + '/' + entry);
        }
        break;
      }

      case 'ArrowLeft':
        e.preventDefault();
        goUp();
        break;

      case 'Enter':
        e.preventDefault();
        onSelect(currentPath);
        break;

      case 'Escape':
        e.preventDefault();
        onCancel();
        break;
    }
  };

  const goUp = () => {
    const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
    if (parent !== currentPath) {
      requestFolder(parent);
    }
  };

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  return (
    <div className="folder-picker-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <div className="folder-picker" onKeyDown={handleKeyDown}>
        <div className="folder-picker-header">
          <div className="folder-picker-title">Open Project</div>
          <div className="folder-picker-path">{currentPath}</div>
        </div>

        <input
          ref={filterRef}
          className="folder-picker-filter"
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />

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
