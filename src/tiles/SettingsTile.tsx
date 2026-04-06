import React from 'react';
import { AppSettings } from '../utils';
import { BUILTIN_PALETTES } from '../theme';

interface Props {
  settings: AppSettings;
  onClick: () => void;
}

export default function SettingsTile({ settings, onClick }: Props) {
  const palette = BUILTIN_PALETTES.find(p => p.id === settings.activePaletteId);
  const paletteName = palette?.name || 'Custom';

  const langNames: Record<string, string> = {
    en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
    pt: 'Português', fi: 'Suomi', nb: 'Norsk',
  };

  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header">
        <div className="tile__glyph">⚙</div>
        <span className="tile__title">Settings</span>
      </div>
      <div className="tile__body">
        <div className="tile__stat-row">
          <span className="tile__stat-label">Theme</span>
          <span className="tile__stat-value">{paletteName}</span>
        </div>
        <div className="tile__stat-row">
          <span className="tile__stat-label">Language</span>
          <span className="tile__stat-value">{langNames[settings.language] || settings.language}</span>
        </div>
        <div className="tile__stat-row">
          <span className="tile__stat-label">Text Scale</span>
          <span className="tile__stat-value">{settings.textScale}×</span>
        </div>
        <div className="tile__stat-row">
          <span className="tile__stat-label">Notifications</span>
          <span className="tile__stat-value">{settings.notificationsEnabled ? 'On' : 'Off'}</span>
        </div>
      </div>
    </div>
  );
}
