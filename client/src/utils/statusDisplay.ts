import type { ConnectionStatus } from '../types/project';

export interface StatusDisplayInput {
  agentStatus: 'idle' | 'running' | 'attention';
  connectionStatus: ConnectionStatus;
}

export interface StatusDisplay {
  icon: string;
  color: string;
  label: string;
}

export function getStatusDisplay(input: StatusDisplayInput): StatusDisplay {
  if (input.connectionStatus === 'error') return { icon: '\u2715', color: '#e06c75', label: 'error' };
  if (input.connectionStatus === 'reconnecting') return { icon: '\u25D0', color: '#e06c75', label: 'reconnecting' };
  if (input.connectionStatus !== 'connected') return { icon: '\u25CB', color: '#555', label: 'disconnected' };
  switch (input.agentStatus) {
    case 'idle':      return { icon: '\u25CF', color: '#98c379', label: 'idle' };
    case 'running':   return { icon: '\u25CF', color: '#e5c07b', label: 'running' };
    case 'attention': return { icon: '!',      color: '#d19a66', label: 'attention' };
  }
}
