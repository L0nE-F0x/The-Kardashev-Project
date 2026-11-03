/**
 * Kip's launch complex (Act III): the vehicle assembly hall, the pad with its service tower,
 * lightning masts and water tower, the tank farm — and the heavy lifter itself, in the builder's
 * livery (Parabola orange, Kármán blue). The rocket is a separate sprite so it can lift off: the
 * pure `rocketPose` drives the launch cycle for both the scene and the headless preview.
 */
import type { Backdrop } from '../../content/sites';
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { FacilityArt } from './art';
import { beacon, facadeShade, fence, floodWash, pipe, tank, STEEL, vessel } from './draw';
import { bigText } from './plants';
import { CHARTER, emblem, person, type Ramp4, surveyStakes, theodolite } from './act3kit';
import { fieldColours } from './mega';

/** The rocket on the pad, for the scene to animate. */
export interface LaunchSpec {
  /** [0] standing (no flame), [1..3] engines burning (flicker). Same size. */
  frames: PixelCanvas[];
  /** Emissive overlays per frame (floodlit body when standing, the flame when burning). */
  glow: PixelCanvas[];
  /** Height of the rocket body in a frame (the flame hangs below it). */
  body: number;
  /** Bottom centre of the rocket standing on the pad, in the pad sprite's coordinates. */
  x: number;
  y: number;
  /** Seconds per launch cycle; 0 = it just stands on the pad. */
  period: number;
  /** Boil-off vents on the rocket (offsets from its bottom centre) that puff while it stands. */
  vents: [number, number][];
}

export const ROCKET_W = 17;
export const ROCKET_BODY = 98;
const FLAME = 26;

