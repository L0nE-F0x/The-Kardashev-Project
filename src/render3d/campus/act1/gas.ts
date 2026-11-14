/**
 * The gas plant. Tier 1 is the peaker: the Meshy model (two turbine halls, their stacks, the inlet filter
 * houses) on its platform, dressed with what a working plant has round it: a gas metering skid, a step-up
 * transformer, steps up to the deck, lamps, louvres on the filter houses, heat over the stacks. Tier 2 makes
 * it combined cycle: an exhaust duct from a turbine hall back to a heat-recovery boiler with its own stack,
 * steam over to a turbine house, a cooling tower. Tier 3 is the second block.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, rng } from '../../kit';
import { model } from '../../models';
import type { Piece } from '../../pieces';
import { parkedCars } from '../life';
import {
  Anim, At, beacon, lampHeadMat, mechTower, P, pipe, pipeRun, pipeStands, poleLamp, rollDoor, shed, tank, transformer, V, wallLamp, warmPool, windowRow,
} from '../plants2/parts';

/** The plant's glazing: dark glass by day; at night the halls' lights at two strengths (the garage's panes set the level: nothing burns out). */
const [hallWin, hallWinDim] = [['#ffdca8', 0.66], ['#ffd09a', 0.36]].map(([c, kk]) => {
  const m = glowMat(c as string, 0);
  m.color.copy(col(P.glass));
  m.userData.nightOnly = kk;
  m.userData.scope = 0;
  return m;
});

const GAS_YELLOW = '#e3b341';
const RUST = '#c8623c';

/** The gas company's metering skid: the main rises out of the ground, a shut-off valve, a filter, the meter run, then off to the turbines. Runs along z from `z0` (the riser) to `z1`; the outlet leaves towards `outX`. */
function gasSkid(k: Kit, x: number, z0: number, z1: number, outX: number, outY: number) {
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2, dir = Math.sign(z1 - z0) || 1;
  k.box(1.9, 0.1, len + 0.8, P.concrete2, x, 0.1, zc, { r: 0.03, shade: 0, jitter: 0.02 });
  const y = 0.95, r = 0.15;
  // the riser and the run
  pipeRun(k, [V(x, 0.15, z0), V(x, y, z0), V(x, y, z1), V(outX, y, z1)], r, GAS_YELLOW, { seg: 8 });
  if (Math.abs(outY - y) > 0.05) pipe(k, V(outX, y, z1), V(outX, outY, z1), r, GAS_YELLOW);
  pipeStands(k, [V(x, y, z0 + dir * 0.5), V(x, y, z1 - dir * 0.3)], r, 1.5, 0.18);
  // flanges, the shut-off valve with its red handwheel, the filter vessel, the meter
  for (const t of [0.14, 0.3, 0.52, 0.74, 0.9]) k.geo(new THREE.CylinderGeometry(r * 1.55, r * 1.55, 0.07, 10).rotateX(Math.PI / 2).translate(x, y, z0 + (z1 - z0) * t), P.steelDark, 0.01, 0);
  const vz = z0 + (z1 - z0) * 0.22;
  k.box(0.34, 0.34, 0.4, GAS_YELLOW, x, y - 0.17, vz, { r: 0.05 });
  k.cyl(0.035, 0.035, 0.4, P.steelDark, x, y + 0.15, vz, 6);
  k.geo(new THREE.TorusGeometry(0.2, 0.035, 4, 12).rotateX(Math.PI / 2).translate(x, y + 0.56, vz), 'red3', 0.02, 0);
  const fz = z0 + (z1 - z0) * 0.63;
  k.geo(new THREE.CapsuleGeometry(0.36, 0.55, 3, 12).rotateX(Math.PI / 2).translate(x, y + 0.05, fz), '#c9c7c0', 0.02, 0);
  for (const dz of [-0.3, 0.3]) k.box(0.5, y - 0.45, 0.12, P.steel, x, 0.18, fz + dz, { r: 0, jitter: 0 });
  k.box(0.3, 0.36, 0.26, '#e9e1d2', x + 0.3, y + 0.25, z0 + (z1 - z0) * 0.82, { r: 0.03 });
  // bollards at the corners
  for (const sx of [-1, 1]) for (const zz of [z0 - dir * 0.3, z1 + dir * 0.3]) {
    k.cyl(0.09, 0.09, 0.9, 'yel0', x + sx * 0.85, 0.15, zz, 8, { shade: 0 });
    k.cyl(0.095, 0.095, 0.12, '#3a3442', x + sx * 0.85, 0.75, zz, 8, { shade: 0, jitter: 0 });
  }
}

