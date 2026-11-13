/**
 * The public square by the lake: stone paving inlaid with rings, a fountain with dancing jets, the
 * armillary (the Charter's emblem in bronze and gold, slowly turning), a timber café with a
 * striped awning and parasol tables under festoon lights, benches, trees and the Charter's flags.
 */
import * as THREE from 'three';
import { plantField } from '../../trees';
import { glowMat, Kit, lightPool, poolMat, rng, type Paint } from '../../../kit';
import { Plume, sign } from '../../../fx';
import { streetLamp, type Env, type Piece } from '../../../pieces';
import { hasModel } from '../../../models';
import type { Act3SetOpts } from '../../act3sets';
import { bench, CHARTER_FLAG, flagPole, Flags, greenery, lampMat, litGlass, litSign, paving, People, plantedTree, sitter, V } from './common';
import { fit, waterMat } from './secretariat';

const STONE: Paint = '#ece6dc';
const STONE2: Paint = '#d6cdbf';
const INLAY: Paint = '#b9ad9c';

/** A flat ring inlaid in the paving. */
function ring(k: Kit, x: number, y: number, z: number, r0: number, r1: number, c: Paint, seg = 48) {
  k.geo(new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2).translate(x, y, z), c, 0.02);
}

/** Festoon lights strung between posts: wires that sag, bulbs that glow at night. */
function festoon(g: THREE.Object3D, k: Kit, runs: [THREE.Vector3, THREE.Vector3][], seed: number) {
  const r = rng(seed);
  const bulbs = new Kit(rng(seed + 1));
  const bulbGeo = () => new THREE.SphereGeometry(0.1, 6, 4);
  for (const [a, b] of runs) {
    const n = Math.max(6, Math.round(a.distanceTo(b) / 0.85));
    let prev = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * 0.7;
      k.beam(prev, p, 0.035, '#3a3442');
      if (i < n) bulbs.geo(bulbGeo().translate(p.x, p.y - 0.12, p.z), r() < 0.25 ? '#ffd9a0' : '#fff1c8', 0.05);
      prev = p;
    }
  }
  const m = bulbs.build(lampMat('yel1', 3.4));
  m.castShadow = false;
  g.add(m);
}

