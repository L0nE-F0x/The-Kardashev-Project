/**
 * Heat into power: a unit of the reactor fleet (one certified design, built again and again),
 * a geothermal well pad (with a drilling rig on some) and a binary-cycle geothermal plant.
 */
import * as THREE from 'three';
import { Kit, lightPool, rng, type Paint } from '../../../kit';
import { coolingTowerGeometry, domeGeometry, Plume } from '../../../fx';
import { fenceMesh, type Piece } from '../../../pieces';
import { parkedCars } from '../../life';
import type { Act3SetOpts } from '../../act3sets';
import {
  Anim, beacon, CHARTER, fieldOf, floodMast, gantry, hcyl, instances, insulatorUnit, lamp, latticeTower, P, paintedText,
  pipe, pipeSupport, placard, sagWires, standing, TAU, track, transformer, vehicle, V, winBig, windows, workPool, xf, yard,
} from './common';

type Win = [number, number, number, number, number, number?][];

// ── the cooling tower ────────────────────────────────────────────────────────────────────────
/** The profile of fx's coolingTowerGeometry (radius factor at height fraction t). */
export const ctK = (t: number) => (t < 0.78 ? 1 - 0.38 * Math.sin((t / 0.78) * Math.PI / 2) : 0.62 + ((t - 0.78) / 0.22) * 0.06);

/** A natural-draft cooling tower on its ring of raking columns, with an inner face, a lip and an accent band. */
export function coolingTower(k: Kit, x: number, z: number, h: number, r: number, band: Paint) {
  const lift = h * 0.06;
  const shell = coolingTowerGeometry(h - lift, r, 40).translate(x, lift, z);
  k.geo(shell, '#ddd6cc', 0.02, 0.12);
  // the inside (the lathe is open, so it needs its own inward-facing skin)
  const pts: THREE.Vector2[] = [];
  for (let i = 16; i >= 0; i--) {
    const t = i / 16;
    pts.push(new THREE.Vector2(r * ctK(t) * 0.975, lift + t * (h - lift)));
  }
  k.geo(new THREE.LatheGeometry(pts, 40).translate(x, 0, z), '#8a8490', 0.02, 0.4);
  k.geo(new THREE.CircleGeometry(r * 0.96, 32).rotateX(-Math.PI / 2).translate(x, 0.25, z), '#3e5870', 0.02);
  k.geo(new THREE.TorusGeometry(r * ctK(1) * 0.99, 0.18, 4, 40).rotateX(Math.PI / 2).translate(x, h, z), '#c9c1b6', 0.01);
  // accent band near the top
  const bp: THREE.Vector2[] = [];
  for (let i = 0; i <= 3; i++) {
    const t = 0.87 + i * 0.016;
    bp.push(new THREE.Vector2(r * ctK(t) * 1.006, lift + t * (h - lift)));
  }
  k.geo(new THREE.LatheGeometry(bp, 40).translate(x, 0, z), band, 0.01);
  // raking columns in V pairs round the air inlet
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, b = ((i + 0.5) / n) * TAU;
    const top = V(x + Math.cos(b) * r * 0.99, lift + 0.1, z + Math.sin(b) * r * 0.99);
    for (const aa of [a, a + TAU / n]) k.beam(V(x + Math.cos(aa) * r * 1.02, 0, z + Math.sin(aa) * r * 1.02), top, 0.22, '#c9c1b6');
  }
  k.geo(new THREE.CylinderGeometry(r * 1.06, r * 1.08, 0.4, 40, 1, true).translate(x, 0.2, z), P.concreteD, 0.02);
  return { top: h, rTop: r * ctK(1) };
}

