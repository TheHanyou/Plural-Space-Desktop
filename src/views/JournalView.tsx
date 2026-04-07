import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, JournalEntry, uid, fmtTime, fmtDate } from '../utils';
import { store, KEYS } from '../storage';
import { Btn, Field, Section, Modal, ConfirmDialog } from '../components/ui';

interface Props {
  journal: JournalEntry[];
  members: Member[];
  onUpdate: () => void;
}

export default function JournalView({ journal, members, onUpdate }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Editor state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [authorIds, setAuthorIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');

  const getMember = (id: string) => members.find(m => m.id === id);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    journal.forEach(e => e.hashtags?.forEach(t => set.add(t)));
    return [...set].sort();
  }, [journal]);

  const sorted = useMemo(() => {
    return [...journal]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter(e => {
        if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.body.toLowerCase().includes(search.toLowerCase())) return false;
        if (tagFilter && !(e.hashtags || []).includes(tagFilter)) return false;
        if (authorFilter && !(e.authorIds || []).includes(authorFilter)) return false;
        return true;
      });
  }, [journal, search, tagFilter, authorFilter]);

  const openNew = () => {
    setTitle(''); setBody(''); setHashtags([]); setAuthorIds([]); setTagInput('');
    setIsNew(true); setEditing({ id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now() });
  };

  const openEdit = (e: JournalEntry) => {
    setTitle(e.title); setBody(e.body); setHashtags(e.hashtags || []); setAuthorIds(e.authorIds || []); setTagInput('');
    setIsNew(false); setEditing(e);
  };

  const addTag = () => {
    const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (raw && !hashtags.includes(`#${raw}`)) setHashtags([...hashtags, `#${raw}`]);
    setTagInput('');
  };

  const toggleAuthor = (id: string) => {
    setAuthorIds(authorIds.includes(id) ? authorIds.filter(a => a !== id) : [...authorIds, id]);
  };

  const saveEntry = async () => {
    if (!title.trim()) return;
    const entry: JournalEntry = {
      id: editing?.id || uid(),
      title: title.trim(),
      body,
      authorIds,
      hashtags,
      timestamp: editing?.timestamp || Date.now(),
      password: editing?.password,
    };
    const updated = isNew
      ? [...journal, entry]
      : journal.map(e => e.id === entry.id ? entry : e);
    await store.set(KEYS.journal, updated);
    setEditing(null);
    onUpdate();
  };

  const deleteEntry = async (id: string) => {
    await store.set(KEYS.journal, journal.filter(e => e.id !== id));
    setConfirmDelete(null);
    setEditing(null);
    onUpdate();
  };

  const filteredAuthors = members.filter(m => !m.archived && (!authorSearch || m.name.toLowerCase().includes(authorSearch.toLowerCase())));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="field__input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search entries..." style={{ flex: 1, minWidth: 200 }} />

        {/* Tag filter dropdown */}
        <select style={{
          background: 'var(--surface)', color: tagFilter ? 'var(--accent)' : 'var(--muted)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13,
        }} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>

        {/* Author filter dropdown */}
        <select style={{
          background: 'var(--surface)', color: authorFilter ? 'var(--accent)' : 'var(--muted)',
          border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13,
        }} value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}>
          <option value="">All authors</option>
          {members.filter(m => !m.archived).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <Btn variant="solid" onClick={openNew}>+ New Entry</Btn>
      </div>

      {/* Entry List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(entry => (
          <div key={entry.id} className="tile" style={{ minHeight: 'auto', padding: 16, cursor: 'pointer' }}
            onClick={() => openEdit(entry)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{entry.title}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                {fmtDate(entry.timestamp)}
              </span>
            </div>
            {entry.body && (
              <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {entry.body.replace(/<[^>]+>/g, '').slice(0, 200)}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {(entry.authorIds || []).map(id => {
                const m = getMember(id);
                return m ? (
                  <span key={id} style={{ fontSize: 11, color: m.color }}>{m.name}</span>
                ) : null;
              })}
              {(entry.hashtags || []).map(tag => (
                <span key={tag} style={{ fontSize: 10, color: 'var(--info)', background: 'var(--info-bg)', padding: '1px 6px', borderRadius: 999 }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          {search || tagFilter || authorFilter ? t('journal.noEntriesFilter') : t('journal.noEntries')}
        </div>
      )}

      {/* Editor Modal */}
      <Modal open={!!editing} title={isNew ? t('modal.newEntry') : t('modal.editEntry')} onClose={() => setEditing(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div>{!isNew && <Btn variant="danger" onClick={() => setConfirmDelete(editing?.id || '')}>{t('common.delete')}</Btn>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Btn>
              <Btn variant="solid" onClick={saveEntry}>{t('common.save')}</Btn>
            </div>
          </div>
        }>
        <Field label={t('modal.entryTitle')} value={title} onChange={setTitle} placeholder={t('modal.entryTitlePlaceholder')} />

        {/* Body — plain textarea for now, Tiptap integration next */}
        <Field label={t('modal.body')} value={body} onChange={setBody} placeholder={t('modal.writeHere')} multiline />

        {/* Authors */}
        <Section label={t('modal.authors')} />
        <input className="field__input" value={authorSearch} onChange={e => setAuthorSearch(e.target.value)}
          placeholder={t('members.search')} style={{ marginBottom: 8 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {filteredAuthors.slice(0, 12).map(m => {
            const active = authorIds.includes(m.id);
            return (
              <button key={m.id} className="chip" style={{
                borderColor: active ? `${m.color}60` : 'var(--border)',
                background: active ? `${m.color}20` : 'var(--surface)',
              }} onClick={() => toggleAuthor(m.id)}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                <span style={{ color: active ? m.color : 'var(--dim)' }}>{m.name}</span>
                {active && <span style={{ fontWeight: 700, color: m.color }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Tags */}
        <Section label={t('modal.tags')} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {hashtags.map(tag => (
            <button key={tag} className="chip" style={{ borderColor: 'var(--info)40', background: 'var(--info-bg)' }}
              onClick={() => setHashtags(hashtags.filter(t => t !== tag))}>
              <span style={{ color: 'var(--info)' }}>{tag}</span>
              <span className="chip__x">✕</span>
            </button>
          ))}
        </div>
        <div className="add-row">
          <input className="field__input" value={tagInput} onChange={e => setTagInput(e.target.value)}
            placeholder={t('modal.topic')} onKeyDown={e => { if (e.key === 'Enter') addTag(); }} />
          <Btn onClick={addTag}>{t('common.add')}</Btn>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title={t('journal.deleteEntry')} message={t('journal.areYouSure')}
        danger onConfirm={() => confirmDelete && deleteEntry(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
