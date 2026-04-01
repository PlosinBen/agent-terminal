import { create } from 'zustand';
import type { ServerConfig } from '../types/server';
import type { ProviderListMsg } from '@shared/protocol';
import { loadServers, saveServers } from '../service/server-storage';
import type { AgentService } from '../service/agent-service';
import { ServiceEvent } from '../service/types';
import type { ConnectionChangedPayload } from '../service/types';

export interface AvailableProvider {
  name: string;
  displayName: string;
}

export const DEFAULT_SERVER_HOST = import.meta.env.VITE_SERVER_PORT
  ? `localhost:${import.meta.env.VITE_SERVER_PORT}`
  : typeof location !== 'undefined' ? location.host : 'localhost:9100';

interface ServerState {
  /** All known servers (persisted to localStorage). */
  servers: ServerConfig[];

  /** The local/default server host for this client instance. */
  localHost: string;

  /** Home path of the currently active server (from server:info). */
  homePath: string;

  /** Whether the local server WebSocket is connected. */
  localConnected: boolean;

  /** Available providers reported by the server. */
  providers: AvailableProvider[];

  // ── Internal ──
  _service: AgentService | null;
  _unsubs: (() => void)[];

  /** Initialize: open local WS connection, subscribe to ConnectionChanged. */
  init: (service: AgentService) => void;

  /** Tear down: unsubscribe events, release WS connection. */
  dispose: () => void;

  /** Set local connection status. */
  setLocalConnected: (connected: boolean) => void;

  /** Set the home path (from server:info response). */
  setHomePath: (path: string) => void;

  /** Add a server. No-op if host already exists. */
  addServer: (name: string, host: string) => void;

  /** Remove a server by host. */
  removeServer: (host: string) => void;

  /** Ensure a server exists in the list (used for auto-adding local server). */
  ensureServer: (server: ServerConfig) => void;
}

export const useServerStore = create<ServerState>()((set, get) => ({
  servers: loadServers(),
  localHost: DEFAULT_SERVER_HOST,
  homePath: '/',
  localConnected: false,
  providers: [],

  _service: null,
  _unsubs: [],

  init: (service) => {
    const host = DEFAULT_SERVER_HOST;
    set({ _service: service, localHost: host });

    // Open WS to local server
    service.acquireConnection(host);
    get().ensureServer({ host, name: 'localhost' });

    // If already connected (unlikely on first mount), fetch info immediately
    if (service.isConnected(host)) {
      set({ localConnected: true });
      service.getServerInfo(host).then(info => {
        set({ homePath: info.homePath });
      }).catch(() => {});
    }

    // Subscribe to connection status changes for server-level state
    const connUnsub = service.on(ServiceEvent.ConnectionChanged, (payload) => {
      const ev = payload as ConnectionChangedPayload;
      if (ev.host === get().localHost) {
        set({ localConnected: ev.status === 'connected' });
        if (ev.status === 'connected') {
          service.getServerInfo(ev.host).then(info => {
            set({ homePath: info.homePath });
          }).catch(() => {});
        }
      }
    });

    // Subscribe to provider list from server
    const provUnsub = service.on(ServiceEvent.ProviderList, (payload) => {
      const msg = payload as ProviderListMsg;
      set({ providers: msg.providers });
    });

    set({ _unsubs: [connUnsub, provUnsub] });
  },

  dispose: () => {
    const { _unsubs, _service, localHost } = get();
    for (const unsub of _unsubs) unsub();
    if (_service && localHost) {
      _service.releaseConnection(localHost);
    }
    set({ _service: null, _unsubs: [] });
  },

  setLocalConnected: (connected) => set({ localConnected: connected }),
  setHomePath: (path) => set({ homePath: path }),

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
