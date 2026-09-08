export interface ThemeColors {
  bg: string;
  surface: string;
  card: string;
  border: string;
  borderLt: string;
  accent: string;
  accentBg: string;
  text: string;
  dim: string;
  muted: string;
  toggleOff: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
  info: string;
  infoBg: string;
  isLight: boolean;
}

export interface CustomPalette {
  id: string;
  name: string;
  bg: string;
  accent: string;
  text: string;
  mid: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const raw = String(hex ?? '').replace('#', '');
  const h = (raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw).padEnd(6, '0');
  const n = (s: string) => { const v = parseInt(s, 16); return Number.isFinite(v) ? v : 0; };
  return [n(h.slice(0, 2)), n(h.slice(2, 4)), n(h.slice(4, 6))];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const mix = (c1: string, c2: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

export const initialOn = (bg: string): string =>
  luminance(bg) > 0.35 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)';

const wcagContrast = (hexA: string, hexB: string): number => {
  const lum = (hex: string): number => {
    const h = (hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : (h + '000000').slice(0, 6);
    const n = parseInt(full, 16) || 0;
    const chan = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
  };
  const la = lum(hexA);
  const lb = lum(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

export const ensureReadable = (color: string, bg: string, min: number): string => {
  if (wcagContrast(color, bg) >= min) return color;
  const preferred = luminance(color) <= luminance(bg) ? '#000000' : '#FFFFFF';
  const other = preferred === '#000000' ? '#FFFFFF' : '#000000';
  const pole = wcagContrast(preferred, bg) >= min
    ? preferred
    : wcagContrast(other, bg) >= min
      ? other
      : (wcagContrast(preferred, bg) >= wcagContrast(other, bg) ? preferred : other);
  if (wcagContrast(pole, bg) < min) return pole;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 8; i++) {
    const t = (lo + hi) / 2;
    if (wcagContrast(mix(color, pole, t), bg) >= min) hi = t;
    else lo = t;
  }
  return mix(color, pole, hi);
};

export const textFloor = (bg: string): number =>
  Math.max(wcagContrast('#000000', bg), wcagContrast('#FFFFFF', bg)) >= 7 ? 4.5 : 3;

export const deriveTheme = (bg: string, accent: string, text: string, mid: string): ThemeColors => {
  const lum = luminance(bg);
  const isLight = lum > 0.3;
  const floor = textFloor(bg);

  const surfaceT = isLight ? 0.04 : 0.08;
  const cardT = isLight ? 0.07 : 0.14;
  const borderT = isLight ? 0.12 : 0.20;
  const borderLtT = isLight ? 0.18 : 0.30;

  const surface = mix(bg, mid, surfaceT);
  const card = mix(bg, mid, cardT);
  const border = mix(bg, mid, borderT);
  const borderLt = mix(bg, mid, borderLtT);

  const effText = ensureReadable(text, bg, floor);
  const dim = ensureReadable(mix(effText, mid, 0.12), bg, floor);
  const muted = ensureReadable(mix(effText, mid, 0.30), bg, 3);
  const toggleOff = mix(bg, mid, 0.22);

  const accentRgb = hexToRgb(accent);
  const bgRgb = hexToRgb(bg);
  const accentBg = rgbToHex(
    bgRgb[0] + (accentRgb[0] - bgRgb[0]) * 0.12,
    bgRgb[1] + (accentRgb[1] - bgRgb[1]) * 0.12,
    bgRgb[2] + (accentRgb[2] - bgRgb[2]) * 0.12,
  );

  const dangerBase = '#d9534f';
  const successBase = isLight ? '#2e7a5a' : '#4caf8a';
  const infoBase = isLight ? '#2a5aaa' : '#7B9FE8';

  const dangerBgRgb = hexToRgb(dangerBase);
  const successBgRgb = hexToRgb(successBase);
  const infoBgRgb = hexToRgb(infoBase);
  const opacity = isLight ? 0.15 : 0.12;

  return {
    bg, surface, card, border, borderLt,
    accent, accentBg, text: effText, dim, muted, toggleOff,
    danger: dangerBase,
    dangerBg: rgbToHex(bgRgb[0] + (dangerBgRgb[0] - bgRgb[0]) * opacity, bgRgb[1] + (dangerBgRgb[1] - bgRgb[1]) * opacity, bgRgb[2] + (dangerBgRgb[2] - bgRgb[2]) * opacity),
    success: successBase,
    successBg: rgbToHex(bgRgb[0] + (successBgRgb[0] - bgRgb[0]) * opacity, bgRgb[1] + (successBgRgb[1] - bgRgb[1]) * opacity, bgRgb[2] + (successBgRgb[2] - bgRgb[2]) * opacity),
    info: infoBase,
    infoBg: rgbToHex(bgRgb[0] + (infoBgRgb[0] - bgRgb[0]) * opacity, bgRgb[1] + (infoBgRgb[1] - bgRgb[1]) * opacity, bgRgb[2] + (infoBgRgb[2] - bgRgb[2]) * opacity),
    isLight,
  };
};

export const DARK_PALETTE: CustomPalette = {
  id: '__dark__',
  name: 'Obsidian',
  bg: '#0A1F2E',
  accent: '#DAA520',
  text: '#C0C0C0',
  mid: '#7A8A99',
};

export const LIGHT_PALETTE: CustomPalette = {
  id: '__light__',
  name: 'Steel',
  bg: '#7A8A99',
  accent: '#DAA520',
  text: '#0A1F2E',
  mid: '#C0C0C0',
};

export const BUILTIN_PALETTES: CustomPalette[] = [DARK_PALETTE, LIGHT_PALETTE];

export const PALETTE = [
  '#DAA520', '#7B9FE8', '#E87BA8', '#7BE8C4',
  '#A87BE8', '#E8A87B', '#6EC9A9', '#E87B7B',
  '#85B4E8', '#C97BE8', '#B4E885', '#E8C97B',
];

export function applyThemeToDOM(theme: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--card', theme.card);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--border-lt', theme.borderLt);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-bg', theme.accentBg);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--dim', theme.dim);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--toggle-off', theme.toggleOff);
  root.style.setProperty('--danger', theme.danger);
  root.style.setProperty('--danger-bg', theme.dangerBg);
  root.style.setProperty('--success', theme.success);
  root.style.setProperty('--success-bg', theme.successBg);
  root.style.setProperty('--info', theme.info);
  root.style.setProperty('--info-bg', theme.infoBg);
}

export function applyTextScale(scale: number): void {
  (document.body.style as any).zoom = String(scale);
}

export function applyDyslexicFont(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) {
    root.classList.remove('no-dyslexic');
  } else {
    root.classList.add('no-dyslexic');
  }
}

