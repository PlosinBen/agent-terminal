import type { Message } from '../../types/message';
import './ToolCallBlock.css';

interface Props {
  msg: Message;
  collapsed: boolean;
  onToggle: () => void;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return truncate(String(input.command || ''), 80);
    case 'Edit':
    case 'Write':
    case 'Read':
      return String(input.file_path || '');
    case 'Glob':
      return String(input.pattern || '');
    case 'Grep':
      return `${input.pattern || ''} ${input.path ? `in ${input.path}` : ''}`.trim();
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

function EditContent({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path || '');
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

function WriteContent({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path || '');
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

function ReadContent({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="tool-content">
      <div className="tool-file-path">{String(input.file_path || '')}</div>
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

function GrepContent({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="tool-content">
      <pre className="tool-code">{String(input.pattern || '')}</pre>
      {input.path && <div className="tool-file-path">in {String(input.path)}</div>}
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

function renderToolBody(toolName: string, input: Record<string, unknown>) {
  switch (toolName) {
    case 'Bash': return <BashContent />;
    case 'Edit': return <EditContent input={input} />;
    case 'Write': return <WriteContent input={input} />;
    case 'Read': return <ReadContent input={input} />;
    case 'Glob': return <GlobContent input={input} />;
    case 'Grep': return <GrepContent input={input} />;
    case 'Task': return <TaskContent input={input} />;
    case 'TodoWrite': return <TodoContent input={input} />;
    default: return <GenericContent input={input} />;
  }
}

export function ToolCallBlock({ msg, collapsed, onToggle }: Props) {
  const toolName = msg.toolName || 'unknown';
  const input = msg.toolInput || {};
  const summary = getToolSummary(toolName, input);
  const hasBody = toolName !== 'Bash';

  return (
    <div className="tool-block">
      <div className={`tool-header${hasBody ? '' : ' tool-header-static'}`} onClick={hasBody ? onToggle : undefined}>
        {hasBody && <span className={`tool-chevron${collapsed ? '' : ' expanded'}`}>&#9654;</span>}
        <span className="tool-name">{toolName}</span>
        {summary && <span className="tool-summary">{summary}</span>}
      </div>
      {hasBody && !collapsed && renderToolBody(toolName, input)}
    </div>
  );
}
