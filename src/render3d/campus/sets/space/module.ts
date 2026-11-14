/**
 * A foundry module on the yards' spine (and its self-printed copy). Left to right: the smelter
 * drum rising out of the hull with its hopper heaped with hauled rock, the pressurised hull hung
 * under the spine (windows, livery, its number), radiator fins on the spine, and the open
 * fabrication bay where two yellow arms build the product on a jig; finished, the jig carries it
 * along the rail into the hull through a slot, and comes back empty for the next one.
 * Flags: halted (arms frozen, amber lights, a HALT plate), storm (flicker, crackles on the
 * radiators), q 1..3 (a drifting strain: a pulsing red ring round the module, pink windows,
 * jittering arms).
 */
import * as THREE from 'three';
import { Kit, rng, type Paint } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { hcyl, pipe } from '../mega/common';
import {
  Anim, blueprint, clamp, FeedLine, flicker, halo, lit, LocalPlane, paint, parseFlags, plate, radiatorMat, RobotArm, S, SPINE, Sparks, span,
  spaceTime, spacewalker, timed, truss, V, warnLamp, yardsZ, type BlueShape, type Product, asProduct, glassMat,
} from './common';
import { productBuild } from './products';

/** Where things are on a module (local x; z offsets from the spine's line). */
export const MOD = {
  hull: { x0: -13.6, x1: 0.4, y0: -4.8, y1: 5.7, z0: -6.0, z1: 4.8 },
  drum: { x: -9.4, z: -4.6, r: 2.9, y0: 5.7, y1: 19.4 },
  bay: { x0: 0.7, x1: 14.2, y0: -5.2, z0: -1.6, z1: 8.6 },
  railY: -4.2, prodZ: 3.0, prodX: 7.5, inX: -6.6,
};

export interface BodyOut {
  furnace: THREE.Vector3; furnaceN: THREE.Vector3;
  fins: { x: number; y0: number; y1: number; z0: number; z1: number }[];
  windows: [number, number, number][];
  topBeacon: THREE.Vector3;
  blue: BlueShape[];
}

/**
 * The module's static body (everything but the spine), into `k` (paint), `rad` (radiator fins),
 * `glass`: z is relative to the spine's line `zs`.
 */
