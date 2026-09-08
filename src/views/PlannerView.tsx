import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, Field, ConfirmDialog, Toggle, Section, AddRow, useEscapeKey } from '../components/ui';
import { store, KEYS } from '../storage';
import { PlannerData, PlannerAppointment, PlannerReminder, PlannerRepeat, PlannerReminderRepeat, DEFAULT_PLANNER, plannerOccursOnDay, uid, isValidTimeHHMM, getLocale } from '../utils';
import { NetworkManager } from '../network/NetworkManager';
import { logError } from '../log';
import { ColorCarousel } from '../components/ColorCarousel';

interface Props { onUpdate?: () => void; }

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const REMIND_CHOICES: { minutes: number | null; key: string }[] = [
  { minutes: null, key: 'planner.remindNone' },
  { minutes: 0, key: 'planner.remindAtTime' },
  { minutes: 30, key: 'planner.remind30m' },
  { minutes: 60, key: 'planner.remind1h' },
  { minutes: 1440, key: 'planner.remind1d' },
];

const REPEAT_KEYS: Record<string, string> = {
  once: 'planner.repeatOnce',
  daily: 'planner.repeatDaily',
  everyOtherDay: 'planner.repeatEveryOtherDay',
  weekly: 'planner.repeatWeekly',
  everyOtherWeek: 'planner.repeatEveryOtherWeek',
  monthly: 'planner.repeatMonthly',
  everyOtherMonth: 'planner.repeatEveryOtherMonth',
  annually: 'planner.repeatAnnually',
};

