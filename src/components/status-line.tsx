import React from 'react';
import { Box, Text } from 'ink';

export interface StatusInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  contextPct: number;
  turns: number;
  gitBranch: string;
  permissionMode: string;
  agentStatus: 'idle' | 'running' | 'attention';
}

interface StatusLineProps {
  status: StatusInfo;
}

const STATUS_COLORS: Record<StatusInfo['agentStatus'], string> = {
  idle: 'white',
  running: 'yellow',
  attention: 'red',
};

export default function StatusLine({ status }: StatusLineProps) {
  const tokens = `${(status.inputTokens / 1000).toFixed(0)}k+${(status.outputTokens / 1000).toFixed(0)}k`;
  const cost = `$${status.costUsd.toFixed(3)}`;
  const ctx = `ctx ${status.contextPct}%`;

  return (
    <Box paddingX={1}>
      <Text backgroundColor="#1a3a2a" color={STATUS_COLORS[status.agentStatus]}>● </Text>
      <Text backgroundColor="#1a3a2a" color="gray">
        {status.model} | {tokens} | {cost} | {ctx} | {status.turns}t | </Text>
      <Text backgroundColor="#1a3a2a" color="cyan">{status.gitBranch}</Text>
      <Text backgroundColor="#1a3a2a" color="gray"> | {status.permissionMode}</Text>
    </Box>
  );
}
