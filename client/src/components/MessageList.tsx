import { useRef, useEffect, useCallback, useState, type RefObject } from 'react';
import type { Message } from '../types/message';
import type { TaskInfo } from '@shared/protocol';
import type { AppSettings } from '../settings';
import { MarkdownBlock } from './messages/MarkdownBlock';
import { ThinkingBlock } from './messages/ThinkingBlock';
import { ToolCallBlock } from './messages/ToolCallBlock';
import { PermissionBanner, type PermissionResponse } from './messages/PermissionBanner';
import { AskUserQuestion } from './messages/AskUserQuestion';
import type { PermissionReq } from '../types/message';
import './MessageList.css';

interface Props {
  messages: Message[];
  loading: boolean;
  cwd?: string;
  display: AppSettings['display'];
  hasMoreHistory?: boolean;
  loadingHistory?: boolean;
  onLoadMore?: () => void;
  listRef?: RefObject<HTMLDivElement | null>;
  tasks?: TaskInfo[];
  permissionReq?: PermissionReq | null;
  onPermissionRespond?: (response: PermissionResponse) => void;
  searchMatchIndices?: Set<number>;
  activeMatchIndex?: number;
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

export function MessageList({ messages, loading, cwd, display, hasMoreHistory, loadingHistory, onLoadMore, listRef: externalListRef, tasks, permissionReq, onPermissionRespond, searchMatchIndices, activeMatchIndex }: Props) {
  const internalListRef = useRef<HTMLDivElement>(null);
  const listRef = externalListRef ?? internalListRef;
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

  // Track whether initial scroll has been performed
  const initialScrollDone = useRef(false);

  // Auto-scroll to bottom when new content arrives, only if already at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // Force scroll to bottom on initial message load (e.g. after agent connection with history)
  useEffect(() => {
    if (!initialScrollDone.current && messages.length > 0) {
      initialScrollDone.current = true;
      // Double rAF to ensure DOM layout is fully complete
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
        isAtBottomRef.current = true;
      }));
    }
  }, [messages.length]);

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

  // Build map of child messages grouped by parentToolUseId
  const childMessagesMap = new Map<string, { msg: Message; index: number }[]>();
  messages.forEach((msg, i) => {
    if (msg.parentToolUseId) {
      const list = childMessagesMap.get(msg.parentToolUseId) || [];
      list.push({ msg, index: i });
      childMessagesMap.set(msg.parentToolUseId, list);
    }
  });

  const turns = groupIntoTurns(messages);

  function searchClass(i: number): string {
    if (!searchMatchIndices?.has(i)) return '';
    return activeMatchIndex === i ? ' msg-search-active' : ' msg-search-match';
  }

  function renderMessage(msg: Message, i: number) {
    // Skip child messages — they are rendered inside their parent Task block
    if (msg.parentToolUseId) return null;

    switch (msg.messageType) {
      case 'thinking':
        if (getDisplayMode(msg) === 'hidden') return null;
        return (
          <div key={i} className={`msg${searchClass(i)}`} data-msg-index={i}>
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
          <div key={i} className={`msg${searchClass(i)}`} data-msg-index={i}>
            <ToolCallBlock
              msg={msg}
              collapsed={isCollapsed(msg, i)}
              onToggle={() => toggle(i)}
              cwd={cwd}
              tasks={tasks}
              childMessages={msg.toolUseId ? childMessagesMap.get(msg.toolUseId) : undefined}
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
            <div key={i} className={`msg msg-assistant${searchClass(i)}`} data-msg-index={i}>
              <MarkdownBlock content={msg.content} />
            </div>
          );
        }

        // system / error
        const isError = msg.messageType === 'error';
        return (
          <div key={i} className={`msg ${isError ? 'msg-error' : 'msg-system'}${searchClass(i)}`} data-msg-index={i}>
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
              <div className={`msg msg-user${searchClass(item.user.index)}`} data-msg-index={item.user.index}>
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
      {permissionReq && onPermissionRespond && (
        <div className="msg">
          {permissionReq.toolName === 'AskUserQuestion' ? (
            <AskUserQuestion req={permissionReq} onRespond={onPermissionRespond} />
          ) : (
            <PermissionBanner req={permissionReq} onRespond={onPermissionRespond} cwd={cwd} />
          )}
        </div>
      )}
      {loading && !permissionReq && (
        <div className="turn-agent turn-loading">
          <div className="msg msg-loading">
            <span className="spinner" /> Agent is thinking...
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