/** The heavy lifter in a builder's livery. */
export function rocketFrames(r: Ramp4): { frames: PixelCanvas[]; glow: PixelCanvas[] } {
  const W = ROCKET_W;
  const Hb = ROCKET_BODY;
  const H = Hb + FLAME;
  const cx = 8;
  const body = new PixelCanvas(W, H);
  const half = 5; // body is 11 px wide (cx-5 … cx+5)
  const shade = (x: number, y: number, lit: number, mid: number, dark: number) => {
    const t = (x - (cx - half)) / (half * 2);
    return t < 0.2 ? lit : t < 0.62 ? (t < 0.42 && ditherAt(x, y, 0.5) ? lit : mid) : t < 0.86 ? (ditherAt(x, y, 0.5) ? mid : dark) : dark;
  };
  // payload fairing: an ogive nose
  const fairing = 18;
  for (let y = 0; y < fairing; y++) {
    const k = y / fairing;
    const hw = Math.max(0, Math.round(half * Math.sqrt(1 - (1 - k) * (1 - k))));
    for (let x = cx - hw; x <= cx + hw; x++) body.set(x, y, shade(x, y, C.white, C.ink9, C.ink8));
  }
  body.hline(cx - half, fairing - 1, half * 2 + 1, C.ink7);
  // the mission patch: the Charter's emblem on the fairing
  body.rect(cx - 4, 8, 9, 7, CHARTER.field);
  emblem(body, null, cx - 4, 8);
  // second stage with a livery band
  for (let y = fairing; y < 34; y++) for (let x = cx - half; x <= cx + half; x++) body.set(x, y, shade(x, y, C.white, C.ink9, C.ink8));
  for (let y = 27; y < 31; y++) for (let x = cx - half; x <= cx + half; x++) body.set(x, y, shade(x, y, r.lit, r.base, r.mid));
  // interstage
  for (let y = 34; y < 38; y++) for (let x = cx - half; x <= cx + half; x++) body.set(x, y, shade(x, y, C.ink4, C.ink3, C.ink2));
  // the booster: white with a stripe and a big band, grid fins up top, legs folded down below
  for (let y = 38; y < Hb - 4; y++) {
    for (let x = cx - half; x <= cx + half; x++) {
      let c = shade(x, y, C.white, C.ink9, C.ink8);
      if (x === cx - 2 && y < Hb - 18) c = r.base;
      if (y >= Hb - 18 && y < Hb - 11) c = shade(x, y, r.lit, r.base, r.mid);
      if ((y - 38) % 14 === 13) c = C.ink7;
      body.set(x, y, c);
    }
  }
  for (const gx of [cx - half - 2, cx + half + 1]) {
    body.rect(gx, 39, 2, 3, C.ink3);
    body.set(gx + (gx < cx ? 0 : 1), 39, C.ink5);
  }
  // soot near the base (it has flown before)
  for (let y = Hb - 11; y < Hb - 4; y++) for (let x = cx - half; x <= cx + half; x++) if (bayer(x, y) < (y - (Hb - 11)) * 2) body.set(x, y, C.ink5);
  // folded landing legs
  for (const lx of [cx - half - 1, cx + half + 1]) {
    body.vline(lx, Hb - 16, 12, C.ink3);
    body.set(lx, Hb - 4, C.ink4);
  }
  // engine bells
  for (const ex of [cx - 4, cx - 1, cx + 2]) {
    body.rect(ex, Hb - 4, 3, 2, C.ink3);
    body.rect(ex - (ex === cx - 4 ? 0 : 0), Hb - 2, 3, 2, C.ink4);
    body.set(ex + 1, Hb - 1, C.ink2);
  }
  const frames: PixelCanvas[] = [body];
  // standing at night it is floodlit: the lit side glows cold white
  const g0 = new PixelCanvas(W, H);
  for (let y = 0; y < Hb; y++) {
    for (let x = 0; x < W; x++) {
      const c = body.get(x, y);
      if (!c) continue;
      const lit = c === C.white || c === C.ink9;
      if (lit && bayer(x, y) < 6 + ((Hb - y) / Hb) * 4) g0.set(x, y, c === C.white ? C.ice3 : C.ice2);
      if (c === r.lit || c === r.base) g0.set(x, y, r.lit);
    }
  }
  const glow: PixelCanvas[] = [g0];
  // burning: a flickering plume under the bells
  for (let f = 0; f < 3; f++) {
    const pc = body.clone();
    const g = new PixelCanvas(W, H);
    for (let y = Hb; y < H; y++) {
      const k = (y - Hb) / FLAME;
      const len = 0.75 + hash2(f, 3, 7) * 0.25;
      if (k > len) continue;
      const hw = Math.max(1, Math.round(3.5 + Math.sin(k * Math.PI) * 2.5 - k * 3 + (hash2(y, f, 2) - 0.5) * 1.6));
      for (let x = cx - hw; x <= cx + hw; x++) {
        const d = Math.abs(x - cx) / Math.max(1, hw);
        let c = d < 0.35 && k < 0.6 ? C.white : d < 0.6 ? C.yel2 : d < 0.85 ? C.yel1 : C.org2;
        if (k > 0.55) c = d < 0.5 ? C.yel1 : C.org1;
        if (k > 0.8) c = ditherAt(x, y + f, 0.5) ? C.org1 : C.org0;
        pc.set(x, y, c);
        g.set(x, y, c);
      }
    }
    // the flame lights the bottom of the booster
    for (let y = Hb - 22; y < Hb; y++) for (let x = 0; x < W; x++) if (pc.get(x, y) && bayer(x, y) < ((y - (Hb - 22)) / 22) * 12) g.set(x, y, C.org2);
    frames.push(pc);
    glow.push(g);
  }
  return { frames, glow };
}

/** Where the rocket is in its launch cycle (t in seconds since the cycle began). */
export function rocketPose(t: number, period: number): { dy: number; frame: number; phase: 'pad' | 'ignite' | 'flight' | 'gone'; burn: number } {
  if (period <= 0) return { dy: 0, frame: 0, phase: 'pad', burn: 0 };
  const u = ((t % period) + period) % period;
  const IGNITE = 8.5;
  const LIFT = 10;
  const frame = 1 + (Math.floor(u * 14) % 3);
  if (u < IGNITE) return { dy: 0, frame: 0, phase: 'pad', burn: 0 };
  if (u < LIFT) return { dy: 0, frame, phase: 'ignite', burn: (u - IGNITE) / (LIFT - IGNITE) };
  const s = u - LIFT;
  const dy = -Math.round(0.5 * 16 * s * s + 4 * s);
  if (dy < -420) return { dy, frame, phase: 'gone', burn: 1 };
  return { dy, frame, phase: 'flight', burn: 1 };
}

