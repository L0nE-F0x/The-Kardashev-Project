/**
 * Act V: the asteroids (one site per body, backdrop 'asteroid', from `asteroidSiteView`). The
 * ground is the asteroid itself: a short, sharply curved horizon on the little rubble piles, flatter
 * on the big main-belt worlds (Ceres, Vesta, Psyche), under a black sky with the Sun small and hard
 * and the Earth a pale blue dot. Rock by type: C charcoal with a bluish dust (and Ceres's bright
 * salt), S grey-brown stone, M grey-blue nickel-iron full of glints. Some bodies show their own
 * landmarks on the skyline: Itokawa's second lobe, Didymos's moonlet, Eros's long ridge, Vesta's
 * great central peak, Ceres's lonely ice volcano.
 * Status 1: a survey lander with its beacon and a hopping rover; 2: a claim — a stiff flag in the
 * owner's colours, the claim board, a crew pod strapped down, stakes with lights; 3: foundry rigs
 * cutting into the rock (wheels for stone, lasers for metal, steam off the carbon-rich ones), a
 * conveyor and a catapult throwing feed pods off toward the yards.
 * Pure PixelCanvas code with palette indices only.
 */
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import type { AsteroidType } from '../../sim/types';
import type { Emitter, FacilityArt, Mover } from './art';
import type { SceneBands } from './scenery';
import type { Ramp4 } from './act3kit';
import { boulder, plate, quarantineNet, ROCK, rockAt, roboArm, stiffFlag, tugFrames, warnLight, type RockRamp } from './act5kit';
import { astronaut, capsuleFrames, scoutLander, type DriverSpec } from './moon';
import { parseFlags, type YardFlags } from './yards';

export interface AsteroidScenery {
  kind: 'asteroid';
  id: string;
  type: AsteroidType;
  /** Mean diameter, km (sets how sharply the horizon curves). */
  km: number;
  /** Semi-major axis, AU (how small the sun looks). */
  au: number;
  /** The swarm's arcs lit (0..12): it glitters around the sun even from out here. */
  swarm: number;
}

/** Bands for an asteroid site. */
export function asteroidBands(sc: AsteroidScenery, seed: number, b: { farW: number; farH: number; midW: number; midH: number; groundH: number; fgH: number }, sceneW: number): SceneBands {
  const R = ROCK[sc.type];
  const glints = sc.type === 'M';
  return {
    seed,
    far: asteroidFar(b.farW, b.farH, sc, seed),
    mid: asteroidMid(b.midW, b.midH, sc, seed),
    midProps: [],
    ground: asteroidGround(sceneW, b.groundH, sc, 0),
    groundFrames: glints ? [0, 1, 2].map((f) => asteroidGround(sceneW, b.groundH, sc, f)) : undefined,
    fg: asteroidFg(sceneW + 40, b.fgH, R, seed),
    lamps: [],
    walkers: true,
  };
}

/** Rock shading along a silhouette: faces rising to the right catch the low sun on the left. */
function slopeLight(tops: number[], gain: number): number[] {
  const out: number[] = [];
  let shadow = Infinity;
  const sm = tops.map((_, x) => {
    let a = 0;
    let n = 0;
    for (let k = -3; k <= 3; k++) {
      const v = tops[x + k];
      if (v !== undefined) {
        a += v;
        n++;
      }
    }
    return a / n;
  });
  for (let x = 0; x < tops.length; x++) {
    const a = sm[Math.max(0, x - 3)];
    const c = sm[Math.min(tops.length - 1, x + 3)];
    shadow = Math.min(shadow + 0.18, tops[x]);
    let l = 0.55 - ((c - a) / 6) * gain;
    if (tops[x] - shadow > 0.5) l = Math.min(l, 0.15);
    out.push(l);
  }
  return out;
}

/** Fill a silhouette (tops per column) with lit rock down to the bottom of the canvas. */
function fillRock(pc: PixelCanvas, R: RockRamp, tops: number[], h: number, gain: number, fade = 0.004) {
  const light = slopeLight(tops, gain);
  for (let x = 0; x < tops.length; x++) {
    const t = Math.round(tops[x]);
    for (let y = Math.max(0, t); y < h; y++) {
      const dy = y - t;
      let c = rockAt(R, x, y, light[x] - dy * fade + (fbm(x / 6, y / 4, 23, 2) - 0.5) * 0.35);
      if (dy === 0) c = light[x] > 0.4 ? R.hi : light[x] > 0.2 ? R.lit : R.shade;
      pc.set(x, y, c);
    }
  }
}

