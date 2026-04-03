import { useState } from 'react';
import type { Message } from '../../types/message';
import type { TaskInfo } from '@shared/protocol';
import './ToolCallBlock.css';

interface Props {
  msg: Message;
  collapsed: boolean;
  onToggle: () => void;
  cwd?: string;
  tasks?: TaskInfo[];
  childMessages?: { msg: Message; index: number }[];
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function stripCwd(path: string, cwd?: string): string {
  if (!cwd) return path;
  const prefix = cwd.endsWith('/') ? cwd : cwd + '/';
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function getToolSummary(toolName: string, input: Record<string, unknown>, cwd?: string): string {
  switch (toolName) {
    case 'Bash':
      return String(input.command || '');
    case 'Edit':
    case 'Write':
      return stripCwd(String(input.file_path || ''), cwd);
    case 'Read': {
      const rp = stripCwd(String(input.file_path || ''), cwd);
      const offset = input.offset as number | undefined;
      const limit = input.limit as number | undefined;
      if (offset && limit) return `${rp}: #${offset} - #${offset + limit}`;
      if (limit) return `${rp}: #1 - #${limit}`;
      return rp;
    }
    case 'Glob':
      return String(input.pattern || '');
    case 'Grep':
      return `${input.pattern || ''} ${input.path ? `in ${stripCwd(String(input.path), cwd)}` : ''}`.trim();
    case 'Task':
    case 'Agent':
      return String(input.description || input.prompt || '');
    case 'TodoWrite':
      return 'update tasks';
    case 'AskUserQuestion': {
      const qs = input.questions as Array<{ header?: string }> | undefined;
      return qs ? `${qs.length} question${qs.length > 1 ? 's' : ''}` : '';
    }
    default:
      return '';
  }
}

function BashContent({ input }: { input: Record<string, unknown> }) {
  const command = String(input.command || '');
  return (
    <div className="tool-content">
      <pre className="tool-code">{command}</pre>
    </div>
  );
}

function EditContent({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
  const filePath = stripCwd(String(input.file_path || ''), cwd);
  const oldLines = String(input.old_string || '').split('\n');
  const newLines = String(input.new_string || '').split('\n');
  const maxRows = Math.max(oldLines.length, newLines.length);

  return (
    <div className="tool-content">
      <div className="tool-file-path">{filePath}</div>
      <div className="diff-side-by-side">
        <div className="diff-pane diff-pane-old">
          {oldLines.map((line, i) => (
            <div key={i} className="diff-row diff-del">
              <span className="diff-line-num">{i + 1}</span>
              <span className="diff-sign">-</span>
              <span className="diff-text">{line}</span>
            </div>
          ))}
          {Array.from({ length: maxRows - oldLines.length }, (_, i) => (
            <div key={`pad-${i}`} className="diff-row diff-empty">
              <span className="diff-line-num" />
              <span className="diff-sign" />
              <span className="diff-text" />
            </div>
          ))}
        </div>
        <div className="diff-pane diff-pane-new">
          {newLines.map((line, i) => (
            <div key={i} className="diff-row diff-add">
              <span className="diff-line-num">{i + 1}</span>
              <span className="diff-sign">+</span>
              <span className="diff-text">{line}</span>
            </div>
          ))}
          {Array.from({ length: maxRows - newLines.length }, (_, i) => (
            <div key={`pad-${i}`} className="diff-row diff-empty">
              <span className="diff-line-num" />
              <span className="diff-sign" />
              <span className="diff-text" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WriteContent({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
  const filePath = stripCwd(String(input.file_path || ''), cwd);
  const content = String(input.content || '');
  const lines = content.split('\n');
  const truncated = lines.length > 20;
  const displayLines = truncated ? lines.slice(0, 20) : lines;

  return (
    <div className="tool-content">
      <div className="tool-file-path">{filePath}</div>
      <div className="tool-diff">
        {displayLines.map((line, i) => (
          <div key={i} className="diff-line diff-add">
            <span className="diff-sign">+</span>
            <span className="diff-text">{line}</span>
          </div>
        ))}
        {truncated && (
          <div className="diff-truncated">... +{lines.length - 20} more lines</div>
        )}
      </div>
    </div>
  );
}

function ReadContent({ input, cwd, result }: { input: Record<string, unknown>; cwd?: string; result?: string }) {
  if (!result) return null;
  const lines = result.split('\n');
  const truncated = lines.length > 30;
  const displayLines = truncated ? lines.slice(0, 30) : lines;

  const filePath = stripCwd(String(input.file_path || ''), cwd);

  return (
    <div className="tool-content">
      <div className="tool-file-path">{filePath}</div>
      <pre className="tool-code">{displayLines.join('\n')}{truncated ? `\n... +${lines.length - 30} more lines` : ''}</pre>
    </div>
  );
}

function GlobContent({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="tool-content">
      <pre className="tool-code">{String(input.pattern || '')}</pre>
    </div>
  );
}

function GrepContent({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
  return (
    <div className="tool-content">
      {input.path && <div className="tool-file-path">in {stripCwd(String(input.path), cwd)}</div>}
      <pre className="tool-code">{String(input.pattern || '')}</pre>
    </div>
  );
}

function parseTaskResult(raw: string): string {
  // Strip trailing SDK metadata first so JSON.parse can succeed
  const cleaned = raw.replace(/\nagentId:[\s\S]*$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((block: Record<string, unknown>) => {
          if (block.type !== 'text') return false;
          const text = String(block.text || '');
          if (text.startsWith('agentId:') || text.startsWith('<usage>')) return false;
          return true;
        })
        .map((block: Record<string, unknown>) => String(block.text || ''))
        .join('\n');
    }
  } catch {
    // Not JSON — return cleaned text as-is
  }
  return cleaned;
}

function TaskContent({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const cleanResult = result ? parseTaskResult(result) : '';
  return (
    <div className="tool-content">
      {!result && input.prompt && (
        <pre className="tool-code">{truncate(String(input.prompt), 500)}</pre>
      )}
      {cleanResult && <pre className="tool-code task-result">{truncate(cleanResult, 2000)}</pre>}
    </div>
  );
}

function TodoContent({ input }: { input: Record<string, unknown> }) {
  const todos = input.todos as Array<{ content: string; status: string }> | undefined;
  if (!todos) return null;

  return (
    <div className="tool-content">
      <div className="tool-todo-list">
        {todos.map((todo, i) => (
          <div key={i} className={`tool-todo-item tool-todo-${todo.status}`}>
            <span className="tool-todo-check">
              {todo.status === 'completed' ? '\u2611' :
               todo.status === 'in_progress' ? '\u25B6' :
               '\u2610'}
            </span>
            <span>{todo.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AskUserQuestionContent({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const questions = input.questions as Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }> | undefined;

  // Parse answers from result (SDK returns JSON with answers)
  let answers: Record<string, string> = {};
  let annotations: Record<string, { notes?: string }> = {};
  if (result) {
    try {
      const parsed = JSON.parse(result);
      if (parsed.answers) answers = parsed.answers;
      if (parsed.annotations) annotations = parsed.annotations;
    } catch {
      // Also check input for answers (set via updatedInput)
    }
  }
  // Fallback: answers might be in input (from updatedInput)
  if (Object.keys(answers).length === 0 && input.answers) {
    answers = input.answers as Record<string, string>;
  }
  if (Object.keys(annotations).length === 0 && input.annotations) {
    annotations = input.annotations as Record<string, { notes?: string }>;
  }

  if (!questions) return null;

  return (
    <div className="tool-content">
      {questions.map((q, i) => {
        const answer = answers[q.question];
        const annotation = annotations[q.question];
        return (
          <div key={i} className="auq-result-group">
            <div className="auq-result-question">
              <span className="auq-result-header">{q.header}</span> - {q.question}
            </div>
            {answer ? (
              <div className="auq-result-answer">
                <span className="auq-result-check">{'\u2713'}</span>
                {answer}{annotation?.notes ? `: ${annotation.notes}` : ''}
              </div>
            ) : (
              <div className="auq-result-pending">awaiting response...</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GenericContent({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="tool-content">
      <pre className="tool-code">{JSON.stringify(input, null, 2)}</pre>
    </div>
  );
}

function renderToolBody(toolName: string, input: Record<string, unknown>, cwd?: string, result?: string) {
  switch (toolName) {
    case 'Bash': return <BashContent input={input} />;
    case 'Edit': return <EditContent input={input} cwd={cwd} />;
    case 'Write': return <WriteContent input={input} cwd={cwd} />;
    case 'Read': return <ReadContent input={input} cwd={cwd} result={result} />;
    case 'Glob': return <GlobContent input={input} />;
    case 'Grep': return <GrepContent input={input} cwd={cwd} />;
    case 'Task':
    case 'Agent': return <TaskContent input={input} result={result} />;
    case 'TodoWrite': return <TodoContent input={input} />;
    case 'AskUserQuestion': return <AskUserQuestionContent input={input} result={result} />;
    default: return <GenericContent input={input} />;
  }
}

function TaskBadge({ status }: { status: 'running' | 'stalled' }) {
  return (
    <span className={`task-badge task-badge--${status}`}>
      {status === 'running' ? 'Running' : 'Stalled'}
    </span>
  );
}

function ChildToolCall({ msg, cwd }: { msg: Message; cwd?: string }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <ToolCallBlock
      msg={msg}
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
      cwd={cwd}
    />
  );
}

function renderChildMessage(child: Message, key: number, cwd?: string) {
  if (child.messageType === 'tool_use') {
    return <ChildToolCall key={key} msg={child} cwd={cwd} />;
  }
  if (child.messageType === 'text' && child.role === 'assistant') {
    return (
      <div key={key} className="task-child-text">{truncate(child.content, 200)}</div>
    );
  }
  // Skip thinking, system, and other internal messages for cleanliness
  return null;
}

export function ToolCallBlock({ msg, collapsed, onToggle, cwd, tasks, childMessages }: Props) {
  const toolName = msg.toolName || 'unknown';
  const input = msg.toolInput || {};
  const result = msg.toolResult;
  const summary = getToolSummary(toolName, input, cwd);
  const hasChildren = (toolName === 'Task' || toolName === 'Agent') && childMessages && childMessages.length > 0;
  const hasBody = toolName === 'Read' ? !!result : toolName !== 'Bash' || hasChildren;

  // Find active task status for Task tool calls
  const taskInfo = toolName === 'Task' && msg.toolUseId && tasks
    ? tasks.find(t => t.id === msg.toolUseId)
    : undefined;

  return (
    <div className="tool-block">
      <div className={`tool-header${hasBody ? '' : ' tool-header-static'}`} onClick={hasBody ? onToggle : undefined}>
        {hasBody && <span className={`tool-chevron${collapsed ? '' : ' expanded'}`}>&#9654;</span>}
        <span className="tool-name">{toolName}</span>
        {summary && collapsed && <span className="tool-summary">{summary}</span>}
        {taskInfo && <TaskBadge status={taskInfo.status as 'running' | 'stalled'} />}
        {hasChildren && collapsed && <span className="task-child-count">{childMessages.length}</span>}
      </div>
      {hasBody && !collapsed && renderToolBody(toolName, input, cwd, result)}
      {hasChildren && !collapsed && (
        <div className="task-children">
          {childMessages.map(({ msg: child, index }) => renderChildMessage(child, index, cwd))}
        </div>
      )}
    </div>
  );
}
