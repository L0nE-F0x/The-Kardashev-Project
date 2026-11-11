/**
 * Wind at GW scale: a block of big onshore turbines over farmland, the offshore field standing in
 * the North Sea (monopiles or jackets with yellow transition pieces), the offshore substation and
 * the jack-up vessel installing the next turbine.
 */
import * as THREE from 'three';
import { col, Kit, lightPool, mix, paintMat, rng, type Paint } from '../../../kit';
import { cow, type Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  Anim, beacon, CHARTER, fieldOf, flag, foamRing, hcyl, latticeBoom, P, placard, SEA, SEABED, shade, standing, TAU, track,
  vehicle, V, wake, windows, workPool,
} from './common';

type Win = [number, number, number, number, number, number?][];

// ── the turbine ──────────────────────────────────────────────────────────────────────────────
/** A modern blade's planform (root at y = 0, tip at y = L), extruded thin; the tip in red. */
export function bladeGeo(L: number, chord: number) {
  const s = new THREE.Shape();
  s.moveTo(-0.22 * chord, 0);
  s.lineTo(-0.42 * chord, L * 0.2);
  s.quadraticCurveTo(-0.2 * chord, L * 0.7, -0.03 * chord, L);
  s.lineTo(0.05 * chord, L);
  s.quadraticCurveTo(0.2 * chord, L * 0.55, 0.34 * chord, L * 0.18);
  s.lineTo(0.22 * chord, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.08);
  return g;
}
const bladeCache = new Map<string, THREE.BufferGeometry>();
/** The rotor (spinner + three blades) as one geometry, in the xy plane facing +z. */
function rotorGeo(L: number) {
  const key = L.toFixed(2);
  let g = bladeCache.get(key);
  if (g) return g;
  const k = new Kit(rng(11));
  k.geo(new THREE.SphereGeometry(0.62, 12, 8).scale(1, 1, 1.5).translate(0, 0, 0.4), '#f1ece4', 0.01);
  const chord = Math.max(1.1, L * 0.11);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    const b = bladeGeo(L * 0.92, chord).translate(0, 0.5, 0);
    b.rotateY(0.12);
    b.rotateZ(a);
    k.geo(b, '#f6f2ea', 0.01);
    const tip = new THREE.BoxGeometry(0.12 * chord, L * 0.06, 0.18).translate(0.01 * chord, 0.5 + L * 0.92 * 0.955, 0);
    tip.rotateY(0.12);
    tip.rotateZ(a);
    k.geo(tip, P.red, 0);
  }
  g = k.build().geometry;
  g.userData.shared = true;
  bladeCache.set(key, g);
  return g;
}

export interface Turbine { obj: THREE.Group; rotor: THREE.Object3D; speed: number }

/** A big turbine: tapered tower from `y0`, nacelle and rotor at hub height H; faces +z (turn the group to yaw it). */
export function turbine(k: Kit, parent: THREE.Object3D, x: number, z: number, H: number, L: number, yaw: number, seed: number, y0 = 0): Turbine {
  const r = rng(seed);
  const rb = 0.95 + L * 0.012, rt = 0.5 + L * 0.006;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  // the tower in three sections with flange lines and a door at the foot
  const h = H - y0;
  k.cyl(rt, rb, h, '#f1ece4', x, y0, z, 18, { shade: 0.06, jitter: 0.01 });
  for (const t of [0.34, 0.67]) {
    const rr = rb + (rt - rb) * t + 0.02;
    k.cyl(rr, rr, 0.12, '#dcd5ca', x, y0 + h * t, z, 18, { shade: 0 });
  }
  const [dx, dz] = at(0, rb - 0.05);
  k.box(0.7, 1.9, 0.2, '#9d95a6', dx, y0 + 0.2, dz, { r: 0.03, ry: yaw });
  // nacelle: body, cooler on top, the hub flange at the front
  const [nx, nz] = at(0, -0.6);
  k.box(1.55, 1.6, 4.6, '#f1ece4', nx, H - 0.55, nz, { r: 0.3, ry: yaw, jitter: 0.01 });
  const [cx, cz] = at(0, -2.2);
  k.box(1.3, 0.55, 1.1, '#d8d2cc', cx, H + 1.0, cz, { r: 0.08, ry: yaw });
  const [mx, mz] = at(0.35, -2.7);
  k.box(0.06, 0.9, 0.06, P.dark, mx, H + 1.0, mz, { r: 0 });
  const rotor = new THREE.Mesh(rotorGeo(L), paintMat);
  const holder = new THREE.Group();
  const [hx, hz] = at(0, 1.75);
  holder.position.set(hx, H + 0.25, hz);
  holder.rotation.y = yaw;
  const spin = new THREE.Group();
  spin.add(rotor);
  spin.rotation.z = r() * TAU;
  holder.add(spin);
  rotor.castShadow = true;
  rotor.receiveShadow = true;
  parent.add(holder);
  const [bx, bz] = at(0, -2.4);
  beacon(parent, bx, H + 1.7, bz, seed * 0.7);
  return { obj: holder, rotor: spin, speed: 0.75 + r() * 0.25 };
}

