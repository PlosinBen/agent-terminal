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
            inverse={i === activeIndex}
            backgroundColor="#00875f"
            color="white"
          >
            [{i + 1}:{proj.name} </Text>
          <Text backgroundColor="#00875f" color={STATUS_COLORS[proj.status]}>●</Text>
          <Text backgroundColor="#00875f" color="white">]</Text>
        </React.Fragment>
      ))}
      <Text backgroundColor="#00875f" dimColor>  Alt+←/→</Text>
    </Box>
  );
}
