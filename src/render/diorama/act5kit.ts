/**
 * Shared drawing kit for the Act V dioramas (the L4/L5 yards, Ring One, the Aurora habitat, the
 * asteroids and the Moon's foundry): rock ramps per asteroid type, robot arms (two-link IK), warning
 * beacons and quarantine nets for drifting foundries, a stiff flag for claims (no wind out here),
 * habitat cylinders seen from outside, little drones and tugs, and the blueprint "printing" reveal
 * the self-copying foundries use. Pure PixelCanvas code with palette indices only.
 */
import { C, KEYS, type ColorKey } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import { rampOf, type Ramp4 } from './act3kit';
import type { AsteroidType } from '../../sim/types';

/** A palette index back to its ramp (pieces carry their accent as an index). */
export function rampOfIndex(idx: number): Ramp4 {
  const key = KEYS[idx - 1] as ColorKey | undefined;
  return rampOf(key ?? 'cyn4');
}

// ════════════════════════════════════════ ROCK ════════════════════════════════════════
/** Six steps of an asteroid's rock (deep shadow → sunlit crest), its dust and its glints. */
export interface RockRamp {
  deep: number;
  dark: number;
  shade: number;
  mid: number;
  lit: number;
  hi: number;
  /** Dust patches (C: bluish fines, S: tan, M: blue-grey). */
  dust: number;
  /** A tint dithered into the mid tones (what makes S brown and M blue). */
  tint: number;
  /** Specular glints (M sparkles; the others barely). */
  glint: number;
}

export const ROCK: Record<AsteroidType, RockRamp> = {
  // carbonaceous: charcoal black with a bluish dust
  C: { deep: C.ink0, dark: C.ink1, shade: C.ink2, mid: C.ink3, lit: C.ink4, hi: C.ink6, dust: C.blu1, tint: C.blu1, glint: C.ink7 },
  // stony: grey-brown
  S: { deep: C.rck0, dark: C.rck1, shade: C.rck2, mid: C.rck3, lit: C.rck4, hi: C.rck6, dust: C.snd3, tint: C.snd2, glint: C.rck6 },
  // metal: grey-blue nickel-iron with bright glints
  M: { deep: C.blu0, dark: C.ink3, shade: C.ink4, mid: C.ink5, lit: C.ink7, hi: C.ink9, dust: C.blu2, tint: C.blu3, glint: C.white },
};

/** Rock lit by b (0 turned away … 1 full on), dithered between the ramp's steps. */
export function rockAt(R: RockRamp, x: number, y: number, b: number): number {
  const steps = [R.deep, R.dark, R.shade, R.mid, R.lit, R.hi];
  const t = Math.max(0, Math.min(0.999, b)) * (steps.length - 1);
  const i = Math.floor(t);
  const c = steps[ditherAt(x, y, t - i) ? Math.min(steps.length - 1, i + 1) : i];
  // the tint creeps into the middle tones
  if ((c === R.mid || c === R.shade) && bayer(x + 1, y + 2) < 3) return R.tint;
  return c;
}

/** A boulder resting on baseY, lit from the upper left (r = radius; squash < 1 flattens it). */
export function boulder(pc: PixelCanvas, R: RockRamp, cx: number, baseY: number, r: number, seed: number, squash = 0.75) {
  const ry = r * squash;
  const cy = baseY - ry + 1;
  for (let y = Math.floor(cy - ry - 1); y <= baseY; y++) {
    for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / ry;
      const lump = (hash2(Math.round(Math.atan2(dy, dx) * 2.2), seed, 31) - 0.5) * 0.35;
      const d = Math.hypot(dx, dy);
      if (d > 1 + lump) continue;
      const l = 0.55 - dx * 0.42 - dy * 0.38;
      let c = rockAt(R, x, y, l);
      if (d > 0.82 + lump && dx < -0.2 && dy < 0.2) c = R.hi;
      // facets and pits
      if (hash2(x >> 1, y >> 1, seed) > 0.9) c = l > 0.5 ? R.mid : R.dark;
      pc.set(x, y, c);
    }
  }
  // the shadow it throws to the right (the sun is low on the left)
  for (let x = Math.round(cx + r * 0.6); x < Math.round(cx + r * 2.4); x++) {
    if (!pc.get(x, baseY) || pc.get(x, baseY) === R.lit || pc.get(x, baseY) === R.hi || pc.get(x, baseY) === R.mid) pc.set(x, baseY, R.deep);
  }
}

