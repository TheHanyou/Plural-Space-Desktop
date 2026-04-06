import React from 'react';
import { Member, getInitials } from '../utils';

interface Props {
  members: Member[];
  onClick: () => void;
}

export default function MembersTile({ members, onClick }: Props) {
  const active = members.filter(m => !m.archived);
  const preview = active.slice(0, 5);

  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header">
        <div className="tile__glyph">👥</div>
        <span className="tile__title">Members</span>
      </div>
      <div className="tile__body">
        {active.length === 0 ? (
          <span className="tile__empty">No members yet</span>
        ) : (
          <>
            {preview.map(m => (
              <div key={m.id} className="tile__member-row">
                <div
                  className="tile__avatar"
                  style={m.avatar
                    ? { backgroundImage: `url(${m.avatar})` }
                    : { backgroundColor: m.color }}
                >
                  {!m.avatar && getInitials(m.name)}
                </div>
                <span className="tile__member-name">{m.name}</span>
                <span className="tile__member-role">{m.role}</span>
              </div>
            ))}
            {active.length > 5 && (
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                +{active.length - 5} more
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
