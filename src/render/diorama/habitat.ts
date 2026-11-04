/**
 * Act V: inside Aurora, the first habitat at L5 (site 'aurora', backdrop 'habitat', from
 * `habitatView`). A rotating cylinder spun for one gravity: the land climbs away into the haze and
 * comes back overhead as the far side — fields, the river, towns — seen through miles of air. The
 * light comes from the sun-line, a window strip along the axis; at night the mirrors close, the
 * line goes dark (a few stars show through it) and the towns overhead light up.
 * In front: the valley with the river and its boats, then a row of places to live that changes with
 * the settlement plan — towns, a school, a park, farms and the square for 'settle'; dorm blocks,
 * pipes, hydroponics and works for 'stations'; glossy towers among villas and pools for 'private'.
 * `lived` (0..1) fills it in: more homes, more trees, more people.
 * Pure PixelCanvas code with palette indices only.
 */
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { Emitter, FacilityArt } from './art';
import type { BandProp, SceneBands } from './scenery';
import { crane, festoon, lushTree, person, rampOf, seated, siteCabins, type Ramp4 } from './act3kit';
import { sailboat } from './charterHQ';
import { pipe, scaffold, tank, vpipe, CONCRETE, STEEL } from './draw';
import { plate } from './act5kit';

export interface HabitatScenery {
  kind: 'habitat';
  /** 'settle' | 'stations' | 'private' | 'early' (no plan yet). */
  plan: string;
  /** How lived-in, 0..3. */
  lived: number;
}

// ════════════════════════════════════════ THE SKY ════════════════════════════════════════
/** Where the sun-line runs (screen y) for a view height. */
export const sunLineY = (h: number) => Math.round(h * 0.24);

/** A colour seen through more air: one step paler per step of haze, ending in the haze itself. */
const HAZE: Record<number, number> = {
  [C.grn2]: C.grn3, [C.grn3]: C.grn4, [C.grn4]: C.grn5, [C.grn5]: C.grn6, [C.grn6]: C.grn7, [C.grn7]: C.grn8, [C.grn8]: C.sky5,
  [C.snd4]: C.snd5, [C.snd5]: C.snd6, [C.snd6]: C.snd7, [C.snd7]: C.snd8, [C.snd8]: C.sky5,
  [C.sea5]: C.sea6, [C.sea6]: C.sea7, [C.sea7]: C.sea8, [C.sea8]: C.sky5,
  [C.white]: C.ice3, [C.ice3]: C.sky5, [C.red3]: C.org1, [C.red2]: C.red3, [C.org0]: C.org1, [C.org1]: C.snd7, [C.blu3]: C.blu4, [C.blu4]: C.sky4, [C.sky4]: C.sky5,
};
function hazed(c: number, steps: number, x: number, y: number): number {
  const whole = Math.floor(steps);
  let out = c;
  for (let i = 0; i < whole; i++) out = HAZE[out] ?? C.sky5;
  if (ditherAt(x, y, steps - whole)) out = HAZE[out] ?? C.sky5;
  return out;
}

/** Long field strips, as they run along the cylinder (lengths and colours by row). */
function fieldAt(x: number, row: number, seed: number, palette: number[]): { c: number; edge: boolean } {
  const len = 26 + Math.floor(hash2(row, 1, seed) * 50);
  const off = Math.floor(hash2(row, 2, seed) * len);
  const k = Math.floor((x + off) / len);
  const c = palette[Math.floor(hash2(k, row, seed) * palette.length)];
  return { c, edge: (x + off) % len === 0 };
}

/**
 * The sky inside the cylinder (screen-sized, fixed): the far side overhead as long hazy strips of
 * fields with the river and its towns; clouds hanging under it; the sun-line along the axis; clear
 * haze below; the land climbing up the walls at both edges of the view. Glow: the towns overhead at
 * night and stars through the closed window.
 */
export function habitatSkyArt(w: number, h: number, groundY: number, seed: number): { base: PixelCanvas; glow: PixelCanvas } {
  const pc = new PixelCanvas(w, h);
  const g = new PixelCanvas(w, h);
  const oh = Math.round(h * 0.15);
  const sl = sunLineY(h);
  const cx = w / 2;
  // the haze, palest near the line and toward the horizon
  for (let y = 0; y < h; y++) {
    const t = (y - sl) / Math.max(1, groundY - sl);
    for (let x = 0; x < w; x++) {
      let c = C.sky5;
      if (t > 0.18) c = ditherAt(x, y, Math.min(1, (t - 0.18) * 4)) ? C.sky4 : C.sky5;
      if (t > 0.6) c = ditherAt(x, y, Math.min(1, (t - 0.6) * 3)) ? C.ice2 : C.sky4;
      pc.set(x, y, c);
    }
  }
  // the far side, and its walls coming down at the edges of the view
  const wall = (x: number) => {
    const d = Math.abs(x - cx) / (w / 2);
    const e = Math.max(0, (d - 0.74) / 0.26);
    return Math.round(oh + Math.pow(e, 1.8) * (groundY - oh));
  };
  const OVER = [C.grn6, C.grn7, C.snd6, C.grn6, C.grn5, C.snd7];
  const river = (x: number) => Math.round(oh * 0.42 + Math.sin(x / 53 + seed) * oh * 0.2);
  for (let x = 0; x < w; x++) {
    const bottom = wall(x);
    for (let y = 0; y < bottom; y++) {
      const row = Math.floor(y / 3);
      const fld = fieldAt(x, row, seed, OVER);
      let c = fld.edge || y % 3 === 0 ? C.grn5 : fld.c;
      if (y < oh) {
        const rv = river(x);
        if (Math.abs(y - rv) <= 0) c = C.sea6;
        else if (Math.abs(y - rv) === 1) c = C.sea7;
        else if (Math.abs(y - rv) === 2) c = C.grn5;
        // towns strung along the river: pale roofs
        const town = hash2(Math.floor(x / 22), 3, seed) > 0.62 && x % 22 < 9 && Math.abs(y - rv) >= 2 && Math.abs(y - rv) <= 4;
        if (town && (x + y) % 2 === 0) c = hash2(x, y, 4) > 0.5 ? C.white : C.snd7;
        if (town && hash2(x, y, seed + 9) > 0.55) g.set(x, y, hash2(x, y, 2) > 0.5 ? C.yel1 : C.org2);
      } else if (hash2(x >> 1, y >> 1, seed + 10) > 0.97) g.set(x, y, C.yel0);
      // haze: pale overhead, paler still down the walls and at the band's lower edge
      const steps = y < oh ? 1.6 + Math.max(0, (y - oh * 0.75) / (oh * 0.25)) * 1.2 : 2.6 + ((y - oh) / Math.max(1, groundY - oh)) * 2.4;
      pc.set(x, y, hazed(c, steps, x, y));
    }
  }
  // clouds hanging under the far side
  for (let i = 0; i < Math.max(2, w / 120); i++) {
    const x0 = hash2(i, 1, seed + 2) * w;
    const y0 = oh + 3 + hash2(i, 2, seed + 2) * Math.max(1, sl - oh - 8);
    const cw = 16 + hash2(i, 3, seed + 2) * 26;
    for (let y = Math.floor(y0 - 2); y <= y0 + 1; y++) for (let x = Math.floor(x0 - cw / 2); x < x0 + cw / 2; x++) {
      const t = 1 - Math.abs(x - x0) / (cw / 2);
      if (bayer(x, y) < t * 16 - Math.abs(y - y0 + 0.5) * 5) pc.set(x, y, y < y0 ? C.white : C.ice3);
    }
  }
  // the sun-line: a window strip along the axis in its frame, white-hot, glaring softly into the haze
  for (let x = 0; x < w; x++) {
    for (let k = -7; k <= 7; k++) {
      const y = sl + k;
      const a = Math.abs(k);
      if (a <= 1) pc.set(x, y, C.white);
      else if (a === 2) pc.set(x, y, x % 28 === 0 ? C.ink8 : C.yel2);
      else if (a === 3) pc.set(x, y, x % 2 ? C.ink8 : C.ink7);
      else if (bayer(x, y) < (8 - a) * 2.4) pc.set(x, y, a < 5 ? C.yel2 : C.white);
    }
    // stars through the window when the mirrors close
    if (hash2(x, 1, seed + 5) > 0.8) g.set(x, sl + (x % 3) - 1, hash2(x, 2, seed) > 0.5 ? C.white : C.ice2);
  }
  return { base: pc, glow: g };
}