// ════════════════════════════════════════ MACHINES ════════════════════════════════════════
export interface ArmLook {
  lit: number;
  mid: number;
  dark: number;
  joint: number;
}
export const ARM_STEEL: ArmLook = { lit: C.ink9, mid: C.ink7, dark: C.ink5, joint: C.ink4 };
/** Industrial yellow: reads against grey hulls and black space alike. */
export const ARM_YELLOW: ArmLook = { lit: C.yel1, mid: C.yel0, dark: C.org1, joint: C.ink3 };

/** Thick link from a to b (lit on its upper edge). */
function link(pc: PixelCanvas, ax: number, ay: number, bx: number, by: number, look: ArmLook) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    pc.set(x, y + 1, look.dark);
    pc.set(x, y, look.mid);
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    if (pc.get(x, y - 1) !== look.mid) pc.set(x, y - 1, i % 5 === 2 ? look.mid : look.lit);
  }
}

function joint(pc: PixelCanvas, x: number, y: number, look: ArmLook) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  pc.rect(rx - 1, ry - 1, 3, 3, look.joint);
  pc.set(rx - 1, ry - 1, look.mid);
  pc.set(rx, ry, look.lit);
}

/**
 * A two-link robot arm from a shoulder at (sx, sy) reaching for (tx, ty) (inverse kinematics; the
 * elbow bends up when `up`). Draws the tool at the tip and returns it. A torch spits sparks into
 * the glow layer when `spark` is set.
 */
export function roboArm(
  pc: PixelCanvas,
  g: PixelCanvas | null,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  opts: { up?: boolean; tool?: 'grip' | 'torch' | 'claw'; spark?: boolean; seed?: number; look?: ArmLook; mount?: 'top' | 'floor' | 'none' } = {},
): [number, number] {
  const look = opts.look ?? ARM_YELLOW;
  let dx = tx - sx;
  let dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.5;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const min = Math.abs(l1 - l2) + 0.5;
  if (d < min) d = min;
  const a = Math.atan2(dy, dx);
  const cb = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const b = Math.acos(cb) * (opts.up === false ? 1 : -1);
  const ex = sx + Math.cos(a + b) * l1;
  const ey = sy + Math.sin(a + b) * l1;
  const px = sx + dx;
  const py = sy + dy;
  // the mount
  if (opts.mount !== 'none') {
    if (opts.mount === 'floor') {
      pc.rect(Math.round(sx) - 3, Math.round(sy), 7, 3, look.dark);
      pc.hline(Math.round(sx) - 3, Math.round(sy), 7, look.mid);
    } else {
      pc.rect(Math.round(sx) - 3, Math.round(sy) - 2, 7, 3, look.dark);
      pc.hline(Math.round(sx) - 3, Math.round(sy) - 2, 7, look.lit);
    }
  }
  link(pc, sx, sy, ex, ey, look);
  link(pc, ex, ey, px, py, look);
  joint(pc, sx, sy, look);
  joint(pc, ex, ey, look);
  // the tool, pointing along the forearm
  const ux = (px - ex) / Math.max(0.1, Math.hypot(px - ex, py - ey));
  const uy = (py - ey) / Math.max(0.1, Math.hypot(px - ex, py - ey));
  const tool = opts.tool ?? 'grip';
  const rx = Math.round(px);
  const ry = Math.round(py);
  if (tool === 'torch') {
    pc.set(rx, ry, C.ink4);
    const nx = Math.round(px + ux * 2);
    const ny = Math.round(py + uy * 2);
    pc.set(Math.round(px + ux), Math.round(py + uy), C.ink6);
    if (opts.spark) {
      pc.set(nx, ny, C.white);
      g?.set(nx, ny, C.yel2);
      for (let k = 0; k < 4; k++) {
        const sxp = nx + Math.round((hash2(k, opts.seed ?? 0, 3) - 0.5) * 6);
        const syp = ny + Math.round((hash2(k, opts.seed ?? 0, 4) - 0.2) * 5);
        const c = k % 2 ? C.yel1 : C.org2;
        pc.set(sxp, syp, c);
        g?.set(sxp, syp, c);
      }
    }
  } else if (tool === 'claw') {
    pc.set(rx, ry, C.ink4);
    pc.set(Math.round(px + ux * 2 - uy * 2), Math.round(py + uy * 2 + ux * 2), look.lit);
    pc.set(Math.round(px + ux * 2 + uy * 2), Math.round(py + uy * 2 - ux * 2), look.mid);
  } else {
    // a gripper: two prongs across the forearm
    const qx = -uy;
    const qy = ux;
    pc.set(rx, ry, look.joint);
    pc.set(Math.round(px + qx * 2), Math.round(py + qy * 2), look.lit);
    pc.set(Math.round(px - qx * 2), Math.round(py - qy * 2), look.mid);
    pc.set(Math.round(px + qx * 2 + ux), Math.round(py + qy * 2 + uy), look.lit);
    pc.set(Math.round(px - qx * 2 + ux), Math.round(py - qy * 2 + uy), look.mid);
  }
  return [px, py];
}