/** Far band: the body's landmarks on the skyline (most of the sky stays black). */
function asteroidFar(w: number, h: number, sc: AsteroidScenery, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const R = ROCK[sc.type];
  const tops = new Array<number>(w).fill(h + 5);
  const hump = (cx: number, hw: number, ht: number, pow = 1) => {
    for (let x = Math.max(0, Math.floor(cx - hw)); x < Math.min(w, cx + hw); x++) {
      const t = 1 - Math.abs(x - cx) / hw;
      const y = h - 1 - Math.pow(Math.sin((t * Math.PI) / 2), pow) * ht + (fbm(x / 9, seed, 3) - 0.5) * 3;
      tops[x] = Math.min(tops[x], y);
    }
  };
  switch (sc.id) {
    case 'itokawa':
      hump(w * 0.6, w * 0.35, h * 0.75, 0.6);
      break;
    case 'eros':
      hump(w * 0.3, w * 0.55, h * 0.45, 0.9);
      break;
    case 'vesta':
      hump(w * 0.55, w * 0.2, h * 0.5, 1.4);
      hump(w * 0.55, w * 0.42, h * 0.22, 1);
      break;
    case 'ceres': {
      // Ahuna Mons: a lone steep dome with bright streaks down its flanks
      hump(w * 0.62, 30, h * 0.72, 0.4);
      break;
    }
    case 'ryugu':
      hump(w * 0.5, w * 0.6, h * 0.18, 1);
      break;
  }
  if (tops.some((t) => t < h)) {
    fillRock(pc, R, tops, h, 2.2, 0.01);
    // a rim of sunlight along the sunward crests, so even the dark worlds stand out from the sky
    for (let x = 1; x < w; x++) if (tops[x] < h && tops[x] <= tops[x - 1] + 0.5) pc.set(x, Math.round(tops[x]), R.hi);
  }
  if (sc.id === 'ceres') {
    // bright salt streaks down Ahuna Mons
    const mx = w * 0.62;
    for (let k = -4; k <= 4; k++) {
      const x0 = Math.round(mx + k * 5);
      for (let y = Math.round(tops[Math.max(0, Math.min(w - 1, x0))]) + 1; y < h; y++) {
        const x = x0 + Math.round((y - h * 0.3) * k * 0.12);
        if (pc.get(x, y) && bayer(x, y) < 10 - Math.abs(k)) pc.set(x, y, k === 0 || k === -1 ? C.white : C.ice2);
      }
    }
  }
  if (sc.id === 'didymos') {
    // Dimorphos, the moonlet DART nudged
    const mx = Math.round(w * 0.42);
    const my = Math.round(h * 0.3);
    for (let y = my - 5; y <= my + 5; y++) for (let x = mx - 7; x <= mx + 7; x++) {
      const u = (x + 0.5 - mx) / 7;
      const v = (y + 0.5 - my) / 5;
      if (u * u + v * v > 1 + (hash2(x, y, 2) - 0.5) * 0.2) continue;
      pc.set(x, y, rockAt(R, x, y, 0.75 - u * 0.5 - v * 0.3));
    }
  }
  // a tumbling rock passing far off
  if (sc.id !== 'didymos') {
    const rx = Math.floor(hash2(seed, 5, 1) * w);
    const ry = Math.floor(h * 0.25);
    pc.set(rx, ry, R.hi);
    pc.set(rx + 1, ry, R.mid);
    pc.set(rx, ry + 1, R.shade);
  }
  return pc;
}

/** Mid band: the curved horizon (tight on the small rubble piles, gentle on the big worlds). */
function asteroidMid(w: number, h: number, sc: AsteroidScenery, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const R = ROCK[sc.type];
  const small = sc.km < 1.5;
  const big = sc.km > 100;
  const curve = big ? 0.06 : small ? 0.7 : 0.35;
  const cx = w / 2;
  const tops: number[] = [];
  for (let x = 0; x < w; x++) {
    const u = (x - cx) / Math.max(1, w / 2);
    let y = h * 0.3 + u * u * h * curve * 1.6 + (fbm(x / (big ? 60 : 26), seed + 3, 4) - 0.5) * h * (big ? 0.35 : 0.22);
    y = Math.min(h - 3, y);
    tops.push(y);
  }
  fillRock(pc, R, tops, h, big ? 1.4 : 2, 0.006);
  // the rubble piles: boulders sitting proud of the horizon
  if (small) {
    for (let i = 0; i < w / 26; i++) {
      const bx = Math.floor(hash2(i, 1, seed) * w);
      const br = 2 + hash2(i, 2, seed) * (sc.id === 'bennu' && i === 3 ? 8 : 4.5);
      boulder(pc, R, bx, Math.round(tops[Math.max(0, Math.min(w - 1, bx))]) + Math.round(br * 0.3), br, seed + i, 0.7);
    }
  }
  // craters on the bigger bodies, salt on Ceres, dust patches on the carbon-rich ones
  for (let i = 0; i < w / (big ? 30 : 50); i++) {
    const x0 = hash2(i, 3, seed) * w;
    const t = tops[Math.max(0, Math.min(w - 1, Math.round(x0)))];
    const y0 = t + 4 + hash2(i, 4, seed) * Math.max(1, h - t - 6);
    const rx = 2 + hash2(i, 5, seed) * (big ? 9 : 5);
    for (let y = Math.floor(y0 - rx * 0.3); y <= y0 + rx * 0.3; y++) for (let x = Math.floor(x0 - rx); x <= x0 + rx; x++) {
      if (!pc.get(x, y)) continue;
      const nx = (x - x0) / rx;
      const ny = (y - y0) / (rx * 0.3);
      if (nx * nx + ny * ny > 1) continue;
      pc.set(x, y, nx < -0.1 ? R.dark : nx > 0.6 ? R.lit : R.shade);
    }
    if (sc.id === 'ceres' && i % 2 === 0) {
      // the faculae: bright salt on the crater floors
      for (let k = -3; k <= 3; k++) {
        if (pc.get(Math.round(x0 + k), Math.round(y0))) pc.set(Math.round(x0 + k), Math.round(y0), Math.abs(k) < 2 ? C.white : C.ice2);
        if (Math.abs(k) < 2 && pc.get(Math.round(x0 + k), Math.round(y0) - 1)) pc.set(Math.round(x0 + k), Math.round(y0) - 1, C.ice3);
      }
    }
  }
  if (sc.type === 'M') for (let i = 0; i < w / 6; i++) {
    const x = Math.floor(hash2(i, 7, seed) * w);
    const y = Math.round(tops[x] + 1 + hash2(i, 8, seed) * (h - tops[x] - 2));
    if (pc.get(x, y)) pc.set(x, y, hash2(i, 9, seed) > 0.6 ? C.white : C.ink8);
  }
  return pc;
}

