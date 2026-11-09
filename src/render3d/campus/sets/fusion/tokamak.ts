/**
 * Sunforge's compact tokamak: a round reactor hall with a glazed front, and inside it the machine
 * itself — the D-shaped vacuum vessel cut away towards the glass so the pink plasma ring shows,
 * sixteen D-shaped field coils, the central solenoid and the poloidal rings — then the cryoplant
 * for the superconducting magnets, the magnet power supplies, a vent stack and the shared balance
 * of plant (turbine hall, cooling cells, switchyard, control block).
 */
import * as THREE from 'three';
import type { Kit } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { skyMat } from '../../plants2/parts';
import {
  arcBand, arcTorus, balanceOfPlant, carPark, controlBlock, cryoplant, Ctx, glowPool, halo, inward, lampsAt, mixHex, P,
  ringWall, seeGlass, shed, siteBase, TAU, V, ventStack, plasmaGas, coreMat,
} from './common';

/** A D-shaped (Miller) poloidal profile, counter-clockwise in (r, y): radius R0, minor a, elongation κ, triangularity δ. */
export function dProfile(R0: number, a: number, kap: number, del: number, n = 28) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TAU;
    pts.push(new THREE.Vector2(R0 + a * Math.cos(t + del * Math.sin(t)), kap * a * Math.sin(t)));
  }
  pts[n] = pts[0].clone();
  return pts;
}
/** The cut face of a shell between two D profiles, at toroidal angle phi (end = facing +phi). */
function dCap(outer: THREE.Vector2[], inner: THREE.Vector2[], phi: number, end: boolean) {
  const sg = end ? -1 : 1;
  const s = new THREE.Shape(outer.map((p) => new THREE.Vector2(sg * p.x, p.y)));
  s.holes.push(new THREE.Path(inner.map((p) => new THREE.Vector2(sg * p.x, p.y)).reverse()));
  const g = new THREE.ShapeGeometry(s, 1);
  g.rotateY(end ? phi + Math.PI / 2 : phi - Math.PI / 2);
  return g;
}

/**
 * The tokamak at (x, y0, z): vessel centre height y0, cut open over aCut ± cutHalf. Paint into k,
 * returns the plasma mesh (its own glowing material) and the coil top.
 */
