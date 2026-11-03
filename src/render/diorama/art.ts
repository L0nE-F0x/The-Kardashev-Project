/**
 * Procedural side-view pixel art for campus dioramas: facilities, backdrops, people, vehicles.
 * Everything is drawn into indexed PixelCanvases, so the era palette re-grades it all.
 */
import type { Backdrop } from '../../content/sites';
import type { FacilityType } from '../../sim/types';
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';

export interface FacilityArt {
  base: PixelCanvas[]; // animation frames (≥1)
  glow: PixelCanvas[]; // emissive pixels (night lights), same frame count
  /** Anchor offsets for effects (e.g. smoke stack top), relative to sprite top-left. */
  points: Record<string, [number, number]>;
}

const SIZES: Record<FacilityType | 'substation', [number, number]> = {
  datacenter: [112, 46],
  solar: [118, 26],
  wind: [104, 92],
  battery: [74, 26],
  gas: [96, 66],
  lab: [82, 48],
  hq: [66, 38],
  substation: [46, 44],
};

export function facilitySize(type: FacilityType | 'substation'): [number, number] {
  return SIZES[type];
}

/** Shade the right part of a facade with an ordered dither (light comes from the left). */
function facadeShade(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, from: number, to: number, start = 0.62) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (pc.get(x, y) !== from) continue;
      const t = (x - x0) / w;
      if (t > start && ditherAt(x, y, (t - start) / (1 - start))) pc.set(x, y, to);
    }
  }
}

// ── data center ────────────────────────────────────────────────────────────────────────────
function datacenter(label: string): FacilityArt {
  const [W, H] = SIZES.datacenter;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const top = 13;
    // body
    pc.rect(0, top, W, H - top, C.ink4);
    pc.hline(0, top, W, C.ink6);
    pc.hline(0, top + 1, W, C.ink5);
    pc.rect(0, H - 3, W, 3, C.ink2);
    pc.vline(0, top, H - top, C.ink6);
    // louvers
    for (let y = top + 6; y < H - 6; y += 4) {
      pc.hline(2, y, W - 4, C.ink3);
      pc.hline(2, y - 1, W - 4, C.ink5);
    }
    // pilasters
    for (let x = 14; x < W - 4; x += 16) pc.rect(x, top + 2, 2, H - top - 5, C.ink3);
    facadeShade(pc, 0, top, W, H - top, C.ink4, C.ink3);
    // loading dock
    pc.rect(W - 26, H - 16, 15, 13, C.ink2);
    for (let y = H - 15; y < H - 3; y += 2) pc.hline(W - 25, y, 13, C.ink3);
    pc.rect(W - 28, H - 18, 19, 2, C.ink6);
    // logo plate
    const txt = label.slice(0, 3).toUpperCase();
    const tw = measureText(txt);
    pc.rect(6, top + 5, tw + 6, 9, C.ink1);
    drawText(pc, txt, 9, top + 7, C.cyn5);
    drawText(g, txt, 9, top + 7, C.cyn5);
    // LED status strip
    for (let i = 0; i < 10; i++) {
      const on = (i + f) % 4 !== 0;
      const c = i === 7 && f % 2 ? C.org1 : C.cyn4;
      pc.set(30 + i * 3, top + 4, on ? c : C.ink2);
      if (on) g.set(30 + i * 3, top + 4, c);
    }
    // a band of small lit windows (offices / NOC)
    for (let x = 32; x < 60; x += 4) {
      pc.rect(x, top + 8, 2, 2, C.ink1);
      if (hash2(x, 3, 5) > 0.35) g.rect(x, top + 8, 2, 2, C.yel1);
    }
    // rooftop chillers with spinning fans
    for (let i = 0; i < 5; i++) {
      const x = 4 + i * 22;
      pc.rect(x, 4, 16, top - 4, C.ink6);
      pc.rect(x, 4, 16, 1, C.ink8);
      pc.vline(x + 15, 4, top - 4, C.ink5);
      for (let y = 7; y < top - 1; y += 2) pc.hline(x + 2, y, 12, C.ink5);
      // fan housings (two per unit), blades alternate per frame
      for (const fx of [x + 3, x + 9]) {
        pc.rect(fx, 2, 5, 2, C.ink3);
        const ph = (f + i + (fx > x + 5 ? 1 : 0)) % 2;
        pc.set(fx + 1 + ph, 2, C.ink7);
        pc.set(fx + 3 - ph, 3, C.ink7);
      }
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { roof: [W / 2, 2] } };
}

