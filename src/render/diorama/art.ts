/**
 * Procedural side-view pixel art for campus dioramas: facilities, backdrops, people, vehicles.
 * Everything is drawn into indexed PixelCanvases, so the era palette re-grades it all.
 *
 * Facilities come in tiers (Act II): tier 2/3 art is wider, denser or taller. Act II plants live in
 * plants.ts, supplier/mine/landing set pieces and rival campuses in industry.ts.
 */
import type { Backdrop } from '../../content/sites';
import type { FacilityType } from '../../sim/types';
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import { crawlerCrane, facadeShade, revealFrom, scaffold, towerCrane, transformerYard, windowGrid } from './draw';
import { campus, fab, geothermal, hydro, packaging, reactor, restart, smr } from './plants';
import { clampTier, facilitySize, type ArtType } from './sizes';
import type { LaunchSpec } from './launch';

export { facilitySize, maxTier, type ArtType } from './sizes';

export { facadeShade } from './draw';

/** A particle source on a sprite (smoke from a stack, steam from a cooling tower…). */
export interface Emitter {
  x: number;
  y: number;
  /** 'exhaust' is a rocket's plume: big, slow, long-lived puffs. */
  kind: 'smoke' | 'steam' | 'vapor' | 'mist' | 'exhaust';
  /** Particles per second. */
  rate: number;
  /** Horizontal spread of spawn positions (px). */
  spread?: number;
  /** Largest puff radius (cooling towers make big ones). */
  size?: number;
}

/** A small sprite that travels along a path inside the facility (haul trucks, carts). */
export interface Mover {
  frames: PixelCanvas[];
  /** Polyline in sprite coordinates (top-left of the mover is placed on it, feet on the line). */
  path: [number, number][];
  /** px per second. */
  speed: number;
  /** 0..1 start offset along the loop. */
  phase: number;
  /** Ping-pong along the path instead of looping. */
  pingpong?: boolean;
}

/** A wind turbine hub with a spinning rotor. */
export interface RotorSpec {
  x: number;
  y: number;
  size: number;
  col: number;
  /** 'big': tapered blades in finer steps that turn slower (the giant turbines of Act III). */
  style?: 'big';
}

export interface FacilityArt {
  base: PixelCanvas[]; // animation frames (≥1)
  glow: PixelCanvas[]; // emissive pixels (night lights), same frame count
  /** Anchor offsets for effects (e.g. a loading dock), relative to sprite top-left. */
  points: Record<string, [number, number]>;
  emitters?: Emitter[];
  movers?: Mover[];
  rotors?: RotorSpec[];
  /** Animation speed in frames per second (0 = static). */
  fps?: number;
  /** Frames advance in step with every other synced sprite (aviation lights blink together). */
  sync?: boolean;
  /** A rocket standing on this pad (Act III launch complex); the scene animates the launch. */
  launch?: LaunchSpec;
}

// ── data center ────────────────────────────────────────────────────────────────────────────
export function datacenter(label: string, tier = 1, opts: { sign?: string; accent?: number; lights?: number } = {}): FacilityArt {
  const [W, H] = facilitySize('datacenter', tier);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const floors = tier >= 3 ? 3 : 1;
  const accent = opts.accent ?? C.cyn4;
  const accentHi = opts.accent ? opts.accent : C.cyn5;
  const top = 13;
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // body
    pc.rect(0, top, W, H - top, C.ink4);
    pc.hline(0, top, W, C.ink6);
    pc.hline(0, top + 1, W, C.ink5);
    pc.rect(0, H - 3, W, 3, C.ink2);
    pc.vline(0, top, H - top, C.ink6);
    if (floors === 1) {
      // louvers
      for (let y = top + 6; y < H - 6; y += 4) {
        pc.hline(2, y, W - 4, C.ink3);
        pc.hline(2, y - 1, W - 4, C.ink5);
      }
      for (let x = 14; x < W - 4; x += 16) pc.rect(x, top + 2, 2, H - top - 5, C.ink3);
    } else {
      // stacked data floors with LED-lit slab edges
      const fh = Math.floor((H - top - 3) / floors);
      for (let k = 0; k < floors; k++) {
        const fy = top + k * fh;
        if (k > 0) {
          pc.hline(0, fy, W, C.ink6);
          pc.hline(0, fy + 1, W, C.ink2);
          // LED strip along the slab, a light sweep runs along it
          for (let x = 2; x < W - 2; x++) {
            const on = ((x >> 3) + f + k) % 4 !== 0;
            if (x % 2 === 0) {
              pc.set(x, fy + 1, on ? accent : C.ink3);
              if (on) g.set(x, fy + 1, accentHi);
            }
          }
        }
        for (let y = fy + 6; y < fy + fh - 2; y += 4) {
          pc.hline(2, y, W - 4, C.ink3);
          pc.hline(2, y - 1, W - 4, C.ink5);
        }
      }
      for (let x = 14; x < W - 4; x += 16) pc.rect(x, top + 2, 2, H - top - 5, C.ink3);
      // stair/lift core with a column of lit landings
      const sx = W - 46;
      pc.rect(sx, top - 4, 10, H - top + 1, C.ink5);
      pc.hline(sx, top - 4, 10, C.ink7);
      for (let y = top; y < H - 6; y += 6) {
        pc.rect(sx + 3, y, 4, 3, C.ink1);
        g.rect(sx + 3, y, 4, 3, y % 12 ? C.yel1 : C.yel0);
      }
      // liquid-cooling loop pipes down the side
      pc.vline(W - 4, top + 2, H - top - 5, C.cyn2);
      pc.vline(W - 3, top + 2, H - top - 5, C.cyn1);
      pc.vline(W - 7, top + 2, H - top - 5, C.blu3);
    }
    facadeShade(pc, 0, top, W, H - top, C.ink4, C.ink3);
    // loading dock(s)
    const docks = tier === 2 ? [W - 26, 70] : [W - 26];
    for (const dx of docks) {
      if (floors > 1 && dx === W - 26) {
        pc.rect(dx - 22, H - 16, 15, 13, C.ink2);
        for (let y = H - 15; y < H - 3; y += 2) pc.hline(dx - 21, y, 13, C.ink3);
        pc.rect(dx - 24, H - 18, 19, 2, C.ink6);
        continue;
      }
      pc.rect(dx, H - 16, 15, 13, C.ink2);
      for (let y = H - 15; y < H - 3; y += 2) pc.hline(dx + 1, y, 13, C.ink3);
      pc.rect(dx - 2, H - 18, 19, 2, C.ink6);
      g.set(dx + 7, H - 19, C.yel1);
    }
    // logo plate
    const txt = (opts.sign ?? label.slice(0, 3)).toUpperCase();
    const tw = measureText(txt);
    const ly = floors > 1 ? top + 4 : top + 5;
    if (txt) {
      pc.rect(6, ly, tw + 6, 9, C.ink1);
      drawText(pc, txt, 9, ly + 2, accentHi);
      drawText(g, txt, 9, ly + 2, accentHi);
    }
    // LED status strip
    const leds = Math.min(10 + (tier - 1) * 8, Math.floor((W - 40) / 3));
    for (let i = 0; i < leds; i++) {
      const on = (i + f) % 4 !== 0;
      const c = i === 7 && f % 2 ? C.org1 : accent;
      pc.set(tw + 18 + i * 3, top + 4, on ? c : C.ink2);
      if (on) g.set(tw + 18 + i * 3, top + 4, c);
    }
    // a band of small lit windows (offices / NOC)
    const nocY = floors > 1 ? H - 13 : top + 8;
    const nocX0 = floors > 1 ? 6 : 32;
    const nocX1 = floors > 1 ? 62 : 60 + (tier - 1) * 30;
    for (let x = nocX0; x < nocX1; x += 4) {
      pc.rect(x, nocY, 2, 2, C.ink1);
      if (hash2(x, 3, 5) > 0.35) g.rect(x, nocY, 2, 2, C.yel1);
    }
    if (floors > 1) {
      // window band on every data floor (operators walk the halls at night too)
      const fh = Math.floor((H - top - 3) / floors);
      for (let k = 0; k < floors - 1; k++) {
        const wy = top + k * fh + 4;
        for (let x = 24; x < W - 52; x += 4) {
          if (hash2(x, k, 12) < 0.55) continue;
          pc.rect(x, wy, 2, 1, C.ink1);
          g.rect(x, wy, 2, 1, hash2(x, k, 13) > 0.5 ? C.cyn5 : C.yel1);
        }
      }
    }
    // rooftop chillers with spinning fans
    const units = Math.floor((W - 6) / 22);
    for (let i = 0; i < units; i++) {
      const x = 4 + i * 22;
      if (floors > 1 && x + 16 > W - 46 && x < W - 36) continue;
      pc.rect(x, 4, 16, top - 4, C.ink6);
      pc.rect(x, 4, 16, 1, C.ink8);
      pc.vline(x + 15, 4, top - 4, C.ink5);
      for (let y = 7; y < top - 1; y += 2) pc.hline(x + 2, y, 12, C.ink5);
      for (const fx of [x + 3, x + 9]) {
        pc.rect(fx, 2, 5, 2, C.ink3);
        const ph = (f + i + (fx > x + 5 ? 1 : 0)) % 2;
        pc.set(fx + 1 + ph, 2, C.ink7);
        pc.set(fx + 3 - ph, 3, C.ink7);
      }
    }
    // roof beacons on the tall block
    if (floors > 1) {
      pc.set(1, top - 1, f % 2 ? C.red3 : C.red1);
      pc.set(W - 2, top - 1, f % 2 ? C.red1 : C.red3);
      if (f % 2) g.set(1, top - 1, C.red3);
      else g.set(W - 2, top - 1, C.red3);
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { roof: [W / 2, 2], dock: [floors > 1 ? W - 44 : W - 26, H] }, fps: 3 };
}