/** The ground strip: regolith, pebbles, small craters (glints that twinkle on metal: frames). */
function asteroidGround(w: number, h: number, sc: AsteroidScenery, f: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  const R = ROCK[sc.type];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number;
      if (y === 0) c = hash2(x, 3, 71) < 0.3 ? R.hi : R.lit;
      else if (y < 3) c = bayer(x, y) < 6 ? R.shade : R.mid;
      else c = rockAt(R, x, y, 0.46 - y * 0.008 + (fbm(x / 14, y / 5, 9) - 0.5) * 0.3);
      if (sc.type === 'C' && y > 2 && fbm(x / 20, y / 6, 13) > 0.62 && bayer(x, y) < 4) c = R.dust;
      pc.set(x, y, c);
    }
  }
  for (let i = 0; i < w / 30; i++) {
    const cx = hash2(i, 5, 81) * w;
    const cy = 5 + hash2(i, 6, 81) * (h - 8);
    const rx = 2 + hash2(i, 7, 81) * (3 + cy / 4);
    for (let y = Math.floor(cy - rx * 0.3); y <= cy + rx * 0.3; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / (rx * 0.3);
      const d = Math.hypot(nx, ny);
      if (d <= 1) pc.set(x, y, nx < -0.1 ? R.deep : nx > 0.6 ? R.lit : R.dark);
      else if (d <= 1.3 && nx < -0.3) pc.set(x, y, R.hi);
    }
  }
  for (let i = 0; i < w / 5; i++) {
    const x = Math.floor(hash2(i, 1, 83) * w);
    const y = 3 + Math.floor(hash2(i, 2, 83) * (h - 4));
    pc.set(x, y, R.hi);
    pc.set(x + 1, y, R.deep);
    if (hash2(i, 3, 83) > 0.7) pc.set(x + 2, y, R.deep);
  }
  if (sc.id === 'ceres') for (let i = 0; i < w / 18; i++) pc.set(Math.floor(hash2(i, 4, 84) * w), 2 + Math.floor(hash2(i, 5, 84) * (h - 3)), i % 3 ? C.ice2 : C.white);
  if (sc.type === 'M') {
    for (let i = 0; i < w / 4; i++) {
      if (hash2(i, f, 85) > 0.35) continue;
      const x = Math.floor(hash2(i, 1, 86) * w);
      const y = 1 + Math.floor(hash2(i, 2, 86) * (h - 2));
      pc.set(x, y, C.white);
      if (hash2(i, 3, 86) > 0.6) pc.set(x + 1, y, C.ink9);
    }
  }
  return pc;
}

/** The foreground: dark boulders lit on their sunward shoulders. */
function asteroidFg(w: number, h: number, R: RockRamp, seed: number): PixelCanvas {
  const pc = new PixelCanvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = Math.round(5 + (fbm(x / 11, seed + 91) - 0.5) * 5);
    for (let y = top; y < h; y++) pc.set(x, y, y === top ? R.shade : y - top < 2 ? R.dark : R.deep);
  }
  for (let i = 0; i < w / 24; i++) {
    const cx = hash2(i, 1, 92) * w;
    const r = 2 + hash2(i, 2, 92) * 4;
    const cy = h - 2 - r * 0.4;
    for (let y = Math.floor(cy - r); y < h; y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = (x + 0.5 - cx) / (r + 1);
      const dy = (y + 0.5 - cy) / r;
      if (dx * dx + dy * dy > 1) continue;
      const l = -dx * 0.8 - dy * 0.6;
      pc.set(x, y, l > 0.55 ? R.lit : l > 0.1 ? R.shade : l > -0.4 ? R.dark : R.deep);
    }
  }
  return pc;
}