// ── the reactor unit ─────────────────────────────────────────────────────────────────────────
/** One unit of the fleet: the containment, turbine hall, vent stack, a natural-draft tower steaming, the switchyard; the unit number painted large. */
export function reactorUnit(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const n = o.n ?? 1;
  const teal = '#2fae9b';
  const k = new Kit(rng(o.seed + n));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  yard(ground, W - 1, D - 1, 0, 0, '#bdb4aa');
  track(ground, -2, D / 2 - 0.6, -2, D / 2 - 6, 4, P.asphalt, 0.06);
  // the cooling tower, steaming
  const tx = 7.6, tz = -4.4, th = 31, tr = 9.6;
  const ct = coolingTower(k, tx, tz, th, tr, teal);
  const plume = new Plume({ count: 36, life: 11, rise: 2.6, spread: 2.6, size0: 9, size1: 26, radius: ct.rTop * 0.6, wind: 1.1, opacity: 0.85 }, o.seed + n);
  plume.obj.position.set(tx, th + 0.5, tz);
  g.add(plume.obj);
  anim.add((e) => plume.update(e));
  beacon(g, tx - ct.rTop, th + 0.4, tz, 0.2 + n);
  beacon(g, tx + ct.rTop, th + 0.4, tz, 1.4 + n);
  const tn = paintedText(String(n), 0, teal, { r: tr * ctK(0.6) + 0.14, arc: 0.9 });
  tn.geometry = new THREE.CylinderGeometry(tr * ctK(0.66) + 0.12, tr * ctK(0.5) + 0.14, (th * 0.94) * 0.16, 16, 1, true, -0.75, 0.9);
  tn.position.set(tx, th * 0.06 + th * 0.94 * 0.58, tz);
  g.add(tn);
  // the containment: a cylinder with a dome, buttresses, the equipment hatch
  const cx = -9.4, cz = -7.6, cr = 5.4, cw = 7;
  k.cyl(cr + 0.6, cr + 0.8, 0.6, P.concreteD, cx, 0, cz, 28);
  k.geo(domeGeometry(cr, cw, 32).translate(cx, 0.5, cz), '#ece6dc', 0.015, 0.14);
  k.cyl(cr + 0.04, cr + 0.04, 0.5, teal, cx, cw - 0.6, cz, 32, { shade: 0 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    k.box(0.8, cw - 0.5, 0.6, '#ddd6cc', cx + Math.cos(a) * (cr + 0.15), 0.5, cz + Math.sin(a) * (cr + 0.15), { r: 0.08, ry: -a });
  }
  k.box(2.6, 3.4, 1.6, '#cfc7bb', cx + 3.2, 0.5, cz + 4.0, { r: 0.1, ry: -0.6 });
  const cn = paintedText(String(n), 0, CHARTER.field, { r: cr + 0.06, arc: 0.85 });
  cn.position.set(cx, 3.8, cz);
  cn.rotation.y = -0.35;
  g.add(cn);
  // the auxiliary / fuel building between them, the vent stack on its lattice
  k.box(5, 7.2, 9, '#d8d0c4', -1.4, 0, -9.6, { r: 0.14 });
  k.box(5.1, 0.4, 9.1, '#5b5562', -1.4, 7.0, -9.6, { r: 0.05, shade: 0 });
  const sx = -3.2, sz = -14.2;
  k.cyl(0.55, 0.65, 24, '#e3ddd3', sx, 0, sz, 12);
  for (let y = 0; y < 21; y += 3) {
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as [number, number, number, number][]) k.beam(V(sx + ax * 1.0, y, sz + az * 1.0), V(sx + bx * 1.0, y + 3, sz + bz * 1.0), 0.07, P.steel);
  }
  for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.14, 21, 0.14, P.steel, sx + ax * 1.0, 0, sz + az * 1.0, { r: 0 });
  k.cyl(0.62, 0.62, 0.8, teal, sx, 22, sz, 12, { shade: 0 });
  beacon(g, sx, 24.4, sz, 2.1 + n);
  // the turbine hall across the front, UNIT n on it, its lit clerestory
  const hx0 = -W / 2 + 1.4, hx1 = -1.6, hz0 = -1.6, hz1 = 5.4, hh = 8.4;
  const hx = (hx0 + hx1) / 2, hw = hx1 - hx0;
  k.box(hw + 0.4, 0.4, hz1 - hz0 + 0.4, P.concreteD, hx, 0, (hz0 + hz1) / 2, { r: 0.05 });
  k.box(hw, hh, hz1 - hz0, '#e0dbd2', hx, 0.3, (hz0 + hz1) / 2, { r: 0.16, jitter: 0.02, shade: 0.15 });
  for (let x = hx0 + 0.6; x < hx1 - 0.3; x += 0.95) k.box(0.15, hh - 2.6, 0.1, '#cbc4b9', x, 0.5, hz1 + 0.02, { r: 0, jitter: 0.01, shade: 0 });
  k.box(hw + 0.05, 1.2, 0.06, P.glassD, hx, hh - 1.9, hz1 + 0.03, { r: 0, shade: 0 });
  windows(g, [[hx, hh - 1.3, hz1 + 0.08, hw - 0.4, 1.0]], winBig);
  k.box(hw + 0.3, 0.55, hz1 - hz0 + 0.3, '#5b5562', hx, hh + 0.2, (hz0 + hz1) / 2, { r: 0.06, shade: 0 });
  k.box(hw + 0.06, 0.4, hz1 - hz0 + 0.06, teal, hx, hh - 0.35, (hz0 + hz1) / 2, { r: 0.04, shade: 0 });
  placard(g, `UNIT ${n}`, 4.4, hx0 + 3.6, 3.6, hz1 + 0.08, '#5fd3b5', '#16141f', 0, true);
  k.box(3, 3.2, 0.08, '#8a8490', hx1 - 3, 0.3, hz1 + 0.04, { r: 0.02, shade: 0 });
  for (let y = 0.6; y < 3.4; y += 0.32) k.box(2.9, 0.04, 0.06, '#7a7186', hx1 - 3, y, hz1 + 0.1, { r: 0, jitter: 0 });
  // a turbine-hall to tower water culvert, the switchyard, the line out
  pipe(k, [V(hx1, 1.4, 0.6), V(tx - tr - 0.4, 1.4, 0.6), V(tx - tr - 0.4, 1.4, tz + 2)], 0.5, '#8a8f80');
  const yx = 9.6, yz = 10.6;
  for (let i = 0; i < 2; i++) transformer(k, yx - 3 + i * 6, yz + 1.2, 1.05, teal);
  gantry(k, yx, yz - 2.6, 11, 8);
  const ins: THREE.Matrix4[] = [];
  for (let i = 0; i < 5; i++) ins.push(xf(yx - 5 + i * 2.5, 0, yz - 1, 0, 0, 1, 0, 3.4));
  g.add(instances(insulatorUnit(), ins));
  const tw = latticeTower(k, W / 2 - 1.8, yz - 2.6, 17, 3.2, '#8a8490', 0, Math.PI / 2);
  for (const s of [-1, 1]) sagWires(k, V(yx + s * 3.6, 7.8, yz - 2.6), V(W / 2 - 1.8, tw.arms[0][0], yz - 2.6 + s * 2.9), 0.5);
  beacon(g, W / 2 - 1.8, 17.4, yz - 2.6, 0.9);
  // fence, gatehouse, parking, lights
  fenceMesh(g, W - 0.6, D - 0.6, 8);
  k.box(3, 2.6, 2.2, P.wall, -7.6, 0, D / 2 - 2.4, { r: 0.1 });
  k.box(3.2, 0.25, 2.4, CHARTER.field, -7.6, 2.5, D / 2 - 2.4, { r: 0.04, shade: 0 });
  k.box(1.6, 0.9, 0.06, P.glassD, -7.6, 1.2, D / 2 - 1.28, { r: 0.02, shade: 0 });
  glow.push([-7.6, 1.65, D / 2 - 1.22, 1.5, 0.8]);
  // its door on the side towards the gate (the front is its window): the staff go in this way
  k.box(0.06, 2.0, 0.9, '#4a5a66', -6.1 + 0.03, 0.1, D / 2 - 2.4, { r: 0.02, jitter: 0 });
  ground.box(10.5, 0.08, 5, P.asphalt, -W / 2 + 6.8, 0.04, D / 2 - 4.8, { r: 0.03, shade: 0 });
  parkedCars(g, -W / 2 + 2.6, D / 2 - 4.8, 5, 2.3, o.seed + 4, Math.PI / 2);
  floodMast(g, k, -W / 2 + 1.2, -D / 2 + 1.2, 12, Math.PI * 0.25);
  floodMast(g, k, 2.2, D / 2 - 1.4, 10, Math.PI);
  lamp(g, k, -4.6, D / 2 - 6.4, 5, -1);
  standing(g, -4.2, D / 2 - 3.4, 0.4, o.seed + 6, 'engineer');
  standing(g, hx1 - 3, hz1 + 1.6, 2.8, o.seed + 7, 'worker');
  vehicle(g, 'van', 1.6, D / 2 - 7.2, Math.PI / 2);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: th + 2, doors: [{ x: -6.1 + 0.7, z: D / 2 - 2.4, nx: 1, nz: 0 }], update: anim.update, ground: () => null };
}

