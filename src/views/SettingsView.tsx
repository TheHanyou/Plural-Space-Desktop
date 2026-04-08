import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Toggle, Dropdown, Section, ChipList, AddRow, Btn } from '../components/ui';
import { SystemInfo, AppSettings, TextScale, TEXT_SCALE_OPTIONS, isValidHex, normalizeHex } from '../utils';
import { CustomPalette, BUILTIN_PALETTES, deriveTheme, applyThemeToDOM, applyTextScale, PALETTE } from '../theme';
import { store, KEYS } from '../storage';
import { SUPPORTED_LANGUAGES, changeLanguage } from '../i18n/i18n';
import type { SupportedLanguage } from '../i18n/i18n';

interface Props {
  system: SystemInfo;
  settings: AppSettings;
  palettes: CustomPalette[];
  onUpdate: () => void;
}

const HexField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => {
  const valid = isValidHex(normalizeHex(value)) || value.length < 2;
  return (
    <div style={{ flex: 1 }}>
      <label className="field__label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: 4, background: valid ? normalizeHex(value) : '#333', border: '1px solid var(--border)' }} />
        <input className={`field__input field__input--mono ${valid ? '' : 'field__input--error'}`}
          value={value} onChange={e => onChange(e.target.value)} placeholder="#000000" maxLength={7}
          style={{ width: '100%' }} />
      </div>
    </div>
  );
};

const LANG_NAMES: Record<string, string> = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
  pt: 'Português', fi: 'Suomi', nb: 'Norsk',
};

