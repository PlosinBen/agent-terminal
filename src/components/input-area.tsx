import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { COMMANDS } from '../core/commands.js';
import type { AgentBackend } from '../backend/types.js';

interface InputAreaProps {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  backend?: AgentBackend;
}

interface AutocompleteItem {
  label: string;
  desc: string;
  value: string; // what gets filled into input
}

export default function InputArea({ onSubmit, onCancel, disabled, backend }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build dynamic options for commands that depend on backend state (available from cache or after init)
  const dynamicOptions = useMemo((): Record<string, { value: string; desc: string }[]> => {
    if (!backend) return {};
    return {
      model: backend.getModels().map(m => ({ value: m.value, desc: m.displayName })),
      mode: backend.getPermissionModes().map(m => ({ value: m, desc: '' })),
      effort: backend.getEffortLevels().map(l => ({ value: l, desc: '' })),
    };
  }, [backend, backend?.isInitialized()]);

  // Merge app commands with SDK slash commands
  const allCommands = useMemo(() => {
    const sdkCmds = backend?.getSlashCommands() ?? [];
    const sdkItems = sdkCmds.map(c => ({ name: c.name, args: c.argumentHint, desc: c.description }));
    return [...COMMANDS, ...sdkItems];
  }, [backend, backend?.isInitialized()]);

  // Determine autocomplete items based on input state
  const items = useMemo((): AutocompleteItem[] => {
    if (!input.startsWith('/')) return [];

    const hasSpace = input.includes(' ');
    const cmdPart = input.slice(1).split(' ')[0]!.toLowerCase();

    if (!hasSpace) {
      // Command-level autocomplete
      return allCommands
        .filter(cmd => cmd.name.startsWith(cmdPart))
        .map(cmd => ({
          label: `/${cmd.name}${cmd.args ? ' ' + cmd.args : ''}`,
          desc: cmd.desc,
          value: `/${cmd.name} `,
        }));
    }

    // Argument-level autocomplete from dynamic options
    const opts = dynamicOptions[cmdPart];
    if (!opts) return [];

    const argPart = input.slice(input.indexOf(' ') + 1).toLowerCase();
    const filtered = opts.filter(opt => opt.value.toLowerCase().startsWith(argPart));
    if (filtered.length === 0) return [];

    return filtered.map(opt => ({
      label: opt.value,
      desc: opt.desc,
      value: `/${cmdPart} ${opt.value}`,
    }));
  }, [input, allCommands, dynamicOptions]);

  const showAutocomplete = items.length > 0 && !disabled;

  useInput((ch, key) => {
    if (disabled) return;

    // Autocomplete navigation
    if (showAutocomplete) {
      if (key.upArrow) {
        setSelectedIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex(i => Math.min(items.length - 1, i + 1));
        return;
      }
      if (key.tab) {
        const item = items[selectedIndex];
        if (item) {
          setInput(item.value);
          setSelectedIndex(0);
        }
        return;
      }
    }

    if (key.return) {
      if (showAutocomplete) {
        const item = items[selectedIndex];
        if (item) {
          // If the selected item is a complete command with arg, submit it directly
          const hasArg = item.value.trim().split(' ').length > 1
            && !item.value.endsWith(' ');
          if (hasArg) {
            onSubmit(item.value.trim());
            setInput('');
            setSelectedIndex(0);
            return;
          }
          // Otherwise fill it in
          setInput(item.value);
          setSelectedIndex(0);
          return;
        }
      }
      const trimmed = input.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setInput('');
        setSelectedIndex(0);
      }
      return;
    }

    if (key.escape) {
      if (showAutocomplete) {
        setInput('');
        setSelectedIndex(0);
        return;
      }
      if (onCancel) {
        onCancel();
        return;
      }
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    if (ch && !key.ctrl && !key.meta) {
      setInput(prev => prev + ch);
      setSelectedIndex(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor={disabled ? 'gray' : 'green'} paddingX={1} flexDirection="column">
        <Box>
          <Text color="green">&gt; </Text>
          <Text>{input}</Text>
          <Text color="gray">{'█'}</Text>
        </Box>

        {showAutocomplete && (
          <Box flexDirection="column">
            {items.map((item, i) => (
              <Box key={item.value}>
                <Text color={i === selectedIndex ? 'cyan' : 'gray'}>
                  {i === selectedIndex ? '› ' : '  '}
                </Text>
                <Text color={i === selectedIndex ? 'cyan' : 'white'} bold={i === selectedIndex}>
                  {item.label}
                </Text>
                {item.desc ? (
                  <Text color="gray"> — {item.desc}</Text>
                ) : null}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
