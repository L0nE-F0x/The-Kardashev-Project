/**
 * Twistfield's stellarator: a long glass hall under a barrel vault (portal frames in Twistfield's
 * colours), and inside it the machine on its plinth — five field periods of lumpy, non-planar
 * modular coils round a violet plasma ribbon that twists as it goes (a rotating ellipse on a
 * helical axis) — then the cryoplant, the shared balance of plant and the control block.
 */
import * as THREE from 'three';
import type { Kit } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  arcTorus, balanceOfPlant, carPark, controlBlock, coreMat, cryoplant, Ctx, glowPool, halo, lampsAt, mixHex, P, plasmaGas, seeGlass, siteBase, TAU, V, ventStack,
} from './common';

const NP = 5;
interface Shape { R0: number; ex: number; e1: number; e2: number }
/** The magnetic axis and the plasma's rotating ellipse at toroidal angle phi. */
function frame(s: Shape, phi: number) {
  const R = s.R0 + s.ex * Math.cos(NP * phi), y = s.ex * Math.sin(NP * phi);
  return { R, y, al: (NP / 2) * phi };
}
/** A point on a surface round the axis: minor angle th, local radii (a, b) on the rotating frame. */
function onSurface(s: Shape, phi: number, th: number, a: number, b: number, dphi = 0) {
  const f = frame(s, phi);
  const u = a * Math.cos(th), v = b * Math.sin(th);
  const rr = f.R + u * Math.cos(f.al) - v * Math.sin(f.al);
  const yy = f.y + u * Math.sin(f.al) + v * Math.cos(f.al);
  const p = phi + dphi;
  return V(rr * Math.sin(p), yy, rr * Math.cos(p));
}

/** The stellarator at (x, y0, z): coils into k, the plasma (gas + its bright axis) returned. */
export function stellaratorMachine(k: Kit, x: number, y0: number, z: number, o: { R0: number; coil: string; acc: string; gas: THREE.Material; core: THREE.Material }) {
  const s: Shape = { R0: o.R0, ex: 0.34, e1: 0.95, e2: 0.42 };
  // the plasma ribbon
  const nP = 200, nT = 16;
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < nP; i++)
    for (let j = 0; j < nT; j++) {
      const p = onSurface(s, (i / nP) * TAU, (j / nT) * TAU, s.e1, s.e2);
      pos.push(p.x, p.y, p.z);
    }
  for (let i = 0; i < nP; i++)
    for (let j = 0; j < nT; j++) {
      const a = i * nT + j, b = ((i + 1) % nP) * nT + j, c = i * nT + ((j + 1) % nT), d = ((i + 1) % nP) * nT + ((j + 1) % nT);
      idx.push(a, b, c, b, d, c);
    }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setIndex(idx);
  pg.computeVertexNormals();
  pg.translate(x, y0, z);
  const plasma = new THREE.Group();
  const gas = new THREE.Mesh(pg, o.gas);
  gas.renderOrder = 4;
  const axis = new THREE.CatmullRomCurve3(Array.from({ length: 120 }, (_, i) => onSurface(s, (i / 120) * TAU, 0, 0, 0)), true);
  const core = new THREE.Mesh(new THREE.TubeGeometry(axis, 240, 0.1, 5, true).translate(x, y0, z), o.core);
  plasma.add(gas, core);
  // the modular coils: six per period, each its own lumpy, twisted loop
  const per = 6;
  let top = 0;
  for (let c = 0; c < NP * per; c++) {
    const u = (c % per) / per;
    const phi = ((c + 0.5) / (NP * per)) * TAU;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < 40; j++) {
      const th = (j / 40) * TAU;
      const f = frame(s, phi);
      const lump = 1 + 0.16 * Math.cos(2 * (th - 0.3)) + 0.07 * Math.cos(3 * th + u * TAU);
      const dphi = 0.075 * Math.sin(th + u * TAU * 0.8) + 0.03 * Math.sin(2 * th - f.al);
      const p = onSurface(s, phi, th, 1.85 * lump, 1.5 * lump, dphi);
      pts.push(p);
      top = Math.max(top, p.y);
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const paint = c % per === 0 ? o.acc : mixHex(o.coil, o.acc, 0.12 + 0.08 * (c % 2));
    k.geo(new THREE.TubeGeometry(curve, 56, 0.27, 5, true).translate(x, y0, z), paint, 0.03, 0);
  }
  // the support structure: an inboard ring and an outboard ring, ports, legs to the plinth
  k.geo(new THREE.TorusGeometry(o.R0 - 2.25, 0.34, 6, 60).rotateX(Math.PI / 2).translate(x, y0, z), '#5b5562', 0.02, 0);
  k.geo(arcTorus(o.R0 + 2.35, 0.22, 0, TAU, 6, 72).translate(x, y0 - 1.0, z), '#7a7186', 0.02, 0);
  for (let i = 0; i < NP * 2; i++) {
    const ph = ((i + 0.25) / (NP * 2)) * TAU;
    const r0 = o.R0 + 1.2, r1 = o.R0 + 2.7;
    k.geo(new THREE.CylinderGeometry(0.3, 0.3, r1 - r0, 8).rotateX(Math.PI / 2).translate(0, 0.1, (r0 + r1) / 2).rotateY(ph).translate(x, y0, z), '#c3c8cc', 0.03, 0);
    k.geo(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 8).rotateX(Math.PI / 2).translate(0, 0.1, r1).rotateY(ph).translate(x, y0, z), '#8a8f98', 0.02, 0);
    k.box(0.42, y0 - 2.2, 0.42, '#7a7186', x + Math.sin(ph) * (o.R0 + 0.2), 0.6, z + Math.cos(ph) * (o.R0 + 0.2), { r: 0.04 });
  }
  return { plasma, top: y0 + top + 0.3 };
}