// ── onshore ──────────────────────────────────────────────────────────────────────────────────
/** Turbine spots in a 50 × 40 block (staggered so no two rotors share a plane), by tile. */
function spots(W: number, D: number, v: number): [number, number][] {
  const sx = W / 50, sz = D / 40;
  const base: [number, number][][] = [
    [[-17, -13], [0, -10], [17, -14], [-8, 1], [10, 3], [-17, 14], [5, 15]],
    [[-12, -14], [6, -11], [-20, 0], [-2, 2], [16, 0], [-10, 14], [11, 15]],
    [[-16, -11], [2, -14], [19, -5], [-6, 2], [13, 7], [-19, 15], [2, 16]],
  ];
  return base[v].map(([x, z]) => [x * sx, z * sz]);
}

/** A block of a GW-scale onshore wind field: big turbines over farmland, tracks and hardstands, a farm on one tile. */
export function windField(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const v = (o.vseed ?? 0) % 3;
  const f = fieldOf(o.backdrop);
  const r = rng(o.seed + v * 31);
  const ground = new Kit(rng(o.seed + 1));
  const k = new Kit(rng(o.seed + 2));
  const yaw = -0.32;
  const H = 30, L = 11.5;
  const sp = spots(W, D, v);
  // farmland: a patchwork of strips (not in the desert or the mountains)
  if (f.crop) {
    const crops: Paint[] = [f.crop, '#9aa45a', '#8c6a42', mix(f.crop, '#ffffff', 0.12), '#7f9a4a'];
    let x = -W / 2 + 0.5;
    while (x < W / 2 - 1) {
      const w = 5 + r() * 7;
      const x1 = Math.min(W / 2 - 0.5, x + w);
      let z = -D / 2 + 0.5;
      while (z < D / 2 - 1) {
        const d = 6 + r() * 10;
        const z1 = Math.min(D / 2 - 0.5, z + d);
        if (r() < 0.75) ground.box(x1 - x - 0.5, 0.05, z1 - z - 0.5, crops[Math.floor(r() * crops.length)], (x + x1) / 2, -0.01, (z + z1) / 2, { r: 0, jitter: 0.04, shade: 0 });
        z = z1;
      }
      x = x1;
    }
  }
  // a farm track along the front, spurs to each hardstand
  const tz = D / 2 - 2.2;
  track(ground, -W / 2, tz, W / 2, tz, 2.6, f.track, 0.04);
  const turbines: Turbine[] = [];
  for (const [i, [x, z]] of sp.entries()) {
    // hardstand + foundation + the turbine's own transformer
    ground.box(6.2, 0.09, 4.2, P.gravel, x + 4.2, 0.0, z + 1.2, { r: 0.04, jitter: 0.03, shade: 0 });
    track(ground, x + 4.2, z + 3, x + 4.2 + (i % 2 ? 2 : -2), tz, 2.0, f.track, 0.03);
    k.cyl(2.0, 2.2, 0.35, P.concreteD, x, 0, z, 16);
    k.box(1.2, 1.4, 1.0, '#7f8c72', x + 2.4, 0, z + 1.6, { r: 0.08 });
    turbines.push(turbine(k, g, x, z, H + (i % 3) * 0.6, L, yaw, o.seed + i * 7, 0.3));
  }
  // a farmstead with a red barn on one tile; a met mast on another; cattle on the farmland
  if (v === 1 && f.crop) {
    const fx = W / 2 - 9, fz = -2;
    k.box(6.4, 3.2, 4.6, '#a8402f', fx, 0, fz, { r: 0.1 });
    k.geo(new THREE.CylinderGeometry(0.01, 3.9, 2.4, 4, 1).rotateY(Math.PI / 4).scale(1.16, 1, 0.84).translate(fx, 4.4, fz), '#7a2f28', 0.03);
    k.box(2.2, 2.4, 0.08, '#e9e1d2', fx, 0.1, fz + 2.32, { r: 0.02 });
    k.box(4.2, 2.6, 3.4, P.cream, fx - 6.6, 0, fz + 1, { r: 0.1 });
    k.geo(new THREE.CylinderGeometry(0.01, 3.1, 1.6, 4, 1).rotateY(Math.PI / 4).scale(1.0, 1, 0.8).translate(fx - 6.6, 3.4, fz + 1), '#5b5562', 0.03);
    k.cyl(1.1, 1.1, 6, '#c9c1b6', fx + 4.4, 0, fz - 1.5, 12);
    k.geo(new THREE.SphereGeometry(1.1, 12, 6, 0, TAU, 0, Math.PI / 2).translate(fx + 4.4, 6, fz - 1.5), '#9d95a6', 0.02);
    windows(g, [[fx - 7.5, 1.4, fz + 2.73, 0.8, 0.7], [fx - 5.6, 1.4, fz + 2.73, 0.8, 0.7]]);
    vehicle(g, 'pickup', fx - 3, fz + 4.5, 0.2);
  }
  if (v === 2) {
    const mx = -W / 2 + 4, mz = -4;
    for (let y = 0; y < 26; y += 2) k.box(0.12, 2, 0.12, '#9d95a6', mx, y, mz, { r: 0 });
    for (const y of [10, 18, 25]) k.box(1.6, 0.06, 0.06, '#9d95a6', mx, y, mz, { r: 0 });
    for (const s of [-1, 1]) for (const zz of [-1, 1]) k.beam(V(mx, 22, mz), V(mx + s * 5, 0, mz + zz * 5), 0.02, '#c3bcc7');
    beacon(g, mx, 26.3, mz, 0.2);
  }
  if (f.grazing && f.crop) {
    for (let i = 0; i < 6; i++) {
      const c = cow(o.seed + i * 3);
      c.obj.position.set(-W / 2 + 6 + r() * 14, 0, -D / 2 + 6 + r() * 10);
      c.obj.rotation.y = r() * TAU;
      g.add(c.obj);
      anim.add(c.update);
    }
  }
  vehicle(g, 'pickup', sp[0][0] + 6, sp[0][1] + 1.4, Math.PI / 2 + 0.2);
  standing(g, sp[0][0] + 2.4, sp[0][1] + 2.6, 0.5, o.seed + 3);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  anim.add((e) => { for (const t of turbines) t.rotor.rotation.z -= e.dt * t.speed; });
  return { obj: g, w: W, d: D, h: H + L + 2, update: anim.update, ground: () => null };
}