// ════════════════════════════════════════ BANDS ════════════════════════════════════════
const FIELD = [C.grn5, C.grn6, C.snd6, C.grn4, C.grn5, C.grn3, C.snd5];

/**
 * The land climbing away up the cylinder: long strips of fields, finer and paler the higher they
 * go until they melt into the haze, the river winding up through them, a village here and there.
 */
function habitatFar(w: number, h: number, seed: number): { base: PixelCanvas } {
  const pc = new PixelCanvas(w, h);
  // rows: tall at the bottom (near), thin at the top (far)
  const rowOf: number[] = [];
  let row = 0;
  for (let y = h - 1; y >= 0; ) {
    const t = 1 - y / h;
    const rh = Math.max(1, Math.round(4 - t * 3.2));
    for (let k = 0; k < rh && y >= 0; k++, y--) rowOf[y] = row;
    row++;
  }
  const riverX = (y: number) => w * 0.58 + (h - y) * 1.6 + Math.sin(y / 5 + seed) * 3;
  for (let y = 0; y < h; y++) {
    const t = 1 - y / h; // 0 at the bottom (near) … 1 at the top (far up the wall)
    const r = rowOf[y];
    const top = y === 0 || rowOf[y - 1] !== r;
    for (let x = 0; x < w; x++) {
      if (t > 0.82 && bayer(x, y) < ((t - 0.82) / 0.18) * 17) continue;
      const fld = fieldAt(x, r, seed + 3, FIELD);
      let c = fld.c;
      if (t < 0.55 && (top || fld.edge)) c = C.grn3;
      const rv = riverX(y);
      const rw = 0.6 + (1 - t) * 1.6;
      if (Math.abs(x - rv) < rw) c = C.sea6;
      else if (Math.abs(x - rv) < rw + 1 && t < 0.6) c = C.grn3;
      // villages: little white houses with red roofs (rows tall enough to show them)
      const vill = hash2(Math.floor(x / 40), r, seed + 7) > 0.84 && t < 0.5;
      if (vill && x % 40 < 14 && x % 5 < 3) c = top ? (x % 5 === 1 ? C.red3 : C.red2) : x % 5 === 2 ? C.snd7 : C.white;
      pc.set(x, y, hazed(c, t * 3.6, x, y));
    }
  }
  return { base: pc };
}

/** The valley in front of the far wall: meadows, hedges, round trees, a village, the river. */
function habitatMid(w: number, h: number, seed: number): { base: PixelCanvas; glow: PixelCanvas; waterY: number } {
  const pc = new PixelCanvas(w, h);
  const g = new PixelCanvas(w, h);
  const waterY = Math.round(h * 0.62);
  const top = (x: number) => Math.round(h * 0.18 + (fbm(x / 40, seed + 2, 1, 3) - 0.5) * h * 0.3);
  for (let x = 0; x < w; x++) {
    const t = top(x);
    for (let y = t; y < h; y++) {
      let c = y === t ? C.grn6 : bayer(x, y) < 5 ? C.grn4 : C.grn5;
      if (y > t + 2 && (y + Math.floor(x / 23)) % 7 === 0) c = C.grn3;
      if (y >= waterY && y < waterY + 5) {
        c = y === waterY ? C.grn3 : (x + y * 3) % 11 === 0 ? C.white : y === waterY + 1 ? C.sea7 : ditherAt(x, y, 0.5) ? C.sea6 : C.sea5;
        if (y === waterY + 2 && hash2(x >> 2, 3, seed) > 0.7) c = C.sky5;
      }
      if (y >= waterY + 5) c = y === waterY + 5 ? C.snd6 : bayer(x, y) < 6 ? C.grn5 : C.grn6;
      pc.set(x, y, c);
    }
  }
  // round trees and a village on the far bank
  for (let i = 0; i < w / 10; i++) {
    const x = Math.floor(hash2(i, 1, seed) * w);
    const t = top(x);
    const r = 2 + Math.floor(hash2(i, 2, seed) * 3);
    const y = Math.min(waterY - 2, t + 3 + Math.floor(hash2(i, 3, seed) * (waterY - t - 4)));
    for (let yy = y - r * 2; yy <= y; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      const d = Math.hypot(xx - x, (yy - (y - r)) * 1.1);
      if (d > r) continue;
      pc.set(xx, yy, xx - x + (yy - (y - r)) < -r * 0.4 ? C.grn6 : d > r - 1 ? C.grn2 : C.grn4);
    }
  }
  for (let v = 0; v < Math.max(1, w / 240); v++) {
    const vx = Math.floor(hash2(v, 9, seed) * (w - 60)) + 10;
    for (let k = 0; k < 6; k++) {
      const hx = vx + k * 8 + Math.floor(hash2(k, v, seed) * 3);
      const hy = waterY - 2 - Math.floor(hash2(k, v, seed + 1) * 4);
      pc.rect(hx, hy - 3, 5, 3, k % 3 ? C.white : C.snd8);
      pc.hline(hx - 1, hy - 4, 7, k % 2 ? C.red2 : C.org0);
      pc.set(hx + 2, hy - 5, k % 2 ? C.red2 : C.org0);
      pc.set(hx + 1, hy - 2, C.ink3);
      g.set(hx + 1, hy - 2, C.yel1);
      g.set(hx + 3, hy - 2, hash2(k, v, 3) > 0.4 ? C.org2 : 0);
    }
  }
  return { base: pc, glow: g, waterY };
}

