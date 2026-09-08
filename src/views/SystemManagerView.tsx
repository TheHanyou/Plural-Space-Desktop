import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, MemberGroup, GroupNodeKind, MemberSortMode, uid, childrenOf, descendantsOf, isDescendant, groupKind, isRosterMember, sortMembers, nameCompare, memberMatchesSearch } from '../utils';
import { store, KEYS } from '../storage';
import { useAppStore } from '../store/appStore';
import { Btn, Modal, ConfirmDialog, Dropdown, useEscapeKey } from '../components/ui';
import { ColorCarousel } from '../components/ColorCarousel';
import { NetworkManager } from '../network/NetworkManager';
import { PALETTE } from '../theme';

interface Props {
  onUpdate: () => void;
  onViewMember?: (id: string) => void;
  onQuickFront?: (memberId: string, tier: 'primary' | 'coFront' | 'coConscious') => void;
  onRemoveFromFront?: (memberId: string) => void;
}

export default function SystemManagerView({ onUpdate, onViewMember, onQuickFront, onRemoveFromFront }: Props) {
  const members = useAppStore(s => s.state.members);
  const groups = useAppStore(s => s.state.groups);
  const front = useAppStore(s => s.state.front);
  const settings = useAppStore(s => s.state.settings);
  const { t } = useTranslation();
  const groupSortMode: MemberSortMode = settings.groupSortMode || 'manual';
  const saveGroupSortMode = async (mode: MemberSortMode) => {
    await store.set(KEYS.settings, { ...settings, groupSortMode: mode });
    onUpdate();
  };

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newKind, setNewKind] = useState<GroupNodeKind>('group');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(PALETTE[0]);
  const [editDesc, setEditDesc] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useEscapeKey(!!confirmDeleteId, () => setConfirmDeleteId(null));
  const [showNewColor, setShowNewColor] = useState(false);
  const [showEditColor, setShowEditColor] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [quickFrontFor, setQuickFrontFor] = useState<Member | null>(null);
  const [confirmRemoveFront, setConfirmRemoveFront] = useState<Member | null>(null);
  const [addPickOpen, setAddPickOpen] = useState(false);
  const [addPickIds, setAddPickIds] = useState<string[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [removeMode, setRemoveMode] = useState(false);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [confirmGroupRemove, setConfirmGroupRemove] = useState(false);

  const saveGroups = async (g: MemberGroup[]) => {
    await store.set(KEYS.groups, g);
    onUpdate();
  };

  const saveMembers = async (next: Member[]) => {
    await store.set(KEYS.members, next);
    NetworkManager.notifyDataChanged();
    onUpdate();
  };

  const addMembersToGroup = (ids: string[], groupId: string) => {
    const idSet = new Set(ids);
    saveMembers(members.map(m => idSet.has(m.id) ? { ...m, groupIds: [...new Set([...(m.groupIds || []), groupId])] } : m));
  };

  const removeMembersFromGroup = (ids: string[], groupId: string) => {
    const idSet = new Set(ids);
    saveMembers(members.map(m => idSet.has(m.id) ? { ...m, groupIds: (m.groupIds || []).filter(g => g !== groupId) } : m));
  };

  const isFronting = (id: string): boolean => !!front && (
    (front.primary?.memberIds || []).includes(id) ||
    (front.coFront?.memberIds || []).includes(id) ||
    (front.coConscious?.memberIds || []).includes(id)
  );

  const goBrowseTo = (id: string | null) => {
    setBrowseId(id);
    setRemoveMode(false);
    setRemoveIds([]);
    setAddPickOpen(false);
    setAddPickIds([]);
    setAddSearch('');
  };

  const addNode = () => {
    const name = newName.trim();
    if (!name) return;
    const siblings = childrenOf(groups, null);
    saveGroups([...groups, { id: uid(), name, color: newColor, kind: newKind, parentId: null, sortOrder: siblings.length, description: newDesc.trim() || undefined }]);
    setNewName('');
    setNewDesc('');
  };

  const moveNode = (id: string, newParentId: string | null) => {
    if (newParentId === id || (newParentId && isDescendant(groups, newParentId, id))) { setMovingId(null); return; }
    const siblings = childrenOf(groups, newParentId).filter(g => g.id !== id);
    saveGroups(groups.map(g => g.id === id ? { ...g, parentId: newParentId, sortOrder: siblings.length } : g));
    setMovingId(null);
  };

  const renameNode = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    saveGroups(groups.map(g => g.id === id ? { ...g, name, color: editColor, description: editDesc.trim() || undefined } : g));
    setEditId(null); setEditName('');
  };

  const deleteLeaf = (id: string) => {
    saveGroups(groups.filter(g => g.id !== id));
    setConfirmDeleteId(null);
  };

  const deletePromoteChildren = (id: string) => {
    const node = groups.find(g => g.id === id);
    const parent = node ? (node.parentId ?? null) : null;
    saveGroups(groups.filter(g => g.id !== id).map(g => g.parentId === id ? { ...g, parentId: parent } : g));
    setConfirmDeleteId(null);
  };

  const deleteSubtree = (id: string) => {
    const kids = descendantsOf(groups, id);
    const removeSet = new Set([id, ...kids.map(k => k.id)]);
    saveGroups(groups.filter(g => !removeSet.has(g.id)));
    setConfirmDeleteId(null);
  };

  const confirmTarget = confirmDeleteId ? groups.find(g => g.id === confirmDeleteId) : null;
  const confirmKids = confirmDeleteId ? descendantsOf(groups, confirmDeleteId) : [];

  const renderNode = (g: MemberGroup, depth: number, seen: Set<string> = new Set()): React.ReactNode => {
    if (seen.has(g.id)) return null;
    seen.add(g.id);
    const isEditing = editId === g.id;
    const isSub = groupKind(g) === 'subsystem';
    const memberCount = members.filter(m => isRosterMember(m) && (m.groupIds || []).includes(g.id)).length;
    const moving = movingId;
    const canDrop = !!moving && moving !== g.id && !isDescendant(groups, g.id, moving);
    return (
      <div key={g.id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: depth * 18 }}>
          {depth > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>└</span>}
          {isEditing ? (
            <button title={t('memberGroups.changeColor')} aria-label={t('memberGroups.changeColor')} onClick={() => setShowEditColor(v => !v)}
              style={{ width: 18, height: 18, borderRadius: isSub ? 4 : 9, backgroundColor: editColor, border: '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', flexShrink: 0 }} />
          ) : (
            <span style={{ width: 12, height: 12, borderRadius: isSub ? 3 : 6, backgroundColor: g.color || 'var(--accent)', flexShrink: 0 }} />
          )}
          {isEditing ? (
            <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="field__input" aria-label={t('memberGroups.groupName', {defaultValue: 'Group name'})} value={editName} autoFocus onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') renameNode(g.id); if (e.key === 'Escape') setEditId(null); }}
                style={{ flex: 1, fontSize: 13 }} />
              <button onClick={() => renameNode(g.id)} title={t('common.save')} aria-label={t('common.save')} style={{ background: 'none', border: 'none', color: 'var(--success)', fontSize: 14, cursor: 'pointer' }}>✓</button>
              <button onClick={() => setEditId(null)} title={t('common.cancel')} aria-label={t('common.cancel')} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 12, cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isSub ? '⊟ ' : ''}{g.name}
              </span>
              {canDrop ? (
                <button onClick={() => moveNode(moving!, g.id)}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success)', cursor: 'pointer' }}>
                  {t('memberGroups.moveHere')}
                </button>
              ) : moving === g.id ? (
                <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{t('memberGroups.moving')}</span>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{memberCount}</span>
                  <button onClick={() => setMovingId(g.id)} title={`${t('memberGroups.move')} ${g.name}`} aria-label={`${t('memberGroups.move')} ${g.name}`}
                    style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 15, cursor: 'pointer', padding: 2 }}>⇄</button>
                  <button onClick={() => { setEditId(g.id); setEditName(g.name); setEditColor(g.color || PALETTE[0]); setEditDesc(g.description || ''); setShowEditColor(false); }}
                    style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--accent-bg)', color: 'var(--accent)', cursor: 'pointer' }}>
                    {t('common.edit')}
                  </button>
                  <button onClick={() => setConfirmDeleteId(g.id)} title={`${t('common.delete')} ${g.name}`} aria-label={`${t('common.delete')} ${g.name}`}
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', padding: 4 }}>✕</button>
                </>
              )}
            </>
          )}
        </div>
        {isEditing && showEditColor && (
          <div style={{ paddingLeft: depth * 18 + 26, marginBottom: 10 }}>
            <ColorCarousel value={editColor} onChange={setEditColor} />
          </div>
        )}
        {isEditing && (
          <div style={{ paddingLeft: depth * 18 + 26, marginBottom: 10 }}>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder={t('modal.descriptionBio')} aria-label={t('modal.descriptionBio')} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical' }} />
          </div>
        )}
        {childrenOf(groups, g.id).map(c => renderNode(c, depth + 1, seen))}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <p style={{ flex: 1, fontSize: 12, color: 'var(--dim)', lineHeight: 1.5, margin: 0 }}>{t('systemManager.desc')}</p>
        <Btn variant={browse ? 'info' : 'ghost'} onClick={() => { setBrowse(b => !b); goBrowseTo(null); }}>🗂 {t('systemManager.browse')}</Btn>
      </div>

      {browse && (() => {
        const folder = browseId ? groups.find(g => g.id === browseId) : null;
        const subFolders = childrenOf(groups, browseId);
        const folderMembers = sortMembers(browseId
          ? members.filter(m => (m.groupIds || []).includes(browseId) && !m.archived && isRosterMember(m))
          : members.filter(m => (m.groupIds || []).length === 0 && !m.archived && isRosterMember(m)), groupSortMode);
        const addMatch = (m: Member) => !!folder && !m.archived && !m.isCustomFront && !m.deleted
          && !(m.groupIds || []).includes(folder.id)
          && memberMatchesSearch(m, addSearch);
        const addCandidates = folder
          ? members.filter(m => !m.isFacet && addMatch(m)).sort((a, b) => nameCompare(a.name, b.name))
          : [];
        const addFacetCandidates = folder
          ? members.filter(m => m.isFacet && addMatch(m)).sort((a, b) => nameCompare(a.name, b.name))
          : [];
        const folderFacets = sortMembers(browseId
          ? members.filter(m => (m.groupIds || []).includes(browseId) && !m.archived && m.isFacet && !m.isCustomFront && !m.deleted)
          : members.filter(m => (m.groupIds || []).length === 0 && !m.archived && m.isFacet && !m.isCustomFront && !m.deleted), groupSortMode);
        const folderCustomFronts = browseId
          ? sortMembers(members.filter(m => (m.groupIds || []).includes(browseId) && !m.archived && m.isCustomFront && !m.deleted), groupSortMode)
          : [];
        const addCfCandidates = folder
          ? members.filter(m => m.isCustomFront && !m.deleted && !m.archived
              && !(m.groupIds || []).includes(folder.id)
              && memberMatchesSearch(m, addSearch)).sort((a, b) => nameCompare(a.name, b.name))
          : [];
        const toggleAddPick = (id: string) => setAddPickIds(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
        const toggleRemovePick = (id: string) => setRemoveIds(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
        return (
          <div style={{ marginBottom: 16, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {browseId && (
                <button onClick={() => goBrowseTo(folder?.parentId ?? null)} aria-label={t('common.back')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, cursor: 'pointer' }}>←</button>
              )}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{folder ? folder.name : t('systemManager.title')}</span>
              <Dropdown<MemberSortMode>
                value={groupSortMode}
                options={['alphabetical', 'reverse-alphabetical', 'age', 'color', 'role', 'manual']}
                onChange={saveGroupSortMode}
                renderOption={v => t(`memberSort.${v}`)}
              />
              {folder && !removeMode && (
                <button onClick={() => { setAddPickIds([]); setAddSearch(''); setAddPickOpen(true); }} aria-label={t('memberGroups.addMembers')} title={t('memberGroups.addMembers')}
                  style={{ width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 14, lineHeight: 1 }}>＋</button>
              )}
              {folder && folderMembers.length > 0 && !removeMode && (
                <button onClick={() => { setRemoveIds([]); setRemoveMode(true); }} aria-label={t('memberGroups.removeMembers')} title={t('memberGroups.removeMembers')}
                  style={{ width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 14, lineHeight: 1 }}>−</button>
              )}
            </div>
            {removeMode && folder && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: 8, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--danger)' }}>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--dim)' }}>{t('members.selectedCount', { count: removeIds.length })}</span>
                <button onClick={() => { if (removeIds.length > 0) setConfirmGroupRemove(true); }} disabled={removeIds.length === 0}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: removeIds.length === 0 ? 0.45 : 1 }}>{t('network.remove')}</button>
                <button onClick={() => { setRemoveMode(false); setRemoveIds([]); }}
                  style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 11, cursor: 'pointer' }}>{t('common.cancel')}</button>
              </div>
            )}
            {subFolders.map(g => (
              <button key={g.id} onClick={() => goBrowseTo(g.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 14 }}>{groupKind(g) === 'subsystem' ? '⊟' : '📁'}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{g.name}</span>
                <span aria-hidden style={{ fontSize: 11, color: 'var(--muted)' }}>›</span>
              </button>
            ))}
            {folderMembers.length > 0 && <label className="field__label" style={{ marginTop: 10 }}>{t('members.title')}</label>}
            {folderMembers.map(m => removeMode ? (
              <button key={m.id} onClick={() => toggleRemovePick(m.id)} role="checkbox" aria-checked={removeIds.includes(m.id)} aria-label={m.name}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 14, color: removeIds.includes(m.id) ? 'var(--danger)' : 'var(--muted)' }}>{removeIds.includes(m.id) ? '☑' : '☐'}</span>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
              </button>
            ) : (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                <button onClick={() => onViewMember?.(m.id)} disabled={!onViewMember}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: 8, background: 'none', border: 'none', cursor: onViewMember ? 'pointer' : 'default', textAlign: 'left' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                </button>
                {onQuickFront && onRemoveFromFront && (
                  isFronting(m.id) ? (
                    <button onClick={() => setConfirmRemoveFront(m)} aria-label={`${t('members.removeFromFront')} — ${m.name}`} title={t('members.removeFromFront')}
                      style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, lineHeight: 1, marginRight: 4 }}>−</button>
                  ) : (
                    <button onClick={() => setQuickFrontFor(m)} aria-label={`${t('members.addToFront')} — ${m.name}`} title={t('members.addToFront')}
                      style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 12, lineHeight: 1, marginRight: 4 }}>＋</button>
                  )
                )}
              </div>
            ))}
            {folderFacets.length > 0 && (
              <>
                <label className="field__label" style={{ marginTop: 10 }}>{t('members.facets')}</label>
                {folderFacets.map(m => removeMode ? (
                  <button key={m.id} onClick={() => toggleRemovePick(m.id)} role="checkbox" aria-checked={removeIds.includes(m.id)} aria-label={m.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14, color: removeIds.includes(m.id) ? 'var(--danger)' : 'var(--muted)' }}>{removeIds.includes(m.id) ? '☑' : '☐'}</span>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                  </button>
                ) : (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => onViewMember?.(m.id)} disabled={!onViewMember}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: 8, background: 'none', border: 'none', cursor: onViewMember ? 'pointer' : 'default', textAlign: 'left' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                    </button>
                  </div>
                ))}
              </>
            )}
            {folderCustomFronts.length > 0 && (
              <>
                <label className="field__label" style={{ marginTop: 10 }}>{t('members.customFronts')}</label>
                {folderCustomFronts.map(m => removeMode ? (
                  <button key={m.id} onClick={() => toggleRemovePick(m.id)} role="checkbox" aria-checked={removeIds.includes(m.id)} aria-label={m.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14, color: removeIds.includes(m.id) ? 'var(--danger)' : 'var(--muted)' }}>{removeIds.includes(m.id) ? '☑' : '☐'}</span>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                  </button>
                ) : (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => onViewMember?.(m.id)} disabled={!onViewMember}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: 8, background: 'none', border: 'none', cursor: onViewMember ? 'pointer' : 'default', textAlign: 'left' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                    </button>
                  </div>
                ))}
              </>
            )}
            {subFolders.length === 0 && folderMembers.length === 0 && folderFacets.length === 0 && folderCustomFronts.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('systemManager.emptyFolder')}</p>
            )}

            <Modal open={addPickOpen} title={`${t('memberGroups.addMembers')} — ${folder?.name || ''}`} onClose={() => setAddPickOpen(false)}
              footer={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--dim)' }}>{t('members.selectedCount', { count: addPickIds.length })}</span>
                  <Btn variant="ghost" onClick={() => setAddPickOpen(false)}>{t('common.cancel')}</Btn>
                  <Btn variant="solid" disabled={addPickIds.length === 0} onClick={() => { if (folder && addPickIds.length > 0) addMembersToGroup(addPickIds, folder.id); setAddPickOpen(false); setAddPickIds([]); }}>{t('common.add')}</Btn>
                </div>
              }>
              <input className="field__input" value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} style={{ marginBottom: 10, width: '100%' }} />
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {addCandidates.length > 0 && <label className="field__label">{t('members.title')}</label>}
                {addCandidates.map(m => (
                  <button key={m.id} onClick={() => toggleAddPick(m.id)} role="checkbox" aria-checked={addPickIds.includes(m.id)} aria-label={m.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14, color: addPickIds.includes(m.id) ? 'var(--accent)' : 'var(--muted)' }}>{addPickIds.includes(m.id) ? '☑' : '☐'}</span>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                  </button>
                ))}
                {addFacetCandidates.length > 0 && (
                  <>
                    <label className="field__label" style={{ marginTop: 10 }}>{t('members.facets')}</label>
                    {addFacetCandidates.map(m => (
                      <button key={m.id} onClick={() => toggleAddPick(m.id)} role="checkbox" aria-checked={addPickIds.includes(m.id)} aria-label={m.name}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 14, color: addPickIds.includes(m.id) ? 'var(--accent)' : 'var(--muted)' }}>{addPickIds.includes(m.id) ? '☑' : '☐'}</span>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                      </button>
                    ))}
                  </>
                )}
                {addCfCandidates.length > 0 && (
                  <>
                    <label className="field__label" style={{ marginTop: 10 }}>{t('members.customFronts')}</label>
                    {addCfCandidates.map(m => (
                      <button key={m.id} onClick={() => toggleAddPick(m.id)} role="checkbox" aria-checked={addPickIds.includes(m.id)} aria-label={m.name}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 14, color: addPickIds.includes(m.id) ? 'var(--accent)' : 'var(--muted)' }}>{addPickIds.includes(m.id) ? '☑' : '☐'}</span>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                      </button>
                    ))}
                  </>
                )}
                {addCandidates.length === 0 && addFacetCandidates.length === 0 && addCfCandidates.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('members.noMembers')}</p>
                )}
              </div>
            </Modal>

            <Modal open={!!quickFrontFor} title={`${t('members.addToFront')} — ${quickFrontFor?.name || ''}`} onClose={() => setQuickFrontFor(null)}>
              {(['primary', 'coFront', 'coConscious'] as const).map(tier => (
                <button key={tier} onClick={() => { const m = quickFrontFor; setQuickFrontFor(null); if (m) onQuickFront?.(m.id, tier); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 10, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: tier === 'primary' ? 'var(--accent)' : tier === 'coFront' ? 'var(--info)' : 'var(--success)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{tier === 'primary' ? t('tier.primaryFront') : tier === 'coFront' ? t('tier.coFront') : t('tier.coConscious')}</span>
                </button>
              ))}
            </Modal>

            <ConfirmDialog open={!!confirmRemoveFront}
              title={t('members.removeFromFront')}
              message={confirmRemoveFront ? t('members.removeFromFrontMsg', { name: confirmRemoveFront.name }) : ''}
              danger
              onConfirm={() => { if (confirmRemoveFront) onRemoveFromFront?.(confirmRemoveFront.id); setConfirmRemoveFront(null); }}
              onCancel={() => setConfirmRemoveFront(null)} />

            <ConfirmDialog open={confirmGroupRemove}
              title={t('memberGroups.removeMembers')}
              message={t('members.selectedCount', { count: removeIds.length })}
              danger
              onConfirm={() => { if (folder && removeIds.length > 0) removeMembersFromGroup(removeIds, folder.id); setConfirmGroupRemove(false); setRemoveMode(false); setRemoveIds([]); }}
              onCancel={() => setConfirmGroupRemove(false)} />
          </div>
        );
      })()}

      {!browse && movingId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: 8, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--accent)' }}>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--dim)' }}>{t('memberGroups.movePrompt')}</span>
          <button onClick={() => moveNode(movingId!, null)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{t('memberGroups.toRoot')}</button>
          <button onClick={() => setMovingId(null)} style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 11, cursor: 'pointer' }}>{t('common.cancel')}</button>
        </div>
      )}

      {!browse && childrenOf(groups, null).map(g => renderNode(g, 0))}
      {!browse && groups.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 10 }}>{t('memberGroups.none')}</p>}

      {!browse && (<>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 }}>
        <button aria-label={t('memberGroups.changeColor')} title={t('memberGroups.changeColor')} onClick={() => setShowNewColor(v => !v)}
          style={{ width: 28, height: 28, borderRadius: newKind === 'subsystem' ? 6 : 14, backgroundColor: newColor, border: '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', flexShrink: 0 }} />
        <input className="field__input" value={newName} onChange={e => setNewName(e.target.value)}
          aria-label={t('memberGroups.addPlaceholder')} placeholder={t('memberGroups.addPlaceholder')}
          onKeyDown={e => { if (e.key === 'Enter') addNode(); }}
          style={{ flex: 1, fontSize: 13 }} />
        <Btn variant="ghost" onClick={() => setNewKind(k => k === 'group' ? 'subsystem' : 'group')}>
          {newKind === 'subsystem' ? t('memberGroups.subsystem') : t('memberGroups.group')}
        </Btn>
        <Btn variant="solid" onClick={addNode}>{t('common.add')}</Btn>
      </div>
      {showNewColor && (
        <div style={{ marginTop: 10 }}>
          <ColorCarousel value={newColor} onChange={setNewColor} />
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder={t('modal.descriptionBio')} aria-label={t('modal.descriptionBio')} rows={2}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical' }} />
        </div>
      )}
      </>)}

      {confirmTarget && confirmKids.length === 0 && (
        <ConfirmDialog open title={t('memberGroups.deleteGroup')} message={t('memberGroups.deleteGroupMsg')}
          danger onConfirm={() => deleteLeaf(confirmTarget.id)} onCancel={() => setConfirmDeleteId(null)} />
      )}
      {confirmTarget && confirmKids.length > 0 && (
        <div className="modal-overlay" role="presentation" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal modal--sm" role="presentation" onClick={e => e.stopPropagation()}>
            <div className="modal__header"><span className="modal__title">{t('memberGroups.deleteGroup')}</span></div>
            <div className="modal__body">
              <p style={{ color: 'var(--dim)', fontSize: 13, lineHeight: 1.5 }}>{t('memberGroups.deleteWithChildrenMsg', { count: confirmKids.length })}</p>
            </div>
            <div className="modal__footer">
              <Btn variant="ghost" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</Btn>
              <Btn onClick={() => deletePromoteChildren(confirmTarget.id)}>{t('memberGroups.promoteChildren')}</Btn>
              <Btn variant="danger" onClick={() => deleteSubtree(confirmTarget.id)}>{t('memberGroups.deleteSubtree')}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
