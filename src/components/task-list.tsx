import React from 'react';
import { Box, Text } from 'ink';
import type { TaskInfo } from '../core/task.js';

interface TaskListProps {
  tasks: TaskInfo[];
}

const STATUS_COLORS: Record<string, string> = {
  running: 'yellow',
  stalled: 'red',
  completed: 'green',
  stopped: 'gray',
  error: 'red',
};

const STATUS_ICONS: Record<string, string> = {
  running: '●',
  stalled: '⚠',
  completed: '✓',
  stopped: '■',
  error: '✗',
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${seconds % 60}s`;
}

export default function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1}>
      {tasks.map(task => (
        <Box key={task.id}>
          <Text color={STATUS_COLORS[task.status]}>
            {STATUS_ICONS[task.status]} </Text>
          <Text>{task.description}</Text>
          <Text dimColor> ({formatDuration(Date.now() - task.startedAt)})</Text>
          {task.status === 'stalled' && <Text color="red"> [stalled]</Text>}
        </Box>
      ))}
    </Box>
  );
}