/** The ground strip: grass, a gravel path, wildflowers. */
function habitatGround(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = y === 0 ? (hash2(x, 1, 3) > 0.3 ? C.grn6 : C.grn7) : y < 3 ? (bayer(x, y) < 6 ? C.grn4 : C.grn5) : bayer(x, y) < 4 ? C.grn4 : C.grn5;
      if (y >= 9 && y <= 13) c = y === 9 ? C.snd5 : y === 13 ? C.snd5 : (x + y) % 5 === 0 ? C.snd5 : y === 10 ? C.snd8 : C.snd7;
      if (y > 13 && bayer(x, y) < 3) c = C.grn3;
      pc.set(x, y, c);
    }
  }
  for (let i = 0; i < w / 3; i++) {
    const x = Math.floor(hash2(i, 1, 61) * w);
    const y = Math.floor(hash2(i, 2, 61) * (h - 2));
    if (y >= 8 && y <= 14) continue;
    pc.set(x, y, [C.pnk1, C.yel1, C.white, C.red3, C.vio5][i % 5]);
  }
  return pc;
}

/** The foreground lip: tall grass and flowers. */
function habitatFg(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(3 + (fbm(x / 9, 73) - 0.5) * 5);
    for (let y = top; y < h; y++) pc.set(x, y, y === top ? C.grn5 : y - top < 2 ? C.grn3 : C.grn2);
    if (x % 3 === 0) pc.vline(x, top - 2, 2, C.grn4);
    if (hash2(x, 4, 7) > 0.92) pc.set(x, top - 3, [C.pnk1, C.yel1, C.white][x % 3]);
  }
  return pc;
}

/** Every band inside the habitat. */
export function habitatBands(sc: HabitatScenery, seed: number, b: { farW: number; farH: number; midW: number; midH: number; midY: number; groundH: number; fgH: number }, sceneW: number, lampsUpTo: (end: number) => number[]): SceneBands {
  const far = habitatFar(b.farW, b.farH, seed);
  const mid = habitatMid(b.midW, b.midH, seed);
  const midProps: BandProp[] = [];
  const boats = 2 + sc.lived * 2;
  for (let i = 0; i < boats; i++) {
    const boat = i % 3 === 2 ? rowboat(i) : sailboat(i);
    midProps.push({ frames: [boat], x: Math.round(hash2(i, seed, 5) * b.midW), y: b.midY + mid.waterY + 3 - boat.h + (i % 2), fps: 0, drift: (i % 2 ? -1 : 1) * (1 + i * 0.4), wrap: b.midW + 20 });
  }
  return {
    seed,
    far: far.base,
    mid: mid.base,
    midGlow: mid.glow,
    midProps,
    ground: habitatGround(sceneW, b.groundH),
    fg: habitatFg(sceneW + 40, b.fgH),
    lamps: lampsUpTo(Infinity),
    walkers: true,
  };
}

function rowboat(v: number): PixelCanvas {
  const pc = new PixelCanvas(9, 5);
  pc.set(4, 0, [C.red3, C.yel0, C.blu4][v % 3]);
  pc.set(4, 1, C.skn4);
  pc.hline(1, 2, 7, C.snd3);
  pc.hline(0, 3, 9, C.snd4);
  pc.hline(1, 4, 7, C.snd2);
  pc.set(7, 1, C.snd5);
  return pc;
}

// ════════════════════════════════════════ PIECES ════════════════════════════════════════
/** Grass under every piece (the bottom three rows meet the ground strip). */
function lawn(pc: PixelCanvas, W: number, H: number) {
  for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 3 ? (hash2(x, 1, 3) > 0.3 ? C.grn6 : C.grn7) : bayer(x, y) < 6 ? C.grn4 : C.grn5);
}

/** Lit window: dark glass by day (with a glint), warm at night. */
function win(pc: PixelCanvas, g: PixelCanvas, x: number, y: number, w: number, h: number, seed: number, lit = 0.75) {
  pc.rect(x, y, w, h, C.blu1);
  pc.set(x, y, C.sky4);
  if (hash2(x, y, seed) < lit) g.rect(x, y, w, h, hash2(x, y, seed + 1) > 0.3 ? C.yel1 : C.org2);
}

