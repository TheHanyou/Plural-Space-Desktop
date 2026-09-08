import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MedicalData, Medication, MedicalAppointment, MedicalHistoryEntry, EmergencyInfo,
  DEFAULT_MEDICAL, time12to24, fmtClockHHMM, uses12HourClock, dayPeriodLabel, uid, fmtTime,
} from '../utils';
import { store, KEYS } from '../storage';
import { Btn, Toggle, ConfirmDialog, clickable } from '../components/ui';

interface Props { onUpdate?: () => void; }

export default function MedicalView({ onUpdate }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<MedicalData>(DEFAULT_MEDICAL);
  const [confirmDel, setConfirmDel] = useState<{ kind: 'med' | 'appt' | 'hist'; id: string } | null>(null);

  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medTime, setMedTime] = useState('');
  const [medAmPm, setMedAmPm] = useState<'AM' | 'PM'>('AM');
  const [medTimes, setMedTimes] = useState<string[]>([]);
  const [timeErr, setTimeErr] = useState(false);

  const [apptTitle, setApptTitle] = useState('');
  const [apptWhen, setApptWhen] = useState('');
  const [apptRemind, setApptRemind] = useState(0);

  const [histTitle, setHistTitle] = useState('');
  const [histWhen, setHistWhen] = useState('');

  useEffect(() => {
    store.get<MedicalData>(KEYS.medical, DEFAULT_MEDICAL).then(d => setData({ ...DEFAULT_MEDICAL, ...(d || {}) }));
  }, []);

  const save = async (next: MedicalData) => {
    setData(next);
    await store.set(KEYS.medical, next);
    onUpdate?.();
  };

  const twelveHour = uses12HourClock();

  const time24 = (raw: string): string | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((raw || '').trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  const addMedTime = () => {
    const v = twelveHour ? time12to24(medTime, medAmPm) : time24(medTime);
    if (!v) { setTimeErr(true); return; }
    if (!medTimes.includes(v)) setMedTimes([...medTimes, v].sort());
    setMedTime(''); setTimeErr(false);
  };

  const addMedication = () => {
    if (!medName.trim()) return;
    const med: Medication = { id: uid(), name: medName.trim(), dosage: medDose.trim() || undefined, times: medTimes, enabled: true, createdAt: Date.now() };
    save({ ...data, medications: [...data.medications, med] });
    setMedName(''); setMedDose(''); setMedTimes([]); setMedTime('');
  };

  const toggleMed = (id: string) => save({ ...data, medications: data.medications.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m) });

  const addAppointment = () => {
    if (!apptTitle.trim() || !apptWhen) return;
    const appt: MedicalAppointment = { id: uid(), title: apptTitle.trim(), time: new Date(apptWhen).getTime(), reminderMinutesBefore: apptRemind || undefined, createdAt: Date.now() };
    save({ ...data, appointments: [...data.appointments, appt].sort((a, b) => a.time - b.time) });
    setApptTitle(''); setApptWhen(''); setApptRemind(0);
  };

  const addHistory = () => {
    if (!histTitle.trim()) return;
    const h: MedicalHistoryEntry = { id: uid(), title: histTitle.trim(), date: histWhen ? new Date(histWhen).getTime() : undefined, createdAt: Date.now() };
    save({ ...data, history: [...data.history, h] });
    setHistTitle(''); setHistWhen('');
  };

  const setEmergency = (patch: Partial<EmergencyInfo>) => save({ ...data, emergency: { ...data.emergency, ...patch } });

  const doDelete = () => {
    if (!confirmDel) return;
    if (confirmDel.kind === 'med') save({ ...data, medications: data.medications.filter(m => m.id !== confirmDel.id) });
    else if (confirmDel.kind === 'appt') save({ ...data, appointments: data.appointments.filter(a => a.id !== confirmDel.id) });
    else save({ ...data, history: data.history.filter(h => h.id !== confirmDel.id) });
    setConfirmDel(null);
  };

  const sectionHead = (txt: string): React.CSSProperties => ({ fontSize: 13, fontFamily: 'var(--font-display)', color: 'var(--accent)', margin: '0 0 10px' });
  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={card}>
        <h3 style={sectionHead('')}>{t('medical.medications')}</h3>
        {data.medications.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('medical.noMedications')}</p>}
        {data.medications.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <input type="checkbox" checked={m.enabled} onChange={() => toggleMed(m.id)} aria-label={m.name} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{m.name}{m.dosage ? ` · ${m.dosage}` : ''}</div>
              {m.times.length > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.times.map(fmtClockHHMM).join(', ')}</div>}
            </div>
            <button onClick={() => setConfirmDel({ kind: 'med', id: m.id })} aria-label={`${t('common.delete')} ${m.name}`} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 12 }}>
          <input className="field__input" value={medName} onChange={e => setMedName(e.target.value)} aria-label={t('medical.namePlaceholder')} placeholder={t('medical.namePlaceholder')} style={{ flex: 2, minWidth: 120 }} />
          <input className="field__input" value={medDose} onChange={e => setMedDose(e.target.value)} aria-label={t('medical.dosagePlaceholder')} placeholder={t('medical.dosagePlaceholder')} style={{ flex: 1, minWidth: 80 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input className={`field__input ${timeErr ? 'field__input--error' : ''}`} value={medTime} onChange={e => { setMedTime(e.target.value); setTimeErr(false); }}
            onKeyDown={e => { if (e.key === 'Enter') addMedTime(); }} aria-label={t('medical.timeHint')} placeholder={twelveHour ? '9:00' : '14:00'} style={{ width: 70 }} />
          {twelveHour && (
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['AM', 'PM'] as const).map(ap => (
                <button key={ap} onClick={() => setMedAmPm(ap)} aria-pressed={medAmPm === ap}
                  style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: medAmPm === ap ? 'var(--accent)' : 'transparent', color: medAmPm === ap ? '#0a0508' : 'var(--dim)' }}>{dayPeriodLabel(ap === 'PM')}</button>
              ))}
            </div>
          )}
          <Btn variant="ghost" onClick={addMedTime}>{t('medical.addTime')}</Btn>
          {medTimes.map(tm => (
            <span key={tm} style={{ fontSize: 11, background: 'var(--surface)', color: 'var(--text)', padding: '2px 8px', borderRadius: 999, cursor: 'pointer' }}
              {...clickable(() => setMedTimes(medTimes.filter(x => x !== tm)), `${t('common.remove')} ${fmtClockHHMM(tm)}`)}>{fmtClockHHMM(tm)} ✕</span>
          ))}
          <div style={{ flex: 1 }} />
          <Btn variant="solid" onClick={addMedication}>{t('medical.addMedication')}</Btn>
        </div>
        {timeErr && <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{t('medical.invalidTime')}</p>}
      </div>

      <div style={card}>
        <h3 style={sectionHead('')}>{t('medical.appointments')}</h3>
        {data.appointments.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('medical.noAppointments')}</p>}
        {data.appointments.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtTime(a.time)}</div>
            </div>
            <button onClick={() => setConfirmDel({ kind: 'appt', id: a.id })} aria-label={`${t('common.delete')} ${a.title}`} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 12 }}>
          <input className="field__input" value={apptTitle} onChange={e => setApptTitle(e.target.value)} aria-label={t('medical.apptPlaceholder')} placeholder={t('medical.apptPlaceholder')} style={{ flex: 1, minWidth: 120 }} />
          <input className="field__input" aria-label={t('medical.apptPlaceholder')} type="datetime-local" value={apptWhen} onChange={e => setApptWhen(e.target.value)} style={{ width: 200 }} />
          <select className="field__input" value={apptRemind} onChange={e => setApptRemind(Number(e.target.value))} aria-label={t('medical.remindBefore')} title={t('medical.remindBefore')} style={{ width: 130 }}>
            <option value={0}>{t('medical.atTime')}</option>
            <option value={15}>15m</option>
            <option value={30}>{t('medical.remind30m')}</option>
            <option value={60}>{t('medical.remind1h')}</option>
            <option value={1440}>{t('medical.remind1d')}</option>
          </select>
          <Btn variant="solid" onClick={addAppointment}>{t('medical.addAppointment')}</Btn>
        </div>
      </div>

      <div style={card}>
        <h3 style={sectionHead('')}>{t('medical.history')}</h3>
        {data.history.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('medical.noHistory')}</p>}
        {data.history.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{h.title}</div>
              {h.date && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtTime(h.date)}</div>}
            </div>
            <button onClick={() => setConfirmDel({ kind: 'hist', id: h.id })} aria-label={`${t('common.delete')} ${h.title}`} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 12 }}>
          <input className="field__input" value={histTitle} onChange={e => setHistTitle(e.target.value)} aria-label={t('medical.historyPlaceholder')} placeholder={t('medical.historyPlaceholder')} style={{ flex: 1, minWidth: 120 }} />
          <input className="field__input" aria-label={t('medical.historyPlaceholder')} type="date" value={histWhen} onChange={e => setHistWhen(e.target.value)} style={{ width: 160 }} />
          <Btn variant="solid" onClick={addHistory}>{t('medical.addHistory')}</Btn>
        </div>
      </div>

      <div style={card}>
        <h3 style={sectionHead('')}>{t('medical.emergency')}</h3>
        <label className="field__label">{t('medical.conditions')}</label>
        <input className="field__input" value={data.emergency.conditions || ''} onChange={e => setEmergency({ conditions: e.target.value })} aria-label={t('medical.conditionsPlaceholder')} placeholder={t('medical.conditionsPlaceholder')} style={{ marginBottom: 10 }} />
        <label className="field__label">{t('medical.allergies')}</label>
        <input className="field__input" value={data.emergency.allergies || ''} onChange={e => setEmergency({ allergies: e.target.value })} aria-label={t('medical.allergiesPlaceholder')} placeholder={t('medical.allergiesPlaceholder')} style={{ marginBottom: 10 }} />
        <label className="field__label">{t('medical.bloodType')}</label>
        <input className="field__input" value={data.emergency.bloodType || ''} onChange={e => setEmergency({ bloodType: e.target.value })} aria-label={t('medical.bloodType')} placeholder={t('medical.bloodTypePlaceholder')} style={{ marginBottom: 12 }} />
        <Toggle label={t('medical.showOnNotification')} description={t('medical.emergencyDesc')}
          value={data.emergency.showOnNotification} onChange={v => setEmergency({ showOnNotification: v })} />
      </div>

      <ConfirmDialog open={!!confirmDel} title={t('common.delete')} message={t('medical.deleteItemMsg')}
        danger onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
