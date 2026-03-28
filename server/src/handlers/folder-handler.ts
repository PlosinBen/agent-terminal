import type { DownstreamMessage } from '../shared/protocol.js';
import { readdirSync } from 'fs';
import path from 'path';
import os from 'os';

export function handleFolderList(
  msg: { path: string; requestId: string },
  send: (reply: DownstreamMessage) => void,
): void {
  try {
    // Resolve ~ to home directory
    const resolvedPath = msg.path.startsWith('~')
      ? path.join(os.homedir(), msg.path.slice(1))
      : path.resolve(msg.path);

    const entries = readdirSync(resolvedPath, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort((a, b) => {
        // dot-files after normal entries
        const aDot = a.startsWith('.');
        const bDot = b.startsWith('.');
        if (aDot !== bDot) return aDot ? 1 : -1;
        return a.localeCompare(b);
      });

    send({
      type: 'folder:list_result',
      requestId: msg.requestId,
      path: resolvedPath,
      entries,
    });
  } catch (err) {
    send({
      type: 'folder:list_result',
      requestId: msg.requestId,
      path: msg.path,
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function handleServerInfo(
  msg: { requestId: string },
  send: (reply: DownstreamMessage) => void,
): void {
  send({
    type: 'server:info_result',
    requestId: msg.requestId,
    homePath: os.homedir(),
    hostname: os.hostname(),
  });
}
