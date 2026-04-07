import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Member, ChatChannel, ChatMessage, DEFAULT_CHANNELS,
  uid, getInitials, fmtTime,
} from '../utils';
import { store, KEYS, chatMsgKey } from '../storage';
import { Btn, Field, Modal, ConfirmDialog } from '../components/ui';

interface Props {
  members: Member[];
  channels: ChatChannel[];
  onUpdate: () => void;
}

const EMOJI_QUICK = ['👍', '❤️', '😂', '😢', '😮', '🎉', '✨', '🔥'];

export default function ChatView({ members, channels, onUpdate }: Props) {
  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels.find(c => !c.archived)?.id || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeMemberId, setActiveMemberId] = useState<string | null>(members.find(m => !m.archived)?.id || null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeMember = members.find(m => m.id === activeMemberId);
  const activeChannels = channels.filter(c => !c.archived);
  const archivedChannels = channels.filter(c => c.archived);
  const getMember = (id: string) => members.find(m => m.id === id);

  // ─── Load Messages ──────────────────────────────────────────────────

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

  // ─── Send Message ───────────────────────────────────────────────────

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

  // ─── Reactions ──────────────────────────────────────────────────────

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

  // ─── Channel Management ─────────────────────────────────────────────

  const saveChannels = async (chs: ChatChannel[]) => {
    await store.set(KEYS.chatChannels, chs);
    onUpdate();
  };

  const createChannel = async () => {
    const name = newChannelName.trim();
    if (!name || channels.length >= 100) return;
    const ch: ChatChannel = { id: uid(), name, createdAt: Date.now() };
    await saveChannels([...channels, ch]);
    setNewChannelName(''); setShowNewChannel(false); setActiveChannelId(ch.id);
  };

  const renameChannel = async (id: string) => {
    const name = editChannelName.trim();
    if (!name) return;
    await saveChannels(channels.map(c => c.id === id ? { ...c, name } : c));
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

  // ─── Format Helpers ─────────────────────────────────────────────────

  const insertFormat = (before: string, after: string) => {
    setInput(prev => prev + before + (after ? 'text' : '') + after);
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Channel Sidebar */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--surface)',
      }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--dim)', fontWeight: 600 }}>Channels</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16 }}
              onClick={() => setShowNewChannel(true)}>+</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {activeChannels.map(ch => (
            <div key={ch.id} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer',
              background: activeChannelId === ch.id ? 'var(--accent-bg)' : 'transparent',
              borderLeft: activeChannelId === ch.id ? '3px solid var(--accent)' : '3px solid transparent',
            }} onClick={() => setActiveChannelId(ch.id)}
              onContextMenu={e => { e.preventDefault(); setEditChannelId(ch.id); setEditChannelName(ch.name); }}>
              <span style={{ color: activeChannelId === ch.id ? 'var(--accent)' : 'var(--dim)', fontSize: 13 }}>
                # {ch.name}
              </span>
            </div>
          ))}

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
                  onClick={() => setActiveChannelId(ch.id)}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}># {ch.name}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Active Speaker */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--dim)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Speaking as
          </span>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 8px', background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 6, cursor: 'pointer',
          }} onClick={() => setShowMemberPicker(!showMemberPicker)}>
            {activeMember && (
              <>
                <div className="tile__avatar" style={{
                  width: 22, height: 22, fontSize: 9,
                  ...(activeMember.avatar ? { backgroundImage: `url(${activeMember.avatar})` } : { backgroundColor: activeMember.color }),
                }}>
                  {!activeMember.avatar && getInitials(activeMember.name)}
                </div>
                <span style={{ fontSize: 12, color: activeMember.color, flex: 1, textAlign: 'left' }}>{activeMember.name}</span>
              </>
            )}
            <span style={{ fontSize: 10, color: 'var(--dim)' }}>▼</span>
          </button>

          {showMemberPicker && (
            <div style={{ marginTop: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
              <input className="field__input" value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search..." style={{ fontSize: 11, padding: '6px 8px', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)' }} />
              {members.filter(m => !m.archived && (!memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()))).map(m => (
                <button key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
                  background: m.id === activeMemberId ? `${m.color}15` : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                }} onClick={() => { setActiveMemberId(m.id); setShowMemberPicker(false); setMemberSearch(''); }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                  <span style={{ fontSize: 12, color: m.id === activeMemberId ? m.color : 'var(--dim)' }}>{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Channel header */}
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
                onClick={() => { setEditChannelId(activeChannelId); setEditChannelName(activeChannel.name); }}>
                Rename
              </button>
              <button className="btn btn--ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => activeChannelId && archiveChannel(activeChannelId)}>
                Archive
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!activeChannelId ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              Select a channel to start chatting
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              No messages in #{activeChannel?.name}. Say something!
            </div>
          ) : (
            messages.map(msg => {
              const author = getMember(msg.authorId);
              const replyMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
              const replyAuthor = replyMsg ? getMember(replyMsg.authorId) : null;

              return (
                <div key={msg.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                  <div className="tile__avatar" style={{
                    width: 32, height: 32, fontSize: 12, flexShrink: 0, marginTop: 2,
                    ...(author?.avatar ? { backgroundImage: `url(${author.avatar})` } : { backgroundColor: author?.color || 'var(--muted)' }),
                  }}>
                    {!author?.avatar && getInitials(author?.name || '?')}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: author?.color || 'var(--text)' }}>{author?.name || 'Unknown'}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtTime(msg.timestamp)}</span>
                    </div>

                    {/* Reply reference */}
                    {replyMsg && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', borderLeft: `2px solid ${replyAuthor?.color || 'var(--border)'}`, paddingLeft: 8, marginBottom: 4, marginTop: 2 }}>
                        <span style={{ color: replyAuthor?.color || 'var(--dim)' }}>{replyAuthor?.name}</span>
                        {': '}{replyMsg.content.slice(0, 80)}{replyMsg.content.length > 80 ? '...' : ''}
                      </div>
                    )}

                    {/* Content */}
                    {msg.type === 'image' ? (
                      <img src={msg.content} alt="" style={{ maxWidth: 300, maxHeight: 300, borderRadius: 8, marginTop: 4 }} />
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </div>
                    )}

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                          <button key={emoji} style={{
                            padding: '2px 6px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                            background: (userIds as string[]).includes(activeMemberId || '') ? 'var(--accent-bg)' : 'var(--surface)',
                            border: `1px solid ${(userIds as string[]).includes(activeMemberId || '') ? 'var(--accent)' : 'var(--border)'}`,
                          }} onClick={() => addReaction(msg.id, emoji)}>
                            {emoji} {(userIds as string[]).length}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Message actions */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, opacity: 0.4, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
                      <button style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--dim)', cursor: 'pointer' }}
                        onClick={() => setReplyTo(msg)}>↩ Reply</button>
                      <button style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--dim)', cursor: 'pointer' }}
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

        {/* Input area */}
        {activeChannelId && !activeChannel?.archived && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            {/* Reply indicator */}
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--muted)' }}>
                <span>Replying to <strong style={{ color: getMember(replyTo.authorId)?.color }}>{getMember(replyTo.authorId)?.name}</strong></span>
                <button style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11 }}
                  onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}

            {/* Format bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {[['**', '**'], ['*', '*'], ['~~', '~~'], ['`', '`'], ['> ', ''], ['- ', ''], ['# ', '']].map(([b, a], i) => {
                const labels = ['B', 'I', 'S', '<>', '❝', '•', 'H'];
                return (
                  <button key={i} style={{
                    padding: '2px 8px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--dim)', cursor: 'pointer',
                    fontWeight: i === 0 ? 700 : 400, fontStyle: i === 1 ? 'italic' : 'normal',
                    textDecoration: i === 2 ? 'line-through' : 'none',
                    fontFamily: i === 3 ? 'monospace' : 'inherit',
                  }} onClick={() => insertFormat(b, a)}>{labels[i]}</button>
                );
              })}
              <button style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--dim)', cursor: 'pointer' }}
                onClick={sendImage}>📷</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <textarea className="field__input" value={input} onChange={e => setInput(e.target.value)}
                placeholder={`Message #${activeChannel?.name || ''}...`}
                style={{ flex: 1, minHeight: 36, maxHeight: 120, resize: 'vertical', fontSize: 13 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
              <Btn variant="solid" onClick={sendMessage}>Send</Btn>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modals ──────────────────────────────────────────────────── */}

      {/* New Channel */}
      <Modal open={showNewChannel} title={t('chat.newChannel')} onClose={() => setShowNewChannel(false)}
        footer={<Btn onClick={createChannel}>{t('common.add')}</Btn>}>
        <Field label={t('chat.channelName')} value={newChannelName} onChange={setNewChannelName} placeholder="e.g. Planning" />
      </Modal>

      {/* Rename Channel */}
      <Modal open={!!editChannelId} title={t('chat.channelName')} onClose={() => setEditChannelId(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <Btn variant="danger" onClick={() => { setConfirmDelete(editChannelId); setEditChannelId(null); }}>{t('common.delete')}</Btn>
            <Btn onClick={() => editChannelId && renameChannel(editChannelId)}>{t('common.save')}</Btn>
          </div>
        }>
        <Field label={t('chat.channelName')} value={editChannelName} onChange={setEditChannelName} />
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog open={!!confirmDelete} title={t('chat.deleteChannel')}
        message={t('chat.deleteChannelMsg')}
        danger onConfirm={() => confirmDelete && deleteChannel(confirmDelete)}
        onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
