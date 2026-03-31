/**
 * App settings — client-side only, persisted in localStorage.
 */

export type DisplayMode = 'collapsed' | 'expanded' | 'hidden';

export interface AppSettings {
  appearance: {
    terminalFontSize: number;
    terminalFontFamily: string;
    terminalCursorBlink: boolean;
  };
  display: {
    thinking: DisplayMode;
    Read: DisplayMode;
    Write: DisplayMode;
    Edit: DisplayMode;
    Bash: DisplayMode;
    Grep: DisplayMode;
    Glob: DisplayMode;
    Task: DisplayMode;
    TodoWrite: DisplayMode;
    other: DisplayMode;
  };
  models: {
    /** Show extended context (1M) variants for opus/sonnet */
    showExtendedContext: boolean;
    /** Show explicit "opus" alias (when SDK only provides "default") */
    showOpus: boolean;
    /** Show "opusplan" (opus for planning, sonnet for execution) */
    showOpusPlan: boolean;
  };
  history: {
    rotateDays: number;
    loadLimitRounds: number;
  };
}

export const DISPLAY_KEYS: { key: keyof AppSettings['display']; label: string }[] = [
  { key: 'thinking', label: 'Thinking' },
  { key: 'Read', label: 'Read' },
  { key: 'Write', label: 'Write' },
  { key: 'Edit', label: 'Edit' },
  { key: 'Bash', label: 'Bash' },
  { key: 'Grep', label: 'Grep' },
  { key: 'Glob', label: 'Glob' },
  { key: 'Task', label: 'Task' },
  { key: 'TodoWrite', label: 'TodoWrite' },
  { key: 'other', label: 'Other Tools' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: {
    terminalFontSize: 13,
    terminalFontFamily: 'Menlo, Monaco, "Courier New", monospace',
    terminalCursorBlink: true,
  },
  display: {
    thinking: 'collapsed',
    Read: 'collapsed',
    Write: 'expanded',
    Edit: 'expanded',
    Bash: 'expanded',
    Grep: 'collapsed',
    Glob: 'collapsed',
    Task: 'collapsed',
    TodoWrite: 'collapsed',
    other: 'collapsed',
  },
  models: {
    showExtendedContext: true,
    showOpus: true,
    showOpusPlan: false,
  },
  history: {
    rotateDays: 30,
    loadLimitRounds: 10,
  },
};

const STORAGE_KEY = 'agent-terminal:settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
        display: { ...DEFAULT_SETTINGS.display, ...parsed.display },
        models: { ...DEFAULT_SETTINGS.models, ...parsed.models },
        history: { ...DEFAULT_SETTINGS.history, ...parsed.history },
      };
    }
  } catch { /* ignore */ }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
