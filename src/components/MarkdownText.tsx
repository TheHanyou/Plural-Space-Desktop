import React from 'react';
import i18n from '../i18n/i18n';
import type { Member } from '../utils';

const MENTION_RE = /@\[([^\]]+)\]\(member:([a-zA-Z0-9_-]+)\)/;
const IMAGE_URL_RE = /https?:\/\/\S+\.(?:gif|png|pnj|jpe?g|webp|bmp|svg)(?:[?#]\S*)?/i;
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/;

const isValidImageUri = (u: unknown): u is string => {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  if (!s) return false;
  return /^https?:\/\//i.test(s) || /^file:\/\//i.test(s) || s.startsWith('data:image/');
};

const Img = ({ uri }: { uri: string }) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [uri]);
  if (failed) {
    return <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{i18n.t('markdown.imageUnavailable', { defaultValue: '[image unavailable]' })}</span>;
  }
  return <img src={uri} alt="" style={{ display: 'block', maxWidth: 300, maxHeight: 300, borderRadius: 8, margin: '2px 0' }} onError={() => setFailed(true)} />;
};

const renderInline = (text: string, members?: Member[]): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  const patterns: [RegExp, (m: RegExpMatchArray) => React.ReactNode][] = [
    [new RegExp(MENTION_RE.source), m => {
      const member = members?.find(mb => mb.id === m[2]);
      const displayName = member?.name || m[1];
      return <span key={key++} style={{ color: member?.color || 'var(--muted)', textDecoration: 'underline' }}>@{displayName}</span>;
    }],
    [/\*\*\*(.+?)\*\*\*/, m => <strong key={key++} style={{ fontStyle: 'italic', color: 'var(--text)' }}>{m[1]}</strong>],
    [/\*\*(.+?)\*\*/, m => <strong key={key++} style={{ color: 'var(--text)' }}>{m[1]}</strong>],
    [/\*(.+?)\*/, m => <em key={key++}>{m[1]}</em>],
    [/~~(.+?)~~/, m => <s key={key++}>{m[1]}</s>],
    [/`(.+?)`/, m => <code key={key++} style={{ fontFamily: 'monospace', background: 'var(--surface)', padding: '0 4px', borderRadius: 3, fontSize: 12 }}>{m[1]}</code>],
    [new RegExp(MD_IMAGE_RE.source), m => {
      const url = m[2].replace(/[)]+$/, '').replace(/#\d+x\d+$/, '').trim();
      if (!isValidImageUri(url)) return <span key={key++} style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{i18n.t('markdown.brokenImage', { defaultValue: '[broken image]' })}</span>;
      return <Img key={key++} uri={url} />;
    }],
    [/\[(.+?)\]\((.+?)\)/, m => <a key={key++} href={m[2]} target="_blank" rel="noreferrer" style={{ color: 'var(--info)', textDecoration: 'underline' }}>{m[1]}</a>],
  ];
  while (remaining.length > 0) {
    let earliest: { idx: number; len: number; node: React.ReactNode } | null = null;
    for (const [re, fn] of patterns) {
      const m = remaining.match(re);
      if (m && m.index !== undefined) {
        if (!earliest || m.index < earliest.idx) earliest = { idx: m.index, len: m[0].length, node: fn(m) };
      }
    }
    if (!earliest) { parts.push(remaining); break; }
    if (earliest.idx > 0) parts.push(remaining.slice(0, earliest.idx));
    parts.push(earliest.node);
    remaining = remaining.slice(earliest.idx + earliest.len);
  }
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
};

const baseLine: React.CSSProperties = { fontSize: 13, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word', margin: 0 };

const renderLine = (line: string, i: number, members?: Member[]): React.ReactNode => {
  if (line.startsWith('### ')) return <p key={i} style={{ ...baseLine, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{renderInline(line.slice(4), members)}</p>;
  if (line.startsWith('## ')) return <p key={i} style={{ ...baseLine, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{renderInline(line.slice(3), members)}</p>;
  if (line.startsWith('# ')) return <p key={i} style={{ ...baseLine, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{renderInline(line.slice(2), members)}</p>;
  if (line.startsWith('> ')) return <div key={i} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, margin: '2px 0' }}><p style={{ ...baseLine, color: 'var(--dim)', fontStyle: 'italic' }}>{renderInline(line.slice(2), members)}</p></div>;
  if (line.startsWith('---') || line.startsWith('***')) return <hr key={i} style={{ border: 'none', height: 1, background: 'var(--border)', margin: '8px 0' }} />;
  if (line.match(/^[-*] /)) return <div key={i} style={{ display: 'flex', gap: 6, margin: '1px 0' }}><span aria-hidden style={{ ...baseLine, color: 'var(--dim)' }}>•</span><p style={{ ...baseLine, flex: 1 }}>{renderInline(line.slice(2), members)}</p></div>;
  if (line.match(/^\d+\. /)) { const m = line.match(/^(\d+)\. (.*)$/); return <div key={i} style={{ display: 'flex', gap: 6, margin: '1px 0' }}><span style={{ ...baseLine, color: 'var(--dim)', width: 16, textAlign: 'right', flexShrink: 0 }}>{m?.[1]}.</span><p style={{ ...baseLine, flex: 1 }}>{renderInline(m?.[2] || '', members)}</p></div>; }
  if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
  return <p key={i} style={baseLine}>{renderInline(line, members)}</p>;
};

export const MarkdownText = ({ text, members }: { text: string; members?: Member[] }) => {
  if (!text) return null;
  const mdText = text
    .replace(/<img\s[^>]*>/gi, tag => {
      const src = (tag.match(/src=["']([^"']+)["']/) || [])[1] || '';
      return src ? `![](${src})` : '';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  const lineSeparators = new RegExp('\\r\\n?|' + String.fromCharCode(0x2028) + '|' + String.fromCharCode(0x2029), 'g');
  const lines = mdText.replace(lineSeparators, '\n').split('\n');
  const elements: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    const urlMatch = line.match(IMAGE_URL_RE);
    if (urlMatch && !line.match(MD_IMAGE_RE) && isValidImageUri(urlMatch[0])) {
      const before = line.slice(0, line.indexOf(urlMatch[0])).trim();
      const after = line.slice(line.indexOf(urlMatch[0]) + urlMatch[0].length).trim();
      if (before) elements.push(renderLine(before, i * 3, members));
      elements.push(<Img key={i * 3 + 1} uri={urlMatch[0]} />);
      if (after) elements.push(renderLine(after, i * 3 + 2, members));
    } else {
      elements.push(renderLine(line, i, members));
    }
  });
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>{elements}</div>;
};