/** A small warning light (2×2): amber, or red when it's serious. */
export function warnLight(pc: PixelCanvas, g: PixelCanvas, x: number, y: number, on: boolean, red: boolean) {
  const c = red ? C.red3 : C.org2;
  const off = red ? C.red1 : C.org0;
  pc.rect(x, y, 2, 2, on ? c : off);
  pc.set(x, y, on ? (red ? C.org1 : C.yel1) : off);
  if (on) {
    g.rect(x, y, 2, 2, c);
    g.set(x, y, red ? C.org1 : C.yel1);
  }
}

/**
 * A quarantine net thrown over a drifting foundry: a diamond mesh in hazard colours (amber, then red),
 * anchored at the corners, with warning lights that blink and a QUARANTINE plate. `level` 1..3.
 */
export function quarantineNet(pc: PixelCanvas, g: PixelCanvas, x0: number, y0: number, w: number, h: number, level: number, f: number) {
  const red = level >= 3;
  const col = red ? C.red2 : C.org1;
  const hi = red ? C.red3 : C.org2;
  const step = level >= 2 ? 6 : 8;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || x === x0 + w - 1 || y === y0;
      const mesh = (x - x0 + y - y0) % step === 0 || (x - x0 - (y - y0) + h * step) % step === 0;
      if (edge) {
        if ((x + y) % 3 !== 0) pc.set(x, y, hi);
      } else if (mesh && (x * 3 + y) % 5 !== 0) pc.set(x, y, (x + y) % 4 === 0 ? hi : col);
    }
  }
  // corner anchors and the cables to the truss
  for (const ax of [x0, x0 + w - 1]) {
    pc.rect(ax - 1, y0 - 1, 3, 3, C.ink4);
    pc.set(ax, y0 - 1, C.ink8);
  }
  // warning lights along the top, blinking in turn
  const n = 1 + level;
  for (let k = 0; k < n; k++) {
    const lx = x0 + Math.round(((k + 0.5) / n) * (w - 2));
    warnLight(pc, g, lx, y0 - 3, (k + f) % 2 === 0, red || (level >= 2 && k % 2 === 0));
  }
  const t = 'QUARANTINE';
  const tw = measureText(t);
  const px = x0 + Math.max(2, Math.round((w - tw) / 2) - 2);
  const py = y0 + 6;
  pc.rect(px, py, tw + 4, 7, red ? C.red1 : C.ink1);
  pc.box(px, py, tw + 4, 7, hi);
  drawText(pc, t, px + 2, py + 1, red ? C.yel1 : C.org2);
  if ((f >> 1) % 2 === 0 || level < 3) drawText(g, t, px + 2, py + 1, red ? C.org1 : C.org2);
}

