import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { store, KEYS } from './storage';
import { deriveTheme, applyThemeToDOM, applyTextScale, DARK_PALETTE, BUILTIN_PALETTES, CustomPalette, ThemeColors } from './theme';
import {
  Member, FrontState, HistoryEntry, JournalEntry, ChatChannel, ChatMessage,
  AppSettings, SystemInfo, MemberGroup, migrateFrontState, isFrontEmpty,
  fmtDur, getInitials, DEFAULT_CHANNELS,
} from './utils';
import { changeLanguage } from './i18n/i18n';

import FrontTile from './tiles/FrontTile';
import MembersTile from './tiles/MembersTile';
import HistoryTile from './tiles/HistoryTile';
import JournalTile from './tiles/JournalTile';
import ChatTile from './tiles/ChatTile';
import StatsTile from './tiles/StatsTile';
import ImportExportTile from './tiles/ImportExportTile';
import SettingsTile from './tiles/SettingsTile';

// Full views
import SettingsView from './views/SettingsView';
import MembersView from './views/MembersView';
import ImportExportView from './views/ImportExportView';
import StatsView from './views/StatsView';
import JournalView from './views/JournalView';
import HistoryView from './views/HistoryView';
import FrontView from './views/FrontView';
import ChatView from './views/ChatView';

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewId = 'dashboard' | 'front' | 'members' | 'history' | 'journal' | 'chat' | 'stats' | 'import-export' | 'settings';

interface AppState {
  system: SystemInfo;
  members: Member[];
  groups: MemberGroup[];
  front: FrontState | null;
  history: HistoryEntry[];
  journal: JournalEntry[];
  channels: ChatChannel[];
  settings: AppSettings;
  palettes: CustomPalette[];
  theme: ThemeColors;
  loaded: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  locations: [],
  customMoods: [],
  lightMode: false,
  gpsEnabled: false,
  filesEnabled: true,
  language: 'en',
  notificationsEnabled: true,
  activePaletteId: '__dark__',
  textScale: 1.0,
};

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewId>('dashboard');
  const [state, setState] = useState<AppState>({
    system: { name: '', description: '' },
    members: [],
    groups: [],
    front: null,
    history: [],
    journal: [],
    channels: [],
    settings: DEFAULT_SETTINGS,
    palettes: [],
    theme: deriveTheme(DARK_PALETTE.bg, DARK_PALETTE.accent, DARK_PALETTE.text, DARK_PALETTE.mid),
    loaded: false,
  });

  // ─── Load Data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [system, members, groups, frontRaw, history, journal, channels, settings, palettes] = await Promise.all([
      store.get<SystemInfo>(KEYS.system, { name: '', description: '' }),
      store.get<Member[]>(KEYS.members, []),
      store.get<MemberGroup[]>(KEYS.groups, []),
      store.get<FrontState>(KEYS.front, null),
      store.get<HistoryEntry[]>(KEYS.history, []),
      store.get<JournalEntry[]>(KEYS.journal, []),
      store.get<ChatChannel[]>(KEYS.chatChannels, []),
      store.get<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
      store.get<CustomPalette[]>(KEYS.palettes, []),
    ]);

    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
    const front = migrateFrontState(frontRaw);
    const allPalettes = [...BUILTIN_PALETTES, ...(palettes || [])];
    const activePalette = allPalettes.find(p => p.id === mergedSettings.activePaletteId) || DARK_PALETTE;
    const theme = deriveTheme(activePalette.bg, activePalette.accent, activePalette.text, activePalette.mid);
    applyThemeToDOM(theme);
    applyTextScale(mergedSettings.textScale);
    changeLanguage(mergedSettings.language);

    setState({
      system: system || { name: '', description: '' },
      members: members || [],
      groups: groups || [],
      front,
      history: history || [],
      journal: journal || [],
      channels: channels || [],
      settings: mergedSettings,
      palettes: palettes || [],
      theme,
      loaded: true,
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Title Bar ──────────────────────────────────────────────────────────

  const systemName = state.system.name || 'Plural Space';

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!state.loaded) {
    return (
      <div className="app-shell">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 18 }}>
            Loading...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Title Bar */}
      <div className="titlebar">
        <span className="titlebar__title">
          {view === 'dashboard' ? systemName : `${systemName} — ${view.charAt(0).toUpperCase() + view.slice(1).replace('-', '/')}`}
        </span>
        <div className="titlebar__controls">
          <button className="titlebar__btn titlebar__btn--minimize" onClick={() => window.electronAPI.window.minimize()} />
          <button className="titlebar__btn titlebar__btn--maximize" onClick={() => window.electronAPI.window.maximize()} />
          <button className="titlebar__btn titlebar__btn--close" onClick={() => window.electronAPI.window.close()} />
        </div>
      </div>

      {/* Dashboard or Full View */}
      {view === 'dashboard' ? (
        <div className="dashboard">
          <div className="tile-grid">
            <FrontTile
              front={state.front}
              members={state.members}
              onClick={() => setView('front')}
            />
            <MembersTile
              members={state.members}
              onClick={() => setView('members')}
            />
            <HistoryTile
              history={state.history}
              members={state.members}
              onClick={() => setView('history')}
            />
            <JournalTile
              journal={state.journal}
              members={state.members}
              onClick={() => setView('journal')}
            />
            <ChatTile
              channels={state.channels}
              members={state.members}
              onClick={() => setView('chat')}
            />
            <StatsTile
              history={state.history}
              members={state.members}
              onClick={() => setView('stats')}
            />
            <ImportExportTile
              onClick={() => setView('import-export')}
            />
            <SettingsTile
              settings={state.settings}
              onClick={() => setView('settings')}
            />
          </div>
        </div>
      ) : (
        <div className="full-view">
          <div className="full-view__header">
            <button className="full-view__back" onClick={() => setView('dashboard')}>
              ← Dashboard
            </button>
            <span className="full-view__title">
              {view === 'front' ? t('tabs.front')
                : view === 'members' ? t('members.title')
                : view === 'history' ? t('history.title')
                : view === 'journal' ? t('journal.title')
                : view === 'chat' ? t('hub.systemChat')
                : view === 'stats' ? t('hub.statistics')
                : view === 'import-export' ? t('hub.importExport')
                : view === 'settings' ? t('modal.systemSettings')
                : view}
            </span>
          </div>
          <div className="full-view__content">
            {view === 'settings' && (
              <SettingsView system={state.system} settings={state.settings} palettes={state.palettes} onUpdate={loadData} />
            )}
            {view === 'members' && (
              <MembersView members={state.members} groups={state.groups} onUpdate={loadData} />
            )}
            {view === 'import-export' && (
              <ImportExportView system={state.system} members={state.members} history={state.history}
                journal={state.journal} settings={state.settings} channels={state.channels}
                palettes={state.palettes} onUpdate={loadData} />
            )}
            {view === 'stats' && (
              <StatsView history={state.history} members={state.members} channels={state.channels} />
            )}
            {view === 'journal' && (
              <JournalView journal={state.journal} members={state.members} onUpdate={loadData} />
            )}
            {view === 'history' && (
              <HistoryView history={state.history} members={state.members} />
            )}
            {view === 'front' && (
              <FrontView front={state.front} members={state.members} groups={state.groups}
                history={state.history} settings={state.settings} onUpdate={loadData} />
            )}
            {view === 'chat' && (
              <ChatView members={state.members} channels={state.channels} onUpdate={loadData} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
