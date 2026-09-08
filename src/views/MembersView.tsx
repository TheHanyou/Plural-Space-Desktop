import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, MemberGroup, MemberSortMode, CustomFieldDef, CustomFieldValue, NoteboardEntry, AppSettings, FrontState, Relationship, RelationshipTypeDef, allRelationshipTypes, DEFAULT_REL_COLOR, uid, getInitials, sortMembers, fmtTime, getLocale, resizeBannerDataUrl, sortGroupsForDisplay, memberMatchesSearch, groupKind } from '../utils';
import { chooseImageTreatment } from '../components/ImageCropModal';
import { PALETTE, ensureReadable, initialOn } from '../theme';
import { store, KEYS } from '../storage';
import { Btn, Field, Toggle, Section, ChipList, AddRow, Modal, ConfirmDialog, Dropdown, clickable } from '../components/ui';
import { ColorCarousel } from '../components/ColorCarousel';
import { CustomHexEntry } from '../components/CustomHexEntry';
import { useAppStore } from '../store/appStore';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import SortableCard from '../components/SortableCard';

interface Props {
  onUpdate: () => void;
  archiveOnly?: boolean;
  focusMemberId?: string | null;
  onFocusHandled?: () => void;
  onShowOnMap?: (id: string) => void;
  onQuickFront?: (memberId: string, tier: 'primary' | 'coFront' | 'coConscious') => void;
  onRemoveFromFront?: (memberId: string) => void;
}

const descPreview = (d?: unknown) => String(d ?? '').split('\n').filter(l => l.trim()).join('\n');

