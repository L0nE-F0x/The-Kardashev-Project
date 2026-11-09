/**
 * A rival AI lab's campus on your site: one big hall per plot in the owner's colours, a logo on each
 * façade (Meridian's globe, Lattice's 3×3 grid, Orchard's apple), the name, rooftop chillers, a
 * generator row, and at the gate a gatehouse, a flag and a logo pylon behind their own fence.
 * `o.w`/`o.d` are the merged plots (28 × 26 per plot, two rows deep), `o.variant` the number of plots.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, rng, type Paint } from '../../kit';
import { fence, fenceMesh } from '../../pieces';
import { parkedCars } from '../life';
import type { SetPieceFactory } from '../registry';
import { block, carPark, Fans, Flag, Lit, curtain, P, putSign, shrubs, signPanel, wallLights } from './common';

interface RivalLook { name: string; ramp: [Paint, Paint, Paint, Paint]; light: Paint; wall: Paint; roof: Paint }
const LOOKS: Record<string, RivalLook> = {
  meridian: { name: 'MERIDIAN', ramp: ['#64172a', '#93243a', '#c23a3f', '#df5f3e'], light: '#f08a46', wall: '#e8ded6', roof: '#5b4650' },
  lattice: { name: 'LATTICE', ramp: ['#3b1d5e', '#592d85', '#7e43a8', '#a862c4'], light: '#d08fdc', wall: '#dedae6', roof: '#4b4560' },
  orchard: { name: 'ORCHARD', ramp: ['#1f4a2e', '#2c6233', '#5a9537', '#7dae3f'], light: '#a6c751', wall: '#e0e4d6', roof: '#4a5248' },
};

/** The owner's mark as a small 3D badge facing +z, about `s` across, centred at (x, y, z). */
function logo(k: Kit, owner: string, L: RivalLook, x: number, y: number, z: number, s: number) {
  if (owner === 'meridian') {
    // a globe with a meridian
    k.geo(new THREE.SphereGeometry(s * 0.42, 18, 12).translate(x, y, z), L.ramp[2], 0.02);
    k.geo(new THREE.TorusGeometry(s * 0.44, s * 0.045, 6, 28).translate(x, y, z), L.light, 0);
    k.geo(new THREE.TorusGeometry(s * 0.44, s * 0.04, 6, 28).rotateY(Math.PI / 2).translate(x, y, z), L.light, 0);
    k.geo(new THREE.TorusGeometry(s * 0.43, s * 0.035, 6, 28).rotateX(Math.PI / 2).translate(x, y, z), '#fbf7f0', 0);
  } else if (owner === 'lattice') {
    // a 3×3 lattice of blocks
    const c = s * 0.3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      k.box(c * 0.82, c * 0.82, c * 0.6, (i + j) % 2 ? L.light : L.ramp[2], x + (i - 1) * c, y - c * 1.4 + j * c, z, { r: c * 0.12, shade: 0, jitter: 0.02 });
  } else {
    // an apple with a leaf
    const r = s * 0.4;
    k.geo(new THREE.SphereGeometry(r, 18, 12).scale(1.05, 0.95, 0.8).translate(x, y - r * 0.05, z), L.ramp[2], 0.02);
    k.geo(new THREE.SphereGeometry(r * 0.22, 10, 8).scale(1, 0.6, 1).translate(x, y + r * 0.85, z + r * 0.1), L.ramp[0], 0);
    k.geo(new THREE.CylinderGeometry(r * 0.06, r * 0.08, r * 0.5, 6).rotateZ(-0.3).translate(x + r * 0.08, y + r * 1.0, z), '#5c3a26', 0);
    k.geo(new THREE.SphereGeometry(r * 0.32, 10, 6).scale(1.4, 0.35, 0.7).rotateZ(0.5).translate(x + r * 0.42, y + r * 1.05, z), L.light, 0);
  }
}

