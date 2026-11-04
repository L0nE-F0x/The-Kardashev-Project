/**
 * The solar-system view's drawing (Act V), free of Pixi so the scene and the headless previews
 * share it: the layout, a top-down camera with a slight tilt (orbits are ellipses), the inner
 * planets on their real orbits (compressed time), the asteroid belt, the swarm's twelve arcs
 * along Earth's orbit, claims and foundries on the asteroids, haul routes, the Mercury probe,
 * Solar Maximum's flares and shockwave, and the near-Earth lens (Earth, the Moon, the L4/L5
 * yards, the habitats, beams to Earth) that the scene shows as an inset and the ending's
 * cinematic flies out of.
 *
 * Coordinates: world space is the ecliptic in AU, the Sun at the origin, angles counter-clockwise
 * seen from the north. Screen is the scene's internal pixels. Moving things go through an
 * `FxSink` (pixels and cached sprites, sorted behind or in front of the Sun).
 */
import { PARTNERS } from '../../content/charter';
import { REGIONS } from '../../content/regions';
import type { AsteroidDef } from '../../content/system';
import type { RegionId } from '../../content/mapcodes';
import type { AsteroidView, SystemView } from '../../sim/systemView';
import type { AsteroidType } from '../../sim/types';
import { drawGlobe, drawStars, globeInverse } from '../globe';
import { drawText, measureText } from '../font';
import { C, type ColorKey } from '../palette';
import { bayer, fbm, hash2, PixelCanvas } from '../pixels';
import { toView } from '../orbit/orbitArt';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

// ── numbers ──────────────────────────────────────────────────────────────────────────────────
/** The default tilt: how flat the orbits look (1 = straight down from the north, 0 = edge on). */
export const TILT0 = 0.55;
export const TILT_MIN = 0.36;
export const TILT_MAX = 0.82;
/** The zoom range: the radius (AU) that fits the view, from the inner system to the belt. */
export const VIEW_MIN = 1.7;
export const VIEW_MAX = 3.35;
/** Real seconds per Earth year (time is compressed so the planets visibly move). */
export const YEAR_SECS = 60;
/** Game day 0 (1 Jan 2027) in days after J2000. */
const J2000 = 9861.5;
/** The Moon's orbit, AU. */
export const MOON_AU = 0.00257;
/** The swarm: a band just inside Earth's orbit. */
export const SWARM_R = 0.982;
const SWARM_SPREAD = 0.026;
/** Seconds per lap of the Moon in the near-Earth lens (its own, slower clock). */
const LENS_MOON_LAP = 40;
/** The Sun–Earth trailing spot where Ring One rides (radians behind Earth). */
const RING_ONE_LAG = 13 * RAD;

export interface PlanetDef {
  id: 'mercury' | 'venus' | 'earth' | 'mars';
  name: string;
  /** Semi-major axis, AU. */
  a: number;
  /** Mean longitude at J2000 (degrees) and period (years). */
  L0: number;
  P: number;
}

export const PLANETS: PlanetDef[] = [
  { id: 'mercury', name: 'MERCURY', a: 0.387, L0: 252.25, P: 0.2408 },
  { id: 'venus', name: 'VENUS', a: 0.723, L0: 181.98, P: 0.6152 },
  { id: 'earth', name: 'EARTH', a: 1, L0: 100.46, P: 1 },
  { id: 'mars', name: 'MARS', a: 1.524, L0: 355.45, P: 1.8809 },
];
const EARTH = PLANETS[2];
const MERCURY = PLANETS[0];

/** The order the swarm's arcs fill in: outward from Earth, ahead then behind (slot k spans k·30°…(k+1)·30° from Earth). */
export const ARC_SLOTS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6];

// ── layout and camera ────────────────────────────────────────────────────────────────────────
export interface SysLayout {
  w: number;
  h: number;
  /** Where the camera's centre (the Sun, normally) sits on screen. */
  cx: number;
  cy: number;
  /** Pixels per AU that fit a 1 AU radius into the view at the default tilt (scale = fit / view radius). */
  fit: number;
  portrait: boolean;
  /** The default tilt (tall screens look down a little more steeply to use their height). */
  tilt: number;
  /** The near-Earth lens: centre and radius on screen. */
  lens: { x: number; y: number; r: number };
}

/** Lay the view out for an internal resolution (phones can be ~800×360, or tall in portrait). */
export function systemLayout(w: number, h: number): SysLayout {
  const portrait = h > w * 1.1;
  const cx = Math.round(portrait ? w * 0.5 : w * 0.47);
  const cy = Math.round(portrait ? h * 0.4 : h * 0.53);
  const tilt = portrait ? 0.74 : TILT0;
  const fit = portrait ? Math.min(w * 0.46, (h * 0.3) / tilt) : Math.min(w * 0.45, (h * 0.42) / tilt);
  const r = Math.max(24, Math.round(portrait ? Math.min(w * 0.24, h * 0.11) : Math.min(h * 0.155, w * 0.1)));
  const lens = portrait ? { x: Math.round(w / 2), y: Math.round(h - r - 18), r } : { x: w - r - 10, y: h - r - 12, r };
  return { w, h, cx, cy, fit, portrait, tilt, lens };
}

export interface SysCam {
  /** The world point (AU) at the layout's centre. */
  x: number;
  y: number;
  /** Turn of the whole view (radians). */
  rot: number;
  /** Vertical squash (TILT_MIN…TILT_MAX). */
  tilt: number;
  /** Pixels per AU. */
  scale: number;
}

/** The camera looking at the Sun with `view` AU of radius in frame. */
export function sysCam(L: SysLayout, view = VIEW_MIN, rot = 0, tilt = L.tilt): SysCam {
  return { x: 0, y: 0, rot, tilt, scale: L.fit / view };
}

/** A projector for a camera: world (AU) → screen x, y and depth (> 0 = farther than the Sun). */
export type Proj = (wx: number, wy: number) => [number, number, number];

export function makeProj(L: SysLayout, cam: SysCam): Proj {
  const c = Math.cos(cam.rot);
  const s = Math.sin(cam.rot);
  const k = cam.scale;
  const kt = cam.scale * cam.tilt;
  return (wx, wy) => {
    const dx = wx - cam.x;
    const dy = wy - cam.y;
    return [L.cx + (dx * c - dy * s) * k, L.cy - (dx * s + dy * c) * kt, wx * s + wy * c];
  };
}

/** Screen → world (AU). */
export function unproject(L: SysLayout, cam: SysCam, x: number, y: number): [number, number] {
  const rx = (x - L.cx) / cam.scale;
  const ry = -(y - L.cy) / (cam.scale * cam.tilt);
  const c = Math.cos(cam.rot);
  const s = Math.sin(cam.rot);
  return [cam.x + rx * c + ry * s, cam.y - rx * s + ry * c];
}

// ── where things are ─────────────────────────────────────────────────────────────────────────
/** Years since J2000 at a game day plus `t` real seconds of compressed time. */
const yearsAt = (day: number, t: number) => (day + J2000) / 365.25 + t / YEAR_SECS;

/** A planet's angle (radians) on its orbit. */
export function planetAngle(p: PlanetDef, day: number, t: number): number {
  return (p.L0 * RAD + (TAU * yearsAt(day, t)) / p.P) % TAU;
}

/** An asteroid's angle (radians): its phase at game day 0, then Kepler's third law. */
export function asteroidAngle(a: AsteroidDef, day: number, t: number): number {
  const years = day / 365.25 + t / YEAR_SECS;
  return (a.phase * RAD + (TAU * years) / Math.pow(a.au, 1.5)) % TAU;
}

export const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];

/** The Earth's angle at a moment. */
export const earthAngle = (day: number, t: number) => planetAngle(EARTH, day, t);

// ── the sky and the static layer ─────────────────────────────────────────────────────────────
/**
 * Deep space for the system view: darker and calmer than the orbit view's sky so the belt and the
 * swarm read, with a faint band of the galaxy across one corner and a scatter of stars.
 */
export function paintSystemSky(pc: PixelCanvas, seed = 2084): void {
  const { w, h } = pc;
  pc.rect(0, 0, w, h, C.night0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = (y - (h * 0.35 - x * 0.55)) / (h * 0.2);
      const band = Math.exp(-d * d * 1.8) * (0.6 + fbm(x / 60, y / 45, seed, 3) * 0.7);
      if (band < 0.25) continue;
      if (bayer(x, y) < Math.min(5, (band - 0.25) * 9)) pc.set(x, y, band > 0.8 && bayer(x, y) < 2 ? C.vio0 : C.night1);
      if (hash2(x, y, seed + 9) < band * 0.025) pc.set(x, y, C.ink4);
    }
  }
  drawStars(pc, seed, Math.round((w * h) / 520));
  for (let i = 0; i < Math.max(3, Math.round((w * h) / 34000)); i++) {
    const x = Math.floor(hash2(i, 3, seed) * w);
    const y = Math.floor(hash2(i, 4, seed) * h);
    pc.set(x, y, C.white);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pc.set(x + dx, y + dy, hash2(i, 5, seed) < 0.5 ? C.ice1 : C.yel1);
  }
}

/** Star pixels that twinkle (a stable subset of positions). */
export function systemTwinklers(L: SysLayout, seed = 2084): { x: number; y: number; c: number }[] {
  const out: { x: number; y: number; c: number }[] = [];
  const n = Math.max(8, Math.round((L.w * L.h) / 8000));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, 11, seed) * L.w);
    const y = Math.floor(hash2(i, 12, seed) * L.h);
    if (Math.hypot(x - L.cx, (y - L.cy) / L.tilt) < L.fit * 0.25) continue;
    out.push({ x, y, c: hash2(i, 13, seed) < 0.35 ? C.yel1 : hash2(i, 13, seed) < 0.6 ? C.ice2 : C.white });
  }
  return out;
}

/**
 * Walk the pixels of a circular orbit of radius `a` (AU), calling `set` once per new pixel with a
 * running index (for dots) and its depth. Only the part near the view is walked, so a huge zoom
 * (the ending's pull-back starts at the Moon's scale) stays cheap.
 */