// ── geothermal ───────────────────────────────────────────────────────────────────────────────
/** A wellhead (a christmas tree of valves) in its cellar at (x, z). */
function wellhead(k: Kit, x: number, z: number) {
  k.box(1.9, 0.08, 1.9, '#4e4148', x, 0.02, z, { r: 0.02, shade: 0 });
  k.box(2.1, 0.22, 0.2, P.concreteD, x, 0, z - 1.0, { r: 0.02 });
  k.box(2.1, 0.22, 0.2, P.concreteD, x, 0, z + 1.0, { r: 0.02 });
  k.cyl(0.32, 0.36, 0.5, P.steelD, x, 0, z, 10);
  for (let i = 0; i < 3; i++) {
    const y = 0.5 + i * 0.5;
    k.box(0.5, 0.36, 0.5, i === 1 ? P.red : '#8a8f80', x, y, z, { r: 0.06 });
    k.cyl(0.24, 0.24, 0.16, P.steelD, x, y + 0.36, z, 10, { shade: 0 });
  }
  hcyl(k, 0.16, 1.4, '#8a8f80', x + 0.6, 1.2, z, 'x', 8);
  k.cyl(0.22, 0.22, 0.04, P.red, x, 2.15, z, 10, { shade: 0 });
  k.cyl(0.03, 0.03, 0.3, P.dark, x, 2.0, z, 6, { shade: 0 });
}

