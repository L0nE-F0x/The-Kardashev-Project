/**
 * The suppliers' big buildings: a leading-edge logic fab, a memory fab (two blocks and a
 * skybridge), Veldt's EUV assembly hall with a window onto the machine, Bondline's sawtooth-roofed
 * packaging lines and Cumulus Cloud's rental data halls.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, mix, poolMat, rng, withClouds, type Paint } from '../../kit';
import { Plume } from '../../fx';
import type { Env } from '../../pieces';
import { parkedCars } from '../life';
import type { SetPieceFactory } from '../registry';
import {
  airHandler, beacon, block, brandOf, carPark, G, signPanel, coolingCell, curtain, Fans, hTank, lamps, Lit, P, parkVehicle, pipeRun, putSign, shrubs, stack, tree, tube, V, vTank, wallLights, xfmr,
} from './common';

/** Roof scrubbers: a box with a pair of exhaust stacks. */
function scrubbers(k: Kit, x0: number, x1: number, z: number, y: number, n: number, h: number, band: Paint, r = 0.42) {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
    k.box(1.7, 1.3, 1.5, '#c3bcc7', x, y, z, { r: 0.1, jitter: 0.03 });
    stack(k, x - 0.42, y + 1.3, z, r, h - 1.3, '#d8d2d6', i % 2 ? band : null);
    stack(k, x + 0.42, y + 1.3, z, r * 0.9, h - 1.8, '#d8d2d6', null);
  }
}

/** A chemical tank farm in a bunded pad, with a pipe bridge into the wall at `wallX`. */
function tankFarm(k: Kit, x: number, z: number, w: number, d: number, accent: Paint, wallX: number, seed: number) {
  const r = rng(seed);
  k.box(w, 0.2, d, '#b7aea3', x, 0, z, { r: 0.04, shade: 0 });
  for (const [sx, sz, len, alongZ] of [[0, -d / 2, w, false], [0, d / 2, w, false], [-w / 2, 0, d, true], [w / 2, 0, d, true]] as [number, number, number, boolean][])
    k.box(alongZ ? 0.25 : len, 0.6, alongZ ? len : 0.25, '#a39a91', x + sx, 0, z + sz, { r: 0.04 });
  const tanks = Math.max(2, Math.floor(d / 3.4));
  for (let i = 0; i < tanks; i++) {
    const tz = z - d / 2 + 1.9 + i * ((d - 3.8) / Math.max(1, tanks - 1));
    const rr = 1.05 + r() * 0.35;
    vTank(k, x - w / 4 + 0.2, tz, rr, 4.2 + r() * 2.6, i % 3 === 1 ? '#e6e0e3' : '#ece6dc', 0, i % 2 ? accent : '#9d95a6');
    if (i % 2 === 0) hTank(k, x + w / 4, tz, 0.7, 2.6, '#e9e1d2', true, 0.2);
  }
  // a pipe bridge from the farm into the fab wall
  // (between two tanks, so the pipes clear them), rising at the far edge of the bund
  const py = 5.2, xr = x + w / 2 - 0.5, xb = wallX, zb = z + (d - 3.8) / Math.max(1, tanks - 1) / 2;
  for (const pz of [zb - 1.0, zb + 1.0]) for (const px of [x - w / 2 + 0.6, xr]) k.box(0.28, py, 0.28, P.trim, px, 0, pz, { r: 0, jitter: 0 });
  k.box(Math.abs(xr - xb) + 0.3, 0.25, 2.6, P.trim, (xr + xb) / 2, py, zb, { r: 0 });
  for (let i = 0; i < 3; i++) {
    const pz = zb - 0.7 + i * 0.7, c = i === 1 ? accent : '#c3bcc7';
    tube(k, V(xr, py + 0.4, pz), V(xb, py + 0.4, pz), 0.14, c);
    tube(k, V(xr, 0.6, pz), V(xr, py + 0.4, pz), 0.14, c);
  }
}

