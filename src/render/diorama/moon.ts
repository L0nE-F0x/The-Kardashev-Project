/**
 * Act IV: Shackleton Base on the rim of Shackleton crater at the lunar south pole (site 'moon',
 * backdrop 'lunar'). The sky is black and full of stars, the sun skims the horizon (lunar "night"
 * comes when it slips behind the far peaks), and the Earth hangs low over the rim. The base grows
 * with `moonView(s).stage`: a surveyed site (Kip's scout lander, the Charter flag, rover tracks) →
 * the outpost (regolith-shielded domes, a greenhouse, a landing pad, solar masts on the rim, an
 * ice rig down in the permanently shadowed crater) → the mine (excavators, the helium-3 plant and
 * its tanks) → the mass driver, a magnetic rail throwing cargo capsules to orbit.
 *
 * No wind, rain, clouds or birds here (the scene skips them for the 'lunar' backdrop); dust kicked
 * up by the excavators falls straight back down. Pure PixelCanvas code with palette indices only.
 */
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import { drawGlobe } from '../globe';
import type { Emitter, FacilityArt, Mover } from './art';
import { beacon, CONCRETE, facadeShade, pipe, revealFrom, roundShade, scaffold, STEEL, type Ramp } from './draw';
import { billboard, CHARTER, crane, emblem, type Ramp4, siteCabins } from './act3kit';

// ════════════════════════════════════════ LIGHT & SKY ════════════════════════════════════════
const SYNODIC = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 86_400_000;

/** Lunar phase as seen from Earth: 0 = new moon … 0.5 = full … 1. */
export function lunarPhase(date: Date): number {
  const d = (date.getTime() - NEW_MOON_2000) / DAY_MS / SYNODIC;
  return ((d % 1) + 1) % 1;
}

export interface LunarSky {
  /** The sun's place across the view (0..1), or null when it is behind us or below the peaks. */
  sun: number | null;
  /** How dark the base is (the scene's night grading): ~0 in sunlight, high when the sun is behind the rim. */
  dark: number;
  phase: 'day' | 'low' | 'night';
  /** For the Earth disc: the sub-lunar point (view centre) and the subsolar point. */
  earth: { lon0: number; lat0: number };
}

/**
 * The light at the pole over a synodic month: the sun circles the horizon, crossing our view for
 * the first third, lighting the base from behind us for a while, then slipping behind the far
 * peaks for about a quarter of the month (the base's lights come on). `cycle` false = always day.
 */
export function lunarSky(date: Date, subsolarLon: number, cycle = true): LunarSky {
  const u = cycle ? lunarPhase(date) : 0.16;
  const days = (date.getTime() - NEW_MOON_2000) / DAY_MS;
  let phase: LunarSky['phase'] = 'day';
  let dark = 0.04;
  if (u >= 0.72 && u < 0.75) ((phase = 'low'), (dark = 0.34));
  else if (u >= 0.75 && u < 0.975) ((phase = 'night'), (dark = 0.74));
  else if (u >= 0.975) ((phase = 'low'), (dark = 0.34));
  const sun = u < 0.36 ? 0.02 + (u / 0.36) * 0.5 : null;
  // the sub-lunar point trails the subsolar point by the moon's elongation; its latitude swings
  // with the moon's declination over a tropical month
  const lon0 = subsolarLon + u * 360;
  const lat0 = 24 * Math.sin((days / 27.321582) * Math.PI * 2);
  return { sun, dark, phase, earth: { lon0: ((lon0 + 540) % 360) - 180, lat0 } };
}

/** The low lunar sun: a hard white disc with a thin glare ring (no atmosphere to soften it). */
export function lunarSunArt(): PixelCanvas {
  const pc = new PixelCanvas(17, 17);
  for (let y = 0; y < 17; y++) {
    for (let x = 0; x < 17; x++) {
      const d = Math.hypot(x - 8, y - 8);
      if (d <= 4.6) pc.set(x, y, d < 3 ? C.white : C.yel2);
      else if (d < 8.2 && (x === 8 || y === 8) && bayer(x, y) < 10 - d) pc.set(x, y, C.yel1);
      else if (d < 6.2 && bayer(x, y) < 3) pc.set(x, y, C.yel1);
    }
  }
  return pc;
}

/**
 * The Earth from the Moon: a small disc with real day and night (its phase is the Moon's turned
 * inside out). With the world terrain it is the game's own globe; without it (headless tests),
 * a procedural blue marble.
 */
export function earthDisc(r: number, view: { lon0: number; lat0: number }, sun: { lat: number; lon: number }, terrain?: { pc: PixelCanvas; res: number }): PixelCanvas {
  const S = r * 2 + 5;
  const pc = new PixelCanvas(S, S);
  const cx = S / 2;
  const cy = S / 2;
  if (terrain) {
    drawGlobe(pc, { terrain: terrain.pc, res: terrain.res, lon0: view.lon0, lat0: view.lat0, cx, cy, r, sun, lights: true, atmosphere: true, smooth: true });
    return pc;
  }
  const RAD = Math.PI / 180;
  const p0 = view.lat0 * RAD;
  const sd = Math.sin(sun.lat * RAD);
  const cd = Math.cos(sun.lat * RAD);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5 - cx) / r;
      const v = (cy - (y + 0.5)) / r;
      const rho2 = u * u + v * v;
      if (rho2 > 1) {
        if (rho2 < (1 + 1.4 / r) ** 2) pc.set(x, y, C.cyn4);
        continue;
      }
      const z = Math.sqrt(1 - rho2);
      const lat = Math.asin(v * Math.cos(p0) + z * Math.sin(p0)) / RAD;
      const lon = view.lon0 + Math.atan2(u, z * Math.cos(p0) - v * Math.sin(p0)) / RAD;
      const land = fbm(lon / 38 + 7, lat / 30, 11, 3) > 0.56;
      const cloud = fbm(lon / 22, lat / 14 + 3, 29, 3) > 0.6;
      let c = Math.abs(lat) > 70 ? C.ice3 : land ? (Math.abs(lat) < 22 ? C.grn4 : lat > 35 ? C.grn3 : C.snd5) : C.sea4;
      if (cloud) c = C.white;
      const s = Math.sin(lat * RAD) * sd + Math.cos(lat * RAD) * cd * Math.cos((lon - sun.lon) * RAD);
      if (s < -0.1) c = land && !cloud && hash2(Math.round(lon), Math.round(lat), 3) > 0.86 ? C.yel1 : cloud ? C.ink3 : land ? C.grn0 : C.sea0;
      else if (s < 0.06 && bayer(x, y) < ((s + 0.1) / 0.16) * 16) c = cloud ? C.ink6 : land ? C.grn1 : C.sea2;
      pc.set(x, y, c);
    }
  }
  return pc;
}

/** Stars across the whole black sky (the Moon has no air to hide them). */
export function lunarStars(w: number, h: number, seed = 51): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const n = Math.round((w * h) / 260);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2(i, 1, seed) * w);
    const y = Math.floor(hash2(i, 2, seed) * h);
    const r = hash2(i, 3, seed);
    pc.set(x, y, r > 0.94 ? C.yel2 : r > 0.75 ? C.white : r > 0.4 ? C.ice2 : C.ink6);
    if (r > 0.985) {
      pc.set(x + 1, y, C.ink6);
      pc.set(x - 1, y, C.ink6);
      pc.set(x, y + 1, C.ink6);
      pc.set(x, y - 1, C.ink6);
    }
  }
  // a faint band of the Milky Way
  for (let x = 0; x < w; x++) {
    const cy = h * 0.28 + Math.sin(x / 90 + seed) * h * 0.08;
    for (let k = 0; k < 3; k++) {
      const y = Math.round(cy + (hash2(x, k, seed + 7) - 0.5) * h * 0.18);
      if (hash2(x, k, seed + 8) < 0.22 && !pc.get(x, y)) pc.set(x, y, C.ink4);
    }
  }
  return pc;
}

// ════════════════════════════════════════ GROUND & BANDS ════════════════════════════════════════
/** Regolith colours: lit crest, base, speckle. */
export const REGOLITH = { a: C.ink7, b: C.ink6, c: C.ink8 };
const SHELL: Ramp = { hi: C.ink9, lit: C.ink8, mid: C.ink7, shade: C.ink6, dark: C.ink5 };

/** The bottom three rows of a Moon piece (matches the top of the ground strip). */
export function moonGround(pc: PixelCanvas, W: number, H: number) {
  for (let y = H - 3; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = y === H - 3 ? (hash2(x, 3, 71) < 0.3 ? C.ink7 : C.ink8) : bayer(x, y) < 5 ? C.ink6 : C.ink7;
      pc.set(x, y, c);
    }
  }
}

/** A crater on a flat surface, seen at a low angle: lit from the left, so its left inner wall is in shadow. */
function crater(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, lit = C.ink8, mid = C.ink6, dark = C.ink4) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.hypot(nx, ny);
      if (d <= 1) {
        const c = nx < -0.15 + ny * 0.2 ? dark : nx > 0.7 ? lit : mid;
        pc.set(x, y, c === dark && ditherAt(x, y, (nx + 0.6) * 1.4) ? mid : c);
      } else if (d <= 1.3) {
        // the raised rim: its outer slope on the left catches the sun
        if (nx < -0.3 && ny < 0.6) pc.set(x, y, lit);
        else if (nx > 0.4 && ny > -0.2 && bayer(x, y) < 8) pc.set(x, y, dark);
      }
    }
  }
}

const LUNAR_RAMP = [C.ink1, C.ink2, C.ink3, C.ink4, C.ink5, C.ink6, C.ink7, C.ink8, C.ink9];

/** Regolith lit by how squarely it faces the low sun: b 0 (turned away) … 1 (full on), mapped onto ramp steps lo..hi. */
function sunlit(x: number, y: number, b: number, lo: number, hi: number): number {
  const t = Math.max(0, Math.min(1, b)) * (hi - lo) + lo;
  const i = Math.floor(t);
  return LUNAR_RAMP[Math.min(hi, ditherAt(x, y, t - i) ? i + 1 : i)];
}

