import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import InputArea from './components/input-area.js';
import MessageList, { type Message } from './components/message-list.js';
import PermissionPopup from './components/permission-popup.js';
import TerminalView from './components/terminal-view.js';
import { ClaudeBackend } from './backend/claude/backend.js';
import type { AgentBackend, PermissionRequest } from './backend/types.js';

type ViewMode = 'agent' | 'terminal';

interface PendingPermission {
  request: PermissionRequest;
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void;
}

export default function App() {
  const backendRef = useRef<AgentBackend>(new ClaudeBackend());
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'agent-terminal v0.1.0 — Ready. (Alt+Left/Right to switch views)' },
  ]);
  const [loading, setLoading] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [view, setView] = useState<ViewMode>('agent');

  // Global key handler for view switching
  useInput((_ch, key) => {
    if (key.meta && key.leftArrow) setView('agent');
    if (key.meta && key.rightArrow) setView('terminal');
  });

  // Set up permission handler once
  useEffect(() => {
    backendRef.current.setPermissionHandler((req) => {
      return new Promise((resolve) => {
        // Auto-switch to agent view when permission is needed
        setView('agent');
        setPendingPermission({ request: req, resolve });
      });
    });
  }, []);

  const handlePermissionResponse = useCallback((result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => {
    if (pendingPermission) {
      pendingPermission.resolve(result);
      setPendingPermission(null);
    }
  }, [pendingPermission]);

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
          assistantText += msg.content;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: assistantText }];
            }
            return [...prev, { role: 'assistant', content: assistantText }];
          });
        } else if (msg.type === 'tool_use') {
          setMessages(prev => [
            ...prev,
            { role: 'system', content: `● ${msg.toolName}: ${msg.content}` },
          ]);
        }
      }

      if (assistantText) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', content: assistantText }];
          }
          return [...prev, { role: 'assistant', content: assistantText }];
        });
      }
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
      {/* View indicator */}
      <Box paddingX={1}>
        <Text color={view === 'agent' ? 'green' : 'gray'} bold={view === 'agent'}>
          [Agent]
        </Text>
        <Text> </Text>
        <Text color={view === 'terminal' ? 'green' : 'gray'} bold={view === 'terminal'}>
          [Terminal]
        </Text>
        <Text dimColor> — Alt+←/→ to switch</Text>
      </Box>

      {/* Agent View */}
      {view === 'agent' && (
        <Box flexDirection="column" flexGrow={1}>
          <MessageList messages={messages} />

          {pendingPermission && (
            <PermissionPopup
              toolName={pendingPermission.request.toolName}
              input={pendingPermission.request.input}
              title={pendingPermission.request.title}
              onRespond={handlePermissionResponse}
            />
          )}

          {loading && !pendingPermission && (
            <Box paddingX={1}>
              <Text color="yellow">● Agent is thinking...</Text>
            </Box>
          )}

          <InputArea onSubmit={handleSubmit} disabled={loading} />
        </Box>
      )}

      {/* Terminal View */}
      {view === 'terminal' && (
        <TerminalView active={view === 'terminal'} />
      )}
    </Box>
  );
}