// ── offshore ─────────────────────────────────────────────────────────────────────────────────
const TP: Paint = '#f4c64e';
/** A monopile (or a jacket) with its yellow transition piece and platform; returns the deck height. */
export function foundation(k: Kit, parent: THREE.Object3D, x: number, z: number, jacket: boolean, yaw: number) {
  const deck = 3.4;
  if (jacket) {
    const b = 2.6, t = 1.6;
    const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of legs) k.beam(V(x + sx * b, SEABED, z + sz * b), V(x + sx * t, deck - 0.4, z + sz * t), 0.32, TP);
    for (let y = SEABED + 1; y < deck - 1.5; y += 2.6) {
      const w0 = b + (t - b) * ((y - SEABED) / (deck - SEABED)), w1 = b + (t - b) * ((y + 2.6 - SEABED) / (deck - SEABED));
      for (let i = 0; i < 4; i++) {
        const [ax, az] = legs[i], [bx2, bz2] = legs[(i + 1) % 4];
        k.beam(V(x + ax * w0, y, z + az * w0), V(x + bx2 * w1, y + 2.6, z + bz2 * w1), 0.14, '#e0a840');
        k.beam(V(x + bx2 * w0, y, z + bz2 * w0), V(x + ax * w1, y + 2.6, z + az * w1), 0.14, '#e0a840');
      }
    }
    k.box(t * 2 + 1.2, 0.5, t * 2 + 1.2, TP, x, deck - 0.6, z, { r: 0.06 });
    for (const [sx, sz] of legs) foamRing(parent, x + sx * (b + (t - b) * ((SEA - SEABED) / (deck - SEABED))), z + sz * (b + (t - b) * ((SEA - SEABED) / (deck - SEABED))), 0.35);
  } else {
    k.cyl(1.05, 1.05, -0.8 - SEABED, '#5b5562', x, SEABED, z, 16, { shade: 0.05 });
    k.cyl(1.2, 1.2, deck - -1.9, TP, x, -1.9, z, 16, { shade: 0.08 });
    foamRing(parent, x, z, 1.2);
  }
  // the platform with its railing, a boat landing and a davit
  k.cyl(2.5, 2.5, 0.18, '#8a8490', x, deck, z, 16, { shade: 0 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    k.box(0.06, 1.0, 0.06, TP, x + Math.cos(a) * 2.4, deck + 0.15, z + Math.sin(a) * 2.4, { r: 0 });
  }
  k.geo(new THREE.TorusGeometry(2.4, 0.05, 4, 24).rotateX(Math.PI / 2).translate(x, deck + 1.12, z), TP, 0);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = x + 1.35 * s, lz = z + 1.35 * c;
  for (const o of [-0.35, 0.35]) k.box(0.12, deck - SEA + 0.6, 0.12, TP, lx + o * c, SEA - 0.6, lz - o * s, { r: 0 });
  for (let y = SEA; y < deck; y += 0.5) k.box(0.7, 0.06, 0.06, '#e0a840', lx, y, lz, { r: 0, ry: yaw });
  k.box(0.14, 2.2, 0.14, TP, x - 1.6, deck, z - 1.2, { r: 0 });
  k.box(1.4, 0.12, 0.12, TP, x - 1.0, deck + 2.1, z - 1.2, { r: 0 });
  return deck + 0.15;
}

