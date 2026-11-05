/**
 * Act V: Ring One (site 'ring', from `ringView`), compute in sunlight that never sets. Rack halls
 * stand on the ring's deck, their faces alive with LEDs and collector sails tilted to the sun on
 * top; under the deck (the ground band in space.ts) huge dark radiator fins hang into the shadow.
 * Maintenance drones zip along the racks. The hub in the middle is the minds' home: a dark sphere
 * on struts with a spindle of dishes, marked by what became of Bit — a warm gold Bit sigil
 * (co-steward), a constellation of lights (a free mind) or a red interlock ring (the leash). At the
 * end of the ring a construction head prints the next segment. The minds' mood sets the light:
 * calm cyan when high, restless violet flicker when low; Solar Maximum's storm makes it all flicker.
 * Pure PixelCanvas code with palette indices only.
 */
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import type { FacilityArt, Mover } from './art';
import { emblem, CHARTER } from './act3kit';
import { blueprintReveal, droneFrames, glowBelow, plate, roboArm, warnLight } from './act5kit';

/** LED colours by mood (0 restless … 2 calm): lit, dim. */
const MOOD: { on: number[]; dim: number; seam: number }[] = [
  { on: [C.vio4, C.pnk0, C.vio5, C.vio3], dim: C.vio1, seam: C.vio4 },
  { on: [C.cyn5, C.cyn4, C.vio4, C.cyn5], dim: C.cyn1, seam: C.cyn4 },
  { on: [C.cyn5, C.cyn4, C.cyn6, C.cyn5], dim: C.cyn1, seam: C.cyn5 },
];

export const RACK_W = 140;
const RACK_H = 92;

/** The ring's plinth along the bottom rows of a piece (meets the deck in the ground band). */
function plinth(pc: PixelCanvas, W: number, base: number) {
  for (let x = 0; x < W; x++) {
    pc.set(x, base - 3, C.ink8);
    pc.set(x, base - 2, C.ink6);
    pc.set(x, base - 1, x % 12 === 0 ? C.ink4 : C.ink5);
    pc.set(x, base, C.ink9);
  }
}

/** One rack hall's art at frame f (also the construction head's target). */
function drawRack(pc: PixelCanvas, g: PixelCanvas, f: number, frames: number, mood: number, storm: number, density: number, seed: number, num: number) {
  const W = RACK_W;
  const base = RACK_H - 1;
  const top = base - 36;
  const M = MOOD[Math.max(0, Math.min(2, mood))];
  plinth(pc, W, base);
  // collector sails on masts, tilted up to the sun
  for (let k = 0; k < 6; k++) {
    const mx = 10 + k * 22;
    pc.vline(mx + 8, top - 10, 10, C.ink7);
    pc.vline(mx + 9, top - 10, 10, C.ink5);
    for (let v = 0; v < 8; v++) {
      for (let u = 0; u < 19; u++) {
        const x = mx + u + Math.round(v * 0.5);
        const y = top - 18 + v - Math.round(u * 0.18);
        // cells between the frame struts, each shaded a step down along its lower edge
        let c = v === 0 ? C.sky4 : u % 5 === 0 || v % 4 === 0 ? C.ink6 : v % 4 === 3 ? C.blu2 : C.blu3;
        const glint = (u + f * 4 + k * 5) % 23;
        if (v > 0 && glint < 2) c = glint === 0 ? C.white : C.sky4;
        if (storm && hash2(u + f * 7, v + k, 41) < storm * 0.06) c = hash2(u, v, f) > 0.5 ? C.cyn6 : C.vio5;
        pc.set(x, y, c);
        if (c === C.white || c === C.cyn6 || c === C.vio5) g.set(x, y, c === C.white ? C.sky5 : c);
      }
    }
  }
  // the rack towers
  for (let x0 = 2; x0 < W - 6; x0 += 8) {
    for (let y = top; y < base - 3; y++) {
      for (let k = 0; k < 7; k++) {
        const x = x0 + k;
        let c = k === 0 ? C.ink8 : k === 6 ? C.ink3 : C.ink4;
        if (y === top) c = C.white;
        else if (y === top + 1) c = k === 0 ? C.white : C.ink7;
        pc.set(x, y, c);
      }
      pc.set(x0 + 7, y, C.ink1);
    }
    // LEDs: two columns per tower
    for (let y = top + 4; y < base - 6; y += 2) {
      for (const k of [2, 4]) {
        const x = x0 + k;
        const r = hash2(x, y, seed + f * (mood === 0 ? 13 : 0));
        let on = r < 0.25 + density * 0.2;
        if (storm && hash2(x, y, f * 17 + 3) < storm * 0.15) on = false;
        let c = M.on[Math.floor(hash2(x, y, seed + 2) * M.on.length)];
        // calm: a slow wave of brightness travelling along the ring
        if (mood === 2 && Math.abs(((x / 6 - f * (24 / frames)) % 24) + 24) % 24 < 2) c = C.cyn6;
        if (mood === 0 && hash2(x, y, f * 7 + 5) < 0.3) c = C.pnk1;
        // only the lit ones show: the dark ones are just the rack's face
        if (!on) continue;
        pc.set(x, y, c);
        g.set(x, y, c);
      }
    }
  }
  // heat pipes down through the plinth to the fins
  for (let x = 12; x < W; x += 26) {
    pc.vline(x, base - 5, 3, C.ink5);
    pc.set(x, base - 2, C.red1);
  }
  plate(pc, g, `R-${String(num).padStart(2, '0')}`, 6, base - 12, M.seam);
}

