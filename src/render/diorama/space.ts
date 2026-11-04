/**
 * Act V: the sky of open space and the backdrops of the places that float in it (sites 'l4', 'l5'
 * and 'ring', backdrop 'space'). No ground, no air, no weather: a deep starfield with the Milky
 * Way, the Sun as a hard white disc with diffraction spikes (always up on the left, so every piece
 * is lit from the left like the rest of the game), the Earth and the Moon as discs, and the swarm
 * itself as a band of glinting collectors across the sky that fills in as the arcs light up.
 * Structures float on a structural truss (the yards) or stand on the deck of the ring with its
 * radiator fins hanging into the dark; the asteroid sky shares the same parts (asteroid.ts).
 * Pure PixelCanvas code with palette indices only; the scene and the headless previews share it.
 */
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import type { BandProp, BackBand, SceneBands } from './scenery';
import { habCylinder } from './act5kit';

/** What a space scene's bands and sky need to know (from the plan's scenery). */
export interface SpaceScenery {
  kind: 'space';
  place: 'l4' | 'l5' | 'ring';
  /** Habitat cylinders hanging in the distance (L5). */
  habitats: number;
  /** Solar Maximum's storm: 0 none, 1..3. */
  storm: number;
  /** The swarm's arcs lit (0..12, halves). */
  swarm: number;
  /** Foundry modules at the yards (for the far row behind them). */
  modules: number;
  /** Products in flight: any of c (collectors), r (radiator rings), h (hull sections). */
  flow: string;
}

// ════════════════════════════════════════ THE SKY ════════════════════════════════════════
/** Where the sun, the Earth, the Moon and the swarm sit on screen (the sun is always up on the left). */
export interface SpaceSkyPlan {
  sun: { x: number; y: number; r: number };
  /** The Earth as a disc (the game's globe), or as a pale blue dot from far away. */
  earth: { x: number; y: number; r: number } | null;
  dot: { x: number; y: number } | null;
  moon: { x: number; y: number; r: number } | null;
  /** 'near': a band across the sky through the sun; 'far': a glittering ellipse around it (from the main belt). */
  swarm: 'near' | 'far';
  /** Sunlight on the world layers (weaker out in the belt). */
  light: [number, number, number];
}

export function spaceSkyPlan(vw: number, vh: number, place: 'l4' | 'l5' | 'ring' | 'asteroid', au = 1): SpaceSkyPlan {
  const r0 = Math.max(4, Math.round(vh * 0.028));
  const sun = { x: Math.round(vw * 0.14), y: Math.round(vh * 0.16), r: r0 };
  if (place === 'l4' || place === 'l5') {
    return {
      sun,
      earth: { x: Math.round(vw * (place === 'l4' ? 0.8 : 0.74)), y: Math.round(vh * 0.22), r: Math.max(7, Math.round(vh * 0.058)) },
      moon: { x: Math.round(vw * (place === 'l4' ? 0.5 : 0.96)), y: Math.round(vh * 0.09), r: Math.max(3, Math.round(vh * 0.019)) },
      dot: null,
      swarm: 'near',
      light: [1, 1, 1],
    };
  }
  if (place === 'ring') {
    return { sun, earth: { x: Math.round(vw * 0.86), y: Math.round(vh * 0.3), r: Math.max(3, Math.round(vh * 0.016)) }, moon: null, dot: null, swarm: 'near', light: [1, 1, 1] };
  }
  const far = au > 2;
  const k = Math.max(0.78, Math.min(1, 1.06 - au * 0.08));
  return {
    sun: { ...sun, r: Math.max(2, Math.round(r0 / Math.max(1, au * 0.8))) },
    earth: null,
    moon: null,
    dot: far ? { x: sun.x + Math.round(vw * 0.11), y: sun.y + Math.round(vh * 0.03) } : { x: Math.round(vw * 0.66), y: Math.round(vh * 0.2) },
    swarm: far ? 'far' : 'near',
    light: [k, k, Math.min(1, k + 0.06)],
  };
}

