/**
 * Act II's nuclear plants: the reactor restart (old concrete, patched and re-clad, scaffolding
 * still up, a natural-draft tower steaming again), the SMR pack (Little Sun's factory-built
 * modules in a row on a pool building; eight at tier 2) and the 1.1 GW plant on two plots (the
 * landmark: a big containment, the turbine hall, two hyperbolic towers with plumes).
 */
import * as THREE from 'three';
import { Kit, rng, type Paint } from '../../kit';
import { scaffold, type Piece } from '../../pieces';
import { parkedCars } from '../life';
import type { PieceOpts } from '../registry';
import {
  Anim, At, bayLines, beacon, draftTower, extrudeX, floodRing, litSign, fenceMeshAt, fencePosts, lampHeadMat, mechTower, mixHex, P, paving, pipeRun, pipeStands,
  poleLamp, rollDoor, sagWires, shed, switchyard, tank, transformer, V, wallLamp, washMat, windowRow, winMat, coolWinMat,
} from './parts';

// ── shared: containment, turbine hall, vent stack ────────────────────────────────────────────
interface ContainOpts { paint?: Paint; weather?: number; patches?: number; band?: Paint; seed: number }
/** A reactor containment: a cylinder and dome hand-painted in panels, a ring girder, buttresses, the equipment hatch. Returns the top. */
function containment(k: Kit, x: number, z: number, r: number, wall: number, o: ContainOpts) {
  const paint = o.paint ?? '#e2dcd2';
  const wea = o.weather ?? 0.12;
  const rand = rng(o.seed);
  k.cyl(r + 0.5, r + 0.6, 0.7, P.concrete2, x, 0, z, 32, { shade: 0.15 });
  // profile: wall then dome; painted in slices × lifts
  const prof: THREE.Vector2[] = [new THREE.Vector2(r, 0), new THREE.Vector2(r, wall * 0.5), new THREE.Vector2(r, wall)];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * r), wall + Math.sin(a) * r));
  }
  const ranges: [number, number][] = [[0, 1], [1, 2], [2, 7], [7, 12]];
  const slices = 10;
  for (const [i0, i1] of ranges)
    for (let s = 0; s < slices; s++) {
      const geo = new THREE.LatheGeometry(prof.slice(i0, i1 + 1), 3, (s / slices) * Math.PI * 2, (Math.PI * 2) / slices).translate(x, 0.6, z);
      const stain = Math.sin(s * 2.3 + i0) * 0.5 + 0.5;
      k.geo(geo, mixHex(paint, '#8f877c', wea * (0.3 + 0.7 * stain) * (i0 === 0 ? 1.2 : 0.8)), 0.03, i0 === 0 ? 0.14 : 0);
    }
  // ring girder at the springline, a band at the top of the wall
  k.cyl(r * 1.015, r * 1.015, 0.55, mixHex(paint, '#7a7186', 0.18), x, 0.6 + wall - 0.3, z, 40, { shade: 0 });
  if (o.band) k.cyl(r * 1.012, r * 1.012, 0.35, o.band, x, 0.6 + wall - 1.2, z, 40, { shade: 0 });
  // three buttresses
  for (const a of [Math.PI * 0.5 + 0.6, Math.PI * 0.5 + 0.6 + (2 * Math.PI) / 3, Math.PI * 0.5 + 0.6 + (4 * Math.PI) / 3]) {
    k.box(0.9, wall, 0.6, mixHex(paint, '#7a7186', 0.08), x + Math.cos(a) * (r + 0.12), 0.6, z + Math.sin(a) * (r + 0.12), { r: 0.08, ry: -a - Math.PI / 2, shade: 0.1 });
  }
  // the equipment hatch (front) and a vent on the crown
  k.box(2.8, 3.4, 1.2, mixHex(paint, '#7a7186', 0.12), x - r * 0.42, 0.6, z + r * 0.88, { r: 0.1, ry: 0.45 });
  k.box(2.0, 2.4, 0.2, '#5b5562', x - r * 0.42 - 0.24, 0.8, z + r * 0.88 + 0.55, { r: 0.03, ry: 0.45 });
  k.cyl(0.5, 0.6, 0.8, P.steel2, x, 0.6 + wall + r - 0.15, z, 10, { shade: 0 });
  // patches of fresh concrete (the restart)
  for (let i = 0; i < (o.patches ?? 0); i++) {
    const th = -1.9 + rand() * 2.8, ph = 0.9 + rand() * 1.6, py = 1.2 + rand() * (wall - ph - 1.2);
    k.geo(new THREE.CylinderGeometry(r + 0.04, r + 0.04, ph, 3, 1, true, th, 0.2 + rand() * 0.25).translate(x, 0.6 + py, z), '#e8e2d8', 0.02, 0);
  }
  return 0.6 + wall + r;
}
/** Small bulkhead lamps round a containment's ring girder (the gallery at the springline). */
function galleryLamps(lamps: Kit, x: number, z: number, r: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = 0.25 + (i / n) * Math.PI * 2;
    lamps.box(0.16, 0.12, 0.16, '#e9e1d2', x + Math.cos(a) * (r * 1.015 + 0.06), y + 0.28, z + Math.sin(a) * (r * 1.015 + 0.06), { r: 0.02, ry: -a, jitter: 0 });
  }
}
/** A slim vent stack with a platform and a beacon. */
function ventStack(k: Kit, g: THREE.Group, x: number, z: number, h: number, paint: Paint = '#c9c3ba') {
  k.cyl(0.9, 1.0, 0.6, P.concrete2, x, 0, z, 12);
  k.cyl(0.5, 0.62, h, paint, x, 0.5, z, 12, { shade: 0.1 });
  k.cyl(0.85, 0.85, 0.12, P.steel, x, h * 0.72, z, 12, { shade: 0 });
  for (const y of [h * 0.3, h * 0.55]) k.cyl(0.6, 0.6, 0.1, P.steel2, x, y, z, 12, { shade: 0 });
  k.box(0.35, h * 0.72, 0.1, P.steelDark, x, 0.5, z + 0.58, { r: 0, jitter: 0 });
  beacon(g, x, h + 0.75, z, x * 0.3);
}
/** A big turbine hall: clad, clerestory glazing, a roller door, roof vents. Returns the roof height. */
function turbineHall(k: Kit, lit: Kit, lamps: Kit, g: THREE.Group, x: number, z: number, w: number, d: number, h: number, rand: () => number, o: { wall?: Paint; band?: Paint | null; cladding?: (bx: number, i: number) => Paint | null } = {}) {
  const top = shed(k, x, z, w, d, h, { wall: o.wall ?? '#d9d3ca', band: o.band === undefined ? 'cyn3' : o.band, ribs: 1.3 });
  if (o.cladding) {
    for (let bx = x - w / 2 + 0.75, i = 0; bx < x + w / 2 - 0.7; bx += 1.3, i++) {
      const c = o.cladding(bx, i);
      if (c) k.box(1.2, h - 3.2, 0.08, c, bx, 1.1, z + d / 2 + 0.1, { r: 0.02, jitter: 0.06, shade: 0.05 });
    }
  }
  windowRow(k, lit, 'z+', z + d / 2 + 0.03, x - w / 2 + 0.6, x + w / 2 - 0.6, h - 1.6, 0.9, 0.9, 0.4, rand, 0.75);
  rollDoor(k, x + w / 2 - 2.6, 0.3, z + d / 2 + 0.06, 3.2, 4.2);
  wallLamp(lamps, g, x + w / 2 - 2.6, 4.8, z + d / 2 + 0.2);
  wallLamp(lamps, g, x - w / 2 + 2.0, 4.0, z + d / 2 + 0.2);
  for (let bx = x - w / 2 + 1.8; bx < x + w / 2 - 1.2; bx += 3.0) k.box(1.4, 0.8, 1.2, P.hvac, bx, top, z - d * 0.2, { r: 0.08 });
  return top;
}
/** A fence round the whole plot, gate in the front middle (posts + see-through mesh). */
function plotFence(k: Kit, g: THREE.Group, w: number, d: number, gate = 7, gaps: [number, number][] = []) {
  fencePosts(k, 0, 0, w, d, gate, P.steel, 1.4, gaps);
  const fg = new THREE.Group();
  fenceMeshAt(fg, w, d, gate, 1.35, gaps);
  g.add(fg);
}
/** An office block with windows and a sign (faces +z). */
function office(k: Kit, lit: Kit, lamps: Kit, g: THREE.Group, x: number, z: number, w: number, d: number, h: number, rand: () => number, band: Paint = 'cyn3') {
  const top = shed(k, x, z, w, d, h, { wall: P.cream, band, ribs: 0 });
  for (let y = 1.2; y < h - 0.8; y += 1.9) windowRow(k, lit, 'z+', z + d / 2 + 0.02, x - w / 2 + 0.5, x + w / 2 - 0.5, y, 1.0, 1.0, 0.35, rand, 0.7);
  k.box(1.4, 2.1, 0.1, '#4a5a66', x + w / 2 - 1.3, 0.35, z + d / 2 + 0.04, { r: 0, jitter: 0 });
  k.box(2.4, 0.18, 0.9, band, x + w / 2 - 1.3, 2.5, z + d / 2 + 0.45, { r: 0.04 });
  wallLamp(lamps, g, x + w / 2 - 1.3, 2.3, z + d / 2 + 0.2);
  return top;
}

