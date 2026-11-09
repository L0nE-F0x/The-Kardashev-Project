/**
 * The vehicle assembly building: a huge pale box with a towering two-part door striped in the
 * builder's colours, the builder's name on a livery band round the top, the Charter's emblem and
 * flag on the walls, a low office annex and the crawler-transporter parked on the crawlerway.
 * 'building' = under construction (steel frame and cladding rising with `p`, a tower crane);
 * 'factory' = the heavy-lift rocket factory (a sawtooth hall, stages on cradles, a gantry crane).
 */
import * as THREE from 'three';
import { Kit, lightPool, poolMat, rng, type Paint } from '../../../kit';
import { crane, scaffold, siteClutter, type Env, type Piece } from '../../../pieces';
import { model } from '../../../models';
import type { Act3SetOpts } from '../../act3sets';
import { CH, emblemDisc, glassMat, lampMat, litGlass, litSign, People } from '../geneva/common';
import { beacon, fit } from '../geneva/secretariat';
import { V } from './common';

const CLAD: Paint = '#e9e4e0';
const SEAM: Paint = '#cbc4c6';
const STEEL: Paint = '#8a8490';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Slatted door panels in two colours (front face at z), from x0..x1, y0..y1. */
function slats(k: Kit, x0: number, x1: number, y0: number, y1: number, z: number, a: Paint, b: Paint) {
  const n = Math.max(2, Math.round((y1 - y0) / 1.15));
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    k.box(x1 - x0, h - 0.08, 0.22, i % 2 ? b : a, (x0 + x1) / 2, y0 + i * h + 0.04, z, { r: 0.03, jitter: 0.03, shade: 0 });
    k.box(x1 - x0, 0.06, 0.18, '#433c52', (x0 + x1) / 2, y0 + i * h, z, { r: 0, jitter: 0, shade: 0 });
  }
}

/** The crawler-transporter: four track units under a flat deck, a cab at two corners. */
function crawler(k: Kit, x: number, z: number, accent: Paint) {
  for (const [dx, dz] of [[-3.7, -2.6], [3.7, -2.6], [-3.7, 2.6], [3.7, 2.6]] as const) {
    k.box(2.6, 1.3, 3.4, '#433c52', x + dx, 0.05, z + dz, { r: 0.2, shade: 0.2 });
    for (let i = -1.4; i <= 1.41; i += 0.47) k.box(2.66, 0.14, 0.16, '#2f2a3d', x + dx, 0.05, z + dz + i, { r: 0, jitter: 0 });
    k.box(1.0, 0.9, 1.0, '#7a7186', x + dx, 1.3, z + dz, { r: 0.06 });
  }
  k.box(10.4, 1.1, 8.4, '#9d95a6', x, 2.1, z, { r: 0.18, shade: 0.15 });
  k.box(10.5, 0.2, 8.5, '#7a7186', x, 2.1, z, { r: 0.04, shade: 0 });
  for (const [cx, cz] of [[4.4, 3.6], [-4.4, -3.6]] as const) {
    k.box(1.8, 1.5, 1.3, accent, x + cx, 3.2, z + cz, { r: 0.1 });
    k.box(1.4, 0.6, 1.34, '#3c5f86', x + cx, 3.9, z + cz, { r: 0.02, jitter: 0 });
  }
  for (let i = -4; i <= 4; i += 2) k.box(0.12, 0.6, 8.4, '#5b5562', x + i, 3.2, z, { r: 0, jitter: 0 });
}

