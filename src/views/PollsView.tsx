import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberPoll, PollOption, uid, fmtTime, isRosterMember } from '../utils';
import { store, KEYS } from '../storage';
import { Btn, Section, Field, Modal, ConfirmDialog } from '../components/ui';
import { useAppStore } from '../store/appStore';

interface Props {
  onUpdate: () => void;
}

export default function PollsView({ onUpdate }: Props) {
  const { t } = useTranslation();
  const members = useAppStore(s => s.state.members);
  const front = useAppStore(s => s.state.front);
  const defaultVoter = () => {
    const votable = new Set(members.filter(m => !m.archived && !m.isCustomFront && !m.deleted).map(m => m.id));
    const fronting = [
      ...(front?.primary?.memberIds || []),
      ...(front?.coFront?.memberIds || []),
      ...(front?.coConscious?.memberIds || []),
    ].find(id => votable.has(id));
    return fronting || members.find(m => !m.archived)?.id || '';
  };
  const [polls, setPolls] = useState<MemberPoll[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [hideVoters, setHideVoters] = useState(false);
  const [creatorId, setCreatorId] = useState<string>(defaultVoter);
  const [targetId, setTargetId] = useState<string>(defaultVoter);
  const [voterId, setVoterId] = useState<string>(defaultVoter);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const activeMembers = members.filter(m => !m.archived && isRosterMember(m));
  const activeFacets = members.filter(m => !m.archived && m.isFacet && !m.isCustomFront && !m.deleted);

  useEffect(() => {
    store.get<MemberPoll[]>(KEYS.polls, []).then(p => setPolls(p || []));
  }, []);

  const savePolls = async (updated: MemberPoll[]) => {
    setPolls(updated);
    await store.set(KEYS.polls, updated);
    onUpdate();
  };

  const createPoll = () => {
    if (!question.trim() || options.filter(o => o.trim()).length < 2) return;
    const poll: MemberPoll = {
      id: uid(), targetMemberId: targetId, question: question.trim(),
      options: options.filter(o => o.trim()).map(o => ({ id: uid(), label: o.trim(), votes: [] })),
      createdBy: creatorId, createdAt: Date.now(), hideVoterNames: hideVoters || undefined,
    };
    savePolls([...polls, poll]);
    setShowCreate(false); setQuestion(''); setOptions(['', '']); setHideVoters(false);
  };

  const vote = (pollId: string, optionId: string) => {
    if (!voterId) return;
    savePolls(polls.map(p => {
      if (p.id !== pollId) return p;
      const alreadyVoted = p.options.some(o => o.id === optionId && o.votes.includes(voterId));
      const opts = p.options.map(o => {
        const without = o.votes.filter(v => v !== voterId);
        return o.id === optionId && !alreadyVoted ? { ...o, votes: [...without, voterId] } : { ...o, votes: without };
      });
      return { ...p, options: opts };
    }));
  };

  const toggleClose = (pollId: string) => {
    savePolls(polls.map(p => p.id === pollId ? { ...p, closedAt: p.closedAt ? undefined : Date.now() } : p));
  };

  const deletePoll = (id: string) => {
    savePolls(polls.filter(p => p.id !== id));
    setConfirmDelete(null);
  };

  const getName = (id: string) => members.find(m => m.id === id)?.name || '?';

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>{t('polls.votingAs')}</span>
        <select style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
          aria-label={t('polls.votingAs')} value={voterId} onChange={e => setVoterId(e.target.value)}>
          {activeMembers.length > 0 && (
            <optgroup label={t('members.title')}>
              {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
          )}
          {activeFacets.length > 0 && (
            <optgroup label={t('members.facets')}>
              {activeFacets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
          )}
        </select>
        <div style={{ marginLeft: 'auto' }}>
          <Btn variant="solid" onClick={() => setShowCreate(true)}>{t('polls.createPoll')}</Btn>
        </div>
      </div>

      {polls.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {polls.map(poll => {
            const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
            const isClosed = !!poll.closedAt;
            return (
              <div key={poll.id} style={{ padding: 16, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{poll.question}</span>
                  {isClosed && <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase' }}>{t('polls.closed')}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                  {poll.hideVoterNames ? '' : `${t('noteboard.by', { name: getName(poll.createdBy) })} · `}{fmtTime(poll.createdAt)} · {t('polls.votes', { count: totalVotes })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {poll.options.map(opt => {
                    const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                    const voted = opt.votes.includes(voterId);
                    return (
                      <button key={opt.id} style={{
                        position: 'relative', padding: '10px 14px', borderRadius: 8,
                        border: `1px solid ${voted ? 'var(--accent)' : 'var(--border)'}`,
                        background: 'var(--surface)', cursor: isClosed ? 'default' : 'pointer',
                        textAlign: 'left', overflow: 'hidden',
                      }}
                        onClick={() => !isClosed && vote(poll.id, opt.id)}
                        aria-pressed={voted}
                        disabled={isClosed}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${pct}%`,
                          background: voted ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'color-mix(in srgb, var(--muted) 28%, transparent)',
                          transition: 'width 0.3s ease',
                        }} />
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: voted ? 'var(--accent)' : 'var(--text)', fontWeight: voted ? 600 : 400 }}>{opt.label}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                        </div>
                        {!poll.hideVoterNames && opt.votes.length > 0 && (
                          <div style={{ position: 'relative', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                            {opt.votes.map(v => getName(v)).join(', ')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}
                    onClick={() => toggleClose(poll.id)}>
                    {isClosed ? t('polls.reopenPoll') : t('polls.closePoll')}
                  </button>
                  <button style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--danger)', cursor: 'pointer' }}
                    onClick={() => setConfirmDelete(poll.id)}>
                    {t('polls.deletePoll')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>{t('polls.noPolls')}</div>
      )}

      <Modal open={showCreate} title={t('polls.createPoll')} onClose={() => setShowCreate(false)}
        footer={<Btn variant="solid" onClick={createPoll}>{t('common.add')}</Btn>}>
        <div style={{ marginBottom: 12 }}>
          <label className="field__label">{t('polls.forMember')}</label>
          <select style={{ width: '100%', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 13 }}
            aria-label={t('polls.forMember')} value={targetId} onChange={e => setTargetId(e.target.value)}>
            {activeMembers.length > 0 && (
              <optgroup label={t('members.title')}>
                {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
            {activeFacets.length > 0 && (
              <optgroup label={t('members.facets')}>
                {activeFacets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <Field label={t('polls.question')} value={question} onChange={setQuestion} placeholder={t('polls.questionPlaceholder')} />
        <Section label={t('polls.optionsLabel')} />
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input className="field__input" value={opt} onChange={e => { const u = [...options]; u[i] = e.target.value; setOptions(u); }}
              aria-label={t('polls.optionPlaceholder')} placeholder={`${t('polls.optionPlaceholder')} ${i + 1}`} style={{ flex: 1 }} />
            {options.length > 2 && (
              <button aria-label={t('polls.removeOption', {defaultValue: 'Remove option'})} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}
                onClick={() => setOptions(options.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
        ))}
        <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: '6px 0' }}
          onClick={() => setOptions([...options, ''])}>{t('polls.addOption')}</button>
        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideVoters} onChange={e => setHideVoters(e.target.checked)} />
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>{t('polls.hideVoters')}</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} title={t('polls.deletePoll')} message={t('polls.deletePollMsg')}
        danger onConfirm={() => confirmDelete && deletePoll(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
