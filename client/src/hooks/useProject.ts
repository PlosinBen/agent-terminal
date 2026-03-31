import { useState, useEffect, useCallback, useRef } from 'react';
import type { DownstreamMessage } from '@shared/protocol';
import type { Message, StatusInfo, PermissionReq } from '../types/message';

export function useProject(
  projectId: string | null,
  onMessage: (handler: (msg: DownstreamMessage) => void) => () => void,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusInfo>({
    usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, contextUsedTokens: 0, contextWindow: 0, numTurns: 1, rateLimits: [] },
    agentStatus: 'idle',
    gitBranch: '-',
  });
  const [permissionReq, setPermissionReq] = useState<PermissionReq | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const unsub = onMessage((msg) => {
      if (!('projectId' in msg) || msg.projectId !== projectId) return;

      switch (msg.type) {
        case 'agent:text':
          setMessages(prev => {
            // Append to last assistant message if streaming
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.messageType === 'text') {
              return [...prev.slice(0, -1), { ...last, content: last.content + msg.content }];
            }
            // Trim leading whitespace from first chunk
            return [...prev, { role: 'assistant', content: msg.content.trimStart(), messageType: 'text' }];
          });
          break;

        case 'agent:tool_use':
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: msg.content,
              messageType: 'tool_use',
              toolName: msg.toolName,
              collapsible: true,
            },
          ]);
          break;

        case 'agent:result':
          // Server sends empty content (text already streamed via agent:text); ignore
          break;

        case 'agent:done':
          setLoading(false);
          break;

        case 'agent:error':
          setLoading(false);
          setMessages(prev => [
            ...prev,
            { role: 'system', content: `Error: ${msg.error}`, messageType: 'error' },
          ]);
          break;

        case 'permission:request':
          setPermissionReq({
            requestId: msg.requestId,
            toolName: msg.toolName,
            input: msg.input,
            title: msg.title,
          });
          break;

        case 'status:update':
          setStatus({
            usage: msg.usage,
            agentStatus: msg.agentStatus,
            gitBranch: msg.gitBranch,
          });
          break;

        case 'agent:system':
          setMessages(prev => [
            ...prev,
            { role: 'system', content: msg.content, messageType: 'compact' },
          ]);
          break;

        case 'command:result':
          setMessages(prev => [
            ...prev,
            { role: 'system', content: msg.message },
          ]);
          break;
      }
    });

    return unsub;
  }, [projectId, onMessage]);

  const clearPermission = useCallback(() => setPermissionReq(null), []);

  const addUserMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, { role: 'user', content }]);
    setLoading(true);
  }, []);

  return { messages, loading, status, permissionReq, clearPermission, addUserMessage };
}
