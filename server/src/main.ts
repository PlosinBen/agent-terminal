import { app, BrowserWindow } from 'electron';
import path from 'path';
import { logger } from './core/logger.js';
import { registerIpcHandlers } from './ipc.js';
import { fixMacOsPath, createServerCore, getPreferredPort } from './server-core.js';

fixMacOsPath();

let mainWindow: BrowserWindow | null = null;
const core = createServerCore();

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

app.whenReady().then(async () => {
  registerIpcHandlers();
  const port = await core.wsServer.start(getPreferredPort());
  console.log(`[server] WS listening on port ${port}`);

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
  core.sessionManager.dispose();
  core.wsServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