/** The bottom three rows of an asteroid piece (they meet the ground strip). */
export function rockGround(pc: PixelCanvas, W: number, H: number, R: RockRamp) {
  for (let y = H - 3; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 3 ? (hash2(x, 3, 71) < 0.3 ? R.hi : R.lit) : bayer(x, y) < 6 ? R.shade : R.mid);
}

// ════════════════════════════════════════ PIECES ════════════════════════════════════════
/** Open rock: boulders of every size (a rubble pile's surface), stretchable. */
export function astRocks(w: number, type: AsteroidType, seed: number): FacilityArt {
  const W = Math.max(30, w);
  const H = 46;
  const base = H - 3;
  const R = ROCK[type];
  const pc = new PixelCanvas(W, H);
  for (let i = 0; i < W / 16; i++) {
    const x = 6 + hash2(i, 1, seed) * (W - 12);
    const big = hash2(i, 2, seed) > 0.85;
    const r = big ? 8 + hash2(i, 3, seed) * 8 : 2 + hash2(i, 3, seed) * 4;
    boulder(pc, R, x, base, r, seed + i, big ? 0.8 : 0.7);
  }
  rockGround(pc, W, H, R);
  return { base: [pc], glow: [new PixelCanvas(W, H)], points: {} };
}

export const BEACON_W = 156;
const BEACON_H = 74;

/** The survey: a lander tethered down, its beacon mast and dish, a hopping rover, sample pins. */
export function astBeacon(type: AsteroidType, name: string): FacilityArt {
  const W = BEACON_W;
  const H = BEACON_H;
  const base = H - 3;
  const R = ROCK[type];
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    boulder(pc, R, 8, base, 6, 3);
    scoutLander(pc, g, 22, base);
    // harpoon tethers (nothing holds you down out here)
    for (const [ax, tx] of [[24, 12], [44, 58]] as [number, number][]) {
      const n = Math.abs(tx - ax);
      for (let k = 0; k <= n; k++) if (k % 2 === 0) pc.set(ax + Math.sign(tx - ax) * k, base - 14 + Math.round((k / n) * 13), C.ink6);
      pc.rect(tx - 1, base - 1, 3, 2, C.ink4);
    }
    // the beacon mast
    const mx = 70;
    for (let y = base - 46; y < base; y++) {
      pc.set(mx, y, C.ink8);
      pc.set(mx + 1, y, C.ink6);
      if (y % 5 === 0) pc.set(mx - 1, y, C.ink7);
    }
    for (const [dx, dy] of [[-6, 0], [7, 0]] as [number, number][]) pc.line(mx, base - 20, mx + dx, base - 1 + dy, C.ink6);
    const on = f === 0;
    pc.rect(mx - 1, base - 50, 4, 4, on ? C.cyn5 : C.cyn2);
    pc.set(mx - 1, base - 50, on ? C.white : C.cyn3);
    if (on) {
      g.rect(mx - 1, base - 50, 4, 4, C.cyn5);
      g.set(mx - 1, base - 50, C.white);
    }
    pc.line(mx + 3, base - 40, mx + 9, base - 44, C.ink8);
    pc.line(mx + 3, base - 39, mx + 9, base - 43, C.ink6);
    plate(pc, g, name.toUpperCase(), mx + 8, base - 30, C.cyn5, C.ink1, C.cyn3);
    plate(pc, null, 'SURVEYED', mx + 8, base - 22, C.ink7, C.ink2);
    // sample pins across the survey grid
    for (let x = 90; x < W - 4; x += 9) {
      const y = base - 3 - (x % 2);
      pc.vline(x, y, 3, C.ink7);
      const c = [C.red3, C.yel0, C.cyn4][x % 3];
      pc.set(x, y - 1, c);
    }
    boulder(pc, R, 128, base, 5, 7);
    rockGround(pc, W, H, R);
    frames.push(pc);
    glows.push(g);
  }
  // the hopping rover: low gravity turns a drive into a series of slow hops
  const hops: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    const x = 84 + k * 9;
    hops.push([x, base]);
    if (k < 6) hops.push([x + 4.5, base - 9]);
  }
  const rover: Mover = { frames: [hopperArt()], path: hops, speed: 7, phase: 0.2, pingpong: true };
  return { base: frames, glow: glows, points: {}, movers: [rover], fps: 1, sync: true };
}

function hopperArt(): PixelCanvas {
  const pc = new PixelCanvas(8, 6);
  pc.vline(5, 0, 2, C.ink7);
  pc.set(5, 0, C.red3);
  pc.rect(1, 2, 6, 3, C.ink8);
  pc.hline(1, 2, 6, C.white);
  pc.set(6, 3, C.sky4);
  pc.set(1, 5, C.ink5);
  pc.set(6, 5, C.ink5);
  return pc;
}

