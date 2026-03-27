import { useRef, useState } from 'react';
import './Sidebar.css';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ProjectInfo {
  id: string;
  name: string;
  cwd: string;
  agentStatus: 'idle' | 'running' | 'attention';
  connectionStatus: ConnectionStatus;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
}

interface Props {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  visible: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  newProjectShortcut?: string;
}

function getStatusDisplay(p: ProjectInfo): { icon: string; color: string } | null {
  if (p.connectionStatus === 'error') return { icon: '\u2715', color: '#e06c75' };  // ✕ red
  if (p.connectionStatus !== 'connected') return { icon: '\u25CB', color: '#555' }; // ○ gray
  switch (p.agentStatus) {
    case 'idle':      return { icon: '\u25CF', color: '#98c379' }; // ● green
    case 'running':   return { icon: '\u25CF', color: '#e5c07b' }; // ● yellow
    case 'attention': return { icon: '?',      color: '#e06c75' }; // ? red
  }
}

export function Sidebar({ projects, activeProjectId, visible, onSelect, onNew, onReorder, newProjectShortcut }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  if (!visible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">Projects</div>
      <div className="sidebar-list">
        {projects.map((p, i) => {
          const status = getStatusDisplay(p);
          return (
            <div
              key={p.id}
              className={
                'sidebar-item'
                + (p.id === activeProjectId ? ' active' : '')
                + (dragIdx === i ? ' dragging' : '')
                + (overIdx === i && dragIdx !== i ? ' drag-over' : '')
              }
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              onClick={() => onSelect(p.id)}
            >
              <span
                className="sidebar-status-dot"
                style={{ color: status?.color ?? 'transparent' }}
              >
                {status?.icon ?? '\u00A0'}
              </span>
              <span className="sidebar-item-name" title={p.cwd}>{p.name}</span>
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="sidebar-empty">No projects</div>
        )}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-new-btn" onClick={onNew}>
          + New {newProjectShortcut && <span className="sidebar-shortcut">{newProjectShortcut}</span>}
        </div>
      </div>
    </div>
  );
}
