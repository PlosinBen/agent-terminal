export const COMMANDS = [
  { name: 'clear', args: '', desc: '清除畫面' },
  { name: 'quit', args: '', desc: '離開' },
  { name: 'help', args: '', desc: '顯示說明' },
];

export interface CommandResult {
  type: 'message' | 'action';
  content: string;
  action?: string;
}

export function parseCommand(input: string): { command: string; args: string } | null {
  if (!input.startsWith('/')) return null;
  const spaceIdx = input.indexOf(' ');
  if (spaceIdx === -1) return { command: input.slice(1), args: '' };
  return { command: input.slice(1, spaceIdx), args: input.slice(spaceIdx + 1).trim() };
}

export function executeCommand(command: string): CommandResult | null {
  switch (command) {
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
          '  /clear           — Clear screen',
          '  /quit            — Exit',
          '  /help            — Show this help',
          '',
          'Shortcuts:',
          '  Ctrl+W           — Switch Agent/Terminal view',
          '  Alt+1~9          — Switch project',
          '  Ctrl+N           — New project',
          '  Ctrl+D           — Quit',
          '',
          'Provider commands and SDK slash commands are also available.',
          'Type / to see autocomplete.',
        ].join('\n'),
      };

    default:
      return null; // Not an app command, let provider handle it
  }
}
