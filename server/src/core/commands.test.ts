import { describe, it, expect } from 'vitest';
import { parseCommand, executeCommand } from './commands.js';

describe('parseCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });

  it('parses command without args', () => {
    expect(parseCommand('/clear')).toEqual({ command: 'clear', args: '' });
    expect(parseCommand('/quit')).toEqual({ command: 'quit', args: '' });
  });

  it('parses command with args', () => {
    expect(parseCommand('/model gpt-4')).toEqual({ command: 'model', args: 'gpt-4' });
  });

  it('trims args whitespace', () => {
    expect(parseCommand('/model   opus  ')).toEqual({ command: 'model', args: 'opus' });
  });
});

describe('executeCommand', () => {
  it('returns action for clear', () => {
    const result = executeCommand('clear');
    expect(result).toEqual({ type: 'action', content: 'Screen cleared', action: 'clear' });
  });

  it('returns action for quit', () => {
    const result = executeCommand('quit');
    expect(result?.action).toBe('quit');
  });

  it('returns action for exit (alias)', () => {
    const result = executeCommand('exit');
    expect(result?.action).toBe('quit');
  });

  it('returns message for help', () => {
    const result = executeCommand('help');
    expect(result?.type).toBe('message');
    expect(result?.content).toContain('Commands:');
  });

  it('returns null for unknown command', () => {
    expect(executeCommand('unknown')).toBeNull();
  });
});