// ── solar farm ─────────────────────────────────────────────────────────────────────────────
function solar(): FacilityArt {
  const [W, H] = SIZES.solar;
  const pc = new PixelCanvas(W, H);
  const rows = [
    { y: 3, h: 4, n: 13, x0: 6, gap: 1, back: true },
    { y: 10, h: 5, n: 11, x0: 2, gap: 1, back: false },
    { y: 18, h: 6, n: 10, x0: 0, gap: 1, back: false },
  ];
  for (const r of rows) {
    const pw = Math.floor((W - r.x0 - 2) / r.n) - r.gap;
    for (let i = 0; i < r.n; i++) {
      const x = r.x0 + i * (pw + r.gap);
      // posts
      pc.vline(x + 2, r.y + r.h, 2 + (r.back ? 0 : 1), C.ink6);
      pc.vline(x + pw - 3, r.y + r.h - 1, 3 + (r.back ? 0 : 1), C.ink5);
      // tilted panel: parallelogram leaning back
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
  return { base: [pc], glow: [new PixelCanvas(W, H)], points: {} };
}

// ── wind farm ──────────────────────────────────────────────────────────────────────────────
const TURBINES = [
  { x: 28, top: 14, size: 22, col: C.white, sh: C.ink8 },
  { x: 70, top: 34, size: 15, col: C.ink9, sh: C.ink7 },
  { x: 92, top: 44, size: 11, col: C.ink8, sh: C.ink7 },
];

function wind(): FacilityArt {
  const [W, H] = SIZES.wind;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  for (const t of [...TURBINES].reverse()) {
    // tapered tower
    for (let y = t.top + 2; y < H; y++) {
      const half = 1 + Math.floor(((y - t.top) / (H - t.top)) * 1.6);
      for (let x = -half; x <= half; x++) pc.set(t.x + x, y, x > 0 ? t.sh : t.col);
    }
    // nacelle
    pc.rect(t.x - 2, t.top - 1, 6, 3, t.col);
    pc.hline(t.x - 2, t.top + 1, 6, t.sh);
    // aviation light
    pc.set(t.x + 1, t.top - 2, C.red3);
    g.set(t.x + 1, t.top - 2, C.red3);
  }
  return { base: [pc], glow: [g], points: Object.fromEntries(TURBINES.map((t, i) => [`hub${i}`, [t.x, t.top] as [number, number]])) };
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
      // wider root of the blade
      pc.line(c + Math.cos(a + 0.12) * 2, c + Math.sin(a + 0.12) * 2, c + Math.cos(a) * size * 0.55, c + Math.sin(a) * size * 0.55, col);
    }
    pc.rect(c - 1, c - 1, 3, 3, C.ink7);
    frames.push(pc);
  }
  return frames;
}

export const TURBINE_LAYOUT = TURBINES;

// ── battery ────────────────────────────────────────────────────────────────────────────────
function battery(): FacilityArt {
  const [W, H] = SIZES.battery;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    pc.rect(0, H - 3, W, 3, C.ink5);
    pc.hline(0, H - 3, W, C.ink7);
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 18;
      pc.rect(x, 8, 16, H - 11, C.ink8);
      pc.hline(x, 8, 16, C.white);
      for (let k = 2; k < 15; k += 3) pc.vline(x + k, 10, H - 14, C.ink7);
      pc.vline(x + 15, 8, H - 11, C.ink6);
      // HVAC on the roof
      pc.rect(x + 3, 5, 6, 3, C.ink6);
      pc.hline(x + 3, 5, 6, C.ink7);
      // state-of-charge lights
      for (let l = 0; l < 3; l++) {
        const on = l < 2 || (f + i) % 2 === 0;
        const c = l === 2 ? C.yel0 : C.grn6;
        pc.set(x + 3 + l * 2, 12, on ? c : C.ink4);
        if (on) g.set(x + 3 + l * 2, 12, c);
      }
    }
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {} };
}

