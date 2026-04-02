/**
 * Storage namespace helper — ensures dev and production modes
 * use separate localStorage keys and IndexedDB databases.
 */
const MODE_PREFIX = import.meta.env.DEV ? 'dev:' : '';

export function storageKey(key: string): string {
  return `${MODE_PREFIX}${key}`;
}

export function dbName(name: string): string {
  return `${MODE_PREFIX}${name}`;
}
