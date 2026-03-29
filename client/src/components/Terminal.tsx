import type { AgentService } from '../service/agent-service';
import type { ProjectInfo } from '../types/project';
import type { AppSettings } from '../settings';
import { useTerminal } from '../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface Props {
  project: ProjectInfo;
  visible: boolean;
  service: AgentService;
  appearance: AppSettings['appearance'];
}

export function Terminal({ project, visible, service, appearance }: Props) {
  const { containerRef, hasOutput, connected } = useTerminal(project, visible, service, appearance);

  const showPlaceholder = visible && !hasOutput;

  return (
    <div style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {showPlaceholder && (
        <div className="terminal-placeholder">
          {!connected ? 'Connecting to server...' : 'Starting terminal...'}
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-container"
        style={{ display: showPlaceholder ? 'none' : undefined }}
      />
    </div>
  );
}