// ── solar farm ─────────────────────────────────────────────────────────────────────────────
const SOLAR_ROWS: { y: number; h: number; n: number; x0: number; back: boolean }[][] = [
  [
    { y: 3, h: 4, n: 13, x0: 6, back: true },
    { y: 10, h: 5, n: 11, x0: 2, back: false },
    { y: 18, h: 6, n: 10, x0: 0, back: false },
  ],
  [
    { y: 2, h: 3, n: 19, x0: 9, back: true },
    { y: 7, h: 4, n: 16, x0: 6, back: true },
    { y: 13, h: 5, n: 14, x0: 3, back: false },
    { y: 21, h: 6, n: 13, x0: 0, back: false },
  ],
  [
    { y: 2, h: 3, n: 25, x0: 12, back: true },
    { y: 7, h: 3, n: 23, x0: 9, back: true },
    { y: 12, h: 4, n: 20, x0: 6, back: true },
    { y: 18, h: 5, n: 18, x0: 3, back: false },
    { y: 26, h: 6, n: 16, x0: 0, back: false },
  ],
];

function solar(tier: number): FacilityArt {
  const [W, H] = facilitySize('solar', tier);
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const rows = SOLAR_ROWS[tier - 1];
  for (const r of rows) {
    const pw = Math.floor((W - r.x0 - 2) / r.n) - 1;
    for (let i = 0; i < r.n; i++) {
      const x = r.x0 + i * (pw + 1);
      pc.vline(x + 2, r.y + r.h, 2 + (r.back ? 0 : 1), C.ink6);
      pc.vline(x + pw - 3, r.y + r.h - 1, 3 + (r.back ? 0 : 1), C.ink5);
      for (let j = 0; j < r.h; j++) {
        const shift = Math.round((r.h - 1 - j) * 0.6);
        for (let k = 0; k < pw; k++) {
          const px = x + k + shift;
          let c = r.back ? C.blu3 : C.blu2;
          if (j === 0) c = C.sky4;
          else if (k % 4 === 0 || j === Math.floor(r.h / 2)) c = r.back ? C.blu4 : C.blu3;
          if (j === r.h - 1) c = C.ink2;
          pc.set(px, r.y + j, c);
        }
      }
    }
  }
  // inverter skids between the rows on bigger farms (with a status LED)
  if (tier >= 2) {
    for (let x = 30; x < W - 20; x += tier === 3 ? 44 : 52) {
      const y = rows[rows.length - 2].y + rows[rows.length - 2].h + 1;
      pc.rect(x, y, 6, 4, C.ink8);
      pc.hline(x, y, 6, C.white);
      pc.vline(x + 5, y, 4, C.ink6);
      pc.set(x + 1, y + 2, C.grn6);
      g.set(x + 1, y + 2, C.grn6);
    }
  }
  return { base: [pc], glow: [g], points: {} };
}

// ── wind farm ──────────────────────────────────────────────────────────────────────────────
interface Turbine {
  x: number;
  top: number;
  size: number;
}

const TURBINE_TIERS: Turbine[][] = [
  [
    { x: 28, top: 14, size: 22 },
    { x: 70, top: 34, size: 15 },
    { x: 92, top: 44, size: 11 },
  ],
  [
    { x: 28, top: 16, size: 22 },
    { x: 74, top: 24, size: 19 },
    { x: 112, top: 40, size: 14 },
    { x: 136, top: 50, size: 10 },
    { x: 54, top: 58, size: 8 },
  ],
  [
    { x: 26, top: 18, size: 22 },
    { x: 72, top: 26, size: 20 },
    { x: 116, top: 30, size: 18 },
    { x: 156, top: 46, size: 14 },
    { x: 182, top: 56, size: 10 },
    { x: 50, top: 62, size: 8 },
    { x: 96, top: 66, size: 7 },
  ],
];

const turbineCols = (size: number) => (size >= 20 ? { col: C.white, sh: C.ink8 } : size >= 14 ? { col: C.ink9, sh: C.ink7 } : { col: C.ink8, sh: C.ink7 });

function wind(tier: number): FacilityArt {
  const [W, H] = facilitySize('wind', tier);
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const list = TURBINE_TIERS[tier - 1];
  // furthest (smallest) first
  for (const t of [...list].sort((a, b) => a.size - b.size)) {
    const { col, sh } = turbineCols(t.size);
    for (let y = t.top + 2; y < H; y++) {
      const half = Math.min(1 + Math.floor(t.size / 12), 1 + Math.floor(((y - t.top) / (H - t.top)) * 1.6));
      for (let x = -half; x <= half; x++) pc.set(t.x + x, y, x > 0 ? sh : col);
    }
    const nw = t.size >= 14 ? 6 : 4;
    pc.rect(t.x - 2, t.top - 1, nw, t.size >= 14 ? 3 : 2, col);
    pc.hline(t.x - 2, t.top + 1, nw, sh);
    pc.set(t.x + 1, t.top - 2, C.red3);
    g.set(t.x + 1, t.top - 2, C.red3);
  }
  return {
    base: [pc],
    glow: [g],
    points: {},
    rotors: list.map((t) => ({ x: t.x, y: t.top, size: t.size, col: turbineCols(t.size).col })),
  };
}

/** Rotor frames for a turbine of a given blade length (8 frames over 120°). */
export function rotorFrames(size: number, col: number): PixelCanvas[] {
  const frames: PixelCanvas[] = [];
  const S = size * 2 + 3;
  for (let f = 0; f < 8; f++) {
    const pc = new PixelCanvas(S, S);
    const c = size + 1;
    for (let b = 0; b < 3; b++) {
      const a = ((f / 8) * 120 + b * 120 - 90) * (Math.PI / 180);
      const x1 = c + Math.cos(a) * size;
      const y1 = c + Math.sin(a) * size;
      pc.line(c, c, x1, y1, col);
      pc.line(c + Math.cos(a + 0.12) * 2, c + Math.sin(a + 0.12) * 2, c + Math.cos(a) * size * 0.55, c + Math.sin(a) * size * 0.55, col);
    }
    pc.rect(c - 1, c - 1, 3, 3, C.ink7);
    frames.push(pc);
  }
  return frames;
}

