import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MedicalData, DEFAULT_MEDICAL, fmtClockHHMM, fmtTime } from '../utils';
import { store, KEYS } from '../storage';

interface Props { onClick: () => void; }

export default function MedicalTile({ onClick }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<MedicalData>(DEFAULT_MEDICAL);
  useEffect(() => { store.get<MedicalData>(KEYS.medical, DEFAULT_MEDICAL).then(d => setData({ ...DEFAULT_MEDICAL, ...(d || {}) })); }, []);

  const meds = (data.medications || []).filter(m => m.enabled);
  const now = Date.now();
  const upcoming = (data.appointments || []).filter(a => a.time >= now).sort((a, b) => a.time - b.time);
  const e = data.emergency || { showOnNotification: false };
  const emergencyLine = [e.conditions, e.allergies, e.bloodType].map(x => (x || '').trim()).filter(Boolean).join(' · ');
  const empty = meds.length === 0 && upcoming.length === 0 && !emergencyLine;

  const sectionLabel: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 2 };
  const row: React.CSSProperties = { fontSize: 13, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'baseline' };

  return (
    <div className="tile tile--clickable" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}>
      <div className="tile__header"><div className="tile__glyph" aria-hidden>⚕</div><span className="tile__title">{t('medical.title')}</span></div>
      <div className="tile__body">
        {empty && <span className="tile__empty">{t('medical.noMedications')}</span>}

        {meds.length > 0 && (<>
          <div style={sectionLabel}>{t('medical.medications')}</div>
          {meds.slice(0, 3).map(m => (
            <div key={m.id} style={row}>
              <span aria-hidden>💊</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              {m.times.length > 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{m.times.map(fmtClockHHMM).join(', ')}</span>}
            </div>
          ))}
          {meds.length > 3 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('share.more', { count: meds.length - 3 })}</span>}
        </>)}

        {upcoming.length > 0 && (<>
          <div style={sectionLabel}>{t('medical.appointments')}</div>
          {upcoming.slice(0, 2).map(a => (
            <div key={a.id} style={row}>
              <span aria-hidden>📅</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtTime(a.time)}</span>
            </div>
          ))}
        </>)}

        {emergencyLine && (<>
          <div style={sectionLabel}>{t('medical.emergency')}</div>
          <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', gap: 6 }}>
            <span aria-hidden>⚠</span><span style={{ flex: 1 }}>{emergencyLine}</span>
          </div>
        </>)}
      </div>
    </div>
  );
}
