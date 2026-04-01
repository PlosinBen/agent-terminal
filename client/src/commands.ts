import type { ProviderConfig } from './types/message';
import { PERMISSION_MODE_LABELS } from '@shared/types';

export interface CommandOption {
  value: string;
  label: string;
}

export interface CommandDef {
  name: string;
  description: string;
  argumentHint: string;
  options?: CommandOption[];
}

const APP_COMMANDS: CommandDef[] = [
  { name: 'clear', description: 'Clear screen', argumentHint: '' },
  {
    name: 'export', description: 'Export chat history', argumentHint: '<md|json>',
    options: [
      { value: 'md', label: 'Markdown' },
      { value: 'json', label: 'JSON' },
    ],
  },
];

export function buildCommandList(providerConfig?: ProviderConfig | null): CommandDef[] {
  const commands: CommandDef[] = [...APP_COMMANDS];

  if (providerConfig) {
    if (providerConfig.models.length > 0) {
      commands.push({
        name: 'model',
        description: 'Switch model',
        argumentHint: '<name>',
        options: providerConfig.models.map(m => ({ value: m.value, label: m.displayName })),
      });
    }
    if (providerConfig.permissionModes.length > 0) {
      commands.push({
        name: 'mode',
        description: 'Switch permission mode',
        argumentHint: '<mode>',
        options: providerConfig.permissionModes.map(m => ({ value: m, label: PERMISSION_MODE_LABELS[m] ?? m })),
      });
    }
    if (providerConfig.effortLevels.length > 0) {
      commands.push({
        name: 'effort',
        description: 'Switch effort level',
        argumentHint: '<level>',
        options: providerConfig.effortLevels.map(e => ({ value: e, label: e })),
      });
    }

    if (providerConfig.slashCommands) {
      // Filter out commands already handled client-side
      const clientHandled = new Set(['model', 'mode', 'effort', 'clear']);
      for (const cmd of providerConfig.slashCommands) {
        if (clientHandled.has(cmd.name)) continue;
        commands.push({
          name: cmd.name,
          description: cmd.description,
          argumentHint: cmd.argumentHint,
        });
      }
    }
  }

  return commands;
}