/** One of the rival's halls on a 28 × 26 plot. */
function rivalHall(g: THREE.Group, k: Kit, fans: Fans, lit: Lit, band: Kit, owner: string, L: RivalLook, cx: number, cz: number, big: boolean, front: boolean) {
  const W = 22.5, D = 12.5, H = big ? 10 : 7.6, z = cz - 2.6;
  block(k, cx, z, W, D, H, { wall: L.wall, roof: L.roof, edge: L.ramp[0], band: L.ramp[2], bandH: 0.7, ribs: 1.2, r: 0.25, faces: ['f', 'b', 'l', 'r'] });
  if (big) k.box(W + 0.06, 0.32, D + 0.06, L.ramp[1], cx, H / 2, z, { r: 0.04, shade: 0 });
  // corner fins in the owner's colour, a trim line under the band
  for (const sx of [-W / 2, W / 2]) k.box(0.7, H - 0.6, 0.7, L.ramp[1], cx + sx, 0.4, z + D / 2, { r: 0.1, shade: 0.1 });
  k.box(W + 0.1, 0.16, D + 0.1, L.light, cx, H - 1.5, z, { r: 0.02, shade: 0 });
  // the lit clerestory band
  band.box(W - 2, 0.32, 0.04, '#ffffff', cx, H - 2.4, z + D / 2 + 0.08, { r: 0, jitter: 0, shade: 0 });
  band.box(W - 2, 0.32, 0.04, '#ffffff', cx, H - 2.4, z - D / 2 - 0.08, { r: 0, jitter: 0, shade: 0 });
  // the mark and the name on the façade
  logo(k, owner, L, cx + W / 2 - 3.4, H - 3.9, z + D / 2 + 0.55, 2.6);
  if (front) {
    signPanel(g, k, L.name, 11, 1.25, cx - 2.6, H - 3.2, z + D / 2 + 0.04, L.ramp[1]);
  }
  // the entrance block and canopy at the front-left
  const ex = cx - W / 2 + 3.4;
  k.box(4.6, 3.7, 2.4, '#efe8de', ex, 0.4, z + D / 2 + 1.1, { r: 0.15 });
  k.box(5.2, 0.32, 3.4, L.ramp[2], ex, 3.5, z + D / 2 + 1.5, { r: 0.08, shade: 0 });
  curtain(k, lit, ex, 0.5, z + D / 2 + 2.32, 3.8, 2.8, { bay: 1.25, floor: 2.8, glass: '#3f6f80', litFrac: 1 });
  // docks on the right
  for (const x of [cx + W / 2 - 3, cx + W / 2 - 6.2]) {
    k.box(2.6, 2.9, 0.12, '#8a8490', x, 0.5, z + D / 2 + 0.08, { r: 0.02 });
    for (let y = 0.8; y < 3.3; y += 0.3) k.box(2.5, 0.04, 0.05, '#7a7186', x, y, z + D / 2 + 0.16, { r: 0, jitter: 0 });
  }
  // rooftop chillers
  const rows = big ? 3 : 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < 6; c++) {
      const x = cx - W / 2 + 2.4 + c * 3.5, zz = z - D / 2 + 2.8 + r * ((D - 5.6) / Math.max(1, rows - 1));
      k.box(2.9, 1.05, 2.3, P.plant, x, H, zz, { r: 0.1, jitter: 0.03 });
      k.box(2.96, 0.16, 2.36, L.ramp[1], x, H + 0.02, zz, { r: 0, shade: 0 });
      fans.add(x - 0.7, H + 1.15, zz, 0.56);
      fans.add(x + 0.7, H + 1.15, zz, 0.56);
    }
  // generators along the back
  for (let i = 0; i < 5; i++) {
    const x = cx - W / 2 + 2.6 + i * 4.3;
    k.box(3.5, 1.7, 1.6, '#e7dfd2', x, 0, z - D / 2 - 2.2, { r: 0.12 });
    k.box(3.52, 0.32, 1.62, L.ramp[2], x, 0, z - D / 2 - 2.2, { r: 0.05, shade: 0 });
    k.cyl(0.13, 0.13, 0.9, '#5b5562', x + 1.1, 1.7, z - D / 2 - 2.5, 6);
  }
  return H;
}