/** The black of space: a deep starfield and the Milky Way (no twinkle: there's no air). */
export function spaceSkyArt(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  pc.rect(0, 0, w, h, C.ink0);
  // the Milky Way: a tilted band of dithered glow with dark dust lanes
  const mid = (x: number) => h * (0.7 - (x / Math.max(1, w)) * 0.5) + Math.sin(x / 70 + seed) * h * 0.04;
  const bw = h * 0.16;
  for (let x = 0; x < w; x++) {
    const c = mid(x);
    for (let y = Math.max(0, Math.floor(c - bw)); y < Math.min(h, Math.ceil(c + bw)); y++) {
      const t = 1 - Math.abs(y - c) / bw;
      const n = fbm(x / 34, y / 16, seed, 3) * t;
      const lane = fbm(x / 22 + 9, y / 7, seed + 3, 2);
      if (lane > 0.62 && t > 0.4) continue;
      if (n > 0.44 && ditherAt(x, y, (n - 0.44) * 3)) pc.set(x, y, n > 0.56 ? C.ink3 : C.ink2);
      else if (n > 0.3 && bayer(x, y) < 2) pc.set(x, y, C.night2);
    }
  }
  // a faint violet nebula off to one side
  const nx = w * (0.3 + hash2(seed, 2, 5) * 0.4);
  const ny = h * 0.45;
  for (let y = 0; y < h; y++) {
    for (let x = Math.max(0, Math.floor(nx - 60)); x < Math.min(w, nx + 60); x++) {
      const d = Math.hypot((x - nx) / 60, (y - ny) / 30);
      if (d > 1) continue;
      const n = fbm(x / 18, y / 12, seed + 11, 3) * (1 - d);
      if (n > 0.3 && bayer(x, y) < (n - 0.3) * 30 && !pc.get(x, y)) pc.set(x, y, C.vio0);
    }
  }
  // stars, denser in the band
  const n = Math.round((w * h) / 120);
  for (let i = 0; i < n * 1.4; i++) {
    const inBand = i >= n;
    const x = Math.floor(hash2(i, 1, seed) * w);
    const y = inBand ? Math.round(mid(x) + (hash2(i, 2, seed) - 0.5) * bw * 1.4) : Math.floor(hash2(i, 2, seed) * h);
    if (y < 0 || y >= h) continue;
    const r = hash2(i, 3, seed);
    pc.set(x, y, r > 0.96 ? C.yel2 : r > 0.9 ? C.blu6 : r > 0.72 ? C.white : r > 0.45 ? C.ice1 : r > 0.2 ? C.ink6 : C.ink4);
    if (r > 0.992) {
      pc.set(x + 1, y, C.ink5);
      pc.set(x - 1, y, C.ink5);
      pc.set(x, y + 1, C.ink5);
      pc.set(x, y - 1, C.ink5);
    }
  }
  return pc;
}

/**
 * The swarm in the sky: collectors glinting along Earth's orbit. Seen from near Earth it is a band
 * through the sun, spreading out as it comes closer; from the main belt it is a small glittering
 * ellipse around the sun. `level` is the arcs lit (0..12).
 */
