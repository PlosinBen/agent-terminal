import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownBlock.css';

interface Props {
  content: string;
}

export function MarkdownBlock({ content }: Props) {
  return (
    <div className="markdown-block">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
