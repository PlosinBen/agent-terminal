// Re-export from permission module for convenience
export { classifyRisk, getDangerKeywords, type RiskLevel } from '../core/permission.js';

const DANGER_KEYWORDS = [
  'rm -rf', 'rm -f', 'rm --force',
  'drop table', 'drop database',
  'git reset --hard', 'git push --force', 'git clean -f', 'git branch -D',
  'sudo', 'chmod 777', 'mkfs', 'dd if=',
  '> /dev/', 'truncate',
];

/**
 * Highlight danger keywords in text by wrapping them with ANSI red.
 */
export function highlightDangerKeywords(text: string): string {
  let result = text;
  for (const keyword of DANGER_KEYWORDS) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, '\x1b[31m$1\x1b[0m');
  }
  return result;
}
