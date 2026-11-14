/**
 * What the site planner (plan.ts, plan5.ts) and the set pieces share: colour ramps from a palette key, the
 * builders' colours and sign names, the Charter's colours, the twelve blocs' banners, and the flags a yard or
 * asteroid piece carries in its variant string. Colours are palette indices (render/palette.ts).
 */
import { C, type ColorKey } from '../../render/palette';
import { builderColor } from '../../sim/charterView';
import type { RegionId } from '../../content/mapcodes';
import type { FusionDesignId } from '../../sim/types';

/** A four-step ramp around one palette colour (shadow → highlight). */
export interface Ramp4 {
  dark: number;
  mid: number;
  base: number;
  lit: number;
  hi: number;
}

const FAMILIES: ColorKey[][] = [
  ['ink0', 'ink1', 'ink2', 'ink3', 'ink4', 'ink5', 'ink6', 'ink7', 'ink8', 'ink9', 'white'],
  ['sea0', 'sea1', 'sea2', 'sea3', 'sea4', 'sea5', 'sea6', 'sea7', 'sea8', 'foam'],
  ['sky0', 'sky1', 'sky2', 'sky3', 'sky4', 'sky5'],
  ['grn0', 'grn1', 'grn2', 'grn3', 'grn4', 'grn5', 'grn6', 'grn7', 'grn8'],
  ['snd0', 'snd1', 'snd2', 'snd3', 'snd4', 'snd5', 'snd6', 'snd7', 'snd8'],
  ['rck0', 'rck1', 'rck2', 'rck3', 'rck4', 'rck5', 'rck6'],
  ['ice0', 'ice1', 'ice2', 'ice3', 'white'],
  ['red0', 'red1', 'red2', 'red3', 'org0', 'org1', 'org2', 'yel0', 'yel1', 'yel2'],
  ['cyn0', 'cyn1', 'cyn2', 'cyn3', 'cyn4', 'cyn5', 'cyn6'],
  ['vio0', 'vio1', 'vio2', 'vio3', 'vio4', 'vio5', 'pnk0', 'pnk1'],
  ['blu0', 'blu1', 'blu2', 'blu3', 'blu4', 'blu5', 'blu6'],
  ['skn0', 'skn1', 'skn2', 'skn3', 'skn4', 'skn5', 'skn6'],
];

/** The ramp a palette colour sits in: two steps darker … two steps lighter. */
export function rampOf(key: ColorKey): Ramp4 {
  const fam = FAMILIES.find((f) => f.includes(key)) ?? FAMILIES[0];
  const i = fam.indexOf(key);
  const at = (k: number) => C[fam[Math.max(0, Math.min(fam.length - 1, i + k))]];
  return { dark: at(-2), mid: at(-1), base: at(0), lit: at(1), hi: at(2) };
}

/** A builder's colours (partners by their brand colour, your company in gold). */
export function builderRamp(builder: string): Ramp4 {
  return rampOf(builderColor(builder));
}

/** Short sign name for a builder ('you' signs as the company initials passed in). */
export function builderSign(builder: string, you = 'YOU'): string {
  if (builder === 'you') return you;
  const names: Record<string, string> = { karman: 'KARMAN', littlesun: 'LITTLE SUN' };
  return names[builder] ?? builder.toUpperCase();
}


/** The Charter's own blue (its kit and signs wear it). */
export const CHARTER_ACCENT = { accent: C.blu3, accentHi: C.blu5 };

// ── banners of the twelve blocs ────────────────────────────────────────────────────────────
/**
 * Abstract bloc banners for the Council's flag alley: each bloc's own colour field in simple
 * halves, a stripe, a wave or a chevron, one small neutral emblem, and a swallowtail fly.
 * Deliberately unlike any real country's flag: the blocs are fictional, and Act III sets them
 * against each other (sanctions, walkouts, standoffs).
 */
type BannerField = 'h2' | 'v2' | 'd2' | 'wave' | 'band' | 'chevron' | 'hoist';

/**
 * Where each emblem sits on the banner's 8×5 design grid ('x' = the emblem colour, 'w' = white): the cells it
 * covers, for `blocBannerAt` (a coarse sample of a banner: the tests tell the twelve apart by it). On the cloth the
 * emblems are smooth heraldic devices drawn over these cells (`MARK_ART` in sets/geneva/common.ts).
 */
const MARKS = {
  pillar: ['x', 'x', 'x'],
  ring: ['xxx', 'x.x', 'xxx'],
  orbit: ['.w.', 'xxx'],
  step: ['x..', 'xx.', 'xxx'],
  wave: ['x.x.', '.x.x'],
  chevron: ['x..', '.x.', 'x..'],
  peak: ['.x.', 'xxx'],
  pair: ['x.x'],
  diamond: ['.x.', 'x.x', '.x.'],
  arch: ['xxx', 'x.x'],
  leaf: ['.xx', 'xx.', 'x..'],
  dot: ['xx', 'xx'],
} as const;

export type BannerMark = keyof typeof MARKS;
/** An emblem's size on the design grid, in cells. */
export const markSize = (m: BannerMark): [number, number] => [MARKS[m][0].length, MARKS[m].length];

interface Banner {
  field: BannerField;
  /** Main colour and the second colour of the field. */
  a: number;
  b: number;
  mark: BannerMark;
  /** Emblem colour and its top-left in the 8×5 banner. */
  m: number;
  at: [number, number];
}