export function vab(o: Act3SetOpts): Piece {
  if (o.variant === 'factory') return factory(o);
  const building = o.variant === 'building';
  const p = building ? clamp01(o.p ?? 0) : 1;
  const g = new THREE.Group();
  g.name = 'set:vab';
  const k = new Kit(rng(o.seed));
  const warm = new Kit(rng(o.seed + 1)), dark = new Kit(rng(o.seed + 2));
  const accent = o.accent ?? '#df5f3e', hi = o.hi ?? '#f08a46';
  const label = o.label || 'LAUNCH';
  const X0 = -16, X1 = 8, Z0 = -15, Z1 = 9, H = 33;
  const W = X1 - X0, D = Z1 - Z0, CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  const DX0 = -10, DX1 = 2, DTOP = 13, UX0 = -7.6, UX1 = -0.4, UTOP = 28.4;
  k.box(W + 1.2, 0.4, D + 1.2, '#b9b1a6', CX, 0, CZ, { r: 0.1, shade: 0.1 });
  // the crawlerway out of the door
  for (const x of [-7.4, -0.6]) k.box(2.6, 0.06, 18.8 - Z1, '#b3a796', x, 0.02, (Z1 + 18.6) / 2, { r: 0, jitter: 0.02, shade: 0 });
  // the annex
  const AX0 = X1, AX1 = 19, AZ0 = -6, AZ1 = 9, AH = 8.2;
  const annex = !building || p >= 0.5;
  if (annex) {
    k.box(AX1 - AX0, AH, AZ1 - AZ0, '#f1ece4', (AX0 + AX1) / 2, 0.4, (AZ0 + AZ1) / 2, { r: 0.15, shade: 0.12 });
    k.box(AX1 - AX0 + 0.3, 0.45, AZ1 - AZ0 + 0.3, '#5b5562', (AX0 + AX1) / 2, AH + 0.4, (AZ0 + AZ1) / 2, { r: 0.06, shade: 0 });
    k.box(AX1 - AX0 + 0.04, 0.4, AZ1 - AZ0 + 0.04, accent, (AX0 + AX1) / 2, AH - 0.5, (AZ0 + AZ1) / 2, { r: 0.03, shade: 0 });
    for (const y of [1.6, 4.9]) {
      for (let x = AX0 + 1.4; x < AX1 - 1; x += 2.1) (building ? dark : warm).box(1.5, 1.7, 0.1, '#3c5f86', x, y, AZ1 + 0.06, { r: 0, jitter: 0.04 });
      for (let z = AZ0 + 1.4; z < AZ1 - 1; z += 2.1) (building ? dark : warm).box(0.1, 1.7, 1.5, '#3c5f86', AX1 + 0.06, y, z, { r: 0, jitter: 0.04 });
    }
    k.box(3.4, 0.25, 2.2, accent, AX0 + 3.2, 3.3, AZ1 + 1.1, { r: 0.05 });
    if (!building) {
      k.box(2.2, 1.2, 1.6, '#b9c2c4', AX1 - 2.5, AH + 0.85, AZ0 + 2.5, { r: 0.1 });
      k.box(1.6, 1.0, 1.4, '#b9c2c4', AX1 - 5.2, AH + 0.85, AZ0 + 2.5, { r: 0.1 });
    }
  }
  let craneTop: THREE.Object3D | null = null;
  if (!building) {
    // ── the hall ──
    k.box(W, H, D, CLAD, CX, 0.4, CZ, { r: 0.3, jitter: 0.015, shade: 0.12 });
    for (let x = X0 + 1.6; x < X1 - 0.5; x += 1.6) if (x < DX0 - 0.6 || x > DX1 + 0.6) k.box(0.12, H - 3.6, 0.1, SEAM, x, 0.6, Z1 + 0.03, { r: 0, jitter: 0, shade: 0 });
    for (let z = Z0 + 1.6; z < Z1 - 0.5; z += 1.6) k.box(0.1, H - 3.6, 0.12, SEAM, X0 - 0.03, 0.6, z, { r: 0, jitter: 0, shade: 0 });
    for (let y = 5.8; y < H - 4; y += 5.8) k.box(W + 0.08, 0.16, D + 0.08, SEAM, CX, y, CZ, { r: 0, jitter: 0, shade: 0 });
    // the livery band with the builder's name, parapet and roof
    k.box(W + 0.12, 0.3, D + 0.12, hi, CX, H - 4.4, CZ, { r: 0.03, jitter: 0, shade: 0 });
    k.box(W + 0.12, 3.1, D + 0.12, accent, CX, H - 4.1, CZ, { r: 0.05, jitter: 0.01, shade: 0 });
    k.box(W + 0.12, 0.3, D + 0.12, hi, CX, H - 1.0, CZ, { r: 0.03, jitter: 0, shade: 0 });
    k.box(W + 0.4, 0.7, D + 0.4, '#5b5562', CX, H + 0.4, CZ, { r: 0.08, shade: 0 });
    const name = fit(litSign(label, 20, '#fbf7f0', null, 0.7), W - 4, 2.3);
    name.position.set(CX, H - 2.5, Z1 + 0.1);
    g.add(name);
    const side = fit(litSign(label, 20, '#fbf7f0', null, 0.7), D - 4, 2.3);
    side.rotation.y = -Math.PI / 2;
    side.position.set(X0 - 0.1, H - 2.5, CZ);
    g.add(side);
    // the door: a wide lower leaf and a tall narrow upper one, in the builder's stripes
    k.box(DX1 - DX0 + 1.0, DTOP + 0.4, 0.5, '#5b5562', (DX0 + DX1) / 2, 0.4, Z1 + 0.05, { r: 0.06 });
    k.box(UX1 - UX0 + 1.0, UTOP - DTOP + 0.5, 0.5, '#5b5562', (UX0 + UX1) / 2, DTOP, Z1 + 0.05, { r: 0.06 });
    slats(k, DX0, DX1, 0.5, DTOP, Z1 + 0.33, accent, hi);
    slats(k, UX0, UX1, DTOP + 0.2, UTOP, Z1 + 0.33, accent, hi);
    const seam = lampMat('yel1', 1.6);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.16, UTOP - 0.6, 0.1), seam);
    sl.position.set((UX0 + UX1) / 2, 0.5 + (UTOP - 0.6) / 2, Z1 + 0.47);
    g.add(sl);
    // the Charter's emblem on the front, its flag painted on the side
    const em = emblemDisc(4.6, 0.5);
    em.position.set(X0 + 3.1, 19, Z1 + 0.06);
    g.add(em);
    k.box(0.1, 6.4, 10, CH.field, X0 - 0.05, 17, CZ, { r: 0, jitter: 0, shade: 0 });
    const em2 = emblemDisc(4.4, 0.4);
    em2.rotation.y = -Math.PI / 2;
    em2.position.set(X0 - 0.12, 20.2, CZ);
    g.add(em2);
    // office windows up the right of the door
    for (let y = 15; y < 26; y += 3.4) warm.box(2.6, 1.4, 0.1, '#3c5f86', X1 - 2.6, y, Z1 + 0.05, { r: 0, jitter: 0.04 });
    // the roof: plant, antennas, beacons at the corners
    for (const [x, z] of [[-10, -9], [-4, -9], [2, -9]] as const) k.box(3.4, 1.4, 2.6, '#b9c2c4', x, H + 0.7, z, { r: 0.12 });
    k.cyl(0.08, 0.12, 6, '#9d95a6', X0 + 2, H + 0.7, Z0 + 2, 6);
    k.cyl(0.06, 0.1, 4, '#9d95a6', X1 - 3, H + 0.7, Z0 + 3, 6);
    k.geo(new THREE.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.6).translate(X1 - 4.5, H + 1.6, Z1 - 3), '#e6e0e3', 0.02);
    for (const [x, z, ph] of [[X0, Z0, 0], [X1, Z0, 1], [X0, Z1, 2], [X1, Z1, 3]] as const) beacon(g, x + (x < 0 ? 0.4 : -0.4), H + 1.3, z + (z < 0 ? 0.4 : -0.4), ph);
    // wall packs over the door and the crawler parked on the crawlerway
    const wl = lampMat('yel1', 2.6);
    const pool = poolMat('#ffe2b0', 0.55);
    for (const x of [DX0 - 1.2, DX1 + 1.2, AX0 + 3.2]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.3), wl);
      m.position.set(x, x > X1 ? 3.1 : 14, Z1 + (x > X1 ? 2.2 : 0.35));
      g.add(m);
      lightPool(g, x, 0.4, Z1 + 3.4, x > X1 ? 3.2 : 5.5, pool);
    }
    crawler(k, -4, 14.2, accent);
    const truck = model('pickup', 4.4);
    truck.rotation.y = Math.PI / 2 + 0.1;
    truck.position.set(14.6, 0.05, 13.4);
    g.add(truck);
  } else {
    // ── under construction: the frame rises, the cladding follows, a crane over it all ──
    const hf = H * clamp01(p / 0.8);
    const hc = H * clamp01((p - 0.25) / 0.75);
    k.box(W, 0.5, D, '#a39a91', CX, 0, CZ, { r: 0.05 });
    const xs: number[] = [], zs: number[] = [];
    for (let x = X0; x <= X1 + 0.01; x += W / 4) xs.push(x);
    for (let z = Z0; z <= Z1 + 0.01; z += D / 4) zs.push(z);
    if (hf > 0.5) {
      for (const x of xs) for (const z of zs) if (x === X0 || x === X1 || z === Z0 || z === Z1) k.box(0.45, hf, 0.45, STEEL, x, 0.5, z, { r: 0, jitter: 0.03 });
      for (let y = 5.8; y <= hf; y += 5.8) {
        k.box(W, 0.4, 0.35, '#9d95a6', CX, y, Z0, { r: 0, jitter: 0 });
        k.box(W, 0.4, 0.35, '#9d95a6', CX, y, Z1, { r: 0, jitter: 0 });
        k.box(0.35, 0.4, D, '#9d95a6', X0, y, CZ, { r: 0, jitter: 0 });
        k.box(0.35, 0.4, D, '#9d95a6', X1, y, CZ, { r: 0, jitter: 0 });
        for (let i = 0; i + 1 < xs.length; i++) if (y + 5.8 <= hf + 0.01) {
          k.beam(V(xs[i], y, Z1), V(xs[i + 1], y + 5.8, Z1), 0.14, '#7a7186');
          k.beam(V(X0, y, zs[i]), V(X0, y + 5.8, zs[i + 1]), 0.14, '#7a7186');
        }
      }
    }
    if (hc > 0.5) {
      k.box(W - 0.6, hc, 0.25, CLAD, CX, 0.5, Z0 + 0.2, { r: 0.04, jitter: 0.02 });
      k.box(0.25, hc, D - 0.6, CLAD, X0 + 0.2, 0.5, CZ, { r: 0.04, jitter: 0.02 });
      k.box(0.25, hc, D - 0.6, CLAD, X1 - 0.2, 0.5, CZ, { r: 0.04, jitter: 0.02 });
      // the front, with the door opening left open
      k.box(DX0 - X0 - 0.2, hc, 0.25, CLAD, (X0 + DX0) / 2, 0.5, Z1 - 0.2, { r: 0.04, jitter: 0.02 });
      k.box(X1 - DX1 - 0.2, hc, 0.25, CLAD, (DX1 + X1) / 2, 0.5, Z1 - 0.2, { r: 0.04, jitter: 0.02 });
      const sc = scaffold(W + 1.4, Math.max(1.8, hc), 1.6, o.seed + 4);
      sc.position.set(CX, 0.5, Z1 + 0.9);
      g.add(sc);
    }
    const c = crane(Math.max(18, hf + 12), 26, o.seed + 3);
    c.position.set(X1 + 4.5, 0, Z0 + 2.5);
    g.add(c);
    craneTop = c.userData.top as THREE.Object3D;
    g.add(siteClutter(38, 34, o.seed + 5));
    const fb = model('flatbed', 9);
    fb.rotation.y = Math.PI / 2;
    fb.position.set(14, 0.05, 13.8);
    g.add(fb);
    for (let i = 0; i < 4; i++) k.box(7, 0.35, 0.4, '#7a7186', 14 + (i % 2) * 0.1, 1.45 + Math.floor(i / 2) * 0.36, 13.6 + (i % 2) * 0.5 - 0.25, { r: 0, jitter: 0.03 });
    // the site hoarding in the builder's colours
    k.box(16, 2.4, 0.16, accent, -6, 0, 17.4, { r: 0.03, shade: 0 });
    k.box(16, 0.25, 0.18, hi, -6, 2.4, 17.4, { r: 0.02, shade: 0 });
    const bd = fit(litSign(label, 8, '#fbf7f0', null, 0.3), 11, 1.5);
    bd.position.set(-6, 1.2, 17.5);
    g.add(bd);
  }
  g.add(k.build());
  if (!warm.empty) g.add(warm.build(litGlass('yel1', 1.0)));
  if (!dark.empty) g.add(dark.build(glassMat));
  const ppl = new People(0.05);
  if (!building) {
    ppl.walk([[AX0 + 1.5, AZ1 + 3.6], [AX0 + 7.5, AZ1 + 4.2], [AX0 + 9, 16.5], [1.6, 17.2]], 'engineer');
    ppl.stand(-9.6, 10.6, 0.6, 'worker');
    ppl.stand(AX0 + 3.6, AZ1 + 2.0, 2.6, 'office');
  } else {
    ppl.walk([[-14, 12.5], [4, 12.5], [4, 15.5]], 'worker');
    ppl.stand(10.5, 12.2, -1.6, 'worker');
    ppl.stand(-3, 10.5, Math.PI, 'engineer');
  }
  g.add(ppl.group);
  return {
    obj: g, w: 40, d: 36, h: building ? Math.max(20, H * clamp01(p / 0.8) + 14) : H + 2,
    update(e: Env) {
      if (craneTop) craneTop.rotation.y = Math.sin(e.t * 0.2 + o.seed) * 1.1;
      ppl.update(e);
    },
  };
}

