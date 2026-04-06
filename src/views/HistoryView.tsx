import React, { useState, useMemo } from 'react';
import { Member, HistoryEntry, FrontTierKey, TIER_LABELS, fmtTime, fmtDur, fmtDate, getInitials } from '../utils';

interface Props {
  history: HistoryEntry[];
  members: Member[];
}

type TimeRange = 'all' | '7d' | '30d' | '90d';

export default function HistoryView({ history, members }: Props) {
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<TimeRange>('all');
  const [memberFilter, setMemberFilter] = useState('');

  const getMember = (id: string) => members.find(m => m.id === id);

  const cutoff = useMemo(() => {
    if (range === '7d') return Date.now() - 7 * 86400000;
    if (range === '30d') return Date.now() - 30 * 86400000;
    if (range === '90d') return Date.now() - 90 * 86400000;
    return 0;
  }, [range]);

  const filtered = useMemo(() => {
    return history
      .filter(h => {
        if (!h.changeType || h.changeType === 'front') {
          if (h.startTime < cutoff && (h.endTime && h.endTime < cutoff)) return false;
        }
        if (memberFilter) {
          const allIds = [...h.memberIds, ...(h.coFrontIds || []), ...(h.coConsciousIds || [])];
          if (!allIds.includes(memberFilter)) return false;
        }
        if (search) {
          const names = [...h.memberIds, ...(h.coFrontIds || []), ...(h.coConsciousIds || [])]
            .map(id => getMember(id)?.name || '').join(' ').toLowerCase();
          const note = (h.note || '').toLowerCase();
          const mood = (h.mood || '').toLowerCase();
          if (!names.includes(search.toLowerCase()) && !note.includes(search.toLowerCase()) && !mood.includes(search.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => b.startTime - a.startTime);
  }, [history, cutoff, memberFilter, search]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { date: string; entries: HistoryEntry[] }[] = [];
    let currentDate = '';
    for (const entry of filtered) {
      const d = fmtDate(entry.startTime);
      if (d !== currentDate) {
        currentDate = d;
        groups.push({ date: d, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [filtered]);

  const MemberChip = ({ id }: { id: string }) => {
    const m = getMember(id);
    if (!m) return null;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 12, color: m.color, padding: '2px 8px',
        borderRadius: 999, background: `${m.color}15`, border: `1px solid ${m.color}30`,
      }}>
        {m.avatar ? (
          <span style={{ width: 16, height: 16, borderRadius: 8, backgroundImage: `url(${m.avatar})`, backgroundSize: 'cover', display: 'inline-block' }} />
        ) : (
          <span style={{ width: 16, height: 16, borderRadius: 8, background: m.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--bg)', fontWeight: 700 }}>
            {getInitials(m.name)}
          </span>
        )}
        {m.name}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="field__input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search history..." style={{ flex: 1, minWidth: 200 }} />
        <select style={{
          background: 'var(--surface)', color: memberFilter ? 'var(--accent)' : 'var(--muted)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13,
        }} value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
          <option value="">All members</option>
          {members.filter(m => !m.archived).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', '90d', '30d', '7d'] as TimeRange[]).map(r => (
            <button key={r} className={`btn ${range === r ? 'btn--primary' : 'btn--ghost'}`}
              style={{ padding: '7px 10px', fontSize: 12 }}
              onClick={() => setRange(r)}>
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
      </div>

      {/* Grouped entries */}
      {grouped.map(group => (
        <div key={group.date} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8,
            color: 'var(--accent)', fontWeight: 600, marginBottom: 8,
            padding: '4px 0', borderBottom: '1px solid var(--border)',
          }}>
            {group.date}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.entries.map((entry, i) => (
              <div key={i} style={{
                padding: 12, background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                {/* Primary */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {entry.memberIds.map(id => <MemberChip key={id} id={id} />)}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTime(entry.startTime)} — {entry.endTime ? fmtTime(entry.endTime) : 'now'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDur(entry.startTime, entry.endTime)}
                  </span>
                </div>

                {/* Co-Front / Co-Conscious */}
                {(entry.coFrontIds || []).length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Co-Front:</span>
                    {(entry.coFrontIds || []).map(id => <MemberChip key={id} id={id} />)}
                  </div>
                )}
                {(entry.coConsciousIds || []).length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Co-Con:</span>
                    {(entry.coConsciousIds || []).map(id => <MemberChip key={id} id={id} />)}
                  </div>
                )}

                {/* Mood / Note / Location */}
                {(entry.mood || entry.note || entry.location) && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--dim)' }}>
                    {entry.mood && <span>😊 {entry.mood}</span>}
                    {entry.location && <span>📍 {entry.location}</span>}
                    {entry.note && <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{entry.note}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          {search || memberFilter ? 'No history matches your filters' : 'No front history yet'}
        </div>
      )}
    </div>
  );
}
