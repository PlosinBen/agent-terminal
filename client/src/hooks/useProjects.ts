import { useState, useEffect, useCallback, useRef } from 'react';
import type { DownstreamMessage } from '@shared/protocol';
import type { Message, StatusInfo, PermissionReq, ProviderConfig } from '../types/message';
import type { AgentService } from '../service/agent-service';
import { ServiceEvent } from '../service/types';

export interface ProjectState {
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

function createProjectState(): ProjectState {
  return {
    messages: [],
    loading: false,
    status: { ...DEFAULT_STATUS },
    permissionReq: null,
    providerConfig: null,
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
  service: AgentService,
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

  // Handle project-scoped downstream messages
  const handleMsg = useCallback((payload: unknown) => {
    const msg = payload as DownstreamMessage;
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

      case 'agent:thinking': {
        // Search backwards for last thinking block in this turn
        // (skip over tool_use messages between thinking blocks)
        let thinkingIdx = -1;
        for (let j = state.messages.length - 1; j >= 0; j--) {
          const m = state.messages[j];
          if (m.messageType === 'thinking') { thinkingIdx = j; break; }
          if (m.messageType !== 'tool_use') break;
        }
        if (thinkingIdx >= 0) {
          state.messages[thinkingIdx] = {
            ...state.messages[thinkingIdx],
            content: state.messages[thinkingIdx].content + msg.content,
          };
        } else {
          state.messages.push({
            role: 'assistant',
            content: msg.content,
            messageType: 'thinking',
            collapsible: true,
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
          toolUseId: msg.toolUseId,
          toolInput: msg.toolInput,
          collapsible: true,
        });
        rerender();
        break;

      case 'agent:tool_result': {
        // Find matching tool_use message by toolUseId and attach result
        for (let j = state.messages.length - 1; j >= 0; j--) {
          const m = state.messages[j];
          if (m.toolUseId === msg.toolUseId) {
            state.messages[j] = { ...m, toolResult: msg.content };
            break;
          }
        }
        rerender();
        break;
      }

      case 'agent:result':
        if (msg.sessionId) {
          onConfigUpdate?.({
            projectId: pid,
            sessionId: msg.sessionId,
          });
        }
        break;

      case 'agent:done':
        state.loading = false;
        onConfigUpdate?.({ projectId: pid, agentStatus: 'idle' });
        rerender();
        break;

      case 'agent:error':
        state.loading = false;
        state.messages.push({
          role: 'system',
          content: `Error: ${msg.error}`,
          messageType: 'error',
        });
        onConfigUpdate?.({ projectId: pid, agentStatus: 'idle' });
        rerender();
        break;

      case 'permission:request':
        state.permissionReq = {
          requestId: msg.requestId,
          toolName: msg.toolName,
          input: msg.input,
          title: msg.title,
        };
        onConfigUpdate?.({ projectId: pid, agentStatus: 'attention' });
        rerender();
        break;

      case 'status:update':
        state.status = {
          segments: msg.segments,
          agentStatus: msg.agentStatus,
          gitBranch: msg.gitBranch,
        };
        if (msg.providerConfig) {
          state.providerConfig = msg.providerConfig;
        }
        onConfigUpdate?.({ projectId: pid, agentStatus: msg.agentStatus });
        rerender();
        break;

      case 'command:result':
        state.messages.push({
          role: 'system',
          content: msg.message,
        });
        rerender();
        break;
    }
  }, [getOrCreate, rerender, onConfigUpdate]);

  // Subscribe to all relevant service events
  useEffect(() => {
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
    ];
    return () => { for (const unsub of unsubs) unsub(); };
  }, [service, handleMsg]);

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