/** A cottage: plaster walls, a pitched roof (lit on the left slope), windows and a door. */
function cottage(pc: PixelCanvas, g: PixelCanvas, x: number, base: number, w: number, h: number, seed: number, roof?: [number, number, number]) {
  const walls = [[C.white, C.snd8, C.snd7], [C.snd8, C.snd7, C.snd6], [C.ice3, C.ice2, C.ice1], [C.yel2, C.yel1, C.snd7]][Math.floor(hash2(seed, 1, 3) * 4)];
  const roofs: [number, number, number][] = [[C.org0, C.red3, C.red2], [C.org1, C.org0, C.red3], [C.blu4, C.blu3, C.blu2], [C.grn5, C.grn4, C.grn3]];
  const [rl, rb, rd] = roof ?? roofs[Math.floor(hash2(seed, 2, 3) * roofs.length)];
  for (let y = base - h; y < base; y++) for (let k = 0; k < w; k++) pc.set(x + k, y, k === 0 ? walls[0] : k === w - 1 ? walls[2] : walls[1]);
  const ridge = Math.round(w * 0.45);
  for (let j = 0; j <= ridge; j++) {
    const half = Math.round((ridge - j) * (w / 2 + 1) / ridge);
    const cy = base - h - j;
    for (let k = -half; k <= half; k++) {
      const xx = Math.round(x + w / 2 + k - 0.5);
      pc.set(xx, cy, k < -half + 1 ? rl : k < 0 ? (ditherAt(xx, cy, 0.3) ? rl : rb) : k === half ? rd : rb);
    }
  }
  pc.hline(x - 1, base - h, w + 2, rd);
  // solar tiles on the sunny slope
  if (hash2(seed, 5, 3) > 0.5) for (let j = 2; j < ridge - 1; j += 2) pc.hline(Math.round(x + j * 0.6), base - h - j, 3, C.blu2);
  win(pc, g, x + 2, base - h + 3, 3, 3, seed);
  if (w > 12) win(pc, g, x + w - 5, base - h + 3, 3, 3, seed + 1);
  pc.rect(x + Math.floor(w / 2) - 1, base - 6, 3, 6, C.snd2);
  pc.set(x + Math.floor(w / 2) + 1, base - 3, C.yel0);
}

/** A white picket fence. */
function picket(pc: PixelCanvas, x: number, base: number, w: number) {
  for (let k = 0; k < w; k++) {
    if (k % 2 === 0) pc.vline(x + k, base - 4, 4, C.white);
    pc.set(x + k, base - 3, C.ink9);
  }
}

/** Flowers along a bed. */
function flowers(pc: PixelCanvas, x: number, base: number, w: number, seed: number) {
  for (let k = 0; k < w; k++) {
    pc.set(x + k, base - 1, C.grn4);
    if (hash2(k, seed, 9) > 0.5) pc.set(x + k, base - 2, [C.pnk1, C.yel1, C.red3, C.vio5, C.white][Math.floor(hash2(k, seed, 8) * 5)]);
  }
}

/** A child (3×5) at play. */
function kid(pc: PixelCanvas, x: number, footY: number, seed: number, pose: number) {
  const shirt = [C.red3, C.yel0, C.blu4, C.grn5, C.pnk0][Math.floor(hash2(seed, 1, 4) * 5)];
  const skin = [C.skn2, C.skn3, C.skn4, C.skn5][Math.floor(hash2(seed, 2, 4) * 4)];
  const y = footY - 5 - (pose === 2 ? 2 : 0);
  pc.set(x + 1, y, skin);
  pc.hline(x, y + 1, 3, shirt);
  if (pose === 1) {
    pc.set(x - 1, y, skin);
    pc.set(x + 3, y, skin);
  }
  pc.set(x + 1, y + 2, shirt);
  pc.set(x, y + 3, C.ink2);
  pc.set(x + 2, y + 3, C.ink2);
  pc.set(x + (pose ? 0 : 1), y + 4, C.ink1);
  pc.set(x + 2, y + 4, C.ink1);
}

const people = (pc: PixelCanvas, xs: number[], base: number, seed: number, f: number) => xs.forEach((x, i) => person(pc, x, base, seed + i * 7, (f + i) % 3 === 0 ? 1 : 0));

/** Homes along a lane: cottages with gardens, fruit trees, a fence, neighbours chatting. */
export function habHouses(lived: number, seed: number): FacilityArt {
  const W = 156;
  const H = 66;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    lushTree(pc, 8, base, 7, seed + 1, 2);
    cottage(pc, g, 18, base, 22, 16, seed);
    cottage(pc, g, 58, base, 18, 14, seed + 3);
    if (lived >= 1) cottage(pc, g, 96, base, 24, 18, seed + 5);
    lushTree(pc, 48, base, 5, seed + 2, 1);
    lushTree(pc, 86, base, 6, seed + 4, 2);
    if (lived >= 2) cottage(pc, g, 128, base, 16, 13, seed + 7);
    else lushTree(pc, 136, base, 8, seed + 6, 1);
    picket(pc, 2, base, 52);
    picket(pc, 92, base, 32);
    flowers(pc, 56, base, 24, seed);
    // a washing line and neighbours over the fence
    for (let x = 41; x < 57; x++) pc.set(x, base - 12 + (Math.abs(x - 49) < 4 ? 1 : 0), C.ink6);
    for (const [cx, c] of [[44, C.red3], [48, C.sky4], [52, C.yel0]] as [number, number][]) pc.rect(cx, base - 11, 2, 3 + (f && cx === 48 ? 1 : 0), c);
    people(pc, lived >= 1 ? [46, 50, 88] : [46], base, seed, f);
    if (lived >= 3) {
      kid(pc, 112, base, seed + 1, f);
      kid(pc, 117, base, seed + 2, 1 - f);
    }
    // a cat on the wall
    pc.set(30, base - 5, C.ink2);
    pc.set(31, base - 5, C.ink2);
    pc.set(31, base - 6, C.ink2);
    pc.set(29, base - 5 - f, C.ink2);
    lawn(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [70, H] }, fps: 1.5 };
}