// ── the reactor restart ──────────────────────────────────────────────────────────────────────
export function restart(o: PieceOpts): Piece {
  const r = rng(o.seed);
  const g = new THREE.Group();
  const anim = new Anim();
  const k = new Kit(rng(o.seed + 1));
  const lit = new Kit(rng(o.seed + 2));
  const lamps = new Kit(rng(o.seed + 3));
  const OLD = '#c2b8a8';
  // the cooling tower behind, steaming again
  const tx = 7.0, tz = -6.4, tr = 5.8;
  const tk = new Kit(rng(o.seed + 4)), ck = new Kit(rng(o.seed + 6)); // the tower and the containment: floodlit at night
  const t = draftTower(tk, tx, tz, 22, tr, { paint: '#cfc6b6', weather: 0.5, stripe: null });
  floodRing(k, lamps, g, tx, tz, tr * 1.09, 6, { y: 0.5, phase: 0.5 });
  anim.plume(g, tx, t.top, tz, { count: 30, life: 11, rise: 2.0, spread: 1.6, size0: t.r * 1.6, size1: t.r * 4.2, opacity: 0.75, radius: t.r * 0.6, wind: 0.8 }, o.seed + 5);
  beacon(g, tx + t.r * 0.9, t.top + 0.3, tz, 0.4);
  beacon(g, tx - t.r * 0.9, t.top + 0.3, tz, 2.1);
  // old containment, freshly patched; the aux block and the vent stack
  const cx = -6.4, cz = -5.0, cr = 4.4;
  const cTop = containment(ck, cx, cz, cr, 5.6, { paint: OLD, weather: 0.45, patches: 9, seed: o.seed + 7 });
  floodRing(k, lamps, g, cx, cz, cr + 1.5, 5, { phase: 2.2, pool: 3.8, skip: (px, pz) => pz > cz + cr * 0.5 || px < -12.6 });
  galleryLamps(lamps, cx, cz, cr, 0.6 + 5.6, 6);
  shed(k, -6.0, 0.0, 9.4, 2.8, 4.4, { wall: OLD, band: null, ribs: 0, roof: '#57515e' });
  ventStack(k, g, -0.9, -9.8, 15.5, '#bdb3a4');
  // turbine hall: rusty old panels with new blue ones bolted in
  const hallTop = turbineHall(k, lit, lamps, g, -2.4, 4.4, 15.4, 5.8, 6.8, r, {
    wall: '#cbbfab', band: null,
    cladding: () => (r() < 0.32 ? (r() < 0.5 ? 'blu4' : '#5a8cc4') : r() < 0.5 ? '#b08f6e' : '#a3876c'),
  });
  // scaffolding at the hall's east end and up one side of the containment, a skip and a site cabin
  const sc = scaffold(3.6, 7.8, 6.6, o.seed + 9);
  sc.position.set(6.6, 0, 4.4);
  g.add(sc);
  const sc2 = scaffold(3.2, 6.6, 1.4, o.seed + 10);
  sc2.position.set(cx - cr * 0.55, 0.6, cz + cr * 0.95);
  sc2.rotation.y = 0.5;
  g.add(sc2);
  // a skip (open, half full of broken concrete) and the site cabin (a door, a step, a window: it was a 1.6 m box)
  extrudeX(k, 9.85, 11.35, [[0.95, 0.12], [0.5, 1.3], [3.1, 1.3], [2.65, 0.12]], 'org1', 0.14, 0.04);
  k.box(1.26, 0.06, 2.3, '#3a3442', 10.6, 1.27, 1.8, { r: 0, jitter: 0, shade: 0 });
  for (let i = 0; i < 9; i++) {
    const s = 0.28 + r() * 0.34;
    k.box(s, s * 0.6, s * 0.9, r() < 0.3 ? '#8c5a44' : mixHex(OLD, '#8f877c', r() * 0.6), 10.15 + r() * 0.9, 1.2 + r() * 0.08, 0.95 + r() * 1.7, { r: 0.03, ry: r() * 3, jitter: 0.06 });
  }
  for (const zz of [0.62, 2.98]) k.box(1.56, 0.1, 0.1, '#b8603a', 10.6, 1.22, zz, { r: 0.02, jitter: 0 });
  k.box(3.6, 2.4, 1.8, '#e9e1d2', 10.0, 0.1, -0.6, { r: 0.08 });
  k.box(3.7, 0.12, 1.9, '#8a8490', 10.0, 2.5, -0.6, { r: 0.03, shade: 0 });
  lit.box(1.2, 0.7, 0.06, P.glass, 9.3, 1.25, 0.32, { r: 0, jitter: 0 });
  k.box(0.8, 1.9, 0.06, '#4a5a66', 11.0, 0.3, 0.32, { r: 0, jitter: 0 });
  k.box(1.0, 0.2, 0.5, '#8a8490', 11.0, 0.1, 0.55, { r: 0.02 });
  // the new switchyard (bright steel) and fresh transformers by the hall
  const lines = switchyard(k, g, 8.6, 9.4, 9.0, 6.0, { bays: 2, gantryH: 5 });
  const a = new At(k, 0, 0, 0);
  const bush: THREE.Vector3[][] = [];
  for (const bx of [-9.0, -5.8]) {
    transformer(a, bx, 8.6, 0.9);
    bush.push([-0.585, 0, 0.585].map((b) => V(bx + b, 3.2 * 0.9 + 0.32, 8.78)));
  }
  // their bus: bars up to a duct along the hall's wall, over the roller door (strung straight across, the
  // conductors hung at head height over the car park and across the door), then overhead into the yard
  const by = 6.25, bz = 4.4 + 2.9 + 0.26, bx1 = 4.5;
  k.box(bx1 + 9.9, 0.3, 0.42, '#b9b1a6', (bx1 - 9.9) / 2, by, bz, { r: 0.04, shade: 0 });
  for (let x = -9.4; x < bx1; x += 2.3) k.box(0.1, 0.5, 0.5, P.steel, x, by - 0.3, bz - 0.02, { r: 0, jitter: 0 });
  const wires: THREE.Vector3[][] = [];
  for (const b of bush) for (const p of b) k.beam(p, V(p.x, by + 0.05, bz + 0.12), 0.045, '#8c5a44');
  for (let j = 0; j < 3; j++) wires.push([V(bx1, by + 0.15, bz - 0.14 + j * 0.14), lines[0]?.[j] ?? V(bx1, by, bz)]);
  sagWires(k, wires, 0.35, '#4a4452', 0.03);
  // the admin block and car park (front-left)
  // (it stands in the fence line, its door on the street side: the fence ran through it)
  office(k, lit, lamps, g, -9.2, 11.1, 7.0, 2.0, 3.6, r);
  paving(k, -0.6, 10.8, 9.6, 3.4);
  bayLines(k, -5.2, 10.8, 4, 2.3, 3.0);
  parkedCars(g, -4.05, 10.8, 4, 2.3, o.seed + 11, Math.PI / 2);
  // circulating water to the tower
  for (const dz of [-0.8, 0.8]) {
    const cw = [V(3.6, 0.9, 2.2 + dz * 0.6), V(3.6, 0.9, -1.0 + dz), V(tx - tr * 0.8, 0.9, -1.0 + dz)];
    pipeRun(k, cw, 0.42, '#6f7f88', { seg: 10 });
    pipeStands(k, cw, 0.42, 1.8);
  }
  // an old fence, rust-brown posts
  plotFence(k, g, o.w - 1.4, o.d - 1.4, 7, [[-12.95, -5.45]]);
  for (const z of [-11.5, 2.0]) poleLamp(k, lamps, g, -12.4, z, 4.6, 1);
  g.add(k.build(), tk.build(washMat.mid), ck.build(washMat.low), lit.build(winMat), lamps.build(lampHeadMat));
  return {
    obj: g, w: o.w, d: o.d, h: Math.max(22, cTop, hallTop) + 0.4,
    progress(p) { anim.done = p; },
    update(e) { anim.update(e); },
  };
}

