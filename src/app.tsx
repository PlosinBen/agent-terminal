import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import InputArea from './components/input-area.js';
import MessageList, { type Message } from './components/message-list.js';
import PermissionPopup from './components/permission-popup.js';
import TerminalView from './components/terminal-view.js';
import StatusLine, { type StatusInfo } from './components/status-line.js';
import ProjectLine, { type ProjectInfo } from './components/project-line.js';
import NotificationBar, { type Notification } from './components/notification-bar.js';
import { ClaudeBackend } from './backend/claude/backend.js';
import type { AgentBackend, PermissionRequest } from './backend/types.js';
import { createProject, type Project } from './core/workspace.js';
import { parseCommand, executeCommand } from './core/commands.js';
import { execSync } from 'child_process';

type ViewMode = 'agent' | 'terminal';

interface PendingPermission {
  request: PermissionRequest;
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void;
}

interface ProjectState {
  project: Project;
  backend: AgentBackend;
  messages: Message[];
  loading: boolean;
  pendingPermission: PendingPermission | null;
  turns: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

function getGitBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd }).trim();
  } catch {
    return '-';
  }
}

function createProjectState(cwd: string): ProjectState {
  const backend = new ClaudeBackend();
  return {
    project: createProject(cwd),
    backend,
    messages: [{ role: 'system', content: `agent-terminal v0.1.0 — ${cwd}` }],
    loading: false,
    pendingPermission: null,
    turns: 0,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function checkClaudeInstalled(): { installed: boolean; version?: string } {
  try {
    const version = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

function WelcomeScreen() {
  const [claudeStatus] = useState(() => checkClaudeInstalled());

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
      <Text bold color="cyan">{
` ▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀   ▀█▀ █▀▀ █▀█ █▀▄▀█ █ █▄ █ ▄▀█ █
 █▀█ █▄█ ██▄ █ ▀█  █     █  ██▄ █▀▄ █ ▀ █ █ █ ▀█ █▀█ █▄▄`}
      </Text>
      <Text dimColor>v0.1.0</Text>
      <Text>{''}</Text>

      {claudeStatus.installed ? (
        <>
          <Text color="green">Claude Code: {claudeStatus.version}</Text>
          <Text>{''}</Text>
          <Text dimColor>Press <Text color="cyan">Ctrl+N</Text> to add a project and get started</Text>
        </>
      ) : (
        <>
          <Text color="red">Claude Code: not found</Text>
          <Text>{''}</Text>
          <Text>agent-terminal requires Claude Code CLI to be installed.</Text>
          <Text>{''}</Text>
          <Text dimColor>Install: npm install -g @anthropic-ai/claude-code</Text>
          <Text dimColor>Docs:    https://docs.anthropic.com/en/docs/claude-code</Text>
        </>
      )}

      <Text>{''}</Text>
      <Text dimColor>Ctrl+D to quit</Text>
    </Box>
  );
}

export default function App() {
  const { exit } = useApp();
  const [projectStates, setProjectStates] = useState<ProjectState[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<ViewMode>('agent');
  const [addingProject, setAddingProject] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const current = projectStates[activeIndex];
  const showWelcome = projectStates.length === 0 && !addingProject;

  // Helper to update current project state
  const updateCurrent = useCallback((updater: (state: ProjectState) => ProjectState) => {
    setProjectStates(prev => prev.map((s, i) => i === activeIndex ? updater(s) : s));
  }, [activeIndex]);

  const addProject = useCallback((cwdPath: string) => {
    const newState = createProjectState(cwdPath);
    setProjectStates(prev => {
      const next = [...prev, newState];
      return next;
    });
    setActiveIndex(prev => projectStates.length);
    setAddingProject(false);
  }, [projectStates.length]);

  // Set up permission handler for each project
  useEffect(() => {
    projectStates.forEach((ps, idx) => {
      ps.backend.setPermissionHandler((req) => {
        return new Promise((resolve) => {
          setActiveIndex(idx);
          setView('agent');
          setNotification({ type: 'permission', message: `[Agent] Permission requested — ${req.toolName}` });
          setProjectStates(prev => prev.map((s, i) =>
            i === idx ? { ...s, pendingPermission: { request: req, resolve } } : s
          ));
        });
      });
    });
  }, [projectStates.length]);

  // Global key handler
  useInput((ch, key) => {
    // On welcome screen, only allow Ctrl+N and Ctrl+D
    if (showWelcome) {
      if (key.ctrl && ch === 'n') { setAddingProject(true); return; }
      if (key.ctrl && ch === 'd') { exit(); return; }
      return;
    }

    // View switching: Alt+Left/Right
    if (key.meta && key.leftArrow) { setView('agent'); return; }
    if (key.meta && key.rightArrow) { setView('terminal'); return; }

    // Project switching: Alt+1~9
    if (key.meta && ch >= '1' && ch <= '9') {
      const idx = parseInt(ch) - 1;
      if (idx < projectStates.length) setActiveIndex(idx);
      return;
    }

    // New project: Ctrl+N
    if (key.ctrl && ch === 'n') {
      setAddingProject(true);
      return;
    }

    // Close project: Ctrl+W
    if (key.ctrl && ch === 'w') {
      if (projectStates.length <= 1) {
        exit();
        return;
      }
      setProjectStates(prev => prev.filter((_, i) => i !== activeIndex));
      setActiveIndex(i => Math.min(i, projectStates.length - 2));
      return;
    }

    // Quit: Ctrl+D
    if (key.ctrl && ch === 'd') {
      exit();
      return;
    }
  });

  const handlePermissionResponse = useCallback((result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => {
    if (current?.pendingPermission) {
      current.pendingPermission.resolve(result);
      updateCurrent(s => ({ ...s, pendingPermission: null }));
    }
  }, [current?.pendingPermission, updateCurrent]);

  const handleSubmit = useCallback(async (text: string) => {
    if (!current) return;

    // Handle commands
    const cmd = parseCommand(text);
    if (cmd) {
      const result = executeCommand(cmd.command, cmd.args, current.project.cwd);
      updateCurrent(s => ({
        ...s,
        messages: [...s.messages, { role: 'system', content: result.content }],
      }));
      if (result.action === 'clear') {
        updateCurrent(s => ({ ...s, messages: [] }));
      } else if (result.action === 'quit') {
        exit();
      }
      return;
    }

    updateCurrent(s => ({
      ...s,
      messages: [...s.messages, { role: 'user', content: text }],
      loading: true,
      turns: s.turns + 1,
    }));

    try {
      const gen = current.backend.query(text, { cwd: current.project.cwd });
      let assistantText = '';

      for await (const msg of gen) {
        if (msg.type === 'result') {
          assistantText = msg.content;
          updateCurrent(s => ({
            ...s,
            costUsd: s.costUsd + (msg.costUsd ?? 0),
            inputTokens: msg.inputTokens ?? s.inputTokens,
            outputTokens: msg.outputTokens ?? s.outputTokens,
          }));
        } else if (msg.type === 'text') {
          assistantText += msg.content;
          const text = assistantText;
          updateCurrent(s => {
            const last = s.messages[s.messages.length - 1];
            if (last?.role === 'assistant') {
              return { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant' as const, content: text }] };
            }
            return { ...s, messages: [...s.messages, { role: 'assistant' as const, content: text }] };
          });
        } else if (msg.type === 'tool_use') {
          updateCurrent(s => ({
            ...s,
            messages: [...s.messages, { role: 'system', content: `● ${msg.toolName}: ${msg.content}`, messageType: 'tool_use', collapsible: true }],
          }));
        }
      }

      if (assistantText) {
        const finalText = assistantText;
        updateCurrent(s => {
          const last = s.messages[s.messages.length - 1];
          if (last?.role === 'assistant') {
            return { ...s, messages: [...s.messages.slice(0, -1), { role: 'assistant' as const, content: finalText }] };
          }
          return { ...s, messages: [...s.messages, { role: 'assistant' as const, content: finalText }] };
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateCurrent(s => ({
        ...s,
        messages: [...s.messages, { role: 'system', content: `Error: ${errMsg}` }],
      }));
    } finally {
      updateCurrent(s => ({ ...s, loading: false }));
      setNotification({ type: 'done', message: '[Agent] Response complete' });
    }
  }, [current?.backend, current?.project.cwd, updateCurrent]);

  // Welcome screen
  if (showWelcome) {
    return (
      <Box flexDirection="column" height={process.stdout.rows}>
        <WelcomeScreen />
      </Box>
    );
  }

  // Adding project (from welcome or Ctrl+N)
  if (addingProject && projectStates.length === 0) {
    return (
      <Box flexDirection="column" height={process.stdout.rows}>
        <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={3} paddingY={1}>
            <Text bold color="cyan">Enter project directory path:</Text>
            <Text>{''}</Text>
            <InputArea onSubmit={addProject} />
            <Text>{''}</Text>
            <Text dimColor>  Press Escape to go back</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (!current) return null;

  // Build status info
  const agentStatus: StatusInfo['agentStatus'] = current.pendingPermission
    ? 'attention'
    : current.loading
      ? 'running'
      : 'idle';

  const status: StatusInfo = {
    model: 'opus',
    inputTokens: current.inputTokens,
    outputTokens: current.outputTokens,
    costUsd: current.costUsd,
    contextPct: 0,
    turns: current.turns,
    gitBranch: getGitBranch(current.project.cwd),
    permissionMode: 'default',
    agentStatus,
  };

  const projectInfos: ProjectInfo[] = projectStates.map(ps => ({
    name: ps.project.name,
    status: ps.pendingPermission ? 'attention' : ps.loading ? 'running' : 'idle',
  }));

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      {/* Agent View */}
      {view === 'agent' && (
        <Box flexDirection="column" flexGrow={1}>
          {addingProject ? (
            <Box flexDirection="column" paddingX={1}>
              <Text bold>New project — enter directory path:</Text>
              <InputArea onSubmit={addProject} />
            </Box>
          ) : (
            <>
              <MessageList messages={current.messages} />

              {current.pendingPermission && (
                <PermissionPopup
                  toolName={current.pendingPermission.request.toolName}
                  input={current.pendingPermission.request.input}
                  title={current.pendingPermission.request.title}
                  onRespond={handlePermissionResponse}
                />
              )}

              {current.loading && !current.pendingPermission && (
                <Box paddingX={1}>
                  <Text color="yellow">● Agent is thinking...</Text>
                </Box>
              )}

              <InputArea onSubmit={handleSubmit} disabled={current.loading} />
            </>
          )}
        </Box>
      )}

      {/* Terminal View */}
      {view === 'terminal' && (
        <Box flexDirection="column" flexGrow={1}>
          <NotificationBar notification={notification} />
          <TerminalView active={view === 'terminal'} cwd={current.project.cwd} />
        </Box>
      )}

      {/* Bottom bars — always visible */}
      <StatusLine status={status} />
      <ProjectLine projects={projectInfos} activeIndex={activeIndex} />
    </Box>
  );
}
