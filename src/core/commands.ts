import { listSessions } from './session.js';

export const MODELS = [
  { name: 'opus', desc: 'Claude Opus — 最強' },
  { name: 'sonnet', desc: 'Claude Sonnet — 平衡' },
  { name: 'haiku', desc: 'Claude Haiku — 快速' },
];

export const COMMANDS = [
  { name: 'mode', args: '<mode>', desc: '設定權限模式', options: ['default', 'acceptEdits', 'bypassPermissions', 'plan'] },
  { name: 'model', args: '<name>', desc: '設定模型', options: MODELS.map(m => m.name) },
  { name: 'sessions', args: '', desc: '列出已存 sessions' },
  { name: 'resume', args: '[id]', desc: '恢復 session' },
  { name: 'fork', args: '', desc: 'Fork 當前 session' },
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

export function executeCommand(command: string, args: string, cwd?: string): CommandResult {
  switch (command) {
    case 'mode':
      if (!args) return { type: 'message', content: 'Usage: /mode <default|acceptEdits|bypassPermissions|plan>' };
      return { type: 'action', content: `Permission mode set to: ${args}`, action: 'setMode', payload: args };

    case 'model':
      if (!args) return { type: 'message', content: 'Usage: /model <name>' };
      return { type: 'action', content: `Model set to: ${args}`, action: 'setModel', payload: args };

    case 'clear':
      return { type: 'action', content: 'Screen cleared', action: 'clear' };

    case 'sessions': {
      const sessions = listSessions(cwd);
      if (sessions.length === 0) {
        return { type: 'message', content: 'No saved sessions.' };
      }
      const list = sessions.map((s, i) =>
        `  ${i + 1}. ${s.id} — ${s.numTurns}t, $${s.totalCostUsd.toFixed(3)}, ${s.updatedAt}`
      ).join('\n');
      return { type: 'message', content: `Sessions:\n${list}` };
    }

    case 'resume':
      if (!args) {
        const sessions = listSessions(cwd);
        if (sessions.length === 0) return { type: 'message', content: 'No sessions to resume.' };
        const list = sessions.slice(0, 5).map((s, i) =>
          `  ${i + 1}. ${s.id} — ${s.numTurns}t, ${s.updatedAt}`
        ).join('\n');
        return { type: 'message', content: `Recent sessions:\n${list}\n\nUsage: /resume <session-id>` };
      }
      return { type: 'action', content: `Resuming session: ${args}`, action: 'resume', payload: args };

    case 'fork':
      return { type: 'action', content: 'Forking current session...', action: 'fork' };

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
          '  /sessions        — List saved sessions',
          '  /resume [id]     — Resume a session',
          '  /fork            — Fork current session',
          '  /clear           — Clear screen',
          '  /quit            — Exit',
          '  /help            — Show this help',
          '',
          'Shortcuts:',
          '  Alt+←/→          — Switch Agent/Terminal view',
          '  Alt+1~9          — Switch project',
          '  Ctrl+N           — New project',
          '  Ctrl+W           — Close project',
          '  Ctrl+D           — Quit',
        ].join('\n'),
      };

    default:
      return { type: 'message', content: `Unknown command: /${command}. Type /help for available commands.` };
  }
}