/**
 * Brightness along a silhouette lit from the left by a sun a few degrees up: faces rising to the
 * right catch it, faces falling away go black, and every peak throws a long shadow to its right.
 */
function terrainLight(tops: number[], sunSlope: number, gain: number): number[] {
  const out: number[] = [];
  let shadow = Infinity;
  for (let x = 0; x < tops.length; x++) {
    const a = tops[Math.max(0, x - 2)];
    const b = tops[Math.min(tops.length - 1, x + 2)];
    const slope = (b - a) / 4;
    shadow = Math.min(shadow + sunSlope, tops[x]);
    const depth = tops[x] - shadow;
    let l = 0.5 - slope * gain;
    if (depth > 0.5) l = Math.min(l, 0.12 + Math.max(0, 0.25 - depth * 0.08));
    out.push(l);
  }
  return out;
}

/** Far crater-rim massifs: broad, smooth peaks, crisp in airless light (lit faces left, black shadows right). */
export function lunarFar(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const topAt = (x: number) => {
    const n = fbm(x / 120, seed, seed + 1, 3);
    const m = fbm(x / 36, seed + 4, seed, 2);
    const peak = Math.max(0, 1 - Math.abs(((x + seed * 37) % 520) - 260) / 110);
    return h * 0.7 - (n - 0.35) * h * 0.9 - (m - 0.5) * h * 0.16 - peak * peak * h * 0.22;
  };
  const tops = Array.from({ length: w }, (_, x) => Math.max(1, Math.min(h - 1, topAt(x))));
  const light = terrainLight(tops, 0.22, 1.6);
  for (let x = 0; x < w; x++) {
    const t = Math.round(tops[x]);
    for (let y = t; y < h; y++) {
      const dy = y - t;
      // the crest catches a rim of light; lower down the slope dims a little
      let c = sunlit(x, y, light[x] - dy * 0.006, 1, 6);
      if (dy === 0 && light[x] > 0.3) c = light[x] > 0.75 ? C.ink8 : C.ink7;
      pc.set(x, y, c);
    }
  }
  // the peaks of eternal light: the highest crests catch the sun all month
  for (let x = 2; x < w - 2; x++) {
    const t = Math.round(tops[x]);
    if (tops[x] < h * 0.3 && tops[x - 1] >= tops[x] && tops[x + 1] >= tops[x]) {
      pc.set(x, t, C.white);
      pc.set(x - 1, t, C.ink9);
    }
  }
  return pc;
}

/** The crater plain in the middle distance: rolling regolith, craters, boulders with long shadows. */
export function lunarMid(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const surfF = (x: number) => h * 0.42 + (fbm(x / 70, seed + 5, seed) - 0.5) * h * 0.4 + (fbm(x / 23, seed + 9, 2) - 0.5) * h * 0.05;
  const tops = Array.from({ length: w }, (_, x) => surfF(x));
  const surf = (x: number) => Math.round(tops[Math.max(0, Math.min(w - 1, x))]);
  const light = terrainLight(tops, 0.1, 1.5);
  for (let x = 0; x < w; x++) {
    const t = surf(x);
    for (let y = t; y < h; y++) {
      const dy = y - t;
      let c = sunlit(x, y, light[x] * (dy < 4 ? 1 : 0.85) + 0.08, 3, 7);
      if (dy === 0) c = light[x] > 0.35 ? C.ink8 : C.ink5;
      pc.set(x, y, c);
    }
  }
  for (let i = 0; i < w / 22; i++) {
    const cx = hash2(i, seed, 2) * w;
    const base = surf(Math.round(cx));
    const cy = base + 3 + hash2(i, seed, 3) * (h - base - 4);
    const rx = 2.5 + hash2(i, seed, 4) * 8 * ((cy - base) / h + 0.4);
    crater(pc, cx, cy, rx, Math.max(0.8, rx * 0.24), C.ink8, C.ink6, C.ink3);
  }
  // boulders, each dragging a long shadow away from the low sun
  for (let i = 0; i < w / 16; i++) {
    const x = Math.round(hash2(i, seed, 6) * w);
    const t = surf(x);
    const y = t + 1 + Math.floor(hash2(i, seed, 7) * (h - t - 2));
    const s = hash2(i, seed, 8) > 0.7 ? 2 : 1;
    pc.hline(x + s, y, 3 + Math.floor(hash2(i, seed, 9) * 7), C.ink3);
    pc.rect(x, y - s + 1, s, s, C.ink8);
    if (s > 1) pc.set(x + 1, y, C.ink5);
  }
  return pc;
}

/** The ground strip: regolith with rover tracks, a trail of boot prints, small craters and pebbles. */
export function lunarGround(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number;
      if (y < 2) c = (x + y) % 3 === 0 ? C.ink8 : C.ink7;
      else c = bayer(x, y) < 5 + (y > 20 ? 3 : 0) ? C.ink6 : C.ink7;
      pc.set(x, y, c);
    }
  }
  for (let i = 0; i < w / 34; i++) {
    const cx = hash2(i, 5, 81) * w;
    const cy = 4 + hash2(i, 6, 81) * (h - 8);
    const rx = 2.5 + hash2(i, 7, 81) * (4 + cy / 3);
    if (Math.abs(cy - 14.5) < 3) continue; // keep the rover road clear
    crater(pc, cx, cy, rx, Math.max(1, rx * 0.28));
  }
  // rover tracks (two wheel lines, tread marks) and boot prints
  for (let x = 0; x < w; x++) {
    for (const y of [13, 16]) {
      pc.set(x, y, (x + y) % 3 === 0 ? C.ink6 : C.ink5);
      if (x % 3 === 0) pc.set(x, y + 1, C.ink6);
    }
  }
  for (let x = 3; x < w; x += 5 + Math.floor(hash2(x, 2, 82) * 3)) {
    pc.set(x, 8 + (x % 2), C.ink5);
    pc.set(x + 1, 8 + (x % 2), C.ink5);
  }
  for (let i = 0; i < w / 6; i++) {
    const x = Math.floor(hash2(i, 1, 83) * w);
    const y = 3 + Math.floor(hash2(i, 2, 83) * (h - 5));
    if (y >= 12 && y <= 17) continue;
    pc.set(x, y, C.ink8);
    pc.hline(x + 1, y, 1 + Math.floor(hash2(i, 3, 83) * 3), C.ink4);
  }
  return pc;
}

/** The foreground lip: dark boulders, lit on their sunward shoulders. */
export function lunarFg(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(4 + (fbm(x / 11, 91) - 0.5) * 5);
    for (let y = top; y < h; y++) pc.set(x, y, y === top ? C.ink4 : y - top < 2 ? C.ink3 : C.ink1);
  }
  for (let i = 0; i < w / 21; i++) {
    const cx = hash2(i, 1, 92) * w;
    const r = 2 + hash2(i, 2, 92) * 3.5;
    const cy = h - 3 - r * 0.4;
    for (let y = Math.floor(cy - r); y < h; y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = (x + 0.5 - cx) / (r + 1);
        const dy = (y + 0.5 - cy) / r;
        if (dx * dx + dy * dy > 1) continue;
        const l = -dx * 0.8 - dy * 0.6;
        pc.set(x, y, l > 0.55 ? C.ink6 : l > 0.1 ? C.ink4 : l > -0.4 ? C.ink3 : C.ink2);
      }
    }
  }
  return pc;
}

/**
 * The back band behind the base: low rises on the rim with more solar masts (red beacons that
 * blink in step) and, once the mine is running, the lights of distant workings.
 */
export function lunarBack(stage: number, w: number, h: number, seed: number): { base: PixelCanvas; glow: PixelCanvas[] } {
  const pc = new PixelCanvas(w, h);
  const on = new PixelCanvas(w, h);
  const off = new PixelCanvas(w, h);
  let x = 20 + Math.floor(hash2(seed, 1, 1) * 40);
  let i = 0;
  while (x < w - 20) {
    const rw = 36 + Math.floor(hash2(i, seed, 2) * 50);
    const rh = 6 + Math.floor(hash2(i, seed, 3) * 9);
    for (let k = 0; k < rw; k++) {
      const t = k / rw;
      const top = Math.round(h - 1 - Math.sin(t * Math.PI) ** 0.7 * rh);
      for (let y = top; y < h; y++) pc.set(x + k, y, y === top ? (t < 0.5 ? C.ink7 : C.ink5) : t < 0.45 ? (ditherAt(x + k, y, 0.4) ? C.ink5 : C.ink6) : ditherAt(x + k, y, 0.4) ? C.ink3 : C.ink4);
    }
    // solar masts on the crest
    const n = 1 + Math.floor(hash2(i, seed, 4) * 3);
    for (let m = 0; m < n; m++) {
      const mx = x + Math.round(rw * (0.3 + (m / Math.max(1, n)) * 0.45));
      const top = Math.round(h - 1 - rh) - 14 - Math.floor(hash2(m, i, seed) * 10);
      pc.vline(mx, top, h - top - rh + 2, C.ink7);
      pc.rect(mx - 1, top + 2, 3, 10, C.blu2);
      pc.vline(mx - 1, top + 2, 10, C.blu3);
      on.set(mx, top - 1, C.red3);
      pc.set(mx, top - 1, C.red1);
    }
    if (stage >= 2 && hash2(i, seed, 5) > 0.45) {
      // a distant working: a few lit windows and a floodlight
      const wx = x + rw + 6;
      pc.rect(wx, h - 6, 10, 5, C.ink6);
      pc.hline(wx, h - 6, 10, C.ink8);
      for (const k of [1, 4, 7]) {
        on.set(wx + k, h - 4, C.yel1);
        off.set(wx + k, h - 4, C.yel1);
      }
    }
    x += rw + 30 + Math.floor(hash2(i, seed, 6) * 70);
    i++;
  }
  return { base: pc, glow: [on, off] };
}