/** A steam line along x at height y with goalpost expansion loops every `loop` units. */
function steamLine(k: Kit, x0: number, x1: number, z: number, y: number, r: number, loop: number, paint: Paint = P.silver) {
  const pts: THREE.Vector3[] = [V(x0, y, z)];
  for (let x = x0 + loop * 0.6; x < x1 - 3; x += loop) {
    pts.push(V(x, y, z), V(x, y + 2.6, z), V(x + 2.6, y + 2.6, z), V(x + 2.6, y, z));
  }
  pts.push(V(x1, y, z));
  pipe(k, pts, r, paint);
  for (let x = x0 + 1.2; x < x1; x += 3) pipeSupport(k, x, z, y - r, 0.9);
}

/** A geothermal well pad: wellheads, silver steam lines with expansion loops, separators, silencers venting; a drilling rig on some. */
export function geoPad(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const rig = (o.vseed ?? 0) === 1;
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  const f = fieldOf(o.backdrop);
  yard(ground, W - 1, D - 3, 0, -0.6, '#9a8f86');
  track(ground, W / 2 - 6, D / 2 - 2, W / 2 - 6, D / 2, 3, f.track, 0.0);
  const plumes: Plume[] = [];
  const steam = (x: number, y: number, z: number, big: boolean, seed: number) => {
    const p = big
      ? new Plume({ count: 26, life: 7, rise: 2.8, spread: 1.4, size0: 3, size1: 11, radius: 0.8, wind: 0.9, opacity: 0.9 }, seed)
      : new Plume({ count: 12, life: 4.5, rise: 1.0, spread: 0.6, size0: 0.8, size1: 3.2, radius: 0.3, wind: 0.5, opacity: 0.55 }, seed);
    p.obj.position.set(x, y, z);
    g.add(p.obj);
    plumes.push(p);
  };
  // wellheads along the front of the pad, each with a branch to the gathering line
  const wells = rig ? [2, 6, 10] : [-11, -7, -3, 1, 5, 9];
  const lz = -5.4, ly = 1.3;
  for (const [i, x] of wells.entries()) {
    const z = 3.4 + (i % 2) * 1.2;
    wellhead(k, x, z);
    pipe(k, [V(x + 1.3, 1.2, z), V(x + 1.8, 1.2, z), V(x + 1.8, ly, lz + 0.8), V(x + 1.8, ly, lz)], 0.18, P.silver, 8);
    if (i % 2 === 0) steam(x, 2.3, z, false, o.seed + i);
  }
  // the gathering lines (continuous from pad to pad), with their loops
  steamLine(k, -W / 2 + 0.6, W / 2 - 0.6, lz, ly, 0.34, 11);
  steamLine(k, -W / 2 + 0.6, W / 2 - 0.6, lz - 1.4, ly + 0.2, 0.28, 13, '#c9c5c0');
  // separators and a vessel; the silencer venting a test flow
  for (const [i, x] of [W / 2 - 9.5, W / 2 - 6.8].entries()) {
    k.box(2.8, 0.3, 2.8, P.concreteD, x, 0, -9.4, { r: 0.04 });
    k.cyl(1.1, 1.1, 6.4 - i * 0.8, '#d9d6d2', x, 0.3, -9.4, 16);
    k.geo(new THREE.SphereGeometry(1.1, 16, 6, 0, TAU, 0, Math.PI / 2).translate(x, 6.7 - i * 0.8, -9.4), '#c9c5c0', 0.02);
    k.cyl(0.4, 1.0, 1.0, '#c9c5c0', x, -0.0, -9.4, 12);
  }
  hcyl(k, 0.9, 4, '#d9d6d2', W / 2 - 8, 1.6, -7.2, 'x', 14);
  for (const sx of [-1.2, 1.2]) k.box(0.3, 0.9, 0.9, P.steelD, W / 2 - 8 + sx, 0, -7.2, { r: 0 });
  const mx = W / 2 - 3, mz = -1;
  k.cyl(1.6, 1.7, 3.2, '#8a7a72', mx, 0, mz, 16);
  for (let y = 0.4; y < 3.2; y += 0.7) k.cyl(1.66, 1.66, 0.12, '#66575a', mx, y, mz, 16, { shade: 0 });
  pipe(k, [V(mx, 1.2, lz), V(mx, 1.2, mz - 1.4)], 0.3, P.silver);
  steam(mx, 3.4, mz, true, o.seed + 20);
  // the pad's control cabin and a pickup
  k.box(4.4, 2.6, 2.4, P.cream, -W / 2 + 3.6, 0, D / 2 - 3.6, { r: 0.1 });
  k.box(4.5, 0.25, 2.5, P.orange, -W / 2 + 3.6, 2.4, D / 2 - 3.6, { r: 0.04, shade: 0 });
  k.box(1.2, 0.8, 0.06, P.glassD, -W / 2 + 3, 1.3, D / 2 - 2.38, { r: 0.02, shade: 0 });
  glow.push([-W / 2 + 3, 1.7, D / 2 - 2.33, 1.1, 0.7]);
  k.box(0.9, 2.0, 0.06, '#4a5a66', -W / 2 + 4.9, 0.05, D / 2 - 2.38, { r: 0.02, jitter: 0 });
  vehicle(g, 'pickup', W / 2 - 6, D / 2 - 3.2, Math.PI / 2 + 0.1);
  standing(g, 0, 5.6, 0.3, o.seed + 3);
  // fumaroles: the ground itself steams
  steam(-W / 2 + 2, 0.1, -D / 2 + 1.6, false, o.seed + 30);
  steam(W / 2 - 1.5, 0.1, D / 2 - 6.2, false, o.seed + 31);
  if (rig) {
    // a drilling rig: substructure, the derrick, doghouse, pipe rack, mud tanks, generators
    const rx = -6.6, rz = -0.4;
    const orange = '#f08a46', dark = '#7a3f2a';
    const sub = 4.2;
    for (const [ax, az] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]]) k.box(0.4, sub, 0.4, dark, rx + ax, 0, rz + az, { r: 0.02 });
    for (const s of [-1, 1]) {
      k.beam(V(rx - 2.6, 0.2, rz + s * 2.6), V(rx + 2.6, sub - 0.2, rz + s * 2.6), 0.18, orange);
      k.beam(V(rx + 2.6, 0.2, rz + s * 2.6), V(rx - 2.6, sub - 0.2, rz + s * 2.6), 0.18, orange);
    }
    k.box(6.4, 0.5, 6.4, orange, rx, sub, rz, { r: 0.06 });
    const mh = 24;
    const mast: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [ax, az] of mast) k.beam(V(rx + ax * 2.0, sub + 0.5, rz + az * 2.0), V(rx + ax * 0.6, sub + mh, rz + az * 0.6), 0.2, orange);
    for (let y = 0; y < mh - 1.5; y += 2.2) {
      const w0 = 2.0 + (0.6 - 2.0) * (y / mh), w1 = 2.0 + (0.6 - 2.0) * ((y + 2.2) / mh);
      for (let i = 0; i < 4; i++) {
        const [ax, az] = mast[i], [bx, bz] = mast[(i + 1) % 4];
        k.beam(V(rx + ax * w0, sub + 0.5 + y, rz + az * w0), V(rx + bx * w1, sub + 0.5 + y + 2.2, rz + bz * w1), 0.08, '#f7b258');
      }
    }
    k.box(2.0, 1.2, 2.0, orange, rx, sub + mh, rz, { r: 0.08 });
    beacon(g, rx, sub + mh + 1.5, rz, 0.4);
    k.box(1.0, 1.4, 1.0, P.yellow, rx, sub + 8, rz, { r: 0.1 });
    k.box(0.08, mh - 9, 0.08, P.ink, rx, sub + 9.4, rz, { r: 0 });
    k.box(3.6, 2.6, 2.4, P.cream, rx - 4.6, sub + 0.5, rz + 1.6, { r: 0.1 });
    k.box(3.7, 0.3, 2.5, orange, rx - 4.6, sub + 2.9, rz + 1.6, { r: 0.04, shade: 0 });
    glow.push([rx - 4.6, sub + 2.0, rz + 2.86, 1.6, 0.7]);
    k.beam(V(rx + 1, sub + 0.5, rz + 3.2), V(rx + 1, 0.9, rz + 9.4), 0.9, '#8a8490');
    k.box(4, 0.9, 6, P.steelD, rx + 1, 0, rz + 10, { r: 0.04 });
    for (let i = 0; i < 9; i++) hcyl(k, 0.12, 5.6, '#8c4a3a', rx + 1 - 1.4 + (i % 3) * 0.3 + Math.floor(i / 3) * 0.95, 1.05 + (i % 3) * 0.24, rz + 10, 'z', 6);
    for (let i = 0; i < 3; i++) {
      k.box(5.4, 2.2, 2.4, '#7a7186', rx - 3 + i * 0.1, 0, -D / 2 + 2.6 + i * 2.6, { r: 0.08 });
      k.box(5.5, 0.3, 2.5, orange, rx - 3, 2.0, -D / 2 + 2.6 + i * 2.6, { r: 0.04, shade: 0 });
    }
    for (let i = 0; i < 2; i++) k.box(4.2, 2.4, 2.0, '#e3ddd3', -W / 2 + 3.2, 0, -4 + i * 2.8, { r: 0.1 });
    // work lights up the mast
    const lightsAt: [number, number, number, number, number][] = [];
    for (let y = 6; y < mh; y += 5) lightsAt.push([rx, sub + y, rz + 0.62 + 1.4 * (1 - y / mh), 0.5, 0.3]);
    windows(g, lightsAt);
    lightPool(g, rx, sub + 0.7, rz, 4, workPool);
    lightPool(g, rx + 1, 0, rz + 7, 6, workPool);
    standing(g, rx - 1.2, rz + 1.4, 0.6, o.seed + 9, 'worker', sub + 0.5);
  }
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  anim.add((e) => { for (const p of plumes) p.update(e); });
  return { obj: g, w: W, d: D, h: rig ? 31 : 8, doors: [{ x: -W / 2 + 4.9, z: D / 2 - 2.4 + 0.7 }], update: anim.update, ground: () => null };
}

