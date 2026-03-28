import type { PermissionReq } from '../types/message';
import './PermissionPopup.css';

interface Props {
  req: PermissionReq;
  onRespond: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void;
  cwd?: string;
}

function stripCwd(path: string, cwd?: string): string {
  if (!cwd) return path;
  const prefix = cwd.endsWith('/') ? cwd : cwd + '/';
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function formatInput(toolName: string, input: Record<string, unknown>, cwd?: string): JSX.Element {
  switch (toolName) {
    case 'Bash': {
      const cmd = String(input.command ?? '');
      return <pre className="perm-code">{cmd}</pre>;
    }

    case 'Edit': {
      const fp = stripCwd(String(input.file_path || ''), cwd);
      const oldStr = String(input.old_string || '');
      const newStr = String(input.new_string || '');
      return (
        <div className="perm-detail">
          <div className="perm-file">{fp}</div>
          <div className="perm-diff">
            {oldStr.split('\n').map((line, i) => (
              <div key={`o${i}`} className="perm-diff-del">- {line}</div>
            ))}
            {newStr.split('\n').map((line, i) => (
              <div key={`n${i}`} className="perm-diff-add">+ {line}</div>
            ))}
          </div>
        </div>
      );
    }

    case 'Write': {
      const fp = stripCwd(String(input.file_path || ''), cwd);
      const content = String(input.content || '');
      const lines = content.split('\n');
      const display = lines.length > 15 ? lines.slice(0, 15) : lines;
      return (
        <div className="perm-detail">
          <div className="perm-file">{fp}</div>
          <pre className="perm-code">{display.join('\n')}{lines.length > 15 ? `\n... +${lines.length - 15} more lines` : ''}</pre>
        </div>
      );
    }

    case 'Read': {
      const fp = stripCwd(String(input.file_path || ''), cwd);
      const offset = input.offset as number | undefined;
      const limit = input.limit as number | undefined;
      let range = '';
      if (offset && limit) range = ` (lines ${offset}-${offset + limit})`;
      else if (limit) range = ` (first ${limit} lines)`;
      return <div className="perm-file">{fp}{range}</div>;
    }

    case 'Glob':
      return <pre className="perm-code">{String(input.pattern || '')}</pre>;

    case 'Grep': {
      const pattern = String(input.pattern || '');
      const path = input.path ? stripCwd(String(input.path), cwd) : '';
      return (
        <div className="perm-detail">
          <pre className="perm-code">{pattern}</pre>
          {path && <div className="perm-file">in {path}</div>}
        </div>
      );
    }

    default:
      return <pre className="perm-code">{JSON.stringify(input, null, 2)}</pre>;
  }
}

export function PermissionPopup({ req, onRespond, cwd }: Props) {
  return (
    <div className="permission-overlay">
      <div className="permission-popup">
        <div className="permission-header">
          {req.title ?? `Allow ${req.toolName}?`}
        </div>
        <div className="permission-body">
          {formatInput(req.toolName, req.input, cwd)}
        </div>
        <div className="permission-actions">
          <button
            className="perm-btn perm-allow"
            onClick={() => onRespond({ behavior: 'allow' })}
          >
            Allow
          </button>
          <button
            className="perm-btn perm-deny"
            onClick={() => onRespond({ behavior: 'deny', message: 'Denied by user' })}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
