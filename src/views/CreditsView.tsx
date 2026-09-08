import React from 'react';
import { useTranslation } from 'react-i18next';

interface Credit {
  name: string;
  role: string;
  url: string;
}

export default function CreditsView() {
  const { t } = useTranslation();
  const credits: Credit[] = [
    {
      name: 'The Loud House System',
      role: t('hub.creditLogo', { defaultValue: 'Plural Star Logo' }),
      url: 'https://x.com/theloudhousesys?s=21',
    },
    {
      name: 'sparklecatdev',
      role: t('hub.creditIos', { defaultValue: 'Plural Star iOS Port' }),
      url: 'https://github.com/sparklecatdev',
    },
  ];

  return (
    <div className="credits-view">
      {credits.map((c, i) => (
        <a
          key={i}
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="credit-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px',
            marginBottom: '10px',
            borderRadius: '14px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-card)',
            textDecoration: 'none',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span aria-hidden style={{ fontSize: '22px', color: 'var(--color-accent)', marginRight: '14px' }}>✦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{c.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-dim)', marginTop: '2px' }}>{c.role}</div>
          </div>
          <span aria-hidden style={{ fontSize: '14px', color: 'var(--color-dim)', marginLeft: '8px' }}>↗</span>
        </a>
      ))}
    </div>
  );
}
