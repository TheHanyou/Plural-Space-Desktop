"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Storage
    store: {
        get: (key) => electron_1.ipcRenderer.invoke('store:get', key),
        set: (key, value) => electron_1.ipcRenderer.invoke('store:set', key, value),
        remove: (key) => electron_1.ipcRenderer.invoke('store:remove', key),
        clearAll: () => electron_1.ipcRenderer.invoke('store:clearAll'),
        allKeys: () => electron_1.ipcRenderer.invoke('store:allKeys'),
    },
    // File dialogs
    dialog: {
        openFile: (filters) => electron_1.ipcRenderer.invoke('dialog:openFile', filters),
        saveFile: (defaultName) => electron_1.ipcRenderer.invoke('dialog:saveFile', defaultName),
    },
    // Notifications
    notify: (title, body) => electron_1.ipcRenderer.invoke('notify', title, body),
    // Window controls
    window: {
        minimize: () => electron_1.ipcRenderer.send('window:minimize'),
        maximize: () => electron_1.ipcRenderer.send('window:maximize'),
        close: () => electron_1.ipcRenderer.send('window:close'),
    },
    // Platform info
    platform: process.platform,
});
