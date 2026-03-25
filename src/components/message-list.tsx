import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from '../utils/markdown.js';

export type MessageType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType?: MessageType;
  collapsible?: boolean;
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

function CollapsibleMessage({ msg, index }: { msg: Message; index: number }) {
  const [expanded, setExpanded] = useState(!msg.collapsible);

  const label = msg.messageType === 'thinking'
    ? '▸ Thinking'
    : msg.messageType === 'tool_use'
      ? '▸ Tool'
      : roleLabels[msg.role];

  if (msg.collapsible && !expanded) {
    return (
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {label} ({msg.content.split('\n').length} lines) [collapsed]
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={roleColors[msg.role]}>
        {roleLabels[msg.role]}:
        {msg.collapsible && <Text dimColor> [expanded]</Text>}
      </Text>
      <Text>{msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}</Text>
    </Box>
  );
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, i) => (
        <CollapsibleMessage key={i} msg={msg} index={i} />
      ))}
    </Box>
  );
}
