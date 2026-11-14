/**
 * The small set pieces: a corporate office, a bulk-gas yard, a logistics warehouse, Veldt's crate
 * yard, and the subsea cable landing station with its beach manhole.
 */
import * as THREE from 'three';
import { glowMat, Kit, mix, rng, type Paint } from '../../kit';
import { fence, fenceMesh } from '../../pieces';
import { parkedCars } from '../life';
import type { SetPieceFactory } from '../registry';
import {
  airHandler, beacon, block, brandOf, curtain, G, Fans, Flag, forklift, hTank, lamps, Lit, P, parkVehicle, pipeRun, putSign, shrubs, signPanel, tree, V, vTank, wallLights, wheel,
} from './common';

// ── admin: a corporate office block ──────────────────────────────────────────────────────────
const admin: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const r = rng(o.seed);
  const k = new Kit(r);
  const lit = new Lit('#ffe6b8', 1.1);
  const fans = new Fans();
  const W = 11.5, D = 8.5, H = 11.6;
  const bx = -2.6, bz = -2.6;
  // the tower: a cream frame with glass floors, a solid core on the right
  block(k, bx, bz, W, D, H, { wall: '#e9e3d8', band: null, r: 0.25 });
  curtain(k, lit, bx - 0.8, 4.9, bz + D / 2, W - 3.4, H - 7.3, { bay: 1.45, floor: 2.15, seed: o.seed });
  curtain(k, lit, bx - W / 2, 1.0, bz + 0.2, D - 2.4, H - 3.4, { bay: 1.45, floor: 2.06, facing: '-x', seed: o.seed + 1 });
  // a podium band and fins in the brand colour
  k.box(W + 0.12, 0.35, D + 0.12, '#cfc7bb', bx, 4.35, bz, { r: 0.05, shade: 0 });
  for (const fx of [-W / 2 + 0.3, W / 2 - 3.4]) k.box(0.3, H - 6.6, 0.5, b.hi, bx + fx + 0.25, 4.7, bz + D / 2 + 0.2, { r: 0.06, shade: 0 });
  // the brand band across the top, with the name
  k.box(W + 0.1, 1.25, D + 0.1, b.accent, bx, H - 1.95, bz, { r: 0.06, shade: 0, jitter: 0.02 });
  putSign(g, b.name, Math.min(W - 2, 0.9 * b.name.length + 1.2), bx, H - 1.33, bz + D / 2 + 0.07, '#fbf7f0', null, 0, true, 1.1);
  // stair core with slit windows
  k.box(2.4, H + 1.1, 3, '#cfc7bb', bx + W / 2 - 1.0, 0, bz + D / 2 - 1.6, { r: 0.15, shade: 0.12 });
  for (let y = 1.6; y < H - 1; y += 2.4) lit.pane(0.5, 1.4, bx + W / 2 - 1.0, y, bz + D / 2 - 0.08);
  for (let y = 1.6; y < H - 1; y += 2.4) k.box(0.6, 1.5, 0.06, P.glassB, bx + W / 2 - 1.0, y - 0.05, bz + D / 2 - 0.08, { r: 0, jitter: 0 });
  // a double-height glass lobby with a canopy
  k.box(7.2, 4.2, 3.2, '#e9e3d8', bx - 1.4, 0.35, bz + D / 2 + 1.6, { r: 0.12, shade: 0.1 });
  curtain(k, lit, bx - 1.4, 0.4, bz + D / 2 + 3.22, 6.4, 3.6, { bay: 1.3, floor: 3.6, glass: '#3f6f80', litFrac: 1 });
  k.box(8.4, 0.32, 4.6, b.accent, bx - 1.4, 4.4, bz + D / 2 + 2.2, { r: 0.1, shade: 0 });
  k.box(1.8, 2.4, 0.1, '#2f3f4a', bx - 1.4, 0.4, bz + D / 2 + 3.3, { r: 0, jitter: 0 });
  // roof plant
  airHandler(k, fans, bx - 1.5, H, bz - 1.2, 4.2, 2.0, 1.3, 2);
  k.box(2.6, 1.6, 2.2, '#cfc7bb', bx + 2.8, H, bz - 1.6, { r: 0.1 });
  // forecourt: paving, flags, planters, trees
  k.box(9.4, 0.07, 3, '#d2c9bd', bx - 1.2, G, bz + D / 2 + 4.6, { r: 0.03, shade: 0, jitter: 0.02 });
  const flags: Flag[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new Flag(k, -8.5 + i * 1.6, 7.0, 7.8 - i * 0.35, i === 1 ? [b.accent, '#fbf7f0', b.accent] : [b.accent, b.hi], { w: 2.3, fh: 1.4, rows: i !== 1, phase: i * 1.7 });
    flags.push(f);
    g.add(f.obj);
  }
  shrubs(k, [[-1.2, 7.1, 0.8], [0.4, 7.2, 0.9], [2.0, 7.0, 0.8], [3.4, 7.2, 0.75]]);
  tree(k, -7.5, 3.6, 0.9);
  tree(k, 6.6, -6.2, 0.95);
  // car park on the right, bays along z
  k.box(4.2, 0.06, 10.5, P.asphalt, 6.4, G, -0.6, { r: 0.03, shade: 0 });
  for (let z = -5.6; z <= 4.6; z += 2.3) k.box(1.9, 0.02, 0.1, '#e6e0e3', 7.6, G + 0.06, z, { r: 0, jitter: 0 });
  const cars = new THREE.Group();
  // (the bays are 4.2 m deep: saloons and hatchbacks, nothing whose tail would stand out in the lane)
  parkedCars(cars, -4.5, 0, 4, 2.3, o.seed + 3, 0, ['sedan', 'hatchback']);
  cars.rotation.y = -Math.PI / 2;
  cars.position.set(6.4, 0, -0.6);
  g.add(cars);
  fans.build(g, k);
  g.add(k.build());
  lit.build(g);
  wallLights(g, [[bx - 1.4, 3.9, bz + D / 2 + 3.3]], 2.6, 3.6);
  return {
    obj: g, w: 18, d: 16, h: H + 1.4,
    update(e) { fans.update(e); for (const f of flags) f.update(e); },
  };
};