/** The school: two storeys, a bell tower, a playground with swings and children. */
export function habSchool(lived: number, seed: number, plan: string): FacilityArt {
  const W = 176;
  const H = 82;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const wall: [number, number, number] = plan === 'stations' ? [C.ink9, C.ink8, C.ink7] : [C.snd8, C.yel1, C.snd6];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the building
    const x0 = 6;
    const x1 = 96;
    const top = base - 34;
    for (let y = top; y < base; y++) for (let x = x0; x < x1; x++) pc.set(x, y, x === x0 ? wall[0] : x > x1 - 3 ? wall[2] : wall[1]);
    pc.hline(x0 - 2, top - 1, x1 - x0 + 4, C.red2);
    pc.hline(x0 - 2, top - 2, x1 - x0 + 4, C.red3);
    pc.hline(x0, base - 18, x1 - x0, wall[2]);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) win(pc, g, x0 + 4 + k * 10, top + 5 + r * 16, 6, 6, seed + k + r * 9, 0.9);
    // the bell tower and its clock
    for (let y = top - 22; y < top - 2; y++) for (let x = 44; x < 56; x++) pc.set(x, y, x === 44 ? wall[0] : x > 53 ? wall[2] : wall[1]);
    for (let j = 0; j < 7; j++) pc.hline(43 + j, top - 23 - j, 14 - j * 2, j < 3 ? C.red3 : C.red2);
    pc.rect(47, top - 18, 6, 6, C.white);
    pc.box(47, top - 18, 6, 6, C.ink5);
    pc.set(50, top - 16, C.ink2);
    pc.set(50, top - 15, C.ink2);
    pc.set(51 - (f % 2), top - 15, C.ink2);
    g.rect(48, top - 17, 4, 4, C.yel1);
    const t = 'AURORA SCHOOL';
    pc.rect(x0 + 18, base - 16, measureText(t) + 4, 7, C.blu2);
    drawText(pc, t, x0 + 20, base - 15, C.white);
    pc.rect(48, base - 9, 6, 9, C.snd2);
    // the playground: swings, a slide, children running
    const sx = 110;
    pc.line(sx, base - 1, sx + 6, base - 20, C.red2);
    pc.line(sx + 28, base - 1, sx + 22, base - 20, C.red2);
    pc.hline(sx + 5, base - 20, 19, C.red3);
    for (let k = 0; k < 2; k++) {
      const hx = sx + 10 + k * 9;
      const sw = Math.round(Math.sin(((f + k * 2) / 4) * Math.PI * 2) * 4);
      pc.line(hx, base - 19, hx + sw, base - 7, C.ink6);
      pc.hline(hx + sw - 1, base - 6, 3, C.snd3);
      kid(pc, hx + sw - 1, base - 6, seed + k, 0);
    }
    // the slide
    pc.vline(146, base - 16, 16, C.ink6);
    pc.hline(144, base - 16, 5, C.yel0);
    pc.line(149, base - 16, 162, base - 2, C.yel0);
    pc.line(149, base - 15, 162, base - 1, C.org1);
    for (let y = base - 14; y < base; y += 3) pc.hline(142, y, 4, C.ink6);
    const n = 2 + lived * 2;
    for (let i = 0; i < n; i++) {
      const kx = 100 + ((i * 23 + f * (i % 2 ? 4 : -3) + 200) % 70);
      kid(pc, kx, base, seed + i + 9, (f + i) % 3);
    }
    person(pc, 102, base, seed + 30, f % 2);
    lushTree(pc, 168, base, 7, seed + 3, 1);
    lawn(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 3 };
}

/** The park: a pond with ducks, big trees, benches, a bandstand with festoon lights. */
export function habPark(lived: number, seed: number, plan: string): FacilityArt {
  const W = 166;
  const H = 70;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    lushTree(pc, 12, base, 10, seed, 2);
    lushTree(pc, 150, base, 11, seed + 1, 1);
    // the pond
    for (let y = base - 4; y < base; y++) for (let x = 30; x < 92; x++) {
      const d = Math.abs((x - 61) / 31) + Math.abs((y - (base - 2)) / 3) * 0.4;
      if (d > 1) continue;
      pc.set(x, y, y === base - 4 ? C.sea7 : (x + y * 5 + f * 2) % 9 === 0 ? C.white : ditherAt(x, y, 0.5) ? C.sea6 : C.sea5);
    }
    for (let k = 0; k < 2; k++) {
      const dx = 44 + k * 22 + ((f + k) % 4) * 2;
      pc.set(dx, base - 5, C.white);
      pc.set(dx + 1, base - 5, C.white);
      pc.set(dx + 1, base - 6, C.grn3);
      pc.set(dx + 2, base - 6, C.org1);
    }
    // the bandstand
    const bx = 100;
    pc.rect(bx, base - 3, 30, 3, C.white);
    for (const px of [bx + 2, bx + 14, bx + 27]) pc.vline(px, base - 20, 17, C.white);
    for (let j = 0; j < 8; j++) pc.hline(bx - 2 + j * 2, base - 21 - j, 34 - j * 4, j % 2 ? C.grn4 : C.grn5);
    festoon(pc, g, bx - 2, base - 21, bx + 32, base - 21, 3, seed);
    if (plan === 'private') plate(pc, null, 'CLUB', bx + 7, base - 14, C.yel0, C.ink2);
    else {
      person(pc, bx + 8, base - 3, seed + 3, f % 2);
      person(pc, bx + 18, base - 3, seed + 4, (f + 1) % 2);
    }
    // benches with people
    for (const [x, sit] of [[24, true], [96, lived >= 1]] as [number, boolean][]) {
      pc.hline(x, base - 4, 7, C.snd3);
      pc.hline(x, base - 6, 7, C.snd4);
      pc.set(x, base - 3, C.ink3);
      pc.set(x + 6, base - 3, C.ink3);
      if (sit) seated(pc, x + 1, base - 4, seed + x);
    }
    const n = 1 + lived;
    for (let i = 0; i < n; i++) person(pc, 34 + ((i * 37 + f * 2) % 60), base, seed + 50 + i, 0);
    lawn(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 2 };
}

