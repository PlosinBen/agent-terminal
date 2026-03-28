import './ThinkingBlock.css';

interface Props {
  content: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function ThinkingBlock({ content, collapsed, onToggle }: Props) {
  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={onToggle}>
        <span className={`thinking-chevron${collapsed ? '' : ' expanded'}`}>&#9654;</span>
        <span className="thinking-label">Thinking</span>
        {collapsed && (
          <span className="thinking-preview">
            {content.length > 80 ? content.slice(0, 80) + '...' : content}
          </span>
        )}
      </div>
      {!collapsed && (
        <pre className="thinking-content">{content}</pre>
      )}
    </div>
  );
}
