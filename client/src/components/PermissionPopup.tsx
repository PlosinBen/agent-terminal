import type { PermissionReq } from '../hooks/useProject';
import './PermissionPopup.css';

interface Props {
  req: PermissionReq;
  onRespond: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void;
}

export function PermissionPopup({ req, onRespond }: Props) {
  const inputDisplay = req.toolName === 'Bash'
    ? String(req.input.command ?? '')
    : JSON.stringify(req.input, null, 2);

  return (
    <div className="permission-overlay">
      <div className="permission-popup">
        <div className="permission-header">
          {req.title ?? `Allow ${req.toolName}?`}
        </div>
        <div className="permission-tool">Tool: {req.toolName}</div>
        <pre className="permission-content">{inputDisplay}</pre>
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
