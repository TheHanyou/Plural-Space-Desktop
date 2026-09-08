import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Member, Relationship, RelationshipTypeDef, uid,
  allRelationshipTypes, relationshipDegrees,
  DEFAULT_REL_COLOR, RELATIONSHIP_COLOR_CHOICES, getInitials,
} from '../utils';
import { store, KEYS } from '../storage';
import { NetworkManager } from '../network/NetworkManager';
import { Btn, Modal, ConfirmDialog, Dropdown, clickable } from '../components/ui';
import { ColorCarousel } from '../components/ColorCarousel';
import { logError } from '../log';
import { useAppStore } from '../store/appStore';

interface Props {
  onViewMember?: (id: string) => void;
  focusMemberId?: string | null;
}

type TypeDraft = { id: string; name: string; inverseName: string; directional: boolean; color: string; preset: boolean };

export default function SystemMapView({ onViewMember, focusMemberId }: Props) {
  const { t } = useTranslation();
  const members = useAppStore(s => s.state.members);
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [customTypes, setCustomTypes] = useState<RelationshipTypeDef[]>([]);
  const [mapIds, setMapIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [posOverrides, setPosOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const lastDragMovedRef = useRef(false);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [showArchived, setShowArchived] = useState(() => localStorage.getItem('ps.mapShowArchived') === '1');
  const [showFacets, setShowFacets] = useState(() => localStorage.getItem('ps.mapShowFacets') !== '0');
  const [colorAll, setColorAll] = useState(() => localStorage.getItem('ps.mapColorThreads') === '1');
  const [lockPositions, setLockPositions] = useState(() => localStorage.getItem('ps.mapLockPositions') === '1');
  const [relEditor, setRelEditor] = useState<{ from: string; toIds: string[]; typeId: string; note: string } | null>(null);
  const [relDup, setRelDup] = useState(false);
  useEffect(() => { setRelDup(false); }, [relEditor]);
  const [typeDraft, setTypeDraft] = useState<TypeDraft | null>(null);
  const [confirmDelRel, setConfirmDelRel] = useState<string | null>(null);
  const [confirmDelType, setConfirmDelType] = useState<RelationshipTypeDef | null>(null);

  const types = useMemo(() => allRelationshipTypes(customTypes), [customTypes]);
  const typeById = useMemo(() => new Map(types.map(ty => [ty.id, ty])), [types]);

  useEffect(() => {
    (async () => {
      const [rels, savedTypes, savedMapIds, savedPos] = await Promise.all([
        store.get<Relationship[]>(KEYS.relationships, []),
        store.get<RelationshipTypeDef[]>(KEYS.relationshipTypes, []),
        store.get<string[]>(KEYS.systemMapMembers),
        store.get<Record<string, { x: number; y: number }>>(KEYS.systemMapPositions),
      ]);
      setCustomTypes(savedTypes || []);
      const all = rels || [];
      const ids = new Set(members.map(m => m.id));
      if (savedPos) {
        const pruned: Record<string, { x: number; y: number }> = {};
        for (const id in savedPos) {
          const p = savedPos[id];
          if (ids.has(id) && p && typeof p.x === 'number' && typeof p.y === 'number') pruned[id] = p;
        }
        setPosOverrides(pruned);
      }
      const valid = all.filter(r => ids.has(r.fromId) && ids.has(r.toId));
      setRelationships(valid);
      if (valid.length !== all.length) await store.set(KEYS.relationships, valid);
      if (savedMapIds && savedMapIds.length) {
        setMapIds(savedMapIds.filter(id => ids.has(id)));
      } else {
        const seeded = [...new Set(valid.flatMap(r => [r.fromId, r.toId]))];
        setMapIds(seeded);
        if (seeded.length) await store.set(KEYS.systemMapMembers, seeded);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (focusMemberId) { setMapIds(prev => prev.includes(focusMemberId) ? prev : [...prev, focusMemberId]); setSelectedId(focusMemberId); } }, [focusMemberId]);

  const saveRelationships = async (next: Relationship[]) => { setRelationships(next); await store.set(KEYS.relationships, next); };
  const saveCustomTypes = async (next: RelationshipTypeDef[]) => { setCustomTypes(next); await store.set(KEYS.relationshipTypes, next); };
  const saveMapIds = async (next: string[]) => { setMapIds(next); await store.set(KEYS.systemMapMembers, next); };

  const mapMembers = useMemo(() => (mapIds.map(id => memberById.get(id)).filter(Boolean) as Member[]).filter(m => (showArchived || !m.archived) && (showFacets || !m.isFacet)), [mapIds, memberById, showArchived, showFacets]);
  const mapIdSet = useMemo(() => new Set(mapIds), [mapIds]);
  const visibleIdSet = useMemo(() => new Set(mapMembers.map(m => m.id)), [mapMembers]);
  const mapRels = useMemo(() => relationships.filter(r => visibleIdSet.has(r.fromId) && visibleIdSet.has(r.toId)), [relationships, visibleIdSet]);

  const typeLabel = (td: RelationshipTypeDef): string => (td.preset && !td.overridden) ? t(`relType.${td.id}`, { defaultValue: td.name }) : td.name;

  const dist = useMemo(() => {
    if (!selectedId) return null;
    const adj = new Map<string, string[]>();
    for (const r of mapRels) {
      if (!adj.has(r.fromId)) adj.set(r.fromId, []);
      if (!adj.has(r.toId)) adj.set(r.toId, []);
      adj.get(r.fromId)!.push(r.toId);
      adj.get(r.toId)!.push(r.fromId);
    }
    const d = new Map<string, number>([[selectedId, 0]]);
    let frontier = [selectedId];
    for (let hop = 1; hop <= 3 && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) for (const nb of (adj.get(id) || [])) {
        if (!d.has(nb)) { d.set(nb, hop); next.push(nb); }
      }
      frontier = next;
    }
    return d;
  }, [selectedId, mapRels]);

  const W = 900, H = 560;
  const HALF_WORLD = 2000;
  const n = mapMembers.length;
  const radius = n <= 1 ? 0 : 200;
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    mapMembers.forEach((mem, i) => {
      const o = posOverrides[mem.id];
      if (o) { m.set(mem.id, { x: o.x, y: o.y }); return; }
      if (n === 1) { m.set(mem.id, { x: 0, y: 0 }); return; }
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      m.set(mem.id, { x: radius * Math.cos(a), y: radius * Math.sin(a) });
    });
    return m;
  }, [mapMembers, n, radius, posOverrides]);
  const [extX, extY] = useMemo(() => {
    let ex = radius + 100;
    let ey = (radius + 100) * (H / W);
    pos.forEach(p => { ex = Math.max(ex, Math.abs(p.x) + 70); ey = Math.max(ey, Math.abs(p.y) + 70); });
    ex = Math.max(ex, ey * (W / H));
    return [ex, ex * (H / W)];
  }, [pos, radius]);

  const persistPositions = (next: Record<string, { x: number; y: number }>) => {
    store.set(KEYS.systemMapPositions, next).then(() => NetworkManager.notifyDataChanged()).catch(e => logError('systemmap', e));
  };
  const worldPerPixel = (): number => {
    const el = svgRef.current;
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? (extX * 2) / r.width : 1;
  };
  const onNodePointerDown = (id: string, p: { x: number; y: number }) => (e: React.PointerEvent) => {
    if (e.button !== 0 || lockPositions) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, moved: false };
  };
  const onNodePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const s = worldPerPixel();
    const clamp = (v: number) => Math.max(-HALF_WORLD, Math.min(HALF_WORLD, Math.round(v)));
    const nx = clamp(d.origX + (e.clientX - d.startX) * s);
    const ny = clamp(d.origY + (e.clientY - d.startY) * s);
    setPosOverrides(prev => ({ ...prev, [d.id]: { x: nx, y: ny } }));
  };
  const onNodePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    if (d.moved) {
      lastDragMovedRef.current = true;
      setPosOverrides(prev => { persistPositions(prev); return prev; });
    }
  };

  const degrees = useMemo(() => relationshipDegrees(mapMembers.map(m => m.id), mapRels), [mapMembers, mapRels]);

  const addRelationship = () => {
    if (!relEditor) return;
    const { from, toIds, typeId, note } = relEditor;
    const targets = [...new Set(toIds)].filter(id => id && id !== from);
    if (!from || targets.length === 0) { setRelEditor(null); return; }
    const td = typeById.get(typeId);
    const isDup = (to: string) => relationships.some(r => r.typeId === typeId && ((r.fromId === from && r.toId === to) || (!td?.directional && r.fromId === to && r.toId === from)));
    const fresh = targets.filter(to => !isDup(to));
    if (fresh.length === 0) { setRelDup(true); return; }
    const nowTs = Date.now();
    const entries: Relationship[] = fresh.map(to => ({ id: uid(), fromId: from, toId: to, typeId, note: note || undefined, createdAt: nowTs }));
    saveRelationships([...relationships, ...entries]);
    const mapAdds = [from, ...fresh].filter(id => !mapIdSet.has(id));
    if (mapAdds.length > 0) saveMapIds([...mapIds, ...mapAdds]);
    setRelEditor(null);
  };

  const saveTypeDraft = () => {
    if (!typeDraft || !typeDraft.name.trim()) { setTypeDraft(null); return; }
    if (typeDraft.preset) {
      const others = customTypes.filter(ct => ct.id !== typeDraft.id);
      saveCustomTypes([...others, { id: typeDraft.id, name: typeDraft.name.trim(), inverseName: typeDraft.inverseName || undefined, directional: typeDraft.directional, color: typeDraft.color, preset: true }]);
    } else {
      const existing = customTypes.find(ct => ct.id === typeDraft.id);
      const entry: RelationshipTypeDef = { id: typeDraft.id, name: typeDraft.name.trim(), inverseName: typeDraft.inverseName || undefined, directional: typeDraft.directional, color: typeDraft.color };
      saveCustomTypes(existing ? customTypes.map(ct => ct.id === entry.id ? entry : ct) : [...customTypes, entry]);
    }
    setTypeDraft(null);
  };

  const performDeleteType = (ty: RelationshipTypeDef) => {
    if (ty.preset) {
      saveCustomTypes([...customTypes.filter(ct => ct.id !== ty.id), { id: ty.id, name: ty.name, directional: !!ty.directional, preset: true, deleted: true }]);
    } else {
      saveCustomTypes(customTypes.filter(ct => ct.id !== ty.id));
    }
    if (relationships.some(r => r.typeId === ty.id)) saveRelationships(relationships.filter(r => r.typeId !== ty.id));
  };

  const offAll = members.filter(m => !mapIdSet.has(m.id) && !m.deleted && (showArchived || !m.archived));
  const off = offAll.filter(m => !m.isFacet);
  const offFacets = offAll.filter(m => m.isFacet);
  const selected = selectedId ? memberById.get(selectedId) : null;
  const selRels = selectedId
    ? mapRels.filter(r => (r.fromId === selectedId || r.toId === selectedId) && pos.has(r.fromId === selectedId ? r.toId : r.fromId))
    : [];

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--text)', margin: 0 }}>{t('systemMap.title')}</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{mapRels.length === 1 ? t('systemMap.relationshipOne') : t('systemMap.relationships', { count: mapRels.length })}</span>
        <div style={{ flex: 1 }} />
        <Btn variant="solid" onClick={() => setShowAddMember(true)}>{t('systemMap.addMember')}</Btn>
        <Btn variant="ghost" onClick={() => setRelEditor({ from: selectedId || mapIds[0] || '', toIds: [], typeId: types[0]?.id || 'friend', note: '' })}>{t('systemMap.addRelationship')}</Btn>
        <Btn variant="ghost" onClick={() => setShowTypes(true)}>{t('systemMap.manageTypes')}</Btn>
        <button
          className={showArchived ? 'btn btn--solid' : 'btn btn--ghost'}
          aria-pressed={showArchived}
          onClick={() => { const v = !showArchived; setShowArchived(v); localStorage.setItem('ps.mapShowArchived', v ? '1' : '0'); }}>
          {t('members.archived')}
        </button>
        <button
          className={showFacets ? 'btn btn--solid' : 'btn btn--ghost'}
          aria-pressed={showFacets}
          onClick={() => { const v = !showFacets; setShowFacets(v); localStorage.setItem('ps.mapShowFacets', v ? '1' : '0'); }}>
          {t('members.facets')}
        </button>
        <button
          className={colorAll ? 'btn btn--solid' : 'btn btn--ghost'}
          aria-pressed={colorAll}
          onClick={() => { const v = !colorAll; setColorAll(v); localStorage.setItem('ps.mapColorThreads', v ? '1' : '0'); }}>
          {t('systemMap.showColors', {defaultValue: 'Colors'})}
        </button>
        <button
          className={lockPositions ? 'btn btn--solid' : 'btn btn--ghost'}
          aria-pressed={lockPositions}
          onClick={() => { const v = !lockPositions; setLockPositions(v); localStorage.setItem('ps.mapLockPositions', v ? '1' : '0'); }}>
          <span aria-hidden>{lockPositions ? '🔒 ' : '🔓 '}</span>{t('systemMap.lockPositions')}
        </button>
      </div>

      {n === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 12 }}>
          {t('systemMap.emptyMap')}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <svg ref={svgRef} viewBox={`${-extX} ${-extY} ${extX * 2} ${extY * 2}`} style={{ width: '100%', display: 'block' }} onClick={() => { if (lastDragMovedRef.current) { lastDragMovedRef.current = false; return; } setSelectedId(null); }}>
            {mapRels.map(r => {
              const a = pos.get(r.fromId), b = pos.get(r.toId);
              if (!a || !b) return null;
              const da = dist?.get(r.fromId);
              const db = dist?.get(r.toId);
              const active = da !== undefined && db !== undefined && Math.abs(da - db) === 1;
              const ty = typeById.get(r.typeId);
              const color = (selectedId ? active : false) || colorAll ? (ty?.color || DEFAULT_REL_COLOR) : DEFAULT_REL_COLOR;
              const opacity = !selectedId ? 0.5 : active ? 0.95 : 0.12;
              return <line key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={active ? 3 : 2} opacity={opacity} />;
            })}
            {mapMembers.map(mem => {
              const p = pos.get(mem.id)!;
              const d = dist?.get(mem.id);
              const dim = selectedId && d === undefined && mem.id !== selectedId;
              const isSel = mem.id === selectedId;
              return (
                <g key={mem.id} style={{ cursor: 'pointer' }} opacity={dim ? 0.3 : mem.archived ? 0.55 : 1}
                  role="button" tabIndex={0} aria-label={mem.name} aria-pressed={isSel}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(isSel ? null : mem.id); } }}
                  onPointerDown={onNodePointerDown(mem.id, p)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                  onClick={e => { e.stopPropagation(); if (lastDragMovedRef.current) { lastDragMovedRef.current = false; return; } setSelectedId(isSel ? null : mem.id); }}>
                  <circle cx={p.x} cy={p.y} r={isSel ? 26 : 22} fill={mem.color || 'var(--accent)'}
                    stroke={isSel ? '#fff' : 'rgba(255,255,255,0.25)'} strokeWidth={isSel ? 3 : 1.5} />
                  <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0a0508">{getInitials(mem.name)}</text>
                  <text x={p.x} y={p.y + 40} textAnchor="middle" fontSize={11} fill="var(--text)">{mem.name}</text>
                  {selectedId && d !== undefined && d > 0 && (
                    <text x={p.x + 20} y={p.y - 18} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--accent)">{d}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {onViewMember && <Btn variant="ghost" onClick={() => onViewMember(selected.id)}>{t('systemMap.viewProfile')}</Btn>}
            <Btn variant="ghost" onClick={() => { saveMapIds(mapIds.filter(id => id !== selected.id)); setSelectedId(null); }}>{t('systemMap.removeFromMap')}</Btn>
            <Btn variant="ghost" onClick={() => setSelectedId(null)}>{t('common.close')}</Btn>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: selected.color, flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{selected.name}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('systemMap.connectionsCount', { count: degrees[selected.id] || 0 })}</span>
          </div>
          {selRels.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{t('systemMap.noneForMember')}</p>
          ) : selRels.map(r => {
            const otherId = r.fromId === selected.id ? r.toId : r.fromId;
            const other = memberById.get(otherId);
            const ty = typeById.get(r.typeId);
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: ty?.color || DEFAULT_REL_COLOR }} />
                <span style={{ fontSize: 12, color: 'var(--dim)', minWidth: 70 }}>{ty ? typeLabel(ty) : '?'}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', cursor: onViewMember ? 'pointer' : 'default' }}
                  {...(onViewMember ? clickable(() => onViewMember(otherId), other?.name) : {})}>{other?.name || '?'}</span>
                <button onClick={() => setConfirmDelRel(r.id)} aria-label={t('systemMap.deleteRelationship')} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showAddMember} title={t('systemMap.addMember')} onClose={() => setShowAddMember(false)}>
        {off.length === 0 && offFacets.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('systemMap.allOnMap')}</p> : (
          <>
            {off.length > 0 && <label className="field__label">{t('members.title')}</label>}
            {off.map(m => (
              <button key={m.id} onClick={() => { saveMapIds([...mapIds, m.id]); setShowAddMember(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
              </button>
            ))}
            {offFacets.length > 0 && (
              <>
                <label className="field__label" style={{ marginTop: 12 }}>{t('members.facets')}</label>
                {offFacets.map(m => (
                  <button key={m.id} onClick={() => { saveMapIds([...mapIds, m.id]); setShowAddMember(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color }} />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!relEditor} title={t('systemMap.addRelationship')} onClose={() => setRelEditor(null)}
        footer={<Btn variant="solid" onClick={addRelationship}>{t('common.save')}</Btn>}>
        {relEditor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field__label">{t('systemMap.from')}</label>
              <Dropdown<string> value={relEditor.from} options={[...mapIds, ...off.map(m => m.id), ...offFacets.map(m => m.id)]} onChange={v => setRelEditor({ ...relEditor, from: v })} renderOption={id => memberById.get(id)?.name || '?'} />
            </div>
            <div>
              <label className="field__label">{t('systemMap.to')}</label>
              <div className="field__label" style={{ marginTop: 4 }}>{t('members.title')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...mapIds, ...off.map(m => m.id)].filter(id => id !== relEditor.from).map(id => {
                  const m = memberById.get(id);
                  if (!m) return null;
                  const on = relEditor.toIds.includes(id);
                  return (
                    <button key={id} className="chip" aria-pressed={on} style={{
                      borderColor: on ? `${m.color}60` : 'var(--border)',
                      background: on ? `${m.color}20` : 'var(--surface)',
                    }} onClick={() => setRelEditor({ ...relEditor, toIds: on ? relEditor.toIds.filter(x => x !== id) : [...relEditor.toIds, id] })}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                      <span style={{ color: on ? m.color : 'var(--dim)', fontWeight: on ? 600 : 400 }}>{m.name}</span>
                    </button>
                  );
                })}
              </div>
              {offFacets.filter(m => m.id !== relEditor.from).length > 0 && (
                <>
                  <div className="field__label" style={{ marginTop: 8 }}>{t('members.facets')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {offFacets.filter(m => m.id !== relEditor.from).map(m => {
                      const on = relEditor.toIds.includes(m.id);
                      return (
                        <button key={m.id} className="chip" aria-pressed={on} style={{
                          borderColor: on ? `${m.color}60` : 'var(--border)',
                          background: on ? `${m.color}20` : 'var(--surface)',
                        }} onClick={() => setRelEditor({ ...relEditor, toIds: on ? relEditor.toIds.filter(x => x !== m.id) : [...relEditor.toIds, m.id] })}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                          <span style={{ color: on ? m.color : 'var(--dim)', fontWeight: on ? 600 : 400 }}>{m.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="field__label">{t('systemMap.type')}</label>
              <Dropdown<string> value={relEditor.typeId} options={types.map(ty => ty.id)} onChange={v => setRelEditor({ ...relEditor, typeId: v })} renderOption={id => { const ty = typeById.get(id); return ty ? typeLabel(ty) : id; }} />
            </div>
            {relDup && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{t('systemMap.duplicate')}</div>}
          </div>
        )}
      </Modal>

      <Modal open={showTypes} title={t('systemMap.manageTypes')} onClose={() => setShowTypes(false)}
        footer={<Btn variant="ghost" onClick={() => setTypeDraft({ id: uid(), name: '', inverseName: '', directional: false, color: RELATIONSHIP_COLOR_CHOICES[0], preset: false })}>{t('systemMap.newType')}</Btn>}>
        {types.map(ty => (
          <div key={ty.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: ty.color || DEFAULT_REL_COLOR }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{typeLabel(ty)}{ty.preset ? ` · ${t('systemMap.preset')}` : ''}</span>
            <button onClick={() => setTypeDraft({ id: ty.id, name: typeLabel(ty), inverseName: ty.inverseName || '', directional: !!ty.directional, color: ty.color || RELATIONSHIP_COLOR_CHOICES[0], preset: !!ty.preset })}
              style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>{t('common.edit')}</button>
            <button onClick={() => setConfirmDelType(ty)} aria-label={`${t('common.delete')} ${typeLabel(ty)}`} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </Modal>

      <Modal open={!!typeDraft} title={typeDraft?.preset ? t('systemMap.editType') : t('systemMap.newType')} onClose={() => setTypeDraft(null)}
        footer={<Btn variant="solid" onClick={saveTypeDraft}>{t('common.save')}</Btn>}>
        {typeDraft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field__label">{t('systemMap.typeName')}</label>
              <input className="field__input" aria-label={t('systemMap.typeName')} value={typeDraft.name} onChange={e => setTypeDraft({ ...typeDraft, name: e.target.value })} />
            </div>
            <ColorCarousel value={typeDraft.color} onChange={v => setTypeDraft(d => (d ? { ...d, color: v } : d))} />
            {typeDraft.preset && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{t('systemMap.presetEditNote')}</p>}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!confirmDelRel} title={t('systemMap.deleteRelationship')} message={t('systemMap.deleteRelationshipMsg')}
        danger onConfirm={() => { if (confirmDelRel) saveRelationships(relationships.filter(r => r.id !== confirmDelRel)); setConfirmDelRel(null); }}
        onCancel={() => setConfirmDelRel(null)} />

      <ConfirmDialog open={!!confirmDelType} title={t('systemMap.deleteType')} message={t('systemMap.deleteTypeMsg')}
        danger onConfirm={() => { if (confirmDelType) performDeleteType(confirmDelType); setConfirmDelType(null); }}
        onCancel={() => setConfirmDelType(null)} />
    </div>
  );
}
