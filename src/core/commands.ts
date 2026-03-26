export const COMMANDS = [
  { name: 'mode', args: '<mode>', desc: '設定權限模式' },
  { name: 'model', args: '<name>', desc: '設定模型' },
  { name: 'effort', args: '<level>', desc: '設定思考程度' },
  { name: 'clear', args: '', desc: '清除畫面' },
  { name: 'quit', args: '', desc: '離開' },
  { name: 'help', args: '', desc: '顯示說明' },
];

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

    case 'effort':
      if (!args) return { type: 'message', content: 'Usage: /effort <low|medium|high|max>' };
      return { type: 'action', content: `Effort set to: ${args}`, action: 'setEffort', payload: args };

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
          '  /mode <mode>     — Set permission mode',
          '  /model <name>    — Set model',
          '  /effort <level>  — Set effort level',
          '  /clear           — Clear screen',
          '  /quit            — Exit',
          '  /help            — Show this help',
          '',
          'Shortcuts:',
          '  Ctrl+W           — Switch Agent/Terminal view',
          '  Alt+1~9          — Switch project',
          '  Ctrl+N           — New project',
          '  Ctrl+D           — Quit',
        ].join('\n'),
      };

    default:
      return { type: 'message', content: `Unknown command: /${command}. Type /help for available commands.` };
  }
}
