import { useState, useRef, useEffect, useCallback } from 'react';
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

const SEGMENT_COMMAND_MAP: Record<string, { command: string; configKey: keyof ProviderConfig }> = {
  model: { command: 'model', configKey: 'models' },
  permissionMode: { command: 'mode', configKey: 'permissionModes' },
  effort: { command: 'effort', configKey: 'effortLevels' },
};

// Segments that cycle on click (few options)
const CYCLE_SEGMENTS = new Set(['permissionMode', 'effort']);

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

  const [dropdownSegId, setDropdownSegId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const closeDropdown = useCallback(() => setDropdownSegId(null), []);

  // Close on click outside
  useEffect(() => {
    if (!dropdownSegId) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownSegId, closeDropdown]);

  // Close on Escape
  useEffect(() => {
    if (!dropdownSegId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDropdown();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dropdownSegId, closeDropdown]);

  const handleSegmentClick = (segId: string, currentRawValue: string) => {
    if (!providerConfig || !onCommand) return;
    const mapping = SEGMENT_COMMAND_MAP[segId];
    if (!mapping) return;

    const options = getOptions(segId, providerConfig);
    if (options.length === 0) return;

    if (CYCLE_SEGMENTS.has(segId)) {
      // Cycle to next option using raw value for matching
      const currentIdx = options.indexOf(currentRawValue);
      const nextIdx = (currentIdx + 1) % options.length;
      onCommand(mapping.command, options[nextIdx]);
    } else {
      // Toggle dropdown (model)
      setDropdownSegId(prev => prev === segId ? null : segId);
    }
  };

  const handleDropdownSelect = (segId: string, value: string) => {
    if (!onCommand) return;
    const mapping = SEGMENT_COMMAND_MAP[segId];
    if (!mapping) return;
    onCommand(mapping.command, value);
    closeDropdown();
  };

  // Find model segment's current value for dropdown highlight
  const modelSegment = status.segments.find(s => s.id === 'model');

  return (
    <div className="status-line">
      <span className="status-dot" style={{ color: display.color }}>
        {display.icon}
      </span>
      <span className="status-label">{display.label}</span>
      <span className="status-sep">|</span>
      <span className="status-branch">{status.gitBranch}</span>

      {status.segments.map((seg, i) => {
        const isInteractive = seg.id && SEGMENT_COMMAND_MAP[seg.id] && providerConfig && onCommand;
        const isDropdownTarget = seg.id === 'model';
        const isOpen = dropdownSegId === seg.id;

        return (
          <span key={i} className="status-segment">
            <span className="status-sep">|</span>
            <span
              ref={isOpen ? triggerRef : undefined}
              className={isInteractive ? 'status-seg-interactive' : undefined}
              style={{ color: seg.color ?? 'var(--text-secondary)', position: isDropdownTarget ? 'relative' : undefined }}
              onClick={isInteractive && seg.id ? () => handleSegmentClick(seg.id!, seg.rawValue ?? seg.value) : undefined}
            >
              {seg.label && <span className="status-seg-label">{seg.label}: </span>}
              {seg.value}
              {isOpen && isDropdownTarget && providerConfig && (
                <div className="status-dropdown" ref={dropdownRef}>
                  {providerConfig.models.map(m => (
                    <div
                      key={m.value}
                      className={'status-dropdown-item' + (m.value === modelSegment?.value ? ' active' : '')}
                      onClick={(e) => { e.stopPropagation(); handleDropdownSelect('model', m.value); }}
                    >
                      <span className="status-dropdown-name">{m.displayName}</span>
                      {m.description && <span className="status-dropdown-desc">{m.description}</span>}
                    </div>
                  ))}
                </div>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
