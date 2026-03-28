import { useRef, useEffect, useState } from 'react';
import type { Message } from '../types/message';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
}

function CollapsibleMessage({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(!msg.collapsible);

  if (msg.collapsible && !expanded) {
    const lines = msg.content.split('\n').length;
    const label = msg.messageType === 'tool_use' ? `Tool: ${msg.toolName}` : 'Details';
    return (
      <div className="msg msg-collapsed" onClick={() => setExpanded(true)}>
        <span className="msg-toggle">▸ {label} ({lines} lines) [click to expand]</span>
      </div>
    );
  }

  const roleClass = msg.role === 'user' ? 'msg-user'
    : msg.role === 'system' ? 'msg-system'
    : msg.messageType === 'tool_use' ? 'msg-tool'
    : msg.messageType === 'result' ? 'msg-result'
    : 'msg-assistant';

  const roleLabel = msg.role === 'user' ? 'You'
    : msg.role === 'system' ? 'System'
    : msg.messageType === 'tool_use' ? `Tool: ${msg.toolName}`
    : msg.messageType === 'result' ? 'Result'
    : 'Agent';

  return (
    <div className={`msg ${roleClass}`}>
      {msg.collapsible && (
        <span className="msg-toggle" onClick={() => setExpanded(false)}>▾ </span>
      )}
      <span className="msg-label">{roleLabel}:</span>
      <span className="msg-content">{msg.content}</span>
    </div>
  );
}

export function MessageList({ messages, loading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="message-list">
      {messages.map((msg, i) => (
        <CollapsibleMessage key={i} msg={msg} />
      ))}
      {loading && (
        <div className="msg msg-loading">
          <span className="spinner" /> Agent is thinking...
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
