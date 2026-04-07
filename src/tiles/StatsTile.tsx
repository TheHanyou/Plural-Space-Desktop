import React from 'react';
import { useTranslation } from 'react-i18next';
import { Member, HistoryEntry, fmtDur } from '../utils';

interface Props { history: HistoryEntry[]; members: Member[]; onClick: () => void; }

export default function StatsTile({ history, members, onClick }: Props) {
  const { t } = useTranslation();
  const getMember = (id: string) => members.find(m => m.id === id);
  const frontEntries = history.filter(h => !h.changeType || h.changeType === 'front');
  const totalsByMember: Record<string, number> = {};
  for (const entry of frontEntries) {
    const dur = (entry.endTime || Date.now()) - entry.startTime;
    for (const id of entry.memberIds) totalsByMember[id] = (totalsByMember[id] || 0) + dur;
  }
  const sorted = Object.entries(totalsByMember).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const totalSessions = frontEntries.length;
  const totalTime = Object.values(totalsByMember).reduce((a, b) => a + b, 0);
  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header"><div className="tile__glyph">⊞</div><span className="tile__title">{t('hub.statistics')}</span></div>
      <div className="tile__body">
        {totalSessions === 0 ? <span className="tile__empty">{t('history.noHistory')}</span> : (<>
          <div className="tile__stat-row"><span className="tile__stat-label">{t('stats.sessions')}</span><span className="tile__stat-value">{totalSessions}</span></div>
          <div className="tile__stat-row"><span className="tile__stat-label">{t('stats.totalTime')}</span><span className="tile__stat-value">{fmtDur(0, totalTime)}</span></div>
          <div className="tile__tier-label" style={{ marginTop: 8 }}>{t('stats.topFronters')}</div>
          {sorted.map(([id, dur]) => { const m = getMember(id); return (
            <div key={id} className="tile__stat-row"><span className="tile__stat-label">{m?.name || '?'}</span><span className="tile__stat-value">{fmtDur(0, dur)}</span></div>
          ); })}
        </>)}
      </div>
    </div>
  );
}
