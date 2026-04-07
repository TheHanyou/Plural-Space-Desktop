import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, FrontState, FrontTierKey, isFrontEmpty, fmtDur, getInitials } from '../utils';

interface Props { front: FrontState | null; members: Member[]; onClick: () => void; }
const TIER_ORDER: FrontTierKey[] = ['primary', 'coFront', 'coConscious'];
const TIER_I18N: Record<FrontTierKey, string> = { primary: 'tier.primaryFront', coFront: 'tier.coFront', coConscious: 'tier.coConscious' };

export default function FrontTile({ front, members, onClick }: Props) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  useEffect(() => { if (!front) return; const id = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(id); }, [front]);
  const getMember = (id: string) => members.find(m => m.id === id);
  const renderTier = (tierKey: FrontTierKey) => {
    if (!front) return null;
    const tier = front[tierKey];
    if (!tier.memberIds.length) return null;
    return (
      <React.Fragment key={tierKey}>
        {tierKey !== 'primary' && <div className="tile__tier-label">{t(TIER_I18N[tierKey])}</div>}
        {tier.memberIds.map(id => { const m = getMember(id); if (!m) return null; return (
          <div key={id} className="tile__member-row">
            <div className="tile__avatar" style={m.avatar ? { backgroundImage: `url(${m.avatar})` } : { backgroundColor: m.color }}>{!m.avatar && getInitials(m.name)}</div>
            <span className="tile__member-name">{m.name}</span>
            {tierKey === 'primary' && <span className="tile__duration">{fmtDur(front.startTime)}</span>}
          </div>
        ); })}
        {tier.mood && <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 36 }}>{tier.mood}</div>}
      </React.Fragment>
    );
  };
  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header"><div className="tile__glyph">◉</div><span className="tile__title">{t('tabs.front')}</span></div>
      <div className="tile__body">{isFrontEmpty(front) ? <span className="tile__empty">{t('front.noOneFronting')}</span> : TIER_ORDER.map(renderTier)}</div>
    </div>
  );
}