export default function MembersView({ onUpdate, archiveOnly = false, focusMemberId, onFocusHandled, onShowOnMap, onQuickFront, onRemoveFromFront }: Props) {
  const members = useAppStore(s => s.state.members);
  const groups = useAppStore(s => s.state.groups);
  const settings = useAppStore(s => s.state.settings);
  const front = useAppStore(s => s.state.front);
  const { t } = useTranslation();
  const listFields = settings.memberListFields ?? { pronouns: true, roles: true, groups: false, descriptions: false };
  const [showFields, setShowFields] = useState(false);
  const saveListFields = async (next: NonNullable<AppSettings['memberListFields']>) => {
    await store.set(KEYS.settings, { ...settings, memberListFields: next });
    onUpdate();
  };
  const [editing, setEditing] = useState<Member | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [listView, setListView] = useState<'active' | 'customFronts' | 'facets'>('active');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<MemberSortMode>('alphabetical');
  const [reorderLocked, setReorderLocked] = useState(true);
  const [quickFrontFor, setQuickFrontFor] = useState<Member | null>(null);
  const [confirmRemoveFront, setConfirmRemoveFront] = useState<Member | null>(null);

  const isFronting = (id: string): boolean => !!front && (
    (front.primary?.memberIds || []).includes(id) ||
    (front.coFront?.memberIds || []).includes(id) ||
    (front.coConscious?.memberIds || []).includes(id)
  );
  const quickFrontEnabled = !!onQuickFront && !!onRemoveFromFront && !archiveOnly;

  const [f, setF] = useState<Member>({ id: '', name: '', pronouns: '', role: '', color: PALETTE[0], description: '' });
  const [showClone, setShowClone] = useState(false);
  const [cloneSel, setCloneSel] = useState({ name: true, pronouns: true, role: true, color: true, description: true });
  const [readMode, setReadMode] = useState(false);
  const [viewPfp, setViewPfp] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDef[]>([]);

  useEffect(() => {
    store.get<CustomFieldDef[]>(KEYS.customFieldDefs, []).then(defs => setFieldDefs(defs || []));
  }, []);

  type MemberTab = 'main' | 'fields' | 'connections' | 'noteboard';
  const [memberTab, setMemberTab] = useState<MemberTab>('main');
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipTypeDef[]>([]);
  useEffect(() => {
    store.get<Relationship[]>(KEYS.relationships, []).then(r => setRelationships(r || []));
    store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []).then(r => setRelTypes(r || []));
  }, []);

  const [allNotes, setAllNotes] = useState<NoteboardEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteAuthorId, setNoteAuthorId] = useState<string | null>(null);

  useEffect(() => {
    store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setAllNotes(n || []));
  }, []);

  const memberNotes = allNotes
    .filter(n => n.memberId === f.id)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });

  const saveNotes = async (updated: NoteboardEntry[]) => {
    setAllNotes(updated);
    await store.set(KEYS.noteboards, updated);
  };

  const addNote = () => {
    if (!noteText.trim() || !noteAuthorId) return;
    const entry: NoteboardEntry = { id: uid(), memberId: f.id, authorId: noteAuthorId, content: noteText.trim(), timestamp: Date.now() };
    saveNotes([...allNotes, entry]);
    setNoteText('');
  };

  const deleteNote = (id: string) => saveNotes(allNotes.filter(n => n.id !== id));
  const togglePin = (id: string) => saveNotes(allNotes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));

  const inState = (m: Member) => !m.deleted && archiveOnly === !!m.archived;
  const active = members.filter(m => inState(m) && !m.isCustomFront && !m.isFacet);
  const customFronts = members.filter(m => inState(m) && m.isCustomFront);
  const facets = members.filter(m => inState(m) && m.isFacet && !m.isCustomFront);
  const sorted = sortMembers(
    listView === 'customFronts' ? customFronts : listView === 'facets' ? facets : active,
    sortMode,
  );
  const filtered = sorted.filter(m =>
    memberMatchesSearch(m, search)
  );

  const canReorder = !archiveOnly && sortMode === 'manual' && !search;
  const reorderActive = canReorder && !reorderLocked;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async (e: DragEndEvent) => {
    const { active: dragged, over } = e;
    if (!over || dragged.id === over.id) return;
    const from = filtered.findIndex(m => m.id === dragged.id);
    const to = filtered.findIndex(m => m.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(filtered, from, to);
    const orderById = new Map(reordered.map((m, i) => [m.id, i]));
    const updated = members.map(m => (orderById.has(m.id) ? { ...m, sortOrder: orderById.get(m.id) } : m));
    await store.set(KEYS.members, updated);
    onUpdate();
  };

  const openNew = () => {
    const m: Member = { id: uid(), name: '', pronouns: '', role: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)], description: '', tags: [], groupIds: [], createdAt: Date.now(), isCustomFront: listView === 'customFronts', isFacet: listView === 'facets' };
    setF(m); setIsNew(true); setEditing(m); setTagInput(''); setMemberTab('main'); setNoteText('');
    setNoteAuthorId(members.find(mm => !mm.archived)?.id || null);
  };

  const openEdit = (m: Member) => {
    setF({ ...m, tags: m.tags || [], groupIds: m.groupIds || [] });
    setIsNew(false); setEditing(m); setTagInput(''); setMemberTab('main'); setNoteText(''); setReadMode(false);
    setNoteAuthorId(members.find(mm => !mm.archived)?.id || null);
  };

  useEffect(() => {
    if (focusMemberId) {
      const m = members.find(mm => mm.id === focusMemberId);
      if (m) openEdit(m);
      onFocusHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMemberId]);

  const set = (k: keyof Member, v: any) => setF(x => ({ ...x, [k]: v }));

  const addTag = () => {
    const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (!raw) return;
    setF(x => {
      const cur = x.tags || [];
      if (cur.includes(`#${raw}`)) return x;
      return { ...x, tags: [...cur, `#${raw}`] };
    });
    setTagInput('');
  };

  const toggleGroup = (gid: string) => {
    setF(x => {
      const cur = x.groupIds || [];
      return { ...x, groupIds: cur.includes(gid) ? cur.filter(id => id !== gid) : [...cur, gid] };
    });
  };

  const saveMember = async () => {
    if (!f.name.trim()) return;
    const updated = isNew
      ? [...members, f]
      : members.map(m => m.id === f.id ? f : m);
    await store.set(KEYS.members, updated);
    setEditing(null);
    onUpdate();
  };

  const doClone = async () => {
    const rnd = String(Math.floor(10000 + Math.random() * 90000));
    const clone: Member = {
      id: uid(),
      name: cloneSel.name && (f.name || '').trim() ? f.name : rnd,
      pronouns: cloneSel.pronouns ? (f.pronouns || '') : '',
      role: cloneSel.role ? (f.role || '') : '',
      color: cloneSel.color ? f.color : PALETTE[0],
      description: cloneSel.description ? (f.description || '') : '',
      tags: [],
      groupIds: [],
      createdAt: Date.now(),
      isFacet: f.isFacet || undefined,
    };
    setShowClone(false);
    await store.set(KEYS.members, [...members, clone]);
    setEditing(null);
    onUpdate();
  };

  const deleteMember = async (id: string) => {
    await store.set(KEYS.members, members.map(m => m.id === id ? { ...m, archived: true, deleted: true } : m));
    setConfirmDelete(null);
    setEditing(null);
    onUpdate();
  };

  const pickAvatar = async () => {
    const filePath = await window.electronAPI.dialog.openFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ]);
    if (!filePath) return;
    const dataUrl = await window.electronAPI.file.readAsBase64(filePath);
    if (!dataUrl) return;
    const chosen = await chooseImageTreatment(dataUrl);
    if (chosen) set('avatar', chosen);
  };

  const pickBanner = async () => {
    const filePath = await window.electronAPI.dialog.openFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ]);
    if (!filePath) return;
    const dataUrl = await window.electronAPI.file.readAsBase64(filePath);
    if (!dataUrl) return;
    const chosen = await chooseImageTreatment(dataUrl);
    if (!chosen) return;
    try {
      const resized = await resizeBannerDataUrl(chosen);
      set('banner', resized);
    } catch { set('banner', chosen); }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="field__input" value={search} onChange={e => setSearch(e.target.value)}
          aria-label={t('members.search')} placeholder={t('members.search')} style={{ flex: 1, minWidth: 140 }} />
        <Dropdown<MemberSortMode>
          value={sortMode}
          options={['alphabetical', 'reverse-alphabetical', 'age', 'color', 'role', 'manual']}
          onChange={setSortMode}
          renderOption={v => t(`memberSort.${v}`)}
        />
        {canReorder && (
          <button
            type="button"
            role="switch"
            aria-checked={!reorderLocked}
            aria-label={t('common.reorderLock', { defaultValue: 'Drag reordering' })}
            title={t('common.reorderLock', { defaultValue: 'Drag reordering' })}
            onClick={() => setReorderLocked(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, fontSize: 16, lineHeight: 1, opacity: reorderLocked ? 0.35 : 1 }}>
            🤏
          </button>
        )}
        <Btn variant={listView === 'active' ? 'info' : 'ghost'} onClick={() => setListView('active')}>
          {t('members.title')} ({active.length})
        </Btn>
        <Btn variant={listView === 'facets' ? 'info' : 'ghost'} onClick={() => setListView('facets')}>
          {t('members.facets')} ({facets.length})
        </Btn>
        <Btn variant={listView === 'customFronts' ? 'info' : 'ghost'} onClick={() => setListView('customFronts')}>
          {t('members.customFronts')} ({customFronts.length})
        </Btn>
        {!archiveOnly && (
          <Btn variant="solid" onClick={openNew}>{listView === 'customFronts' ? t('members.addCustomFront') : listView === 'facets' ? t('members.addFacet') : t('members.add')}</Btn>
        )}
        <div style={{ position: 'relative' }}>
          <Btn variant="ghost" onClick={() => setShowFields(v => !v)}>{t('members.displayFields')}</Btn>
          {showFields && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 30, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              {(['pronouns', 'roles', 'groups', 'descriptions'] as const).map(k => (
                <Toggle key={k} label={t(`members.field${k.charAt(0).toUpperCase()}${k.slice(1)}`)}
                  value={listFields[k] ?? false}
                  onChange={v => saveListFields({ ...listFields, [k]: v })} />
              ))}
              <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 600, margin: '10px 0 6px' }}>{t('members.cardBackground')}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['plain', t('members.bgPlain')], ['color', t('members.bgMemberColor')], ['banner', t('members.bgBanner')]] as ['plain' | 'color' | 'banner', string][]).map(([mode, label]) => {
                  const sel = (listFields.background || 'plain') === mode;
                  return (
                    <button key={mode} aria-pressed={sel}
                      onClick={() => saveListFields({ ...listFields, background: mode })}
                      style={{ flex: 1, padding: '7px 6px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                        background: sel ? 'var(--accent-bg)' : 'var(--surface)', color: sel ? 'var(--accent)' : 'var(--dim)',
                        border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, fontWeight: sel ? 600 : 400 }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={filtered.map(m => m.id)} strategy={rectSortingStrategy}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {filtered.map(m => (
          <SortableCard key={m.id} id={m.id} label={m.name} disabled={!reorderActive}>
          <div className="tile" style={{ minHeight: 'auto', padding: 14, cursor: 'pointer', position: 'relative', overflow: 'hidden',
            ...((listFields.background === 'color' || (listFields.background === 'banner' && !m.banner)) ? { background: `linear-gradient(${m.color}26, ${m.color}26), var(--card)` } : {}) }}
            {...clickable(() => openEdit(m), m.name)}>
            {listFields.background === 'banner' && m.banner && (
              <>
                <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url(${m.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'var(--card)', opacity: 0.78 }} />
              </>
            )}
            <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="tile__avatar" style={{
                width: 40, height: 40, fontSize: 14, overflow: 'hidden',
                ...(!m.avatar ? { backgroundColor: m.color, color: initialOn(m.color) } : {}),
              }}>
                {m.avatar ? <img src={m.avatar} alt="" style={{ width: 40, height: 40, borderRadius: 20, objectFit: 'cover' }} /> : getInitials(m.name)}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.name}</div>
                {(((listFields.pronouns && m.pronouns) || (listFields.roles && m.role))) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {[listFields.pronouns ? m.pronouns : '', listFields.roles ? m.role : ''].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              {quickFrontEnabled && !m.archived && (
                isFronting(m.id) ? (
                  <button
                    aria-label={`${t('members.removeFromFront')} — ${m.name}`}
                    title={t('members.removeFromFront')}
                    onClick={e => { e.stopPropagation(); setConfirmRemoveFront(m); }}
                    style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--danger-bg, transparent)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 15, lineHeight: 1 }}>
                    −
                  </button>
                ) : (
                  <button
                    aria-label={`${t('members.addToFront')} — ${m.name}`}
                    title={t('members.addToFront')}
                    onClick={e => { e.stopPropagation(); setQuickFrontFor(m); }}
                    style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 15, lineHeight: 1 }}>
                    ＋
                  </button>
                )
              )}
              <div style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
            </div>
            {listFields.descriptions && descPreview(m.description) && (
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {descPreview(m.description)}
              </div>
            )}
            {listFields.groups && (m.groupIds || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {sortGroupsForDisplay(groups.filter(g => (m.groupIds || []).includes(g.id)), groups).slice(0, 6).map(g => (
                  <span key={g!.id} title={g!.description || undefined} style={{ fontSize: 10, color: 'var(--text)', background: 'var(--surface)', border: `1px solid ${g!.color || 'var(--border)'}`, padding: '1px 6px', borderRadius: 999 }}>
                    {g!.name}
                  </span>
                ))}
              </div>
            )}
            {(m.tags || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {(m.tags || []).slice(0, 4).map(tag => (
                  <span key={tag} style={{ fontSize: 10, color: 'var(--info)', background: 'var(--info-bg)', padding: '1px 6px', borderRadius: 999 }}>
                    {tag}
                  </span>
                ))}
                {(m.tags || []).length > 4 && (
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{(m.tags || []).length - 4}</span>
                )}
              </div>
            )}
            </div>
          </div>
          </SortableCard>
        ))}
      </div>
      </SortableContext>
      </DndContext>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          {search ? t('members.noMembers') : archiveOnly ? (listView === 'customFronts' ? t('members.noArchivedCustomFronts') : listView === 'facets' ? t('members.noArchivedFacets') : t('members.noArchived')) : listView === 'customFronts' ? t('members.noCustomFronts') : listView === 'facets' ? t('members.noFacets') : t('members.noMembers')}
        </div>
      )}

      <Modal open={!!editing} title={isNew ? t('modal.addMember') : t('modal.editMember')} onClose={() => setEditing(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isNew && !readMode && (
                <Btn variant="danger" onClick={() => setConfirmDelete(f.id)}>{t('common.delete')}</Btn>
              )}
              {!isNew && !readMode && (
                <Btn variant="ghost" onClick={() => setShowClone(true)}>{t('members.clone')}</Btn>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setEditing(null)}>{readMode ? t('common.close') : t('common.cancel')}</Btn>
              {!readMode && <Btn variant="solid" onClick={saveMember}>{t('common.save')}</Btn>}
            </div>
          </div>
        }>
        {!isNew && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Btn variant="ghost" onClick={() => setReadMode(m => !m)}>{readMode ? t('common.edit') : t('modal.read')}</Btn>
          </div>
        )}
        {!isNew && !readMode && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
            {(['main', 'fields', 'connections', 'noteboard'] as MemberTab[]).map(tab => (
              <button key={tab} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: memberTab === tab ? 600 : 400, cursor: 'pointer',
                color: memberTab === tab ? 'var(--accent)' : 'var(--dim)', background: 'none', border: 'none',
                borderBottom: `2px solid ${memberTab === tab ? 'var(--accent)' : 'transparent'}`,
              }} onClick={() => setMemberTab(tab)}>
                {tab === 'main' ? t('modal.editMember')
                  : tab === 'fields' ? t('customFields.title')
                  : tab === 'connections' ? t('systemMap.connections')
                  : t('noteboard.title')}
              </button>
            ))}
          </div>
        )}

        {readMode && !isNew && (() => {
          const cardHex = (getComputedStyle(document.documentElement).getPropertyValue('--card') || '').trim() || '#0A1F2E';
          const mc = ensureReadable(f.color || '#DAA520', cardHex, 3);
          const activeGroups = sortGroupsForDisplay(groups.filter(g => (f.groupIds || []).includes(g.id)), groups);
          const visibleDefs = fieldDefs.filter(fd => {
            const vv = (f.customFields || []).find(c => c.fieldId === fd.id)?.value;
            return !(vv === undefined || vv === null || vv === '');
          });
          const allTypes = allRelationshipTypes(relTypes);
          const relTypeById = new Map(allTypes.map(ty => [ty.id, ty]));
          const relLabel = (id: string) => { const ty = relTypeById.get(id); return ty ? ((ty.preset && !ty.overridden) ? t(`relType.${ty.id}`, { defaultValue: ty.name }) : ty.name) : '?'; };
          const mine = relationships.filter(r => r.fromId === f.id || r.toId === f.id);
          const readVal = (fd: CustomFieldDef, val: string | number | boolean | null) => {
            if (fd.type === 'toggle') return <span style={{ fontSize: 14, color: val ? 'var(--accent)' : 'var(--muted)' }}>{val ? '✓' : '—'}</span>;
            if (fd.type === 'color') return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: String(val || '#333'), border: '1px solid var(--border)', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'monospace' }}>{String(val || '')}</span>
              </span>
            );
            if (fd.type === 'image') return <img src={String(val)} alt={fd.name} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />;
            if (fd.type === 'dateRange') { const [a, b] = String(val || '').split('|'); return <span style={{ fontSize: 13, color: 'var(--text)' }}>{[a, b].filter(Boolean).join(' – ')}</span>; }
            return <span style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{String(val)}</span>;
          };
          return (
            <div>
              {f.banner && (
                <div style={{ width: '100%', aspectRatio: '3 / 1', borderRadius: 8, overflow: 'hidden', marginBottom: 12,
                  backgroundImage: `url(${f.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                <div className="tile__avatar" style={{
                  width: 72, height: 72, borderRadius: 36, fontSize: 24, flexShrink: 0,
                  border: `2px solid ${f.color}`, overflow: 'hidden', cursor: f.avatar ? 'pointer' : 'default',
                  ...(!f.avatar ? { backgroundColor: f.color, color: initialOn(f.color) } : {}),
                }} {...(f.avatar ? clickable(() => setViewPfp(true), t('modal.viewPfp')) : {})}>
                  {f.avatar ? <img src={f.avatar} alt="" style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover' }} /> : getInitials(f.name || '?')}
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: mc }}>{f.name}</div>
                  {f.pronouns ? <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>{f.pronouns}</div> : null}
                  {f.role ? <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>{f.role}</div> : null}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <span aria-label={`${t('modal.color')}: ${f.color}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, border: `1px solid ${f.color}40`, background: 'var(--surface)' }}>
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 6, background: f.color, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block' }} />
                  <span aria-hidden style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'monospace' }}>{f.color}</span>
                </span>
              </div>

              {(f.tags || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                  {(f.tags || []).map(tag => (
                    <span key={tag} style={{ padding: '3px 9px', borderRadius: 999, background: `${f.color}18`, border: `1px solid ${f.color}40`, color: mc, fontSize: 11 }}>{tag}</span>
                  ))}
                </div>
              )}
              {activeGroups.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {activeGroups.map(g => (
                    <span key={g.id} title={g.description || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
                      border: `1px solid ${g.color || 'var(--accent)'}50`, background: `${g.color || 'var(--accent)'}20`, color: g.color || 'var(--accent)', fontSize: 11 }}>
                      <span aria-hidden style={{ width: 7, height: 7, borderRadius: groupKind(g) === 'subsystem' ? 1.5 : '50%', background: g.color || 'var(--accent)', display: 'inline-block' }} />
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {f.description ? (
                <>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: mc, fontWeight: 600, marginBottom: 6 }}>{t('modal.descriptionBio')}</div>
                  <div style={{ padding: 12, background: 'var(--surface)', border: `1px solid ${f.color}40`, borderRadius: 8, marginBottom: 14 }}>
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{f.description}</p>
                  </div>
                </>
              ) : null}

              {visibleDefs.length > 0 && (
                <>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: mc, fontWeight: 600, marginBottom: 8, borderTop: `1px solid ${f.color}40`, paddingTop: 14 }}>{t('customFields.title')}</div>
                  {visibleDefs.map((fd, i) => {
                    const val = (f.customFields || []).find(v => v.fieldId === fd.id)?.value ?? '';
                    return (
                      <div key={fd.id} style={{ marginBottom: 12, borderTop: i > 0 ? '1px solid var(--border)' : undefined, paddingTop: i > 0 ? 12 : undefined }}>
                        <div className="field__label">{fd.name}</div>
                        {readVal(fd, val)}
                      </div>
                    );
                  })}
                </>
              )}

              {(mine.length > 0 || onShowOnMap) && (
                <>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: mc, fontWeight: 600, marginBottom: 8, borderTop: `1px solid ${f.color}40`, paddingTop: 14 }}>{t('systemMap.connections')}</div>
                  {onShowOnMap && (
                    <Btn variant="ghost" onClick={() => onShowOnMap(f.id)}>{t('systemMap.showOnMap')}</Btn>
                  )}
                  {mine.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {mine.map(r => {
                        const otherId = r.fromId === f.id ? r.toId : r.fromId;
                        const other = members.find(m => m.id === otherId);
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: relTypeById.get(r.typeId)?.color || DEFAULT_REL_COLOR }} />
                            <span style={{ fontSize: 12, color: 'var(--dim)', minWidth: 70 }}>{relLabel(r.typeId)}</span>
                            <button onClick={() => other && openEdit(other)} disabled={!other}
                              style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--text)', background: 'none', border: 'none', cursor: other ? 'pointer' : 'default' }}>
                              {other?.name || '?'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {!readMode && (
        <fieldset disabled={readMode} style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 'auto' }}>
        {!isNew && !readMode && settings?.selfMemberId !== f.id && memberTab === 'main' && (
          <button
            onClick={() => {
              const toFacet = !f.isFacet;
              setF({ ...f, isFacet: toFacet, isCustomFront: toFacet ? false : f.isCustomFront });
            }}
            title={t('members.moveCategoryHint', { defaultValue: 'Keeps everything else about this profile. Facets are not counted as members.' })}
            style={{
              alignSelf: 'flex-start', marginBottom: 14, padding: '6px 12px', borderRadius: 999,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
            <span aria-hidden>{f.isFacet ? '↩ ' : '◈ '}</span>
            {f.isFacet
              ? t('members.makeMember', { defaultValue: 'Move to Members' })
              : t('members.makeFacet', { defaultValue: 'Move to Facets' })}
          </button>
        )}

        {(memberTab === 'main' || isNew) && (<>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="tile__avatar" style={{
              width: 72, height: 72, borderRadius: 36, fontSize: 24, margin: '0 auto', cursor: 'pointer',
              border: `2px solid ${f.color}`, overflow: 'hidden',
              ...(!f.avatar ? { backgroundColor: f.color, color: initialOn(f.color) } : {}),
            }} {...(readMode ? (f.avatar ? clickable(() => setViewPfp(true), t('modal.viewPfp')) : {}) : clickable(pickAvatar, t('modal.changePfp')))}>
              {f.avatar ? <img src={f.avatar} alt="" style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover' }} /> : getInitials(f.name || '?')}
            </div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 8 }}>
              <button aria-label={t('modal.changePfp', {defaultValue: 'Change profile picture'})} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={pickAvatar}>📷</button>
              {f.avatar && (
                <button aria-label={t('modal.viewPfp')} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setViewPfp(true)}>🔍 {t('modal.viewPfp')}</button>
              )}
              {f.avatar && (
                <button style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => set('avatar', undefined)}>{t('modal.removePfp')}</button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ width: '100%', aspectRatio: '3 / 1', borderRadius: 8, border: '1px dashed var(--border)', overflow: 'hidden', cursor: 'pointer',
              backgroundImage: f.banner ? `url(${f.banner})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center',
              backgroundColor: f.banner ? undefined : 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 12,
            }} {...(readMode ? {} : clickable(pickBanner, t('memberProfile.changeBanner')))}>
              {!f.banner && t('memberProfile.changeBanner')}
            </div>
            {f.banner && <button style={{ fontSize: 10, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}
              onClick={() => set('banner', undefined)}>{t('memberProfile.removeBanner')}</button>}
          </div>

          <Field label={t('modal.name')} value={f.name} onChange={v => set('name', v)} placeholder={f.isFacet ? t('modal.facetName') : t('modal.headmateName')} />
          <Field label={t('modal.nickname')} value={f.nickname || ''} onChange={v => set('nickname' as any, v || undefined)} placeholder={t('modal.nickname')} />
          <Field label={t('modal.pronouns')} value={f.pronouns} onChange={v => set('pronouns', v)} placeholder={t('modal.pronounsPlaceholder')} />
          <Field label={t('modal.role')} value={f.role} onChange={v => set('role', v)} placeholder={t('modal.rolePlaceholder')} />

          <Section label={t('modal.color')} />
          <ColorCarousel value={f.color} onChange={v => set('color', v)} />
          <CustomHexEntry value={f.color} onApply={v => set('color', v)} />

          {groups.length > 0 && (
            <>
              <Section label={t('memberGroups.title')} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                {sortGroupsForDisplay(groups, groups).map(g => {
                  const active = (f.groupIds || []).includes(g.id);
                  return (
                    <button key={g.id} className={`chip ${active ? '' : ''}`}
                      title={g.description || undefined}
                      aria-pressed={active}
                      style={{
                        borderColor: active ? `${g.color || 'var(--accent)'}50` : 'var(--border)',
                        background: active ? `${g.color || 'var(--accent)'}20` : 'var(--surface)',
                        color: active ? (g.color || 'var(--accent)') : 'var(--dim)',
                      }}
                      onClick={() => toggleGroup(g.id)}>
                      <span aria-hidden style={{ width: 7, height: 7, borderRadius: groupKind(g) === 'subsystem' ? 1.5 : '50%', background: g.color || 'var(--accent)', display: 'inline-block' }} />
                      {g.name}
                      {active && <span aria-hidden style={{ fontWeight: 700 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <Section label={t('modal.memberTags')} />
          <ChipList items={f.tags || []} onRemove={tag => setF(x => ({ ...x, tags: (x.tags || []).filter(t => t !== tag) }))} />
          <AddRow value={tagInput} onChange={setTagInput} onAdd={addTag} placeholder={t('modal.memberTagPlaceholder')} />

          <Section label={t('modal.descriptionBio')} />
          <Field value={f.description} onChange={v => set('description', v)} placeholder={t('modal.descriptionPlaceholder')} multiline />

          {!isNew && (
            <Toggle label={t('modal.archiveMember')} description={t('modal.archiveDesc')}
              value={!!f.archived} onChange={v => set('archived', v)} />
          )}
        </>)}

        {memberTab === 'fields' && !isNew && (
          <div>
            {fieldDefs.length > 0 ? (
              fieldDefs.map((fd, fdIdx) => {
                const cfv = (f.customFields || []).find(v => v.fieldId === fd.id);
                const val = cfv?.value ?? '';
                const setFieldVal = (newVal: string | number | boolean | null) => {
                  const existing = f.customFields || [];
                  const updated = existing.some(v => v.fieldId === fd.id)
                    ? existing.map(v => v.fieldId === fd.id ? { ...v, value: newVal } : v)
                    : [...existing, { fieldId: fd.id, value: newVal }];
                  set('customFields' as any, updated);
                };
                return (
                  <div key={fd.id} style={{ marginBottom: 14, borderTop: fdIdx > 0 ? '1px solid var(--border)' : undefined, paddingTop: fdIdx > 0 ? 14 : undefined }}>
                    {fd.type === 'toggle' ? (
                      <Toggle label={fd.name} value={!!val} onChange={v => setFieldVal(v)} />
                    ) : fd.type === 'number' ? (
                      <Field label={fd.name} value={String(val ?? '')} onChange={v => {
                        const cleaned = v.replace(/[^0-9.\-]/g, '');
                        if (cleaned === '' || cleaned === '-' || cleaned === '.') { setFieldVal(null); return; }
                        const n = Number(cleaned);
                        if (Number.isFinite(n)) setFieldVal(n);
                      }} placeholder="0" />
                    ) : fd.type === 'color' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: String(val || '#333'), border: '1px solid var(--border)' }} />
                          <input className="field__input" aria-label={fd.name} type="color" value={String(val || '#333333')}
                            onChange={e => setFieldVal(e.target.value)} style={{ width: 60, padding: 2 }} />
                        </div>
                      </div>
                    ) : fd.type === 'date' || fd.type === 'timestamp' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        <input className="field__input" aria-label={fd.name} type={fd.type === 'timestamp' ? 'datetime-local' : 'date'}
                          value={String(val || '')} onChange={e => setFieldVal(e.target.value)} />
                      </div>
                    ) : fd.type === 'month' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        <input className="field__input" aria-label={fd.name} type="month" value={String(val || '')} onChange={e => setFieldVal(e.target.value)} />
                      </div>
                    ) : fd.type === 'year' ? (
                      <Field label={fd.name} value={String(val || '')} onChange={v => setFieldVal(v)} placeholder="YYYY" />
                    ) : fd.type === 'monthYear' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        <input className="field__input" aria-label={fd.name} type="month" value={String(val || '')} onChange={e => setFieldVal(e.target.value)} />
                      </div>
                    ) : fd.type === 'monthDay' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <select className="field__input" aria-label={fd.name} style={{ flex: 1 }} value={String(val || '').split('-')[0] || ''}
                            onChange={e => setFieldVal(`${e.target.value}-${String(val || '').split('-')[1] || '01'}`)}>
                            <option value="">{t('customFields.typeMonth')}</option>
                            {Array.from({length: 12}, (_, i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{new Date(2000, i).toLocaleString(getLocale(), {month: 'long'})}</option>)}
                          </select>
                          <input className="field__input" type="number" min="1" max="31" style={{ width: 70 }}
                            aria-label={t('customFields.day')}
                            value={String(val || '').split('-')[1] || ''}
                            onChange={e => setFieldVal(`${String(val || '').split('-')[0] || '01'}-${e.target.value}`)}
                            placeholder={t('customFields.day')} />
                        </div>
                      </div>
                    ) : fd.type === 'dateRange' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="field__input" aria-label={`${fd.name} (${t('customFields.startDate')})`} type="date" value={String(val || '').split('|')[0] || ''}
                            onChange={e => setFieldVal(`${e.target.value}|${String(val || '').split('|')[1] || ''}`)} style={{ flex: 1 }} />
                          <input className="field__input" aria-label={`${fd.name} (${t('customFields.endDate')})`} type="date" value={String(val || '').split('|')[1] || ''}
                            onChange={e => setFieldVal(`${String(val || '').split('|')[0] || ''}|${e.target.value}`)} style={{ flex: 1 }} />
                        </div>
                      </div>
                    ) : fd.type === 'image' ? (
                      <div>
                        <label className="field__label">{fd.name}</label>
                        {val ? (
                          <div>
                            <img src={String(val)} alt={fd.name} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
                            <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                              <label style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>{t('common.change', { defaultValue: 'Change' })}
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async () => { if (typeof reader.result !== 'string') return; const chosen = await chooseImageTreatment(reader.result); if (chosen) setFieldVal(chosen); }; reader.readAsDataURL(file); (e.target as HTMLInputElement).value = ''; }} />
                              </label>
                              <button style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', padding: 0 }} onClick={() => setFieldVal(null)}>{t('common.clear', { defaultValue: 'Clear' })}</button>
                            </div>
                          </div>
                        ) : (
                          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 22, border: '1.5px dashed var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer' }}>
                            <span style={{ fontSize: 20, color: 'var(--dim)' }}>＋</span>
                            <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t('customFields.addImage', { defaultValue: 'Add image' })}</span>
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async () => { if (typeof reader.result !== 'string') return; const chosen = await chooseImageTreatment(reader.result); if (chosen) setFieldVal(chosen); }; reader.readAsDataURL(file); (e.target as HTMLInputElement).value = ''; }} />
                          </label>
                        )}
                      </div>
                    ) : (
                      <Field label={fd.name} value={String(val || '')} onChange={v => setFieldVal(v)}
                        placeholder={fd.name} multiline={fd.type === 'markdown'} />
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>
                {t('customFields.noFieldsInfo')}
              </div>
            )}
          </div>
        )}

        {memberTab === 'connections' && !isNew && (() => {
          const allTypes = allRelationshipTypes(relTypes);
          const typeById = new Map(allTypes.map(ty => [ty.id, ty]));
          const typeLabel = (id: string) => { const ty = typeById.get(id); return ty ? ((ty.preset && !ty.overridden) ? t(`relType.${ty.id}`, { defaultValue: ty.name }) : ty.name) : '?'; };
          const mine = relationships.filter(r => r.fromId === f.id || r.toId === f.id);
          return (
            <div>
              {onShowOnMap && (
                <Btn variant="ghost" onClick={() => onShowOnMap(f.id)}>{t('systemMap.showOnMap')}</Btn>
              )}
              {mine.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 12 }}>{t('systemMap.noneForMember')}</p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {mine.map(r => {
                    const otherId = r.fromId === f.id ? r.toId : r.fromId;
                    const other = members.find(m => m.id === otherId);
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: typeById.get(r.typeId)?.color || DEFAULT_REL_COLOR }} />
                        <span style={{ fontSize: 12, color: 'var(--dim)', minWidth: 70 }}>{typeLabel(r.typeId)}</span>
                        <button onClick={() => other && openEdit(other)} disabled={!other}
                          style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--text)', background: 'none', border: 'none', cursor: other ? 'pointer' : 'default' }}>
                          {other?.name || '?'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {memberTab === 'noteboard' && !isNew && (
          <div>
            {memberNotes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {memberNotes.map(note => {
                  const author = members.find(m => m.id === note.authorId);
                  return (
                    <div key={note.id} style={{
                      padding: 12, background: note.pinned ? 'var(--accent-bg)' : 'var(--card)',
                      border: `1px solid ${note.pinned ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 11, fontSize: 9, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: author?.color || 'var(--muted)', color: 'rgba(0,0,0,0.75)' }}>
                          {getInitials(author?.name || '?')}
                        </div>
                        <span style={{ fontSize: 12, color: author?.color || 'var(--dim)', fontWeight: 500 }}>{author?.name || '?'}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>{fmtTime(note.timestamp)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{note.content}</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button style={{ background: 'none', border: 'none', fontSize: 11, color: note.pinned ? 'var(--accent)' : 'var(--dim)', cursor: 'pointer' }}
                          onClick={() => togglePin(note.id)}>{note.pinned ? `📌 ${t('noteboard.unpin')}` : t('noteboard.pin')}</button>
                        <button style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--danger)', cursor: 'pointer' }}
                          onClick={() => deleteNote(note.id)}>{t('noteboard.deleteNote')}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>{t('noteboard.noNotes')}</div>
            )}

            <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t('noteboard.writingAs')}</span>
                <select style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}
                  aria-label={t('noteboard.writingAs')} value={noteAuthorId || ''} onChange={e => setNoteAuthorId(e.target.value)}>
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
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea className="field__input field__input--multi" value={noteText} onChange={e => setNoteText(e.target.value)}
                  aria-label={t('noteboard.placeholder')} placeholder={t('noteboard.placeholder')} style={{ flex: 1, minHeight: 48, fontSize: 13 }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote(); }} />
                <Btn variant="solid" onClick={addNote}>{t('common.add')}</Btn>
              </div>
            </div>
          </div>
        )}
        </fieldset>
        )}
      </Modal>

      <ConfirmDialog open={!!confirmDelete}
        title={t('modal.confirmDelete')}
        message={t('modal.confirmDelete')}
        danger
        onConfirm={() => confirmDelete && deleteMember(confirmDelete)}
        onCancel={() => setConfirmDelete(null)} />

      <Modal open={viewPfp && !!f.avatar} title={t('modal.viewPfpOf', { name: f.name || '?' })} onClose={() => setViewPfp(false)}>
        <div {...clickable(() => setViewPfp(false), t('common.close'))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={f.avatar} alt={t('modal.viewPfpOf', { name: f.name || '?' })}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12, display: 'block' }} />
        </div>
      </Modal>

      <Modal open={showClone} title={t('members.clone')} onClose={() => setShowClone(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setShowClone(false)}>{t('common.cancel')}</Btn>
            <Btn variant="solid" onClick={doClone}>{t('members.clone')}</Btn>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginTop: 0, marginBottom: 8 }}>{t('members.cloneFields')}</p>
        <Toggle value={cloneSel.name} onChange={v => setCloneSel(s => ({ ...s, name: v }))} label={t('modal.name')} />
        <Toggle value={cloneSel.pronouns} onChange={v => setCloneSel(s => ({ ...s, pronouns: v }))} label={t('modal.pronouns')} />
        <Toggle value={cloneSel.role} onChange={v => setCloneSel(s => ({ ...s, role: v }))} label={t('modal.role')} />
        <Toggle value={cloneSel.color} onChange={v => setCloneSel(s => ({ ...s, color: v }))} label={t('modal.color')} />
        <Toggle value={cloneSel.description} onChange={v => setCloneSel(s => ({ ...s, description: v }))} label={t('modal.descriptionBio')} />
      </Modal>

      <Modal open={!!quickFrontFor} title={quickFrontFor ? `${t('members.addToFront')} — ${quickFrontFor.name}` : t('members.addToFront')} onClose={() => setQuickFrontFor(null)}>
        {quickFrontFor && (['primary', 'coFront', 'coConscious'] as const)
          .filter(tier => tier !== 'coConscious' || !quickFrontFor.isCustomFront)
          .map(tier => (
            <button key={tier}
              onClick={() => { onQuickFront?.(quickFrontFor.id, tier); setQuickFrontFor(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 10, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: tier === 'primary' ? 'var(--accent)' : tier === 'coFront' ? 'var(--info)' : 'var(--success)' }} />
              <span style={{ fontSize: 13, color: 'var(--text)' }}>
                {tier === 'primary' ? t('tier.primaryFront') : tier === 'coFront' ? t('tier.coFront') : t('tier.coConscious')}
              </span>
            </button>
          ))}
      </Modal>

      <ConfirmDialog open={!!confirmRemoveFront}
        title={t('members.removeFromFront')}
        message={confirmRemoveFront ? t('members.removeFromFrontMsg', { name: confirmRemoveFront.name }) : ''}
        danger
        onConfirm={() => { if (confirmRemoveFront) onRemoveFromFront?.(confirmRemoveFront.id); setConfirmRemoveFront(null); }}
        onCancel={() => setConfirmRemoveFront(null)} />
    </div>
  );
}