export function walkOrbit(L: SysLayout, cam: SysCam, a: number, set: (x: number, y: number, i: number, depth: number) => void): void {
  const P = makeProj(L, cam);
  const rpx = a * cam.scale;
  const view = Math.hypot(L.w, L.h) / (cam.scale * cam.tilt);
  const cd = Math.hypot(cam.x, cam.y);
  if (Math.abs(cd - a) > view) return;
  let a0 = 0;
  let a1 = TAU;
  if (a > view * 0.6 && cd > 1e-9) {
    const mid = Math.atan2(cam.y, cam.x);
    const half = Math.min(Math.PI, (view / a) * 1.3);
    a0 = mid - half;
    a1 = mid + half;
  }
  const step = Math.min(0.05, 0.6 / Math.max(1, rpx));
  let lx = NaN;
  let ly = NaN;
  let i = 0;
  for (let th = a0; th <= a1 + step * 0.5; th += step) {
    const [fx, fy, d] = P(a * Math.cos(th), a * Math.sin(th));
    const x = Math.round(fx - 0.5);
    const y = Math.round(fy - 0.5);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    i++;
    if (x < -2 || y < -2 || x > L.w + 2 || y > L.h + 2) continue;
    set(x, y, i, d);
  }
}

export interface StaticOpts {
  /** Draw this extra orbit (AU) in a colour: the hovered asteroid's path. */
  extra?: { a: number; c: number } | null;
  /** Mercury surveyed: its orbit drawn a little brighter. */
  mercury?: number;
}

/**
 * The parts that only change with the camera: the orbits as faint dotted ellipses (Earth's a
 * little brighter: the swarm's track), the asteroid belt as a thin dithered haze between 2.1 and
 * 3.3 AU with its Kirkwood gaps, and an optional highlighted orbit.
 */
export function paintSystemStatic(pc: PixelCanvas, L: SysLayout, cam: SysCam, o: StaticOpts = {}): void {
  pc.data.fill(0);
  // the belt's haze
  const outer = 3.3 * cam.scale;
  const ox = Math.ceil(outer + 2);
  const oy = Math.ceil(outer * cam.tilt + 2);
  const [scx, scy] = makeProj(L, cam)(0, 0);
  const x0 = Math.max(0, Math.floor(scx - ox));
  const x1 = Math.min(pc.w, Math.ceil(scx + ox));
  const y0 = Math.max(0, Math.floor(scy - oy));
  const y1 = Math.min(pc.h, Math.ceil(scy + oy));
  if (cam.scale < 2000) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const [wx, wy] = unproject(L, cam, x + 0.5, y + 0.5);
        const r = Math.hypot(wx, wy);
        if (r < 2.08 || r > 3.32) continue;
        if (Math.abs(r - 2.5) < 0.025 || Math.abs(r - 2.82) < 0.015 || Math.abs(r - 2.95) < 0.012) continue;
        const k = Math.exp(-(((r - 2.72) / 0.42) ** 2));
        const b = bayer(x, y);
        if (b < k * 3.2) pc.set(x, y, wx * Math.sin(cam.rot) + wy * Math.cos(cam.rot) > 0 ? C.night2 : C.night3);
        else if (hash2(x, y, 907) < k * 0.02) pc.set(x, y, C.ink4);
      }
    }
  }
  const dots = (a: number, front: number, back: number, every: number) =>
    walkOrbit(L, cam, a, (x, y, i, d) => {
      if (i % every === 0) pc.set(x, y, d > 0 ? back : front);
    });
  dots(MERCURY.a, o.mercury === 2 ? C.cyn2 : C.ink4, C.ink3, 3);
  dots(PLANETS[1].a, C.ink4, C.ink3, 3);
  dots(PLANETS[3].a, C.ink4, C.ink3, 3);
  // Earth's orbit: the swarm's track, a finer dash
  walkOrbit(L, cam, EARTH.a, (x, y, i, d) => {
    if (i % 3 !== 2) pc.set(x, y, d > 0 ? C.ink3 : i % 6 === 0 ? C.ink6 : C.ink4);
  });
  if (o.extra) dots(o.extra.a, o.extra.c, o.extra.c, 3);
}

// ── sprites ──────────────────────────────────────────────────────────────────────────────────
/** The Sun's radius in pixels for a scale (symbolic: big enough to read, never huge). */
export const sunRadius = (scale: number) => Math.max(4, Math.min(10, Math.round(scale * 0.041)));

/**
 * The Sun with its glow: a white-hot core with limb darkening, a dithered gold-to-dusk corona and
 * slow streamers (three frames). In a storm the corona swells and reddens.
 */
export function sunCanvas(rs: number, frame: number, storm = false): PixelCanvas {
  const G = Math.round(rs * (storm ? 3.4 : 2.9));
  const size = G * 2 + 1;
  const pc = new PixelCanvas(size, size);
  const c = G + 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d <= rs) {
        const q = d / rs;
        pc.set(x, y, q < 0.42 ? C.white : q < 0.7 ? C.yel2 : q < 0.9 ? C.yel1 : C.yel0);
        continue;
      }
      const t = (d - rs) / (G - rs);
      if (t > 1) continue;
      const b = bayer(x, y);
      if (t < 0.1) pc.set(x, y, b < 11 ? C.org2 : C.yel0);
      else if (t < 0.28) {
        if (b < ((0.28 - t) / 0.18) * 15) pc.set(x, y, storm && b < 4 ? C.org0 : C.org1);
      } else if (t < 0.58) {
        if (b < (0.58 - t) * 11) pc.set(x, y, storm ? C.red3 : C.org0);
      } else if (b < (1 - t) * 4.5) pc.set(x, y, storm ? C.red2 : C.dusk3);
    }
  }
  // streamers: long and short rays, turning slowly frame to frame
  const n = storm ? 12 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + frame * 0.13 + (k % 2) * 0.09;
    const len = rs * (k % 2 ? 1.7 : storm ? 3.2 : 2.6);
    for (let d = rs + 1; d < len; d += 0.6) {
      const x = Math.round(c - 0.5 + Math.cos(a) * d);
      const y = Math.round(c - 0.5 + Math.sin(a) * d);
      const f = (d - rs) / (len - rs);
      if (f > 0.55 && (Math.round(d * 2) + frame) % 3 === 0) continue;
      pc.set(x, y, f < 0.25 ? C.yel1 : f < 0.55 ? C.org2 : storm ? C.red3 : C.org1);
    }
  }
  // a few granules on the disc
  for (const [dx, dy] of [[-0.35, 0.2], [0.3, -0.35], [0.1, 0.45]] as const) {
    if ((frame + Math.round(dx * 10)) % 3 === 0) continue;
    pc.set(Math.round(c - 0.5 + dx * rs), Math.round(c - 0.5 + dy * rs), C.yel2);
  }
  return pc;
}

const PLANET_LOOK: Record<PlanetDef['id'], { r: number; dark: ColorKey; base: ColorKey; light: ColorKey; spot?: ColorKey }> = {
  mercury: { r: 1.5, dark: 'rck1', base: 'rck4', light: 'rck6' },
  venus: { r: 2.1, dark: 'snd3', base: 'snd6', light: 'yel1' },
  earth: { r: 2.6, dark: 'sea2', base: 'sea5', light: 'sky4', spot: 'grn5' },
  mars: { r: 1.7, dark: 'red1', base: 'org0', light: 'org1' },
};

/** A small planet disc lit from one of eight directions (the Sun's side, screen angle `dir`·45°, y up). */
export function planetCanvas(id: PlanetDef['id'], dir: number, hover = false): PixelCanvas {
  const look = PLANET_LOOK[id];
  const r = look.r;
  const size = Math.ceil(r * 2) + 2;
  const pc = new PixelCanvas(size, size);
  const c = size / 2;
  const a = (dir / 8) * TAU;
  const lx = Math.cos(a);
  const ly = -Math.sin(a);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - c) / r;
      const ny = (y + 0.5 - c) / r;
      if (nx * nx + ny * ny > 1) continue;
      const lit = nx * lx + ny * ly;
      pc.set(x, y, lit > 0.45 ? C[look.light] : lit > -0.25 ? C[look.base] : C[look.dark]);
    }
  }
  if (look.spot) {
    pc.set(Math.floor(c), Math.floor(c) - 1, C[look.spot]);
    pc.set(Math.floor(c) - 1, Math.floor(c), C[look.spot]);
    pc.set(Math.floor(c) + 1, Math.floor(c) + 1, C.white);
  }
  if (hover) {
    const out = new PixelCanvas(size + 2, size + 2);
    out.blit(pc, 1, 1);
    out.outline(C.white, false);
    return out;
  }
  return pc;
}

const TYPE_COL: Record<AsteroidType, [number, number]> = { C: [C.snd1, C.snd3], S: [C.rck3, C.rck5], M: [C.ink6, C.ink9] };

/**
 * An asteroid marker: a little rock in its type's colours (C dark, S stone, M bright metal);
 * surveyed ones get four faint survey ticks, claimed and worked ones a flag in the owner's colour.
 * The rock sits at (3, 5) on the 7×7 canvas.
 */
export function asteroidCanvas(type: AsteroidType, status: number, owner: ColorKey | null, hover = false): PixelCanvas {
  const pc = new PixelCanvas(7, 7);
  const [d, l] = TYPE_COL[type];
  pc.set(3, 5, l);
  pc.set(4, 5, d);
  pc.set(3, 6, d);
  if (type === 'M') pc.set(4, 6, d);
  if (status <= 1) {
    for (const [x, y] of [[1, 3], [6, 3], [1, 6], [6, 6]] as const) pc.set(x, y, hover ? C.white : C.ink5);
    return pc;
  }
  // the flag: a pole and a pennant
  const col = owner ? C[owner] : C.ink8;
  pc.vline(5, 1, 4, C.ink7);
  pc.set(5, 0, C.ink9);
  pc.rect(6, 1, 1, 2, col);
  pc.set(4, 1, col);
  pc.set(4, 2, col);
  if (hover) for (const [x, y] of [[1, 3], [1, 6], [2, 0]] as const) pc.set(x, y, C.white);
  return pc;
}

