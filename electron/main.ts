import { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import Store from 'electron-store';

const store = new Store({ name: 'plural-space-data' });
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC: Storage ───────────────────────────────────────────────────────────

ipcMain.handle('store:get', (_e, key: string) => {
  return store.get(key, null);
});

ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
  store.set(key, value);
});

ipcMain.handle('store:remove', (_e, key: string) => {
  store.delete(key);
});

ipcMain.handle('store:clearAll', () => {
  const all = store.store;
  for (const key of Object.keys(all)) {
    if (key.startsWith('ps:')) store.delete(key);
  }
});

ipcMain.handle('store:allKeys', () => {
  return Object.keys(store.store);
});

// ─── IPC: File Dialogs ──────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_e, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_e, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
    ],
  });
  return result.canceled ? null : result.filePath;
});

// ─── IPC: Notifications ─────────────────────────────────────────────────────

ipcMain.handle('notify', (_e, title: string, body: string) => {
  new Notification({ title, body }).show();
});

// ─── IPC: Window Controls ───────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ─── System Tray ─────────────────────────────────────────────────────────────

function createTray(): void {
  // Placeholder — will use actual icon asset
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Plural Space');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Plural Space', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