// ── the heavy-lift factory ───────────────────────────────────────────────────────────────────
function stage(k: Kit, x: number, y: number, z: number, len: number, accent: Paint, hi: Paint) {
  const R = 1.45;
  k.geo(new THREE.CylinderGeometry(R, R, len, 26).rotateZ(Math.PI / 2).translate(x, y, z), '#f3f0ea', 0.01);
  k.geo(new THREE.CylinderGeometry(R + 0.01, R + 0.01, 2.2, 26).rotateZ(Math.PI / 2).translate(x - len / 2 + 3.4, y, z), accent, 0.01);
  k.geo(new THREE.CylinderGeometry(R + 0.015, R + 0.015, 0.35, 26).rotateZ(Math.PI / 2).translate(x - len / 2 + 4.8, y, z), hi, 0);
  k.geo(new THREE.CylinderGeometry(R * 0.95, R * 0.8, 1.2, 20).rotateZ(Math.PI / 2).translate(x - len / 2 - 0.6, y, z), '#433c52', 0.02);
  for (const dx of [-len * 0.32, 0, len * 0.32]) {
    k.box(1.1, y - R * 0.5, R * 2.2, 'yel0', x + dx, 0, z, { r: 0.06 });
    k.box(1.2, 0.3, R * 2.4, '#5b5562', x + dx, 0, z, { r: 0.03 });
  }
}

