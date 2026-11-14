/**
 * Quickpinch's magnetised target: out in the open under a goliath gantry crane, a tall steel
 * vessel ringed by four tiers of piston housings, the plasma gun on top (a tapered barrel in coil
 * rings), capacitor banks and gas accumulators round it in a bioshield ring. Every few seconds
 * the bang: the pistons slam in, the liquid-metal seams flash white and cool through orange.
 * Then the shared balance of plant.
 */
import * as THREE from 'three';
import { col, paintMat, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  LiteKit, arcTorus, balanceOfPlant, beacon, carPark, controlBlock, coreMat, Ctx, glowPool, halo, hcyl, lampsAt, mixHex, P, pipeRun, plasmaMat, ringWall, shed,
  siteBase, TAU, V,
} from './common';
import { tank } from '../../plants2/parts';

const PERIOD = 3.4;

export function pinchPlant(o: Act3SetOpts): Piece {
  const c = new Ctx(o);
  const { k, g, L, W, D } = c;
  siteBase(c, 3.5, 7.4, undefined, -15.4 + 9.0 / 2 - 1.4);
  k.box(3.4, 0.06, D - 6, P.asphalt, 3.5, 0.02, 1.2, { r: 0.03, shade: 0, jitter: 0.02 });
  const vx = -8.4, vz = -4.4, vr = 3.0, vy0 = 1.9, vh = 8.6;
  const steel = '#b6bbc1';
  // the pad, the bioshield ring (open at the front) and the plinth
  k.cyl(7.3, 7.4, 0.4, P.concrete2, vx, 0, vz, 8, { shade: 0.1 });
  k.geo(ringWall(7.0, 6.2, 0.4, 2.4, 0.5, TAU - 0.5, 56).translate(vx, 0, vz), '#d6cfc4', 0.03, 0.14);
  k.geo(ringWall(7.05, 6.15, 2.8, 0.3, 0.5, TAU - 0.5, 56).translate(vx, 0, vz), L.acc, 0.02, 0);
  k.cyl(4.2, 4.4, vy0 - 0.4, '#a9a197', vx, 0.4, vz, 16, { shade: 0.15 });
  // the vessel and its dome
  k.cyl(vr, vr, vh, steel, vx, vy0, vz, 32, { shade: 0.05 });
  k.geo(new THREE.SphereGeometry(vr, 32, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.5, 1).translate(vx, vy0 + vh, vz), mixHex(steel, '#ffffff', 0.12), 0.02);
  // the plasma gun on top: a tapered barrel with coil rings in the builder's colours
  const gy = vy0 + vh + vr * 0.5 - 0.2, gh = 4.6;
  k.cyl(0.55, 1.05, gh, '#9aa0a8', vx, gy, vz, 18, { shade: 0.05 });
  for (let i = 0; i < 6; i++) {
    const t = i / 5, rr = 1.05 - 0.5 * t + 0.16;
    k.geo(new THREE.TorusGeometry(rr, 0.17, 6, 20).rotateX(Math.PI / 2).translate(vx, gy + 0.4 + t * (gh - 0.8), vz), i % 2 ? L.acc : L.hi, 0.02, 0);
  }
  k.cyl(0.7, 0.7, 0.5, P.steelDark, vx, gy + gh, vz, 14);
  beacon(g, vx, gy + gh + 0.8, vz, 1.2);
  // piston housings: four tiers of sixteen, a flange at the vessel, a drive block at the end
  const tiers = [vy0 + 1.4, vy0 + 3.4, vy0 + 5.4, vy0 + 7.4];
  const NP = 16;
  const capAt: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  tiers.forEach((y, ti) => {
    for (let i = 0; i < NP; i++) {
      const a = ((i + (ti % 2) * 0.5) / NP) * TAU;
      const d = V(Math.sin(a), 0, Math.cos(a));
      const q = new THREE.Quaternion().setFromUnitVectors(up, d);
      const base = V(vx, y, vz).addScaledVector(d, vr - 0.05);
      k.geo(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 10).translate(0, 0.1, 0).applyQuaternion(q).translate(base.x, base.y, base.z), '#8a8f98', 0.02, 0);
      k.geo(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 10).translate(0, 0.85, 0).applyQuaternion(q).translate(base.x, base.y, base.z), steel, 0.03, 0);
      const m = new THREE.Matrix4().makeRotationY(a).setPosition(V(vx, y, vz).addScaledVector(d, vr + 1.75));
      capAt.push(m);
    }
  });
  // the drive blocks move (one instanced mesh)
  const cap = new LiteKit(rng(o.seed + 9));
  cap.box(0.86, 0.86, 0.7, '#7a7186', 0, -0.43, 0, { r: 0.08 });
  cap.box(0.9, 0.18, 0.74, L.acc, 0, 0.26, 0, { r: 0.03, shade: 0 });
  cap.cyl(0.18, 0.18, 0.5, P.steelDark, 0, -0.25, 0.32, 8, { rx: Math.PI / 2 });
  const caps = new THREE.InstancedMesh(cap.build().geometry, paintMat, capAt.length);
  capAt.forEach((m, i) => caps.setMatrixAt(i, m));
  caps.castShadow = caps.receiveShadow = true;
  g.add(caps);
  // the liquid-metal seams between the tiers and the drain ring at the foot: they glow at the bang
  const seam = plasmaMat('#f7b258', 0.6);
  const seams = new LiteKit(rng(o.seed + 10));
  for (const y of [vy0 + 0.4, ...tiers.map((t) => t + 1.0)]) seams.geo(new THREE.CylinderGeometry(vr + 0.03, vr + 0.03, 0.18, 32, 1, true).translate(vx, y, vz), '#ffffff', 0, 0);
  seams.geo(arcTorus(vr + 0.4, 0.16, 0, TAU, 6, 40).translate(vx, vy0 + 0.1, vz), '#ffffff', 0, 0);
  g.add(seams.build(seam));
  // the gantry: two A-frame legs either side and a bridge with a trolley
  const gx0 = vx - 7.6, gx1 = vx + 7.6, gyB = 16.6;
  for (const x of [gx0, gx1]) {
    for (const dz of [-3.4, 3.4]) k.beam(V(x, 0, vz + dz), V(x, gyB, vz), 0.55, L.acc);
    k.box(1.0, 0.5, 8.0, '#5b5562', x, 0, vz, { r: 0.06 });
    k.box(0.9, 0.9, 0.9, L.dark, x, gyB - 0.8, vz, { r: 0.06 });
  }
  k.box(gx1 - gx0 + 1.2, 1.1, 1.4, L.acc, vx, gyB, vz, { r: 0.08 });
  k.box(gx1 - gx0 + 1.3, 0.2, 1.5, L.hi, vx, gyB + 1.1, vz, { r: 0.03, shade: 0 });
  k.box(2.0, 1.2, 1.9, '#5b5562', vx + 3.0, gyB - 1.1, vz, { r: 0.08 });
  k.beam(V(vx + 3.0, gyB - 1.1, vz), V(vx + 3.0, gyB - 4.4, vz), 0.07, '#433c52');
  k.box(0.7, 0.5, 0.5, P.safety, vx + 3.0, gyB - 4.9, vz, { r: 0.05 });
  beacon(g, vx, gyB + 1.6, vz, 0.4);
  // capacitor banks: rows of cabinets behind, cables up the gantry leg to the gun
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 7; i++) {
      const x = vx - 7.8 + i * 2.2, z = -15.6 + row * 2.2;
      k.box(1.7, 2.1, 1.0, '#e3dfd8', x, 0.1, z, { r: 0.08 });
      k.box(1.72, 0.24, 1.02, L.acc, x, 1.75, z, { r: 0.02, shade: 0 });
      k.box(0.5, 0.12, 0.05, '#5fd3b5', x - 0.4, 1.2, z + 0.52, { r: 0, jitter: 0, shade: 0 });
    }
  for (let i = 0; i < 3; i++) pipeRun(k, [V(vx - 1 + i * 0.5, 2.3, -14.6), V(vx - 1 + i * 0.5, 2.3, vz - 6.6), V(vx - 1 + i * 0.5, gy + 1.2, vz - 1.2)], 0.12, '#433c52', { seg: 6 });
  // gas accumulators that drive the pistons, piped round the ring
  for (const [x, z] of [[-19.4, -11.4], [-19.4, -6.4]] as [number, number][]) tank(k, x, z, 1.4, 6.8, '#dcd8d0', { cap: 'dome', band: L.acc, ladder: true });
  pipeRun(k, [V(-18.0, 3.6, -11.4), V(-17.0, 3.6, -11.4), V(-17.0, 3.6, vz), V(vx - 6.4, 3.6, vz)], 0.26, '#8a8f98', { seg: 8 });
  pipeRun(k, [V(-18.0, 2.4, -6.4), V(vx - 6.4, 2.4, -6.4), V(vx - 6.4, 2.4, vz - 1.2)], 0.22, '#8a8f98', { seg: 8 });
  hcyl(k, 0.5, 4.0, '#c9c3ba', vx + 5.2, 1.0, vz - 4.2, 'z', 12);
  // the hot liquid metal goes to the heat exchangers by the turbine hall
  for (const [x, z] of [[6.6, -13.8], [6.6, -10.8]] as [number, number][]) {
    k.cyl(1.0, 1.1, 0.3, P.concrete2, x, 0, z, 14);
    k.cyl(0.85, 0.85, 6.2, '#d9d3ca', x, 0.25, z, 14, { shade: 0.12 });
    k.cyl(0.87, 0.87, 0.3, L.acc, x, 4.6, z, 14, { shade: 0 });
  }
  pipeRun(k, [V(vx + 2.2, 6.2, vz - 1.4), V(6.6, 6.2, vz - 1.4), V(6.6, 6.2, -10.8)], 0.3, '#8f6a5a', { seg: 10 });
  k.box(0.3, 6.0, 0.3, P.steel, 0.8, 0, vz - 1.4, { r: 0 });
  k.box(0.3, 6.0, 0.3, P.steel, 6.0, 0, vz - 1.4, { r: 0 });
  pipeRun(k, [V(6.6, 5.0, -12.3), V(8.8, 5.0, -12.3)], 0.28, '#8a8f98', { seg: 10 });
  // a control room by the ring, the rest of the plant
  shed(k, -1.8, 4.8, 5.2, 3.0, 3.2, { wall: '#efebe5', band: L.acc, ribs: 0 });
  const bop = balanceOfPlant(c);
  const cb = controlBlock(c, -15.4, 12.8, 9.0, 4.4, 4.8);
  carPark(c, -4.8, 14.2, 5);
  lampsAt(c, [[-1.6, 9.6, -1], [6.4, -3.6, 1], [-20.8, 0, 1]]);
  // ── the bang ──
  const flash = coreMat('#fff6d8', 1.0);
  const hot = new THREE.Mesh(new THREE.TorusGeometry(vr + 0.1, 0.1, 4, 40).rotateX(Math.PI / 2).translate(vx, gy - 0.1, vz), flash);
  g.add(hot);
  const hl = halo(tiers.flatMap((y) => [0, 1, 2, 3].map((i) => V(vx + Math.sin(i * 1.57 + 0.4) * (vr + 0.4), y + 1.0, vz + Math.cos(i * 1.57 + 0.4) * (vr + 0.4)))), tiers.flatMap(() => [3, 3, 3, 3]), '#f7b258', 0);
  g.add(hl.obj);
  glowPool(c, vx, vz, 8, '#f7b258', 0.35);
  const m4 = new THREE.Matrix4(), off = new THREE.Vector3();
  const seamCol = col('#f7b258').clone(), white = col('#fff6d8').clone();
  c.anim.extra.push((e) => {
    const u = ((e.t + (o.seed % 5) * 0.4) % PERIOD + PERIOD) % PERIOD;
    const slam = u < 0.09 ? u / 0.09 : Math.exp(-(u - 0.09) / 0.45);
    const f = Math.exp(-u / 0.22), after = Math.exp(-u / 1.1);
    capAt.forEach((m, i) => {
      m4.copy(m);
      off.set(m.elements[8], 0, m.elements[10]).multiplyScalar(-0.42 * slam);
      m4.elements[12] += off.x;
      m4.elements[14] += off.z;
      caps.setMatrixAt(i, m4);
    });
    caps.instanceMatrix.needsUpdate = true;
    seam.emissive.copy(seamCol).lerp(white, f);
    seam.emissiveIntensity = 0.5 + e.night * 0.8 + after * 2.2 + f * 6;
    flash.color.copy(white).multiplyScalar(0.6 + f * 3);
    hl.set(f * 1.0 + after * 0.25 + e.night * 0.1);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: Math.max(gyB + 1.8, gy + gh + 1.2, bop), doors: [cb.door], update: c.update, ground: () => null };
}