/** Farmland: crop rows, an orchard, a barn and a greenhouse (stations: a hydroponics hall instead). */
export function habFarm(lived: number, seed: number, plan: string): FacilityArt {
  const W = 184;
  const H = 62;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // crop rows: wheat, greens, more wheat
    for (let x = 0; x < 70; x++) {
      const wheat = x < 30;
      for (let y = base - (wheat ? 7 : 4); y < base; y++) {
        const c = wheat ? ((x + f) % 3 === 0 && y === base - 7 ? C.snd7 : y < base - 4 ? C.snd6 : C.snd5) : x % 4 < 2 ? C.grn6 : C.snd3;
        pc.set(x, y, c);
      }
    }
    // the orchard
    for (let k = 0; k < 3; k++) {
      lushTree(pc, 78 + k * 12, base, 5, seed + k, 0);
      for (let i = 0; i < 4; i++) pc.set(76 + k * 12 + Math.floor(hash2(i, k, seed) * 6), base - 9 - Math.floor(hash2(i, k, seed + 1) * 6), C.red3);
    }
    if (plan === 'stations') {
      // a hydroponics hall: stacked racks under pink grow lights
      const hx = 118;
      for (let y = base - 30; y < base; y++) for (let x = hx; x < W - 4; x++) pc.set(x, y, y === base - 30 ? C.ink9 : x === hx ? C.ink8 : C.ink7);
      for (let r = 0; r < 3; r++) for (let x = hx + 3; x < W - 7; x++) {
        const y = base - 25 + r * 8;
        pc.set(x, y, C.ink3);
        pc.set(x, y + 1, (x + r) % 3 ? C.grn6 : C.grn4);
        pc.set(x, y - 1, (x + r) % 2 ? C.pnk0 : C.vio3);
        if ((x + r) % 2) g.set(x, y - 1, C.pnk1);
      }
      plate(pc, g, 'HYDRO', hx + 4, base - 38, C.pnk1);
    } else {
      // a red barn and a glasshouse
      const bx = 116;
      for (let y = base - 18; y < base; y++) for (let x = bx; x < bx + 26; x++) pc.set(x, y, x === bx ? C.red3 : (x - bx) % 4 === 0 ? C.red1 : C.red2);
      for (let j = 0; j < 8; j++) pc.hline(bx - 1 + j * 2 - (j ? 0 : 0), base - 19 - j, 28 - j * 4, j < 4 ? C.ink6 : C.ink5);
      pc.rect(bx + 9, base - 10, 8, 10, C.snd2);
      pc.line(bx + 9, base - 10, bx + 16, base - 1, C.white);
      pc.line(bx + 16, base - 10, bx + 9, base - 1, C.white);
      g.rect(bx + 11, base - 15, 4, 2, C.yel1);
      pc.rect(bx + 11, base - 15, 4, 2, C.blu1);
      const gx = 148;
      for (let y = base - 14; y < base; y++) for (let x = gx; x < gx + 30; x++) {
        const roof = y < base - 10;
        if (roof && Math.abs(x - gx - 15) > (y - (base - 14)) * 4 + 3) continue;
        pc.set(x, y, (x - gx) % 5 === 0 || y === base - 14 ? C.ink9 : roof ? C.sky5 : (x + y) % 3 ? C.grn5 : C.grn6);
      }
    }
    person(pc, 34 + f, base, seed + 8, f);
    if (lived >= 2) person(pc, 100, base, seed + 9, 0);
    lawn(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [110, H] }, fps: 1 };
}

/** The town square: the town hall with its clock and flag, a café, a fountain, people. */
export function habSquare(lived: number, seed: number, plan: string): FacilityArt {
  const W = 176;
  const H = 98;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // paving
    for (let x = 0; x < W; x++) for (let y = base - 2; y < base; y++) pc.set(x, y, (x + y) % 4 === 0 ? C.snd6 : C.snd7);
    // the town hall: columns, a pediment, a clock tower, the flag of Aurora
    const hx = 6;
    const hw = 72;
    const top = base - 40;
    for (let y = top; y < base - 2; y++) for (let x = hx; x < hx + hw; x++) pc.set(x, y, x === hx ? C.white : x > hx + hw - 3 ? C.ice1 : C.ice2);
    for (let k = 0; k < 6; k++) {
      const cx = hx + 6 + k * 12;
      pc.vline(cx, top + 10, base - 2 - top - 10, C.white);
      pc.vline(cx + 1, top + 10, base - 2 - top - 10, C.ice1);
    }
    for (let k = 0; k < 5; k++) win(pc, g, hx + 9 + k * 12, top + 14, 5, 8, seed + k, 0.9);
    for (let j = 0; j < 8; j++) pc.hline(hx - 2 + j * 4, top - 1 - j, hw + 4 - j * 8, j === 0 ? C.ink8 : C.ice1);
    for (let y = top - 30; y < top - 6; y++) for (let x = hx + 28; x < hx + 44; x++) pc.set(x, y, x === hx + 28 ? C.white : x > hx + 41 ? C.ice1 : C.ice2);
    for (let j = 0; j < 6; j++) pc.hline(hx + 27 + j, top - 31 - j, 18 - j * 2, C.cyn3);
    // the clock (its hands move)
    const ccx = hx + 36;
    const ccy = top - 20;
    for (let y = ccy - 4; y <= ccy + 4; y++) for (let x = ccx - 4; x <= ccx + 4; x++) if (Math.hypot(x - ccx, y - ccy) <= 4.3) pc.set(x, y, Math.hypot(x - ccx, y - ccy) > 3.4 ? C.yel0 : C.white);
    g.rect(ccx - 2, ccy - 2, 5, 5, C.yel1);
    pc.vline(ccx, ccy - 3, 3, C.ink2);
    const a = (f / 4) * Math.PI * 2;
    pc.set(Math.round(ccx + Math.cos(a) * 2), Math.round(ccy + Math.sin(a) * 2), C.ink2);
    // the flag: Aurora's green and gold
    pc.vline(ccx, top - 50, 15, C.ink7);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 9; i++) pc.set(ccx + 1 + i, top - 50 + j + Math.round(Math.sin((i + f * 2) / 2.2) * 0.8), j < 2 ? C.grn5 : j === 2 ? C.yel0 : C.grn4);
    const t = 'AURORA';
    pc.rect(hx + 36 - Math.ceil((measureText(t) + 4) / 2), top + 3, measureText(t) + 4, 7, C.ink2);
    drawText(pc, t, hx + 38 - Math.ceil((measureText(t) + 4) / 2), top + 4, C.yel1);
    drawText(g, t, hx + 38 - Math.ceil((measureText(t) + 4) / 2), top + 4, C.yel0);
    pc.rect(hx + 32, base - 12, 8, 10, C.snd2);
    // the fountain
    const fx = 96;
    pc.rect(fx - 9, base - 5, 19, 3, C.ink8);
    pc.hline(fx - 9, base - 5, 19, C.white);
    pc.rect(fx - 7, base - 4, 15, 1, C.sea6);
    pc.vline(fx, base - 12, 7, C.ink7);
    for (let k = 0; k < 6; k++) {
      const t2 = (k + f * 1.5) / 6;
      for (const s of [-1, 1]) {
        const x = Math.round(fx + s * t2 * 7);
        const y = Math.round(base - 14 + t2 * t2 * 10 - t2 * 4);
        pc.set(x, y, k % 2 ? C.sea8 : C.white);
      }
    }
    // the café: awning, tables, umbrellas
    const cx0 = 116;
    for (let y = base - 26; y < base - 2; y++) for (let x = cx0; x < cx0 + 34; x++) pc.set(x, y, x === cx0 ? C.snd8 : C.snd7);
    for (let x = cx0 - 2; x < cx0 + 36; x++) for (let y = base - 28; y < base - 23; y++) pc.set(x, y, Math.floor((x - cx0) / 4) % 2 ? C.white : plan === 'private' ? C.ink2 : C.red3);
    win(pc, g, cx0 + 4, base - 20, 10, 8, seed + 3, 1);
    win(pc, g, cx0 + 20, base - 20, 10, 8, seed + 4, 1);
    for (const ux of [cx0 + 40, cx0 + 54]) {
      pc.vline(ux, base - 12, 10, C.ink6);
      for (let k = -5; k <= 5; k++) pc.set(ux + k, base - 13 + Math.round(Math.abs(k) * 0.3), Math.abs(k) < 3 ? C.yel0 : C.org1);
      pc.hline(ux - 3, base - 5, 7, C.ink6);
      seated(pc, ux - 4, base - 5, seed + ux);
    }
    festoon(pc, g, cx0 + 36, base - 18, W - 2, base - 16, 2, seed + 1);
    const n = 2 + lived * 2;
    for (let i = 0; i < n; i++) person(pc, 84 + ((i * 29 + f * (i % 2 ? 2 : -2) + 400) % 80), base - 2, seed + i * 3, i % 2);
    lawn(pc, W, H);
    for (let x = 0; x < W; x++) pc.set(x, base - 1, (x + 1) % 4 === 0 ? C.snd5 : C.snd6);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [150, H] }, fps: 2 };
}

