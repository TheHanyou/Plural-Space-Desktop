import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { JournalEntry, JournalTemplate, Member, uid, fmtDate, fmtTime, memberMatchesSearch } from '../utils';
import { store, KEYS } from '../storage';
import { Btn, Field, Section, Modal, ConfirmDialog, clickable } from '../components/ui';
import { useAppStore } from '../store/appStore';

interface Props {
  onUpdate: () => void;
}

type TabId = 'entries' | 'templates';

export default function JournalView({ onUpdate }: Props) {
  const { t } = useTranslation();
  const journal = useAppStore(s => s.state.journal);
  const members = useAppStore(s => s.state.members);
  const [tab, setTab] = useState<TabId>('entries');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [authorIds, setAuthorIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');

  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<JournalTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplTags, setTplTags] = useState<string[]>([]);
  const [tplTagInput, setTplTagInput] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  useEffect(() => {
    store.get<JournalTemplate[]>(KEYS.journalTemplates, []).then(tpls => setTemplates(tpls || []));
  }, []);

  const getMember = (id: string) => members.find(m => m.id === id);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    journal.forEach(e => e.hashtags?.forEach(t => set.add(t)));
    return [...set].sort();
  }, [journal]);

  const sorted = useMemo(() => {
    return [...journal]
      .sort((a, b) => b.timestamp - a.timestamp)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      .filter(e => {
        if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.body.toLowerCase().includes(search.toLowerCase())) return false;
        if (tagFilter && !(e.hashtags || []).includes(tagFilter)) return false;
        if (authorFilter && !(e.authorIds || []).includes(authorFilter)) return false;
        return true;
      });
  }, [journal, search, tagFilter, authorFilter]);

  const togglePin = async (entry: JournalEntry, ev: React.MouseEvent) => {
    ev.stopPropagation();
    const updated = journal.map(e => e.id === entry.id ? { ...e, pinned: !e.pinned } : e);
    await store.set(KEYS.journal, updated);
    onUpdate();
  };

  const openNew = () => {
    setTitle(''); setBody(''); setHashtags([]); setAuthorIds([]); setTagInput('');
    setIsNew(true); setViewMode(false);
    setEditing({ id: uid(), title: '', body: '', authorIds: [], hashtags: [], timestamp: Date.now() });
  };

  const openNewFromTemplate = (tpl: JournalTemplate) => {
    setTitle(tpl.title);
    setBody(tpl.body);
    setHashtags(tpl.hashtags || []);
    setAuthorIds([]);
    setTagInput('');
    setIsNew(true);
    setViewMode(false);
    setEditing({ id: uid(), title: tpl.title, body: tpl.body, authorIds: [], hashtags: tpl.hashtags || [], timestamp: Date.now() });
    setShowTemplatePicker(false);
  };

  const openEdit = (e: JournalEntry) => {
    setTitle(e.title); setBody(e.body); setHashtags(e.hashtags || []); setAuthorIds(e.authorIds || []); setTagInput('');
    setIsNew(false); setViewMode(true); setEditing(e);
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
      pinned: editing?.pinned,
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

  const openNewTemplate = () => {
    setTplName(''); setTplTitle(''); setTplBody(''); setTplTags([]); setTplTagInput('');
    setIsNewTemplate(true);
    setEditingTemplate({ id: uid(), name: '', title: '', body: '', hashtags: [], createdAt: Date.now() });
  };

  const openEditTemplate = (tpl: JournalTemplate) => {
    setTplName(tpl.name); setTplTitle(tpl.title); setTplBody(tpl.body); setTplTags(tpl.hashtags || []); setTplTagInput('');
    setIsNewTemplate(false);
    setEditingTemplate(tpl);
  };

  const addTplTag = () => {
    const raw = tplTagInput.trim().replace(/^#/, '').toLowerCase();
    if (raw && !tplTags.includes(`#${raw}`)) setTplTags([...tplTags, `#${raw}`]);
    setTplTagInput('');
  };

  const saveTemplate = async () => {
    if (!tplName.trim()) return;
    const tpl: JournalTemplate = {
      id: editingTemplate?.id || uid(),
      name: tplName.trim(),
      title: tplTitle,
      body: tplBody,
      hashtags: tplTags,
      createdAt: editingTemplate?.createdAt || Date.now(),
    };
    const updated = isNewTemplate
      ? [...templates, tpl]
      : templates.map(x => x.id === tpl.id ? tpl : x);
    setTemplates(updated);
    await store.set(KEYS.journalTemplates, updated);
    setEditingTemplate(null);
  };

  const deleteTemplate = async (id: string) => {
    const updated = templates.filter(x => x.id !== id);
    setTemplates(updated);
    await store.set(KEYS.journalTemplates, updated);
    setConfirmDeleteTemplate(null);
    setEditingTemplate(null);
  };

  const authorMatch = (m: Member) => !m.archived && !m.isCustomFront && !m.deleted && memberMatchesSearch(m, authorSearch);
  const filteredAuthors = members.filter(m => !m.isFacet && authorMatch(m));
  const filteredFacetAuthors = members.filter(m => m.isFacet && authorMatch(m));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {(['entries', 'templates'] as TabId[]).map(id => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: tab === id ? 600 : 400, cursor: 'pointer',
            color: tab === id ? 'var(--accent)' : 'var(--dim)', background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
          }}>
            {id === 'entries' ? t('journal.entriesTab', { defaultValue: 'Entries' }) : t('journal.templatesTab', { defaultValue: 'Templates' })}
          </button>
        ))}
      </div>

      {tab === 'entries' && (<>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input className="field__input" value={search} onChange={e => setSearch(e.target.value)}
            aria-label={t('common.searchEntries')} placeholder={t('common.searchEntries')} style={{ flex: 1, minWidth: 200 }} />

          <select style={{
            background: 'var(--surface)', color: tagFilter ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13,
          }} aria-label={t('common.filterByTag')} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
            <option value="">{t('journal.allTags')}</option>
            {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>

          <select style={{
            background: 'var(--surface)', color: authorFilter ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13,
          }} aria-label={t('common.filterByAuthor')} value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}>
            <option value="">{t('common.allAuthors')}</option>
            {members.some(m => !m.archived && !m.isFacet) && (
              <optgroup label={t('members.title')}>
                {members.filter(m => !m.archived && !m.isFacet).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
            {members.some(m => !m.archived && m.isFacet) && (
              <optgroup label={t('members.facets')}>
                {members.filter(m => !m.archived && m.isFacet).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
          </select>

          {templates.length > 0 && (
            <Btn variant="ghost" onClick={() => setShowTemplatePicker(true)}>{t('journal.fromTemplate', { defaultValue: 'From template…' })}</Btn>
          )}
          <Btn variant="solid" onClick={openNew}>{t('journal.newEntry', { defaultValue: '+ New Entry' })}</Btn>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(entry => (
            <div key={entry.id} className="tile" style={{
              minHeight: 'auto', padding: 16, cursor: 'pointer',
              ...(entry.pinned ? { background: 'color-mix(in srgb, var(--accent) 8%, var(--card))', borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--border))' } : {}),
            }}
              {...clickable(() => openEdit(entry))}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{entry.pinned ? '📌 ' : ''}{entry.title}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {fmtDate(entry.timestamp)}
                  </span>
                  <button onClick={ev => togglePin(entry, ev)} aria-label={entry.pinned ? t('noteboard.unpin') : t('noteboard.pin')} aria-pressed={!!entry.pinned} title={entry.pinned ? t('noteboard.unpin') : t('noteboard.pin')} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 12,
                    filter: entry.pinned ? 'none' : 'grayscale(1) opacity(0.5)',
                  }}>📌</button>
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
      </>)}

      {tab === 'templates' && (<>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, flex: 1, marginRight: 12 }}>
            {t('journal.templateHint', { defaultValue: 'Pre-fill from a saved template?' })}
          </p>
          <Btn variant="solid" onClick={openNewTemplate}>{t('journal.newTemplate', { defaultValue: '+ New Template' })}</Btn>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(tpl => (
            <div key={tpl.id} className="tile" style={{ minHeight: 'auto', padding: 16, cursor: 'pointer' }}
              {...clickable(() => openEditTemplate(tpl))}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tpl.name}</span>
              </div>
              {tpl.title && (
                <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 4 }}>
                  {tpl.title}
                </div>
              )}
              {tpl.body && (
                <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 6,
                  overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {tpl.body.replace(/<[^>]+>/g, '').slice(0, 200)}
                </p>
              )}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                {(tpl.hashtags || []).map(tag => (
                  <span key={tag} style={{ fontSize: 10, color: 'var(--info)', background: 'var(--info-bg)', padding: '1px 6px', borderRadius: 999 }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {templates.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
            {t('journal.noTemplates', { defaultValue: 'No templates yet. Create one to pre-fill new entries.' })}
          </div>
        )}
      </>)}

      <Modal open={!!editing} title={viewMode ? t('modal.viewEntry') : isNew ? t('modal.newEntry') : t('modal.editEntry')} onClose={() => setEditing(null)}
        footer={viewMode ? (
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
            <Btn variant="solid" onClick={() => setViewMode(false)}>{t('common.edit')}</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div>{!isNew && <Btn variant="danger" onClick={() => setConfirmDelete(editing?.id || '')}>{t('common.delete')}</Btn>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Btn>
              <Btn variant="solid" onClick={saveEntry}>{t('common.save')}</Btn>
            </div>
          </div>
        )}>
        {viewMode ? (<>
          <div style={{ fontSize: 20, fontWeight: 600, fontStyle: 'italic', color: 'var(--text)', marginBottom: 4 }}>
            {title || t('common.untitled')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>{fmtTime(editing?.timestamp || Date.now())}</div>
          {body && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {body.replace(/<[^>]+>/g, '')}
            </div>
          )}
          {hashtags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {hashtags.map(tag => (
                <span key={tag} style={{ fontSize: 12, color: 'var(--info)', background: 'var(--info-bg)', padding: '4px 9px', borderRadius: 999, border: '1px solid var(--border)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {authorIds.length > 0 && (<>
            <Section label={t('modal.authors')} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {authorIds.map(id => {
                const m = getMember(id);
                if (!m) return null;
                return (
                  <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: `${m.color}20`, border: `1px solid ${m.color}50`, fontSize: 12, color: m.color }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                    {m.name}
                  </span>
                );
              })}
            </div>
          </>)}
        </>) : (<>
        <Field label={t('modal.entryTitle')} value={title} onChange={setTitle} placeholder={t('modal.entryTitlePlaceholder')} />

        <Field label={t('modal.body')} value={body} onChange={setBody} placeholder={t('modal.writeHere')} multiline />

        <Section label={t('modal.authors')} />
        <input className="field__input" value={authorSearch} onChange={e => setAuthorSearch(e.target.value)}
          aria-label={t('members.search')} placeholder={t('members.search')} style={{ marginBottom: 8 }} />
        {filteredAuthors.length > 0 && <label className="field__label">{t('members.title')}</label>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: filteredFacetAuthors.length > 0 ? 8 : 14 }}>
          {filteredAuthors.slice(0, 12).map(m => {
            const active = authorIds.includes(m.id);
            return (
              <button key={m.id} className="chip" aria-pressed={active} style={{
                borderColor: active ? `${m.color}60` : 'var(--border)',
                background: active ? `${m.color}20` : 'var(--surface)',
              }} onClick={() => toggleAuthor(m.id)}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                <span style={{ color: active ? m.color : 'var(--dim)' }}>{m.name}</span>
                {active && <span aria-hidden style={{ fontWeight: 700, color: m.color }}>✓</span>}
              </button>
            );
          })}
        </div>
        {filteredFacetAuthors.length > 0 && (
          <>
            <label className="field__label">{t('members.facets')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {filteredFacetAuthors.slice(0, 12).map(m => {
                const active = authorIds.includes(m.id);
                return (
                  <button key={m.id} className="chip" aria-pressed={active} style={{
                    borderColor: active ? `${m.color}60` : 'var(--border)',
                    background: active ? `${m.color}20` : 'var(--surface)',
                  }} onClick={() => toggleAuthor(m.id)}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                    <span style={{ color: active ? m.color : 'var(--dim)' }}>{m.name}</span>
                    {active && <span aria-hidden style={{ fontWeight: 700, color: m.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <Section label={t('modal.tags')} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {hashtags.map(tag => (
            <button key={tag} className="chip" aria-label={`${t('common.remove')} ${tag}`} style={{ borderColor: 'var(--info)40', background: 'var(--info-bg)' }}
              onClick={() => setHashtags(hashtags.filter(t => t !== tag))}>
              <span style={{ color: 'var(--info)' }}>{tag}</span>
              <span className="chip__x" aria-hidden>✕</span>
            </button>
          ))}
        </div>
        <div className="add-row">
          <input className="field__input" value={tagInput} onChange={e => setTagInput(e.target.value)}
            aria-label={t('modal.topic')} placeholder={t('modal.topic')} onKeyDown={e => { if (e.key === 'Enter') addTag(); }} />
          <Btn onClick={addTag}>{t('common.add')}</Btn>
        </div>
        </>)}
      </Modal>

      <Modal open={!!editingTemplate} title={isNewTemplate ? t('journal.newTemplate', { defaultValue: 'New Template' }) : t('journal.editTemplate', { defaultValue: 'Edit Template' })} onClose={() => setEditingTemplate(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div>{!isNewTemplate && <Btn variant="danger" onClick={() => setConfirmDeleteTemplate(editingTemplate?.id || '')}>{t('common.delete')}</Btn>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setEditingTemplate(null)}>{t('common.cancel')}</Btn>
              <Btn variant="solid" onClick={saveTemplate}>{t('common.save')}</Btn>
            </div>
          </div>
        }>
        <Field label={t('journal.templateName', { defaultValue: 'Template Name *' })} value={tplName} onChange={setTplName} placeholder={t('journal.templateNamePlaceholder', { defaultValue: 'e.g. Morning Pages' })} />
        <Field label={t('journal.templateTitle', { defaultValue: 'Entry Title (preset)' })} value={tplTitle} onChange={setTplTitle} placeholder={t('modal.entryTitlePlaceholder')} />
        <Field label={t('journal.templateBody', { defaultValue: 'Entry Body (preset)' })} value={tplBody} onChange={setTplBody} placeholder={t('modal.writeHere')} multiline />
        <Section label={t('modal.tags')} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {tplTags.map(tag => (
            <button key={tag} className="chip" aria-label={`${t('common.remove')} ${tag}`} style={{ borderColor: 'var(--info)40', background: 'var(--info-bg)' }}
              onClick={() => setTplTags(tplTags.filter(t => t !== tag))}>
              <span style={{ color: 'var(--info)' }}>{tag}</span>
              <span className="chip__x" aria-hidden>✕</span>
            </button>
          ))}
        </div>
        <div className="add-row">
          <input className="field__input" value={tplTagInput} onChange={e => setTplTagInput(e.target.value)}
            aria-label={t('modal.topic')} placeholder={t('modal.topic')} onKeyDown={e => { if (e.key === 'Enter') addTplTag(); }} />
          <Btn onClick={addTplTag}>{t('common.add')}</Btn>
        </div>
      </Modal>

      <Modal open={showTemplatePicker} title={t('journal.pickTemplate', { defaultValue: 'Pick a template' })} onClose={() => setShowTemplatePicker(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(tpl => (
            <button key={tpl.id} onClick={() => openNewFromTemplate(tpl)} style={{
              padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{tpl.name}</div>
              {tpl.title && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{tpl.title}</div>}
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title={t('journal.deleteEntry')} message={t('journal.areYouSure')}
        danger onConfirm={() => confirmDelete && deleteEntry(confirmDelete)} onCancel={() => setConfirmDelete(null)} />

      <ConfirmDialog open={!!confirmDeleteTemplate} title={t('journal.editTemplate', { defaultValue: 'Delete Template' })} message={t('journal.areYouSure')}
        danger onConfirm={() => confirmDeleteTemplate && deleteTemplate(confirmDeleteTemplate)} onCancel={() => setConfirmDeleteTemplate(null)} />
    </div>
  );
}