// ════════════════════════════════════════ PEOPLE, FLAGS, ROVERS ════════════════════════════════════════
const SUIT_ACCENTS = [C.blu4, C.org1, C.cyn4, C.red3, C.yel0, C.grn5, C.vio4];

/** An astronaut in a white suit with a gold visor (3×7, facing right), feet on footY. */
export function astronaut(pc: PixelCanvas, x: number, footY: number, seed: number, pose = 0) {
  const acc = SUIT_ACCENTS[Math.floor(hash2(seed, 1, 13) * SUIT_ACCENTS.length)];
  const y = footY - 7;
  pc.set(x + 1, y, C.white);
  pc.set(x, y + 1, C.white);
  pc.set(x + 1, y + 1, C.yel0);
  pc.set(x, y + 2, C.ink6);
  pc.set(x + 1, y + 2, C.white);
  pc.set(x + 2, y + 2, pose === 1 ? C.ink0 : C.ink9);
  pc.set(x, y + 3, C.ink6);
  pc.set(x + 1, y + 3, acc);
  pc.set(x + 2, y + 3, C.ink8);
  if (pose === 1) pc.set(x + 3, y + 1, C.ink9); // waving
  pc.set(x + 1, y + 4, C.ink9);
  pc.set(x, y + 5, C.ink9);
  pc.set(x + 2, y + 5, C.ink8);
  pc.set(x, y + 6, C.ink5);
  pc.set(x + 2, y + 6, C.ink5);
}

/** Walker frames on the Moon: an astronaut bounding along (two frames, 3×7, facing right). */
export function astronautFrames(variant: number): PixelCanvas[] {
  const acc = SUIT_ACCENTS[variant % SUIT_ACCENTS.length];
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(3, 7);
    pc.set(1, 0, C.white);
    pc.set(0, 1, C.white);
    pc.set(1, 1, variant % 3 === 0 ? C.org1 : C.yel0);
    pc.set(0, 2, C.ink6);
    pc.set(1, 2, C.white);
    pc.set(2, 2, C.ink9);
    pc.set(0, 3, C.ink6);
    pc.set(1, 3, acc);
    pc.set(2, 3, C.ink8);
    pc.set(1, 4, C.ink9);
    if (f === 0) {
      pc.set(0, 5, C.ink9);
      pc.set(2, 5, C.ink8);
      pc.set(0, 6, C.ink5);
      pc.set(2, 6, C.ink5);
    } else {
      pc.set(1, 5, C.ink9);
      pc.set(2, 6, C.ink5);
    }
    return pc;
  });
}

/** The Moon's delivery truck: a pressurised rover with a solar roof and three big wheels (20×9). */
export function moonRoverArt(accent: number = C.blu4): PixelCanvas {
  const pc = new PixelCanvas(20, 9);
  pc.vline(4, 0, 2, C.ink7);
  pc.set(4, 0, C.red3);
  pc.hline(2, 2, 12, C.ink4);
  pc.hline(3, 1, 10, C.blu3);
  pc.set(5, 1, C.sky4);
  pc.set(9, 1, C.sky4);
  pc.rect(1, 3, 16, 3, C.white);
  pc.hline(1, 5, 16, C.ink8);
  pc.hline(1, 4, 11, accent);
  pc.rect(14, 3, 3, 2, C.ink1);
  pc.set(15, 3, C.cyn4);
  pc.rect(17, 4, 2, 2, C.ink8);
  for (const wx of [2, 8, 14]) {
    pc.rect(wx, 6, 3, 3, C.ink3);
    pc.set(wx + 1, 7, C.ink6);
  }
  return pc;
}

/** The Charter flag on the Moon: a stiff top bar holds it out (there's no wind). */
export function moonFlag(pc: PixelCanvas, g: PixelCanvas | null, x: number, baseY: number, h: number, field = CHARTER.field) {
  pc.vline(x, baseY - h, h, C.ink8);
  pc.hline(x, baseY - h, 12, C.ink8);
  pc.rect(x + 1, baseY - h + 1, 11, 7, field);
  emblem(pc, g, x + 2, baseY - h + 1);
  for (let i = 0; i < 11; i++) if ((i + 1) % 4 === 0) pc.set(x + 1 + i, baseY - h + 7, CHARTER.fieldDark);
  pc.set(x, baseY - h - 1, C.ink9);
}

/** Kip's scout lander: gold-foil descent stage, white instrument deck, a dish and a solar wing (≈26×30). */
export function scoutLander(pc: PixelCanvas, g: PixelCanvas | null, x: number, baseY: number) {
  // legs (the back one darker)
  pc.line(x + 13, baseY - 11, x + 13, baseY - 2, C.ink5);
  pc.line(x + 6, baseY - 11, x + 1, baseY - 2, C.ink8);
  pc.line(x + 20, baseY - 11, x + 25, baseY - 2, C.ink6);
  pc.hline(x, baseY - 1, 3, C.ink7);
  pc.hline(x + 24, baseY - 1, 3, C.ink6);
  pc.hline(x + 12, baseY - 1, 3, C.ink5);
  // descent stage in crinkled gold foil
  for (let y = baseY - 19; y < baseY - 10; y++) {
    for (let xx = x + 4; xx < x + 23; xx++) {
      const t = (xx - (x + 4)) / 19;
      let c = t < 0.25 ? C.yel1 : t < 0.65 ? C.yel0 : t < 0.9 ? C.org1 : C.snd4;
      if (hash2(xx, y, 17) > 0.8) c = c === C.yel1 ? C.yel0 : c === C.yel0 ? C.org1 : C.snd4;
      pc.set(xx, y, c);
    }
  }
  pc.rect(x + 11, baseY - 10, 5, 2, C.ink4);
  pc.set(x + 13, baseY - 8, C.ink3);
  // the instrument deck
  for (let y = baseY - 29; y < baseY - 19; y++) for (let xx = x + 7; xx < x + 20; xx++) pc.set(xx, y, roundShade(CONCRETE, xx + 0.5 - (x + 13.5), 6.5, xx, y));
  pc.hline(x + 7, baseY - 24, 13, CHARTER.field);
  pc.rect(x + 9, baseY - 27, 3, 2, C.ink1);
  pc.set(x + 10, baseY - 27, C.cyn4);
  g?.set(x + 10, baseY - 27, C.cyn5);
  // solar wing and the dish
  pc.rect(x - 3, baseY - 26, 10, 4, C.blu2);
  for (let k = 0; k < 10; k += 3) pc.vline(x - 3 + k, baseY - 26, 4, C.blu3);
  pc.set(x - 2, baseY - 26, C.sky4);
  pc.vline(x + 18, baseY - 34, 5, C.ink7);
  pc.line(x + 15, baseY - 36, x + 21, baseY - 33, C.white);
  pc.line(x + 15, baseY - 35, x + 20, baseY - 32, C.ink8);
  pc.set(x + 18, baseY - 37, C.red3);
  g?.set(x + 18, baseY - 37, C.red3);
}

/** A little survey rover with a mast camera (12×8). */
function surveyRover(pc: PixelCanvas, x: number, baseY: number) {
  pc.vline(x + 9, baseY - 9, 4, C.ink7);
  pc.rect(x + 8, baseY - 10, 3, 2, C.ink8);
  pc.set(x + 10, baseY - 10, C.ink1);
  pc.rect(x, baseY - 6, 12, 3, C.white);
  pc.hline(x, baseY - 7, 11, C.blu3);
  pc.set(x + 2, baseY - 7, C.sky4);
  pc.hline(x, baseY - 4, 12, C.ink8);
  for (const wx of [1, 5, 9]) {
    pc.rect(wx + x, baseY - 3, 2, 2, C.ink3);
  }
}

/** Survey beacons: metal stakes with lights (and the odd retroreflector). */
function moonStakes(pc: PixelCanvas, g: PixelCanvas, x: number, baseY: number, w: number, seed: number) {
  const n = Math.max(2, Math.round(w / 38));
  for (let k = 0; k <= n; k++) {
    const sx = x + Math.round((k / n) * (w - 2));
    pc.vline(sx, baseY - 7, 6, C.ink8);
    pc.set(sx + 1, baseY - 7, C.ink6);
    const col = k % 2 ? C.red3 : C.cyn5;
    pc.set(sx, baseY - 8, col);
    g.set(sx, baseY - 8, col);
  }
  for (let i = 9; i < w - 6; i += 17 + Math.floor(hash2(i, seed, 3) * 13)) {
    if (hash2(i, seed, 4) > 0.5) {
      // a retroreflector panel
      pc.rect(x + i, baseY - 3, 4, 2, C.ink4);
      pc.hline(x + i, baseY - 3, 4, C.ink8);
    } else pc.set(x + i, baseY - 2, C.ink5);
  }
}

// ════════════════════════════════════════ BASE PIECES ════════════════════════════════════════
/**
 * Surveyed ground. 'board': the stage-0 site (the Charter's board, the scout lander, the flag, a rover
 * at the end of its tracks, survey beacons). 'monument': once the base stands, the first landing
 * kept as it was. Otherwise: open, staked-out ground for the next stage.
 */
