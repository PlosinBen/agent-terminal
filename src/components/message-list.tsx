import React from 'react';
import { Box, Text } from 'ink';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface MessageListProps {
  messages: Message[];
}

const roleColors: Record<Message['role'], string> = {
  user: 'cyan',
  assistant: 'white',
  system: 'yellow',
};

const roleLabels: Record<Message['role'], string> = {
  user: 'You',
  assistant: 'Agent',
  system: 'System',
};

export default function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Text bold color={roleColors[msg.role]}>
            {roleLabels[msg.role]}:
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}
    </Box>
  );
}
