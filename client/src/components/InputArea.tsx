import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import './InputArea.css';

interface Props {
  disabled: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

export function InputArea({ disabled, onSubmit, onStop }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && disabled) {
      e.preventDefault();
      onStop();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed);
        setInput('');
      }
    }
  }, [input, disabled, onSubmit, onStop]);

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
        autoFocus
      />
    </div>
  );
}
