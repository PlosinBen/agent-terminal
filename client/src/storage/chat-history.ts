import { openDB, type IDBPDatabase } from 'idb';
import type { Message } from '../types/message';

import { dbName } from './namespace';

const DB_NAME = dbName('agent-terminal-history');
const DB_VERSION = 1;
const STORE_NAME = 'messages';
const TOOL_RESULT_MAX = 10 * 1024; // 10KB

interface StoredMessage {
  id?: number;
  projectId: string;
  timestamp: number;
  role: Message['role'];
  content: string;
  messageType?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  collapsible?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-project-time', ['projectId', 'timestamp']);
      },
    });
  }
  return dbPromise;
}

function messageToStored(projectId: string, msg: Message): StoredMessage {
  let toolResult = msg.toolResult;
  if (toolResult && toolResult.length > TOOL_RESULT_MAX) {
    toolResult = toolResult.slice(0, TOOL_RESULT_MAX) + '\n[truncated]';
  }
  return {
    projectId,
    timestamp: msg.timestamp ?? Date.now(),
    role: msg.role,
    content: msg.content,
    ...(msg.messageType && { messageType: msg.messageType }),
    ...(msg.toolName && { toolName: msg.toolName }),
    ...(msg.toolUseId && { toolUseId: msg.toolUseId }),
    ...(msg.toolInput && { toolInput: msg.toolInput }),
    ...(toolResult !== undefined && { toolResult }),
    ...(msg.collapsible !== undefined && { collapsible: msg.collapsible }),
  };
}

function storedToMessage(stored: StoredMessage): Message {
  return {
    role: stored.role,
    content: stored.content,
    timestamp: stored.timestamp,
    ...(stored.messageType && { messageType: stored.messageType as Message['messageType'] }),
    ...(stored.toolName && { toolName: stored.toolName }),
    ...(stored.toolUseId && { toolUseId: stored.toolUseId }),
    ...(stored.toolInput && { toolInput: stored.toolInput }),
    ...(stored.toolResult !== undefined && { toolResult: stored.toolResult }),
    ...(stored.collapsible !== undefined && { collapsible: stored.collapsible }),
  };
}

/**
 * Save all messages for a project (full overwrite).
 */
export async function saveMessages(projectId: string, messages: Message[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('by-project-time');

  // Delete existing messages for this project
  let cursor = await index.openCursor(IDBKeyRange.bound(
    [projectId, -Infinity],
    [projectId, Infinity],
  ));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  // Insert new messages
  for (const msg of messages) {
    await store.add(messageToStored(projectId, msg));
  }

  await tx.done;
}

/**
 * Load the most recent N user-message rounds for a project.
 * A round = one user message + all subsequent assistant/system messages until next user message.
 */
export async function loadRecentMessages(projectId: string, rounds: number): Promise<Message[]> {
  const db = await getDB();
  const index = db.transaction(STORE_NAME).objectStore(STORE_NAME).index('by-project-time');

  // Read all messages for this project in reverse order
  const allStored: StoredMessage[] = [];
  let cursor = await index.openCursor(
    IDBKeyRange.bound([projectId, -Infinity], [projectId, Infinity]),
    'prev',
  );

  // Collect messages, counting user messages as round boundaries
  let userCount = 0;
  const collected: StoredMessage[] = [];

  while (cursor) {
    const stored = cursor.value as StoredMessage;
    if (stored.role === 'user') {
      userCount++;
      if (userCount > rounds) break;
    }
    collected.unshift(stored);
    cursor = await cursor.continue();
  }

  return collected.map(storedToMessage);
}

/**
 * Load N more rounds of messages before a given timestamp.
 */
export async function loadMoreMessages(
  projectId: string,
  beforeTimestamp: number,
  rounds: number,
): Promise<Message[]> {
  const db = await getDB();
  const index = db.transaction(STORE_NAME).objectStore(STORE_NAME).index('by-project-time');

  let cursor = await index.openCursor(
    IDBKeyRange.bound([projectId, -Infinity], [projectId, beforeTimestamp], false, true),
    'prev',
  );

  let userCount = 0;
  const collected: StoredMessage[] = [];

  while (cursor) {
    const stored = cursor.value as StoredMessage;
    if (stored.role === 'user') {
      userCount++;
      if (userCount > rounds) break;
    }
    collected.unshift(stored);
    cursor = await cursor.continue();
  }

  return collected.map(storedToMessage);
}

/**
 * Check if there are messages before a given timestamp.
 */
export async function hasMoreMessages(projectId: string, beforeTimestamp: number): Promise<boolean> {
  const db = await getDB();
  const index = db.transaction(STORE_NAME).objectStore(STORE_NAME).index('by-project-time');
  const cursor = await index.openCursor(
    IDBKeyRange.bound([projectId, -Infinity], [projectId, beforeTimestamp], false, true),
    'prev',
  );
  return cursor !== null;
}

/**
 * Clear all messages for a project.
 */
export async function clearProject(projectId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.objectStore(STORE_NAME).index('by-project-time');

  let cursor = await index.openCursor(IDBKeyRange.bound(
    [projectId, -Infinity],
    [projectId, Infinity],
  ));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
}

/**
 * Delete messages older than N days.
 */
export async function rotateOldMessages(days: number): Promise<void> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  let cursor = await store.openCursor();
  while (cursor) {
    const stored = cursor.value as StoredMessage;
    if (stored.timestamp < cutoff) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }

  await tx.done;
}