/** Station dorms: stacked modular blocks, outside stairs, laundry, a canteen sign. */
export function habDorms(lived: number, seed: number): FacilityArt {
  const W = 154;
  const H = 92;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const floors = 3 + Math.min(2, lived);
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    for (const [bx, bw, nf] of [[4, 66, floors], [80, 62, floors - 1]] as [number, number, number][]) {
      for (let k = 0; k < nf; k++) {
        const y0 = base - (k + 1) * 15;
        for (let y = y0; y < y0 + 15; y++) for (let x = bx; x < bx + bw; x++) {
          let c = x === bx ? C.ink9 : x > bx + bw - 3 ? C.ink6 : (x - bx) % 11 === 0 ? C.ink7 : C.ink8;
          if (y === y0) c = C.ink6;
          pc.set(x, y, c);
        }
        for (let x = bx; x < bx + bw; x++) pc.set(x, y0 + 2, [C.cyn3, C.org1, C.grn5][k % 3]);
        for (let i = 0; i < 5; i++) win(pc, g, bx + 4 + i * 12, y0 + 6, 5, 5, seed + k * 7 + i + bx, 0.8);
        // walkway and railing
        pc.hline(bx + bw, y0 + 14, 6, C.ink5);
        pc.hline(bx + bw, y0 + 11, 6, C.ink7);
      }
      plate(pc, g, `D-${bx > 50 ? 2 : 1}`, bx + 3, base - floors * 15 - 9 + (bx > 50 ? 15 : 0), C.cyn5);
    }
    // outside stairs between the blocks
    for (let k = 0; k < floors - 1; k++) pc.line(71, base - k * 15, 78, base - (k + 1) * 15 + 3, C.ink6);
    // laundry lines between them
    for (let x = 70; x < 80; x++) pc.set(x, base - 40 + (Math.abs(x - 75) < 3 ? 1 : 0), C.ink5);
    pc.rect(72, base - 39, 2, 3, C.red3);
    pc.rect(76, base - 39 + f, 2, 3, C.yel0);
    // pipes over the roofs
    pipe(pc, 0, base - floors * 15 - 3, 70, null, C.ink7, C.ink5);
    vpipe(pc, 146, base - 40, 40, C.ink7, C.ink5);
    people(pc, [20, 60, 110], base, seed, f);
    if (lived >= 2) people(pc, [130], base, seed + 4, f);
    lawn(pc, W, H);
    for (let x = 0; x < W; x++) pc.set(x, base - 1, C.ink6);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [74, H] }, fps: 1 };
}

/** The works: tanks and pipes, a pump house, a heat exchanger venting, workers in overalls. */
export function habWorks(lived: number, seed: number): FacilityArt {
  const W = 164;
  const H = 86;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    tank(pc, 6, base, 22, 40, STEEL, true, C.cyn3);
    tank(pc, 32, base, 18, 30, STEEL, true, C.org1);
    pipe(pc, 0, base - 34, 80, base, C.ink8, C.ink6, 10);
    pipe(pc, 26, base - 18, 60, base, C.ink7, C.ink5, 12);
    // the pump house
    for (let y = base - 32; y < base; y++) for (let x = 62; x < 110; x++) pc.set(x, y, x === 62 ? C.ink9 : x > 107 ? C.ink6 : (x - 62) % 8 === 0 ? C.ink7 : C.ink8);
    pc.hline(60, base - 33, 52, C.ink6);
    for (let k = 0; k < 4; k++) win(pc, g, 66 + k * 10, base - 26, 6, 5, seed + k, 0.9);
    plate(pc, g, 'WATER WORKS', 64, base - 16, C.cyn5);
    // heat exchanger stacks
    for (let k = 0; k < 3; k++) {
      const x = 118 + k * 14;
      for (let y = base - 46 + k * 4; y < base; y++) {
        pc.set(x, y, C.ink9);
        for (let i = 1; i < 9; i++) pc.set(x + i, y, (y + i) % 4 === 0 ? C.ink6 : i > 6 ? C.ink6 : C.ink8);
      }
      pc.hline(x - 1, base - 47 + k * 4, 11, C.ink5);
    }
    people(pc, [50, 112], base, seed + 2, f);
    if (lived >= 2) people(pc, [150], base, seed + 6, f);
    lawn(pc, W, H);
    for (let x = 0; x < W; x++) pc.set(x, base - 1, C.ink6);
    frames.push(pc);
    glows.push(g);
  }
  const emitters: Emitter[] = [
    { x: 122, y: base - 48, kind: 'vapor', rate: 1.2, size: 2 },
    { x: 150, y: base - 40, kind: 'vapor', rate: 0.9, size: 2 },
  ];
  return { base: frames, glow: glows, points: { dock: [90, H] }, emitters, fps: 1 };
}

