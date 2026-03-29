import { create } from 'zustand';
import type { DownstreamMessage } from '@shared/protocol';
import type { ProjectInfo } from '../types/project';
import type { Message, StatusInfo, PermissionReq, ProviderConfig } from '../types/message';
import type { AgentService } from '../service/agent-service';
import { ServiceEvent } from '../service/types';
import type { ConnectionChangedPayload } from '../service/types';
import { loadSavedProjects, saveSavedProjects, generateProjectId } from '../projects-storage';
import { DEFAULT_SERVER_HOST } from './server-store';

// ── Per-project runtime state (was in useProjects) ──

export interface PerProjectState {
  messages: Message[];
  loading: boolean;
  status: StatusInfo;
  permissionReq: PermissionReq | null;
  providerConfig: ProviderConfig | null;
}

const DEFAULT_STATUS: StatusInfo = {
  segments: [],
  agentStatus: 'idle',
  gitBranch: '-',
};

function createPerProjectState(): PerProjectState {
  return {
    messages: [],
    loading: false,
    status: { ...DEFAULT_STATUS },
    permissionReq: null,
    providerConfig: null,
  };
}

// ── Config update type (was in useProjects) ──

export interface ConfigUpdate {
  projectId: string;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  agentStatus?: 'idle' | 'running' | 'attention';
}

// ── Store interface ──

interface ProjectStoreState {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  projectStates: Record<string, PerProjectState>;

  _service: AgentService | null;
  _unsubscribers: (() => void)[];

  // Computed helpers
  activeProject: () => ProjectInfo | undefined;
  activeState: () => PerProjectState | null;
  getProjectState: (id: string | null) => PerProjectState | null;

  // Project list actions
  setActiveProjectId: (id: string | null) => void;
  createProject: (cwd: string, serverHost: string) => void;
  connectProject: (project: ProjectInfo) => Promise<void>;
  closeProject: (id: string) => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;

  // Per-project state actions
  addUserMessage: (projectId: string, content: string, loading?: boolean) => void;
  clearMessages: (projectId: string) => void;
  clearPermission: (projectId: string) => void;

  // Config
  applyConfigUpdate: (update: ConfigUpdate) => void;

  // Lifecycle
  init: (service: AgentService) => void;
  dispose: () => void;
}

// ── Helper: persist projects to localStorage ──

function persistProjects(projects: ProjectInfo[]) {
  saveSavedProjects(projects.map(p => ({
    id: p.id, name: p.name, cwd: p.cwd, serverHost: p.serverHost,
    sessionId: p.sessionId, model: p.model,
    permissionMode: p.permissionMode, effort: p.effort,
  })));
}

// ── Store ──