/** Louvres on a blank wall facing +z: a dark recess, slats, a frame. */
function louvre(k: Kit, x: number, y: number, z: number, w: number, h: number) {
  k.box(w, h, 0.06, '#4a4452', x, y, z + 0.02, { r: 0, jitter: 0, shade: 0 });
  const n = Math.max(3, Math.round(h / 0.26));
  for (let i = 0; i < n; i++) k.box(w - 0.04, 0.05, 0.13, '#cfc9c0', x, y + ((i + 0.5) * h) / n - 0.025, z + 0.07, { r: 0, jitter: 0.02, shade: 0 });
  for (const sx of [-1, 1]) k.box(0.09, h + 0.16, 0.16, '#b9b1a6', x + (sx * w) / 2, y - 0.08, z + 0.06, { r: 0, jitter: 0, shade: 0 });
  k.box(w + 0.18, 0.09, 0.16, '#b9b1a6', x, y + h, z + 0.06, { r: 0, jitter: 0, shade: 0 });
  k.box(w + 0.18, 0.09, 0.16, '#b9b1a6', x, y - 0.09, z + 0.06, { r: 0, jitter: 0, shade: 0 });
}

/** Steel steps up the side of a deck `h` high (towards +x from `x`), with handrails. */
function deckSteps(k: Kit, x: number, z: number, h: number, w = 1.5) {
  const n = Math.max(2, Math.round(h / 0.19));
  const run = 0.27;
  for (let i = 0; i < n; i++) {
    const top = h - ((i + 1) * h) / (n + 1);
    k.box(run + 0.03, 0.05, w, P.steel2, x + (i + 0.5) * run, top - 0.05, z, { r: 0, jitter: 0.02, shade: 0 });
  }
  const end = x + n * run;
  for (const sz of [-1, 1]) {
    const zz = z + (sz * w) / 2;
    k.beam(V(x, h - 0.12, zz), V(end, 0.08, zz), 0.1, P.steelDark);
    k.box(0.06, 1.0, 0.06, P.safety, x + 0.05, h, zz, { r: 0, jitter: 0 });
    k.box(0.06, 1.0 + 0.12, 0.06, P.safety, end - 0.05, 0.12, zz, { r: 0, jitter: 0 });
    k.beam(V(x + 0.05, h + 1.0, zz), V(end - 0.05, 1.2, zz), 0.05, P.safety);
    k.beam(V(x + 0.05, h + 0.5, zz), V(end - 0.05, 0.7, zz), 0.04, P.safety);
  }
  return end;
}

/**
 * A heat-recovery boiler (the tower kind: the exhaust rises through it) with its stack on top, the steam drum,
 * platforms and a ladder on the front, and the duct that feeds it from the turbine hall at (x, ductZ).
 * Returns the stack's top.
 */
