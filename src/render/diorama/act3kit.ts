/**
 * Shared drawing kit for the Act III dioramas (Charter HQ, megaprojects, the launch complex):
 * colour ramps from a palette key, builder-coloured cranes, flags and banners, survey stakes,
 * billboards, lush trees and tiny people. Pure PixelCanvas code with palette indices only.
 */
import { C, getEra, type ColorKey } from '../palette';
import { stampPerson, stampSeated } from './people';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import { builderColor } from '../../sim/charterView';
import type { RegionId } from '../../content/mapcodes';

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

// ── the Charter's own colours ──────────────────────────────────────────────────────────────
export const CHARTER = { field: C.blu3, fieldDark: C.blu2, planet: C.white, ring: C.yel0, ringDark: C.org1 };

/**
 * The Charter emblem: a small white planet inside a gold orbit, on a blue disc.
 * Drawn 9×7 (small) or 15×11 (large) at (x, y) top-left.
 */
export function emblem(pc: PixelCanvas, g: PixelCanvas | null, x: number, y: number, big = false) {
  const w = big ? 15 : 9;
  const h = big ? 11 : 7;
  const cx = x + w / 2;
  const cy = y + h / 2;
  // planet
  const r = big ? 3.2 : 2.1;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const c = dx + dy < -r * 0.3 ? C.white : dx + dy < r * 0.5 ? C.ice2 : C.ice1;
      pc.set(xx, yy, c);
      g?.set(xx, yy, C.ice2);
    }
  }
  // orbit ring (tilted ellipse), front half over the planet
  const rx = w / 2 - 0.2;
  const ry = big ? 2.2 : 1.4;
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    const px = Math.round(cx - 0.5 + Math.cos(t) * rx);
    const py = Math.round(cy - 0.5 + Math.sin(t) * ry - Math.cos(t) * (big ? 1.2 : 0.7));
    const front = Math.sin(t) > 0;
    if (!front && pc.get(px, py) === C.white) continue;
    pc.set(px, py, front ? C.yel0 : C.org1);
    g?.set(px, py, C.yel0);
  }
}

// ── banners of the twelve blocs ────────────────────────────────────────────────────────────
/**
 * Abstract bloc banners for the Council's flag alley: each bloc's own colour field in simple
 * halves, a stripe, a wave or a chevron, one small neutral emblem, and a swallowtail fly.
 * Deliberately unlike any real country's flag: the blocs are fictional, and Act III sets them
 * against each other (sanctions, walkouts, standoffs).
 */
type BannerField = 'h2' | 'v2' | 'd2' | 'wave' | 'band' | 'chevron' | 'hoist';

/** Emblems as tiny pixel grids: 'x' = the emblem colour, 'w' = white. */
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

