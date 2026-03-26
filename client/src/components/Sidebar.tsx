import './Sidebar.css';

export interface ProjectInfo {
  id: string;
  name: string;
  cwd: string;
  agentStatus: 'idle' | 'running' | 'attention';
}

interface Props {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  visible: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

const STATUS_COLORS = {
  idle: '#555',
  running: '#e5c07b',
  attention: '#e06c75',
};

export function Sidebar({ projects, activeProjectId, visible, onSelect, onNew }: Props) {
  if (!visible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">Projects</div>
      <div className="sidebar-list">
        {projects.map((p) => (
          <div
            key={p.id}
            className={`sidebar-item ${p.id === activeProjectId ? 'active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <span
              className="sidebar-status-dot"
              style={{ color: STATUS_COLORS[p.agentStatus] }}
            >
              {'\u25CF'}
            </span>
            <span className="sidebar-item-name" title={p.cwd}>{p.name}</span>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="sidebar-empty">No projects</div>
        )}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-new-btn" onClick={onNew}>
          + New <span className="sidebar-shortcut">Ctrl+O</span>
        </div>
      </div>
    </div>
  );
}
