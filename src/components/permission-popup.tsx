import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { classifyRisk, getDangerKeywords, type RiskLevel } from '../core/permission.js';

interface PermissionPopupProps {
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  onRespond: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  safe: 'green',
  warning: 'yellow',
  danger: 'red',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  safe: 'SAFE',
  warning: 'WARNING',
  danger: 'DANGER',
};

const OPTIONS = [
  { key: '1', label: 'Yes', action: 'allow' },
  { key: '2', label: 'No', action: 'deny' },
] as const;

export default function PermissionPopup({ toolName, input, title, onRespond }: PermissionPopupProps) {
  const [selected, setSelected] = useState(0);
  const risk = classifyRisk(toolName, input);

  // Format input for display
  const inputDisplay = toolName === 'Bash'
    ? String(input.command ?? '')
    : JSON.stringify(input, null, 2);

  const dangerKeywords = getDangerKeywords(inputDisplay);

  useInput((ch, key) => {
    if (key.upArrow) setSelected(s => Math.max(0, s - 1));
    if (key.downArrow) setSelected(s => Math.min(OPTIONS.length - 1, s + 1));

    if (key.return) {
      const opt = OPTIONS[selected];
      if (opt.action === 'allow') {
        onRespond({ behavior: 'allow' });
      } else {
        onRespond({ behavior: 'deny', message: 'Denied by user' });
      }
      return;
    }

    // Quick select by number
    if (ch === '1') onRespond({ behavior: 'allow' });
    if (ch === '2') onRespond({ behavior: 'deny', message: 'Denied by user' });
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={RISK_COLORS[risk]} paddingX={1}>
      <Box>
        <Text bold color={RISK_COLORS[risk]}>[{RISK_LABELS[risk]}] </Text>
        <Text bold>{title ?? `Allow ${toolName}?`}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Tool: {toolName}</Text>
        <Box marginTop={1}>
          <Text>{highlightDanger(inputDisplay, dangerKeywords)}</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {OPTIONS.map((opt, i) => (
          <Text key={opt.key}>
            {i === selected ? '> ' : '  '}
            [{opt.key}] {opt.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function highlightDanger(text: string, _keywords: string[]): string {
  // For now, return plain text. Ink doesn't support inline color spans easily.
  // Danger highlighting will be handled by risk level border color.
  return text;
}
