/**
 * The master palette. Every pixel in the game is one of these colours.
 *
 * Ramps are hue-shifted: shadows lean cool/violet, highlights lean warm. Sprites reference
 * colours by key, so swapping the era palette re-colours the whole world (see setEra).
 */
export const PALETTE = {
  // neutrals — violet-tinted darks, warm lights
  ink0: '#0b0a12', ink1: '#16141f', ink2: '#221e2e', ink3: '#2f2a3d', ink4: '#433c52', ink5: '#5b536a',
  ink6: '#7a7186', ink7: '#9d95a6', ink8: '#c3bcc7', ink9: '#e6e0e3', white: '#fbf7f0',
  // ocean, deep → shallow
  sea0: '#0a1530', sea1: '#0f1f45', sea2: '#142b5a', sea3: '#1a3a70', sea4: '#224d86', sea5: '#2c6399',
  sea6: '#3b7fae', sea7: '#55a0c0', sea8: '#7fc3cf', foam: '#c9ece6',
  // day sky, zenith → horizon
  sky0: '#1d2f6b', sky1: '#2d4c95', sky2: '#4470bd', sky3: '#6597d8', sky4: '#93bfe8', sky5: '#c4e0f2',
  // dusk + night
  dusk0: '#1a1238', dusk1: '#2b1a4e', dusk2: '#4b2462', dusk3: '#7a3466', dusk4: '#b4505f', dusk5: '#e47f55', dusk6: '#f6b56a',
  night0: '#070814', night1: '#0d1028', night2: '#151a3c', night3: '#1f2752',
  // greens, teal shadow → yellow-green light
  grn0: '#0f2420', grn1: '#163628', grn2: '#1f4a2e', grn3: '#2c6233', grn4: '#3f7b35', grn5: '#5a9537',
  grn6: '#7dae3f', grn7: '#a6c751', grn8: '#cfe07a',
  // earth / sand
  snd0: '#2a1a16', snd1: '#432820', snd2: '#5f3b28', snd3: '#7d5232', snd4: '#9c6c3d', snd5: '#bb8a4c',
  snd6: '#d4a862', snd7: '#e6c784', snd8: '#f3e2b0',
  // rock
  rck0: '#241e26', rck1: '#382e36', rck2: '#4e4148', rck3: '#66575a', rck4: '#82706d', rck5: '#a08d84', rck6: '#bfae9f',
  // ice / snow
  ice0: '#8fa3c4', ice1: '#b4c6de', ice2: '#d6e2f0', ice3: '#f1f6fb',
  // warm: red → orange → yellow
  red0: '#3a0f1e', red1: '#64172a', red2: '#93243a', red3: '#c23a3f', org0: '#df5f3e', org1: '#f08a46',
  org2: '#f7b258', yel0: '#fbd46e', yel1: '#fde9a4', yel2: '#fff6d8',
  // tech teal / cyan
  cyn0: '#0d2e33', cyn1: '#11474d', cyn2: '#156466', cyn3: '#1c8780', cyn4: '#2fae9b', cyn5: '#5fd3b5', cyn6: '#a3f0d6',
  // violet / magenta
  vio0: '#24123d', vio1: '#3b1d5e', vio2: '#592d85', vio3: '#7e43a8', vio4: '#a862c4', vio5: '#d08fdc',
  pnk0: '#e86aa0', pnk1: '#f7a6c4',
  // steel blues
  blu0: '#121c3a', blu1: '#1b2c58', blu2: '#264276', blu3: '#345c96', blu4: '#4a7cb6', blu5: '#6c9fd2', blu6: '#9cc4ea',
  // skin tones
  skn0: '#3b2219', skn1: '#5c3423', skn2: '#7e4b2f', skn3: '#a3683f', skn4: '#c58a5a', skn5: '#e0ad80', skn6: '#f2cfa8',
} as const;

export type ColorKey = keyof typeof PALETTE;
export const KEYS = Object.keys(PALETTE) as ColorKey[];

/** Palette index per key. 0 is reserved for "transparent". */
export const C = Object.fromEntries(KEYS.map((k, i) => [k, i + 1])) as Record<ColorKey, number>;
export const TRANSPARENT = 0;

export type Era = 0 | 1 | 2 | 3 | 4;
export const ERA_NAMES = ['Smog & Silicon', 'Grid Rush', 'Solarpunk Bloom', 'Orbital Dawn', 'Swarmlight'] as const;

// ── colour maths ─────────────────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const clamp = (v: number, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));

function rgbToHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function adjust(c: RGB, { dh = 0, ds = 1, dl = 0 }: { dh?: number; ds?: number; dl?: number }): RGB {
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb([h + dh, Math.min(1, s * ds), Math.max(0, Math.min(1, l + dl))]);
}

