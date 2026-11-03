/**
 * Shared drawing kit for the Act III dioramas (Charter HQ, megaprojects, the launch complex):
 * colour ramps from a palette key, builder-coloured cranes, flags and banners, survey stakes,
 * billboards, lush trees and tiny people. Pure PixelCanvas code with palette indices only.
 */
import { C, type ColorKey } from '../palette';
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

// ── flags of the twelve blocs ──────────────────────────────────────────────────────────────
type FlagPattern = 'h3' | 'cross' | 'dot' | 'canton' | 'diag' | 'stars' | 'ring';

export const BLOC_FLAGS: Record<RegionId, { a: number; b: number; c: number; p: FlagPattern }> = {
  atl: { a: C.red3, b: C.white, c: C.blu2, p: 'canton' },
  pac: { a: C.sea6, b: C.yel0, c: C.sea6, p: 'dot' },
  lat: { a: C.grn5, b: C.yel0, c: C.blu3, p: 'diag' },
  eur: { a: C.blu2, b: C.yel0, c: C.blu2, p: 'ring' },
  nor: { a: C.red3, b: C.white, c: C.red3, p: 'cross' },
  stp: { a: C.white, b: C.blu3, c: C.red3, p: 'h3' },
  mena: { a: C.grn3, b: C.white, c: C.ink2, p: 'h3' },
  ssa: { a: C.grn5, b: C.yel0, c: C.red3, p: 'h3' },
  sas: { a: C.org1, b: C.white, c: C.grn4, p: 'h3' },
  eam: { a: C.red3, b: C.yel0, c: C.red3, p: 'stars' },
  fab: { a: C.white, b: C.red3, c: C.white, p: 'dot' },
  seo: { a: C.cyn3, b: C.white, c: C.cyn3, p: 'stars' },
};

/** Council seats in vote-weight order (the flag alley runs this way). */
export const BLOC_ORDER: RegionId[] = ['atl', 'eam', 'eur', 'sas', 'pac', 'fab', 'lat', 'seo', 'mena', 'ssa', 'stp', 'nor'];

/** Colour of a bloc flag at (i, j) in a w×h flag. */
export function blocFlagAt(id: RegionId, i: number, j: number, w: number, h: number): number {
  const f = BLOC_FLAGS[id];
  switch (f.p) {
    case 'h3':
      return j < Math.round(h / 3) ? f.a : j < Math.round((h * 2) / 3) ? f.b : f.c;
    case 'cross':
      return i === Math.floor(w * 0.36) || j === Math.floor(h / 2) ? f.b : f.a;
    case 'dot': {
      const dx = i + 0.5 - w / 2;
      const dy = j + 0.5 - h / 2;
      return dx * dx + dy * dy <= (h * 0.3) ** 2 + 0.6 ? f.b : f.a;
    }
    case 'canton':
      if (i < Math.ceil(w * 0.45) && j < Math.ceil(h / 2)) return f.c;
      return j % 2 ? f.b : f.a;
    case 'diag':
      return Math.abs(i * (h / w) - j) < 0.9 ? f.b : j > i * (h / w) ? f.c : f.a;
    case 'stars':
      return (i === 1 && j === 1) || ((i + j) % 4 === 0 && i > 2 && j > 0 && j < h - 1) ? f.b : f.a;
    case 'ring': {
      const dx = i + 0.5 - w / 2;
      const dy = (j + 0.5 - h / 2) * 1.3;
      const d = Math.hypot(dx, dy);
      return d > h * 0.28 && d < h * 0.52 && (i + j) % 2 === 0 ? f.b : f.a;
    }
  }
}

/**
 * A flag flying from a pole: pole from baseY up h px, flag w×fh at the top, waving with `wave`
 * (0..3). `at(i, j)` gives the flag's colour.
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
const SHIRTS = [C.blu4, C.org1, C.grn5, C.vio4, C.red3, C.cyn4, C.yel0, C.pnk0, C.white, C.sea6];
const SKINS = [C.skn1, C.skn2, C.skn3, C.skn4, C.skn5];
const HAIR = [C.ink1, C.snd1, C.snd3, C.ink2, C.yel0, C.rck2];

/** A standing person (3×7) with feet on footY. */
export function person(pc: PixelCanvas, x: number, footY: number, seed: number, pose = 0) {
  const shirt = SHIRTS[Math.floor(hash2(seed, 1, 5) * SHIRTS.length)];
  const skin = SKINS[Math.floor(hash2(seed, 2, 5) * SKINS.length)];
  const hair = HAIR[Math.floor(hash2(seed, 3, 5) * HAIR.length)];
  const legs = hash2(seed, 4, 5) > 0.5 ? C.ink2 : C.blu1;
  const y = footY - 7;
  pc.set(x + 1, y, hair);
  pc.set(x + 1, y + 1, skin);
  pc.hline(x, y + 2, 3, shirt);
  pc.hline(x, y + 3, 3, shirt);
  if (pose === 1) pc.set(x + 3, y + 2, skin); // waving / pointing
  pc.set(x + 1, y + 4, legs);
  pc.set(x, y + 5, legs);
  pc.set(x + 2, y + 5, legs);
  pc.set(x, y + 6, C.ink1);
  pc.set(x + 2, y + 6, C.ink1);
}

/** A seated person (on a bench at seatY). */
export function seated(pc: PixelCanvas, x: number, seatY: number, seed: number) {
  const shirt = SHIRTS[Math.floor(hash2(seed, 1, 6) * SHIRTS.length)];
  const skin = SKINS[Math.floor(hash2(seed, 2, 6) * SKINS.length)];
  const hair = HAIR[Math.floor(hash2(seed, 3, 6) * HAIR.length)];
  pc.set(x + 1, seatY - 5, hair);
  pc.set(x + 1, seatY - 4, skin);
  pc.hline(x, seatY - 3, 3, shirt);
  pc.hline(x, seatY - 2, 3, shirt);
  pc.hline(x + 1, seatY - 1, 3, C.ink2);
  pc.set(x + 3, seatY, C.ink2);
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
