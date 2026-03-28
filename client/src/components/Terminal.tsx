import type { AgentService } from '../service/agent-service';
import type { ProjectInfo } from '../types/project';
import { useTerminal } from '../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface Props {
  project: ProjectInfo;
  visible: boolean;
  service: AgentService;
}

export function Terminal({ project, visible, service }: Props) {
  const { containerRef, hasOutput, connected } = useTerminal(project, visible, service);

  if (!visible) return null;

  const showPlaceholder = !hasOutput;

  return (
    <>
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
    </>
  );
}