interface Banner {
  field: BannerField;
  /** Main colour and the second colour of the field. */
  a: number;
  b: number;
  mark: keyof typeof MARKS;
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
 * Colour of a bloc's banner at (i, j), i = 0 at the hoist, in an 8×5 banner; 0 where the
 * swallowtail is cut out of the fly.
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

/**
 * A flag flying from a pole: pole from baseY up h px, flag w×fh at the top, waving with `wave`
 * (0..3). `at(i, j)` gives the flag's colour (0 = transparent).
 */
export function flagOnPole(pc: PixelCanvas, x: number, baseY: number, h: number, w: number, fh: number, wave: number, at: (i: number, j: number) => number, pole = C.ink8) {
  pc.vline(x, baseY - h, h, pole);
  pc.set(x, baseY - h - 1, C.yel1);
  for (let i = 0; i < w; i++) {
    // a travelling ripple: the free end flutters more
    const amp = i / w;
    const dy = Math.round(Math.sin((i / w) * Math.PI * 1.6 - wave * (Math.PI / 2)) * amp * 1.2);
    for (let j = 0; j < fh; j++) {
      let c = at(i, j);
      if (!c) continue; // cut-outs (a swallowtail fly)
      // shade the troughs of the ripple
      if (dy > 0 && ditherAt(x + i, j, 0.4)) c = darker(c);
      pc.set(x + 1 + i, baseY - h + j + dy, c);
    }
  }
}

/** One step darker along the colour's own ramp. */
export function darker(c: number): number {
  for (const fam of FAMILIES) {
    const i = fam.findIndex((k) => C[k] === c);
    if (i > 0) return C[fam[i - 1]];
    if (i === 0) return c;
  }
  return c;
}

/** A pennant-style builder flag on a short pole (two-tone, with a white stripe). */
export function builderFlag(pc: PixelCanvas, x: number, baseY: number, h: number, r: Ramp4, wave = 0) {
  flagOnPole(pc, x, baseY, h, 7, 4, wave, (i, j) => (j === 1 && i > 1 ? C.white : j < 2 ? r.lit : r.base), C.ink7);
}

// ── construction kit ───────────────────────────────────────────────────────────────────────
/** Tower crane in a builder's colours: mast at x from topY to baseY, jib along topY. */
export function crane(pc: PixelCanvas, g: PixelCanvas | null, x: number, topY: number, baseY: number, jibL: number, jibR: number, hook: number | null, r: Ramp4, beaconOn = true) {
  const a = r.lit;
  const b = r.base;
  for (let y = topY; y < baseY; y += 2) {
    pc.set(x + 1, y + 1, b);
  }
  pc.vline(x, topY, baseY - topY, a);
  pc.vline(x + 2, topY, baseY - topY, b);
  for (let y = topY + 1; y < baseY; y += 4) pc.line(x, y, x + 2, y + 2, b);
  // jib + counter-jib
  pc.hline(x - jibL, topY, jibL + jibR + 3, a);
  pc.hline(x - jibL, topY + 1, jibL + jibR + 3, b);
  for (let xx = x - jibL; xx < x + jibR + 3; xx += 3) pc.set(xx, topY + 1, a);
  // cab, counterweight, apex and its pendants
  pc.rect(x - 1, topY + 2, 5, 3, C.ink5);
  pc.set(x, topY + 3, C.sky4);
  pc.rect(x + jibR - 2, topY + 2, 4, 3, C.ink3);
  pc.vline(x + 1, topY - 5, 5, a);
  pc.line(x + 1, topY - 5, x - jibL + 2, topY - 1, C.ink7);
  pc.line(x + 1, topY - 5, x + jibR, topY - 1, C.ink7);
  pc.set(x + 1, topY - 6, beaconOn ? C.red3 : C.red1);
  if (beaconOn) g?.set(x + 1, topY - 6, C.red3);
  if (hook !== null) {
    const hx = x - Math.round(jibL * 0.6);
    pc.vline(hx, topY + 2, hook, C.ink7);
    pc.rect(hx - 1, topY + 2 + hook, 3, 2, C.ink3);
  }
  // concrete footing
  pc.rect(x - 2, baseY - 2, 7, 2, C.ink6);
}

/** Crawler crane with a lattice boom (wind turbine erection, heavy lifts). */
export function crawlerLattice(pc: PixelCanvas, g: PixelCanvas | null, x: number, baseY: number, boomLen: number, angleDeg: number, r: Ramp4, hookDrop = 12, beaconOn = true) {
  // tracks + body
  pc.rect(x - 2, baseY - 4, 20, 4, C.ink3);
  pc.hline(x - 2, baseY - 4, 20, C.ink5);
  for (let k = 0; k < 20; k += 3) pc.set(x - 2 + k, baseY - 2, C.ink5);
  pc.rect(x + 1, baseY - 10, 14, 6, r.base);
  pc.hline(x + 1, baseY - 10, 14, r.lit);
  pc.rect(x + 11, baseY - 9, 3, 3, C.sky4);
  pc.rect(x + 1, baseY - 8, 4, 4, C.ink4); // counterweight
  // boom: two chords with lacing
  const a = (angleDeg * Math.PI) / 180;
  const bx = x + 9;
  const by = baseY - 10;
  const tx = bx + Math.cos(a) * boomLen;
  const ty = by - Math.sin(a) * boomLen;
  pc.line(bx, by, tx, ty, r.lit);
  pc.line(bx + 2, by, tx + 1, ty + 1, r.base);
  const steps = Math.floor(boomLen / 3);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const px = bx + (tx - bx) * t0;
    const py = by + (ty - by) * t0;
    if (i % 2) pc.set(Math.round(px + 1), Math.round(py), r.dark);
  }
  // mast + pendant lines back to the body
  pc.line(x + 4, baseY - 10, x + 2, baseY - 18, C.ink6);
  pc.line(x + 2, baseY - 18, tx, ty, C.ink7);
  // hook block
  pc.vline(Math.round(tx), Math.round(ty) + 1, hookDrop, C.ink6);
  pc.rect(Math.round(tx) - 1, Math.round(ty) + 1 + hookDrop, 3, 2, C.ink3);
  pc.set(Math.round(tx), Math.round(ty) - 1, beaconOn ? C.red3 : C.red1);
  if (beaconOn) g?.set(Math.round(tx), Math.round(ty) - 1, C.red3);
  return [Math.round(tx), Math.round(ty) + 3 + hookDrop] as [number, number];
}

