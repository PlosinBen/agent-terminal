import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { UpstreamMessage, DownstreamMessage } from '@shared/protocol';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface Props {
  projectId: string;
  visible: boolean;
  connected: boolean;
  send: (msg: UpstreamMessage) => void;
  onMessage: (handler: (msg: DownstreamMessage) => void) => () => void;
}

export function Terminal({ projectId, visible, connected, send, onMessage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'idle' | 'spawning' | 'ready'>('idle');
  const [hasOutput, setHasOutput] = useState(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const sendRef = useRef(send);
  sendRef.current = send;
  const bufferRef = useRef<string[]>([]);
  const hasOutputRef = useRef(false);

  // Listen for pty:spawned, pty:output, pty:exit
  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (!('projectId' in msg) || msg.projectId !== projectIdRef.current) return;

      if (msg.type === 'pty:spawned') {
        setStatus('ready');
      } else if (msg.type === 'pty:output') {
        if (xtermRef.current) {
          xtermRef.current.write(msg.data);
          if (!hasOutputRef.current) {
            hasOutputRef.current = true;
            setHasOutput(true);
          }
        } else {
          bufferRef.current.push(msg.data);
        }
      } else if (msg.type === 'pty:exit') {
        xtermRef.current?.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        setStatus('idle');
      }
    });
    return unsub;
  }, [onMessage]);

  // When visible + connected + idle → send pty:spawn
  useEffect(() => {
    if (!visible || !connected || status !== 'idle') return;
    setStatus('spawning');
    send({ type: 'pty:spawn', projectId, requestId: `pty_${Date.now()}` });
  }, [visible, connected, status, projectId, send]);

  // When status becomes ready + visible → create xterm and open
  useEffect(() => {
    if (status !== 'ready' || !visible || !containerRef.current) return;

    if (xtermRef.current) {
      fitAddonRef.current?.fit();
      xtermRef.current.focus();
      return;
    }

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

    term.open(containerRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    if (bufferRef.current.length > 0) {
      for (const data of bufferRef.current) {
        term.write(data);
      }
      bufferRef.current = [];
      hasOutputRef.current = true;
      setHasOutput(true);
    }

    term.onData((data) => {
      sendRef.current({ type: 'pty:input', projectId: projectIdRef.current, data });
    });

    requestAnimationFrame(() => {
      fitAddon.fit();
      sendRef.current({
        type: 'pty:resize',
        projectId: projectIdRef.current,
        cols: term.cols,
        rows: term.rows,
      });
      term.focus();
    });
  }, [status, visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      bufferRef.current = [];
    };
  }, []);

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

  // Re-fit when switching back to terminal tab
  useEffect(() => {
    if (!visible || !xtermRef.current || !fitAddonRef.current) return;
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      xtermRef.current?.focus();
    });
  }, [visible]);

  if (!visible) return null;

  const showPlaceholder = !hasOutput;

  return (
    <>
      {showPlaceholder && (
        <div className="terminal-placeholder">
          {!connected ? 'Connecting to server...' : 'Starting terminal...'}
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-container"
        style={{ display: showPlaceholder ? 'none' : undefined }}
      />
    </>
  );
}
