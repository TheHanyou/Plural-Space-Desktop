import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChatChannel, ChatCategory, ChatMessage, DEFAULT_CHANNELS, Member,
  uid, getInitials, fmtTime, frontersFirst, sortChatCategories, chatChannelsIn, isRosterMember, memberMatchesSearch,
} from '../utils';
import { store, KEYS, chatMsgKey } from '../storage';
import { Btn, Field, Modal, ConfirmDialog, Dropdown, clickable } from '../components/ui';
import { MarkdownText } from '../components/MarkdownText';
import { initialOn } from '../theme';
import { useAppStore } from '../store/appStore';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import SortableCard from '../components/SortableCard';

interface Props {
  onUpdate: () => void;
}

const EMOJI_QUICK = ['👍', '❤️', '😂', '😢', '😮', '🎉', '✨', '🔥'];

export default function ChatView({ onUpdate }: Props) {
  const { t } = useTranslation();
  const members = useAppStore(s => s.state.members);
  const channels = useAppStore(s => s.state.channels);
  const categories = useAppStore(s => s.state.chatCategories);
  const front = useAppStore(s => s.state.front);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels.find(c => !c.archived)?.id || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeMemberId, setActiveMemberId] = useState<string | null>(members.find(m => !m.archived)?.id || null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [reorderLocked, setReorderLocked] = useState(true);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [editChannelCategory, setEditChannelCategory] = useState<string>('__none__');
  const msgEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const activeChannels = channels.filter(c => !c.archived);
  const archivedChannels = channels.filter(c => c.archived);
  const getMember = (id: string) => members.find(m => m.id === id);
  const sortedCategories = sortChatCategories(categories);
  const uncategorized = chatChannelsIn(activeChannels, null, categories);
  const channelsOf = (categoryId: string | null | undefined) => chatChannelsIn(activeChannels, categoryId, categories);
  const reorderActive = !reorderLocked;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadMessages = useCallback(async (channelId: string) => {
    const msgs = await store.get<ChatMessage[]>(chatMsgKey(channelId), []);
    setMessages(msgs || []);
  }, []);

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveMessages = async (channelId: string, msgs: ChatMessage[]) => {
    setMessages(msgs);
    await store.set(chatMsgKey(channelId), msgs);
  };


  const sendMessage = async () => {
    if (!input.trim() || !activeChannelId || !activeMemberId) return;
    const msg: ChatMessage = {
      id: uid(), channelId: activeChannelId, authorId: activeMemberId,
      type: replyTo ? 'reply' : 'text',
      content: input.trim(), replyToId: replyTo?.id, timestamp: Date.now(),
    };
    await saveMessages(activeChannelId, [...messages, msg]);
    setInput(''); setReplyTo(null);
  };

  const startEditMessage = (msg: ChatMessage) => {
    if (msg.type !== 'text' && msg.type !== 'reply') return;
    setEditingMessageId(msg.id);
    setInput(msg.content);
    setReplyTo(null);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setInput('');
  };

  const saveEditedMessage = async () => {
    if (!editingMessageId || !activeChannelId) return;
    const next = input.trim();
    if (!next) { cancelEditMessage(); return; }
    const updated = messages.map(m =>
      m.id === editingMessageId ? { ...m, content: next } : m
    );
    await saveMessages(activeChannelId, updated);
    cancelEditMessage();
  };

  const sendImage = async () => {
    if (!activeChannelId || !activeMemberId) return;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const msg: ChatMessage = {
          id: uid(), channelId: activeChannelId, authorId: activeMemberId,
          type: 'image', content: reader.result as string, timestamp: Date.now(),
        };
        await saveMessages(activeChannelId, [...messages, msg]);
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  };


  const addReaction = async (msgId: string, emoji: string) => {
    if (!activeMemberId || !activeChannelId) return;
    const updated = messages.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      const users = reactions[emoji] || [];
      if (users.includes(activeMemberId)) {
        reactions[emoji] = users.filter(u => u !== activeMemberId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...users, activeMemberId];
      }
      return { ...m, reactions };
    });
    await saveMessages(activeChannelId, updated);
    setShowEmojiFor(null);
  };


  const saveChannels = async (chs: ChatChannel[]) => {
    await store.set(KEYS.chatChannels, chs);
    onUpdate();
  };

  const createChannel = async () => {
    const name = newChannelName.trim();
    if (!name || channels.length >= 100) return;
    const ch: ChatChannel = { id: uid(), name, sortOrder: uncategorized.length, createdAt: Date.now() };
    await saveChannels([...channels, ch]);
    setNewChannelName(''); setShowNewChannel(false); setActiveChannelId(ch.id);
  };

  const renameChannel = async (id: string) => {
    const name = editChannelName.trim();
    if (!name) return;
    const current = channels.find(c => c.id === id);
    const nextCat = editChannelCategory === '__none__' ? undefined : editChannelCategory;
    const movedCategory = (current?.categoryId || undefined) !== nextCat;
    const tail = movedCategory ? channelsOf(nextCat || null).filter(c => c.id !== id).length : 0;
    await saveChannels(channels.map(c => c.id === id
      ? { ...c, name, categoryId: nextCat, ...(movedCategory ? { sortOrder: tail } : {}) }
      : c));
    setEditChannelId(null);
  };

  const deleteChannel = async (id: string) => {
    await store.remove(chatMsgKey(id));
    await saveChannels(channels.filter(c => c.id !== id));
    if (activeChannelId === id) setActiveChannelId(activeChannels.find(c => c.id !== id)?.id || null);
    setConfirmDelete(null);
  };

  const archiveChannel = async (id: string) => {
    await saveChannels(channels.map(c => c.id === id ? { ...c, archived: true, archivedAt: Date.now() } : c));
    if (activeChannelId === id) setActiveChannelId(activeChannels.find(c => c.id !== id)?.id || null);
  };

  const saveCategories = async (cats: ChatCategory[]) => {
    await store.set(KEYS.chatCategories, cats);
    onUpdate();
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const cat: ChatCategory = { id: uid(), name, sortOrder: sortedCategories.length, createdAt: Date.now() };
    await saveCategories([...categories, cat]);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const renameCategory = async (id: string) => {
    const name = editCategoryName.trim();
    if (!name) return;
    await saveCategories(categories.map(c => c.id === id ? { ...c, name } : c));
    setEditCategoryId(null);
  };

  const toggleCategory = async (id: string) => {
    await saveCategories(categories.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  };

  const deleteCategory = async (id: string) => {
    const inside = channels.filter(c => c.categoryId === id);
    if (inside.length > 0) {
      let next = uncategorized.length;
      const moved = new Map(inside.map(c => [c.id, next++] as const));
      await saveChannels(channels.map(c => moved.has(c.id) ? { ...c, categoryId: undefined, sortOrder: moved.get(c.id) } : c));
    }
    await saveCategories(categories.filter(c => c.id !== id));
    setConfirmDeleteCategory(null);
  };


  const onDragEnd = async (e: DragEndEvent) => {
    const { active: dragged, over } = e;
    if (!over || dragged.id === over.id) return;
    const draggedId = String(dragged.id);
    const overId = String(over.id);

    const catFrom = sortedCategories.findIndex(c => c.id === draggedId);
    if (catFrom >= 0) {
      const catTo = sortedCategories.findIndex(c => c.id === overId);
      if (catTo < 0) return;
      const ordered = arrayMove(sortedCategories, catFrom, catTo);
      const pos = new Map(ordered.map((c, i) => [c.id, i] as const));
      await saveCategories(categories.map(c => pos.has(c.id) ? { ...c, sortOrder: pos.get(c.id) } : c));
      return;
    }

    const ch = channels.find(c => c.id === draggedId);
    if (!ch) return;
    const list = channelsOf(ch.categoryId);
    const from = list.findIndex(c => c.id === draggedId);
    const to = list.findIndex(c => c.id === overId);
    if (from < 0 || to < 0) return;
    const ordered = arrayMove(list, from, to);
    const pos = new Map(ordered.map((c, i) => [c.id, i] as const));
    await saveChannels(channels.map(c => pos.has(c.id) ? { ...c, sortOrder: pos.get(c.id) } : c));
  };


  const insertFormat = (before: string, after: string) => {
    setInput(prev => prev + before + (after ? 'text' : '') + after);
  };

  const openChannelEditor = (ch: ChatChannel) => {
    setEditChannelId(ch.id);
    setEditChannelName(ch.name);
    setEditChannelCategory(ch.categoryId || '__none__');
  };

  const renderChannelRow = (ch: ChatChannel) => (
    <SortableCard key={ch.id} id={ch.id} label={ch.name} disabled={!reorderActive}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer',
        background: activeChannelId === ch.id ? 'var(--accent-bg)' : 'transparent',
        borderLeft: activeChannelId === ch.id ? '3px solid var(--accent)' : '3px solid transparent',
      }} {...clickable(() => setActiveChannelId(ch.id), ch.name)}
        onContextMenu={e => { e.preventDefault(); openChannelEditor(ch); }}>
        <span style={{
          color: activeChannelId === ch.id ? 'var(--accent)' : 'var(--dim)', fontSize: 13,
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          # {ch.name}
        </span>
      </div>
    </SortableCard>
  );


  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--surface)',
      }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--dim)', fontWeight: 600 }}>{t('chat.channels', {defaultValue: 'Channels'})}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button type="button" role="switch" aria-checked={reorderActive}
                aria-label={t('common.reorderLock', { defaultValue: 'Drag reordering' })}
                title={t('common.reorderLock', { defaultValue: 'Drag reordering' })}
                onClick={() => setReorderLocked(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 13, lineHeight: 1, opacity: reorderLocked ? 0.35 : 1 }}>🤏</button>
              <button aria-label={t('chat.newCategory')} title={t('chat.newCategory')}
                style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 13, padding: 2 }}
                onClick={() => setShowNewCategory(true)}>🗂</button>
              <button aria-label={t('common.add')} title={t('chat.newChannel')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, padding: 2 }}
                onClick={() => setShowNewChannel(true)}>+</button>
            </div>
          </div>
        </div>

        <div className="chan-list" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            {sortedCategories.length > 0 && uncategorized.length > 0 && (
              <div style={{ padding: '6px 12px 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', fontWeight: 600 }}>
                {t('chat.uncategorized')}
              </div>
            )}
            <SortableContext items={uncategorized.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {uncategorized.map(ch => renderChannelRow(ch))}
            </SortableContext>

            <SortableContext items={sortedCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {sortedCategories.map(cat => {
                const list = channelsOf(cat.id);
                return (
                  <SortableCard key={cat.id} id={cat.id} label={cat.name} disabled={!reorderActive}>
                    <div style={{ flex: 1, minWidth: 0, borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 8px 2px 12px' }}>
                        <button onClick={() => toggleCategory(cat.id)} aria-expanded={!cat.collapsed} aria-label={cat.name}
                          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
                          <span aria-hidden style={{ fontSize: 9, color: 'var(--dim)' }}>{cat.collapsed ? '▶' : '▼'}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--dim)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{list.length}</span>
                        </button>
                        <button aria-label={`${t('common.edit')} ${cat.name}`} title={t('common.edit')}
                          style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 11, padding: 2 }}
                          onClick={() => { setEditCategoryId(cat.id); setEditCategoryName(cat.name); }}>✎</button>
                        <button aria-label={`${t('common.delete')} ${cat.name}`} title={t('common.delete')}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11, padding: 2 }}
                          onClick={() => setConfirmDeleteCategory(cat.id)}>✕</button>
                      </div>
                      {!cat.collapsed && (
                        <SortableContext items={list.map(c => c.id)} strategy={verticalListSortingStrategy}>
                          {list.map(ch => renderChannelRow(ch))}
                        </SortableContext>
                      )}
                      {!cat.collapsed && list.length === 0 && (
                        <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{t('chat.categoryEmpty')}</div>
                      )}
                    </div>
                  </SortableCard>
                );
              })}
            </SortableContext>
          </DndContext>

          {archivedChannels.length > 0 && (
            <>
              <button style={{
                display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, cursor: 'pointer', textAlign: 'left',
              }} onClick={() => setShowArchived(!showArchived)}>
                Archived ({archivedChannels.length}) {showArchived ? '▲' : '▼'}
              </button>
              {showArchived && archivedChannels.map(ch => (
                <div key={ch.id} style={{ padding: '6px 12px', cursor: 'pointer', opacity: 0.5 }}
                  {...clickable(() => setActiveChannelId(ch.id), ch.name)}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}># {ch.name}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--dim)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            {t('common.speakingAs')}
          </span>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 8px', background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 6, cursor: 'pointer',
          }} onClick={() => setShowMemberPicker(!showMemberPicker)} aria-expanded={showMemberPicker} aria-label={`${t('common.speakingAs')}${activeMember ? `, ${activeMember.name}` : ''}`}>
            {activeMember && (
              <>
                <div className="tile__avatar" aria-hidden style={{
                  width: 22, height: 22, fontSize: 9, overflow: 'hidden',
                  ...(!activeMember.avatar ? { backgroundColor: activeMember.color, color: initialOn(activeMember.color) } : {}),
                }}>
                  {activeMember.avatar ? <img src={activeMember.avatar} alt="" style={{ width: 22, height: 22, borderRadius: 11, objectFit: 'cover' }} /> : getInitials(activeMember.name)}
                </div>
                <span style={{ fontSize: 12, color: activeMember.color, flex: 1, textAlign: 'left' }}>{activeMember.name}</span>
              </>
            )}
            <span style={{ fontSize: 10, color: 'var(--dim)' }} aria-hidden>▼</span>
          </button>

          {showMemberPicker && (
            <div style={{ marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
              <input className="field__input" value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                aria-label={t('common.search', {defaultValue: 'Search…'})} placeholder={t('common.search', {defaultValue: 'Search…'})} style={{ fontSize: 11, padding: '6px 8px', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)' }} />
              {(() => {
                const q = memberSearch.toLowerCase();
                const match = (m: Member) => !m.archived && !m.isCustomFront && !m.deleted && (!memberSearch || memberMatchesSearch(m, q));
                const row = (m: Member) => (
                  <button key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
                    background: m.id === activeMemberId ? `${m.color}15` : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }} onClick={() => { setActiveMemberId(m.id); setShowMemberPicker(false); setMemberSearch(''); }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                    <span style={{ fontSize: 12, color: m.id === activeMemberId ? m.color : 'var(--dim)' }}>{m.name}</span>
                  </button>
                );
                const facets = members.filter(m => m.isFacet && match(m));
                const roster = frontersFirst(members.filter(m => !m.isFacet && match(m)), front);
                return (
                  <>
                    {roster.length > 0 && <div className="field__label" style={{ padding: '8px 8px 2px' }}>{t('members.title')}</div>}
                    {roster.map(row)}
                    {facets.length > 0 && (
                      <>
                        <div className="field__label" style={{ padding: '8px 8px 2px' }}>{t('members.facets')}</div>
                        {facets.map(row)}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeChannel && (
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              # {activeChannel.name}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => openChannelEditor(activeChannel)}>
                {t('common.edit')}
              </button>
              <button className="btn btn--ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => activeChannelId && archiveChannel(activeChannelId)}>
                {t('chat.archiveChannel')}
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!activeChannelId ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              {t('common.selectChannel')}
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              {t('chat.noMessages')}
            </div>
          ) : (
            messages.map(msg => {
              const author = getMember(msg.authorId);
              const replyMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
              const replyAuthor = replyMsg ? getMember(replyMsg.authorId) : null;

              return (
                <div key={msg.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                  <div className="tile__avatar" style={{
                    width: 32, height: 32, fontSize: 12, flexShrink: 0, marginTop: 2, overflow: 'hidden',
                    ...(!author?.avatar ? { backgroundColor: author?.color || 'var(--muted)', color: initialOn(author?.color || '#888888') } : {}),
                  }}>
                    {author?.avatar ? <img src={author.avatar} alt="" style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover' }} /> : getInitials(author?.name || '?')}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: author?.color || 'var(--text)' }}>{author?.name || 'Unknown'}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtTime(msg.timestamp)}</span>
                    </div>

                    {replyMsg && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', borderLeft: `2px solid ${replyAuthor?.color || 'var(--border)'}`, paddingLeft: 8, marginBottom: 4, marginTop: 2 }}>
                        <span style={{ color: replyAuthor?.color || 'var(--dim)' }}>{replyAuthor?.name}</span>
                        {': '}{replyMsg.content.slice(0, 80)}{replyMsg.content.length > 80 ? '...' : ''}
                      </div>
                    )}

                    {msg.type === 'image' ? (
                      <img src={msg.content} alt="" style={{ maxWidth: 300, maxHeight: 300, borderRadius: 8, marginTop: 4 }} />
                    ) : (
                      <MarkdownText text={msg.content} members={members} />
                    )}

                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                          <button key={emoji} aria-pressed={(userIds as string[]).includes(activeMemberId || '')} style={{
                            padding: '2px 6px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                            background: (userIds as string[]).includes(activeMemberId || '') ? 'var(--accent-bg)' : 'var(--surface)',
                            border: `1px solid ${(userIds as string[]).includes(activeMemberId || '') ? 'var(--accent)' : 'var(--border)'}`,
                          }} onClick={() => addReaction(msg.id, emoji)}>
                            {emoji} {(userIds as string[]).length}
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 4, marginTop: 4, opacity: 0.4, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
                      <button style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--dim)', cursor: 'pointer' }}
                        onClick={() => setReplyTo(msg)}><span aria-hidden>↩ </span>{t('chat.reply', {defaultValue: 'Reply'})}</button>
                      {(msg.type === 'text' || msg.type === 'reply') && (
                        <button style={{ background: 'none', border: 'none', fontSize: 11, color: editingMessageId === msg.id ? 'var(--accent)' : 'var(--dim)', cursor: 'pointer' }}
                          onClick={() => startEditMessage(msg)}><span aria-hidden>✎ </span>{t('common.edit')}</button>
                      )}
                      <button aria-label={t('chat.addReaction', {defaultValue: 'Add reaction'})} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--dim)', cursor: 'pointer' }}
                        onClick={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)}>😊</button>
                    </div>

                    {showEmojiFor === msg.id && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {EMOJI_QUICK.map(e => (
                          <button key={e} style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                            onClick={() => addReaction(msg.id, e)}>{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={msgEndRef} />
        </div>

        {activeChannelId && !activeChannel?.archived && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            {replyTo && !editingMessageId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--muted)' }}>
                <span>{t('chat.replyingTo', {defaultValue: 'Replying to'})} <strong style={{ color: getMember(replyTo.authorId)?.color }}>{getMember(replyTo.authorId)?.name}</strong></span>
                <button aria-label={t('common.cancel')} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11 }}
                  onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            {editingMessageId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>✎ {t('chat.editingHeader')}</span>
                <button aria-label={t('common.cancel')} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11 }}
                  onClick={cancelEditMessage}>✕</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {[['**', '**'], ['*', '*'], ['~~', '~~'], ['`', '`'], ['> ', ''], ['- ', ''], ['# ', '']].map(([b, a], i) => {
                const labels = ['B', 'I', 'S', '<>', '❝', '•', 'H'];
                const names = ['markdown.toolBold', 'markdown.toolItalic', 'markdown.toolStrike', 'markdown.toolCode', 'markdown.toolQuote', 'markdown.toolBullets', 'markdown.toolH1'];
                return (
                  <button key={i} aria-label={t(names[i])} title={t(names[i])} style={{
                    padding: '2px 8px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--dim)', cursor: 'pointer',
                    fontWeight: i === 0 ? 700 : 400, fontStyle: i === 1 ? 'italic' : 'normal',
                    textDecoration: i === 2 ? 'line-through' : 'none',
                    fontFamily: i === 3 ? 'monospace' : 'inherit',
                  }} onClick={() => insertFormat(b, a)}>{labels[i]}</button>
                );
              })}
              <button aria-label={t('chat.attachFile', {defaultValue: 'Attach file'})} style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--dim)', cursor: 'pointer' }}
                onClick={sendImage}>📷</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <textarea className="field__input" value={input} onChange={e => setInput(e.target.value)}
                aria-label={editingMessageId ? t('chat.editPlaceholder') : t('chat.messagePlaceholder', {name: activeChannel?.name || '', defaultValue: 'Message #{{name}}...'})}
                placeholder={editingMessageId ? t('chat.editPlaceholder') : t('chat.messagePlaceholder', {name: activeChannel?.name || '', defaultValue: 'Message #{{name}}...'})}
                style={{ flex: 1, minHeight: 36, maxHeight: 120, resize: 'vertical', fontSize: 13 }}
                onPaste={e => {
                  if (!activeChannelId || !activeMemberId) return;
                  const item = Array.from(e.clipboardData?.items || []).find(x => x.type.startsWith('image/'));
                  if (!item) return;
                  const file = item.getAsFile();
                  if (!file) return;
                  e.preventDefault();
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const msg: ChatMessage = {
                      id: uid(), channelId: activeChannelId, authorId: activeMemberId,
                      type: 'image', content: reader.result as string, timestamp: Date.now(),
                    };
                    await saveMessages(activeChannelId, [...messages, msg]);
                  };
                  reader.readAsDataURL(file);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editingMessageId) { saveEditedMessage(); } else { sendMessage(); } }
                  if (e.key === 'Escape' && editingMessageId) { e.preventDefault(); cancelEditMessage(); }
                }} />
              <Btn variant="solid" onClick={editingMessageId ? saveEditedMessage : sendMessage}>{editingMessageId ? t('common.save') : t('chat.send', {defaultValue: 'Send'})}</Btn>
            </div>
          </div>
        )}
      </div>


      <Modal open={showNewChannel} title={t('chat.newChannel')} onClose={() => setShowNewChannel(false)}
        footer={<Btn onClick={createChannel}>{t('common.add')}</Btn>}>
        <Field label={t('chat.channelName')} value={newChannelName} onChange={setNewChannelName} placeholder={t('common.channelNameExample')} />
      </Modal>

      <Modal open={!!editChannelId} title={t('chat.channelName')} onClose={() => setEditChannelId(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <Btn variant="danger" onClick={() => { setConfirmDelete(editChannelId); setEditChannelId(null); }}>{t('common.delete')}</Btn>
            <Btn onClick={() => editChannelId && renameChannel(editChannelId)}>{t('common.save')}</Btn>
          </div>
        }>
        <Field label={t('chat.channelName')} value={editChannelName} onChange={setEditChannelName} />
        <Dropdown
          label={t('chat.moveToCategory')}
          value={editChannelCategory}
          options={['__none__', ...sortedCategories.map(c => c.id)]}
          onChange={setEditChannelCategory}
          renderOption={v => v === '__none__' ? t('chat.uncategorized') : (categories.find(c => c.id === v)?.name || v)}
        />
      </Modal>

      <Modal open={showNewCategory} title={t('chat.newCategory')} onClose={() => setShowNewCategory(false)}
        footer={<Btn onClick={createCategory}>{t('common.add')}</Btn>}>
        <Field label={t('chat.categoryName')} value={newCategoryName} onChange={setNewCategoryName} />
      </Modal>

      <Modal open={!!editCategoryId} title={t('chat.categoryName')} onClose={() => setEditCategoryId(null)}
        footer={<Btn onClick={() => editCategoryId && renameCategory(editCategoryId)}>{t('common.save')}</Btn>}>
        <Field label={t('chat.categoryName')} value={editCategoryName} onChange={setEditCategoryName} />
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title={t('chat.deleteChannel')}
        message={t('chat.deleteChannelMsg')}
        danger onConfirm={() => confirmDelete && deleteChannel(confirmDelete)}
        onCancel={() => setConfirmDelete(null)} />

      <ConfirmDialog open={!!confirmDeleteCategory} title={t('chat.deleteCategory')}
        message={t('chat.deleteCategoryMsg')}
        danger onConfirm={() => confirmDeleteCategory && deleteCategory(confirmDeleteCategory)}
        onCancel={() => setConfirmDeleteCategory(null)} />
    </div>
  );
}
