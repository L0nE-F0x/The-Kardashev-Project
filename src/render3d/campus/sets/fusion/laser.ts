/**
 * Kindle's laser ignition: two long laser bays converging in a V on the spherical target chamber,
 * which stands in an open bioshield ring on its pedestal with a walkway round its waist, beam
 * tubes running from the bays' end frames into ports all over it. Every couple of seconds a shot:
 * the ports flash white, the chamber glows, the afterglow fades orange. Then heat exchangers, the
 * target factory and the shared balance of plant.
 */
import * as THREE from 'three';
import { rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  LiteKit, arcTorus, At, balanceOfPlant, carPark, controlBlock, Ctx, glowPool, halo, lampsAt, P, pipeRun, plasmaMat, ringWall, shed, siteBase, TAU, V, ventStack,
} from './common';
import { windowRow } from '../../plants2/parts';

const PERIOD = 2.6;

export function laserPlant(o: Act3SetOpts): Piece {
  const c = new Ctx(o);
  const { k, g, L, W, D } = c;
  const roadX = 6.9;
  siteBase(c, roadX, 6.4);
  k.box(3.0, 0.06, D - 8, P.asphalt, roadX, 0.02, 2.2, { r: 0.03, shade: 0, jitter: 0.02 });
  // ── the target chamber ──
  const cx = -2.2, cz = -4.6, cy = 6.5, R = 3.8;
  const portMat = plasmaMat('#fff6d8', 0.3);
  const ports = new LiteKit(rng(o.seed + 7));
  k.cyl(6.7, 6.9, 0.45, P.concrete2, cx, 0, cz, 48, { shade: 0.1 });
  k.geo(ringWall(6.4, 5.4, 0.45, 2.0, 0.55, TAU - 0.55, 64).translate(cx, 0, cz), '#d6cfc4', 0.03, 0.14);
  k.geo(ringWall(6.45, 5.35, 2.45, 0.3, 0.55, TAU - 0.55, 64).translate(cx, 0, cz), L.acc, 0.02, 0);
  k.cyl(1.7, 2.1, R * 0.62 + 0.4, '#aaa39a', cx, 0.45, cz, 20, { shade: 0.15 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    k.beam(V(cx + Math.sin(a) * 3.6, 0.45, cz + Math.cos(a) * 3.6), V(cx + Math.sin(a) * 2.2, cy - 2.4, cz + Math.cos(a) * 2.2), 0.4, '#7a7186');
  }
  k.geo(new THREE.SphereGeometry(R, 36, 22).translate(cx, cy, cz), '#cdd0d3', 0.02, 0);
  for (const lat of [-0.8, -0.4, 0.4, 0.8]) k.geo(new THREE.TorusGeometry(R * Math.cos(lat) + 0.02, 0.06, 4, 48).rotateX(Math.PI / 2).translate(cx, cy + R * Math.sin(lat), cz), '#9aa0a8', 0, 0);
  // the waist walkway with its rail and stair
  k.geo(ringWall(5.1, R + 0.15, cy - 0.15, 0.16, 0, TAU, 48).translate(cx, 0, cz), P.steel2, 0.02, 0);
  k.geo(arcTorus(5.0, 0.05, 0, TAU, 4, 48).translate(cx, cy + 1.0, cz), P.safety, 0, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    k.box(0.06, 1.0, 0.06, P.safety, cx + Math.sin(a) * 5.0, cy, cz + Math.cos(a) * 5.0, { r: 0, jitter: 0 });
    if (i % 4 === 1) k.box(0.18, cy - 0.6, 0.18, P.steelDark, cx + Math.sin(a) * 4.8, 0.45, cz + Math.cos(a) * 4.8, { r: 0 });
  }
  k.beam(V(cx + 4.8, 0.5, cz + 5.6), V(cx + 4.4, cy - 0.15, cz + 2.4), 0.5, P.steel);
  // the target inserter on top
  k.cyl(0.36, 0.36, 2.6, '#b9bec4', cx, cy + R - 0.2, cz, 10);
  k.box(1.2, 1.0, 1.2, '#e3dfd8', cx, cy + R + 2.3, cz, { r: 0.08 });
  k.box(1.24, 0.24, 1.24, L.acc, cx, cy + R + 2.9, cz, { r: 0.03, shade: 0 });
  // ports: a flange and a glowing window each, all over the sphere
  const portAt = (az: number, el: number) => V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const portDirs: THREE.Vector3[] = [];
  for (const el of [-0.62, -0.25, 0.25, 0.62]) for (let i = 0; i < 9; i++) portDirs.push(portAt((i / 9) * TAU + (el > 0 ? 0.35 : 0), el));
  portDirs.push(portAt(0, 1.2), portAt(Math.PI, 1.2), portAt(0, -1.15));
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of portDirs) {
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    const base = V(cx, cy, cz).addScaledVector(d, R - 0.05);
    k.geo(new THREE.CylinderGeometry(0.42, 0.48, 0.5, 10).translate(0, 0.25, 0).applyQuaternion(q).translate(base.x, base.y, base.z), '#8a8f98', 0.03, 0);
    ports.geo(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 10).translate(0, 0.53, 0).applyQuaternion(q).translate(base.x, base.y, base.z), '#ffffff', 0, 0);
  }
  // ── the laser bays, converging on the chamber ──
  const bays = [Math.PI + 0.45, Math.PI - 0.45];
  const Lb = 12.4, Wb = 5.4, Hb = 4.4, inner = 7.0;
  bays.forEach((phi, bi) => {
    const dx = Math.cos(phi), dz = Math.sin(phi);
    const mid = inner + Lb / 2;
    const a = new At(k, cx + dx * mid, 0, cz + dz * mid, Math.PI - phi);
    const al = new At(c.lit, cx + dx * mid, 0, cz + dz * mid, Math.PI - phi);
    const ac = new At(c.cyan, cx + dx * mid, 0, cz + dz * mid, Math.PI - phi);
    a.box(Lb + 0.4, 0.4, Wb + 0.4, P.concrete2, 0, 0, 0, { r: 0.06 });
    a.box(Lb, Hb, Wb, '#e3ddd3', 0, 0.3, 0, { r: 0.14, shade: 0.14 });
    for (let x = -Lb / 2 + 0.7; x < Lb / 2 - 0.4; x += 1.25) for (const sz of [-1, 1]) a.box(0.16, Hb - 1.2, 0.1, '#cfc8bd', x, 0.8, sz * (Wb / 2 + 0.02), { r: 0.02, jitter: 0, shade: 0 });
    a.box(Lb + 0.05, 0.42, Wb + 0.05, L.acc, 0, Hb - 0.55, 0, { r: 0.04, shade: 0 });
    a.box(Lb + 0.3, 0.3, Wb + 0.3, P.roof, 0, Hb + 0.2, 0, { r: 0.06, shade: 0 });
    a.box(Lb - 0.4, 0.08, Wb - 0.4, P.membrane, 0, Hb + 0.45, 0, { r: 0, shade: 0, jitter: 0.02 });
    for (let x = -Lb / 2 + 1.5; x < Lb / 2 - 1; x += 2.8) a.box(1.1, 0.6, 1.0, P.hvac, x, Hb + 0.5, -0.8, { r: 0.06 });
    // the beam gallery: a slit along both sides, cyan at night
    for (const sz of [-1, 1]) {
      a.box(Lb - 1.4, 0.36, 0.08, '#2c3e48', 0.2, 2.0, sz * (Wb / 2 + 0.05), { r: 0, jitter: 0, shade: 0 });
      ac.box(Lb - 1.6, 0.2, 0.06, '#5fd3b5', 0.2, 2.08, sz * (Wb / 2 + 0.09), { r: 0, jitter: 0, shade: 0 });
    }
    // windows and a door at the outer end, a plate
    al.box(0.08, 0.9, 1.0, P.glass, -Lb / 2 - 0.02, 1.4, 1.2, { r: 0, jitter: 0, shade: 0 });
    al.box(0.08, 0.9, 1.0, P.glass, -Lb / 2 - 0.02, 1.4, -1.2, { r: 0, jitter: 0, shade: 0 });
    a.box(0.1, 2.1, 1.2, '#5b5562', -Lb / 2 - 0.03, 0.35, 0, { r: 0, jitter: 0 });
    // the end frame the beamlines leave from
    a.box(0.7, Hb + 1.2, Wb - 1.0, P.steel2, Lb / 2 + 0.35, 0.3, 0, { r: 0.06 });
    for (const y of [1.2, 2.8, 4.4]) a.box(0.74, 0.14, Wb - 0.9, P.steelDark, Lb / 2 + 0.35, y, 0, { r: 0, jitter: 0 });
    // beam tubes into the near ports
    const toward = V(-dx, 0, -dz);
    const starts: [number, number][] = [[-1.4, 2.9], [1.4, 2.9], [-0.7, 4.3], [0.7, 4.3], [-1.6, 5.2], [1.6, 5.2]];
    starts.forEach(([side, y], i) => {
      const s0 = a.pt(Lb / 2 + 0.75, y, side);
      // the port that faces this tube best
      const want = V(-toward.x, 0, -toward.z).normalize();
      const el = i < 2 ? -0.25 : i < 4 ? 0.25 : 0.62;
      const az = Math.atan2(want.x, want.z) + (side < 0 ? -0.36 : 0.36) * (bi === 0 ? -1 : 1);
      const pd = portAt(az, el);
      const e1 = V(cx, cy, cz).addScaledVector(pd, R + 0.5);
      pipeRun(k, [s0, e1], 0.22, '#c3c8cc', { seg: 8 });
      const q = new THREE.Quaternion().setFromUnitVectors(up, pd);
      const b2 = V(cx, cy, cz).addScaledVector(pd, R - 0.05);
      k.geo(new THREE.CylinderGeometry(0.4, 0.46, 0.5, 10).translate(0, 0.25, 0).applyQuaternion(q).translate(b2.x, b2.y, b2.z), '#8a8f98', 0.03, 0);
    });
  });
  // power conditioning: capacitor halls between the bays' outer ends
  const pcx = -15.4, pcz = -4.4;
  const pcTop = shed(k, pcx, pcz, 6.4, 5.0, 3.6, { wall: '#e7e2da', band: L.acc, ribs: 1.0 });
  for (let x = pcx - 2.4; x <= pcx + 2.4; x += 1.6) k.box(1.0, 0.7, 1.6, P.hvac, x, pcTop, pcz, { r: 0.06 });
  k.box(0.9, 1.9, 0.08, '#5b5562', pcx + 1.8, 0.4, pcz + 2.54, { r: 0 });
  // heat exchangers and the hot loop to the turbine hall
  for (const [x, z] of [[2.6, -13.4], [4.6, -10.4]] as [number, number][]) {
    k.cyl(1.25, 1.35, 0.3, P.concrete2, x, 0, z, 16);
    k.cyl(1.0, 1.0, 7.2, '#d9d3ca', x, 0.25, z, 16, { shade: 0.12 });
    k.geo(new THREE.SphereGeometry(1.0, 16, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.45, 1).translate(x, 7.45, z), '#e3ddd3', 0.02);
    k.cyl(1.02, 1.02, 0.3, L.acc, x, 5.6, z, 16, { shade: 0 });
  }
  pipeRun(k, [V(cx + 2.6, 1.2, cz - 2.6), V(2.6, 1.2, -11.6), V(2.6, 1.2, -12.2)], 0.3, '#8a8f98', { seg: 10 });
  pipeRun(k, [V(4.6, 6.0, -10.4), V(8.8, 6.0, -10.4)], 0.28, '#8a8f98', { seg: 10 });
  pipeRun(k, [V(2.6, 5.0, -13.4), V(8.8, 5.0, -13.4)], 0.28, '#8a8f98', { seg: 10 });
  // the target factory (cryogenic fuel pellets) and the stack
  const tfx = 0.2, tfz = 8.4;
  shed(k, tfx, tfz, 5.6, 3.4, 3.6, { wall: '#f1ede6', band: L.acc, ribs: 0 });
  windowRow(k, c.lit, 'z+', tfz + 1.72, tfx - 2.5, tfx + 2.5, 1.8, 0.9, 0.9, 0.35, c.r, 0.8);
  ventStack(c, -0.6, -15.0, 16);
  // ── the rest ──
  const bop = balanceOfPlant(c);
  controlBlock(c, -16.2, 12.9, 8.6, 4.4, 4.8);
  carPark(c, -6.4, 14.2, 5);
  lampsAt(c, [[-2.0, 4.0, 1], [5.2, -6.0, -1], [-20.6, -10, 1]]);
  // ── the shot ──
  g.add(ports.build(portMat));
  const hl = halo([V(cx, cy, cz)], [20], '#fff1d0', 0);
  const hp = halo(portDirs.map((d) => V(cx, cy, cz).addScaledVector(d, R + 0.6)), portDirs.map(() => 1.6), '#ffe9b0', 0);
  g.add(hl.obj, hp.obj);
  glowPool(c, cx, cz, 9, '#ffe2b0', 0.35);
  c.anim.extra.push((e) => {
    const u = ((e.t + (o.seed % 7) * 0.31) % PERIOD + PERIOD) % PERIOD;
    const f = Math.exp(-u / 0.12), after = Math.exp(-u / 0.7);
    portMat.emissiveIntensity = 0.3 + e.night * 0.5 + f * 7 + after * 1.4;
    portMat.emissive.setRGB(1, 0.75 + 0.25 * f, 0.45 + 0.55 * f);
    hl.set(f * 1.1 + after * 0.12);
    hp.set(0.15 * e.night + f * 1.2 + after * 0.3);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: Math.max(cy + R + 3.2, bop, 16.8), update: c.update, ground: () => null };
}