/**
 * Rotor frames for a giant turbine: tapered blades (thick at the root, a lit leading edge) in
 * 16 steps over 120°, so long blades turn smoothly — and, at the same frame rate, half as fast.
 */
const bigRotors = new Map<string, PixelCanvas[]>();

export function bigRotorFrames(size: number, col: number): PixelCanvas[] {
  const key = `${size}|${col}`;
  const hit = bigRotors.get(key);
  if (hit) return hit;
  const frames: PixelCanvas[] = [];
  bigRotors.set(key, frames);
  const S = size * 2 + 3;
  const c = size + 1;
  const shade = col === C.white ? C.ink8 : C.ink7;
  for (let f = 0; f < 16; f++) {
    const pc = new PixelCanvas(S, S);
    for (let b = 0; b < 3; b++) {
      const a = ((f / 16) * 120 + b * 120 - 90) * (Math.PI / 180);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // trailing-edge side of the blade (perpendicular, clockwise)
      const px = -dy;
      const py = dx;
      const n = Math.ceil(size * 1.5);
      for (let i = 2; i <= n; i++) {
        const t = i / n;
        const x = c + dx * t * size;
        const y = c + dy * t * size;
        pc.set(Math.round(x), Math.round(y), col);
        // a chord near the root that tapers toward the tip
        if (t < 0.55) pc.set(Math.round(x + px * 0.9), Math.round(y + py * 0.9), t < 0.3 ? col : shade);
        if (t < 0.25 && size >= 20) pc.set(Math.round(x + px * 1.8), Math.round(y + py * 1.8), shade);
      }
    }
    // hub and spinner
    pc.rect(c - 1, c - 1, 3, 3, col);
    pc.set(c + 1, c + 1, shade);
    pc.set(c, c, C.ink7);
    frames.push(pc);
  }
  return frames;
}

/** Tier-1 turbine layout (kept for callers that predate tiers). */
export const TURBINE_LAYOUT = TURBINE_TIERS[0].map((t) => ({ ...t, ...turbineCols(t.size) }));

// ── battery ────────────────────────────────────────────────────────────────────────────────
function battery(tier: number): FacilityArt {
  const [W, H] = facilitySize('battery', tier);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    pc.rect(0, H - 3, W, 3, C.ink5);
    pc.hline(0, H - 3, W, C.ink7);
    const row = (x0: number, n: number, top: number, cw: number, back: boolean, seed: number) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (cw + 2);
        const bottom = back ? H - 3 - 8 : H - 3;
        pc.rect(x, top, cw, bottom - top, back ? C.ink7 : C.ink8);
        pc.hline(x, top, cw, back ? C.ink8 : C.white);
        for (let k = 2; k < cw - 1; k += 3) pc.vline(x + k, top + 2, bottom - top - 3, back ? C.ink6 : C.ink7);
        pc.vline(x + cw - 1, top, bottom - top, C.ink6);
        pc.rect(x + 3, top - 3, 6, 3, C.ink6);
        pc.hline(x + 3, top - 3, 6, C.ink7);
        for (let l = 0; l < 3; l++) {
          const on = l < 2 || (f + i + seed) % 2 === 0;
          const c = l === 2 ? C.yel0 : C.grn6;
          pc.set(x + 3 + l * 2, top + 4, on ? c : C.ink4);
          if (on) g.set(x + 3 + l * 2, top + 4, c);
        }
      }
    };
    if (tier === 1) row(2, 4, 8, 16, false, 0);
    else {
      const n = tier === 2 ? 6 : 8;
      row(8, n, 6, 14, true, 1);
      row(2, n, tier === 2 ? 14 : 16, 16, false, 0);
      if (tier === 3) {
        // step-up transformer at the end of the yard
        transformerYard(pc, W - 14, H - 3, 1, false);
      }
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1.2 };
}

// ── gas plant ──────────────────────────────────────────────────────────────────────────────
function gas(tier: number): FacilityArt {
  const [W, H] = facilitySize('gas', tier);
  if (tier === 1) return gasSimple(W, H);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const units = tier === 3 ? 2 : 1;
  const stacks: [number, number][] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // air-cooled condenser: a fan deck on A-frame legs
    const ax = 2;
    const aw = 32;
    const ay = H - 50;
    for (let x = ax + 1; x < ax + aw; x += 8) {
      pc.line(x, ay + 4, x + 3, H - 4, C.ink5);
      pc.line(x + 6, ay + 4, x + 3, H - 4, C.ink6);
    }
    for (let x = ax; x < ax + aw; x++) for (let y = ay + 4; y < ay + 14; y++) if ((x + y) % 4 === 0) pc.set(x, y, C.ink6);
    pc.rect(ax, ay, aw, 4, C.ink6);
    pc.hline(ax, ay, aw, C.ink8);
    for (let x = ax + 1; x + 5 <= ax + aw; x += 8) {
      pc.rect(x, ay - 2, 6, 2, C.ink3);
      pc.set(x + 1 + ((f + x) % 2) * 3, ay - 2, C.ink7);
    }
    transformerYard(pc, 6, H - 3, 1, false);
    // gas turbine + steam turbine hall
    const hx = 36;
    const hw = tier === 3 ? 46 : 38;
    pc.rect(hx, H - 34, hw, 31, C.rck4);
    pc.rect(hx - 2, H - 37, hw + 4, 3, C.rck5);
    for (let x = hx + 3; x < hx + hw - 4; x += 7) {
      pc.rect(x, H - 28, 4, 8, C.ink2);
      if (hash2(x, 1, 3) > 0.3) g.rect(x, H - 28, 4, 8, C.yel1);
    }
    pc.rect(hx + Math.floor(hw / 2) - 5, H - 14, 10, 11, C.rck2);
    facadeShade(pc, hx, H - 34, hw, 31, C.rck4, C.rck3);
    // steam duct from the hall over to the condenser
    pc.hline(ax + aw, H - 44, hx - ax - aw + 4, C.ink7);
    pc.hline(ax + aw, H - 43, hx - ax - aw + 4, C.ink5);
    pc.vline(hx + 2, H - 44, 7, C.ink7);
    // HRSG boilers with their stacks
    for (let u = 0; u < units; u++) {
      const bx = hx + hw + 2 + u * 36;
      const bh = 52 - u * 4;
      pc.rect(bx, H - 3 - bh, 22, bh, C.ink5);
      pc.rect(bx, H - 3 - bh, 22, 2, C.ink7);
      for (let y = H - bh; y < H - 6; y += 5) pc.hline(bx + 1, y, 20, C.ink4);
      facadeShade(pc, bx, H - 3 - bh, 22, bh, C.ink5, C.ink4, 0.4);
      pc.rect(bx - 4, H - 30, 5, 8, C.ink6);
      pc.hline(bx - 4, H - 30, 5, C.ink8);
      // tall stack
      const sx = bx + 24;
      const top = 2 + u * 6;
      pc.rect(sx, top, 8, H - 3 - top, C.ink8);
      pc.vline(sx + 7, top, H - 3 - top, C.ink6);
      pc.vline(sx, top, H - 3 - top, C.ink9);
      for (let y = top + 1; y < top + 14; y += 5) pc.rect(sx, y, 8, 2, C.red3);
      pc.rect(sx - 1, top - 1, 10, 1, C.ink6);
      pc.hline(sx - 1, top + 20, 10, C.ink5);
      pc.hline(sx - 1, top + 40, 10, C.ink5);
      const on = (f + u) % 2 === 0;
      pc.set(sx + 3, top - 2, on ? C.red3 : C.red1);
      if (on) g.set(sx + 3, top - 2, C.red3);
      pc.set(sx + 4, top + 20, C.red3);
      g.set(sx + 4, top + 20, C.red3);
      if (f === 0) stacks.push([sx + 4, top - 2]);
    }
    pc.rect(0, H - 3, W, 3, C.ink3);
    frames.push(pc);
    glows.push(g);
  }
  return {
    base: frames,
    glow: glows,
    points: { stack: stacks[0] },
    emitters: stacks.map(([x, y]) => ({ x, y, kind: 'smoke' as const, rate: 6, spread: 2 })),
    fps: 1.5,
  };
}