export function swarmArt(w: number, h: number, plan: SpaceSkyPlan, level: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  if (level <= 0) return pc;
  const { x: sx, y: sy, r } = plan.sun;
  const k = Math.min(1, level / 12);
  const glintCol = (i: number) => {
    const v = hash2(i, 7, seed);
    return v > 0.8 ? C.white : v > 0.55 ? C.yel2 : v > 0.3 ? C.yel1 : C.org2;
  };
  if (plan.swarm === 'far') {
    const rx = w * 0.1;
    const ry = rx * 0.26;
    const n = Math.round(30 + 260 * k);
    for (let i = 0; i < n; i++) {
      const a = hash2(i, 1, seed) * Math.PI * 2;
      const lit = a / (Math.PI * 2) < k + 0.08;
      if (!lit) continue;
      const x = Math.round(sx + Math.cos(a) * rx + (hash2(i, 2, seed) - 0.5) * 2);
      const y = Math.round(sy + Math.sin(a) * ry + (hash2(i, 3, seed) - 0.5) * 1.5);
      if (Math.hypot(x - sx, y - sy) < r + 2) continue;
      pc.set(x, y, Math.sin(a) > 0 ? glintCol(i) : C.org1);
    }
    return pc;
  }
  // near: the band leaves the sun to the right and down, widening; a thinner arm runs off left
  const line = (x: number) => sy + (x - sx) * 0.2 + ((x - sx) / w) ** 2 * h * 0.25;
  const n = Math.round(w * (0.25 + 1.6 * k));
  for (let i = 0; i < n; i++) {
    const u = hash2(i, 1, seed);
    const left = u < 0.12;
    const x = left ? Math.round(sx - hash2(i, 2, seed) * sx) : Math.round(sx + hash2(i, 2, seed) * (w - sx));
    const dist = Math.abs(x - sx) / w;
    const spread = 1 + dist * h * 0.22;
    const y = Math.round(line(x) + (hash2(i, 3, seed) - 0.5) * 2 * spread);
    if (y < 0 || y >= h || Math.hypot(x - sx, y - sy) < r * 2.4) continue;
    // the far arcs (near the sun) fill in first
    if (dist > k * 1.1 + 0.06) continue;
    pc.set(x, y, glintCol(i));
    if (dist > 0.45 && hash2(i, 5, seed) > 0.85) pc.set(x + 1, y, C.org1);
  }
  // a faint glow of the arcs too small to make out, along the band near the sun
  if (level > 3) {
    for (let x = Math.max(0, sx - 40); x < Math.min(w, sx + w * 0.55 * k + 40); x++) {
      const y = Math.round(line(x));
      if (Math.hypot(x - sx, y - sy) < r * 2.6 || pc.get(x, y)) continue;
      if (bayer(x, y) < 6) pc.set(x, y, C.ink3);
    }
  }
  return pc;
}

/** The Sun in space: a hard white disc, a thin ring of glare and four diffraction spikes. */
export function spaceSunArt(r: number): PixelCanvas {
  const L = Math.round(r * 3.6);
  const S = L * 2 + 1;
  const pc = new PixelCanvas(S, S);
  const c = L;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d <= r + 0.3) pc.set(x, y, d < r * 0.6 ? C.white : d < r * 0.88 ? C.yel2 : C.yel1);
      else if (d < r * 2) {
        const t = 1 - (d - r) / r;
        if (bayer(x, y) < t * 7) pc.set(x, y, t > 0.6 ? C.yel1 : C.org2);
      }
    }
  }
  // the spikes, tapering into dithered orange
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    for (let k = r + 1; k <= L; k++) {
      const t = (k - r) / (L - r);
      const x = c + ux * k;
      const y = c + uy * k;
      if (t > 0.55 && bayer(x, y) > (1 - t) * 30) continue;
      pc.set(x, y, t < 0.25 ? C.white : t < 0.55 ? C.yel2 : t < 0.8 ? C.yel1 : C.org2);
    }
  }
  for (const [ux, uy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
    for (let k = Math.round(r * 0.75); k <= Math.round(r * 1.5); k++) if (bayer(c + ux * k, c + uy * k) < 9) pc.set(c + ux * k, c + uy * k, C.yel1);
  }
  return pc;
}

/** The Moon from space: grey highlands, dark maria, lit from the left (a waxing gibbous). */
export function moonDiscArt(r: number): PixelCanvas {
  const S = r * 2 + 2;
  const pc = new PixelCanvas(S, S);
  const cx = S / 2;
  const cy = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5 - cx) / r;
      const v = (y + 0.5 - cy) / r;
      const q = u * u + v * v;
      if (q > 1) continue;
      const z = Math.sqrt(1 - q);
      const l = -u * 0.78 - v * 0.2 + z * 0.55;
      const mare = fbm(u * 2.2 + 3, v * 2.2, 17, 2) > 0.55;
      let c = l > 0.62 ? C.ink9 : l > 0.36 ? C.ink8 : l > 0.12 ? C.ink7 : l > 0 ? C.ink5 : C.ink2;
      if (l > 0 && l <= 0.12 && ditherAt(x, y, 0.5)) c = C.ink4;
      if (mare && l > 0.05) c = c === C.ink9 ? C.ink7 : c === C.ink8 ? C.ink6 : C.ink5;
      if (l <= 0 && bayer(x, y) < 4) c = C.ink1;
      pc.set(x, y, c);
    }
  }
  return pc;
}

