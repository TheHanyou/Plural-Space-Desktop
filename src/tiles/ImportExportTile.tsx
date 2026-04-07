import React from 'react';
import { useTranslation } from 'react-i18next';

interface Props { onClick: () => void; }

export default function ImportExportTile({ onClick }: Props) {
  const { t } = useTranslation();
  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header"><div className="tile__glyph">⇅</div><span className="tile__title">{t('hub.importExport')}</span></div>
      <div className="tile__body">
        <div className="tile__stat-row"><span className="tile__stat-label">{t('share.backup')}</span><span className="tile__stat-value" style={{ color: 'var(--accent)' }}>{t('share.export')} →</span></div>
        <div className="tile__stat-row"><span className="tile__stat-label">{t('share.restoreBackup')}</span><span className="tile__stat-value" style={{ color: 'var(--accent)' }}>{t('share.import')} →</span></div>
        <div className="tile__stat-row"><span className="tile__stat-label">{t('share.simplyPlural')}</span><span className="tile__stat-value" style={{ color: 'var(--accent)' }}>{t('share.import')} →</span></div>
      </div>
    </div>
  );
}
