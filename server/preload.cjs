const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  revealInFinder: (path) => ipcRenderer.send('reveal-in-finder', path),
});