/** A stiff flag on a mast (no wind: a top bar holds it out), in a ramp's colours, with initials. */
export function stiffFlag(pc: PixelCanvas, g: PixelCanvas | null, x: number, baseY: number, h: number, r: Ramp4, text = '') {
  pc.vline(x, baseY - h, h, C.ink8);
  pc.vline(x + 1, baseY - h, h, C.ink6);
  const fw = Math.max(13, measureText(text) + 6);
  pc.hline(x, baseY - h, fw + 1, C.ink8);
  pc.rect(x + 2, baseY - h + 1, fw - 1, 9, r.base);
  pc.hline(x + 2, baseY - h + 1, fw - 1, r.lit);
  pc.hline(x + 2, baseY - h + 9, fw - 1, r.mid);
  if (text) {
    drawText(pc, text, x + 4, baseY - h + 3, r.hi === r.lit ? C.white : r.hi);
    g?.hline(x + 2, baseY - h + 9, 1, r.lit);
  } else {
    pc.rect(x + 5, baseY - h + 4, fw - 7, 3, r.lit);
  }
  pc.set(x, baseY - h - 1, C.ink9);
}

/**
 * The habitat cylinder from outside (len × 2r): land strips and window strips run along it, its
 * sunward end cap is lit, three mirror petals fan from the far end and a docking spindle sticks out.
 * Glow: the window strips' daylight leaking out, docking lights.
 */
export function habCylinder(len: number, r: number, seed: number): { base: PixelCanvas; glow: PixelCanvas } {
  const petal = Math.round(r * 1.8);
  const W = len + petal + 8;
  const H = r * 2 + petal + 4;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const cy = Math.round(H / 2);
  const x0 = 4;
  const x1 = x0 + len;
  // mirror petals at the far (right) end, hinged open to throw sunlight into the windows
  for (const s of [-1, 1]) {
    for (let k = 0; k < petal; k++) {
      const x = x1 - 2 + Math.round(k * 0.55);
      const y = cy + s * (r - 1 + k);
      pc.set(x, y, k % 3 === 0 ? C.white : C.sky5);
      pc.set(x + 1, y, C.ink6);
    }
  }
  // the body: shaded across its height (sun on the upper left), stripes along its length
  for (let y = cy - r; y <= cy + r; y++) {
    const v = (y + 0.5 - cy) / r;
    if (Math.abs(v) > 1) continue;
    const band = Math.floor(((v + 1) / 2) * 6);
    const window = band === 1 || band === 3 || band === 5;
    const l = 0.6 - v * 0.55;
    for (let x = x0; x <= x1; x++) {
      let c: number;
      if (window) {
        c = l > 0.7 ? C.sky4 : l > 0.35 ? C.blu4 : C.blu2;
        if ((x + seed) % 9 === 0) c = C.ink6;
        if (bayer(x, y) < 2 && l > 0.5) c = C.white;
        if ((x + seed) % 9 !== 0 && hash2(x >> 2, y, seed) > 0.7) g.set(x, y, C.sky4);
      } else {
        c = l > 0.85 ? C.white : l > 0.6 ? C.ink9 : l > 0.35 ? C.ink8 : l > 0.1 ? C.ink7 : C.ink6;
        if ((x + seed * 3) % 12 === 0) c = l > 0.5 ? C.ink7 : C.ink5;
        // fields seen through a gap in the shielding
        if (band === 2 && hash2(x >> 3, seed, 7) > 0.75) c = ditherAt(x, y, 0.5) ? C.grn5 : C.grn4;
      }
      pc.set(x, y, c);
    }
  }
  // end caps: the sunward one lit, a rim on the far one
  for (let y = cy - r; y <= cy + r; y++) {
    const v = (y + 0.5 - cy) / r;
    const e = Math.round(Math.sqrt(Math.max(0, 1 - v * v)) * 3);
    for (let k = 0; k < e; k++) pc.set(x0 - k, y, k === e - 1 ? C.ink8 : C.white);
    pc.set(x1, y, C.ink5);
    pc.set(x1 + 1, y, C.ink4);
  }
  // the docking spindle and its lights
  pc.hline(x0 - 4, cy, 4, C.ink8);
  pc.set(x0 - 5, cy, C.cyn5);
  g.set(x0 - 5, cy, C.cyn5);
  pc.set(x1 + 2, cy, C.red3);
  g.set(x1 + 2, cy, C.red3);
  return { base: pc, glow: g };
}

