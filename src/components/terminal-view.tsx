import React, { useEffect, useRef } from 'react';
import { Box } from 'ink';
import * as pty from 'node-pty';
import xtermHeadless from '@xterm/headless';
const { Terminal } = xtermHeadless;
import { logger } from '../core/logger.js';
import { drawProjectLine, type ProjectInfo } from './project-line.js';

interface TerminalViewProps {
  active: boolean;
  cwd?: string;
  onSwitchView: () => void;
  projects: ProjectInfo[];
  activeIndex: number;
}

const CTRL_W = 0x17;

// xterm.js v6 returns raw bitmask values from cell API
const CM_DEFAULT = 0;
const CM_P16 = 0x01000000;
const CM_P256 = 0x02000000;
const CM_RGB = 0x03000000;

/**
 * Reconstruct screen content from xterm-headless buffer as ANSI string.
 * Only called on view switch, so performance is not critical.
 */
function renderBuffer(xterm: Terminal): string {
  const buffer = xterm.buffer.active;
  const rows = xterm.rows;
  const cols = xterm.cols;
  let out = '\x1b[0m\x1b[H'; // reset + cursor home

  // Track previous cell attributes to minimize SGR output
  let pBold = 0, pDim = 0, pItalic = 0, pUnder = 0, pInverse = 0, pStrike = 0;
  let pFgMode = 0, pBgMode = 0, pFg = 0, pBg = 0;

  for (let y = 0; y < rows; y++) {
    if (y > 0) out += '\r\n';
    const line = buffer.getLine(y);
    if (!line) continue;

    for (let x = 0; x < cols; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;

      const bold = cell.isBold();
      const dim = cell.isDim();
      const italic = cell.isItalic();
      const under = cell.isUnderline();
      const inverse = cell.isInverse();
      const strike = cell.isStrikethrough();
      const fgMode = cell.getFgColorMode();
      const bgMode = cell.getBgColorMode();
      const fg = cell.getFgColor();
      const bg = cell.getBgColor();

      if (bold !== pBold || dim !== pDim || italic !== pItalic || under !== pUnder ||
          inverse !== pInverse || strike !== pStrike ||
          fgMode !== pFgMode || bgMode !== pBgMode || fg !== pFg || bg !== pBg) {

        const parts: number[] = [0]; // reset first
        if (bold) parts.push(1);
        if (dim) parts.push(2);
        if (italic) parts.push(3);
        if (under) parts.push(4);
        if (inverse) parts.push(7);
        if (strike) parts.push(9);

        // Foreground color
        if (fgMode === CM_P16) {
          if (fg < 8) parts.push(30 + fg);
          else parts.push(90 + fg - 8);
        } else if (fgMode === CM_P256) {
          parts.push(38, 5, fg);
        } else if (fgMode === CM_RGB) {
          parts.push(38, 2, (fg >> 16) & 0xff, (fg >> 8) & 0xff, fg & 0xff);
        }

        // Background color
        if (bgMode === CM_P16) {
          if (bg < 8) parts.push(40 + bg);
          else parts.push(100 + bg - 8);
        } else if (bgMode === CM_P256) {
          parts.push(48, 5, bg);
        } else if (bgMode === CM_RGB) {
          parts.push(48, 2, (bg >> 16) & 0xff, (bg >> 8) & 0xff, bg & 0xff);
        }

        out += `\x1b[${parts.join(';')}m`;
        pBold = bold; pDim = dim; pItalic = italic; pUnder = under;
        pInverse = inverse; pStrike = strike;
        pFgMode = fgMode; pBgMode = bgMode; pFg = fg; pBg = bg;
      }

      out += cell.getChars() || ' ';
    }
  }

  out += '\x1b[0m';
  out += `\x1b[${buffer.cursorY + 1};${buffer.cursorX + 1}H`;
  return out;
}

export default function TerminalView({ active, cwd, onSwitchView, projects, activeIndex }: TerminalViewProps) {
  const ptyRef = useRef<pty.IPty | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const activeRef = useRef(active);
  const projectsRef = useRef(projects);
  const activeIndexRef = useRef(activeIndex);

  activeRef.current = active;
  projectsRef.current = projects;
  activeIndexRef.current = activeIndex;

  // Spawn pty + xterm-headless on mount
  useEffect(() => {
    const shell = process.env.SHELL || '/bin/zsh';
    const cols = process.stdout.columns ?? 80;
    const rows = (process.stdout.rows ?? 24) - 1; // reserve 1 row for project line
    const spawnCwd = cwd ?? process.cwd();

    logger.debug(`pty.spawn: shell=${shell} cwd=${spawnCwd} cols=${cols} rows=${rows}`);

    try {
      const xterm = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true });
      xtermRef.current = xterm;

      const term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: spawnCwd,
        env: process.env as Record<string, string>,
      });
      ptyRef.current = term;

      // All pty output → xterm-headless (always) + stdout (when active)
      let redrawScheduled = false;
      term.onData((data: string) => {
        xterm.write(data);
        if (activeRef.current) {
          process.stdout.write(data);
          if (!redrawScheduled) {
            redrawScheduled = true;
            setImmediate(() => {
              redrawScheduled = false;
              if (activeRef.current) {
                drawProjectLine(projectsRef.current, activeIndexRef.current);
              }
            });
          }
        }
      });

      return () => {
        term.kill();
        xterm.dispose();
        ptyRef.current = null;
        xtermRef.current = null;
      };
    } catch (err) {
      logger.error(`Failed to spawn terminal: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [cwd]);

  // Handle view activation: render screen from xterm buffer
  useEffect(() => {
    const term = ptyRef.current;
    const xterm = xtermRef.current;
    if (!active || !term || !xterm) return;

    const rows = process.stdout.rows;
    const cols = process.stdout.columns;
    const ptyRows = rows - 1;

    // Show cursor, clear screen
    process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');

    // Set scroll region (leave last row for project line)
    process.stdout.write(`\x1b[1;${ptyRows}r`);
    process.stdout.write('\x1b[H');

    // Sync sizes
    term.resize(cols, ptyRows);
    xterm.resize(cols, ptyRows);

    // Flush xterm write queue, then render from buffer
    xterm.write('', () => {
      process.stdout.write(renderBuffer(xterm));
      drawProjectLine(projectsRef.current, activeIndexRef.current);
    });

    // stdin → pty (intercept Ctrl+W)
    const onStdin = (data: Buffer) => {
      if (data.length === 1 && data[0] === CTRL_W) {
        process.stdout.write('\x1b[r\x1b[?25l\x1b[2J\x1b[H');
        onSwitchView();
        return;
      }
      term.write(data.toString('utf8'));
    };

    const stdin = process.stdin;
    stdin.on('data', onStdin);

    return () => {
      stdin.off('data', onStdin);
      // Scroll region already reset in Ctrl+W handler before onSwitchView()
    };
  }, [active, onSwitchView]);

  // Redraw project line when project info changes
  useEffect(() => {
    if (activeRef.current) {
      drawProjectLine(projects, activeIndex);
    }
  }, [projects, activeIndex]);

  // Handle terminal resize
  useEffect(() => {
    const term = ptyRef.current;
    const xterm = xtermRef.current;
    if (!term || !xterm) return;

    const onResize = () => {
      const rows = process.stdout.rows;
      const cols = process.stdout.columns;
      const ptyRows = rows - 1;
      term.resize(cols, ptyRows);
      xterm.resize(cols, ptyRows);
      if (activeRef.current) {
        process.stdout.write(`\x1b[1;${ptyRows}r`);
        drawProjectLine(projectsRef.current, activeIndexRef.current);
      }
    };
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  return null;
}