/** A crew transfer vessel (a small catamaran, ~6 long along x), waterline at y = 0. */
function ctv(seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  for (const sz of [-0.85, 0.85]) k.box(6, 0.9, 0.7, '#fbf7f0', 0, -0.4, sz, { r: 0.2 });
  k.box(6.1, 0.18, 2.5, P.orange, 0, 0.32, 0, { r: 0.05 });
  k.box(5.8, 0.14, 2.4, '#8a8490', 0, 0.48, 0, { r: 0 });
  k.box(2.4, 1.3, 2.0, '#fbf7f0', 0.6, 0.6, 0, { r: 0.14 });
  k.box(2.3, 0.5, 2.06, P.glassD, 0.6, 1.25, 0, { r: 0.04, shade: 0 });
  k.box(0.6, 0.8, 1.6, '#3a3442', 3.1, 0.5, 0, { r: 0.1 }); // bow fender
  k.box(0.1, 1.2, 0.1, P.dark, 0.2, 1.9, 0, { r: 0 });
  g.add(k.build());
  const w = wake(3.4, 0.9);
  w.position.set(-4.2, 0.05, 0);
  g.add(w);
  return g;
}

/** A block of the North Sea field: turbines standing in the water on monopiles (or jackets), a crew boat doing the rounds. */
export function windSea(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const v = (o.vseed ?? 0) % 3;
  const k = new Kit(rng(o.seed + 2));
  const yaw = -0.28;
  const L = 12.5;
  const sp = spots(W, D, v).filter((_, i) => i !== 3);
  const turbines: Turbine[] = [];
  for (const [i, [x, z]] of sp.entries()) {
    const deck = foundation(k, g, x, z, v === 2 && i % 2 === 0, yaw);
    turbines.push(turbine(k, g, x, z, deck + 27 + (i % 3) * 0.5, L, yaw, o.seed + i * 5, deck));
    // work lights on the platforms
    lightPool(g, x, deck - 0.2, z + 1.4, 2.6, workPool);
  }
  g.add(k.build());
  anim.add((e) => { for (const t of turbines) t.rotor.rotation.z -= e.dt * t.speed; });
  // the crew boat shuttles between the near turbines
  const boat = ctv(o.seed);
  g.add(boat);
  const a = sp[sp.length - 2], b = sp[sp.length - 1];
  const p0 = V(a[0] + 3.5, SEA, a[1] + 3.5), p1 = V(b[0] - 3.5, SEA, b[1] + 3.5);
  anim.add((e) => {
    const t = (e.t * 0.03 + v * 0.3) % 2;
    const u = t < 1 ? t : 2 - t;
    const s = u * u * (3 - 2 * u);
    boat.position.lerpVectors(p0, p1, s);
    boat.position.y = SEA + Math.sin(e.t * 1.6) * 0.07;
    boat.rotation.y = Math.atan2(-(p1.z - p0.z), p1.x - p0.x) + (t < 1 ? 0 : Math.PI);
    boat.rotation.z = Math.sin(e.t * 1.3) * 0.04;
  });
  return { obj: g, w: W, d: D, h: 45, update: anim.update };
}

