import type { StatusInfo, ProviderConfig } from '../types/message';
import type { ProjectInfo } from '../types/project';
import type { AvailableProvider } from '../stores/server-store';
import { PERMISSION_MODE_LABELS } from '@shared/types';
import { getStatusDisplay } from '../utils/statusDisplay';
import { computeUsageSegments } from '../utils/usageSegments';
import './StatusLine.css';

interface Props {
  status: StatusInfo;
  project?: ProjectInfo;
  providerConfig?: ProviderConfig | null;
  providers?: AvailableProvider[];
  onCommand?: (command: string, args: string) => void;
}

const PERMISSION_MODE_COLORS: Record<string, string> = {
  default: '#ffffff',
  acceptEdits: '#e5c07b',
  bypassPermissions: '#e06c75',
  plan: '#56b6c2',
};

function getOptions(id: string, config: ProviderConfig): string[] {
  if (id === 'model') return config.models.map(m => m.value);
  if (id === 'permissionMode') return config.permissionModes;
  if (id === 'effort') return config.effortLevels;
  return [];
}

export function StatusLine({ status, project, providerConfig, providers, onCommand }: Props) {
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

  // Resolve provider display name from available providers list
  const providerLabel = project?.provider
    ? providers?.find(p => p.name === project.provider)?.displayName ?? project.provider
    : undefined;

  const isInteractive = !!(providerConfig && onCommand);
  const currentModel = project?.model ?? providerConfig?.models[0]?.value ?? 'default';
  const currentMode = project?.permissionMode ?? 'default';
  const currentEffort = project?.effort ?? 'high';
  const modeLabel = PERMISSION_MODE_LABELS[currentMode] ?? currentMode;
  const modeColor = PERMISSION_MODE_COLORS[currentMode];

  return (
    <div className="status-line">
      <span className="status-dot" style={{ color: display.color }}>
        {display.icon}
      </span>
      <span className="status-label">{display.label}</span>
      {providerLabel && (
        <>
          <span className="status-sep">|</span>
          <span className="status-provider">{providerLabel}</span>
        </>
      )}
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
              style={{ color: modeColor }}
              onClick={() => handleCycle('permissionMode', 'mode', currentMode)}
            >
              {modeLabel}
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

      {/* Client-computed usage segments */}
      {computeUsageSegments(status.usage).map((seg, i) => (
        <span key={i} className="status-segment">
          <span className="status-sep">|</span>
          {seg.label && <span className="status-seg-label">{seg.label}: </span>}
          <span style={{ color: seg.color ?? 'var(--text-secondary)' }}>{seg.value}</span>
        </span>
      ))}
    </div>
  );
}