// ── gas plant ──────────────────────────────────────────────────────────────────────────────
function gas(): FacilityArt {
  const [W, H] = SIZES.gas;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  // transformer yard
  pc.rect(2, H - 12, 14, 9, C.ink5);
  for (let x = 3; x < 15; x += 2) pc.vline(x, H - 11, 7, C.ink4);
  pc.rect(5, H - 18, 2, 6, C.ink8);
  pc.rect(10, H - 18, 2, 6, C.ink8);
  // turbine hall
  pc.rect(18, H - 30, 46, 27, C.rck4);
  pc.rect(16, H - 33, 50, 3, C.rck5);
  for (let x = 22; x < 62; x += 8) {
    pc.rect(x, H - 24, 4, 6, C.ink2);
    if (hash2(x, 1, 3) > 0.3) g.rect(x, H - 24, 4, 6, C.yel1);
  }
  pc.rect(40, H - 14, 10, 11, C.rck2);
  facadeShade(pc, 18, H - 30, 46, 27, C.rck4, C.rck3);
  // HRSG block
  pc.rect(62, H - 44, 18, 41, C.ink5);
  pc.rect(62, H - 44, 18, 2, C.ink7);
  for (let y = H - 40; y < H - 6; y += 5) pc.hline(63, y, 16, C.ink4);
  facadeShade(pc, 62, H - 44, 18, 41, C.ink5, C.ink4, 0.4);
  // pipes
  pc.hline(56, H - 36, 8, C.ink7);
  pc.vline(56, H - 36, 4, C.ink7);
  // stack with warning bands
  pc.rect(82, 4, 7, H - 7, C.ink8);
  pc.vline(88, 4, H - 7, C.ink6);
  for (let y = 4; y < 14; y += 4) pc.rect(82, y, 7, 2, C.red3);
  pc.rect(81, 3, 9, 1, C.ink6);
  pc.set(85, 2, C.red3);
  g.set(85, 2, C.red3);
  pc.rect(0, H - 3, W, 3, C.ink3);
  return { base: [pc], glow: [g], points: { stack: [85, 1] } };
}

// ── research lab ───────────────────────────────────────────────────────────────────────────
function lab(): FacilityArt {
  const [W, H] = SIZES.lab;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const top = 10;
  pc.rect(0, top, W, H - top, C.ink6);
  // glass curtain wall
  for (let fl = 0; fl < 3; fl++) {
    const y = top + 3 + fl * 11;
    for (let x = 3; x < W - 3; x += 6) {
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 5; i++) {
          const refl = (i + j + fl) % 7 === 0 || (i + j + fl) % 7 === 1;
          pc.set(x + i, y + j, refl ? C.sky4 : j < 2 ? C.blu4 : C.blu3);
        }
      }
      if (hash2(x, fl, 9) > 0.45) g.rect(x, y + 1, 5, 6, hash2(x, fl, 8) > 0.5 ? C.yel1 : C.yel0);
    }
    pc.hline(0, y + 9, W, C.ink8);
  }
  facadeShade(pc, 0, top, W, H - top, C.blu3, C.blu2, 0.55);
  // rooftop garden
  pc.rect(0, top - 1, W, 1, C.ink8);
  for (let x = 4; x < W - 4; x += 7) {
    pc.circle(x + 2, top - 3, 2.5, C.grn4);
    pc.set(x + 1, top - 5, C.grn6);
  }
  // entrance + sign
  pc.rect(W / 2 - 6, H - 11, 12, 11, C.cyn1);
  pc.rect(W / 2 - 9, H - 13, 18, 2, C.ink8);
  g.rect(W / 2 - 5, H - 10, 10, 9, C.cyn4);
  drawText(pc, 'LAB', 4, top + 1, C.vio5);
  drawText(g, 'LAB', 4, top + 1, C.vio5);
  return { base: [pc], glow: [g], points: {} };
}

