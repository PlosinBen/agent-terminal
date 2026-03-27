import { useState } from 'react';
import { ContextMenu } from './ContextMenu';
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
  onCloseProject?: (id: string) => void;
  onRevealInFinder?: (cwd: string) => void;
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

export function Sidebar({ projects, activeProjectId, visible, onSelect, onNew, onReorder, onCloseProject, onRevealInFinder, newProjectShortcut }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string; projectCwd: string } | null>(null);

  if (!visible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>Projects</span>
        <button className="sidebar-add-btn" onClick={onNew} title={newProjectShortcut ? `New Project (${newProjectShortcut})` : 'New Project'}>+</button>
      </div>
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
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id, projectCwd: p.cwd });
              }}
            >
              <span
                className="sidebar-status-dot"
                style={{ color: status?.color ?? 'transparent' }}
              >
                {status?.icon ?? '\u00A0'}
              </span>
              <div className="sidebar-item-text">
                <span className="sidebar-item-name">{p.name}</span>
                <span className="sidebar-item-folder" title={p.cwd}>{p.cwd.split('/').pop()}</span>
              </div>
            </div>
          );
        })}
        {projects.length === 0 && (
          <div className="sidebar-empty">No projects</div>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            ...(onRevealInFinder ? [{
              label: 'Reveal in Finder',
              onClick: () => onRevealInFinder(contextMenu.projectCwd),
            }] : []),
            {
              label: 'Close',
              onClick: () => onCloseProject?.(contextMenu.projectId),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
