/**
 * Configurable keybindings — client-side only.
 *
 * Binding format:  "mod+b", "alt+shift+o", "ctrl+ArrowUp", etc.
 *   mod = Cmd on macOS, Ctrl elsewhere
 *   Modifiers: ctrl, alt, shift, meta, mod
 *   Key: any KeyboardEvent.key value (case-insensitive for letters)
 */

export type Action =
  | 'toggleSidebar'
  | 'newProject'
  | 'closeProject'
  | 'prevProject'
  | 'nextProject'
  | 'toggleTerminal'
  | 'nextTab'
  | 'prevTab';

export type KeybindingConfig = Record<Action, string>;

const DEFAULTS: KeybindingConfig = {
  toggleSidebar: 'mod+b',
  newProject: 'mod+o',
  closeProject: 'mod+w',
  prevProject: 'mod+ArrowUp',
  nextProject: 'mod+ArrowDown',
  toggleTerminal: 'mod+`',
  nextTab: 'mod+ArrowRight',
  prevTab: 'mod+ArrowLeft',
};

const STORAGE_KEY = 'agent-terminal:keybindings';
const IS_MAC = navigator.platform.toUpperCase().includes('MAC');

// ── Parse & Match ──

interface ParsedBinding {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string; // lowercase for letters, original for special keys
}

function parseBinding(binding: string): ParsedBinding {
  const parts = binding.split('+');
  const key = parts.pop()!;
  const mods = new Set(parts.map(m => m.toLowerCase()));

  // Expand "mod" to platform-specific modifier
  const modExpanded = mods.has('mod');
  mods.delete('mod');

  return {
    ctrl: mods.has('ctrl') || (modExpanded && !IS_MAC),
    alt: mods.has('alt'),
    shift: mods.has('shift'),
    meta: mods.has('meta') || (modExpanded && IS_MAC),
    key: key.length === 1 ? key.toLowerCase() : key,
  };
}

export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const b = parseBinding(binding);
  if (e.ctrlKey !== b.ctrl) return false;
  if (e.altKey !== b.alt) return false;
  if (e.shiftKey !== b.shift) return false;
  if (e.metaKey !== b.meta) return false;

  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return eventKey === b.key;
}

// ── Load / Save ──

export function loadKeybindings(): KeybindingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveKeybindings(config: Partial<KeybindingConfig>): void {
  const merged = { ...loadKeybindings(), ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

// ── Display ──

/** Format a binding string for display: "mod+b" → "⌘B" or "Ctrl+B" */
export function formatBinding(binding: string): string {
  const parts = binding.split('+');
  const key = parts.pop()!;
  const display: string[] = [];

  for (const mod of parts) {
    const m = mod.toLowerCase();
    if (m === 'mod') {
      display.push(IS_MAC ? '\u2318' : 'Ctrl');
    } else if (m === 'ctrl') {
      display.push(IS_MAC ? '\u2303' : 'Ctrl');
    } else if (m === 'alt') {
      display.push(IS_MAC ? '\u2325' : 'Alt');
    } else if (m === 'shift') {
      display.push(IS_MAC ? '\u21E7' : 'Shift');
    } else if (m === 'meta') {
      display.push(IS_MAC ? '\u2318' : 'Win');
    }
  }

  // Format key
  const keyDisplay = key.length === 1 ? key.toUpperCase() : key;
  display.push(keyDisplay);

  return IS_MAC ? display.join('') : display.join('+');
}