export const CLAIM_W = 176;
export const CLAIM_POST_W = 84;
const CLAIM_H = 78;

/** A claim: the owner's flag, the claim board, a crew pod strapped down, a lander, lit stakes. */
export function astClaim(type: AsteroidType, r: Ramp4, owner: string, name: string, post: boolean): FacilityArt {
  const W = post ? CLAIM_POST_W : CLAIM_W;
  const H = CLAIM_H;
  const base = H - 3;
  const R = ROCK[type];
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    stiffFlag(pc, g, 8, base, 44, r, owner.length <= 4 ? owner : '');
    // the claim board on two posts
    const t1 = `${name.toUpperCase()} CLAIM`;
    const tw = Math.max(measureText(t1), measureText(owner)) + 6;
    const bx = 30;
    const by = base - 30;
    pc.rect(bx, by, tw, 17, r.dark);
    pc.box(bx, by, tw, 17, r.lit);
    drawText(pc, t1, bx + 3, by + 2, C.white);
    drawText(pc, owner, bx + 3, by + 9, r.hi);
    drawText(g, owner, bx + 3, by + 9, r.lit);
    pc.vline(bx + 3, by + 17, base - by - 17, C.ink7);
    pc.vline(bx + tw - 4, by + 17, base - by - 17, C.ink7);
    if (!post) {
      // the crew pod, strapped to the rock
      const px = 96;
      const py = base - 15;
      for (let y = py; y < base - 2; y++) for (let x = px; x < px + 40; x++) {
        const v = (y - py) / 13;
        let c = v < 0.2 ? C.white : v < 0.55 ? C.ink9 : v < 0.85 ? C.ink8 : C.ink6;
        if ((x - px) % 10 === 0) c = C.ink7;
        pc.set(x, y, c);
      }
      for (let x = px; x < px + 40; x++) pc.set(x, py + 6, r.base);
      for (let k = 0; k < 4; k++) {
        const wx = px + 5 + k * 8;
        pc.rect(wx, py + 3, 2, 2, C.ink2);
        g.rect(wx, py + 3, 2, 2, k % 3 ? C.yel1 : C.yel0);
      }
      pc.rect(px + 40, py + 2, 4, 10, C.ink7);
      pc.set(px + 41, py + 5, C.cyn4);
      g.set(px + 41, py + 5, C.cyn5);
      for (const sx of [px + 8, px + 30]) {
        pc.line(sx, py, sx - 6, base - 1, C.ink6);
        pc.line(sx, py, sx + 6, base - 1, C.ink6);
      }
      // the crew's lander, stubby, on splayed legs
      const lx = 150;
      for (let y = base - 26; y < base - 8; y++) {
        const k = y - (base - 26);
        const hw = k < 6 ? 2 + k : 8;
        for (let x = lx - hw; x < lx + hw; x++) pc.set(x, y, x < lx - hw + 2 ? C.white : x > lx + hw - 3 ? C.ink7 : C.ink9);
      }
      pc.hline(lx - 8, base - 14, 16, r.base);
      pc.rect(lx - 2, base - 22, 4, 2, C.ink1);
      g.rect(lx - 2, base - 22, 4, 2, C.yel1);
      pc.line(lx - 6, base - 9, lx - 12, base - 2, C.ink7);
      pc.line(lx + 5, base - 9, lx + 11, base - 2, C.ink6);
      pc.rect(lx - 3, base - 8, 6, 2, C.ink4);
      beacon(pc, g, lx, base - 27, f === 0);
      astronaut(pc, 84, base, 17, f);
    }
    // claim stakes with lights in the owner's colour, blinking in turn
    for (let x = post ? 64 : 140; x < W - 3; x += post ? 10 : 12) {
      if (!post && x > 132 && x < 166) continue;
      pc.vline(x, base - 8, 7, C.ink8);
      const on = ((x / 6) | 0) % 2 === f;
      pc.set(x, base - 9, on ? r.lit : r.dark);
      if (on) g.set(x, base - 9, r.lit);
    }
    if (post) for (let x = 60; x < W - 2; x += 10) {
      pc.vline(x, base - 8, 7, C.ink8);
      const on = ((x / 10) | 0) % 2 === f;
      pc.set(x, base - 9, on ? r.lit : r.dark);
      if (on) g.set(x, base - 9, r.lit);
    }
    rockGround(pc, W, H, R);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1, sync: true };
}

function beacon(pc: PixelCanvas, g: PixelCanvas, x: number, y: number, on: boolean) {
  pc.set(x, y, on ? C.red3 : C.red1);
  if (on) g.set(x, y, C.red3);
}

export const RIG_W = 134;
const RIG_H = 96;

/**
 * A foundry rig cutting into an outcrop: the rock on the left, the rig tethered down on the right,
 * its boom biting into a fresh notch (a toothed wheel in stone, a laser in metal, with steam baking
 * off carbon-rich rock), a conveyor carrying the cut rock out to the right.
 */