/** Binary-cycle plant: an air-cooled condenser deck of spinning fans on A-frames, the turbine building, working-fluid tanks, steaming cells. */
export function binaryPlant(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  yard(ground, W - 1, D - 1, 0, 0, '#a59a90');
  // the gathering line along the back (continuous across pads)
  steamLine(k, -W / 2 + 0.6, W / 2 - 0.6, -D / 2 + 1.4, 1.3, 0.34, 12);
  // the ACC deck: steel A-frames, finned bundles, fans on top
  const ax0 = -W / 2 + 1.8, ax1 = 4.6, az0 = -D / 2 + 3.4, az1 = az0 + 8.6, ay = 6.4;
  const aw = ax1 - ax0, acx = (ax0 + ax1) / 2, acz = (az0 + az1) / 2;
  for (let x = ax0 + 0.5; x <= ax1 - 0.4; x += aw / 5)
    for (const z of [az0 + 0.4, az1 - 0.4]) {
      k.box(0.28, ay, 0.28, P.steelD, x, 0, z, { r: 0 });
      k.beam(V(x, 0.2, z), V(x + aw / 10, ay - 0.4, (az0 + az1) / 2), 0.14, P.steel);
    }
  k.box(aw, 0.4, az1 - az0, '#8a8490', acx, ay, acz, { r: 0.04 });
  for (let i = 0; i < 2; i++) {
    const z = az0 + 2.15 + i * 4.3;
    k.geo(new THREE.CylinderGeometry(0.01, 2.2, 1.6, 4, 1).rotateY(Math.PI / 4).scale(aw / 3.11, 1, 1).translate(acx, ay - 1.2, z), '#b9b4ae', 0.03);
  }
  k.box(aw + 0.1, 1.5, az1 - az0 + 0.1, '#c9c1b6', acx, ay + 0.4, acz, { r: 0.08, jitter: 0.02 });
  const fanGeo = (() => {
    const fk = new Kit(rng(3));
    fk.cyl(0.32, 0.32, 0.25, P.dark, 0, -0.05, 0, 10);
    for (let i = 0; i < 4; i++) fk.geo(new THREE.BoxGeometry(1.75, 0.05, 0.36).translate(0.95, 0.1, 0).rotateY((i * TAU) / 4 + 0.1), '#433c52', 0.03);
    return fk.build().geometry;
  })();
  const fanMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const fans: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 2; j++) {
      const x = ax0 + aw / 10 + (i * aw) / 5, z = az0 + 2.15 + j * 4.3;
      k.geo(new THREE.CylinderGeometry(1.95, 1.95, 0.9, 24, 1, true).translate(x, ay + 2.35, z), '#a9a29c', 0.02);
      k.geo(new THREE.CylinderGeometry(2.05, 2.05, 0.12, 24, 1, true).translate(x, ay + 2.8, z), '#8a8490', 0.01);
      const f = new THREE.Mesh(fanGeo, fanMat);
      f.position.set(x, ay + 2.2, z);
      f.castShadow = true;
      g.add(f);
      fans.push(f);
    }
  beacon(g, ax1 - 0.4, ay + 3.2, az0 + 0.4, 0.5);
  // the turbine-generator building
  const bx = W / 2 - 6.2, bz = -D / 2 + 6.6;
  k.box(9, 6.4, 7.4, '#e3ddd3', bx, 0, bz, { r: 0.16 });
  k.box(9.1, 0.4, 7.5, P.orange, bx, 5.6, bz, { r: 0.05, shade: 0 });
  k.box(9.3, 0.3, 7.7, P.roof, bx, 6.3, bz, { r: 0.05, shade: 0 });
  for (let i = 0; i < 4; i++) {
    k.box(1.2, 0.9, 0.06, P.glassD, bx - 3.2 + i * 2.1, 3.4, bz + 3.71, { r: 0.02, shade: 0 });
    glow.push([bx - 3.2 + i * 2.1, 3.85, bz + 3.76, 1.1, 0.8]);
  }
  placard(g, 'GEO', 2.6, bx - 2.2, 1.6, bz + 3.76, P.orange, '#2f2a3d');
  k.box(2.6, 3.0, 0.08, '#8a8490', bx + 2.4, 0.1, bz + 3.72, { r: 0.02, shade: 0 });
  k.box(0.9, 2.1, 0.06, '#4a5a66', bx + 0.1, 0.1, bz + 3.72, { r: 0.02, jitter: 0 }); // the staff's door
  // working-fluid tanks, the vaporizer, pipes to the deck
  for (let i = 0; i < 2; i++) {
    const z = 3.6 + i * 2.8;
    hcyl(k, 1.0, 6, '#ece6dc', bx - 0.6, 1.4, z, 'x', 16);
    hcyl(k, 1.04, 0.6, P.red, bx - 0.6, 1.4, z, 'x', 16);
    for (const sx of [-2, 2]) k.box(0.3, 0.6, 1.4, P.steelD, bx - 0.6 + sx, 0, z, { r: 0 });
  }
  pipe(k, [V(bx - 4.5, 2.4, bz), V(ax1 + 0.6, 2.4, bz), V(ax1 + 0.6, ay + 1, bz), V(ax1 - 0.4, ay + 1, bz)], 0.4, '#c9c1b6');
  pipe(k, [V(bx, 1.3, -D / 2 + 1.4), V(bx, 1.3, bz - 3.7)], 0.3, P.silver);
  // a wet cooling tower for the summer peak (two cells), steaming
  const cx = -6, cz = D / 2 - 5.4;
  k.box(9, 4.2, 4.6, '#b9b4ae', cx, 0, cz, { r: 0.12 });
  for (let y = 0.4; y < 2.6; y += 0.35) k.box(9.04, 0.12, 4.64, '#9d978f', cx, y, cz, { r: 0, jitter: 0 });
  const plumes: Plume[] = [];
  for (const sx of [-2.2, 2.2]) {
    k.cyl(1.6, 1.8, 1.6, '#a9a29c', cx + sx, 4.2, cz, 16);
    const p = new Plume({ count: 22, life: 6, rise: 2.4, spread: 1.4, size0: 2.6, size1: 9, radius: 1.0, wind: 1.0, opacity: 0.8 }, o.seed + sx);
    p.obj.position.set(cx + sx, 6, cz);
    g.add(p.obj);
    plumes.push(p);
  }
  // transformer, the line out, lights, a crew
  transformer(k, 6.4, D / 2 - 3.6, 0.8, CHARTER.field);
  const tw = latticeTower(k, W / 2 - 1.6, D / 2 - 2.6, 13, 2.6, '#8a8490', 0, Math.PI / 2);
  sagWires(k, V(6.4, 4.2, D / 2 - 3.6), V(W / 2 - 1.6, tw.arms[0][0], D / 2 - 2.6 - 2.4), 0.4);
  floodMast(g, k, -W / 2 + 1.2, D / 2 - 1.2, 9, Math.PI * 0.75);
  standing(g, 1.6, D / 2 - 3, 0.4, o.seed + 2);
  vehicle(g, 'pickup', 1.2, 2.2, 0.1);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  anim.add((e) => {
    for (const [i, f] of fans.entries()) f.rotation.y += e.dt * (5 + (i % 3));
    for (const p of plumes) p.update(e);
  });
  return { obj: g, w: W, d: D, h: 10, doors: [{ x: bx + 0.1, z: bz + 3.7 + 0.7 }], update: anim.update, ground: () => null };
}
