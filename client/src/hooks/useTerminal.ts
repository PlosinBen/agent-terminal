import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { AgentService } from '../service/agent-service';
import type { ProjectInfo } from '../types/project';
import type { AppSettings } from '../settings';
import { ServiceEvent } from '../service/types';

export function useTerminal(project: ProjectInfo, visible: boolean, service: AgentService, appearance: AppSettings['appearance']) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'idle' | 'spawning' | 'ready'>('idle');
  const [hasOutput, setHasOutput] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const bufferRef = useRef<string[]>([]);
  const hasOutputRef = useRef(false);

  const connected = project.connectionStatus === 'connected';

  // Listen for pty:output and pty:exit via service events
  useEffect(() => {
    const unsubs = [
      service.on(ServiceEvent.PtyOutput, (payload) => {
        const msg = payload as { projectId: string; data: string };
        if (msg.projectId !== projectRef.current.id) return;
        if (xtermRef.current) {
          xtermRef.current.write(msg.data);
          if (!hasOutputRef.current) {
            hasOutputRef.current = true;
            setHasOutput(true);
          }
        } else {
          bufferRef.current.push(msg.data);
        }
      }),
      service.on(ServiceEvent.PtyExit, (payload) => {
        const msg = payload as { projectId: string; exitCode: number };
        if (msg.projectId !== projectRef.current.id) return;
        xtermRef.current?.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        setStatus('idle');
      }),
    ];
    return () => { for (const unsub of unsubs) unsub(); };
  }, [service]);

  // When visible + connected + idle → spawn pty via service
  useEffect(() => {
    if (!visible || !connected || status !== 'idle') return;
    setStatus('spawning');
    service.spawnPty(projectRef.current).then(() => {
      setStatus('ready');
    });
  }, [visible, connected, status, service]);

  // When status becomes ready + visible → create xterm and open
  useEffect(() => {
    if (status !== 'ready' || !visible || !containerRef.current) return;

    if (xtermRef.current) {
      fitAddonRef.current?.fit();
      xtermRef.current.focus();
      return;
    }

    const term = new XTerm({
      fontFamily: appearance.terminalFontFamily,
      fontSize: appearance.terminalFontSize,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      },
      cursorBlink: appearance.terminalCursorBlink,
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
      serviceRef.current.sendPtyInput(projectRef.current, data);
    });

    requestAnimationFrame(() => {
      fitAddon.fit();
      serviceRef.current.resizePty(projectRef.current, term.cols, term.rows);
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
      serviceRef.current.resizePty(projectRef.current, xtermRef.current.cols, xtermRef.current.rows);
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

  // Live-update terminal options when appearance changes
  useEffect(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.options.fontSize = appearance.terminalFontSize;
    term.options.fontFamily = appearance.terminalFontFamily;
    term.options.cursorBlink = appearance.terminalCursorBlink;
    fitAddonRef.current?.fit();
    if (xtermRef.current) {
      serviceRef.current.resizePty(projectRef.current, xtermRef.current.cols, xtermRef.current.rows);
    }
  }, [appearance.terminalFontSize, appearance.terminalFontFamily, appearance.terminalCursorBlink]);

  return { containerRef, status, hasOutput, connected };
}
