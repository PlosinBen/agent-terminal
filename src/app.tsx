import React, { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import InputArea from './components/input-area.js';
import MessageList, { type Message } from './components/message-list.js';
import PermissionPopup from './components/permission-popup.js';
import TerminalView from './components/terminal-view.js';
import StatusLine from './components/status-line.js';
import ProjectLine, { type ProjectInfo } from './components/project-line.js';
import NotificationBar, { type Notification } from './components/notification-bar.js';
import { ClaudeBackend } from './backend/claude/backend.js';
import type { AgentBackend, PermissionRequest } from './backend/types.js';
import { createProject, saveProject, listProjects, type ProjectConfig } from './core/workspace.js';
import { parseCommand, executeCommand } from './core/commands.js';
import { execSync } from 'child_process';
import { logger } from './core/logger.js';

type ViewMode = 'agent' | 'terminal';

interface PendingPermission {
  request: PermissionRequest;
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void;
}

interface ProjectState {
  project: ProjectConfig;
  backend: AgentBackend;
  messages: Message[];
  loading: boolean;
  pendingPermission: PendingPermission | null;
  turns: number;
}

function getGitBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd }).trim();
  } catch {
    return '-';
  }
}

function createProjectState(cwd: string): ProjectState {
  const project = createProject(cwd);
  const backend = new ClaudeBackend({ model: project.model, permissionMode: project.permissionMode, effort: project.effort });
  return {
    project,
    backend,
    messages: [{ role: 'system', content: `agent-terminal v0.1.0 — ${cwd}` }],
    loading: false,
    pendingPermission: null,
    turns: 0,
  };
}

function useTerminalSize() {
  const subscribe = useCallback((cb: () => void) => {
    process.stdout.on('resize', cb);
    return () => { process.stdout.off('resize', cb); };
  }, []);
  const getSnapshot = useCallback(() => `${process.stdout.columns}x${process.stdout.rows}`, []);
  useSyncExternalStore(subscribe, getSnapshot);
  return { columns: process.stdout.columns, rows: process.stdout.rows };
}

function checkClaudeInstalled(): { installed: boolean; version?: string } {
  try {
    const version = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim();
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

function WelcomeScreen({ savedProjects }: { savedProjects: ProjectConfig[] }) {
  const [claudeStatus] = useState(() => checkClaudeInstalled());
  const hasSaved = savedProjects.length > 0;

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
      {/* Title + Version */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">{
` ▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀   ▀█▀ █▀▀ █▀█ █▀▄▀█ █ █▄ █ ▄▀█ █
 █▀█ █▄█ ██▄ █ ▀█  █     █  ██▄ █▀▄ █ ▀ █ █ █ ▀█ █▀█ █▄▄`}
        </Text>
        <Text dimColor>v0.1.0</Text>
      </Box>

      {/* Agent status */}
      <Box flexDirection="column" marginBottom={1}>
        {claudeStatus.installed ? (
          <Text color="green">Claude Code: {claudeStatus.version}</Text>
        ) : (
          <>
            <Text color="red">Claude Code: not found</Text>
            <Text>{''}</Text>
            <Text>agent-terminal requires Claude Code CLI to be installed.</Text>
            <Text dimColor>Install: npm install -g @anthropic-ai/claude-code</Text>
            <Text dimColor>Docs:    https://docs.anthropic.com/en/docs/claude-code</Text>
          </>
        )}
      </Box>

      {/* Saved projects */}
      {hasSaved && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Projects:</Text>
          {savedProjects.map(p => (
            <Text key={p.id} dimColor>  {p.name} <Text color="gray">— {p.cwd}</Text></Text>
          ))}
        </Box>
      )}

      {/* Keybindings */}
      <Box flexDirection="column">
        {hasSaved && (
          <Text dimColor>Press <Text color="cyan">Enter</Text> to open all projects</Text>
        )}
        <Text dimColor>Press <Text color="cyan">Ctrl+N</Text> to add a new project</Text>
        <Text dimColor>Press <Text color="cyan">Esc</Text> to quit</Text>
      </Box>
    </Box>
  );
}

