import { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import type { Message } from '../types/message';
import { useKeyboardScope } from '../hooks/useKeyboardScope';
import './SearchBar.css';

interface Props {
  messages: Message[];
  onClose: () => void;
  onMatchChange: (matches: number[], currentIdx: number) => void;
  listRef: RefObject<HTMLDivElement | null>;
}

function messageMatchesQuery(msg: Message, query: string): boolean {
  const q = query.toLowerCase();
  if (msg.content.toLowerCase().includes(q)) return true;
  if (msg.toolResult?.toLowerCase().includes(q)) return true;
  if (msg.toolInput) {
    try {
      if (JSON.stringify(msg.toolInput).toLowerCase().includes(q)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

export function SearchBar({ messages, onClose, onMatchChange, listRef }: Props) {
  const [query, setQuery] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute matches when query or messages change
  const matches = useMemo(() => {
    if (!query) return [];
    const result: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messageMatchesQuery(messages[i], query)) result.push(i);
    }
    return result;
  }, [messages, query]);

  // Notify parent of match changes
  useEffect(() => {
    const idx = matches.length > 0 ? Math.min(currentIdx, matches.length - 1) : 0;
    if (idx !== currentIdx) setCurrentIdx(idx);
    onMatchChange(matches, idx);
  }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const scrollToMatch = useCallback((idx: number) => {
    if (!listRef.current || matches.length === 0) return;
    const msgIdx = matches[idx];
    const el = listRef.current.querySelector(`[data-msg-index="${msgIdx}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [listRef, matches]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentIdx + 1) % matches.length;
    setCurrentIdx(next);
    onMatchChange(matches, next);
    scrollToMatch(next);
  }, [matches, currentIdx, onMatchChange, scrollToMatch]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentIdx - 1 + matches.length) % matches.length;
    setCurrentIdx(prev);
    onMatchChange(matches, prev);
    scrollToMatch(prev);
  }, [matches, currentIdx, onMatchChange, scrollToMatch]);

  // Keyboard scope: capture Escape, Enter, Shift+Enter
  useKeyboardScope('search', useMemo(() => ({
    'Escape': () => onClose(),
  }), [onClose]));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      goPrev();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goNext();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setCurrentIdx(0);
  };

  // Scroll to first match when query changes and has results
  useEffect(() => {
    if (matches.length > 0) scrollToMatch(0);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        className="search-bar-input"
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search messages..."
        spellCheck={false}
      />
      <span className="search-bar-count">
        {query ? `${matches.length > 0 ? currentIdx + 1 : 0}/${matches.length}` : ''}
      </span>
      <button className="search-bar-nav" onClick={goPrev} disabled={matches.length === 0} title="Previous (Shift+Enter)">&#9650;</button>
      <button className="search-bar-nav" onClick={goNext} disabled={matches.length === 0} title="Next (Enter)">&#9660;</button>
      <button className="search-bar-close" onClick={onClose} title="Close (Esc)">&times;</button>
    </div>
  );
}