// ── the logic fab ────────────────────────────────────────────────────────────────────────────
const logicFab: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const kestrel = o.variant === 'kestrel' || o.brand === 'kestrel';
  const g = new THREE.Group();
  const r = rng(o.seed);
  const k = new Kit(r);
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.1);
  const accent = b.accent;
  const wall: Paint = kestrel ? '#dcd5cc' : '#e2ded8';
  // the cleanroom block: a sub-fab louvre band, panel joints, the brand band at the top
  const FX = kestrel ? 1 : 0, FW = 40, FD = 20, FH = 15, FZ = -3;
  block(k, FX, FZ, FW, FD, FH, { wall, band: accent, bandH: 0.9, joints: 2.6, louvre: [0.5, 3.1], r: 0.35 });
  // a corridor ribbon window along the front, above the sub-fab (lit at night)
  k.box(FW - 1.4, 1.1, 0.1, P.glassB, FX, 4.0, FZ + FD / 2 + 0.03, { r: 0, jitter: 0, shade: 0 });
  for (let x = FX - FW / 2 + 1.5; x < FX + FW / 2 - 1; x += 2.6) k.box(0.12, 1.1, 0.14, '#5b5562', x, 4.0, FZ + FD / 2 + 0.06, { r: 0, jitter: 0 });
  lit.pane(FW - 1.8, 0.8, FX, 4.15, FZ + FD / 2 + 0.1);
  // the fan deck stepped up on top, and (Lumen) a taller litho bay at one end
  block(k, FX - 1, FZ - 1.5, FW - 8, FD - 6, 3.2, { wall: mix(wall, '#b9b1a6', 0.25), joints: 1.6, plinth: false, r: 0.25 }, FH);
  if (!kestrel) block(k, FX + 14.5, FZ + 2, 9, 12, 4.6, { wall: mix(wall, '#c9c1b6', 0.2), band: accent, bandH: 0.5, joints: 1.5, plinth: false, r: 0.25 }, FH);
  // rooftop: air handlers in rows on the fan deck, scrubbers and stacks along the back
  const deckY = FH + 3.2;
  for (let row = 0; row < 3; row++)
    for (let c = 0; c < 3; c++) airHandler(k, fans, FX - 11 + c * 9.2, deckY, FZ - 6.2 + row * 3.6, 7.4, 2.2, 1.5, 3);
  scrubbers(k, FX - 19, FX + (kestrel ? 19 : 9), FZ - FD / 2 + 1.4, FH, kestrel ? 7 : 6, 6.5, accent);
  // two tall scrubber stacks with beacons
  for (const [x, ph] of [[FX - 16, 0], [FX + 4, 2.1]] as [number, number][]) {
    stack(k, x, FH, FZ + FD / 2 - 2.2, 0.85, 11, '#d8d2d6', accent);
    beacon(g, x, FH + 11.3, FZ + FD / 2 - 2.2, ph);
  }
  // the brand name, big on the façade
  signPanel(g, k, b.name, 18, 2.0, FX - 4, FH - 3.3, FZ + FD / 2 + 0.04, accent);
  // the fab office in front: three floors of glass, accent fins, a canopy
  const ox = kestrel ? 6 : -9, oz = FZ + FD / 2 + 3, ow = 18, od = 6, oh = 9.2;
  block(k, ox, oz, ow, od, oh, { wall: '#ece6dc', band: accent, bandH: 0.5, r: 0.25 });
  curtain(k, lit, ox - 1, 1.0, oz + od / 2, ow - 4.4, oh - 2.2, { bay: 1.5, floor: 2.6, seed: o.seed });
  curtain(k, lit, ox - ow / 2, 1.0, oz, od - 1.6, oh - 2.2, { bay: 1.5, floor: 2.6, facing: '-x', seed: o.seed + 2 });
  for (let i = 0; i < 4; i++) k.box(0.32, oh - 1.4, 0.6, b.hi, ox - ow / 2 + 2.6 + i * 3.9, 0.5, oz + od / 2 + 0.3, { r: 0.08, shade: 0 });
  k.box(6.2, 0.35, 3.4, accent, ox + ow / 2 - 3.4, 3.6, oz + od / 2 + 1.5, { r: 0.1, shade: 0 });
  for (const sx of [-2.6, 2.6]) k.box(0.2, 3.6, 0.2, '#e6e0e3', ox + ow / 2 - 3.4 + sx, 0, oz + od / 2 + 2.9, { r: 0, jitter: 0 });
  k.box(2.2, 2.6, 0.1, '#2f3f4a', ox + ow / 2 - 3.4, 0.45, oz + od / 2 + 0.06, { r: 0, jitter: 0 });
  // the central utility building on the left: chillers inside, cooling towers on top
  const cx = -25.4, cz = -6;
  block(k, cx, cz, 8.4, 20, 7, { wall: '#d3ccc2', ribs: 1.1, faces: ['f', 'l'], r: 0.25 });
  const plumes: Plume[] = [];
  for (let i = 0; i < 5; i++) {
    const z = cz - 8 + i * 4;
    coolingCell(k, fans, cx, 7, z, 3.4, 2.6);
    if (i % 2 === 0) {
      const p = new Plume({ count: 12, life: 5, rise: 1.6, size0: 1.6, size1: 5, opacity: 0.28, radius: 0.9, wind: 0.5 }, o.seed + i);
      p.obj.position.set(cx, 10.4, z);
      plumes.push(p);
      g.add(p.obj);
    }
  }
  for (let y = 1.8; y < 6; y += 2.2) lit.pane(5.6, 0.5, cx, y, cz + 10.08);
  // ducts from the CUB into the fab
  for (const y of [4.2, 5.4]) k.box(FX - FW / 2 - cx - 3.8, 0.9, 1.0, '#c3bcc7', (cx + 4.2 + FX - FW / 2) / 2, y, cz + 3, { r: 0.12 });
  // chemicals and bulk gas along the right side
  tankFarm(k, 26.2, -6, 6.6, 20, accent, FX + FW / 2, o.seed + 9);
  // forecourt: drive, car park, lamps, landscaping
  const px = kestrel ? -14 : 12;
  carPark(k, px, 15.8, 15, 6.2);
  parkedCars(g, px - 6.8, 15.6, 7, 2.3, o.seed + 5, Math.PI / 2);
  lamps(g, k, [[px - 8.2, 13.2], [px + 8.2, 13.2]], [0, -1]);
  k.box(kestrel ? 22 : 24, 0.07, 3.4, '#d2c9bd', kestrel ? 7 : -9, G, oz + od / 2 + 3.4, { r: 0.03, shade: 0, jitter: 0.02 });
  const sx0 = kestrel ? 18 : -20;
  shrubs(k, [[sx0, 17.4, 1], [sx0 + 2, 17.8, 0.9], [sx0 + 4.2, 17.5, 1], [sx0 + 6.3, 17.9, 0.85]]);
  tree(k, kestrel ? 27 : -27, 15.5, 1.1);
  tree(k, kestrel ? 24 : -23.8, 17.2, 0.9);
  // a transformer pair by the CUB
  for (const z of [7.4, 10.7]) xfmr(k, -26, z, 0.85);
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[ox + ow / 2 - 3.4, 3.3, oz + od / 2 + 0.1], [FX + 14, 3.6, FZ + FD / 2], [FX - 18, 3.6, FZ + FD / 2]], 2.4, 3.6);
  return {
    obj: g, w: 60, d: 40, h: FH + 11.5,
    // the office's doors under the canopy
    doors: [{ x: ox + ow / 2 - 3.4, z: oz + od / 2 + 0.75 }],
    update(e) { fans.update(e); for (const p of plumes) p.update(e); },
  };
};

