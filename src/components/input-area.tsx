import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { COMMANDS, MODELS } from '../core/commands.js';

interface InputAreaProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

interface AutocompleteItem {
  label: string;
  desc: string;
  value: string; // what gets filled into input
}

export default function InputArea({ onSubmit, disabled }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Determine autocomplete items based on input state
  const items = useMemo((): AutocompleteItem[] => {
    if (!input.startsWith('/')) return [];

    const hasSpace = input.includes(' ');
    const cmdPart = input.slice(1).split(' ')[0]!.toLowerCase();

    if (!hasSpace) {
      // Command-level autocomplete
      return COMMANDS
        .filter(cmd => cmd.name.startsWith(cmdPart))
        .map(cmd => ({
          label: `/${cmd.name}${cmd.args ? ' ' + cmd.args : ''}`,
          desc: cmd.desc,
          value: `/${cmd.name} `,
        }));
    }

    // Argument-level autocomplete
    const cmd = COMMANDS.find(c => c.name === cmdPart);
    if (!cmd?.options) return [];

    const argPart = input.slice(input.indexOf(' ') + 1).toLowerCase();
    const filtered = cmd.options.filter(opt => opt.startsWith(argPart));
    if (filtered.length === 0) return [];

    // Get descriptions for models
    return filtered.map(opt => {
      const modelInfo = cmd.name === 'model' ? MODELS.find(m => m.name === opt) : null;
      return {
        label: opt,
        desc: modelInfo?.desc ?? '',
        value: `/${cmd.name} ${opt}`,
      };
    });
  }, [input]);

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