/** The Earth from very far away: a pale blue dot, its moon a speck beside it. */
export function paleBlueDot(): PixelCanvas {
  const pc = new PixelCanvas(6, 4);
  pc.set(1, 1, C.sky4);
  pc.set(2, 1, C.blu5);
  pc.set(1, 2, C.blu4);
  pc.set(2, 2, C.blu3);
  pc.set(1, 0, C.blu2);
  pc.set(0, 1, C.blu2);
  pc.set(5, 3, C.ink7);
  return pc;
}

/**
 * Solar Maximum's storm: aurora-like curtains in the upper sky (frames for the scene to cycle):
 * bright wavering hems with rays rising off them and a violet fringe on top. The base is sparse;
 * the glow carries the bright hems.
 */
export function stormCurtains(w: number, h: number, level: number, seed: number): { frames: PixelCanvas[]; glow: PixelCanvas[] } {
  const frames: PixelCanvas[] = [];
  const glow: PixelCanvas[] = [];
  const ribbons = Math.max(1, Math.min(3, level));
  const HUES: [number, number][] = [[C.grn6, C.grn3], [C.cyn5, C.cyn2], [C.vio4, C.vio2]];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(w, h);
    const g = new PixelCanvas(w, h);
    for (let r = 0; r < ribbons; r++) {
      const hem0 = h * (0.4 + hash2(r, 1, seed) * 0.35);
      const amp = 4 + hash2(r, 2, seed) * 7;
      const ph = hash2(r, 3, seed) * 6;
      const [bright, mid] = HUES[(r + Math.floor(hash2(r, 4, seed) * 3)) % 3];
      for (let x = 0; x < w; x++) {
        if (fbm(x / 70 + r * 7, r, seed + 1, 2) < 0.42) continue;
        const hy = Math.round(hem0 + Math.sin(x / 37 + ph + f * 0.8) * amp + Math.sin(x / 11 + f * 1.7 + r) * 1.5);
        // the hem: a thin bright wavering line
        if (bayer(x, hy) < 11) {
          pc.set(x, hy, mid);
          if ((x + f) % 2 === 0) g.set(x, hy, bright);
        }
        // rays rising off it, flickering frame to frame
        if (fbm(x / 2.5 + f * 1.3, r * 3 + f, seed + 2, 2) < 0.5) continue;
        const L = 5 + fbm(x / 7, r + f * 0.35, seed, 2) * h * (0.22 + level * 0.08);
        for (let k = 1; k < L; k++) {
          const y = hy - k;
          if (y < 0 || y >= h) continue;
          const t = k / L;
          if (bayer(x, y) >= (1 - t) * 7) continue;
          pc.set(x, y, t < 0.7 ? mid : C.vio1);
          if (t < 0.3 && (y + f) % 3 === 0) g.set(x, y, mid);
        }
      }
    }
    frames.push(pc);
    glow.push(g);
  }
  return { frames, glow };
}

