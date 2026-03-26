import React from 'react';
import { Box, Text } from 'ink';
import type { StatusSegment } from '../backend/types.js';

export interface StatusLineProps {
  agentStatus: 'idle' | 'running' | 'attention';
  gitBranch: string;
  segments: StatusSegment[];
}

const STATUS_COLORS: Record<StatusLineProps['agentStatus'], string> = {
  idle: 'white',
  running: 'yellow',
  attention: 'red',
};

export default function StatusLine({ agentStatus, gitBranch, segments }: StatusLineProps) {
  return (
    <Box paddingX={1}>
      {/* Common area */}
      <Text color={STATUS_COLORS[agentStatus]}>● </Text>
      <Text dimColor>{agentStatus}</Text>
      <Text dimColor> | </Text>
      <Text color="cyan">{gitBranch}</Text>

      {/* Provider area */}
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          <Text dimColor> | </Text>
          {seg.label && <Text dimColor>{seg.label}:</Text>}
          <Text color={seg.color ?? 'gray'}>{seg.value}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
