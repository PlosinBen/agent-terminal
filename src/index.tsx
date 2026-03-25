import React from 'react';
import { render } from 'ink';
import App from './app.js';

// Enter alternate screen buffer — restores original terminal on exit
process.stdout.write('\x1b[?1049h');

const { waitUntilExit } = render(<App />, { exitOnCtrlC: false });

waitUntilExit().then(() => {
  // Leave alternate screen buffer — restore previous terminal content
  process.stdout.write('\x1b[?1049l');
});