// ── the SMR pack (Little Sun) ────────────────────────────────────────────────────────────────
export function smr(o: PieceOpts): Piece {
  const T2 = o.tier >= 2;
  const r = rng(o.seed);
  const g = new THREE.Group();
  const anim = new Anim();
  const k = new Kit(rng(o.seed + 1));
  const lit = new Kit(rng(o.seed + 2));
  const lamps = new Kit(rng(o.seed + 3));
  const SUN: Paint = 'yel0';
  // the pool building (semi-buried) and the modules on it
  const mr = T2 ? 1.75 : 2.05, gap = T2 ? 4.3 : 4.9;
  const rows = T2 ? [-6.0, -1.6] : [-2.6];
  const plinthH = 1.5;
  const pz0 = rows[0] - mr - 1.3, pz1 = rows[rows.length - 1] + mr + 1.3;
  const pw = gap * 4 + 1.0;
  k.box(pw + 0.6, 0.5, pz1 - pz0 + 0.6, P.concrete2, 0, 0, (pz0 + pz1) / 2, { r: 0.1 });
  k.box(pw, plinthH, pz1 - pz0, '#d8d2c8', 0, 0.3, (pz0 + pz1) / 2, { r: 0.18, shade: 0.2 });
  k.box(pw + 0.05, 0.28, pz1 - pz0 + 0.05, SUN, 0, plinthH - 0.1, (pz0 + pz1) / 2, { r: 0.04, shade: 0 });
  k.box(pw - 0.6, 0.08, pz1 - pz0 - 0.6, '#b9b2a8', 0, plinthH + 0.3, (pz0 + pz1) / 2, { r: 0, shade: 0, jitter: 0.02 });
  const y0 = plinthH + 0.35;
  let modTop = 0;
  for (const z of rows)
    for (let i = 0; i < 4; i++) {
      const x = -1.5 * gap + i * gap;
      const mh = T2 ? 2.6 : 3.0;
      k.cyl(mr + 0.25, mr + 0.3, 0.3, '#9d958a', x, y0, z, 24, { shade: 0 });
      k.cyl(mr, mr, mh, '#efebe5', x, y0 + 0.25, z, 28, { shade: 0.12, jitter: 0.02 });
      k.cyl(mr * 1.012, mr * 1.012, 0.36, SUN, x, y0 + 0.25 + mh - 0.75, z, 28, { shade: 0 });
      k.geo(new THREE.SphereGeometry(mr, 28, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1).translate(x, y0 + 0.25 + mh, z), '#f4f1ec', 0.02);
      // the little sun on the crown: a disc and rays
      const cy = y0 + 0.25 + mh + mr * 0.42;
      k.cyl(mr * 0.3, mr * 0.3, 0.08, SUN, x, cy - 0.02, z, 16, { shade: 0 });
      for (let ray = 0; ray < 8; ray++) {
        const a = (ray / 8) * Math.PI * 2;
        k.box(mr * 0.16, 0.06, 0.1, 'org2', x + Math.cos(a) * mr * 0.45, cy - 0.06 - 0.05, z + Math.sin(a) * mr * 0.45, { r: 0, jitter: 0, ry: -a, shade: 0 });
      }
      // a hatch on the front, a pipe chase down to the plinth
      k.box(1.0, 1.4, 0.3, '#d8d2c8', x - mr * 0.5, y0 + 0.25, z + mr * 0.86, { r: 0.05, ry: 0.52 });
      k.box(0.7, 1.0, 0.06, '#5b5562', x - mr * 0.5 - 0.08, y0 + 0.35, z + mr * 0.86 + 0.15, { r: 0, ry: 0.52, jitter: 0 });
      modTop = Math.max(modTop, cy);
    }
  // steam to the turbine building, behind
  const tbz = T2 ? -10.8 : -9.6, tbd = T2 ? 3.2 : 4.4;
  for (let i = 0; i < 4; i++) {
    const x = -1.5 * gap + i * gap;
    const pts = [V(x + mr * 0.4, y0 + 1.2, rows[0] - mr + 0.2), V(x + mr * 0.4, y0 + 1.2, pz0 - 0.4), V(x + mr * 0.4, 2.4, tbz + tbd / 2 + 0.1)];
    pipeRun(k, pts, 0.22, P.silver, { seg: 8 });
  }
  // the turbine building (left) and cooling cells (right) at the back
  const tTop = shed(k, -4.2, tbz, 14.6, tbd, T2 ? 4.4 : 5.2, { wall: '#e7e2da', band: SUN, ribs: 1.1 });
  windowRow(k, lit, 'z+', tbz + tbd / 2 + 0.02, -11, 2.6, (T2 ? 4.4 : 5.2) - 1.0, 0.8, 0.6, 0.35, r, 0.7);
  const cells = T2 ? 3 : 2;
  const cw = T2 ? 3.1 : 3.4;
  const towerTop = mechTower(k, g, anim, 12.6 - (cells * cw) / 2 - 0.3, T2 ? -10.9 : -9.8, { cells, cell: cw, h: T2 ? 4.8 : 5.0 }, o.seed + 20);
  // the control building with Little Sun's sign; the switchyard; car park
  const cbx = -7.4, cbz = 5.2, cbw = 8.2, cbd = 3.8;
  const cTop = shed(k, cbx, cbz, cbw, cbd, 4.8, { wall: '#efebe5', band: SUN, ribs: 0 });
  const cf = cbz + cbd / 2;
  k.box(cbw - 0.6, 2.8, 0.1, '#6f97a3', cbx, 1.2, cf + 0.02, { r: 0, jitter: 0 });
  lit.box(cbw - 1.0, 0.9, 0.12, P.glass, cbx, 3.0, cf + 0.04, { r: 0, jitter: 0 });
  for (let x = cbx - cbw / 2 + 0.6; x <= cbx + cbw / 2 - 0.5; x += 1.4) k.box(0.12, 2.8, 0.16, '#d8d2c8', x, 1.2, cf + 0.06, { r: 0, jitter: 0 });
  const coolLit = new Kit(rng(o.seed + 4));
  coolLit.box(cbw - 1.0, 0.9, 0.12, '#6f97a3', cbx, 1.6, cf + 0.04, { r: 0, jitter: 0 });
  k.box(2.2, 2.3, 1.4, '#e7e2da', cbx + 2.6, 0.3, cf + 0.7, { r: 0.08 });
  k.box(2.8, 0.2, 2.0, SUN, cbx + 2.6, 2.6, cf + 0.9, { r: 0.04 });
  wallLamp(lamps, g, cbx + 2.6, 2.3, cf + 1.45);
  // the lobby's glass doors (the vestibule was a blank box)
  coolLit.box(1.5, 1.95, 0.06, '#6f97a3', cbx + 2.6, 0.42, cf + 1.42, { r: 0, jitter: 0 });
  k.box(0.07, 1.95, 0.08, '#d8d2c8', cbx + 2.6, 0.42, cf + 1.44, { r: 0, jitter: 0 });
  k.box(1.7, 0.1, 0.1, '#d8d2c8', cbx + 2.6, 2.37, cf + 1.42, { r: 0, jitter: 0 });
  paving(k, cbx + 2.6, cf + 2.0, 2.4, 1.1, '#b9b1a6', 0.1);
  const sg = litSign('LITTLE SUN', 4.6, '#3b2a24', SUN);
  sg.position.set(cbx - 1.2, cTop + 0.66, cf - 0.3);
  g.add(sg);
  k.box(5.0, 1.0, 0.2, P.roof, cbx - 1.2, cTop - 0.05, cf - 0.44, { r: 0.02 });
  const lines = switchyard(k, g, 7.6, 8.8, 10.2, 6.4, { bays: T2 ? 2 : 1, gantryH: 4.8, xfmrs: T2 ? 2 : 1 });
  paving(k, cbx, 10.2, 9.6, 4.0);
  bayLines(k, cbx - 4.6, 10.2, 4, 2.3, 3.0);
  parkedCars(g, cbx - 3.45, 10.2, 4, 2.3, o.seed + 9, Math.PI / 2);
  // line from the turbine building out to the yard
  const tb = [V(4.6, tTop + 0.8, tbz), V(4.8, tTop + 0.8, tbz + 1)];
  k.box(0.3, 1.0, 0.3, P.galv, 4.6, tTop - 0.2, tbz, { r: 0 });
  k.box(1.5, 0.14, 0.14, P.galv, 4.6, tTop + 0.72, tbz, { r: 0, jitter: 0 });
  sagWires(k, [-1, 0, 1].map((j) => [V(4.6 + j * 0.6, tb[0].y, tbz), lines[0]?.[j + 1] ?? tb[1]]), 0.8, '#4a4452', 0.03);
  plotFence(k, g, o.w - 1.4, o.d - 1.4);
  for (const x of [-12.2, 12.2]) poleLamp(k, lamps, g, x, 2.2, 4.6, x < 0 ? 1 : -1);
  g.add(k.build(), lit.build(winMat), coolLit.build(coolWinMat), lamps.build(lampHeadMat));
  return {
    obj: g, w: o.w, d: o.d, h: Math.max(modTop, towerTop, cTop + 1.4, tTop) + 0.3,
    progress(p) { anim.done = p; },
    update(e) { anim.update(e); },
  };
}

