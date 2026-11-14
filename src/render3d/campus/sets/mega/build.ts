/**
 * The build-out frontier: a megaproject block under construction in the builder's colours —
 * the half-built kit of its kind (tracker rows going on from the left, turbines rising, a
 * containment wall and a cooling-tower shell climbing, a dam, a drill rig, battery slabs, a fusion
 * hall), with cranes, hoarding, the builder's cabins and board, flags, laydown and trucks.
 */
import * as THREE from 'three';
import { col, Kit, lightPool, rng, type Paint } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  Anim, beacon, builderBoard, cabin, clamp01, fieldOf, flag, floodMast, foamRing, hcyl, hoarding, instances, jit, latticeBoom, laydown,
  P, panelMat, SEA, shade, standing, strollers, TAU, towerCrane, track, V, vehicle, windows, workCrane, workPool, xf, yard,
} from './common';
import { containerUnit, postUnit, tableUnit } from './solar';
import { bladeGeo, foundation, jackup } from './wind';
import { ctK, geoPad } from './thermal';
import { hydroScheme } from './hydro';
import { ringWall } from '../fusion/common';
import { At, pipeRun } from '../../plants2/parts';

type Win = [number, number, number, number, number, number?][];

/** The inside face of a round wall (a lathe wound the other way, so it faces in). */
const innerWall = (r: number, y0: number, y1: number, seg: number, phi = 0, len = TAU) => new THREE.LatheGeometry([new THREE.Vector2(r, y1), new THREE.Vector2(r, y0)], seg, phi, len);
const SIZE = ['', 'S', 'M', 'L'];

/** A crawler crane in the builder's colours: tracks, house, a long lattice boom, a hook with a load. */
function crawlerCrane(acc: Paint, hi: Paint, boom: number, angle: number, seed: number, load?: (k: Kit) => void) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  for (const sz of [-1.5, 1.5]) {
    k.box(7.4, 1.1, 1.2, '#433c52', 0, 0, sz, { r: 0.3 });
    for (let i = 0; i < 5; i++) k.cyl(0.4, 0.4, 1.24, '#5b5562', -2.8 + i * 1.4, 0.55, sz - 0.62, 8, { rx: Math.PI / 2, shade: 0 });
  }
  k.box(3.2, 0.6, 3.6, '#5b5562', 0, 1.0, 0, { r: 0.06 });
  k.box(4.6, 2.2, 3.0, acc, -0.6, 1.6, 0, { r: 0.14 });
  k.box(1.6, 1.8, 1.2, P.cream, 1.4, 1.6, 1.4, { r: 0.1 });
  k.box(1.62, 0.8, 1.22, P.glassD, 1.4, 2.4, 1.4, { r: 0.04, shade: 0 });
  k.box(2.0, 2.4, 3.2, shade(acc, -0.35), -3.6, 1.6, 0, { r: 0.1 });
  k.box(4.62, 0.3, 3.02, hi, -0.6, 3.4, 0, { r: 0.04, shade: 0 });
  const foot = V(1.2, 2.6, 0);
  const tip = foot.clone().add(V(Math.cos(angle) * boom, Math.sin(angle) * boom, 0));
  latticeBoom(k, foot, tip, 1.3, hi, shade(acc, -0.2), 0.5);
  k.beam(V(-2.2, 3.6, 0), V(-0.6, 8, 0), 0.16, acc);
  k.beam(V(-0.6, 8, 0), tip.clone().add(V(0, 0.4, 0)), 0.06, P.ink);
  k.beam(V(-0.6, 8, 0), V(-4.2, 3.6, 0), 0.06, P.ink);
  g.add(k.build());
  beacon(g, tip.x, tip.y + 0.5, 0, seed);
  const hook = new THREE.Group();
  const hk = new Kit(rng(seed + 1));
  hk.box(0.6, 0.6, 0.5, P.yellow, 0, -0.6, 0, { r: 0.06 });
  load?.(hk);
  hook.add(hk.build());
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1, 0.09).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: col(P.ink), roughness: 0.8 }));
  const holder = new THREE.Group();
  holder.position.copy(tip);
  holder.add(cable, hook);
  g.add(holder);
  return {
    obj: g, tip,
    /** Lower the hook to `d` below the tip. */
    drop(d: number) { hook.position.y = -d; cable.scale.y = Math.max(0.1, d - 0.3); },
  };
}

/** A telehandler (a small yellow lifter with its boom raised), facing +x. */
function telehandler(k: Kit, x: number, z: number, acc: Paint, lift = 0.6) {
  k.box(3.2, 1.2, 1.8, acc, x, 0.5, z, { r: 0.2 });
  for (const [dx, dz] of [[-1.0, -0.9], [1.0, -0.9], [-1.0, 0.9], [1.0, 0.9]]) k.cyl(0.5, 0.5, 0.4, '#2f2a3d', x + dx, 0.5, z + dz - 0.2, 10, { rx: Math.PI / 2, shade: 0 });
  k.box(1.0, 1.2, 1.0, P.cream, x - 0.6, 1.7, z + 0.3, { r: 0.1 });
  k.beam(V(x - 1.2, 1.8, z - 0.4), V(x + 2.6, 1.8 + lift * 3.4, z - 0.4), 0.42, acc);
  k.box(0.9, 0.1, 1.2, P.steelD, x + 3.0, 1.6 + lift * 3.4, z - 0.4, { r: 0 });
  k.box(0.9, 0.5, 1.1, P.panel, x + 3.0, 1.7 + lift * 3.4, z - 0.4, { r: 0.03 });
}

/** A pile driver (a tracked rig with a tall leader). */
function pileDriver(k: Kit, x: number, z: number, acc: Paint) {
  k.box(3.4, 0.8, 2.4, '#433c52', x, 0, z, { r: 0.2 });
  k.box(2.4, 1.4, 1.8, acc, x, 0.8, z, { r: 0.14 });
  k.box(0.4, 6.4, 0.4, '#5b5562', x + 1.6, 0.6, z, { r: 0.02 });
  k.box(0.6, 0.8, 0.6, P.yellow, x + 1.6, 4.2, z, { r: 0.06 });
  k.beam(V(x + 0.6, 2.2, z), V(x + 1.6, 5.5, z), 0.14, acc);
}