export function moduleBody(k: Kit, rad: Kit, gk: Kit, zs: number, o: { accent: Paint; hi: Paint; n: number; vseed: number; product: Product; seed: number }): BodyOut {
  const r = rng(o.seed);
  const H = MOD.hull, Dm = MOD.drum, B = MOD.bay;
  const hz0 = zs + H.z0, hz1 = zs + H.z1, hcx = (H.x0 + H.x1) / 2, hw = H.x1 - H.x0, hh = H.y1 - H.y0;
  // ── the hull: a pale pressurised block, foil-wrapped at its far end ──
  k.box(hw, hh, H.z1 - H.z0, S.pale, hcx, H.y0, (hz0 + hz1) / 2, { r: 0.32, shade: 0.22, jitter: 0.03 });
  // panel seams and a white rim on the front
  for (let x = H.x0 + 1.7; x < H.x1 - 0.6; x += 1.75) k.box(0.07, hh - 1.0, 0.05, S.light, x, H.y0 + 0.5, hz1 + 0.01, { r: 0, jitter: 0, shade: 0 });
  k.box(hw - 0.3, 0.12, 0.06, S.light, hcx, H.y0 + 1.25, hz1 + 0.02, { r: 0, jitter: 0, shade: 0 });
  // the livery band and its hi stripe
  k.box(hw + 0.04, 0.62, 0.08, o.accent, hcx, H.y1 - 1.55, hz1 + 0.02, { r: 0.03, shade: 0 });
  k.box(hw + 0.04, 0.16, 0.09, o.hi, hcx, H.y1 - 1.82, hz1 + 0.02, { r: 0, shade: 0 });
  // foil on the left end wall and the back
  k.box(0.1, hh - 0.6, H.z1 - H.z0 - 0.6, S.foil, H.x0 - 0.02, H.y0 + 0.3, (hz0 + hz1) / 2, { r: 0.04, jitter: 0.08, shade: 0.15 });
  for (let i = 0; i < 4; i++) k.box(2.9, hh - 1.2, 0.1, i % 2 ? S.foil : S.foilD, H.x0 + 1.9 + i * 3.1, H.y0 + 0.6, hz0 - 0.02, { r: 0.04, jitter: 0.1, shade: 0.1 });
  // a hatch, vents, the number board
  k.box(1.7, 2.6, 0.12, S.light, -10.8, H.y0 + 1.7, hz1 + 0.04, { r: 0.12, shade: 0 });
  k.box(1.3, 2.2, 0.06, S.grey, -10.8, H.y0 + 1.9, hz1 + 0.1, { r: 0.1, shade: 0 });
  gk.box(0.6, 0.6, 0.06, S.glass, -10.8, H.y0 + 3.1, hz1 + 0.15, { r: 0.08, shade: 0 });
  for (let i = 0; i < 5; i++) k.box(2.2, 0.14, 0.12, S.grey, -1.6, H.y0 + 1.6 + i * 0.42, hz1 + 0.04, { r: 0.02, jitter: 0, shade: 0 });
  k.box(2.7, 1.45, 0.08, S.black, -5.4, H.y0 + 1.6, hz1 + 0.04, { r: 0.08, shade: 0 });
  // EVA handrails round the hatch and along the top, RCS quads on the corners
  for (const [x0, y0, x1, y1] of [[-12.2, H.y0 + 1.6, -12.2, H.y0 + 4.6], [-9.4, H.y0 + 1.6, -9.4, H.y0 + 4.6], [-12.6, H.y1 - 0.5, -1.0, H.y1 - 0.5]] as const) {
    k.beam(V(x0, y0, hz1 + 0.32), V(x1, y1, hz1 + 0.32), 0.09, S.hazard);
    for (const t of [0, 1]) k.box(0.08, 0.08, 0.3, S.mid, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - 0.04, hz1 + 0.17, { r: 0, jitter: 0, shade: 0 });
  }
  for (const [x, z] of [[H.x0 + 0.3, hz1 - 0.3], [H.x0 + 0.3, hz0 + 0.3]] as const) {
    k.box(0.7, 0.7, 0.7, S.grey, x - 0.35, H.y0 + 0.4, z, { r: 0.08 });
    for (const [dx, dy, dz] of [[-0.45, 0.35, 0], [0, 0.35, 0.45 * Math.sign(z - zs)], [0, -0.1, 0]] as const) k.cyl(0.08, 0.16, 0.3, S.black, x - 0.35 + dx, H.y0 + 0.4 + dy, z + dz, 8, { rz: dx ? Math.PI / 2 : 0, rx: dz ? Math.PI / 2 * Math.sign(dz) : 0, shade: 0 });
  }
  // the window row (lit ones are picked by the caller)
  const windows: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const x = -12.0 + i * 1.32;
    k.box(0.92, 0.78, 0.08, S.grey, x, H.y1 - 3.6, hz1 + 0.02, { r: 0.08, shade: 0 });
    windows.push([x, H.y1 - 3.5, hz1 + 0.07]);
  }
  // the belly: foil tanks and an equipment box
  hcyl(k, 0.8, 5.4, S.foil, -12.6, H.y0 - 0.55, zs - 1.6, 'x', 14);
  hcyl(k, 0.8, 5.4, S.foilD, -12.6, H.y0 - 0.55, zs + 1.4, 'x', 14);
  k.box(4.2, 0.9, 3.4, S.light, -3.6, H.y0 - 0.85, zs - 0.4, { r: 0.14, shade: 0.2 });
  for (const x of [-11, -6.6, -2.2]) k.box(0.3, 0.6, 0.3, S.dark, x, H.y0 - 0.6, zs - 0.2, { r: 0.04 });
  // the slot the finished products slide in through (on the right wall)
  const sz0 = zs + MOD.prodZ - 1.35, sz1 = zs + MOD.prodZ + 1.35;
  k.box(0.08, 9.4, sz1 - sz0, S.ink, H.x1 + 0.02, MOD.railY - 0.4, (sz0 + sz1) / 2, { r: 0, jitter: 0, shade: 0 });
  for (const zz of [sz0 - 0.22, sz1 + 0.22]) k.box(0.2, 9.8, 0.36, S.hazard, H.x1 + 0.08, MOD.railY - 0.6, zz, { r: 0.04, shade: 0 });
  k.box(0.2, 0.36, sz1 - sz0 + 0.8, S.hazard, H.x1 + 0.08, MOD.railY + 9.0, (sz0 + sz1) / 2, { r: 0.04, shade: 0 });
  for (let i = 0; i < 6; i++) k.box(0.22, 0.42, 0.38, S.black, H.x1 + 0.1, MOD.railY + 0.4 + i * 1.6, sz0 - 0.22, { r: 0, jitter: 0, shade: 0 });
  // clamps up onto the spine
  for (const x of [-10.6, -3.4]) clamp(k, x, zs, 1.8, 0.3);
  // ── the cupola on the hull's front top ──
  k.cyl(1.25, 1.35, 1.0, S.light, -4.2, H.y1, zs + 3.3, 8, { shade: 0.15 });
  k.geo(new THREE.SphereGeometry(1.25, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(-4.2, H.y1 + 1.0, zs + 3.3), o.accent, 0.04, 0);
  windows.push([-4.2, H.y1 + 0.55, zs + 4.6]);
  // ── the smelter drum, rising out of the hull's back ──
  const dz = zs + Dm.z;
  k.cyl(Dm.r, Dm.r, Dm.y1 - Dm.y0, S.light, Dm.x, Dm.y0, dz, 24, { shade: 0.18, jitter: 0.03 });
  for (let y = Dm.y0 + 1.6; y < Dm.y1 - 0.5; y += 2.4) k.cyl(Dm.r + 0.08, Dm.r + 0.08, 0.32, S.mid, Dm.x, y, dz, 24, { shade: 0 });
  k.cyl(Dm.r + 0.12, Dm.r + 0.12, 0.4, S.white, Dm.x, Dm.y1 - 0.4, dz, 24, { shade: 0 });
  k.cyl(Dm.r + 0.1, Dm.r + 0.1, 0.7, o.accent, Dm.x, Dm.y1 - 2.4, dz, 24, { shade: 0 });
  // brackets to the spine
  for (const y of [SPINE.y - 1.2, SPINE.y + 1.0]) k.box(1.2, 0.4, 3.2, S.grey, Dm.x + 0.6, y, zs - 2.6, { r: 0.06 });
  // the furnace port, facing the front a little left
  const fa = -0.42;
  const fn = V(Math.sin(fa), 0, Math.cos(fa));
  const fy = 14.0;
  const fp = V(Dm.x, fy, dz).addScaledVector(fn, Dm.r);
  const rim = new THREE.TorusGeometry(1.45, 0.3, 6, 18);
  rim.lookAt(fn);
  rim.translate(fp.x, fp.y, fp.z);
  k.geo(rim, S.dark, 0.03, 0);
  // a square frame round the port, and a heat shield above it
  const fr = new THREE.Group();
  const fk2 = new Kit(rng(o.seed + 77));
  for (const [x, y, w, h] of [[0, 1.75, 4.0, 0.42], [0, -1.75, 4.0, 0.42], [-1.8, 0, 0.42, 3.1], [1.8, 0, 0.42, 3.1]] as const) fk2.box(w, h, 0.5, S.grey, x, y - h / 2, 0, { r: 0.06, shade: 0 });
  fk2.box(4.6, 0.3, 1.4, S.dark, 0, 2.1, 0.5, { r: 0.05, shade: 0 });
  const fg = fk2.build().geometry;
  fr.add(new THREE.Mesh(fg));
  fr.position.copy(fp).addScaledVector(fn, -0.05);
  fr.lookAt(fp.clone().add(fn));
  fr.updateMatrixWorld(true);
  k.geo(fg.clone().applyMatrix4(fr.matrixWorld), S.grey, 0.03, 0);
  // the hopper, heaped with rock
  k.cyl(3.5, 1.9, 2.9, S.mid, Dm.x, Dm.y1, dz, 16, { shade: 0.2 });
  k.cyl(3.62, 3.62, 0.3, S.white, Dm.x, Dm.y1 + 2.8, dz, 16, { shade: 0 });
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2, rr = r() * 2.4;
    const g = new THREE.DodecahedronGeometry(0.45 + r() * 0.45, 0);
    g.scale(1.2, 0.7, 1);
    g.rotateY(r() * 3);
    g.translate(Dm.x + Math.cos(a) * rr, Dm.y1 + 2.95 + (2.4 - rr) * 0.25, dz + Math.sin(a) * rr);
    k.geo(g, [S.rock, S.rock2, S.rock3, S.rock4][i % 4], 0.1, 0.1);
  }
  // the feed pipe from the line in the spine up into the hopper
  pipe(k, [V(Dm.x + 3.3, SPINE.y + 1.4, zs - 1.2), V(Dm.x + 3.3, Dm.y1 + 1.2, zs - 1.2), V(Dm.x + 2.0, Dm.y1 + 3.3, dz + 1.4)], 0.36, S.grey, 10);
  for (let y = SPINE.y + 3; y < Dm.y1; y += 3) k.box(0.9, 0.24, 0.9, S.dark, Dm.x + 3.3, y, zs - 1.2, { r: 0.04 });
  // ── radiators: two to four fins on a manifold on top of the spine ──
  const nRad = 2 + ((o.vseed + o.n) % 3);
  const fins: BodyOut['fins'] = [];
  const ry0 = SPINE.y + SPINE.s / 2;
  k.box(nRad * 2.3 + 0.8, 0.7, 2.2, S.grey, -3.0 + (nRad - 1) * 1.15, ry0, zs - 0.4, { r: 0.1 });
  let topBeacon = V(0, 0, 0);
  for (let i = 0; i < nRad; i++) {
    const x = -3.0 + i * 2.3;
    const top = 21.5 + i * 1.3 + r() * 2.2;
    const z0 = zs - 3.8, z1 = zs + 1.6;
    rad.box(0.14, top - ry0 - 0.7, z1 - z0, S.white, x, ry0 + 0.7, (z0 + z1) / 2, { r: 0, jitter: 0.03, shade: 0 });
    for (const zz of [z0, z1]) rad.box(0.26, top - ry0 - 0.7, 0.22, S.pale, x, ry0 + 0.7, zz, { r: 0.03, jitter: 0, shade: 0 });
    rad.box(0.26, 0.24, z1 - z0 + 0.2, S.pale, x, top - 0.1, (z0 + z1) / 2, { r: 0.03, jitter: 0, shade: 0 });
    for (let j = 1; j < 5; j++) rad.box(0.2, top - ry0 - 1.2, 0.07, S.light, x, ry0 + 0.9, z0 + ((z1 - z0) * j) / 5, { r: 0, jitter: 0, shade: 0 });
    k.box(0.5, 0.5, z1 - z0 + 0.3, S.dark, x, ry0 + 0.55, (z0 + z1) / 2, { r: 0.08, shade: 0 });
    fins.push({ x, y0: ry0 + 0.7, y1: top, z0, z1 });
    if (i === 0) topBeacon = V(x, top + 0.35, (z0 + z1) / 2);
  }
  // ── a dish (seed 1), a strobe mast (seed 2), or a foil pallet ──
  if (o.vseed === 1) {
    k.box(0.3, 3.2, 0.3, S.mid, -13.0, ry0, zs + 0.6, { r: 0.04 });
    const dish = new THREE.SphereGeometry(1.7, 14, 6, 0, Math.PI * 2, 0, 0.9).scale(1, 0.45, 1);
    dish.rotateX(-0.7).rotateY(0.5).translate(-13.0, ry0 + 3.6, zs + 0.9);
    k.geo(dish, S.white, 0.03, 0);
    k.beam(V(-13.0, ry0 + 3.4, zs + 0.8), V(-12.5, ry0 + 4.9, zs + 2.0), 0.08, S.mid);
  } else if (o.vseed === 2) {
    for (let y = ry0; y < ry0 + 7; y += 1.4) {
      k.beam(V(-13.3, y, zs + 0.3), V(-12.7, y + 1.4, zs + 0.9), 0.07, S.mid);
      k.beam(V(-12.7, y, zs + 0.3), V(-13.3, y + 1.4, zs + 0.9), 0.07, S.mid);
    }
    for (const [x, z] of [[-13.3, 0.3], [-12.7, 0.3], [-13.3, 0.9], [-12.7, 0.9]] as const) k.box(0.12, 7.2, 0.12, S.light, x, ry0, zs + z, { r: 0, jitter: 0 });
  } else {
    k.box(3.0, 1.2, 2.4, S.foil, -13.0, ry0, zs + 0.2, { r: 0.12, jitter: 0.1, shade: 0.2 });
    k.box(3.1, 0.2, 2.5, S.mid, -13.0, ry0 + 1.2, zs + 0.2, { r: 0.04, shade: 0 });
  }
  // ── the fabrication bay: an open frame under and in front of the spine ──
  const by0 = B.y0, by1 = SPINE.y - SPINE.s / 2, bz0 = zs + B.z0, bz1 = zs + B.z1;
  const post = (x: number, z: number) => k.box(0.42, by1 - by0, 0.42, S.light, x, by0, z, { r: 0.08, shade: 0.1 });
  for (const x of [B.x0, B.x1]) { post(x, bz1); post(x, bz0); }
  for (const z of [bz0, bz1]) k.box(B.x1 - B.x0 + 0.42, 0.42, 0.42, S.light, (B.x0 + B.x1) / 2, by0, z, { r: 0.08, shade: 0 });
  k.box(B.x1 - B.x0 + 0.42, 0.46, 0.46, S.white, (B.x0 + B.x1) / 2, by1 - 0.46, bz1, { r: 0.08, shade: 0 });
  for (const x of [B.x0, B.x1]) {
    k.box(0.42, 0.42, bz1 - bz0, S.light, x, by0, (bz0 + bz1) / 2, { r: 0.08, shade: 0 });
    k.box(0.46, 0.46, bz1 - bz0, S.white, x, by1 - 0.46, (bz0 + bz1) / 2, { r: 0.08, shade: 0 });
  }
  // bracing on the right side; a machinery wall closes the back of the bay
  k.beam(V(B.x1, by0 + 0.4, bz0 + 0.3), V(B.x1, by1 - 0.5, bz1 - 0.3), 0.18, S.mid);
  k.box(B.x1 - B.x0 - 0.3, by1 - by0 - 0.5, 0.3, S.grey, (B.x0 + B.x1) / 2, by0 + 0.4, bz0 - 0.1, { r: 0.08, shade: 0.15, jitter: 0.03 });
  for (let x = B.x0 + 2.2; x < B.x1 - 0.5; x += 2.25) k.box(0.08, by1 - by0 - 1.0, 0.06, S.dark, x, by0 + 0.65, bz0 + 0.07, { r: 0, jitter: 0, shade: 0 });
  for (let i = 0; i < 3; i++) k.box(1.6, 1.0, 0.4, i === 1 ? S.foil : S.light, B.x0 + 2.4 + i * 4.4, by0 + 7.3, bz0 + 0.2, { r: 0.08 });
  // cable carriers along the rail
  k.box(B.x1 - B.x0 - 1.0, 0.24, 0.5, S.black, (B.x0 + B.x1) / 2, MOD.railY - 0.8, zs + MOD.prodZ + 1.2, { r: 0.04, shade: 0 });
  // a grated floor: frame and slats
  for (let x = B.x0 + 1.2; x < B.x1 - 0.4; x += 1.5) k.box(0.16, 0.14, bz1 - bz0 - 0.4, S.grey, x, by0 + 0.14, (bz0 + bz1) / 2, { r: 0, jitter: 0, shade: 0 });
  // the product rail and its end stop
  k.box(B.x1 - H.x1 - 0.4, 0.32, 1.5, S.dark, (H.x1 + B.x1) / 2, MOD.railY - 0.44, zs + MOD.prodZ, { r: 0.05, shade: 0 });
  k.box(0.7, 1.0, 1.9, S.hazard, B.x1 - 0.55, MOD.railY - 0.5, zs + MOD.prodZ, { r: 0.06 });
  for (let x = H.x1 + 1.2; x < B.x1; x += 2.4) k.box(0.5, MOD.railY - 0.44 - by0, 0.5, S.grey, x, by0, zs + MOD.prodZ, { r: 0.04 });
  // arm B's pedestal and arm A's mounting plate under the spine
  k.box(1.8, 1.4, 1.8, S.grey, 12.4, by0 + 0.3, zs + 6.6, { r: 0.1 });
  k.box(2.0, 0.3, 2.0, S.dark, 4.4, by1 - 0.3, zs + 1.0, { r: 0.05, shade: 0 });
  // work-light heads on the front top beam
  for (const x of [3.6, 10.8]) k.box(1.0, 0.5, 0.6, S.dark, x, by1 - 1.0, bz1 - 0.4, { r: 0.08 });
  // the module's blueprint (for the copy)
  const blue: BlueShape[] = [
    [hcx, H.y0, (hz0 + hz1) / 2, hw, hh, H.z1 - H.z0],
    ['c', Dm.x, Dm.y0, dz, Dm.r, Dm.y1 - Dm.y0],
    ['c', Dm.x, Dm.y1, dz, 3.4, 3.0],
    [(B.x0 + B.x1) / 2, by0, (bz0 + bz1) / 2, B.x1 - B.x0, by1 - by0, bz1 - bz0],
    ...fins.map((f): BlueShape => [f.x, f.y0, (f.z0 + f.z1) / 2, 0.2, f.y1 - f.y0, f.z1 - f.z0]),
    [-4.2, H.y1, zs + 3.3, 2.5, 1.6, 2.5],
  ];
  return { furnace: fp.clone().addScaledVector(fn, 0.15), furnaceN: fn, fins, windows, topBeacon, blue };
}