// ── gasYard: bulk specialty gases ────────────────────────────────────────────────────────────
/** A bank of finned ambient-air vaporisers (frosty at the bottom). */
function vaporisers(k: Kit, x: number, z: number, nx: number, nz: number, h: number) {
  const s = 0.62;
  k.box(nx * s + 0.4, 0.3, nz * s + 0.4, P.concrete, x, 0, z, { r: 0.04 });
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const cx = x - ((nx - 1) * s) / 2 + i * s, cz = z - ((nz - 1) * s) / 2 + j * s;
      // a star-finned tube: two crossed fins, frosted white below
      for (const ry of [Math.PI / 4, -Math.PI / 4]) {
        k.box(0.5, h * 0.42, 0.07, '#eef4f6', cx, 0.3, cz, { r: 0, jitter: 0.02, shade: 0, ry });
        k.box(0.46, h * 0.58, 0.06, '#c9ced2', cx, 0.3 + h * 0.42, cz, { r: 0, jitter: 0.02, shade: 0, ry });
      }
    }
  // headers along the top and the bottom
  for (const y of [0.55, h + 0.2]) k.box(nx * s + 0.2, 0.2, 0.2, P.trim, x, y, z - (nz * s) / 2 - 0.05, { r: 0.04 });
  for (const sx of [-1, 1]) k.box(0.12, h + 0.5, 0.12, P.trim, x + sx * (nx * s / 2 + 0.1), 0.3, z - (nz * s) / 2 - 0.05, { r: 0, jitter: 0 });
}

