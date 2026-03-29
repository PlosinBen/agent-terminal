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
import {
  type AppSettings,
  type DisplayMode,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  DISPLAY_KEYS,
} from '../settings';
import './SettingsPanel.css';

// ── Keybinding labels & categories ──

const ACTION_LABELS: Record<Action, string> = {
  toggleSidebar: 'Toggle Sidebar',
  newProject: 'New Project',
  closeProject: 'Close Project',
  prevProject: 'Previous Project',
  nextProject: 'Next Project',
  toggleTerminal: 'Toggle Terminal',
  nextTab: 'Next Tab',
  prevTab: 'Previous Tab',
  fpNextServer: 'Next Server',
  fpPrevServer: 'Previous Server',
};

const KB_CATEGORIES: { label: string; actions: Action[] }[] = [
  {
    label: 'Global',
    actions: ['toggleSidebar', 'newProject', 'closeProject', 'prevProject', 'nextProject', 'toggleTerminal', 'nextTab', 'prevTab'],
  },
  {
    label: 'Folder Picker',
    actions: ['fpNextServer', 'fpPrevServer'],
  },
];

// ── Props ──

interface Props {
  onClose: () => void;
  onKeybindingsChanged: () => void;
  onSettingsChanged: () => void;
}

type SettingsTab = 'keybindings' | 'appearance' | 'display';
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'display', label: 'Display' },
];

export function SettingsPanel({ onClose, onKeybindingsChanged, onSettingsChanged }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('keybindings');

  // Keybinding state
  const [kbSaved] = useState<KeybindingConfig>(loadKeybindings);
  const [kbDraft, setKbDraft] = useState<KeybindingConfig>(loadKeybindings);
  const [recording, setRecording] = useState<Action | null>(null);
  const kbSavedRef = useRef(kbSaved);

  // Settings state
  const [stSaved] = useState<AppSettings>(loadSettings);
  const [stDraft, setStDraft] = useState<AppSettings>(loadSettings);
  const stSavedRef = useRef(stSaved);

  const kbDirty = Object.keys(kbDraft).some(
    k => kbDraft[k as Action] !== kbSavedRef.current[k as Action],
  );
  const stDirty = JSON.stringify(stDraft) !== JSON.stringify(stSavedRef.current);
  const dirty = kbDirty || stDirty;

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

  // Capture keydown when recording keybinding
  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const binding = bindingFromEvent(e);
      if (!binding) return;

      setKbDraft(prev => ({ ...prev, [recording]: binding }));
      setRecording(null);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording]);

  const handleSave = useCallback(() => {
    if (kbDirty) {
      saveKeybindings(kbDraft);
      kbSavedRef.current = kbDraft;
      onKeybindingsChanged();
    }
    if (stDirty) {
      saveSettings(stDraft);
      stSavedRef.current = stDraft;
      onSettingsChanged();
    }
    onClose();
  }, [kbDraft, kbDirty, stDraft, stDirty, onKeybindingsChanged, onSettingsChanged, onClose]);

  const handleReset = useCallback(() => {
    setKbDraft({ ...DEFAULT_KEYBINDINGS });
    setStDraft(structuredClone(DEFAULT_SETTINGS));
    setRecording(null);
  }, []);

  // Settings updaters
  const updateAppearance = useCallback(<K extends keyof AppSettings['appearance']>(
    key: K, value: AppSettings['appearance'][K],
  ) => {
    setStDraft(prev => ({
      ...prev,
      appearance: { ...prev.appearance, [key]: value },
    }));
  }, []);

  const updateDisplay = useCallback(<K extends keyof AppSettings['display']>(
    key: K, value: AppSettings['display'][K],
  ) => {
    setStDraft(prev => ({
      ...prev,
      display: { ...prev.display, [key]: value },
    }));
  }, []);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="settings-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-tabs">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >{tab.label}</button>
          ))}
        </div>
        <div className="settings-body">

          {/* ── Keybindings ── */}
          {activeTab === 'keybindings' && KB_CATEGORIES.map((cat) => (
            <div className="settings-section" key={cat.label}>
              <div className="settings-section-title">{cat.label}</div>
              <div className="keybinding-list">
                {cat.actions.map((action) => (
                  <div
                    key={action}
                    className={`keybinding-row${recording === action ? ' recording' : ''}${kbDraft[action] !== kbSavedRef.current[action] ? ' changed' : ''}`}
                    onClick={() => setRecording(action)}
                  >
                    <span className="keybinding-label">{ACTION_LABELS[action]}</span>
                    <span className="keybinding-value">
                      {recording === action ? 'Press keys...' : formatBinding(kbDraft[action])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ── Appearance ── */}
          {activeTab === 'appearance' && (
            <>
              <div className="settings-row">
                <span className="settings-row-label">Terminal Font Size</span>
                <div className="settings-number">
                  <button
                    className="settings-number-btn"
                    onClick={() => updateAppearance('terminalFontSize', Math.max(8, stDraft.appearance.terminalFontSize - 1))}
                  >-</button>
                  <span className="settings-number-value">{stDraft.appearance.terminalFontSize}</span>
                  <button
                    className="settings-number-btn"
                    onClick={() => updateAppearance('terminalFontSize', Math.min(24, stDraft.appearance.terminalFontSize + 1))}
                  >+</button>
                </div>
              </div>

              <div className="settings-row">
                <span className="settings-row-label">Terminal Font Family</span>
                <input
                  className="settings-text-input"
                  value={stDraft.appearance.terminalFontFamily}
                  onChange={e => updateAppearance('terminalFontFamily', e.target.value)}
                  spellCheck={false}
                />
              </div>

              <div className="settings-row">
                <span className="settings-row-label">Terminal Cursor Blink</span>
                <button
                  className={`settings-toggle${stDraft.appearance.terminalCursorBlink ? ' on' : ''}`}
                  onClick={() => updateAppearance('terminalCursorBlink', !stDraft.appearance.terminalCursorBlink)}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>
            </>
          )}

          {/* ── Display ── */}
          {activeTab === 'display' && (
            <>
              {DISPLAY_KEYS.map(({ key, label }) => (
                <div className="settings-row" key={key}>
                  <span className="settings-row-label">{label}</span>
                  <select
                    className="settings-select"
                    value={stDraft.display[key]}
                    onChange={e => updateDisplay(key, e.target.value as DisplayMode)}
                  >
                    <option value="collapsed">Collapsed</option>
                    <option value="expanded">Expanded</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
              ))}
            </>
          )}

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