function boiler(k: Kit, lamps: Kit, g: THREE.Group, anim: Anim, x: number, z: number, ductZ: number, deckY: number, seed: number) {
  const W = 4.4, D = 3.6;
  const front = z + D / 2;
  k.box(W + 0.7, 0.3, D + 0.5, P.concrete2, x, 0.08, z, { r: 0.04, shade: 0 });
  // the casing in three lifts, stiffener bands round it, the steel frame at the corners
  let y = 0.38;
  for (const [h, c] of [[3.7, '#c9c1b6'], [3.4, '#c2baae'], [3.1, '#cdc5b9']] as [number, string][]) {
    k.box(W, h, D, c, x, y, z, { r: 0.05, shade: y < 1 ? 0.18 : 0.03 });
    y += h;
  }
  const top = y;
  for (let yy = 1.55; yy < top - 0.2; yy += 1.22) k.box(W + 0.16, 0.13, D + 0.16, '#a39a91', x, yy, z, { r: 0, jitter: 0.02, shade: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.24, top - 0.1, 0.24, P.steel, x + sx * (W / 2 + 0.05), 0.2, z + sz * (D / 2 + 0.05), { r: 0, jitter: 0.02 });
  for (const sx of [-0.33, 0.33]) k.box(0.1, top - 0.6, 0.08, '#b0a89d', x + sx * W, 0.5, front + 0.03, { r: 0, jitter: 0, shade: 0 });
  // the hood up to the stack, the stack with its test platform
  const hoodH = 1.7, sr = 0.95;
  k.geo(new THREE.CylinderGeometry(sr * 1.25 * Math.SQRT2, (W / 2) * Math.SQRT2, hoodH, 4, 1).rotateY(Math.PI / 4).scale(1, 1, D / W).translate(x, top + hoodH / 2, z), '#b9b1a6', 0.03, 0);
  const s0 = top + hoodH - 0.1, sh = 6.6;
  k.cyl(sr * 0.94, sr, sh, '#8a8490', x, s0, z, 20, { shade: 0.05 });
  k.cyl(sr * 0.98, sr * 0.98, 0.55, RUST, x, s0 + sh - 1.5, z, 20, { shade: 0, jitter: 0.02 });
  k.cyl(sr * 0.99, sr * 0.99, 0.14, P.steelDark, x, s0 + sh - 0.14, z, 20, { shade: 0, jitter: 0 });
  const py = s0 + sh * 0.5;
  k.cyl(sr + 0.75, sr + 0.75, 0.08, P.steel, x, py, z, 20, { shade: 0 });
  k.geo(new THREE.TorusGeometry(sr + 0.72, 0.035, 4, 24).rotateX(Math.PI / 2).translate(x, py + 1.0, z), P.safety, 0, 0);
  k.geo(new THREE.TorusGeometry(sr + 0.72, 0.03, 4, 24).rotateX(Math.PI / 2).translate(x, py + 0.55, z), P.safety, 0, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.05, 1.0, 0.05, P.safety, x + Math.cos(a) * (sr + 0.72), py + 0.04, z + Math.sin(a) * (sr + 0.72), { r: 0, jitter: 0 });
  }
  k.box(0.4, py - top - 0.3, 0.07, P.steelDark, x - sr * 0.6, top + 0.5, z + sr + 0.25, { r: 0, jitter: 0 });
  beacon(g, x + sr * 0.9, s0 + sh + 0.2, z, seed * 0.7);
  anim.plume(g, x, s0 + sh, z, { count: 16, life: 6.5, rise: 2.6, size0: 1.6, size1: 6.5, color: '#ece8e2', opacity: 0.34, radius: 0.55, wind: 0.8 }, seed + 3, 0.9);
  // the steam drum across the front, its saddles, two safety-valve vents
  const dy = top - 1.1, dz = front + 0.72;
  k.geo(new THREE.CapsuleGeometry(0.5, W - 0.7, 4, 14).rotateZ(Math.PI / 2).translate(x, dy, dz), P.silver, 0.02, 0);
  for (const sx of [-1.3, 1.3]) {
    k.box(0.22, 0.2, 0.9, P.steel, x + sx, dy - 0.68, front + 0.42, { r: 0, jitter: 0 });
    k.beam(V(x + sx, dy - 1.5, front + 0.05), V(x + sx, dy - 0.6, front + 0.8), 0.1, P.steel);
  }
  for (const sx of [-0.8, 0.9]) {
    k.cyl(0.07, 0.07, 1.5, P.silver, x + sx, dy + 0.45, dz, 6, { shade: 0 });
    k.cyl(0.11, 0.11, 0.3, P.steelDark, x + sx, dy + 1.8, dz, 6, { shade: 0 });
  }
  // two access platforms with rails, a ladder between them and down to the ground
  for (const yy of [4.9, 7.4]) {
    k.box(W + 0.5, 0.08, 1.0, P.steel2, x, yy, front + 0.52, { r: 0, jitter: 0.02, shade: 0 });
    k.beam(V(x - W / 2 - 0.22, yy + 1.0, front + 1.0), V(x + W / 2 + 0.22, yy + 1.0, front + 1.0), 0.05, P.safety);
    k.beam(V(x - W / 2 - 0.22, yy + 0.52, front + 1.0), V(x + W / 2 + 0.22, yy + 0.52, front + 1.0), 0.04, P.safety);
    for (let i = 0; i <= 4; i++) k.box(0.05, 1.0, 0.05, P.safety, x - W / 2 - 0.22 + (i * (W + 0.44)) / 4, yy + 0.06, front + 1.0, { r: 0, jitter: 0 });
    for (const sx of [-1, 1]) {
      k.beam(V(x + sx * (W / 2 + 0.22), yy + 1.0, front + 0.05), V(x + sx * (W / 2 + 0.22), yy + 1.0, front + 1.0), 0.05, P.safety);
      k.beam(V(x + sx * (W / 2 + 0.1), yy - 0.7, front + 0.05), V(x + sx * (W / 2 + 0.1), yy, front + 0.9), 0.08, P.steel);
    }
    for (const dx of [-0.9, 0.9]) k.box(0.7, 0.9, 0.06, '#8f877c', x + dx, yy + 0.5, front + 0.03, { r: 0.02, jitter: 0.03, shade: 0 });
  }
  const lx = x + W / 2 - 0.35;
  for (const sx of [-0.2, 0.2]) k.box(0.05, 8.3 - 0.3, 0.05, P.steelDark, lx + sx, 0.3, front + 0.2, { r: 0, jitter: 0 });
  for (let yy = 0.6; yy < 7.4; yy += 0.32) k.box(0.42, 0.035, 0.035, P.steelDark, lx, yy, front + 0.2, { r: 0, jitter: 0 });
  wallLamp(lamps, g, x - 1.2, 6.9, front + 0.1, 0, undefined, 3.2);
  // the exhaust duct from the hall: an expansion joint at each end, the flare into the boiler, portal stands
  const y0 = 2.75, dh = 1.3, dw = 1.5;
  const z1 = front + 0.9;
  k.box(dw, dh, ductZ - z1 + 0.2, '#b3aba0', x, y0, (ductZ + z1) / 2 + 0.1, { r: 0.06, shade: 0.05 });
  k.geo(new THREE.CylinderGeometry((dw / 2 + 0.05) * Math.SQRT2, 1.45 * Math.SQRT2, 0.95, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.78).rotateX(Math.PI / 2).translate(x, y0 + dh / 2, front + 0.45), '#aaa297', 0.03, 0);
  for (const zz of [ductZ - 0.35, z1 + 0.25]) k.box(dw + 0.16, dh + 0.16, 0.3, '#57515e', x, y0 - 0.08, zz, { r: 0.03, jitter: 0.02, shade: 0 });
  for (let zz = z1 + 1.2; zz < ductZ - 0.9; zz += 1.3) k.box(dw + 0.1, dh + 0.1, 0.09, '#9a9287', x, y0 - 0.05, zz, { r: 0, jitter: 0, shade: 0 });
  // (one stand, on the clear strip at the back of the deck: the hall's own plant stands under the rest of the run)
  const zs = z1 + 0.45;
  for (const sx of [-1, 1]) k.box(0.16, y0 - deckY, 0.16, P.steel, x + sx * (dw / 2 + 0.14), deckY, zs, { r: 0, jitter: 0 });
  k.box(dw + 0.6, 0.14, 0.2, P.steel, x, y0 - 0.14, zs, { r: 0, jitter: 0 });
  return s0 + sh;
}

