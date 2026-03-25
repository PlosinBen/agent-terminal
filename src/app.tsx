import React, { useState } from 'react';
import { Box, Text } from 'ink';
import InputArea from './components/input-area.js';
import MessageList, { type Message } from './components/message-list.js';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'agent-terminal v0.1.0 — Ready.' },
  ]);

  const handleSubmit = (text: string) => {
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: `(echo) ${text}` },
    ]);
  };

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      <MessageList messages={messages} />
      <InputArea onSubmit={handleSubmit} />
    </Box>
  );
}