// ── garage HQ ──────────────────────────────────────────────────────────────────────────────
function hq(label: string): FacilityArt {
  const [W, H] = SIZES.hq;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    const wallTop = 16;
    // walls
    pc.rect(4, wallTop, W - 8, H - wallTop, C.snd6);
    for (let y = wallTop + 2; y < H; y += 3) pc.hline(4, y, W - 8, C.snd5);
    facadeShade(pc, 4, wallTop, W - 8, H - wallTop, C.snd6, C.snd5, 0.55);
    // gable roof
    for (let r = 0; r < 14; r++) {
      const x0 = 2 + r * 2 - 0;
      pc.hline(Math.max(0, x0 - 2 + 0), wallTop - 1 - Math.floor(r / 1.15), Math.max(0, W - 2 * x0 + 4), r === 0 ? C.red1 : r % 3 === 0 ? C.red1 : C.red2);
    }
    pc.hline(0, wallTop - 1, W, C.red1);
    // open garage door showing the startup inside
    const gx = 8;
    const gy = wallTop + 4;
    pc.rect(gx, gy, 26, H - gy, C.ink2);
    pc.rect(gx, gy, 26, 3, C.ink6);
    for (let x = gx + 1; x < gx + 25; x += 2) pc.set(x, gy + 1, C.ink5);
    // desk + monitor glow
    pc.rect(gx + 3, H - 7, 12, 2, C.snd3);
    pc.rect(gx + 6, H - 13, 6, 5, C.ink0);
    pc.rect(gx + 7, H - 12, 4, 3, f ? C.cyn5 : C.cyn4);
    g.rect(gx + 7, H - 12, 4, 3, f ? C.cyn5 : C.cyn4);
    // little server rack
    pc.rect(gx + 18, H - 15, 6, 15, C.ink1);
    for (let y = H - 13; y < H - 2; y += 3) {
      const c = (y + f) % 2 ? C.grn6 : C.cyn4;
      pc.set(gx + 19, y, c);
      g.set(gx + 19, y, c);
    }
    // window with warm light
    pc.rect(W - 22, wallTop + 4, 10, 8, C.ink1);
    pc.rect(W - 21, wallTop + 5, 8, 6, C.sky4);
    g.rect(W - 21, wallTop + 5, 8, 6, f ? C.yel1 : C.yel0);
    pc.vline(W - 17, wallTop + 5, 6, C.snd3);
    pc.hline(W - 21, wallTop + 7, 8, C.snd3);
    g.vline(W - 17, wallTop + 5, 6, 0);
    g.hline(W - 21, wallTop + 7, 8, 0);
    // sign
    const txt = label.slice(0, 3).toUpperCase();
    pc.rect(W - 24, H - 10, measureText(txt) + 4, 7, C.ink1);
    drawText(pc, txt, W - 22, H - 9, C.yel0);
    drawText(g, txt, W - 22, H - 9, C.yel0);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {} };
}

// ── substation ─────────────────────────────────────────────────────────────────────────────
function substation(): FacilityArt {
  const [W, H] = SIZES.substation;
  const pc = new PixelCanvas(W, H);
  // lattice pylon
  const px = 32;
  for (let y = 2; y < H - 2; y++) {
    const half = 1 + Math.floor((y / H) * 5);
    pc.set(px - half, y, C.ink6);
    pc.set(px + half, y, C.ink6);
    if (y % 4 === 0) pc.line(px - half, y, px + half, y + 3, C.ink7);
  }
  pc.hline(px - 8, 6, 17, C.ink6);
  pc.hline(px - 6, 12, 13, C.ink6);
  // wires off to the left
  for (const [y0, dy] of [[6, 4], [12, 5]]) {
    for (let x = 0; x < px - 8; x++) pc.set(x, y0 + Math.round(Math.sin((x / (px - 8)) * Math.PI) * dy), C.ink7);
  }
  // transformers
  for (let i = 0; i < 2; i++) {
    const x = 2 + i * 13;
    pc.rect(x, H - 14, 10, 11, C.ink5);
    for (let k = 1; k < 10; k += 2) pc.vline(x + k, H - 13, 9, C.ink4);
    pc.rect(x + 2, H - 19, 2, 5, C.white);
    pc.rect(x + 6, H - 19, 2, 5, C.white);
  }
  pc.rect(0, H - 3, W, 3, C.ink5);
  // fence
  for (let x = 0; x < W; x += 3) pc.vline(x, H - 8, 5, C.ink6);
  pc.hline(0, H - 8, W, C.ink6);
  return { base: [pc], glow: [new PixelCanvas(W, H)], points: {} };
}

export function facilityArt(type: FacilityType | 'substation', label: string): FacilityArt {
  switch (type) {
    case 'datacenter':
      return datacenter(label);
    case 'solar':
      return solar();
    case 'wind':
      return wind();
    case 'battery':
      return battery();
    case 'gas':
      return gas();
    case 'lab':
      return lab();
    case 'hq':
      return hq(label);
    case 'substation':
      return substation();
  }
}

