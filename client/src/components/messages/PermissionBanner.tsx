import { useState, useEffect } from 'react';
import type { PermissionReq } from '../../types/message';
import './PermissionBanner.css';

export interface PermissionResponse {
  result: { behavior: 'allow' } | { behavior: 'deny'; message: string };
  alwaysAllow?: boolean;
}

interface Props {
  req: PermissionReq;
  onRespond: (response: PermissionResponse) => void;
}

const OPTIONS = [
  { label: 'Allow', key: 'allow' },
  { label: 'Allow (this session)', key: 'allow-always' },
  { label: 'Deny', key: 'deny' },
] as const;

export function PermissionBanner({ req, onRespond }: Props) {
  const [selected, setSelected] = useState(0);

  // Reset selection when a new request comes in
  useEffect(() => {
    setSelected(0);
  }, [req.requestId]);

  function respond(index: number) {
    const opt = OPTIONS[index];
    if (opt.key === 'allow') {
      onRespond({ result: { behavior: 'allow' } });
    } else if (opt.key === 'allow-always') {
      onRespond({ result: { behavior: 'allow' }, alwaysAllow: true });
    } else {
      onRespond({ result: { behavior: 'deny', message: 'Denied by user' } });
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(prev => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(prev => (prev < OPTIONS.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        respond(selected);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, onRespond]);

  return (
    <div className="permission-banner">
      <div className="perm-banner-header">
        {req.title ?? `Allow ${req.toolName}?`}
      </div>
      <div className="perm-options">
        {OPTIONS.map((opt, i) => (
          <div
            key={opt.key}
            className={`perm-option perm-option-${opt.key}${selected === i ? ' selected' : ''}`}
            onClick={() => respond(i)}
          >
            <span className="perm-option-indicator">{selected === i ? '\u25b6' : ' '}</span>
            <span>{opt.label}</span>
          </div>
        ))}
      </div>
      <div className="perm-hint">
        <kbd>&uarr;</kbd><kbd>&darr;</kbd> select &nbsp; <kbd>Enter</kbd> confirm
      </div>
    </div>
  );
}