// ════════════════════════════════════════ THE YARDS ════════════════════════════════════════
/** The yards' truss: a lattice girder the foundries clamp onto, the feed line running along it (frames: pods moving left). */
export function trussStrip(w: number, h: number, f: number, feed: boolean): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const bot = 11;
  // receding struts below, fading into the dark
  for (let x0 = -h; x0 < w + h; x0 += 16) {
    for (let y = bot + 2; y < h; y++) {
      const x = x0 + Math.round((y - bot) * 0.6);
      const t = (y - bot) / Math.max(1, h - bot);
      if (bayer(x, y) < (1 - t) * 14) pc.set(x, y, t < 0.35 ? C.ink3 : C.ink2);
    }
  }
  const far = bot + Math.round((h - bot) * 0.55);
  for (let x = 0; x < w; x++) if (bayer(x, far) < 9) pc.set(x, far, C.ink2);
  // deck (the walkway on the top chord)
  for (let x = 0; x < w; x++) {
    pc.set(x, 0, x % 16 === 0 ? C.ink7 : C.ink9);
    pc.set(x, 1, C.ink7);
    pc.set(x, 2, x % 16 === 0 ? C.ink4 : C.ink6);
    pc.set(x, bot, C.ink5);
    pc.set(x, bot + 1, C.ink3);
  }
  // the lattice: verticals and alternating diagonals
  for (let x0 = 0; x0 < w; x0 += 16) {
    pc.vline(x0, 3, bot - 3, C.ink6);
    pc.vline(x0 + 1, 3, bot - 3, C.ink4);
    const up = (x0 / 16) % 2 === 0;
    for (let k = 2; k < 15; k++) {
      const y = up ? 3 + Math.round(((k - 2) / 12) * (bot - 4)) : bot - 1 - Math.round(((k - 2) / 12) * (bot - 4));
      pc.set(x0 + k, y, C.ink5);
      pc.set(x0 + k, y + 1, C.ink3);
    }
  }
  if (feed) {
    // the feed line: a pipe with windows onto pods of hauled rock sliding toward the foundries
    for (let x = 0; x < w; x++) {
      pc.set(x, 4, C.ink8);
      pc.set(x, 5, C.ink6);
      pc.set(x, 6, C.ink6);
      pc.set(x, 7, C.ink4);
      if (x % 12 === 0) pc.vline(x, 4, 4, C.ink5);
    }
    for (let x = 0; x < w; x++) {
      const k = (x + f * 3) % 12;
      if (k === 4 || k === 5 || k === 6) {
        pc.set(x, 5, k === 4 ? C.rck4 : C.rck3);
        pc.set(x, 6, C.rck2);
      }
    }
  }
  // nav lights on the deck edge
  for (let x = 8; x < w; x += 48) pc.set(x, 2, (x / 48) % 2 ? C.grn6 : C.red3);
  return pc;
}

/** The near girder across the bottom of the view: an I-beam with lightening holes and a hazard band. */
export function nearGirder(w: number, h: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    for (let y = 3; y < h; y++) pc.set(x, y, y === 3 ? C.ink4 : y === 4 ? C.ink3 : y === h - 1 ? C.ink2 : C.ink1);
    if (x % 6 === 0) pc.set(x, 5, C.ink3);
  }
  for (let cx = 20; cx < w; cx += 38) {
    for (let y = 6; y < h - 1; y++) {
      for (let x = cx - 5; x <= cx + 5; x++) {
        const d = Math.hypot((x - cx) / 5, (y - 9.5) / 3.2);
        if (d < 1) pc.set(x, y, 0);
        else if (d < 1.3 && y < 9) pc.set(x, y, C.ink3);
      }
    }
  }
  for (let x = 0; x < w; x++) {
    if (Math.floor(x / 150) % 3 !== 1) continue;
    for (let y = 3; y < 5; y++) pc.set(x, y, Math.floor((x + y) / 3) % 2 ? C.yel0 : C.ink1);
  }
  return pc;
}

/** Far band at the yards: the swarm's collectors glinting far off, and other foundry clusters' lights. */
function yardsFar(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let i = 0; i < w / 9; i++) {
    const x = Math.floor(hash2(i, 1, seed) * w);
    const y = Math.floor(hash2(i, 2, seed) * h * 0.85);
    const v = hash2(i, 3, seed);
    if (v > 0.6) {
      pc.hline(x, y, 3, C.blu2);
      pc.set(x + (i % 3), y, v > 0.85 ? C.white : C.sky4);
    } else pc.set(x, y, v > 0.3 ? C.blu3 : C.ink4);
  }
  // distant clusters: a few blocky silhouettes with a light each
  for (let i = 0; i < Math.max(1, w / 260); i++) {
    const x = Math.floor(hash2(i, 9, seed) * (w - 20)) + 4;
    const y = Math.floor(h * (0.5 + hash2(i, 8, seed) * 0.35));
    for (let k = 0; k < 4; k++) {
      const bw = 3 + Math.floor(hash2(i, k, seed + 1) * 3);
      const bh = 2 + Math.floor(hash2(i, k, seed + 2) * 4);
      pc.rect(x + k * 5, y - bh, bw, bh, C.ink3);
      pc.set(x + k * 5, y - bh, C.ink5);
    }
    pc.hline(x - 3, y, 26, C.ink3);
    pc.set(x + 7, y - 6, C.yel1);
  }
  return pc;
}