/** Ring One: a compute ring in sunlight, cyan lit racks on the near side, white radiator fins either side. */
export function ringOneCanvas(hover = false): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    ..a.....a..
    .ab.ccc.ba.
    ab.c...c.ba
    .ab.ded.ba.
    ..a.....a..
  `,
    { a: 'ink8', b: 'ink6', c: 'cyn3', d: 'cyn5', e: 'white' },
  );
  if (hover) {
    const out = new PixelCanvas(pc.w + 2, pc.h + 2);
    out.blit(pc, 1, 1);
    out.outline(C.white);
    return out;
  }
  return pc;
}

/** A habitat cylinder seen side on: a hull, a lit band of land and windows, end caps catching the sun. */
export function habitatCanvas(): PixelCanvas {
  return PixelCanvas.from(
    `
    .abbbba.
    acgggdca
    .abbbba.
  `,
    { a: 'ink6', b: 'ink8', c: 'ink9', g: 'grn6', d: 'cyn5' },
  );
}

/** A foundry yard at a Lagrange point: a truss cross with a core in the owner's colour. */
export function yardCanvas(owner: ColorKey | null, halted = false): PixelCanvas {
  const pc = PixelCanvas.from(
    `
    a.b.a
    .aca.
    bcdcb
    .aca.
    a.b.a
  `,
    { a: halted ? 'ink4' : 'ink6', b: halted ? 'ink5' : 'ink8', c: halted ? 'ink4' : 'ink7', d: halted ? 'ink5' : owner ?? 'cyn5' },
  );
  return pc;
}

/** The Moon in the lens: a lit disc (sun from screen angle `dir`/16 of a turn, y up), a foundry glow at the south pole. */
export function moonCanvas(mr: number, dir: number, foundry: boolean, hover = false): PixelCanvas {
  const size = mr * 2 + 4;
  const pc = new PixelCanvas(size, size);
  const c = size / 2;
  const a = (dir / 16) * TAU;
  const lx = Math.cos(a);
  const ly = -Math.sin(a);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - c) / mr;
      const ny = (y + 0.5 - c) / mr;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const lit = nx * lx + ny * ly + Math.sqrt(1 - d2) * 0.2;
      const mare = mr >= 3 && fbm((nx + 1) * 2.2, (ny + 1) * 2.2, 77, 2) > 0.58;
      pc.set(x, y, lit > 0.35 ? (mare ? C.ink6 : C.ink9) : lit > 0 ? (mare ? C.ink5 : C.ink7) : lit > -0.25 ? C.ink4 : C.ink3);
    }
  }
  if (foundry) {
    const fx = Math.floor(c + mr * 0.25);
    const fy = Math.floor(c + mr * 0.6);
    pc.set(fx, fy, C.yel1);
    pc.set(fx + 1, fy, C.org1);
    if (mr >= 4) pc.set(fx, fy - 1, C.org2);
  }
  if (hover) pc.ring(c, c, mr + 1.6, C.white);
  return pc;
}

// ── the near-Earth view (the lens, and the ending's opening shot) ─────────────────────────────
export interface Near {
  /** Earth's centre on screen (or on the canvas being painted). */
  x: number;
  y: number;
  /** The Moon's orbit radius and Earth's radius, px. */
  R: number;
  er: number;
  /** The main camera's turn and tilt (the Moon's orbit is drawn in the same frame). */
  rot: number;
  tilt: number;
  /** Screen angle (y up, radians) from Earth toward the Sun. */
  sunPhi: number;
  /** Earth's turn: the longitude under the view's centre (degrees). */
  spin: number;
}

/** A point on the Moon's orbit (world angle `a`), at radius `r` (px, default the orbit), and its depth (> 0 = behind Earth). */
export function nearPoint(g: Near, a: number, r = g.R): [number, number, number] {
  const s = Math.sin(a + g.rot);
  return [g.x + r * Math.cos(a + g.rot), g.y - r * s * g.tilt, s];
}

/** The Moon's world angle in the lens at moment `t`. */
export const moonAngle = (t: number) => ((t / LENS_MOON_LAP) * TAU + 2.1) % TAU;

export interface NearPaint {
  /** The map terrain to wrap the Earth in (the orbit view's), or null for a simple painted Earth. */
  terrain?: { pc: PixelCanvas; res: number } | null;
  /** Paint the lens's round frame, backdrop and name tab around a radius. */
  lens?: number | null;
}

/** Subsolar point for a view from above at the given tilt, with the sun at screen angle `phi`. */
function nearSun(g: Near): { lat: number; lon: number } {
  // lit from the Sun's side of the screen and a little toward the viewer: always a gibbous Earth
  const p0 = Math.asin(Math.max(0.2, Math.min(0.95, g.tilt)));
  const n = Math.hypot(1, 0.45);
  const vx = Math.cos(g.sunPhi) / n;
  const vy = Math.sin(g.sunPhi) / n;
  const vz = 0.45 / n;
  const lat = Math.asin(vy * Math.cos(p0) + vz * Math.sin(p0)) / RAD;
  const lon = g.spin + Math.atan2(vx, vz * Math.cos(p0) - vy * Math.sin(p0)) / RAD;
  return { lat, lon };
}

const SEA = new Set<number>([C.sea0, C.sea1, C.sea2, C.sea3, C.sea4, C.sea5, C.sea6, C.sea7, C.sea8, C.foam, C.ice0, C.ice1, C.ice2, C.ice3]);

/**
 * The still part of the near-Earth view: (in the lens) a dark round backdrop, the Moon's orbit as
 * a dotted ellipse behind and in front of the Earth, and the Earth itself, lit from the Sun's side
 * with its night-side city lights and a thin atmosphere, seen from a little above its orbit.
 */
export function paintNear(pc: PixelCanvas, g: Near, o: NearPaint = {}): void {
  const lr = o.lens ?? null;
  if (lr !== null) {
    for (let y = 0; y < pc.h; y++) {
      for (let x = 0; x < pc.w; x++) {
        const d = Math.hypot(x + 0.5 - g.x, y + 0.5 - g.y);
        if (d > lr) continue;
        const h = hash2(x, y, 4401);
        pc.set(x, y, h < 0.012 ? C.ink5 : h < 0.02 ? C.night3 : d > lr - 6 && bayer(x, y) < (d - lr + 6) * 1.5 ? C.night1 : C.night0);
      }
    }
  }
  const orbit = (back: boolean) => {
    const n = Math.ceil(TAU * g.R * 1.4);
    let lx = NaN;
    let ly = NaN;
    let i = 0;
    for (let k = 0; k <= n; k++) {
      const [fx, fy, d] = nearPoint(g, (k / n) * TAU);
      const x = Math.round(fx - 0.5);
      const y = Math.round(fy - 0.5);
      if (x === lx && y === ly) continue;
      lx = x;
      ly = y;
      i++;
      if (d > 0 !== back || i % 3) continue;
      if (lr !== null && Math.hypot(x + 0.5 - g.x, y + 0.5 - g.y) > lr - 2) continue;
      pc.set(x, y, back ? C.ink3 : C.ink5);
    }
  };
  if (g.R >= 4) orbit(true);
  const sun = nearSun(g);
  const lat0 = Math.asin(Math.max(0.2, Math.min(0.95, g.tilt))) / RAD;
  if (o.terrain && g.er >= 3) {
    const go = { terrain: o.terrain.pc, res: o.terrain.res, lon0: g.spin, lat0, cx: g.x, cy: g.y, r: g.er, sun, lights: g.er >= 18, atmosphere: true, smooth: g.er < 60 };
    drawGlobe(pc, go);
    if (g.er < 18) {
      // a small Earth: a sparse scatter of lights on the night side's land, not a blaze
      const W = o.terrain.pc.w;
      const H = o.terrain.pc.h;
      for (let y = Math.floor(g.y - g.er); y <= Math.ceil(g.y + g.er); y++) {
        for (let x = Math.floor(g.x - g.er); x <= Math.ceil(g.x + g.er); x++) {
          if (hash2(x - Math.round(g.x), y - Math.round(g.y), 977) > 0.16) continue;
          const p = globeInverse(go, x, y);
          if (!p || p.rho > 0.92) continue;
          const sd = Math.sin(p.lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(p.lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((p.lon - sun.lon) * RAD);
          if (sd > -0.12) continue;
          const tx = ((Math.floor((p.lon + 180) / o.terrain.res) % W) + W) % W;
          const ty = Math.max(0, Math.min(H - 1, Math.floor((90 - p.lat) / o.terrain.res)));
          const tc = o.terrain.pc.data[ty * W + tx];
          if (!tc || SEA.has(tc)) continue;
          pc.set(x, y, hash2(x, y, 978) < 0.3 ? C.yel1 : C.org2);
        }
      }
    }
  } else {
    // a simple Earth: oceans, a few green continents, the night side dark
    const lx = Math.cos(g.sunPhi);
    const ly = -Math.sin(g.sunPhi);
    for (let y = Math.floor(g.y - g.er - 1); y <= Math.ceil(g.y + g.er + 1); y++) {
      for (let x = Math.floor(g.x - g.er - 1); x <= Math.ceil(g.x + g.er + 1); x++) {
        const nx = (x + 0.5 - g.x) / g.er;
        const ny = (y + 0.5 - g.y) / g.er;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const lit = nx * lx + ny * ly + Math.sqrt(1 - d2) * 0.15;
        const land = fbm(nx * 2 + g.spin / 40, ny * 2, 911, 3) > 0.55;
        const cloud = fbm(nx * 3 + 4, ny * 3, 912, 2) > 0.68;
        let c = cloud ? C.ice2 : land ? C.grn5 : C.sea5;
        if (lit < -0.1) c = cloud ? C.ink3 : land ? C.grn0 : C.sea1;
        else if (lit < 0.12) c = bayer(x, y) < ((lit + 0.1) / 0.22) * 16 ? c : cloud ? C.ink4 : land ? C.grn1 : C.sea2;
        pc.set(x, y, c);
      }
    }
  }
  if (g.R >= 4) orbit(false);
  if (lr !== null) {
    // the rim: a dark bezel with a glint of glass on the upper left
    pc.ring(g.x, g.y, lr + 1, C.ink0);
    pc.ring(g.x, g.y, lr + 0.2, C.ink6);
    pc.ring(g.x, g.y, lr - 0.8, C.ink2);
    for (let a = 200; a <= 250; a += 2) {
      const r = a * RAD;
      pc.set(Math.round(g.x - 0.5 + Math.cos(r) * (lr - 0.4)), Math.round(g.y - 0.5 + Math.sin(r) * (lr - 0.4)), C.ink9);
    }
    // the name tab
    const t = 'EARTH & MOON';
    const tw = measureText(t) + 6;
    const tx = Math.round(g.x - tw / 2);
    const ty = Math.round(g.y - lr - 4);
    pc.rect(tx, ty, tw, 9, C.ink1);
    pc.box(tx, ty, tw, 9, C.ink5);
    drawText(pc, t, tx + 3, ty + 2, C.ink8);
  }
}

// ── things that move ─────────────────────────────────────────────────────────────────────────
export interface FxSink {
  /** One pixel; `front` = in front of the Sun (else behind it). */
  px(x: number, y: number, c: number, front: boolean): void;
  /** A sprite (by cache key) with its top-left. */
  spr(key: string, make: () => PixelCanvas, x: number, y: number, front: boolean): void;
}

/** Something the pointer can find: hover shows `label`, a click opens `open` (a diorama id), if any. */
export interface Hit {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  open: string | null;
  /** Lens targets win over the main view underneath. */
  lens?: boolean;
}

export interface SysLabel {
  text: string;
  x: number;
  y: number;
  color: number;
}

export interface FxOpts {
  /** Reduced motion: one frozen frame. */
  still?: boolean;
  /** Battery saver: fewer particles. */
  lite?: boolean;
  /** The id of the hovered thing (reticle, outline). */
  hover?: string | null;
  /** The ending: 0..1 pull-back progress (arcs ignite one after another), or null. */
  cine?: number | null;
  /** Hide the main-view Earth (the near view is drawn big over it). */
  hideEarth?: boolean;
  /** Draw the leader from Earth to the lens. */
  lens?: { x: number; y: number; r: number } | null;
}

export interface SysInput {
  view: SystemView;
  day: number;
  /** Seconds of compressed time since the scene began. */
  t: number;
  /** Habitat cylinders (from orbitExtras). */
  habitats: number;
}

export function ownerName(owner: string | null): string {
  if (!owner) return '';
  if (owner === 'charter') return 'CHARTER';
  if (owner === 'you') return 'YOU';
  if (PARTNERS[owner]) return PARTNERS[owner].short.toUpperCase();
  const reg = REGIONS[owner as RegionId];
  return reg ? reg.short : owner.toUpperCase();
}

const fmtMt = (mt: number) => (mt >= 10 ? Math.round(mt).toString() : mt.toFixed(1).replace(/\.0$/, ''));

export function asteroidLabel(a: AsteroidView): string {
  const parts = [a.name.toUpperCase(), `${a.type}-TYPE`];
  if (a.status === 1) parts.push('SURVEYED');
  if (a.owner) parts.push(ownerName(a.owner));
  if (a.foundry > 0) parts.push(`${fmtMt(a.foundry)} MT/YR`);
  return parts.join(' · ');
}

/** A shortest signed angle from a to b. */
const dAngle = (a: number, b: number) => ((((b - a) % TAU) + TAU * 1.5) % TAU) - Math.PI;

/** Belt particles: a fixed scatter between 2.1 and 3.3 AU with Kirkwood gaps (radius, phase, colour). */
let beltMemo: { a: number; ph: number; c: number; big: boolean }[] | null = null;
function belt(): { a: number; ph: number; c: number; big: boolean }[] {
  if (beltMemo) return beltMemo;
  const out: { a: number; ph: number; c: number; big: boolean }[] = [];
  for (let i = 0; out.length < 700 && i < 4000; i++) {
    const u = (hash2(i, 1, 301) + hash2(i, 2, 301)) / 2;
    const a = 2.12 + u * 1.16;
    if (Math.abs(a - 2.5) < 0.03 || Math.abs(a - 2.82) < 0.02 || Math.abs(a - 2.95) < 0.015) continue;
    const h = hash2(i, 3, 301);
    out.push({ a, ph: hash2(i, 4, 301) * TAU, c: h < 0.45 ? C.rck3 : h < 0.78 ? C.rck4 : h < 0.94 ? C.ink6 : C.rck6, big: hash2(i, 5, 301) < 0.04 });
  }
  return (beltMemo = out);
}

/** Lit arcs (whole and partial): 0..12. */
export const arcsLit = (segments: number[]) => segments.filter((f) => f >= 1).length;

/**
 * Everything that moves in the main view, for a moment: twinkling stars, the belt drifting, the
 * planets, the swarm glittering along Earth's orbit (Ring One trailing Earth), the asteroids by
 * status, haul ships, the Mercury probe or survey, Solar Maximum's flares and shockwave, the
 * leader to the lens and the hover reticle. Returns what the pointer can find, and labels.
 */
export function systemFx(sink: FxSink, L: SysLayout, cam: SysCam, inp: SysInput, o: FxOpts = {}, stars: { x: number; y: number; c: number }[] = []): { hits: Hit[]; labels: SysLabel[]; earth: [number, number] } {
  const v = inp.view;
  const still = !!o.still;
  const T = still ? 7.3 : inp.t;
  const day = inp.day;
  const P = makeProj(L, cam);
  const hits: Hit[] = [];
  const labels: SysLabel[] = [];
  const onScreen = (x: number, y: number, m = 8) => x > -m && y > -m && x < L.w + m && y < L.h + m;
  const dot = (wx: number, wy: number, c: number) => {
    const [x, y, d] = P(wx, wy);
    if (onScreen(x, y, 2)) sink.px(Math.round(x - 0.5), Math.round(y - 0.5), c, d <= 0);
  };
  const lite = o.lite ? 0.5 : 1;
  const sunR = sunRadius(cam.scale);
  const [sx, sy] = P(0, 0);
  // twinkling stars
  if (!still) for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const k = hash2(i, Math.floor(T * 1.4 + i * 0.37), 61);
    if (k < 0.22) sink.px(s.x, s.y, k < 0.07 ? s.c : C.ice1, false);
  }
  // ── the belt ──
  if (cam.scale < 4000) {
    const B = belt();
    const n = Math.round(B.length * lite);
    const yrs = day / 365.25 + T / YEAR_SECS;
    for (let i = 0; i < n; i++) {
      const b = B[i];
      const ang = b.ph + (TAU * yrs) / Math.pow(b.a, 1.5);
      const [x, y, d] = P(b.a * Math.cos(ang), b.a * Math.sin(ang));
      if (!onScreen(x, y, 2)) continue;
      const X = Math.round(x - 0.5);
      const Y = Math.round(y - 0.5);
      sink.px(X, Y, d > 0 ? (b.c === C.rck6 ? C.rck4 : b.c === C.rck4 ? C.rck3 : C.rck2) : b.c, d <= 0);
      if (b.big && cam.scale > 120) sink.px(X + 1, Y, C.rck2, d <= 0);
    }
  }
  const ePos = polar(1, earthAngle(day, T));
  hits.push({ id: 'sun', x: sx, y: sy, r: sunR + 2, label: 'THE SUN', open: null });
  // ── the swarm ──
  if (v.active) swarmFx(sink, L, cam, P, v, ePos, T, o, lite);
  // Ring One trails Earth, once there's compute in orbit
  if (v.active && v.ringsTW > 0) {
    const ra = earthAngle(day, T) - RING_ONE_LAG;
    const [x, y, d] = P(Math.cos(ra) * 1.004, Math.sin(ra) * 1.004);
    if (onScreen(x, y)) {
      const hov = o.hover === 'ring';
      const w = hov ? 13 : 11;
      sink.spr(`sys:ringone:${hov}`, () => ringOneCanvas(hov), Math.round(x - w / 2), Math.round(y - (hov ? 4 : 3)), d <= 0);
      if (!still && Math.floor(T * 2) % 3 === 0) sink.px(Math.round(x - 0.5), Math.round(y - 0.5), C.white, d <= 0);
      hits.push({ id: 'ring', x, y, r: 6, label: `RING ONE · ${Math.round(v.ringsTW).toLocaleString('en-US')} TW OF MINDS`, open: 'ring' });
    }
  }
  // ── hauls: ships from the worked rocks to the yards by Earth ──
  if (v.active) {
    for (const hl of v.hauls) {
      if (hl.from === 'moon') continue;
      const a = v.asteroids.find((x) => x.id === hl.from);
      if (!a) continue;
      const r0 = a.def.au;
      const t0 = asteroidAngle(a.def, day, T);
      const t1 = earthAngle(day, T) + (hl.to === 'l4' ? 0.02 : -0.02);
      const dth = dAngle(t0, t1);
      const at = (u: number): [number, number] => polar(r0 + (1.003 - r0) * u, t0 + dth * u);
      const len = (Math.abs(dth) * (r0 + 1) * 0.5 + Math.abs(1 - r0)) * cam.scale;
      const n = Math.min(900, Math.max(12, Math.ceil(len)));
      let lx = NaN;
      let ly = NaN;
      let k = 0;
      for (let i = 2; i < n - 1; i++) {
        const [wx, wy] = at(i / n);
        const [x, y, d] = P(wx, wy);
        const X = Math.round(x - 0.5);
        const Y = Math.round(y - 0.5);
        if (X === lx && Y === ly) continue;
        lx = X;
        ly = Y;
        k++;
        if (k % 4 === 0 && onScreen(x, y, 0)) sink.px(X, Y, d > 0 ? C.ink3 : C.ink4, d <= 0);
      }
      const ships = 1 + Math.round(hl.traffic * 3);
      for (let s = 0; s < ships; s++) {
        const u = still ? (s + 0.5) / ships : (T / 11 + s / ships + hash2(s, 1, a.def.au * 100) * 0.1) % 1;
        const [wx, wy] = at(u);
        const [bx, by] = at(Math.max(0, u - 0.012));
        dot(bx, by, C.org1);
        dot(wx, wy, C.yel2);
      }
    }
  }
  // ── the asteroids ──
  for (const a of v.active ? v.asteroids : []) {
    const ang = asteroidAngle(a.def, day, T);
    const [wx, wy] = polar(a.def.au, ang);
    const [x, y, d] = P(wx, wy);
    if (!onScreen(x, y)) continue;
    const X = Math.round(x - 0.5);
    const Y = Math.round(y - 0.5);
    if (a.status === 0) {
      sink.px(X, Y, C.ink3, d <= 0);
      continue;
    }
    const hov = o.hover === a.id;
    sink.spr(`sys:ast:${a.type}:${a.status}:${a.ownerColor}:${hov}`, () => asteroidCanvas(a.type, a.status, a.ownerColor, hov), X - 3, Y - 5, d <= 0);
    if (a.status === 3 && a.foundry > 0) {
      // the foundry at work: a sparkle, bigger for more capacity
      const arm = a.foundry >= 12 ? 3 : a.foundry >= 4 ? 2 : 1;
      const on = still || Math.floor(T * 3 + a.def.phase) % 4 !== 0;
      if (on) {
        const diag = !still && Math.floor(T * 1.5 + a.def.au) % 2 === 1;
        sink.px(X, Y - 2, C.white, d <= 0);
        for (let k = 1; k <= arm; k++) {
          const c = k === arm ? C.org1 : C.yel1;
          if (diag) for (const [dx, dy] of [[k, k], [-k, k], [k, -k], [-k, -k]] as const) sink.px(X + dx, Y - 2 + dy, c, d <= 0);
          else for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]] as const) sink.px(X + dx, Y - 2 + dy, c, d <= 0);
        }
      }
    }
    hits.push({ id: a.id, x, y: y - 2, r: 6, label: asteroidLabel(a), open: a.id });
  }
  // ── the planets (over the swarm, so Earth shows through its ring) ──
  const sunDir8 = (x: number, y: number) => ((Math.round(Math.atan2(-(sy - y), sx - x) / (TAU / 8)) % 8) + 8) % 8;
  const planetAt: Record<string, [number, number]> = {};
  for (const p of PLANETS) {
    const [wx, wy] = polar(p.a, planetAngle(p, day, T));
    const [x, y, d] = P(wx, wy);
    planetAt[p.id] = [x, y];
    if (!onScreen(x, y)) continue;
    if (p.id === 'earth' && o.hideEarth) continue;
    const dir = sunDir8(x, y);
    const hov = o.hover === p.id;
    const key = `sys:planet:${p.id}:${dir}:${hov}`;
    const make = () => planetCanvas(p.id, dir, hov);
    const pcw = Math.ceil(PLANET_LOOK[p.id].r * 2) + 2 + (hov ? 2 : 0);
    sink.spr(key, make, Math.round(x - pcw / 2), Math.round(y - pcw / 2), d <= 0);
    if (p.id === 'earth') {
      // the Moon, a pixel circling
      const ma = moonAngle(T) + cam.rot;
      sink.px(Math.round(x - 0.5 + Math.cos(ma) * 4), Math.round(y - 0.5 - Math.sin(ma) * 4 * cam.tilt), C.ink8, d <= 0);
    }
    const lab = p.id === 'mercury' && v.mercury >= 2 ? 'MERCURY · SURVEYED' : p.name;
    hits.push({ id: p.id, x, y, r: 5, label: p.id === 'earth' ? 'EARTH · OPEN THE ORBIT VIEW' : lab, open: p.id === 'earth' ? 'orbit' : null });
    if (cam.scale < 2000 && o.cine == null && !(p.id === 'earth' && o.lens)) labels.push({ text: p.name, x: Math.round(x + 5), y: Math.round(y - 8), color: p.id === 'mercury' && v.mercury >= 2 ? C.cyn5 : C.ink5 });
  }
  // ── Mercury: the probe on its way, then the survey ──
  if (v.active && v.mercury >= 1) {
    const [mx, my] = planetAt.mercury;
    if (v.mercury === 1) {
      const tm = planetAngle(MERCURY, day, T);
      const te = earthAngle(day, T);
      const dth = dAngle(te, tm);
      const at = (u: number): [number, number] => polar(1 + (MERCURY.a - 1) * u, te + dth * u);
      const prog = Math.max(0, Math.min(1, v.mercuryProgress));
      const n = 160;
      for (let i = 4; i < n; i++) {
        const u = i / n;
        if (i % 3) continue;
        const [wx, wy] = at(u);
        dot(wx, wy, u <= prog ? C.cyn3 : C.ink3);
      }
      const [px, py] = at(prog);
      const [qx, qy, qd] = P(px, py);
      const blink = still || Math.floor(T * 4) % 2 === 0;
      sink.px(Math.round(qx - 0.5), Math.round(qy - 0.5), C.white, qd <= 0);
      if (blink) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) sink.px(Math.round(qx - 0.5) + dx, Math.round(qy - 0.5) + dy, C.cyn5, qd <= 0);
      hits.push({ id: 'probe', x: qx, y: qy, r: 5, label: `MERCURY PROBE · ${Math.round(prog * 100)}%`, open: null });
    } else if (onScreen(mx, my)) {
      // surveyed: a reticle, a probe in orbit round it, a scan line sweeping
      const X = Math.round(mx - 0.5);
      const Y = Math.round(my - 0.5);
      for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
        sink.px(X + dx, Y + dy, C.cyn5, true);
        sink.px(X + dx - Math.sign(dx), Y + dy, C.cyn3, true);
        sink.px(X + dx, Y + dy - Math.sign(dy), C.cyn3, true);
      }
      const sweep = still ? 0 : Math.floor(T * 6) % 9;
      for (let dx = -3; dx <= 3; dx++) if ((dx + sweep) % 2 === 0) sink.px(X + dx, Y - 4 + sweep, C.cyn4, true);
      const oa = still ? 1 : T * 2.2;
      sink.px(Math.round(X + Math.cos(oa) * 3), Math.round(Y - Math.sin(oa) * 2), C.white, true);
    }
  }
  // ── Solar Maximum: flares on the limb, a shockwave sweeping out across the swarm ──
  if (v.storm !== null) stormFx(sink, P, v.storm, T, still, sx, sy, sunR, cam);
  // ── the leader to the lens, and the reticle round Earth ──
  const [ex, ey] = planetAt.earth;
  if (o.lens && !o.hideEarth && onScreen(ex, ey)) {
    const lz = o.lens;
    const dx = lz.x - ex;
    const dy = lz.y - ey;
    const dist = Math.hypot(dx, dy);
    if (dist > lz.r + 8) {
      const n = Math.floor(dist - lz.r - 2);
      for (let k = 5; k < n; k++) if (k % 3 === 0) sink.px(Math.round(ex + (dx / dist) * k - 0.5), Math.round(ey + (dy / dist) * k - 0.5), C.ink5, true);
    }
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const X = Math.round(ex - 0.5) + cx * 5;
      const Y = Math.round(ey - 0.5) + cy * 5;
      sink.px(X, Y, C.ink8, true);
      sink.px(X - cx, Y, C.ink6, true);
      sink.px(X, Y - cy, C.ink6, true);
    }
  }
  // the swarm's label, over the far side of its track
  if (v.active && cam.scale < 2000 && v.collectorsTW > 0 && (o.cine == null || o.cine > 0.94)) {
    const lit = arcsLit(v.segments);
    const [lx, ly] = P(0, 0);
    const text = v.typeI ? 'THE SWARM · TYPE I' : `THE SWARM · ${lit}/12 ARCS`;
    const top = ly - SWARM_R * cam.scale * cam.tilt - 12;
    labels.push({ text, x: Math.round(lx - measureText(text) / 2), y: Math.round(top), color: C.yel0 });
    hits.push({ id: 'swarm', x: lx, y: top + 3, r: 12, label: `${text} · ${Math.round(v.collectorsTW).toLocaleString('en-US')} TW`, open: null });
  }
  if (cam.scale < 1000 && o.cine == null) {
    const [bx, by] = P(...polar(3.05, -cam.rot - 1.15));
    if (onScreen(bx, by, -20)) labels.push({ text: 'ASTEROID BELT', x: Math.round(bx - 26), y: Math.round(by), color: C.ink4 });
  }
  // the hover reticle round whatever's under the pointer
  const hv = o.hover ? hits.find((h) => h.id === o.hover) : null;
  if (hv && hv.id !== 'swarm' && hv.id !== 'sun') {
    const X = Math.round(hv.x - 0.5);
    const Y = Math.round(hv.y - 0.5);
    const r = Math.max(4, Math.round(hv.r));
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      sink.px(X + cx * r, Y + cy * r, C.white, true);
      sink.px(X + cx * (r - 1), Y + cy * r, C.white, true);
      sink.px(X + cx * r, Y + cy * (r - 1), C.white, true);
    }
  }
  // labels stay clear of the lens
  const lz = o.lens;
  const clear = lz ? labels.filter((lb) => lb.x > lz.x + lz.r + 2 || lb.x + measureText(lb.text) < lz.x - lz.r - 2 || lb.y > lz.y + lz.r + 2 || lb.y + 6 < lz.y - lz.r - 10) : labels;
  return { hits, labels: clear, earth: [ex, ey] };
}

/**
 * The swarm: twelve arcs of collectors in a band just inside Earth's orbit, filling outward from
 * Earth (ahead, then behind). Each lit arc is a bright thread (the necklace), sheets of collectors
 * scattered round it catching the sunlight, and a sparse warm haze; the far side shows the panels'
 * sunlit faces and shines gold, the near side their backs, warmer and dimmer. Compute rings show as
 * a few cyan glints, habitats as green ones. A storm knocks whole stretches dark; in the ending the
 * arcs ignite one after another as the camera pulls back.
 */
function swarmFx(sink: FxSink, L: SysLayout, cam: SysCam, P: Proj, v: SystemView, ePos: [number, number], T: number, o: FxOpts, lite: number) {
  const still = !!o.still;
  const ea = Math.atan2(ePos[1], ePos[0]);
  const arcPx = cam.scale * (Math.PI / 6) * (1 + cam.tilt) * 0.5;
  const cap = o.cine != null ? 640 : 360;
  const typeI = v.typeI;
  const litAll = v.segments.reduce((a, b) => a + b, 0) / 12;
  const nCore = Math.min(cap, Math.max(12, Math.round(arcPx * 1.35)));
  const nSheet = Math.min(cap, Math.max(12, Math.round(arcPx * 1.5 * lite)));
  const nHalo = Math.min(cap, Math.max(6, Math.round(arcPx * (typeI ? 1.5 : 0.6 + litAll * 0.6) * lite)));
  const compute = Math.min(0.1, (v.ringsTW / Math.max(1, v.collectorsTW)) * 0.14);
  const habit = Math.min(0.04, (v.habitatTW / Math.max(1, v.collectorsTW)) * 0.06);
  const damage = v.damage;
  const cme = v.storm !== null ? cmeFront(v.storm, T, still) : null;
  const onScreen = (x: number, y: number) => x > -2 && y > -2 && x < L.w + 2 && y < L.h + 2;
  const glint = (seed: number, rate: number) => (still ? 1 : hash2(seed, Math.floor(T * 2.4 + hash2(seed, 7, 512) * 9), 506) / rate);
  for (let i = 0; i < 12; i++) {
    const fill = v.segments[i] ?? 0;
    if (fill <= 0) continue;
    const slot = ARC_SLOTS[i];
    const ahead = slot >= 0;
    const start = (ahead ? slot : slot + 1) * (Math.PI / 6);
    const dir = ahead ? 1 : -1;
    const ign = o.cine == null ? 1 : Math.max(0, Math.min(1, (o.cine - (0.14 + i * 0.05)) / 0.07));
    const flash = o.cine != null && ign > 0 && ign < 1;
    /** Where a particle sits (u along the arc from its start, r its radius); null if off screen or hit. */
    const place = (u: number, r: number): [number, number, boolean, number] | null => {
      const ang = ea + start + dir * u * (Math.PI / 6);
      const [x, y, d] = P(r * Math.cos(ang), r * Math.sin(ang));
      if (!onScreen(x, y)) return null;
      return [Math.round(x - 0.5), Math.round(y - 0.5), d <= 0, ang];
    };
    /** The storm: knocked-out stretches flicker dark; the shockwave's wake dims what it just passed. */
    const hit = (u: number, r: number, ang: number, seed: number): number | null | 'skip' => {
      if (damage > 0 && hash2(i, Math.floor(u * 10), 507) < damage) return still || hash2(seed, Math.floor(T * 6), 508) < 0.3 ? (seed % 2 ? C.ink4 : C.red1) : 'skip';
      if (cme) {
        const wake = cme.r - r;
        if (wake > 0 && wake < 0.32 && Math.abs(dAngle(ang, cme.dir)) < cme.half) return hash2(seed, Math.floor(T * 8), 509) < 0.5 ? (wake < 0.07 ? C.white : C.red2) : 'skip';
      }
      return null;
    };
    const dim = (c: number, seed: number) => (ign >= 1 ? c : ign <= 0 ? (seed % 3 ? C.ink4 : C.dusk3) : flash && hash2(seed, 3, 510) < 0.35 ? C.white : c);
    // the thread
    for (let k = 0; k < nCore; k++) {
      const u = (k + 0.5) / nCore;
      if (u > fill) break;
      const r = SWARM_R + (hash2(i, k, 520) - 0.5) * 0.003;
      const q = place(u, r);
      if (!q) continue;
      const seed = i * 4099 + k;
      const h = hit(u, r, q[3], seed);
      if (h === 'skip') continue;
      const far = !q[2];
      let c = h ?? (far ? (k % 3 ? C.yel0 : C.yel1) : k % 3 ? C.org2 : C.yel0);
      if (h === null) {
        const g = glint(seed, typeI ? 1 : 1.4);
        if (g < 0.035) c = C.white;
        c = dim(c, seed);
      }
      sink.px(q[0], q[1], c, q[2]);
    }
    // the sheets
    for (let j = 0; j < nSheet; j++) {
      const u = hash2(i, j, 501);
      if (u > fill) continue;
      const g = (hash2(i, j, 502) + hash2(i, j, 503) + hash2(i, j, 504)) / 3 - 0.5;
      const r = SWARM_R + g * 2 * SWARM_SPREAD;
      const q = place(u, r);
      if (!q) continue;
      const seed = i * 7919 + j;
      const h = hit(u, r, q[3], seed);
      if (h === 'skip') continue;
      const far = !q[2];
      const k = hash2(i, j, 505);
      let c: number;
      if (h !== null) c = h;
      else if (k < compute) c = k < compute * 0.4 ? C.cyn6 : C.cyn5;
      else if (k > 1 - habit) c = C.grn7;
      else if (far) c = k < 0.4 ? C.yel1 : k < 0.72 ? C.yel0 : k < 0.9 ? C.org2 : C.yel2;
      else c = k < 0.4 ? C.org2 : k < 0.7 ? C.org1 : k < 0.9 ? C.yel0 : C.dusk5;
      if (h === null) {
        const gl = glint(seed, typeI ? 1 : 1.5);
        if (gl < 0.05) c = C.white;
        else if (gl < 0.1) c = C.yel2;
        c = dim(c, seed);
      }
      sink.px(q[0], q[1], c, q[2]);
      // a sheet: a second pixel along the track
      if (j % 4 === 0 && h === null && ign >= 1) {
        const c2 = Math.cos(q[3] + cam.rot);
        const s2 = Math.sin(q[3] + cam.rot);
        const tx = -s2;
        const ty = -c2 * cam.tilt;
        const step = Math.abs(tx) >= Math.abs(ty) ? [Math.sign(tx), 0] : [0, Math.sign(ty)];
        sink.px(q[0] + step[0], q[1] + step[1], far ? C.yel0 : C.org2, q[2]);
      }
    }
    // the haze
    for (let j = 0; j < nHalo; j++) {
      const u = hash2(i, j, 531);
      if (u > fill) continue;
      const g = (hash2(i, j, 532) + hash2(i, j, 533)) / 2 - 0.5;
      const r = SWARM_R + g * 2 * SWARM_SPREAD * 2.8;
      const q = place(u, r);
      if (!q) continue;
      if (ign < 1 && hash2(i, j, 534) > ign) continue;
      const seed = i * 6151 + j;
      const h = hit(u, r, q[3], seed);
      if (h !== null) continue;
      const k = hash2(i, j, 535);
      const far = !q[2];
      let c = typeI || litAll > 0.8 ? (k < 0.45 ? C.org1 : k < 0.8 ? C.dusk5 : C.org2) : far ? (k < 0.5 ? C.org0 : C.dusk4) : k < 0.5 ? C.dusk4 : C.dusk3;
      if (glint(seed, 2) < 0.03) c = C.yel1;
      sink.px(q[0], q[1], c, q[2]);
    }
  }
}

/** Solar Maximum's coronal mass ejection: a front racing out from the Sun in a cone, one after another. */
function cmeFront(storm: number, T: number, still: boolean): { r: number; dir: number; half: number; fade: number; cycle: number } {
  const period = 6.5 - storm * 2.5;
  const tt = still ? period * 0.45 : T;
  const cycle = Math.floor(tt / period);
  const ph = (tt % period) / period;
  const r = 0.05 + (1 - (1 - ph) ** 1.6) * 2.4;
  return { r, dir: hash2(cycle, 1, 611) * TAU, half: 0.45 + storm * 0.35, fade: ph, cycle };
}

function stormFx(sink: FxSink, P: Proj, storm: number, T: number, still: boolean, sx: number, sy: number, sunR: number, cam: SysCam) {
  // prominences: loops of plasma rising off the limb and falling back
  const loops = 2 + Math.round(storm * 4);
  for (let k = 0; k < loops; k++) {
    const life = 2.2 + hash2(k, 1, 601) * 1.5;
    const tt = still ? life * 0.5 : T + hash2(k, 2, 601) * life;
    const gen = Math.floor(tt / life);
    const age = (tt % life) / life;
    const a = hash2(k, gen, 602) * TAU;
    const h = Math.sin(age * Math.PI) * (sunR * 0.9 + storm * 3);
    const span = 0.35;
    for (let s = 0; s <= 10; s++) {
      const f = s / 10;
      const aa = a - span / 2 + span * f;
      const rr = sunR + 0.5 + Math.sin(f * Math.PI) * h;
      const c = f < 0.15 || f > 0.85 ? C.org1 : age > 0.7 ? C.red3 : s % 3 ? C.yel1 : C.org2;
      sink.px(Math.round(sx - 0.5 + Math.cos(aa) * rr), Math.round(sy - 0.5 + Math.sin(aa) * rr), c, true);
    }
  }
  // the shockwave: a lumpy bright front bowing back at its edges, a dithered wake of hot plasma
  // behind it, fading as it spreads
  const f = cmeFront(storm, T, still);
  const rpx = Math.max(1, f.r * cam.scale);
  const step = 1.1 / rpx;
  const wake = Math.max(4, Math.round(0.22 * cam.scale));
  const fade = 1 - f.fade * 0.7;
  for (let a = f.dir - f.half; a <= f.dir + f.half; a += step) {
    const off = Math.abs(dAngle(a, f.dir)) / f.half;
    const lump = (fbm(a * 4, f.cycle * 3.1, 613, 2) - 0.5) * 0.14;
    const rf = f.r * (1 - off * off * 0.14) + lump;
    const strength = (1 - off * off) * fade;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let k = 0; k < wake; k++) {
      const r = rf - k / cam.scale;
      if (r <= 0.05) break;
      const q = k / wake;
      const keep = k < 2 ? strength * 1.4 : strength * 0.32 * (1 - q) ** 1.4;
      const [x, y, d] = P(r * ca, r * sa);
      const X = Math.round(x - 0.5);
      const Y = Math.round(y - 0.5);
      if (bayer(X, Y) >= keep * 16 || hash2(X, Y, f.cycle) > 0.85) continue;
      const col = k === 0 ? C.white : k < 2 ? C.yel1 : q < 0.25 ? C.org1 : q < 0.55 ? C.red3 : C.red2;
      sink.px(X, Y, col, d <= 0);
    }
  }
}

/** The things near Earth that move, in the lens or in the ending's close-up. */
export interface NearInput {
  view: SystemView;
  habitats: number;
  /** Seconds (the lens has its own slower Moon clock). */
  t: number;
  /** Screen directions (y up, radians) from Earth toward each hauling asteroid. */
  inbound?: Record<string, number>;
}

/**
 * The near-Earth view's moving parts: the Moon on its orbit (a glow where a foundry works it), the
 * L4 and L5 yards 60° ahead of and behind it (clusters sized by output, a flashing ring if a
 * strain drifts), habitat cylinders and their sparkles near L5, feed hauled from the Moon and
 * arriving from the asteroids, collectors streaming out of the yards, beams to Earth, and storm
 * aurora. `clip` limits everything to the lens's circle. Returns lens targets.
 */
export function nearFx(sink: FxSink, g: Near, inp: NearInput, o: { still?: boolean; hover?: string | null; clip?: number | null } = {}): Hit[] {
  const v = inp.view;
  const still = !!o.still;
  const T = still ? 7.3 : inp.t;
  const hits: Hit[] = [];
  const clip = o.clip ?? null;
  const inside = (x: number, y: number, m = 0) => clip === null || Math.hypot(x + 0.5 - g.x, y + 0.5 - g.y) <= clip - m;
  const px = (x: number, y: number, c: number) => {
    const X = Math.round(x - 0.5);
    const Y = Math.round(y - 0.5);
    if (inside(X, Y)) sink.px(X, Y, c, true);
  };
  /** Hidden behind the Earth's disc? */
  const behind = (x: number, y: number, d: number) => d > 0 && Math.hypot(x - g.x, y - g.y) < g.er + 0.5;
  const spr = (key: string, make: () => PixelCanvas, w: number, h: number, x: number, y: number) => {
    const X = Math.round(x - w / 2);
    const Y = Math.round(y - h / 2);
    if (clip !== null && !(inside(X, Y, 1) && inside(X + w - 1, Y, 1) && inside(X, Y + h - 1, 1) && inside(X + w - 1, Y + h - 1, 1))) return;
    sink.spr(key, make, X, Y, true);
  };
  const scale = g.R / 40;
  const ma = still ? 2.1 : moonAngle(T);
  const sunDir16 = ((Math.round(g.sunPhi / (TAU / 16)) % 16) + 16) % 16;
  const mr = Math.max(2, Math.round(g.er * 0.32));
  const mfound = v.foundries.some((f) => f.place === 'moon');
  const [mx, my, md] = nearPoint(g, ma);
  // the yards and what's at them
  const yard = (site: 'l4' | 'l5') => {
    const fs = v.foundries.filter((f) => f.place === site);
    return { fs, cap: fs.reduce((a, f) => a + f.cap, 0), drift: Math.max(0, ...fs.map((f) => f.drift)), halted: fs.length > 0 && fs.every((f) => f.halted), owner: fs[0]?.ownerColor ?? null };
  };
  const spot = { l4: nearPoint(g, ma + Math.PI / 3), l5: nearPoint(g, ma - Math.PI / 3) };
  // beams to Earth: from the swarm along the orbit, ahead and behind, landing on the day side
  if (v.beamsTW > 0) {
    const nb = Math.max(1, Math.min(4, Math.round(Math.log2(v.beamsTW / 10))));
    const shift = still ? 0 : Math.floor(T * 14);
    for (let b = 0; b < nb; b++) {
      const side = b % 2 ? -1 : 1;
      const ta = g.sunPhi + side * (Math.PI / 2 + 0.25 + Math.floor(b / 2) * 0.22);
      const reach = clip !== null ? clip - 3 : g.R * 1.6;
      const ax = g.x + Math.cos(ta) * reach;
      const ay = g.y - Math.sin(ta) * reach;
      const la = g.sunPhi + side * (0.5 + b * 0.18);
      const bx = g.x + Math.cos(la) * g.er * 0.7;
      const by = g.y - Math.sin(la) * g.er * 0.7;
      const len = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
      for (let k = 0; k < len; k++) {
        const f = k / len;
        const ph = (k - shift + b * 3) & 3;
        if (ph < 2) px(ax + (bx - ax) * f, ay + (by - ay) * f, ph === 0 ? C.pnk1 : C.yel1);
      }
      px(bx, by, C.white);
    }
  }
  // feed from the Moon: a dotted road along the orbit to the yard, ships riding it
  for (const hl of v.hauls) {
    const to = spot[hl.to];
    if (hl.from === 'moon') {
      const span = hl.to === 'l4' ? Math.PI / 3 : -Math.PI / 3;
      const n = Math.max(8, Math.round(Math.abs(span) * g.R * 1.2));
      for (let k = 2; k < n - 1; k++) {
        if (k % 3) continue;
        const [x, y, d] = nearPoint(g, ma + (span * k) / n, g.R * 0.94);
        if (!behind(x, y, d)) px(x, y, C.ink4);
      }
      const ships = 1 + Math.round(hl.traffic * 2);
      for (let s = 0; s < ships; s++) {
        const u = still ? (s + 0.5) / ships : (T / 5 + s / ships) % 1;
        const [x, y, d] = nearPoint(g, ma + span * u, g.R * 0.94);
        if (!behind(x, y, d)) px(x, y, C.yel1);
      }
    } else {
      // ships arriving from the asteroids: in from the lens's edge toward the yard
      const dir = inp.inbound?.[hl.from];
      if (dir === undefined) continue;
      const reach = clip !== null ? clip - 2 : g.R * 1.7;
      const ax = g.x + Math.cos(dir) * reach;
      const ay = g.y - Math.sin(dir) * reach;
      const ships = 1 + Math.round(hl.traffic * 2);
      for (let s = 0; s < ships; s++) {
        const u = still ? (s + 0.4) / ships : (T / 7 + s / ships + hash2(s, 2, hl.from.length) * 0.2) % 1;
        const x = ax + (to[0] - ax) * u;
        const y = ay + (to[1] - ay) * u;
        px(x, y, C.yel2);
        px(x - ((to[0] - ax) / reach) * 1.2, y - ((to[1] - ay) / reach) * 1.2, C.org1);
      }
    }
  }
  // the Moon (hidden when it passes behind the Earth)
  if (!behind(mx, my, md)) {
    const hov = o.hover === 'moon';
    const size = mr * 2 + 4;
    spr(`sys:moon:${mr}:${sunDir16}:${mfound}:${hov}`, () => moonCanvas(mr, sunDir16, mfound, hov), size, size, mx, my);
    if (mfound && (still || Math.floor(T * 3) % 2 === 0)) px(mx + mr * 0.25 + 0.5, my + mr * 0.6 + 1.5, C.yel2);
    hits.push({ id: 'moon', x: mx, y: my, r: mr + 3, label: mfound ? 'SHACKLETON BASE · LUNAR FOUNDRY' : 'SHACKLETON BASE', open: 'moon', lens: true });
  }
  // L4 and L5
  for (const site of ['l4', 'l5'] as const) {
    const [x, y, d] = spot[site];
    if (behind(x, y, d)) continue;
    const yd = yard(site);
    const hov = o.hover === site;
    if (!yd.fs.length) {
      // an empty Lagrange point: a faint cross
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) px(x + dx, y + dy, hov ? C.white : dx || dy ? C.ink3 : C.ink5);
      hits.push({ id: site, x, y, r: 5, label: `EARTH–MOON ${site.toUpperCase()} · EMPTY`, open: site, lens: true });
      continue;
    }
    // the cluster: sparkles round the yard, more for more output
    const n = Math.max(3, Math.min(16, Math.round(2 + Math.sqrt(yd.cap) * 2.2)));
    const rr = (2 + Math.sqrt(yd.cap) * 0.75) * Math.max(0.7, Math.min(1.6, scale));
    for (let k = 0; k < n; k++) {
      const a = hash2(k, 1, site === 'l4' ? 41 : 51) * TAU;
      const r = rr * Math.sqrt(hash2(k, 2, site === 'l4' ? 41 : 51));
      const on = still || yd.halted || hash2(k, Math.floor(T * 3), 52) < 0.75;
      if (!on) continue;
      const c = yd.halted ? C.ink5 : hash2(k, Math.floor(T * 2.2), 53) < 0.12 ? C.white : k % 3 === 0 ? (yd.owner ? C[yd.owner] : C.cyn5) : k % 3 === 1 ? C.yel1 : C.org2;
      px(x + Math.cos(a) * r, y - Math.sin(a) * r * 0.8, c);
    }
    spr(`sys:yard:${yd.owner}:${yd.halted}`, () => yardCanvas(yd.owner, yd.halted), 5, 5, x, y);
    if (hov) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) px(x + dx * (rr + 3), y + dy * (rr + 3), C.white);
    // collectors leaving the yards: gold specks drifting out along the orbit
    if (!yd.halted && v.collectorsTW > 0 && !still) {
      for (let k = 0; k < 3; k++) {
        const u = (T / 4 + k / 3) % 1;
        const a = ma + (site === 'l4' ? Math.PI / 3 : -Math.PI / 3) + (site === 'l4' ? 1 : -1) * u * 0.9;
        const [qx, qy, qd] = nearPoint(g, a, g.R * (1 + u * 0.5));
        if (!behind(qx, qy, qd)) px(qx, qy, u < 0.5 ? C.yel1 : C.org1);
      }
    }
    // a strain drifting: a pulsing warning ring
    if (yd.drift > 0 && (still || Math.floor(T * 3) % 2 === 0)) {
      const col = yd.drift >= 50 ? C.red3 : C.org1;
      const R = rr + 3 + (still ? 0 : Math.floor(T * 6) % 2);
      for (let k = 0; k < 16; k++) {
        if (k % 2) continue;
        const a = (k / 16) * TAU;
        px(x + Math.cos(a) * R, y - Math.sin(a) * R * 0.8, col);
      }
    }
    const lab = `${site.toUpperCase()} YARDS · ${fmtMt(yd.cap)} MT/YR${yd.drift > 0 ? ' · DRIFT!' : yd.halted ? ' · HALTED' : ''}`;
    hits.push({ id: site, x, y, r: Math.max(5, rr + 2), label: lab, open: site, lens: true });
  }
  // habitats near L5: cylinders, and their windows twinkling
  {
    const [x, y, d] = spot.l5;
    const cyl = Math.min(6, inp.habitats);
    const offs = [[-7, 5], [6, 6], [-1, 9], [-10, -1], [9, 1], [2, -7]] as const;
    let hx = 0;
    let hy = 0;
    if (!behind(x, y, d)) {
      for (let k = 0; k < cyl; k++) {
        const ox = offs[k][0] * Math.max(0.8, Math.min(1.6, scale));
        const oy = offs[k][1] * Math.max(0.8, Math.min(1.6, scale)) * 0.8;
        spr('sys:habitat', habitatCanvas, 8, 3, x + ox, y + oy);
        hx += ox / cyl;
        hy += oy / cyl;
      }
      const sparks = Math.min(22, Math.round(Math.sqrt(v.habitatTW) * 0.9));
      for (let k = 0; k < sparks; k++) {
        if (!still && hash2(k, Math.floor(T * 2 + k * 0.3), 71) > 0.6) continue;
        const a = hash2(k, 1, 72) * TAU;
        const r = (5 + hash2(k, 2, 72) * 8) * Math.max(0.8, Math.min(1.6, scale));
        px(x + Math.cos(a) * r, y + 4 - Math.sin(a) * r * 0.6, k % 3 ? C.yel1 : C.grn7);
      }
      if (cyl > 0) {
        const hov = o.hover === 'aurora';
        if (hov) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) px(x + hx + dx * 7, y + hy + dy * 5, C.white);
        hits.push({ id: 'aurora', x: x + hx, y: y + hy, r: 6, label: `AURORA · ${cyl} HABITAT${cyl > 1 ? 'S' : ''} · ${Math.round(v.spacePop)}M PEOPLE IN SPACE`, open: 'aurora', lens: true });
      }
    }
  }
  // storm: aurora curtains over the Earth's poles, flickering
  if (v.storm !== null && g.er >= 4) {
    const lat0 = Math.asin(Math.max(0.2, Math.min(0.95, g.tilt))) / RAD;
    for (let lon = -180; lon < 180; lon += 6) {
      const vv = toView(68 + Math.sin(lon * 5 * RAD + T) * 2, lon, { lon0: g.spin, lat0 });
      if (vv[2] < 0.1) continue;
      if (!still && hash2(lon, Math.floor(T * 5), 81) > 0.45 + v.storm * 0.4) continue;
      const x = g.x + vv[0] * g.er;
      const y = g.y - vv[1] * g.er;
      px(x, y, C.grn6);
      px(x, y - 1, hash2(lon, 1, 82) < 0.5 ? C.cyn5 : C.vio5);
    }
  }
  return hits;
}

/** Screen direction (y up) from Earth toward each hauling asteroid, for ships arriving in the lens. */
export function inboundDirs(L: SysLayout, cam: SysCam, v: SystemView, day: number, t: number): Record<string, number> {
  const P = makeProj(L, cam);
  const [ex, ey] = P(...polar(1, earthAngle(day, t)));
  const out: Record<string, number> = {};
  for (const hl of v.hauls) {
    if (hl.from === 'moon') continue;
    const a = v.asteroids.find((x) => x.id === hl.from);
    if (!a) continue;
    // arrive along the haul road's last stretch
    const t0 = asteroidAngle(a.def, day, t);
    const te = earthAngle(day, t);
    const dth = dAngle(t0, te);
    const u = 0.85;
    const [qx, qy] = P(...polar(a.def.au + (1.003 - a.def.au) * u, t0 + dth * u));
    out[hl.from] = Math.atan2(-(qy - ey), qx - ex);
  }
  return out;
}

/** The screen angle (y up) from Earth toward the Sun. */
export function sunPhiAt(L: SysLayout, cam: SysCam, day: number, t: number): number {
  const P = makeProj(L, cam);
  const [ex, ey] = P(...polar(1, earthAngle(day, t)));
  const [sx, sy] = P(0, 0);
  return Math.atan2(-(sy - ey), sx - ex);
}

/** The near view looks down a little more steeply than the main view, to open up the Moon's orbit. */
export const nearTilt = (tilt: number) => Math.max(0.74, tilt);

/** The lens's geometry for a layout (Earth at its centre). */
export function lensNear(L: SysLayout, cam: SysCam, sunPhi: number, spin: number): Near {
  const r = L.lens.r;
  return { x: L.lens.x, y: L.lens.y, R: Math.round(r * 0.68), er: Math.max(5, Math.round(r * 0.17)), rot: cam.rot, tilt: nearTilt(cam.tilt), sunPhi, spin };
}

/** Where the hover label goes for a target: up and to the right of it, kept on screen. */
export function hoverLabel(L: SysLayout, h: Hit): SysLabel {
  const w = measureText(h.label);
  if (h.lens) {
    // things in the lens are named above it, clear of the Earth
    const z = L.lens;
    return { text: h.label, x: Math.round(Math.max(3, Math.min(L.w - w - 3, z.x - w / 2))), y: Math.round(Math.max(3, z.y - z.r - 13)), color: C.white };
  }
  let x = Math.round(h.x + h.r + 3);
  let y = Math.round(h.y - h.r - 7);
  if (x + w > L.w - 3) x = Math.round(h.x - h.r - 3 - w);
  if (x < 3) x = 3;
  if (y < 3) y = Math.round(h.y + h.r + 3);
  return { text: h.label, x, y, color: C.white };
}

// ── the ending's pull-back ───────────────────────────────────────────────────────────────────
/** Seconds the ending holds on Earth, then pulls back. */
export const CINE_HOLD = 2;
export const CINE_PULL = 10;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The ending's camera at progress `u` (0 = close on Earth and the Moon, 1 = the whole inner
 * system): zoom out on a log scale from the Moon's orbit filling the view to the inner system,
 * Earth sliding from the middle of the screen out to its place on its orbit as the Sun comes
 * into view. Returns the camera and the near view's Moon-orbit and Earth radii (0 when too small to draw).
 */
export function cinematicCam(L: SysLayout, earth: [number, number], u: number, rot = 0): { cam: SysCam; R: number; er: number } {
  const S1 = L.fit / VIEW_MIN;
  const R0 = Math.min(L.w, L.h) * 0.36;
  const S0 = R0 / MOON_AU;
  const e = smooth(Math.max(0, Math.min(1, u)));
  const z = Math.max(0, Math.min(1, u));
  const k = smooth(z);
  const S = Math.exp(Math.log(S0) + (Math.log(S1) - Math.log(S0)) * k);
  const f = 1 - (e * S1) / S;
  const cam: SysCam = { x: earth[0] * f, y: earth[1] * f, rot, tilt: L.tilt, scale: S };
  const R = MOON_AU * S;
  return { cam, R: R >= 6 ? R : 0, er: R >= 6 ? Math.max(2.5, R * 0.24) : 0 };
}

// ── a whole frame (previews) ─────────────────────────────────────────────────────────────────
export interface SystemFrame extends SysInput {
  cam: SysCam;
  terrain?: { pc: PixelCanvas; res: number } | null;
  opts?: FxOpts;
  /** The ending's pull-back progress (0..1), or null for the normal view with its lens. */
  cine?: number | null;
  /** Earth's turn in the lens (degrees). */
  spin?: number;
}

/** Compose a full frame into one canvas (the headless previews; the scene layers these parts itself). */
export function renderSystemFrame(pc: PixelCanvas, L: SysLayout, f: SystemFrame): { hits: Hit[] } {
  paintSystemSky(pc);
  const memo = new Map<string, PixelCanvas>();
  const sinkOf = (back: PixelCanvas, front: PixelCanvas): FxSink => ({
    px: (x, y, c, fr) => (fr ? front : back).set(x, y, c),
    spr: (key, make, x, y, fr) => {
      let s = memo.get(key);
      if (!s) memo.set(key, (s = make()));
      (fr ? front : back).blit(s, x, y);
    },
  });
  const cine = f.cine ?? null;
  let cam = f.cam;
  let near: Near | null = null;
  const tE = f.t;
  const ePos = polar(1, earthAngle(f.day, tE));
  if (cine !== null) {
    const c = cinematicCam(L, ePos, cine, f.cam.rot);
    cam = c.cam;
    if (c.R > 0) {
      const P = makeProj(L, cam);
      const [ex, ey] = P(...ePos);
      near = { x: ex, y: ey, R: c.R, er: c.er, rot: cam.rot, tilt: nearTilt(cam.tilt), sunPhi: sunPhiAt(L, cam, f.day, tE), spin: f.spin ?? 30 };
    }
  }
  const stat = new PixelCanvas(L.w, L.h);
  const v = f.view;
  const hoverAst = f.opts?.hover ? v.asteroids.find((a) => a.id === f.opts!.hover) : null;
  paintSystemStatic(stat, L, cam, { extra: hoverAst ? { a: hoverAst.def.au, c: hoverAst.ownerColor ? C[hoverAst.ownerColor] : C.ink6 } : null, mercury: v.mercury });
  pc.blit(stat, 0, 0);
  const back = new PixelCanvas(L.w, L.h);
  const front = new PixelCanvas(L.w, L.h);
  const showLens = cine === null;
  const res = systemFx(sinkOf(back, front), L, cam, f, { ...f.opts, cine, hideEarth: !!near, lens: showLens ? L.lens : null }, systemTwinklers(L));
  pc.blit(back, 0, 0);
  const rs = sunRadius(cam.scale);
  const [sx, sy] = makeProj(L, cam)(0, 0);
  const sun = sunCanvas(rs, Math.floor(f.t * 0.6) % 3, v.storm !== null);
  pc.blit(sun, Math.round(sx - sun.w / 2), Math.round(sy - sun.h / 2));
  pc.blit(front, 0, 0);
  const hits = [...res.hits];
  const nearIn: NearInput = { view: v, habitats: f.habitats, t: f.t, inbound: inboundDirs(L, cam, v, f.day, f.t) };
  if (near) {
    const layer = new PixelCanvas(L.w, L.h);
    paintNear(layer, near, { terrain: f.terrain });
    pc.blit(layer, 0, 0);
    const nf = new PixelCanvas(L.w, L.h);
    nearFx(sinkOf(nf, nf), near, nearIn, { still: f.opts?.still, hover: f.opts?.hover });
    pc.blit(nf, 0, 0);
  }
  if (showLens) {
    const g = lensNear(L, cam, sunPhiAt(L, cam, f.day, f.t), f.spin ?? 30);
    const size = L.lens.r * 2 + 6;
    const lc = new PixelCanvas(size, size + 6);
    const ox = g.x - Math.floor(size / 2);
    const oy = g.y - Math.floor(size / 2) - 6;
    paintNear(lc, { ...g, x: g.x - ox, y: g.y - oy }, { terrain: f.terrain, lens: L.lens.r });
    pc.blit(lc, ox, oy);
    const lf = new PixelCanvas(L.w, L.h);
    hits.push(...nearFx(sinkOf(lf, lf), g, nearIn, { still: f.opts?.still, hover: f.opts?.hover, clip: L.lens.r - 1 }));
    pc.blit(lf, 0, 0);
  }
  const hv = f.opts?.hover ? hits.find((h) => h.id === f.opts!.hover) : null;
  for (const lb of [...res.labels, ...(hv ? [hoverLabel(L, hv)] : [])]) {
    const tmp = new PixelCanvas(measureText(lb.text) + 2, 7);
    drawText(tmp, lb.text, 1, 1, lb.color);
    tmp.outline(C.ink0, true);
    pc.blit(tmp, lb.x - 1, lb.y - 1);
  }
  return { hits };
}
