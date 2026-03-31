import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AppConfig {
  agent: {
    backend: string;
    model: string;
  };
  display: {
    thinking: 'collapsed' | 'expanded' | 'hidden';
    text: 'expanded';
    tool: Record<string, 'collapsed' | 'expanded' | 'hidden'>;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
  };
}

const DEFAULT_CONFIG: AppConfig = {
  agent: {
    backend: 'claude',
    model: 'default',
  },
  display: {
    thinking: 'collapsed',
    text: 'expanded',
    tool: {
      default: 'collapsed',
      Write: 'expanded',
      Edit: 'expanded',
      Bash: 'expanded',
    },
  },
  logging: {
    level: 'info',
  },
};

const CONFIG_DIR = path.join(os.homedir(), '.config', 'agent-terminal');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
