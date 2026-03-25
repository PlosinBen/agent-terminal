import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

export interface Notification {
  type: 'permission' | 'done' | 'error';
  message: string;
}

interface NotificationBarProps {
  notification: Notification | null;
}

const COLORS: Record<Notification['type'], string> = {
  permission: 'yellow',
  done: 'green',
  error: 'red',
};

const ICONS: Record<Notification['type'], string> = {
  permission: '⚠',
  done: '✓',
  error: '✗',
};

export default function NotificationBar({ notification }: NotificationBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notification) {
      setVisible(false);
      return;
    }
    setVisible(true);

    // Auto-hide for non-permission notifications
    if (notification.type !== 'permission') {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (!visible || !notification) return null;

  return (
    <Box paddingX={1}>
      <Text color={COLORS[notification.type]} bold>
        {ICONS[notification.type]} {notification.message}
      </Text>
    </Box>
  );
}
