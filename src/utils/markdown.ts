import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
marked.use(markedTerminal() as any);

export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text);
    if (typeof rendered === 'string') {
      return rendered.trimEnd();
    }
    return text;
  } catch {
    return text;
  }
}
