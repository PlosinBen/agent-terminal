export interface CommandResult {
  type: 'message' | 'action';
  content: string;
  action?: string;
  payload?: unknown;
}

export function parseCommand(input: string): { command: string; args: string } | null {
  if (!input.startsWith('/')) return null;
  const spaceIdx = input.indexOf(' ');
  if (spaceIdx === -1) return { command: input.slice(1), args: '' };
  return { command: input.slice(1, spaceIdx), args: input.slice(spaceIdx + 1).trim() };
}

export function executeCommand(command: string, args: string): CommandResult {
  switch (command) {
    case 'mode':
      if (!args) return { type: 'message', content: 'Usage: /mode <default|acceptEdits|bypassPermissions|plan>' };
      return { type: 'action', content: `Permission mode set to: ${args}`, action: 'setMode', payload: args };

    case 'model':
      if (!args) return { type: 'message', content: 'Usage: /model <name>' };
      return { type: 'action', content: `Model set to: ${args}`, action: 'setModel', payload: args };

    case 'clear':
      return { type: 'action', content: 'Screen cleared', action: 'clear' };

    case 'quit':
    case 'exit':
      return { type: 'action', content: 'Goodbye', action: 'quit' };

    case 'help':
      return {
        type: 'message',
        content: [
          'Commands:',
          '  /mode <mode>   — Set permission mode (default/acceptEdits/bypassPermissions/plan)',
          '  /model <name>  — Set model',
          '  /clear         — Clear screen',
          '  /quit          — Exit',
          '  /help          — Show this help',
          '',
          'Shortcuts:',
          '  Alt+←/→        — Switch Agent/Terminal view',
          '  Alt+1~9        — Switch project',
          '  Ctrl+N         — New project',
          '  Ctrl+W         — Close project',
          '  Ctrl+D         — Quit',
        ].join('\n'),
      };

    default:
      return { type: 'message', content: `Unknown command: /${command}. Type /help for available commands.` };
  }
}