export function ringRack(mood: number, storm: number, density: number, seed: number, num: number): FacilityArt {
  const W = RACK_W;
  const H = RACK_H;
  const base = H - 1;
  const n = 4;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < n; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    drawRack(pc, g, f, n, mood, storm, density, seed, num);
    frames.push(pc);
    glows.push(g);
  }
  const top = base - 36;
  const eye = mood === 0 ? C.vio5 : C.cyn5;
  const movers: Mover[] = [
    { frames: droneFrames(eye), path: [[8, top - 22], [W - 10, top - 26]], speed: 10 + (seed % 3) * 2, phase: hash2(seed, 1, 3), pingpong: true },
    { frames: droneFrames(eye), path: [[W - 12, base - 14], [16, base - 18]], speed: 7, phase: hash2(seed, 2, 3), pingpong: true },
  ];
  return { base: frames, glow: glows, points: {}, movers, fps: mood === 0 ? 6 : mood === 1 ? 3 : 2 };
}

export const HUB_W = 190;
const HUB_H = 122;

/**
 * The hub: the minds' sanctum. A dark tower of glass and seams on A-frame struts, radiator wings
 * swept out from its shoulders, a spire of dishes, and on its face a great disc carrying the sigil.
 * `fate` 'costeward' | 'free' | 'leash' | '' (the Charter's emblem); `seat` 'full' | 'advisory' |
 * 'none' | '' (the Council's banners hung from the wings).
 */