/** Glossy towers: glass catching the sun-line, gold trim, gardens on the terraces. */
export function habTower(lived: number, seed: number): FacilityArt {
  const W = 124;
  const H = 108;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const towers: [number, number, number][] = [[8, 30, base - 98], [46, 26, base - 76], [80, 34, base - 88]];
    towers.forEach(([x0, tw, top], ti) => {
      for (let y = top; y < base; y++) for (let x = x0; x < x0 + tw; x++) {
        const band = (x - x0 + (y - top) * 0.6 + ti * 7 + f * 2) % 18;
        let c = band < 3 ? C.sky5 : band < 6 ? C.sky4 : band < 12 ? C.blu4 : C.blu3;
        if (x === x0) c = C.white;
        if (x > x0 + tw - 3) c = band < 6 ? C.blu4 : C.blu2;
        if ((y - top) % 6 === 0) c = C.ink7;
        if ((y - top) % 24 === 0) c = C.yel0;
        pc.set(x, y, c);
        if ((y - top) % 6 === 3 && (x - x0) % 4 === 1 && hash2(x, y, seed) > 0.45) g.set(x, y, hash2(x, y, 3) > 0.4 ? C.yel1 : C.white);
      }
      // a crown and a terrace garden
      pc.hline(x0 - 1, top - 1, tw + 2, C.yel0);
      pc.hline(x0 + 2, top - 3, tw - 4, C.yel1);
      for (let k = 0; k < tw; k += 5) lushTree(pc, x0 + 2 + k, top - 3, 2, seed + k + ti, 1);
      g.hline(x0 - 1, top - 1, tw + 2, C.yel0);
    });
    // the plaza and its reflecting pool
    for (let x = 0; x < W; x++) for (let y = base - 2; y < base; y++) pc.set(x, y, (x + y) % 6 === 0 ? C.ink8 : C.ink9);
    pc.rect(38, base - 3, 40, 2, C.sea7);
    pc.hline(40, base - 3, 36, C.sky5);
    people(pc, [30, 82, 114], base - 2, seed, f);
    if (lived >= 2) people(pc, [36, 70], base - 2, seed + 9, f);
    lawn(pc, W, H);
    for (let x = 0; x < W; x++) pc.set(x, base - 1, C.ink8);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

/** Villas: white modernist boxes, pools, tall slim trees, loungers. */
export function habVilla(lived: number, seed: number): FacilityArt {
  const W = 168;
  const H = 62;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    for (const [vx, vw, k] of [[8, 46, 0], [96, 52, 1]] as [number, number, number][]) {
      for (let y = base - 26; y < base; y++) for (let x = vx; x < vx + vw; x++) {
        const upper = y < base - 14;
        if (upper && x > vx + vw * 0.65) continue;
        pc.set(x, y, x === vx ? C.white : y === base - 26 || y === base - 14 ? C.ink8 : C.white);
      }
      pc.rect(vx + 4, base - 11, vw - 10, 8, C.blu2);
      pc.hline(vx + 4, base - 11, vw - 10, C.sky4);
      g.rect(vx + 5, base - 10, vw - 12, 6, hash2(vx, seed, 1) > 0.3 ? C.yel1 : C.org2);
      pc.rect(vx + 6, base - 22, 14, 5, C.blu2);
      g.rect(vx + 6, base - 22, 14, 5, C.yel1);
      pc.vline(vx + vw - 2, base - 13, 13, C.snd4);
      // the pool beside it
      const px = vx + vw + 2;
      pc.rect(px, base - 3, 24, 3, C.sea7);
      pc.hline(px, base - 3, 24, (f + k) % 2 ? C.foam : C.sky5);
      pc.set(px + 8 + f * 2, base - 2, C.white);
      // a lounger
      pc.hline(px + 4, base - 6, 7, C.white);
      pc.set(px + 4, base - 7, C.white);
      // slim trees
      for (const tx of [vx - 4, px + 28]) {
        for (let y = base - 22; y < base - 2; y++) for (let x = tx - 2; x <= tx + 2; x++) if (Math.abs(x - tx) <= 2 - Math.abs(y - (base - 12)) / 6) pc.set(x, y, x < tx ? C.grn5 : C.grn3);
        pc.vline(tx, base - 3, 3, C.snd2);
      }
    }
    seated(pc, 80, base - 5, seed + 1);
    if (lived >= 1) {
      // someone swimming
      pc.set(64 + f * 3, base - 3, C.skn4);
      pc.set(65 + f * 3, base - 3, C.white);
    }
    person(pc, 120, base, seed + 3, f);
    lawn(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

/** A new district going up: a crane in the builder's colours, a frame in scaffolding, cabins. */
export function habBuild(seed: number, r: Ramp4 = rampOf('org1')): FacilityArt {
  const W = 146;
  const H = 98;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    for (let y = base - 34; y < base; y++) for (let x = 30; x < 92; x++) if ((x - 30) % 10 === 0 || (base - y) % 11 === 0) pc.set(x, y, (x - 30) % 10 === 0 ? CONCRETE.lit : CONCRETE.mid);
    for (let y = base - 11; y < base; y++) for (let x = 30; x < 92; x++) pc.set(x, y, (x - 30) % 10 === 0 ? CONCRETE.hi : CONCRETE.mid);
    scaffold(pc, 28, base - 40, 66, 30, r.mid);
    crane(pc, g, 108, base - 88, base, 46, 12, 30 + f * 4, r, f === 0);
    siteCabins(pc, g, 4, base, 1, r);
    people(pc, [40, 66, 100], base, seed, f);
    lawn(pc, W, H);
    for (let x = 22; x < 100; x++) pc.set(x, base - 1, C.snd4);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

void bayer;
void CONCRETE;
