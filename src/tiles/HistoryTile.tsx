import React from 'react';
import { Member, HistoryEntry, fmtTime, fmtDur, getInitials } from '../utils';

interface Props {
  history: HistoryEntry[];
  members: Member[];
  onClick: () => void;
}

export default function HistoryTile({ history, members, onClick }: Props) {
  const recent = history
    .filter(h => !h.changeType || h.changeType === 'front')
    .slice(0, 4);

  const getMember = (id: string) => members.find(m => m.id === id);

  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header">
        <div className="tile__glyph">◷</div>
        <span className="tile__title">History</span>
      </div>
      <div className="tile__body">
        {recent.length === 0 ? (
          <span className="tile__empty">No history yet</span>
        ) : (
          recent.map((entry, i) => {
            const names = entry.memberIds
              .map(id => getMember(id)?.name || '?')
              .join(', ');
            const color = getMember(entry.memberIds[0])?.color || 'var(--muted)';
            return (
              <div key={i} className="tile__member-row">
                <div className="tile__avatar" style={{ backgroundColor: color }}>
                  {entry.memberIds.length > 1 ? entry.memberIds.length : getInitials(getMember(entry.memberIds[0])?.name || '?')}
                </div>
                <span className="tile__member-name" style={{ fontSize: 12 }}>{names}</span>
                <span className="tile__duration">
                  {fmtDur(entry.startTime, entry.endTime)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