const APPT_REPEAT_CHOICES: (PlannerRepeat | null)[] = [null, 'daily', 'everyOtherDay', 'weekly', 'everyOtherWeek', 'monthly', 'everyOtherMonth', 'annually'];
const REM_REPEAT_CHOICES: PlannerReminderRepeat[] = ['once', 'daily', 'everyOtherDay', 'weekly', 'everyOtherWeek', 'monthly', 'everyOtherMonth', 'annually'];

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toLocalDateInput = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const hhmmOf = (ts: number): string => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function PlannerView({ onUpdate }: Props) {
  const { t } = useTranslation();
  const locale = getLocale();
  const [planner, setPlannerState] = useState<PlannerData>(DEFAULT_PLANNER);
  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  const today = new Date();
  const [viewMonth, setViewMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);

  const [apptOpen, setApptOpen] = useState(false);
  const [apptId, setApptId] = useState<string | null>(null);
  const [apptTitle, setApptTitle] = useState('');
  const [apptWhen, setApptWhen] = useState('');
  const [apptLocation, setApptLocation] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptRemind, setApptRemind] = useState<number | null>(30);
  const [apptRepeat, setApptRepeat] = useState<PlannerRepeat | null>(null);
  const [apptColor, setApptColor] = useState<string | null>(null);

  const [remOpen, setRemOpen] = useState(false);
  const [remId, setRemId] = useState<string | null>(null);
  const [remTitle, setRemTitle] = useState('');
  const [remTimes, setRemTimes] = useState<string[]>([]);
  const [remNewTime, setRemNewTime] = useState('');
  const [remNotes, setRemNotes] = useState('');
  const [remRepeat, setRemRepeat] = useState<PlannerReminderRepeat>('daily');
  const [remStart, setRemStart] = useState('');

  const [deleteAppt, setDeleteAppt] = useState<PlannerAppointment | null>(null);
  const [deleteRem, setDeleteRem] = useState<PlannerReminder | null>(null);
  const [markPickerOpen, setMarkPickerOpen] = useState(false);
  const markColor = planner.markColor || 'var(--accent)';

  useEscapeKey(apptOpen, () => setApptOpen(false));
  useEscapeKey(remOpen, () => setRemOpen(false));

  React.useEffect(() => {
    store.get<PlannerData>(KEYS.planner, null).then(p => {
      if (p) setPlannerState({ ...DEFAULT_PLANNER, ...p });
    }).catch(e => logError('planner', e));
  }, []);

  const save = async (next: PlannerData) => {
    setPlannerState(next);
    await store.set(KEYS.planner, next);
    NetworkManager.notifyDataChanged();
    onUpdate?.();
  };

  const weekdayInitials = useMemo(() => {
    const base = new Date(2026, 7, 2);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: 'narrow' });
    });
  }, [locale]);

  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewMonth]);

  const minutesOfDay = (ts: number) => { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); };
  const apptsOn = (day: Date): PlannerAppointment[] =>
    (planner.appointments || [])
      .filter(a => plannerOccursOnDay(a.time, a.repeat, day))
      .sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));

  const monthLabel = viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const selectedLabel = selected.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
  const dayAppts = apptsOn(selected);
  const sortedRems = [...(planner.reminders || [])].sort((a, b) => (a.times[0] || '').localeCompare(b.times[0] || ''));

  const openNewAppt = () => {
    const when = new Date(selected);
    when.setHours(12, 0, 0, 0);
    setApptId(null); setApptTitle(''); setApptWhen(toLocalInput(when.getTime())); setApptLocation(''); setApptNotes(''); setApptRemind(30); setApptRepeat(null); setApptColor(null);
    setApptOpen(true);
  };

  const openEditAppt = (a: PlannerAppointment) => {
    setApptId(a.id); setApptTitle(a.title); setApptWhen(toLocalInput(a.time)); setApptLocation(a.location || '');
    setApptNotes(a.notes || ''); setApptRemind(a.reminderMinutesBefore ?? null); setApptRepeat(a.repeat ?? null); setApptColor(a.color || null);
    setApptOpen(true);
  };

  const saveAppt = async () => {
    const title = apptTitle.trim();
    const when = new Date(apptWhen);
    if (!title || isNaN(when.getTime())) return;
    const entry: PlannerAppointment = {
      id: apptId || uid(),
      title,
      time: when.getTime(),
      location: apptLocation.trim() || undefined,
      notes: apptNotes.trim() || undefined,
      reminderMinutesBefore: apptRemind ?? undefined,
      repeat: apptRepeat ?? undefined,
      color: apptColor ?? undefined,
      createdAt: apptId ? (planner.appointments.find(x => x.id === apptId)?.createdAt ?? Date.now()) : Date.now(),
    };
    await save({ ...planner, appointments: [...planner.appointments.filter(x => x.id !== entry.id), entry] });
    setApptOpen(false);
    setSelected(new Date(entry.time));
    setViewMonth(new Date(when.getFullYear(), when.getMonth(), 1));
  };

  const openNewRem = () => {
    setRemId(null); setRemTitle(''); setRemTimes([]); setRemNewTime(''); setRemNotes('');
    setRemRepeat('daily'); setRemStart(toLocalDateInput(selected.getTime()));
    setRemOpen(true);
  };

  const openEditRem = (r: PlannerReminder) => {
    setRemId(r.id); setRemTitle(r.title); setRemTimes([...r.times]); setRemNewTime(''); setRemNotes(r.notes || '');
    setRemRepeat(r.repeat || 'daily'); setRemStart(toLocalDateInput(r.startDate ?? r.createdAt));
    setRemOpen(true);
  };

  const addRemTime = () => {
    const v = remNewTime.trim();
    if (!isValidTimeHHMM(v) || remTimes.includes(v)) return;
    setRemTimes([...remTimes, v].sort());
    setRemNewTime('');
  };

  const saveRem = async () => {
    const title = remTitle.trim();
    if (!title || remTimes.length === 0) return;
    const startParsed = new Date(`${remStart}T00:00`);
    const startDay = isNaN(startParsed.getTime()) ? new Date() : startParsed;
    startDay.setHours(0, 0, 0, 0);
    const entry: PlannerReminder = {
      id: remId || uid(),
      title,
      times: remTimes,
      enabled: remId ? (planner.reminders.find(x => x.id === remId)?.enabled ?? true) : true,
      notes: remNotes.trim() || undefined,
      repeat: remRepeat,
      startDate: startDay.getTime(),
      createdAt: remId ? (planner.reminders.find(x => x.id === remId)?.createdAt ?? Date.now()) : Date.now(),
    };
    await save({ ...planner, reminders: [...planner.reminders.filter(x => x.id !== entry.id), entry] });
    setRemOpen(false);
  };

  const toggleRem = (r: PlannerReminder) =>
    save({ ...planner, reminders: planner.reminders.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x) });

  const repeatChips = (choices: (PlannerReminderRepeat | null)[], current: PlannerReminderRepeat | null, onPick: (v: any) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
      {choices.map(rep => {
        const label = rep == null ? t('planner.repeatOnce') : t(REPEAT_KEYS[rep]);
        const sel = current === rep;
        return (
          <button key={String(rep)} onClick={() => onPick(rep)} aria-pressed={sel}
            style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
              background: sel ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--bg)',
              border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
              color: sel ? 'var(--accent)' : 'var(--dim)' }}>
            {label}
          </button>
        );
      })}
    </div>
  );

  const formHeader = (title: string, onClose: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <button className="icon-btn" aria-label={t('common.back')} onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 18, cursor: 'pointer', padding: 4 }}>←</button>
      <h2 style={{ flex: 1, fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
    </div>
  );

  if (apptOpen) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 32 }}>
        {formHeader(apptId ? t('planner.editAppt') : t('planner.addAppt'), () => setApptOpen(false))}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <Field label={t('planner.apptTitlePlaceholder')} value={apptTitle} onChange={setApptTitle} placeholder={t('planner.apptTitlePlaceholder')} />
          <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 0 4px' }}>
            {t('planner.when')}
            <input className="field__input" aria-label={t('planner.when')} type="datetime-local" value={apptWhen} onChange={e => setApptWhen(e.target.value)} style={{ display: 'block', marginTop: 6, width: 220 }} />
          </label>
          <Field label={t('planner.locationPlaceholder')} value={apptLocation} onChange={setApptLocation} placeholder={t('planner.locationPlaceholder')} />
          <Field label={t('planner.notesPlaceholder')} value={apptNotes} onChange={setApptNotes} placeholder={t('planner.notesPlaceholder')} multiline />
          <Section label={t('planner.repeatLabel')} />
          {repeatChips(APPT_REPEAT_CHOICES, apptRepeat, setApptRepeat)}
          <Section label={t('planner.remindLabel')} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REMIND_CHOICES.map(c => {
              const sel = apptRemind === c.minutes;
              return (
                <button key={String(c.minutes)} onClick={() => setApptRemind(c.minutes)} aria-pressed={sel}
                  style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                    background: sel ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--bg)',
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    color: sel ? 'var(--accent)' : 'var(--dim)' }}>
                  {t(c.key)}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: apptColor || markColor, display: 'inline-block' }} />
            <span style={{ flex: 1, fontSize: 11, color: 'var(--dim)' }}>{t('planner.apptColor')}</span>
            {apptColor && (
              <button onClick={() => setApptColor(null)}
                style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--dim)' }}>
                {t('planner.apptColorDefault')}
              </button>
            )}
          </div>
          <ColorCarousel value={apptColor || markColor} onChange={setApptColor} size={22} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="ghost" onClick={() => setApptOpen(false)}>{t('common.cancel')}</Btn>
            <Btn onClick={saveAppt} disabled={!apptTitle.trim() || isNaN(new Date(apptWhen).getTime())}>{t('common.save')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (remOpen) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 32 }}>
        {formHeader(remId ? t('planner.editReminder') : t('planner.addReminder'), () => setRemOpen(false))}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <Field label={t('planner.reminderTitlePlaceholder')} value={remTitle} onChange={setRemTitle} placeholder={t('planner.reminderTitlePlaceholder')} />
          <Section label={t('planner.timesLabel')} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {remTimes.map(tm => (
              <button key={tm} onClick={() => setRemTimes(remTimes.filter(x => x !== tm))} aria-label={t('planner.removeTime', { time: tm })}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                {tm} <span aria-hidden style={{ color: 'var(--dim)', fontSize: 11 }}>✕</span>
              </button>
            ))}
          </div>
          <AddRow value={remNewTime} onChange={setRemNewTime} onAdd={addRemTime} placeholder="08:00" label={t('planner.addTime')} />
          <Section label={t('planner.repeatLabel')} />
          {repeatChips(REM_REPEAT_CHOICES, remRepeat, setRemRepeat)}
          {remRepeat !== 'daily' && (
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 0 4px' }}>
              {remRepeat === 'once' ? t('planner.onDateLabel') : t('planner.startingLabel')}
              <input className="field__input" aria-label={remRepeat === 'once' ? t('planner.onDateLabel') : t('planner.startingLabel')} type="date" value={remStart} onChange={e => setRemStart(e.target.value)} style={{ display: 'block', marginTop: 6, width: 180 }} />
            </label>
          )}
          <Field label={t('planner.notesPlaceholder')} value={remNotes} onChange={setRemNotes} placeholder={t('planner.notesPlaceholder')} multiline />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="ghost" onClick={() => setRemOpen(false)}>{t('common.cancel')}</Btn>
            <Btn onClick={saveRem} disabled={!remTitle.trim() || remTimes.length === 0}>{t('common.save')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 32 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <Btn onClick={openNewAppt} style={{ flex: 1 }} aria-label={t('planner.addAppt')}>+ {t('planner.appt')}</Btn>
        <Btn onClick={openNewRem} style={{ flex: 1 }} aria-label={t('planner.addReminder')}>+ {t('planner.reminder')}</Btn>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <button className="icon-btn" aria-label={t('planner.prevMonth')} onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', padding: 8 }}>‹</button>
          <h3 aria-live="polite" style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{monthLabel}</h3>
          <button className="icon-btn" aria-label={t('planner.nextMonth')} onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', padding: 8 }}>›</button>
        </div>
        <div role="group" aria-label={monthLabel} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {weekdayInitials.map((w, i) => (
            <div key={`w${i}`} aria-hidden style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>{w}</div>
          ))}
          {grid.map((d, i) => {
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const isSel = dayKey(d) === dayKey(selected);
            const isToday = dayKey(d) === dayKey(today);
            const dayList = apptsOn(d);
            const count = dayList.length;
            const dots = Array.from(new Set(dayList.map(a => a.color || markColor))).slice(0, 3);
            const label = `${d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}${count > 0 ? `, ${t('planner.apptCount', { count })}` : ''}`;
            return (
              <button key={i} onClick={() => { setSelected(new Date(d)); if (!inMonth) setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                aria-label={label} aria-pressed={isSel}
                style={{ aspectRatio: '1', borderRadius: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                  background: isSel ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'transparent',
                  border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                  color: inMonth ? (isSel ? 'var(--accent)' : 'var(--text)') : 'var(--muted)',
                  fontSize: 12, fontWeight: isSel ? 700 : 400 }}>
                {d.getDate()}
                {count > 0 && (
                  <span aria-hidden style={{ display: 'flex', gap: 2 }}>
                    {dots.map(c => <span key={c} style={{ width: 6, height: 6, borderRadius: 3, background: c, display: 'inline-block' }} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button onClick={() => setMarkPickerOpen(v => !v)} aria-expanded={markPickerOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', background: 'none', border: 'none', borderTopStyle: 'solid', cursor: 'pointer', color: 'var(--dim)', fontSize: 11 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: markColor, display: 'inline-block' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{t('planner.markColor')}</span>
          <span aria-hidden>{markPickerOpen ? '▲' : '▼'}</span>
        </button>
        {markPickerOpen && (
          <div style={{ marginTop: 8 }}>
            <ColorCarousel value={markColor} onChange={hex => save({ ...plannerRef.current, markColor: hex })} size={22} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0 8px' }}>
        <h3 aria-live="polite" style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{selectedLabel}</h3>
      </div>
      {dayAppts.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{t('planner.emptyDay')}</div>
      ) : dayAppts.map(a => {
        const meta = [
          a.repeat ? t(REPEAT_KEYS[a.repeat]) : null,
          a.reminderMinutesBefore != null ? t(REMIND_CHOICES.find(c => c.minutes === a.reminderMinutesBefore)?.key || 'planner.remindAtTime') : null,
        ].filter(Boolean) as string[];
        return (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `4px solid ${a.color || markColor}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div aria-hidden style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', width: 52 }}>{hhmmOf(a.time)}</div>
          <button onClick={() => openEditAppt(a)} aria-label={[hhmmOf(a.time), a.title, a.location, ...meta].filter(Boolean).join(', ')}
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.title}</div>
            {(a.location || a.notes) ? <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{[a.location, a.notes].filter(Boolean).join(' · ')}</div> : null}
            {meta.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                {[
                  a.repeat ? `↻ ${t(REPEAT_KEYS[a.repeat])}` : null,
                  a.reminderMinutesBefore != null ? `🔔 ${t(REMIND_CHOICES.find(c => c.minutes === a.reminderMinutesBefore)?.key || 'planner.remindAtTime')}` : null,
                ].filter(Boolean).join('  ·  ')}
              </div>
            )}
          </button>
          <button className="icon-btn" aria-label={`${t('common.delete')}, ${a.title}`} onClick={() => setDeleteAppt(a)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 15, cursor: 'pointer', padding: 8 }}>✕</button>
        </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0 8px' }}>
        <h3 style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('planner.reminders')}</h3>
      </div>
      {sortedRems.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('planner.emptyReminders')}</div>
      ) : sortedRems.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 8, opacity: r.enabled ? 1 : 0.55 }}>
          <button onClick={() => openEditRem(r)} aria-label={`${r.title}, ${t(REPEAT_KEYS[r.repeat || 'daily'])}, ${r.times.join(', ')}`}
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.title}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{`↻ ${t(REPEAT_KEYS[r.repeat || 'daily'])}  ·  ${r.times.join('  ·  ')}`}</div>
            {r.notes ? <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.notes}</div> : null}
          </button>
          <Toggle value={r.enabled} onChange={() => toggleRem(r)} label={`${r.enabled ? t('planner.disableReminder') : t('planner.enableReminder')}, ${r.title}`} />
          <button className="icon-btn" aria-label={`${t('common.delete')}, ${r.title}`} onClick={() => setDeleteRem(r)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 15, cursor: 'pointer', padding: 8 }}>✕</button>
        </div>
      ))}

      <ConfirmDialog
        open={!!deleteAppt}
        title={t('planner.deleteAppt')}
        message={deleteAppt?.title || ''}
        danger
        onConfirm={() => { const a = deleteAppt!; setDeleteAppt(null); save({ ...planner, appointments: planner.appointments.filter(x => x.id !== a.id) }); }}
        onCancel={() => setDeleteAppt(null)}
      />
      <ConfirmDialog
        open={!!deleteRem}
        title={t('planner.deleteReminder')}
        message={deleteRem?.title || ''}
        danger
        onConfirm={() => { const r = deleteRem!; setDeleteRem(null); save({ ...planner, reminders: planner.reminders.filter(x => x.id !== r.id) }); }}
        onCancel={() => setDeleteRem(null)}
      />
    </div>
  );
}
