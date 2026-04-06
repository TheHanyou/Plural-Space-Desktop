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

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 4000);
  };

  // ─── Export ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    const payload: ExportPayload = {
      _meta: { version: '1.3.0', app: 'PluralSpace-Desktop', exportedAt: new Date().toISOString() },
      system, members, frontHistory: history, journal,
    };
    const json = JSON.stringify(payload, null, 2);
    const defaultName = `PluralSpace_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    const path = await window.electronAPI.dialog.saveFile(defaultName);
    if (!path) return;

    // Write via IPC — we'll need a writeFile handler
    // For now, use the Blob + download approach as fallback
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = defaultName; a.click();
    URL.revokeObjectURL(url);
    showStatus('Backup exported successfully');
  };

  // ─── Import (Plural Space format) ──────────────────────────────────────

  const handleImportPS = async () => {
    setImporting(true);
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

        if (data.system) await store.set(KEYS.system, data.system);
        if (data.members) await store.set(KEYS.members, data.members);
        if (data.frontHistory) await store.set(KEYS.history, data.frontHistory);
        if (data.journal) await store.set(KEYS.journal, data.journal);

        showStatus(`Imported: ${data.members?.length || 0} members, ${data.frontHistory?.length || 0} history entries, ${data.journal?.length || 0} journal entries`);
        onUpdate();
      };
      input.click();
    } catch (e: any) {
      showStatus(`Import error: ${e.message}`);
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
      <Section label="Backup" />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
          Export all system data (members, front history, journal entries) as a JSON file.
          Compatible with both mobile and desktop versions of Plural Space.
        </p>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          <span>{members.length} members</span>
          <span>·</span>
          <span>{history.length} history entries</span>
          <span>·</span>
          <span>{journal.length} journal entries</span>
        </div>
        <Btn variant="solid" onClick={handleExport}>Export Backup</Btn>
      </div>

      {/* Import PS */}
      <Section label="Restore" />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
          Restore from a Plural Space backup file. This will overwrite current data.
        </p>
        <Btn onClick={handleImportPS} disabled={importing}>
          {importing ? 'Importing...' : 'Import Plural Space Backup'}
        </Btn>
      </div>

      {/* Import SP */}
      <Section label="Simply Plural Import" />
      <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
          Import from a Simply Plural data export file. Members and front history will be
          merged with existing data — duplicates are skipped.
        </p>
        <Btn onClick={handleImportSP} disabled={importing}>
          {importing ? 'Importing...' : 'Import from Simply Plural'}
        </Btn>
      </div>

      {/* Danger Zone */}
      <Section label="Danger Zone" color="var(--danger)" />
      <div style={{ padding: 16, background: 'var(--danger-bg)', borderRadius: 8, border: '1px solid var(--danger)', marginBottom: 16 }}>
        {!confirmClear ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, lineHeight: 1.5 }}>
              Permanently delete all Plural Space data on this device. This cannot be undone.
            </p>
            <Btn variant="danger" onClick={() => setConfirmClear(true)}>Clear All Data</Btn>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, fontWeight: 600 }}>
              Are you absolutely sure? All members, history, journal entries, chat messages, and settings will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Btn>
              <Btn variant="danger" onClick={clearAllData}>Yes, Delete Everything</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
