import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NoteboardEntry } from '../utils';
import { store, KEYS } from '../storage';
import { useAppStore } from '../store/appStore';

interface Props { onClick: () => void; }

export default function MailboxTile({ onClick }: Props) {
  const { t } = useTranslation();
  const members = useAppStore(s => s.state.members);
  const [notes, setNotes] = useState<NoteboardEntry[]>([]);
  useEffect(() => { store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setNotes(n || [])); }, []);

  const unread = notes.filter(n => !n.read);
  const byMember = new Map<string, number>();
  unread.forEach(n => byMember.set(n.memberId, (byMember.get(n.memberId) || 0) + 1));
  const preview = [...byMember.entries()]
    .map(([id, count]) => ({ name: members.find(m => m.id === id)?.name || '?', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="tile tile--clickable" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}>
      <div className="tile__header"><div className="tile__glyph" aria-hidden>✉</div><span className="tile__title">{t('mailbox.title')}</span></div>
      <div className="tile__body">
        {notes.length === 0 ? (
          <span className="tile__empty">{t('mailbox.empty')}</span>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              {t('mailbox.messageCount', { count: notes.length })}
              {unread.length > 0 ? ` · ${t('mailbox.unreadCount', { count: unread.length })}` : ''}
            </div>
            {preview.map(p => (
              <div key={p.name} style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 6 }}>
                <span aria-hidden>✉</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span>{p.count}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
