import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, MemberGroup, uid, getInitials } from '../utils';
import { PALETTE } from '../theme';
import { store, KEYS } from '../storage';
import { Btn, Field, Toggle, Section, ChipList, AddRow, ColorPicker, Modal, ConfirmDialog } from '../components/ui';

interface Props {
  members: Member[];
  groups: MemberGroup[];
  onUpdate: () => void;
}

export default function MembersView({ members, groups, onUpdate }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Member | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Editor state
  const [f, setF] = useState<Member>({ id: '', name: '', pronouns: '', role: '', color: PALETTE[0], description: '' });
  const [tagInput, setTagInput] = useState('');

  const active = members.filter(m => !m.archived);
  const archived = members.filter(m => m.archived);
  const filtered = (showArchived ? archived : active).filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    const m: Member = { id: uid(), name: '', pronouns: '', role: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)], description: '', tags: [], groupIds: [] };
    setF(m); setIsNew(true); setEditing(m); setTagInput('');
  };

  const openEdit = (m: Member) => {
    setF({ ...m, tags: m.tags || [], groupIds: m.groupIds || [] });
    setIsNew(false); setEditing(m); setTagInput('');
  };

  const set = (k: keyof Member, v: any) => setF(x => ({ ...x, [k]: v }));

  const addTag = () => {
    const raw = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (!raw) return;
    // Use functional updater so we always read the latest tags, not a stale closure
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

  const deleteMember = async (id: string) => {
    await store.set(KEYS.members, members.filter(m => m.id !== id));
    setConfirmDelete(null);
    setEditing(null);
    onUpdate();
  };

  const pickAvatar = async () => {
    const path = await window.electronAPI.dialog.openFile([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ]);
    if (!path) return;
    // Read file as base64 via main process — for now, use a File input workaround
    // This will be wired properly when we add IPC file reading
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input className="field__input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search members..." style={{ flex: 1 }} />
        <Btn variant={showArchived ? 'info' : 'ghost'} onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? `Archived (${archived.length})` : `Active (${active.length})`}
        </Btn>
        <Btn variant="solid" onClick={openNew}>+ Add Member</Btn>
      </div>

      {/* Member Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {filtered.map(m => (
          <div key={m.id} className="tile" style={{ minHeight: 'auto', padding: 14, cursor: 'pointer' }}
            onClick={() => openEdit(m)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="tile__avatar" style={{
                width: 40, height: 40, fontSize: 14,
                ...(m.avatar
                  ? { backgroundImage: `url(${m.avatar})` }
                  : { backgroundColor: m.color }),
              }}>
                {!m.avatar && getInitials(m.name)}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {[m.pronouns, m.role].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
            </div>
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
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          {search ? 'No members match your search' : showArchived ? 'No archived members' : 'No members yet — add your first!'}
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editing} title={isNew ? 'Add Member' : 'Edit Member'} onClose={() => setEditing(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div>
              {!isNew && (
                <Btn variant="danger" onClick={() => setConfirmDelete(f.id)}>Delete</Btn>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn variant="solid" onClick={saveMember}>Save</Btn>
            </div>
          </div>
        }>
        {/* Avatar */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="tile__avatar" style={{
            width: 72, height: 72, borderRadius: 36, fontSize: 24, margin: '0 auto',
            border: `2px solid ${f.color}`,
            ...(f.avatar
              ? { backgroundImage: `url(${f.avatar})` }
              : { backgroundColor: f.color }),
          }}>
            {!f.avatar && getInitials(f.name || '?')}
          </div>
          {f.avatar && (
            <button style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}
              onClick={() => set('avatar', undefined)}>
              Remove Photo
            </button>
          )}
        </div>

        <Field label="Name" value={f.name} onChange={v => set('name', v)} placeholder="Headmate name" />
        <Field label="Pronouns" value={f.pronouns} onChange={v => set('pronouns', v)} placeholder="e.g. they/them" />
        <Field label="Role" value={f.role} onChange={v => set('role', v)} placeholder="e.g. Protector, Host" />

        <Section label="Color" />
        <ColorPicker value={f.color} onChange={v => set('color', v)} palette={PALETTE} />

        {/* Groups */}
        {groups.length > 0 && (
          <>
            <Section label="Groups" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
              {groups.map(g => {
                const active = (f.groupIds || []).includes(g.id);
                return (
                  <button key={g.id} className={`chip ${active ? '' : ''}`}
                    style={{
                      borderColor: active ? `${g.color || 'var(--accent)'}50` : 'var(--border)',
                      background: active ? `${g.color || 'var(--accent)'}20` : 'var(--surface)',
                      color: active ? (g.color || 'var(--accent)') : 'var(--dim)',
                    }}
                    onClick={() => toggleGroup(g.id)}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color || 'var(--accent)', display: 'inline-block' }} />
                    {g.name}
                    {active && <span style={{ fontWeight: 700 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Tags */}
        <Section label="Tags" />
        <ChipList items={f.tags || []} onRemove={tag => setF(x => ({ ...x, tags: (x.tags || []).filter(t => t !== tag) }))} />
        <AddRow value={tagInput} onChange={setTagInput} onAdd={addTag} placeholder="#tag" />

        {/* Description */}
        <Section label="Description / Bio" />
        <Field value={f.description} onChange={v => set('description', v)} placeholder="Member description..." multiline />

        {/* Archive */}
        {!isNew && (
          <Toggle label="Archive Member" description="Hidden from active lists but data preserved"
            value={!!f.archived} onChange={v => set('archived', v)} />
        )}
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog open={!!confirmDelete}
        title="Delete Member"
        message="This will permanently remove this member and cannot be undone."
        danger
        onConfirm={() => confirmDelete && deleteMember(confirmDelete)}
        onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
