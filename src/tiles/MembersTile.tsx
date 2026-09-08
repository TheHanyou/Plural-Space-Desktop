import React from 'react';
import { useTranslation } from 'react-i18next';
import { getInitials } from '../utils';
import { initialOn } from '../theme';
import { useAppStore } from '../store/appStore';

interface Props { onClick: () => void; }

export default function MembersTile({ onClick }: Props) {
  const members = useAppStore(s => s.state.members);
  const { t } = useTranslation();
  const active = members.filter(m => !m.archived && !m.isCustomFront && !m.isFacet);
  const preview = active.slice(0, 5);
  return (
    <div className="tile" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}>
      <div className="tile__header"><div className="tile__glyph" aria-hidden>👥</div><span className="tile__title">{t('tabs.fronters')}</span></div>
      <div className="tile__body">
        {active.length === 0 ? <span className="tile__empty">{t('members.noMembers')}</span> : (<>
          {preview.map(m => (
            <div key={m.id} className="tile__member-row">
              <div className="tile__avatar" style={!m.avatar ? { backgroundColor: m.color, color: initialOn(m.color) } : { overflow: "hidden" }}>{m.avatar ? <img src={m.avatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : getInitials(m.name)}</div>
              <span className="tile__member-name">{m.name}</span>
              <span className="tile__member-role">{m.role}</span>
            </div>
          ))}
          {active.length > 5 && <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('share.more', { count: active.length - 5 })}</span>}
        </>)}
      </div>
    </div>
  );
}