/** A building site: the finished sprite revealed bottom-up, with scaffolding and a crane. */
export function constructionArt(type: FacilityType, progress: number, label: string): PixelCanvas {
  const [W, H] = SIZES[type];
  const full = facilityArt(type, label).base[0];
  const pc = new PixelCanvas(W, H);
  const cut = Math.round(H - Math.max(0.12, progress) * H);
  for (let y = cut; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, full.get(x, y));
  // scaffolding over the unfinished upper part
  for (let x = 2; x < W - 2; x += 6) pc.vline(x, Math.max(4, cut - 8), Math.min(H, cut + 6) - Math.max(4, cut - 8), C.ink6);
  for (let y = Math.max(4, cut - 8); y < cut + 6 && y < H; y += 5) pc.hline(2, y, W - 4, C.ink6);
  // crane
  const cx = Math.min(W - 6, Math.floor(W * 0.7));
  for (let y = 0; y < H; y += 2) {
    pc.set(cx, y, C.yel0);
    pc.set(cx + 2, y, C.yel0);
    pc.set(cx + 1, y + 1, C.org1);
  }
  pc.hline(Math.max(0, cx - 26), 1, Math.min(W, cx + 10) - Math.max(0, cx - 26), C.yel0);
  pc.hline(Math.max(0, cx - 26), 2, Math.min(W, cx + 10) - Math.max(0, cx - 26), C.org1);
  pc.vline(Math.max(0, cx - 18), 3, Math.max(2, cut - 6), C.ink7);
  pc.rect(cx + 3, 3, 5, 4, C.ink5);
  // safety fence
  for (let x = 0; x < W; x += 2) pc.set(x, H - 4, x % 4 ? C.org1 : C.white);
  return pc;
}

/** Empty plot marker: dotted outline with a plus. */
export function emptyPlotArt(w: number, hover: boolean): PixelCanvas {
  const h = 10;
  const pc = new PixelCanvas(w, h);
  const c = hover ? C.yel1 : C.ink7;
  for (let x = 0; x < w; x += 2) {
    pc.set(x, 0, c);
    pc.set(x, h - 1, c);
  }
  for (let y = 0; y < h; y += 2) {
    pc.set(0, y, c);
    pc.set(w - 1, y, c);
  }
  const mx = Math.floor(w / 2);
  pc.hline(mx - 2, 4, 5, c);
  pc.vline(mx, 2, 5, c);
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
        const d = Math.abs(x - w * 0.6);
        top = Math.max(h * 0.12 + d * 0.55, h * 0.55 + (n - 0.5) * h * 0.2);
        if (d < 4) top = h * 0.12 + 2;
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

/** Mid ground band with decorations (trees, cacti, palms…). */
export function midBand(b: Backdrop, w: number, h: number, seed: number): PixelCanvas {
  const bio = BIOMES[b];
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(h * 0.55 + (fbm(x / 40, seed + 5, seed) - 0.5) * h * 0.35);
    for (let y = top; y < h; y++) pc.set(x, y, y - top < 2 ? bio.mid[1] : ditherAt(x, y, 0.3) ? bio.mid[1] : bio.mid[0]);
  }
  // decorations
  for (let x = 4; x < w - 8; x += 7 + Math.floor(hash2(x, seed, 21) * 12)) {
    const baseY = Math.round(h * 0.55 + (fbm(x / 40, seed + 5, seed) - 0.5) * h * 0.35) + 1;
    deco(pc, bio.deco, x, baseY, hash2(x, seed, 22));
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
        // distant farm silo
        pc.rect(x + 6, y - 9, 3, 9, C.ink8);
        pc.set(x + 7, y - 10, C.red2);
      }
      break;
    case 'rock':
      pc.rect(x, y - 2, 4, 2, C.rck3);
      pc.hline(x + 1, y - 3, 2, C.rck4);
      if (r > 0.7) {
        // steam vent
        pc.set(x + 6, y - 1, C.ice2);
      }
      break;
  }
}

/** Ground strip with a road. */
export function groundStrip(b: Backdrop, w: number, h: number): PixelCanvas {
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
  // tufts / pebbles along the top edge
  for (let x = 0; x < w; x++) if (hash2(x, 7, 41) < 0.12) pc.set(x, 0, bio.ground[2]);
  return pc;
}

/** Foreground lip (darker grass / fence) for depth. */
export function foreground(b: Backdrop, w: number, h: number): PixelCanvas {
  const bio = BIOMES[b];
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(3 + (fbm(x / 13, 77) - 0.5) * 4);
    for (let y = top; y < h; y++) pc.set(x, y, y - top < 1 ? bio.ground[0] : C.ink1);
    if (hash2(x, 1, 61) < 0.25) pc.set(x, top - 1, bio.ground[0]);
  }
  for (let x = 6; x < w; x += 23) {
    pc.vline(x, 0, h, C.snd2);
    pc.set(x, 0, C.snd3);
  }
  return pc;
}