/** Mid band at the yards: haulers parked off the truss, a beam relay. */
function yardsMid(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let i = 0; i < Math.max(1, Math.round(w / 220)); i++) {
    const x = Math.floor(hash2(i, 1, seed + 5) * (w - 30));
    const y = Math.floor(h * (0.2 + hash2(i, 2, seed + 5) * 0.4));
    // a bulk hauler: a long spine with pods
    pc.hline(x, y + 2, 26, C.ink5);
    for (let k = 0; k < 4; k++) {
      pc.rect(x + 2 + k * 5, y, 4, 4, k % 2 ? C.rck3 : C.rck2);
      pc.set(x + 2 + k * 5, y, C.rck4);
    }
    pc.rect(x + 22, y + 1, 4, 3, C.ink7);
    pc.set(x + 25, y + 1, C.sky4);
    pc.set(x - 1, y + 2, C.cyn5);
  }
  return pc;
}

/** Back row: more foundries on the far side of the truss, small and grey, with their own lights. */
function yardsBack(w: number, h: number, seed: number, modules: number): { base: PixelCanvas; glow: PixelCanvas[] } {
  const pc = new PixelCanvas(w, h);
  const on = new PixelCanvas(w, h);
  const off = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    pc.set(x, h - 2, C.ink4);
    pc.set(x, h - 1, C.ink3);
    if (x % 10 === 0) pc.vline(x, h - 4, 2, C.ink3);
  }
  const n = Math.min(14, 2 + modules * 2);
  let x = 30 + Math.floor(hash2(seed, 1, 2) * 40);
  for (let i = 0; i < n && x < w - 40; i++) {
    const bw = 22 + Math.floor(hash2(i, seed, 3) * 14);
    const bh = 12 + Math.floor(hash2(i, seed, 4) * 12);
    const top = h - 2 - bh;
    for (let y = top; y < h - 2; y++) for (let k = 0; k < bw; k++) pc.set(x + k, y, k === 0 || y === top ? C.ink5 : k < bw * 0.4 ? C.ink4 : C.ink3);
    // radiator fins on top
    for (let k = 0; k < 2; k++) pc.vline(x + bw - 6 + k * 3, top - 9, 9, k ? C.ink5 : C.ink6);
    // the furnace and windows
    pc.set(x + 3, top + 4, C.org1);
    on.set(x + 3, top + 4, C.org2);
    off.set(x + 3, top + 4, C.org2);
    for (let k = 6; k < bw - 4; k += 3) {
      if (hash2(k, i, seed) > 0.4) {
        on.set(x + k, top + 3, C.yel1);
        off.set(x + k, top + 3, C.yel1);
      }
    }
    on.set(x + bw - 5, top - 10, C.red3);
    x += bw + 20 + Math.floor(hash2(i, seed, 5) * 40);
  }
  return { base: pc, glow: [on, off] };
}

/** A small collector sheet drifting off to the swarm (two frames: catching the sun, edge-on). */
function sheetProp(seed: number): { frames: PixelCanvas[]; glow: PixelCanvas[] } {
  const frames: PixelCanvas[] = [];
  const glow: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(12, 7);
    const g = new PixelCanvas(12, 7);
    const t = Math.abs(Math.cos(((f + seed) / 4) * Math.PI));
    const hh = Math.max(1, Math.round(t * 5));
    const y0 = 3 - Math.floor(hh / 2);
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < 9; x++) {
        const xx = x + Math.round((hh - y) * 0.5);
        pc.set(xx, y0 + y, hh === 1 ? C.white : x % 3 === 0 || y === 0 ? C.ink8 : t > 0.8 ? C.sky4 : C.blu3);
      }
    }
    if (hh === 1) g.hline(0, y0, 9, C.white);
    else if (t > 0.8) g.set(3, y0 + 1, C.sky5);
    frames.push(pc);
    glow.push(g);
  }
  return { frames, glow };
}

