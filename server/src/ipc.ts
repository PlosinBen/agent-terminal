import { ipcMain } from 'electron';

/**
 * Register minimal IPC handlers.
 * We only use IPC to pass the WS port to the renderer — everything else goes over WebSocket.
 */
export function registerIpcHandlers() {
  ipcMain.handle('get-ws-port', () => {
    return parseInt(process.env.WS_PORT || '0', 10);
  });
}