// ── the memory fab ───────────────────────────────────────────────────────────────────────────
const memFab: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const hanbit = o.variant === 'hanbit' || o.brand === 'hanbit';
  const g = new THREE.Group();
  const r = rng(o.seed);
  const k = new Kit(r);
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.1);
  const accent = b.accent;
  const wall: Paint = hanbit ? '#e6e1dc' : '#dcd8d4';
  // block A (left, lower) and block B (right, taller, set back)
  const A = { x: -15.5, z: -4, w: 21, d: 19, h: 12.5 };
  const B = { x: 15.5, z: -6, w: 21, d: 21, h: 15 };
  block(k, A.x, A.z, A.w, A.d, A.h, { wall, band: accent, bandH: 0.8, joints: 2.4, louvre: [0.5, 2.8], r: 0.32 });
  block(k, B.x, B.z, B.w, B.d, B.h, { wall, band: accent, bandH: 0.8, joints: 2.4, louvre: [0.5, 2.8], r: 0.32 });
  // block B's front: tall accent stripes (the brand's bars)
  const bars = new Kit();
  for (let i = 0; i < 3; i++) bars.box(1.1, B.h - 5.4, 0.2, '#ffffff', B.x + 4 + i * 1.8, 3.2, B.z + B.d / 2 + 0.06, { r: 0.06, shade: 0, jitter: 0 });
  const barMat = glowMat(accent, 0);
  barMat.userData.nightOnly = 0.9;
  const barMesh = bars.build(barMat);
  barMesh.castShadow = false;
  g.add(barMesh);
  k.box(12.6, 1.1, 0.1, P.glassB, B.x - 3.4, 3.7, B.z + B.d / 2 + 0.03, { r: 0, jitter: 0, shade: 0 });
  for (let x = B.x - 9.4; x < B.x + 2.9; x += 2.4) k.box(0.12, 1.1, 0.14, '#5b5562', x, 3.7, B.z + B.d / 2 + 0.06, { r: 0, jitter: 0 });
  lit.pane(12.2, 0.8, B.x - 3.4, 3.85, B.z + B.d / 2 + 0.1);
  // the utility link between them at the back, cooling towers on its roof
  block(k, 0, -12.5, 10, 9, 7.5, { wall: '#d3ccc2', ribs: 1.1, faces: ['f'], r: 0.25 });
  const plumes: Plume[] = [];
  for (const [x, z] of [[-2.2, -14.6], [2.2, -14.6], [-2.2, -10.4], [2.2, -10.4]]) coolingCell(k, fans, x, 7.5, z, 3.6, 2.4);
  for (const x of [-2.2, 2.2]) {
    const p = new Plume({ count: 10, life: 5, rise: 1.6, size0: 1.4, size1: 4.4, opacity: 0.25, radius: 0.8, wind: 0.5 }, o.seed + x * 3);
    p.obj.position.set(x, 10.6, -12.5);
    plumes.push(p);
    g.add(p.obj);
  }
  // the skybridge: a glazed tube at the 3rd floor
  const sbY = 7.6, sbH = 2.6, sbZ = -2.2, sbD = 3.2;
  k.box(10.6, 0.45, sbD + 0.4, '#cfc7bb', 0, sbY - 0.4, sbZ, { r: 0.1 });
  k.box(10.6, 0.45, sbD + 0.4, '#cfc7bb', 0, sbY + sbH, sbZ, { r: 0.1 });
  k.box(10.4, sbH, sbD, '#4a6878', 0, sbY, sbZ, { r: 0.04, jitter: 0.02, shade: 0 });
  for (let x = -4.8; x <= 4.8; x += 1.2) {
    k.box(0.1, sbH, 0.1, '#5b5562', x, sbY, sbZ + sbD / 2 + 0.02, { r: 0, jitter: 0 });
    lit.pane(1.0, sbH - 0.3, x + 0.6, sbY + 0.15, sbZ + sbD / 2 + 0.03);
  }
  k.box(10.6, 0.14, 0.12, accent, 0, sbY + sbH - 0.3, sbZ + sbD / 2 + 0.2, { r: 0, jitter: 0, shade: 0 });
  // rooftops: air handlers on A, stacks rows on both
  for (let row = 0; row < 2; row++) for (let c = 0; c < 2; c++) airHandler(k, fans, A.x - 4.6 + c * 9.2, A.h, A.z - 2.5 + row * 4.2, 7.2, 2.2, 1.4, 3);
  scrubbers(k, A.x - 9, A.x + 9, A.z - A.d / 2 + 1.6, A.h, 5, 5.5, accent);
  for (let c = 0; c < 2; c++) airHandler(k, fans, B.x - 4.6 + c * 9.2, B.h, B.z + 3.8, 7.2, 2.2, 1.4, 3);
  // B's stack forest: rows of thin stacks on a duct deck
  k.box(17, 0.8, 7, '#b9b1a6', B.x, B.h, B.z - 5, { r: 0.1 });
  for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) stack(k, B.x - 7.2 + i * 2.4, B.h + 0.8, B.z - 6.6 + j * 3.2, 0.42, 4.5 + ((i + j) % 3) * 1.1, '#d8d2d6', (i + j) % 3 === 0 ? accent : null);
  stack(k, B.x + 8.5, B.h, B.z + 7, 0.9, 10, '#d8d2d6', accent);
  beacon(g, B.x + 8.5, B.h + 10.3, B.z + 7, 1.1);
  // the lobby in front of A with the name over it
  const lx = A.x - 1, lz = A.z + A.d / 2 + 2.6;
  block(k, lx, lz, 15, 5.2, 6, { wall: '#ece6dc', band: accent, bandH: 0.45, r: 0.2 });
  curtain(k, lit, lx - 1.2, 0.9, lz + 2.6, 11.4, 4.2, { bay: 1.4, floor: 2.1, seed: o.seed });
  k.box(5, 0.32, 3, accent, lx + 4.6, 3.3, lz + 3.6, { r: 0.08, shade: 0 });
  k.box(1.8, 2.4, 0.1, '#2f3f4a', lx + 4.6, 0.45, lz + 2.62, { r: 0, jitter: 0 });
  signPanel(g, k, b.name, 16, 1.5, A.x - 1, A.h - 3.3, A.z + A.d / 2 + 0.04, accent);
  // front: car park before B, a planted strip before A
  carPark(k, 15.5, 13.6, 18, 6);
  parkedCars(g, 7.6, 13.4, 8, 2.25, o.seed + 7, Math.PI / 2);
  lamps(g, k, [[6.2, 10.4], [24.8, 10.4]], [0, -1]);
  shrubs(k, [[-25, 15.5, 1], [-22.8, 16, 0.9], [-20.6, 15.6, 1], [-6.4, 15.8, 0.9], [-4.4, 16.2, 1]]);
  tree(k, -25.2, 12.6, 1);
  tree(k, -6, 12.4, 0.9);
  k.box(20, 0.07, 3, '#d2c9bd', -14, G, lz + 4.6, { r: 0.03, shade: 0, jitter: 0.02 });
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[lx + 4.6, 3.0, lz + 2.65], [B.x - 7, 3.2, B.z + B.d / 2], [B.x + 7, 3.2, B.z + B.d / 2]], 2.4, 3.6);
  return {
    obj: g, w: 54, d: 38, h: B.h + 10.5,
    // the lobby's doors under the canopy
    doors: [{ x: lx + 4.6, z: lz + 2.62 + 0.7 }],
    update(e) { fans.update(e); for (const p of plumes) p.update(e); },
  };
};