const gasYard: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  // a concrete pad with a kerb
  k.box(15.2, 0.1, 13.2, '#cbc2b6', 0, G, 0, { r: 0.05, shade: 0 });
  // three cryogenic tanks at the back (N2, O2, Ar) and a horizontal one at the front
  vTank(k, -5.2, -3.6, 1.35, 8.6, '#ece6dc', 1.0, b.accent);
  vTank(k, -1.9, -3.9, 1.2, 7.6, '#e6e0e3', 1.0, '#4a7cb6');
  vTank(k, 1.2, -4.0, 1.0, 6.2, '#e6e0e3', 0.9, '#5a9537');
  hTank(k, -3.2, 3.1, 0.95, 4.6, '#ece6dc');
  // vaporiser banks on the right
  vaporisers(k, 4.8, -3.2, 4, 3, 5.4);
  vaporisers(k, 4.8, 0.9, 4, 2, 4.4);
  // pipes: tanks → vaporisers → out along a low rack to the fab next door (+x)
  const py = 1.4;
  pipeRun(k, [V(-5.2, 1.2, -2.2), V(-5.2, py, -1.2), V(3.0, py, -1.2), V(3.0, py, -4.6)], 0.11, '#9d95a6');
  pipeRun(k, [V(-1.9, 1.2, -2.6), V(-1.9, py + 0.3, -2.6), V(-1.9, py + 0.3, -1.6)], 0.09, '#9d95a6');
  pipeRun(k, [V(6.9, 2.0, -3.2), V(7.4, 2.0, -3.2), V(7.4, 2.4, 2.6), V(7.9, 2.4, 2.6)], 0.12, '#c3bcc7');
  for (const z of [-2, 0.4, 2.6]) k.box(0.14, 2.4, 0.14, P.trim, 7.4, 0, z, { r: 0, jitter: 0 });
  // a little control shed and a tube trailer of specialty gas at the front
  k.box(2.6, 2.3, 2.1, '#ddd6cc', 1.4, 0.14, 2.9, { r: 0.12 });
  k.box(2.8, 0.18, 2.3, P.roof, 1.4, 2.42, 2.9, { r: 0.05 });
  k.box(0.8, 1.7, 0.06, '#5b5562', 1.0, 0.2, 3.97, { r: 0, jitter: 0 });
  k.box(2.6, 0.12, 0.08, b.accent, 1.4, 2.0, 3.98, { r: 0, jitter: 0, shade: 0 });
  // tube trailer along x
  const tx = -2.4, tz = 5.6;
  k.box(6.8, 0.25, 1.6, '#5b5562', tx, 0.9, tz, { r: 0.04 });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
    const gg = new THREE.CapsuleGeometry(0.27, 5.8, 4, 10).rotateZ(Math.PI / 2).translate(tx, 1.45 + i * 0.56, tz - 0.56 + j * 0.56);
    k.geo(gg, j === 1 && i === 1 ? b.accent : '#d8d2d6', 0.03, 0);
  }
  k.box(0.2, 1.6, 1.8, P.trim, tx - 3.1, 1.1, tz, { r: 0.02 });
  k.box(0.2, 1.6, 1.8, P.trim, tx + 3.1, 1.1, tz, { r: 0.02 });
  for (const sx of [1.6, 2.6]) for (const sz of [-0.75, 0.75]) wheel(k, tx + sx, 0.45, tz + sz, 0.45, 0.35);
  k.box(0.18, 0.9, 0.18, P.trim, tx - 2.6, 0, tz, { r: 0, jitter: 0 }); // landing leg
  // the fence
  fence(k, 15.6, 13.6, 4.4, '#8a8490');
  g.add(k.build());
  fenceMesh(g, 15.6, 13.6, 4.4);
  wallLights(g, [[1.4, 2.1, 3.97]], 2, 2.8);
  return { obj: g, w: 16, d: 14, h: 10.8 };
};

