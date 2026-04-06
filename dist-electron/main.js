"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default({ name: 'plural-space-data' });
let mainWindow = null;
let tray = null;
const isDev = !electron_1.app.isPackaged;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 400,
        minHeight: 600,
        title: 'Plural Space',
        backgroundColor: '#0A1F2E',
        titleBarStyle: 'hiddenInset',
        frame: process.platform === 'darwin' ? false : true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ─── IPC: Storage ───────────────────────────────────────────────────────────
electron_1.ipcMain.handle('store:get', (_e, key) => {
    return store.get(key, null);
});
electron_1.ipcMain.handle('store:set', (_e, key, value) => {
    store.set(key, value);
});
electron_1.ipcMain.handle('store:remove', (_e, key) => {
    store.delete(key);
});
electron_1.ipcMain.handle('store:clearAll', () => {
    const all = store.store;
    for (const key of Object.keys(all)) {
        if (key.startsWith('ps:'))
            store.delete(key);
    }
});
electron_1.ipcMain.handle('store:allKeys', () => {
    return Object.keys(store.store);
});
// ─── IPC: File Dialogs ──────────────────────────────────────────────────────
electron_1.ipcMain.handle('dialog:openFile', async (_e, filters) => {
    const result = await electron_1.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters || [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle('dialog:saveFile', async (_e, defaultName) => {
    const result = await electron_1.dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [
            { name: 'JSON Files', extensions: ['json'] },
        ],
    });
    return result.canceled ? null : result.filePath;
});
// ─── IPC: Notifications ─────────────────────────────────────────────────────
electron_1.ipcMain.handle('notify', (_e, title, body) => {
    new electron_1.Notification({ title, body }).show();
});
// ─── IPC: Window Controls ───────────────────────────────────────────────────
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
    // Placeholder — will use actual icon asset
    const icon = electron_1.nativeImage.createEmpty();
    tray = new electron_1.Tray(icon);
    tray.setToolTip('Plural Space');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        { label: 'Open Plural Space', click: () => mainWindow?.show() },
        { type: 'separator' },
        { label: 'Quit', click: () => electron_1.app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow?.show());
}
// ─── App Lifecycle ───────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    createWindow();
    createTray();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