/** How each era grades the master palette. Era 1 (Grid Rush) is the reference look. */
function eraGrade(era: Era, key: ColorKey, c: RGB): RGB {
  const fam = key.replace(/\d+$/, '');
  switch (era) {
    case 0: {
      // Smog & Silicon: hazy brown skies, tired greens, sodium-orange lights
      if (fam === 'sky') c = mix(c, hexToRgb('#a6967f'), 0.3);
      else if (fam === 'grn') c = mix(adjust(c, { dh: -10, ds: 0.72 }), hexToRgb('#7d6f52'), 0.12);
      else if (fam === 'sea') c = adjust(c, { ds: 0.78, dh: 6 });
      else if (fam === 'dusk') c = mix(c, hexToRgb('#a2604a'), 0.15);
      else if (fam === 'cyn' || fam === 'blu') c = adjust(c, { ds: 0.85 });
      return adjust(c, { ds: 0.93 });
    }
    case 1:
      return c;
    case 2: {
      // Solarpunk Bloom: lush greens, gold light, clean bright sky
      if (fam === 'grn') c = adjust(c, { ds: 1.18, dl: 0.025, dh: 4 });
      else if (fam === 'sky') c = adjust(c, { ds: 1.12, dl: 0.02, dh: -6 });
      else if (fam === 'yel' || fam === 'org') c = adjust(c, { dh: -4, ds: 1.05 });
      else if (fam === 'sea') c = adjust(c, { dh: -8, ds: 1.1 });
      return c;
    }
    case 3: {
      // Orbital Dawn: deep blue-violet skies, aurora teals, cool night
      if (fam === 'sky') c = adjust(c, { dh: 22, dl: -0.07, ds: 1.1 });
      else if (fam === 'sea') c = adjust(c, { dh: 10, dl: -0.02 });
      else if (fam === 'cyn') c = adjust(c, { ds: 1.2, dl: 0.03 });
      else if (fam === 'grn') c = adjust(c, { dh: 10, ds: 0.95 });
      else if (fam === 'night' || fam === 'dusk') c = adjust(c, { dh: 12, ds: 1.15 });
      else if (fam === 'ink') c = mix(c, hexToRgb('#3a3d8a'), 0.06);
      return c;
    }
    case 4: {
      // Swarmlight (Act V): warm gold sunlight, deep gardened greens, violet-gold nights glittering with the swarm
      if (fam === 'sky') c = mix(adjust(c, { dh: -6, ds: 1.08, dl: 0.01 }), hexToRgb('#f0d48a'), 0.1);
      else if (fam === 'grn') c = adjust(c, { ds: 1.24, dl: 0.012, dh: 8 });
      else if (fam === 'yel' || fam === 'org') c = adjust(c, { ds: 1.12, dl: 0.025, dh: -2 });
      else if (fam === 'sea') c = adjust(c, { dh: -6, ds: 1.14, dl: 0.01 });
      else if (fam === 'cyn') c = adjust(c, { ds: 1.12, dl: 0.02 });
      else if (fam === 'night') c = mix(adjust(c, { dh: 18, ds: 1.1 }), hexToRgb('#4b3a6a'), 0.12);
      else if (fam === 'dusk') c = mix(adjust(c, { dh: -8, ds: 1.1 }), hexToRgb('#e09a5a'), 0.1);
      else if (fam === 'ink') c = mix(c, hexToRgb('#4a3f5c'), 0.05);
      return c;
    }
  }
}

// ── current era palette ─────────────────────────────────────────────────────────────────────
let era: Era = 0;
/** RGBA bytes per palette index (index 0 = transparent). */
let table = new Uint8Array((KEYS.length + 1) * 4);
const listeners = new Set<(era: Era) => void>();

function rebuild() {
  table = new Uint8Array((KEYS.length + 1) * 4);
  KEYS.forEach((k, i) => {
    const c = eraGrade(era, k, hexToRgb(PALETTE[k]));
    const o = (i + 1) * 4;
    table[o] = clamp(Math.round(c[0]));
    table[o + 1] = clamp(Math.round(c[1]));
    table[o + 2] = clamp(Math.round(c[2]));
    table[o + 3] = 255;
  });
}
rebuild();

export function getEra(): Era {
  return era;
}

export function setEra(next: Era) {
  if (next === era) return;
  era = next;
  rebuild();
  for (const fn of listeners) fn(era);
}

export function onEraChange(fn: (era: Era) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** RGBA lookup table for the current era (index → 4 bytes). */
export function paletteTable(): Uint8Array {
  return table;
}

export function rgb(key: ColorKey | number): RGB {
  const i = typeof key === 'number' ? key : C[key];
  return [table[i * 4], table[i * 4 + 1], table[i * 4 + 2]];
}

/** 0xRRGGBB for Pixi tints / clear colours. */
export function hex(key: ColorKey | number): number {
  const [r, g, b] = rgb(key);
  return (r << 16) | (g << 8) | b;
}

export function css(key: ColorKey | number, alpha = 1): string {
  const [r, g, b] = rgb(key);
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** Push the palette into CSS custom properties (--c-ink3 …) so the DOM UI shares it. */
export function syncCssVars(root: HTMLElement = document.documentElement) {
  for (const k of KEYS) root.style.setProperty(`--c-${k}`, css(k));
}
