import type { StatusInfo, ProviderConfig } from '../types/message';
import type { ProjectInfo } from '../types/project';
import { getStatusDisplay } from '../utils/statusDisplay';
import './StatusLine.css';

interface Props {
  status: StatusInfo;
  project?: ProjectInfo;
  providerConfig?: ProviderConfig | null;
  onCommand?: (command: string, args: string) => void;
}

const PERMISSION_MODE_DISPLAY: Record<string, { label: string; color?: string }> = {
  default: { label: 'Prompt', color: '#ffffff' },
  acceptEdits: { label: 'AcceptEdits', color: '#e5c07b' },
  bypassPermissions: { label: 'BypassPermissions', color: '#e06c75' },
  plan: { label: 'Plan', color: '#56b6c2' },
  dontAsk: { label: 'AutoDeny' },
};

function getOptions(id: string, config: ProviderConfig): string[] {
  if (id === 'model') return config.models.map(m => m.value);
  if (id === 'permissionMode') return config.permissionModes;
  if (id === 'effort') return config.effortLevels;
  return [];
}

export function StatusLine({ status, project, providerConfig, onCommand }: Props) {
  const display = getStatusDisplay({
    agentStatus: status.agentStatus,
    connectionStatus: project?.connectionStatus ?? 'disconnected',
  });

  const handleCycle = (id: string, command: string, currentValue: string) => {
    if (!providerConfig || !onCommand) return;
    const options = getOptions(id, providerConfig);
    if (options.length === 0) return;
    const currentIdx = options.indexOf(currentValue);
    const nextIdx = (currentIdx + 1) % options.length;
    onCommand(command, options[nextIdx]);
  };

  const isInteractive = !!(providerConfig && onCommand);
  const currentModel = project?.model ?? 'opus';
  const currentMode = project?.permissionMode ?? 'default';
  const currentEffort = project?.effort ?? 'high';
  const modeDisplay = PERMISSION_MODE_DISPLAY[currentMode];

  return (
    <div className="status-line">
      <span className="status-dot" style={{ color: display.color }}>
        {display.icon}
      </span>
      <span className="status-label">{display.label}</span>
      <span className="status-sep">|</span>
      <span className="status-branch">{status.gitBranch}</span>

      {isInteractive && (
        <>
          {/* Model */}
          <span className="status-segment">
            <span className="status-sep">|</span>
            <span
              className="status-seg-interactive"
              onClick={() => handleCycle('model', 'model', currentModel)}
            >
              {currentModel}
            </span>
          </span>

          {/* Permission Mode */}
          <span className="status-segment">
            <span className="status-sep">|</span>
            <span
              className="status-seg-interactive"
              style={{ color: modeDisplay?.color ?? undefined }}
              onClick={() => handleCycle('permissionMode', 'mode', currentMode)}
            >
              {modeDisplay?.label ?? currentMode}
            </span>
          </span>

          {/* Effort */}
          <span className="status-segment">
            <span className="status-sep">|</span>
            <span
              className="status-seg-interactive"
              onClick={() => handleCycle('effort', 'effort', currentEffort)}
            >
              <span className="status-seg-label">effort: </span>
              {currentEffort}
            </span>
          </span>
        </>
      )}

      {/* Server-provided usage segments */}
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