// ── Veldt's EUV assembly hall ────────────────────────────────────────────────────────────────
/** A cleanroom engineer in a bunny suit (feet at 0, facing +z). */
function bunnySuit(k: Kit, x: number, z: number, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx: number, dz: number) => [x + dx * c + dz * s, z - dx * s + dz * c] as const;
  for (const dx of [-0.11, 0.11]) { const [px, pz] = at(dx, 0); k.box(0.22, 0.78, 0.26, '#f4f2f4', px, 0, pz, { r: 0.06, jitter: 0.01, ry }); }
  k.box(0.52, 0.7, 0.32, '#f4f2f4', x, 0.74, z, { r: 0.12, jitter: 0.01, ry });
  k.geo(new THREE.SphereGeometry(0.2, 10, 8).translate(x, 1.58, z), '#eef0f4', 0.01);
  const [vx, vz] = at(0, 0.13);
  k.box(0.26, 0.11, 0.08, '#4a7cb6', vx, 1.56, vz, { r: 0.03, jitter: 0, ry });
}

/** The EUV machine: source vessel, illuminator, reticle and wafer stages, a bus-sized grey hulk (about 16 × 5 × 6). */
function euvMachine(k: Kit, x: number, z: number, glow: Kit, accent: Paint) {
  const body: Paint = '#b7b4bf', dark: Paint = '#5b5562', panel: Paint = '#d6d3da', mid: Paint = '#8f8a99';
  // plinth with a yellow-railed service deck round it
  k.box(17, 0.45, 6.6, '#7a7186', x, 0.5, z, { r: 0.08 });
  for (const sx of [-8.3, 8.3]) k.box(0.08, 1.0, 6.4, accent, x + sx, 0.95, z, { r: 0, jitter: 0 });
  k.box(16.6, 0.08, 0.08, accent, x, 1.95, z + 3.25, { r: 0, jitter: 0 });
  for (let i = 0; i <= 8; i++) k.box(0.07, 1.0, 0.07, accent, x - 8.3 + i * 2.075, 0.95, z + 3.25, { r: 0, jitter: 0 });
  // the source module (left): a big vessel on its side in a dark frame
  k.box(4.4, 4.6, 4.6, dark, x - 6, 0.95, z, { r: 0.22, jitter: 0.03 });
  k.geo(new THREE.CylinderGeometry(1.7, 1.7, 3.6, 22, 1).rotateZ(Math.PI / 2).translate(x - 6.2, 3.3, z + 0.6), mid, 0.02);
  k.geo(new THREE.SphereGeometry(1.72, 22, 10, 0, Math.PI).rotateY(-Math.PI / 2).translate(x - 8.0, 3.3, z + 0.6), mid, 0.02);
  k.cyl(0.6, 0.6, 1.4, dark, x - 6.2, 5.4, z - 0.8, 14);
  // the main body with its panels, the illuminator turret and a yellow stripe
  k.box(6.6, 5.6, 5.0, body, x - 0.4, 0.95, z, { r: 0.3, jitter: 0.02 });
  for (let i = 0; i < 4; i++) k.box(1.4, 4.0, 0.08, panel, x - 2.6 + i * 1.5, 1.5, z + 2.52, { r: 0.03, jitter: 0.03, shade: 0 });
  k.box(6.64, 0.3, 5.04, accent, x - 0.4, 5.1, z, { r: 0.04, shade: 0 });
  k.box(3.0, 2.0, 3.0, panel, x + 0.2, 6.55, z - 0.4, { r: 0.25 });
  k.cyl(0.9, 0.9, 1.1, mid, x + 0.2, 8.5, z - 0.4, 16);
  // reticle stage + wafer handler (right), with a little window
  k.box(4.0, 3.8, 4.4, panel, x + 5.6, 0.95, z + 0.1, { r: 0.22, jitter: 0.03 });
  k.box(4.04, 0.28, 4.44, dark, x + 5.6, 3.6, z + 0.1, { r: 0.04, shade: 0 });
  k.box(2.0, 1.4, 0.08, '#34506b', x + 5.6, 2.0, z + 2.33, { r: 0.03, jitter: 0 });
  // cable trays up to the ceiling
  for (const tx of [-4.2, 3.2]) k.box(1.0, 5.0, 0.6, dark, x + tx, 6.5, z - 2.2, { r: 0.05 });
  // status lights and the plasma port (they glow)
  for (let i = 0; i < 7; i++) glow.box(0.3, 0.14, 0.04, '#ffffff', x - 3.0 + i * 0.55, 4.7, z + 2.55, { r: 0, jitter: 0, shade: 0 });
  glow.geo(new THREE.CircleGeometry(0.62, 18).translate(x - 6.2, 3.3, z + 2.32), '#ffffff', 0);
  glow.box(1.8, 1.2, 0.04, '#ffffff', x + 5.6, 2.1, z + 2.36, { r: 0, jitter: 0, shade: 0 });
}

