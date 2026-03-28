import { create } from 'zustand';
import type { ServerConfig } from '../types/server';
import { loadServers, saveServers } from '../service/server-storage';

interface ServerState {
  /** All known servers (persisted to localStorage). */
  servers: ServerConfig[];

  /** The local/default server host for this client instance. */
  localHost: string;

  /** Home path of the currently active server (from server:info). */
  homePath: string;

  /** Whether the local server WebSocket is connected. */
  localConnected: boolean;

  /** Set the local server host (determined at init). */
  setLocalHost: (host: string) => void;

  /** Set the home path (from server:info response). */
  setHomePath: (path: string) => void;

  /** Set local connection status. */
  setLocalConnected: (connected: boolean) => void;

  /** Add a server. No-op if host already exists. */
  addServer: (name: string, host: string) => void;

  /** Remove a server by host. */
  removeServer: (host: string) => void;

  /** Ensure a server exists in the list (used for auto-adding local server). */
  ensureServer: (server: ServerConfig) => void;
}

export const useServerStore = create<ServerState>()((set, get) => ({
  servers: loadServers(),
  localHost: '',
  homePath: '/',
  localConnected: false,

  setLocalHost: (host) => set({ localHost: host }),
  setHomePath: (path) => set({ homePath: path }),
  setLocalConnected: (connected) => set({ localConnected: connected }),

  addServer: (name, host) => {
    const { servers } = get();
    if (servers.some(s => s.host === host)) return;
    const next = [...servers, { host, name }];
    saveServers(next);
    set({ servers: next });
  },

  removeServer: (host) => {
    const next = get().servers.filter(s => s.host !== host);
    saveServers(next);
    set({ servers: next });
  },

  ensureServer: (server) => {
    const { servers } = get();
    if (servers.some(s => s.host === server.host)) return;
    const next = [server, ...servers];
    saveServers(next);
    set({ servers: next });
  },
}));
