import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n/i18n';
import { store, KEYS } from './storage';
import { deriveTheme, applyThemeToDOM, applyTextScale, applyFontChoice, DARK_PALETTE, BUILTIN_PALETTES, CustomPalette } from './theme';
import {
  Member, FrontState, HistoryEntry, JournalEntry, ChatChannel, ChatCategory, ChatMessage,
  AppSettings, SystemInfo, MemberGroup, migrateFrontState, isFrontEmpty,
  fmtDur, getInitials, DEFAULT_CHANNELS, DEFAULT_MOODS, makeDefaultCustomFronts,
  uid, singletStatuses, readableAccent,
} from './utils';
import { changeLanguage } from './i18n/i18n';
import { setTerminologyOverrides, setTierNameOverrides } from './i18n/terminology';
import { ImageCropHost } from './components/ImageCropModal';

import FrontTile from './tiles/FrontTile';
import MembersTile from './tiles/MembersTile';
import HistoryTile from './tiles/HistoryTile';
import JournalTile from './tiles/JournalTile';
import ChatTile from './tiles/ChatTile';
import StatsTile from './tiles/StatsTile';
import ImportExportTile from './tiles/ImportExportTile';
import SettingsTile from './tiles/SettingsTile';
import CustomFieldsTile from './tiles/CustomFieldsTile';
import PollsTile from './tiles/PollsTile';
import CreditsTile from './tiles/CreditsTile';
import SupportTile from './tiles/SupportTile';
import DiscordTile from './tiles/DiscordTile';
import SystemManagerTile from './tiles/SystemManagerTile';
import SystemMapTile from './tiles/SystemMapTile';
import MedicalTile from './tiles/MedicalTile';
import PlannerTile from './tiles/PlannerTile';
import PlannerView from './views/PlannerView';
import ArchiveTile from './tiles/ArchiveTile';
import RetroHistoryTile from './tiles/RetroHistoryTile';
import StatusTile from './tiles/StatusTile';
import ProfileTile from './tiles/ProfileTile';
import NetworkTile from './tiles/NetworkTile';
import MailboxTile from './tiles/MailboxTile';
import WhiteboardTile from './tiles/WhiteboardTile';
import ColorsTile from './tiles/ColorsTile';

import SettingsView from './views/SettingsView';
import SystemProfileView from './views/SystemProfileView';
import MembersView from './views/MembersView';
import SystemMapView from './views/SystemMapView';
import MedicalView from './views/MedicalView';
import { startMedicalReminders } from './services/medicalReminders';
import { startPlannerReminders } from './services/plannerReminders';
import { startFriendAlerts } from './services/friendAlerts';
import ImportExportView from './views/ImportExportView';
import StatsView from './views/StatsView';
import JournalView from './views/JournalView';
import HistoryView from './views/HistoryView';
import FrontView, { SetFrontModal, applyFrontUpdate } from './views/FrontView';
import ChatView from './views/ChatView';
import CustomFieldsView from './views/CustomFieldsView';
import PollsView from './views/PollsView';
import CreditsView from './views/CreditsView';
import SystemManagerView from './views/SystemManagerView';
import RetroHistoryView from './views/RetroHistoryView';
import StatusView, { SetStatusModal } from './views/StatusView';
import ProfileView from './views/ProfileView';
import NetworkView from './views/NetworkView';
import MailboxView from './views/MailboxView';
import WhiteboardView from './views/WhiteboardView';
import ColorsView from './views/ColorsView';
import { NetworkManager } from './network/NetworkManager';
import { Modal, Btn } from './components/ui';
import { useAppStore, DEFAULT_SETTINGS } from './store/appStore';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import SortableTile from './components/SortableTile';
import { loadTileOrder, saveTileOrder } from './dashboard/tileOrder';

type ViewId = 'dashboard' | 'front' | 'members' | 'history' | 'journal' | 'chat' | 'stats' | 'import-export' | 'settings' | 'system-profile' | 'custom-fields' | 'polls' | 'credits' | 'system-manager' | 'system-map' | 'medical' | 'archive' | 'retro-history' | 'network' | 'mailbox' | 'whiteboard' | 'colors' | 'planner';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('AppErrorBoundary caught:', error, info?.componentStack);
    }
  }
  reset = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error as Error;
    const msg = err?.message || String(err);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0a0a0a', color: '#fff', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-display)' }}>
          {i18n.t('errorBoundary.title', { defaultValue: 'Something went wrong' })}
        </h1>
        <p style={{ fontSize: 14, color: '#bbb', marginBottom: 16, maxWidth: 480 }}>
          {i18n.t('errorBoundary.body', { defaultValue: 'The app hit an unexpected error. Try again, or restart if it persists.' })}
        </p>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 24, maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap' }}>
          {msg}
        </p>
        <button onClick={this.reset} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#3a7bd5', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          {i18n.t('errorBoundary.retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    );
  }
}