export default function SettingsView({ system, settings, palettes, onUpdate }: Props) {
  const { t } = useTranslation();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [name, setName] = useState(system.name);
  const [desc, setDesc] = useState(system.description);
  const [journalPw, setJournalPw] = useState(system.journalPassword || '');
  const [showPw, setShowPw] = useState(!!system.journalPassword);

  const [locs, setLocs] = useState(settings.locations);
  const [moods, setMoods] = useState(settings.customMoods);
  const [newLoc, setNewLoc] = useState('');
  const [newMood, setNewMood] = useState('');
  const [lang, setLang] = useState<SupportedLanguage>(settings.language);
  const [notif, setNotif] = useState(settings.notificationsEnabled);
  const [textScale, setTextScale] = useState<TextScale>(settings.textScale);
  const [activePaletteId, setActivePaletteId] = useState(settings.activePaletteId);

  // Palette editor
  const [editPalette, setEditPalette] = useState<CustomPalette | null>(null);
  const [palName, setPalName] = useState('');
  const [palBg, setPalBg] = useState('');
  const [palAccent, setPalAccent] = useState('');
  const [palText, setPalText] = useState('');
  const [palMid, setPalMid] = useState('');

  const userPalettes = palettes || [];
  const allPalettes = [...BUILTIN_PALETTES, ...userPalettes];

  const addLoc = () => {
    const v = newLoc.trim();
    if (v && !locs.includes(v)) { setLocs([...locs, v]); setNewLoc(''); }
  };

  const addMood = () => {
    const v = newMood.trim();
    if (v && !moods.includes(v)) { setMoods([...moods, v]); setNewMood(''); }
  };

  const selectPalette = async (id: string) => {
    setActivePaletteId(id);
    const p = allPalettes.find(p => p.id === id) || BUILTIN_PALETTES[0];
    const theme = deriveTheme(p.bg, p.accent, p.text, p.mid);
    applyThemeToDOM(theme);
    // Persist immediately — without this, any onUpdate() reload reverts the theme
    await store.set(KEYS.settings, { ...settings, activePaletteId: id });
  };

  const startEditPalette = (p: CustomPalette) => {
    setEditPalette(p); setPalName(p.name); setPalBg(p.bg); setPalAccent(p.accent); setPalText(p.text); setPalMid(p.mid);
  };

  const startNewPalette = () => {
    const p: CustomPalette = { id: Date.now().toString(36), name: '', bg: '#0A1F2E', accent: '#DAA520', text: '#C0C0C0', mid: '#7A8A99' };
    startEditPalette(p);
  };

  const savePaletteEdit = async () => {
    if (!editPalette || !palName.trim()) {
      setSaveStatus('Palette name is required');
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }
    const updated: CustomPalette = {
      id: editPalette.id, name: palName.trim(),
      bg: isValidHex(normalizeHex(palBg)) ? normalizeHex(palBg) : editPalette.bg,
      accent: isValidHex(normalizeHex(palAccent)) ? normalizeHex(palAccent) : editPalette.accent,
      text: isValidHex(normalizeHex(palText)) ? normalizeHex(palText) : editPalette.text,
      mid: isValidHex(normalizeHex(palMid)) ? normalizeHex(palMid) : editPalette.mid,
    };
    const existing = userPalettes.find(p => p.id === updated.id);
    const newList = existing ? userPalettes.map(p => p.id === updated.id ? updated : p) : [...userPalettes, updated];
    try {
      await store.set(KEYS.palettes, newList);
      setEditPalette(null);
      setSaveStatus('Palette saved');
      setTimeout(() => setSaveStatus(null), 3000);
      onUpdate();
    } catch (e: any) {
      console.error('Palette save error:', e);
      setSaveStatus('Error saving palette');
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  const deletePalette = async (id: string) => {
    const newList = userPalettes.filter(p => p.id !== id);
    await store.set(KEYS.palettes, newList);
    if (activePaletteId === id) selectPalette('__dark__');
    onUpdate();
  };

  const save = async () => {
    try {
      await store.set(KEYS.system, {
        name: name.trim(), description: desc.trim(),
        journalPassword: showPw && journalPw ? journalPw : undefined,
      });
      await store.set(KEYS.settings, {
        ...settings, locations: locs, customMoods: moods, language: lang,
        notificationsEnabled: notif, textScale, activePaletteId,
      });
      changeLanguage(lang);
      applyTextScale(textScale);
      onUpdate();
      setSaveStatus('Settings saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e: any) {
      console.error('Settings save error:', e);
      setSaveStatus('Error saving settings');
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };


  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* System Info */}
      <Section label={t('modal.systemName')} />
      <Field label={t('modal.systemName')} value={name} onChange={setName} placeholder={t('modal.systemNamePlaceholder')} />
      <Field label={t('modal.descriptionLabel')} value={desc} onChange={setDesc} placeholder={t('modal.descriptionFieldPlaceholder')} multiline />

      {/* Palette */}
      <Section label={t('modal.palette')} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {allPalettes.map(p => {
          const isActive = activePaletteId === p.id;
          const isBuiltin = p.id.startsWith('__');
          const preview = deriveTheme(p.bg, p.accent, p.text, p.mid);
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 8, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              background: isActive ? 'var(--accent-bg)' : 'var(--surface)', cursor: 'pointer',
            }} onClick={() => selectPalette(p.id)}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[preview.bg, preview.accent, preview.text, preview.surface].map((c, i) => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                ))}
              </div>
              <span style={{ flex: 1, fontSize: 13, color: isActive ? 'var(--accent)' : 'var(--text)', fontWeight: isActive ? 600 : 400 }}>
                {p.name}
              </span>
              {isActive && <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>}
              {!isBuiltin && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn--ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={e => { e.stopPropagation(); startEditPalette(p); }}>✎</button>
                  <button className="btn btn--danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={e => { e.stopPropagation(); deletePalette(p.id); }}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editPalette ? (
        <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14 }}>
          <Field label={t('modal.paletteName')} value={palName} onChange={setPalName} placeholder="My Theme" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <HexField label={t('modal.palBg')} value={palBg} onChange={setPalBg} />
            <HexField label={t('modal.palAccent')} value={palAccent} onChange={setPalAccent} />
            <HexField label={t('modal.palText')} value={palText} onChange={setPalText} />
            <HexField label={t('modal.palMid')} value={palMid} onChange={setPalMid} />
          </div>
          {isValidHex(normalizeHex(palBg)) && isValidHex(normalizeHex(palAccent)) && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: normalizeHex(palBg), border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, color: normalizeHex(palAccent), fontWeight: 600 }}>{t('modal.palPreviewAccent')} </span>
              <span style={{ fontSize: 13, color: normalizeHex(palText) }}>{t('modal.palPreviewText')}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn variant="ghost" onClick={() => setEditPalette(null)}>{t('common.cancel')}</Btn>
            <Btn onClick={savePaletteEdit}>{t('common.save')}</Btn>
          </div>
        </div>
      ) : (
        userPalettes.length < 10 && (
          <Btn variant="ghost" onClick={startNewPalette}>+ {t('modal.newPalette')}</Btn>
        )
      )}
      <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{t('modal.paletteSlots', { used: userPalettes.length, max: 10 })}</p>

      {/* Journal Password */}
      <Section label={t('modal.globalJournalPassword')} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t('modal.lockJournal')}</span>
        <Btn variant={showPw ? 'danger' : 'primary'} onClick={() => { setShowPw(!showPw); if (showPw) setJournalPw(''); }}>
          {showPw ? t('common.remove') : t('common.add')}
        </Btn>
      </div>
      {showPw && <Field value={journalPw} onChange={setJournalPw} placeholder={t('modal.lockJournal')} type="password" />}

      {/* Toggles */}
      <Toggle label={t('modal.notifications')} description={t('modal.notificationsDesc')} value={notif} onChange={setNotif} />

      {/* Language */}
      <Section label={t('modal.language')} />
      <Dropdown
        value={lang}
        options={[...SUPPORTED_LANGUAGES]}
        onChange={setLang}
        renderOption={v => t(`language.${v}`)}
      />

      {/* Text Scale */}
      <Section label={t('modal.textSize')} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {TEXT_SCALE_OPTIONS.map(opt => (
          <button key={opt.value}
            className={`btn ${textScale === opt.value ? 'btn--primary' : 'btn--ghost'}`}
            style={{ flex: 1 }}
            onClick={() => setTextScale(opt.value)}>
            {t(`modal.textScale${opt.label.replace(/\s/g, '')}`)}
          </button>
        ))}
      </div>

      {/* Locations */}
      <Section label={t('modal.locations')} />
      <ChipList items={locs} onRemove={l => setLocs(locs.filter(x => x !== l))} color="var(--accent)" />
      <AddRow value={newLoc} onChange={setNewLoc} onAdd={addLoc} placeholder={t('modal.addLocationPlaceholder')} />

      {/* Custom Moods */}
      <Section label={t('modal.customMoods')} />
      <ChipList items={moods} onRemove={m => setMoods(moods.filter(x => x !== m))} color="var(--info)" />
      <AddRow value={newMood} onChange={setNewMood} onAdd={addMood} placeholder={t('modal.addMoodPlaceholder')} />

      {/* Support */}
      <div style={{ textAlign: 'center', padding: '24px 0', borderTop: '1px solid var(--border)', marginTop: 20 }}>
        <Btn variant="solid" onClick={() => window.open('https://www.buymeacoffee.com/PluralSpace', '_blank')}>
          ☕ {t('modal.supportPS')}
        </Btn>
      </div>

      {/* Save */}
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
        {saveStatus && (
          <div style={{
            padding: '8px 14px', marginBottom: 8, borderRadius: 8, fontSize: 13, textAlign: 'center',
            background: saveStatus.startsWith('Error') || saveStatus.startsWith('Palette name') ? 'var(--danger-bg)' : 'var(--success-bg)',
            color: saveStatus.startsWith('Error') || saveStatus.startsWith('Palette name') ? 'var(--danger)' : 'var(--success)',
            border: `1px solid ${saveStatus.startsWith('Error') || saveStatus.startsWith('Palette name') ? 'var(--danger)' : 'var(--success)'}`,
          }}>
            {saveStatus}
          </div>
        )}
        <Btn variant="solid" onClick={save} className="btn--full">{t('common.save')}</Btn>
      </div>
    </div>
  );
}
