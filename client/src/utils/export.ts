import type { Message } from '../types/message';

export function exportMarkdown(messages: Message[], projectName: string): string {
  const lines: string[] = [`# ${projectName} — Chat Export`, ''];
  const date = new Date().toISOString().slice(0, 10);
  lines.push(`Exported on ${date}`, '', '---', '');

  for (const msg of messages) {
    if (msg.messageType === 'compact') continue;

    if (msg.role === 'user') {
      lines.push('## User', '', msg.content, '');
    } else if (msg.role === 'assistant') {
      if (msg.messageType === 'thinking') {
        lines.push('<details><summary>Thinking</summary>', '', msg.content, '', '</details>', '');
      } else if (msg.messageType === 'tool_use') {
        lines.push(`### Tool: ${msg.toolName ?? 'unknown'}`, '');
        if (msg.toolInput) {
          lines.push('```json', JSON.stringify(msg.toolInput, null, 2), '```', '');
        }
        if (msg.toolResult) {
          lines.push('**Result:**', '', '```', msg.toolResult, '```', '');
        }
      } else {
        lines.push('## Assistant', '', msg.content, '');
      }
    } else if (msg.role === 'system') {
      const label = msg.messageType === 'error' ? 'Error' : 'System';
      lines.push(`> **${label}:** ${msg.content}`, '');
    }
  }

  return lines.join('\n');
}

export function exportJSON(messages: Message[], projectName: string): string {
  return JSON.stringify({
    project: projectName,
    exportedAt: new Date().toISOString(),
    messages,
  }, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