/** The glow of a launch: a wide dithered halo, white-hot at the core (additive, night only). */
export function launchFlash(): PixelCanvas {
  const W = 104;
  const H = 54;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H * 0.62) / (H * 0.62));
      if (d > 1) continue;
      if (bayer(x, y) >= Math.pow(1 - d, 1.7) * 15) continue;
      pc.set(x, y, d < 0.14 ? C.yel1 : d < 0.34 ? C.org2 : d < 0.6 ? C.org1 : C.red2);
    }
  }
  return pc;
}

// ── the pad ────────────────────────────────────────────────────────────────────────────────
export const PAD_W = 136;
export const PAD_H = 132;

export function launchPad(r: Ramp4, liftoff: boolean, backdrop: Backdrop): FacilityArt {
  const W = PAD_W;
  const H = PAD_H;
  const deck = H - 13;
  const tx = 40; // service tower left edge
  const tw = 13;
  const rx = tx + tw + 12; // rocket centre
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // lightning masts and the catenary between them (drawn first, behind)
    const masts = [8, W - 8];
    for (const mx of masts) {
      for (let y = 4; y < H - 3; y++) {
        const half = y > H - 40 ? 1 : 0;
        pc.set(mx - half, y, C.ink7);
        if (half) pc.set(mx + half, y, C.ink6);
        if (y % 8 === 0 && half) pc.set(mx, y, C.ink5);
      }
      pc.vline(mx, 0, 4, C.ink8);
      beacon(pc, g, mx, 0, (f + (mx > 50 ? 1 : 0)) % 2 === 0);
    }
    for (let x = masts[0]; x <= masts[1]; x++) {
      const t = (x - masts[0]) / (masts[1] - masts[0]);
      pc.set(x, 2 + Math.round(Math.sin(t * Math.PI) * 9), C.ink7);
    }
    // the water tower for the sound-suppression deluge
    const wx = W - 34;
    for (const lx of [wx, wx + 14]) pc.vline(lx, H - 62, 50, C.ink6);
    for (let y = H - 58; y < H - 14; y += 8) {
      pc.line(wx, y, wx + 14, y + 7, C.ink7);
      pc.line(wx + 14, y, wx, y + 7, C.ink7);
    }
    for (let y = H - 78; y < H - 62; y++) for (let x = wx - 3; x < wx + 18; x++) pc.set(x, y, x < wx + 3 ? C.white : x < wx + 10 ? C.ink9 : C.ink8);
    for (let x = wx - 2; x < wx + 17; x++) pc.set(x, H - 79, C.ink8);
    pc.hline(wx - 3, H - 70, 21, CHARTER.field);
    drawText(pc, 'H2O', wx + 2, H - 76, C.ink5);
    // the pad: a raised concrete deck over the flame trench, a ramp for the crawler
    for (let y = deck; y < H - 3; y++) {
      const ramp = Math.round((y - deck) * 2.2);
      for (let x = 14 - ramp; x < W - 14 + Math.round((y - deck) * 0.8); x++) {
        let c = y === deck ? C.ink9 : bayer(x, y) < 4 ? C.ink7 : C.ink8;
        if (x < 22 - ramp + 6 && y > deck) c = C.ink7;
        pc.set(x, y, c);
      }
    }
    // flame trench mouths (the exhaust comes out here)
    for (const side of [-1, 1]) {
      const mx = rx + side * 22;
      for (let y = deck + 3; y < H - 3; y++) for (let x = mx - 5; x < mx + 5; x++) pc.set(x, y, y === deck + 3 ? C.ink5 : C.ink1);
    }
    pc.rect(rx - 7, deck - 2, 15, 2, C.ink5); // launch mount
    pc.hline(rx - 7, deck - 2, 15, C.ink7);
    for (const lx of [rx - 6, rx + 5]) pc.vline(lx, deck - 6, 4, C.ink4); // hold-down clamps
    drawText(pc, 'PAD 1', 22, deck + 3, C.ink5);
    // the service tower: a lattice with platforms, the crew access arm, a lightning rod on top
    const ttop = 10;
    for (let y = ttop; y < deck; y++) {
      pc.set(tx, y, C.ink6);
      pc.set(tx + tw - 1, y, C.ink5);
      pc.set(tx + 5, y, r.base); // the lift shaft, clad in the builder's colour
      pc.set(tx + 6, y, r.mid);
      if ((y - ttop) % 6 === 0) {
        pc.hline(tx, y, tw, C.ink7);
        pc.line(tx, y, tx + 4, Math.min(deck, y + 5), C.ink6);
        pc.line(tx + 8, y, tx + tw - 1, Math.min(deck, y + 5), C.ink6);
      }
      if ((y - ttop) % 12 === 6) {
        g.set(tx - 1, y, C.yel1);
        g.set(tx + tw, y, C.yel1);
      }
    }
    pc.rect(tx - 2, ttop - 2, tw + 4, 3, C.ink5);
    pc.hline(tx - 2, ttop - 2, tw + 4, C.ink7);
    pc.vline(tx + 6, 0, ttop - 2, C.ink8);
    beacon(pc, g, tx + 6, 0, f === 1);
    // crew access arm (to the capsule level) and the propellant arms
    for (const [ay, len] of [[22, 12], [44, 11], [70, 11]] as [number, number][]) {
      pc.hline(tx + tw, ay, len, C.ink6);
      pc.hline(tx + tw, ay + 1, len, C.ink4);
      pc.vline(tx + tw + len - 1, ay - 1, 3, C.ink5);
    }
    pc.rect(tx + tw, 21, 6, 4, C.ink7);
    g.rect(tx + tw + 1, 22, 4, 2, C.yel1);
    // floodlight masts aimed at the rocket
    for (const [lx, top] of [[24, 56], [W - 50, 64]] as [number, number][]) {
      pc.vline(lx, top, deck - top, C.ink6);
      pc.rect(lx - 2, top - 2, 5, 2, C.ink4);
      g.rect(lx - 2, top - 2, 5, 2, C.yel2);
    }
    floodWash(pc, g, tx, ttop, tw, deck - ttop, 0.3, false);
    // pipes running off to the tank farm
    pipe(pc, rx + 6, deck - 4, W - rx - 6, null, C.ink8, C.ink6);
    pipe(pc, wx + 14, H - 16, W - wx - 14, null, C.ink7, C.ink5);
    // ground
    const fc = fieldColours(backdrop);
    for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 3 ? fc.c : bayer(x, y) < 6 ? fc.b : fc.a);
    frames.push(pc);
    glows.push(g);
  }
  const rk = rocketFrames(r);
  const launch: LaunchSpec = { frames: rk.frames, glow: rk.glow, body: ROCKET_BODY, x: rx, y: deck - 2, period: liftoff ? 20 : 0, vents: [[5, -66], [-5, -40]] };
  return { base: frames, glow: glows, points: {}, fps: 1, launch };
}