// ── the offshore substation ──────────────────────────────────────────────────────────────────
/** A helideck: an octagon with the yellow circle and an H, at (x, y, z), radius r. */
function helideck(k: Kit, x: number, y: number, z: number, r: number) {
  k.geo(new THREE.CylinderGeometry(r, r, 0.3, 8).translate(x, y + 0.15, z), '#4f6a5a', 0.02);
  k.geo(new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.2, 8).translate(x, y, z), P.yellow, 0.02);
  k.geo(new THREE.TorusGeometry(r * 0.62, 0.12, 3, 20).rotateX(Math.PI / 2).translate(x, y + 0.32, z), P.yellow, 0);
  for (const sx of [-0.5, 0.5]) k.box(0.22, 0.04, 1.6, '#fbf7f0', x + sx * r * 0.36, y + 0.3, z, { r: 0 });
  k.box(r * 0.36, 0.04, 0.22, '#fbf7f0', x, y + 0.3, z, { r: 0 });
}

/** The offshore substation: a topside on a jacket with a helideck and a crane; 'hvdc' = the bigger converter platform. */
export function seaSub(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const hv = o.variant === 'hvdc';
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  const tw = hv ? 17 : 14, td = hv ? 12 : 10, th = hv ? 11 : 8.5;
  const deckY = 7;
  // the jacket
  const legsX = hv ? [-6.5, 0, 6.5] : [-5, 5];
  const lz = td / 2 - 1.2;
  for (const lx of legsX)
    for (const sz of [-1, 1]) {
      const bx = lx * 1.18, bz = sz * lz * 1.25;
      k.beam(V(bx, SEABED, bz), V(lx, deckY, sz * lz), 0.45, TP);
      foamRing(g, bx + (lx - bx) * ((SEA - SEABED) / (deckY - SEABED)), bz + (sz * lz - bz) * ((SEA - SEABED) / (deckY - SEABED)), 0.45);
    }
  for (let y = SEABED + 1.5; y < deckY - 1; y += 3.2) {
    for (const sz of [-1, 1])
      for (let i = 0; i + 1 < legsX.length; i++) {
        k.beam(V(legsX[i] * 1.1, y, sz * lz * 1.15), V(legsX[i + 1] * 1.1, y + 3, sz * lz * 1.15), 0.18, '#e0a840');
        k.beam(V(legsX[i + 1] * 1.1, y, sz * lz * 1.15), V(legsX[i] * 1.1, y + 3, sz * lz * 1.15), 0.18, '#e0a840');
      }
    for (const lx of [legsX[0], legsX[legsX.length - 1]]) {
      k.beam(V(lx * 1.1, y, -lz * 1.15), V(lx * 1.1, y + 3, lz * 1.15), 0.18, '#e0a840');
      k.beam(V(lx * 1.1, y, lz * 1.15), V(lx * 1.1, y + 3, -lz * 1.15), 0.18, '#e0a840');
    }
  }
  // J-tubes (the export and array cables coming up)
  for (const z of [-1, 0, 1]) k.box(0.3, deckY - SEABED, 0.3, '#433c52', legsX[0] * 1.1 + 0.6, SEABED, z * 1.4, { r: 0 });
  // the topside: cellar deck, the module, plant on the roof
  k.box(tw + 1, 0.8, td + 1, TP, 0, deckY, 0, { r: 0.06 });
  k.box(tw, th, td, '#e3ddd3', 0, deckY + 0.8, 0, { r: 0.18, jitter: 0.02, shade: 0.12 });
  for (let x = -tw / 2 + 0.7; x < tw / 2; x += 1.0) k.box(0.12, th - 0.6, 0.1, '#cbc4b9', x, deckY + 1.1, td / 2 + 0.03, { r: 0, jitter: 0.01, shade: 0 });
  k.box(tw + 0.05, 0.5, td + 0.05, CHARTER.field, 0, deckY + th - 0.3, 0, { r: 0.04, shade: 0 });
  // an open transformer bay on the front
  k.box(5.2, 3.6, 0.3, '#3a3442', -tw / 2 + 3.4, deckY + 1.0, td / 2 - 0.05, { r: 0.04, shade: 0 });
  k.box(3.4, 2.6, 1.6, '#8a8f80', -tw / 2 + 3.4, deckY + 0.9, td / 2 - 0.9, { r: 0.08 });
  for (let i = 0; i < 6; i++) {
    const x = -tw / 2 + 7 + i * 1.3;
    if (x > tw / 2 - 1) break;
    k.box(0.8, 0.7, 0.06, P.glassD, x, deckY + 4.6, td / 2 + 0.04, { r: 0.02, shade: 0 });
    glow.push([x, deckY + 4.95, td / 2 + 0.08, 0.7, 0.6]);
  }
  // a deck line half way up, louvres, a stair tower, a lifeboat, plant on the roof
  k.box(tw + 0.08, 0.35, td + 0.08, '#b9b1a6', 0, deckY + 0.8 + th * 0.5, 0, { r: 0.04, shade: 0 });
  for (let i = 0; i < 3; i++) {
    const x = -tw / 2 + 2.4 + i * 3.2;
    k.box(2.4, 2.0, 0.08, '#8a8490', x, deckY + 0.8 + th * 0.5 + 1.2, td / 2 + 0.04, { r: 0.02, shade: 0 });
    for (let y = 0.25; y < 2; y += 0.35) k.box(2.3, 0.06, 0.1, '#6f6878', x, deckY + 0.8 + th * 0.5 + 1.2 + y, td / 2 + 0.1, { r: 0, jitter: 0 });
  }
  const stx = tw / 2 + 1.2;
  for (let f = 0; f < 4; f++) {
    const y = deckY + 0.8 + f * (th / 4);
    k.box(2.0, 0.12, 2.0, P.steelD, stx, y + th / 4 - 0.1, td / 2 - 2.6 + (f % 2) * 2.2, { r: 0 });
    k.beam(V(stx, y, td / 2 - 2.6 + ((f + 1) % 2) * 2.2), V(stx, y + th / 4, td / 2 - 2.6 + (f % 2) * 2.2), 0.5, '#8a8490');
  }
  for (const zz of [td / 2 - 3.6, td / 2 + 0.4]) k.box(0.1, th, 0.1, P.steelD, stx + 1, deckY + 0.8, zz, { r: 0 });
  k.geo(new THREE.SphereGeometry(1, 12, 8).scale(2.1, 1.0, 1.0).translate(-tw / 2 - 1.4, deckY + 3.2, td / 2 - 3), P.orange, 0.03);
  k.box(4.4, 0.5, 0.6, '#fbf7f0', -tw / 2 - 1.4, deckY + 4.0, td / 2 - 3, { r: 0.1 });
  for (const sx of [-1.6, 1.6]) k.beam(V(-tw / 2 - 1.4 + sx, deckY + 4.6, td / 2 - 3), V(-tw / 2 + 0.1 + sx * 0.4, deckY + 5.6, td / 2 - 3), 0.14, P.steelD);
  k.box(3, 1.4, 2.4, '#b9c2c4', tw / 2 - 2.4, deckY + th + 0.8, -td / 2 + 2, { r: 0.1 });
  k.box(2.4, 1.0, 2.0, '#b9c2c4', -2, deckY + th + 0.8, -td / 2 + 2, { r: 0.1 });
  k.box(tw - 4, 0.3, 0.6, '#8a8490', 0, deckY + th + 0.9, 0, { r: 0 });
  k.cyl(0.25, 0.25, 2.6, '#8a8490', -tw / 2 + 1.6, deckY + th + 0.8, -td / 2 + 1.4, 8);
  // helideck at the back corner on struts, the crane, the flag
  const hx = tw / 2 - 3.6, hz = -td / 2 + 2.8, hy = deckY + th + 2.6;
  for (const [sx, sz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) k.box(0.2, 1.9, 0.2, P.steelD, hx + sx, deckY + th + 0.8, hz + sz, { r: 0 });
  helideck(k, hx, hy, hz, 4.2);
  const cx = -tw / 2 + 2, cz = td / 2 - 2;
  k.cyl(0.6, 0.7, 2.6, TP, cx, deckY + th + 0.8, cz, 12);
  k.box(1.6, 1.2, 1.4, TP, cx, deckY + th + 3.3, cz, { r: 0.08 });
  latticeBoom(k, V(cx - 0.4, deckY + th + 3.8, cz), V(cx - 9.5, deckY + th + 8, cz + 1.5), 0.7, TP, '#e0a840', 0.5);
  k.beam(V(cx - 9.5, deckY + th + 8, cz + 1.5), V(cx - 9.5, deckY + th + 3.5, cz + 1.5), 0.05, P.ink);
  k.box(0.5, 0.5, 0.5, P.yellow, cx - 9.5, deckY + th + 3.0, cz + 1.5, { r: 0.06 });
  flag(g, anim, hx + 4.0, hz + 3.4, 3.2, 'charter', o.seed + 1, hy, 1.6);
  placard(g, hv ? 'HVDC' : 'OSS', hv ? 5 : 3.6, tw / 2 - 3.4, deckY + th - 2.4, td / 2 + 0.06, '#2f2a3d', null);
  beacon(g, -tw / 2 + 0.5, deckY + th + 1.4, td / 2 - 0.5, 0.2);
  beacon(g, tw / 2 - 0.5, deckY + th + 1.4, td / 2 - 0.5, 1.4);
  beacon(g, cx - 9.5, deckY + th + 8.4, cz + 1.5, 2.2);
  lightPool(g, 0, deckY + 0.8, td / 2 + 0.8, 4, workPool, 2.4);
  g.add(k.build());
  windows(g, glow);
  return { obj: g, w: W, d: D, h: hy + 4, update: anim.update };
}

// ── the jack-up installation vessel ──────────────────────────────────────────────────────────
/** A truss leg (square, chords + lacing) from y0 to y1 at (x, z). */
function trussLeg(k: Kit, x: number, z: number, y0: number, y1: number, b: number, chord: Paint, lace: Paint) {
  const cs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of cs) k.box(0.22, y1 - y0, 0.22, chord, x + (sx * b) / 2, y0, z + (sz * b) / 2, { r: 0, jitter: 0.02 });
  for (let y = y0; y < y1 - 1; y += 1.4)
    for (let i = 0; i < 4; i++) {
      const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
      k.beam(V(x + (ax * b) / 2, y, z + (az * b) / 2), V(x + (bx * b) / 2, y + 1.4, z + (bz * b) / 2), 0.08, lace);
    }
}

