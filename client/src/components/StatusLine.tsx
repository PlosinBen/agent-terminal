import type { StatusInfo } from '../types/message';
import type { ProjectInfo } from '../types/project';
import { getStatusDisplay } from '../utils/statusDisplay';
import './StatusLine.css';

interface Props {
  status: StatusInfo;
  project?: ProjectInfo;
}

export function StatusLine({ status, project }: Props) {
  const display = getStatusDisplay({
    agentStatus: status.agentStatus,
    connectionStatus: project?.connectionStatus ?? 'disconnected',
  });

  return (
    <div className="status-line">
      <span className="status-dot" style={{ color: display.color }}>
        {display.icon}
      </span>
      <span className="status-label">{display.label}</span>
      <span className="status-sep">|</span>
      <span className="status-branch">{status.gitBranch}</span>

      {status.segments.map((seg, i) => (
        <span key={i} className="status-segment">
          <span className="status-sep">|</span>
          {seg.label && <span className="status-seg-label">{seg.label}: </span>}
          <span style={{ color: seg.color ?? 'var(--text-secondary)' }}>{seg.value}</span>
        </span>
      ))}
    </div>
  );
}