export function ringHub(fate: string, mood: number, storm: number, seat: string): FacilityArt {
  const W = HUB_W;
  const H = HUB_H;
  const base = H - 1;
  const cx = 95;
  const dy = base - 60;
  const M = MOOD[Math.max(0, Math.min(2, mood))];
  const tTop = base - 98;
  const halfAt = (y: number) => Math.round(13 + ((y - tTop) / (base - 4 - tTop)) * 9);
  const n = 4;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  // the constellation of a free mind: points around the tower, joined in order
  const stars: [number, number][] = [];
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + hash2(i, 1, 7) * 0.35;
    const rr = 34 + hash2(i, 2, 7) * 22;
    stars.push([Math.round(cx + Math.cos(a) * rr * 1.5), Math.round(dy - 6 + Math.sin(a) * rr * 0.85)]);
  }
  for (let f = 0; f < n; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    plinth(pc, W, base);
    // the interlock's back half (behind the tower)
    const lockRing = (front: boolean) => {
      for (let a = 0; a < 200; a++) {
        const t = (a / 200) * Math.PI * 2;
        if (Math.sin(t) > 0 !== front) continue;
        for (let k = 0; k < 3; k++) {
          const x = Math.round(cx + Math.cos(t) * (40 - k * 0.3));
          const y = Math.round(dy + 4 + Math.sin(t) * 9 + k);
          pc.set(x, y, k === 0 ? (front ? C.red3 : C.red2) : front ? C.red2 : C.red1);
        }
      }
      for (let i = 0; i < 10; i++) {
        const t = (i / 10) * Math.PI * 2 + 0.3;
        if (Math.sin(t) > 0 !== front) continue;
        const x = Math.round(cx + Math.cos(t) * 40);
        const y = Math.round(dy + 4 + Math.sin(t) * 9);
        pc.rect(x - 2, y - 2, 5, 5, C.ink2);
        pc.hline(x - 2, y - 2, 5, C.ink5);
        const on = (i + f) % 2 === 0;
        pc.set(x, y, on ? C.red3 : C.red1);
        if (on && front) g.set(x, y, C.red3);
      }
    };
    if (fate === 'leash') lockRing(false);
    // radiator wings swept out from the shoulders
    for (const s of [-1, 1]) {
      for (let k = 0; k < 60; k++) {
        const x = cx + s * (16 + k);
        const y0 = base - 86 + Math.round(k * 0.55);
        for (let j = 0; j < 7 - Math.floor(k / 14); j++) {
          const c = j === 0 ? (s < 0 ? C.ink5 : C.ink4) : k % 6 === 0 ? C.ink3 : (k + j) % 9 === 4 ? C.red0 : C.ink2;
          pc.set(x, y0 + j, c);
        }
      }
    }
    // the Council seat: banners hanging from the wings
    const banners = seat === 'full' ? 2 : seat === 'advisory' ? 1 : 0;
    for (let i = 0; i < banners; i++) {
      const bx = i ? cx + 46 : cx - 52;
      const by = base - 86 + Math.round(Math.abs(bx - cx - (i ? 16 : -16)) * 0.55) + 6;
      pc.rect(bx, by, 7, 12, CHARTER.field);
      pc.vline(bx + 6, by, 12, CHARTER.fieldDark);
      pc.set(bx + 3, by + 4, C.white);
      pc.set(bx + 2, by + 5, C.yel0);
      pc.set(bx + 4, by + 5, C.yel0);
      pc.set(bx, by + 12, CHARTER.field);
      pc.set(bx + 6, by + 12, CHARTER.fieldDark);
    }
    // the A-frame struts
    for (const s of [-1, 1]) {
      pc.line(cx + s * 46, base - 3, cx + s * 18, base - 34, C.ink7);
      pc.line(cx + s * 47, base - 3, cx + s * 19, base - 34, C.ink5);
      pc.line(cx + s * 36, base - 3, cx + s * 30, base - 17, C.ink6);
    }
    // the tower: dark glass, lit on the left, seams glowing with the minds' mood
    for (let y = tTop; y < base - 3; y++) {
      const hw = halfAt(y);
      for (let x = cx - hw; x <= cx + hw; x++) {
        const t = (x - (cx - hw)) / (2 * hw);
        let c = t < 0.08 ? C.ink6 : t < 0.45 ? C.ink4 : t < 0.9 ? C.ink3 : C.ink2;
        if (t >= 0.45 && t < 0.55 && ditherAt(x, y, 0.5)) c = C.ink4;
        if ((y - tTop) % 8 === 0) c = t < 0.45 ? C.ink5 : C.ink2;
        pc.set(x, y, c);
      }
      for (const sx of [-0.55, 0, 0.55]) {
        const x = Math.round(cx + sx * hw);
        if ((y + f * 2) % 3 === 0) continue;
        const on = !(storm && hash2(x, y, f * 13) < storm * 0.2);
        pc.set(x, y, on ? M.seam : C.ink2);
        if (on && y % 2 === 0) g.set(x, y, M.seam);
      }
    }
    // the spire and its dishes
    for (let y = tTop - 16; y < tTop; y++) {
      const hw = Math.max(0, Math.round(((y - (tTop - 16)) / 16) * 12));
      for (let x = cx - hw; x <= cx + hw; x++) pc.set(x, y, x < cx ? C.ink5 : C.ink3);
    }
    for (let y = tTop - 22; y < tTop - 14; y++) pc.set(cx, y, C.ink8);
    pc.set(cx, tTop - 23, f % 2 ? C.red1 : C.red3);
    if (f % 2 === 0) g.set(cx, tTop - 23, C.red3);
    for (const [ddx, ddy, sz] of [[-11, tTop - 4, 5], [10, tTop - 10, 4]] as [number, number, number][]) {
      for (let k = -sz; k <= sz; k++) {
        const x = cx + ddx + k;
        const y = ddy - Math.round(k * 0.5);
        pc.set(x, y, C.white);
        pc.set(x + 1, y + 1, Math.abs(k) < sz - 1 ? C.ink7 : C.ink5);
      }
    }
    // lights up the tower's floors
    for (let y = tTop + 4; y < base - 8; y += 8) {
      const hw = halfAt(y);
      for (let x = cx - hw + 3; x < cx + hw - 2; x += 3) {
        if (hash2(x, y, 3) < 0.55) continue;
        const c = M.on[Math.floor(hash2(x, y, 4) * M.on.length)];
        const on = mood === 0 ? hash2(x, y, f + 7) > 0.35 : true;
        pc.set(x, y + 3, on ? c : M.dim);
        if (on) g.set(x, y + 3, c);
      }
    }
    // the disc on the tower's face
    const R = 17;
    for (let y = dy - R - 1; y <= dy + R + 1; y++) for (let x = cx - R - 1; x <= cx + R + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - dy);
      if (d > R + 0.5) continue;
      const rim = d > R - 2.2;
      const l = (-(x - cx) - (y - dy)) / R;
      pc.set(x, y, rim ? (l > 0.3 ? C.ink9 : l > -0.3 ? C.ink7 : C.ink5) : d > R - 3 ? C.ink3 : C.ink1);
    }
    if (fate === 'costeward') {
      const pulse = f % 2 === 0;
      for (let a = 0; a < 96; a++) {
        const t = (a / 96) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(t) * 12.5);
        const y = Math.round(dy + Math.sin(t) * 12.5);
        pc.set(x, y, C.yel0);
        g.set(x, y, pulse ? C.yel1 : C.yel0);
      }
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(t) * 21);
        const y = Math.round(dy + Math.sin(t) * 21);
        pc.set(x, y, C.yel1);
        g.set(x, y, pulse || k % 2 ? C.yel1 : C.yel0);
      }
      // Bit's face: a rounded screen, two eyes and a smile, in gold
      for (let y = dy - 6; y <= dy + 5; y++) for (let x = cx - 8; x <= cx + 8; x++) {
        if (Math.abs(x - cx) === 8 && (y === dy - 6 || y === dy + 5)) continue;
        const edge = Math.abs(x - cx) === 8 || y === dy - 6 || y === dy + 5;
        pc.set(x, y, edge ? C.yel1 : C.org0);
        if (edge) g.set(x, y, C.yel0);
      }
      for (const ex of [cx - 4, cx + 3]) {
        pc.rect(ex, dy - 3, 2, 3, C.yel2);
        g.rect(ex, dy - 3, 2, 3, C.yel2);
      }
      for (let k = -3; k <= 3; k++) {
        const y = dy + 2 + (Math.abs(k) < 3 ? 1 : 0);
        pc.set(cx + k, y, C.yel1);
        g.set(cx + k, y, C.yel1);
      }
    } else if (fate === 'free') {
      for (let i = 0; i + 1 < stars.length; i++) {
        const [x0, y0] = stars[i];
        const [x1, y1] = stars[i + 1];
        const len = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
        for (let k = 0; k <= len; k += 2) {
          const x = Math.round(x0 + ((x1 - x0) * k) / len);
          const y = Math.round(y0 + ((y1 - y0) * k) / len);
          if (pc.get(x, y) && Math.hypot(x - cx, y - dy) < R) continue;
          pc.set(x, y, C.cyn2);
          if ((k + f * 2) % 8 === 0) g.set(x, y, C.cyn3);
        }
      }
      stars.forEach(([x, y], i) => {
        const bright = (i + f) % 4 === 0;
        pc.set(x, y, bright ? C.white : C.cyn6);
        g.set(x, y, bright ? C.white : C.cyn5);
        if (bright) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          pc.set(x + ex, y + ey, C.cyn4);
          g.set(x + ex, y + ey, C.cyn4);
        }
      });
      // and a small cluster of its own on the disc
      for (let i = 0; i < 7; i++) {
        const x = cx + Math.round((hash2(i, 5, 2) - 0.5) * 20);
        const y = dy + Math.round((hash2(i, 6, 2) - 0.5) * 20);
        const on = (i + f) % 3 !== 0;
        pc.set(x, y, on ? C.white : C.cyn4);
        if (on) g.set(x, y, C.cyn6);
      }
    } else if (fate === 'leash') {
      // red clamps on the disc, a lock in the middle
      for (const [ex, ey] of [[0, -R], [0, R - 2], [-R, -1], [R - 2, -1]] as [number, number][]) {
        pc.rect(cx + ex - 1, dy + ey - 1, 3, 4, C.red2);
        pc.set(cx + ex, dy + ey, C.red3);
      }
      pc.rect(cx - 4, dy - 2, 9, 7, C.red2);
      pc.box(cx - 4, dy - 2, 9, 7, C.red3);
      for (let k = -3; k <= 3; k++) pc.set(cx + k, dy - 4 - Math.round(Math.sqrt(Math.max(0, 9 - k * k)) * 0.6), C.ink7);
      pc.set(cx, dy + 1, C.ink1);
      pc.set(cx, dy + 2, C.ink1);
      if (f % 2 === 0) g.rect(cx - 3, dy - 1, 7, 5, C.red3);
    } else {
      emblem(pc, g, cx - 7, dy - 5, true);
    }
    if (fate === 'leash') lockRing(true);
    if (fate === 'leash') plate(pc, g, 'INTERLOCK', cx - 20, base - 15, C.red3, C.ink1, C.red2);
    else plate(pc, g, 'RING ONE', cx - 18, base - 15, M.seam, C.ink1);
    frames.push(pc);
    glows.push(g);
  }
  const eye = mood === 0 ? C.vio5 : C.cyn5;
  const movers: Mover[] = [{ frames: droneFrames(eye), path: [[14, dy - 40], [W - 16, dy - 50]], speed: 8, phase: 0.2, pingpong: true }];
  return { base: frames, glow: glows, points: {}, movers, fps: mood === 0 ? 4 : 2 };
}