function gasSimple(W: number, H: number): FacilityArt {
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  pc.rect(2, H - 12, 14, 9, C.ink5);
  for (let x = 3; x < 15; x += 2) pc.vline(x, H - 11, 7, C.ink4);
  pc.rect(5, H - 18, 2, 6, C.ink8);
  pc.rect(10, H - 18, 2, 6, C.ink8);
  pc.rect(18, H - 30, 46, 27, C.rck4);
  pc.rect(16, H - 33, 50, 3, C.rck5);
  for (let x = 22; x < 62; x += 8) {
    pc.rect(x, H - 24, 4, 6, C.ink2);
    if (hash2(x, 1, 3) > 0.3) g.rect(x, H - 24, 4, 6, C.yel1);
  }
  pc.rect(40, H - 14, 10, 11, C.rck2);
  facadeShade(pc, 18, H - 30, 46, 27, C.rck4, C.rck3);
  pc.rect(62, H - 44, 18, 41, C.ink5);
  pc.rect(62, H - 44, 18, 2, C.ink7);
  for (let y = H - 40; y < H - 6; y += 5) pc.hline(63, y, 16, C.ink4);
  facadeShade(pc, 62, H - 44, 18, 41, C.ink5, C.ink4, 0.4);
  pc.hline(56, H - 36, 8, C.ink7);
  pc.vline(56, H - 36, 4, C.ink7);
  pc.rect(82, 4, 7, H - 7, C.ink8);
  pc.vline(88, 4, H - 7, C.ink6);
  for (let y = 4; y < 14; y += 4) pc.rect(82, y, 7, 2, C.red3);
  pc.rect(81, 3, 9, 1, C.ink6);
  pc.set(85, 2, C.red3);
  g.set(85, 2, C.red3);
  pc.rect(0, H - 3, W, 3, C.ink3);
  return { base: [pc], glow: [g], points: { stack: [85, 1] }, emitters: [{ x: 85, y: 1, kind: 'smoke', rate: 8 }] };
}

// ── research lab ───────────────────────────────────────────────────────────────────────────
function labBlock(pc: PixelCanvas, g: PixelCanvas, x0: number, W: number, H: number, floors: number, seed: number) {
  const top = H - 4 - floors * 11 - 2;
  pc.rect(x0, top, W, H - top, C.ink6);
  for (let fl = 0; fl < floors; fl++) {
    const y = top + 3 + fl * 11;
    for (let x = x0 + 3; x < x0 + W - 3; x += 6) {
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 5; i++) {
          const refl = (i + j + fl) % 7 === 0 || (i + j + fl) % 7 === 1;
          pc.set(x + i, y + j, refl ? C.sky4 : j < 2 ? C.blu4 : C.blu3);
        }
      }
      if (hash2(x, fl, 9 + seed) > 0.45) g.rect(x, y + 1, 5, 6, hash2(x, fl, 8 + seed) > 0.5 ? C.yel1 : C.yel0);
    }
    pc.hline(x0, y + 9, W, C.ink8);
  }
  facadeShade(pc, x0, top, W, H - top, C.blu3, C.blu2, 0.55);
  pc.rect(x0, top - 1, W, 1, C.ink8);
  for (let x = x0 + 4; x < x0 + W - 4; x += 7) {
    pc.circle(x + 2, top - 3, 2.5, C.grn4);
    pc.set(x + 1, top - 5, C.grn6);
  }
  return top;
}

function lab(tier: number): FacilityArt {
  const [W, H] = facilitySize('lab', tier);
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  if (tier === 1) {
    const top = labBlock(pc, g, 0, W, H, 3, 0);
    pc.rect(W / 2 - 6, H - 11, 12, 11, C.cyn1);
    pc.rect(W / 2 - 9, H - 13, 18, 2, C.ink8);
    g.rect(W / 2 - 5, H - 10, 10, 9, C.cyn4);
    drawText(pc, 'LAB', 4, top + 1, C.vio5);
    drawText(g, 'LAB', 4, top + 1, C.vio5);
    return { base: [pc], glow: [g], points: {} };
  }
  if (tier === 2) {
    const top = labBlock(pc, g, 0, W - 30, H, 4, 1);
    labBlock(pc, g, W - 34, 34, H, 3, 2);
    // glass atrium entrance
    const ax = W - 52;
    pc.rect(ax, H - 16, 22, 16, C.cyn1);
    for (let x = ax; x < ax + 22; x += 4) pc.vline(x, H - 16, 16, C.ink8);
    pc.hline(ax - 2, H - 17, 26, C.ink8);
    g.rect(ax + 1, H - 15, 20, 14, C.cyn4);
    for (let x = ax + 1; x < ax + 22; x += 4) g.vline(x - 1, H - 15, 14, 0);
    drawText(pc, 'LAB', 4, top + 1, C.vio5);
    drawText(g, 'LAB', 4, top + 1, C.vio5);
    // rooftop solar
    for (let x = 6; x < W - 40; x += 9) {
      pc.hline(x, top - 7, 7, C.blu3);
      pc.hline(x + 1, top - 8, 7, C.sky4);
    }
    return { base: [pc], glow: [g], points: {} };
  }
  // tier 3: two towers joined by a skybridge, research campus
  const leftW = 64;
  const top = labBlock(pc, g, 0, leftW, H, 6, 3);
  const rTop = labBlock(pc, g, W - 58, 58, H, 4, 4);
  // middle podium + skybridge
  const px = leftW;
  const pw = W - 58 - leftW;
  pc.rect(px, H - 22, pw, 22, C.ink7);
  pc.hline(px, H - 22, pw, C.ink9);
  windowGrid(pc, g, px + 3, H - 18, Math.floor((pw - 4) / 5), 2, { ww: 3, wh: 3, gx: 2, gy: 3, seed: 7, lit: 0.7 });
  pc.rect(px, rTop + 8, pw, 6, C.ink8);
  pc.hline(px, rTop + 8, pw, C.white);
  for (let x = px + 1; x < px + pw - 1; x += 3) {
    pc.rect(x, rTop + 10, 2, 2, C.blu4);
    g.rect(x, rTop + 10, 2, 2, C.yel1);
  }
  // entrance
  pc.rect(px + pw / 2 - 7, H - 10, 14, 10, C.cyn1);
  g.rect(px + pw / 2 - 6, H - 9, 12, 8, C.cyn4);
  drawText(pc, 'LAB', 4, top + 1, C.vio5);
  drawText(g, 'LAB', 4, top + 1, C.vio5);
  // antenna on the tall tower
  pc.vline(leftW - 10, top - 14, 10, C.ink7);
  pc.set(leftW - 10, top - 15, C.red3);
  g.set(leftW - 10, top - 15, C.red3);
  return { base: [pc], glow: [g], points: {} };
}