export function stellaratorPlant(o: Act3SetOpts): Piece {
  const c = new Ctx(o);
  const { k, g, L, W, D } = c;
  siteBase(c, 3.5, 7.4);
  k.box(3.4, 0.06, D - 6, P.asphalt, 3.5, 0.02, 1.2, { r: 0.03, shade: 0, jitter: 0.02 });
  // ── the glass hall ──
  const hx = -9.8, hz = -5.4, hw = 21.6, hd = 17.6, wallH = 7.4, base = 2.0;
  const x0 = hx - hw / 2, x1 = hx + hw / 2, z0 = hz - hd / 2, z1 = hz + hd / 2;
  const wall = '#e2dcd2';
  k.box(hw + 0.8, 0.5, hd + 0.8, P.concrete2, hx, 0, hz, { r: 0.08 });
  for (const [bx, bz, bw, bd] of [[hx, z0, hw, 0.5], [hx, z1, hw, 0.5], [x0, hz, 0.5, hd], [x1, hz, 0.5, hd]] as [number, number, number, number][]) k.box(bw, base - 0.4, bd, wall, bx, 0.45, bz, { r: 0.08, shade: 0.12 });
  // the doors on the front
  k.box(0.3, 4.4, 4.2, mixHex(wall, '#5b5562', 0.25), x1 + 0.15, 0.45, hz + 3.6, { r: 0.05 });
  k.box(0.5, 0.4, 4.6, L.acc, x1 + 0.2, 4.85, hz + 3.6, { r: 0.04 });
  // portal frames: columns up the walls and arches over the vault, in the builder's colour
  const rise = 3.2, half = hd / 2, Ra = (half * half + rise * rise) / (2 * rise), th = Math.asin(half / Ra), yc = wallH + rise - Ra;
  const bays = 8;
  for (let i = 0; i <= bays; i++) {
    const fx = x0 + (i * hw) / bays;
    for (const fz of [z0, z1]) k.box(0.32, wallH - base + 0.4, 0.4, L.acc, fx, base, fz, { r: 0.04, shade: 0.05 });
    let prev = V(fx, yc + Ra * Math.cos(th), z0);
    for (let s = 1; s <= 10; s++) {
      const t = -th + (2 * th * s) / 10;
      const q = V(fx, yc + Ra * Math.cos(t), hz + Ra * Math.sin(t));
      k.beam(prev, q, 0.3, L.acc);
      prev = q;
    }
  }
  for (const fz of [z0, z1]) k.box(hw + 0.3, 0.4, 0.5, L.dark, hx, wallH, fz, { r: 0.04, shade: 0 });
  for (const fx of [x0, x1]) k.box(0.5, 0.4, hd, L.dark, fx, wallH, hz, { r: 0.04, shade: 0 });
  // purlins along the vault, mullions in the walls
  for (const t of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const a = t * th;
    k.box(hw, 0.12, 0.14, '#5b5562', hx, yc + Ra * Math.cos(a), hz + Ra * Math.sin(a), { r: 0, jitter: 0, shade: 0 });
  }
  for (let i = 0; i < bays * 2; i++) {
    const fx = x0 + ((i + 0.5) * hw) / (bays * 2);
    for (const fz of [z0, z1]) k.box(0.1, wallH - base, 0.12, '#5b5562', fx, base, fz, { r: 0, jitter: 0, shade: 0 });
  }
  for (const fz of [z0, z1]) k.box(hw, 0.1, 0.12, '#5b5562', hx, 4.7, fz, { r: 0, jitter: 0, shade: 0 });
  // the glass: walls, the vault, the gable ends
  const glassParts: THREE.BufferGeometry[] = [];
  glassParts.push(new THREE.PlaneGeometry(hw, wallH - base).translate(hx, (wallH + base) / 2, z1), new THREE.PlaneGeometry(hw, wallH - base).translate(hx, (wallH + base) / 2, z0));
  for (const fx of [x0, x1]) glassParts.push(new THREE.PlaneGeometry(hd, wallH - base).rotateY(Math.PI / 2).translate(fx, (wallH + base) / 2, hz));
  glassParts.push(new THREE.CylinderGeometry(Ra, Ra, hw, 24, 1, true, Math.PI / 2 - th, 2 * th).rotateZ(Math.PI / 2).translate(hx, yc, hz));
  const seg = new THREE.Shape();
  seg.moveTo(-half, wallH);
  for (let s = 0; s <= 12; s++) {
    const t = -th + (2 * th * s) / 12;
    seg.lineTo(Ra * Math.sin(t), yc + Ra * Math.cos(t));
  }
  seg.closePath();
  for (const fx of [x0, x1]) glassParts.push(new THREE.ShapeGeometry(seg).rotateY(Math.PI / 2).translate(fx, 0, hz));
  for (const gp of glassParts) {
    const m = new THREE.Mesh(gp, seeGlass);
    m.renderOrder = 3;
    g.add(m);
  }
  // inside: the floor, a bridge crane on rails along the walls
  k.box(hw - 0.4, 0.1, hd - 0.4, '#a39b90', hx, 0.45, hz, { r: 0, shade: 0, jitter: 0.02 });
  for (const fz of [z0 + 0.6, z1 - 0.6]) k.box(hw - 0.6, 0.3, 0.3, P.steelDark, hx, wallH - 0.9, fz, { r: 0.02 });
  k.box(0.8, 0.6, hd - 1.0, 'yel0', x0 + 1.3, wallH - 0.7, hz, { r: 0.05 });
  k.box(1.1, 0.8, 1.1, P.steelDark, x0 + 1.3, wallH - 1.4, hz + 2.0, { r: 0.06 });
  // ── the machine ──
  const gas = plasmaGas('#d08fdc', 1.3, 0.16);
  const core = coreMat('#f3dcff', 1.7);
  const mx = hx + 0.6, mz = hz + 0.2, my = 4.1;
  k.cyl(7.9, 8.1, 0.9, '#c4bbae', mx, 0.45, mz, 48, { shade: 0.12 });
  k.geo(arcTorus(8.0, 0.12, 0, TAU, 4, 72).translate(mx, 1.38, mz), P.safety, 0, 0);
  const m = stellaratorMachine(k, mx, my, mz, { R0: 5.0, coil: '#cfcad6', acc: L.acc, gas: gas.mat, core });
  g.add(m.plasma);
  const hl = halo([0, 1.3, 2.5, 3.8, 5.0].map((a) => V(mx + Math.sin(a) * 5, my, mz + Math.cos(a) * 5)), [5, 5, 5, 5, 5], '#d08fdc', 0.3);
  g.add(hl.obj);
  glowPool(c, hx, z1 + 2.5, 9, '#d08fdc', 0.42, 1.8);
  // ── round it ──
  cryoplant(c, -19.8, 7.4);
  ventStack(c, 1.6, -15.2, 17);
  const bop = balanceOfPlant(c);
  controlBlock(c, -12.6, 12.8, 9.0, 4.4, 4.8);
  carPark(c, -3.0, 14.0, 4);
  lampsAt(c, [[-1.0, 8.6, -1], [6.4, -3.6, 1], [-21.0, -6, 1]]);
  c.anim.extra.push((e) => {
    const flick = 1 + Math.sin(e.t * 2.3) * 0.05 + Math.sin(e.t * 8.7) * 0.03;
    gas.set((1.25 + e.night * 1.3) * flick);
    hl.set((0.18 + e.night * 0.4) * flick);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: Math.max(wallH + rise + 0.4, bop, 17.8), update: c.update, ground: () => null };
}
