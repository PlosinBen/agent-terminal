import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { useServerStore } from '../stores/server-store';
import './SettingsPanel.css';

declare const __APP_VERSION__: string;

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
  searchMessages: 'Search Messages',
  fpNextServer: 'Next Server',
  fpPrevServer: 'Previous Server',
};

const KB_CATEGORIES: { label: string; actions: Action[] }[] = [
  {
    label: 'Global',
    actions: ['toggleSidebar', 'newProject', 'closeProject', 'prevProject', 'nextProject', 'toggleTerminal', 'nextTab', 'prevTab', 'searchMessages'],
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

type SettingsTab = 'keybindings' | 'appearance' | 'display' | 'providers' | 'history';
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'display', label: 'Display' },
  { id: 'providers', label: 'Providers' },
  { id: 'history', label: 'History' },
];

// Provider definitions for path settings (CLI-based providers only)
const PROVIDER_PATH_DEFS = [
  { name: 'claude', label: 'Claude', hint: 'Leave empty for auto-detect' },
  { name: 'gemini', label: 'Gemini', hint: 'Leave empty for auto-detect' },
  { name: 'copilot', label: 'GitHub Copilot', hint: 'Path to gh CLI (e.g. /opt/homebrew/bin/gh)' },
] as const;

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

  // Provider paths state
  const service = useServerStore.getState()._service;
  const localHost = useServerStore(s => s.localHost);
  const availableProviders = useServerStore(s => s.providers);
  const [providerPaths, setProviderPaths] = useState<Record<string, string>>({});
  const [providerPathDrafts, setProviderPathDrafts] = useState<Record<string, string>>({});
  const [providerVerify, setProviderVerify] = useState<Record<string, { loading?: boolean; valid?: boolean; version?: string; error?: string }>>({});

  const availableSet = useMemo(() => new Set(availableProviders.map(p => p.name)), [availableProviders]);

  // Fetch provider paths when Providers tab is activated
  useEffect(() => {
    if (activeTab !== 'providers' || !service || !localHost) return;
    service.getProviderPaths(localHost).then(result => {
      setProviderPaths(result.paths);
      setProviderPathDrafts(result.paths);
    });
  }, [activeTab, service, localHost]);

  const handleVerifyPath = useCallback((provider: string) => {
    if (!service || !localHost) return;
    const path = providerPathDrafts[provider]?.trim();
    if (!path) return;
    setProviderVerify(prev => ({ ...prev, [provider]: { loading: true } }));
    service.verifyProviderPath(localHost, provider, path).then(result => {
      setProviderVerify(prev => ({
        ...prev,
        [provider]: { valid: result.valid, version: result.version, error: result.error },
      }));
    });
  }, [service, localHost, providerPathDrafts]);

  const handleSavePath = useCallback((provider: string) => {
    if (!service || !localHost) return;
    const path = providerPathDrafts[provider]?.trim() || '';
    service.setProviderPath(localHost, provider, path).then(() => {
      setProviderPaths(prev => {
        const next = { ...prev };
        if (path) next[provider] = path;
        else delete next[provider];
        return next;
      });
      // Clear verify state after save
      setProviderVerify(prev => ({ ...prev, [provider]: {} }));
    });
  }, [service, localHost, providerPathDrafts]);

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

  const updateModels = useCallback(<K extends keyof AppSettings['models']>(
    key: K, value: AppSettings['models'][K],
  ) => {
    setStDraft(prev => ({
      ...prev,
      models: { ...prev.models, [key]: value },
    }));
  }, []);

  const updateHistory = useCallback(<K extends keyof AppSettings['history']>(
    key: K, value: AppSettings['history'][K],
  ) => {
    setStDraft(prev => ({
      ...prev,
      history: { ...prev.history, [key]: value },
    }));
  }, []);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <span className="settings-version">v{__APP_VERSION__}</span>
          <button className="settings-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-layout">
        <div className="settings-sidebar">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`settings-nav-item${activeTab === tab.id ? ' active' : ''}`}
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

          {/* ── Providers ── */}
          {activeTab === 'providers' && (
            <>
              <div className="settings-section">
                <div className="settings-section-title">Provider Binary Paths</div>
                <div className="settings-section-desc">
                  Configure binary paths for CLI-based providers. Leave empty for auto-detect.
                </div>
              </div>
              {PROVIDER_PATH_DEFS.map(({ name, label, hint }) => {
                const draft = providerPathDrafts[name] ?? '';
                const saved = providerPaths[name] ?? '';
                const verify = providerVerify[name];
                const isAvailable = availableSet.has(name);
                const pathChanged = draft !== saved;

                return (
                  <div className="settings-section" key={name}>
                    <div className="provider-row-header">
                      <span className="provider-name">{label}</span>
                      <span className={`provider-status ${isAvailable ? 'available' : 'unavailable'}`}>
                        {isAvailable ? '● Available' : '○ Unavailable'}
                      </span>
                    </div>
                    <div className="provider-path-row">
                      <input
                        className="settings-text-input provider-path-input"
                        value={draft}
                        placeholder={hint}
                        spellCheck={false}
                        onChange={e => setProviderPathDrafts(prev => ({ ...prev, [name]: e.target.value }))}
                      />
                      <button
                        className="provider-verify-btn"
                        disabled={!draft.trim() || verify?.loading}
                        onClick={() => handleVerifyPath(name)}
                      >
                        {verify?.loading ? '...' : 'Verify'}
                      </button>
                      <button
                        className="provider-save-btn"
                        disabled={!pathChanged}
                        onClick={() => handleSavePath(name)}
                      >
                        Save
                      </button>
                    </div>
                    {verify && !verify.loading && (
                      <div className={`provider-verify-result ${verify.valid ? 'valid' : 'invalid'}`}>
                        {verify.valid
                          ? `✓ Valid${verify.version ? ` — ${verify.version}` : ''}`
                          : `✗ ${verify.error || 'Invalid path'}`
                        }
                      </div>
                    )}
                    {!draft && saved && (
                      <div className="provider-verify-result hint">Cleared — will revert to auto-detect on save</div>
                    )}
                  </div>
                );
              })}
              <div className="settings-section">
                <div className="settings-section-title">Model Options</div>
                <div className="settings-section-desc">
                  Expand the model picker with additional aliases (Claude only).
                </div>
              </div>

              <div className="settings-row">
                <span className="settings-row-label">
                  Show <code>opus</code> alias
                  <span className="settings-row-hint">Explicit Opus model (vs "default")</span>
                </span>
                <button
                  className={`settings-toggle${stDraft.models.showOpus ? ' on' : ''}`}
                  onClick={() => updateModels('showOpus', !stDraft.models.showOpus)}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>

              <div className="settings-row">
                <span className="settings-row-label">
                  Show <code>[1m]</code> context variants
                  <span className="settings-row-hint">opus[1m], sonnet[1m] — 1M token context window</span>
                </span>
                <button
                  className={`settings-toggle${stDraft.models.showExtendedContext ? ' on' : ''}`}
                  onClick={() => updateModels('showExtendedContext', !stDraft.models.showExtendedContext)}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>

              <div className="settings-row">
                <span className="settings-row-label">
                  Show <code>opusplan</code>
                  <span className="settings-row-hint">Opus for planning → Sonnet for execution</span>
                </span>
                <button
                  className={`settings-toggle${stDraft.models.showOpusPlan ? ' on' : ''}`}
                  onClick={() => updateModels('showOpusPlan', !stDraft.models.showOpusPlan)}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>
            </>
          )}

          {/* ── History ── */}
          {activeTab === 'history' && (
            <>
              <div className="settings-row">
                <span className="settings-row-label">Auto-rotate (days)</span>
                <div className="settings-number">
                  <button
                    className="settings-number-btn"
                    onClick={() => updateHistory('rotateDays', Math.max(1, stDraft.history.rotateDays - 1))}
                  >-</button>
                  <span className="settings-number-value">{stDraft.history.rotateDays}</span>
                  <button
                    className="settings-number-btn"
                    onClick={() => updateHistory('rotateDays', stDraft.history.rotateDays + 1)}
                  >+</button>
                </div>
              </div>

              <div className="settings-row">
                <span className="settings-row-label">Load limit (rounds)</span>
                <div className="settings-number">
                  <button
                    className="settings-number-btn"
                    onClick={() => updateHistory('loadLimitRounds', Math.max(1, stDraft.history.loadLimitRounds - 1))}
                  >-</button>
                  <span className="settings-number-value">{stDraft.history.loadLimitRounds}</span>
                  <button
                    className="settings-number-btn"
                    onClick={() => updateHistory('loadLimitRounds', stDraft.history.loadLimitRounds + 1)}
                  >+</button>
                </div>
              </div>
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
    </div>
  );
}
