/**
 * The geothermal plant: a field of well pads down the left side (wellheads, a rock muffler venting
 * a test well, sulphur crust), silver insulated steam lines on stands with expansion loops, the
 * separator, the turbine house with its gas stack, a mechanical-draft cooling tower steaming at
 * the back, the switchyard at the front. Tier 2: five wells, a bigger house, three cells.
 * Tier 3: seven wells, a second separator, a second turbine house and a second cooling tower.
 */
import * as THREE from 'three';
import { Kit, rng, type Paint } from '../../kit';
import type { Piece } from '../../pieces';
import { parkedCars } from '../life';
import type { PieceOpts } from '../registry';
import {
  Anim, At, bayLines, beacon, lampHeadMat, mechTower, P, paving, pipeRun, pipeStands, poleLamp, rollDoor, sagWires, shed, switchyard,
  tank, transformer, V, wallLamp, windowRow, winMat,
} from './parts';

const STEAM: Paint = P.silver, BRINE: Paint = '#5f7180', COOLW: Paint = '#4f6f86';

export function geothermal(o: PieceOpts): Piece {
  const tier = Math.max(1, Math.min(3, o.tier));
  const r = rng(o.seed);
  const g = new THREE.Group();
  const anim = new Anim();
  const k = new Kit(rng(o.seed + 1));
  const pk = new Kit(rng(o.seed + 2)); // pipes
  const lit = new Kit(rng(o.seed + 3));
  const lamps = new Kit(rng(o.seed + 4));

  // ── the well field (left strip) ──────────────────────────────────────────────────────────
  const wellZ = tier === 1 ? [-10, -3.5, 3] : [-11, -6, -1, 4, 9];
  const wells: [number, number][] = wellZ.map((z, i) => [-10.6 + (i % 2 ? 0.5 : -0.3), z]);
  if (tier === 3) wells.push([-4.6, -11.8], [-0.6, -11.8]);
  const HX = -7.0, HY = 1.35; // the header along the field
  const crust: [number, number, number][] = [];
  wells.forEach(([x, z], i) => {
    k.box(3.4, 0.1, 3.4, '#c9c0b2', x, 0.1, z, { r: 0.04, shade: 0, jitter: 0.02 });
    k.box(1.3, 0.04, 1.3, '#4a4452', x, 0.2, z, { r: 0, shade: 0, jitter: 0 });
    // the Christmas tree: spools, two valves, a cap, a handwheel
    k.cyl(0.3, 0.34, 0.55, P.steel, x, 0.2, z, 10);
    k.box(0.75, 0.55, 0.6, '#b8413c', x, 0.75, z, { r: 0.08 });
    k.cyl(0.24, 0.24, 0.6, P.steel2, x, 1.3, z, 10);
    k.box(0.6, 0.45, 0.55, '#b8413c', x, 1.85, z, { r: 0.08 });
    k.cyl(0.18, 0.22, 0.35, P.steelDark, x, 2.3, z, 8);
    k.geo(new THREE.TorusGeometry(0.32, 0.05, 4, 14).translate(x, 1.0, z + 0.42), P.safety, 0, 0);
    k.geo(new THREE.TorusGeometry(0.26, 0.045, 4, 14).translate(x, 2.07, z + 0.4), P.safety, 0, 0);
    // a wing outlet into the header
    const out = [V(x + 0.35, 1.45, z), V(x + 1.4, 1.45, z), V(HX, HY, z)];
    pipeRun(pk, out, 0.2, STEAM, { seg: 8 });
    pipeStands(pk, [out[1], out[2]], 0.2, 1.6);
    for (let c = 0; c < 3; c++) crust.push([x + (r() - 0.5) * 4.5, z + (r() - 0.5) * 4, 0.6 + r() * 1.1]);
    if (i === 0) {
      // a rock muffler venting the test well
      const mx = x - 0.2, mz = z + 2.6;
      k.cyl(1.0, 1.1, 1.9, '#7a7186', mx, 0.12, mz, 14, { shade: 0.3 });
      k.cyl(1.06, 1.06, 0.12, P.steel2, mx, 2.0, mz, 14, { shade: 0 });
      for (let a = 0; a < 8; a++) k.box(0.08, 1.9, 0.08, P.steelDark, mx + Math.cos(a * 0.785) * 1.08, 0.12, mz + Math.sin(a * 0.785) * 1.08, { r: 0, jitter: 0 });
      pipeRun(pk, [V(x - 0.35, 1.0, z), V(x - 0.35, 1.0, mz - 1.0)], 0.16, P.steel, { seg: 6 });
      anim.plume(g, mx, 2.1, mz, { count: 18, life: 5.5, rise: 2.4, size0: 1.6, size1 : 5.8, opacity: 0.7, radius: 0.7, wind: 0.6 }, o.seed + 71);
    }
  });
  // sulphur crust and a couple of natural vents
  for (const [x, z, s] of crust) {
    if (x > -5.5 || Math.abs(x) > 13 || Math.abs(z) > 12.4) continue;
    k.geo(new THREE.CylinderGeometry(s, s * 1.1, 0.05, 9).scale(1, 1, 0.7 + r() * 0.5).rotateY(r() * 3).translate(x, 0.13, z), r() < 0.5 ? '#d7c46e' : '#c9b37a', 0.08, 0);
  }
  for (const [x, z] of [[-12.6, -7.6], [-12.2, 6.8]] as [number, number][]) anim.plume(g, x, 0.2, z, { count: 8, life: 4, rise: 1.0, size0: 0.6, size1: 2.4, opacity: 0.4, radius: 0.3, wind: 0.4 }, o.seed + x * 7);

  // the header down the field, with horizontal expansion loops, into the separator(s)
  const zMin = Math.min(...wells.map((w) => w[1])), zMax = Math.max(...wellZ);
  const seps: [number, number][] = tier === 3 ? [[-4.2, -7.6], [-4.2, 4.6]] : [[-4.2, -8.6]];
  const loops = tier === 1 ? [0.2] : [-3.6, 6.5];
  const hdr: THREE.Vector3[] = [V(HX, HY, zMax)];
  for (const lz of loops.slice().sort((a, b) => b - a)) hdr.push(V(HX, HY, lz + 1.2), V(HX + 2.0, HY, lz + 1.2), V(HX + 2.0, HY, lz - 1.0), V(HX, HY, lz - 1.0));
  hdr.push(V(HX, HY, Math.min(zMin, seps[0][1])));
  if (tier === 3) hdr.push(V(seps[0][0] - 1.4, HY, Math.min(zMin, seps[0][1])));
  pipeRun(pk, hdr, 0.32, STEAM, { seg: 10, band: 1.4 });
  pipeStands(pk, hdr, 0.32, 2.2);
  for (const [sx, sz] of seps) {
    pipeRun(pk, [V(HX, HY, sz), V(sx - 1.2, HY, sz), V(sx - 1.0, 2.2, sz)], 0.32, STEAM, { seg: 10 });
  }

  // ── separators ───────────────────────────────────────────────────────────────────────────
  const sepTop = 5.6;
  for (const [sx, sz] of seps) {
    k.cyl(1.15, 1.25, 0.9, P.concrete2, sx, 0.1, sz, 16, { shade: 0.15 });
    k.cyl(1.05, 1.05, sepTop - 1.6, P.silver, sx, 1.0, sz, 18, { shade: 0.1 });
    k.geo(new THREE.SphereGeometry(1.05, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(sx, sepTop - 0.6, sz), P.silver, 0.02);
    for (const y of [1.9, 3.1, 4.2]) k.cyl(1.09, 1.09, 0.1, P.silverBand, sx, y, sz, 18, { shade: 0 });
    k.geo(new THREE.TorusGeometry(1.35, 0.06, 4, 22).rotateX(Math.PI / 2).translate(sx, sepTop - 0.2, sz), P.safety, 0, 0);
    k.box(0.4, sepTop - 0.9, 0.08, P.steelDark, sx + 0.6, 1.0, sz + 1.05, { r: 0, jitter: 0 });
    // steam to the turbine house; brine back down
    const st = [V(sx, sepTop - 0.2, sz), V(sx, sepTop + 0.4, sz), V(sx + 2.6, sepTop + 0.4, sz), V(sx + 2.6, 3.0, sz), V(sx + 2.6, 3.0, sz > 0 ? 2.6 : -5.0)];
    pipeRun(pk, st, 0.42, STEAM, { seg: 12, band: 1.4 });
    const br = [V(sx - 0.7, 0.9, sz - 0.6), V(sx - 0.7, 0.6, sz - 2.2), V(-12.4, 0.6, sz - 2.2)];
    pipeRun(pk, br, 0.17, BRINE, { seg: 6 });
  }
  // the reinjection wellhead where the brine goes back down
  k.box(2.0, 0.1, 2.0, '#c9c0b2', -12.4, 0.1, seps[0][1] - 2.2, { r: 0.04, shade: 0 });
  k.cyl(0.24, 0.28, 1.2, '#5f7180', -12.4, 0.2, seps[0][1] - 2.2, 8);

  // ── turbine house(s) ─────────────────────────────────────────────────────────────────────
  const houses: { x: number; z: number; w: number; d: number; h: number }[] =
    tier === 3 ? [{ x: 2.4, z: -2.4, w: 10.4, d: 6.0, h: 6.4 }, { x: 2.4, z: 5.2, w: 10.4, d: 5.2, h: 5.6 }]
      : [{ x: 2.4, z: -1.8, w: 10.6, d: 6.8, h: tier === 2 ? 6.4 : 5.4 }];
  const xfPts: THREE.Vector3[][] = [];
  houses.forEach((hs, i) => {
    const top = shed(k, hs.x, hs.z, hs.w, hs.d, hs.h, { wall: '#ddd2bf', band: 'org0', ribs: 1.1 });
    windowRow(k, lit, 'z+', hs.z + hs.d / 2 + 0.02, hs.x - hs.w / 2 + 0.8, hs.x + hs.w / 2 - 3.5, hs.h - 1.3, 0.9, 0.7, 0.3, r, 0.8);
    rollDoor(k, hs.x + hs.w / 2 - 2.0, 0.3, hs.z + hs.d / 2 + 0.03, 2.4, 3.0);
    wallLamp(lamps, g, hs.x + hs.w / 2 - 2.0, 3.6, hs.z + hs.d / 2 + 0.2);
    // roof: vents, the gas extraction stack, a crane-rail ridge
    for (let x = hs.x - hs.w / 2 + 1.6; x < hs.x + hs.w / 2 - 1; x += 2.6) k.box(1.2, 0.6, 1.0, P.hvac, x, top, hs.z - 0.8, { r: 0.08 });
    const sx = hs.x + hs.w / 2 - 1.2, sz = hs.z - hs.d / 2 + 1.0;
    k.cyl(0.32, 0.38, 3.2, P.steel, sx, top, sz, 10);
    k.cyl(0.36, 0.36, 0.3, 'org0', sx, top + 2.7, sz, 10, { shade: 0 });
    anim.plume(g, sx, top + 3.2, sz, { count: 10, life: 4.5, rise: 2.0, size0: 0.6, size1: 2.6, opacity: 0.45, radius: 0.2, wind: 0.7 }, o.seed + 30 + i);
    // step-up transformers off the house's east end
    const a = new At(k, hs.x + hs.w / 2 + 1.6, 0, hs.z, Math.PI / 2);
    transformer(a, 0, 0, 0.8);
    xfPts.push([-0.52, 0, 0.52].map((bx) => a.pt(bx, 2.95, 0.16)));
    // cooling water to the tower
    if (i === 0) {
      for (const dx of [-1.6, 1.6]) {
        const cw = [V(hs.x + dx, 0.9, hs.z - hs.d / 2 - 0.1), V(hs.x + dx, 0.9, -8.0)];
        pipeRun(pk, cw, 0.34, COOLW, { seg: 10 });
        pipeStands(pk, cw, 0.34, 1.6);
      }
    }
  });
  // the control building and its car park at the front
  const cbx = -2.2, cbz = tier === 3 ? 10.0 : 6.4;
  shed(k, cbx, cbz, 5.0, 3.4, 3.4, { wall: P.cream, band: 'cyn3', ribs: 0 });
  windowRow(k, lit, 'z+', cbz + 1.72, cbx - 2.2, cbx + 1.0, 1.9, 0.9, 1.0, 0.35, r, 0.85);
  k.box(1.0, 2.0, 0.08, '#4a5a66', cbx + 1.6, 0.4, cbz + 1.72, { r: 0, jitter: 0 });
  wallLamp(lamps, g, cbx + 1.6, 2.7, cbz + 1.85);
  if (tier < 3) {
    paving(k, cbx, 10.6, 9.6, 3.6);
    bayLines(k, cbx - 4.6, 10.6, 4, 2.3, 3.0);
    parkedCars(g, cbx - 3.45, 10.6, 4, 2.3, o.seed + 9, Math.PI / 2);
  }
  // an access road from the front, lamps along it
  paving(k, -5.4, 6.5, 2.4, 13, '#8c8478');
  for (const z of [1.0, 8.5]) poleLamp(k, lamps, g, -4.0, z, 4.4, -1);

  // ── the cooling tower(s) at the back, the switchyard at the front-right ──────────────────
  const cells = tier === 1 ? 2 : 3;
  const cw = 4.1;
  const towerTop = mechTower(k, g, anim, 12.4 - (cells * cw) / 2 - 0.4, -10.2, { cells, cell: cw, h: 6.0 }, o.seed + 50);
  if (tier === 3) mechTower(k, g, anim, 11.1, 3.6, { cells: 2, cell: 3.6, h: 5.4, ry: Math.PI / 2 }, o.seed + 60);
  const yardW = tier === 3 ? 0 : 9.4;
  let lines: THREE.Vector3[][] = [];
  if (yardW) lines = switchyard(k, g, 8.0, 8.6, yardW, 6.2, { bays: tier, gantryH: 4.6 });
  else {
    // tier 3: the yard moves to the front-right corner, past the second tower
    lines = switchyard(k, g, 8.6, 10.6, 8.6, 3.6, { bays: 2, gantryH: 4.4 });
  }
  if (tier === 1) {
    // a workover rig on a new pad at the front-left: the next well going in
    const wx = -9.8, wz = 8.6, mh = 10.5;
    k.box(4.4, 0.12, 4.4, '#c9c0b2', wx, 0.1, wz, { r: 0.04, shade: 0 });
    k.box(3.6, 1.2, 1.6, '#e9e1d2', wx + 0.2, 0.2, wz + 1.6, { r: 0.08 });
    k.box(3.6, 0.3, 1.62, 'org0', wx + 0.2, 1.1, wz + 1.6, { r: 0.04, shade: 0 });
    k.box(2.2, 0.9, 2.2, P.steel, wx, 0.2, wz - 0.3, { r: 0.06 });
    const legs: [number, number][] = [[-0.7, -1.0], [0.7, -1.0], [0.7, 0.4], [-0.7, 0.4]];
    for (const [lx, lz] of legs) k.beam(V(wx + lx, 1.1, wz + lz - 0.3), V(wx + lx * 0.3, mh, wz + lz * 0.3 - 0.3), 0.14, 'org1');
    for (let y = 2.0; y < mh - 0.5; y += 1.4) {
      const t = (y - 1.1) / (mh - 1.1), s = 1 - t * 0.7;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
        k.beam(V(wx + ax * s, y, wz + az * s - 0.3), V(wx + bx * s, y, wz + bz * s - 0.3), 0.06, 'org1');
      }
    }
    k.box(1.0, 0.5, 1.0, P.steelDark, wx, mh, wz - 0.4, { r: 0.04 });
    beacon(g, wx, mh + 0.8, wz - 0.4, 0.9);
    // drill pipe racked beside it
    for (let i = 0; i < 6; i++) pipeRun(k, [V(wx - 1.9, 0.35 + (i % 3) * 0.24, wz - 1.6 + Math.floor(i / 3) * 0.3 - 0.6), V(wx - 1.9, 0.35 + (i % 3) * 0.24, wz + 2.0 - 0.6)], 0.11, '#8c5a44', { seg: 6 });
  }
  // lines from the transformers to the yard's back gantries
  const wires: THREE.Vector3[][] = [];
  xfPts.forEach((pts, i) => {
    const gpts = lines[(i * 2) % Math.max(1, lines.length)];
    if (gpts) pts.forEach((p, j) => wires.push([p, gpts[j]]));
  });
  sagWires(k, wires, 0.35, '#4a4452', 0.03);

  // a few nitrogen / chemical tanks by the house
  tank(k, -1.0, -7.6, 0.7, 2.4, '#e6e0e3', { band: 'org0' });
  tank(k, 0.8, -7.6, 0.7, 2.4, '#e6e0e3', { band: 'org0' });

  g.add(k.build(), pk.build(), lit.build(winMat), lamps.build(lampHeadMat));
  const h = Math.max(towerTop, sepTop + 0.9, Math.max(...houses.map((x) => x.h)) + 3.9);
  return {
    obj: g, w: o.w, d: o.d, h,
    progress(p) { anim.done = p; },
    update(e) { anim.update(e); },
  };
}

