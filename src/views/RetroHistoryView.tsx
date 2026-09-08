import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, HistoryEntry, FrontState, FrontTier, FrontTierKey, TIER_LABELS, fmtTime, allFrontMemberIds, singletStatuses, memberMatchesSearch } from '../utils';
import { store, KEYS } from '../storage';
import { useAppStore } from '../store/appStore';
import { Btn, Field, Toggle, useEscapeKey } from '../components/ui';

interface Props {
  onUpdate: () => void;
  onDone: () => void;
  singlet?: boolean;
  selfId?: string;
}

interface ChoiceButton {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface Choice {
  title: string;
  message: string;
  buttons: ChoiceButton[];
}

const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function RetroHistoryView({ onUpdate, onDone, singlet = false, selfId }: Props) {
  const members = useAppStore(s => s.state.members);
  const history = useAppStore(s => s.state.history);
  const front = useAppStore(s => s.state.front);
  const { t } = useTranslation();
  const regularMembers = members.filter(m => !m.isCustomFront && !m.isFacet && !m.archived);
  const facetMembers = members.filter(m => m.isFacet && !m.isCustomFront && !m.archived);
  const customFronts = members.filter(m => m.isCustomFront && !m.archived);
  const statusPool = singletStatuses(members);

  const [primaryIds, setPrimaryIds] = useState<string[]>([]);
  const [coFrontIds, setCoFrontIds] = useState<string[]>([]);
  const [coConIds, setCoConIds] = useState<string[]>([]);
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');
  const [location, setLocation] = useState('');
  const [energy, setEnergy] = useState<number | undefined>(undefined);
  const [coFrontMood, setCoFrontMood] = useState('');
  const [coFrontLocation, setCoFrontLocation] = useState('');
  const [coFrontNote, setCoFrontNote] = useState('');
  const [coFrontEnergy, setCoFrontEnergy] = useState<number | undefined>(undefined);
  const [coConMood, setCoConMood] = useState('');
  const [coConLocation, setCoConLocation] = useState('');
  const [coConNote, setCoConNote] = useState('');
  const [coConEnergy, setCoConEnergy] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [isCurrent, setIsCurrent] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  useEscapeKey(!!choice, () => setChoice(null));
  const [search, setSearch] = useState<Record<string, string>>({});

  const allSelected: Record<FrontTierKey, string[]> = { primary: primaryIds, coFront: coFrontIds, coConscious: coConIds };

  const findOverlaps = (start: number, end: number | null): HistoryEntry[] => {
    const effectiveEnd = end ?? Date.now();
    return history.filter(e => {
      if (!e.startTime) return false;
      if (e.changeType && e.changeType !== 'front') return false;
      const eEnd = e.endTime ?? Date.now();
      return e.startTime < effectiveEnd && start < eEnd;
    });
  };

  const effectivePrimary = (): string[] =>
    singlet && selfId ? [selfId, ...primaryIds.filter(id => id !== selfId)] : primaryIds;

  const buildEntry = (): HistoryEntry => ({
    memberIds: effectivePrimary(),
    startTime: startDate.getTime(),
    endTime: isCurrent ? null : endDate.getTime(),
    note: note,
    mood: mood || undefined,
    location: location || undefined,
    energyLevel: energy,
    coFrontIds: coFrontIds.length > 0 ? coFrontIds : undefined,
    coFrontMood: coFrontMood || undefined,
    coFrontNote: coFrontNote || undefined,
    coFrontLocation: coFrontLocation || undefined,
    coFrontEnergy: coFrontEnergy,
    coConsciousIds: coConIds.length > 0 ? coConIds : undefined,
    coConsciousMood: coConMood || undefined,
    coConsciousNote: coConNote || undefined,
    coConsciousLocation: coConLocation || undefined,
    coConsciousEnergy: coConEnergy,
    changeType: 'front',
  });

  const coFrontTier = (): FrontTier => ({ memberIds: coFrontIds, note: coFrontNote, mood: coFrontMood || undefined, location: coFrontLocation || undefined, energyLevel: coFrontEnergy });
  const coConTier = (): FrontTier => ({ memberIds: coConIds, note: coConNote, mood: coConMood || undefined, location: coConLocation || undefined, energyLevel: coConEnergy });

  const saveHistory = async (h: HistoryEntry[]) => {
    await store.set(KEYS.history, h);
  };

  const setFrontState = async (f: FrontState | null) => {
    await store.set(KEYS.front, f);
  };

  const replaceEntries = (deleteOverlapKeys?: Set<string>): HistoryEntry[] => {
    const newEntry = buildEntry();
    let base = history;
    if (deleteOverlapKeys) {
      base = base.filter(e => !deleteOverlapKeys.has(`${e.startTime}-${(e.memberIds || []).join(',')}`));
    }
    return [newEntry, ...base].sort((a, b) => b.startTime - a.startTime);
  };

  const finish = () => {
    setChoice(null);
    onUpdate();
    onDone();
  };

  const handleSave = async () => {
    if (!singlet && primaryIds.length === 0 && coFrontIds.length === 0 && coConIds.length === 0) {
      setChoice({ title: t('hub.noMembersSelected'), message: t('hub.selectAtLeastOne'), buttons: [{ label: t('common.cancel'), onClick: () => setChoice(null) }] });
      return;
    }
    if (!isCurrent && endDate.getTime() <= startDate.getTime()) {
      setChoice({ title: t('hub.invalidTime'), message: t('hub.endBeforeStart'), buttons: [{ label: t('common.cancel'), onClick: () => setChoice(null) }] });
      return;
    }

    const newEntry = buildEntry();
    const overlaps = findOverlaps(newEntry.startTime, newEntry.endTime);

    if (isCurrent && front) {
      setChoice({
        title: t('hub.activeFrontExists'),
        message: t('hub.activeFrontExistsMsg', { names: allFrontMemberIds(front).map(id => members.find(m => m.id === id)?.name || '?').join(', ') }),
        buttons: [
          { label: t('common.cancel'), onClick: () => setChoice(null) },
          { label: t('hub.overwrite'), danger: true, onClick: async () => {
            const now = Date.now();
            const closed = history.map(e =>
              e.endTime === null && e.startTime === front.startTime && (!e.changeType || e.changeType === 'front')
                ? { ...e, endTime: now } : e
            );
            const newFront: FrontState = {
              primary: { memberIds: effectivePrimary(), mood: mood || undefined, note, location: location || undefined, energyLevel: energy },
              coFront: coFrontTier(),
              coConscious: coConTier(),
              startTime: startDate.getTime(),
            };
            await setFrontState(newFront);
            await saveHistory([newEntry, ...closed]);
            finish();
          } },
          { label: t('hub.addTo'), onClick: async () => {
            const newFront: FrontState = {
              primary: { memberIds: [...(front?.primary.memberIds || []), ...effectivePrimary().filter(id => !front?.primary.memberIds.includes(id))], mood: mood || front?.primary.mood, note: note || front?.primary.note || '', location: location || front?.primary.location },
              coFront: { memberIds: [...(front?.coFront.memberIds || []), ...coFrontIds.filter(id => !front?.coFront.memberIds.includes(id))], mood: coFrontMood || front?.coFront.mood, note: coFrontNote || front?.coFront.note || '', location: coFrontLocation || front?.coFront.location, energyLevel: coFrontEnergy ?? front?.coFront.energyLevel },
              coConscious: { memberIds: [...(front?.coConscious.memberIds || []), ...coConIds.filter(id => !front?.coConscious.memberIds.includes(id))], mood: coConMood || front?.coConscious.mood, note: coConNote || front?.coConscious.note || '', location: coConLocation || front?.coConscious.location, energyLevel: coConEnergy ?? front?.coConscious.energyLevel },
              startTime: front?.startTime || startDate.getTime(),
            };
            await setFrontState(newFront);
            await saveHistory(replaceEntries());
            finish();
          } },
        ],
      });
      return;
    }

    if (overlaps.length > 0) {
      const overlapNames = overlaps.slice(0, 3).map(e => {
        const names = (e.memberIds || []).map(id => members.find(m => m.id === id)?.name || '?').join(', ');
        return `${names} (${fmtTime(e.startTime)})`;
      }).join('\n');
      setChoice({
        title: t('hub.overlapDetected'),
        message: `${t('hub.overlapMsg')}\n\n${overlapNames}${overlaps.length > 3 ? `\n${t('hub.overlapMore', { count: overlaps.length - 3 })}` : ''}`,
        buttons: [
          { label: t('common.cancel'), onClick: () => setChoice(null) },
          { label: t('hub.keepBoth'), onClick: async () => { await saveHistory(replaceEntries()); finish(); } },
          { label: t('hub.replace'), danger: true, onClick: async () => {
            const overlapSet = new Set(overlaps.map(e => `${e.startTime}-${e.memberIds.join(',')}`));
            await saveHistory(replaceEntries(overlapSet));
            finish();
          } },
        ],
      });
      return;
    }

    if (isCurrent) {
      const newFront: FrontState = {
        primary: { memberIds: effectivePrimary(), mood: mood || undefined, note, location: location || undefined, energyLevel: energy },
        coFront: coFrontTier(),
        coConscious: coConTier(),
        startTime: startDate.getTime(),
      };
      await setFrontState(newFront);
    }
    await saveHistory(replaceEntries());
    finish();
  };

  const TierMemberPicker = ({ tierKey, poolKey, label, color, selected, setSelected, pool, searchKind }: {
    tierKey: FrontTierKey; poolKey: string; label: string; color: string;
    selected: string[]; setSelected: (ids: string[]) => void; pool: Member[];
    searchKind?: string;
  }) => {
    const q = search[poolKey] || '';
    const ql = q.toLowerCase();
    const filtered = ql ? pool.filter(m => !selected.includes(m.id) && memberMatchesSearch(m, ql)) : [];
    const poolSelected = pool.filter(m => selected.includes(m.id));
    const toggle = (id: string) => {
      setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    };
    return (
      <div style={{ marginBottom: 16 }}>
        <div className="section-div">
          <span className="section-div__dot" style={{ background: color }} />
          <span className="section-div__label" style={{ color }}>{label}</span>
          <span className="section-div__line" />
        </div>
        {poolSelected.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {poolSelected.map(m => (
              <button key={m.id} className="chip" aria-label={`${t('common.remove')} ${m.name}`} style={{ borderColor: `${m.color}50`, background: `${m.color}20` }}
                onClick={() => toggle(m.id)}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                <span style={{ color: m.color }}>{m.name}</span>
                <span aria-hidden style={{ fontSize: 10, color: m.color }}>✕</span>
              </button>
            ))}
          </div>
        )}
        <input className="field__input" value={q}
          onChange={e => setSearch({ ...search, [poolKey]: e.target.value })}
          aria-label={searchKind ? t('members.searchToAddKind', { kind: searchKind, defaultValue: `Type to search ${searchKind}…` }) : t('members.searchToAdd')}
          placeholder={searchKind ? t('members.searchToAddKind', { kind: searchKind, defaultValue: `Type to search ${searchKind}…` }) : t('members.searchToAdd')}
          style={{ marginBottom: 6, fontSize: 12 }} />
        {ql && filtered.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', marginBottom: 4 }}>
            {filtered.slice(0, 20).map(m => {
              const otherTier = (Object.entries(allSelected) as [FrontTierKey, string[]][]).find(([tk, ids]) => tk !== tierKey && ids.includes(m.id));
              return (
                <button key={m.id} onClick={() => { toggle(m.id); setSearch({ ...search, [poolKey]: '' }); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: otherTier ? 0.5 : 1 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: 'var(--text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  {m.pronouns ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{m.pronouns}</span> : null}
                  {otherTier && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>({TIER_LABELS[otherTier[0]].split(' ')[0]})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const tierDetails = (
    tierLabel: string, color: string,
    moodVal: string, setMoodVal: (v: string) => void,
    locVal: string, setLocVal: (v: string) => void,
    energyVal: number | undefined, setEnergyVal: (v: number | undefined) => void,
    noteVal: string, setNoteVal: (v: string) => void,
  ) => (
    <div key={tierLabel || 'primary'}>
      {tierLabel ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block' }} />
          <span role="heading" aria-level={3} style={{ fontSize: 12, fontWeight: 600, color }}>{tierLabel}</span>
        </div>
      ) : null}
      <Field label={t('modal.mood')} value={moodVal} onChange={setMoodVal} placeholder={t('modal.enterMood')} />
      <Field label={t('modal.location')} value={locVal} onChange={setLocVal} placeholder={t('modal.typeLocation')} />

      <label className="field__label">{t('energy.level')}</label>
      <div style={{ display: 'flex', gap: 3, marginBottom: 14, alignItems: 'center' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button key={n} onClick={() => setEnergyVal(energyVal === n ? undefined : n)}
            aria-label={`${tierLabel ? `${tierLabel}, ` : ''}${t('energy.level')} ${n}/10`} aria-pressed={energyVal === n}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: energyVal === n ? 'var(--accent-bg)' : 'var(--surface)',
              border: `1px solid ${energyVal !== undefined && n <= energyVal ? color : 'var(--border)'}`,
              color: energyVal !== undefined && n <= energyVal ? color : 'var(--dim)',
            }}>{n}</button>
        ))}
      </div>

      <Field label={t('modal.note')} value={noteVal} onChange={setNoteVal} placeholder={t('modal.whatHappening')} multiline />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 14px' }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <label className="field__label">{t('hub.startTime')}</label>
      <input className="field__input" aria-label={t('hub.startTime')} type="datetime-local" value={toLocalInput(startDate)}
        onChange={e => { if (e.target.value) setStartDate(new Date(e.target.value)); }}
        style={{ marginBottom: 14 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label className="field__label" style={{ marginBottom: 0 }}>{t('hub.endTime')}</label>
        <Toggle value={isCurrent} onChange={setIsCurrent} label={t('hub.current')} />
      </div>
      {!isCurrent && (
        <input className="field__input" aria-label={t('hub.endTime')} type="datetime-local" value={toLocalInput(endDate)}
          onChange={e => { if (e.target.value) setEndDate(new Date(e.target.value)); }}
          style={{ marginBottom: 14 }} />
      )}

      <div style={{ height: 1, background: 'var(--border)', margin: '10px 0 16px' }} />

      {singlet ? (
        <TierMemberPicker tierKey="primary" poolKey="primary" label={t('status.statuses')} color="var(--accent)" selected={primaryIds} setSelected={setPrimaryIds} pool={statusPool} />
      ) : (<>
        <TierMemberPicker tierKey="primary" poolKey="primary" label={TIER_LABELS.primary} color="var(--accent)" selected={primaryIds} setSelected={setPrimaryIds} pool={regularMembers} searchKind={t('members.title')} />
        <TierMemberPicker tierKey="primary" poolKey="primaryFacet" label={t('members.facets')} color="var(--accent)" selected={primaryIds} setSelected={setPrimaryIds} pool={facetMembers} searchKind={t('members.facets')} />
        {customFronts.length > 0 && (
          <TierMemberPicker tierKey="primary" poolKey="primaryCf" label={t('members.customFronts')} color="var(--accent)" selected={primaryIds} setSelected={setPrimaryIds} pool={customFronts} searchKind={t('members.customFronts')} />
        )}
        <TierMemberPicker tierKey="coFront" poolKey="coFront" label={TIER_LABELS.coFront} color="var(--info)" selected={coFrontIds} setSelected={setCoFrontIds} pool={regularMembers} searchKind={t('members.title')} />
        <TierMemberPicker tierKey="coFront" poolKey="coFrontFacet" label={t('members.facets')} color="var(--info)" selected={coFrontIds} setSelected={setCoFrontIds} pool={facetMembers} searchKind={t('members.facets')} />
        {customFronts.length > 0 && (
          <TierMemberPicker tierKey="coFront" poolKey="coFrontCf" label={t('members.customFronts')} color="var(--info)" selected={coFrontIds} setSelected={setCoFrontIds} pool={customFronts} searchKind={t('members.customFronts')} />
        )}
        <TierMemberPicker tierKey="coConscious" poolKey="coConscious" label={TIER_LABELS.coConscious} color="var(--success)" selected={coConIds} setSelected={setCoConIds} pool={regularMembers} searchKind={t('members.title')} />
        <TierMemberPicker tierKey="coConscious" poolKey="coConsciousFacet" label={t('members.facets')} color="var(--success)" selected={coConIds} setSelected={setCoConIds} pool={facetMembers} searchKind={t('members.facets')} />
        {customFronts.length > 0 && (
          <TierMemberPicker tierKey="coConscious" poolKey="coConsciousCf" label={t('members.customFronts')} color="var(--success)" selected={coConIds} setSelected={setCoConIds} pool={customFronts} searchKind={t('members.customFronts')} />
        )}
      </>)}

      {tierDetails(singlet ? '' : TIER_LABELS.primary, 'var(--accent)', mood, setMood, location, setLocation, energy, setEnergy, note, setNote)}
      {!singlet && coFrontIds.length > 0 && tierDetails(TIER_LABELS.coFront, 'var(--info)', coFrontMood, setCoFrontMood, coFrontLocation, setCoFrontLocation, coFrontEnergy, setCoFrontEnergy, coFrontNote, setCoFrontNote)}
      {!singlet && coConIds.length > 0 && tierDetails(TIER_LABELS.coConscious, 'var(--success)', coConMood, setCoConMood, coConLocation, setCoConLocation, coConEnergy, setCoConEnergy, coConNote, setCoConNote)}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 30 }}>
        <Btn variant="ghost" onClick={onDone}>{t('common.cancel')}</Btn>
        <Btn variant="solid" onClick={handleSave}>{t('common.save')}</Btn>
      </div>

      {choice && (
        <div className="modal-overlay" role="presentation" onClick={() => setChoice(null)}>
          <div className="modal modal--sm" role="presentation" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <span className="modal__title">{choice.title}</span>
            </div>
            <div className="modal__body" style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--dim)', padding: 16 }}>
              {choice.message}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 16px 16px' }}>
              {choice.buttons.map((b, i) => (
                <Btn key={i} variant={b.danger ? 'danger' : i === 0 ? 'ghost' : 'solid'} onClick={b.onClick}>{b.label}</Btn>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
