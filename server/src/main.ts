import { app, BrowserWindow } from 'electron';
import path from 'path';
import { execFileSync } from 'child_process';
import { WsServer } from './ws-server.js';
import { SessionManager } from './session-manager.js';
import { logger } from './core/logger.js';
import { registerIpcHandlers } from './ipc.js';
import type { UpstreamMessage, DownstreamMessage } from './shared/protocol.js';

// Fix PATH for GUI-launched apps on macOS
if (process.platform === 'darwin') {
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const rawPath = execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
      timeout: 3000,
      encoding: 'utf8',
    }).trim();
    if (rawPath) process.env.PATH = rawPath;
  } catch {
    const extra = ['/opt/homebrew/bin', '/usr/local/bin'];
    process.env.PATH = `${extra.join(':')}:${process.env.PATH || ''}`;
  }
}

let mainWindow: BrowserWindow | null = null;
const wsServer = new WsServer();
const sessionManager = new SessionManager();

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow(wsPort: number) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: true,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(import.meta.dirname, '..', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Agent Terminal',
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load built client from client/dist/
    mainWindow.loadFile(path.join(import.meta.dirname, '../../client/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupMessageRouter() {
  wsServer.onMessage((msg: UpstreamMessage, send: (reply: DownstreamMessage) => void) => {
    sessionManager.handleMessage(msg, send, wsServer);
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  setupMessageRouter();
  const port = await wsServer.start(0);
  logger.debug(`Electron main ready, WS port=${port}`);

  // Write port to env so preload can expose it
  process.env.WS_PORT = String(port);

  createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port);
    }
  });
});

app.on('window-all-closed', () => {
  sessionManager.dispose();
  wsServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
