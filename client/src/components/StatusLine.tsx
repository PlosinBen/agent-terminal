import type { StatusInfo } from '../hooks/useProject';
import './StatusLine.css';

interface Props {
  status: StatusInfo;
  connected: boolean;
  projectName?: string;
}

const STATUS_COLORS: Record<StatusInfo['agentStatus'], string> = {
  idle: '#abb2bf',
  running: '#e5c07b',
  attention: '#e06c75',
};

export function StatusLine({ status, connected, projectName }: Props) {
  return (
    <div className="status-line">
      <span className="status-dot" style={{ color: connected ? STATUS_COLORS[status.agentStatus] : '#555' }}>
        {'\u25CF'}{' '}
      </span>
      <span className="status-label">{connected ? status.agentStatus : 'disconnected'}</span>
      {projectName && (
        <>
          <span className="status-sep"> | </span>
          <span className="status-project">{projectName}</span>
        </>
      )}
      <span className="status-sep"> | </span>
      <span className="status-branch">{status.gitBranch}</span>

      {status.segments.map((seg, i) => (
        <span key={i}>
          <span className="status-sep"> | </span>
          {seg.label && <span className="status-seg-label">{seg.label}: </span>}
          <span style={{ color: seg.color ?? 'var(--text-secondary)' }}>{seg.value}</span>
        </span>
      ))}
    </div>
  );
}
