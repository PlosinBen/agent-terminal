import { useState, useEffect, useCallback, useRef } from 'react';
import { useKeyboardScope } from '../hooks/useKeyboardScope';
import {
  type Action,
  type KeybindingConfig,
  loadKeybindings,
  saveKeybindings,
  formatBinding,
  bindingFromEvent,
  DEFAULT_KEYBINDINGS,
} from '../keybindings';
import './SettingsPanel.css';

const ACTION_LABELS: Record<Action, string> = {
  toggleSidebar: 'Toggle Sidebar',
  newProject: 'New Project',
  closeProject: 'Close Project',
  prevProject: 'Previous Project',
  nextProject: 'Next Project',
  toggleTerminal: 'Toggle Terminal',
  nextTab: 'Next Tab',
  prevTab: 'Previous Tab',
  fpUp: 'Navigate Up',
  fpDown: 'Navigate Down',
  fpEnter: 'Enter Folder',
  fpBack: 'Go Back',
  fpConfirm: 'Confirm Selection',
  fpCancel: 'Cancel',
};

const CATEGORIES: { label: string; actions: Action[] }[] = [
  {
    label: 'Global',
    actions: ['toggleSidebar', 'newProject', 'closeProject', 'prevProject', 'nextProject', 'toggleTerminal', 'nextTab', 'prevTab'],
  },
  {
    label: 'Folder Picker',
    actions: ['fpUp', 'fpDown', 'fpEnter', 'fpBack', 'fpConfirm', 'fpCancel'],
  },
];

interface Props {
  onClose: () => void;
  onKeybindingsChanged: () => void;
}

export function SettingsPanel({ onClose, onKeybindingsChanged }: Props) {
  const [saved] = useState<KeybindingConfig>(loadKeybindings);
  const [draft, setDraft] = useState<KeybindingConfig>(loadKeybindings);
  const [recording, setRecording] = useState<Action | null>(null);
  const savedRef = useRef(saved);

  const dirty = Object.keys(draft).some(
    k => draft[k as Action] !== savedRef.current[k as Action],
  );

  // Scope: block app shortcuts while settings is open
  useKeyboardScope('settings', {
    Escape: () => {
      if (recording) {
        setRecording(null);
      } else {
        onClose();
      }
    },
  });

  // Capture keydown when recording
  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const binding = bindingFromEvent(e);
      if (!binding) return; // lone modifier key

      setDraft(prev => ({ ...prev, [recording]: binding }));
      setRecording(null);
    };

    // Use capture phase to intercept before keyboard service
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording]);

  const handleSave = useCallback(() => {
    saveKeybindings(draft);
    savedRef.current = draft;
    onKeybindingsChanged();
    onClose();
  }, [draft, onKeybindingsChanged, onClose]);

  const handleReset = useCallback(() => {
    setDraft({ ...DEFAULT_KEYBINDINGS });
    setRecording(null);
  }, []);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="settings-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-body">
          {CATEGORIES.map((cat) => (
            <div className="settings-section" key={cat.label}>
              <div className="settings-section-title">{cat.label}</div>
              <div className="keybinding-list">
                {cat.actions.map((action) => (
                  <div
                    key={action}
                    className={`keybinding-row${recording === action ? ' recording' : ''}${draft[action] !== savedRef.current[action] ? ' changed' : ''}`}
                    onClick={() => setRecording(action)}
                  >
                    <span className="keybinding-label">{ACTION_LABELS[action]}</span>
                    <span className="keybinding-value">
                      {recording === action ? 'Press keys...' : formatBinding(draft[action])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="settings-footer-actions">
            <button className="settings-reset-btn" onClick={handleReset}>
              Reset to defaults
            </button>
            <button
              className="settings-save-btn"
              onClick={handleSave}
              disabled={!dirty}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