// ── warehouse: logistics with docks and a truck ──────────────────────────────────────────────
const warehouse: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const lit = new Lit('#ffe2a8', 1.0);
  const W = 22.4, D = 10, H = 7.2, z0 = -2.6;
  block(k, 0, z0, W, D, H, { wall: '#d6d2cb', roof: '#8f8a96', band: b.accent, bandH: 0.5, ribs: 0.9, r: 0.22, faces: ['f', 'l', 'r'] });
  // standing-seam roof, skylights, a few vents
  for (let x = -W / 2 + 0.8; x < W / 2 - 0.5; x += 0.75) k.box(0.06, 0.06, D - 0.7, '#a39ead', x, H + 0.14, z0, { r: 0, jitter: 0 });
  for (let x = -7.5; x <= 7.5; x += 5) k.box(0.9, 0.24, D - 3.4, '#b9d3dc', x, H + 0.12, z0, { r: 0.04, shade: 0 });
  for (const x of [-9, -1.3, 9.4]) k.cyl(0.32, 0.32, 0.7, '#c3bcc7', x, H + 0.1, z0 - 2.6, 10);
  // docks: doors with seals, levellers, bumpers and bollards
  const docks = [-1.2, 2.6, 6.4, 10.0].map((x) => x - 1.4);
  for (const x of docks) {
    k.box(2.9, 3.3, 0.22, '#2f2a3d', x, 0.5, z0 + D / 2 + 0.08, { r: 0.05, shade: 0 });
    k.box(2.4, 2.9, 0.1, '#9d95a6', x, 0.55, z0 + D / 2 + 0.2, { r: 0, jitter: 0.02 });
    for (let y = 0.8; y < 3.4; y += 0.32) k.box(2.38, 0.04, 0.05, '#7a7186', x, y, z0 + D / 2 + 0.26, { r: 0, jitter: 0 });
    k.box(0.3, 0.5, 0.3, '#2f2a3d', x - 1.2, 0.6, z0 + D / 2 + 0.3, { r: 0.04 });
    k.box(0.3, 0.5, 0.3, '#2f2a3d', x + 1.2, 0.6, z0 + D / 2 + 0.3, { r: 0.04 });
    k.cyl(0.12, 0.12, 1.0, '#fbd46e', x + 1.8, 0, z0 + D / 2 + 1.0, 8);
  }
  k.box(15, 1.0, 0.9, '#a39a91', 4.2, 0, z0 + D / 2 + 0.4, { r: 0.05 }); // dock apron
  // the office corner: two floors of glass
  k.box(5.2, 6.2, 3.0, '#ece6dc', -8.0, 0.4, z0 + D / 2 + 1.2, { r: 0.15 });
  curtain(k, lit, -8.0, 0.8, z0 + D / 2 + 2.72, 4.6, 5.0, { bay: 1.15, floor: 2.5, seed: o.seed });
  k.box(5.4, 0.3, 3.2, b.accent, -8.0, 6.6, z0 + D / 2 + 1.2, { r: 0.06, shade: 0 });
  // (on its own panel under the band: white letters half on the band, half on the cream wall could not be read)
  signPanel(g, k, b.name, Math.min(9, b.name.length * 0.85 + 1), 1.0, 3.2, H - 2.0, z0 + D / 2 + 0.04, b.accent);
  // yard: concrete apron with lane paint
  k.box(W, 0.07, 5.8, '#c8bfb2', 0, G, 5.0, { r: 0.03, shade: 0, jitter: 0.02 });
  for (const x of docks) k.box(0.12, 0.02, 5.2, '#fbd46e', x - 1.6, G + 0.07, 5.4, { r: 0, jitter: 0 });
  g.add(k.build());
  lit.build(g);
  // a van backed into a dock, a semi pulling up
  parkVehicle(g, 'van', 5.2, docks[0], z0 + D / 2 + 3.5, Math.PI / 2, 0.55);
  parkVehicle(g, 'semitruck', 10.5, 5.6, 6.2, Math.PI);
  wallLights(g, docks.map((x) => [x, 4.1, z0 + D / 2 + 0.1] as [number, number, number]), 2.6, 3);
  return { obj: g, w: 24, d: 16, h: H + 0.7 };
};

// ── crateYard: Veldt's machines in crates, waiting to ship ───────────────────────────────────
function crate(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, kind: 'wood' | 'case', accent: Paint, ry = 0) {
  if (kind === 'wood') {
    k.box(w, h, d, '#c99a5e', x, y, z, { r: 0.05, jitter: 0.06, shade: 0.12, ry });
    // battens round the edges and across
    const bat: Paint = '#9c6c3d';
    const c = Math.cos(ry), s = Math.sin(ry);
    const off = (ax: number, az: number) => [x + ax * c + az * s, z - ax * s + az * c] as const;
    for (const sy of [0, h - 0.14]) {
      for (const az of [-d / 2, d / 2]) { const [px, pz] = off(0, az); k.box(w + 0.06, 0.16, 0.1, bat, px, y + sy, pz, { r: 0, jitter: 0.04, shade: 0, ry }); }
      for (const ax of [-w / 2, w / 2]) { const [px, pz] = off(ax, 0); k.box(0.1, 0.16, d - 0.1, bat, px, y + sy, pz, { r: 0, jitter: 0.04, shade: 0, ry }); }
    }
    for (const ax of [-w / 2 + 0.08, w / 2 - 0.08]) for (const az of [-d / 2 + 0.08, d / 2 - 0.08]) {
      const [px, pz] = off(ax, az);
      k.box(0.18, h, 0.18, bat, px, y, pz, { r: 0, jitter: 0.04, shade: 0, ry });
    }
    const [mx, mz] = off(0, d / 2 + 0.03);
    k.box(w * 0.9, 0.14, 0.06, bat, mx, y + h * 0.5, mz, { r: 0, jitter: 0.04, shade: 0, ry });
    // "this way up"
    const [ax2, az2] = off(-w * 0.3, d / 2 + 0.04);
    k.box(0.12, 0.42, 0.04, '#2f2a3d', ax2 - 0.12 * c, y + h * 0.62, az2 + 0.12 * s, { r: 0, jitter: 0, shade: 0, ry });
    k.box(0.12, 0.42, 0.04, '#2f2a3d', ax2 + 0.12 * c, y + h * 0.62, az2 - 0.12 * s, { r: 0, jitter: 0, shade: 0, ry });
  } else {
    k.box(w, h, d, '#e9e5e2', x, y, z, { r: 0.14, jitter: 0.03, shade: 0.1, ry });
    k.box(w + 0.04, 0.3, d + 0.04, accent, x, y + h * 0.66, z, { r: 0.04, shade: 0, ry });
    k.box(w + 0.08, 0.22, d + 0.08, '#5b5562', x, y, z, { r: 0.04, shade: 0, ry });
  }
}

