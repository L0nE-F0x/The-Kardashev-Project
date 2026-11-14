/**
 * The propellant farm: a liquid-oxygen sphere and a methane sphere on braced legs (venting boil-off),
 * horizontal nitrogen bullets on saddles, two vertical tanks, a tall vent stack, a pipe rack running
 * off to the pad, a control hut and a fence. 'building' = spheres rising petal by petal (by `p`).
 */
import * as THREE from 'three';
import { Kit, lightPool, poolMat, rng, type Paint } from '../../../kit';
import { Plume } from '../../../fx';
import { crane, fence, fenceMesh, scaffold, siteClutter, type Env, type Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { lampMat, litGlass, litSign, People } from '../geneva/common';
import { beacon, fit } from '../geneva/secretariat';
import { sphereText, V } from './common';

const WHITE: Paint = '#f1ede6';
const STEEL: Paint = '#8a8490';

/** A sphere on legs with an equator girder and braces; `pp` = how much of it is built (from the bottom). */
function sphereTank(k: Kit, x: number, z: number, r: number, cy: number, legs: number, pp = 1) {
  const lr = r * 0.86;
  for (let i = 0; i < legs; i++) {
    const t = (i / legs) * Math.PI * 2 + 0.2;
    k.cyl(0.22, 0.26, cy, STEEL, x + Math.sin(t) * lr, 0, z + Math.cos(t) * lr, 8, { shade: 0.2 });
    k.box(0.7, 0.3, 0.7, '#a39a91', x + Math.sin(t) * lr, 0, z + Math.cos(t) * lr, { r: 0.04 });
    const t2 = ((i + 1) / legs) * Math.PI * 2 + 0.2;
    k.beam(V(x + Math.sin(t) * lr, 0.4, z + Math.cos(t) * lr), V(x + Math.sin(t2) * lr, cy * 0.55, z + Math.cos(t2) * lr), 0.08, '#9d95a6');
    k.beam(V(x + Math.sin(t2) * lr, 0.4, z + Math.cos(t2) * lr), V(x + Math.sin(t) * lr, cy * 0.55, z + Math.cos(t) * lr), 0.08, '#9d95a6');
  }
  if (pp <= 0) return;
  const th = Math.PI * Math.min(1, pp);
  k.geo(new THREE.SphereGeometry(r, 30, 18, 0, Math.PI * 2, Math.PI - th, th).translate(x, cy, z), WHITE, 0.02, 0.28);
  if (pp >= 0.5) k.geo(new THREE.TorusGeometry(r * 1.005, 0.2, 6, 40).rotateX(Math.PI / 2).translate(x, cy, z), '#c3bcc7', 0.02);
  if (pp >= 1) {
    k.cyl(0.5, 0.5, 0.5, '#9d95a6', x, cy + r - 0.1, z, 10);
    k.box(1.8, 0.12, 1.8, '#5b5562', x, cy + r + 0.35, z, { r: 0 });
    // a caged ladder up the side
    k.box(0.5, r * 1.6, 0.12, '#7a7186', x - r * 0.7, cy - r * 0.2, z + r * 0.72, { r: 0, ry: -0.78 });
  }
}

export function tankFarm(o: Act3SetOpts): Piece {
  const building = o.variant === 'building';
  const p = building ? Math.max(0, Math.min(1, o.p ?? 0)) : 1;
  const g = new THREE.Group();
  g.name = 'set:tankFarm';
  const k = new Kit(rng(o.seed));
  const accent = o.accent ?? '#df5f3e';
  const label = o.label || 'LAUNCH';
  // ground: a concrete apron under the tanks
  k.box(28.4, 0.12, 22.4, '#c9c1b6', 0, 0, 0, { r: 0.04, shade: 0 });
  for (let x = -13; x < 14; x += 3.6) k.box(0.05, 0.012, 22, '#b3a99c', x, 0.12, 0, { r: 0, jitter: 0, shade: 0 });
  // the spheres: LOX (big), CH4
  const LOX = { x: -7.4, z: -3.6, r: 4.6, cy: 6.4 }, CH4 = { x: 3.2, z: -5.0, r: 3.8, cy: 5.4 };
  const pp1 = building ? Math.min(1, p / 0.75) : 1, pp2 = building ? Math.max(0, (p - 0.5) / 0.5) : 1;
  sphereTank(k, LOX.x, LOX.z, LOX.r, LOX.cy, 8, pp1);
  sphereTank(k, CH4.x, CH4.z, CH4.r, CH4.cy, 6, pp2);
  if (!building) {
    const lox = sphereText('LOX', '#345c96', LOX.r + 0.02, 1.7, -0.25);
    lox.position.set(LOX.x, LOX.cy + 0.3, LOX.z);
    const ch4 = sphereText('CH4', '#df5f3e', CH4.r + 0.02, 1.4, -0.2);
    ch4.position.set(CH4.x, CH4.cy + 0.3, CH4.z);
    g.add(lox, ch4);
  }
  // nitrogen bullets on saddles
  const bullets = !building || p >= 0.5;
  if (bullets) for (const [z, len, x] of [[4.4, 12, 4.6], [7.9, 7.4, 3.0]] as const) {
    const y = 2.5, r = 1.3;
    k.geo(new THREE.CylinderGeometry(r, r, len, 22).rotateZ(Math.PI / 2).translate(x, y, z), WHITE, 0.02, 0.2);
    for (const s of [-1, 1]) k.geo(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI).rotateY(s < 0 ? Math.PI / 2 : -Math.PI / 2).translate(x + (s * len) / 2, y, z), WHITE, 0.02, 0.2);
    k.geo(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.5, 22).rotateZ(Math.PI / 2).translate(x - len / 2 + 1.4, y, z), 'yel0', 0);
    for (const dx of [-len * 0.32, len * 0.32]) k.box(1.0, 1.4, r * 2, '#a39a91', x + dx, 0.12, z, { r: 0.06 });
  }
  // vertical tanks with the builder's band
  if (!building || p >= 0.75) for (const [x, z, r, h] of [[10.8, -7.2, 1.8, 9], [13.0, -2.6, 1.3, 6.6]] as const) {
    k.cyl(r, r, h, WHITE, x, 0.12, z, 20, { shade: 0.2 });
    k.cyl(r + 0.01, r + 0.01, 0.6, accent, x, 0.12 + h * 0.72, z, 20, { shade: 0 });
    k.geo(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(x, 0.12 + h, z), WHITE, 0.02);
  }
  // the vent stack (boil-off burns or vents here), with guy wires
  const SX = -12.8, SZ = -9.6, SH = 15;
  if (!building || p >= 0.5) {
    k.cyl(0.32, 0.42, SH, '#c3bcc7', SX, 0, SZ, 10, { shade: 0.15 });
    for (let y = 2; y < SH; y += 3) k.cyl(0.44, 0.44, 0.4, y > SH - 4 ? accent : '#9d95a6', SX, y, SZ, 10, { shade: 0 });
    for (const [dx, dz] of [[3.5, 1.5], [-1.2, 3.6], [1.8, -2.0]] as const) k.beam(V(SX, SH * 0.8, SZ), V(SX + dx, 0.15, SZ + dz), 0.03, '#5b5562');
  }
  // the pipe rack off to the pad (west), drops from the spheres
  if (!building || p >= 0.75) {
    for (let x = -14; x <= 8.5; x += 3.2) {
      k.box(0.22, 2.6, 0.22, STEEL, x, 0.12, 1.8, { r: 0 });
      k.box(0.2, 0.2, 1.6, STEEL, x, 2.6, 1.8, { r: 0 });
    }
    for (const [dz, rr, c] of [[-0.5, 0.24, '#e6e0e3'], [0.05, 0.28, '#d8cfc3'], [0.55, 0.18, 'yel0']] as const) k.cyl(rr, rr, 23.4, c as Paint, 8.9, 2.8 + rr, 1.8 + dz, 10, { rz: Math.PI / 2 });
    for (const x of [-12, -6, 0, 6]) {
      k.cyl(0.3, 0.3, 0.3, '#345c96', x + 0.15, 2.8 + 0.24, 1.3, 10, { rz: Math.PI / 2 });
      k.cyl(0.34, 0.34, 0.3, '#df5f3e', x + 1.35, 2.8 + 0.28, 1.85, 10, { rz: Math.PI / 2 });
    }
    k.cyl(0.24, 0.24, 2.4, '#e6e0e3', LOX.x, 1.0, LOX.z + 2.6, 10);
    k.box(0.48, 0.48, 3.4, '#e6e0e3', LOX.x, 3.2, LOX.z + 4.2, { r: 0.1 });
    k.cyl(0.28, 0.28, 2.0, '#d8cfc3', CH4.x, 1.3, CH4.z + 2.2, 10);
    k.box(0.56, 0.56, 4.4, '#d8cfc3', CH4.x, 3.2, CH4.z + 4.6, { r: 0.1 });
  }
  // the control hut
  const win = new Kit(rng(o.seed + 3));
  k.box(4.4, 2.9, 3.0, '#e6e0e3', 10.6, 0.12, 9.2, { r: 0.12 });
  k.box(4.6, 0.25, 3.2, accent, 10.6, 3.0, 9.2, { r: 0.04 });
  k.box(0.9, 2.0, 0.08, '#5b5562', 9.1, 0.12, 10.72, { r: 0 });
  win.box(1.8, 0.9, 0.08, '#3c5f86', 11.4, 1.3, 10.72, { r: 0, jitter: 0.03 });
  k.box(1.1, 0.8, 0.6, '#b9c2c4', 12.2, 0.12, 10.9, { r: 0.06 });
  k.cyl(0.04, 0.05, 3.4, '#9d95a6', 12.2, 3.2, 8.4, 6);
  const hs = fit(litSign(label, 6, '#fbf7f0', null, 0.4), 3.6, 0.5);
  hs.position.set(10.6, 2.6, 10.73);
  g.add(hs);
  g.add(win.build(litGlass('yel1', 1.1)));
  // the fence, lamps at the corners
  // (a pedestrian gate at the control hut's door, which stands a step behind the fence)
  fence(k, 29.2, 23.2, 6, '#8a8490', [[8.3, 9.9]]);
  fenceMesh(g, 29.2, 23.2, 6, [[8.3, 9.9]]);
  const lamp = lampMat('yel1', 2.6);
  const pool = poolMat('#ffe2b0', 0.5);
  for (const [x, z] of [[-13.6, 10.6], [13.6, -10.6], [-1.6, 10.6]] as const) {
    k.box(0.16, 6, 0.16, '#5b5562', x, 0, z, { r: 0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4), lamp);
    m.position.set(x, 6, z);
    g.add(m);
    lightPool(g, x, 0.12, z - Math.sign(z) * 2, 4.6, pool);
  }
  // under construction: scaffold round the rising sphere, a crane
  let craneTop: THREE.Object3D | null = null;
  if (building) {
    const sc = scaffold(LOX.r * 2 + 1.6, Math.max(1.8, LOX.cy - LOX.r + LOX.r * 2 * pp1), LOX.r * 2 + 1.6, o.seed + 4);
    sc.position.set(LOX.x, 0, LOX.z);
    g.add(sc);
    const c = crane(20, 18, o.seed + 5);
    c.position.set(8.5, 0, -9.5);
    g.add(c);
    craneTop = c.userData.top as THREE.Object3D;
    g.add(siteClutter(28, 22, o.seed + 6));
    // curved petals waiting on the ground
    for (let i = 0; i < 3; i++) {
      k.geo(new THREE.SphereGeometry(4.6, 6, 3, i * 2.1, 0.8, 0, 0.42).translate(-1.2 + i * 2.6, -3.95, 7.6), '#a8a2ac', 0.04);
      k.box(0.3, 0.3, 2.2, '#7d5232', -1.2 + i * 2.6, 0.12, 8.6, { r: 0 });
    }
  } else {
    beacon(g, LOX.x, LOX.cy + LOX.r + 0.7, LOX.z, 0.5);
    beacon(g, SX, SH + 0.4, SZ, 1.8);
  }
  g.add(k.build());
  // boil-off: the LOX relief valve and the vent stack
  const vents: Plume[] = [];
  if (!building) {
    const v1 = new Plume({ count: 16, life: 4, rise: 0.6, spread: 0.7, size0: 0.8, size1: 3.6, opacity: 0.65, radius: 0.3, wind: 1.0 }, o.seed + 7);
    v1.obj.position.set(LOX.x, LOX.cy + LOX.r + 0.45, LOX.z);
    const v2 = new Plume({ count: 18, life: 5, rise: 0.9, spread: 0.9, size0: 0.9, size1: 4.5, opacity: 0.6, radius: 0.3, wind: 1.2 }, o.seed + 8);
    v2.obj.position.set(SX, SH + 0.1, SZ);
    vents.push(v1, v2);
    g.add(v1.obj, v2.obj);
  }
  const ppl = new People(0.12);
  ppl.walk([[-3.6, 10.4], [-12, 10.4], [-12, 2.5], [9.6, 2.5], [-12, 2.5], [-12, 10.4]], 'worker');
  if (building) ppl.stand(-1.5, 5.6, 2.4, 'worker');
  g.add(ppl.group);
  return {
    obj: g, w: 30, d: 24, h: building ? 21 : LOX.cy + LOX.r + 2,
    // the control hut's door (none while the farm is being built)
    doors: building ? undefined : [{ x: 9.1, z: 10.72 + 0.7 }],
    update(e: Env) {
      for (const [i, v] of vents.entries()) {
        v.strength = 0.6 + 0.4 * Math.sin(e.t * 0.3 + i * 2);
        v.update(e);
      }
      if (craneTop) craneTop.rotation.y = Math.sin(e.t * 0.24 + o.seed) * 1.1;
      ppl.update(e);
    },
  };
}
