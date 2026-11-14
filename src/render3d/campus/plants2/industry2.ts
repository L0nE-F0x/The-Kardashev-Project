/**
 * Act II's chip plants: the advanced-packaging plant (a clean, low factory under a sawtooth roof,
 * air handlers on top, a truck court with docks, an office front; longer and taller with tiers, a
 * second hall at tier 3) and the Kestrel joint-venture fab on two plots (a huge windowless
 * cleanroom block stepped up to a mechanical penthouse with rows of exhaust stacks, the central
 * utility building, ultrapure water, a bulk gas yard, a chemical tank farm, Kestrel's office).
 */
import * as THREE from 'three';
import { plantOn } from '../trees';
import { Kit, rng, type Paint } from '../../kit';
import type { Piece } from '../../pieces';
import { parkVehicle } from '../industry/common';
import { parkedCars } from '../life';
import type { PieceOpts } from '../registry';
import {
  Anim, bayLines, beacon, coolWinMat, extrudeX, fenceMeshAt, fencePosts, lampHeadMat, litSign, mechTower, P, paving, pipeRun, poleLamp, skyMat,
  shed, sphereTank, tank, V, wallLamp, windowRow, winMat,
} from './parts';

const CLEAN: Paint = '#e9e7e2';

/** A sawtooth roof over x0..x1 × z0..z1 at height y, the glazed faces turned to the front (+z). */
function sawtooth(k: Kit, sky: Kit, x0: number, x1: number, z0: number, z1: number, y: number, tw = 1.9, th = 1.1) {
  for (let z = z0; z + tw <= z1 + 0.01; z += tw) {
    extrudeX(k, x0, x1, [[z, y], [z + tw, y + th], [z + tw, y]], '#cfcdc8', 0, 0.03);
    sky.box(x1 - x0 - 0.4, th - 0.25, 0.06, '#86a9b5', (x0 + x1) / 2, y + 0.05, z + tw + 0.04, { r: 0, jitter: 0.02, shade: 0 });
  }
}
/** An air-handling unit for a roof: a long louvred box with fan discs. */
function ahu(k: Kit, x: number, y: number, z: number, len: number, ry = 0) {
  const a = Math.abs(ry) > 0.1;
  const w = a ? 1.7 : len, d = a ? len : 1.7;
  k.box(w, 1.3, d, P.hvac, x, y, z, { r: 0.1, jitter: 0.03 });
  k.box(w + 0.06, 0.18, d + 0.06, P.hvacDark, x, y + 0.02, z, { r: 0.03, shade: 0 });
  const n = Math.max(1, Math.floor(len / 1.6));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (i + 0.5) * (len / n);
    k.cyl(0.42, 0.42, 0.08, '#5e6670', x + (a ? 0 : t), y + 1.3, z + (a ? t : 0), 12, { shade: 0 });
  }
}