const crateYard: SetPieceFactory = (o) => {
  const b = brandOf(o);
  const g = new THREE.Group();
  const r = rng(o.seed);
  const k = new Kit(r);
  k.box(17.2, 0.08, 13.2, '#b7aea3', 0, G, 0, { r: 0.04, shade: 0 });
  for (const z of [-0.6, 3.6]) k.box(16.4, 0.02, 0.12, '#fbd46e', 0, G + 0.08, z, { r: 0, jitter: 0 });
  const acc = b.accent;
  // rows of crates at the back, a stack of two, white flight cases
  crate(k, -6.0, 0.1, -4.6, 4.0, 2.6, 2.8, 'wood', acc);
  crate(k, -6.0, 2.7, -4.6, 3.2, 1.9, 2.4, 'wood', acc, 0.05);
  crate(k, -1.6, 0.1, -4.8, 3.6, 3.0, 2.6, 'wood', acc);
  crate(k, 2.4, 0.1, -4.5, 3.0, 2.2, 3.0, 'case', acc);
  crate(k, 5.9, 0.1, -4.7, 3.2, 2.6, 2.6, 'wood', acc, -0.04);
  crate(k, 5.9, 2.7, -4.7, 2.4, 1.6, 2.0, 'case', acc, 0.08);
  crate(k, -6.4, 0.1, -1.0, 2.6, 1.8, 2.0, 'case', acc, 0.1);
  crate(k, 7.0, 0.1, -1.2, 2.2, 1.6, 2.2, 'wood', acc, 0.2);
  // pallets of spares
  for (const [x, z] of [[-3.0, -1.3], [-1.6, -1.1]]) {
    k.box(1.2, 0.18, 1.2, '#9c6c3d', x, 0.1, z, { r: 0.01 });
    k.box(1.1, 0.9, 1.1, '#d8cfc3', x, 0.28, z, { r: 0.06, jitter: 0.06 });
  }
  // the flatbed loading at the front with a crate already strapped on
  parkVehicle(g, 'flatbed', 8.4, -1.2, 5.0, 0);
  // a little site shed + the fence
  k.box(2.4, 2.2, 2.0, '#ece6dc', 7.0, 0.1, 4.6, { r: 0.1 });
  k.box(2.6, 0.16, 2.2, acc, 7.0, 2.3, 4.6, { r: 0.04, shade: 0 });
  fence(k, 17.6, 13.6, 6.5);
  // yard lamps at two corners, a light over the shed's door (the yard loads at night too)
  lamps(g, k, [[-8.1, 5.9]], [1, 0], 5.6);
  lamps(g, k, [[8.1, -6.0]], [-1, 0], 5.6);
  wallLights(g, [[7.0, 2.05, 5.6]], 1.6, 2.6);
  g.add(k.build());
  fenceMesh(g, 17.6, 13.6, 6.5);
  // the forklift shuttles between the stack and the truck
  const fl = forklift();
  const load = new Kit(rng(o.seed + 4));
  crate(load, 0, 0.1, 0.65, 1.6, 1.2, 1.2, 'wood', acc);
  const loadMesh = load.build();
  (fl.userData.forks as THREE.Group).add(loadMesh);
  g.add(fl);
  const flight = { a: new THREE.Vector3(2.4, 0, -1.8), b: new THREE.Vector3(2.4, 0, 2.2) };
  return {
    obj: g, w: 18, d: 14, h: 4.8,
    update(e) {
      const T = 14, t = (e.t % T) / T;
      // drive forward carrying, set it down, reverse empty, pick up again
      const ph = t < 0.4 ? t / 0.4 : t < 0.5 ? 1 : t < 0.9 ? 1 - (t - 0.5) / 0.4 : 0;
      const s = ph * ph * (3 - 2 * ph);
      fl.position.lerpVectors(flight.a, flight.b, s);
      fl.rotation.y = 0;
      const forks = fl.userData.forks as THREE.Group;
      forks.position.y = 0.15 + (t < 0.45 ? 0.5 : 0.05);
      loadMesh.visible = t < 0.47 || t > 0.95;
    },
  };
};

