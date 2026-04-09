// Desktop storage adapter — same interface as mobile storage.ts
// Communicates with electron-store via IPC through the preload bridge

declare global {
  interface Window {
    electronAPI: {
      store: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
        remove: (key: string) => Promise<void>;
        clearAll: () => Promise<void>;
        allKeys: () => Promise<string[]>;
      };
      dialog: {
        openFile: (filters?: any[]) => Promise<string | null>;
        saveFile: (defaultName: string) => Promise<string | null>;
      };
      file: {
        readAsBase64: (filePath: string) => Promise<string | null>;
        write: (filePath: string, content: string) => Promise<void>;
      };
      net: {
        fetch: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) =>
          Promise<{ ok: boolean; status: number; text: string }>;
      };
      notify: (title: string, body: string) => Promise<void>;
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      platform: string;
    };
  }
}

export const KEYS = {
  system:       'ps:system',
  members:      'ps:members',
  front:        'ps:front',
  history:      'ps:history',
  journal:      'ps:journal',
  share:        'ps:share',
  settings:     'ps:settings',
  lightMode:    'ps:lightMode',
  language:     'ps:language',
  groups:       'ps:groups',
  palettes:     'ps:palettes',
  chatChannels: 'ps:chatChannels',
};

export const chatMsgKey = (channelId: string): string => `ps:chat:${channelId}`;

export const store = {
  async get<T>(key: string, fallback: T | null = null): Promise<T | null> {
    try {
      const raw = await window.electronAPI.store.get(key);
      if (raw === null || raw === undefined) return fallback;
      return raw as T;
    } catch {
      return fallback;
    }
  },

  async set(key: string, value: unknown): Promise<void> {
    try {
      await window.electronAPI.store.set(key, value);
    } catch (e) {
      console.error('Storage write error:', e);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await window.electronAPI.store.remove(key);
    } catch (e) {
      console.error('Storage remove error:', e);
    }
  },

  async clearAll(): Promise<void> {
    try {
      await window.electronAPI.store.clearAll();
    } catch (e) {
      console.error('Storage clear error:', e);
    }
  },
};
