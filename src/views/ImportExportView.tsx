import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, Section } from '../components/ui';
import { store, KEYS, chatMsgKey } from '../storage';
import {
  Member, HistoryEntry, JournalEntry, SystemInfo, AppSettings, ChatChannel, ChatMessage,
  ExportPayload, uid, DEFAULT_CHANNELS,
} from '../utils';
import { CustomPalette } from '../theme';

interface Props {
  system: SystemInfo;
  members: Member[];
  history: HistoryEntry[];
  journal: JournalEntry[];
  settings: AppSettings;
  channels: ChatChannel[];
  palettes: CustomPalette[];
  onUpdate: () => void;
}

export default function ImportExportView({ system, members, history, journal, settings, channels, palettes, onUpdate }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [restoreData, setRestoreData] = useState<ExportPayload | null>(null);
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restoreSel, setRestoreSel] = useState({
    system: true, members: true, avatars: true, frontHistory: true, journal: true,
    groups: true, chat: true, moods: true, palettes: true, settings: true,
  });
  const togR = (k: string) => setRestoreSel(s => ({ ...s, [k]: !s[k as keyof typeof s] }));

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 4000);
  };

  // ─── Export ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    // Gather chat messages per channel
    const chatMessages: Record<string, any[]> = {};
    for (const ch of channels) {
      const msgs = await store.get<any[]>(chatMsgKey(ch.id));
      if (msgs && msgs.length > 0) chatMessages[ch.id] = msgs;
    }

    // Extract avatars into a self-contained dict using the file:readAsBase64 IPC handler.
    // Desktop avatars may be stored as local file paths; embed them as data: URIs so
    // the backup is portable. Strip avatar from member objects — avatars dict is authoritative.
    const avatars: Record<string, string> = {};
    for (const m of members) {
      if (!m.avatar) continue;
      if (m.avatar.startsWith('data:')) {
        avatars[m.id] = m.avatar;
      } else {
        // Local file path — read and embed via IPC
        const dataUri = await window.electronAPI.file.readAsBase64(m.avatar);
        if (dataUri) avatars[m.id] = dataUri;
      }
    }
    const membersForExport = members.map(({ avatar: _a, ...rest }) => rest as Member);

    const payload: ExportPayload = {
      _meta: { version: '1.1', app: 'Plural Space', exportedAt: new Date().toISOString() },
      system, members: membersForExport, frontHistory: history, journal,
      groups: await store.get(KEYS.groups) || [],
      chatChannels: channels,
      chatMessages,
      settings,
      front: await store.get(KEYS.front) || null,
      palettes,
      avatars,
      customMoods: settings?.customMoods || [],
    };
    const json = JSON.stringify(payload, null, 2);
    const defaultName = `PluralSpace_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    const filePath = await window.electronAPI.dialog.saveFile(defaultName);
    if (!filePath) return;

    await window.electronAPI.file.write(filePath, json);
    showStatus('Backup exported successfully');
  };

  // ─── Import (Plural Space format) ──────────────────────────────────────

  const handlePickBackup = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.txt';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text) as ExportPayload;

        if (!data._meta?.app?.includes('PluralSpace') && !data._meta?.app?.includes('Plural Space')) {
          showStatus('Error: Not a Plural Space backup file');
          return;
        }

        setRestoreData(data);
        setRestoreFile(file.name);
      };
      input.click();
    } catch (e: any) {
      showStatus(`Import error: ${e.message}`);
    }
  };

  const handleRestore = async () => {
    if (!restoreData) return;
    setImporting(true);
    try {
      if (restoreSel.system && restoreData.system) await store.set(KEYS.system, restoreData.system);
      if (restoreSel.members && restoreData.members) {
        const avatarMap: Record<string, string> = { ...(restoreData.avatars || {}) };
        const importedMembers = restoreData.members.map((m: any) => {
          if (!restoreSel.avatars) { const { avatar, ...rest } = m; return rest; }
          // Prefer the avatars dict (embedded data: URI) over any inline avatar field
          const resolvedAvatar = avatarMap[m.id] ?? m.avatar;
          return resolvedAvatar ? { ...m, avatar: resolvedAvatar } : m;
        });
        await store.set(KEYS.members, importedMembers);
      } else if (restoreSel.avatars && !restoreSel.members) {
        const avatarMap: Record<string, string> = { ...(restoreData.avatars || {}) };
        for (const m of (restoreData.members || [])) { if ((m as any).avatar && !avatarMap[m.id]) avatarMap[m.id] = (m as any).avatar; }
        if (Object.keys(avatarMap).length > 0) {
          const existing = await store.get<Member[]>(KEYS.members) || [];
          const updated = existing.map(m => avatarMap[m.id] ? { ...m, avatar: avatarMap[m.id] } : m);
          await store.set(KEYS.members, updated);
        }
      }
      if (restoreSel.journal && restoreData.journal) await store.set(KEYS.journal, restoreData.journal);
      if (restoreSel.frontHistory && restoreData.frontHistory) {
        await store.set(KEYS.history, restoreData.frontHistory);
        if (restoreData.front !== undefined) await store.set(KEYS.front, restoreData.front);
      }
      if (restoreSel.groups && restoreData.groups) await store.set(KEYS.groups, restoreData.groups);
      if (restoreSel.chat) {
        if (restoreData.chatChannels) await store.set(KEYS.chatChannels, restoreData.chatChannels);
        if (restoreData.chatMessages) {
          for (const [chId, msgs] of Object.entries(restoreData.chatMessages)) {
            await store.set(chatMsgKey(chId), msgs);
          }
        }
      }
      if (restoreSel.settings || restoreSel.moods) {
        const currentSettings = await store.get<any>(KEYS.settings) || {};
        let newSettings = { ...currentSettings };
        if (restoreSel.settings && restoreData.settings) {
          newSettings = { ...restoreData.settings };
          if (!restoreSel.moods) newSettings.customMoods = currentSettings.customMoods || [];
        }
        if (restoreSel.moods) {
          newSettings.customMoods = restoreData.customMoods || restoreData.settings?.customMoods || [];
        }
        await store.set(KEYS.settings, newSettings);
      }
      if (restoreSel.palettes && restoreData.palettes) await store.set(KEYS.palettes, restoreData.palettes);

      showStatus('Restore complete');
      setRestoreData(null);
      setRestoreFile(null);
      onUpdate();
    } catch (e: any) {
      showStatus(`Restore error: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // ─── Import (Simply Plural) ────────────────────────────────────────────

  const handleImportSP = async () => {
    setImporting(true);
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.txt';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text);

        // SP export structure: members array with content wrapper
        const spMembers = data.members || [];
        const spHistory = data.frontHistory || data.switches || [];

        const importedMembers: Member[] = spMembers.map((entry: any) => {
          const m = entry.content || entry;
          return {
            id: m.id || m._id || uid(),
            name: m.name || 'Unknown',
            pronouns: m.pronouns || '',
            role: m.role || '',
            color: m.color || '#DAA520',
            description: m.desc || m.description || '',
            tags: [],
            groupIds: [],
            avatar: m.avatarUrl || m.avatar || undefined,
          };
        });

        const importedHistory: HistoryEntry[] = spHistory.map((entry: any) => {
          const h = entry.content || entry;
          const memberId = h.member || h.memberId;
          return {
            memberIds: memberId ? [memberId] : [],
            startTime: typeof h.startTime === 'number'
              ? (h.startTime > 1e12 ? h.startTime : h.startTime * 1000)
              : new Date(h.startTime).getTime(),
            endTime: h.endTime
              ? (typeof h.endTime === 'number'
                ? (h.endTime > 1e12 ? h.endTime : h.endTime * 1000)
                : new Date(h.endTime).getTime())
              : null,
            note: '',
          };
        });

        // Merge with existing
        const existing = await store.get<Member[]>(KEYS.members, []) || [];
        const existingIds = new Set(existing.map(m => m.id));
        const newMembers = importedMembers.filter(m => !existingIds.has(m.id));
        await store.set(KEYS.members, [...existing, ...newMembers]);

        const existingHistory = await store.get<HistoryEntry[]>(KEYS.history, []) || [];
        await store.set(KEYS.history, [...existingHistory, ...importedHistory]);

        showStatus(`SP Import: ${newMembers.length} new members, ${importedHistory.length} history entries`);
        onUpdate();
      };
      input.click();
    } catch (e: any) {
      showStatus(`SP Import error: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // ─── Token Import (SP + PK) ─────────────────────────────────────────────

  const [extSource, setExtSource] = useState<'sp' | 'pk'>('sp');
  const [extToken, setExtToken] = useState('');
  const [extLoading, setExtLoading] = useState(false);
  const [extPreview, setExtPreview] = useState<{members: any[]; switches: any[]; system: any} | null>(null);
  const [extSel, setExtSel] = useState({system: true, members: true, frontHistory: true});
  const togE = (k: string) => setExtSel(s => ({...s, [k]: !s[k as keyof typeof s]}));

  const handleTokenFetch = async () => {
    if (!extToken.trim()) { showStatus(t('share.tokenRequired')); return; }
    setExtLoading(true); setExtPreview(null);
    try {
      if (extSource === 'sp') {
        const headers: any = {Authorization: extToken.trim(), 'Content-Type': 'application/json'};
        const meRes = await fetch('https://v2.apparyllis.com/v1/me', {headers});
        if (!meRes.ok) throw new Error(t('share.authFailed', {status: meRes.status}));
        const meData = await meRes.json();
        const userId = meData.id || meData.uid;
        const [mRes, sRes] = await Promise.all([
          fetch(`https://v2.apparyllis.com/v1/members/${userId}`, {headers}),
          fetch(`https://v2.apparyllis.com/v1/frontHistory/${userId}?startTime=0&endTime=${Date.now()}`, {headers}),
        ]);
        const mData = await mRes.json().catch(() => []);
        const sData = await sRes.json().catch(() => []);
        setExtPreview({system: meData, members: Array.isArray(mData) ? mData : (mData.members || []), switches: Array.isArray(sData) ? sData : (sData.switches || sData.frontHistory || [])});
      } else {
        const headers: any = {Authorization: extToken.trim(), 'Content-Type': 'application/json', 'User-Agent': 'PluralSpace/1.0'};
        const [sRes, mRes, swRes] = await Promise.all([
          fetch('https://api.pluralkit.me/v2/systems/@me', {headers}),
          fetch('https://api.pluralkit.me/v2/systems/@me/members', {headers}),
          fetch('https://api.pluralkit.me/v2/systems/@me/switches?limit=500', {headers}),
        ]);
        if (!sRes.ok) throw new Error(t('share.authFailed', {status: sRes.status}));
        const sData = await sRes.json().catch(() => ({}));
        const mData = await mRes.json().catch(() => []);
        const swData = await swRes.json().catch(() => []);
        setExtPreview({system: sData, members: Array.isArray(mData) ? mData : [], switches: Array.isArray(swData) ? swData : []});
      }
    } catch (e: any) { showStatus(`${t('share.importFailed')}: ${e.message}`); }
    finally { setExtLoading(false); }
  };

  const handleTokenImport = async () => {
    if (!extPreview) return;
    const isPK = extSource === 'pk';
    setImporting(true);
    try {
      if (extSel.system && extPreview.system) {
        const name = isPK ? extPreview.system.name : (extPreview.system.content?.username || extPreview.system.content?.name || extPreview.system.username || system.name);
        const desc = isPK ? (extPreview.system.description || system.description) : (extPreview.system.content?.desc || extPreview.system.content?.description || system.description);
        await store.set(KEYS.system, {...system, name: name || system.name, description: desc});
      }
      const newM: Member[] = extSel.members && extPreview.members.length > 0
        ? extPreview.members.map((m: any) => ({
            id: uid(), name: isPK ? (m.display_name || m.name) : (m.content?.name || m.name || 'Unknown'),
            pronouns: isPK ? (m.pronouns || '') : (m.content?.pronouns || ''),
            role: isPK ? '' : (m.content?.role || ''),
            color: isPK ? (m.color ? `#${m.color}` : '#DAA520') : (m.content?.color || '#DAA520'),
            description: isPK ? (m.description || '') : (m.content?.desc || ''),
            avatar: isPK ? (m.avatar_url || undefined) : (m.content?.avatarUrl || undefined),
            tags: [] as string[], groupIds: [] as string[],
          }))
        : [];
      if (newM.length > 0) {
        const merged = [...members, ...newM.filter(nm => !members.find(em => em.name.toLowerCase() === nm.name.toLowerCase()))];
        await store.set(KEYS.members, merged);
      }
      if (extSel.frontHistory && extPreview.switches.length > 0) {
        const allMembers = newM.length > 0 ? [...members, ...newM] : members;
        const idMap: Record<string, string> = {};
        extPreview.members.forEach((m: any, i: number) => {
          const eid = isPK ? (m.uuid || m.id) : m.id;
          const name = isPK ? (m.display_name || m.name || '') : (m.content?.name || m.name || '');
          const lm = allMembers.find(l => l.name.toLowerCase() === name.toLowerCase());
          if (eid && lm) idMap[eid] = lm.id;
          if (isPK && m.id && lm) idMap[m.id] = lm.id;
        });
        const newH: HistoryEntry[] = isPK
          ? extPreview.switches.map((sw: any, i: number, arr: any[]) => {
              const next = arr[i - 1];
              const ids = (Array.isArray(sw.members) ? sw.members : []).map((eid: string) => idMap[eid]).filter(Boolean) as string[];
              return {memberIds: ids, startTime: new Date(sw.timestamp).getTime(), endTime: next ? new Date(next.timestamp).getTime() : null, note: ''} as HistoryEntry;
            }).filter((h: HistoryEntry) => h.memberIds.length > 0)
          : extPreview.switches.map((sw: any) => {
              const externalIds: string[] = Array.isArray(sw.members) ? sw.members : (sw.content?.member ? [sw.content.member] : []);
              const ids = externalIds.map((eid: string) => idMap[eid]).filter(Boolean) as string[];
              const rawTs = sw.content?.startTime || sw.content?.timestamp || sw.timestamp;
              const startTime = typeof rawTs === 'number' ? rawTs : new Date(rawTs).getTime();
              const rawEnd = sw.content?.endTime;
              const endTime = rawEnd ? (typeof rawEnd === 'number' ? rawEnd : new Date(rawEnd).getTime()) : null;
              return {memberIds: ids, startTime, endTime, note: ''} as HistoryEntry;
            }).filter((h: HistoryEntry) => h.memberIds.length > 0 && h.startTime > 0);
        if (newH.length > 0) {
          const merged = [...newH, ...history].sort((a, b) => b.startTime - a.startTime).slice(0, 1000);
          await store.set(KEYS.history, merged);
        }
      }
      showStatus(`Imported: ${newM.length} members, ${extPreview.switches.length} switches`);
      setExtPreview(null); setExtToken('');
      onUpdate();
    } catch (e: any) { showStatus(`Import error: ${e.message}`); }
    finally { setImporting(false); }
  };

  // ─── Clear All Data ────────────────────────────────────────────────────

  const [confirmClear, setConfirmClear] = useState(false);

  const clearAllData = async () => {
    await store.clearAll();
    setConfirmClear(false);
    showStatus('All data cleared');
    onUpdate();
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Status bar */}
      {status && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 8,
          background: status.startsWith('Error') ? 'var(--danger-bg)' : 'var(--success-bg)',
          border: `1px solid ${status.startsWith('Error') ? 'var(--danger)' : 'var(--success)'}`,
          color: status.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
          fontSize: 13,
        }}>
          {status}
        </div>
      )}

      {/* Export */}
      <Section label={t('share.backup')} />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('share.exportDesc')}
        </p>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          <span>{t('share.membersCountSimple', { count: members.length })}</span>
          <span>·</span>
          <span>{t('share.historyCount', { count: history.length })}</span>
          <span>·</span>
          <span>{t('share.journalCount', { count: journal.length })}</span>
        </div>
        <Btn variant="solid" onClick={handleExport}>{t('share.exportBackup')}</Btn>
      </div>

      {/* Import PS */}
      <Section label={t('share.restore')} />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('share.restoreDesc')}
        </p>
        <Btn onClick={handlePickBackup}>
          {restoreFile || t('share.importPSBackup')}
        </Btn>
        {restoreData && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 600, marginBottom: 8 }}>
              {t('share.restoreCategories')}
            </div>
            <div style={{ background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12 }}>
              {([
                ['system', t('share.systemNameDesc'), !!restoreData.system, null],
                ['members', t('share.memberProfiles'), !!restoreData.members, restoreData.members?.length],
                ['avatars', t('share.profilePictures'), !!(restoreData.avatars && Object.keys(restoreData.avatars).length > 0) || !!(restoreData.members?.some((m: any) => m.avatar)), restoreData.avatars ? Object.keys(restoreData.avatars).length : restoreData.members?.filter((m: any) => m.avatar).length || 0],
                ['frontHistory', t('share.frontHistory'), !!restoreData.frontHistory, restoreData.frontHistory?.length],
                ['journal', t('share.journalEntries'), !!restoreData.journal, restoreData.journal?.length],
                ['groups', t('share.memberGroups'), !!restoreData.groups?.length, restoreData.groups?.length],
                ['chat', t('share.chatData'), !!restoreData.chatChannels?.length, restoreData.chatChannels?.length],
                ['moods', t('share.customMoodsLabel'), !!(restoreData.customMoods?.length || restoreData.settings?.customMoods?.length), restoreData.customMoods?.length || restoreData.settings?.customMoods?.length || 0],
                ['palettes', t('share.themePalettes'), !!restoreData.palettes?.length, restoreData.palettes?.length],
                ['settings', t('share.appSettings'), !!restoreData.settings, null],
              ] as [string, string, boolean, number | null][]).map(([k, label, avail, count]) => (
                <label key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderBottom: '1px solid var(--border)', opacity: avail ? 1 : 0.4,
                  cursor: avail ? 'pointer' : 'default',
                }}>
                  <input type="checkbox" checked={avail && restoreSel[k as keyof typeof restoreSel]}
                    disabled={!avail} onChange={() => togR(k)} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {avail ? (count !== null ? `${count}` : '✓') : t('common.notInExport')}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setRestoreData(null); setRestoreFile(null); }}>{t('common.cancel')}</Btn>
              <Btn variant="danger" onClick={handleRestore} disabled={importing}>
                {importing ? t('share.importing') : t('share.restoreSelectedData')}
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* Import SP */}
      <Section label={t('share.spImport')} />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('share.spMergeDesc')}
        </p>
        <Btn onClick={handleImportSP} disabled={importing}>
          {importing ? t('share.importing') : t('share.importFromSP')}
        </Btn>
      </div>

      {/* Token Import (SP / PK) */}
      <Section label={t('share.spImport') + ' / ' + t('share.pkImport') + ' (Token)'} />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Btn variant={extSource === 'sp' ? 'solid' : 'ghost'} onClick={() => { setExtSource('sp'); setExtPreview(null); setExtToken(''); }}>
            {t('share.simplyPlural')}
          </Btn>
          <Btn variant={extSource === 'pk' ? 'solid' : 'ghost'} onClick={() => { setExtSource('pk'); setExtPreview(null); setExtToken(''); }}>
            {t('share.pluralKit')}
          </Btn>
        </div>
        <p style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
          {extSource === 'sp' ? t('share.spTokenHint') : t('share.pkTokenHint')}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="field__input" value={extToken} onChange={e => setExtToken(e.target.value)}
            placeholder={extSource === 'sp' ? t('share.spTokenPlaceholder') : t('share.pkTokenPlaceholder')}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
          <Btn onClick={handleTokenFetch} disabled={extLoading}>
            {extLoading ? t('share.fetching') : t('share.fetchData')}
          </Btn>
        </div>
        {extPreview && (
          <div style={{ background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)', padding: 12, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
              {t('share.membersCount', {count: extPreview.members.length})} · {t('share.frontEntries', {count: extPreview.switches.length})}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {([
                ['system', t('share.systemNameDesc'), true],
                ['members', t('share.memberProfiles'), extPreview.members.length > 0],
                ['frontHistory', t('share.frontHistory'), extPreview.switches.length > 0],
              ] as [string, string, boolean][]).map(([k, label, avail]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: avail ? 1 : 0.4, cursor: avail ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={avail && extSel[k as keyof typeof extSel]} disabled={!avail} onChange={() => togE(k)} />
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setExtPreview(null); setExtToken(''); }}>{t('common.cancel')}</Btn>
              <Btn variant="solid" onClick={handleTokenImport} disabled={importing}>
                {importing ? t('share.importing') : t('share.importSelected')}
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <Section label={t('share.dangerZone')} color="var(--danger)" />
      <div style={{ padding: 16, background: 'var(--danger-bg)', borderRadius: 8, border: '1px solid var(--danger)', marginBottom: 16 }}>
        {!confirmClear ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, lineHeight: 1.5 }}>
              {t('share.clearAllDataDesc')}
            </p>
            <Btn variant="danger" onClick={() => setConfirmClear(true)}>{t('share.clearAllData')}</Btn>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, fontWeight: 600 }}>
              {t('share.clearAllConfirm')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmClear(false)}>{t('common.cancel')}</Btn>
              <Btn variant="danger" onClick={clearAllData}>{t('share.yesDeleteEverything')}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
