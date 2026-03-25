import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputAreaProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export default function InputArea({ onSubmit, disabled }: InputAreaProps) {
  const [input, setInput] = useState('');

  useInput((ch, key) => {
    if (disabled) return;

    if (key.return) {
      const trimmed = input.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setInput('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (ch && !key.ctrl && !key.meta) {
      setInput(prev => prev + ch);
    }
  });

  return (
    <Box borderStyle="single" borderColor={disabled ? 'gray' : 'green'} paddingX={1}>
      <Text color="green">&gt; </Text>
      <Text>{input}</Text>
      <Text color="gray">{'█'}</Text>
    </Box>
  );
}