export function tokamakMachine(k: Kit, x: number, y0: number, z: number, o: { R0: number; a: number; aCut: number; cutHalf: number; coil: string; acc: string; plasma: THREE.Material; core: THREE.Material }) {
  const { R0, a, aCut, cutHalf } = o;
  const kap = 1.55, del = 0.38;
  const outer = dProfile(R0, a, kap, del), inner = dProfile(R0, a - 0.3, kap * 1.01, del);
  const a0 = aCut + cutHalf, a1 = aCut - cutHalf + TAU;
  // the vacuum vessel: outer skin, the dark first wall inside, the cut faces
  k.geo(new THREE.LatheGeometry(outer, 40, a0, a1 - a0).translate(x, y0, z), '#aeb4ba', 0.03, 0);
  k.geo(inward(new THREE.LatheGeometry(inner, 40, a0, a1 - a0)).translate(x, y0, z), '#4a4452', 0.04, 0);
  k.geo(dCap(outer, inner, a0, false).translate(x, y0, z), '#d6d9dc', 0.02, 0);
  k.geo(dCap(outer, inner, a1, true).translate(x, y0, z), '#d6d9dc', 0.02, 0);
  // divertor cassettes along the floor of the open wedge (dark tiles)
  for (let i = -3; i <= 3; i++) {
    const ph = aCut + (i / 3) * cutHalf * 0.85;
    const rr = R0 - 0.2;
    k.box(0.5, 0.22, 0.9, '#3a3442', x + Math.sin(ph) * rr, y0 - kap * (a - 0.3) * 0.86, z + Math.cos(ph) * rr, { r: 0.03, ry: ph, shade: 0 });
  }
  // the plasma: a glowing D ring of gas with a bright core, whole (seen through the cut)
  const plasma = new THREE.Group();
  const gas = new THREE.Mesh(new THREE.LatheGeometry(dProfile(R0 + 0.05, a * 0.58, 1.62, 0.32, 24), 64).translate(x, y0, z), o.plasma);
  gas.renderOrder = 4;
  const core = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.1, 0.13, 6, 72).rotateX(Math.PI / 2).translate(x, y0, z), o.core);
  plasma.add(gas, core);
  // toroidal field coils (D-shaped, chunky), leaving the cut open
  const ac = a + 0.95, kc = 1.36, dc = 0.42;
  let top = 0;
  for (let i = 0; i < 16; i++) {
    const ph = ((i + 0.5) / 16) * TAU + aCut;
    const d = Math.abs(((ph - aCut + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (d < cutHalf * 0.9) continue;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 26; j++) {
      const t = (j / 26) * TAU;
      const r = R0 + ac * Math.cos(t + dc * Math.sin(t));
      const yy = y0 + kc * ac * Math.sin(t);
      pts.push(V(x + Math.sin(ph) * r, yy, z + Math.cos(ph) * r));
      top = Math.max(top, yy);
    }
    for (let j = 0; j < 26; j++) k.beam(pts[j], pts[j + 1], 0.66, j % 13 === 6 ? o.acc : o.coil);
    // an outboard port between this coil and the next
    const pp = ph + TAU / 32;
    const pd = Math.abs(((pp - aCut + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (pd > cutHalf + 0.15) {
      const r0 = R0 + a - 0.1, r1 = R0 + ac + 0.9;
      const g = new THREE.CylinderGeometry(0.42, 0.42, r1 - r0, 10).rotateX(Math.PI / 2).translate(0, 0, (r0 + r1) / 2).rotateY(pp).translate(x, y0, z);
      k.geo(g, '#c3c8cc', 0.03, 0);
      k.geo(new THREE.CylinderGeometry(0.58, 0.58, 0.16, 10).rotateX(Math.PI / 2).translate(0, 0, r1).rotateY(pp).translate(x, y0, z), mixHex(o.coil, '#433c52', 0.3), 0.02, 0);
      if (i % 3 === 0) k.box(0.8, 0.7, 0.6, '#8a8f98', x + Math.sin(pp) * (r1 + 0.4), y0 - 0.35, z + Math.cos(pp) * (r1 + 0.4), { r: 0.06, ry: pp });
    }
  }
  // central solenoid and poloidal field rings (cut too)
  k.cyl(0.95, 0.95, kc * ac * 2 + 0.6, '#b7a27a', x, y0 - kc * ac - 0.3, z, 16, { shade: 0.05 });
  k.cyl(1.0, 1.0, 0.24, o.acc, x, y0 + kc * ac - 0.6, z, 16, { shade: 0 });
  for (const [rr, yy, tt] of [[R0 + ac + 0.55, 2.1, 0.32], [R0 + ac + 0.55, -2.1, 0.32], [R0 - 0.4, kc * ac + 0.25, 0.36], [R0 - 0.4, -kc * ac - 0.25, 0.36]] as [number, number, number][]) {
    k.geo(arcTorus(rr, tt, aCut + cutHalf * 0.9, aCut - cutHalf * 0.9 + TAU, 6, 56).translate(x, y0 + yy, z), '#9aa0a8', 0.02, 0);
  }
  // the support legs under the lower ring
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * TAU + 0.2;
    k.box(0.5, y0 - kc * ac - 0.2 - 1.6, 0.5, '#7a7186', x + Math.sin(ph) * (R0 + 0.6), 1.6, z + Math.cos(ph) * (R0 + 0.6), { r: 0.04 });
  }
  return { plasma, top: top + 0.4 };
}

export function tokamakPlant(o: Act3SetOpts): Piece {
  const c = new Ctx(o);
  const { k, g, L, W, D } = c;
  siteBase(c, 3.5, 7.4);
  // the inside road past the reactor hall
  k.box(3.4, 0.06, D - 6, P.asphalt, 3.5, 0.02, 1.2, { r: 0.03, shade: 0, jitter: 0.02 });
  // ── the reactor hall ──
  const hx = -8, hz = -4.4, R = 9.3, T = 0.55;
  const aG = -0.22, gH = 1.02;
  const wall = '#ddd6cc';
  k.cyl(R + 0.55, R + 0.7, 0.5, P.concrete2, hx, 0, hz, 56, { shade: 0.1 });
  k.geo(ringWall(R, R - T, 0.5, 1.9, 0, TAU, 64).translate(hx, 0, hz), mixHex(wall, '#8f877c', 0.12), 0.03, 0.12);
  k.geo(ringWall(R, R - T, 2.4, 7.5, aG + gH, aG - gH + TAU, 64).translate(hx, 0, hz), wall, 0.03, 0.04);
  k.geo(ringWall(R + 0.06, R - T, 9.9, 1.5, 0, TAU, 64).translate(hx, 0, hz), '#e6e0d6', 0.02, 0);
  k.geo(arcBand(R + 0.1, 10.35, 0.5, 0, TAU, 64).translate(hx, 0, hz), L.acc, 0.02, 0);
  k.geo(arcBand(R + 0.08, 2.3, 0.14, 0, TAU, 64).translate(hx, 0, hz), mixHex(wall, '#5b5562', 0.35), 0.02, 0);
  // pilasters round the solid wall, mullions and transoms in the glass
  for (let a = aG + gH + 0.2; a < aG - gH + TAU - 0.1; a += 0.34) k.box(0.55, 7.6, 0.24, mixHex(wall, '#7a7186', 0.1), hx + Math.sin(a) * (R + 0.05), 2.35, hz + Math.cos(a) * (R + 0.05), { r: 0.05, ry: a, shade: 0.06 });
  for (let i = 0; i <= 12; i++) {
    const a = aG - gH + (i / 12) * 2 * gH;
    k.box(i % 6 === 0 ? 0.4 : 0.16, 7.5, 0.36, i % 6 === 0 ? mixHex(wall, '#7a7186', 0.15) : '#5b5562', hx + Math.sin(a) * (R - T / 2), 2.4, hz + Math.cos(a) * (R - T / 2), { r: 0.02, ry: a, shade: 0 });
  }
  for (const y of [4.9, 7.4]) k.geo(arcTorus(R - T / 2, 0.08, aG - gH, aG + gH, 4, 40).translate(hx, y, hz), '#5b5562', 0, 0);
  const glass = new THREE.Mesh(arcBand(R - T / 2, 2.4, 7.5, aG - gH, aG + gH, 64).translate(hx, 0, hz), seeGlass);
  glass.renderOrder = 3;
  g.add(glass);
  // the domed roof in hand-painted slices, a lantern at the crown, the inside of the roof
  const rise = 2.8, Rs = (R * R + rise * rise) / (2 * rise), th = Math.asin(R / Rs), yTop = 11.4;
  for (let s = 0; s < 12; s++) {
    const geo = new THREE.SphereGeometry(Rs, 4, 8, (s / 12) * TAU, TAU / 12, 0, th).translate(hx, yTop + rise - Rs, hz);
    k.geo(geo, mixHex('#d3cdc5', '#8f877c', 0.06 + 0.1 * ((s * 7) % 3) / 2), 0.03, 0);
  }
  k.geo(inward(new THREE.SphereGeometry(Rs - 0.3, 32, 6, 0, TAU, 0, th)).translate(hx, yTop - 0.3 + rise - Rs, hz), '#6a6474', 0.02, 0);
  k.cyl(1.6, 1.7, 1.0, '#e6e0d6', hx, yTop + rise - 0.15, hz, 16, { shade: 0.06 });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.5, 16, 1, true).translate(hx, yTop + rise + 0.45, hz), skyMat);
  g.add(lantern);
  k.cyl(1.9, 1.9, 0.22, P.roof, hx, yTop + rise + 0.85, hz, 16, { shade: 0 });
  // the floor inside, a polar crane on its ring
  k.cyl(R - T, R - T, 0.12, '#9d958a', hx, 0.5, hz, 48, { shade: 0 });
  k.geo(arcTorus(R - T - 0.25, 0.16, 0, TAU, 4, 64).translate(hx, 9.5, hz), P.steel, 0, 0);
  k.box(2 * (R - T) - 0.5, 0.6, 0.7, 'yel0', hx, 9.3, hz - 1.2, { r: 0.05, ry: 0.5 });
  k.box(1.2, 0.9, 1.2, P.steelDark, hx + Math.cos(0.5) * 1.6, 8.5, hz - 1.2 - Math.sin(0.5) * 1.6, { r: 0.06 });
  // ── the machine ──
  const gas = plasmaGas('#e86aa0', 1.4, 0.18);
  const core = coreMat('#fde3ee', 1.6);
  const m = tokamakMachine(k, hx, 5.5, hz, { R0: 3.9, a: 1.7, aCut: aG, cutHalf: 0.85, coil: '#c9cdd1', acc: L.acc, plasma: gas.mat, core });
  k.cyl(6.1, 6.3, 1.1, '#c4bbae', hx, 0.5, hz, 40, { shade: 0.12 });
  k.box(3.2, 0.12, 1.8, P.safety, hx + Math.sin(aG) * 6.9, 0.55, hz + Math.cos(aG) * 6.9, { r: 0.02, ry: aG, shade: 0 });
  g.add(m.plasma);
  const hl = halo([-0.55, -0.15, 0.25, 0.6].map((d) => V(hx + Math.sin(aG + d) * 3.95, 5.5, hz + Math.cos(aG + d) * 3.95)), [4.5, 5.5, 5.5, 4.5], '#f7a6c4', 0.55);
  g.add(hl.obj);
  glowPool(c, hx + Math.sin(aG) * (R + 3), hz + Math.cos(aG) * (R + 3), 7, '#f7a6c4', 0.4, 1.6);
  // ── round it: cryoplant, magnet power supplies, the stack ──
  cryoplant(c, -19.6, 6.6);
  const mps = shed(k, -8.5, -15.2, 13.0, 2.4, 3.0, { wall: '#e3dfd8', band: L.acc, ribs: 1.1 });
  for (let x = -14; x < -3; x += 2.2) k.box(1.0, 0.5, 1.2, P.hvac, x, mps, -15.4, { r: 0.06 });
  for (const dx of [-3, 0, 3]) k.box(0.5, 0.5, 3.2, '#b7a27a', hx + dx, 1.4, -12.6, { r: 0.04 });
  ventStack(c, 1.4, -14.6, 19);
  // ── balance of plant, control block, car park, lamps ──
  const bop = balanceOfPlant(c);
  controlBlock(c, -15.2, 12.6, 9.4, 4.4, 4.8);
  carPark(c, -5.4, 14.0, 5);
  lampsAt(c, [[-1.6, 9.6, -1], [6.4, -3.6, 1], [-20.4, -4, 1]]);
  c.anim.extra.push((e) => {
    const flick = 1 + Math.sin(e.t * 3.1) * 0.06 + Math.sin(e.t * 11.3) * 0.03;
    gas.set((1.15 + e.night * 1.5) * flick);
    hl.set((0.35 + e.night * 0.45) * flick);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: Math.max(yTop + rise + 1.1, bop, 19.8), update: c.update, ground: () => null };
}