/** A radiator ring drifting off to Ring One: a band, tumbling. */
function ringProp(): { frames: PixelCanvas[]; glow: PixelCanvas[] } {
  const frames: PixelCanvas[] = [];
  const glow: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(13, 13);
    const g = new PixelCanvas(13, 13);
    const c = Math.abs(Math.cos((f / 4) * Math.PI));
    const R = 5.5;
    const ry = Math.max(1, R * c);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const u = (x + 0.5 - 6.5) / R;
      const v = (y + 0.5 - 6.5) / ry;
      const inner = (x + 0.5 - 6.5) ** 2 / (R - 1.6) ** 2 + (y + 0.5 - 6.5) ** 2 / Math.max(0.3, ry - 1.6 * c) ** 2;
      if (u * u + v * v > 1 || inner < 1) continue;
      pc.set(x, y, u < -0.5 ? C.white : y > 6 ? C.ink8 : C.ink6);
      if (c < 0.3 && u < 0) g.set(x, y, C.ink9);
    }
    frames.push(pc);
    glow.push(g);
  }
  return { frames, glow };
}

/** Every band of a space scene (the yards or the ring). */
export function spaceBands(sc: SpaceScenery, seed: number, b: { farW: number; farH: number; midW: number; midH: number; midY: number; backW: number; groundY: number; groundH: number; fgH: number }, sceneW: number, vh: number): SceneBands {
  const midProps: BandProp[] = [];
  if (sc.place !== 'ring') {
    // products drifting away across the mid band: collector sheets, radiator rings, hull plates
    const drifting = Math.round(4 + (sc.flow.length - 1) * 2 + Math.min(4, sc.modules));
    for (let i = 0; i < drifting; i++) {
      const kind = sc.flow[i % sc.flow.length] ?? 'c';
      const art = kind === 'r' ? ringProp() : sheetProp(i);
      const y = b.midY - 6 - Math.round(hash2(i, 2, seed) * vh * 0.32);
      midProps.push({ frames: art.frames, glow: art.glow, x: Math.round(hash2(i, 1, seed) * b.midW), y, fps: 1 + (i % 3) * 0.5, drift: -(2 + hash2(i, 3, seed) * 4), wrap: b.midW + 20 });
    }
    // at L5 the habitats hang in the distance, small and still
    for (let i = 0; i < Math.min(8, sc.habitats); i++) {
      const near = i === 0;
      const len = near ? 46 : 22 + Math.round(hash2(i, 4, seed) * 14);
      const r = near ? 7 : 3 + Math.round(hash2(i, 5, seed) * 2);
      const cyl = habCylinder(len, r, i + seed);
      const x = Math.round(((i + 0.4) / Math.max(1, Math.min(8, sc.habitats))) * (b.midW - 60) + hash2(i, 6, seed) * 30);
      const y = Math.round(vh * (near ? 0.3 : 0.18 + hash2(i, 7, seed) * 0.22));
      midProps.push({ frames: [cyl.base], glow: [cyl.glow], x, y, fps: 0 });
    }
  }
  if (sc.storm > 0) {
    const cur = stormCurtains(b.midW, Math.round(vh * 0.45), sc.storm, seed);
    midProps.push({ frames: cur.frames, glow: cur.glow, x: 0, y: 2, fps: 3 });
  }
  if (sc.place === 'ring') {
    return {
      seed,
      far: ringArch(b.farW, b.farH, seed),
      mid: ringMid(b.midW, b.midH, seed),
      midProps,
      ground: ringDeck(sceneW, b.groundH, seed),
      fg: ringFg(sceneW + 40, b.fgH, seed),
      lamps: [],
      walkers: false,
    };
  }
  const backH = 40;
  const bk = yardsBack(b.backW, backH, seed, sc.modules);
  const back: BackBand = { base: bk.base, glow: bk.glow, y: b.groundY + 1 - backH, rotors: [], bloom: 0.45 };
  return {
    seed,
    far: yardsFar(b.farW, b.farH, seed),
    mid: yardsMid(b.midW, b.midH, seed),
    midProps,
    back: sc.modules > 0 ? back : undefined,
    ground: trussStrip(sceneW, b.groundH, 0, sc.modules > 0),
    groundFrames: sc.modules > 0 ? [0, 1, 2, 3].map((f) => trussStrip(sceneW, b.groundH, f, true)) : undefined,
    fg: nearGirder(sceneW + 40, b.fgH),
    lamps: [],
    walkers: false,
  };
}

