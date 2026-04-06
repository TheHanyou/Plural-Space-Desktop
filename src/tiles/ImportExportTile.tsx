import React from 'react';

interface Props {
  onClick: () => void;
}

export default function ImportExportTile({ onClick }: Props) {
  return (
    <div className="tile" onClick={onClick}>
      <div className="tile__header">
        <div className="tile__glyph">⇅</div>
        <span className="tile__title">Import / Export</span>
      </div>
      <div className="tile__body">
        <div className="tile__stat-row">
          <span className="tile__stat-label">Backup</span>
          <span className="tile__stat-value" style={{ color: 'var(--accent)' }}>Export →</span>
        </div>
        <div className="tile__stat-row">
          <span className="tile__stat-label">Restore</span>
          <span className="tile__stat-value" style={{ color: 'var(--accent)' }}>Import →</span>
        </div>
        <div className="tile__stat-row">
          <span className="tile__stat-label">Simply Plural</span>
          <span className="tile__stat-value" style={{ color: 'var(--accent)' }}>Import →</span>
        </div>
        <div className="tile__stat-row">
          <span className="tile__stat-label">PluralKit</span>
          <span className="tile__stat-value" style={{ color: 'var(--accent)' }}>Import →</span>
        </div>
      </div>
    </div>
  );
}