/** Portable site cabins stacked two high in the builder's colour, with lit windows. */
export function siteCabins(pc: PixelCanvas, g: PixelCanvas | null, x: number, baseY: number, n: number, r: Ramp4) {
  for (let i = 0; i < n; i++) {
    const cx = x + i * 15;
    for (let lvl = 0; lvl < (i % 2 ? 1 : 2); lvl++) {
      const y = baseY - 7 - lvl * 7;
      pc.rect(cx, y, 14, 7, r.base);
      pc.hline(cx, y, 14, r.lit);
      pc.vline(cx + 13, y, 7, r.dark);
      pc.rect(cx + 2, y + 2, 3, 2, C.ink1);
      pc.rect(cx + 8, y + 2, 3, 2, C.ink1);
      g?.rect(cx + 2, y + 2, 3, 2, C.yel1);
      if ((i + lvl) % 2 === 0) g?.rect(cx + 8, y + 2, 3, 2, C.yel0);
    }
  }
}

/** Hoarding along a building site: panels in the builder's colours with a white stripe. */
export function hoarding(pc: PixelCanvas, x: number, baseY: number, w: number, r: Ramp4) {
  for (let i = 0; i < w; i++) {
    const panel = Math.floor(i / 9) % 2;
    pc.set(x + i, baseY - 5, C.white);
    for (let j = 0; j < 4; j++) pc.set(x + i, baseY - 4 + j, j === 1 ? (panel ? r.lit : C.white) : panel ? r.base : r.mid);
  }
}

/** Survey stakes across a stretch of open land: corner stakes with flags, a string line, pegs. */
export function surveyStakes(pc: PixelCanvas, x: number, baseY: number, w: number, seed = 0) {
  for (let i = 0; i < w; i += 2) pc.set(x + i, baseY - 2, C.ink9);
  const n = Math.max(2, Math.round(w / 34));
  for (let k = 0; k <= n; k++) {
    const sx = x + Math.round((k / n) * (w - 2));
    pc.vline(sx, baseY - 9, 8, C.snd3);
    pc.set(sx, baseY - 10, C.snd4);
    pc.rect(sx + 1, baseY - 10, 3, 2, k % 2 ? C.org1 : C.pnk0);
    pc.set(sx + 1, baseY - 8, C.org0);
  }
  // pegs with marker tape between the stakes
  for (let i = 5; i < w - 4; i += 7 + Math.floor(hash2(i, seed, 3) * 5)) {
    pc.vline(x + i, baseY - 4, 3, C.snd4);
    if (hash2(i, seed, 4) > 0.5) pc.set(x + i, baseY - 5, C.org1);
  }
}

/** A surveyor's tripod with a theodolite. */
export function theodolite(pc: PixelCanvas, x: number, baseY: number) {
  pc.line(x, baseY - 1, x + 3, baseY - 9, C.snd3);
  pc.line(x + 6, baseY - 1, x + 3, baseY - 9, C.snd3);
  pc.vline(x + 3, baseY - 9, 8, C.snd2);
  pc.rect(x + 2, baseY - 12, 3, 3, C.yel0);
  pc.set(x + 5, baseY - 11, C.ink3);
}

// ── signage ────────────────────────────────────────────────────────────────────────────────
/**
 * The Charter's site billboard: a navy board on legs with the emblem and two lines of text
 * (lit at night). Returns its width.
 */
export function billboard(pc: PixelCanvas, g: PixelCanvas, x: number, baseY: number, top: string, bottom: string, legH = 8): number {
  const tw = Math.max(measureText(top), measureText(bottom));
  const w = tw + 28;
  const h = 18;
  const y = baseY - legH - h;
  // legs
  pc.rect(x + 4, y + h, 2, legH, C.ink5);
  pc.rect(x + w - 6, y + h, 2, legH, C.ink5);
  // board with a gold rim
  pc.rect(x, y, w, h, CHARTER.fieldDark);
  pc.box(x, y, w, h, C.yel0);
  pc.hline(x + 1, y + h - 1, w - 2, C.org1);
  emblem(pc, g, x + 3, y + 3, true);
  drawText(pc, top, x + 21, y + 3, C.white);
  drawText(g, top, x + 21, y + 3, C.ice2);
  drawText(pc, bottom, x + 21, y + 10, C.yel0);
  drawText(g, bottom, x + 21, y + 10, C.yel0);
  // two little lamps on the top edge
  pc.set(x + 3, y - 1, C.ink6);
  pc.set(x + w - 4, y - 1, C.ink6);
  g.set(x + 3, y, C.yel1);
  g.set(x + w - 4, y, C.yel1);
  return w;
}

