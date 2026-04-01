import { useState, useEffect, useRef } from 'react';
import type { AvailableProvider } from '../stores/server-store';
import './ProjectSetup.css';

interface Props {
  folderPath: string;
  providers: AvailableProvider[];
  onConfirm: (name: string, provider: string) => void;
  onCancel: () => void;
}

export function ProjectSetup({ folderPath, providers, onConfirm, onCancel }: Props) {
  const defaultName = folderPath.split('/').pop() ?? 'project';
  const [name, setName] = useState(defaultName);
  const [provider, setProvider] = useState(providers[0]?.name ?? 'claude');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select the name input on mount
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(name.trim() || defaultName, provider);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="project-setup-overlay" onClick={onCancel}>
      <div className="project-setup" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="project-setup-header">New Project</div>

        <div className="project-setup-body">
          <div className="project-setup-path" title={folderPath}>{folderPath}</div>

          <label className="project-setup-label">
            Project Name
            <input
              ref={inputRef}
              className="project-setup-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={defaultName}
            />
          </label>

          <label className="project-setup-label">
            Agent Provider
            <div className="project-setup-providers">
              {providers.map(p => (
                <button
                  key={p.name}
                  className={'project-setup-provider-btn' + (provider === p.name ? ' active' : '')}
                  onClick={() => setProvider(p.name)}
                  type="button"
                >
                  {p.displayName}
                </button>
              ))}
              {providers.length === 0 && (
                <span className="project-setup-no-providers">No providers available</span>
              )}
            </div>
          </label>
        </div>

        <div className="project-setup-footer">
          <button className="project-setup-btn secondary" onClick={onCancel}>Cancel</button>
          <button
            className="project-setup-btn primary"
            onClick={() => onConfirm(name.trim() || defaultName, provider)}
            disabled={providers.length === 0}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