// ── the packaging plant ──────────────────────────────────────────────────────────────────────
export function packaging(o: PieceOpts): Piece {
  const tier = Math.max(1, Math.min(3, o.tier));
  const r = rng(o.seed);
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed + 1));
  const lit = new Kit(rng(o.seed + 2));
  const cool = new Kit(rng(o.seed + 3));
  const lamps = new Kit(rng(o.seed + 4));
  const sky = new Kit(rng(o.seed + 5));
  const ACC: Paint = 'blu4', HI: Paint = 'blu5';
  const halls = tier === 1 ? [{ x: -2.0, z: -4.6, w: 18.0, d: 9.8, h: 5.0 }]
    : tier === 2 ? [{ x: -1.6, z: -4.4, w: 21.4, d: 10.4, h: 6.0 }]
      // (set back so the trucks at the docks stay on the plot: their cabs stood on the grass)
      : [{ x: -1.6, z: -2.9, w: 21.4, d: 7.8, h: 6.4 }, { x: -1.6, z: -10.3, w: 21.4, d: 5.0, h: 6.4 }];
  let top = 0;
  halls.forEach((hl, i) => {
    const roof = shed(k, hl.x, hl.z, hl.w, hl.d, hl.h, { wall: CLEAN, band: ACC, ribs: 1.4, parapet: 0.4 });
    top = Math.max(top, roof);
    k.box(hl.w + 0.04, 0.12, hl.d + 0.04, HI, hl.x, roof - 0.98, hl.z, { r: 0, shade: 0 });
    // the front: a glazed band onto the lines
    if (i === 0) {
      cool.box(hl.w - 8.6, 1.3, 0.08, '#86a9b5', hl.x - 4.0, 1.7, hl.z + hl.d / 2 + 0.03, { r: 0, jitter: 0.02, shade: 0 });
      for (let x = hl.x - hl.w / 2 + 0.4; x < hl.x + hl.w / 2 - 8.4; x += 1.6) k.box(0.12, 1.4, 0.12, '#c9c7c2', x, 1.65, hl.z + hl.d / 2 + 0.07, { r: 0, jitter: 0 });
    }
    // sawtooth over the back of the roof, air handlers and exhausts on the front strip
    const sawD = hl.d * (tier === 3 ? 0.62 : 0.58);
    sawtooth(k, sky, hl.x - hl.w / 2 + 0.4, hl.x + hl.w / 2 - 0.4, hl.z - hl.d / 2 + 0.3, hl.z - hl.d / 2 + 0.3 + sawD, roof - 0.15);
    const az = hl.z + hl.d / 2 - (hl.d - sawD) / 2 - 0.1;
    for (let x = hl.x - hl.w / 2 + 2.2; x < hl.x + hl.w / 2 - 1.5; x += 3.6) ahu(k, x, roof - 0.15, az, 2.8);
    for (let x = hl.x - hl.w / 2 + 4.0; x < hl.x + hl.w / 2 - 2; x += 5.4) {
      k.cyl(0.24, 0.28, 1.9, P.steel2, x, roof - 0.15, az + 1.2, 8);
      k.cyl(0.3, 0.3, 0.14, ACC, x, roof + 1.5, az + 1.2, 8, { shade: 0 });
    }
  });
  // a covered bridge between the two halls (tier 3)
  if (tier === 3) k.box(3.0, 2.4, 3.0, CLEAN, -8.0, 2.4, -7.3, { r: 0.1 });
  const H0 = halls[0];
  const front = H0.z + H0.d / 2;
  // the office front at the left, with the logo panel and the entrance
  const ox = -9.0, oz = front + 2.4, ow = 6.8, od = 4.0, oh = tier >= 2 ? 7.0 : 6.2;
  const oTop = shed(k, ox, oz, ow, od, oh, { wall: '#d7d9dc', band: ACC, ribs: 0 });
  for (let y = 1.0; y < oh - 0.8; y += 2.0) windowRow(k, lit, 'z+', oz + od / 2 + 0.02, ox - ow / 2 + 0.4, ox + ow / 2 - 0.4, y, 1.05, 1.4, 0.18, r, 0.75);
  windowRow(k, lit, 'x-', ox - ow / 2 - 0.02, oz - od / 2 + 0.4, oz + od / 2 - 0.4, oh - 2.6, 0.9, 1.3, 0.25, r, 0.6);
  k.box(3.4, 0.22, 1.9, ACC, ox + 1.4, 2.6, oz + od / 2 + 0.85, { r: 0.04 });
  for (const sx of [-1.4, 1.4]) k.box(0.14, 2.6, 0.14, P.steel, ox + 1.4 + sx, 0.2, oz + od / 2 + 1.6, { r: 0, jitter: 0 });
  cool.box(1.8, 2.1, 0.08, '#86a9b5', ox + 1.4, 0.35, oz + od / 2 + 0.03, { r: 0, jitter: 0 });
  // the logo: four dies stacked on a base, on a blue plate
  const lx = ox - 1.4, ly = oTop - 2.0, lz = oz + od / 2 + 0.1;
  k.box(2.0, 1.5, 0.1, ACC, lx, ly, lz, { r: 0.04, shade: 0 });
  k.box(1.3, 0.16, 0.06, '#fbf7f0', lx, ly + 0.25, lz + 0.07, { r: 0, jitter: 0 });
  for (let i = 0; i < 4; i++) k.box(0.8 - i * 0.04, 0.14, 0.06, i % 2 ? HI : '#fbf7f0', lx, ly + 0.48 + i * 0.2, lz + 0.07, { r: 0, jitter: 0 });
  // the docks at the front-right and a truck court
  const docks = tier === 1 ? 3 : 4;
  const dx0 = H0.x + H0.w / 2 - 1.6;
  for (let i = 0; i < docks; i++) {
    const x = dx0 - i * 3.0;
    k.box(2.4, 2.7, 0.12, '#8e8a96', x, 1.2, front + 0.06, { r: 0.02 });
    for (let y = 1.5; y < 3.8; y += 0.3) k.box(2.3, 0.04, 0.05, '#7a7186', x, y, front + 0.14, { r: 0, jitter: 0 });
    k.box(2.6, 0.2, 0.9, '#2f2a3d', x, 1.05, front + 0.45, { r: 0.02 }); // dock seal
    wallLamp(lamps, g, x, 4.2, front + 0.16);
  }
  k.box(docks * 3.0 + 0.6, 1.1, 1.6, '#a39a91', dx0 - (docks - 1) * 1.5, 0.1, front + 0.8, { r: 0.06 });
  const courtZ1 = Math.min(12.9, front + 12.1);
  paving(k, dx0 - (docks - 1) * 1.5, (front + 1.0 + courtZ1) / 2, docks * 3.0 + 1.6, courtZ1 - front - 1.0);
  const trucks = tier === 1 ? [0] : [0, 2];
  for (const i of trucks) {
    parkVehicle(g, 'semitruck', 10.4, dx0 - i * 3.0, front + 6.6, Math.PI / 2);
  }
  // nitrogen tanks and a vaporiser bank at the back right
  const tx = 11.0;
  for (const [i, tz] of (tier === 3 ? [-11.4, -8.4, -5.4] : [-9.6, -6.4]).entries()) {
    tank(k, tx + (i % 2) * 0.4, tz, 1.0, tier >= 2 ? 6.6 : 5.6, '#eeeeec', { band: ACC, cap: 'dome', ladder: i === 0 });
  }
  for (let i = 0; i < 4; i++) k.box(0.5, 2.6, 0.5, '#cfd3d6', tx - 0.6 + (i % 2) * 0.9, 0.1, -2.6 + Math.floor(i / 2) * 0.9, { r: 0.04 });
  pipeRun(k, [V(tx, 2.6, -2.2), V(H0.x + H0.w / 2 + 0.1, 2.6, -2.2)], 0.12, P.steel2, { seg: 6 });
  // the car park, lamps, a hedge
  paving(k, -6.2, 10.4, 12.8, 3.6);
  bayLines(k, -12.2, 10.4, 5, 2.3, 3.0);
  parkedCars(g, -11.05, 10.4, 5, 2.3, o.seed + 9, Math.PI / 2);
  // (the second lamp stood in the truck court, at tier 2 inside a trailer: it lights the court from its edge)
  poleLamp(k, lamps, g, -12.8, 8.2, 4.4, 1);
  poleLamp(k, lamps, g, -4.7, front + 4.6, 4.4, 1);
  for (let x = -12.6; x < -0.4; x += 1.0) plantOn(k, 'shrub', { x, y: 0.12, z: 12.6, s: 0.85, ry: x * 2.3 }, false);
  g.add(k.build(), lit.build(winMat), cool.build(coolWinMat), sky.build(skyMat), lamps.build(lampHeadMat));
  return { obj: g, w: o.w, d: o.d, h: Math.max(top + 1.9, oTop, tier >= 2 ? 7.4 : 6.4) };
}