// ── people & plants ────────────────────────────────────────────────────────────────────────

/**
 * A standing person with feet on footY (the body's left column at x): the same outlined figure
 * the walkers use (people.ts). pose 1 waves. Half of them face left.
 */
export function person(pc: PixelCanvas, x: number, footY: number, seed: number, pose = 0) {
  stampPerson(pc, x, footY, seed, pose === 1 ? 'wave' : 'stand', getEra(), hash2(seed, 9, 3) < 0.5);
}

/** A seated person (on a bench at seatY). */
export function seated(pc: PixelCanvas, x: number, seatY: number, seed: number) {
  stampSeated(pc, x, seatY, seed, getEra());
}

/**
 * A lush round tree (lit from the upper left). r = crown radius. `flower` dots a few blossoms in.
 */
export function lushTree(pc: PixelCanvas, x: number, baseY: number, r: number, seed: number, flower = 0) {
  const trunkH = Math.max(2, Math.round(r * 0.9));
  pc.vline(x, baseY - trunkH, trunkH, C.snd2);
  if (r >= 4) pc.vline(x + 1, baseY - trunkH, trunkH, C.snd1);
  const cy = baseY - trunkH - r + 1;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r + 1); xx++) {
      const dx = xx + 0.5 - (x + 0.5);
      const dy = yy + 0.5 - cy;
      // lumpy crown
      const lump = (hash2(Math.round(Math.atan2(dy, dx) * 3), seed, 9) - 0.5) * 0.9;
      const d = Math.hypot(dx, dy * 1.05);
      if (d > r + lump) continue;
      const l = (-dx * 0.7 - dy) / Math.max(1, r);
      let c = l > 0.55 ? C.grn6 : l > 0.05 ? C.grn5 : l > -0.5 ? C.grn4 : C.grn3;
      if (l > 0.05 && l <= 0.55 && ditherAt(xx, yy, (l - 0.05) * 1.6)) c = C.grn6;
      if (l <= 0.05 && l > -0.5 && ditherAt(xx, yy, (0.05 - l) * 1.2)) c = C.grn3;
      if (d > r - 0.8 && dy > 0) c = C.grn2;
      if (flower && hash2(xx, yy, seed + 3) < 0.08 * flower && l > -0.3) c = flower > 1 ? C.pnk1 : C.yel1;
      pc.set(xx, yy, c);
    }
  }
}

/** A planter box (timber) with a low hedge. */
export function planter(pc: PixelCanvas, x: number, baseY: number, w: number) {
  pc.rect(x, baseY - 3, w, 3, C.snd4);
  pc.hline(x, baseY - 3, w, C.snd5);
  for (let i = 0; i < w; i++) {
    const hgt = 1 + (hash2(x + i, 3, 7) > 0.5 ? 1 : 0);
    for (let j = 0; j < hgt; j++) pc.set(x + i, baseY - 4 - j, j === hgt - 1 && bayer(x + i, j) < 8 ? C.grn6 : C.grn4);
  }
}

/** Rooftop solar canopy: tilted panels on posts (w wide, standing on roofY). */
export function solarCanopy(pc: PixelCanvas, x: number, roofY: number, w: number, postH = 3) {
  for (let i = 0; i < w; i += 7) {
    const pw = Math.min(6, w - i);
    pc.vline(x + i + 1, roofY - postH, postH, C.ink6);
    pc.hline(x + i, roofY - postH - 1, pw, C.blu3);
    pc.hline(x + i + 1, roofY - postH - 2, pw, C.sky4);
    if (pw > 3) pc.set(x + i + 3, roofY - postH - 1, C.blu4);
  }
}

/** Festoon lights: a sagging string between two points; bulbs glow at night. */
export function festoon(pc: PixelCanvas, g: PixelCanvas, x0: number, y0: number, x1: number, y1: number, sag: number, seed = 0) {
  const n = Math.max(2, Math.abs(x1 - x0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag);
    if (i % 4 === 2) {
      const c = [C.yel1, C.org2, C.yel0, C.pnk1][Math.floor(hash2(i, seed, 2) * 4)];
      pc.set(x, y, c);
      g.set(x, y, c);
    } else pc.set(x, y, C.ink5);
  }
}