const euvHall: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.1);
  const accent = b.accent;
  // the hall is hollow: walls round a big front window, the bay inside under yellow light
  const X = -4, Z = -4.5, W = 34, D = 17, H = 14, T = 0.6;
  const win = { x0: -18.4, x1: 4.6, y0: 1.4, y1: 11 };
  const wall: Paint = '#cfd0d4', steel: Paint = '#4f4c5c';
  k.box(W + 0.5, 0.45, D + 0.5, P.plinth, X, 0, Z, { r: 0.08 });
  k.box(W, H, T, wall, X, 0, Z - D / 2 + T / 2, { r: 0.2, shade: 0.12 });
  k.box(T, H, D, wall, X - W / 2 + T / 2, 0, Z, { r: 0.2, shade: 0.12 });
  k.box(T, H, D, wall, X + W / 2 - T / 2, 0, Z, { r: 0.2, shade: 0.12 });
  const fz = Z + D / 2 - T / 2;
  const left = win.x0 - (X - W / 2), right = X + W / 2 - win.x1;
  k.box(left, H, T, wall, X - W / 2 + left / 2, 0, fz, { r: 0.12, shade: 0.12 });
  k.box(right, H, T, wall, win.x1 + right / 2, 0, fz, { r: 0.15, shade: 0.12 });
  k.box(win.x1 - win.x0, win.y0, T, wall, (win.x0 + win.x1) / 2, 0, fz, { r: 0.1, shade: 0.12 });
  k.box(win.x1 - win.x0, H - win.y1, T, wall, (win.x0 + win.x1) / 2, win.y1, fz, { r: 0.1, shade: 0 });
  // roof slab, the dark steel crown with the accent line, the name on it
  k.box(W + 0.2, 0.7, D + 0.2, '#6f6878', X, H, Z, { r: 0.12, shade: 0 });
  k.box(W + 0.3, 1.9, D + 0.3, steel, X, H - 1.6, Z, { r: 0.08, shade: 0 });
  k.box(W + 0.34, 0.28, D + 0.34, accent, X, H - 1.75, Z, { r: 0.04, shade: 0 });
  putSign(g, b.name, 8, X + 11, H - 0.6, Z + D / 2 + 0.24, accent, null, 0, true, 1.3);
  // the window: steel mullions and transoms
  for (let x = win.x0; x <= win.x1 + 0.01; x += (win.x1 - win.x0) / 8) k.box(0.2, win.y1 - win.y0 + 0.2, 0.32, steel, x, win.y0 - 0.1, fz + 0.32, { r: 0.02, jitter: 0 });
  k.box(win.x1 - win.x0 + 0.3, 0.32, 0.38, steel, (win.x0 + win.x1) / 2, win.y1, fz + 0.32, { r: 0.03, jitter: 0 });
  k.box(win.x1 - win.x0 + 0.3, 0.3, 0.42, steel, (win.x0 + win.x1) / 2, win.y0 - 0.25, fz + 0.34, { r: 0.03, jitter: 0 });
  k.box(win.x1 - win.x0, 0.14, 0.3, steel, (win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, fz + 0.3, { r: 0, jitter: 0 });
  for (let y = 2.6; y < H - 2; y += 2.6) {
    k.box(left - 0.3, 0.07, 0.06, '#aeb0b6', X - W / 2 + left / 2, y, fz + T / 2 + 0.01, { r: 0, jitter: 0 });
    k.box(right - 0.3, 0.07, 0.06, '#aeb0b6', win.x1 + right / 2, y, fz + T / 2 + 0.01, { r: 0, jitter: 0 });
  }
  // inside: a tiled floor, the machine, three engineers
  k.box(W - 2 * T, 0.5, D - 2 * T, '#cac7cf', X, 0, Z, { r: 0, shade: 0, jitter: 0.01 });
  for (let x = X - W / 2 + 1.8; x < X + W / 2 - 1; x += 1.8) k.box(0.05, 0.02, D - 2 * T - 0.2, '#b3afba', x, 0.5, Z, { r: 0, jitter: 0 });
  const glowK = new Kit();
  euvMachine(k, -7, Z - 1.6, glowK, accent);
  bunnySuit(k, -16.2, Z + 3.4, 0.6);
  bunnySuit(k, -0.6, Z + 3.2, -0.5);
  bunnySuit(k, 2.4, Z + 2.2, -1.2);
  // the room's light: yellow litho light on the back wall and the ceiling filters, a lamp inside
  const room = glowMat('#ffe7a0', 0);
  room.userData.manual = true;
  room.color.copy(col('#f2e4b6'));
  const rk = new Kit();
  rk.box(W - 2 * T - 0.4, H - 4, 0.06, '#ffffff', X, 1.0, Z - D / 2 + T + 0.04, { r: 0, jitter: 0, shade: 0 });
  for (let x = X - W / 2 + 2.5; x < X + W / 2 - 2; x += 2.6)
    for (let z = Z - D / 2 + 2; z < Z + D / 2 - 1.5; z += 2.6) rk.box(2.1, 0.06, 2.1, '#ffffff', x, H - 0.12, z, { r: 0, jitter: 0, shade: 0 });
  const roomMesh = rk.build(room);
  roomMesh.castShadow = false;
  g.add(roomMesh);
  const machineGlow = glowMat('#c98cf0', 0);
  machineGlow.userData.manual = true;
  const mg = glowK.build(machineGlow);
  mg.castShadow = false;
  g.add(mg);
  const lamp = new THREE.PointLight(0xffe2a0, 30, 16, 1.5);
  lamp.position.set(-7, 5.5, Z + 5.2);
  g.add(lamp);
  // the window glass
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0, win.y1 - win.y0), glassMat);
  glass.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, fz + 0.2);
  glass.renderOrder = 3;
  g.add(glass);
  // the entrance and the crating annex on the right
  k.box(5.6, 0.35, 3.2, accent, 8.6, 3.6, Z + D / 2 + 1.6, { r: 0.08, shade: 0 });
  for (const sx of [-2.4, 2.4]) k.box(0.18, 3.6, 0.18, '#e6e0e3', 8.6 + sx, 0, Z + D / 2 + 3, { r: 0, jitter: 0 });
  curtain(k, lit, 8.6, 0.5, Z + D / 2 + 0.31, 4.6, 3.0, { bay: 1.15, floor: 3, glass: '#3f6f80', litFrac: 1 });
  block(k, 17.2, -6.5, 8.8, 14, 8, { wall: '#d6d2cb', band: accent, bandH: 0.4, ribs: 0.9, r: 0.22, faces: ['f', 'r'] });
  k.box(5.4, 5.8, 0.2, '#9d95a6', 17.2, 0.45, 0.55, { r: 0.03 });
  for (let y = 0.8; y < 6.2; y += 0.35) k.box(5.3, 0.04, 0.06, '#7a7186', 17.2, y, 0.68, { r: 0, jitter: 0 });
  // roof plant
  for (let i = 0; i < 3; i++) airHandler(k, fans, X - 10.5 + i * 10, H + 0.7, Z - 3.5, 7.6, 2.4, 1.5, 3);
  for (let i = 0; i < 4; i++) stack(k, X - 12 + i * 3.4, H + 0.7, Z + 3.6, 0.4, 3.4, '#d8d2d6', i % 2 ? accent : null);
  // forecourt
  k.box(W, 0.07, 4.2, '#d2c9bd', X, G, Z + D / 2 + 3.1, { r: 0.03, shade: 0, jitter: 0.02 });
  shrubs(k, [[-19.6, 12.6, 1], [-17.2, 13.1, 0.9], [-14.8, 12.8, 1], [-3.2, 13, 0.9], [-0.8, 12.7, 1]]);
  tree(k, -20.4, 9.2, 1);
  carPark(k, 15, 11.8, 13, 4.8);
  parkedCars(g, 9.2, 11.7, 6, 2.3, o.seed + 3, Math.PI / 2);
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[8.6, 3.3, Z + D / 2 + 0.3], [17.2, 6.6, 0.6]], 2.4, 3.4);
  let flash = 0;
  return {
    obj: g, w: 44, d: 30, h: H + 2.4,
    // the glazed entrance under the canopy
    doors: [{ x: 8.6, z: Z + D / 2 + 0.31 + 0.7 }],
    update(e: Env) {
      fans.update(e);
      room.emissiveIntensity = 0.38 + e.night * 0.7;
      lamp.intensity = 26 + e.night * 18;
      // the tin-plasma source pulses; status lights breathe
      flash = Math.max(0, flash - e.dt * 4);
      if (Math.random() < e.dt * 2.5) flash = 1;
      machineGlow.emissiveIntensity = 0.55 + e.night * 1.6 + flash * (0.8 + e.night * 2);
    },
  };
};
const glassMat = withClouds(new THREE.MeshStandardMaterial({ color: col('#b8d4e6'), transparent: true, opacity: 0.12, roughness: 0.08, metalness: 0.1, depthWrite: false }));