// ── the vehicle assembly hall ──────────────────────────────────────────────────────────────
export function assemblyHall(r: Ramp4, name: string, backdrop: Backdrop): FacilityArt {
  const W = 92;
  const H = 126;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const hx = 4;
  const hw = 70;
  const top = 12;
  pc.rect(hx, top, hw, H - 3 - top, C.ink9);
  for (let x = hx + 3; x < hx + hw; x += 4) pc.vline(x, top + 2, H - 5 - top, C.ink8);
  for (let y = top + 8; y < H - 3; y += 12) pc.hline(hx, y, hw, C.ink8);
  pc.hline(hx - 1, top, hw + 2, C.white);
  pc.hline(hx - 1, top + 1, hw + 2, C.ink8);
  // the builder's name across the top, the Charter emblem big on the wall
  const nw = measureText(name) * 2;
  if (nw <= hw - 4) bigText(pc, null, name, hx + Math.floor((hw - nw) / 2), top + 4, r.base);
  else drawText(pc, name, hx + Math.floor((hw - measureText(name)) / 2), top + 6, r.base);
  for (let y = top + 17; y < top + 21; y++) pc.hline(hx, y, hw, y === top + 17 ? r.lit : r.base);
  const ex = hx + 6;
  const ey = top + 26;
  pc.rect(ex - 1, ey - 1, 17, 13, CHARTER.field);
  emblem(pc, g, ex, ey, true);
  // the high-bay door: slats, with a slit of light at night
  const dx = hx + 28;
  const dw = 30;
  const dTop = top + 26;
  pc.rect(dx - 2, dTop - 2, dw + 4, H - 3 - dTop + 2, C.ink6);
  for (let y = dTop; y < H - 3; y++) for (let x = dx; x < dx + dw; x++) pc.set(x, y, (y - dTop) % 4 === 0 ? C.ink5 : (y - dTop) % 4 === 3 ? C.ink7 : C.ink8);
  for (let y = dTop; y < H - 3; y++) {
    pc.set(dx + Math.floor(dw / 2), y, C.ink4);
    g.set(dx + Math.floor(dw / 2), y, C.yel1);
  }
  facadeShade(pc, hx, top, hw, H - 3 - top, C.ink9, C.ink8, 0.72);
  // roof: beacons and antennas
  beacon(pc, g, hx + 1, top - 1, true);
  beacon(pc, g, hx + hw - 2, top - 1, false);
  pc.vline(hx + 20, top - 8, 7, C.ink7);
  pc.rect(hx + 18, top - 9, 5, 1, C.ink6);
  // the low annex with offices
  const ax = hx + hw;
  pc.rect(ax, H - 28, W - ax - 1, 25, C.ink8);
  pc.hline(ax, H - 28, W - ax - 1, C.white);
  for (let y = H - 24; y < H - 8; y += 6) {
    for (let x = ax + 2; x < W - 3; x += 4) {
      pc.rect(x, y, 2, 3, C.blu2);
      if (hash2(x, y, 7) > 0.35) g.rect(x, y, 2, 3, C.yel1);
    }
  }
  // the crawler-transporter, parked by the door
  pc.rect(dx - 4, H - 9, dw + 8, 3, C.ink5);
  pc.hline(dx - 4, H - 9, dw + 8, C.ink7);
  for (let x = dx - 4; x < dx + dw + 4; x += 2) pc.set(x, H - 5, x % 4 ? C.ink3 : C.ink4);
  pc.rect(dx - 4, H - 6, dw + 8, 2, C.ink3);
  pc.rect(dx + dw - 2, H - 13, 5, 4, r.base);
  pc.set(dx + dw - 1, H - 12, C.sky4);
  person(pc, 2, H - 3, 91);
  person(pc, W - 6, H - 3, 92, 1);
  // lamps over the door and along the roofline
  for (const lx of [dx - 4, dx + dw + 3]) {
    pc.set(lx, dTop - 4, C.yel1);
    g.set(lx, dTop - 4, C.yel2);
  }
  const fc = fieldColours(backdrop);
  for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 3 ? fc.c : bayer(x, y) < 6 ? fc.b : fc.a);
  return { base: [pc], glow: [g], points: { dock: [dx - 10, H] } };
}

