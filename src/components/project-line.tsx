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

export default function ProjectLine({ projects, activeIndex }: ProjectLineProps) {
  return (
    <Box paddingX={1}>
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
