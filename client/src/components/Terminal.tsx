import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { UpstreamMessage, DownstreamMessage } from '@shared/protocol';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface Props {
  projectId: string;
  visible: boolean;
  send: (msg: UpstreamMessage) => void;
  onMessage: (handler: (msg: DownstreamMessage) => void) => () => void;
}

export function Terminal({ projectId, visible, send, onMessage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);
  const openedRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const sendRef = useRef(send);
  sendRef.current = send;

  // Create xterm instance once on mount (but don't open yet)
  useEffect(() => {
    const term = new XTerm({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      },
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send input to server
    term.onData((data) => {
      sendRef.current({ type: 'pty:input', projectId: projectIdRef.current, data });
    });

    return () => {
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      openedRef.current = false;
    };
  }, []);

  // Listen for pty:output and pty:exit
  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (!('projectId' in msg) || msg.projectId !== projectIdRef.current) return;

      if (msg.type === 'pty:output') {
        xtermRef.current?.write(msg.data);
      } else if (msg.type === 'pty:exit') {
        xtermRef.current?.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        spawnedRef.current = false;
      }
    });
    return unsub;
  }, [onMessage]);

  // Open xterm, fit, and spawn when first visible
  useEffect(() => {
    if (!visible || !containerRef.current || !xtermRef.current) return;

    // Open xterm into DOM on first visibility
    if (!openedRef.current) {
      openedRef.current = true;
      xtermRef.current.open(containerRef.current);
    }

    // Fit after layout settles
    const timer = setTimeout(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        send({
          type: 'pty:resize',
          projectId: projectIdRef.current,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        });
      }
    }, 50);

    // Spawn if not yet spawned
    if (!spawnedRef.current) {
      spawnedRef.current = true;
      send({ type: 'pty:spawn', projectId, requestId: `pty_${Date.now()}` });
    }

    xtermRef.current.focus();

    return () => clearTimeout(timer);
  }, [visible, projectId, send]);

  // Handle window resize
  useEffect(() => {
    const onResize = () => {
      if (!visible || !fitAddonRef.current || !xtermRef.current) return;
      fitAddonRef.current.fit();
      sendRef.current({
        type: 'pty:resize',
        projectId: projectIdRef.current,
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}