export function gas(o: { seed: number; tier: number }): Piece {
  const g = new THREE.Group();
  const big = o.tier >= 2, blocks = o.tier >= 3 ? 2 : big ? 1 : 0;
  const L = big ? 19 : 24;
  const m = model('gasplant', L);
  const mx = big ? -3.2 : 0, mz = big ? 2 : 0;
  m.position.set(mx, 0, mz);
  g.add(m);
  // the model in the piece's own units (it was measured at 24 long)
  const s = L / 24;
  const X = (x: number) => mx + x * s, Z = (z: number) => mz + z * s;
  const deck = 0.9 * s;
  const k = new Kit(rng(o.seed));
  const lit = new Kit(rng(o.seed + 1));
  const lamps = new Kit(rng(o.seed + 2));
  const anim = new Anim();
  const blockers = [{ x0: X(-10.06) - 0.15, z0: Z(-11.98) - 0.15, x1: X(10.01) + 0.15, z1: Z(11.96) + 0.15 }];

  // the turbines' own stacks: a light on each rim, heat haze over them (bypass stacks once the boilers take the exhaust)
  const stacks: [number, number, number][] = [[-5.5, 5.5, 0.75], [5.25, 5.75, 0.85]];
  stacks.forEach(([x, z, r], i) => {
    beacon(g, X(x + r), 11.8 * s + 0.22, Z(z), 1.3 + i * 2.1);
    const direct = i >= blocks;
    anim.plume(g, X(x), 11.8 * s, Z(z), { count: 12, life: 4.2, rise: 3.4, spread: 0.5, size0: 1.3 * s, size1: 4.8, color: '#d8d3cc', opacity: direct ? 0.2 : 0.06, radius: 0.35, wind: 0.8 }, o.seed + 40 + i, 0.9);
  });
  // louvres on the two inlet filter houses (the model leaves their faces blank)
  louvre(k, X(-5.75), 1.75 * s, Z(10.9), 3.3 * s, 2.3 * s);
  louvre(k, X(5.2), 1.75 * s, Z(11.19), 3.2 * s, 2.3 * s);
  // steps up the deck's east side
  const sz = big ? Z(5.2) : 8.9;
  const sx1 = deckSteps(k, X(10.01), sz, deck, 1.5);
  blockers.push({ x0: X(10.01), z0: sz - 0.85, x1: sx1 + 0.05, z1: sz + 0.85 });
  // lamps at the deck's corners
  for (const [x, z, dir] of [[-9.5, 11.3, 1], [-9.5, -11.3, 1], [9.4, -11.3, -1], [9.4, 11.5, -1]] as [number, number, number][]) poleLamp(k, lamps, g, X(x), Z(z), 4.4, dir, deck - 0.02);
  // the generator step-up transformers down the west side (long side along the deck)
  const tz = o.tier >= 3 ? [-4.5, 1, 6.5] : big ? [-1.5, 4.5] : [2];
  const tx = big ? -12.32 : -11.8, ts = big ? 0.74 : 0.92;
  for (const z of tz) {
    transformer(new At(k, tx, 0.06, z, Math.PI / 2), 0, 0, ts);
    // the bus duct across to the deck
    k.box(Math.abs(X(-10.06) - tx) + 0.3, 0.26, 0.4, '#b9b1a6', (X(-10.06) + tx) / 2 + 0.2, 1.75 * ts + 0.2, z + 0.9 * ts, { r: 0.04, shade: 0 });
    k.box(0.18, 1.75 * ts + 0.2 - deck, 0.18, P.steel, X(-10.06) + 0.25, deck, z + 0.9 * ts, { r: 0, jitter: 0 });
    blockers.push({ x0: tx - 1.25 * ts, z0: z - 1.7 * ts, x1: X(-10.06), z1: z + 1.7 * ts });
  }

  // ── the night shift ──────────────────────────────────────────────────────────────────────────
  // a clerestory ribbon under the eaves of each hall's outer wall (the model's walls are blank: at night the plant
  // was two black blocks), most panes lit, a few dark; measured on the model: the east hall's wall is x = 8.0,
  // z −6.2…4.1, the west hall's x = −8.05, z −6.8…3.4, the eaves at 4.2
  const dim = new Kit(rng(o.seed + 7));
  const wr = rng(o.seed + 8);
  for (const [wx, z0, z1, sgn] of [[8.02, -5.7, 3.6, 1], [-8.06, -6.3, 2.9, -1]] as [number, number, number, number][]) {
    const n = Math.round((z1 - z0) / 1.05), pw = (z1 - z0) / n;
    const y0 = 3.32 * s, ph = 0.62 * s;
    k.box(0.08, ph + 0.14, (z1 - z0) * s + 0.14, '#3a3442', X(wx) + sgn * 0.03, y0 - 0.07, Z((z0 + z1) / 2), { r: 0, jitter: 0, shade: 0 });
    k.box(0.16, 0.07, (z1 - z0) * s + 0.24, '#b9a58a', X(wx) + sgn * 0.06, y0 - 0.14, Z((z0 + z1) / 2), { r: 0.02, jitter: 0, shade: 0 });
    for (let i = 0; i < n; i++) {
      const t = wr();
      (t < 0.2 ? k : t < 0.45 ? dim : lit).box(0.08, ph, pw * s - 0.09, P.glass, X(wx) + sgn * 0.055, y0, Z(z0 + (i + 0.5) * pw), { r: 0, jitter: 0.04, shade: 0 });
    }
  }
  // bulkhead lights where people go: over the west hall's door, the control house's door, along the east walkway,
  // into the pipe yard between the halls, at the head of the steps; each lays its pool on the deck
  const bulk = (x: number, y: number, z: number, px: number, pz: number, r = 2.6, alongZ = true) => {
    lamps.box(alongZ ? 0.16 : 0.36, 0.14, alongZ ? 0.36 : 0.16, '#e9e1d2', X(x), y * s, Z(z), { r: 0, jitter: 0 });
    lightPool(g, X(px), deck + 0.03, Z(pz), r, warmPool);
  };
  bulk(-9.22, 2.72, -4.5, -9.6, -4.5, 2.3);
  bulk(-2.9, 2.42, -9.82, -3.9, -9.8, 2.3);
  for (const z of [-3.6, 1.4]) bulk(8.1, 2.9, z, 9.0, z, 2.8);
  bulk(2.82, 3.0, 0.4, 1.7, 0.4, 2.8);
  bulk(-2.86, 3.0, -1.6, -1.7, -1.6, 2.8);
  // the steps: a light on a post at their head
  k.box(0.08, 2.5, 0.08, P.steelDark, X(10.01) - 0.2, deck, sz + 0.95, { r: 0, jitter: 0 });
  lamps.box(0.34, 0.14, 0.2, '#e9e1d2', X(10.01) - 0.05, deck + 2.42, sz + 0.95, { r: 0, jitter: 0 });
  lightPool(g, sx1 + 0.3, 0, sz, 2.4, warmPool);
  // the control house's three windows (at the back), lit at night with their glazing bars
  const ctrlMat = glowMat('yel1', 0);
  ctrlMat.color.set('#1c2226');
  ctrlMat.userData.nightOnly = 0.75;
  const ctrl = new Kit(rng(o.seed + 9)), ctrlBars = new Kit(rng(o.seed + 10));
  for (const cx of [0.36, -0.77, -1.88]) {
    ctrl.box(0.5 * s, 0.62 * s, 0.02, '#ffffff', X(cx), 1.66 * s, Z(-11.09), { r: 0, jitter: 0, shade: 0 });
    ctrlBars.box(0.04, 0.62 * s, 0.02, '#e9e1d2', X(cx), 1.66 * s, Z(-11.09) - 0.012, { r: 0, jitter: 0, shade: 0 });
    ctrlBars.box(0.5 * s, 0.035, 0.02, '#e9e1d2', X(cx), 1.95 * s, Z(-11.09) - 0.012, { r: 0, jitter: 0, shade: 0 });
  }
  const night = new THREE.Group();
  const cm = ctrl.build(ctrlMat), cb = ctrlBars.build();
  cm.castShadow = cb.castShadow = false;
  night.add(cm, cb);
  night.visible = false;
  g.add(night);

  let top = 12.4 * s;
  if (!big) {
    // the peaker: the gas main comes in on the east side, behind the operators' pickup
    gasSkid(k, 11.9, -10.2, -5.6, X(10.01) - 0.35, deck + 0.02);
    blockers.push({ x0: 10.2, z0: -10.8, x1: 13.0, z1: -5.0 });
    parkedCars(g, 11.7, 4, 1, 3, o.seed + 4, Math.PI / 2, ['pickup']);
  } else {
    // combined cycle: a boiler behind each block's turbine hall, in the back strip
    const halls: [number, number][] = [[5.47, -6.2], [-5.5, -6.8]];
    const bz = -10.25;
    for (let b = 0; b < blocks; b++) {
      const bx = X(halls[b][0]);
      top = Math.max(top, boiler(k, lamps, g, anim, bx, bz, Z(halls[b][1]) + 0.1, deck, o.seed + b * 9));
      blockers.push({ x0: bx - 2.7, z0: -12.3, x1: bx + 2.7, z1: Z(-11.98) });
    }
    // the steam turbine house in the east strip, the steam mains over to it
    const hx = 9.35, hz = -8.5, hw = 6.3, hd = 6.2, hh = 5.2;
    const hTop = shed(k, hx, hz, hw, hd, hh, { wall: '#e7dfd2', band: RUST, ribs: 1.25 });
    const hf = hz + hd / 2;
    rollDoor(k, hx + 1.3, 0.3, hf + 0.06, 2.6, 3.2);
    k.box(1.0, 2.1, 0.1, '#4a5a66', hx - 2.0, 0.35, hf + 0.04, { r: 0, jitter: 0 });
    windowRow(k, lit, 'z+', hf + 0.02, hx - hw / 2 + 0.5, hx + hw / 2 - 0.5, hh - 1.75, 0.9, 0.75, 0.35, rng(o.seed + 5), 0.75);
    windowRow(k, lit, 'x-', hx - hw / 2 - 0.02, hz - hd / 2 + 0.6, hz + hd / 2 - 0.6, hh - 1.75, 0.9, 0.75, 0.35, rng(o.seed + 6), 0.6);
    wallLamp(lamps, g, hx + 1.3, 3.85, hf + 0.2, 0, undefined, 3);
    for (const dx of [-1.6, 0.4]) k.box(1.3, 0.7, 1.1, P.hvac, hx + dx, hTop, hz - 0.8, { r: 0.08 });
    k.cyl(0.2, 0.2, 1.6, P.silver, hx + 2.2, hTop - 0.1, hz + 1.6, 8);
    k.cyl(0.3, 0.2, 0.25, P.steelDark, hx + 2.2, hTop + 1.5, hz + 1.6, 8, { shade: 0 });
    const wall = hx - hw / 2;
    const b0 = X(halls[0][0]), dy = 0.38 + 10.2 - 1.1;
    const main = [V(b0 + 2.35, dy, bz + 2.52), V(b0 + 3.3, dy, bz + 2.52), V(b0 + 3.3, 4.1, bz + 2.52), V(wall + 0.1, 4.1, bz + 2.52)];
    pipeRun(k, main, 0.2, P.silver, { seg: 8, band: 1.1 });
    k.box(0.16, 4.1 - 0.3, 0.16, P.steel, b0 + 3.3, 0.1, bz + 2.85, { r: 0, jitter: 0 });
    k.box(0.5, 0.12, 0.5, P.steel, b0 + 3.3, 3.78, bz + 2.7, { r: 0, jitter: 0 });
    if (blocks > 1) {
      // the second block's steam comes round low, along the back of the deck
      const b1 = X(halls[1][0]);
      const low = [V(b1 + 2.35, dy, bz + 2.52), V(b1 + 3.1, dy, bz + 2.52), V(b1 + 3.1, 1.5, bz + 2.52), V(b1 + 3.1, 1.5, Z(-11.98) - 0.42), V(wall - 0.8, 1.5, Z(-11.98) - 0.42), V(wall - 0.8, 1.5, hz - 0.5), V(wall + 0.1, 1.5, hz - 0.5)];
      pipeRun(k, low, 0.2, P.silver, { seg: 8, band: 1.3 });
      pipeStands(k, low.slice(3, 5), 0.2, 2.6, 0.1);
      k.box(0.16, 1.2, 0.16, P.steel, b1 + 3.1, 0.1, bz + 2.85, { r: 0, jitter: 0 });
    }
    // the cooling tower in front of the turbine house, cells in a row towards the road; cooling water both ways
    const cells = o.tier >= 3 ? 3 : 2, cell = 3.0;
    const cz = hf + 1.75 + (cells * cell) / 2;
    top = Math.max(top, mechTower(k, g, anim, hx + 0.2, cz, { cells, cell, h: 5.3, ry: Math.PI / 2, plumeK: 0.8 }, o.seed + 20));
    for (const dx of [-1.9, -1.2]) {
      const cw = [V(hx + dx, 0.55, hf), V(hx + dx, 0.55, hf + 1.1)];
      pipe(k, cw[0], cw[1], 0.26, '#6f7f88', 10);
    }
    blockers.push({ x0: hx - hw / 2 - 0.3, z0: hz - hd / 2 - 0.3, x1: hx + hw / 2 + 0.3, z1: cz + (cells * cell) / 2 + 0.6 });
    // water for the boilers: tanks in the back strip where there is no second boiler (or between the two)
    if (blocks > 1) {
      tank(k, X(0) - 0.25, -10.5, 1.25, 4.2, '#e6e0e3', { band: RUST, ladder: true });
      blockers.push({ x0: X(0) - 1.9, z0: -12.2, x1: X(0) + 1.4, z1: -8.8 });
    } else {
      tank(k, -8.4, -10.3, 1.7, 4.4, '#e6e0e3', { band: RUST, ladder: true });
      tank(k, -4.5, -10.5, 1.15, 3.2, '#d3d6d8', { cap: 'flat' });
      pipeRun(k, [V(-6.7, 0.5, -10.3), V(-5.65, 0.5, -10.5)], 0.14, '#6f7f88');
      pipeRun(k, [V(-3.35, 0.5, -10.5), V(X(halls[0][0]) - 2.3, 0.5, -10.5)], 0.14, '#6f7f88');
      blockers.push({ x0: -10.4, z0: -12.3, x1: -3.2, z1: -8.4 });
    }
    // the gas main at the front of the east strip, the pickup beside it
    const gz1 = Z(11.96) - 2.9;
    gasSkid(k, 6.5, 11.6, gz1, X(10.01) - 0.35, deck + 0.02);
    blockers.push({ x0: 5.4, z0: gz1 - 0.7, x1: 7.6, z1: 12.2 });
    parkedCars(g, 10.2, 9.6, 1, 3, o.seed + 4, Math.PI / 2, ['pickup']);
  }
  g.add(k.build(), lamps.build(lampHeadMat));
  if (!lit.empty) g.add(lit.build(hallWin));
  if (!dim.empty) g.add(dim.build(hallWinDim));
  return {
    obj: g, w: 26, d: 24, h: top + 0.5,
    // the platform leaves no room to walk between it and the yard's fence, so the operators come and go at the
    // gate (the middle of the fence's front, 12.4 from the plot's centre: a step in ends between its posts)
    doors: [{ x: 0, z: 12.85 }],
    blockers,
    progress(p) { anim.done = p; },
    update(e) { anim.update(e); night.visible = e.night > 0.05; },
  };
}