export const useProjectStore = create<ProjectStoreState>()((set, get) => ({
  projects: loadSavedProjects().map(p => ({
    ...p,
    serverHost: p.serverHost || DEFAULT_SERVER_HOST,
    agentStatus: 'idle' as const,
    connectionStatus: 'disconnected' as const,
  })),
  activeProjectId: null,
  projectStates: {},
  _service: null,
  _unsubscribers: [],

  // ── Computed ──

  activeProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find(p => p.id === activeProjectId);
  },

  activeState: () => {
    const { activeProjectId, projectStates } = get();
    if (!activeProjectId) return null;
    return projectStates[activeProjectId] ?? null;
  },

  getProjectState: (id) => {
    if (!id) return null;
    return get().projectStates[id] ?? null;
  },

  // ── Project list actions ──

  setActiveProjectId: (id) => set({ activeProjectId: id }),

  createProject: (cwd, serverHost) => {
    const { projects, connectProject: connect } = get();

    // Check if project with same cwd + server already exists
    const existing = projects.find(p => p.cwd === cwd && p.serverHost === serverHost);
    if (existing) {
      set({ activeProjectId: existing.id });
      if (existing.connectionStatus === 'disconnected') connect(existing);
      return;
    }

    const id = generateProjectId();
    const name = cwd.split('/').pop() ?? 'project';
    const p: ProjectInfo = {
      id, name, cwd, serverHost,
      agentStatus: 'idle', connectionStatus: 'disconnected',
    };

    const next = [...projects, p];
    persistProjects(next);
    set({ projects: next, activeProjectId: id });

    // Connect after state update
    setTimeout(() => connect(p), 0);
  },

  connectProject: async (project) => {
    const service = get()._service;
    if (!service) return;
    if (project.connectionStatus === 'connected' || project.connectionStatus === 'connecting') return;

    // Ensure connection to server
    service.acquireConnection(project.serverHost);

    // Mark as connecting
    set(s => ({
      projects: s.projects.map(p =>
        p.id === project.id ? { ...p, connectionStatus: 'connecting' as const } : p
      ),
    }));

    await service.connectProject(project);

    // Mark as connected + init per-project state
    set(s => ({
      projects: s.projects.map(p =>
        p.id === project.id ? { ...p, connectionStatus: 'connected' as const } : p
      ),
      projectStates: {
        ...s.projectStates,
        [project.id]: s.projectStates[project.id] ?? createPerProjectState(),
      },
    }));
  },

  closeProject: (id) => {
    const { projects, activeProjectId, projectStates } = get();
    const idx = projects.findIndex(p => p.id === id);
    const next = projects.filter(p => p.id !== id);
    persistProjects(next);

    const { [id]: _, ...remainingStates } = projectStates;

    let newActiveId = activeProjectId;
    if (activeProjectId === id) {
      if (next.length > 0) {
        const nextIdx = Math.min(idx, next.length - 1);
        newActiveId = next[nextIdx]?.id ?? null;
      } else {
        newActiveId = null;
      }
    }

    set({
      projects: next,
      activeProjectId: newActiveId,
      projectStates: remainingStates,
    });
  },

  reorderProjects: (fromIndex, toIndex) => {
    set(s => {
      const next = [...s.projects];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persistProjects(next);
      return { projects: next };
    });
  },

  // ── Per-project state actions ──

  addUserMessage: (projectId, content, loading = true) => {
    set(s => {
      const ps = s.projectStates[projectId] ?? createPerProjectState();
      return {
        projectStates: {
          ...s.projectStates,
          [projectId]: {
            ...ps,
            messages: [...ps.messages, { role: 'user' as const, content }],
            loading: loading ? true : ps.loading,
          },
        },
      };
    });
  },

  clearMessages: (projectId) => {
    set(s => {
      const ps = s.projectStates[projectId];
      if (!ps) return s;
      return {
        projectStates: {
          ...s.projectStates,
          [projectId]: { ...ps, messages: [] },
        },
      };
    });
  },

  clearPermission: (projectId) => {
    set(s => {
      const ps = s.projectStates[projectId];
      if (!ps) return s;
      return {
        projectStates: {
          ...s.projectStates,
          [projectId]: { ...ps, permissionReq: null },
        },
      };
    });
  },

  // ── Config update (merges sessionId/model/etc into projects array) ──

  applyConfigUpdate: (update) => {
    set(s => {
      const next = s.projects.map(p => {
        if (p.id !== update.projectId) return p;
        return {
          ...p,
          ...(update.sessionId !== undefined && { sessionId: update.sessionId }),
          ...(update.model !== undefined && { model: update.model }),
          ...(update.permissionMode !== undefined && { permissionMode: update.permissionMode }),
          ...(update.effort !== undefined && { effort: update.effort }),
          ...(update.agentStatus !== undefined && { agentStatus: update.agentStatus }),
        };
      });
      persistProjects(next);
      return { projects: next };
    });
  },

  // ── Lifecycle ──

  init: (service) => {
    if (get()._service) return; // idempotent

    // Handle downstream project-scoped messages
    const handleMsg = (payload: unknown) => {
      const msg = payload as DownstreamMessage;
      if (!('projectId' in msg) || !msg.projectId) return;
      const pid = msg.projectId as string;

      set(s => {
        const ps = s.projectStates[pid] ?? createPerProjectState();
        let updated: PerProjectState;

        switch (msg.type) {
          case 'agent:text': {
            const messages = [...ps.messages];
            const last = messages[messages.length - 1];
            if (last?.role === 'assistant' && last.messageType === 'text') {
              messages[messages.length - 1] = { ...last, content: last.content + msg.content };
            } else {
              messages.push({ role: 'assistant', content: msg.content.trimStart(), messageType: 'text' });
            }
            updated = { ...ps, messages };
            break;
          }

          case 'agent:thinking': {
            const messages = [...ps.messages];
            let thinkingIdx = -1;
            for (let j = messages.length - 1; j >= 0; j--) {
              const m = messages[j];
              if (m.messageType === 'thinking') { thinkingIdx = j; break; }
              if (m.messageType !== 'tool_use') break;
            }
            if (thinkingIdx >= 0) {
              messages[thinkingIdx] = { ...messages[thinkingIdx], content: messages[thinkingIdx].content + msg.content };
            } else {
              messages.push({ role: 'assistant', content: msg.content, messageType: 'thinking', collapsible: true });
            }
            updated = { ...ps, messages };
            break;
          }

          case 'agent:tool_use': {
            updated = {
              ...ps,
              messages: [...ps.messages, {
                role: 'assistant', content: msg.content, messageType: 'tool_use',
                toolName: msg.toolName, toolUseId: msg.toolUseId, toolInput: msg.toolInput,
                collapsible: true,
              }],
            };
            break;
          }

          case 'agent:tool_result': {
            const messages = [...ps.messages];
            for (let j = messages.length - 1; j >= 0; j--) {
              if (messages[j].toolUseId === msg.toolUseId) {
                messages[j] = { ...messages[j], toolResult: msg.content };
                break;
              }
            }
            updated = { ...ps, messages };
            break;
          }

          case 'agent:result':
            if (msg.sessionId) {
              // Defer config update to avoid nested set
              setTimeout(() => get().applyConfigUpdate({ projectId: pid, sessionId: msg.sessionId }), 0);
            }
            return s; // no state change for this message

          case 'agent:done':
            updated = { ...ps, loading: false };
            setTimeout(() => get().applyConfigUpdate({ projectId: pid, agentStatus: 'idle' }), 0);
            break;

          case 'agent:error':
            updated = {
              ...ps,
              loading: false,
              messages: [...ps.messages, { role: 'system', content: `Error: ${msg.error}`, messageType: 'error' }],
            };
            setTimeout(() => get().applyConfigUpdate({ projectId: pid, agentStatus: 'idle' }), 0);
            break;

          case 'permission:request':
            updated = {
              ...ps,
              permissionReq: { requestId: msg.requestId, toolName: msg.toolName, input: msg.input, title: msg.title },
            };
            setTimeout(() => get().applyConfigUpdate({ projectId: pid, agentStatus: 'attention' }), 0);
            break;

          case 'status:update':
            updated = {
              ...ps,
              status: { segments: msg.segments, agentStatus: msg.agentStatus, gitBranch: msg.gitBranch },
              providerConfig: msg.providerConfig ?? ps.providerConfig,
            };
            setTimeout(() => get().applyConfigUpdate({ projectId: pid, agentStatus: msg.agentStatus }), 0);
            break;

          case 'command:result':
            updated = {
              ...ps,
              messages: [...ps.messages, { role: 'system', content: msg.message }],
            };
            break;

          default:
            return s;
        }

        return {
          projectStates: { ...s.projectStates, [pid]: updated },
        };
      });
    };

    // Handle connection status changes (project reconnect logic)
    const handleConnectionChanged = (payload: unknown) => {
      const ev = payload as ConnectionChangedPayload;

      if (ev.status === 'reconnecting') {
        set(s => ({
          projects: s.projects.map(p =>
            p.serverHost === ev.host && p.connectionStatus === 'connected'
              ? { ...p, connectionStatus: 'reconnecting' as const }
              : p
          ),
        }));
      } else if (ev.status === 'connected') {
        // Re-register projects that were reconnecting
        const toReconnect = get().projects.filter(
          p => p.serverHost === ev.host && p.connectionStatus === 'reconnecting'
        );
        for (const project of toReconnect) {
          set(s => ({
            projects: s.projects.map(p =>
              p.id === project.id ? { ...p, connectionStatus: 'disconnected' as const } : p
            ),
          }));
          get().connectProject({ ...project, connectionStatus: 'disconnected' });
        }
      }
    };

    // Subscribe to all events
    const unsubs = [
      service.on(ServiceEvent.AgentText, handleMsg),
      service.on(ServiceEvent.AgentThinking, handleMsg),
      service.on(ServiceEvent.AgentToolUse, handleMsg),
      service.on(ServiceEvent.AgentToolResult, handleMsg),
      service.on(ServiceEvent.AgentResult, handleMsg),
      service.on(ServiceEvent.AgentDone, handleMsg),
      service.on(ServiceEvent.AgentError, handleMsg),
      service.on(ServiceEvent.PermissionRequest, handleMsg),
      service.on(ServiceEvent.StatusUpdate, handleMsg),
      service.on(ServiceEvent.CommandResult, handleMsg),
      service.on(ServiceEvent.ConnectionChanged, handleConnectionChanged),
    ];

    set({ _service: service, _unsubscribers: unsubs });
  },

  dispose: () => {
    const { _unsubscribers } = get();
    for (const unsub of _unsubscribers) unsub();
    set({ _service: null, _unsubscribers: [] });
  },
}));