export const BLOC_BANNERS: Record<RegionId, Banner> = {
  atl: { field: 'd2', a: C.blu3, b: C.sky4, mark: 'pillar', m: C.yel0, at: [1, 1] },
  eam: { field: 'h2', a: C.red2, b: C.pnk1, mark: 'ring', m: C.yel0, at: [1, 1] },
  eur: { field: 'wave', a: C.cyn3, b: C.cyn5, mark: 'orbit', m: C.yel0, at: [1, 0] },
  sas: { field: 'v2', a: C.org2, b: C.vio2, mark: 'step', m: C.white, at: [1, 1] },
  pac: { field: 'h2', a: C.sea5, b: C.sea7, mark: 'wave', m: C.white, at: [1, 1] },
  fab: { field: 'hoist', a: C.pnk0, b: C.ink3, mark: 'chevron', m: C.white, at: [3, 1] },
  lat: { field: 'd2', a: C.org1, b: C.blu2, mark: 'peak', m: C.white, at: [1, 1] },
  seo: { field: 'band', a: C.sky3, b: C.grn7, mark: 'pair', m: C.yel0, at: [1, 1] },
  mena: { field: 'wave', a: C.snd5, b: C.rck3, mark: 'diamond', m: C.white, at: [1, 0] },
  ssa: { field: 'chevron', a: C.grn6, b: C.snd2, mark: 'arch', m: C.white, at: [3, 1] },
  stp: { field: 'v2', a: C.grn3, b: C.snd6, mark: 'leaf', m: C.yel0, at: [1, 1] },
  nor: { field: 'd2', a: C.vio3, b: C.cyn5, mark: 'dot', m: C.white, at: [1, 1] },
};

/** The two colours each bloc shows in the Council hall's frieze (upper row, lower row). */
export const BLOC_FRIEZE: Record<RegionId, [number, number]> = {
  atl: [C.red3, C.red3],
  pac: [C.sea6, C.yel0],
  lat: [C.grn5, C.yel0],
  eur: [C.blu2, C.yel0],
  nor: [C.red3, C.red3],
  stp: [C.white, C.blu3],
  mena: [C.grn3, C.grn3],
  ssa: [C.grn5, C.yel0],
  sas: [C.org1, C.org1],
  eam: [C.red3, C.yel0],
  fab: [C.white, C.red3],
  seo: [C.cyn3, C.cyn3],
};

/** Council seats in vote-weight order (the flag alley runs this way). */
export const BLOC_ORDER: RegionId[] = ['atl', 'eam', 'eur', 'sas', 'pac', 'fab', 'lat', 'seo', 'mena', 'ssa', 'stp', 'nor'];

/**
 * Colour of a bloc's banner at cell (i, j) of its 8×5 design grid, i = 0 at the hoist; 0 where the swallowtail is
 * cut out of the fly. (A coarse sample: the flags themselves are drawn smooth, see sets/geneva/common.ts.)
 */
export function blocBannerAt(id: RegionId, i: number, j: number): number {
  if ((i === 7 && j >= 1 && j <= 3) || (i === 6 && j === 2)) return 0;
  const f = BLOC_BANNERS[id];
  const row = MARKS[f.mark][j - f.at[1]];
  const ch = row?.[i - f.at[0]];
  if (ch === 'x') return f.m;
  if (ch === 'w') return C.white;
  switch (f.field) {
    case 'h2':
      return j <= 2 ? f.a : f.b;
    case 'v2':
      return i < 4 ? f.a : f.b;
    case 'd2':
      return i + j * 1.6 < 6.2 ? f.a : f.b;
    case 'wave':
      return j < 2 + ((i >> 1) & 1) ? f.a : f.b;
    case 'band':
      return j === 2 ? f.b : f.a;
    case 'chevron':
      return i <= 2 - Math.abs(j - 2) ? f.b : f.a;
    case 'hoist':
      return i < 2 ? f.b : f.a;
  }
}

// ── Act IV: fusion and air capture ─────────────────────────────────────────────────────────
/** The partner that builds each design (its colours band the halls). */
export const DESIGN_BUILDER: Record<FusionDesignId, string> = {
  tokamak: 'sunforge',
  stellarator: 'twistfield',
  laser: 'kindle',
  pinch: 'quickpinch',
  dhe3: 'sunforge',
};

/** How many DAC farm blocks a site's air capture shows (Gt CO₂ per year). */
export function dacBlocks(gt: number): number {
  if (gt <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(1 + Math.log2(gt / 0.5))));
}

// ── Act V: what a yard or asteroid piece is doing ──────────────────────────────────────────
/** What a module makes: c collectors, r radiator rings, h hull sections. */
export type Product = 'c' | 'r' | 'h';

export interface YardFlags {
  halted: boolean;
  /** Solar Maximum: 0 none, 1..3. */
  storm: number;
  /** Quarantine level on this piece (a drifting strain): 0 none, 1..3. */
  q: number;
}

export function flagString(f: Partial<YardFlags>): string {
  return `${f.halted ? 'h' : ''}${f.storm ? `s${f.storm}` : ''}${f.q ? `q${f.q}` : ''}`;
}

export function parseFlags(s: string | undefined): YardFlags {
  const t = s ?? '';
  return { halted: t.includes('h'), storm: Number(/s(\d)/.exec(t)?.[1] ?? 0), q: Number(/q(\d)/.exec(t)?.[1] ?? 0) };
}