export function astRig(type: AsteroidType, r: Ramp4, flags: YardFlags, seed: number, num: number): FacilityArt {
  const W = RIG_W;
  const H = RIG_H;
  const base = H - 3;
  const R = ROCK[type];
  const live = !flags.halted;
  const N = live ? 4 : 2;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  // the outcrop: a lumpy mound of the asteroid's own rock, the notch cut into its right flank
  const oh = 40 + (seed % 3) * 5;
  const oTop = (x: number) => {
    const u = (x - 30) / 33;
    return base - Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * oh * (0.85 + (fbm(x / 9, seed, 3) - 0.5) * 0.3) + (fbm(x / 4, seed + 1, 2) - 0.5) * 3);
  };
  const nx = 46;
  const ny = base - 20;
  const inNotch = (x: number, y: number) => Math.hypot((x - (nx + 10)) / 13, (y - ny) / 10) < 1;
  for (let f = 0; f < N; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    for (let x = 0; x < 64; x++) {
      const t0 = oTop(x);
      if (t0 >= base) continue;
      for (let y = t0; y < base; y++) {
        if (inNotch(x, y)) continue;
        // round lighting: the sunward (left) shoulder bright, the far flank in shadow, a rough skin
        const u = (x - 30) / 33;
        const v = (y - (base - oh * 0.4)) / oh;
        let l = 0.62 - u * 0.55 - v * 0.25 + (fbm(x / 5, y / 4, seed + 5, 2) - 0.5) * 0.4;
        if (hash2(x >> 1, y >> 1, seed + 6) > 0.93) l -= 0.3;
        let c = rockAt(R, x, y, l);
        if (y === t0) c = u < 0.3 ? R.hi : R.lit;
        pc.set(x, y, c);
      }
    }
    // a crack or two, and rubble at its foot
    for (let k = 0; k < 2; k++) {
      let cx = 14 + k * 16 + Math.floor(hash2(k, seed, 9) * 6);
      for (let y = oTop(cx) + 4; y < base - 4; y++) {
        if (pc.get(cx, y)) pc.set(cx, y, R.dark);
        if (hash2(y, k, seed) > 0.7) cx += hash2(y, k, seed + 1) > 0.5 ? 1 : -1;
      }
    }
    for (const [bx, br] of [[4, 4], [62, 3], [70, 2]] as [number, number][]) boulder(pc, R, bx, base, br, seed + bx, 0.7);
    // the fresh faces in the notch: bright cut rock (molten on metal)
    for (let y = ny - 11; y < base; y++) for (let x = nx - 4; x < 62; x++) {
      if (!pc.get(x, y)) continue;
      const near = inNotch(x - 1, y) || inNotch(x, y - 1) || inNotch(x + 1, y);
      if (!near) continue;
      if (type === 'M') {
        const c = live ? [C.org2, C.yel1, C.org1][(x + y + f) % 3] : C.ink6;
        pc.set(x, y, c);
        if (live) g.set(x, y, c);
      } else pc.set(x, y, R.hi);
    }
    // the rig: legs and tethers to anchor bolts, a body in the owner's colours
    const bx0 = 74;
    const bx1 = 120;
    const bt = base - 46;
    const bb = base - 16;
    for (const [lx, fx] of [[bx0 + 4, bx0 - 4], [bx1 - 6, bx1 + 4]] as [number, number][]) {
      pc.line(lx, bb, fx, base - 1, C.ink7);
      pc.line(lx + 1, bb, fx + 1, base - 1, C.ink5);
      pc.rect(fx - 1, base - 2, 4, 2, C.ink4);
    }
    for (const [ax, sx] of [[66, bx0 + 2], [W - 3, bx1 - 2]] as [number, number][]) {
      const n = Math.abs(sx - ax);
      for (let k = 0; k <= n; k++) if (k % 2 === 0) pc.set(sx + Math.sign(ax - sx) * k, bt + 2 + Math.round((k / n) * (base - 2 - bt)), C.ink6);
      pc.rect(ax - 1, base - 2, 3, 2, C.ink5);
    }
    for (let y = bt; y < bb; y++) for (let x = bx0; x < bx1; x++) {
      const t = (x - bx0) / (bx1 - bx0);
      let c = x - bx0 < 2 ? C.ink9 : t < 0.5 ? C.ink8 : ditherAt(x, y, (t - 0.5) * 1.6) ? C.ink7 : C.ink8;
      if (y === bt) c = C.white;
      if ((x - bx0) % 12 === 11) c = C.ink6;
      pc.set(x, y, c);
    }
    for (let x = bx0; x < bx1; x++) {
      pc.set(x, bt + 4, r.base);
      pc.set(x, bt + 5, r.mid);
    }
    for (let k = 0; k < 5; k++) {
      const wx = bx0 + 18 + k * 5;
      pc.rect(wx, bt + 9, 3, 3, C.ink2);
      if (live ? hash2(k, f, seed) > 0.2 : k === 0) g.rect(wx, bt + 9, 3, 3, flags.q >= 2 ? C.pnk0 : C.yel1);
    }
    // the smelter's port and its radiator
    for (let y = bt + 15; y < bt + 24; y++) for (let x = bx0 + 4; x < bx0 + 13; x++) {
      const edge = y === bt + 15 || x === bx0 + 4 || x === bx0 + 12;
      const c = edge ? C.ink4 : !live ? C.red1 : [C.yel1, C.org2, C.org1][(x + y + f) % 3];
      pc.set(x, y, c);
      if (!edge && live) g.set(x, y, c);
    }
    for (let y = bt - 22; y < bt; y++) {
      pc.set(bx1 - 10, y, C.white);
      pc.set(bx1 - 9, y, y % 4 === 0 ? C.ink7 : C.ink8);
      pc.set(bx1 - 8, y, C.ink6);
    }
    stiffFlag(pc, null, bx1 - 4, bt, 16, r);
    plate(pc, g, `R${num}`, bx0 + 20, bb - 9, C.cyn5);
    // the floodlight on the notch
    pc.rect(bx0 - 2, bt + 2, 4, 3, C.ink5);
    pc.set(bx0 - 2, bt + 3, live ? C.yel2 : C.ink4);
    if (live) {
      g.set(bx0 - 2, bt + 3, C.yel2);
      for (let y = ny - 10; y < base; y++) for (let x = nx - 2; x < 62; x++) if (pc.get(x, y) && !g.get(x, y) && bayer(x, y) < 3) g.set(x, y, type === 'C' ? C.ink6 : C.rck4);
    }
    // the boom and the cutter in the notch
    const tip: [number, number] = [nx + 6 + (live ? Math.round(Math.sin((f / N) * Math.PI * 2) * 2) : 0), ny];
    roboArm(pc, g, bx0 + 2, bt + 14, tip[0] + 8, tip[1] - 2, 18, 16, { up: true, tool: 'grip', mount: 'none' });
    if (type === 'M') {
      // a laser cutter: a beam into the metal
      pc.rect(tip[0] + 6, tip[1] - 4, 5, 4, C.ink7);
      pc.set(tip[0] + 6, tip[1] - 3, C.ink9);
      if (live) for (let x = tip[0] - 2; x < tip[0] + 6; x++) {
        pc.set(x, tip[1] - 2, x % 2 ? C.white : C.yel2);
        g.set(x, tip[1] - 2, C.yel2);
      }
    } else {
      // a toothed wheel, turning
      const wr = 6;
      const wx = tip[0] + 2;
      const wy = tip[1];
      for (let y = wy - wr - 1; y <= wy + wr + 1; y++) for (let x = wx - wr - 1; x <= wx + wr + 1; x++) {
        const d = Math.hypot(x - wx, y - wy);
        const a = Math.atan2(y - wy, x - wx) + (live ? f * 0.4 : 0);
        const tooth = d > wr - 0.5 && d <= wr + 1.2 && Math.round(a * 8 / Math.PI) % 2 === 0;
        if (d <= wr - 0.5) pc.set(x, y, d < 2 ? C.ink4 : x < wx ? C.ink8 : C.ink6);
        else if (tooth) pc.set(x, y, C.ink9);
      }
    }
    // the conveyor from the notch under the rig and out to the right
    for (let x = nx + 6; x < W; x++) {
      pc.set(x, base - 6, C.ink8);
      pc.set(x, base - 5, C.ink5);
      if (x % 8 === 0) pc.vline(x, base - 4, 4, C.ink5);
      const k = (x - (live ? f * 3 : 0) + 120) % 10;
      if (k < 3) {
        pc.set(x, base - 7, k === 0 ? R.hi : R.lit);
        if (k === 1) pc.set(x, base - 8, R.mid);
      }
    }
    if (!live) plate(pc, g, 'HALT', bx0 + 4, bt - 10, C.yel1, C.red1, C.red3);
    else warnLight(pc, g, bx1 - 10, bt - 25, f % 2 === 0, false);
    if (flags.q) quarantineNet(pc, g, 64, base - 72, W - 66, 72, flags.q, f);
    rockGround(pc, W, H, R);
    frames.push(pc);
    glows.push(g);
  }
  const emitters: Emitter[] = !live
    ? []
    : type === 'M'
      ? [{ x: nx + 4, y: ny - 2, kind: 'spark', rate: 7, spread: 2 }]
      : [{ x: nx + 4, y: ny, kind: 'grit', rate: 5, spread: 3 }, ...(type === 'C' ? [{ x: bx0Vent(), y: base - 70, kind: 'vapor', rate: 1.2, size: 2 } as Emitter] : [])];
  return { base: frames, glow: glows, points: {}, emitters, fps: live ? 6 : 1 };
}

