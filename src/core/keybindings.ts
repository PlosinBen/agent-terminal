import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Keybindings {
  switchView: string;
  switchProject: string;
  newProject: string;
  closeProject: string;
  quit: string;
  interrupt: string;
  paste: string;
  scrollUp: string;
  scrollDown: string;
}

const MAC_DEFAULTS: Keybindings = {
  switchView: 'cmd+left/right',
  switchProject: 'cmd+1~9',
  newProject: 'ctrl+n',
  closeProject: 'ctrl+w',
  quit: 'ctrl+d',
  interrupt: 'ctrl+c',
  paste: 'ctrl+v',
  scrollUp: 'pgup',
  scrollDown: 'pgdn',
};

const DEFAULT_KEYBINDINGS: Keybindings = {
  switchView: 'alt+left/right',
  switchProject: 'alt+1~9',
  newProject: 'ctrl+n',
  closeProject: 'ctrl+w',
  quit: 'ctrl+d',
  interrupt: 'ctrl+c',
  paste: 'ctrl+v',
  scrollUp: 'pgup',
  scrollDown: 'pgdn',
};

const CONFIG_PATH = path.join(os.homedir(), '.config', 'agent-terminal', 'keybindings.json');

export function loadKeybindings(): Keybindings {
  const defaults = os.platform() === 'darwin' ? MAC_DEFAULTS : DEFAULT_KEYBINDINGS;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function saveKeybindings(keybindings: Keybindings): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(keybindings, null, 2));
}
