const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getWsPort: () => ipcRenderer.invoke('get-ws-port'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  getHomePath: () => ipcRenderer.invoke('get-home-path'),
  revealInFinder: (path) => ipcRenderer.send('reveal-in-finder', path),
});