export function plaza(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  g.name = 'set:plaza';
  const k = new Kit(rng(o.seed));
  const B = 0.2;
  const accent = o.accent ?? '#f7b258';
  paving(k, -14.8, -12.8, 14.8, 12.8, 0, 2.0);
  // a darker stone border, flower beds along the west side and by the café
  for (const [w, d, x, z] of [[29.6, 0.7, 0, -12.45], [29.6, 0.7, 0, 12.45], [0.7, 25.6, -14.45, 0], [0.7, 25.6, 14.45, 0]] as const)
    k.box(w, 0.03, d, '#c9bfb1', x, B, z, { r: 0, jitter: 0, shade: 0 });
  for (const [x0, x1, z0, z1] of [[-14.5, -13.7, -5.6, 6.8], [5.4, 10.4, 6.5, 8.0]] as const) {
    k.box(x1 - x0 + 0.3, 0.32, z1 - z0 + 0.3, STONE2, (x0 + x1) / 2, B, (z0 + z1) / 2, { r: 0.05, shade: 0.1 });
    k.box(x1 - x0, 0.1, z1 - z0, '#5f3b28', (x0 + x1) / 2, B + 0.25, (z0 + z1) / 2, { r: 0, jitter: 0.05, shade: 0 });
    for (let x = x0 + 0.5; x < x1; x += 1.1) for (let z = z0 + 0.5; z < z1; z += 1.1) greenery(k, x, B + 0.3, z, 0.42, o.seed + Math.round(x * 13 + z * 7), true);
  }
  // ── the fountain: a low round basin, jets dancing in a ring ──
  const FX = -7, FZ = 2, FR = 3.7;
  ring(k, FX, B + 0.022, FZ, FR + 0.9, FR + 1.3, INLAY);
  ring(k, FX, B + 0.022, FZ, FR + 2.5, FR + 2.8, INLAY, 64);
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    k.box(0.08, 0.012, 1.2, INLAY, FX + Math.sin(t) * (FR + 1.9), B + 0.022, FZ + Math.cos(t) * (FR + 1.9), { r: 0, jitter: 0, shade: 0, ry: t });
  }
  const wall = [V(FR - 0.55, 0, 0), V(FR, 0, 0), V(FR + 0.05, 0.5, 0), V(FR - 0.1, 0.62, 0), V(FR - 0.5, 0.62, 0), V(FR - 0.6, 0.5, 0), V(FR - 0.58, 0.05, 0)].map((p) => new THREE.Vector2(p.x, p.y));
  k.geo(new THREE.LatheGeometry(wall, 48).translate(FX, B, FZ), STONE, 0.02);
  k.cyl(FR - 0.5, FR - 0.5, 0.1, '#2f5f74', FX, B, FZ, 40);
  k.cyl(0.7, 0.9, 0.55, STONE2, FX, B, FZ, 16);
  const water = new THREE.Mesh(new THREE.CircleGeometry(FR - 0.52, 40).rotateX(-Math.PI / 2), waterMat);
  water.position.set(FX, B + 0.42, FZ);
  water.receiveShadow = true;
  g.add(water);
  const jetMat = glowMat('#e8f6fb', 0.05);
  jetMat.transparent = true;
  jetMat.opacity = 0.72;
  jetMat.userData.glowBase = 0.05;
  jetMat.userData.nightOnly = 0.9;
  jetMat.depthWrite = false;
  const jetGeo = new THREE.CylinderGeometry(0.06, 0.13, 1, 8, 1, true).translate(0, 0.5, 0);
  const capGeo = new THREE.SphereGeometry(0.26, 8, 6);
  const jets: { m: THREE.Mesh; cap: THREE.Mesh; h: number; ph: number }[] = [];
  const jetAt = (x: number, z: number, h: number, ph: number) => {
    const m = new THREE.Mesh(jetGeo, jetMat);
    m.position.set(x, B + 0.42, z);
    const cap = new THREE.Mesh(capGeo, jetMat);
    g.add(m, cap);
    jets.push({ m, cap, h, ph });
  };
  jetAt(FX, FZ, 3.4, 0);
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2;
    jetAt(FX + Math.sin(t) * 1.7, FZ + Math.cos(t) * 1.7, 1.6, i * 1.1);
  }
  const mist = new Plume({ count: 22, life: 2.4, rise: 0.7, spread: 0.6, size0: 0.6, size1: 2.2, opacity: 0.32, radius: 1.8, wind: 0.25 }, o.seed);
  mist.obj.position.set(FX, B + 0.5, FZ);
  g.add(mist.obj);
  lightPool(g, FX, B + 0.3, FZ, FR + 0.6, poolMat('#a3f0d6', 0.5));
  for (const t of [0.8, 2.37, 3.93, 5.5]) bench(k, FX + Math.sin(t) * (FR + 2.1), B, FZ + Math.cos(t) * (FR + 2.1), t + Math.PI);
  sitter(k, FX + Math.sin(0.8) * (FR + 2.1) - 0.35, B + 0.48, FZ + Math.cos(0.8) * (FR + 2.1), 0.8 + Math.PI, o.seed + 1, B);
  sitter(k, FX + Math.sin(3.93) * (FR + 2.1) + 0.3, B + 0.48, FZ + Math.cos(3.93) * (FR + 2.1), 3.93 + Math.PI, o.seed + 2, B);
  // ── the armillary: the Charter's emblem in the round ──
  const AX = 2.4, AZ = -4.6;
  ring(k, AX, B + 0.022, AZ, 3.0, 3.35, accent, 48);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    k.box(0.12, 0.014, 1.5, accent, AX + Math.sin(t) * 2.2, B + 0.008, AZ + Math.cos(t) * 2.2, { r: 0, jitter: 0, shade: 0, ry: t });
  }
  k.box(1.7, 1.4, 1.7, STONE, AX, B, AZ, { r: 0.1, shade: 0.12 });
  k.box(2.0, 0.24, 2.0, STONE2, AX, B + 1.4, AZ, { r: 0.06 });
  k.cyl(0.08, 0.08, 1.3, '#9c6c3d', AX, B + 1.64, AZ, 6);
  const AY = B + 3.6;
  const arm = new THREE.Group();
  arm.position.set(AX, AY, AZ);
  const gold = glowMat('yel0', 0);
  gold.userData.nightOnly = 0.35;
  gold.roughness = 0.55;
  const ringsA = new Kit(rng(o.seed + 5));
  ringsA.geo(new THREE.TorusGeometry(1.9, 0.09, 6, 48), 'yel0', 0.02);
  ringsA.geo(new THREE.TorusGeometry(1.9, 0.09, 6, 48).rotateY(Math.PI / 2), '#f0c060', 0.02);
  ringsA.geo(new THREE.TorusGeometry(1.95, 0.07, 6, 48).rotateX(Math.PI / 2), '#f7b258', 0.02);
  ringsA.geo(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 6), '#d4a862', 0);
  const rA = ringsA.build(gold);
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.41;
  tilt.add(rA);
  const orbit = new Kit(rng(o.seed + 6));
  orbit.geo(new THREE.TorusGeometry(2.35, 0.11, 6, 56).rotateX(Math.PI / 2 - 0.32), 'yel0', 0.02);
  const rB = orbit.build(gold);
  const globe = new Kit(rng(o.seed + 7));
  globe.geo(new THREE.IcosahedronGeometry(0.78, 2), '#2fae9b', 0.03);
  for (let i = 0; i < 5; i++) {
    const t = i * 1.3, p = 0.5 - i * 0.25;
    globe.geo(new THREE.IcosahedronGeometry(0.3 + (i % 2) * 0.12, 0).scale(1, 0.5, 1).translate(Math.cos(t) * Math.cos(p) * 0.68, Math.sin(p) * 0.68, Math.sin(t) * Math.cos(p) * 0.68), '#5a9537', 0.1);
  }
  const gm = globe.build();
  tilt.add(gm);
  arm.add(tilt, rB);
  g.add(arm);
  lightPool(g, AX, B, AZ, 3.2, poolMat('#ffd9a0', 0.45));
  // ── the café: a timber kiosk, a striped awning, tables under festoons ──
  const KX = 10, KZ = -9.4;
  k.box(5.0, 3.0, 3.2, '#bb8a4c', KX, B, KZ, { r: 0.1, shade: 0.15 });
  for (let x = KX - 2.2; x <= KX + 2.21; x += 0.55) k.box(0.1, 2.9, 0.06, '#9c6c3d', x, B + 0.05, KZ + 1.62, { r: 0, jitter: 0.04 });
  k.box(5.3, 0.3, 3.5, '#7d5232', KX, B + 3.0, KZ, { r: 0.06 });
  const win = new Kit(rng(o.seed + 8));
  win.box(3.6, 1.2, 0.08, '#4a3a2c', KX, B + 1.25, KZ + 1.67, { r: 0, jitter: 0.03 });
  g.add(win.build(litGlass('yel1', 1.2)));
  k.box(3.9, 0.12, 0.6, '#d4a862', KX, B + 1.1, KZ + 1.92, { r: 0.03 });
  const awn = new Kit(rng(o.seed + 9));
  for (let i = 0; i < 9; i++) awn.box(0.6, 0.05, 1.8, i % 2 ? '#fbf7f0' : '#c23a3f', -2.4 + i * 0.6, 0, 0.9, { r: 0, jitter: 0.02 });
  for (let i = 0; i < 9; i++) awn.box(0.6, 0.3, 0.04, i % 2 ? '#fbf7f0' : '#c23a3f', -2.4 + i * 0.6, -0.3, 1.8, { r: 0, jitter: 0.02 });
  const am = awn.build();
  am.position.set(KX, B + 2.9, KZ + 1.6);
  am.rotation.x = 0.32;
  g.add(am);
  k.box(5.2, 0.62, 0.3, '#f3e2b0', KX, B + 3.3, KZ + 1.2, { r: 0.05 });
  const cafe = fit(litSign('CAFÉ', 4, '#93243a', null, 0.8), 3.2, 0.5);
  cafe.position.set(KX, B + 3.61, KZ + 1.36);
  g.add(cafe);
  // parasol tables
  const umbrellas: [number, number, Paint][] = [[7.6, -3.2, 'yel0'], [11.9, -4.0, '#3b7fae'], [9.8, 0.4, '#fbf7f0'], [13.2, -0.2, 'yel0']];
  for (const [i, [x, z, c]] of umbrellas.entries()) {
    k.cyl(0.05, 0.05, 2.4, '#5b5562', x, B, z, 6);
    k.cyl(0.5, 0.5, 0.06, '#e6e0e3', x, B + 0.74, z, 14);
    k.cyl(0.08, 0.2, 0.74, '#5b5562', x, B, z, 6);
    const cone = new THREE.ConeGeometry(1.45, 0.55, 8, 1, true).translate(x, B + 2.35, z);
    k.geo(cone, c, 0.04);
    k.geo(new THREE.ConeGeometry(1.46, 0.08, 8, 1, true).translate(x, B + 2.06, z), i % 2 ? '#fbf7f0' : '#c23a3f', 0.02);
    for (const t of [0.4, 2.5, 4.4]) {
      const cx = x + Math.sin(t) * 0.85, cz = z + Math.cos(t) * 0.85;
      k.box(0.42, 0.44, 0.42, '#7a7186', cx, B, cz, { r: 0.04, ry: t });
      if ((i + Math.round(t)) % 3 !== 1) sitter(k, cx, B + 0.46, cz, t + Math.PI, o.seed + i * 5 + Math.round(t * 3), B);
    }
  }
  // festoon posts round the terrace
  const posts: [number, number][] = [[5.6, 2.8], [14.3, 2.8], [14.3, -6.3], [5.6, -6.3]];
  for (const [x, z] of posts) {
    k.box(0.16, 4.4, 0.16, '#5b5562', x, B, z, { r: 0, jitter: 0 });
    k.box(0.32, 0.12, 0.32, '#5b5562', x, B + 4.4, z, { r: 0 });
  }
  const top = (i: number) => V(posts[i][0], B + 4.35, posts[i][1]);
  festoon(g, k, [[top(0), top(1)], [top(1), top(2)], [top(3), top(0)], [top(0), top(2)], [top(1), top(3)]], o.seed + 3);
  lightPool(g, 10, B, -1.8, 6.4, poolMat('#ffd9a0', 0.5), 1.1);
  // ── trees, planters, flags, lamps, benches at the front ──
  g.add(plantField('oak', [{ x: -12, y: B, z: -9.3, s: 0.92, ry: 0.3 }, { x: -3.2, y: B, z: -10.4, s: 0.86, ry: 1.9 }, { x: 12, y: B, z: 9.4, s: 0.84, ry: 4 }]));
  plantedTree(k, -13, B, 10.6, 1.1, o.seed + 11);
  plantedTree(k, 4.6, B, 10.4, 1.05, o.seed + 12);
  for (let i = 0; i < 7; i++) {
    const x = -14 + i * 0.9;
    k.box(0.8, 0.45, 0.8, STONE2, x, B, -12.2, { r: 0.05 });
    greenery(k, x, B + 0.45, -12.2, 0.5, o.seed + 30 + i, true);
  }
  const fl: { x: number; y: number; z: number; banner: number; w: number; h: number }[] = [];
  for (const [i, x] of [-7.6, -5.2, -2.8].entries()) {
    flagPole(k, x, B, -12.3 + i * 0.01, 8);
    fl.push({ x: x + 0.08, y: B + 7.95, z: -12.3, banner: CHARTER_FLAG, w: 2.3, h: 1.45 });
  }
  const flags = new Flags(fl);
  g.add(flags.mesh);
  for (const x of [-10, 0, 9]) streetLamp(g, k, x, B, 11.9, 1);
  for (const x of [-4.6, 7.4]) bench(k, x, B, 11.0, Math.PI);
  sitter(k, -4.3, B + 0.48, 11.0, Math.PI, o.seed + 40, B);
  // a little noticeboard about the Charter
  k.box(0.12, 1.8, 0.12, '#5b5562', 0.7, B, 7.6, { r: 0 });
  k.box(0.12, 1.8, 0.12, '#5b5562', 2.5, B, 7.6, { r: 0 });
  k.box(2.2, 1.2, 0.12, '#264276', 1.6, B + 1.0, 7.6, { r: 0.04 });
  const board = fit(sign('THE CHARTER · OPEN TO ALL', 6, '#fbf7f0'), 1.9, 0.3);
  board.position.set(1.6, B + 1.9, 7.67);
  g.add(board);
  g.add(k.build());
  // people: strolling, chatting, a kid with a balloon
  const ppl = new People(B);
  // (townsfolk when they've loaded: the scene rebuilds once they have)
  const town = hasModel('resident_a') && hasModel('kid_b');
  ppl.walk([[-12.9, -6], [-1, -7.4], [-0.5, 8.6], [-12.9, 8.4]], town ? 'resident_a' : null);
  ppl.walk([[4.5, 8.6], [4.2, -1.2], [-1.8, 1.6], [-1.4, 8.2]], town ? 'resident_b' : 'office');
  ppl.walk([[13.0, 5.6], [3.6, 5.4], [3.9, -0.6], [12.6, -1.6], [12.4, 1.6]], 'researcher');
  ppl.walk([[-13.6, 12.6], [13.6, 12.6]], 'scientist');
  ppl.stand(0.8, 3.6, 0.6, 'engineer');
  ppl.stand(1.6, 4.3, -2.5, 'office');
  ppl.stand(8.6, -6.55, Math.PI, 'worker');
  ppl.stand(-2.8, 1.8, -1.2, town ? 'kid_b' : null, town ? 1.28 : 1.12);
  const balloon = new THREE.Group();
  const bk = new Kit(rng(o.seed + 20));
  bk.geo(new THREE.SphereGeometry(0.34, 12, 10).scale(1, 1.15, 1).translate(0, 1.55, 0), 'red3', 0.02);
  bk.beam(V(0, 0, 0), V(0, 1.2, 0), 0.02, '#e6e0e3');
  balloon.add(bk.build());
  balloon.position.set(-3.1, B + 0.75, 1.75);
  g.add(balloon, ppl.group);
  return {
    obj: g, w: 30, d: 26, h: 9,
    ground: () => null,
    update(e: Env) {
      for (const j of jets) {
        const h = j.h * (0.72 + 0.28 * Math.sin(e.t * 1.7 + j.ph)) * (0.85 + 0.15 * Math.sin(e.t * 5.3 + j.ph * 2));
        j.m.scale.set(1, h, 1);
        j.cap.position.set(j.m.position.x, j.m.position.y + h, j.m.position.z);
        j.cap.scale.setScalar(0.7 + 0.3 * Math.sin(e.t * 6 + j.ph));
      }
      mist.update(e);
      arm.rotation.y += e.dt * 0.12;
      rB.rotation.y -= e.dt * 0.25;
      gm.rotation.y += e.dt * 0.3;
      balloon.rotation.z = Math.sin(e.t * 0.9) * 0.08;
      balloon.position.y = B + 0.75 + Math.sin(e.t * 1.3) * 0.05;
      flags.update(e);
      ppl.update(e);
    },
  };
}