// ── garage HQ ──────────────────────────────────────────────────────────────────────────────
function hq(label: string): FacilityArt {
  const [W, H] = facilitySize('hq');
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const wallTop = 16;
    pc.rect(4, wallTop, W - 8, H - wallTop, C.snd6);
    for (let y = wallTop + 2; y < H; y += 3) pc.hline(4, y, W - 8, C.snd5);
    facadeShade(pc, 4, wallTop, W - 8, H - wallTop, C.snd6, C.snd5, 0.55);
    for (let r = 0; r < 14; r++) {
      const x0 = 2 + r * 2;
      pc.hline(Math.max(0, x0 - 2), wallTop - 1 - Math.floor(r / 1.15), Math.max(0, W - 2 * x0 + 4), r === 0 ? C.red1 : r % 3 === 0 ? C.red1 : C.red2);
    }
    pc.hline(0, wallTop - 1, W, C.red1);
    const gx = 8;
    const gy = wallTop + 4;
    pc.rect(gx, gy, 26, H - gy, C.ink2);
    pc.rect(gx, gy, 26, 3, C.ink6);
    for (let x = gx + 1; x < gx + 25; x += 2) pc.set(x, gy + 1, C.ink5);
    pc.rect(gx + 3, H - 7, 12, 2, C.snd3);
    pc.rect(gx + 6, H - 13, 6, 5, C.ink0);
    pc.rect(gx + 7, H - 12, 4, 3, f ? C.cyn5 : C.cyn4);
    g.rect(gx + 7, H - 12, 4, 3, f ? C.cyn5 : C.cyn4);
    pc.rect(gx + 18, H - 15, 6, 15, C.ink1);
    for (let y = H - 13; y < H - 2; y += 3) {
      const c = (y + f) % 2 ? C.grn6 : C.cyn4;
      pc.set(gx + 19, y, c);
      g.set(gx + 19, y, c);
    }
    pc.rect(W - 22, wallTop + 4, 10, 8, C.ink1);
    pc.rect(W - 21, wallTop + 5, 8, 6, C.sky4);
    g.rect(W - 21, wallTop + 5, 8, 6, f ? C.yel1 : C.yel0);
    pc.vline(W - 17, wallTop + 5, 6, C.snd3);
    pc.hline(W - 21, wallTop + 7, 8, C.snd3);
    g.vline(W - 17, wallTop + 5, 6, 0);
    g.hline(W - 21, wallTop + 7, 8, 0);
    const txt = label.slice(0, 3).toUpperCase();
    pc.rect(W - 24, H - 10, measureText(txt) + 4, 7, C.ink1);
    drawText(pc, txt, W - 22, H - 9, C.yel0);
    drawText(g, txt, W - 22, H - 9, C.yel0);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1.2 };
}

// ── substation ─────────────────────────────────────────────────────────────────────────────
function substation(): FacilityArt {
  const [W, H] = facilitySize('substation');
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const px = 32;
  for (let y = 2; y < H - 2; y++) {
    const half = 1 + Math.floor((y / H) * 5);
    pc.set(px - half, y, C.ink6);
    pc.set(px + half, y, C.ink6);
    if (y % 4 === 0) pc.line(px - half, y, px + half, y + 3, C.ink7);
  }
  pc.hline(px - 8, 6, 17, C.ink6);
  pc.hline(px - 6, 12, 13, C.ink6);
  for (const [y0, dy] of [[6, 4], [12, 5]]) {
    for (let x = 0; x < px - 8; x++) pc.set(x, y0 + Math.round(Math.sin((x / (px - 8)) * Math.PI) * dy), C.ink7);
  }
  for (let i = 0; i < 2; i++) {
    const x = 2 + i * 13;
    pc.rect(x, H - 14, 10, 11, C.ink5);
    for (let k = 1; k < 10; k += 2) pc.vline(x + k, H - 13, 9, C.ink4);
    pc.rect(x + 2, H - 19, 2, 5, C.white);
    pc.rect(x + 6, H - 19, 2, 5, C.white);
  }
  pc.rect(0, H - 3, W, 3, C.ink5);
  for (let x = 0; x < W; x += 3) pc.vline(x, H - 8, 5, C.ink6);
  pc.hline(0, H - 8, W, C.ink6);
  pc.set(px, 1, C.red3);
  g.set(px, 1, C.red3);
  return { base: [pc], glow: [g], points: {} };
}

// ── dispatch (memoised: the scene asks again on every rebuild) ─────────────────────────────
const artCache = new Map<string, FacilityArt>();

export function facilityArt(type: ArtType, label: string, tier = 1): FacilityArt {
  const t = clampTier(type, tier);
  const key = `${type}|${label}|${t}`;
  let art = artCache.get(key);
  if (!art) {
    art = makeArt(type, label, t);
    artCache.set(key, art);
  }
  return art;
}

function makeArt(type: ArtType, label: string, tier: number): FacilityArt {
  switch (type) {
    case 'datacenter':
      return datacenter(label, tier);
    case 'solar':
      return solar(tier);
    case 'wind':
      return wind(tier);
    case 'battery':
      return battery(tier);
    case 'gas':
      return gas(tier);
    case 'lab':
      return lab(tier);
    case 'hq':
      return hq(label);
    case 'substation':
      return substation();
    case 'hydro':
      return hydro(label, tier);
    case 'geothermal':
      return geothermal(tier);
    case 'restart':
      return restart(label);
    case 'smr':
      return smr(label, tier);
    case 'reactor':
      return reactor(label);
    case 'packaging':
      return packaging(label, tier);
    case 'fab':
      return fab(label);
    case 'campus':
      return campus(label);
  }
}

/** Cranes over a building site of width W (one per ~110 px), jibs at y = jibY. */
function cranes(pc: PixelCanvas, W: number, H: number, jibY: number, cut: number) {
  const n = Math.max(1, Math.round(W / 110));
  for (let i = 0; i < n; i++) {
    const cx = Math.min(W - 6, Math.floor(((i + 0.7) / n) * W));
    const jibL = Math.min(cx - 1, 26 + (i % 2) * 8);
    towerCrane(pc, cx, jibY + i * 3, H, jibL, Math.min(9, W - cx - 4), Math.max(2, cut - jibY - 8 - i * 3));
  }
}

/** A building site: the finished sprite revealed bottom-up, with scaffolding and cranes. */
export function constructionArt(type: FacilityType, progress: number, label: string, tier = 1, blocked = false): PixelCanvas {
  const t = clampTier(type, tier);
  const [W, H] = facilitySize(type, t);
  const full = facilityArt(type, label, t).base[0];
  const cut = Math.round(H - Math.max(0.12, progress) * H);
  const pc = revealFrom(full, cut);
  // foundations show as a concrete pad from the start
  pc.rect(0, H - 3, W, 3, C.ink4);
  pc.hline(0, H - 3, W, C.ink6);
  const sy = Math.max(4, cut - 8);
  scaffold(pc, 2, sy, W - 4, Math.min(H - 1, cut + 6) - sy);
  if (W < 90 && H < 40) crawlerCrane(pc, Math.floor(W * 0.6), H - 1, Math.min(20, H - 8));
  else cranes(pc, W, H, 1, cut);
  // safety fence
  for (let x = 0; x < W; x += 2) pc.set(x, H - 4, x % 4 ? C.org1 : C.white);
  if (blocked) holdSign(pc, Math.floor(W / 2) - 14, H - 14);
  return pc;
}

/** "On hold" board for paused sites (waiting on a licence or tools). */
function holdSign(pc: PixelCanvas, x: number, y: number) {
  const txt = 'ON HOLD';
  const tw = measureText(txt);
  pc.rect(x, y, tw + 4, 8, C.org1);
  pc.box(x, y, tw + 4, 8, C.ink1);
  drawText(pc, txt, x + 2, y + 2, C.ink1);
  pc.vline(x + 2, y + 8, 4, C.ink5);
  pc.vline(x + tw + 1, y + 8, 4, C.ink5);
}

/**
 * An expansion under way: the next tier rises (revealed bottom-up behind scaffolding) around the
 * running facility, which keeps its lights on. Returns frames matching the current art.
 */