// ── the tank farm (LOX and methane), venting boil-off ─────────────────────────────────────
function sphere(pc: PixelCanvas, cx: number, cy: number, r: number) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      const l = (-dx - dy) / r;
      let c = l > 0.6 ? C.white : l > 0.1 ? C.ink9 : l > -0.4 ? C.ink8 : C.ink7;
      if (l > 0.1 && l <= 0.6 && ditherAt(x, y, (l - 0.1) * 2)) c = C.white;
      pc.set(x, y, c);
    }
  }
  for (let k = -2; k <= 2; k++) pc.vline(Math.round(cx + k * r * 0.4), Math.round(cy), Math.round(r) + 6, C.ink5);
  pc.hline(Math.round(cx - r), Math.round(cy), Math.round(r * 2) + 1, C.ink7);
}

export function tankFarm(backdrop: Backdrop): FacilityArt {
  const W = 84;
  const H = 52;
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  sphere(pc, 16, H - 24, 14);
  sphere(pc, 46, H - 20, 11);
  drawText(pc, 'LOX', 10, H - 30, C.blu3);
  drawText(pc, 'CH4', 40, H - 24, C.org1);
  tank(pc, 62, H - 3, 9, 30, STEEL, true);
  tank(pc, 72, H - 3, 9, 24, STEEL, false);
  vessel(pc, 4, H - 9, 30, 5, STEEL);
  pipe(pc, 0, H - 14, W, H - 3, C.ink8, C.ink6, 10);
  beacon(pc, g, 16, H - 39, true);
  pc.rect(54, H - 10, 8, 7, C.ink7);
  pc.set(56, H - 8, C.yel1);
  g.set(56, H - 8, C.yel1);
  fence(pc, 0, H - 8, W);
  const fc = fieldColours(backdrop);
  for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 3 ? fc.c : bayer(x, y) < 6 ? fc.b : fc.a);
  return {
    base: [pc],
    glow: [g],
    points: { dock: [W - 20, H] },
    emitters: [
      { x: 16, y: H - 39, kind: 'vapor', rate: 1.4, spread: 2 },
      { x: 66, y: H - 35, kind: 'vapor', rate: 1, spread: 1 },
    ],
  };
}

