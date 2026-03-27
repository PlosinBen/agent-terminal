import { useState, useEffect, useCallback, useRef } from 'react';
import type { DownstreamMessage } from '@shared/protocol';
import type { Message, StatusInfo, PermissionReq } from './useProject';

export interface ProjectState {
  messages: Message[];
  loading: boolean;
  status: StatusInfo;
  permissionReq: PermissionReq | null;
}

const DEFAULT_STATUS: StatusInfo = {
  segments: [],
  agentStatus: 'idle',
  gitBranch: '-',
};

function createProjectState(): ProjectState {
  return {
    messages: [],
    loading: false,
    status: { ...DEFAULT_STATUS },
    permissionReq: null,
  };
}

export interface ConfigUpdate {
  projectId: string;
  sessionId?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  agentStatus?: 'idle' | 'running' | 'attention';
}

export function useProjects(
  onMessage: (handler: (msg: DownstreamMessage) => void) => () => void,
  onConfigUpdate?: (update: ConfigUpdate) => void,
) {
  const stateRef = useRef<Map<string, ProjectState>>(new Map());
  const [, forceUpdate] = useState(0);

  const rerender = useCallback(() => forceUpdate(n => n + 1), []);

  const getOrCreate = useCallback((id: string): ProjectState => {
    let s = stateRef.current.get(id);
    if (!s) {
      s = createProjectState();
      stateRef.current.set(id, s);
    }
    return s;
  }, []);

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (!('projectId' in msg) || !msg.projectId) return;
      const pid = msg.projectId;
      const state = getOrCreate(pid);

      switch (msg.type) {
        case 'agent:text': {
          const last = state.messages[state.messages.length - 1];
          if (last?.role === 'assistant' && last.messageType === 'text') {
            state.messages[state.messages.length - 1] = {
              ...last,
              content: last.content + msg.content,
            };
          } else {
            state.messages.push({
              role: 'assistant',
              content: msg.content.trimStart(),
              messageType: 'text',
            });
          }
          rerender();
          break;
        }

        case 'agent:tool_use':
          state.messages.push({
            role: 'assistant',
            content: msg.content,
            messageType: 'tool_use',
            toolName: msg.toolName,
            collapsible: true,
          });
          rerender();
          break;

        case 'agent:result':
          if (msg.sessionId || msg.model || msg.permissionMode || msg.effort) {
            onConfigUpdate?.({
              projectId: pid,
              sessionId: msg.sessionId,
              model: msg.model,
              permissionMode: msg.permissionMode,
              effort: msg.effort,
            });
          }
          break;

        case 'agent:done':
          state.loading = false;
          rerender();
          break;

        case 'agent:error':
          state.loading = false;
          state.messages.push({
            role: 'system',
            content: `Error: ${msg.error}`,
            messageType: 'error',
          });
          rerender();
          break;

        case 'permission:request':
          state.permissionReq = {
            requestId: msg.requestId,
            toolName: msg.toolName,
            input: msg.input,
            title: msg.title,
          };
          rerender();
          break;

        case 'status:update':
          state.status = {
            segments: msg.segments,
            agentStatus: msg.agentStatus,
            gitBranch: msg.gitBranch,
          };
          rerender();
          break;

        case 'command:result':
          state.messages.push({
            role: 'system',
            content: msg.message,
          });
          if (msg.updated) {
            onConfigUpdate?.({ projectId: pid, ...msg.updated });
          }
          rerender();
          break;
      }
    });

    return unsub;
  }, [onMessage, getOrCreate, rerender, onConfigUpdate]);

  const addUserMessage = useCallback((projectId: string, content: string) => {
    const state = getOrCreate(projectId);
    state.messages.push({ role: 'user', content });
    state.loading = true;
    rerender();
  }, [getOrCreate, rerender]);

  const clearPermission = useCallback((projectId: string) => {
    const state = stateRef.current.get(projectId);
    if (state) {
      state.permissionReq = null;
      rerender();
    }
  }, [rerender]);

  const initProject = useCallback((projectId: string) => {
    getOrCreate(projectId);
    rerender();
  }, [getOrCreate, rerender]);

  const removeProject = useCallback((projectId: string) => {
    stateRef.current.delete(projectId);
    rerender();
  }, [rerender]);

  const getState = useCallback((projectId: string | null): ProjectState | null => {
    if (!projectId) return null;
    return stateRef.current.get(projectId) ?? null;
  }, []);

  return { getState, addUserMessage, clearPermission, initProject, removeProject };
}
