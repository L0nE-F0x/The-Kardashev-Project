const { contextBridge, ipcRenderer } = require('electron');

const isSteam = process.argv.includes('--kp-steam=1');

contextBridge.exposeInMainWorld('kardashevDesktop', {
  isSteam,
  saveFile: (name, bytes, kind) => ipcRenderer.invoke('kp:save-file', { name, bytes, kind }),
  quit: () => ipcRenderer.invoke('kp:quit'),
  restart: () => ipcRenderer.invoke('kp:restart'),
  toggleFullscreen: () => ipcRenderer.invoke('kp:toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('kp:open-external', url),
  gpuGet: () => ipcRenderer.invoke('kp:gpu-get'),
  gpuSet: (prefer) => ipcRenderer.invoke('kp:gpu-set', prefer),
  gpuKeep: () => ipcRenderer.invoke('kp:gpu-keep'),
  checkUpdate: () => ipcRenderer.invoke('kp:update-check'),
  installUpdate: () => ipcRenderer.invoke('kp:update-install'),
  onUpdateStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('kp:update-status', listener);
    return () => ipcRenderer.removeListener('kp:update-status', listener);
  },
});