/** The window lights: warm and cyan panes; pink and violet ones under a strain; few lit when halted. */
export function windowLights(g: THREE.Group, ws: [number, number, number][], seed: number, halted: boolean, q: number, clip?: THREE.Plane[]) {
  const r = rng(seed);
  const cols = q >= 2 ? ['#f7a6c4', '#d08fdc'] : halted ? ['#f7b258', '#f7b258'] : ['#fde9a4', '#a3f0d6'];
  const mats = cols.map((c) => { const m = lit(c, halted ? 0.9 : 1.6); if (clip) m.clippingPlanes = clip; return m; });
  const kits = [new Kit(rng(seed)), new Kit(rng(seed + 1))];
  ws.forEach(([x, y, z], i) => {
    if (halted ? i % 3 !== 0 : r() < 0.18) return;
    kits[i % 4 === 1 ? 1 : 0].box(0.66, 0.52, 0.05, '#ffffff', x, y - 0.33, z, { r: 0, jitter: 0, shade: 0 });
  });
  kits.forEach((k, i) => { if (!k.empty) { const m = k.build(mats[i]); m.castShadow = false; g.add(m); } });
  return mats;
}

export function yardsModule(o: Act3SetOpts): Piece {
  const [pa, fl] = (o.variant ?? 'c|').split('|');
  const product = asProduct(pa);
  const flags = parseFlags(fl);
  const live = !flags.halted;
  const W = o.w, D = o.d, zs = yardsZ(D);
  const n = o.n ?? 1, vseed = o.vseed ?? 0;
  const g = new THREE.Group();
  g.name = 'set:yardsModule';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  const rk = new Kit(rng(o.seed + 1));
  const gk = new Kit(rng(o.seed + 2));
  truss(k, -W / 2, W / 2, zs);
  const body = moduleBody(k, rk, gk, zs, { accent: o.accent, hi: o.hi, n, vseed, product, seed: o.seed });
  g.add(k.build());
  const radiator = radiatorMat(body.fins[0].y0, body.fins[0].y0, '#e8683c', 2.0, 0.42);
  g.add(rk.build(radiator.mat));
  g.add(gk.build(glassMat));
  const winMats = windowLights(g, body.windows, o.seed + 5, flags.halted, flags.q);
  plate(g, `F${n}`, 1.9, -5.4, MOD.hull.y0 + 2.32, zs + MOD.hull.z1 + 0.13, '#5fd3b5', null, 0, 1.0);
  plate(g, o.label || 'L4', 1.6, -1.6, MOD.hull.y0 + 4.2, zs + MOD.hull.z1 + 0.06, '#fbf7f0', null, 0, 0.8);
  if (flags.halted) plate(g, 'HALT', 2.6, -10.8, MOD.hull.y1 - 0.75, zs + MOD.hull.z1 + 0.12, '#fde9a4', '#93243a', 0, 1.1);
  // the feed line through the truss
  const feed = new FeedLine(g, -W / 2, W / 2, zs);
  g.add(feed.obj);
  // ── the furnace's glow ──
  const furnMat = lit(live ? '#ffb347' : '#c23a3f', live ? 2.6 : 1.1, '#3a1a14');
  const port = new THREE.Mesh(new THREE.CircleGeometry(1.42, 18), furnMat);
  port.position.copy(body.furnace);
  port.lookAt(body.furnace.clone().add(body.furnaceN));
  g.add(port);
  const furnHalo = halo([body.furnace.clone().addScaledVector(body.furnaceN, 0.6)], [live ? 7 : 4], live ? '#ff9a3a' : '#c23a3f', live ? 0.75 : 0.45);
  g.add(furnHalo.obj);
  // ── bay lights, status lamp, the fin-top beacon ──
  const by1 = SPINE.y - SPINE.s / 2;
  const flood = lit('#fff2d8', live ? 2.4 : 0.6);
  for (const x of [3.6, 10.8]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.4), flood);
    m.position.set(x, by1 - 1.06, zs + MOD.bay.z1 - 0.4);
    g.add(m);
  }
  const floodHalo = halo([V(3.6, by1 - 1.3, zs + MOD.bay.z1 - 0.4), V(10.8, by1 - 1.3, zs + MOD.bay.z1 - 0.4)], [2.6, 2.6], '#fff2d8', live ? 0.6 : 0.15);
  g.add(floodHalo.obj);
  const status = warnLamp(g, MOD.bay.x1 + 0.1, MOD.railY + 1.2, zs + MOD.bay.z1 + 0.3, false, 0.9);
  const statusG = lit('#7dff9a', 0, '#1f4a2e');
  const sg = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), statusG);
  sg.position.set(MOD.bay.x1 + 0.1, MOD.railY + 1.8, zs + MOD.bay.z1 + 0.3);
  g.add(sg);
  let finLamp: ((on: number) => void) | null = null;
  if (live) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), lit('#ff4a3a', 0.2));
    b.position.copy(body.topBeacon);
    b.userData.beacon = n * 1.3;
    g.add(b);
  } else finLamp = warnLamp(g, body.topBeacon.x, body.topBeacon.y, body.topBeacon.z, false, 1.1);
  // ── the product on its jig, and the arms ──
  const wall = new LocalPlane(new THREE.Plane(new THREE.Vector3(1, 0, 0), -MOD.hull.x1));
  const build = productBuild(product, o.seed + 9, [wall.world]);
  build.obj.position.set(MOD.prodX, MOD.railY, zs + MOD.prodZ);
  g.add(build.obj);
  const armA = new RobotArm(4.4, 4.2, 4.4, by1 - 0.3, zs + 1.0, { hang: true, tool: product === 'r' ? 'claw' : 'grip', seed: o.seed + 20, base: 0.9 });
  const armB = new RobotArm(4.8, 4.6, 12.4, MOD.bay.y0 + 1.7, zs + 6.6, { tool: 'torch', seed: o.seed + 30, base: 1.0 });
  g.add(armA.root, armB.root);
  const sparks = new Sparks(34, '#fff4c8', '#ff8a3a', 0.34, 3.4, 0.6, o.seed + 40);
  g.add(sparks.obj);
  const tmpA = V(0, 0, 0), tmpB = V(0, 0, 0), tip = V(0, 0, 0), dir = V(0, 0, 0);
  const restA = V(3.2, 1.2, zs + 4.6), restB = V(11.2, 1.0, zs + 5.0);
  // ── the strain: a pulsing red ring round the module ──
  let ring: THREE.MeshStandardMaterial | null = null;
  const ringLamps: ((on: number) => void)[] = [];
  let ringHalo: ReturnType<typeof halo> | null = null;
  if (flags.q) {
    ring = lit('#ff3a3a', 1.5, '#64172a');
    const R = 15.4, cy = 9.0, cz = zs + 5.6;
    const tor = new THREE.Mesh(new THREE.TorusGeometry(R, 0.24, 6, 72), ring);
    tor.position.set(0, cy, cz);
    g.add(tor);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(V(Math.cos(a) * R, cy + Math.sin(a) * R, cz)); }
    ringHalo = halo(pts, pts.map(() => 3.2), '#ff3a3a', 0.35);
    g.add(ringHalo.obj);
    const nl = 3 + flags.q;
    for (let i = 0; i < nl; i++) {
      const a = Math.PI / 2 + ((i - (nl - 1) / 2) / nl) * 2.4;
      ringLamps.push(warnLamp(g, Math.cos(a) * R, cy + Math.sin(a) * R, cz + 0.2, flags.q >= 2 || i % 2 === 0, 1.1));
    }
    if (flags.q >= 2) plate(g, 'QUARANTINE', 6.5, 0, cy + R + 1.1, cz, '#ff6a5a', '#2a0f18', 0, 1.3);
  }
  // ── the storm: crackles crawling over the radiators ──
  let crackle: Sparks | null = null;
  if (flags.storm) {
    crackle = new Sparks(18 + flags.storm * 14, '#e6fbff', '#a862c4', 0.75, 1.2, 0.2, o.seed + 50, 1);
    crackle.spawn = (p, rr) => {
      const f = body.fins[Math.floor(rr() * body.fins.length)];
      p.set(f.x + (rr() < 0.5 ? -0.12 : 0.12), f.y0 + rr() * (f.y1 - f.y0), f.z0 + rr() * (f.z1 - f.z0));
    };
    g.add(crackle.obj);
  }
  // a spacewalker out of the hatch on a tether, checking the hull
  const eva = spacewalker(o.seed + 60, o.accent);
  const evaAt = V(-8.4, MOD.hull.y0 + 2.2, zs + MOD.hull.z1 + 1.3);
  eva.obj.position.copy(evaAt);
  eva.obj.rotation.set(0.25, -0.5, 0.15);
  g.add(eva.obj);
  eva.tie(g, V(-7.5, MOD.hull.y0 + 1.5, zs + MOD.hull.z1 + 0.04));
  const tk = new Kit(rng(o.seed + 61));
  const hatch = V(-10.0, MOD.hull.y0 + 2.6, zs + MOD.hull.z1 + 0.15);
  let prev = hatch;
  for (let i = 1; i <= 6; i++) {
    const q = hatch.clone().lerp(evaAt.clone().add(V(0, 0.95, -0.2)), i / 6);
    q.z += Math.sin((i / 6) * Math.PI) * 0.6;
    tk.beam(prev, q, 0.04, '#e9e1d2');
    prev = q;
  }
  g.add(tk.build());
  // ── the cycle: build (0–11 s), hold, slide in (12–16), hand over, come back empty (17–20) ──
  const T = 20, ph = (n * 7.3 + vseed * 3.1) % T;
  anim.add((e) => {
    spaceTime.value = e.t;
    wall.sync(g);
    feed.update(e, live ? 1 : 0);
    const tt = live ? (e.t + ph) % T : 6.2;
    let u = 0, x = MOD.prodX, show = true;
    if (tt < 11) u = tt / 11;
    else if (tt < 12) u = 1;
    else if (tt < 16) { u = 1; x = MOD.prodX + (MOD.inX - MOD.prodX) * span(12, 16, tt); }
    else if (tt < 17) { u = 1; x = MOD.inX; show = false; }
    else { u = 0; x = MOD.inX + (MOD.prodX - MOD.inX) * span(17, 20, tt); show = false; }
    build.obj.position.x = x;
    build.set(u);
    build.showProduct(show);
    build.sync();
    const working = tt < 11;
    const w = build.work(u, e.t);
    const jit = flags.q >= 3 && live ? Math.sin(e.t * 17) * 0.35 : 0;
    if (working) {
      tmpA.copy(w.a).add(build.obj.position);
      tmpB.copy(w.b).add(build.obj.position);
      tmpA.x += jit;
    } else {
      tmpA.copy(restA);
      tmpB.copy(restB);
    }
    armA.reach(tmpA, e.dt, live ? 6 : 0.0001, !live);
    armB.reach(tmpB, e.dt, live ? 7 : 0.0001, !live);
    // sparks at B's torch while it welds or trims
    sparks.on = live && working && w.weld;
    if (sparks.on) {
      armB.tipIn(g, tip);
      armB.dirIn(g, dir);
      sparks.at.copy(tip);
      sparks.dir.copy(dir).multiplyScalar(-0.6).add(V(0, 0.4, 0.6));
    }
    sparks.update(e.dt);
    // lights
    const out = flicker(e.t, n, flags.storm);
    for (const m of winMats) m.emissiveIntensity = out ? 0.15 : live ? 1.6 : 0.9;
    furnMat.emissiveIntensity = live ? 2.2 + Math.sin(e.t * 9) * 0.25 + Math.sin(e.t * 23) * 0.15 : 0.9 + Math.sin(e.t * 0.8) * 0.15;
    furnHalo.set(live ? 0.85 + Math.sin(e.t * 7) * 0.12 : 0.6);
    radiator.u.uPulse.value = (live ? 0.8 + 0.2 * Math.sin(e.t * 0.6 + n) : 0.35) * (out ? 0.4 : 1);
    if (live) {
      statusG.emissiveIntensity = tt >= 11 && tt < 12.5 ? 3 : 0.9;
      status(0);
    } else {
      statusG.emissiveIntensity = 0;
      status(Math.sin(e.t * 3) > 0 ? 1 : 0.15);
      finLamp?.(0.8 + 0.2 * Math.sin(e.t * 2));
    }
    flood.emissiveIntensity = out ? 0.2 : live ? 2.4 : 0.6;
    if (ring && ringHalo) {
      const sp = 2 + flags.q;
      const p = 0.5 + 0.5 * Math.sin(e.t * sp);
      ring.emissiveIntensity = 0.6 + p * (1.4 + flags.q * 0.6);
      ringHalo.set(0.2 + p * 0.8);
      ringLamps.forEach((f, i) => f(Math.sin(e.t * 4 + i * 1.7) > 0 ? 1 : 0.1));
    }
    if (crackle) { crackle.rate = 0.25 + flags.storm * 0.2; crackle.update(e.dt); }
    eva.float(e.t);
    eva.obj.position.y = evaAt.y + Math.sin(e.t * 0.4 + n) * 0.15;
  });
  return { obj: g, w: W, d: D, h: 26, update: timed(g, anim) };
}