// ── a candidate site: survey stakes, a board, a weather mast, and Kip's model rocket ──────
export function launchSurvey(backdrop: Backdrop, w: number): FacilityArt {
  const H = 40;
  const pc = new PixelCanvas(w, H);
  const g = new PixelCanvas(w, H);
  surveyStakes(pc, 2, H - 2, w - 4, 77);
  // the board
  const t1 = 'CANDIDATE';
  const t2 = 'LAUNCH SITE';
  const bw = Math.max(measureText(t1), measureText(t2)) + 8;
  pc.rect(8, H - 26, bw, 15, C.ink9);
  pc.box(8, H - 26, bw, 15, CHARTER.field);
  drawText(pc, t1, 12, H - 24, C.blu3);
  drawText(pc, t2, 12, H - 18, C.blu2);
  drawText(g, t1, 12, H - 24, C.blu5);
  pc.vline(11, H - 11, 9, C.ink6);
  pc.vline(8 + bw - 4, H - 11, 9, C.ink6);
  // weather mast with an anemometer
  const mx = bw + 22;
  pc.vline(mx, H - 34, 32, C.ink7);
  pc.hline(mx - 3, H - 34, 7, C.ink6);
  pc.set(mx - 3, H - 35, C.ink8);
  pc.set(mx + 3, H - 35, C.ink8);
  beacon(pc, g, mx, H - 36, true);
  theodolite(pc, mx + 12, H - 2);
  person(pc, mx + 20, H - 2, 61);
  // Kip's little sounding rocket on its rail
  const kx = Math.min(w - 16, mx + 40);
  pc.line(kx, H - 2, kx + 6, H - 16, C.ink6);
  pc.line(kx + 1, H - 2, kx + 7, H - 16, C.ink7);
  for (let k = 0; k < 7; k++) {
    pc.set(kx + 3 + Math.round(k * 0.43), H - 6 - k * 1.5, k > 5 ? C.org1 : C.white);
    pc.set(kx + 4 + Math.round(k * 0.43), H - 6 - k * 1.5, k > 5 ? C.org1 : C.ink9);
  }
  pc.set(kx + 2, H - 4, C.org1);
  person(pc, kx + 10, H - 2, 62, 1);
  const fc = fieldColours(backdrop);
  for (let x = 0; x < w; x++) if (hash2(x, 3, 72) < 0.1) pc.set(x, H - 1, fc.c);
  return { base: [pc], glow: [g], points: {} };
}