export function moonSurvey(w: number, variant: string, seed = 0): FacilityArt {
  const tall = variant === 'board' || variant === 'monument';
  const H = tall ? 60 : 18;
  const W = Math.max(40, w);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const base = H - 3;
    if (variant === 'board') {
      const bw = billboard(pc, g, 6, base, 'SHACKLETON', 'SURVEY SITE', 6);
      const lx = bw + 18;
      scoutLander(pc, g, lx, base);
      moonFlag(pc, g, lx + 34, base, 26);
      astronaut(pc, lx + 48, base, 7 + seed, 1);
      // the rover at the end of its tracks
      const rx = Math.min(W - 18, lx + 110);
      for (let x = lx + 28; x < rx; x++) {
        pc.set(x, base + 1, (x + f) % 3 === 0 ? C.ink6 : C.ink5);
        if (x % 2) pc.set(x, base + 2, C.ink5);
      }
      surveyRover(pc, rx, base);
      moonStakes(pc, g, rx + 20, base, Math.max(20, W - rx - 22), 3 + seed);
      moonStakes(pc, g, lx + 60, base, Math.max(20, rx - lx - 70), 5 + seed);
      // a lidar scanner on a tripod
      const tx = lx + 70;
      pc.line(tx, base - 1, tx + 3, base - 8, C.ink7);
      pc.line(tx + 6, base - 1, tx + 3, base - 8, C.ink7);
      pc.rect(tx + 2, base - 11, 3, 3, C.ink8);
      pc.set(tx + 4, base - 10, f === 0 ? C.red3 : C.red1);
      if (f === 0) g.set(tx + 4, base - 10, C.red3);
    } else if (variant === 'monument') {
      // the first landing, roped off with a plaque
      scoutLander(pc, g, 8, base);
      moonFlag(pc, g, 42, base, 26);
      for (let x = 2; x < W - 4; x++) if (x % 9 === 0) pc.vline(x, base - 4, 4, C.ink8);
      for (let x = 2; x < W - 4; x++) pc.set(x, base - 4 + (x % 9 === 0 ? 0 : 1), C.yel0);
      const t = 'FIRST LANDING';
      const tw = measureText(t);
      const px = Math.min(W - tw - 6, 58);
      pc.rect(px - 1, base - 18, tw + 6, 9, C.ink2);
      pc.box(px - 1, base - 18, tw + 6, 9, C.org1);
      drawText(pc, t, px + 2, base - 16, C.yel1);
      drawText(g, t, px + 2, base - 16, C.yel0);
      pc.vline(px + 3, base - 9, 6, C.ink7);
      pc.vline(px + tw - 1, base - 9, 6, C.ink7);
    } else {
      moonStakes(pc, g, 4, base, W - 8, 11 + seed);
    }
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

/** A regolith-shielded dome printed in layers (half-ellipse rx × ry on baseY). */
function printedDome(pc: PixelCanvas, cx: number, baseY: number, rx: number, ry: number) {
  for (let y = Math.floor(baseY - ry); y < baseY; y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (baseY - (y + 0.5)) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const l = -dx * 0.85 + dy * 0.35;
      let c = l > 0.55 ? SHELL.hi : l > 0.15 ? SHELL.lit : l > -0.3 ? SHELL.mid : l > -0.6 ? SHELL.shade : SHELL.dark;
      if (l > 0.15 && l <= 0.55 && ditherAt(x, y, (l - 0.15) * 2.2)) c = SHELL.hi;
      if (l <= -0.3 && l > -0.6 && ditherAt(x, y, (-0.3 - l) * 3)) c = SHELL.dark;
      // the print layers
      if ((Math.round(baseY) - y) % 3 === 0) c = c === SHELL.hi ? SHELL.lit : c === SHELL.lit ? SHELL.mid : c === SHELL.mid ? SHELL.shade : SHELL.dark;
      pc.set(x, y, c);
    }
  }
}

export const HAB_W = 176;
const HAB_H = 64;

/** The outpost's habitats: printed regolith domes joined by a tube, a greenhouse, radiators, a dish. */
export function moonHab(r: Ramp4): FacilityArt {
  const W = HAB_W;
  const H = HAB_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // radiator fins, edge-on to the sun
    for (let k = 0; k < 4; k++) {
      const rx = 3 + k * 5;
      pc.rect(rx, base - 30 + k * 2, 3, 28 - k * 2, C.white);
      pc.vline(rx + 2, base - 30 + k * 2, 28 - k * 2, C.ink8);
      for (let y = base - 28 + k * 2; y < base - 2; y += 4) pc.set(rx + 1, y, C.ink9);
    }
    pc.hline(2, base - 2, 22, C.ink6);
    // the big dome and the small one, joined by a tube
    const ax = 52;
    printedDome(pc, ax, base, 27, 30);
    const bx = 104;
    pc.rect(ax + 18, base - 11, bx - ax - 26, 8, C.ink8);
    pc.hline(ax + 18, base - 11, bx - ax - 26, C.white);
    pc.hline(ax + 18, base - 4, bx - ax - 26, C.ink6);
    for (let x = ax + 20; x < bx - 10; x += 5) pc.vline(x, base - 11, 8, C.ink7);
    printedDome(pc, bx, base, 18, 20);
    // portholes and a sign on the big dome
    for (const [px, py] of [[ax - 16, base - 9], [ax - 8, base - 12], [ax + 1, base - 12], [ax + 9, base - 10], [bx - 8, base - 8], [bx + 2, base - 9]] as [number, number][]) {
      pc.rect(px, py, 3, 3, C.ink2);
      pc.set(px, py, C.ink4);
      g.rect(px, py, 3, 3, hash2(px, py, 3) > 0.3 ? C.yel1 : C.yel0);
    }
    const sign = 'SHACKLETON';
    const sw = measureText(sign) + 4;
    pc.rect(ax - Math.floor(sw / 2), base - 22, sw, 7, C.ink1);
    drawText(pc, sign, ax - Math.floor(sw / 2) + 2, base - 21, C.cyn5);
    drawText(g, sign, ax - Math.floor(sw / 2) + 2, base - 21, C.cyn5);
    // the airlock on the small dome
    pc.rect(bx + 14, base - 10, 9, 10, C.ink8);
    pc.hline(bx + 14, base - 10, 9, C.white);
    pc.vline(bx + 22, base - 10, 10, C.ink6);
    pc.rect(bx + 16, base - 8, 4, 8, C.ink5);
    pc.set(bx + 17, base - 7, C.cyn4);
    g.set(bx + 17, base - 7, C.cyn5);
    pc.hline(bx + 14, base - 11, 9, r.base);
    // the greenhouse: a glass dome full of green under pink grow lights
    const gx = 140;
    const gr = 13;
    for (let y = base - gr; y < base; y++) {
      for (let x = gx - gr; x <= gx + gr; x++) {
        const dx = x + 0.5 - gx;
        const dy = base - (y + 0.5);
        const d = Math.hypot(dx, dy * 1.05);
        if (d > gr) continue;
        let c = d > gr - 1.2 ? C.ink7 : dy > gr * 0.55 && dx < 0 && bayer(x, y) < 4 ? C.ink5 : C.ink3;
        if (d <= gr - 1.2) {
          const leaf = hash2(x >> 1, y >> 1, 21);
          if (dy < 8 && leaf > 0.3) c = leaf > 0.8 ? C.grn6 : leaf > 0.55 ? C.grn4 : C.grn3;
          if (dy >= 8 && (x + y) % 7 === 0) c = C.blu2;
          if (bayer(x, y) === 0 && dy > 3) {
            c = (x + y) % 2 ? C.pnk0 : C.vio3;
            g.set(x, y, (x + y) % 2 ? C.pnk1 : C.vio4);
          } else if (c !== C.ink6 && bayer(x, y) < 3) g.set(x, y, C.vio2);
        }
        // geodesic struts
        if (d <= gr - 1.2 && ((Math.round(dx + dy) % 6 === 0) || (Math.round(dx - dy) % 6 === 0))) c = C.ink5;
        pc.set(x, y, c);
      }
    }
    pc.set(gx - 5, base - gr + 3, C.white);
    pc.set(gx - 6, base - gr + 4, C.ice2);
    // the comms mast with its dish aimed at the Earth
    const mx = 163;
    for (let y = base - 44; y < base; y++) {
      pc.set(mx - 1, y, C.ink7);
      pc.set(mx + 1, y, C.ink6);
      if (y % 4 === 0) pc.set(mx, y, C.ink7);
    }
    for (let k = -6; k <= 6; k++) {
      const x = mx + 2 + k;
      const y = base - 48 - Math.round(k * 0.45);
      pc.set(x, y, C.white);
      pc.set(x + 1, y + 1, Math.abs(k) < 5 ? C.ink8 : C.ink6);
    }
    pc.line(mx, base - 44, mx + 4, base - 50, C.ink7);
    beacon(pc, g, mx, base - 46, f === 0);
    moonFlag(pc, g, bx + 26, base, 22);
    astronaut(pc, bx + 40, base, 21, f);
    beacon(pc, g, ax, base - 31, f === 1);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [120, H] }, fps: 1, sync: true };
}

export const PAD_W = 134;
const PAD_H = 92;