export function upgradeArt(type: FacilityType, label: string, from: number, to: number, progress: number): FacilityArt {
  const tf = clampTier(type, from);
  const tt = clampTier(type, to);
  const cur = facilityArt(type, label, tf);
  const next = facilityArt(type, label, tt);
  const [W, H] = facilitySize(type, tt);
  const [cw, ch] = facilitySize(type, tf);
  const oy = H - ch;
  const p = Math.max(0.15, Math.min(1, progress));
  // beside the old building the extension rises from the ground; above it, new storeys rise
  // from the old roof
  const cutSide = Math.round(H - p * H);
  const cutAbove = Math.round(oy * (1 - p));
  const src = next.base[0];
  const shell = new PixelCanvas(W, H);
  for (let x = 0; x < W; x++) {
    const cut = x < cw ? cutAbove : cutSide;
    for (let y = Math.max(0, cut); y < H; y++) shell.set(x, y, src.get(x, y));
  }
  const wider = cw < W - 8;
  const taller = oy > 8;
  // scaffolding hugs the silhouette of what is being built (no frames floating in the sky)
  const colTop = new Array<number>(W).fill(H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (src.get(x, y)) { colTop[x] = y; break; }
  const works = new PixelCanvas(W, H);
  if (wider) {
    const sy = Math.max(4, cutSide - 8);
    scaffold(works, cw - 4, sy, W - cw + 2, Math.min(H - 1, cutSide + 6) - sy);
  }
  if (taller) {
    const sy = Math.max(3, cutAbove - 6);
    scaffold(works, 2, sy, Math.min(cw, W) - 4, oy + 2 - sy);
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (works.get(x, y) && y < colTop[x] - 2) works.set(x, y, 0);
  const base = cur.base.map((frame) => {
    const pc = shell.clone();
    pc.blit(frame, 0, oy);
    pc.blit(works, 0, 0);
    // a crane over the works
    const cx = wider ? Math.min(W - 6, Math.max(cw + 4, Math.floor((cw + W) / 2))) : Math.min(W - 6, Math.floor(W * 0.72));
    const jibL = Math.min(cx - 1, 34);
    const hookTo = wider ? cutSide : cutAbove;
    towerCrane(pc, cx, 1, H, jibL, Math.min(9, W - cx - 4), Math.max(2, hookTo - 10));
    if (wider) for (let x = cw; x < W; x += 2) pc.set(x, H - 4, x % 4 ? C.org1 : C.white);
    return pc;
  });
  const glow = cur.glow.map((gl) => {
    const g = new PixelCanvas(W, H);
    g.blit(gl, 0, oy);
    return g;
  });
  const shift = (p: [number, number]): [number, number] => [p[0], p[1] + oy];
  return {
    base,
    glow,
    points: Object.fromEntries(Object.entries(cur.points).map(([k, v]) => [k, shift(v)])),
    emitters: cur.emitters?.map((e) => ({ ...e, y: e.y + oy })),
    movers: cur.movers?.map((m) => ({ ...m, path: m.path.map(shift) })),
    rotors: cur.rotors?.map((r) => ({ ...r, y: r.y + oy })),
    fps: cur.fps,
  };
}

/** Height of the empty-plot marker; it sits 4 px into the ground strip. */
export const EMPTY_H = 16;

/** Empty plot marker: surveyed land — a dotted outline, corner stakes with flags and a plus. */
export function emptyPlotArt(w: number, hover: boolean): PixelCanvas {
  const h = EMPTY_H;
  const pc = new PixelCanvas(w, h);
  const c = hover ? C.yel1 : C.ink8;
  const y0 = 8;
  for (let x = 0; x < w; x += 2) {
    pc.set(x, y0, c);
    pc.set(x, h - 1, c);
  }
  for (let y = y0; y < h; y += 2) {
    pc.set(0, y, c);
    pc.set(w - 1, y, c);
  }
  // survey stakes with little flags at the back corners and the middle
  for (const sx of [1, Math.floor(w / 2), w - 2]) {
    pc.vline(sx, 2, y0 - 1, hover ? C.yel0 : C.snd3);
    pc.set(sx + (sx === w - 2 ? -1 : 1), 2, hover ? C.yel1 : C.org1);
    pc.set(sx + (sx === w - 2 ? -2 : 2), 3, hover ? C.yel1 : C.org1);
    pc.set(sx + (sx === w - 2 ? -1 : 1), 3, hover ? C.yel0 : C.org0);
  }
  const mx = Math.floor(w / 2);
  pc.hline(mx - 2, y0 + 4, 5, c);
  pc.vline(mx, y0 + 2, 5, c);
  return pc;
}

// ── people & vehicles ──────────────────────────────────────────────────────────────────────
export function personFrames(variant: number): PixelCanvas[] {
  const shirts = [C.blu4, C.org1, C.grn5, C.vio4, C.red3, C.cyn4];
  const skins = [C.skn2, C.skn3, C.skn4, C.skn5];
  const shirt = shirts[variant % shirts.length];
  const skin = skins[Math.floor(variant / 2) % skins.length];
  const hat = variant % 3 === 0 ? C.yel0 : variant % 3 === 1 ? C.ink1 : C.snd2;
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(3, 7);
    pc.hline(0, 0, 3, hat);
    pc.set(1, 1, skin);
    pc.hline(0, 2, 3, shirt);
    pc.hline(0, 3, 3, shirt);
    pc.set(1, 4, C.ink2);
    if (f === 0) {
      pc.set(0, 5, C.ink2);
      pc.set(2, 6, C.ink1);
      pc.set(0, 6, C.ink1);
    } else {
      pc.set(1, 5, C.ink2);
      pc.set(1, 6, C.ink1);
    }
    return pc;
  });
}

export function truckArt(): PixelCanvas {
  return PixelCanvas.from(
    `
    ..aaaaaaaaaaa.....
    ..abbbbbbbbba.....
    ..abbcccbbbba.dd..
    ..abbbbbbbbbadded.
    ..abbbbbbbbbadddd.
    ..aaaaaaaaaaadddd.
    ...ff.....ff..ff..
  `,
    { a: 'ink6', b: 'ink9', c: 'cyn4', d: 'blu4', e: 'sky4', f: 'ink0' },
  );
}

/** Tanker / flatbed variants for supplier sites (gases, wafers, ore). */
export function truckVariant(kind: 'tanker' | 'flatbed' | 'box', accent: number): PixelCanvas {
  const pc = new PixelCanvas(18, 7);
  if (kind === 'tanker') {
    pc.ellipse(7, 2.5, 6.5, 2.6, C.ink8);
    pc.hline(2, 1, 10, C.white);
    pc.hline(2, 4, 10, C.ink6);
    pc.hline(3, 3, 8, accent);
  } else if (kind === 'flatbed') {
    pc.hline(1, 5, 12, C.ink5);
    pc.rect(3, 1, 8, 4, C.snd3);
    pc.hline(3, 1, 8, C.snd5);
    pc.vline(7, 1, 4, C.snd2);
  } else {
    pc.rect(2, 0, 11, 6, C.ink6);
    pc.rect(3, 1, 9, 4, C.ink9);
    pc.hline(3, 3, 9, accent);
  }
  pc.rect(13, 2, 4, 4, accent);
  pc.set(14, 3, C.sky4);
  pc.set(15, 3, C.sky4);
  pc.set(3, 6, C.ink0);
  pc.set(4, 6, C.ink0);
  pc.set(10, 6, C.ink0);
  pc.set(11, 6, C.ink0);
  pc.set(14, 6, C.ink0);
  pc.set(15, 6, C.ink0);
  return pc;
}

// ── backdrops ──────────────────────────────────────────────────────────────────────────────
interface Biome {
  far: [number, number];
  mid: [number, number];
  ground: [number, number, number];
  farShape: 'mesa' | 'hills' | 'peaks' | 'volcano' | 'flat' | 'sea';
  deco: 'cactus' | 'tree' | 'pine' | 'palm' | 'grass' | 'acacia' | 'rock';
}

export const BIOMES: Record<Backdrop, Biome> = {
  desert: { far: [C.rck4, C.rck5], mid: [C.snd5, C.snd6], ground: [C.snd5, C.snd6, C.snd7], farShape: 'mesa', deco: 'cactus' },
  coast: { far: [C.sea5, C.sea6], mid: [C.grn4, C.grn5], ground: [C.grn4, C.grn5, C.snd6], farShape: 'sea', deco: 'tree' },
  temperate: { far: [C.blu4, C.blu5], mid: [C.grn3, C.grn4], ground: [C.grn4, C.grn5, C.grn6], farShape: 'hills', deco: 'tree' },
  boreal: { far: [C.ink6, C.ice2], mid: [C.grn1, C.grn2], ground: [C.grn2, C.grn3, C.ice2], farShape: 'peaks', deco: 'pine' },
  plains: { far: [C.grn4, C.blu5], mid: [C.grn5, C.snd5], ground: [C.grn5, C.snd5, C.snd6], farShape: 'flat', deco: 'grass' },
  tropical: { far: [C.grn3, C.grn4], mid: [C.grn2, C.grn3], ground: [C.grn3, C.grn4, C.snd5], farShape: 'hills', deco: 'palm' },
  mountain: { far: [C.rck3, C.ice3], mid: [C.grn2, C.grn3], ground: [C.grn3, C.rck4, C.grn4], farShape: 'peaks', deco: 'pine' },
  volcanic: { far: [C.rck2, C.rck3], mid: [C.rck1, C.grn2], ground: [C.rck2, C.grn3, C.rck3], farShape: 'volcano', deco: 'rock' },
  savanna: { far: [C.snd4, C.rck4], mid: [C.snd5, C.grn5], ground: [C.snd5, C.grn5, C.snd6], farShape: 'flat', deco: 'acacia' },
};

