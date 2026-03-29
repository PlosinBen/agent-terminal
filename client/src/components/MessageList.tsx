import { useRef, useEffect, useCallback, useState } from 'react';
import type { Message } from '../types/message';
import type { AppSettings } from '../settings';
import { MarkdownBlock } from './messages/MarkdownBlock';
import { ThinkingBlock } from './messages/ThinkingBlock';
import { ToolCallBlock } from './messages/ToolCallBlock';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
  cwd?: string;
  display: AppSettings['display'];
  hasMoreHistory?: boolean;
  loadingHistory?: boolean;
  onLoadMore?: () => void;
}

interface Turn {
  kind: 'turn';
  user?: { msg: Message; index: number };
  responses: { msg: Message; index: number }[];
}

interface Divider {
  kind: 'divider';
  msg: Message;
  index: number;
}

type TurnOrDivider = Turn | Divider;

function groupIntoTurns(messages: Message[]): TurnOrDivider[] {
  const groups: TurnOrDivider[] = [];
  let current: Turn | null = null;

  messages.forEach((msg, i) => {
    if (msg.messageType === 'compact') {
      current = null;
      groups.push({ kind: 'divider', msg, index: i });
    } else if (msg.role === 'user') {
      current = { kind: 'turn', user: { msg, index: i }, responses: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { kind: 'turn', responses: [] };
        groups.push(current);
      }
      current.responses.push({ msg, index: i });
    }
  });

  return groups;
}

export function MessageList({ messages, loading, cwd, display, hasMoreHistory, loadingHistory, onLoadMore }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  // Track indices the user has manually toggled (overrides display defaults)
  const [toggled, setToggled] = useState<Set<number>>(() => new Set());

  // Track whether user is scrolled to the bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 40;
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new content arrives, only if already at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // IntersectionObserver for lazy loading older history
  useEffect(() => {
    if (!hasMoreHistory || !sentinelRef.current || !listRef.current) return;
    const sentinel = sentinelRef.current;
    const container = listRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && onLoadMore && !loadingHistory) {
          // Record scroll position before loading
          const prevScrollHeight = container.scrollHeight;
          const prevScrollTop = container.scrollTop;

          // Use a microtask to restore scroll after DOM update
          const origOnLoadMore = onLoadMore;
          origOnLoadMore();

          // Restore scroll position after new messages are prepended
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          });
        }
      },
      { root: container, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreHistory, loadingHistory, onLoadMore]);

  const toggle = useCallback((index: number) => {
    setToggled(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  function getDisplayMode(msg: Message): AppSettings['display'][keyof AppSettings['display']] {
    if (msg.messageType === 'thinking') return display.thinking;
    const toolName = msg.toolName as keyof AppSettings['display'] | undefined;
    if (toolName && toolName in display) return display[toolName];
    return display.other;
  }

  function isCollapsed(msg: Message, index: number): boolean {
    const defaultCollapsed = getDisplayMode(msg) !== 'expanded';
    // If user manually toggled, flip the default
    return toggled.has(index) ? !defaultCollapsed : defaultCollapsed;
  }

  const turns = groupIntoTurns(messages);

  function renderMessage(msg: Message, i: number) {
    switch (msg.messageType) {
      case 'thinking':
        if (getDisplayMode(msg) === 'hidden') return null;
        return (
          <div key={i} className="msg">
            <ThinkingBlock
              content={msg.content}
              collapsed={isCollapsed(msg, i)}
              onToggle={() => toggle(i)}
            />
          </div>
        );

      case 'tool_use':
        if (getDisplayMode(msg) === 'hidden') return null;
        return (
          <div key={i} className="msg">
            <ToolCallBlock
              msg={msg}
              collapsed={isCollapsed(msg, i)}
              onToggle={() => toggle(i)}
              cwd={cwd}
            />
          </div>
        );

      case 'compact':
        return (
          <div key={i} className="msg-compact">
            <span className="msg-compact-line" />
            <span className="msg-compact-text">{msg.content}</span>
            <span className="msg-compact-line" />
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

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="message-list" ref={listRef}>
      {hasMoreHistory && (
        <div ref={sentinelRef} className="load-more-sentinel">
          {loadingHistory && <span className="spinner" />}
        </div>
      )}
      {isEmpty && (
        <div className="message-list-empty">
          Say something to get the AI working for you.
        </div>
      )}
      {turns.map((item, ti) =>
        item.kind === 'divider' ? (
          renderMessage(item.msg, item.index)
        ) : (
          <div key={ti} className="turn">
            {item.user && (
              <div className="msg msg-user">
                <span className="msg-content">{item.user.msg.content}</span>
              </div>
            )}
            {item.responses.length > 0 && (
              <div className="turn-agent">
                {item.responses.map(({ msg, index }) => renderMessage(msg, index))}
              </div>
            )}
          </div>
        )
      )}
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