// ── the Kestrel joint-venture fab (two plots) ───────────────────────────────────────────────
export function fab(o: PieceOpts): Piece {
  const r = rng(o.seed);
  const g = new THREE.Group();
  const anim = new Anim();
  const k = new Kit(rng(o.seed + 1));
  const lit = new Kit(rng(o.seed + 2));
  const cool = new Kit(rng(o.seed + 3));
  const lamps = new Kit(rng(o.seed + 4));
  const ACC: Paint = '#df5f3e', HI: Paint = '#f08a46';
  const D = o.d / 2;
  // the cleanroom block: a sub-fab base, the fab, the fan-deck penthouse
  const fx = -3.8, fz = -1.8, fw = 18.4, fd = 25.6;
  const t1 = shed(k, fx, fz, fw, fd, 4.6, { wall: '#d6d3cd', band: null, ribs: 0, parapet: 0.3 });
  // louvres round the sub-fab
  for (const sz of [-1, 1]) for (let y = 1.4; y < 3.8; y += 0.32) k.box(fw - 2, 0.05, 0.08, '#aaa6a0', fx, y, fz + sz * (fd / 2 + 0.04), { r: 0, jitter: 0, shade: 0 });
  const t2 = shed(k, fx, fz - 0.4, fw - 1.6, fd - 2.4, 8.4, { wall: CLEAN, band: ACC, ribs: 2.4, rib: '#d9d6d0', plinth: null, y: t1 - 0.35 });
  k.box(fw - 1.56, 0.16, fd - 2.36, HI, fx, t2 - 1.12, fz - 0.4, { r: 0, shade: 0 });
  // a ribbon of corridor glazing down each long side of the fab floor (cool white at night: the fab never sleeps)
  for (const sx of [-1, 1]) {
    k.box(0.06, 0.9, fd - 7.6, '#4a4f58', fx + sx * ((fw - 1.6) / 2 + 0.01), t1 + 1.25, fz - 0.4, { r: 0, jitter: 0, shade: 0 });
    for (let z = fz - 0.4 - (fd - 8) / 2; z < fz - 0.4 + (fd - 8) / 2 - 0.5; z += 2.4) cool.box(0.08, 0.7, 2.2, '#86a9b5', fx + sx * ((fw - 1.6) / 2 + 0.03), t1 + 1.35, z + 1.2, { r: 0, jitter: 0.03, shade: 0 });
  }
  // a mechanical floor band half way up
  k.box(fw - 1.5, 1.0, fd - 2.3, '#c9c6c0', fx, t1 + 3.4, fz - 0.4, { r: 0.04, shade: 0 });
  for (const sz of [-1, 1]) for (let y = t1 + 3.55; y < t1 + 4.35; y += 0.25) k.box(fw - 2.4, 0.04, 0.06, '#9d9993', fx, y, fz - 0.4 + sz * ((fd - 2.3) / 2 + 0.02), { r: 0, jitter: 0, shade: 0 });
  const t3 = shed(k, fx - 0.6, fz - 1.6, fw - 6.4, fd - 8.4, 2.6, { wall: '#d6d3cd', band: null, ribs: 1.0, plinth: null, y: t2 - 0.35 });
  // exhaust stacks in rows on the penthouse, scrubbers beside them
  let stackTop = 0;
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const sx = fx - 0.6 - 5.0 + i * 2.0, sz = fz - 1.6 - 5.4 + j * 5.0;
      const sh = 3.0 + ((i + j) % 2) * 0.5;
      k.cyl(0.32, 0.38, sh, '#c3c0ba', sx, t3 - 0.1, sz, 10);
      k.cyl(0.36, 0.36, 0.22, i % 3 === 0 ? ACC : P.steel, sx, t3 - 0.1 + sh - 0.2, sz, 10, { shade: 0 });
      stackTop = Math.max(stackTop, t3 + sh);
    }
  for (let j = 0; j < 3; j++) k.box(2.4, 1.6, 1.4, '#b9c2c4', fx - 0.6 + 5.0, t3 - 0.1, fz - 1.6 - 5.4 + j * 5.0, { r: 0.1 });
  beacon(g, fx - 5.6, stackTop + 0.4, fz - 7.0, 0.5);
  beacon(g, fx + 4.4, stackTop + 0.4, fz + 3.0, 2.0);
  // air handlers on the fab roof round the penthouse
  for (let z = fz - 12.2; z < fz + 10; z += 3.4) ahu(k, fx + fw / 2 - 2.0, t2 - 0.1, z, 2.6, Math.PI / 2);
  for (let x = fx - fw / 2 + 2.0; x < fx + fw / 2 - 3; x += 3.6) ahu(k, x, t2 - 0.1, fz + fd / 2 - 3.2, 2.8);
  // the stacked-die mark on the fab's front face, Kestrel orange
  const mx = fx - fw / 2 + 4.4, mz = fz + fd / 2 - 1.2 + 0.02, my = t1 + 4.8;
  k.box(3.4, 2.6, 0.1, '#fbf7f0', mx, my, mz, { r: 0.03, shade: 0 });
  k.box(2.4, 0.3, 0.08, ACC, mx, my + 0.35, mz + 0.06, { r: 0, jitter: 0 });
  for (let i = 0; i < 4; i++) k.box(1.5 - i * 0.05, 0.28, 0.08, i % 2 ? HI : ACC, mx, my + 0.8 + i * 0.4, mz + 0.06, { r: 0, jitter: 0 });
  // the office, Kestrel's name on it; a glazed gowning link into the fab
  const ox = -5.0, oz = D - 9.4, ow = 15.6, od = 5.6, oh = 8.6;
  const oTop = shed(k, ox, oz, ow, od, oh, { wall: '#e9e1d2', band: ACC, ribs: 0 });
  for (let y = 1.0; y < oh - 1.0; y += 2.3) windowRow(k, lit, 'z+', oz + od / 2 + 0.02, ox - ow / 2 + 0.5, ox + ow / 2 - 0.5, y, 1.1, 1.5, 0.16, r, 0.7);
  for (let y = 1.0; y < oh - 1.0; y += 2.3) windowRow(k, lit, 'x-', ox - ow / 2 - 0.02, oz - od / 2 + 0.5, oz + od / 2 - 0.5, y, 1.1, 1.5, 0.2, r, 0.6);
  const sg = litSign('KESTREL', 7.6, '#fbf7f0', ACC);
  sg.position.set(ox + 2.0, oTop + 0.62, oz + od / 2 - 0.3);
  g.add(sg);
  k.box(8.0, (sg.userData.signHeight as number) + 0.2, 0.3, ACC, ox + 2.0, oTop - 0.05, oz + od / 2 - 0.48, { r: 0.04 });
  k.box(4.2, 0.24, 2.2, ACC, ox + ow / 2 - 3.0, 2.8, oz + od / 2 + 1.0, { r: 0.04 });
  for (const sx of [-1.8, 1.8]) k.box(0.14, 2.8, 0.14, P.steel, ox + ow / 2 - 3.0 + sx, 0.2, oz + od / 2 + 1.9, { r: 0, jitter: 0 });
  cool.box(2.4, 2.3, 0.08, '#86a9b5', ox + ow / 2 - 3.0, 0.35, oz + od / 2 + 0.03, { r: 0, jitter: 0 });
  const linkZ0 = fz + fd / 2, linkZ1 = oz - od / 2;
  k.box(3.2, 0.4, linkZ1 - linkZ0 + 0.2, '#c9c6c0', -8.4, 3.6, (linkZ0 + linkZ1) / 2, { r: 0.05 });
  cool.box(3.0, 2.8, linkZ1 - linkZ0 + 0.1, '#86a9b5', -8.4, 4.0, (linkZ0 + linkZ1) / 2, { r: 0.05, jitter: 0.02 });
  k.box(3.3, 0.35, linkZ1 - linkZ0 + 0.3, P.roof, -8.4, 6.8, (linkZ0 + linkZ1) / 2, { r: 0.05 });
  // car park, a gatehouse with a barrier, the monument sign at the gate
  paving(k, -5.8, D - 3.4, 14.6, 4.0);
  // (five bays: the sixth was under the entrance canopy, a car between its posts)
  bayLines(k, -12.6, D - 3.4, 5, 2.3, 3.2);
  parkedCars(g, -11.45, D - 3.4, 5, 2.3, o.seed + 9, Math.PI / 2);
  k.box(2.4, 2.6, 2.0, '#e9e1d2', 9.4, 0.1, D - 4.2, { r: 0.1 });
  k.box(2.8, 0.25, 2.4, ACC, 9.4, 2.7, D - 4.2, { r: 0.04 });
  lit.box(1.6, 0.8, 0.06, P.glass, 9.4, 1.3, D - 3.17, { r: 0, jitter: 0 });
  k.box(0.8, 1.6, 0.06, '#4a5a66', 8.9, 0.12, D - 3.17, { r: 0, jitter: 0 });
  // the barrier across the road: its housing by the gatehouse, the arm, a rest post on the far side
  k.box(0.4, 1.1, 0.4, '#e9e1d2', 8.45, 0.1, D - 3.0, { r: 0.05 });
  k.box(3.5, 0.1, 0.1, '#fbf7f0', 6.6, 1.0, D - 3.0, { r: 0, jitter: 0 });
  for (let x = 5.2; x < 8.2; x += 0.9) k.box(0.45, 0.11, 0.11, 'red3', x, 0.995, D - 3.0, { r: 0, jitter: 0 });
  k.box(0.12, 0.95, 0.12, P.steel, 4.95, 0.1, D - 3.0, { r: 0, jitter: 0 });
  k.box(3.2, 1.2, 0.5, '#d9d1c4', 11.1, 0.1, D - 1.5, { r: 0.06 });
  const sg2 = litSign('KESTREL', 2.8, ACC, '#d9d1c4', 0.5);
  sg2.position.set(11.1, 0.75, D - 1.24);
  g.add(sg2);
  // the site road, from the gate to the utility yard (it stopped short of the fence)
  paving(k, 7.0, 1.85, 2.2, o.d - 4.3, '#8c8478');
  // the chemical tank farm in its bund (right side)
  const cx0 = 8.6, cx1 = 13.3;
  for (const [a, b, c, d] of [[cx0, -4.0, cx1, -4.0], [cx0, 9.6, cx1, 9.6], [cx0, -4.0, cx0, 9.6], [cx1, -4.0, cx1, 9.6]] as number[][]) k.beam(V(a, 0.45, b), V(c, 0.45, d), 0.3, P.concrete2);
  const chem: Paint[] = ['#e6e0e3', '#cfe0e8', '#f0e2b0', '#e6e0e3', '#dcd0e4', '#cfe0e8', '#e6e0e3', '#f0e2b0'];
  for (let i = 0; i < 8; i++) tank(k, 9.8 + (i % 2) * 2.3, -2.4 + Math.floor(i / 2) * 3.3, 0.85, 3.0 + (i % 3) * 0.3, chem[i], { band: i % 2 ? HI : ACC, cap: 'cone', plinth: false });
  // a pipe rack from the farm (and the gas yard) into the fab
  // (it bridges the site road: its posts stood in the lane)
  const rackX = 7.0;
  for (let z = -14; z <= 8; z += 3.0) {
    for (const sx of [-1.3, 1.3]) k.box(0.2, 4.2, 0.2, P.steel, rackX + sx, 0.1, z, { r: 0, jitter: 0 });
    k.box(2.9, 0.2, 0.3, P.steel, rackX, 4.2, z, { r: 0, jitter: 0 });
  }
  const pipeCols: Paint[] = [P.silver, '#cfe0e8', HI, '#9cc4ea'];
  pipeCols.forEach((c, i) => pipeRun(k, [V(rackX - 0.5 + i * 0.33, 4.5, -14.0), V(rackX - 0.5 + i * 0.33, 4.5, 8.0)], 0.13, c, { seg: 6 }));
  for (let z = -10; z <= 6; z += 8) pipeRun(k, [V(rackX - 0.5, 4.5, z), V(rackX - 0.5, 4.5, z + 0.01), V(fx + fw / 2 + 0.05, 4.5, z)], 0.15, P.silver, { seg: 6 });
  // the bulk gas yard: Horton spheres and tall cryogenic tanks, fenced
  sphereTank(k, 11.0, -12.4, 1.7, '#eceae6');
  sphereTank(k, 11.0, -8.4, 1.5, '#eceae6');
  tank(k, 9.6, -16.4, 0.75, 7.4, '#f4f2ee', { band: ACC, ladder: true });
  tank(k, 12.0, -16.4, 0.75, 7.4, '#f4f2ee', { band: '#9cc4ea' });
  fencePosts(k, 11.0, -12.0, 5.2, 10.6, 2.4, P.steel, 1.4);
  const fg = new THREE.Group();
  fg.position.set(11.0, 0, -12.0);
  fenceMeshAt(fg, 5.2, 10.6, 2.4, 1.35);
  g.add(fg);
  // the central utility building with its cooling cells on the roof, ultrapure water beside it
  const cubTop = shed(k, -6.2, -D + 6.2, 13.4, 8.2, 6.8, { wall: '#dcd9d3', band: ACC, ribs: 1.3 });
  const towerTop = mechTower(k, g, anim, -6.2, -D + 6.2, { cells: 3, cell: 3.9, h: 4.6, y: cubTop - 0.1 }, o.seed + 30);
  for (let x = -11; x <= -1.5; x += 3.2) pipeRun(k, [V(x, 3.4, -D + 10.4), V(x, 3.4, fz - fd / 2 - 0.1)], 0.22, x < -6 ? '#9cc4ea' : P.silver, { seg: 8 });
  for (let x = -11.5; x <= -1; x += 3.5) k.box(0.2, 3.2, 0.2, P.steel, x, 0.1, -D + 11.8, { r: 0, jitter: 0 });
  shed(k, 7.8, -D + 4.6, 10.4, 5.4, 4.4, { wall: '#e6ebee', band: '#4a7cb6', ribs: 1.2 });
  for (const [i, x] of [3.6, 7.6, 11.6].entries()) tank(k, x, -D + 10.2, 1.55, 5.4, '#e3ebf0', { band: '#4a7cb6', ladder: i === 1 });
  // fence round the whole site, lamps on the roads
  // (the gate is where the road is: it was in the middle, in front of the parked cars, and the road met the fence)
  const gate: [number, number][] = [[5.1, 8.5]];
  fencePosts(k, 0, 0, o.w - 1.2, o.d - 1.2, 0, P.steel, 1.4, gate);
  const fg2 = new THREE.Group();
  fenceMeshAt(fg2, o.w - 1.2, o.d - 1.2, 0, 1.35, gate);
  g.add(fg2);
  for (const z of [-18, -6.5, 5.5, 16]) poleLamp(k, lamps, g, 5.72, z, 5.0, 1);
  g.add(k.build(), lit.build(winMat), cool.build(coolWinMat), lamps.build(lampHeadMat));
  return {
    obj: g, w: o.w, d: o.d, h: Math.max(stackTop, towerTop, oTop + 1.4) + 0.2,
    progress(p) { anim.done = p; },
    update(e) { anim.update(e); },
  };
}
