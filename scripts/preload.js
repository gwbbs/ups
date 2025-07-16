const { contextBridge, ipcRenderer } = require('electron');

// Espone le funzioni Python al renderer in modo sicuro
contextBridge.exposeInMainWorld('pyBridge', {
  runPython: (scriptName, argsArray = []) => {
    return ipcRenderer.invoke('run-python', scriptName, argsArray);
  }
});

// Espone altre funzioni utili
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  writeText: (text) => ipcRenderer.invoke('write-clipboard', text),
  showDialog: (options) => ipcRenderer.invoke('show-dialog', options),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path)
});
