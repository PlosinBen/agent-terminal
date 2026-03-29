import { describe, it, expect } from 'vitest';
import os from 'os';
import type { DownstreamMessage } from '../shared/protocol.js';
import { handleFolderList, handleServerInfo } from './folder-handler.js';

function collect(fn: (send: (msg: DownstreamMessage) => void) => void): DownstreamMessage[] {
  const replies: DownstreamMessage[] = [];
  fn((msg) => replies.push(msg));
  return replies;
}

describe('handleFolderList', () => {
  it('lists directories from home', () => {
    const replies = collect((send) =>
      handleFolderList({ path: os.homedir(), requestId: 'r1' }, send),
    );
    expect(replies).toHaveLength(1);
    const result = replies[0] as any;
    expect(result.type).toBe('folder:list_result');
    expect(result.requestId).toBe('r1');
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('resolves ~ to home directory', () => {
    const replies = collect((send) =>
      handleFolderList({ path: '~', requestId: 'r2' }, send),
    );
    const result = replies[0] as any;
    expect(result.path).toBe(os.homedir());
  });

  it('sorts dot-files after normal entries', () => {
    const replies = collect((send) =>
      handleFolderList({ path: os.homedir(), requestId: 'r3' }, send),
    );
    const entries = (replies[0] as any).entries as string[];
    const firstDotIdx = entries.findIndex((e: string) => e.startsWith('.'));
    let lastNormalIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!entries[i].startsWith('.')) { lastNormalIdx = i; break; }
    }
    if (firstDotIdx !== -1 && lastNormalIdx !== -1) {
      expect(firstDotIdx).toBeGreaterThan(lastNormalIdx);
    }
  });

  it('returns error for nonexistent path', () => {
    const replies = collect((send) =>
      handleFolderList({ path: '/nonexistent-path-xyz', requestId: 'r4' }, send),
    );
    const result = replies[0] as any;
    expect(result.entries).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe('handleServerInfo', () => {
  it('returns homePath and hostname', () => {
    const replies = collect((send) =>
      handleServerInfo({ requestId: 'r5' }, send),
    );
    const result = replies[0] as any;
    expect(result.type).toBe('server:info_result');
    expect(result.requestId).toBe('r5');
    expect(result.homePath).toBe(os.homedir());
    expect(result.hostname).toBe(os.hostname());
  });
});
