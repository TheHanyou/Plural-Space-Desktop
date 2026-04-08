import { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';

app.setName('Plural Space');

const userDataPath = app.getPath('userData');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const store = new Store({ name: 'plural-space-data', cwd: userDataPath });
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
  try {
    return store.get(key, null);
  } catch (e) {
    console.error('[store:get] error:', e);
    return null;
  }
});

ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
  try {
    store.set(key, value);
  } catch (e: any) {
    if (e?.code === 'EXDEV') {
      try {
        const filePath = (store as any).path;
        const current = fs.existsSync(filePath)
          ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
          : {};
        current[key] = value;
        fs.writeFileSync(filePath, JSON.stringify(current, null, '\t'));
      } catch (fallbackErr) {
        console.error('[store:set] fallback write failed:', fallbackErr);
        throw fallbackErr;
      }
    } else {
      console.error('[store:set] error:', e);
      throw e;
    }
  }
});

ipcMain.handle('store:remove', (_e, key: string) => {
  try {
    store.delete(key);
  } catch (e) {
    console.error('[store:remove] error:', e);
    throw e;
  }
});

ipcMain.handle('store:clearAll', () => {
  try {
    const all = store.store;
    for (const key of Object.keys(all)) {
      if (key.startsWith('ps:')) store.delete(key);
    }
  } catch (e) {
    console.error('[store:clearAll] error:', e);
    throw e;
  }
});

ipcMain.handle('store:allKeys', () => {
  try {
    return Object.keys(store.store);
  } catch (e) {
    console.error('[store:allKeys] error:', e);
    return [];
  }
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

// ─── IPC: File Reading ──────────────────────────────────────────────────────

ipcMain.handle('file:readAsBase64', async (_e, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.error('[file:readAsBase64] error:', e);
    return null;
  }
});

ipcMain.handle('file:write', async (_e, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (e) {
    console.error('[file:write] error:', e);
    throw e;
  }
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
