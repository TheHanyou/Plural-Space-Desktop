import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, Dropdown, Modal, ConfirmDialog } from '../components/ui';
import { NoteboardEntry, uid, fmtTime, getInitials, nameCompare } from '../utils';
import { store, KEYS } from '../storage';
import { NetworkManager } from '../network/NetworkManager';
import { useAppStore } from '../store/appStore';

interface Props { onUpdate?: () => void; }

const ALL_RECIPIENTS = '*';

export default function MailboxView({ onUpdate }: Props) {
  const { t } = useTranslation();
  const members = useAppStore(s => s.state.members);
  const [notes, setNotes] = useState<NoteboardEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [lockManage, setLockManage] = useState(false);
  const [lockInput, setLockInput] = useState('');
  const [confirmUnlockRemove, setConfirmUnlockRemove] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState<string>('');
  const [composeFrom, setComposeFrom] = useState<string>('');
  const [composeBody, setComposeBody] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<NoteboardEntry | null>(null);

  const activeMembers = useMemo(
    () => members.filter(m => !m.isCustomFront && !m.isFacet && !m.deleted).sort((a, b) => nameCompare(a.name, b.name)),
    [members],
  );
  const activeFacets = useMemo(
    () => members.filter(m => !m.isCustomFront && m.isFacet && !m.deleted).sort((a, b) => nameCompare(a.name, b.name)),
    [members],
  );
  const nameOf = (id: string) => members.find(m => m.id === id)?.name || '?';

  useEffect(() => { store.get<NoteboardEntry[]>(KEYS.noteboards, []).then(n => setNotes(n || [])); }, []);

  const save = async (updated: NoteboardEntry[]) => {
    setNotes(updated);
    await store.set(KEYS.noteboards, updated);
    NetworkManager.notifyDataChanged();
  };

  const reallyOpen = (memberId: string) => {
    setOpenId(memberId);
    let changed = false;
    const updated = notes.map(n => {
      if (n.memberId === memberId && n.read !== true) { changed = true; return { ...n, read: true }; }
      return n;
    });
    if (changed) save(updated);
  };

  const openMailbox = (memberId: string) => {
    const m = members.find(x => x.id === memberId);
    if (m?.mailboxPassword && !unlockedIds.has(memberId)) {
      setPwInput('');
      setPwError(false);
      setPwFor(memberId);
      return;
    }
    reallyOpen(memberId);
  };

  const submitUnlock = () => {
    if (!pwFor) return;
    const m = members.find(x => x.id === pwFor);
    if (pwInput === (m?.mailboxPassword || '')) {
      setUnlockedIds(prev => new Set(prev).add(pwFor));
      reallyOpen(pwFor);
      setPwFor(null);
      setPwInput('');
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  const setMailboxPassword = async (memberId: string, password?: string) => {
    const updated = members.map(m => (m.id === memberId ? { ...m, mailboxPassword: password } : m));
    await store.set(KEYS.members, updated);
    NetworkManager.notifyDataChanged();
    onUpdate?.();
  };

  const submitLock = () => {
    if (!openId) return;
    const owner = members.find(x => x.id === openId);
    const next = lockInput.trim();
    if (!next && owner?.mailboxPassword) {
      setConfirmUnlockRemove(true);
      return;
    }
    if (next) {
      setMailboxPassword(openId, next);
      setUnlockedIds(prev => new Set(prev).add(openId));
    }
    setLockManage(false);
    setLockInput('');
  };

  const sendMessage = async () => {
    if (!composeTo || !composeFrom || !composeBody.trim()) return;
    const targets = composeTo === ALL_RECIPIENTS ? activeMembers.map(m => m.id).filter(id => id !== composeFrom) : [composeTo];
    if (targets.length === 0) return;
    const body = composeBody.trim();
    const now = Date.now();
    const entries: NoteboardEntry[] = targets.map(id => ({
      id: uid(),
      memberId: id,
      authorId: composeFrom,
      content: body,
      timestamp: now,
      read: composeFrom === id,
    }));
    await save([...entries, ...notes]);
    setShowCompose(false);
    setComposeBody('');
  };

  const startReply = (msg: NoteboardEntry) => {
    setComposeTo(msg.authorId);
    setComposeFrom(msg.memberId);
    setComposeBody('');
    setShowCompose(true);
  };

  const mailboxes = useMemo(() => {
    const byMember = new Map<string, { count: number; unread: number; latest: number }>();
    notes.forEach(n => {
      const cur = byMember.get(n.memberId) || { count: 0, unread: 0, latest: 0 };
      cur.count += 1;
      if (!n.read) cur.unread += 1;
      cur.latest = Math.max(cur.latest, n.timestamp);
      byMember.set(n.memberId, cur);
    });
    return [...byMember.entries()]
      .map(([id, v]) => ({ id, name: nameOf(id), ...v }))
      .sort((a, b) => b.unread - a.unread || b.latest - a.latest);
  }, [notes, members]);

  const openMessages = useMemo(
    () => openId
      ? notes.filter(n => n.memberId === openId).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.timestamp - a.timestamp)
      : [],
    [notes, openId],
  );

  const memberOptions = [...activeMembers.map(m => m.id), ...activeFacets.map(m => m.id)];
  const recipientOptions = activeMembers.length > 0 ? [ALL_RECIPIENTS, ...memberOptions] : memberOptions;
  const renderMemberOption = (id: string) => nameOf(id);
  const renderRecipientOption = (id: string) =>
    id === ALL_RECIPIENTS ? `${t('mailbox.everyone')} (${activeMembers.length})` : nameOf(id);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn onClick={() => { setComposeTo(activeMembers[0]?.id || ''); setComposeFrom(activeMembers[1]?.id || activeMembers[0]?.id || ''); setComposeBody(''); setShowCompose(true); }}>
          {t('mailbox.compose')}
        </Btn>
      </div>

      {openId === null ? (
        mailboxes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '32px 0' }}>{t('mailbox.empty')}</p>
        ) : (
          mailboxes.map(mb => (
            <div key={mb.id} role="button" tabIndex={0}
              onClick={() => openMailbox(mb.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMailbox(mb.id); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, cursor: 'pointer', background: 'var(--card)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--accent)', flexShrink: 0 }} aria-hidden>
                {getInitials(mb.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mb.name}{members.find(x => x.id === mb.id)?.mailboxPassword ? ' 🔒' : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('mailbox.messageCount', { count: mb.count })}</div>
              </div>
              {mb.unread > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '3px 9px' }}>
                  {t('mailbox.unreadCount', { count: mb.unread })}
                </span>
              )}
            </div>
          ))
        )
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Btn variant="ghost" aria-label={t('common.back')} onClick={() => setOpenId(null)}>←</Btn>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)', flex: 1 }}>{t('mailbox.inboxOf', { name: nameOf(openId) })}</h3>
            <Btn variant="ghost" aria-label={t('mailbox.lockTitle')} aria-pressed={!!members.find(x => x.id === openId)?.mailboxPassword} onClick={() => { setLockInput(''); setLockManage(true); }}>
              {members.find(x => x.id === openId)?.mailboxPassword ? '🔒' : '🔓'}
            </Btn>
          </div>
          {openMessages.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '32px 0' }}>{t('mailbox.emptyInbox')}</p>
          ) : (
            openMessages.map(msg => (
              <div key={msg.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, background: 'var(--card)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  {msg.pinned && <span aria-hidden>📌</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{t('mailbox.from')}: {nameOf(msg.authorId)}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{fmtTime(msg.timestamp)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <Btn variant="ghost" onClick={() => startReply(msg)}>{t('mailbox.replyFrom', { name: nameOf(msg.authorId) })}</Btn>
                  <button
                    className="btn btn--danger"
                    aria-label={`${t('mailbox.deleteTitle')} — ${nameOf(msg.authorId)}`}
                    onClick={() => setDeleteTarget(msg)}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}

      <Modal
        open={showCompose}
        title={t('mailbox.compose')}
        onClose={() => setShowCompose(false)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setShowCompose(false)}>{t('common.cancel')}</Btn>
            <Btn onClick={sendMessage} disabled={!composeTo || !composeFrom || !composeBody.trim()}>{t('mailbox.send')}</Btn>
          </div>
        }>
        <Dropdown value={composeTo} options={recipientOptions} onChange={setComposeTo} label={t('mailbox.to')} renderOption={renderRecipientOption} />
        <Dropdown value={composeFrom} options={memberOptions} onChange={setComposeFrom} label={t('mailbox.from')} renderOption={renderMemberOption} />
        <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 0 4px' }}>
          {t('mailbox.title')}
          <textarea
            value={composeBody}
            onChange={e => setComposeBody(e.target.value)}
            aria-label={t('mailbox.messagePlaceholder')} placeholder={t('mailbox.messagePlaceholder')}
            rows={5}
            style={{ display: 'block', width: '100%', marginTop: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('mailbox.deleteTitle')}
        message={t('mailbox.deleteMsg')}
        danger
        onConfirm={() => { const m = deleteTarget!; setDeleteTarget(null); save(notes.filter(n => n.id !== m.id)); }}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        open={!!pwFor}
        title={`🔒 ${nameOf(pwFor || '')}`}
        onClose={() => { setPwFor(null); setPwInput(''); setPwError(false); }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setPwFor(null); setPwInput(''); setPwError(false); }}>{t('common.cancel')}</Btn>
            <Btn onClick={submitUnlock}>{t('journal.unlock')}</Btn>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginTop: 0 }}>{t('mailbox.lockedPrompt')}</p>
        <input
          type="password"
          value={pwInput}
          onChange={e => { setPwInput(e.target.value); setPwError(false); }}
          onKeyDown={e => { if (e.key === 'Enter') submitUnlock(); }}
          placeholder={t('journal.password')}
          aria-label={t('journal.password')}
          style={{ display: 'block', width: '100%', background: 'var(--bg)', color: 'var(--text)', border: `1px solid ${pwError ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 8, padding: 10, fontSize: 13 }}
        />
        {pwError && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 0 }}>{t('journal.incorrectPassword')}</p>}
      </Modal>

      <Modal
        open={lockManage}
        title={t('mailbox.lockTitle')}
        onClose={() => { setLockManage(false); setLockInput(''); }}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setLockManage(false); setLockInput(''); }}>{t('common.cancel')}</Btn>
            <Btn onClick={submitLock}>{t('common.save')}</Btn>
          </div>
        }>
        <p style={{ fontSize: 13, color: 'var(--dim)', marginTop: 0 }}>{t('mailbox.lockHint')}</p>
        <input
          type="password"
          value={lockInput}
          onChange={e => setLockInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitLock(); }}
          placeholder={t('journal.password')}
          aria-label={t('journal.password')}
          style={{ display: 'block', width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13 }}
        />
      </Modal>

      <ConfirmDialog
        open={confirmUnlockRemove}
        title={t('mailbox.lockTitle')}
        message={t('mailbox.removeLockMsg')}
        danger
        onConfirm={() => {
          setConfirmUnlockRemove(false);
          if (openId) setMailboxPassword(openId, undefined);
          setLockManage(false);
          setLockInput('');
        }}
        onCancel={() => setConfirmUnlockRemove(false)}
      />
    </div>
  );
}