/**
 * The self-copy: the next module printed out of its cyan blueprint, from the bottom up, by a
 * gantry that rides the print line with two arms and a print head (the spine is already there).
 * The finished part's windows come on as it rises.
 */
export function yardsCopy(o: Act3SetOpts): Piece {
  const [pa, fl] = (o.variant ?? 'c|').split('|');
  const product = asProduct(pa);
  const flags = parseFlags(fl);
  const live = !flags.halted;
  const W = o.w, D = o.d, zs = yardsZ(D);
  const n = o.n ?? 1, vseed = o.vseed ?? 0;
  const g = new THREE.Group();
  g.name = 'set:yardsCopy';
  const anim = new Anim();
  const sk = new Kit(rng(o.seed));
  truss(sk, -W / 2, W / 2, zs);
  // the half-finished frame: the hull's and drum's skeleton stand complete
  const H = MOD.hull, Dm = MOD.drum;
  const hx = [H.x0 + 0.1, H.x1 - 0.1], hy = [H.y0 + 0.1, H.y1 - 0.1], hzz = [zs + H.z0 + 0.1, zs + H.z1 - 0.1];
  for (const y of hy) for (const z of hzz) sk.box(H.x1 - H.x0, 0.32, 0.32, S.mid, (H.x0 + H.x1) / 2, y - 0.16, z, { r: 0.05, shade: 0 });
  for (const x of hx) for (const z of hzz) sk.box(0.32, H.y1 - H.y0, 0.32, S.mid, x, H.y0, z, { r: 0.05, shade: 0 });
  for (const x of hx) for (const y of hy) sk.box(0.32, 0.32, H.z1 - H.z0, S.mid, x, y - 0.16, (hzz[0] + hzz[1]) / 2, { r: 0.05, shade: 0 });
  for (let x = H.x0 + 2.8; x < H.x1 - 1; x += 2.8) for (const z of hzz) sk.box(0.22, H.y1 - H.y0, 0.22, S.grey, x, H.y0, z, { r: 0.03, shade: 0 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    sk.box(0.26, Dm.y1 - Dm.y0, 0.26, S.mid, Dm.x + Math.cos(a) * (Dm.r - 0.1), Dm.y0, zs + Dm.z + Math.sin(a) * (Dm.r - 0.1), { r: 0.03, shade: 0 });
  }
  for (const y of [Dm.y0, Dm.y1 - 0.3]) sk.geo(new THREE.TorusGeometry(Dm.r - 0.1, 0.16, 4, 24).rotateX(Math.PI / 2).translate(Dm.x, y + 0.15, zs + Dm.z), S.mid, 0.02, 0);
  // ── the gantry posts (fixed) ──
  const GZ = zs + 11.0, GX = 14.6, gy0 = -7.0, gy1 = 27.5;
  for (const x of [-GX, GX]) {
    sk.box(0.7, gy1 - gy0, 0.7, S.light, x, gy0, GZ, { r: 0.1, shade: 0.1 });
    sk.box(1.4, 0.5, 1.4, S.dark, x, gy0, GZ, { r: 0.06 });
    sk.box(1.4, 0.5, 1.4, S.dark, x, gy1 - 0.5, GZ, { r: 0.06 });
    for (let y = gy0 + 1; y < gy1 - 1; y += 2.2) sk.box(0.9, 0.12, 0.9, S.grey, x, y, GZ, { r: 0, jitter: 0, shade: 0 });
    // tie beams back to the spine
    sk.beam(V(x, SPINE.y, GZ - 0.4), V(x > 0 ? x - 0.5 : x + 0.5, SPINE.y, zs + 1.8), 0.3, S.light);
  }
  sk.box(2 * GX + 0.7, 0.5, 0.5, S.light, 0, gy1 - 0.4, GZ, { r: 0.08, shade: 0 });
  g.add(sk.build());
  const feed = new FeedLine(g, -W / 2, W / 2, zs);
  g.add(feed.obj);
  // ── the printed body (clipped below the print line) and the blueprint above it ──
  const cut = new LocalPlane(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));
  const above = new LocalPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const k = new Kit(rng(o.seed + 3));
  const rk = new Kit(rng(o.seed + 4));
  const gk = new Kit(rng(o.seed + 5));
  const body = moduleBody(k, rk, gk, zs, { accent: o.accent, hi: o.hi, n, vseed, product, seed: o.seed });
  const bodyMat = paint([cut.world]);
  bodyMat.side = THREE.DoubleSide;
  g.add(k.build(bodyMat));
  // the fresh layer: a cyan glow across the hull and the drum at the print line
  const capMat = new THREE.MeshBasicMaterial({ color: '#5fd3b5', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const hullCap = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0 - 0.2, H.z1 - H.z0 - 0.2).rotateX(-Math.PI / 2), capMat);
  hullCap.position.set((H.x0 + H.x1) / 2, 0, zs + (H.z0 + H.z1) / 2);
  const drumCap = new THREE.Mesh(new THREE.CircleGeometry(Dm.r - 0.05, 24).rotateX(-Math.PI / 2), capMat);
  drumCap.position.set(Dm.x, 0, zs + Dm.z);
  const bayCap = new THREE.Mesh(new THREE.PlaneGeometry(MOD.bay.x1 - MOD.bay.x0, MOD.bay.z1 - MOD.bay.z0).rotateX(-Math.PI / 2), capMat);
  bayCap.position.set((MOD.bay.x0 + MOD.bay.x1) / 2, 0, zs + (MOD.bay.z0 + MOD.bay.z1) / 2);
  for (const c of [hullCap, drumCap, bayCap]) { c.renderOrder = 5; g.add(c); }
  const radiator = radiatorMat(body.fins[0].y0, body.fins[0].y0, '#e8683c', 2.0, 0.32);
  radiator.mat.clippingPlanes = [cut.world];
  radiator.mat.clipShadows = true;
  g.add(rk.build(radiator.mat));
  const gm = glassMat.clone();
  gm.clippingPlanes = [cut.world];
  g.add(gk.build(gm));
  const winMats = windowLights(g, body.windows, o.seed + 5, false, 0, [cut.world]);
  const blue = blueprint(body.blue, '#5fd3b5', 0.85, [above.world]);
  g.add(blue);
  // ── the riding beam: print head + two arms hanging from it ──
  const rider = new THREE.Group();
  const rk2 = new Kit(rng(o.seed + 6));
  rk2.box(2 * GX - 0.4, 0.8, 1.0, S.white, 0, -0.4, 0, { r: 0.12, shade: 0.15 });
  rk2.box(2 * GX - 0.4, 0.18, 1.04, o.accent, 0, 0.12, 0, { r: 0, shade: 0 });
  for (const x of [-GX, GX]) rk2.box(1.6, 1.4, 1.6, S.dark, x, -0.7, 0, { r: 0.1 });
  rider.add(rk2.build());
  g.add(rider);
  const head = new THREE.Group();
  const hk = new Kit(rng(o.seed + 7));
  hk.box(1.6, 1.2, 1.4, S.dark, 0, -0.6, 0, { r: 0.12 });
  hk.box(1.62, 0.2, 1.42, S.hazard, 0, 0.0, 0, { r: 0, shade: 0 });
  hk.cyl(0.18, 0.3, 2.0, S.black, 0, -0.2, -0.7, 10, { rx: -Math.PI / 2, shade: 0 });
  head.add(hk.build());
  rider.add(head);
  const nozzle = halo([V(0, -0.2, -2.8)], [1.6], '#ffe9a8', 0.9);
  head.add(nozzle.obj);
  const armL = new RobotArm(4.2, 4.0, -7, -0.9, 0, { hang: true, tool: 'torch', seed: o.seed + 8, base: 0.8 });
  const armR = new RobotArm(4.2, 4.0, 7, -0.9, 0, { hang: true, tool: 'torch', seed: o.seed + 9, base: 0.8 });
  rider.add(armL.root, armR.root);
  const sparks = [0, 1, 2].map((i) => { const s = new Sparks(26, '#fff4c8', '#ff8a3a', 0.3, 3.0, 0.55, o.seed + 40 + i); g.add(s.obj); return s; });
  const warn = warnLamp(g, GX, gy1 + 0.4, GZ, false, 1.1);
  ((plate(g, `F${n}`, 1.9, -5.4, MOD.hull.y0 + 2.32, zs + MOD.hull.z1 + 0.13, '#5fd3b5', null, 0, 1.0) as THREE.Mesh).material as THREE.Material).clippingPlanes = [cut.world];
  plate(g, 'PRINTING', 4.2, 0, gy1 + 1.2, GZ + 0.3, '#5fd3b5', '#16141f', 0, 0.9);
  // where the front face is at height y (roughly), for the torches
  const faceZ = (x: number, y: number) => {
    if (y < H.y1 && x < H.x1) return zs + H.z1 + 0.1;
    if (y < SPINE.y - SPINE.s / 2) return zs + MOD.bay.z1;
    if (y < SPINE.y + SPINE.s / 2) return zs + 1.9;
    if (x < Dm.x + Dm.r && x > Dm.x - Dm.r) return zs + Dm.z + Math.sqrt(Math.max(0, Dm.r * Dm.r - (x - Dm.x) ** 2)) + 0.1;
    return zs + 1.7;
  };
  const yBot = MOD.hull.y0 - 1.6, yTop = 25.5;
  const P = 60, ph = (n * 11.7) % P;
  const tip = V(0, 0, 0), dir = V(0, 0, 0), tgt = V(0, 0, 0);
  anim.add((e) => {
    spaceTime.value = e.t;
    feed.update(e, live ? 1 : 0);
    const tt = (e.t + ph) % P;
    const p = live ? 0.08 + 0.88 * span(0, 54, tt) : 0.5;
    const cy = yBot + p * (yTop - yBot);
    cut.local.constant = cy;
    above.local.constant = -cy + 0.02;
    cut.sync(g);
    above.sync(g);
    rider.position.set(0, cy + 2.6, GZ);
    hullCap.position.y = drumCap.position.y = bayCap.position.y = cy;
    hullCap.visible = cy > H.y0 && cy < H.y1;
    drumCap.visible = cy > Dm.y0 && cy < Dm.y1;
    bayCap.visible = cy > MOD.bay.y0 + 0.4 && cy < MOD.bay.y0 + 0.6;
    capMat.opacity = 0.14 + 0.07 * Math.sin(e.t * 6);
    // the head sweeps back and forth along the beam
    const hu = live ? (e.t * 0.11 + n * 0.3) % 1 : 0.3;
    const hx = -11 + (hu < 0.5 ? hu * 2 : 2 - hu * 2) * 22;
    head.position.set(hx, -0.8, 0);
    const reach = (arm: RobotArm, x0: number, i: number) => {
      const x = x0 + (live ? Math.sin(e.t * (0.5 + i * 0.13) + i * 2) * 4.2 : 0);
      tgt.set(x, cy - rider.position.y + 0.15, faceZ(x, cy) - GZ);
      arm.reach(tgt, e.dt, live ? 4 : 0.0001, !live);
      const s = sparks[i];
      s.on = live && tt < 54;
      if (s.on) {
        arm.tipIn(g, tip);
        arm.dirIn(g, dir);
        s.at.copy(tip);
        s.dir.copy(dir).multiplyScalar(-0.5).add(V(0, 0.5, 0.7));
      }
      s.update(e.dt);
    };
    reach(armL, -7, 0);
    reach(armR, 7, 1);
    const s2 = sparks[2];
    s2.on = live && tt < 54;
    s2.at.set(hx, cy + 0.1, faceZ(hx, cy));
    s2.dir.set(0, 0.6, 1);
    s2.update(e.dt);
    nozzle.set(live ? 0.7 + 0.3 * Math.sin(e.t * 20) : 0.1);
    for (const m of winMats) m.emissiveIntensity = flicker(e.t, n, flags.storm) ? 0.15 : 1.5;
    radiator.u.uPulse.value = 0.25 + 0.6 * p;
    warn(live ? (Math.sin(e.t * 3.5) > 0 ? 1 : 0.1) : 0.8);
    (blue.material as THREE.LineBasicMaterial).opacity = 0.6 + 0.25 * Math.sin(e.t * 2.2);
  });
  return { obj: g, w: W, d: D, h: 27, update: timed(g, anim) };
}
