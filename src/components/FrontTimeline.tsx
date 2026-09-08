import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HistoryEntry, Member, FrontTierKey, fmtTime, fmtDur, getLocale, getInitials, nameCompare, buildEffectiveEnd } from '../utils';

type RangeKey = 'day' | 'week' | 'month' | 'quarter';
const RANGE_MS: Record<RangeKey, number> = {
  day: 86400000,
  week: 7 * 86400000,
  month: 30 * 86400000,
  quarter: 90 * 86400000,
};
const RANGE_KEYS: RangeKey[] = ['day', 'week', 'month', 'quarter'];
const RANGE_LABEL: Record<RangeKey, string> = { day: 'history.tlDay', week: 'history.tlWeek', month: 'history.tlMonth', quarter: 'history.tlQuarter' };

type Span = { start: number; end: number; tier: FrontTierKey; open: boolean };
type Row = { member: Member; spans: Span[]; total: number };

const LABEL_W = 130;
const ROW_H = 34;

const TIER_BAR: Record<FrontTierKey, { height: number; opacity: number }> = {
  primary: { height: 16, opacity: 1 },
  coFront: { height: 16, opacity: 0.75 },
  coConscious: { height: 7, opacity: 0.45 },
};

const buildTimelineRows = (
  history: HistoryEntry[],
  members: Member[],
  start: number,
  end: number,
  now: number,
): Row[] => {
  const memberMap = new Map<string, Member>();
  for (const m of members) if (m && !m.deleted) memberMap.set(m.id, m);
  const effEnd = buildEffectiveEnd(history);
  const byMember = new Map<string, Span[]>();
  for (const e of history) {
    if (!e || (e.changeType && e.changeType !== 'front')) continue;
    if (!e.startTime) continue;
    const eff = effEnd(e);
    const open = eff == null;
    const rawEnd = eff ?? now;
    if (e.startTime >= end || rawEnd <= start) continue;
    const s = Math.max(e.startTime, start);
    const en = Math.min(rawEnd, end);
    if (en <= s) continue;
    const tiers: [FrontTierKey, string[] | undefined][] = [
      ['primary', e.memberIds],
      ['coFront', e.coFrontIds],
      ['coConscious', e.coConsciousIds],
    ];
    for (const [tier, ids] of tiers) {
      for (const id of ids || []) {
        if (!memberMap.has(id)) continue;
        let list = byMember.get(id);
        if (!list) { list = []; byMember.set(id, list); }
        list.push({ start: s, end: en, tier, open });
      }
    }
  }
  const rows: Row[] = [];
  for (const [id, spans] of byMember) {
    const member = memberMap.get(id)!;
    const total = spans.reduce((acc, sp) => acc + (sp.tier === 'coConscious' ? 0 : sp.end - sp.start), 0);
    rows.push({ member, spans, total });
  }
  rows.sort((a, b) => b.total - a.total || nameCompare(a.member.name, b.member.name));
  return rows;
};

export default function FrontTimeline({ history, members, singlet = false }: {
  history: HistoryEntry[];
  members: Member[];
  singlet?: boolean;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeKey>('week');
  const [endAnchor, setEndAnchor] = useState<number | null>(null);

  const now = Date.now();
  const span = RANGE_MS[range];
  const end = endAnchor ?? now;
  const start = end - span;
  const live = endAnchor === null;

  const rows = useMemo(
    () => buildTimelineRows(history, members, start, end, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, members, start, end],
  );

  const tickLabel = (ts: number): string => range === 'day'
    ? new Date(ts).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })
    : new Date(ts).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });

  const goEarlier = () => setEndAnchor(end - span);
  const goLater = () => {
    const next = end + span;
    if (next >= Date.now()) setEndAnchor(null); else setEndAnchor(next);
  };

  const spanLabel = (sp: Span): string =>
    `${fmtTime(sp.start)} → ${sp.open && live ? t('history.now') : fmtTime(sp.end)} (${fmtDur(sp.start, sp.end)})`;

  const barLabel = (member: Member, sp: Span): string => {
    const tierLine = singlet ? null : t(sp.tier === 'primary' ? 'tier.primaryFront' : sp.tier === 'coFront' ? 'tier.coFront' : 'tier.coConscious');
    return [member.name, tierLine, spanLabel(sp)].filter(Boolean).join(' · ');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {RANGE_KEYS.map(k => (
          <button key={k} className={`btn ${range === k ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '7px 10px', fontSize: 12 }} aria-pressed={range === k}
            onClick={() => setRange(k)}>
            {t(RANGE_LABEL[k])}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="btn btn--ghost" style={{ padding: '7px 12px', fontSize: 13 }}
          aria-label={t('history.tlEarlier')} title={t('history.tlEarlier')} onClick={goEarlier}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--dim)' }}>
          {`${tickLabel(start)} → ${live ? t('history.tlNow') : tickLabel(end)}`}
        </span>
        <button className="btn btn--ghost" style={{ padding: '7px 12px', fontSize: 13, opacity: live ? 0.4 : 1 }}
          aria-label={t('history.tlLater')} title={t('history.tlLater')} disabled={live} onClick={goLater}>›</button>
        {!live && (
          <button className="btn btn--primary" style={{ padding: '7px 12px', fontSize: 12 }}
            onClick={() => setEndAnchor(null)}>{t('history.tlNow')}</button>
        )}
      </div>
      <div style={{ display: 'flex', marginBottom: 4 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        {[0, 1 / 3, 2 / 3].map(f => (
          <span key={f} style={{ flex: 1, fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{tickLabel(start + f * span)}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <div aria-hidden style={{ fontSize: 36, opacity: 0.4, marginBottom: 12 }}>◷</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            {singlet ? t('history.noHistorySinglet') : t('history.noHistory')}
          </div>
        </div>
      ) : (
        <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          {rows.map(row => (
            <div key={row.member.id} style={{ display: 'flex', alignItems: 'center', height: ROW_H }}>
              <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8, overflow: 'hidden' }}>
                {row.member.avatar ? (
                  <img src={row.member.avatar} alt="" style={{ width: 18, height: 18, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 18, height: 18, borderRadius: 9, background: row.member.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--bg)', fontWeight: 700, flexShrink: 0 }}>
                    {getInitials(row.member.name)}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.member.name}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: ROW_H }}>
                <div style={{ position: 'absolute', top: ROW_H / 2, left: 0, right: 0, height: 1, background: 'var(--border)', opacity: 0.6 }} />
                {row.spans.map((sp, i) => {
                  const bar = TIER_BAR[sp.tier];
                  return (
                    <div
                      key={`${sp.start}-${sp.tier}-${i}`}
                      role="img"
                      aria-label={barLabel(row.member, sp)}
                      title={barLabel(row.member, sp)}
                      style={{
                        position: 'absolute',
                        left: `${((sp.start - start) / span) * 100}%`,
                        width: `${((sp.end - sp.start) / span) * 100}%`,
                        minWidth: 3,
                        height: bar.height,
                        top: (ROW_H - bar.height) / 2,
                        borderRadius: 3,
                        background: row.member.color,
                        opacity: bar.opacity,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
