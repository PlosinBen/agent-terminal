import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Message } from '../components/message-list.js';

export interface SessionMetadata {
  id: string;
  sdkSessionId?: string;
  cwd: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  numTurns: number;
  permissionMode: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData {
  metadata: SessionMetadata;
  messages: Message[];
}

const SESSIONS_DIR = path.join(os.homedir(), '.config', 'agent-terminal', 'sessions');

function ensureDir(): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

export function generateSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveSession(data: SessionData): void {
  ensureDir();
  data.metadata.updatedAt = new Date().toISOString();
  fs.writeFileSync(sessionPath(data.metadata.id), JSON.stringify(data, null, 2));
}

export function loadSession(id: string): SessionData | null {
  try {
    const raw = fs.readFileSync(sessionPath(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function listSessions(cwd?: string): SessionMetadata[] {
  ensureDir();
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  const sessions: SessionMetadata[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8');
      const data: SessionData = JSON.parse(raw);
      if (!cwd || data.metadata.cwd === cwd) {
        sessions.push(data.metadata);
      }
    } catch {
      // Skip corrupted files
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteSession(id: string): void {
  try {
    fs.unlinkSync(sessionPath(id));
  } catch {
    // Ignore
  }
}
