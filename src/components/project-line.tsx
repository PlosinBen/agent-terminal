import React from 'react';
import { Box, Text } from 'ink';

export interface ProjectInfo {
  name: string;
  status: 'idle' | 'running' | 'attention';
}

interface ProjectLineProps {
  projects: ProjectInfo[];
  activeIndex: number;
}

const STATUS_COLORS: Record<ProjectInfo['status'], string> = {
  idle: 'white',
  running: 'yellow',
  attention: 'red',
};

const ANSI_STATUS_COLORS: Record<ProjectInfo['status'], string> = {
  idle: '\x1b[37m',
  running: '\x1b[33m',
  attention: '\x1b[31m',
};

export default function ProjectLine({ projects, activeIndex }: ProjectLineProps) {
  return (
    <Box paddingX={1} height={1}>
      {projects.map((proj, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text> </Text>}
          <Text
            bold={i === activeIndex}
            color={i === activeIndex ? 'cyan' : 'gray'}
          >
            [{i + 1}:{proj.name} </Text>
          <Text color={STATUS_COLORS[proj.status]}>●</Text>
          <Text color={i === activeIndex ? 'cyan' : 'gray'}>]</Text>
        </React.Fragment>
      ))}
      <Text dimColor>  Alt+1~9</Text>
    </Box>
  );
}

export function renderProjectLineAnsi(projects: ProjectInfo[], activeIndex: number): string {
  let line = ' ';
  for (let i = 0; i < projects.length; i++) {
    if (i > 0) line += ' ';
    const proj = projects[i];
    const isActive = i === activeIndex;
    const color = isActive ? '\x1b[1;36m' : '\x1b[90m';
    line += `${color}[${i + 1}:${proj.name} ${ANSI_STATUS_COLORS[proj.status]}●${color}]\x1b[0m`;
  }
  line += '\x1b[2m  Alt+1~9\x1b[0m';
  return line;
}

export function drawProjectLine(projects: ProjectInfo[], activeIndex: number): void {
  const rows = process.stdout.rows;
  const content = renderProjectLineAnsi(projects, activeIndex);
  process.stdout.write(`\x1b7\x1b[${rows};1H\x1b[2K${content}\x1b8`);
}
