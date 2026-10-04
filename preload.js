const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('garage', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  exportFile: (opts) => ipcRenderer.invoke('file:export', opts),
  importJson: () => ipcRenderer.invoke('file:importJson'),
  decodeVin: (vin) => ipcRenderer.invoke('vin:decode', vin),
  getVersion: () => ipcRenderer.invoke('app:version'),
  updateState: () => ipcRenderer.invoke('update:state'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('update:state', handler);
    return () => ipcRenderer.removeListener('update:state', handler);
  }
});