const rival: SetPieceFactory = (o) => {
  const owner = LOOKS[o.brand] ? o.brand : 'meridian';
  const L = LOOKS[owner];
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.1);
  const bandK = new Kit();
  const n = Math.max(1, parseInt(o.variant ?? '1', 10) || 1);
  const w = o.w, d = o.d;
  const cols = Math.max(1, Math.round((w + 4) / 32));
  const rows = d > 34 ? 2 : 1;
  const cw = (w + 4) / cols - 4, ch = rows > 1 ? (d - 2) / 2 : d;
  let H = 7.6;
  const cells: { x: number; z: number; front: boolean }[] = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + c * (cw + 4) + cw / 2;
      const z = rows > 1 ? (r === 0 ? d / 2 - ch / 2 : -d / 2 + ch / 2) : 0;
      cells.push({ x, z, front: r === 0 });
    }
  const big = n >= 3;
  cells.forEach((c, i) => {
    if (i < n) H = Math.max(H, rivalHall(g, k, fans, lit, bandK, owner, L, c.x, c.z, big, c.front || rows === 1));
    else {
      // a spare plot: a car park and a transformer yard
      carPark(k, c.x, c.z + 2, cw - 6, 8);
      parkedCars(g, c.x - cw / 2 + 4, c.z + 2.4, 9, 2.3, o.seed + i * 7, Math.PI / 2);
      for (let t = 0; t < 3; t++) k.box(2.2, 2.0, 1.8, '#8a8f80', c.x - 3 + t * 3, 0.12, c.z - 7, { r: 0.08 });
    }
  });
  // the gate mid-front: gatehouse with a barrier, the flag, the logo pylon
  const gx = 0, gz = d / 2 - 0.4;
  k.box(2.6, 2.6, 2.2, '#efe8de', gx - 4.6, 0.12, gz - 1.8, { r: 0.12 });
  k.box(3.0, 0.24, 2.6, L.ramp[2], gx - 4.6, 2.72, gz - 1.8, { r: 0.05, shade: 0 });
  lit.pane(1.6, 0.9, gx - 4.6, 1.2, gz - 0.68);
  k.box(1.8, 1.0, 0.06, '#3f6f80', gx - 4.6, 1.15, gz - 0.69, { r: 0, jitter: 0 });
  k.box(0.3, 1.0, 0.3, '#5b5562', gx - 2.9, 0.12, gz - 0.2, { r: 0.04 });
  k.box(5.0, 0.12, 0.12, '#f4f0e8', gx - 0.3, 1.0, gz - 0.2, { r: 0, jitter: 0 });
  for (let i = 0; i < 4; i++) k.box(0.55, 0.13, 0.14, L.ramp[2], gx - 2.0 + i * 1.25, 1.0, gz - 0.2, { r: 0, jitter: 0 });
  const flag = new Flag(k, gx + 4.6, gz - 1.0, 8.5, [L.ramp[1], L.ramp[2], L.light], { w: 2.8, fh: 1.6, rows: true });
  g.add(flag.obj);
  // a logo pylon: a tall slab with the mark and the name
  const lx = gx + 8.8, lz = gz - 1.1;
  k.box(2.6, 5.2, 0.8, L.ramp[1], lx, 0.12, lz, { r: 0.15 });
  k.box(2.7, 0.4, 0.9, L.ramp[0], lx, 0.12, lz, { r: 0.08 });
  logo(k, owner, L, lx, 3.5, lz + 0.62, 1.7);
  putSign(g, L.name, 2.2, lx, 1.4, lz + 0.42, '#fbf7f0', null, 0, true, 0.4);
  shrubs(k, [[lx - 2.2, lz + 0.5, 0.8], [lx + 2.2, lz + 0.4, 0.8]]);
  // the fence round it all, with the gate gap mid-front
  const fw = w - 0.8, fd = d - 0.8;
  const fk = new Kit(rng(o.seed + 9));
  fence(fk, fw, fd, 6, '#7a7186');
  g.add(fk.build());
  fenceMesh(g, fw, fd, 6);
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  const bandMat = glowMat(L.light, 0);
  bandMat.userData.manual = true;
  bandMat.color.copy(col(L.light));
  const bm = bandK.build(bandMat);
  bm.castShadow = false;
  g.add(bm);
  wallLights(g, cells.slice(0, n).map((c) => [c.x - 22.5 / 2 + 3.4, 3.2, c.z - 2.6 + 12.5 / 2 + 2.3] as [number, number, number]), 2.4, 3.4);
  return {
    obj: g, w, d, h: H + 2.4,
    update(e) {
      fans.update(e);
      flag.update(e);
      bandMat.emissiveIntensity = 0.35 + e.night * 1.4;
    },
  };
};

export const RIVAL_PIECES = { rival };
