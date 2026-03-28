import { ipcMain, shell } from 'electron';

export function registerIpcHandlers() {
  ipcMain.on('reveal-in-finder', (_event, path: string) => {
    shell.showItemInFolder(path);
  });
}