// ── Bondline's packaging lines ───────────────────────────────────────────────────────────────
/** A sawtooth roof: teeth along x with their glazed faces towards -x. */
function sawtooth(k: Kit, lit: Lit, x0: number, x1: number, z: number, d: number, y: number, rise: number, n: number, roof: Paint) {
  const p = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * p;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(0.15, rise);
    sh.lineTo(0.6, rise);
    sh.lineTo(p, 0);
    sh.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, steps: 1 });
    geo.translate(xa, y, z - d / 2);
    k.geo(geo, roof, 0.04, 0);
    // the glazed face with mullions
    k.box(0.06, rise - 0.3, d - 0.6, '#3d5f6e', xa - 0.02, y + 0.15, z, { r: 0, jitter: 0, shade: 0 });
    for (let zz = z - d / 2 + 0.4; zz <= z + d / 2 - 0.3; zz += 1.4) k.box(0.1, rise - 0.2, 0.08, '#5b5562', xa - 0.06, y + 0.1, zz, { r: 0, jitter: 0 });
    lit.paneX(d - 0.8, rise - 0.5, xa - 0.07, y + 0.25, z);
  }
}

const pkgLines: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  const lit = new Lit('#e8fff4', 0.7);
  const accent = b.accent;
  const X = -3, Z = -3, W = 38, D = 15, H = 6.4;
  block(k, X, Z, W, D, H, { wall: '#e0dcd6', band: accent, bandH: 0.5, joints: 1.6, r: 0.28 });
  sawtooth(k, lit, X - W / 2 + 0.6, X + W / 2 - 0.6, Z, D - 1.2, H + 0.12, 2.3, 9, '#8f8a96');
  // the office strip in front with the name
  const ox = -15, oz = Z + D / 2 + 1.7;
  block(k, ox, oz, 12, 3.4, 4.6, { wall: '#ece6dc', band: accent, bandH: 0.6, r: 0.18 });
  curtain(k, lit, ox, 0.7, oz + 1.7, 11, 2.8, { bay: 1.2, floor: 2.8, seed: o.seed });
  putSign(g, b.name, 8.4, ox, 4.6 - 0.8, oz + 1.79, '#fbf7f0', null, 0, true, 0.5);
  // docks along the front on the right
  const docks = [-1.5, 3.0, 7.5];
  for (const x of docks) {
    k.box(2.8, 3.2, 0.2, '#2f2a3d', x, 0.5, Z + D / 2 + 0.08, { r: 0.04, shade: 0 });
    k.box(2.3, 2.8, 0.1, '#9d95a6', x, 0.55, Z + D / 2 + 0.2, { r: 0, jitter: 0.02 });
    for (let y = 0.8; y < 3.3; y += 0.32) k.box(2.28, 0.04, 0.05, '#7a7186', x, y, Z + D / 2 + 0.26, { r: 0, jitter: 0 });
    k.cyl(0.12, 0.12, 1.0, '#fbd46e', x + 1.7, 0, Z + D / 2 + 1, 8);
  }
  k.box(12, 1.0, 0.9, '#a39a91', 3, 0, Z + D / 2 + 0.45, { r: 0.05 });
  k.box(20, 0.07, 7, '#c8bfb2', 4, G, 10, { r: 0.03, shade: 0, jitter: 0.02 });
  parkVehicle(g, 'van', 5.2, docks[1], Z + D / 2 + 3.6, Math.PI / 2, 0.1);
  // the utility yard at the right end: nitrogen, chillers, a transformer
  vTank(k, 20.2, -8.4, 1.2, 7.2, '#ece6dc', 0.9, accent);
  for (const z of [-3.2, 0.6]) {
    k.box(3.0, 1.6, 3.0, P.plant, 20.4, 0.1, z, { r: 0.12 });
    fans.add(19.7, 1.95, z - 0.7, 0.6);
    fans.add(21.1, 1.95, z + 0.7, 0.6);
  }
  xfmr(k, 20.4, 5, 0.85);
  pipeRun(k, [V(20.2, 2.0, -7.1), V(18.4, 2.0, -7.1), V(16.0, 3.4, -7.1)], 0.12);
  // rooftop: a plant deck at the back, a few stacks
  for (let i = 0; i < 4; i++) stack(k, X - 14 + i * 9, H + 0.1, Z - D / 2 + 0.9, 0.34, 3.2, '#d8d2d6', i % 2 ? accent : null);
  shrubs(k, [[-22, 12.2, 1], [-19.8, 12.6, 0.9], [-12, 12.4, 1], [-9.8, 12.1, 0.85]]);
  tree(k, -22.4, 9.6, 0.9);
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, docks.map((x) => [x, 3.9, Z + D / 2 + 0.1] as [number, number, number]), 2.6, 3);
  // (the office strip's glass front is the way in)
  return { obj: g, w: 48, d: 28, h: H + 2.6, doors: [{ x: ox, z: oz + 1.7 + 0.7 }], update(e) { fans.update(e); } };
};

