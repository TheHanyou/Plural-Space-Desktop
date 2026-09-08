import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HistoryEntry, ChatMessage, fmtDur, fmtNum, getInitials, translateMood, buildEffectiveEnd, SINGLET_HIDDEN_STATUS_NAMES } from '../utils';
import { Section } from '../components/ui';
import { store, chatMsgKey, KEYS } from '../storage';
import { useAppStore } from '../store/appStore';
import { getTierNameOverride } from '../i18n/terminology';
import type { TierNameKey } from '../i18n/terminology';

interface Props {
  singlet?: boolean;
  selfId?: string;
}

type TimeRange = 'all' | '7d' | '30d';

const MAX_BOARD = 25;
const nextBoardLimit = (cur: number) => (cur < 10 ? 10 : MAX_BOARD);

export default function StatsView({ singlet = false, selfId }: Props) {
  const { t } = useTranslation();
  const tierHeading = (tier: TierNameKey, stock: string): string => {
    const custom = getTierNameOverride(tier);
    return custom ? t('stats.topTier', { tier: custom }) : stock;
  };
  const history = useAppStore(s => s.state.history);
  const members = useAppStore(s => s.state.members);
  const channels = useAppStore(s => s.state.channels);
  const [range, setRange] = useState<TimeRange>('all');
  const [chatCounts, setChatCounts] = useState<Record<string, number>>({});

  React.useEffect(() => {
    (async () => {
      const counts: Record<string, number> = {};
      for (const ch of channels) {
        const msgs = await store.get<ChatMessage[]>(chatMsgKey(ch.id), []);
        if (msgs) {
          for (const msg of msgs) {
            counts[msg.authorId] = (counts[msg.authorId] || 0) + 1;
          }
        }
      }
      setChatCounts(counts);
    })();
  }, [channels]);

  const getMember = (id: string) => members.find(m => m.id === id);
  const customFrontIds = useMemo(() => new Set(members.filter(m => m.isCustomFront).map(m => m.id)), [members]);
  const hiddenStatusIds = useMemo(() => new Set(members.filter(m => m.isCustomFront && SINGLET_HIDDEN_STATUS_NAMES.includes(m.name)).map(m => m.id)), [members]);
  const rankExclude = (id: string): boolean => singlet
    ? (id === selfId || !customFrontIds.has(id) || hiddenStatusIds.has(id))
    : customFrontIds.has(id);
  const [boardLimits, setBoardLimits] = useState<Record<string, number>>({});
  const limitFor = (k: string) => boardLimits[k] ?? 5;
  const expandBoard = (k: string) => setBoardLimits(p => ({ ...p, [k]: nextBoardLimit(p[k] ?? 5) }));

  const cutoff = useMemo(() => {
    if (range === '7d') return Date.now() - 7 * 86400000;
    if (range === '30d') return Date.now() - 30 * 86400000;
    return 0;
  }, [range]);

  const filtered = useMemo(() => {
    return history.filter(h => {
      if (!h.changeType || h.changeType === 'front') {
        return h.startTime >= cutoff || (h.endTime && h.endTime >= cutoff) || h.endTime === null;
      }
      return false;
    });
  }, [history, cutoff]);

  const effEnd = useMemo(() => buildEffectiveEnd(history), [history]);
  const entryEnd = (entry: HistoryEntry): number => effEnd(entry) ?? Date.now();

  const totalSessions = filtered.length;

  const fronterTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of filtered) {
      const start = Math.max(entry.startTime, cutoff);
      const end = entryEnd(entry);
      const dur = Math.max(0, end - start);
      for (const id of entry.memberIds) {
        map[id] = (map[id] || 0) + dur;
      }
    }
    return Object.entries(map).filter(([id]) => !rankExclude(id)).sort((a, b) => b[1] - a[1]);
  }, [filtered, cutoff, customFrontIds, effEnd, singlet, selfId]);

  const coFrontTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of filtered) {
      const start = Math.max(entry.startTime, cutoff);
      const end = entryEnd(entry);
      const dur = Math.max(0, end - start);
      for (const id of (entry.coFrontIds || [])) {
        map[id] = (map[id] || 0) + dur;
      }
    }
    return Object.entries(map).filter(([id]) => !rankExclude(id)).sort((a, b) => b[1] - a[1]);
  }, [filtered, cutoff, customFrontIds, effEnd, singlet, selfId]);

  const coConTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of filtered) {
      const start = Math.max(entry.startTime, cutoff);
      const end = entryEnd(entry);
      const dur = Math.max(0, end - start);
      for (const id of (entry.coConsciousIds || [])) {
        map[id] = (map[id] || 0) + dur;
      }
    }
    return Object.entries(map).filter(([id]) => !rankExclude(id)).sort((a, b) => b[1] - a[1]);
  }, [filtered, cutoff, customFrontIds, effEnd, singlet, selfId]);

  const moodTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of filtered) {
      if (entry.mood) map[entry.mood] = (map[entry.mood] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const locationTotals = useMemo(() => {
    const map: Record<string, number> = {};
    const display: Record<string, string> = {};
    for (const entry of filtered) {
      const trimmed = (entry.location || '').trim();
      if (!trimmed) continue;
      const norm = trimmed.toLocaleLowerCase();
      const disp = display[norm] || (display[norm] = trimmed);
      map[disp] = (map[disp] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const chatSorted = useMemo(() => {
    return Object.entries(chatCounts).filter(([id]) => !customFrontIds.has(id)).sort((a, b) => b[1] - a[1]);
  }, [chatCounts, customFrontIds]);

  const totalTime = fronterTotals.reduce((a, [, d]) => a + d, 0);
  const totalMsgs = chatSorted.reduce((a, [, c]) => a + c, 0);

  const energyStats = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    for (const entry of filtered) {
      if (entry.energyLevel) {
        for (const id of entry.memberIds) {
          if (!map[id]) map[id] = { sum: 0, count: 0 };
          map[id].sum += entry.energyLevel;
          map[id].count++;
        }
      }
      if (entry.coFrontEnergy) {
        for (const id of (entry.coFrontIds || [])) {
          if (!map[id]) map[id] = { sum: 0, count: 0 };
          map[id].sum += entry.coFrontEnergy;
          map[id].count++;
        }
      }
    }
    return Object.entries(map)
      .filter(([id]) => !rankExclude(id))
      .map(([id, { sum, count }]) => [id, Math.round((sum / count) * 10) / 10] as [string, number])
      .sort((a, b) => b[1] - a[1]);
  }, [filtered, customFrontIds, singlet, selfId]);

  const peakHours = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const entry of filtered) {
      const h = new Date(entry.startTime).getHours();
      hours[h]++;
    }
    return hours;
  }, [filtered]);

  const peakMax = Math.max(...peakHours, 1);

  const energyByHour = useMemo(() => {
    const sum = new Array(24).fill(0); const cnt = new Array(24).fill(0);
    for (const e of filtered) {
      const h = new Date(e.startTime).getHours();
      if (e.energyLevel) { sum[h] += e.energyLevel; cnt[h]++; }
      if (e.coFrontEnergy) { sum[h] += e.coFrontEnergy; cnt[h]++; }
    }
    return sum.map((s, h) => cnt[h] > 0 ? Math.round((s / cnt[h]) * 10) / 10 : 0);
  }, [filtered]);

  const [selectedStatMember, setSelectedStatMember] = useState<string | null>(null);

  const memberSpecific = useMemo(() => {
    if (!selectedStatMember) return null;
    const entries = filtered.filter(e =>
      e.memberIds.includes(selectedStatMember) ||
      (e.coFrontIds || []).includes(selectedStatMember) ||
      (e.coConsciousIds || []).includes(selectedStatMember)
    );
    const coMembers: Record<string, number> = {};
    const moods: Record<string, number> = {};
    let energySum = 0; let energyCount = 0;
    for (const e of entries) {
      const allIds = [...e.memberIds, ...(e.coFrontIds || []), ...(e.coConsciousIds || [])];
      for (const id of allIds) {
        if (id !== selectedStatMember && !(singlet && id === selfId)) coMembers[id] = (coMembers[id] || 0) + 1;
      }
      if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1;
      if (e.energyLevel && e.memberIds.includes(selectedStatMember)) { energySum += e.energyLevel; energyCount++; }
      if (e.coFrontEnergy && (e.coFrontIds || []).includes(selectedStatMember)) { energySum += e.coFrontEnergy; energyCount++; }
    }
    return {
      sessions: entries.length,
      coMembers: Object.entries(coMembers).sort((a, b) => b[1] - a[1]),
      moods: Object.entries(moods).sort((a, b) => b[1] - a[1]),
      avgEnergy: energyCount > 0 ? Math.round((energySum / energyCount) * 10) / 10 : null,
    };
  }, [filtered, selectedStatMember, singlet, selfId]);


  const Bar = ({ label, value, max, color, suffix }: {
    label: string; value: number; max: number; color: string; suffix: string;
  }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{suffix}</span>
      </div>
      <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, background: color,
          width: `${max > 0 ? (value / max) * 100 : 0}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );

  const Leaderboard = ({ title, data, mode, boardKey }: {
    title: string; data: [string, number][]; mode: 'time' | 'count'; boardKey: string;
  }) => {
    const limit = limitFor(boardKey);
    const shown = data.slice(0, limit);
    const maxVal = shown.length > 0 ? shown[0][1] : 1;
    return (
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{title}</h3>
        {shown.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('common.noData')}</span>
        ) : (
          shown.map(([id, val]) => {
            const m = getMember(id);
            return (
              <Bar key={id} label={m?.name || id} value={val} max={maxVal} color={m?.color || 'var(--accent)'}
                suffix={mode === 'time' ? fmtDur(0, val) : `${val}`} />
            );
          })
        )}
        {data.length > limit && limit < MAX_BOARD && (
          <button onClick={() => expandBoard(boardKey)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
            {t('stats.showMore', { defaultValue: 'Show more' })} ({Math.min(limit, data.length)}/{data.length})
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', '30d', '7d'] as TimeRange[]).map(r => (
          <button key={r} className={`btn ${range === r ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setRange(r)}>
            {r === 'all' ? t('stats.allTime') : r === '30d' ? t('stats.last30') : t('stats.last7')}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: t('stats.totalSessions'), value: totalSessions.toString() },
          { label: t('stats.totalFrontTime'), value: fmtDur(0, totalTime) },
          ...(singlet ? [] : [
            { label: t('stats.uniqueFronters'), value: fronterTotals.length.toString() },
            { label: t('stats.chatMessages'), value: totalMsgs.toString() },
          ]),
        ].map(({ label, value }) => (
          <div key={label} style={{
            padding: 16, background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
        <Leaderboard title={singlet ? t('stats.topStatuses') : tierHeading('primary', t('stats.topFronters'))} data={fronterTotals} mode="time" boardKey="fronters" />
        {!singlet && <Leaderboard title={tierHeading('coFront', t('stats.topCoFronters'))} data={coFrontTotals} mode="time" boardKey="cofronters" />}
        {!singlet && <Leaderboard title={tierHeading('coConscious', t('stats.topCoCon'))} data={coConTotals} mode="time" boardKey="cocon" />}
        {!singlet && <Leaderboard title={t('stats.topChatters')} data={chatSorted} mode="count" boardKey="chatters" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
        <div>
          <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{t('stats.topMoods')}</h3>
          {moodTotals.slice(0, limitFor('moods')).map(([mood, count]) => (
            <Bar key={mood} label={translateMood(mood, t)} value={count} max={moodTotals[0]?.[1] || 1} color="var(--info)" suffix={`${count}`} />
          ))}
          {moodTotals.length > limitFor('moods') && limitFor('moods') < MAX_BOARD && (
            <button onClick={() => expandBoard('moods')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
              {t('stats.showMore', { defaultValue: 'Show more' })} ({Math.min(limitFor('moods'), moodTotals.length)}/{moodTotals.length})
            </button>
          )}
          {moodTotals.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('stats.noMoodsRecorded')}</span>}
        </div>
        <div>
          <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{t('stats.topLocations')}</h3>
          {locationTotals.slice(0, limitFor('locations')).map(([loc, count]) => (
            <Bar key={loc} label={loc} value={count} max={locationTotals[0]?.[1] || 1} color="var(--success)" suffix={`${count}`} />
          ))}
          {locationTotals.length > limitFor('locations') && limitFor('locations') < MAX_BOARD && (
            <button onClick={() => expandBoard('locations')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
              {t('stats.showMore', { defaultValue: 'Show more' })} ({Math.min(limitFor('locations'), locationTotals.length)}/{locationTotals.length})
            </button>
          )}
          {locationTotals.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('stats.noLocationsRecorded')}</span>}
        </div>
      </div>

      {energyStats.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{t('energy.avgEnergy')}</h3>
          {energyStats.slice(0, 8).map(([id, avg]) => {
            const m = getMember(id);
            return <Bar key={id} label={m?.name || '?'} value={avg} max={10} color={m?.color || 'var(--accent)'} suffix={`${fmtNum(avg, 1)}/10`} />;
          })}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{t('stats.peakHours')}</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
          {peakHours.map((count, h) => (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '100%', background: count === peakMax ? 'var(--accent)' : 'var(--border)',
                borderRadius: 2, height: `${Math.max((count / peakMax) * 100, 2)}%`,
                minHeight: 2, transition: 'height 0.3s ease',
              }} />
              {h % 4 === 0 && <span style={{ fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>{h}</span>}
            </div>
          ))}
        </div>
      </div>

      {energyByHour.some(v => v > 0) && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{t('stats.energyByHour', { defaultValue: 'Energy by Hour' })}</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
            {energyByHour.map((avg, h) => (
              <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', background: avg > 0 ? 'var(--accent)' : 'var(--border)', borderRadius: 2, height: `${avg > 0 ? Math.max((avg / 10) * 100, 3) : 2}%`, minHeight: 2, transition: 'height 0.3s ease' }} />
                {h % 4 === 0 && <span style={{ fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>{h}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', marginBottom: 10 }}>{t('stats.memberLeaderboard', { name: '' }).replace(/^\s+/, '') || 'Member Details'}</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {members.filter(m => !m.archived && !m.isFacet && (singlet ? (m.isCustomFront && !SINGLET_HIDDEN_STATUS_NAMES.includes(m.name)) : !m.isCustomFront)).map(m => (
            <button key={m.id} className={`chip`}
              style={{
                borderColor: selectedStatMember === m.id ? `${m.color}60` : 'var(--border)',
                background: selectedStatMember === m.id ? `${m.color}20` : 'var(--surface)',
                color: selectedStatMember === m.id ? m.color : 'var(--dim)', cursor: 'pointer',
              }}
              onClick={() => setSelectedStatMember(selectedStatMember === m.id ? null : m.id)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
              {m.name}
            </button>
          ))}
        </div>
        {!singlet && ([
          [t('members.facets'), members.filter(m => !m.archived && m.isFacet)],
          [t('members.customFronts'), members.filter(m => !m.archived && m.isCustomFront && !m.isFacet)],
        ] as [string, typeof members][]).map(([label, list]) => list.length > 0 && (
          <React.Fragment key={label}>
            <label className="field__label">{label}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {list.map(m => (
                <button key={m.id} className={`chip`}
                  style={{
                    borderColor: selectedStatMember === m.id ? `${m.color}60` : 'var(--border)',
                    background: selectedStatMember === m.id ? `${m.color}20` : 'var(--surface)',
                    color: selectedStatMember === m.id ? m.color : 'var(--dim)', cursor: 'pointer',
                  }}
                  onClick={() => setSelectedStatMember(selectedStatMember === m.id ? null : m.id)}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                  {m.name}
                </button>
              ))}
            </div>
          </React.Fragment>
        ))}

        {memberSpecific && selectedStatMember && (() => {
          const m = getMember(selectedStatMember);
          return (
            <div style={{ padding: 14, background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                <div><span style={{ fontSize: 20, fontWeight: 700, color: m?.color || 'var(--accent)' }}>{memberSpecific.sessions}</span><span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{t('stats.sessionsSuffix')}</span></div>
                {memberSpecific.avgEnergy !== null && <div><span style={{ fontSize: 20, fontWeight: 700, color: m?.color || 'var(--accent)' }}>{memberSpecific.avgEnergy}</span><span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{t('energy.outOf10')}</span></div>}
              </div>
              {(() => {
                const kindOf = (id: string): 'member' | 'facet' | 'customFront' => {
                  const cm = getMember(id);
                  if (cm?.isFacet) return 'facet';
                  if (cm?.isCustomFront) return 'customFront';
                  return 'member';
                };
                const groups: { key: string; label: string; all: [string, number][] }[] = singlet
                  ? [{ key: 'coMembers', label: t('stats.coStatuses'), all: memberSpecific.coMembers }]
                  : [
                    { key: 'coMembers', label: t('stats.topCoMembers'), all: memberSpecific.coMembers.filter(([id]) => kindOf(id) === 'member') },
                    { key: 'coFacets', label: t('members.facets'), all: memberSpecific.coMembers.filter(([id]) => kindOf(id) === 'facet') },
                    { key: 'coCustomFronts', label: t('members.customFronts'), all: memberSpecific.coMembers.filter(([id]) => kindOf(id) === 'customFront') },
                  ];
                return groups.map(g => {
                  if (g.all.length === 0) return null;
                  const limit = limitFor(g.key);
                  return (
                    <div key={g.key} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{g.label}</div>
                      {g.all.slice(0, limit).map(([id, count]) => {
                        const cm = getMember(id);
                        return <Bar key={id} label={cm?.name || '?'} value={count} max={g.all[0]?.[1] || 1} color={cm?.color || 'var(--info)'} suffix={`${count}`} />;
                      })}
                      {g.all.length > limit && limit < MAX_BOARD && (
                        <button onClick={() => expandBoard(g.key)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
                          {t('stats.showMore', { defaultValue: 'Show more' })} ({Math.min(limit, g.all.length)}/{g.all.length})
                        </button>
                      )}
                    </div>
                  );
                });
              })()}
              {memberSpecific.moods.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('stats.topMoods')}</div>
                  {memberSpecific.moods.slice(0, limitFor('coMoods')).map(([mood, count]) => (
                    <Bar key={mood} label={translateMood(mood, t)} value={count} max={memberSpecific.moods[0]?.[1] || 1} color="var(--info)" suffix={`${count}`} />
                  ))}
                  {memberSpecific.moods.length > limitFor('coMoods') && limitFor('coMoods') < MAX_BOARD && (
                    <button onClick={() => expandBoard('coMoods')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
                      {t('stats.showMore', { defaultValue: 'Show more' })} ({Math.min(limitFor('coMoods'), memberSpecific.moods.length)}/{memberSpecific.moods.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