// ════════════════════════════════════════ RING ONE ════════════════════════════════════════
/** The ring's deck with its radiator fins hanging into the dark beneath (the shadow side). */
export function ringDeck(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  // the fins first (the body covers their roots)
  for (let x0 = -h; x0 < w; x0 += 18) {
    const fw = 10;
    for (let y = 10; y < h; y++) {
      const shear = Math.round((y - 10) * 0.35);
      for (let k = 0; k < fw; k++) {
        const x = x0 + k + shear;
        let c = k === 0 ? C.ink3 : k === fw - 1 ? C.ink0 : k < 3 ? C.ink2 : C.ink1;
        // the heat pipes, glowing a dull red down the middle
        if (k === 4 || k === 5) c = (y + x0) % 4 === 0 ? C.red1 : k === 4 ? C.red0 : C.ink1;
        if ((y - 10) % 9 === 0 && k > 0 && k < fw - 1) c = C.ink2;
        pc.set(x, y, c);
      }
    }
  }
  for (let x = 0; x < w; x++) {
    pc.set(x, 0, x % 20 === 0 ? C.ink8 : C.white);
    pc.set(x, 1, C.ink8);
    pc.set(x, 2, x % 20 === 0 ? C.ink5 : C.ink7);
    pc.set(x, 3, C.ink5);
    for (let y = 4; y < 10; y++) pc.set(x, y, y === 4 ? C.ink4 : C.ink3);
    pc.set(x, 10, C.ink2);
    if (x % 24 === 6) {
      pc.set(x, 6, C.cyn4);
      pc.set(x + 1, 6, C.cyn3);
    }
    if (x % 4 === 0) pc.set(x, 8, C.ink4);
  }
  void seed;
  return pc;
}

/** The bottoms of the nearest, biggest fins rising out of the frame. */
function ringFg(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let x0 = 10; x0 < w; x0 += 70 + Math.floor(hash2(x0, seed, 2) * 40)) {
    const fw = 16 + Math.floor(hash2(x0, seed, 3) * 10);
    const top = 2 + Math.floor(hash2(x0, seed, 4) * 4);
    for (let y = top; y < h; y++) {
      for (let k = 0; k < fw; k++) {
        const x = x0 + k + Math.round((y - top) * 0.6);
        pc.set(x, y, k === 0 ? C.ink2 : k === 7 || k === 8 ? ((y + k) % 3 === 0 ? C.red0 : C.ink1) : C.ink0);
      }
    }
  }
  return pc;
}

/** The ring itself curving away in the distance: an arch of lit racks with dark fins hanging under it. */
export function ringArch(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const top = (x: number) => Math.round(h - 1 - Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, x / w))), 0.6) * h * 0.4);
  for (let x = 0; x < w; x++) {
    const y = top(x);
    const slope = top(x + 1) - y;
    // fins hang under it (longer where the arch is high and near)
    if (x % 3 === 0) for (let k = 3; k < 5 + Math.abs(slope); k++) pc.set(x, y + k, C.ink2);
    pc.set(x, y, x % 4 === 0 ? C.cyn4 : C.ink7);
    pc.set(x, y + 1, C.ink5);
    pc.set(x, y + 2, C.ink3);
    if (x % 23 === 7) pc.set(x, y - 1, C.white);
    if (hash2(x, 3, seed) > 0.92) pc.set(x, y, C.cyn6);
  }
  return pc;
}

/** Mid band at the ring: a few haulers and drones in transit, a beam relay. */
function ringMid(w: number, h: number, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let i = 0; i < Math.max(2, Math.round(w / 160)); i++) {
    const x = Math.floor(hash2(i, 1, seed + 9) * (w - 20));
    const y = Math.floor(h * (0.1 + hash2(i, 2, seed + 9) * 0.5));
    if (i % 2) {
      pc.rect(x, y, 7, 2, C.ink6);
      pc.set(x + 6, y, C.sky4);
      pc.set(x - 1, y, C.cyn5);
      pc.set(x - 2, y, C.cyn3);
    } else {
      pc.set(x, y, C.ink7);
      pc.set(x + 1, y, C.ink5);
      pc.set(x - 1, y, C.red3);
    }
  }
  return pc;
}