// ── Cumulus Cloud's rental halls ─────────────────────────────────────────────────────────────
/** The Cumulus mark: a little cloud of spheres on a bar. */
function cloudMark(k: Kit, x: number, y: number, z: number, s: number, c: Paint) {
  for (const [dx, dy, r] of [[-0.55, 0, 0.42], [0, 0.22, 0.58], [0.55, 0.02, 0.45], [0.95, -0.1, 0.3], [-0.95, -0.1, 0.3]])
    k.geo(new THREE.SphereGeometry(r * s, 12, 8).scale(1, 1, 0.35).translate(x + dx * s, y + dy * s, z), c, 0.02);
}

const cloudHall: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const v = o.variant ?? '';
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  const lit = new Lit('#ffe6b8', 1.1);
  const accent = b.accent;
  const two = v === 'c';
  const W = v === 'b' ? 32 : 29, D = 14, H = two ? 9.6 : 6.6, Z = -3.2, X = v === 'b' ? 0 : 1.5;
  block(k, X, Z, W, D, H, { wall: '#ddd8d2', band: accent, bandH: 0.5, ribs: 1.15, r: 0.22, faces: ['f', 'l', 'r'] });
  if (two) k.box(W + 0.08, 0.3, D + 0.08, '#b9b1a6', X, H / 2, Z, { r: 0.04, shade: 0 });
  // the cyan clerestory band (busy halls glow at night)
  const band = glowMat('cyn5', 0);
  band.userData.manual = true;
  const bk = new Kit();
  for (const z of [Z + D / 2 + 0.09, Z - D / 2 - 0.09]) bk.box(W - 1.6, 0.32, 0.04, '#ffffff', X, H - 1.25, z, { r: 0, jitter: 0, shade: 0 });
  const bm = bk.build(band);
  bm.castShadow = false;
  g.add(bm);
  // rooftop chillers in rows
  const rows = v === 'b' ? 3 : 2;
  for (let row = 0; row < rows; row++)
    for (let c = 0; c < Math.floor((W - 1.6) / 3.3); c++) {
      const x = X - W / 2 + 2.4 + c * 3.3, z = Z - D / 2 + 3 + row * ((D - 6) / Math.max(1, rows - 1));
      k.box(2.8, 1.05, 2.3, P.plant, x, H, z, { r: 0.1, jitter: 0.03 });
      k.box(2.86, 0.16, 2.36, P.plant2, x, H + 0.02, z, { r: 0, shade: 0 });
      fans.add(x - 0.68, H + 1.15, z, 0.56);
      fans.add(x + 0.68, H + 1.15, z, 0.56);
    }
  // generators along the back with exhaust stubs
  for (let i = 0; i < 6; i++) {
    const x = X - W / 2 + 2.8 + i * ((W - 5.6) / 5);
    k.box(3.6, 1.8, 1.7, '#e7dfd2', x, 0, Z - D / 2 - 2.4, { r: 0.12 });
    k.box(3.62, 0.34, 1.72, accent, x, 0, Z - D / 2 - 2.4, { r: 0.05, shade: 0 });
    k.cyl(0.14, 0.14, 1.0, '#5b5562', x + 1.2, 1.8, Z - D / 2 - 2.7, 6);
  }
  k.box(W - 2, 0.25, 0.5, P.trim, X, 2.3, Z - D / 2 - 0.9, { r: 0.04 });
  // the entrance block with the blue canopy (and the name, on two of the three)
  const ex = X - W / 2 + 3.4;
  k.box(4.4, 3.6, 2.2, '#efe8de', ex, 0.4, Z + D / 2 + 1, { r: 0.15 });
  k.box(5.0, 0.3, 3.2, accent, ex, 3.4, Z + D / 2 + 1.4, { r: 0.08, shade: 0 });
  curtain(k, lit, ex, 0.5, Z + D / 2 + 2.12, 3.6, 2.8, { bay: 1.2, floor: 2.8, glass: '#3f6f80', litFrac: 1 });
  if (v !== 'b') {
    signPanel(g, k, b.name, 9, 1.2, X + 3, H - 2.5, Z + D / 2 + 0.04, accent);
    cloudMark(k, X - 3.6, H - 2.4, Z + D / 2 + 0.2, 1.1, '#fbf7f0');
  }
  // docks on the right
  for (const x of [X + W / 2 - 3, X + W / 2 - 6.2]) {
    k.box(2.6, 2.9, 0.12, '#8a8490', x, 0.5, Z + D / 2 + 0.08, { r: 0.02 });
    for (let y = 0.8; y < 3.3; y += 0.3) k.box(2.5, 0.04, 0.05, '#7a7186', x, y, Z + D / 2 + 0.16, { r: 0, jitter: 0 });
  }
  // the front: transformers + car park, or a generator yard ('b'), or a substation ('c')
  if (v === 'b') {
    for (let i = 0; i < 4; i++) {
      const x = -12 + i * 4.4;
      k.box(3.6, 1.9, 1.8, '#e7dfd2', x, 0, 9.6, { r: 0.12 });
      k.box(3.62, 0.34, 1.82, accent, x, 0, 9.6, { r: 0.05, shade: 0 });
    }
    hTank(k, 4.6, 9.4, 0.8, 2.2, '#e6e0e3', true, 0.3);
  } else {
    carPark(k, -7.5, 9.8, 12, 4.4);
    parkedCars(g, -12.4, 9.8, 6, 2.2, o.seed + 9, Math.PI / 2);
  }
  const tx = v === 'c' ? 6.5 : 9;
  const nT = v === 'c' ? 3 : 2;
  for (let i = 0; i < nT; i++) {
    const x = tx + i * 3;
    xfmr(k, x, 9.6, 0.78);
  }
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[ex, 3.2, Z + D / 2 + 2.2], [X + W / 2 - 3, 3.6, Z + D / 2], [X + W / 2 - 6.2, 3.6, Z + D / 2]], 2.4, 3.4);
  const genPool = poolMat('#ffe2b0', 0.45);
  for (let i = 0; i < 6; i++) lightPool(g, X - W / 2 + 2.8 + i * ((W - 5.6) / 5), 0, Z - D / 2 - 3.8, 2.6, genPool);
  return {
    obj: g, w: 36, d: 28, h: H + 2.4,
    // the entrance block's glass doors, under the canopy
    doors: [{ x: ex, z: Z + D / 2 + 2.12 + 0.7 }],
    update(e) {
      fans.update(e);
      band.emissiveIntensity = 0.5 + e.night * 1.2;
    },
  };
};
export const FAB_PIECES = { logicFab, memFab, euvHall, pkgLines, cloudHall };
