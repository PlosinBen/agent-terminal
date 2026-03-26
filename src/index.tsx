import React from 'react';
import { render } from 'ink';
import App from './app.js';
import { logger } from './core/logger.js';

// Prevent nested invocation
if (process.env.AGENT_TERMINAL) {
  console.error('\x1b[31merror:\x1b[0m agent-terminal is already running in a parent process. Nested invocation is not supported.');
  process.exit(1);
}
process.env.AGENT_TERMINAL = '1';

logger.setLevel('debug');

// Enter alternate screen buffer — restores original terminal on exit
process.stdout.write('\x1b[?1049h');

const { waitUntilExit } = render(<App />, { exitOnCtrlC: false });

waitUntilExit().then(() => {
  // Leave alternate screen buffer — restore previous terminal content
  process.stdout.write('\x1b[?1049l');
});
