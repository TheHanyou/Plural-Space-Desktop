import React, { useState, useEffect, useMemo } from 'react';
import {
  Member, MemberGroup, FrontState, FrontTier, FrontTierKey, HistoryEntry,
  AppSettings, TIER_LABELS, DEFAULT_MOODS, EMPTY_TIER,
  fmtTime, fmtDur, getInitials, isFrontEmpty, frontToHistoryEntry, uid,
} from '../utils';
import { store, KEYS } from '../storage';
import { Btn, Field, Section, Modal, ConfirmDialog } from '../components/ui';

interface Props {
  front: FrontState | null;
  members: Member[];
  groups: MemberGroup[];
  history: HistoryEntry[];
  settings: AppSettings;
  onUpdate: () => void;
}

const TIER_COLORS: Record<FrontTierKey, string> = {
  primary: 'var(--accent)',
  coFront: 'var(--info)',
  coConscious: 'var(--success)',
};

const TIER_ORDER: FrontTierKey[] = ['primary', 'coFront', 'coConscious'];

export default function FrontView({ front, members, groups, history, settings, onUpdate }: Props) {
  const [tick, setTick] = useState(0);
  const [showSetFront, setShowSetFront] = useState(false);
  const [editDetailTier, setEditDetailTier] = useState<FrontTierKey | null>(null);
  const [editingNote, setEditingNote] = useState<FrontTierKey | null>(null);
  const [noteText, setNoteText] = useState('');

  // Live tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const getMember = (id: string) => members.find(m => m.id === id);
  const activeMembers = members.filter(m => !m.archived);
  const allMoods = [...DEFAULT_MOODS, ...(settings.customMoods || [])];

  // ─── Save Front ─────────────────────────────────────────────────────

  const saveFront = async (primary: any, coFront: any, coConscious: any) => {
    // Close current front in history
    if (front && !isFrontEmpty(front)) {
      const entry = frontToHistoryEntry(front, Date.now());
      const h = await store.get<HistoryEntry[]>(KEYS.history, []) || [];
      await store.set(KEYS.history, [entry, ...h]);
    }

    const newFront: FrontState = {
      primary: { memberIds: primary.memberIds || [], mood: primary.mood, note: primary.note || '', location: primary.location },
      coFront: { memberIds: coFront.memberIds || [], mood: coFront.mood, note: coFront.note || '' },
      coConscious: { memberIds: coConscious.memberIds || [], mood: coConscious.mood, note: coConscious.note || '' },
      startTime: Date.now(),
    };

    if (isFrontEmpty(newFront)) {
      await store.set(KEYS.front, null);
    } else {
      await store.set(KEYS.front, newFront);
    }
    onUpdate();
  };

  const updateNote = async (tier: FrontTierKey, note: string) => {
    if (!front) return;
    const updated = { ...front, [tier]: { ...front[tier], note } };
    await store.set(KEYS.front, updated);
    onUpdate();
  };

  const updateTierDetail = async (tier: FrontTierKey, mood?: string, location?: string, note?: string) => {
    if (!front) return;
    const updated = {
      ...front,
      [tier]: {
        ...front[tier],
        mood: mood ?? front[tier].mood,
        location: tier === 'primary' ? (location ?? front[tier].location) : front[tier].location,
        note: note ?? front[tier].note,
      },
    };
    await store.set(KEYS.front, updated);
    setEditDetailTier(null);
    onUpdate();
  };

  // ─── Tier Card ──────────────────────────────────────────────────────

  const TierCard = ({ tierKey }: { tierKey: FrontTierKey }) => {
    if (!front) return null;
    const tier = front[tierKey];
    if (tier.memberIds.length === 0) return null;

    const color = TIER_COLORS[tierKey];
    const isPrimary = tierKey === 'primary';
    const isEditingNote = editingNote === tierKey;

    return (
      <div style={{ marginBottom: 16 }}>
        {/* Tier header */}
        <div className="section-div">
          <span className="section-div__dot" style={{ background: color }} />
          <span className="section-div__label" style={{ color }}>{TIER_LABELS[tierKey]}</span>
          <span className="section-div__line" />
        </div>

        <div style={{
          padding: 16, background: 'var(--card)', border: `1px solid ${color}40`,
          borderRadius: 'var(--radius)',
        }}>
          {/* Members */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 10 }}>
            {tier.memberIds.map(id => {
              const m = getMember(id);
              if (!m) return null;
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="tile__avatar" style={{
                    width: isPrimary ? 48 : 40, height: isPrimary ? 48 : 40,
                    fontSize: isPrimary ? 16 : 14,
                    ...(m.avatar ? { backgroundImage: `url(${m.avatar})` } : { backgroundColor: m.color }),
                  }}>
                    {!m.avatar && getInitials(m.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: isPrimary ? 16 : 14, fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                    {m.pronouns && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{m.pronouns}</div>}
                    {m.role && <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: m.color, marginTop: 1 }}>{m.role.toUpperCase()}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Duration (primary only) */}
          {isPrimary && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0', marginBottom: 8, fontSize: 11, color: 'var(--muted)' }}>
              Fronting for <span style={{ color: 'var(--accent)' }}>{fmtDur(front.startTime)}</span>
              {' · Since '}{fmtTime(front.startTime)}
            </div>
          )}

          {/* Mood / Location */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
            {tier.mood && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 2 }}>Mood</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{tier.mood}</div>
              </div>
            )}
            {isPrimary && tier.location && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 2 }}>Location</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{tier.location}</div>
              </div>
            )}
            <button style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 14, cursor: 'pointer' }}
              onClick={() => setEditDetailTier(tierKey)}>✎</button>
          </div>
          {!tier.mood && !tier.location && (
            <button style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}
              onClick={() => setEditDetailTier(tierKey)}>
              {isPrimary ? '+ Add mood / location' : '+ Add mood'}
            </button>
          )}

          {/* Note */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 600 }}>Front Note</span>
              {!isEditingNote ? (
                <button style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 14, cursor: 'pointer' }}
                  onClick={() => { setEditingNote(tierKey); setNoteText(tier.note || ''); }}>✎</button>
              ) : (
                <button style={{ background: 'none', border: 'none', color: 'var(--success)', fontSize: 14, cursor: 'pointer' }}
                  onClick={() => { setEditingNote(null); updateNote(tierKey, noteText); }}>✓</button>
              )}
            </div>
            {isEditingNote ? (
              <textarea className="field__input field__input--multi" value={noteText} onChange={e => setNoteText(e.target.value)}
                placeholder="What's happening?" style={{ minHeight: 56, fontSize: 12 }} />
            ) : (
              <p style={{ fontSize: 12, lineHeight: 1.5, color: tier.note ? 'var(--text)' : 'var(--muted)' }}>
                {tier.note || 'No note'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const empty = isFrontEmpty(front);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)', fontWeight: 600, fontStyle: 'italic' }}>
          Currently Fronting
        </h2>
        <Btn variant="primary" onClick={() => setShowSetFront(true)}>Update Front</Btn>
      </div>

      {empty ? (
        <div style={{
          padding: 32, textAlign: 'center', background: 'var(--card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>No one currently fronting</p>
          <Btn onClick={() => setShowSetFront(true)}>Set Front</Btn>
        </div>
      ) : (
        TIER_ORDER.map(t => <TierCard key={t} tierKey={t} />)
      )}

      {/* ─── Set Front Modal ─────────────────────────────────────────── */}
      <SetFrontModal
        open={showSetFront}
        onClose={() => setShowSetFront(false)}
        onSave={saveFront}
        members={activeMembers}
        groups={groups}
        current={front}
        settings={settings}
        allMoods={allMoods}
      />

      {/* ─── Edit Detail Modal ───────────────────────────────────────── */}
      {editDetailTier && front && (
        <EditDetailModal
          open={!!editDetailTier}
          tier={editDetailTier}
          tierData={front[editDetailTier]}
          isPrimary={editDetailTier === 'primary'}
          allMoods={allMoods}
          allLocations={settings.locations}
          onClose={() => setEditDetailTier(null)}
          onSave={(mood, location, note) => updateTierDetail(editDetailTier, mood, location, note)}
        />
      )}
    </div>
  );
}

// ─── Set Front Modal ──────────────────────────────────────────────────────

function SetFrontModal({ open, onClose, onSave, members, groups, current, settings, allMoods }: {
  open: boolean; onClose: () => void; onSave: (p: any, cf: any, cc: any) => void;
  members: Member[]; groups: MemberGroup[]; current: FrontState | null;
  settings: AppSettings; allMoods: string[];
}) {
  const [primaryIds, setPrimaryIds] = useState<Set<string>>(new Set());
  const [coFrontIds, setCoFrontIds] = useState<Set<string>>(new Set());
  const [coConsciousIds, setCoConsciousIds] = useState<Set<string>>(new Set());
  const [primaryMood, setPrimaryMood] = useState('');
  const [primaryLocation, setPrimaryLocation] = useState('');
  const [primaryNote, setPrimaryNote] = useState('');
  const [coFrontMood, setCoFrontMood] = useState('');
  const [coFrontNote, setCoFrontNote] = useState('');
  const [coConMood, setCoConMood] = useState('');
  const [coConNote, setCoConNote] = useState('');
  const [search, setSearch] = useState<Record<FrontTierKey, string>>({ primary: '', coFront: '', coConscious: '' });
  const [confirmClear, setConfirmClear] = useState(false);

  // Only re-initialize when the modal transitions from closed → open
  const prevOpen = React.useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      if (current) {
        setPrimaryIds(new Set(current.primary.memberIds));
        setCoFrontIds(new Set(current.coFront.memberIds));
        setCoConsciousIds(new Set(current.coConscious.memberIds));
        setPrimaryMood(current.primary.mood || '');
        setPrimaryLocation(current.primary.location || '');
        setPrimaryNote(current.primary.note || '');
        setCoFrontMood(current.coFront.mood || '');
        setCoFrontNote(current.coFront.note || '');
        setCoConMood(current.coConscious.mood || '');
        setCoConNote(current.coConscious.note || '');
      } else {
        setPrimaryIds(new Set()); setCoFrontIds(new Set()); setCoConsciousIds(new Set());
        setPrimaryMood(''); setPrimaryLocation(''); setPrimaryNote('');
        setCoFrontMood(''); setCoFrontNote(''); setCoConMood(''); setCoConNote('');
      }
      setSearch({ primary: '', coFront: '', coConscious: '' });
    }
    prevOpen.current = open;
  }, [open]);

  const allAssigned = useMemo(() => {
    const map: Record<string, FrontTierKey> = {};
    primaryIds.forEach(id => { map[id] = 'primary'; });
    coFrontIds.forEach(id => { map[id] = 'coFront'; });
    coConsciousIds.forEach(id => { map[id] = 'coConscious'; });
    return map;
  }, [primaryIds, coFrontIds, coConsciousIds]);

  const toggleMember = (tier: FrontTierKey, id: string) => {
    const setters: Record<FrontTierKey, [Set<string>, (s: Set<string>) => void]> = {
      primary: [primaryIds, setPrimaryIds], coFront: [coFrontIds, setCoFrontIds], coConscious: [coConsciousIds, setCoConsciousIds],
    };
    const [set, setter] = setters[tier];
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Remove from other tiers (exclusive)
      for (const [key, [otherSet, otherSetter]] of Object.entries(setters)) {
        if (key !== tier && otherSet.has(id)) {
          const cleaned = new Set(otherSet);
          cleaned.delete(id);
          otherSetter(cleaned);
        }
      }
    }
    setter(next);
  };

  const handleSave = () => {
    onSave(
      { memberIds: [...primaryIds], mood: primaryMood || undefined, note: primaryNote, location: primaryLocation || undefined },
      { memberIds: [...coFrontIds], mood: coFrontMood || undefined, note: coFrontNote },
      { memberIds: [...coConsciousIds], mood: coConMood || undefined, note: coConNote },
    );
    onClose();
  };

  const handleClear = () => setConfirmClear(true);
  const handleConfirmClear = () => {
    onSave({ memberIds: [] }, { memberIds: [] }, { memberIds: [] });
    setConfirmClear(false);
    onClose();
  };

  const TierPicker = ({ tierKey, selectedIds, mood, setMood, note, setNote, color }: {
    tierKey: FrontTierKey; selectedIds: Set<string>;
    mood: string; setMood: (v: string) => void;
    note: string; setNote: (v: string) => void;
    color: string;
  }) => {
    const q = search[tierKey].toLowerCase();
    const filtered = members.filter(m => !selectedIds.has(m.id) && (!q || m.name.toLowerCase().includes(q)));
    const selected = members.filter(m => selectedIds.has(m.id));

    return (
      <div style={{ marginBottom: 16 }}>
        <div className="section-div">
          <span className="section-div__dot" style={{ background: color }} />
          <span className="section-div__label" style={{ color }}>{TIER_LABELS[tierKey]}</span>
          <span className="section-div__line" />
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {selected.map(m => (
              <button key={m.id} className="chip" style={{ borderColor: `${m.color}50`, background: `${m.color}20` }}
                onClick={() => toggleMember(tierKey, m.id)}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                <span style={{ color: m.color }}>{m.name}</span>
                <span style={{ fontSize: 10, color: m.color }}>✕</span>
              </button>
            ))}
          </div>
        )}

        {/* Search + available */}
        <input className="field__input" value={search[tierKey]}
          onChange={e => setSearch({ ...search, [tierKey]: e.target.value })}
          placeholder="Search members..." style={{ marginBottom: 6, fontSize: 12 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10, maxHeight: 100, overflowY: 'auto' }}>
          {filtered.slice(0, 20).map(m => {
            const assignedTo = allAssigned[m.id];
            return (
              <button key={m.id} className="chip" style={{ borderColor: 'var(--border)', background: 'var(--surface)', opacity: assignedTo ? 0.5 : 1 }}
                onClick={() => toggleMember(tierKey, m.id)}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                <span style={{ color: 'var(--dim)', fontSize: 11 }}>{m.name}</span>
                {assignedTo && assignedTo !== tierKey && (
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>({TIER_LABELS[assignedTo].split(' ')[0]})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Mood */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {allMoods.map(m => (
            <button key={m} className={`btn ${mood === m ? 'btn--primary' : 'btn--ghost'}`}
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={() => setMood(mood === m ? '' : m)}>{m}</button>
          ))}
        </div>

        {/* Location (primary only) */}
        {tierKey === 'primary' && (
          <>
            <label className="field__label" style={{ marginTop: 4 }}>Location</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
              {(settings.locations || []).map(l => (
                <button key={l} className={`btn ${primaryLocation === l ? 'btn--primary' : 'btn--ghost'}`}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setPrimaryLocation(primaryLocation === l ? '' : l)}>{l}</button>
              ))}
            </div>
            <input className="field__input" value={primaryLocation} onChange={e => setPrimaryLocation(e.target.value)}
              placeholder="Type location..." style={{ fontSize: 12, marginBottom: 8 }} />
          </>
        )}

        {/* Note */}
        <textarea className="field__input field__input--multi" value={note} onChange={e => setNote(e.target.value)}
          placeholder="What's happening?" style={{ minHeight: 48, fontSize: 12 }} />
      </div>
    );
  };

  return (
    <>
      <Modal open={open} title={t('modal.updateFront')} onClose={onClose}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <Btn variant="ghost" onClick={handleClear}>{t('front.clearFront')}</Btn>
            <Btn variant="solid" onClick={handleSave}>{t('common.save')}</Btn>
          </div>
        }>
        <TierPicker tierKey="primary" selectedIds={primaryIds} mood={primaryMood} setMood={setPrimaryMood} note={primaryNote} setNote={setPrimaryNote} color="var(--accent)" />
        <TierPicker tierKey="coFront" selectedIds={coFrontIds} mood={coFrontMood} setMood={setCoFrontMood} note={coFrontNote} setNote={setCoFrontNote} color="var(--info)" />
        <TierPicker tierKey="coConscious" selectedIds={coConsciousIds} mood={coConMood} setMood={setCoConMood} note={coConNote} setNote={setCoConNote} color="var(--success)" />
      </Modal>
      <ConfirmDialog
        open={confirmClear}
        title={t('front.clearFrontTitle')}
        message={t('front.clearFrontMsg')}
        danger
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}

// ─── Edit Detail Modal ────────────────────────────────────────────────────

function EditDetailModal({ open, tier, tierData, isPrimary, allMoods, allLocations, onClose, onSave }: {
  open: boolean; tier: FrontTierKey; tierData: FrontTier; isPrimary: boolean;
  allMoods: string[]; allLocations: string[];
  onClose: () => void; onSave: (mood?: string, location?: string, note?: string) => void;
}) {
  const [mood, setMood] = useState(tierData.mood || '');
  const [location, setLocation] = useState(tierData.location || '');
  const [note, setNote] = useState(tierData.note || '');

  useEffect(() => {
    setMood(tierData.mood || '');
    setLocation(tierData.location || '');
    setNote(tierData.note || '');
  }, [tierData, open]);

  return (
    <Modal open={open} title={`Edit ${TIER_LABELS[tier]}`} onClose={onClose}
      footer={<Btn variant="solid" onClick={() => onSave(mood || undefined, isPrimary ? location || undefined : undefined, note || undefined)}>Save</Btn>}>
      <label className="field__label">Mood</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {allMoods.map(m => (
          <button key={m} className={`btn ${mood === m ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={() => setMood(mood === m ? '' : m)}>{m}</button>
        ))}
      </div>
      {isPrimary && (
        <>
          <label className="field__label">Location</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
            {allLocations.map(l => (
              <button key={l} className={`btn ${location === l ? 'btn--primary' : 'btn--ghost'}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setLocation(location === l ? '' : l)}>{l}</button>
            ))}
          </div>
          <input className="field__input" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="Type location..." style={{ fontSize: 12, marginBottom: 10 }} />
        </>
      )}
      <Field label="Note" value={note} onChange={setNote} placeholder="What's happening?" multiline />
    </Modal>
  );
}
