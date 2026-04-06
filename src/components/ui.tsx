import React, { useState, useRef, useEffect } from 'react';
import './ui.css';

// ─── Button ─────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'solid' | 'info';

export function Btn({ children, onClick, variant = 'primary', disabled = false, className = '' }: {
  children: React.ReactNode; onClick: () => void; variant?: BtnVariant; disabled?: boolean; className?: string;
}) {
  return (
    <button className={`btn btn--${variant} ${disabled ? 'btn--disabled' : ''} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ─── Field ──────────────────────────────────────────────────────────────────

export function Field({ label, value, onChange, placeholder, multiline = false, type = 'text', mono = false }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  multiline?: boolean; type?: string; mono?: boolean;
}) {
  return (
    <div className="field">
      {label && <label className="field__label">{label}</label>}
      {multiline ? (
        <textarea className="field__input field__input--multi" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={4} />
      ) : (
        <input className={`field__input ${mono ? 'field__input--mono' : ''}`} type={type} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

export function Toggle({ value, onChange, label, description }: {
  value: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__desc">{description}</span>}
      </div>
      <button className={`toggle ${value ? 'toggle--on' : ''}`} onClick={() => onChange(!value)}>
        <span className="toggle__knob" />
      </button>
    </div>
  );
}

// ─── Section Divider ────────────────────────────────────────────────────────

export function Section({ label, color }: { label: string; color?: string }) {
  return (
    <div className="section-div">
      <span className="section-div__dot" style={{ background: color || 'var(--accent)' }} />
      <span className="section-div__label" style={{ color: color || 'var(--accent)' }}>{label}</span>
      <span className="section-div__line" />
    </div>
  );
}

// ─── Dropdown ───────────────────────────────────────────────────────────────

export function Dropdown<T extends string>({ value, options, onChange, label, renderOption }: {
  value: T; options: T[]; onChange: (v: T) => void; label?: string;
  renderOption?: (v: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const display = renderOption || ((v: T) => v);

  return (
    <div className="dropdown" ref={ref}>
      {label && <label className="field__label">{label}</label>}
      <button className={`dropdown__trigger ${open ? 'dropdown__trigger--open' : ''}`} onClick={() => setOpen(!open)}>
        <span>{display(value)}</span>
        <span className="dropdown__arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="dropdown__menu">
          {options.map(opt => (
            <button key={opt} className={`dropdown__item ${opt === value ? 'dropdown__item--active' : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}>
              {display(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chip List (for tags, locations, moods) ─────────────────────────────────

export function ChipList({ items, onRemove, color = 'var(--info)' }: {
  items: string[]; onRemove: (item: string) => void; color?: string;
}) {
  return (
    <div className="chip-list">
      {items.map(item => (
        <button key={item} className="chip" style={{ borderColor: `${color}50`, background: `${color}18` }} onClick={() => onRemove(item)}>
          <span style={{ color }}>{item}</span>
          <span className="chip__x">✕</span>
        </button>
      ))}
    </div>
  );
}

// ─── Add Row (input + add button) ───────────────────────────────────────────

export function AddRow({ value, onChange, onAdd, placeholder }: {
  value: string; onChange: (v: string) => void; onAdd: () => void; placeholder?: string;
}) {
  return (
    <div className="add-row">
      <input className="field__input" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
      <Btn onClick={onAdd}>Add</Btn>
    </div>
  );
}

// ─── Color Picker (palette swatches + hex input) ────────────────────────────

export function ColorPicker({ value, onChange, palette }: {
  value: string; onChange: (v: string) => void; palette: string[];
}) {
  const [hex, setHex] = useState(value);
  const [error, setError] = useState(false);

  const handleHex = (v: string) => {
    setHex(v);
    const n = v.startsWith('#') ? v : `#${v}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(n)) {
      onChange(n.toUpperCase());
      setError(false);
    } else {
      setError(v.length > 1);
    }
  };

  return (
    <div className="color-picker">
      <div className="color-picker__preview" style={{ background: value }} />
      <input className={`field__input field__input--mono ${error ? 'field__input--error' : ''}`}
        value={hex} onChange={e => handleHex(e.target.value)} placeholder="#C9A96E" maxLength={7}
        style={{ width: 100 }} />
      <div className="color-picker__swatches">
        {palette.map(c => (
          <button key={c} className={`color-picker__swatch ${c === value ? 'color-picker__swatch--active' : ''}`}
            style={{ background: c }} onClick={() => { onChange(c); setHex(c); setError(false); }} />
        ))}
      </div>
    </div>
  );
}

// ─── Modal Overlay ──────────────────────────────────────────────────────────

export function Modal({ open, title, onClose, footer, children }: {
  open: boolean; title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────

export function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger = false }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
        </div>
        <div className="modal__body">
          <p style={{ color: 'var(--dim)', fontSize: 13, lineHeight: 1.5 }}>{message}</p>
        </div>
        <div className="modal__footer">
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Confirm</Btn>
        </div>
      </div>
    </div>
  );
}