/** The builder's yard along the front: hoarding with a gate, the cabin stack, the board, flags, a laydown, a crew. */
function siteYard(g: THREE.Object3D, k: Kit, anim: Anim, glow: Win, o: Act3SetOpts, acc: Paint, hi: Paint, kinds: Parameters<typeof laydown>[6]) {
  const W = o.w, D = o.d;
  const fz = D / 2 - 0.4;
  hoarding(k, -W / 2 + 0.4, W / 2 - 0.4, fz, acc, hi, [[-3.5, 3.5]]);
  // side hoardings (rotated copies are cheaper as boxes)
  for (const sx of [-W / 2 + 0.4, W / 2 - 0.4]) for (let z = -D / 2 + 1.6; z < fz - 1; z += 2.4) k.box(0.1, 1.9, 2.34, acc, sx, 0.05, z, { r: 0.02, jitter: 0.03, shade: 0.1 });
  cabin(k, glow, -W / 2 + 4.6, fz - 2.4, 6.4, 2.6, P.cream, acc);
  cabin(k, glow, -W / 2 + 4.6, fz - 2.4, 6.4, 2.6, P.cream, acc, 2.95);
  const text = `${o.label} ${SIZE[o.n ?? 0] ?? ''}`.trim();
  const bd = builderBoard(text, 6, acc, hi);
  bd.position.set(6.6, 3.0, fz + 0.12);
  g.add(bd);
  for (const sx of [-2.6, 2.6]) k.box(0.22, 3.9, 0.22, P.steelD, 6.6 + sx, 0, fz + 0.02, { r: 0.02 });
  flag(g, anim, -4.8, fz - 0.6, 6, { a: acc, b: hi }, o.seed + 11, 0, 2);
  flag(g, anim, 4.0, fz - 0.6, 6, { a: acc, b: hi }, o.seed + 12, 0, 2);
  flag(g, anim, W / 2 - 2, fz - 0.6, 6, { a: acc, b: hi }, o.seed + 13, 0, 2);
  laydown(k, W / 2 - 7, fz - 3.4, 9, 3.6, o.seed + 14, kinds);
  floodMast(g, k, -W / 2 + 1.4, -D / 2 + 1.4, 11, Math.PI * 0.25);
  floodMast(g, k, W / 2 - 1.4, -D / 2 + 1.4, 11, -Math.PI * 0.25);
  standing(g, -1.6, fz - 1.6, 0.3, o.seed + 15, 'engineer');
}

// ── the kinds ────────────────────────────────────────────────────────────────────────────────
function solarBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const f = fieldOf(o.backdrop);
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  const tilt = 0.44, tubeY = 1.42, tl = 4 * 1.03 + 0.12;
  const rowsZ: number[] = [];
  for (let z = -D / 2 + 2; z <= D / 2 - 6.5; z += 2.55) rowsZ.push(z);
  const n = Math.floor((W - 3) / tl);
  const x0 = -(n * tl) / 2 + tl / 2;
  const cut = Math.floor(n * p);
  const tables: THREE.Matrix4[] = [], posts: THREE.Matrix4[] = [];
  for (const z of rowsZ) {
    track(ground, x0 - tl / 2, z + 0.3, x0 + (n - 0.5) * tl, z + 0.3, 1.3, f.worn, 0);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * tl;
      posts.push(xf(x, 0, z, 0, 0, 1, 0, tubeY + 0.06));
      if (i < cut) tables.push(xf(x, tubeY + 0.18, z, 0, tilt));
    }
  }
  if (tables.length) g.add(instances(tableUnit(o.seed), tables, panelMat, jit(rng(o.seed + 2), 0.07)));
  g.add(instances(postUnit(), posts));
  // the crew at the edge of the finished rows: a telehandler with a pallet, pallets waiting, a pile driver further on
  const ex = x0 + cut * tl - tl / 2;
  const rz = rowsZ[Math.floor(rowsZ.length / 2)] + 1.25;
  telehandler(k, Math.min(W / 2 - 6, ex + 1.5), rz, acc, 0.4);
  for (let i = 0; i < 4; i++) {
    const z = rowsZ[(i * 2 + 1) % rowsZ.length] + 1.25;
    const px2 = Math.min(W / 2 - 3, ex + 3 + i * 1.6);
    k.box(2.1, 0.16, 1.2, '#a07848', px2, 0, z, { r: 0.02 });
    k.box(2.0, 0.9, 1.1, P.panel, px2, 0.16, z, { r: 0.03 });
  }
  pileDriver(k, Math.min(W / 2 - 4, ex + 10), rowsZ[1] + 1.25, acc);
  standing(g, ex + 0.2, rz + 0.8, 0.4, o.seed + 3);
  standing(g, ex - 0.6, rowsZ[2] + 1.2, 2.2, o.seed + 4);
  strollers(g, anim, [[[ex + 1, rowsZ[0] + 1.25], [ex + 1, rowsZ[rowsZ.length - 1] + 1.25]]], o.seed + 5);
  vehicle(g, 'flatbed', -W / 2 + 13, D / 2 - 3.2, 0);
  siteYard(g, k, anim, glow, o, acc, hi, ['panel', 'panel', 'crate']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 8, update: anim.update, ground: () => null };
}

function windBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const f = fieldOf(o.backdrop);
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  const yaw = -0.32;
  // three spots: a finished tower, one being stacked, a foundation with its rebar cage
  const spots: [number, number][] = [[-W / 2 + 8, -D / 2 + 7], [2, -D / 2 + 9], [W / 2 - 9, -1]];
  const H = 30, rb = 1.1, rt = 0.57;
  const towerTo = (x: number, z: number, frac: number) => {
    const h = H * frac;
    k.cyl(rb + (rt - rb) * frac, rb, h, '#f1ece4', x, 0.35, z, 18, { shade: 0.06, jitter: 0.01 });
    for (const t of [0.34, 0.67]) if (t < frac) k.cyl(rb + (rt - rb) * t + 0.02, rb + (rt - rb) * t + 0.02, 0.12, '#dcd5ca', x, 0.35 + H * t, z, 18, { shade: 0 });
    k.cyl(rb + (rt - rb) * frac + 0.04, rb + (rt - rb) * frac + 0.04, 0.2, '#9d95a6', x, 0.35 + h - 0.1, z, 18, { shade: 0 });
  };
  for (const [i, [x, z]] of spots.entries()) {
    ground.box(7, 0.09, 5, P.gravel, x + 4.6, 0.0, z + 1.6, { r: 0.04, jitter: 0.03, shade: 0 });
    k.cyl(2.4, 2.6, 0.35, P.concreteD, x, 0, z, 18);
    if (i === 2 || p < 0.25) {
      // the cage of rebar in its pit
      ground.geo(new THREE.CircleGeometry(4.2, 20).rotateX(-Math.PI / 2).translate(x, 0.05, z), '#7d5232', 0.03);
      for (let a = 0; a < 18; a++) k.box(0.07, 1.6, 0.07, '#8c4a3a', x + Math.cos((a / 18) * TAU) * 2.0, 0.2, z + Math.sin((a / 18) * TAU) * 2.0, { r: 0, jitter: 0.04 });
      for (const y of [0.6, 1.2, 1.7]) k.geo(new THREE.TorusGeometry(2.0, 0.05, 3, 20).rotateX(Math.PI / 2).translate(x, y, z), '#8c4a3a', 0);
    }
  }
  const [ax, az] = spots[0], [bx, bz] = spots[1];
  if (p >= 0.25) towerTo(ax, az, 1);
  if (p >= 0.75) {
    // nacelle and hub on the first, blades to go
    const c = Math.cos(yaw), s = Math.sin(yaw);
    k.box(1.55, 1.6, 4.6, '#f1ece4', ax - 0.6 * s, H - 0.2, az - 0.6 * c, { r: 0.3, ry: yaw });
  }
  const frac = clamp01(0.33 + p * 0.67 - 0.25);
  towerTo(bx, bz, Math.max(0.2, frac));
  // the crawler crane lifting the next section (or the nacelle) onto the second tower
  const lifting = frac < 0.95 ? 'section' : 'nacelle';
  const cr = crawlerCrane(acc, hi, 40, 1.22, o.seed + 3, (hk) => {
    if (lifting === 'section') {
      // a tower section hangs upright from its lifting yoke
      hk.cyl(0.76, 0.8, 5, '#f1ece4', 0, -6.0, 0, 16);
      hk.box(1.8, 0.2, 0.2, P.yellow, 0, -0.95, 0, { r: 0 });
    }
    else hk.box(1.55, 1.6, 4.6, '#f1ece4', 0, -2.6, 0, { r: 0.3 });
  });
  // (stood off to one side of the finished tower and turned, so the boom's tip is plumb over the tower being stacked:
  // straight on, the section hung a metre off its axis and read as floating beside it)
  cr.obj.position.set(bx - 14.23, 0, bz + 4.4);
  cr.obj.rotation.y = 0.3;
  g.add(cr.obj);
  const topY = 0.35 + H * Math.max(0.2, frac);
  const baseDrop = cr.tip.y - topY - (lifting === 'section' ? 6.5 : 3);
  anim.add((e) => cr.drop(Math.max(3, baseDrop - 2 + Math.sin(e.t * 0.25) * 2)));
  // blades waiting on their stands, a nacelle on its transport frame, tower sections lying
  for (let i = 0; i < 3; i++) {
    const b = bladeGeo(13, 1.4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2).translate(-W / 2 + 4 + i * 0.3, 0.9 + i * 0.05, 2 + i * 2.2);
    k.geo(b, '#f6f2ea', 0.02);
    for (const x of [-W / 2 + 6, -W / 2 + 14]) k.box(0.4, 0.8, 1.6, P.steelD, x, 0, 2 + i * 2.2, { r: 0.04 });
  }
  k.box(1.55, 1.6, 4.6, '#f1ece4', W / 2 - 5, 0.6, 7, { r: 0.3, ry: Math.PI / 2 });
  k.box(5, 0.6, 2, P.steelD, W / 2 - 5, 0, 7, { r: 0.04 });
  hcyl(k, 1.0, 9, '#f1ece4', W / 2 - 12, 1.1, 10, 'x', 18);
  for (const x of [W / 2 - 15, W / 2 - 9]) k.box(0.4, 0.6, 2.2, P.timberD, x, 0, 10, { r: 0.04 });
  // tracks
  track(ground, -W / 2, D / 2 - 3.6, W / 2, D / 2 - 3.6, 3.2, f.track, 0.03);
  for (const [x, z] of spots) track(ground, x + 4.6, z + 3, x + 4.6, D / 2 - 3.6, 2.4, f.track, 0.02);
  vehicle(g, 'semitruck', -2, D / 2 - 6.5, 0);
  vehicle(g, 'mixer', W / 2 - 6, -1 + 5, Math.PI / 2);
  standing(g, bx + 2.2, bz + 2.4, 0.4, o.seed + 6);
  standing(g, bx - 4, bz + 3.2, -0.6, o.seed + 7);
  standing(g, spots[2][0] + 2.6, spots[2][1] + 1.8, 2.2, o.seed + 8);
  siteYard(g, k, anim, glow, o, acc, hi, ['section', 'crate', 'rebar']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 48, update: anim.update, ground: () => null };
}

function seaWindBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  // monopiles already driven (more of them as the work goes on), the jack-up at the next
  const piles: [number, number][] = [[-W / 2 + 6, -D / 2 + 6], [-6, -D / 2 + 10], [W / 2 - 8, -D / 2 + 5]];
  for (const [i, [x, z]] of piles.entries()) {
    if (i / piles.length > p + 0.2) continue;
    const deck = foundation(k, g, x, z, false, -0.3);
    if (i === 0 && p >= 0.5) k.cyl(0.62, 0.98, 12, '#f1ece4', x, deck, z, 18, { shade: 0.06 });
  }
  const jo = { ...o, w: 28, d: 16 };
  const ju = jackup(jo);
  ju.obj.position.set(4, 0, 6);
  g.add(ju.obj);
  anim.add((e) => ju.update?.(e));
  // the builder's board on a marker buoy
  const bx = -W / 2 + 8, bz = D / 2 - 5;
  k.cyl(0.9, 1.1, 1.4, P.yellow, bx, SEA - 0.7, bz, 12);
  k.box(0.2, 4.2, 0.2, P.dark, bx, SEA + 0.6, bz, { r: 0 });
  foamRing(g, bx, bz, 1.1);
  const bd = builderBoard(`${o.label} ${SIZE[o.n ?? 0] ?? ''}`.trim(), 4.6, acc, hi);
  bd.position.set(bx, SEA + 4.2, bz + 0.16);
  g.add(bd);
  k.box(4.8, 1.5, 0.2, acc, bx, SEA + 3.45, bz, { r: 0.04 });
  beacon(g, bx, SEA + 5.2, bz, 0.3);
  g.add(k.build());
  return { obj: g, w: W, d: D, h: 45, update: anim.update };
}

function nuclearBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  yard(ground, W - 1, D - 1, 0, 0, '#bdb4aa');
  // the cooling tower's shell climbing, a jump-form ring at its lip
  const tx = 9.6, tz = -4.6, th = 30, tr = 9.2, lift = th * 0.06;
  const frac = Math.max(0.15, Math.min(1, p * 1.05));
  const pts: THREE.Vector2[] = [], inner: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * frac;
    pts.push(new THREE.Vector2(tr * ctK(t), lift + t * (th - lift)));
  }
  for (let i = 16; i >= 0; i--) {
    const t = (i / 16) * frac;
    inner.push(new THREE.Vector2(tr * ctK(t) * 0.975, lift + t * (th - lift)));
  }
  k.geo(new THREE.LatheGeometry(pts, 40).translate(tx, 0, tz), '#d8d0c4', 0.02, 0.1);
  k.geo(new THREE.LatheGeometry(inner, 40).translate(tx, 0, tz), '#8a8490', 0.02, 0.3);
  const topY = lift + frac * (th - lift), topR = tr * ctK(frac);
  k.geo(new THREE.TorusGeometry(topR, 0.35, 4, 40).rotateX(Math.PI / 2).translate(tx, topY + 0.4, tz), '#c9a35a', 0.02);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    k.box(0.1, 1.4, 0.1, '#9d95a6', tx + Math.cos(a) * (topR + 0.3), topY - 0.6, tz + Math.sin(a) * (topR + 0.3), { r: 0 });
  }
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU, b = ((i + 0.5) / 22) * TAU;
    const top = V(tx + Math.cos(b) * tr * 0.99, lift + 0.1, tz + Math.sin(b) * tr * 0.99);
    for (const aa of [a, a + TAU / 22]) k.beam(V(tx + Math.cos(aa) * tr * 1.02, 0, tz + Math.sin(aa) * tr * 1.02), top, 0.22, '#c9c1b6');
  }
  // the containment wall rising (liner plates and rebar above the pour), the dome waiting beside it
  const cx = -9, cz = -7, cr = 5.4;
  const wallH = Math.max(2.4, 7 * Math.min(1, p * 1.35));
  k.cyl(cr + 0.8, cr + 1.0, 0.6, P.concreteD, cx, 0, cz, 28);
  k.geo(new THREE.CylinderGeometry(cr, cr, wallH, 32, 1, true).translate(cx, 0.5 + wallH / 2, cz), '#c9c1b6', 0.02, 0.1);
  k.geo(new THREE.RingGeometry(cr - 0.4, cr, 32).rotateX(-Math.PI / 2).translate(cx, 0.5 + wallH, cz), '#b3aa9e', 0.02);
  k.geo(innerWall(cr - 0.4, 0.5, 0.5 + wallH, 32).translate(cx, 0, cz), '#8a8490', 0.02);
  if (wallH < 7) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      k.box(0.06, 1.4, 0.06, '#8c4a3a', cx + Math.cos(a) * (cr - 0.2), 0.5 + wallH, cz + Math.sin(a) * (cr - 0.2), { r: 0 });
    }
    k.geo(new THREE.TorusGeometry(cr - 0.2, 0.05, 3, 32).rotateX(Math.PI / 2).translate(cx, 0.5 + wallH + 1.2, cz), '#8c4a3a', 0);
  }
  const domeOn = p >= 0.75;
  const dome = new THREE.SphereGeometry(cr, 32, 8, 0, TAU, 0, Math.PI / 2);
  if (domeOn) k.geo(dome.translate(cx, 0.5 + wallH, cz), '#ece6dc', 0.015);
  else {
    k.geo(dome.translate(cx + 1, 0.5, cz + 13), '#b9c2c4', 0.015);
    for (let i = 0; i < 8; i++) k.box(0.4, 0.5, 0.4, P.steelD, cx + 1 + Math.cos((i / 8) * TAU) * cr, 0, cz + 13 + Math.sin((i / 8) * TAU) * cr, { r: 0 });
  }
  // a heavy-lift ring crane round the containment
  const ringR = 11;
  k.geo(new THREE.TorusGeometry(ringR, 0.4, 4, 48).rotateX(Math.PI / 2).translate(cx, 0.4, cz), '#5b5562', 0);
  const ring = new THREE.Group();
  ring.position.set(cx, 0, cz);
  const rk = new Kit(rng(o.seed + 3));
  rk.box(5, 3.2, 4, acc, ringR, 0.4, 0, { r: 0.12 });
  rk.box(3, 2.6, 3.6, shade(acc, -0.35), ringR + 3.6, 0.4, 0, { r: 0.1 });
  latticeBoom(rk, V(ringR - 1, 3.6, 0), V(-1.5, 34, 0), 1.6, hi, shade(acc, -0.2), 0.5);
  latticeBoom(rk, V(ringR + 1, 3.6, 0), V(ringR + 2.5, 22, 0), 1.2, hi, shade(acc, -0.2), 0.6);
  rk.beam(V(ringR + 2.5, 22, 0), V(-1.5, 34.4, 0), 0.08, P.ink);
  rk.beam(V(-1.5, 34, 0), V(-1.5, domeOn ? 14 : 12, 0), 0.06, P.ink);
  ring.add(rk.build());
  beacon(ring, -1.5, 34.6, 0, 0.4);
  g.add(ring);
  anim.add((e) => { ring.rotation.y = 0.9 + Math.sin(e.t * 0.05) * 0.5; });
  // the turbine hall's steel frame, clad to the progress
  const hx0 = -W / 2 + 1.6, hx1 = -1.6, hz0 = 0.4, hz1 = 6.4, hh = 8.4;
  for (let x = hx0; x <= hx1 + 0.01; x += (hx1 - hx0) / 6) for (const z of [hz0, hz1]) k.box(0.3, hh, 0.3, '#8a8490', x, 0.3, z, { r: 0 });
  for (const z of [hz0, hz1]) for (let y = 2.8; y <= hh; y += 2.8) k.box(hx1 - hx0, 0.24, 0.24, '#8a8490', (hx0 + hx1) / 2, y, z, { r: 0 });
  const clad = Math.max(0, p - 0.25) * hh;
  if (clad > 0.5) k.box(hx1 - hx0, clad, 0.2, '#e0dbd2', (hx0 + hx1) / 2, 0.3, hz1 + 0.1, { r: 0.04 });
  k.box(hx1 - hx0 + 0.4, 0.4, hz1 - hz0 + 0.4, P.concreteD, (hx0 + hx1) / 2, 0, (hz0 + hz1) / 2, { r: 0.05 });
  const tc = towerCrane(28, 20, acc, hi, o.seed + 4);
  tc.position.set(-1, 0, 9);
  g.add(tc);
  anim.add((e) => workCrane(tc, e, 2.2, 1.1, 10));
  vehicle(g, 'mixer', 3, 10, Math.PI / 2);
  vehicle(g, 'flatbed', 13, 9, 0);
  standing(g, cx + 6, cz + 4, 0.4, o.seed + 5);
  standing(g, 1.2, 8, 2.2, o.seed + 6);
  standing(g, tx - tr - 1, tz + 3, -0.4, o.seed + 7);
  lightPool(g, cx, 0.5, cz + 6, 7, workPool);
  siteYard(g, k, anim, glow, o, acc, hi, ['rebar', 'rebar', 'crate']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 36, update: anim.update, ground: () => null };
}

function storageBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  yard(ground, W - 1.2, D - 1.2);
  const band = '#345c96';
  const at: THREE.Matrix4[] = [];
  const n = 7, cw = 3.6, gap = 0.6, pairs = 3;
  const x0 = -W / 2 + 3 + cw / 2;
  const total = n * 2 * pairs;
  let idx = 0;
  for (let pi = 0; pi < pairs; pi++) {
    const zc = -D / 2 + 3.6 + pi * 5.6;
    for (const side of [-1, 1]) {
      const z = zc + side * 0.95;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (cw + gap);
        k.box(3.9, 0.3, 1.9, P.concrete, x, 0, z, { r: 0.04 });
        if (idx++ / total < p) at.push(xf(x, 0.3, z, side < 0 ? Math.PI : 0));
      }
    }
  }
  if (at.length) g.add(instances(containerUnit(band), at, undefined, jit(rng(o.seed + 2), 0.04)));
  // a mobile crane swinging the next container in; a truck bringing more
  const cr = crawlerCrane(acc, hi, 18, 1.0, o.seed + 3, (hk) => {
    hk.box(3.6, 2.0, 1.6, '#ece6dc', 0, -3.2, 0, { r: 0.1 });
    hk.box(3.64, 0.22, 1.64, band, 0, -1.4, 0, { r: 0.04 });
    for (const sx of [-1.6, 1.6]) hk.beam(V(0, -0.7, 0), V(sx, -1.2, 0), 0.04, P.ink);
  });
  cr.obj.position.set(W / 2 - 10, 0, D / 2 - 7.5);
  cr.obj.rotation.y = 2.6;
  g.add(cr.obj);
  anim.add((e) => cr.drop(5 + Math.sin(e.t * 0.3) * 1.5));
  vehicle(g, 'flatbed', W / 2 - 4.5, D / 2 - 4, Math.PI / 2);
  standing(g, W / 2 - 15, D / 2 - 6, 0.6, o.seed + 4);
  standing(g, 0, -D / 2 + 9.3, 1.8, o.seed + 5);
  siteYard(g, k, anim, glow, o, acc, hi, ['drum', 'drum', 'crate']);
  laydown(k, -6, D / 2 - 7.5, 10, 3.4, o.seed + 9, ['drum', 'crate']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 22, update: anim.update, ground: () => null };
}

function geoBuild(o: Act3SetOpts, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  const pad = geoPad({ ...o, vseed: 1, w: 30, d: 24 });
  pad.obj.position.set(-W / 2 + 15.5, 0, -D / 2 + 12.5);
  g.add(pad.obj);
  anim.add((e) => pad.update?.(e));
  // a second pad being levelled: a dozer, a roller, mud pits, pipe going in
  const ground = new Kit(rng(o.seed + 1));
  yard(ground, 10, 14, W / 2 - 6.5, -D / 2 + 8, '#a59a90');
  ground.box(4, 0.06, 3, '#5f3b28', W / 2 - 6.5, 0.04, -D / 2 + 5, { r: 0.02, shade: 0 });
  k.box(3.2, 1.4, 2.0, acc, W / 2 - 6, 0.3, -D / 2 + 11, { r: 0.16 });
  k.box(0.4, 1.0, 2.6, '#5b5562', W / 2 - 4.2, 0.1, -D / 2 + 11, { r: 0.04 });
  for (const sz of [-0.9, 0.9]) k.box(3.4, 0.6, 0.5, '#433c52', W / 2 - 6, 0, -D / 2 + 11 + sz, { r: 0.2 });
  k.box(1.2, 1.1, 1.2, P.cream, W / 2 - 6.6, 1.7, -D / 2 + 11, { r: 0.1 });
  laydown(k, W / 2 - 6.5, -2, 9, 4, o.seed + 4, ['pipe', 'pipe', 'crate']);
  standing(g, W / 2 - 9, -D / 2 + 9, 0.4, o.seed + 5);
  siteYard(g, k, anim, glow, o, acc, hi, ['pipe', 'crate', 'rebar']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 32, update: anim.update, ground: () => null };
}

/** The look of each fusion design's heart (the colour it glows in the distance). */
const FUSION_HUE: Record<string, string> = { tokamak: '#f7a6c4', stellarator: '#d08fdc', laser: '#fff6d8', pinch: '#f7b258', dhe3: '#fde9a4' };

function fusionBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint, design: string): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  yard(ground, W - 1, D - 1, 0, 0, '#bdb4aa');
  const cx = -3, cz = -4, R = 10;
  const hue = FUSION_HUE[design] ?? FUSION_HUE.tokamak;
  const steel = '#b9c2c4';
  const lit = new THREE.Mesh(new THREE.TorusGeometry(design === 'laser' ? 3.95 : design === 'dhe3' ? 2.75 : 5.6, 0.08, 4, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col(hue), toneMapped: false }));
  lit.visible = p >= 0.75;
  g.add(lit);
  if (design === 'dhe3') {
    // a linear machine goes up as a linear machine (the finished plant is a long capsule in the open, no hall): its
    // base and cradles first, then the vessel section by section from one end, each with its hoop of coils, a
    // scaffold along both sides, the next section waiting on timbers
    const len = 20, vr = 2.3, vy = 4.0, x0 = cx - len / 2;
    k.box(len + 1.6, 0.7, 6.6, '#e3ded6', cx, 0, cz, { r: 0.2, shade: 0.12 });
    for (let i = 0; i < 8; i++) k.box(0.9, vy - vr - 0.2, 3.4, '#cfc7bb', x0 + 1.4 + (i * (len - 2.8)) / 7, 0.7, cz, { r: 0.1, shade: 0.1 });
    const segs = 10, placed = Math.max(2, Math.round(segs * Math.min(1, p * 1.25))), sl = len / segs;
    for (let i = 0; i < placed; i++) {
      const x = x0 + (i + 0.5) * sl;
      hcyl(k, vr, sl - 0.06, i % 2 ? '#f4f1ec' : '#e6e1da', x, vy, cz, 'x', 24);
      k.geo(new THREE.TorusGeometry(vr + 0.3, 0.2, 6, 24).rotateY(Math.PI / 2).translate(x, vy, cz), shade(hi, 0.05), 0.02);
    }
    k.geo(new THREE.SphereGeometry(vr, 20, 10, 0, TAU, 0, Math.PI / 2).rotateZ(Math.PI / 2).scale(0.6, 1, 1).translate(x0, vy, cz), '#f4f1ec', 0.02);
    // the open end: the flange of the last section, dark inside
    const xe = x0 + placed * sl;
    k.geo(new THREE.CircleGeometry(vr - 0.25, 24).rotateY(Math.PI / 2).translate(xe + 0.01, vy, cz), '#3a3448', 0, 0);
    k.geo(new THREE.TorusGeometry(vr - 0.05, 0.16, 6, 24).rotateY(Math.PI / 2).translate(xe, vy, cz), '#8a8490', 0.02);
    // the next section on timbers in front, a coil hoop leaning on it
    if (placed < segs) {
      const wx = cx + 5, wz = cz + 7.4;
      for (const dx of [-0.6, 0.6]) k.box(0.3, 0.3, 4.4, P.timberD, wx + dx, 0.1, wz, { r: 0.03 });
      hcyl(k, vr, sl - 0.06, '#f4f1ec', wx, vr + 0.4, wz, 'x', 24);
      k.geo(new THREE.TorusGeometry(vr + 0.3, 0.2, 6, 24).rotateX(Math.PI / 2 - 0.12).translate(wx - 4.2, 0.42, wz), shade(hi, 0.05), 0.02);
    }
    // the scaffold along both sides, as far as the vessel has got (and a bay beyond)
    const sx1 = Math.min(x0 + len, xe + sl);
    for (const sz of [-3.9, 3.9]) {
      for (let x = x0; x <= sx1 + 0.01; x += 2.5) k.box(0.1, 7.4, 0.1, acc, x, 0.7, cz + sz, { r: 0 });
      for (const y of [2.6, 4.9, 7.2]) {
        k.box(sx1 - x0, 0.06, 0.06, acc, (x0 + sx1) / 2, 0.7 + y + 0.9, cz + sz, { r: 0 });
        k.box(sx1 - x0, 0.08, 0.8, P.timber, (x0 + sx1) / 2, 0.7 + y, cz + sz, { r: 0 });
      }
    }
    lit.geometry.rotateZ(Math.PI / 2);
    lit.position.set(xe - sl / 2, vy, cz);
  } else if (design === 'stellarator') {
    // the stellarator's hall is a long glass vault on portal frames, not a concrete drum: the machine is assembled on
    // its plinth while the frames go up bay by bay, columns first, then the arches
    const hw = 12, hd = 8.5, bays = 7;
    k.box(hw * 2 + 1.6, 0.6, hd * 2 + 1.6, P.concrete, cx, 0, cz, { r: 0.06, shade: 0.1 });
    k.cyl(8.6, 8.8, 0.5, P.concreteD, cx, 0.6, cz, 32);
    const segs = 18, placed = Math.max(4, Math.round(segs * Math.min(1, p * 1.3)));
    for (let i = 0; i < placed; i++) {
      const a = (i / segs) * TAU;
      k.geo(new THREE.TorusGeometry(5.6, 2.0, 10, 3, TAU / segs - 0.03).rotateZ(a).rotateX(Math.PI / 2).translate(cx, 4.4, cz), i % 2 ? steel : '#a9b2b4', 0.02);
      k.geo(new THREE.TorusGeometry(2.5, 0.32, 6, 14).rotateY(-a + Math.PI / 2).rotateZ(Math.sin(a * 5) * 0.5).translate(cx + Math.cos(a) * 5.6, 4.4, cz + Math.sin(a) * 5.6), shade(acc, -0.1), 0.02);
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.box(0.5, 3.0, 0.5, '#8a8490', cx + Math.cos(a) * 5.6, 1.1, cz + Math.sin(a) * 5.6, { r: 0.04 }); }
    const colH = 7.5 * Math.min(1, p * 1.6 + 0.2);
    const arched = Math.round(bays * Math.max(0, Math.min(1, (p - 0.35) * 1.8)));
    for (let i = 0; i <= bays; i++) {
      const x = cx - hw + (i * hw * 2) / bays;
      for (const sz of [-1, 1]) k.box(0.4, colH, 0.4, acc, x, 0.6, cz + sz * hd, { r: 0.03 });
      if (i < arched || (i === bays && arched === bays)) {
        // an arch: a low vault from column head to column head
        let prev = V(x, 0.6 + colH, cz - hd);
        for (let j = 1; j <= 8; j++) {
          const t = j / 8, q = V(x, 0.6 + colH + Math.sin(t * Math.PI) * 4.2, cz - hd + t * hd * 2);
          k.beam(prev, q, 0.3, acc);
          prev = q;
        }
      }
    }
    for (const sz of [-1, 1]) if (p >= 0.5) k.box(hw * 2, 0.24, 0.24, shade(acc, -0.12), cx, 0.6 + colH - 0.3, cz + sz * hd, { r: 0 });
    lit.position.set(cx, 4.4, cz);
  } else if (design === 'laser') {
    // the finished plant's own plan (fusion/laser.ts: the same centre, sizes and angles), part built: the target
    // chamber in its low open bioshield ring, its shell closing from the bottom up on the pedestal inside a
    // scaffold; the two laser bays that converge on it in a V going up as steel frames on their slabs, clad from
    // the far end; the end frames and the first beam tubes last
    const lx = -2.2, lz = -4.6, cy = 6.5, CR = 3.8;
    k.cyl(6.7, 6.9, 0.45, P.concreteD, lx, 0, lz, 48);
    k.geo(ringWall(6.4, 5.4, 0.45, 2.0 * Math.min(1, 0.3 + p * 1.4), 0.55, TAU - 0.55, 64).translate(lx, 0, lz), '#d6cfc4', 0.03, 0.14);
    k.cyl(1.7, 2.1, CR * 0.62 + 0.4, '#aaa39a', lx, 0.45, lz, 20);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      k.beam(V(lx + Math.sin(a) * 3.6, 0.45, lz + Math.cos(a) * 3.6), V(lx + Math.sin(a) * 2.2, cy - 2.4, lz + Math.cos(a) * 2.2), 0.4, '#7a7186');
    }
    const f = Math.min(1, 0.35 + p * 0.85), top = cy + CR * Math.cos(Math.PI * (1 - f));
    k.geo(new THREE.SphereGeometry(CR, 28, 18, 0, TAU, Math.PI * (1 - f), Math.PI * f).translate(lx, cy, lz), steel, 0.02);
    if (f < 1) {
      k.geo(new THREE.TorusGeometry(CR * Math.sin(Math.PI * f), 0.14, 6, 28).rotateX(Math.PI / 2).translate(lx, top, lz), '#8a8490', 0.02);
      k.geo(new THREE.CircleGeometry(CR * Math.sin(Math.PI * f) - 0.1, 28).rotateX(-Math.PI / 2).translate(lx, top - 0.3, lz), '#3a3448', 0, 0);
    }
    // the scaffold round the shell: standards, a ledger and a deck at each lift, up to the working edge
    const lifts = Math.max(1, Math.floor((top + 0.6 - 0.45) / 2.3));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26;
      k.box(0.1, lifts * 2.3 + 1.1, 0.1, acc, lx + Math.sin(a) * 5.0, 0.45, lz + Math.cos(a) * 5.0, { r: 0 });
    }
    for (let j = 1; j <= lifts; j++) {
      k.geo(new THREE.TorusGeometry(5.0, 0.05, 4, 36).rotateX(Math.PI / 2).translate(lx, 0.45 + j * 2.3 + 1.0, lz), acc, 0, 0);
      k.geo(new THREE.RingGeometry(4.45, 5.05, 36).rotateX(-Math.PI / 2).translate(lx, 0.45 + j * 2.3, lz), '#aaa4b0', 0.03, 0);
    }
    const Lb = 12.4, Wb = 5.4, Hb = 4.4, inner = 7.0, bays = 6, bl = (Lb - 0.4) / bays;
    const fh = (Hb - 0.15) * Math.min(1, 0.3 + p * 1.4);
    const clad = Math.round((bays - 1) * clamp01((p - 0.45) * 2.2));
    const tubes = p >= 0.75 ? 4 : 0;
    const portAt = (az: number, el: number) => V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    [Math.PI + 0.45, Math.PI - 0.45].forEach((phi, bi) => {
      const dx = Math.cos(phi), dz = Math.sin(phi), mid = inner + Lb / 2;
      const a = new At(k, lx + dx * mid, 0, lz + dz * mid, Math.PI - phi);
      a.box(Lb + 0.4, 0.4, Wb + 0.4, P.concrete, 0, 0, 0, { r: 0.06 });
      for (let i = 0; i <= bays; i++) {
        const x = -Lb / 2 + 0.2 + i * bl;
        for (const sz of [-1, 1]) a.box(0.28, fh, 0.28, shade(acc, -0.05), x, 0.4, sz * (Wb / 2 - 0.16), { r: 0, jitter: 0 });
        if (p >= 0.5) a.box(0.2, 0.24, Wb - 0.3, '#8a8490', x, 0.4 + fh - 0.24, 0, { r: 0, jitter: 0 });
      }
      if (p >= 0.5) for (const sz of [-1, 1]) a.box(Lb - 0.4, 0.24, 0.2, '#8a8490', 0, 0.4 + fh - 0.24, sz * (Wb / 2 - 0.16), { r: 0, jitter: 0 });
      if (clad) {
        // (the far end first: walls, the band, the roof deck)
        const len = clad * bl + 0.2, x = -Lb / 2 + len / 2;
        a.box(len, Hb, Wb, '#e3ddd3', x, 0.3, 0, { r: 0.1, shade: 0.14 });
        a.box(len + 0.03, 0.42, Wb + 0.05, acc, x, Hb - 0.55, 0, { r: 0.04, shade: 0 });
        a.box(len + 0.15, 0.3, Wb + 0.3, P.roof, x, Hb + 0.2, 0, { r: 0.06, shade: 0 });
        a.box(0.1, 2.1, 1.2, '#5b5562', -Lb / 2 - 0.03, 0.35, 0, { r: 0, jitter: 0 });
      }
      if (p >= 0.5) {
        // the end frame the beamlines will leave from, then the first of them
        a.box(0.7, Hb + 1.2, Wb - 1.0, '#9aa0a8', Lb / 2 + 0.35, 0.3, 0, { r: 0.06 });
        for (const y of [1.2, 2.8, 4.4]) a.box(0.74, 0.14, Wb - 0.9, '#5b5562', Lb / 2 + 0.35, y, 0, { r: 0, jitter: 0 });
      }
      const starts: [number, number][] = [[-1.4, 2.9], [1.4, 2.9], [-0.7, 4.3], [0.7, 4.3]];
      starts.slice(0, tubes).forEach(([side, y], i) => {
        const az = Math.atan2(dx, dz) + (side < 0 ? -0.36 : 0.36) * (bi === 0 ? -1 : 1);
        const pd = portAt(az, i < 2 ? -0.25 : 0.25);
        pipeRun(k, [a.pt(Lb / 2 + 0.75, y, side), V(lx, cy, lz).addScaledVector(pd, CR + 0.2)], 0.22, '#c3c8cc', { seg: 8 });
      });
    });
    lit.position.set(lx, cy, lz);
  } else {
    // the bioshield: a thick round wall rising, the machine being assembled inside it (a tokamak's goes up to the
    // hall's eaves; a pinch plant keeps a low ring)
    const wallH = design === 'pinch' ? Math.max(1.2, 2.6 * Math.min(1, p * 2)) : Math.max(1.5, 11 * Math.min(1, p * 1.2));
    k.cyl(R + 1.2, R + 1.4, 0.8, P.concreteD, cx, 0, cz, 40);
    // the wall is left open towards the road until the machine is in (the gap closes as it goes on)
    const gap = 0.75 - p * 0.45;
    k.geo(new THREE.CylinderGeometry(R, R, wallH, 40, 1, true, gap, TAU - 2 * gap).translate(cx, 0.8 + wallH / 2, cz), '#d8d0c4', 0.02, 0.12);
    k.geo(innerWall(R - 1.2, 0.8, 0.8 + wallH, 40, gap, TAU - 2 * gap).translate(cx, 0, cz), '#9d95a6', 0.02);
    k.geo(new THREE.RingGeometry(R - 1.2, R, 40, 1, -Math.PI / 2 + gap, TAU - 2 * gap).rotateX(-Math.PI / 2).translate(cx, 0.8 + wallH, cz), '#cfc7bb', 0.02);
    for (const sgn of [-1, 1]) {
      const a = sgn * gap;
      k.box(1.3, wallH, 0.3, '#cfc7bb', cx + Math.sin(a) * (R - 0.6), 0.8, cz + Math.cos(a) * (R - 0.6), { r: 0.04, ry: a + Math.PI / 2 });
    }
    if (design === 'pinch') {
      // the vessel going up on its plinth under the gantry that will serve it, the capacitor banks set round one by one
      const vh = 9 * Math.min(1, 0.3 + p);
      k.cyl(4.2, 4.4, 1.5, '#a9a197', cx, 0.8, cz, 16, { shade: 0.15 });
      k.cyl(2.8, 2.8, vh, steel, cx, 2.3, cz, 24);
      k.cyl(2.95, 2.95, 0.3, '#8a8490', cx, 2.3 + vh - 0.3, cz, 24, { shade: 0 });
      const banks = Math.round(16 * Math.min(1, p * 1.3));
      for (let i = 0; i < banks; i++) {
        const a = (i / 16) * TAU + 0.2;
        k.box(1.4, 3.2, 1.0, '#7a7186', cx + Math.cos(a) * 6.4, 0.8, cz + Math.sin(a) * 6.4, { r: 0.08, ry: -a });
      }
      for (const sx of [-1, 1]) {
        k.box(0.8, 17, 0.8, acc, cx + sx * 8.2, 0.8, cz - 1.5, { r: 0.05 });
        k.beam(V(cx + sx * 8.2, 0.9, cz + 2.5), V(cx + sx * 8.2, 12, cz - 1.5), 0.4, acc);
      }
      k.box(18, 1.2, 1.2, acc, cx, 17.6, cz - 1.5, { r: 0.06 });
      k.box(1.6, 1.0, 1.6, '#433c52', cx + 2, 16.7, cz - 1.5, { r: 0.05 });
      k.box(0.08, 16.7 - (2.3 + vh) - 0.6, 0.08, '#2f2a3d', cx + 2, 2.3 + vh + 0.6, cz - 1.5, { r: 0 });
    } else {
      // a torus (stellarators get a twist of coils), segments placed to the progress
      const segs = 18, placed = Math.max(4, Math.round(segs * Math.min(1, p * 1.3)));
      for (let i = 0; i < placed; i++) {
        const a = (i / segs) * TAU;
        const tor = new THREE.TorusGeometry(5.6, 2.2, 10, 3, TAU / segs - 0.03).rotateZ(a).rotateX(Math.PI / 2);
        k.geo(tor.translate(cx, 4.2, cz), i % 2 ? steel : '#a9b2b4', 0.02);
        const tw = design === 'stellarator' ? Math.sin(a * 5) * 0.5 : 0;
        k.geo(new THREE.TorusGeometry(2.7, 0.35, 6, 14).rotateY(-a + Math.PI / 2).rotateZ(tw).translate(cx + Math.cos(a) * 5.6, 4.2, cz + Math.sin(a) * 5.6), shade(acc, -0.1), 0.02);
      }
      k.cyl(1.4, 1.4, 6.6, '#8a8490', cx, 0.8, cz, 16);
    }
    lit.position.set(cx, design === 'pinch' ? 4.4 : 4.2, cz);
    // the hall's frame rising round it (the tokamak's hall: the others stand in the open), a tower crane
    const hh = design === 'pinch' ? 0 : 18 * Math.min(1, p * 1.15);
    if (hh) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      k.box(0.5, hh, 0.5, '#8a8490', cx + Math.cos(a) * (R + 2), 0, cz + Math.sin(a) * (R + 2), { r: 0 });
    }
    if (hh && p >= 0.75) for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU, b = ((i + 1) / 10) * TAU;
      k.beam(V(cx + Math.cos(a) * (R + 2), hh, cz + Math.sin(a) * (R + 2)), V(cx + Math.cos(b) * (R + 2), hh, cz + Math.sin(b) * (R + 2)), 0.3, '#8a8490');
      k.beam(V(cx + Math.cos(a) * (R + 2), hh, cz + Math.sin(a) * (R + 2)), V(cx, hh + 3, cz), 0.2, '#9d95a6');
    }
  }
  const tc = towerCrane(30, 22, acc, hi, o.seed + 4);
  tc.position.set(cx + R + 4, 0, cz + 8);
  g.add(tc);
  anim.add((e) => workCrane(tc, e, 2.6, 1.0, 12));
  const c2 = towerCrane(24, 18, acc, hi, o.seed + 5);
  // (a laser plant's second crane stands between its two bays, where the capacitor hall will be)
  if (design === 'laser') c2.position.set(-15.9, 0, -4.6);
  else c2.position.set(cx - R - 3.5, 0, cz - 5);
  if ((o.n ?? 1) >= 2) {
    g.add(c2);
    anim.add((e) => workCrane(c2, e, 0.2, 1.1, 10));
  }
  vehicle(g, 'semitruck', 8, 8.6, 0);
  standing(g, cx + 2.2, cz + R + 3.2, 0.3, o.seed + 6);
  standing(g, cx - 3.0, cz + R + 3.0, -0.5, o.seed + 7, 'engineer');
  siteYard(g, k, anim, glow, o, acc, hi, ['crate', 'rebar', 'pipe']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 34, update: anim.update, ground: () => null };
}

