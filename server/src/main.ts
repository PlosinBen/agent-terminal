import { app, BrowserWindow } from 'electron';
import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import { fixMacOsPath } from './server-core.js';
import { registerIpcHandlers } from './ipc.js';

fixMacOsPath();

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function spawnServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(import.meta.dirname, 'standalone.js');
    serverProcess = fork(serverPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        ELECTRON_RESOURCES_PATH: process.resourcesPath || '',
      },
    });

    let resolved = false;

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString();
      process.stdout.write(line);
      if (!resolved) {
        const match = line.match(/on (?:http:\/\/localhost:|port )(\d+)/);
        if (match) {
          resolved = true;
          resolve(parseInt(match[1], 10));
        }
      }
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(data.toString());
    });

    serverProcess.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });

    serverProcess.on('exit', (code) => {
      if (!resolved && code !== 0) {
        resolved = true;
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!resolved) { resolved = true; reject(new Error('Server start timeout')); }
    }, 10000);
  });
}

function createWindow(serverPort: number) {
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
    mainWindow.loadURL(`http://localhost:${serverPort}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();

  let port = parseInt(process.env.AGENT_TERMINAL_PORT || '9100', 10);
  if (VITE_DEV_SERVER_URL) {
    // Dev mode: server already running externally (tsx watch)
    console.log(`[electron] Dev mode — using external server on port ${port}`);
  } else {
    // Production: spawn standalone server as child process
    port = await spawnServer();
    console.log(`[electron] Server ready on port ${port}`);
  }

  createWindow(port);

  // Auto-update: only in packaged production builds
  if (app.isPackaged) {
    setupAutoUpdater();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port);
    }
  });
});

function setupAutoUpdater() {
  Promise.all([
    import('electron-updater'),
    import('electron'),
  ]).then(([mod, { dialog }]) => {
    const eu = mod.default ?? mod;
    const autoUpdater = eu.autoUpdater ?? eu;
    if (!autoUpdater?.on) {
      console.error('[updater] autoUpdater not usable');
      return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info: { version: string }) => {
      console.log(`[updater] Update available: ${info.version}`);
    });

    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      console.log(`[updater] Update downloaded: ${info.version}`);
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Restart now to apply the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          // Kill server first, then quit and install
          serverProcess?.kill();
          serverProcess = null;
          setImmediate(() => autoUpdater.quitAndInstall());
        }
      });
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('[updater] Error:', err.message);
    });

    // Check after startup, delay to avoid slowing initial load
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 3000);
  }).catch((err) => {
    console.error('[updater] Failed to load electron-updater:', err.message);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  serverProcess?.kill();
  serverProcess = null;
});