/** A jack-up installation vessel at work: legs down to the seabed, its crane lifting a nacelle onto the next turbine. */
export function jackup(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const acc = o.accent || '#2fae9b', hi = o.hi || '#5fd3b5';
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  const hullX = -3.6, hl = 19, hb = 11;
  const hb0 = 4.0, deck = hb0 + 3.2;
  // the hull, jacked up clear of the waves
  k.box(hl, 3.2, hb, acc, hullX, hb0, 0, { r: 0.25, jitter: 0.02, shade: 0.12 });
  k.box(hl + 0.06, 0.5, hb + 0.06, hi, hullX, hb0 + 2.2, 0, { r: 0.05, shade: 0 });
  k.box(hl + 0.04, 0.4, hb + 0.04, shade(acc, -0.4), hullX, hb0, 0, { r: 0.05, shade: 0 });
  k.box(hl - 0.4, 0.14, hb - 0.4, '#8a8490', hullX, deck, 0, { r: 0 });
  // the legs through their jacking housings
  const legs: [number, number][] = [[hullX - hl / 2 + 1.6, -hb / 2 + 1.6], [hullX - hl / 2 + 1.6, hb / 2 - 1.6], [hullX + hl / 2 - 1.6, -hb / 2 + 1.6], [hullX + hl / 2 - 1.6, hb / 2 - 1.6]];
  for (const [i, [x, z]] of legs.entries()) {
    trussLeg(k, x, z, SEABED, deck + 17, 1.5, shade(acc, -0.5), '#e0a840');
    k.box(2.6, 2.6, 2.6, shade(acc, -0.25), x, deck, z, { r: 0.1 });
    k.box(2.0, 0.6, 2.0, P.dark, x, SEABED, z, { r: 0.1 });
    foamRing(g, x, z, 1.1);
    beacon(g, x, deck + 17.3, z, i * 1.1);
  }
  // accommodation + bridge at the bow, a helideck on top
  const ax = hullX + hl / 2 - 3.2;
  k.box(4.4, 6.0, hb - 3.6, '#f4efe6', ax, deck, 0, { r: 0.16 });
  k.box(4.6, 1.2, hb - 3.2, '#f4efe6', ax + 0.2, deck + 6, 0, { r: 0.12 });
  k.box(4.66, 0.6, hb - 3.14, P.glassD, ax + 0.2, deck + 6.4, 0, { r: 0.04, shade: 0 });
  for (let f = 0; f < 3; f++) for (let i = 0; i < 3; i++) glow.push([ax - 1.4 + i * 1.4, deck + 1.2 + f * 1.8, (hb - 3.6) / 2 + 0.05, 0.9, 0.7]);
  helideck(k, ax + 0.2, deck + 7.4, 0, 3.0);
  k.box(0.14, 2.6, 0.14, '#d8d2cc', ax - 1.8, deck + 7.2, 2.2, { r: 0 });
  // deck cargo: blades on racks, tower sections, a nacelle
  for (let i = 0; i < 3; i++) {
    const b = bladeGeo(13, 1.4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2).translate(hullX - hl / 2 + 2.4, deck + 1.2 + i * 0.5, -hb / 2 + 2.4 + i * 0.3);
    k.geo(b, '#f6f2ea', 0.02);
  }
  for (const x of [hullX - 6, hullX + 2]) k.box(0.4, 1.0 + 0.5 * 2, 2.6, P.steelD, x, deck, -hb / 2 + 2.7, { r: 0 });
  for (let i = 0; i < 2; i++) hcyl(k, 1.6 - i * 0.12, 8, '#f1ece4', hullX - 1 + i * 0.4, deck + 1.7, hb / 2 - 2.4 - i * 0.2 + (i ? -3.4 : 0), 'x', 16);
  k.box(1.6, 1.7, 4.6, '#f1ece4', hullX + 3.6, deck, -0.2, { r: 0.3 });
  // the turbine being installed: monopile, transition piece, the first tower sections
  const tx = W / 2 - 4, tzz = 0;
  const tdeck = foundation(k, g, tx, tzz, false, -0.3);
  k.cyl(0.62, 0.98, 12, '#f1ece4', tx, tdeck, tzz, 18, { shade: 0.06 });
  k.cyl(0.66, 0.66, 0.14, '#dcd5ca', tx, tdeck + 12, tzz, 18, { shade: 0 });
  standing(g, tx - 1.6, tzz + 0.6, -1.2, o.seed + 1, 'worker', tdeck);
  // the main crane round the aft leg: house, a long lattice boom, the nacelle on the hook
  const [lx, lz] = legs[3];
  const crane = new THREE.Group();
  crane.position.set(lx, deck + 2.6, lz);
  const ck = new Kit(rng(o.seed + 2));
  ck.cyl(2.0, 2.0, 0.6, shade(acc, -0.3), 0, 0, 0, 16);
  ck.box(3.2, 2.4, 2.6, hi, -1.8, 0.6, 0, { r: 0.12 });
  ck.box(1.2, 1.0, 1.0, '#f4efe6', -1.2, 2.9, 1.0, { r: 0.1 });
  // the boom reaches up over the tower being installed
  const reachTo = Math.hypot(W / 2 - 4 - lx, 0 - lz);
  const tip = V(reachTo, 24, 0);
  latticeBoom(ck, V(0.8, 1.2, 0), tip, 1.6, hi, '#e0a840', 0.45);
  ck.beam(V(-2.8, 3.6, 0), tip.clone().add(V(0, 0.4, 0)), 0.05, P.ink);
  crane.add(ck.build());
  const hook = new THREE.Group();
  const hk = new Kit(rng(o.seed + 3));
  hk.box(1.55, 1.6, 4.6, '#f1ece4', 0, -1.6, 0, { r: 0.3 });
  hk.box(1.0, 0.5, 1.0, P.yellow, 0, 0.2, 0, { r: 0.06 });
  hook.add(hk.build());
  const cableMat = new THREE.MeshStandardMaterial({ color: col(P.ink), roughness: 0.8 });
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06).translate(0, 0.5, 0), cableMat);
  hook.add(cable);
  hook.position.copy(tip);
  crane.add(hook);
  crane.rotation.y = Math.atan2(-(tzz - lz), tx - lx);
  beacon(crane, tip.x, tip.y + 0.4, 0, 3.1);
  g.add(crane);
  // the name on the hull, deck lights
  placard(g, o.label || 'TIDEWATER', 9, hullX - 2, hb0 + 1.05, hb / 2 + 0.05, '#fbf7f0', null);
  for (const x of [hullX - 5, hullX + 2]) lightPool(g, x, deck + 0.1, 0, 4, workPool);
  standing(g, hullX - 3, 2.2, 0.8, o.seed + 4, 'worker', deck + 0.1);
  standing(g, hullX + 0.6, -2.6, -2.1, o.seed + 5, 'worker', deck + 0.1);
  g.add(k.build());
  windows(g, glow);
  const base = crane.rotation.y;
  anim.add((e) => {
    const s = 0.5 + 0.5 * Math.sin(e.t * 0.12);
    crane.rotation.y = base + (s - 0.5) * 0.18;
    const drop = 6 + s * 7;
    hook.children[0].position.y = -drop;
    cable.scale.y = drop - 0.4;
    cable.position.y = -drop + 0.4;
  });
  return { obj: g, w: W, d: D, h: deck + 30, update: anim.update };
}