/** The landing pad: a fused-regolith slab behind a blast berm, a tall crew lander standing on it. */
export function moonPad(r: Ramp4): FacilityArt {
  const W = PAD_W;
  const H = PAD_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // blast berm on the base side
    for (let x = 0; x < 20; x++) {
      const top = base - Math.round(Math.sin((x / 20) * Math.PI) ** 0.6 * 10);
      for (let y = top; y < base; y++) pc.set(x, y, y === top ? C.ink8 : x < 10 ? (ditherAt(x, y, 0.3) ? C.ink6 : C.ink7) : ditherAt(x, y, 0.5) ? C.ink4 : C.ink5);
    }
    // the slab, with edge lights
    pc.rect(18, base - 4, W - 22, 4, C.ink4);
    pc.hline(18, base - 4, W - 22, C.ink6);
    for (let x = 18; x < W - 4; x++) if (bayer(x, base - 2) < 5) pc.set(x, base - 2, C.ink3);
    for (let x = 22; x < W - 6; x += 12) {
      const on = (x / 12 + f) % 2 < 1;
      pc.set(x, base - 4, on ? C.cyn5 : C.cyn2);
      g.set(x, base - 4, on ? C.cyn5 : C.cyn3);
    }
    drawText(pc, 'PAD A', 26, base - 3 + 0, C.ink7);
    // floodlight masts
    for (const [lx, top] of [[28, base - 40], [W - 12, base - 46]] as [number, number][]) {
      pc.vline(lx, top, base - 4 - top, C.ink7);
      pc.rect(lx - 2, top - 2, 5, 2, C.ink5);
      pc.rect(lx - 2, top - 2, 5, 1, C.yel1);
      g.rect(lx - 2, top - 2, 5, 2, C.yel2);
    }
    // the crew lander: a tall stainless body on splayed legs
    const cx = 74;
    const bw = 15;
    const half = bw / 2;
    const top = 6;
    const bottom = base - 12;
    for (let y = top; y < bottom; y++) {
      const k = y - top;
      const hw = k < 12 ? Math.max(1, Math.round(half * Math.sqrt(1 - ((12 - k) / 12) ** 2))) : Math.round(half);
      for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
        let c = roundShade(STEEL, x + 0.5 - cx, hw, x, y);
        if (y > bottom - 14) c = c === C.white ? C.ink9 : c;
        pc.set(x, y, c);
      }
    }
    // windows near the top, the livery band, landing thrusters, soot on the skirt
    for (let x = Math.round(cx - 5); x < cx + 5; x += 3) {
      pc.rect(x, top + 16, 2, 2, C.ink1);
      g.rect(x, top + 16, 2, 2, C.yel1);
    }
    for (let y = top + 24; y < top + 28; y++) for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) pc.set(x, y, roundShade({ hi: r.hi, lit: r.lit, mid: r.base, shade: r.mid, dark: r.dark }, x + 0.5 - cx, half, x, y));
    for (const tx of [cx - half - 1, cx + half]) {
      pc.rect(Math.round(tx), top + 34, 2, 4, C.ink4);
      pc.set(Math.round(tx), top + 38, C.ink3);
    }
    for (let y = bottom - 10; y < bottom; y++) for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) if (bayer(x, y) < (y - (bottom - 10)) * 1.4) pc.set(x, y, C.ink5);
    pc.rect(Math.round(cx - 3), bottom, 6, 2, C.ink3);
    // legs
    for (const [x0, x1] of [[cx - 6, cx - 15], [cx + 5, cx + 14]] as [number, number][]) {
      pc.line(x0, bottom - 8, x1, base - 5, C.ink7);
      pc.line(x0, bottom - 7, x1, base - 5, C.ink5);
      pc.hline(Math.min(x1, x1) - 2, base - 5, 5, C.ink8);
    }
    pc.line(cx, bottom - 4, cx, base - 5, C.ink4);
    // crew lift down to the pad, cargo on the slab
    pc.vline(Math.round(cx + half) + 3, top + 18, base - 5 - (top + 18), C.ink6);
    pc.rect(Math.round(cx + half) + 2, base - 12, 4, 2, C.ink8);
    for (const [bx, bh] of [[100, 5], [106, 7], [112, 4]] as [number, number][]) {
      pc.rect(bx, base - 4 - bh, 5, bh, C.ink8);
      pc.hline(bx, base - 4 - bh, 5, C.white);
      pc.vline(bx + 4, base - 4 - bh, bh, C.ink6);
      pc.set(bx + 1, base - 3 - bh, r.base);
    }
    beacon(pc, g, cx, top - 1, f === 0);
    astronaut(pc, 96, base - 4, 33, 0);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [110, H] }, fps: 1, sync: true };
}

export const RIM_W = 150;
const RIM_H = 112;

/** Solar masts on the crater rim: tall vertical arrays turning to follow the sun around the horizon. */
export function rimSolar(seed: number): FacilityArt {
  const W = RIM_W;
  const H = RIM_H;
  const base = H - 3;
  const rimTop = (x: number) => Math.round(base - Math.sin(Math.max(0, Math.min(1, x / W)) * Math.PI) ** 0.8 * 22 - (fbm(x / 20, seed, 3) - 0.5) * 2);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const masts: [number, number, number][] = [
    [30, 74, 12],
    [74, 96, 12],
    [118, 80, 7],
  ];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the masts first (the rim hides their feet)
    masts.forEach(([mx, mh, pw], i) => {
      const t = rimTop(mx);
      const top = base - mh;
      pc.vline(mx, top, t - top + 2, C.ink8);
      pc.vline(mx + 1, top, t - top + 2, C.ink6);
      const py0 = top + 3;
      const ph = 42;
      for (let y = py0; y < py0 + ph; y++) {
        for (let x = mx - Math.floor(pw / 2); x < mx - Math.floor(pw / 2) + pw + 1; x++) {
          const edge = x === mx - Math.floor(pw / 2);
          let c = (y - py0) % 4 === 0 || (x - mx) % 4 === 0 ? C.blu3 : C.blu2;
          if (edge) c = C.sky4;
          if (pw < 10) c = c === C.blu2 ? C.blu1 : c;
          pc.set(x, y, c);
        }
      }
      pc.hline(mx - Math.floor(pw / 2) - 1, py0 - 1, pw + 3, C.ink7);
      pc.hline(mx - Math.floor(pw / 2) - 1, py0 + ph, pw + 3, C.ink5);
      beacon(pc, g, mx, top - 1, (f + i) % 2 === 0);
    });
    // the rim
    const light = terrainLight(Array.from({ length: W }, (_, x) => rimTop(x)), 0.1, 2);
    for (let x = 0; x < W; x++) {
      const t = rimTop(x);
      for (let y = t; y < base; y++) {
        const dy = y - t;
        let c = sunlit(x, y, light[x] + 0.16 - dy * 0.012, 3, 8);
        if (dy === 0) c = sunlit(x, y, light[x] + 0.35, 4, 8);
        pc.set(x, y, c);
      }
    }
    // cables down the slope to a converter box
    masts.forEach(([mx], i) => {
      for (let x = 10; x < mx; x++) {
        const y = Math.round(rimTop(x) + 2 + (mx - x) * 0.02 + i);
        if (x % 2 === 0) pc.set(x, y, C.ink4);
      }
    });
    pc.rect(2, base - 9, 12, 9, C.ink8);
    pc.hline(2, base - 9, 12, C.white);
    pc.vline(13, base - 9, 9, C.ink6);
    drawText(pc, 'PWR', 3, base - 7, C.ink4);
    pc.set(11, base - 3, f ? C.grn6 : C.grn2);
    g.set(11, base - 3, C.grn6);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

export const ICE_W = 184;
const ICE_H = 66;

/**
 * Shackleton's permanently shadowed floor seen over the near rim: the far wall is pitch black
 * (only its crest catches the sun), and down in the dark an ice rig works under floodlights,
 * heating the frozen regolith and sending water up a cableway to the hut on the rim.
 */
export function iceRig(seed: number): FacilityArt {
  const W = ICE_W;
  const H = ICE_H;
  const base = H - 3;
  const x0 = 18;
  const x1 = W - 26;
  const crest = base - 34;
  const far = (x: number) => Math.round(crest + 2 + Math.sin(x / 17 + seed) * 2 + (fbm(x / 8, seed, 5) - 0.5) * 3);
  const near = (x: number) => Math.round(base - 5 - Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 2 + (fbm(x / 6, seed, 8) - 0.5) * 2);
  const rigX = 80;
  const floorY = base - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the outer slopes up to the rim at each end: sunward on the left, in shadow on the right
    const outer = (x: number) => (x < x0 ? Math.round(base - Math.pow(x / x0, 0.75) * (base - crest)) : Math.round(base - Math.pow((W - 1 - x) / (W - 1 - x1), 0.75) * (base - crest)));
    for (let x = 0; x < W; x++) {
      if (x >= x0 && x <= x1) {
        // the far inner wall: never sunlit; its crest catches a thread of light
        const t = far(x);
        for (let y = t; y < base; y++) {
          const dy = y - t;
          pc.set(x, y, dy === 0 ? C.ink6 : dy === 1 ? C.ink3 : bayer(x, y) < 2 ? C.ink2 : C.ink1);
        }
        continue;
      }
      const t = outer(x);
      const sunward = x < x0;
      for (let y = t; y < base; y++) {
        const dy = y - t;
        const c = sunward ? (dy === 0 ? C.ink9 : sunlit(x, y, 0.78 - dy * 0.012, 3, 7)) : dy === 0 ? C.ink5 : sunlit(x, y, 0.18, 1, 5);
        pc.set(x, y, c);
      }
    }
    // floodlit work area around the rig (lit in the base too: it is always night down there)
    for (let y = crest + 6; y < base; y++) {
      for (let x = rigX - 40; x < rigX + 44; x++) {
        const cur = pc.get(x, y);
        if (cur !== C.ink1 && cur !== C.ink2) continue;
        const d = Math.hypot((x - rigX) / 40, (y - floorY) / 22);
        if (d > 1) continue;
        if (bayer(x, y) < (1 - d) * 14) pc.set(x, y, d < 0.3 ? C.rck5 : d < 0.55 ? C.rck4 : d < 0.8 ? C.rck3 : C.rck2);
        if (bayer(x + 2, y + 1) < (1 - d) * 8) g.set(x, y, d < 0.4 ? C.org0 : C.red1);
      }
    }
    // frost glinting in the lamp light, fainter out in the dark
    for (let i = 0; i < 46; i++) {
      const x = x0 + 3 + Math.floor(hash2(i, seed, 41) * (x1 - x0 - 6));
      const y = base - 2 - Math.floor(hash2(i, seed, 42) * 14);
      const lit = Math.abs(x - rigX) < 36;
      pc.set(x, y, lit ? C.ice3 : C.ice0);
      if (lit && (i + f) % 3 === 0) g.set(x, y, C.ice3);
    }
    // the rig: a lattice derrick with a heated drill head
    const dTop = crest + 8;
    for (let y = dTop; y < floorY; y++) {
      const half = Math.floor(((y - dTop) / (floorY - dTop)) * 5) + 1;
      pc.set(rigX - half, y, C.rck6);
      pc.set(rigX + half, y, C.rck4);
      if ((y - dTop) % 4 === 0) pc.hline(rigX - half, y, half * 2 + 1, C.rck5);
    }
    pc.rect(rigX - 2, dTop - 2, 5, 2, C.rck6);
    pc.rect(rigX - 8, floorY - 5, 17, 5, C.ink5);
    pc.hline(rigX - 8, floorY - 5, 17, C.rck6);
    pc.rect(rigX - 6, floorY - 3, 4, 2, C.ink2);
    pc.set(rigX - 5, floorY - 3, C.yel1);
    g.set(rigX - 5, floorY - 3, C.yel1);
    pc.rect(rigX + 3, floorY - 7, 5, 7, C.ink7);
    pc.hline(rigX + 3, floorY - 7, 5, C.ink9);
    pc.rect(rigX - 1, floorY - 1, 3, 1, f ? C.org1 : C.org2);
    g.rect(rigX - 1, floorY - 1, 3, 1, f ? C.org1 : C.org2);
    beacon(pc, g, rigX, dTop - 3, f === 0);
    // a lit excavator working the frozen floor
    const ex = rigX + 26;
    pc.rect(ex, floorY - 5, 10, 4, C.rck4);
    pc.hline(ex, floorY - 5, 10, C.rck6);
    pc.line(ex + 10, floorY - 5, ex + 15, floorY - 9, C.rck5);
    pc.rect(ex + 14, floorY - 9, 3, 2, C.rck4);
    pc.set(ex + 9, floorY - 4, C.yel2);
    g.set(ex + 9, floorY - 4, C.yel2);
    g.set(ex + 10, floorY - 4, C.yel1);
    for (const wx of [ex + 1, ex + 6]) pc.rect(wx, floorY - 1, 3, 1, C.ink4);
    // the cableway up to the hut on the far right rim
    const hx = x1 + 1;
    const hy = crest + 1;
    pc.rect(hx, hy - 9, 16, 9, C.ink9);
    pc.hline(hx, hy - 9, 16, C.white);
    pc.vline(hx + 15, hy - 9, 9, C.ink7);
    pc.rect(hx + 2, hy - 7, 3, 2, C.ink1);
    g.rect(hx + 2, hy - 7, 3, 2, C.yel1);
    drawText(pc, 'H2O', hx + 4, hy - 6, C.blu3);
    beacon(pc, g, hx + 13, hy - 10, f === 1);
    const ax = rigX + 2;
    const ay = dTop - 1;
    const bx = hx;
    const by = hy - 6;
    for (let k = 0; k <= 50; k++) {
      const t = k / 50;
      const x = Math.round(ax + (bx - ax) * t);
      const y = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * 4);
      if (!pc.get(x, y) || pc.get(x, y) === C.ink1 || pc.get(x, y) === C.ink2) pc.set(x, y, C.ink5);
      if ((k + f * 6) % 12 === 0 && k > 2 && k < 47) {
        pc.rect(x - 1, y + 1, 3, 2, C.ink7);
        pc.set(x, y + 1, C.cyn4);
        g.set(x, y + 1, C.cyn4);
      }
    }
    // the near rim in front: a low lip, its outer face lit
    for (let x = x0 - 3; x <= x1 + 3; x++) {
      const t = near(x);
      for (let y = t; y < base; y++) {
        pc.set(x, y, y === t ? C.ink9 : sunlit(x, y, 0.7 - (y - t) * 0.06, 4, 7));
        g.set(x, y, 0);
      }
    }
    // floodlights on the near lip, aimed down into the crater
    for (const lx of [rigX - 26, rigX + 20]) {
      const ly = near(lx);
      pc.vline(lx, ly - 9, 9, C.ink7);
      pc.rect(lx - 1, ly - 11, 3, 2, C.ink5);
      pc.set(lx, ly - 10, C.yel2);
      g.rect(lx - 1, ly - 11, 3, 2, C.yel2);
    }
    const sy = near(x0 + 4) - 15;
    pc.vline(x0 + 4, sy, 15, C.ink8);
    pc.rect(x0 + 5, sy, 15, 7, C.yel0);
    pc.hline(x0 + 5, sy + 6, 15, C.org1);
    drawText(pc, 'ICE', x0 + 7, sy + 1, C.ink2);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

// ── the mine ───────────────────────────────────────────────────────────────────────────────
/** A bucket-wheel excavator (frames: the wheel turns), 24×13, facing right. */
function excavatorFrames(): PixelCanvas[] {
  return [0, 1, 2].map((f) => {
    const pc = new PixelCanvas(24, 13);
    // the wheel on its boom, at the front
    const cx = 19;
    const cy = 6;
    pc.line(8, 6, cx, cy, C.ink6);
    for (let a = 0; a < 6; a++) {
      const t = ((a * 60 + f * 20) * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(t) * 4);
      const y = Math.round(cy + Math.sin(t) * 4);
      pc.rect(x - 1, y - 1, 2, 2, C.yel0);
      pc.set(x, y, C.org1);
    }
    pc.ring(cx + 0.5, cy + 0.5, 3, C.ink5);
    pc.set(cx, cy, C.ink7);
    // body with a solar roof and a hopper
    pc.rect(2, 4, 12, 5, C.yel0);
    pc.hline(2, 4, 12, C.yel1);
    pc.vline(13, 4, 5, C.org1);
    pc.hline(3, 3, 9, C.blu3);
    pc.set(4, 3, C.sky4);
    pc.rect(9, 5, 3, 2, C.ink1);
    pc.set(10, 5, C.cyn4);
    pc.rect(3, 6, 5, 2, C.ink6);
    for (const wx of [2, 6, 10]) {
      pc.rect(wx, 9, 3, 3, C.ink3);
      pc.set(wx + 1, 10, C.ink6);
      pc.set(wx + ((f + wx) % 3), 12, C.ink5);
    }
    return pc;
  });
}

/** A hauler with a bed full of regolith, 18×9, facing right. */
function haulerFrames(): PixelCanvas[] {
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(18, 9);
    pc.rect(1, 2, 11, 4, C.ink8);
    pc.hline(1, 2, 11, C.ink9);
    for (let x = 2; x < 11; x++) pc.set(x, 1, (x + f) % 3 ? C.ink6 : C.ink5);
    pc.hline(3, 0, 6, C.ink6);
    pc.rect(12, 2, 5, 4, C.white);
    pc.rect(14, 3, 2, 2, C.ink1);
    pc.set(15, 3, C.cyn4);
    pc.hline(1, 5, 16, C.ink6);
    for (const wx of [1, 6, 12]) {
      pc.rect(wx, 6, 3, 3, C.ink3);
      pc.set(wx + 1, 7, C.ink6);
    }
    return pc;
  });
}

