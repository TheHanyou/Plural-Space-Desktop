import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Member, uid, getInitials, allFrontMemberIds, resizeBannerDataUrl } from '../utils';
import { PALETTE, initialOn } from '../theme';
import { store, KEYS } from '../storage';
import { useAppStore } from '../store/appStore';
import { Btn, Field, Section, Modal, ConfirmDialog, clickable } from '../components/ui';
import { ColorCarousel } from '../components/ColorCarousel';
import { chooseImageTreatment } from '../components/ImageCropModal';
import { CustomHexEntry } from '../components/CustomHexEntry';

type SubTab = 'profile' | 'statuses';

interface Props {
  member?: Member;
  statuses: Member[];
  onUpdate: () => void;
  onEnsureSelf: () => Promise<Member>;
}

export default function ProfileView({ member, statuses, onUpdate, onEnsureSelf }: Props) {
  const front = useAppStore(s => s.state.front);
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTab>('profile');
  const [editingProfile, setEditingProfile] = useState<Member | null>(null);
  const [editingStatus, setEditingStatus] = useState<Member | null>(null);
  const [isNewStatus, setIsNewStatus] = useState(false);
  const [confirmDeleteStatus, setConfirmDeleteStatus] = useState<string | null>(null);
  const [f, setF] = useState<Member>({ id: '', name: '', pronouns: '', role: '', color: PALETTE[0], description: '' });

  const activeIds = allFrontMemberIds(front);
  const set = (k: keyof Member, v: any) => setF(x => ({ ...x, [k]: v }));

  const openEditProfile = async () => {
    const self = await onEnsureSelf();
    setF({ ...self });
    setEditingProfile(self);
  };

  const openNewStatus = () => {
    const m: Member = { id: uid(), name: '', pronouns: '', role: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)], description: '', isCustomFront: true, createdAt: Date.now() };
    setF(m); setIsNewStatus(true); setEditingStatus(m);
  };

  const openEditStatus = (m: Member) => {
    setF({ ...m });
    setIsNewStatus(false);
    setEditingStatus(m);
  };

  const saveProfile = async () => {
    if (!f.name.trim()) return;
    const all = await store.get<Member[]>(KEYS.members, []) || [];
    const updated = all.map(m => m.id === f.id ? { ...f, isCustomFront: false } : m);
    await store.set(KEYS.members, updated);
    setEditingProfile(null);
    onUpdate();
  };

  const saveStatus = async () => {
    if (!f.name.trim()) return;
    const all = await store.get<Member[]>(KEYS.members, []) || [];
    const entry = { ...f, isCustomFront: true };
    const updated = isNewStatus ? [...all, entry] : all.map(m => m.id === entry.id ? entry : m);
    await store.set(KEYS.members, updated);
    setEditingStatus(null);
    onUpdate();
  };

  const deleteStatus = async (id: string) => {
    const all = await store.get<Member[]>(KEYS.members, []) || [];
    await store.set(KEYS.members, all.filter(m => m.id !== id));
    setConfirmDeleteStatus(null);
    setEditingStatus(null);
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
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, fontStyle: 'italic', color: 'var(--text)' }}>
          {t('tabs.profile')}
        </span>
        {subTab === 'profile' ? (
          <Btn variant="solid" onClick={openEditProfile}>{t('common.edit')}</Btn>
        ) : (
          <Btn variant="solid" onClick={openNewStatus}>{t('profile.addStatus')}</Btn>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, margin: '8px 0 16px', borderBottom: '1px solid var(--border)' }}>
        {(['profile', 'statuses'] as SubTab[]).map(id => (
          <button key={id} onClick={() => setSubTab(id)} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: subTab === id ? 600 : 400, cursor: 'pointer',
            color: subTab === id ? 'var(--accent)' : 'var(--dim)', background: 'none', border: 'none',
            borderBottom: `2px solid ${subTab === id ? 'var(--accent)' : 'transparent'}`,
          }}>
            {id === 'profile' ? t('tabs.profile') : t('profile.statuses')}
          </button>
        ))}
      </div>

      {subTab === 'profile' && (
        <div>
          {member?.banner && (
            <img src={member.banner} alt="" style={{ width: '100%', aspectRatio: '3', objectFit: 'cover', borderRadius: 'var(--radius)' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: member?.banner ? -36 : 0, marginBottom: 14 }}>
            {member?.avatar ? (
              <img src={member.avatar} alt="" style={{ width: 88, height: 88, borderRadius: 20, objectFit: 'cover', border: `2px solid ${member.color || 'var(--accent)'}` }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: 20, background: member?.color || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.15)' }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: 'rgba(0,0,0,0.75)' }}>{getInitials(member?.name || '?')}</span>
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginTop: 10, textAlign: 'center' }}>
              {member?.name || t('profile.notSetUp')}
            </div>
            {member?.pronouns && <div style={{ fontSize: 14, color: 'var(--dim)', marginTop: 3 }}>{member.pronouns}</div>}
            {member && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 600 }}>{t('profile.favoriteColor')}</span>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: member.color || 'var(--accent)', border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block' }} />
              </div>
            )}
          </div>

          <div style={{ padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            {member?.description ? (
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{member.description}</div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('profile.noDescription')}</span>
            )}
          </div>
        </div>
      )}

      {subTab === 'statuses' && (
        <div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>{t('profile.statusesDesc')}</p>
          {statuses.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('profile.noStatuses')}</span>
            </div>
          ) : (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {statuses.map((m, i) => {
                const active = activeIds.includes(m.id);
                return (
                  <button key={m.id} onClick={() => openEditStatus(m)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: i === statuses.length - 1 ? 'none' : '1px solid var(--border)',
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    {active && (
                      <span style={{ padding: '3px 8px', borderRadius: 999, background: 'var(--success-bg)', border: '1px solid var(--success)', fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>
                        {t('profile.activeStatus')}
                      </span>
                    )}
                    <span aria-hidden style={{ fontSize: 12, color: 'var(--muted)' }}>›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal open={!!editingProfile} title={t('profile.edit')} onClose={() => setEditingProfile(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setEditingProfile(null)}>{t('common.cancel')}</Btn>
            <Btn variant="solid" onClick={saveProfile}>{t('common.save')}</Btn>
          </div>
        }>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="tile__avatar" style={{
            width: 72, height: 72, borderRadius: 36, fontSize: 24, margin: '0 auto', cursor: 'pointer',
            border: `2px solid ${f.color}`, overflow: 'hidden',
            ...(!f.avatar ? { backgroundColor: f.color, color: initialOn(f.color) } : {}),
          }} {...clickable(pickAvatar, t('modal.changePfp'))}>
            {f.avatar ? <img src={f.avatar} alt="" style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover' }} /> : getInitials(f.name || '?')}
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button aria-label={t('modal.changePfp', {defaultValue: 'Change profile picture'})} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={pickAvatar}>📷</button>
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
          }} {...clickable(pickBanner, t('memberProfile.changeBanner'))}>
            {!f.banner && t('memberProfile.changeBanner')}
          </div>
          {f.banner && <button style={{ fontSize: 10, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}
            onClick={() => set('banner', undefined)}>{t('memberProfile.removeBanner')}</button>}
        </div>

        <Field label={t('modal.name')} value={f.name} onChange={v => set('name', v)} placeholder={t('modal.headmateName')} />
        <Field label={t('modal.pronouns')} value={f.pronouns} onChange={v => set('pronouns', v)} placeholder={t('modal.pronounsPlaceholder')} />
        <Section label={t('profile.favoriteColor')} />
        <ColorCarousel value={f.color} onChange={v => set('color', v)} />
        <CustomHexEntry value={f.color} onApply={v => set('color', v)} />
        <Field label={t('modal.descriptionBio')} value={f.description} onChange={v => set('description', v)} placeholder={t('modal.descriptionPlaceholder')} multiline />
      </Modal>

      <Modal open={!!editingStatus} title={isNewStatus ? t('status.add') : t('status.edit')} onClose={() => setEditingStatus(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div>
              {!isNewStatus && (
                <Btn variant="danger" disabled={activeIds.includes(f.id)} onClick={() => setConfirmDeleteStatus(f.id)}>{t('common.delete')}</Btn>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setEditingStatus(null)}>{t('common.cancel')}</Btn>
              <Btn variant="solid" onClick={saveStatus}>{t('common.save')}</Btn>
            </div>
          </div>
        }>
        <Field label={t('modal.name')} value={f.name} onChange={v => set('name', v)} />
        <Section label={t('modal.color')} />
        <ColorCarousel value={f.color} onChange={v => set('color', v)} />
        <Field label={t('modal.descriptionBio')} value={f.description} onChange={v => set('description', v)} multiline />
      </Modal>

      <ConfirmDialog open={!!confirmDeleteStatus} title={t('common.delete')} message={t('journal.areYouSure')}
        danger onConfirm={() => confirmDeleteStatus && deleteStatus(confirmDeleteStatus)} onCancel={() => setConfirmDeleteStatus(null)} />
    </div>
  );
}
