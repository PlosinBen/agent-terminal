import type { ProviderConfig } from './types/message';

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
  { name: 'help', description: 'Show help', argumentHint: '' },
];

const PERMISSION_MODE_LABELS: Record<string, string> = {
  default: 'Prompt',
  acceptEdits: 'AcceptEdits',
  bypassPermissions: 'BypassPermissions',
  plan: 'Plan',
  dontAsk: 'AutoDeny',
};

export function buildCommandList(providerConfig?: ProviderConfig | null): CommandDef[] {
  const commands: CommandDef[] = [...APP_COMMANDS];

  if (providerConfig) {
    commands.push({
      name: 'model',
      description: 'Switch model',
      argumentHint: '<name>',
      options: providerConfig.models.map(m => ({ value: m.value, label: m.displayName })),
    });
    commands.push({
      name: 'mode',
      description: 'Switch permission mode',
      argumentHint: '<mode>',
      options: providerConfig.permissionModes.map(m => ({ value: m, label: PERMISSION_MODE_LABELS[m] ?? m })),
    });
    commands.push({
      name: 'effort',
      description: 'Switch effort level',
      argumentHint: '<level>',
      options: providerConfig.effortLevels.map(e => ({ value: e, label: e })),
    });

    if (providerConfig.slashCommands) {
      for (const cmd of providerConfig.slashCommands) {
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
