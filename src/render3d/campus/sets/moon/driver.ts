/**
 * The lunar mass driver: a loading station at the breech (printed walls, capacitor banks on the
 * roof, capsules waiting in their rack), then the electromagnetic rail on pylons ramping up across
 * the plain to the muzzle frame. Every few seconds a shot: a capsule slides out onto the rail, the
 * coils fire in a running wave of cyan as it accelerates, it leaves the muzzle with a flash and
 * streaks off towards orbit.
 */
import * as THREE from 'three';
import { col, Kit, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { astro, beacon, Ctx, floodMast, hcyl, M, pressRover, printedDome, radiator, roverTracks, V, LiteKit } from './common';
import { coreMat, halo, placard } from '../fusion/common';

export const DRIVER_PERIOD = 5.2;
const LOAD = 1.6, ACCEL = 1.1, FLY = 1.8;

/** A gold capsule (axis +x, nose forward), origin at its middle. */
function capsule(k: Kit, acc: string, x = 0, y = 0, z = 0) {
  hcyl(k, 0.46, 1.6, M.foil, x, y, z, 'x', 14, 0);
  k.geo(new THREE.ConeGeometry(0.46, 0.7, 14).rotateZ(-Math.PI / 2).translate(x + 1.15, y, z), M.white, 0.02, 0);
  k.geo(new THREE.CylinderGeometry(0.48, 0.48, 0.14, 14).rotateZ(Math.PI / 2).translate(x - 0.5, y, z), acc, 0, 0);
  k.geo(new THREE.CylinderGeometry(0.4, 0.46, 0.2, 14).rotateZ(Math.PI / 2).translate(x - 0.9, y, z), M.steelD, 0, 0);
}

export function massDriver(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const hw = W / 2;
  // the rail line: breech to muzzle, rising
  const A = V(-hw + 15.5, 1.9, -0.5), B = V(hw - 2.2, 11.6, -0.5);
  const dir = B.clone().sub(A).normalize(), len = A.distanceTo(B);
  const pitch = Math.atan2(B.y - A.y, B.x - A.x);
  const railAt = (s: number) => A.clone().addScaledVector(dir, s);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, pitch));
  const along = (g2: THREE.BufferGeometry, s: number, paint: string, kk = k) => {
    const p = railAt(s);
    kk.geo(g2.applyQuaternion(q).translate(p.x, p.y, p.z), paint, 0.03, 0);
  };
  // the guideway: a box girder with two rails and a cable tray
  along(new THREE.BoxGeometry(len, 0.7, 1.1).translate(0, -0.45, 0), len / 2, M.white2);
  along(new THREE.BoxGeometry(len, 0.14, 1.16).translate(0, -0.84, 0), len / 2, L.acc);
  for (const s of [-1, 1]) along(new THREE.BoxGeometry(len, 0.16, 0.14).translate(0, 0.0, s * 0.34), len / 2, M.steel);
  // coils every 1.6 along the rail (static rings, a glow ring each lit by the shot)
  const coilS: number[] = [];
  for (let s = 1.2; s < len - 0.6; s += 1.6) coilS.push(s);
  for (const s of coilS) along(new THREE.TorusGeometry(0.82, 0.15, 6, 18).rotateY(Math.PI / 2), s, s % 4.8 < 1.6 ? L.acc : '#8a8f98');
  const glowGeo = new THREE.TorusGeometry(0.72, 0.1, 4, 18).rotateY(Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, coilS.length);
  const m4 = new THREE.Matrix4();
  coilS.forEach((s, i) => { glow.setMatrixAt(i, m4.makeRotationFromQuaternion(q).setPosition(railAt(s))); glow.setColorAt(i, new THREE.Color(0, 0, 0)); });
  glow.frustumCulled = false;
  g.add(glow);
  // pylons: pairs of legs leaning in to the girder, footings on the regolith
  for (let s = 3; s < len - 1; s += 5.6) {
    const p = railAt(s);
    const top = p.y - 0.85;
    for (const sz of [-1, 1]) k.beam(V(p.x, 0.2, p.z + sz * 1.6), V(p.x, top, p.z + sz * 0.45), 0.3, M.steel);
    k.box(0.5, 0.3, 4.0, M.reg3, p.x, 0, p.z, { r: 0.05 });
    if (top > 4) k.box(0.2, 0.2, 2.0, M.steelD, p.x, top * 0.5, p.z, { r: 0 });
  }
  // the muzzle frame and its light
  const mz = railAt(len);
  for (const sz of [-1.8, 1.8]) k.box(0.5, mz.y + 3.0, 0.5, L.acc, mz.x + 0.6, 0, mz.z + sz, { r: 0.05 });
  k.box(0.6, 0.6, 4.2, L.dark, mz.x + 0.6, mz.y + 2.6, mz.z, { r: 0.05 });
  k.geo(new THREE.TorusGeometry(1.1, 0.24, 8, 24).rotateY(Math.PI / 2).applyQuaternion(q).translate(mz.x, mz.y, mz.z), L.acc, 0.02, 0);
  beacon(g, mz.x + 0.6, mz.y + 3.6, mz.z, 0.2);
  // ── the loading station at the breech ──
  const bx = -hw + 8.0, bz = -1.0;
  k.box(13.0, 5.6, 9.4, M.printed, bx, 0, bz, { r: 0.22, shade: 0.12 });
  for (let y = 0.5; y < 5.6; y += 0.45) k.box(13.04, 0.05, 9.44, M.printed2, bx, y, bz, { r: 0, jitter: 0, shade: 0 });
  k.box(13.1, 0.4, 9.5, L.acc, bx, 5.2, bz, { r: 0.03, shade: 0 });
  // capacitor banks on the roof in rows
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      k.box(1.6, 1.0, 2.2, j === 1 ? M.white : M.white2, bx - 4.6 + i * 1.85, 5.6, bz - 2.8 + j * 2.8, { r: 0.08 });
      k.box(1.62, 0.16, 2.22, L.acc, bx - 4.6 + i * 1.85, 6.3, bz - 2.8 + j * 2.8, { r: 0.02, shade: 0 });
    }
  // busbars from the banks along the rail
  for (const sz of [-0.9, 0.9]) k.beam(V(bx + 5.2, 6.0, bz + sz * 0.6), railAt(0.6).add(V(0, -0.6, sz * 0.7)), 0.18, '#b7a27a');
  // the breech: a hood where the rail leaves the building
  k.box(3.0, 3.0, 3.0, M.white, bx + 6.4, 0.6, A.z, { r: 0.2 });
  k.box(3.04, 0.3, 3.04, L.acc, bx + 6.4, 3.3, A.z, { r: 0.02, shade: 0 });
  k.box(0.2, 1.6, 1.8, '#2f2a3d', bx + 7.92, 1.1, A.z, { r: 0.02, shade: 0 });
  // windows, a dome on the side, radiators behind
  for (let i = 0; i < 5; i++) c.lit.box(0.8, 0.6, 0.1, M.glass, bx - 4.8 + i * 1.6, 2.6, bz + 4.72, { r: 0.04, jitter: 0 });
  printedDome(k, bx - 3.2, bz + 6.2, 2.6, 2.4);
  radiator(k, bx - 1, bz - 7.4, 5, 2.0, 2.6, 0);
  placard(g, L.name, Math.min(6, 0.6 * L.name.length + 1.2), bx + 1.6, 4.1, bz + 4.74, L.ink, L.acc);
  // capsules waiting in their rack at the front
  const rackK = new LiteKit(rng(o.seed + 3));
  for (let i = 0; i < 6; i++) capsule(rackK, L.acc, bx - 3.6 + (i % 3) * 2.4, 0.95 + Math.floor(i / 3) * 1.1, bz + 6.6);
  k.box(7.6, 0.2, 1.4, M.steelD, bx - 1.2, 0.4, bz + 6.6, { r: 0.02 });
  k.box(7.6, 0.2, 1.4, M.steelD, bx - 1.2, 1.5, bz + 6.6, { r: 0.02 });
  for (const x of [bx - 4.8, bx + 2.4]) k.box(0.2, 2.3, 1.4, M.steel, x, 0, bz + 6.6, { r: 0 });
  // a power line along the ground to the muzzle
  for (let x = bx + 8; x < hw - 2; x += 6) {
    k.box(0.1, 1.2, 0.1, M.steel, x, 0, 3.6, { r: 0, jitter: 0 });
  }
  k.beam(V(bx + 8, 1.15, 3.6), V(hw - 4, 1.15, 3.6), 0.05, '#433c52');
  floodMast(c, bx + 9.0, 6.0, 6, -0.4, 5);
  pressRover(k, c.lit, bx + 10.6, 7.0, Math.PI, L.acc);
  roverTracks(k, [[bx + 12.6, 7.0], [10, 8.2], [hw - 2, 7.4]], 1.9);
  astro(g, bx + 4.2, bz + 8.6, 0.3, o.seed + 1);
  astro(g, bx + 9.6, bz + 3.4, -1.0, o.seed + 2);
  // the travelling capsule, its streak, the muzzle flash
  const capK = new LiteKit(rng(o.seed + 4));
  capsule(capK, L.acc);
  const cap = capK.build();
  g.add(cap, rackK.build());
  const streakMat = coreMat('#9ff0e0', 1.6);
  streakMat.transparent = true;
  streakMat.blending = THREE.AdditiveBlending;
  streakMat.depthWrite = false;
  const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.04, 1, 8, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), streakMat);
  g.add(streak);
  const flash = halo([mz.clone()], [10], '#cff7ee', 0);
  const capGlow = halo([V(0, 0, 0)], [3], '#9ff0e0', 0);
  cap.add(capGlow.obj);
  g.add(flash.obj);
  const vExit = (2 * len) / ACCEL;
  const cyan = col('#5fd3b5'), tmp = new THREE.Color();
  c.anim.extra.push((e) => {
    const u = ((e.t + (o.seed % 7) * 0.37) % DRIVER_PERIOD + DRIVER_PERIOD) % DRIVER_PERIOD;
    let s = -2.4, speed = 0;
    if (u < LOAD) s = -2.4 + (u / LOAD) * 2.4;
    else if (u < LOAD + ACCEL) { const t = (u - LOAD) / ACCEL; s = len * t * t; speed = vExit * t; }
    else if (u < LOAD + ACCEL + FLY) { s = len + vExit * (u - LOAD - ACCEL); speed = vExit; }
    else s = 9999;
    cap.visible = s < len + 320;
    const p = railAt(Math.max(-2.4, s));
    cap.position.copy(p).add(V(0, 0.05, 0));
    cap.rotation.z = pitch;
    // the streak behind it
    const sl = Math.min(14, speed * 0.12);
    streak.visible = cap.visible && sl > 0.2;
    streak.position.copy(cap.position).addScaledVector(dir, -0.9);
    streak.rotation.z = pitch;
    streak.scale.set(sl, 1, 1);
    capGlow.set(speed > 0 ? 0.8 : 0);
    // the coils fire in a wave just behind the capsule
    coilS.forEach((cs, i) => {
      const d = s - cs;
      const on = u >= LOAD && u < LOAD + ACCEL && d > -0.8 ? Math.exp(-Math.max(0, d) / 3.0) : 0;
      const idle = 0.05 + 0.04 * Math.sin(e.t * 2 + i * 0.7);
      tmp.copy(cyan).multiplyScalar(idle + on * 4.0);
      glow.setColorAt(i, tmp);
    });
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    const tf = u - LOAD - ACCEL;
    flash.set(tf > 0 && tf < 0.5 ? Math.exp(-tf / 0.12) * 1.2 : 0);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: B.y + 4, update: c.update };
}
