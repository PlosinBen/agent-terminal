import type { DownstreamMessage } from '../shared/protocol.js';
import type { WsServer } from '../ws-server.js';
import type { ProjectSession } from '../session-manager.js';
import type { PermissionRequest } from '../backend/types.js';
import { executeCommand } from '../core/commands.js';
import { broadcastStatus } from './git-watcher.js';

let permRequestCounter = 0;

export async function handleAgentQuery(
  session: ProjectSession,
  msg: { projectId: string; prompt: string },
  send: (reply: DownstreamMessage) => void,
  wsServer: WsServer,
): Promise<void> {
  session.loading = true;
  session.turns++;

  // Set up permission handler for this query
  session.backend.setPermissionHandler((req: PermissionRequest) => {
    return new Promise((resolve) => {
      const requestId = `perm_${++permRequestCounter}`;
      session.permissionResolvers.set(requestId, resolve);
      wsServer.broadcast({
        type: 'permission:request',
        projectId: msg.projectId,
        requestId,
        toolName: req.toolName,
        input: req.input,
        title: req.title,
      });
    });
  });

  // Broadcast status
  broadcastStatus(session, msg.projectId, wsServer);

  try {
    const gen = session.backend.query(msg.prompt, { cwd: session.project.cwd });

    for await (const agentMsg of gen) {
      if (agentMsg.type === 'text') {
        send({ type: 'agent:text', projectId: msg.projectId, content: agentMsg.content });
      } else if (agentMsg.type === 'thinking') {
        send({ type: 'agent:thinking', projectId: msg.projectId, content: agentMsg.content });
      } else if (agentMsg.type === 'tool_use') {
        send({
          type: 'agent:tool_use',
          projectId: msg.projectId,
          toolName: agentMsg.toolName || 'unknown',
          toolUseId: agentMsg.toolUseId || '',
          toolInput: agentMsg.toolInput || {},
          content: agentMsg.content,
        });
      } else if (agentMsg.type === 'result') {
        send({
          type: 'agent:result',
          projectId: msg.projectId,
          content: '',
          sessionId: agentMsg.sessionId,
          model: session.project.model,
          permissionMode: session.project.permissionMode,
          effort: session.project.effort,
        });
        if (agentMsg.sessionId) {
          session.project = { ...session.project, sessionId: agentMsg.sessionId };
        }
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    send({ type: 'agent:error', projectId: msg.projectId, error });
  } finally {
    session.loading = false;
    send({ type: 'agent:done', projectId: msg.projectId });
    broadcastStatus(session, msg.projectId, wsServer);
  }
}

export function handleAgentStop(session: ProjectSession): void {
  session.backend.stop();
  session.loading = false;
}

export async function handleAgentCommand(
  session: ProjectSession,
  msg: { projectId: string; command: string; args: string; requestId: string },
  send: (reply: DownstreamMessage) => void,
): Promise<void> {
  // Try app-level command
  const appResult = executeCommand(msg.command);
  if (appResult) {
    send({
      type: 'command:result',
      projectId: msg.projectId,
      requestId: msg.requestId,
      message: appResult.content,
    });
    return;
  }

  // Try provider command
  const providerResult = await session.backend.executeCommand(msg.command, msg.args);
  if (providerResult) {
    send({
      type: 'command:result',
      projectId: msg.projectId,
      requestId: msg.requestId,
      message: providerResult.message,
      updated: providerResult.updated,
    });
    if (providerResult.updated) {
      session.project = { ...session.project, ...providerResult.updated };
    }
    return;
  }

  send({
    type: 'command:result',
    projectId: msg.projectId,
    requestId: msg.requestId,
    message: `Unknown command: /${msg.command}`,
  });
}

export function handlePermissionResponse(
  session: ProjectSession,
  msg: { requestId: string; result: { behavior: 'allow' } | { behavior: 'deny'; message: string } },
): void {
  const resolver = session.permissionResolvers.get(msg.requestId);
  if (resolver) {
    resolver(msg.result);
    session.permissionResolvers.delete(msg.requestId);
  }
}
