import type { DownstreamMessage } from '../shared/protocol.js';
import type { ProjectSession } from '../session-manager.js';
import { logger } from '../core/logger.js';
import * as pty from 'node-pty';

export function handlePtySpawn(
  session: ProjectSession,
  msg: { projectId: string; requestId: string },
  send: (reply: DownstreamMessage) => void,
): void {
  // Already spawned — just reply
  if (session.ptyProcess) {
    logger.info(`[pty:spawn] already spawned for ${msg.projectId}`);
    send({ type: 'pty:spawned', projectId: msg.projectId, requestId: msg.requestId });
    return;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  logger.info(`[pty:spawn] spawning ${shell} in ${session.project.cwd}, PATH=${process.env.PATH?.slice(0, 100)}`);

  let ptyProc: pty.IPty;
  try {
    ptyProc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: session.project.cwd,
      env: { ...process.env } as Record<string, string>,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`[pty:spawn] failed: ${error}`);
    send({ type: 'pty:exit', projectId: msg.projectId, exitCode: 1 });
    return;
  }

  session.ptyProcess = ptyProc;
  logger.info(`[pty:spawn] spawned pid=${ptyProc.pid}`);

  ptyProc.onData((data: string) => {
    send({ type: 'pty:output', projectId: msg.projectId, data });
  });

  ptyProc.onExit(({ exitCode }) => {
    session.ptyProcess = null;
    send({ type: 'pty:exit', projectId: msg.projectId, exitCode });
  });

  send({ type: 'pty:spawned', projectId: msg.projectId, requestId: msg.requestId });
}

export function handlePtyInput(session: ProjectSession, msg: { data: string }): void {
  if (session.ptyProcess) {
    session.ptyProcess.write(msg.data);
  }
}

export function handlePtyResize(session: ProjectSession, msg: { cols: number; rows: number }): void {
  if (session.ptyProcess) {
    session.ptyProcess.resize(msg.cols, msg.rows);
  }
}

export function cleanupPty(session: ProjectSession): void {
  if (session.ptyProcess) {
    session.ptyProcess.kill();
    session.ptyProcess = null;
  }
}
