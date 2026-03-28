import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { Message } from '../types/message';
import { MarkdownBlock } from './messages/MarkdownBlock';
import { ThinkingBlock } from './messages/ThinkingBlock';
import { ToolCallBlock } from './messages/ToolCallBlock';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
  cwd?: string;
}

interface Turn {
  user?: { msg: Message; index: number };
  responses: { msg: Message; index: number }[];
}

function groupIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  messages.forEach((msg, i) => {
    if (msg.role === 'user') {
      current = { user: { msg, index: i }, responses: [] };
      turns.push(current);
    } else {
      if (!current) {
        current = { responses: [] };
        turns.push(current);
      }
      current.responses.push({ msg, index: i });
    }
  });

  return turns;
}

export function MessageList({ messages, loading, cwd }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggle = useCallback((index: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const turns = groupIntoTurns(messages);

  function renderMessage(msg: Message, i: number) {
    switch (msg.messageType) {
      case 'thinking':
        return (
          <div key={i} className="msg">
            <ThinkingBlock
              content={msg.content}
              collapsed={!expanded.has(i)}
              onToggle={() => toggle(i)}
            />
          </div>
        );

      case 'tool_use':
        return (
          <div key={i} className="msg">
            <ToolCallBlock
              msg={msg}
              collapsed={!expanded.has(i)}
              onToggle={() => toggle(i)}
              cwd={cwd}
            />
          </div>
        );

      default: {
        if (msg.role === 'assistant') {
          return (
            <div key={i} className="msg msg-assistant">
              <MarkdownBlock content={msg.content} />
            </div>
          );
        }

        // system / error
        const isError = msg.messageType === 'error';
        return (
          <div key={i} className={`msg ${isError ? 'msg-error' : 'msg-system'}`}>
            <span className="msg-label">{isError ? 'Error' : 'System'}:</span>
            <span className="msg-content">{msg.content}</span>
          </div>
        );
      }
    }
  }

  return (
    <div className="message-list">
      {turns.map((turn, ti) => (
        <div key={ti} className="turn">
          {turn.user && (
            <div className="msg msg-user">
              <span className="msg-content">{turn.user.msg.content}</span>
            </div>
          )}
          {turn.responses.length > 0 && (
            <div className="turn-agent">
              {turn.responses.map(({ msg, index }) => renderMessage(msg, index))}
            </div>
          )}
        </div>
      ))}
      {loading && (
        <div className="turn">
          <div className="turn-agent">
            <div className="msg msg-loading">
              <span className="spinner" /> Agent is thinking...
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
