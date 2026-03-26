import { ipcMain, dialog, BrowserWindow } from 'electron';
import os from 'os';

export function registerIpcHandlers() {
  ipcMain.handle('get-ws-port', () => {
    return parseInt(process.env.WS_PORT || '0', 10);
  });

  ipcMain.handle('get-home-path', () => {
    return os.homedir();
  });

  ipcMain.handle('dialog:select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