/** Anything else (air capture and the like): foundations, steel frames, a crane. */
function genericBuild(o: Act3SetOpts, p: number, acc: Paint, hi: Paint): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const k = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  const glow: Win = [];
  yard(ground, W - 1, D - 1);
  for (let i = 0; i < 3; i++) {
    const x = -W / 2 + 8 + i * 12, z = -6;
    k.box(9, 0.5, 9, P.concrete, x, 0, z, { r: 0.05 });
    const h = Math.max(1.5, 7 * Math.min(1, p * 1.3 - i * 0.25));
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) k.box(0.3, h, 0.3, '#8a8490', x - 4 + a * 4, 0.5, z - 4 + b * 4, { r: 0 });
    for (let a = 0; a < 3; a++) k.box(8.3, 0.24, 0.24, '#8a8490', x, 0.5 + h, z - 4 + a * 4, { r: 0 });
  }
  const tc = towerCrane(24, 18, acc, hi, o.seed + 4);
  tc.position.set(0, 0, 4);
  g.add(tc);
  anim.add((e) => workCrane(tc, e, 1.4, 1.1, 10));
  standing(g, -3, 3, 0.4, o.seed + 5);
  siteYard(g, k, anim, glow, o, acc, hi, ['crate', 'rebar', 'pipe']);
  g.add(k.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  windows(g, glow);
  return { obj: g, w: W, d: D, h: 28, update: anim.update, ground: () => null };
}

/** The build-out frontier: `variant` = the contract kind under construction, at progress `p`, in the builder's colours. */
export function megaBuild(o: Act3SetOpts): Piece {
  const [kind, opt] = (o.variant || 'solar').split(':');
  const p = Math.max(0.12, Math.min(0.97, o.p ?? 0.5));
  const acc = o.accent || P.orange, hi = o.hi || P.yellow;
  switch (kind) {
    case 'wind': return o.offshore ? seaWindBuild(o, p, acc, hi) : windBuild(o, p, acc, hi);
    case 'nuclear': return nuclearBuild(o, p, acc, hi);
    case 'hydro': return hydroScheme(o, { p, acc, hi, label: o.label, size: o.n ?? 1 });
    case 'geo': return geoBuild(o, acc, hi);
    case 'storage': return storageBuild(o, p, acc, hi);
    case 'ffleet': return fusionBuild(o, p, acc, hi, opt ?? 'tokamak');
    case 'solar': return solarBuild(o, p, acc, hi);
    default: return genericBuild(o, p, acc, hi);
  }
}