function AppInner() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewId>('dashboard');
  const [memberFocus, setMemberFocus] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const [showQuickFront, setShowQuickFront] = useState(false);
  const state = useAppStore(s => s.state);
  const setState = useAppStore(s => s.setState);

  const loadData = useCallback(async () => {
    const [system, members, groups, frontRaw, history, journal, channels, chatCategories, settings, palettes] = await Promise.all([
      store.get<SystemInfo>(KEYS.system, { name: '', description: '' }),
      store.get<Member[]>(KEYS.members, []),
      store.get<MemberGroup[]>(KEYS.groups, []),
      store.get<FrontState>(KEYS.front, null),
      store.get<HistoryEntry[]>(KEYS.history, []),
      store.get<JournalEntry[]>(KEYS.journal, []),
      store.get<ChatChannel[]>(KEYS.chatChannels, []),
      store.get<ChatCategory[]>(KEYS.chatCategories, []),
      store.get<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
      store.get<CustomPalette[]>(KEYS.palettes, []),
    ]);

    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
    let memberList = members || [];
    if (!mergedSettings.customFrontsSeeded) {
      const existingCustomNames = new Set(memberList.filter(m => m.isCustomFront).map(m => (m.name || '').toLowerCase()));
      const seeds = makeDefaultCustomFronts().filter(cf => !existingCustomNames.has(cf.name.toLowerCase()));
      memberList = [...memberList, ...seeds];
      mergedSettings.customFrontsSeeded = true;
      await store.setBatch({ [KEYS.members]: memberList, [KEYS.settings]: mergedSettings });
    }
    let front = migrateFrontState(frontRaw);
    const archivedFrontIds = new Set(memberList.filter(m => m.archived).map(m => m.id));
    if (front && archivedFrontIds.size > 0) {
      const pruneTier = (tier: any) => tier ? {...tier, memberIds: (tier.memberIds || []).filter((id: string) => !archivedFrontIds.has(id))} : tier;
      const next: any = {...front, primary: pruneTier(front.primary), coFront: pruneTier(front.coFront), coConscious: pruneTier(front.coConscious)};
      const count = (f: any) => (f?.primary?.memberIds?.length || 0) + (f?.coFront?.memberIds?.length || 0) + (f?.coConscious?.memberIds?.length || 0);
      if (count(next) !== count(front)) {
        front = isFrontEmpty(next) ? null : next;
        await store.set(KEYS.front, front);
      }
    }
    const allPalettes = [...BUILTIN_PALETTES, ...(palettes || [])];
    const activePalette = allPalettes.find(p => p.id === mergedSettings.activePaletteId) || DARK_PALETTE;
    const theme = deriveTheme(activePalette.bg, activePalette.accent, activePalette.text, activePalette.mid);
    applyThemeToDOM(theme);
    applyTextScale(mergedSettings.textScale);
    applyFontChoice(mergedSettings.fontChoice ?? (mergedSettings.useDyslexicFont === true ? 'opendyslexic' : 'default'));
    changeLanguage(mergedSettings.language);
    setTerminologyOverrides(mergedSettings.terminology);
    setTierNameOverrides(mergedSettings.tierNames);

    setState({
      system: system || { name: '', description: '' },
      members: memberList,
      groups: groups || [],
      front,
      history: history || [],
      journal: journal || [],
      channels: channels || [],
      chatCategories: chatCategories || [],
      settings: mergedSettings,
      palettes: palettes || [],
      theme,
      loaded: true,
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => startMedicalReminders(), []);
  useEffect(() => startPlannerReminders(), []);
  useEffect(() => startFriendAlerts(), []);

  const [syncConflict, setSyncConflict] = useState<{peerId: string; deviceName: string} | null>(null);
  const [roleMismatch, setRoleMismatch] = useState<{deviceName: string} | null>(null);
  useEffect(() => { NetworkManager.init().catch(e => console.error('[NETWORK] init failed:', e)); }, []);
  useEffect(() => { if (state.loaded) NetworkManager.updateMyFront(state.front, state.members).catch(() => {}); }, [state.loaded, state.front, state.members]);
  useEffect(() => { NetworkManager.notifyDataChanged(); }, [state.system, state.members, state.groups, state.front, state.history, state.journal, state.channels, state.chatCategories, state.settings, state.palettes]);
  useEffect(() => NetworkManager.onSyncApplied(() => { loadData(); }), [loadData]);
  useEffect(() => NetworkManager.onSyncConflict(c => setSyncConflict({peerId: c.peerId, deviceName: c.deviceName})), []);
  useEffect(() => NetworkManager.onSyncRoleMismatch(c => setRoleMismatch({deviceName: c.deviceName})), []);

  const systemName = state.system.name || 'Plural Star';
  const titlePalette = [...BUILTIN_PALETTES, ...(state.palettes || [])].find(p => p.id === state.settings.activePaletteId) || DARK_PALETTE;
  const titleColor = readableAccent(titlePalette.accent, titlePalette.bg, state.theme.text);

  const isSinglet = state.settings.accountMode === 'singlet';
  const selfMember = isSinglet
    ? (state.members.find(m => m.id === state.settings.selfMemberId && !m.isCustomFront)
      || state.members.find(m => !m.isCustomFront && !m.archived))
    : undefined;
  const statuses = singletStatuses(state.members);

  const [tileOrder, setTileOrder] = useState<string[]>(() => loadTileOrder());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleTileDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setTileOrder(prev => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from < 0 || to < 0) return prev;
      const next = arrayMove(prev, from, to);
      saveTileOrder(next);
      return next;
    });
  };

  const ensureSelfMember = async (): Promise<Member> => {
    if (selfMember) {
      if (selfMember.id !== state.settings.selfMemberId) {
        await store.set(KEYS.settings, { ...state.settings, selfMemberId: selfMember.id });
        await loadData();
      }
      return selfMember;
    }
    const nm: Member = { id: uid(), name: state.system.name || 'Me', pronouns: '', role: '', color: '#DAA520', description: '', tags: [], groupIds: [], customFields: [], createdAt: Date.now() };
    await store.set(KEYS.members, [...state.members, nm]);
    await store.set(KEYS.settings, { ...state.settings, selfMemberId: nm.id });
    await loadData();
    return nm;
  };

  const saveQuickFront = async (p: any, cf: any, cc: any) => {
    await applyFrontUpdate(state.front, p, cf, cc);
    loadData();
  };

  const quickAddToFront = async (memberId: string, tier: 'primary' | 'coFront' | 'coConscious') => {
    const f = state.front;
    const strip = (tr: any) => ({ ...(tr || {}), memberIds: ((tr && tr.memberIds) || []).filter((id: string) => id !== memberId) });
    const p = strip(f?.primary), cf = strip(f?.coFront), cc = strip(f?.coConscious);
    if (tier === 'primary') p.memberIds = [...p.memberIds, memberId];
    else if (tier === 'coFront') cf.memberIds = [...cf.memberIds, memberId];
    else cc.memberIds = [...cc.memberIds, memberId];
    await saveQuickFront(p, cf, cc);
  };

  const removeFromFront = async (memberId: string) => {
    const f = state.front;
    if (!f) return;
    const strip = (tr: any) => ({ ...(tr || {}), memberIds: ((tr && tr.memberIds) || []).filter((id: string) => id !== memberId) });
    await saveQuickFront(strip(f.primary), strip(f.coFront), strip(f.coConscious));
  };

  const tileNodes: Record<string, React.ReactNode> = {
    'front': isSinglet ? (
      <StatusTile
        selfId={selfMember?.id}
        onClick={() => setView('front')}
        onUpdateStatus={async () => { await ensureSelfMember(); setShowQuickFront(true); }}
      />
    ) : (
      <FrontTile
        onClick={() => setView('front')}
        onUpdateFront={() => setShowQuickFront(true)}
      />
    ),
    'system-manager': !isSinglet ? <SystemManagerTile onClick={() => setView('system-manager')} /> : null,
    'system-map': !isSinglet ? <SystemMapTile onClick={() => { setMapFocus(null); setView('system-map'); }} /> : null,
    'planner': <PlannerTile onClick={() => setView('planner')} />,
    'medical': <MedicalTile onClick={() => setView('medical')} />,
    'network': <NetworkTile onClick={() => setView('network')} />,
    'members': isSinglet ? (
      <ProfileTile member={selfMember} statuses={statuses} onClick={() => setView('members')} />
    ) : (
      <MembersTile onClick={() => setView('members')} />
    ),
    'history': <HistoryTile onClick={() => setView('history')} />,
    'retro-history': <RetroHistoryTile onClick={() => setView('retro-history')} />,
    'journal': <JournalTile onClick={() => setView('journal')} />,
    'chat': !isSinglet ? <ChatTile onClick={() => setView('chat')} /> : null,
    'mailbox': !isSinglet ? <MailboxTile onClick={() => setView('mailbox')} /> : null,
    'whiteboard': <WhiteboardTile onClick={() => setView('whiteboard')} />,
    'colors': <ColorsTile onClick={() => setView('colors')} />,
    'stats': <StatsTile onClick={() => setView('stats')} />,
    'import-export': <ImportExportTile onClick={() => setView('import-export')} />,
    'custom-fields': !isSinglet ? <CustomFieldsTile onClick={() => setView('custom-fields')} /> : null,
    'polls': !isSinglet ? <PollsTile onClick={() => setView('polls')} /> : null,
    'archive': !isSinglet ? <ArchiveTile onClick={() => setView('archive')} /> : null,
    'credits': <CreditsTile onClick={() => setView('credits')} />,
    'discord': <DiscordTile onClick={() => window.open('https://discord.gg/FFQw33cu8m', '_blank')} />,
    'support': <SupportTile onClick={() => window.open('https://www.buymeacoffee.com/PluralStar', '_blank')} />,
    'settings': <SettingsTile onClick={() => setView('settings')} />,
  };
  const visibleTileIds = tileOrder.filter(id => tileNodes[id] != null);

  if (!state.loaded) {
    return (
      <div className="app-shell">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 18 }}>
            {i18n.t('common.loading', { defaultValue: 'Loading…' })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="titlebar">
        <span className="titlebar__title" style={{ color: titleColor }}>
          {isSinglet ? systemName : (
            <button className="titlebar__name" onClick={() => setView('system-profile')}
              aria-label={systemName} title={t('systemProfile.openHint')}>
              {systemName}
            </button>
          )}
          {view === 'system-profile'
            ? ` — ${t('systemProfile.title')}`
            : view !== 'dashboard' && ` — ${view.charAt(0).toUpperCase() + view.slice(1).replace('-', '/')}`}
        </span>
        <div className="titlebar__controls">
          <button className="titlebar__btn titlebar__btn--minimize" aria-label={t('common.minimize', {defaultValue: 'Minimize'})} onClick={() => window.electronAPI.window.minimize()} />
          <button className="titlebar__btn titlebar__btn--maximize" aria-label={t('common.maximize', {defaultValue: 'Maximize'})} onClick={() => window.electronAPI.window.maximize()} />
          <button className="titlebar__btn titlebar__btn--close" aria-label={t('common.close')} onClick={() => window.electronAPI.window.close()} />
        </div>
      </div>

      {view === 'dashboard' ? (
        <div className="dashboard">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTileDragEnd}>
            <SortableContext items={visibleTileIds} strategy={rectSortingStrategy}>
              <div className="tile-grid">
                {visibleTileIds.map(id => (
                  <SortableTile key={id} id={id}>{tileNodes[id]}</SortableTile>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <div className="full-view">
          <div className="full-view__header">
            <button className="full-view__back" onClick={() => setView('dashboard')}>
              {t('hub.dashboard')}
            </button>
            <span className="full-view__title">
              {view === 'front' ? (isSinglet ? t('tabs.status') : t('tabs.front'))
                : view === 'members' ? (isSinglet ? t('tabs.profile') : t('tabs.fronters'))
                : view === 'history' ? t('history.title')
                : view === 'journal' ? t('journal.title')
                : view === 'chat' ? t('hub.systemChat')
                : view === 'stats' ? t('hub.statistics')
                : view === 'import-export' ? t('hub.importExport')
                : view === 'settings' ? t('modal.systemSettings')
                : view === 'system-profile' ? t('systemProfile.title')
                : view === 'custom-fields' ? t('customFields.title')
                : view === 'polls' ? t('polls.title')
                : view === 'credits' ? t('hub.credits', { defaultValue: 'Credits' })
                : view === 'system-manager' ? t('systemManager.title')
                : view === 'system-map' ? t('systemMap.title')
                : view === 'planner' ? t('planner.title')
                : view === 'medical' ? t('medical.title')
                : view === 'archive' ? t('hub.archive')
                : view === 'retro-history' ? t('hub.retroHistory')
                : view === 'network' ? t('network.title')
                : view === 'mailbox' ? t('mailbox.title')
                : view === 'whiteboard' ? t('whiteboard.title')
                : view === 'colors' ? t('colors.title', {defaultValue: 'Colors'})
                : view}
            </span>
          </div>
          <div className="full-view__content">
            {view === 'settings' && (
              <SettingsView onUpdate={loadData} onOpenProfile={() => setView('system-profile')} />
            )}
            {view === 'system-profile' && !isSinglet && (
              <SystemProfileView onUpdate={loadData} />
            )}
            {view === 'members' && (isSinglet ? (
              <ProfileView member={selfMember} statuses={statuses}
                onUpdate={loadData} onEnsureSelf={ensureSelfMember} />
            ) : (
              <MembersView onUpdate={loadData}
                focusMemberId={memberFocus} onFocusHandled={() => setMemberFocus(null)}
                onShowOnMap={(id) => { setMapFocus(id); setView('system-map'); }}
                onQuickFront={quickAddToFront} onRemoveFromFront={removeFromFront} />
            ))}
            {view === 'archive' && (
              <MembersView onUpdate={loadData} archiveOnly />
            )}
            {view === 'retro-history' && (
              <RetroHistoryView
                onUpdate={loadData} onDone={() => setView('dashboard')}
                singlet={isSinglet} selfId={selfMember?.id} />
            )}
            {view === 'import-export' && (
              <ImportExportView onUpdate={loadData} />
            )}
            {view === 'stats' && (
              <StatsView singlet={isSinglet} selfId={selfMember?.id} />
            )}
            {view === 'journal' && (
              <JournalView onUpdate={loadData} />
            )}
            {view === 'history' && (
              <HistoryView onUpdate={loadData}
                singlet={isSinglet} selfId={selfMember?.id} />
            )}
            {view === 'front' && (isSinglet ? (
              <StatusView statuses={statuses}
                selfId={selfMember?.id} onSaveStatus={saveQuickFront}
                onEnsureSelf={ensureSelfMember} />
            ) : (
              <FrontView onUpdate={loadData} />
            ))}
            {view === 'system-manager' && (
              <SystemManagerView
                onViewMember={(id) => { setMemberFocus(id); setView('members'); }} onUpdate={loadData}
                onQuickFront={quickAddToFront} onRemoveFromFront={removeFromFront} />
            )}
            {view === 'system-map' && (
              <SystemMapView focusMemberId={mapFocus}
                onViewMember={(id) => { setMemberFocus(id); setView('members'); }} />
            )}
            {view === 'medical' && (
              <MedicalView onUpdate={loadData} />
            )}
            {view === 'planner' && (
              <PlannerView onUpdate={loadData} />
            )}
            {view === 'chat' && (
              <ChatView onUpdate={loadData} />
            )}
            {view === 'custom-fields' && (
              <CustomFieldsView onUpdate={loadData} />
            )}
            {view === 'polls' && (
              <PollsView onUpdate={loadData} />
            )}
            {view === 'credits' && (
              <CreditsView />
            )}
            {view === 'network' && (
              <NetworkView />
            )}
            {view === 'mailbox' && (
              <MailboxView onUpdate={loadData} />
            )}
            {view === 'whiteboard' && (
              <WhiteboardView />
            )}
            {view === 'colors' && (
              <ColorsView />
            )}
          </div>
        </div>
      )}

      {isSinglet ? (
        <SetStatusModal
          open={showQuickFront}
          onClose={() => setShowQuickFront(false)}
          onSave={saveQuickFront}
          statuses={statuses}
          selfId={selfMember?.id}
          current={state.front}
          settings={state.settings}
        />
      ) : (
        <SetFrontModal
          open={showQuickFront}
          onClose={() => setShowQuickFront(false)}
          onSave={saveQuickFront}
          members={state.members.filter(m => !m.archived)}
          groups={state.groups}
          current={state.front}
          settings={state.settings}
          allMoods={[...DEFAULT_MOODS, ...(state.settings.customMoods || [])]}
        />
      )}

      <Modal
        open={!!syncConflict}
        title={t('network.syncConflictTitle')}
        onClose={() => setSyncConflict(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn onClick={() => { const c = syncConflict!; setSyncConflict(null); NetworkManager.resolveConflict(c.peerId, 'mine'); }}>
              {t('network.keepThisDevice')}
            </Btn>
            <Btn onClick={() => { const c = syncConflict!; setSyncConflict(null); NetworkManager.resolveConflict(c.peerId, 'theirs'); }}>
              {t('network.keepOtherDevice')}
            </Btn>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>
          {t('network.syncConflictMsg', { device: syncConflict?.deviceName || '', defaultValue: `Your data differs from ${syncConflict?.deviceName}. Which device should win?` })}
        </p>
      </Modal>

      <Modal
        open={!!roleMismatch}
        title={t('network.syncRoleMismatchTitle')}
        onClose={() => setRoleMismatch(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={() => setRoleMismatch(null)}>{t('common.ok', { defaultValue: 'OK' })}</Btn>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>
          {t('network.syncRoleMismatchMsg', { device: roleMismatch?.deviceName || '' })}
        </p>
      </Modal>

      <ImageCropHost />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