function factory(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  g.name = 'set:vab';
  const k = new Kit(rng(o.seed));
  const sky = new Kit(rng(o.seed + 1)), warm = new Kit(rng(o.seed + 2));
  const accent = o.accent ?? '#4a7cb6', hi = o.hi ?? '#9cc4ea';
  const label = o.label || 'FACTORY';
  const X0 = -17, X1 = 13, Z0 = -14, Z1 = 2, H = 13;
  const W = X1 - X0, CX = (X0 + X1) / 2;
  k.box(W + 1, 0.35, Z1 - Z0 + 1, '#b9b1a6', CX, 0, (Z0 + Z1) / 2, { r: 0.08 });
  k.box(W, H, Z1 - Z0, CLAD, CX, 0.35, (Z0 + Z1) / 2, { r: 0.2, jitter: 0.015, shade: 0.12 });
  k.box(W + 0.06, 2.6, Z1 - Z0 + 0.06, accent, CX, 0.35, (Z0 + Z1) / 2, { r: 0.05, shade: 0.05 });
  k.box(W + 0.08, 0.25, Z1 - Z0 + 0.08, hi, CX, 2.95, (Z0 + Z1) / 2, { r: 0.02, shade: 0 });
  for (let x = X0 + 1.5; x < X1 - 0.5; x += 1.5) k.box(0.1, H - 3.6, 0.1, SEAM, x, 3.2, Z1 + 0.03, { r: 0, jitter: 0, shade: 0 });
  // the sawtooth roof: glazed faces looking north (−z)
  const T = 5, TD = (Z1 - Z0) / T, TH = 2.4;
  for (let i = 0; i < T; i++) {
    const z0 = Z0 + i * TD;
    const slope = new THREE.BoxGeometry(W, 0.3, Math.hypot(TD, TH)).rotateX(Math.atan2(TH, TD)).translate(CX, H + 0.35 + TH / 2, z0 + TD / 2);
    k.geo(slope, '#7a7186', 0.02);
    sky.box(W - 0.4, TH - 0.2, 0.12, '#6c9fd2', CX, H + 0.4, z0 + 0.12, { r: 0, jitter: 0.03 });
  }
  for (const x of [X0, X1]) for (let i = 0; i < T; i++) {
    const z0 = Z0 + i * TD;
    const tri = new THREE.BufferGeometry().setFromPoints([V(x, H + 0.35, z0), V(x, H + 0.35, z0 + TD), V(x, H + 0.35 + TH, z0)]);
    tri.setIndex(x < 0 ? [0, 1, 2] : [0, 2, 1]);
    tri.computeVertexNormals();
    k.geo(tri.toNonIndexed(), CLAD, 0.01);
  }
  // two big doors in the builder's stripes, the name over them
  for (const x of [-9.5, 3.5]) {
    k.box(9.2, 10, 0.4, '#5b5562', x, 0.35, Z1 + 0.05, { r: 0.05 });
    slats(k, x - 4.2, x + 4.2, 0.45, 10, Z1 + 0.3, accent, hi);
  }
  k.box(W - 6, 2.2, 0.2, '#2f2a3d', CX, H - 2.4, Z1 + 0.1, { r: 0.04 });
  const nm = fit(litSign(`${label} · HEAVY LIFT`, 20, '#fbf7f0', null, 0.7), W - 8, 1.6);
  nm.position.set(CX, H - 1.3, Z1 + 0.22);
  g.add(nm);
  // the office at the end
  k.box(6, 6.4, 11, '#f1ece4', X1 + 3, 0.35, -5, { r: 0.12 });
  for (const y of [1.4, 4]) for (let z = -9.4; z < -0.8; z += 2.1) warm.box(0.1, 1.5, 1.5, '#3c5f86', X1 + 6.05, y, z, { r: 0, jitter: 0.04 });
  for (const y of [1.4, 4]) for (let x = X1 + 1; x < X1 + 5.6; x += 2.1) warm.box(1.5, 1.5, 0.1, '#3c5f86', x, y, 0.55, { r: 0, jitter: 0.04 });
  // the stage yard: stages on cradles, a gantry crane on rails
  stage(k, -5, 2.9, 8.2, 17, accent, hi);
  stage(k, -3, 2.9, 13.6, 14, accent, hi);
  for (const z of [4.6, 17.2]) k.box(30, 0.08, 0.3, '#433c52', -2, 0.02, z, { r: 0, jitter: 0 });
  const gantry = new THREE.Group();
  const gk = new Kit(rng(o.seed + 5));
  for (const z of [4.6, 17.2]) {
    gk.box(0.5, 10, 0.5, 'yel0', -0.8, 0, z, { r: 0.04 });
    gk.box(0.5, 10, 0.5, 'yel0', 0.8, 0, z, { r: 0.04 });
    gk.beam(V(-0.8, 0.5, z), V(0.8, 9, z), 0.15, 'yel0');
    gk.box(2.4, 0.8, 1.4, '#5b5562', 0, 0, z, { r: 0.06 });
  }
  gk.box(2.0, 1.2, 13.4, 'yel0', 0, 10, 10.9, { r: 0.08 });
  gk.box(1.8, 1.0, 1.8, '#5b5562', 0, 9.2, 9.5, { r: 0.08 });
  gk.beam(V(0, 9.2, 9.5), V(0, 5.2, 9.5), 0.05, '#2f2a3d');
  gk.box(0.7, 0.4, 0.7, 'org0', 0, 4.8, 9.5, { r: 0.04 });
  gantry.add(gk.build());
  g.add(gantry);
  beacon(g, X0 + 0.5, H + TH + 0.6, Z0 + 0.5, 0);
  beacon(g, X1 - 0.5, H + TH + 0.6, Z0 + 0.5, 1.5);
  const wl = lampMat('yel1', 2.6);
  const pool = poolMat('#ffe2b0', 0.55);
  for (const x of [-9.5, 3.5]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.3), wl);
    m.position.set(x, 10.6, Z1 + 0.4);
    g.add(m);
    lightPool(g, x, 0.35, Z1 + 3.5, 5, pool);
  }
  // a lit window strip along the front, floodlights over the stage yard
  for (let x = X0 + 1.2; x < X1 - 0.8; x += 2.0) if (Math.abs(x + 9.5) > 5 && Math.abs(x - 3.5) > 5) warm.box(1.5, 1.4, 0.1, '#3c5f86', x, 7.2, Z1 + 0.06, { r: 0, jitter: 0.04 });
  for (const x of [-14.5, 10.5]) {
    k.box(0.22, 9, 0.22, '#5b5562', x, 0.35, 17.9, { r: 0 });
    k.box(1.4, 0.16, 0.4, '#5b5562', x, 9.35, 17.9, { r: 0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.3), wl);
    m.position.set(x, 9.2, 17.7);
    g.add(m);
    lightPool(g, x + (x < 0 ? 4 : -4), 0.35, 11.5, 7, pool);
  }
  g.add(k.build(), sky.build(litGlass('yel1', 0.9)), warm.build(litGlass('yel1', 1.0)));
  const ppl = new People(0.05);
  ppl.walk([[-14, 5.8], [8, 5.8], [8, 16.4], [-14, 16.4]], 'worker');
  ppl.stand(4.6, 11, -1.2, 'engineer');
  g.add(ppl.group);
  return {
    obj: g, w: 40, d: 36, h: H + TH + 1,
    update(e: Env) {
      gantry.position.x = -2 + Math.sin(e.t * 0.09 + o.seed) * 7;
      ppl.update(e);
    },
  };
}
