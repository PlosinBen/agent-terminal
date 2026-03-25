export type RiskLevel = 'safe' | 'warning' | 'danger';

const DANGER_PATTERNS = [
  /\brm\s+-rf?\b/,
  /\brm\s+.*--force\b/,
  /\bdrop\s+(table|database)\b/i,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+clean\s+-f\b/,
  /\bgit\s+branch\s+-D\b/,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
];

const WARNING_TOOLS = new Set(['Edit', 'Write', 'Bash', 'Task', 'NotebookEdit']);
const SAFE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch']);

export function classifyRisk(toolName: string, input: Record<string, unknown>): RiskLevel {
  // Safe tools are always safe
  if (SAFE_TOOLS.has(toolName)) return 'safe';

  // Check Bash commands for danger patterns
  if (toolName === 'Bash') {
    const command = String(input.command ?? '');
    for (const pattern of DANGER_PATTERNS) {
      if (pattern.test(command)) return 'danger';
    }
    return 'warning';
  }

  // Write/Edit are warning level
  if (WARNING_TOOLS.has(toolName)) return 'warning';

  return 'warning';
}

export function getDangerKeywords(text: string): string[] {
  const keywords: string[] = [];
  for (const pattern of DANGER_PATTERNS) {
    const match = text.match(pattern);
    if (match) keywords.push(match[0]);
  }
  return keywords;
}
