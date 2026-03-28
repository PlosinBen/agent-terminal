import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import './InputArea.css';

interface Props {
  disabled: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

export function InputArea({ disabled, onSubmit, onStop }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Delay focus to avoid Electron Chromium injecting '\n' into textarea
  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && disabled) {
      e.preventDefault();
      onStop();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed);
        setInput('');
      }
      // Keep focus on textarea after submit
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [input, disabled, onSubmit, onStop]);

  // Re-focus textarea when clicking anywhere outside it
  useEffect(() => {
    const handleWindowClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't steal focus from interactive elements (buttons, inputs, etc.)
      if (target.closest('.sidebar, .folder-picker, .permission-popup, .tab-bar')) return;
      textareaRef.current?.focus();
    };
    window.addEventListener('mouseup', handleWindowClick);
    return () => window.removeEventListener('mouseup', handleWindowClick);
  }, []);

  return (
    <div className={`input-area ${disabled ? 'input-disabled' : ''}`}>
      <span className="input-prompt">&gt;</span>
      <textarea
        ref={textareaRef}
        className="input-field"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Agent is running... (Esc to stop)' : 'Ask something...'}
        disabled={disabled}
        rows={1}
      />
    </div>
  );
}
