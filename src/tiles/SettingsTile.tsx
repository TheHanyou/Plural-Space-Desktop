import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppSettings } from '../utils';
import { BUILTIN_PALETTES } from '../theme';

interface Props { settings: AppSettings; onClick: () => void; }

export default function SettingsTile({ settings, onClick }: Props) {
  const { t } = useTranslation();
  const palette = BUILTIN_PALETTES.find(p => p.id === settings.activePaletteId);
  const paletteName = palette?.name || 'Custom';
  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header"><div className="tile__glyph">⚙</div><span className="tile__title">{t('modal.systemSettings')}</span></div>
      <div className="tile__body">
        <div className="tile__stat-row"><span className="tile__stat-label">{t('modal.palette')}</span><span className="tile__stat-value">{paletteName}</span></div>
        <div className="tile__stat-row"><span className="tile__stat-label">{t('modal.language')}</span><span className="tile__stat-value">{t(`language.${settings.language}`)}</span></div>
        <div className="tile__stat-row"><span className="tile__stat-label">{t('modal.textSize')}</span><span className="tile__stat-value">{settings.textScale}×</span></div>
        <div className="tile__stat-row"><span className="tile__stat-label">{t('modal.notifications')}</span><span className="tile__stat-value">{settings.notificationsEnabled ? 'On' : 'Off'}</span></div>
      </div>
    </div>
  );
}