export type FontChoice = 'default' | 'opendyslexic' | 'atkinson' | 'lexend' | 'comicneue' | 'cause' | 'gelasio' | 'anton';

const FONT_BODY_FALLBACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export const FONT_OPTIONS: { value: FontChoice; label: string; css: string | null }[] = [
  { value: 'default', label: 'Default', css: null },
  { value: 'opendyslexic', label: 'OpenDyslexic', css: null },
  { value: 'atkinson', label: 'Atkinson Hyperlegible', css: `'Atkinson Hyperlegible', ${FONT_BODY_FALLBACK}` },
  { value: 'lexend', label: 'Lexend', css: `'Lexend', ${FONT_BODY_FALLBACK}` },
  { value: 'comicneue', label: 'Comic Neue', css: `'Comic Neue', ${FONT_BODY_FALLBACK}` },
  { value: 'cause', label: 'Cause', css: `'Cause', ${FONT_BODY_FALLBACK}` },
  { value: 'gelasio', label: 'Gelasio', css: "'Gelasio', Georgia, 'Times New Roman', serif" },
  { value: 'anton', label: 'Anton', css: "'Anton', Impact, sans-serif" },
];

export function applyFontChoice(choice?: FontChoice): void {
  const root = document.documentElement;
  const opt = FONT_OPTIONS.find(o => o.value === choice) || FONT_OPTIONS[0];
  root.style.removeProperty('--font-body');
  root.style.removeProperty('--font-display');
  if (opt.value === 'default') {
    root.classList.add('no-dyslexic');
    return;
  }
  root.classList.remove('no-dyslexic');
  if (opt.value !== 'opendyslexic' && opt.css) {
    root.style.setProperty('--font-body', opt.css);
    const displayFamily = opt.css.split(',')[0].trim();
    root.style.setProperty('--font-display', `${displayFamily}, var(--font-display-fallback)`);
  }
}