export const HEAD_W = 214;
const HEAD_H = 100;

/** The ring's construction head: the next rack printed out of its blueprint by a walking builder. */
export function ringHead(mood: number, storm: number, start: boolean): FacilityArt {
  const W = HEAD_W;
  const H = HEAD_H;
  const base = H - 1;
  const src = new PixelCanvas(RACK_W, RACK_H);
  const srcG = new PixelCanvas(RACK_W, RACK_H);
  drawRack(src, srcG, 0, 4, mood, 0, 2, 5, 0);
  // the blueprint's lines come from the bare racks (no LEDs lit), so it reads as a drawing
  const plain = new PixelCanvas(RACK_W, RACK_H);
  drawRack(plain, new PixelCanvas(RACK_W, RACK_H), 0, 4, mood, 0, -10, 5, 0);
  const K = 10;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const oy = H - RACK_H;
  for (let k = 0; k < K; k++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    plinth(pc, W, base);
    const p = 0.12 + 0.84 * (k / (K - 1));
    const cut = Math.round(base - 56 + (1 - p) * 56) - oy;
    const g2 = new PixelCanvas(RACK_W, RACK_H);
    const part = blueprintReveal(src, g2, cut, k, plain);
    glowBelow(srcG, g2, Math.max(cut, RACK_H - 30));
    pc.blit(part, 0, oy);
    g.blit(g2, 0, oy);
    // the builder: a walking machine straddling the deck, its arm printing along the cut
    const bx = RACK_W + 18;
    const by = base - 30;
    for (const [lx, fx] of [[bx - 2, bx - 14], [bx + 24, bx + 36], [bx + 6, bx - 2], [bx + 16, bx + 24]] as [number, number][]) {
      const kx = Math.round((lx + fx) / 2);
      pc.line(lx, by + 8, kx, by - 2, C.ink7);
      pc.line(kx, by - 2, fx, base - 3, C.ink6);
      pc.set(fx, base - 4, C.ink4);
    }
    for (let y = by; y < by + 12; y++) for (let x = bx; x < bx + 24; x++) pc.set(x, y, y === by ? C.white : x < bx + 2 ? C.ink9 : x > bx + 20 ? C.ink6 : C.ink8);
    pc.hline(bx, by + 4, 24, C.yel0);
    pc.rect(bx + 16, by + 2, 5, 2, C.sky4);
    const u = (k * 0.31) % 1;
    const hx = 10 + Math.round((u < 0.5 ? u * 2 : 2 - u * 2) * (RACK_W - 24));
    const hy = Math.max(oy + 4, cut + oy);
    roboArm(pc, g, bx + 2, by + 1, hx, hy, 40, 36, { up: true, tool: 'torch', spark: true, seed: k * 5 });
    warnLight(pc, g, bx + 11, by - 3, k % 2 === 0, false);
    // stakes along the bare deck ahead
    for (let x = bx + 46; x < W - 4; x += 14) {
      pc.vline(x, base - 10, 7, C.ink7);
      const on = ((x / 14) | 0) % 2 === k % 2;
      pc.set(x, base - 11, on ? C.cyn5 : C.cyn2);
      if (on) g.set(x, base - 11, C.cyn5);
    }
    if (start) plate(pc, g, 'RING ONE', bx + 40, base - 30, C.cyn5, C.ink1, C.cyn3);
    if (storm && k % 3 === 0) for (let i = 0; i < 6 * storm; i++) {
      const x = Math.floor(hash2(i, k, 3) * RACK_W);
      const y = oy + Math.floor(hash2(i, k, 4) * 40);
      if (pc.get(x, y)) {
        pc.set(x, y, C.vio5);
        g.set(x, y, C.vio5);
      }
    }
    frames.push(pc);
    glows.push(g);
  }
  void bayer;
  return { base: frames, glow: glows, points: {}, fps: 1.5 };
}