export const MINE_W = 214;
const MINE_H = 48;

/** The regolith mine: a terraced cut between spoil heaps, excavators working back and forth. */
export function regolithMine(seed: number): FacilityArt {
  const W = MINE_W;
  const H = MINE_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the unmined plain behind the cut, with its working face
    for (let x = 30; x < W - 36; x++) {
      const top = base - 14 + Math.round((fbm(x / 13, seed, 2) - 0.5) * 3);
      for (let y = top; y < base; y++) {
        const dy = y - top;
        let c = dy === 0 ? C.ink9 : dy < 3 ? C.ink7 : (y + Math.floor(x / 9)) % 4 === 0 ? C.ink3 : bayer(x, y) < 9 ? C.ink4 : C.ink5;
        if (dy >= 3 && (x * 7 + y * 3) % 23 === 0) c = C.ink2;
        pc.set(x, y, c);
      }
    }
    // spoil heaps (processed regolith) at each end
    for (const [hx, hw, hh] of [[0, 46, 18], [W - 52, 52, 22]] as [number, number, number][]) {
      for (let k = 0; k < hw; k++) {
        const t = k / hw;
        const top = Math.round(base - Math.sin(t * Math.PI) ** 0.9 * hh);
        for (let y = top; y < base; y++) {
          const lit = t < 0.48;
          pc.set(hx + k, y, y === top ? (lit ? C.ink9 : C.ink6) : lit ? (ditherAt(hx + k, y, 0.3) ? C.ink6 : C.ink7) : ditherAt(hx + k, y, 0.5) ? C.ink4 : C.ink5);
        }
      }
    }
    // the conveyor up the right heap toward the plant, ore riding it
    const c0: [number, number] = [W - 60, base - 2];
    const c1: [number, number] = [W - 1, base - 28];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const x = Math.round(c0[0] + (c1[0] - c0[0]) * t);
      const y = Math.round(c0[1] + (c1[1] - c0[1]) * t);
      pc.set(x, y, C.ink6);
      pc.set(x, y + 1, C.ink4);
      if (k % 6 === 0) pc.vline(x, y + 2, base - y - 2, C.ink5);
      if ((k + f * 3) % 6 === 0) pc.set(x, y - 1, C.ink7);
    }
    // a marker post with a light
    pc.vline(26, base - 16, 14, C.ink8);
    beacon(pc, g, 26, base - 17, f === 0);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  const movers: Mover[] = [
    { frames: excavatorFrames(), path: [[48, base + 1], [W - 70, base + 1]], speed: 5, phase: 0.15, pingpong: true },
    { frames: haulerFrames(), path: [[20, base + 2], [W - 62, base + 2]], speed: 9, phase: 0.6, pingpong: true },
  ];
  const emitters: Emitter[] = [
    { x: 70, y: base - 8, kind: 'dust', rate: 0.9, spread: 4 },
    { x: 128, y: base - 7, kind: 'dust', rate: 0.7, spread: 4 },
  ];
  return { base: frames, glow: glows, points: {}, movers, emitters, fps: 3 };
}

export const HE3_W = 184;
const HE3_H = 92;