// ── cableHut: a subsea cable landing station (the sea is behind, at -z) ──────────────────────
const cableHut: SetPieceFactory = (o) => {
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  const fans = new Fans();
  k.box(13.4, 0.1, 11.4, '#c3bab0', 0, G, 0, { r: 0.04, shade: 0 });
  // the windowless station: board-marked concrete, a flat roof
  const W = 7.4, D = 5.2, H = 3.7, x0 = -1.4, z0 = -0.6;
  block(k, x0, z0, W, D, H, { wall: '#c9c1b6', roof: '#a39ead', edge: '#8a8490', joints: 0.9, r: 0.18 });
  for (const x of [x0 - 2.2, x0 + 1.4]) k.box(1.0, 0.5, 1.0, '#c3bcc7', x, H + 0.05, z0 - 0.8, { r: 0.08 });
  // steel door, a lit keypad, the CLS sign
  k.box(1.1, 2.3, 0.1, '#5b5562', x0 - 1.6, 0.45, z0 + D / 2 + 0.02, { r: 0.02 });
  k.box(1.3, 0.16, 0.6, '#9d95a6', x0 - 1.6, 2.85, z0 + D / 2 + 0.3, { r: 0.03 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.05), glowMat('cyn5', 0.5));
  pad.position.set(x0 - 0.85, 1.4, z0 + D / 2 + 0.05);
  g.add(pad);
  k.box(2.6, 0.9, 0.08, '#156466', x0 + 1.6, 2.1, z0 + D / 2 + 0.02, { r: 0.04, shade: 0 });
  putSign(g, o.label || 'CLS', 2.0, x0 + 1.6, 2.55, z0 + D / 2 + 0.08, '#fbf7f0', null, 0, false);
  // air-con condensers on the right wall, on the ground
  for (const z of [-2.0, 0.3]) {
    k.box(1.0, 1.1, 1.7, '#e6e0e3', x0 + W / 2 + 0.75, 0.12, z0 + z + 0.6, { r: 0.1 });
    k.cyl(0.55, 0.55, 0.08, P.fan, x0 + W / 2 + 0.75, 1.2, z0 + z + 0.6, 14, { shade: 0 });
    fans.add(x0 + W / 2 + 0.75, 1.27, z0 + z + 0.6, 0.5, 7);
  }
  // backup generator container and its fuel tank
  k.box(1.7, 1.9, 3.4, '#e7dfd2', -5.6, 0.12, -3.2, { r: 0.1 });
  k.box(1.72, 0.32, 3.42, 'org0', -5.6, 0.12, -3.2, { r: 0.05, shade: 0 });
  k.cyl(0.13, 0.13, 0.9, '#5b5562', -5.4, 2.0, -2.2, 6);
  hTank(k, -5.6, 0.4, 0.45, 1.4, '#e6e0e3', true, 0.2);
  // lattice mast with a dish and a beacon
  const mx = 4.6, mz = -4.0, mh = 9.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.beam(V(mx + sx * 0.55, 0, mz + sz * 0.55), V(mx + sx * 0.18, mh, mz + sz * 0.18), 0.08, '#9d95a6');
  for (let y = 0.8; y < mh - 0.5; y += 1.3) {
    const w0 = 0.55 - 0.37 * (y / mh), w1 = 0.55 - 0.37 * ((y + 1.3) / mh);
    k.beam(V(mx - w0, y, mz + w0), V(mx + w1, y + 1.3, mz + w1), 0.04, '#9d95a6');
    k.beam(V(mx + w0, y, mz - w0), V(mx + w1, y + 1.3, mz + w1), 0.04, '#9d95a6');
  }
  k.geo(new THREE.SphereGeometry(0.9, 14, 5, 0, Math.PI * 2, 0, Math.PI / 4.5).scale(1, 0.55, 1).rotateX(Math.PI / 2).translate(mx, mh * 0.72, mz + 1.15), '#e6e0e3', 0.02);
  k.box(0.12, 0.12, 0.5, '#9d95a6', mx, mh * 0.72, mz + 0.5, { r: 0, jitter: 0 });
  beacon(g, mx, mh + 0.25, mz, 0.6);
  // the cable ducts heading back to the beach: a trench of covers and a manhole chamber
  for (let z = z0 - D / 2 - 0.6; z > -5.4; z -= 1.1) k.box(1.6, 0.12, 1.0, '#a39a91', x0 - 0.6, 0.06, z, { r: 0.03, jitter: 0.04, shade: 0 });
  k.box(2.0, 0.22, 2.0, '#9d95a6', x0 - 0.6, 0.06, z0 - D / 2 - 1.2, { r: 0.05, shade: 0 });
  k.cyl(0.6, 0.6, 0.05, '#5b5562', x0 - 0.6, 0.28, z0 - D / 2 - 1.2, 16, { shade: 0 });
  for (const x of [-5.5, -3.0]) {
    for (let i = 0; i < 5; i++) k.cyl(0.09, 0.09, 0.26, i % 2 ? '#fbf7f0' : '#df5f3e', x, i * 0.26, -5.0, 8, { shade: 0 });
  }
  // bollards at the gate, the fence
  fence(k, 13.6, 11.6, 3.6, '#8a8490');
  for (const x of [-1.9, 1.9]) k.cyl(0.14, 0.14, 0.9, '#fbd46e', x, 0, 5.5, 8);
  fans.build(g, k);
  g.add(k.build());
  fenceMesh(g, 13.6, 11.6, 3.6);
  wallLights(g, [[x0 - 1.6, 2.7, z0 + D / 2], [x0 + 2.6, 3.0, z0 + D / 2]], 2.2, 3);
  return { obj: g, w: 14, d: 12, h: mh + 0.5, update(e) { fans.update(e); } };
};

