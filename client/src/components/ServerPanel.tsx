import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig } from '../types/server';
import { useAppStore } from '../stores/app-store';

type ServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface Props {
  servers: ServerConfig[];
  activeHost: string;
  serverStatuses: Record<string, ServerStatus>;
  initialServerHost: string;
  onSwitchServer: (host: string) => void;
  onAddServer: (name: string, host: string) => void;
  onRemoveServer: (host: string) => void;
}

export function ServerPanel({
  servers, activeHost, serverStatuses, initialServerHost,
  onSwitchServer, onAddServer, onRemoveServer,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addHost, setAddHost] = useState('');

  // Block keyboard scope when add-server form is open
  useEffect(() => {
    if (!showAddForm) return;
    const { pushScope, removeScope } = useAppStore.getState();
    pushScope('folder-picker-form');
    return () => removeScope('folder-picker-form');
  }, [showAddForm]);

  const handleAddServer = useCallback(() => {
    const name = addName.trim();
    const host = addHost.trim();
    if (!name || !host) return;

    onAddServer(name, host);
    setShowAddForm(false);
    setAddName('');
    setAddHost('');
    onSwitchServer(host);
  }, [addName, addHost, onAddServer, onSwitchServer]);

  return (
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
              onClick={() => onSwitchServer(s.host)}
            >
              <div className="fp-server-name">
                <span className={`fp-server-status ${status}`} title={status} />
                {s.name}
              </div>
              {s.host !== initialServerHost && (
                <div className="fp-server-host">{s.host}</div>
              )}
              {servers.length > 1 && (
                <button
                  className="fp-server-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveServer(s.host);
                    if (s.host === activeHost) {
                      const other = servers.find(o => o.host !== s.host);
                      if (other) onSwitchServer(other.host);
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
  );
}

export type { ServerStatus };
