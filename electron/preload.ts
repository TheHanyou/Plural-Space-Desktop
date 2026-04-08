import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    remove: (key: string) => ipcRenderer.invoke('store:remove', key),
    clearAll: () => ipcRenderer.invoke('store:clearAll'),
    allKeys: () => ipcRenderer.invoke('store:allKeys'),
  },

  // File dialogs
  dialog: {
    openFile: (filters?: any[]) => ipcRenderer.invoke('dialog:openFile', filters),
    saveFile: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  },

  // File reading
  file: {
    readAsBase64: (filePath: string) => ipcRenderer.invoke('file:readAsBase64', filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
  },

  // Notifications
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body),

  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // Platform info
  platform: process.platform,
});