/** The helium-3 plant: a hopper, a rotary kiln baking the regolith, cold columns, big radiators. */
export function he3Plant(r: Ramp4): FacilityArt {
  const W = HE3_W;
  const H = HE3_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 3; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the hopper the conveyor drops into
    for (let y = base - 36; y < base - 22; y++) {
      const k = (y - (base - 36)) / 14;
      const hw = Math.round(11 - k * 6);
      for (let x = 13 - hw; x < 13 + hw; x++) pc.set(x, y, x < 13 - hw + 2 ? C.ink9 : x > 13 + hw - 3 ? C.ink6 : C.ink8);
    }
    pc.hline(1, base - 37, 24, C.white);
    for (let x = 5; x < 21; x++) if ((x + f) % 3 === 0) pc.set(x, base - 38, C.ink6);
    for (const lx of [6, 19]) pc.vline(lx, base - 22, 22, C.ink6);
    // the rotary kiln: a long drum sloping down to the right, glowing through its seams
    const k0 = 24;
    const k1 = 108;
    for (let x = k0; x < k1; x++) {
      const cy = base - 32 + (x - k0) * 0.1;
      for (let y = Math.round(cy - 6); y <= Math.round(cy + 6); y++) {
        const v = (y + 0.5 - cy) / 6;
        if (Math.abs(v) > 1) continue;
        let c = v < -0.55 ? C.ink9 : v < 0.1 ? C.ink8 : v < 0.6 ? C.ink7 : C.ink6;
        if (v < -0.55 && ditherAt(x, y, 0.4)) c = C.white;
        if ((x - k0) % 9 === 4) {
          c = Math.abs(v) < 0.7 ? [C.org2, C.org1, C.yel1][(f + Math.floor(x / 9)) % 3] : C.ink5;
          if (Math.abs(v) < 0.7) g.set(x, y, c);
        }
        pc.set(x, y, c);
      }
    }
    for (const px of [36, 66, 96]) {
      const cy = Math.round(base - 32 + (px - k0) * 0.1 + 7);
      pc.vline(px, cy, base - cy, C.ink6);
      pc.vline(px + 1, cy, base - cy, C.ink4);
      pc.rect(px - 2, cy - 1, 6, 2, C.ink5);
    }
    // the heater housing on the kiln, and a plate
    pc.rect(54, base - 44, 22, 10, C.ink4);
    pc.hline(54, base - 44, 22, C.ink6);
    pc.rect(57, base - 41, 16, 3, f === 0 ? C.org2 : C.org1);
    g.rect(57, base - 41, 16, 3, C.org2);
    const t = 'HELIUM-3';
    pc.rect(34, base - 56, measureText(t) + 4, 7, C.ink1);
    drawText(pc, t, 36, base - 55, C.yel1);
    drawText(g, t, 36, base - 55, C.yel1);
    pc.vline(36, base - 49, 5, C.ink6);
    pc.vline(34 + measureText(t) + 1, base - 49, 5, C.ink6);
    // cold columns that separate the gases (frost on their feet)
    for (const [cx, ch] of [[114, 58], [124, 68], [134, 50]] as [number, number][]) {
      for (let y = base - ch; y < base; y++) for (let x = cx; x < cx + 7; x++) pc.set(x, y, roundShade(STEEL, x + 0.5 - (cx + 3.5), 3.5, x, y));
      for (let y = base - ch - 2; y < base - ch; y++) pc.hline(cx + 1, y, 5, C.ink8);
      for (let y = base - 12; y < base; y++) for (let x = cx; x < cx + 7; x++) if (bayer(x, y) < (y - (base - 12)) * 1.2) pc.set(x, y, C.ice2);
      for (let y = base - ch + 8; y < base - 14; y += 12) pc.hline(cx - 1, y, 9, C.ink5);
      beacon(pc, g, cx + 3, base - ch - 3, (f + cx) % 2 === 0);
    }
    pipe(pc, 108, base - 26, 34, null, C.ink8, C.ink6);
    pipe(pc, 120, base - 40, 14, null, C.ink8, C.ink6);
    // radiators: tall white wings shedding the heat to the black sky
    for (let k = 0; k < 3; k++) {
      const rx = 148 + k * 11;
      const top = base - 70 + k * 6;
      pc.rect(rx, top, 9, base - 16 - top, C.white);
      for (let x = rx + 1; x < rx + 9; x += 2) pc.vline(x, top + 1, base - 18 - top, C.ink9);
      pc.vline(rx + 8, top, base - 16 - top, C.ink7);
      pc.hline(rx, top, 9, C.ink8);
      pc.vline(rx + 4, base - 16, 2, C.ink6);
    }
    // the control module
    pc.rect(144, base - 14, W - 146, 14, C.ink8);
    pc.hline(144, base - 14, W - 146, C.white);
    pc.hline(144, base - 13, W - 146, r.base);
    for (let x = 148; x < W - 4; x += 4) {
      pc.rect(x, base - 9, 2, 2, C.ink1);
      if (hash2(x, 5, 9) > 0.3) g.rect(x, base - 9, 2, 2, C.yel1);
    }
    facadeShade(pc, 144, base - 12, W - 146, 12, C.ink8, C.ink7);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [150, H] }, fps: 3 };
}

/** A frosty spherical tank on legs, lit from the left. */
function coldSphere(pc: PixelCanvas, cx: number, cy: number, R: number, band: number, label: string, labelCol: number) {
  for (const lx of [cx - R * 0.7, cx + R * 0.7 - 1, cx - 2, cx + 1]) pc.vline(Math.round(lx), Math.round(cy + R * 0.5), Math.round(R * 0.6) + 6, lx > cx ? C.ink5 : C.ink6);
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy) / R;
      if (d > 1) continue;
      const l = (-dx * 0.85 - dy * 0.5) / R;
      let c = l > 0.5 ? C.white : l > 0 ? C.ink9 : l > -0.45 ? C.ink8 : C.ink6;
      if (l > 0 && l <= 0.5 && ditherAt(x, y, l * 2)) c = C.white;
      if (Math.abs(dy) < 1.2) c = l > 0 ? band : C.ink5;
      if (dy > R * 0.55 && bayer(x, y) < 6) c = C.ice2;
      pc.set(x, y, c);
    }
  }
  drawText(pc, label, Math.round(cx - measureText(label) / 2), Math.round(cy - R * 0.55), labelCol);
}

export const TANKS_W = 100;
const TANKS_H = 50;

/** The tank farm: helium-3, water and oxygen from the ice, ready for the next lander. */
export function he3Tanks(): FacilityArt {
  const W = TANKS_W;
  const H = TANKS_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    pipe(pc, 0, base - 5, W, base, C.ink8, C.ink6, 11);
    coldSphere(pc, 18, base - 22, 15, C.yel0, 'HE3', C.org1);
    coldSphere(pc, 50, base - 17, 11, C.blu4, 'H2O', C.blu3);
    coldSphere(pc, 76, base - 15, 9, C.cyn4, 'O2', C.cyn3);
    beacon(pc, g, 18, base - 38, f === 0);
    // the loading arm
    pc.vline(92, base - 24, 24, C.ink7);
    pc.line(92, base - 24, 99, base - 18, C.ink8);
    pc.rect(90, base - 6, 6, 6, C.ink6);
    pc.set(92, base - 4, f ? C.grn6 : C.grn2);
    g.set(92, base - 4, C.grn6);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [88, H] }, fps: 1, sync: true };
}

// ── the mass driver ────────────────────────────────────────────────────────────────────────
/** A cargo capsule riding the rail (the scene animates it; `driverPose` places it). */
export interface DriverSpec {
  /** [0] resting in the breech, [1] streaking along the flat, [2] climbing off the ramp. */
  frames: PixelCanvas[];
  glow: PixelCanvas[];
  /** The pixel of a frame that sits on the rail. */
  ax: number;
  ay: number;
  /** The rail, breech first (sprite coordinates of the capsule's centre line). */
  rail: [number, number][];
  /** Seconds per shot. */
  period: number;
}

export const DRIVER_W = 440;
const DRIVER_H = 116;
const BREECH = 56;

const railY = (x: number) => {
  const s = Math.max(0, (x - BREECH) / (DRIVER_W - 4 - BREECH));
  return DRIVER_H - 3 - 12 - Math.pow(s, 2.3) * 84;
};

/** Capsule frames along a direction, with a hot magnetic streak behind when moving. */
export function capsuleFrames(dirs: ([number, number] | null)[]): { frames: PixelCanvas[]; glow: PixelCanvas[] } {
  const S = 44;
  const A = 26;
  const frames: PixelCanvas[] = [];
  const glow: PixelCanvas[] = [];
  for (const d of dirs) {
    const pc = new PixelCanvas(S, S);
    const g = new PixelCanvas(S, S);
    const [dx, dy] = d ?? [1, 0];
    const px = -dy;
    const py = dx;
    if (d) {
      for (let s = -24; s < -5; s++) {
        const k = (-s - 5) / 19;
        for (let w = -1; w <= 1; w++) {
          if (w !== 0 && k > 0.35) continue;
          const x = Math.round(A + dx * s + px * w * 0.8);
          const y = Math.round(A + dy * s + py * w * 0.8);
          if (bayer(x, y) < (1 - k) * 15) {
            const c = k < 0.25 ? C.white : k < 0.55 ? C.cyn6 : C.cyn4;
            pc.set(x, y, c);
            g.set(x, y, k < 0.5 ? C.cyn6 : C.cyn5);
          }
        }
      }
    }
    for (let s = -5; s <= 5; s++) {
      for (let w = -1.5; w <= 1.5; w += 0.5) {
        const x = Math.round(A + dx * s + px * w);
        const y = Math.round(A + dy * s + py * w);
        let c = s >= 4 ? C.white : s === -5 ? C.ink4 : Math.abs(s) === 1 ? C.org1 : w < 0 ? C.yel1 : C.yel0;
        if (w > 1) c = s >= 4 ? C.ink9 : C.org1;
        pc.set(x, y, c);
        if (d && s >= 2) g.set(x, y, C.yel2);
      }
    }
    frames.push(pc);
    glow.push(g);
  }
  return { frames, glow };
}

/**
 * The mass driver: a loading station with its capacitor banks at the breech, then a magnetic rail
 * on pylons rising across the plain into a launch ramp. Every few seconds a capsule shoots off the
 * end toward orbit (`driver`).
 */