// ── manhole: where the cable comes ashore ────────────────────────────────────────────────────
const manhole: SetPieceFactory = (o) => {
  const g = new THREE.Group();
  const k = new Kit(rng(o.seed));
  // a concrete collar flush with the sand, a heavy lid with lifting keys
  k.box(2.8, 0.2, 2.8, '#b7aea3', 0, -0.13, 0, { r: 0.06, jitter: 0.03, shade: 0 });
  k.box(2.2, 0.06, 2.2, '#a39a91', 0, 0.04, 0, { r: 0.02, shade: 0 });
  k.cyl(0.82, 0.82, 0.06, '#5b5562', 0, 0.06, 0, 20, { shade: 0 });
  k.cyl(0.6, 0.6, 0.02, '#6f6878', 0, 0.12, 0, 20, { shade: 0 });
  for (const x of [-0.35, 0.35]) k.box(0.18, 0.04, 0.07, '#433c52', x, 0.12, 0, { r: 0, jitter: 0 });
  // the striped marker post and its plate
  const px = 1.9, pz = 1.3;
  k.cyl(0.32, 0.36, 0.14, '#a39a91', px, 0, pz, 10, { shade: 0 });
  for (let i = 0; i < 7; i++) k.cyl(0.09, 0.09, 0.26, i % 2 ? '#2f2a3d' : '#fbd46e', px, 0.1 + i * 0.26, pz, 8, { shade: 0 });
  k.box(0.9, 0.55, 0.05, '#fbd46e', px, 1.35, pz + 0.11, { r: 0.02, shade: 0 });
  putSign(g, 'CABLE', 0.78, px, 1.62, pz + 0.145, '#2f2a3d', null, 0, false);
  // two concrete bollards and the buried route heading for the sea (-z)
  for (const [x, z] of [[-1.9, 1.6], [-1.9, -1.6]]) k.cyl(0.18, 0.2, 0.7, '#cfc7bb', x, 0, z, 8);
  for (let z = -1.8; z > -2.9; z -= 0.5) k.box(0.55, 0.03, 0.38, mix('#e6d4a4', '#9c6c3d', 0.3), 0, 0, z, { r: 0.01, jitter: 0.08, shade: 0 });
  g.add(k.build());
  return { obj: g, w: 6, d: 6, h: 2.2 };
};

export const SMALL_PIECES = { admin, gasYard, warehouse, crateYard, cableHut, manhole };
