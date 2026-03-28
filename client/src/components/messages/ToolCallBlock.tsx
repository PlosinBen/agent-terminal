import type { Message } from '../../types/message';
import './ToolCallBlock.css';

interface Props {
  msg: Message;
  collapsed: boolean;
  onToggle: () => void;
  cwd?: string;
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
      return truncate(String(input.command || ''), 80);
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
      return truncate(String(input.description || input.prompt || ''), 80);
    case 'TodoWrite':
      return 'update tasks';
    default:
      return '';
  }
}

function BashContent() {
  // Command already shown in header summary — no extra body needed
  return null;
}

function EditContent({ input, cwd }: { input: Record<string, unknown>; cwd?: string }) {
  const filePath = stripCwd(String(input.file_path || ''), cwd);
  const oldStr = String(input.old_string || '');
  const newStr = String(input.new_string || '');

  return (
    <div className="tool-content">
      <div className="tool-file-path">{filePath}</div>
      <div className="tool-diff">
        {oldStr && oldStr.split('\n').map((line, i) => (
          <div key={`old-${i}`} className="diff-line diff-del">
            <span className="diff-sign">-</span>
            <span className="diff-text">{line}</span>
          </div>
        ))}
        {newStr && newStr.split('\n').map((line, i) => (
          <div key={`new-${i}`} className="diff-line diff-add">
            <span className="diff-sign">+</span>
            <span className="diff-text">{line}</span>
          </div>
        ))}
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

  return (
    <div className="tool-content">
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
      <pre className="tool-code">{String(input.pattern || '')}</pre>
      {input.path && <div className="tool-file-path">in {stripCwd(String(input.path), cwd)}</div>}
    </div>
  );
}

function TaskContent({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="tool-content">
      {input.description && <div className="tool-description">{String(input.description)}</div>}
      {input.prompt && (
        <pre className="tool-code">{truncate(String(input.prompt), 500)}</pre>
      )}
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

function GenericContent({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="tool-content">
      <pre className="tool-code">{JSON.stringify(input, null, 2)}</pre>
    </div>
  );
}

function renderToolBody(toolName: string, input: Record<string, unknown>, cwd?: string, result?: string) {
  switch (toolName) {
    case 'Bash': return <BashContent />;
    case 'Edit': return <EditContent input={input} cwd={cwd} />;
    case 'Write': return <WriteContent input={input} cwd={cwd} />;
    case 'Read': return <ReadContent input={input} cwd={cwd} result={result} />;
    case 'Glob': return <GlobContent input={input} />;
    case 'Grep': return <GrepContent input={input} cwd={cwd} />;
    case 'Task': return <TaskContent input={input} />;
    case 'TodoWrite': return <TodoContent input={input} />;
    default: return <GenericContent input={input} />;
  }
}

export function ToolCallBlock({ msg, collapsed, onToggle, cwd }: Props) {
  const toolName = msg.toolName || 'unknown';
  const input = msg.toolInput || {};
  const result = msg.toolResult;
  const summary = getToolSummary(toolName, input, cwd);
  const hasBody = toolName === 'Read' ? !!result : toolName !== 'Bash';

  return (
    <div className="tool-block">
      <div className={`tool-header${hasBody ? '' : ' tool-header-static'}`} onClick={hasBody ? onToggle : undefined}>
        {hasBody && <span className={`tool-chevron${collapsed ? '' : ' expanded'}`}>&#9654;</span>}
        <span className="tool-name">{toolName}</span>
        {summary && <span className="tool-summary">{summary}</span>}
      </div>
      {hasBody && !collapsed && renderToolBody(toolName, input, cwd, result)}
    </div>
  );
}