export function massDriver(r: Ramp4): FacilityArt {
  const W = DRIVER_W;
  const H = DRIVER_H;
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // pylons under the rail
    for (let x = BREECH + 14; x < W - 6; x += 18) {
      const y = Math.round(railY(x)) + 3;
      const tall = base - y;
      if (tall < 14) {
        pc.vline(x, y, tall, C.ink6);
        pc.vline(x + 1, y, tall, C.ink4);
        continue;
      }
      const spread = Math.min(5, Math.floor(tall / 14));
      for (let yy = y; yy < base; yy++) {
        const k = Math.floor(((yy - y) / tall) * spread);
        pc.set(x - k, yy, C.ink7);
        pc.set(x + 1 + k, yy, C.ink5);
        if ((yy - y) % 7 === 0) pc.hline(x - k, yy, k * 2 + 2, C.ink6);
      }
      pc.hline(x - spread - 1, base - 1, spread * 2 + 4, C.ink6);
    }
    // the rail and its coils
    for (let x = BREECH; x < W - 3; x++) {
      const y = Math.round(railY(x));
      pc.set(x, y - 1, C.ink9);
      pc.set(x, y, C.ink7);
      pc.set(x, y + 1, C.ink5);
      pc.set(x, y + 2, C.ink4);
      if ((x - BREECH) % 6 === 0) {
        for (let k = -3; k <= 3; k++) pc.set(x, y + k, k === -3 ? C.ink8 : k === 3 ? C.ink4 : C.ink6);
        pc.set(x + 1, y - 3, C.ink6);
        pc.set(x + 1, y + 3, C.ink3);
        pc.set(x, y, C.cyn3);
        if ((x - BREECH) % 12 === 0) g.set(x, y, C.cyn4);
      }
    }
    // the muzzle frame and its beacon
    const mx = W - 6;
    const my = Math.round(railY(mx));
    for (let k = -6; k <= 6; k++) {
      pc.set(mx, my + k, C.ink8);
      pc.set(mx + 1, my + k, C.ink5);
    }
    beacon(pc, g, mx, my - 8, f === 0);
    // the loading station at the breech: capacitor banks on the roof, capsules waiting in a rack
    const top = base - 28;
    pc.rect(0, top, BREECH + 6, base - top, C.ink8);
    pc.hline(0, top, BREECH + 6, C.white);
    pc.rect(0, top + 2, BREECH + 6, 3, r.base);
    pc.hline(0, top + 2, BREECH + 6, r.lit);
    facadeShade(pc, 0, top + 5, BREECH + 6, base - top - 5, C.ink8, C.ink7, 0.7);
    for (let k = 0; k < 6; k++) {
      const cx = 3 + k * 9;
      for (let y = top - 9; y < top; y++) for (let x = cx; x < cx + 6; x++) pc.set(x, y, roundShade(STEEL, x + 0.5 - (cx + 3), 3, x, y));
      pc.hline(cx, top - 10, 6, C.ink7);
      pc.set(cx + 2, top - 10, (k + f) % 2 ? C.cyn5 : C.cyn3);
      g.set(cx + 2, top - 10, C.cyn5);
    }
    const t = 'MASS DRIVER';
    drawText(pc, t, 4, top + 8, C.ink3);
    pc.rect(4, top + 15, 30, base - top - 15, C.ink2);
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 4; k++) {
        const x = 6 + k * 7;
        const y = top + 17 + row * 5;
        pc.rect(x, y, 6, 3, C.yel0);
        pc.hline(x, y, 6, C.yel1);
        pc.set(x + 5, y + 1, C.org1);
      }
    }
    g.rect(5, top + 16, 28, 1, C.yel0);
    // the breech: where the rail leaves the building
    pc.rect(BREECH - 4, Math.round(railY(BREECH)) - 6, 10, 12, C.ink6);
    pc.rect(BREECH - 2, Math.round(railY(BREECH)) - 4, 6, 8, C.ink2);
    g.rect(BREECH - 1, Math.round(railY(BREECH)) - 1, 4, 2, C.cyn5);
    // power line along the ground
    for (let x = BREECH + 6; x < W - 8; x++) if (x % 3) pc.set(x, base - 1, C.ink5);
    astronaut(pc, 40, base, 51, 0);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  // the rail as the capsule sees it
  const rail: [number, number][] = [];
  for (let x = BREECH; x <= W - 4; x += 6) rail.push([x, Math.round(railY(x)) - 2]);
  const n = rail.length;
  const ex = rail[n - 1][0] - rail[n - 3][0];
  const ey = rail[n - 1][1] - rail[n - 3][1];
  const el = Math.hypot(ex, ey);
  const cap = capsuleFrames([null, [1, 0], [ex / el, ey / el]]);
  const driver: DriverSpec = { frames: cap.frames, glow: cap.glow, ax: 26, ay: 26, rail, period: 5.2 };
  return { base: frames, glow: glows, points: { dock: [20, H] }, fps: 1, sync: true, driver };
}

const LOAD = 1.6;
const ACCEL = 1.1;
const FLY = 1.8;

/** Where the capsule is in its shot (t in seconds). Pure, for the scene and the previews. */
export function driverPose(t: number, spec: Pick<DriverSpec, 'rail' | 'period'>): { x: number; y: number; frame: number; phase: 'load' | 'accel' | 'flight' | 'gone'; visible: boolean } {
  const rail = spec.rail;
  const period = Math.max(LOAD + ACCEL + FLY, spec.period);
  const u = ((t % period) + period) % period;
  const segs: number[] = [];
  let L = 0;
  for (let i = 0; i + 1 < rail.length; i++) {
    const d = Math.hypot(rail[i + 1][0] - rail[i][0], rail[i + 1][1] - rail[i][1]);
    segs.push(d);
    L += d;
  }
  const at = (s: number): [number, number, number] => {
    let d = Math.max(0, Math.min(L, s));
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) {
        const k = segs[i] ? Math.min(1, d / segs[i]) : 0;
        const slope = (rail[i + 1][1] - rail[i][1]) / Math.max(1, rail[i + 1][0] - rail[i][0]);
        return [rail[i][0] + (rail[i + 1][0] - rail[i][0]) * k, rail[i][1] + (rail[i + 1][1] - rail[i][1]) * k, slope];
      }
      d -= segs[i];
    }
    return [rail[0][0], rail[0][1], 0];
  };
  if (u < LOAD) return { x: rail[0][0], y: rail[0][1], frame: 0, phase: 'load', visible: u > 0.35 };
  if (u < LOAD + ACCEL) {
    const k = (u - LOAD) / ACCEL;
    const [x, y, slope] = at(L * k * k);
    return { x, y, frame: k < 0.12 ? 0 : slope < -0.35 ? 2 : 1, phase: 'accel', visible: true };
  }
  const v = (2 * L) / ACCEL;
  const d = v * (u - LOAD - ACCEL);
  const n = rail.length;
  const ex = rail[n - 1][0] - rail[n - 3][0];
  const ey = rail[n - 1][1] - rail[n - 3][1];
  const el = Math.hypot(ex, ey) || 1;
  const x = rail[n - 1][0] + (ex / el) * d;
  const y = rail[n - 1][1] + (ey / el) * d;
  if (d > 1400) return { x, y, frame: 2, phase: 'gone', visible: false };
  return { x, y, frame: 2, phase: 'flight', visible: true };
}

// ── construction ───────────────────────────────────────────────────────────────────────────
/**
 * A Moon contract under way, in the builder's colours: the finished piece rising (the mass driver's
 * rail is laid from the breech outwards), a crane, stacked cargo modules, a supply lander parked
 * alongside and the builder's board — no hoarding and no flapping flags out here.
 */
export function moonConstruction(kind: string, full: FacilityArt, progress: number, r: Ramp4, sign: string): FacilityArt {
  const src = full.base[0];
  const { w: W, h: H } = src;
  const p = Math.max(0.12, Math.min(1, progress));
  const base = H - 3;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const g = new PixelCanvas(W, H);
    let pc: PixelCanvas;
    if (kind === 'massdriver') {
      const cut = Math.round(BREECH + (W - BREECH) * p);
      pc = new PixelCanvas(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < Math.min(W, cut); x++) pc.set(x, y, src.get(x, y));
      // survey beacons where the rail will run
      moonStakes(pc, g, Math.min(W - 30, cut + 30), base, Math.max(20, W - cut - 36), 9);
      const cx = Math.min(W - 30, cut + 6);
      crane(pc, g, cx, Math.max(8, Math.round(railY(cx)) - 30), base, 26, 8, 18, r, f === 0);
      pc.rect(cx - 22, Math.max(8, Math.round(railY(cx)) - 30) + 20, 18, 2, C.ink8);
    } else {
      const cut = Math.round(H - p * H);
      pc = revealFrom(src, cut);
      const sy = Math.max(4, cut - 8);
      scaffold(pc, 6, sy, W - 12, Math.min(base, cut + 6) - sy, r.mid);
      const n = W > 150 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const cx = Math.round(((i + 0.55) / n) * W);
        crane(pc, g, cx, 4 + i * 6, base, Math.min(cx - 2, 30), 8, Math.max(3, cut - 10 - i * 4), r, (f + i) % 2 === 0);
      }
    }
    // the supply lander, the builder's board and their cabins (beyond the rail head on the mass driver)
    const lx = kind === 'massdriver' ? Math.min(W - 120, Math.round(BREECH + (W - BREECH) * p) + 44) : 4;
    siteCabins(pc, g, kind === 'massdriver' ? lx + 80 : W - 34, base, 2, r);
    scoutLander(pc, g, lx, base);
    const text = sign;
    const sw = measureText(text) + 6;
    const sx = lx + 32;
    const syy = base - 20;
    pc.rect(sx, syy, sw, 9, r.dark);
    pc.box(sx, syy, sw, 9, r.lit);
    drawText(pc, text, sx + 3, syy + 2, C.white);
    drawText(g, text, sx + 3, syy + 2, C.ice2);
    pc.vline(sx + 3, syy + 9, base - syy - 9, C.ink6);
    pc.vline(sx + sw - 4, syy + 9, base - syy - 9, C.ink6);
    moonFlag(pc, g, sx + sw + 6, base, 18, r.base);
    moonGround(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}