/** A maintenance drone (5×4, facing right): body, sensor eye, a blinking nav light. */
export function droneFrames(eye: number = C.cyn5): PixelCanvas[] {
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(6, 4);
    pc.hline(1, 0, 3, C.ink9);
    pc.rect(0, 1, 5, 2, C.ink7);
    pc.hline(0, 1, 5, C.ink8);
    pc.set(4, 1, eye);
    pc.set(0, 3, C.ink5);
    pc.set(4, 3, C.ink5);
    pc.set(5, 2, f ? C.red3 : C.red1);
    pc.set(2, 3, f ? C.ink5 : C.cyn4);
    return pc;
  });
}

/** A space tug (16×7, facing right): a stubby hull, cockpit glass, grapple and an engine glow. */
export function tugFrames(r: Ramp4): PixelCanvas[] {
  return [0, 1].map((f) => {
    const pc = new PixelCanvas(17, 7);
    pc.rect(3, 1, 10, 5, C.ink8);
    pc.hline(3, 1, 10, C.white);
    pc.hline(3, 5, 10, C.ink6);
    pc.hline(3, 3, 10, r.base);
    pc.rect(11, 2, 2, 2, C.sky4);
    pc.set(12, 2, C.white);
    pc.rect(13, 2, 2, 3, C.ink6);
    pc.set(15, 2, C.ink8);
    pc.set(15, 4, C.ink8);
    pc.set(16, 3, C.ink7);
    // the engine on the back
    pc.rect(1, 2, 2, 3, C.ink5);
    pc.set(0, 3, f ? C.cyn6 : C.cyn5);
    pc.set(0, 2, f ? C.cyn4 : 0);
    pc.set(0, 4, f ? 0 : C.cyn4);
    return pc;
  });
}

/**
 * Self-replication: a copy of `src` being printed from the bottom up. Below `cut` the real thing;
 * above it the blueprint: the silhouette's outline in marching cyan ants and a faint hologram fill.
 */
export function blueprintReveal(src: PixelCanvas, g: PixelCanvas, cut: number, phase: number): PixelCanvas {
  const pc = new PixelCanvas(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (!c) continue;
      if (y >= cut) {
        pc.set(x, y, c);
        continue;
      }
      const edge = !src.get(x - 1, y) || !src.get(x + 1, y) || !src.get(x, y - 1) || !src.get(x, y + 1);
      if (edge) {
        if ((x + y + phase) % 3 !== 0) {
          pc.set(x, y, C.cyn4);
          g.set(x, y, C.cyn5);
        }
      } else if (bayer(x, y) === 0 || (y === cut - 1 && x % 2 === 0)) {
        pc.set(x, y, C.cyn2);
        if (bayer(x, y) === 0 && (x + phase) % 2 === 0) g.set(x, y, C.cyn3);
      }
    }
  }
  return pc;
}

/** Copy the glow of `src` below `cut` (the printed part's lights come on as it's built). */
export function glowBelow(src: PixelCanvas, g: PixelCanvas, cut: number) {
  for (let y = Math.max(0, cut); y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.get(x, y);
    if (c) g.set(x, y, c);
  }
}

/** A text plate (dark, with lit text that also glows). Returns its width. */
export function plate(pc: PixelCanvas, g: PixelCanvas | null, text: string, x: number, y: number, fg: number, bg: number = C.ink1, rim?: number): number {
  const tw = measureText(text) + 4;
  pc.rect(x, y, tw, 7, bg);
  if (rim !== undefined) pc.box(x, y, tw, 7, rim);
  drawText(pc, text, x + 2, y + 1, fg);
  if (g) drawText(g, text, x + 2, y + 1, fg);
  return tw;
}