// ── the nuclear plant (two plots) ────────────────────────────────────────────────────────────
export function reactor(o: PieceOpts): Piece {
  const r = rng(o.seed);
  const g = new THREE.Group();
  const anim = new Anim();
  const k = new Kit(rng(o.seed + 1));
  const tk = new Kit(rng(o.seed + 2)); // the towers (one mesh of their own)
  const lit = new Kit(rng(o.seed + 3));
  const lamps = new Kit(rng(o.seed + 4));
  const D = o.d / 2;
  // two hyperbolic towers, staggered
  const towers: [number, number][] = [[-4.8, -D + 10.4], [5.0, -D + 26.2]];
  const TH = 32, TR = 8.0;
  towers.forEach(([x, z], i) => {
    const t = draftTower(tk, x, z, TH - i * 1.2, TR, { paint: '#ddd6cb', weather: 0.22, stripe: null });
    // floodlights on the basin's curb, washing up the shell
    floodRing(k, lamps, g, x, z, TR * 1.09, 8, { y: 0.5, phase: 0.2 + i * 0.4 });
    anim.plume(g, x, t.top, z, { count: 40, life: 15, rise: 2.3, spread: 2.4, size0: t.r * 1.6, size1: t.r * 5.2, opacity: 0.8, radius: t.r * 0.62, wind: 0.9 }, o.seed + 10 + i);
    for (const a of [0.6, 2.7, 4.8]) beacon(g, x + Math.cos(a) * t.r * 1.02, t.top + 0.3, z + Math.sin(a) * t.r * 1.02, i * 1.3 + a);
  });
  // the containment, the aux and fuel buildings round its base
  const cx = -6.6, cz = D - 12.2, cr = 6.0;
  const ck = new Kit(rng(o.seed + 5)); // the containment: floodlit from its foot, lamps round the gallery at the springline
  const cTop = containment(ck, cx, cz, cr, 8.0, { paint: '#e6e0d6', weather: 0.1, band: 'cyn3', seed: o.seed + 7 });
  floodRing(k, lamps, g, cx, cz, cr + 1.6, 7, { phase: 0.35, pool: 4.4, skip: (px, pz) => pz < cz - cr * 0.55 || px < -13 });
  galleryLamps(lamps, cx, cz, cr, 0.6 + 8.0, 8);
  shed(k, cx, cz - cr - 1.6, 10.6, 3.6, 6.2, { wall: '#dcd5ca', band: null, ribs: 1.4 });
  shed(k, -9.6, -D + 23.5, 7.2, 6.0, 7.6, { wall: '#dcd5ca', band: 'cyn3', ribs: 1.3 }); // fuel building
  ventStack(k, g, -12.0, -D + 28.8, 24);
  // diesel generator buildings
  for (const zz of [-D + 31.4, -D + 34.6]) {
    shed(k, -10.0, zz, 5.6, 2.4, 2.8, { wall: '#e7dfd2', band: 'org0', ribs: 0 });
    k.cyl(0.18, 0.18, 1.6, '#5b5562', -8.2, 3.0, zz, 6);
  }
  // the turbine hall beside the containment
  const hx = 6.8, hz = D - 14.6, hw = 13.0, hd = 7.6, hh = 10.0;
  const hallTop = turbineHall(k, lit, lamps, g, hx, hz, hw, hd, hh, r);
  k.box(hw - 1.6, 1.5, 3.2, '#cfc9c0', hx, hallTop - 0.1, hz - 0.6, { r: 0.1 }); // the crane-bay monitor
  k.box(hw - 1.3, 0.3, 3.5, P.roof, hx, hallTop + 1.4, hz - 0.6, { r: 0.06, shade: 0 });
  windowRow(k, lit, 'z+', hz - 0.6 + 1.62, hx - hw / 2 + 1.2, hx + hw / 2 - 1.2, hallTop + 0.35, 1.0, 0.7, 0.3, r, 0.8);
  // a covered bridge from the containment to the hall
  k.box(3.8, 2.6, 2.4, '#d9d3ca', 0.0, 4.4, hz + 0.4, { r: 0.08 });
  // generator step-up transformers along the hall's front, then the switchyard
  const a = new At(k, 0, 0, 0);
  const bush: THREE.Vector3[][] = [];
  for (const bx of [2.6, 6.6, 10.6]) {
    transformer(a, bx, hz + hd / 2 + 2.2, 1.05);
    bush.push([-0.68, 0, 0.68].map((b) => V(bx + b, 3.2 * 1.05 + 0.32, hz + hd / 2 + 2.2 + 0.21)));
    k.box(3.6, 3.0, 0.3, '#b9b1a6', bx, 0, hz + hd / 2 + 3.9, { r: 0.04 }); // blast wall
  }
  const lines = switchyard(k, g, 7.4, D - 3.9, 12.4, 5.4, { bays: 3, gantryH: 6.2 });
  const wires: THREE.Vector3[][] = [];
  bush.forEach((b, i) => b.forEach((p, j) => wires.push([p, lines[i * 2]?.[j] ?? p])));
  sagWires(k, wires, 0.6, '#4a4452', 0.035);
  // circulating water from the hall to both towers, a pump house
  shed(k, 6.4, -D + 37.4, 5.0, 2.6, 3.0, { wall: '#d9d3ca', band: null, ribs: 0 });
  for (const dx of [-1.2, 1.2]) {
    const p1 = [V(hx + dx, 1.0, hz - hd / 2 - 0.1), V(hx + dx, 1.0, -D + 36.0)];
    pipeRun(k, p1, 0.55, '#6f7f88', { seg: 10 });
    pipeStands(k, p1, 0.55, 2.0);
  }
  const p2 = [V(1.4, 1.0, -D + 36.0), V(1.4, 1.0, -D + 22.0), V(towers[0][0] + TR * 0.8, 1.0, -D + 15.0)];
  pipeRun(k, p2, 0.55, '#6f7f88', { seg: 10 });
  pipeStands(k, p2, 0.55, 2.4);
  // water tanks, the admin block and its car park at the front-left
  tank(k, 1.8, -D + 39.0, 1.4, 4.2, '#e6e0e3', { band: 'cyn3', ladder: true });
  office(k, lit, lamps, g, -7.4, D - 2.3, 10.6, 2.6, 4.0, r);
  paving(k, -1.8, D - 3.0, 2.2, 3.6, '#8c8478');
  // roads round the site, lamps
  paving(k, -1.0, 0, 2.4, o.d - 5, '#8c8478');
  // (two of the four along the road stood inside the towers' shells: the site was dark at night)
  for (const z of [-D + 18, -D + 42]) poleLamp(k, lamps, g, 0.4, z, 5.0, -1);
  for (const z of [-D + 6, -D + 16, -D + 34]) poleLamp(k, lamps, g, 12.7, z, 5.0, -1);
  for (const z of [-D + 4, -D + 19]) poleLamp(k, lamps, g, -12.7, z, 5.0, 1);
  plotFence(k, g, o.w - 1.2, o.d - 1.2, 6, [[-12.95, -3.0]]);
  g.add(k.build(), tk.build(washMat.tall), ck.build(washMat.mid), lit.build(winMat), lamps.build(lampHeadMat));
  return {
    obj: g, w: o.w, d: o.d, h: Math.max(TH, cTop) + 0.4,
    progress(p) { anim.done = p; },
    update(e) { anim.update(e); },
  };
}
