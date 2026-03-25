import React, { useState, useCallback, useRef } from 'react';
import { Box, Text } from 'ink';
import InputArea from './components/input-area.js';
import MessageList, { type Message } from './components/message-list.js';
import { ClaudeBackend } from './backend/claude/backend.js';
import type { AgentBackend } from './backend/types.js';

export default function App() {
  const backendRef = useRef<AgentBackend>(new ClaudeBackend());
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'agent-terminal v0.1.0 — Ready.' },
  ]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const gen = backendRef.current.query(text);
      let assistantText = '';

      for await (const msg of gen) {
        if (msg.type === 'result') {
          assistantText = msg.content;
        } else if (msg.type === 'text') {
          assistantText += msg.content + '\n';
        }
      }

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: assistantText || '(no response)' },
      ]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Error: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      <MessageList messages={messages} />
      {loading && (
        <Box paddingX={1}>
          <Text color="yellow">● Agent is thinking...</Text>
        </Box>
      )}
      <InputArea onSubmit={handleSubmit} disabled={loading} />
    </Box>
  );
}