/** Far ridge silhouette (with aerial-perspective dither toward the sky). */
export function farRidge(b: Backdrop, w: number, h: number, seed: number): PixelCanvas {
  const bio = BIOMES[b];
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    let top: number;
    const n = fbm(x / 70, seed, seed, 3);
    switch (bio.farShape) {
      case 'mesa':
        top = h * 0.45 + Math.round((n > 0.52 ? -0.25 : 0.15) * h + (fbm(x / 9, seed + 2) - 0.5) * 3);
        break;
      case 'peaks':
        top = h * 0.15 + Math.abs(((x + seed * 13) % 90) - 45) * (h / 70) + n * h * 0.3;
        break;
      case 'volcano': {
        // a broad cone with a notched crater, wherever the band is
        const vx = Math.min(w * 0.6, 220);
        const d = Math.abs(x - vx);
        top = Math.min(h * 0.16 + Math.pow(d, 1.08) * 0.42 + (n - 0.5) * 3, h * 0.55 + (n - 0.5) * h * 0.2);
        if (d < 4) top = h * 0.16 + 2; // crater notch
        break;
      }
      case 'flat':
        top = h * 0.7 + (n - 0.5) * h * 0.2;
        break;
      case 'sea':
        top = h * 0.72;
        break;
      default:
        top = h * 0.4 + (n - 0.5) * h * 0.55;
    }
    top = Math.max(0, Math.min(h - 1, Math.round(top)));
    for (let y = top; y < h; y++) {
      let c = bio.far[0];
      if (bio.farShape === 'peaks' && y - top < 4 + n * 4) c = bio.far[1];
      else if (bio.farShape === 'sea') c = y === top ? C.sea7 : (y - top) % 3 === 0 ? C.sea6 : bio.far[0];
      else if (y - top < 2) c = bio.far[1];
      pc.set(x, y, c);
    }
  }
  return pc;
}

/** Mid ground band with decorations (trees, cacti, palms…). With `endX` the land slopes away (coast). */
export function midBand(b: Backdrop, w: number, h: number, seed: number, endX?: number): PixelCanvas {
  const bio = BIOMES[b];
  const pc = new PixelCanvas(w, h);
  const surface = (x: number) => {
    let top = Math.round(h * 0.55 + (fbm(x / 40, seed + 5, seed) - 0.5) * h * 0.35);
    if (endX !== undefined && x > endX) top += Math.round((x - endX) * 0.45);
    return top;
  };
  for (let x = 0; x < w; x++) {
    const top = surface(x);
    for (let y = top; y < h; y++) pc.set(x, y, y - top < 2 ? bio.mid[1] : ditherAt(x, y, 0.3) ? bio.mid[1] : bio.mid[0]);
  }
  for (let x = 4; x < w - 8; x += 7 + Math.floor(hash2(x, seed, 21) * 12)) {
    if (endX !== undefined && x > endX - 4) break;
    deco(pc, bio.deco, x, surface(x) + 1, hash2(x, seed, 22));
  }
  return pc;
}

function deco(pc: PixelCanvas, kind: Biome['deco'], x: number, y: number, r: number) {
  switch (kind) {
    case 'tree': {
      const s = 3 + Math.floor(r * 3);
      pc.vline(x, y - 2, 3, C.snd2);
      pc.circle(x + 0.5, y - s - 1, s, C.grn3);
      pc.circle(x - 0.5, y - s - 2, s - 1, C.grn4);
      pc.set(x - 1, y - 2 * s, C.grn6);
      break;
    }
    case 'pine': {
      const s = 5 + Math.floor(r * 5);
      for (let j = 0; j < s; j++) pc.hline(x - Math.floor(j / 2), y - s + j, Math.floor(j / 2) * 2 + 1, j % 3 === 0 ? C.grn2 : C.grn1);
      pc.vline(x, y, 2, C.snd1);
      break;
    }
    case 'palm': {
      const s = 6 + Math.floor(r * 4);
      for (let j = 0; j < s; j++) pc.set(x + Math.round(Math.sin(j / 3) * 1), y - j, C.snd3);
      const tx = x + Math.round(Math.sin(s / 3));
      for (const [dx, dy] of [[-3, 1], [-2, 0], [-1, -1], [1, -1], [2, 0], [3, 1], [-4, 2], [4, 2]]) pc.set(tx + dx, y - s + dy, C.grn4);
      break;
    }
    case 'cactus':
      pc.vline(x, y - 6, 6, C.grn4);
      pc.vline(x + 1, y - 6, 6, C.grn3);
      pc.vline(x - 2, y - 4, 2, C.grn4);
      pc.set(x - 1, y - 3, C.grn4);
      pc.vline(x + 3, y - 5, 2, C.grn3);
      pc.set(x + 2, y - 3, C.grn3);
      break;
    case 'acacia':
      pc.vline(x, y - 5, 5, C.snd2);
      pc.hline(x - 4, y - 6, 9, C.grn3);
      pc.hline(x - 3, y - 7, 7, C.grn4);
      break;
    case 'grass':
      for (let i = 0; i < 4; i++) pc.set(x + i, y - 1 - (i % 2), C.grn6);
      if (r > 0.75) {
        pc.rect(x + 6, y - 9, 3, 9, C.ink8);
        pc.set(x + 7, y - 10, C.red2);
      }
      break;
    case 'rock':
      pc.rect(x, y - 2, 4, 2, C.rck3);
      pc.hline(x + 1, y - 3, 2, C.rck4);
      if (r > 0.7) pc.set(x + 6, y - 1, C.ice2);
      break;
  }
}

/**
 * Distant industrial skyline behind a big campus (parallax layer between the mid band and the
 * plots): halls, cooling cells, pylons. The glow canvas holds thousands of tiny lit windows —
 * the "sea of lights" at night. `density` 1..3.
 */
export function backlot(w: number, h: number, seed: number, density: number): { base: PixelCanvas; glow: PixelCanvas } {
  const pc = new PixelCanvas(w, h);
  const g = new PixelCanvas(w, h);
  const body = C.ink6;
  const roof = C.ink7;
  let x = Math.floor(hash2(seed, 1, 3) * 20);
  while (x < w) {
    const r = hash2(x, seed, 5);
    const bw = 18 + Math.floor(hash2(x, seed, 6) * 40);
    if (r < 0.12 + (3 - density) * 0.12) {
      // gap with a pylon
      const px = x + Math.floor(bw / 2);
      const ph = Math.floor(h * 0.75);
      for (let y = h - ph; y < h; y++) {
        const half = Math.floor(((y - (h - ph)) / ph) * 3);
        pc.set(px - half, y, C.ink7);
        pc.set(px + half, y, C.ink7);
      }
      pc.hline(px - 4, h - ph + 2, 9, C.ink7);
      g.set(px, h - ph - 1, C.red3);
      pc.set(px, h - ph - 1, C.red1);
      x += bw;
      continue;
    }
    const bh = Math.floor(h * (0.3 + hash2(x, seed, 7) * (0.35 + density * 0.1)));
    const top = h - bh;
    pc.rect(x, top, bw, bh, body);
    pc.hline(x, top, bw, roof);
    // rooftop units
    for (let k = x + 2; k < x + bw - 4; k += 6) if (hash2(k, seed, 8) > 0.4) pc.rect(k, top - 2, 4, 2, C.ink6);
    // window rows
    for (let y = top + 3; y < h - 2; y += 3) {
      for (let k = x + 2; k < x + bw - 2; k += 2) {
        if (hash2(k, y, seed) < 0.45) continue;
        pc.set(k, y, C.ink5);
        if (hash2(k, y, seed + 1) < 0.35 + density * 0.12) g.set(k, y, hash2(k, y, seed + 2) > 0.7 ? C.cyn5 : hash2(k, y, seed + 3) > 0.5 ? C.yel1 : C.yel0);
      }
    }
    if (bh > h * 0.6) {
      g.set(x + 1, top - 1, C.red3);
      pc.set(x + 1, top - 1, C.red1);
    }
    // cooling plume stacks on some halls
    if (hash2(x, seed, 9) > 0.7) {
      pc.rect(x + bw - 8, top - 6, 5, 6, C.ink7);
      pc.hline(x + bw - 9, top - 7, 7, C.ink8);
    }
    x += bw + 2 + Math.floor(hash2(x, seed, 10) * 6);
  }
  // aerial perspective: dither the top of everything toward the sky
  for (let y = 0; y < h; y++) for (let k = 0; k < w; k++) if (pc.get(k, y) === body && bayer(k, y) < 2 + Math.max(0, 6 - y)) pc.set(k, y, C.ink7);
  return { base: pc, glow: g };
}

