import React from 'react';
import { useTranslation } from 'react-i18next';
import { Member, JournalEntry, fmtDate } from '../utils';

interface Props { journal: JournalEntry[]; members: Member[]; onClick: () => void; }

export default function JournalTile({ journal, members, onClick }: Props) {
  const { t } = useTranslation();
  const recent = [...journal].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  const getMember = (id: string) => members.find(m => m.id === id);
  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header"><div className="tile__glyph">📓</div><span className="tile__title">{t('journal.title')}</span></div>
      <div className="tile__body">
        {recent.length === 0 ? <span className="tile__empty">{t('journal.noEntries')}</span> : recent.map(entry => (
          <div key={entry.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="tile__journal-title">{entry.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span className="tile__journal-date">{fmtDate(entry.timestamp)}</span>
              <span className="tile__journal-date">{entry.authorIds.map(id => getMember(id)?.name || '?').join(', ')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