export default function App() {
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const [projectStates, setProjectStates] = useState<ProjectState[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<ViewMode>('agent');
  const [addingProject, setAddingProject] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [savedProjects] = useState(() => listProjects());
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

  const openSavedProjects = useCallback(() => {
    if (savedProjects.length === 0) return;
    const states = savedProjects.map(p => createProjectState(p.cwd));
    setProjectStates(states);
    setActiveIndex(0);
  }, [savedProjects]);

  // Set up permission handler and onInit callback for each project
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
      ps.backend.onInit(() => {
        setProjectStates(prev => prev.map((s, i) => {
          if (i !== idx) return s;
          const updated = {
            ...s.project,
            model: s.backend.getModel(),
            permissionMode: s.backend.getPermissionMode(),
            effort: s.backend.getEffort(),
          };
          saveProject(updated);
          return { ...s, project: updated };
        }));
      });
    });
  }, [projectStates.length]);

  // Global key handler
  useInput((ch, key) => {
    // On welcome screen, only allow Ctrl+N and Ctrl+D
    if (showWelcome) {
      if (key.return && savedProjects.length > 0) { openSavedProjects(); return; }
      if (key.ctrl && ch === 'n') { setAddingProject(true); return; }
      if (key.escape) { exit(); return; }
      return;
    }

    // View switching: Ctrl+W
    if (key.ctrl && ch === 'w') { setView(v => v === 'agent' ? 'terminal' : 'agent'); return; }

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
      // Try app-level command first
      const appResult = executeCommand(cmd.command);
      if (appResult) {
        updateCurrent(s => ({
          ...s,
          messages: [...s.messages, { role: 'system', content: appResult.content }],
        }));
        if (appResult.action === 'clear') {
          updateCurrent(s => ({ ...s, messages: [] }));
        } else if (appResult.action === 'quit') {
          exit();
        }
        return;
      }

      // Try provider command
      const providerResult = await current.backend.executeCommand(cmd.command, cmd.args);
      if (providerResult) {
        updateCurrent(s => ({
          ...s,
          messages: [...s.messages, { role: 'system', content: providerResult.message }],
        }));
        if (providerResult.updated) {
          updateCurrent(s => {
            const updated = { ...s.project, ...providerResult.updated };
            saveProject(updated);
            return { ...s, project: updated };
          });
        }
        return;
      }

      // Unknown command
      updateCurrent(s => ({
        ...s,
        messages: [...s.messages, { role: 'system', content: `Unknown command: /${cmd.command}. Type /help for available commands.` }],
      }));
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
          // Persist sessionId to project config
          if (msg.sessionId) {
            updateCurrent(s => {
              if (s.project.sessionId !== msg.sessionId) {
                const updated = { ...s.project, sessionId: msg.sessionId };
                saveProject(updated);
                return { ...s, project: updated };
              }
              return s;
            });
          }
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
      <Box flexDirection="column" height={rows}>
        <WelcomeScreen savedProjects={savedProjects} />
      </Box>
    );
  }

  // Adding project (from welcome or Ctrl+N)
  if (addingProject && projectStates.length === 0) {
    return (
      <Box flexDirection="column" height={rows}>
        <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={3} paddingY={1}>
            <Text bold color="cyan">Enter project directory path:</Text>
            <Text>{''}</Text>
            <InputArea onSubmit={addProject} onCancel={() => setAddingProject(false)} />
            <Text>{''}</Text>
            <Text dimColor>  Press Escape to go back</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (!current) return null;

  // Build status info
  const agentStatus: 'idle' | 'running' | 'attention' = current.pendingPermission
    ? 'attention'
    : current.loading
      ? 'running'
      : 'idle';

  const projectInfos: ProjectInfo[] = projectStates.map(ps => ({
    name: ps.project.name,
    status: ps.pendingPermission ? 'attention' : ps.loading ? 'running' : 'idle',
  }));

  return (
    <Box flexDirection="column" height={rows}>
      {/* Agent View */}
      {view === 'agent' && (
        <Box flexDirection="column" flexGrow={1}>
          {addingProject ? (
            <Box flexDirection="column" paddingX={1}>
              <Text bold>New project — enter directory path:</Text>
              <InputArea onSubmit={addProject} onCancel={() => setAddingProject(false)} />
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

              <InputArea onSubmit={handleSubmit} disabled={current.loading} backend={current.backend} />
            </>
          )}
        </Box>
      )}

      {/* Terminal View — always mounted, active controls stdin/stdout */}
      <TerminalView active={view === 'terminal'} cwd={current.project.cwd} onSwitchView={() => setView('agent')} projects={projectInfos} activeIndex={activeIndex} />

      {/* Bottom bars — agent view only */}
      {view === 'agent' && (
        <>
          <StatusLine agentStatus={agentStatus} gitBranch={getGitBranch(current.project.cwd)} segments={current.backend.getStatusSegments()} />
          <ProjectLine projects={projectInfos} activeIndex={activeIndex} />
        </>
      )}
    </Box>
  );
}