const bx0Vent = () => 110;

export const CATAPULT_W = 244;
const CATAPULT_H = 100;

/** The catapult: a short coil rail on a light trestle, flinging feed pods off toward the yards. */
export function astCatapult(type: AsteroidType, r: Ramp4, flags: YardFlags): FacilityArt {
  const W = CATAPULT_W;
  const H = CATAPULT_H;
  const base = H - 3;
  const R = ROCK[type];
  const B = 54;
  const railY = (x: number) => base - 16 - Math.max(0, x - B) * 0.36;
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // the trestle
    for (let x = B + 16; x < W - 8; x += 20) {
      const y = Math.round(railY(x)) + 3;
      pc.line(x, y, x - 5, base - 1, C.ink7);
      pc.line(x, y, x + 5, base - 1, C.ink5);
      for (let yy = y + 6; yy < base - 2; yy += 7) {
        const k = Math.round(((yy - y) / (base - y)) * 5);
        pc.hline(x - k, yy, k * 2 + 1, C.ink6);
      }
      pc.rect(x - 6, base - 2, 13, 2, C.ink5);
    }
    // the rail and its coils
    for (let x = B; x < W - 3; x++) {
      const y = Math.round(railY(x));
      pc.set(x, y - 1, C.ink9);
      pc.set(x, y, C.ink7);
      pc.set(x, y + 1, C.ink5);
      if ((x - B) % 6 === 0) {
        for (let k = -3; k <= 3; k++) pc.set(x, y + k, k === -3 ? C.ink8 : k === 3 ? C.ink4 : C.ink6);
        pc.set(x, y, C.cyn3);
        if (!flags.halted && (x - B) % 12 === (f ? 6 : 0)) g.set(x, y, C.cyn5);
      }
    }
    const mx = W - 5;
    const my = Math.round(railY(mx));
    for (let k = -5; k <= 5; k++) {
      pc.set(mx, my + k, C.ink8);
      pc.set(mx + 1, my + k, C.ink5);
    }
    warnLight(pc, g, mx - 1, my - 8, f === 0, flags.halted);
    // the breech: a loading house with capacitor drums, pods waiting
    const top = base - 30;
    for (let y = top; y < base; y++) for (let x = 0; x < B + 6; x++) {
      let c = x < 2 ? C.ink9 : x < (B + 6) * 0.5 ? C.ink8 : ditherAt(x, y, 0.5) ? C.ink7 : C.ink8;
      if (y === top) c = C.white;
      pc.set(x, y, c);
    }
    for (let x = 0; x < B + 6; x++) {
      pc.set(x, top + 3, r.base);
      pc.set(x, top + 4, r.mid);
    }
    for (let k = 0; k < 5; k++) {
      const cx = 4 + k * 10;
      for (let y = top - 9; y < top; y++) for (let x = cx; x < cx + 7; x++) pc.set(x, y, x === cx ? C.white : x === cx + 6 ? C.ink6 : C.ink8);
      pc.hline(cx, top - 10, 7, C.ink6);
      const on = !flags.halted && (k + f) % 2 === 0;
      pc.set(cx + 3, top - 10, on ? C.cyn5 : C.cyn2);
      if (on) g.set(cx + 3, top - 10, C.cyn5);
    }
    plate(pc, g, 'CATAPULT', 4, top + 8, C.cyn5);
    for (let k = 0; k < 4; k++) {
      const px = 6 + k * 10;
      pc.rect(px, base - 9, 7, 6, k % 2 ? R.mid : R.lit);
      pc.hline(px, base - 9, 7, C.ink8);
      pc.vline(px + 6, base - 9, 6, C.ink6);
      pc.set(px + 3, base - 7, C.org1);
    }
    pc.rect(B - 4, Math.round(railY(B)) - 6, 10, 12, C.ink6);
    pc.rect(B - 2, Math.round(railY(B)) - 4, 6, 8, C.ink2);
    if (!flags.halted) g.rect(B - 1, Math.round(railY(B)) - 1, 4, 2, C.cyn5);
    if (flags.halted) plate(pc, g, 'HALT', 8, top - 20, C.yel1, C.red1, C.red3);
    rockGround(pc, W, H, R);
    frames.push(pc);
    glows.push(g);
  }
  const art: FacilityArt = { base: frames, glow: glows, points: {}, fps: 1, sync: true };
  if (!flags.halted) {
    const rail: [number, number][] = [];
    for (let x = B; x <= W - 4; x += 6) rail.push([x, Math.round(railY(x)) - 2]);
    const n = rail.length;
    const ex = rail[n - 1][0] - rail[n - 3][0];
    const ey = rail[n - 1][1] - rail[n - 3][1];
    const el = Math.hypot(ex, ey);
    const cap = capsuleFrames([null, [ex / el, ey / el], [ex / el, ey / el]]);
    const driver: DriverSpec = { frames: cap.frames, glow: cap.glow, ax: 26, ay: 26, rail, period: 6.4 };
    art.driver = driver;
    art.movers = [{ frames: tugFrames(r), path: [[W - 70, base - 76], [40, base - 64]], speed: 6, phase: 0.6, pingpong: true }];
  }
  return art;
}

export { parseFlags };
void fbm;