/**
 * Ground strip with a road. With `beachFrom`, the land gives way to sand and surf; with
 * `lakeFrom` (Geneva), the promenade ends at a stone quay and the lake begins.
 */
export function groundStrip(b: Backdrop, w: number, h: number, opts: { beachFrom?: number; cableX?: number; lakeFrom?: number } = {}): PixelCanvas {
  if (opts.lakeFrom !== undefined) return lakeShore(groundStrip(b, w, h, { cableX: opts.cableX }), opts.lakeFrom);
  const bio = BIOMES[b];
  const pc = new PixelCanvas(w, h);
  const roadY = 14;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number;
      if (y < 2) c = (x + y) % 3 === 0 ? bio.ground[2] : bio.ground[1];
      else if (y >= roadY && y < roadY + 7) c = y === roadY || y === roadY + 6 ? C.ink5 : C.ink3;
      else c = bayer(x, y) < 5 + (y > roadY ? 4 : 0) ? bio.ground[0] : bio.ground[1];
      pc.set(x, y, c);
    }
  }
  for (let x = 0; x < w; x += 10) pc.hline(x, roadY + 3, 5, C.yel0);
  for (let x = 0; x < w; x++) if (hash2(x, 7, 41) < 0.12) pc.set(x, 0, bio.ground[2]);
  if (opts.beachFrom !== undefined) {
    const bx = opts.beachFrom;
    for (let y = 0; y < h; y++) {
      // the shoreline runs diagonally toward the viewer
      const sand = bx + Math.round(y * 1.2);
      const water = sand + 18 + Math.round(y * 0.6);
      for (let x = sand - 6; x < w; x++) {
        if (x < sand) {
          if (bayer(x, y) < (x - (sand - 6)) * 2.5) pc.set(x, y, C.snd6);
          continue;
        }
        let c: number;
        if (x < water - 4) c = bayer(x, y) < 4 ? C.snd7 : C.snd6;
        else if (x < water) c = C.snd5; // wet sand
        else if (x < water + 2) c = C.foam;
        else c = (y + Math.floor(x / 7)) % 5 === 0 ? C.sea6 : y < 3 ? C.sea6 : C.sea5;
        pc.set(x, y, c);
      }
      // road ends in a turning circle before the dunes
      if (y >= roadY && y < roadY + 7) for (let x = sand - 10; x < sand - 4; x++) pc.set(x, y, bayer(x, y) < 6 ? C.snd5 : C.snd6);
    }
    if (opts.cableX !== undefined) {
      // the cable trench from the beach manhole into the surf
      for (let y = 2; y < h; y++) {
        const x = opts.cableX + Math.round(y * 1.7);
        if (pc.get(x, y) === C.sea5 || pc.get(x, y) === C.sea6) break;
        pc.set(x, y, C.snd3);
        if (y % 3 === 0) pc.set(x + 1, y, C.snd4);
      }
    }
  }
  return pc;
}

/** The Geneva waterfront: a paved promenade, a stone quay and the lake (over a ground strip). */
function lakeShore(pc: PixelCanvas, from: number): PixelCanvas {
  const { w, h } = pc;
  const roadY = 14;
  for (let y = 0; y < h; y++) {
    for (let x = Math.max(0, from - 60); x < w; x++) {
      if (x >= from) {
        // the lake: light near the quay, ripples, the odd glint
        const t = y / h;
        let c = t < 0.12 ? C.sea6 : ditherAt(x, y, t * 1.3) ? C.sea4 : C.sea5;
        if ((x * 3 + y * 17 + Math.floor(hash2(y, 3, 5) * 50)) % 29 < 3) c = t < 0.5 ? C.sea7 : C.sea6;
        if (hash2(x, y, 41) < 0.01) c = C.foam;
        // the quay wall's reflection right under it
        if (x - from < 3 && y > 1) c = C.sea4;
        pc.set(x, y, c);
      } else if (x >= from - 3) {
        pc.set(x, y, x === from - 1 ? C.ink6 : y % 3 === 0 ? C.ink7 : C.ink8);
      } else if (y < roadY || y >= roadY + 7) {
        // promenade paving in front of the plaza
        pc.set(x, y, y < 2 ? C.ink9 : (x >> 2) % 2 === ((y >> 1) & 1) ? C.ink8 : C.ink7);
      }
    }
  }
  // the road ends in a row of bollards before the quay
  for (let y = roadY; y < roadY + 7; y++) for (let x = from - 10; x < from - 3; x++) pc.set(x, y, (x >> 2) % 2 === ((y >> 1) & 1) ? C.ink8 : C.ink7);
  for (let k = 0; k < 3; k++) {
    pc.vline(from - 12 + k * 3, roadY + 1, 3, C.ink5);
    pc.set(from - 12 + k * 3, roadY, C.ink8);
  }
  return pc;
}

/** Foreground lip (darker grass / fence) for depth. With `lakeFrom`, deep water from there on. */
export function foreground(b: Backdrop, w: number, h: number, opts: { lakeFrom?: number } = {}): PixelCanvas {
  const bio = BIOMES[b];
  const pc = new PixelCanvas(w, h);
  const lake = opts.lakeFrom ?? Infinity;
  for (let x = 0; x < w; x++) {
    const top = Math.round(3 + (fbm(x / 13, 77) - 0.5) * 4);
    if (x >= lake) {
      const wt = Math.round(5 + Math.sin(x / 7) * 1.2);
      for (let y = wt; y < h; y++) pc.set(x, y, y === wt ? C.sea5 : y - wt < 2 ? C.sea3 : C.sea2);
      continue;
    }
    for (let y = top; y < h; y++) pc.set(x, y, y - top < 1 ? bio.ground[0] : C.ink1);
    if (hash2(x, 1, 61) < 0.25) pc.set(x, top - 1, bio.ground[0]);
  }
  for (let x = 6; x < Math.min(w, lake - 2); x += 23) {
    pc.vline(x, 0, h, C.snd2);
    pc.set(x, 0, C.snd3);
  }
  return pc;
}

/** Rows of rolling surf for the beach at landing stations (frames). */
export function surfFrames(w: number): PixelCanvas[] {
  return [0, 1, 2, 3].map((f) => {
    const pc = new PixelCanvas(w, 3);
    for (let x = 0; x < w; x++) {
      const k = (x + f * 3) % 16;
      if (k < 5) pc.set(x, 0, C.foam);
      if (k > 2 && k < 8) pc.set(x, 1, ditherAt(x, 1, 0.5) ? C.foam : C.sea7);
      if (k > 9 && k < 12) pc.set(x, 2, C.sea7);
    }
    return pc;
  });
}

export { ditherAt };
