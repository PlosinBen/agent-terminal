import { useState } from 'react';
import { ContextMenu } from './ContextMenu';
import { getStatusDisplay } from '../utils/statusDisplay';
import { useProjectStore } from '../stores/project-store';
import './Sidebar.css';

interface Props {
  visible: boolean;
  onNew: () => void;
  onRevealInFinder?: (cwd: string) => void;
  onOpenSettings?: () => void;
  newProjectShortcut?: string;
}

export function Sidebar({ visible, onNew, onRevealInFinder, onOpenSettings, newProjectShortcut }: Props) {
  const projects = useProjectStore(s => s.projects);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const setActiveProjectId = useProjectStore(s => s.setActiveProjectId);
  const reorderProjects = useProjectStore(s => s.reorderProjects);
  const closeProject = useProjectStore(s => s.closeProject);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string; projectCwd: string } | null>(null);

  if (!visible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>Projects</span>
        <span className="sidebar-header-actions">
          <button className="sidebar-icon-btn" onClick={onOpenSettings} tabIndex={-1} title="Settings">&#9881;</button>
          <button className="sidebar-icon-btn" onClick={onNew} tabIndex={-1} title={newProjectShortcut ? `New Project (${newProjectShortcut})` : 'New Project'}>+</button>
        </span>
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
                if (dragIdx !== null && dragIdx !== i) reorderProjects(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              onClick={() => setActiveProjectId(p.id)}
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
                <span className="sidebar-item-folder" title={p.cwd}>
                  {p.cwd.split('/').pop()}
                  {p.provider && p.provider !== 'claude' && (
                    <span className="sidebar-item-provider"> ({p.provider})</span>
                  )}
                </span>
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
              onClick: () => closeProject(contextMenu.projectId),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
