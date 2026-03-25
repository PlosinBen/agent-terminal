import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import * as pty from 'node-pty';

interface TerminalViewProps {
  active: boolean;
  cwd?: string;
}

export default function TerminalView({ active, cwd }: TerminalViewProps) {
  const [output, setOutput] = useState<string[]>([]);
  const ptyRef = useRef<pty.IPty | null>(null);
  const { stdout } = useStdout();
  const maxLines = (stdout?.rows ?? 24) - 4; // Reserve space for status/project lines

  useEffect(() => {
    const shell = process.env.SHELL || '/bin/bash';
    const cols = stdout?.columns ?? 80;
    const rows = stdout?.rows ?? 24;

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd ?? process.cwd(),
      env: process.env as Record<string, string>,
    });

    term.onData((data: string) => {
      // Strip ANSI escape sequences for basic display
      const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      setOutput(prev => {
        const lines = [...prev, ...clean.split('\n')];
        return lines.slice(-200); // Keep last 200 lines
      });
    });

    ptyRef.current = term;

    return () => {
      term.kill();
      ptyRef.current = null;
    };
  }, [cwd]);

  useInput((ch, key) => {
    if (!active || !ptyRef.current) return;

    // Forward key events to PTY
    if (key.return) {
      ptyRef.current.write('\r');
    } else if (key.backspace || key.delete) {
      ptyRef.current.write('\x7f');
    } else if (key.ctrl && ch === 'c') {
      ptyRef.current.write('\x03');
    } else if (key.ctrl && ch === 'd') {
      ptyRef.current.write('\x04');
    } else if (key.upArrow) {
      ptyRef.current.write('\x1b[A');
    } else if (key.downArrow) {
      ptyRef.current.write('\x1b[B');
    } else if (key.leftArrow) {
      ptyRef.current.write('\x1b[D');
    } else if (key.rightArrow) {
      ptyRef.current.write('\x1b[C');
    } else if (key.tab) {
      ptyRef.current.write('\t');
    } else if (ch) {
      ptyRef.current.write(ch);
    }
  });

  const visibleLines = output.slice(-maxLines);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visibleLines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
