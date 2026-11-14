/**
 * The yards' ends and their empty berth: the outbound cradle (the left end: finished products in
 * stacks, a release arm handing them one by one to a tow pack that hauls each off toward the swarm
 * on a bridle), the feed dock (the right end: a net cone catching capsules from the Moon's
 * mass driver, the feed silo, an ore hauler docking with pods of asteroid rock) and the berth
 * (a bare truss before any foundry is seeded: an empty frame with its clamps open, a survey
 * beacon, a tug waiting, solar wings).
 */
import * as THREE from 'three';
import { Kit, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { hcyl, pipe } from '../mega/common';
import {
  Anim, asProduct, drone, endCap, FeedLine, filmMat, flicker, glassMat, halo, lerp, lit, paint, parseFlags, plate, RobotArm, S, SPINE, span,
  spaceTime, spacewalker, timed, truss, tug, V, warnLamp, yardsZ, type Product,
} from './common';
import { finishedProduct, PRODUCT } from './products';

const ease = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

// ════════════════════════════════════════ THE OUTBOUND ════════════════════════════════════════
interface Lane {
  kind: Product;
  arm: RobotArm;
  pick: THREE.Vector3;
  rel: THREE.Vector3;
  drift: THREE.Vector3;
  P: number;
  off: number;
  held: THREE.Group;
  fly: { g: THREE.Group; mats: THREE.Material[]; jets: { set(k: number): void } }[];
  /** The attitude a towed piece settles into: its tow pack leading, straight down the lane. */
  turn: THREE.Quaternion;
  /** The tow pack for the next release: out of its dispenser, across to where the arm will let go. */
  pack: THREE.Group;
  packJets: { set(k: number): void };
  from: THREE.Vector3;
}

/** How far ahead of a product's middle its tow pack flies (x, toward the lane), and where its bridle makes fast. */
const TOW: Record<Product, { x: number; pts: [number, number, number][] }> = {
  c: { x: -(PRODUCT.w / 2 + 3.6), pts: [[-PRODUCT.w / 2 - 0.07, PRODUCT.h / 2 - 0.1, 0], [-PRODUCT.w / 2 - 0.07, -PRODUCT.h / 2 - 0.1, 0]] },
  r: { x: -(PRODUCT.ringR + 3.4), pts: [[-PRODUCT.ringR * 0.64, PRODUCT.ringR * 0.72, 0], [-PRODUCT.ringR * 0.64, -PRODUCT.ringR * 0.72, 0], [-PRODUCT.ringR + 0.3, 0, 0]] },
  h: { x: -(2.6 + 3.6), pts: [[-2.5, PRODUCT.h / 2 - 0.2, -0.5], [-2.5, -PRODUCT.h / 2 + 0.2, -0.5]] },
};

/**
 * A tow pack, its nose toward −x, centred on (x, 0, 0): a white body in the owner's band, a thruster
 * pod out on each side (so the exhaust passes either side of what it tows), a tow eye at the back.
 */
function towPack(k: Kit, x: number, accent: string, hi: string) {
  k.box(1.3, 0.8, 0.8, S.white, x, -0.4, 0, { r: 0.16, shade: 0.2 });
  k.box(1.34, 0.18, 0.84, accent, x, 0.02, 0, { r: 0.04, shade: 0 });
  k.box(0.2, 0.4, 0.5, S.black, x - 0.7, -0.2, 0, { r: 0.06, shade: 0 });
  k.box(0.5, 0.06, 0.6, S.solar, x - 0.1, 0.42, 0, { r: 0.01, shade: 0 });
  for (const sz of [-1, 1]) {
    k.box(0.3, 0.14, 0.6, S.mid, x + 0.1, -0.07, sz * 0.6, { r: 0.03, shade: 0 });
    k.cyl(0.2, 0.2, 0.8, S.grey, x - 0.3, 0, sz * 0.95, 10, { rz: -Math.PI / 2, shade: 0 });
    k.cyl(0.26, 0.16, 0.3, S.dark, x + 0.5, 0, sz * 0.95, 10, { rz: -Math.PI / 2, shade: 0 });
    k.box(0.14, 0.14, 0.14, hi, x - 0.3, 0.2, sz * 0.95, { r: 0.02, shade: 0 });
  }
  k.geo(new THREE.TorusGeometry(0.16, 0.05, 5, 10).translate(x + 0.75, 0, 0), S.dark, 0.02, 0);
  return [V(x + 0.95, 0, -0.95), V(x + 0.95, 0, 0.95)];
}

export function yardsOutbound(o: Act3SetOpts): Piece {
  const [pa, fl] = (o.variant ?? 'c|').split('|');
  const main = asProduct(pa?.[0]);
  const second = pa && pa.length > 1 && pa[1] !== pa[0] ? asProduct(pa[1]) : null;
  const flags = parseFlags(fl);
  const live = !flags.halted;
  const W = o.w, D = o.d, zs = yardsZ(D);
  const g = new THREE.Group();
  g.name = 'set:yardsOutbound';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  const E = -4.5;
  truss(k, E, W / 2, zs, { collars: [false, true] });
  endCap(k, g, E, zs, -1);
  // the feed line stops in a buffer inside the truss
  k.box(2.8, 3.0, 3.0, S.grey, 3.4, SPINE.y - 1.5, zs, { r: 0.14, shade: 0.15 });
  k.box(2.9, 0.3, 3.1, S.hazard, 3.4, SPINE.y + 1.2, zs, { r: 0.04, shade: 0 });
  const feed = new FeedLine(g, 4.4, W / 2, zs);
  g.add(feed.obj);
  // ── the cradle: portal frames on the spine carrying the stacks ──
  const SX = 9.6, top = 21.4, ys = SPINE.y + SPINE.s / 2, yb = SPINE.y - SPINE.s / 2;
  const { w: pw, h: ph } = PRODUCT;
  const px0 = SX - pw / 2 - 0.7, px1 = SX + pw / 2 + 0.7;
  const zb = zs - 3.0, zf = zs + 3.1;
  for (const x of [px0, px1]) for (const z of [zb, zf]) k.box(0.5, top - ys, 0.5, S.light, x, ys, z, { r: 0.08, shade: 0.1 });
  for (const x of [px0, px1]) k.box(0.55, 0.55, zf - zb + 0.5, S.white, x, top - 0.5, (zb + zf) / 2, { r: 0.08, shade: 0 });
  for (const z of [zb, zf]) k.box(px1 - px0 + 0.5, 0.55, 0.55, S.white, SX, top - 0.5, z, { r: 0.08, shade: 0 });
  for (const x of [px0, px1]) k.beam(V(x, ys + 0.4, zb + 0.3), V(x, top - 0.6, zf - 0.3), 0.18, S.mid);
  k.beam(V(px0 + 0.3, ys + 0.4, zb), V(px1 - 0.3, top - 0.6, zb), 0.18, S.mid);
  // guide rails each side of the stack
  for (const x of [px0 + 0.45, px1 - 0.45]) k.box(0.22, 0.22, zf - zb, S.dark, x, ys + 3.6, (zb + zf) / 2, { r: 0.03, shade: 0 });
  for (const x of [px0 + 0.45, px1 - 0.45]) k.box(0.22, 0.22, zf - zb, S.dark, x, top - 2.4, (zb + zf) / 2, { r: 0.03, shade: 0 });
  // the sign over the cradle
  k.box(px1 - px0 - 1, 1.4, 0.3, S.ink, SX, top + 0.1, zf, { r: 0.1, shade: 0 });
  plate(g, 'OUTBOUND', px1 - px0 - 1.8, SX, top + 0.8, zf + 0.18, '#5fd3b5', null, 0, 1.0);
  const warn = warnLamp(g, px1, top + 0.6, zb, flags.halted, 1.1);
  // a second cradle hangs under the spine for the second product
  if (second) {
    const bot = yb - ph - 1.2;
    for (const x of [px0, px1]) for (const z of [zb, zf]) k.box(0.5, yb - bot, 0.5, S.light, x, bot, z, { r: 0.08, shade: 0.1 });
    for (const x of [px0, px1]) k.box(0.55, 0.55, zf - zb + 0.5, S.white, x, bot, (zb + zf) / 2, { r: 0.08, shade: 0 });
    for (const z of [zb, zf]) k.box(px1 - px0 + 0.5, 0.55, 0.55, S.white, SX, bot, z, { r: 0.08, shade: 0 });
    k.beam(V(px0 + 0.3, bot + 0.6, zb), V(px1 - 0.3, yb - 0.4, zb), 0.18, S.mid);
  }
  // ── the control pod under the spine at the right ──
  const cx0 = 12.9, cx1 = 16.6, cy0 = 0.6;
  k.box(cx1 - cx0, yb - cy0, 5.2, S.pale, (cx0 + cx1) / 2, cy0, zs + 0.6, { r: 0.3, shade: 0.2 });
  k.box(cx1 - cx0 + 0.04, 0.5, 5.24, o.accent, (cx0 + cx1) / 2, yb - 1.4, zs + 0.6, { r: 0.04, shade: 0 });
  k.box(cx1 - cx0 - 0.6, 0.6, 0.1, S.black, (cx0 + cx1) / 2, cy0 + 2.4, zs + 3.22, { r: 0.04, shade: 0 });
  hcyl(k, 0.7, cx1 - cx0, S.foil, cx0, cy0 - 0.3, zs + 0.6, 'x', 12);
  const podWin = lit('#fde9a4', 1.5);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.05), podWin);
    m.position.set(cx0 + 0.7 + i * 0.75, cy0 + 2.7, zs + 3.27);
    g.add(m);
  }
  k.box(0.3, 1.0, 0.3, S.dark, (cx0 + cx1) / 2, yb - 0.2, zs + 0.6, { r: 0.04 });
  g.add(k.build());
  // ── the stacks and the lanes ──
  const mk = (kind: Product, s: number, transparent: boolean) => {
    const pm = paint();
    const fm = filmMat({ transparent });
    if (transparent) { pm.transparent = true; }
    return { g: finishedProduct(kind, s, pm, fm), mats: [pm, fm] };
  };
  // a piece let go leaves under tow: a pack ahead of it, a bridle back to its frame (nothing just drifts off)
  const towed = (kind: Product, s: number) => {
    const f = mk(kind, s, true);
    const tk = new Kit(rng(s + 3));
    const T = TOW[kind];
    const noz = towPack(tk, T.x, o.accent, o.hi);
    for (const [bx, by, bz] of T.pts) tk.beam(V(T.x + 0.85, 0, 0), V(bx, by, bz), 0.05, S.pale);
    const tm = tk.build(f.mats[0]);
    tm.castShadow = false;
    f.g.add(tm);
    const jets = halo(noz, [1.5, 1.5], '#7fe8ff', 0.9);
    f.g.add(jets.obj);
    return { ...f, jets };
  };
  const stack = (kind: Product, cy: number) => {
    const proto = finishedProduct(kind, o.seed + (kind === 'c' ? 1 : kind === 'r' ? 2 : 3));
    const n = kind === 'h' ? 6 : 8;
    const step = kind === 'h' ? 0.9 : 0.66;
    for (let i = 0; i < n; i++) {
      const c = proto.clone();
      c.position.set(SX, cy, zb + 0.7 + i * step);
      g.add(c);
    }
    return zb + 0.7 + n * step;
  };
  const lanes: Lane[] = [];
  const mainY = ys + 0.6 + ph / 2 + 0.3;
  const mainFront = stack(main, mainY);
  const armM = new RobotArm(5.4, 5.3, 1.2, ys, zs + 0.9, { tool: 'grip', seed: o.seed + 30, base: 1.2 });
  g.add(armM.root);
  const laneOf = (kind: Product, arm: RobotArm, cy: number, front: number, rel: THREE.Vector3, drift: THREE.Vector3, P: number, off: number): Lane => {
    const held = mk(kind, o.seed + 60 + lanes.length, false).g;
    g.add(held);
    // (two on the lane at a time: a third would have its pack in the wake of the piece ahead)
    const fly = [0, 1].map((i) => { const f = towed(kind, o.seed + 70 + i + lanes.length * 5); g.add(f.g); return f; });
    // the next pack, and the dispenser on the spine it comes out of (above for the first lane, below for the second)
    const up = lanes.length === 0 ? 1 : -1;
    const dy = up > 0 ? ys + 1.0 : yb - 2.5;
    dk.box(2.8, 1.5, 1.7, S.pale, -2.9, dy, zs, { r: 0.16, shade: 0.15 });
    dk.box(2.84, 0.22, 1.74, o.accent, -2.9, dy + 1.05, zs, { r: 0.04, shade: 0 });
    dk.box(0.08, 1.1, 1.3, S.ink, -4.32, dy + 0.2, zs, { r: 0, jitter: 0, shade: 0 });
    for (const dx of [-3.8, -2.0]) dk.box(0.3, 1.0, 1.2, S.grey, dx, up > 0 ? ys : yb - 1.0, zs, { r: 0.04 });
    const pk = new Kit(rng(o.seed + 90 + lanes.length));
    const noz = towPack(pk, 0, o.accent, o.hi);
    const pack = new THREE.Group();
    pack.add(pk.build(paint()));
    const packJets = halo(noz, [1.2, 1.2], '#7fe8ff', 0.9);
    pack.add(packJets.obj);
    g.add(pack);
    const turn = new THREE.Quaternion().setFromUnitVectors(V(-1, 0, 0), drift.clone().normalize());
    return { kind, arm, pick: V(SX, cy, front + 0.4), rel, drift, P, off, held, fly, turn, pack, packJets, from: V(-3.0, dy + 0.75, zs) };
  };
  const dk = new Kit(rng(o.seed + 95));
  lanes.push(laneOf(main, armM, mainY, mainFront, V(-6.5, mainY + 1.6, zs + 3.4), V(-31, 8, -13.5), 8, o.seed % 5));
  if (second) {
    const sy = yb - 0.6 - ph / 2 - 0.3;
    const front = stack(second, sy);
    const armS = new RobotArm(5.2, 5.0, 1.2, yb, zs + 0.9, { tool: 'grip', hang: true, seed: o.seed + 40, base: 1.2 });
    g.add(armS.root);
    lanes.push(laneOf(second, armS, sy, front, V(-6.5, sy - 1.2, zs + 3.6), V(-29, -7, -11.5), 9.5, 3.3));
  }
  g.add(dk.build());
  // a tug parked at the control pod
  const parked = tug(o.accent, o.hi, o.seed + 81, 1.0);
  parked.obj.position.set(14.6, cy0 - 1.6, zs + 5.2);
  parked.obj.rotation.y = Math.PI;
  parked.engine.set(0);
  g.add(parked.obj);
  const q0 = new THREE.Quaternion(), tmp = V(0, 0, 0), tip = V(0, 0, 0), out = V(0, 0, 0), tow = V(0, 0, 0);
  anim.add((e) => {
    spaceTime.value = e.t;
    feed.update(e, live ? 1 : 0);
    for (const L of lanes) {
      const s = live ? (e.t + L.off) / L.P : 0.3;
      const ph2 = s - Math.floor(s);
      // the arm: carry (0.1–0.5), let go at R (0.5–0.58), back for the next (0.58–1)
      let at: THREE.Vector3;
      if (ph2 < 0.1) at = L.pick;
      else if (ph2 < 0.5) at = tmp.copy(L.pick).lerp(L.rel, ease((ph2 - 0.1) / 0.4));
      else if (ph2 < 0.58) at = L.rel;
      else at = tmp.copy(L.rel).lerp(L.pick, ease((ph2 - 0.58) / 0.42));
      L.arm.reach(at, e.dt, 9, !live);
      // the held product rides the gripper while carried; waits at the stack front otherwise
      if (ph2 >= 0.1 && ph2 < 0.5) {
        L.arm.tipIn(g, tip);
        L.held.position.copy(tip).add(V(0, 0, -0.5));
      } else L.held.position.copy(L.pick).add(V(0, 0, -0.1));
      L.held.visible = !(ph2 >= 0.5 && ph2 < 0.58) || !live;
      // the ones already let go are towed off down the lane, swinging round behind their pack, fading with distance
      const sr = s - 0.5, frac = sr - Math.floor(sr);
      L.fly.forEach((f, j) => {
        const age = frac + j;
        const u = age / L.fly.length;
        const d = Math.pow(u, 1.25);
        f.g.position.copy(L.rel).addScaledVector(L.drift, d);
        f.g.quaternion.copy(q0).slerp(L.turn, ease(u * 5));
        const a = 1 - span(0.45, 1, u);
        for (const m of f.mats) { (m as THREE.MeshStandardMaterial).opacity = a; m.transparent = a < 0.999; }
        f.jets.set(a * (0.85 + Math.sin(e.t * 31 + j) * 0.15));
        f.g.visible = live && a > 0.01;
      });
      // the next pack: out of the dispenser (0.06–0.18), across to its place ahead of the release point
      // (0.18–0.46), holding there until the arm lets go; from then on it is the towed piece's own
      tow.copy(L.rel).x += TOW[L.kind].x;
      out.copy(L.from).x -= 3.4;
      if (ph2 < 0.18) L.pack.position.copy(L.from).lerp(out, ease((ph2 - 0.06) / 0.12));
      else L.pack.position.copy(out).lerp(tow, ease((ph2 - 0.18) / 0.28));
      L.pack.visible = live && ph2 < 0.5;
      L.packJets.set(ph2 > 0.18 && ph2 < 0.42 ? 0.6 : 0.12);
    }
    for (const m of [podWin]) m.emissiveIntensity = flicker(e.t, 3, flags.storm) ? 0.15 : live ? 1.5 : 0.8;
    warn(flags.halted ? 1 : Math.sin(e.t * 3) > 0.2 ? 1 : 0.1);
  });
  return { obj: g, w: W, d: D, h: 23, update: timed(g, anim) };
}

// ════════════════════════════════════════ THE FEED DOCK ════════════════════════════════════════
/** An ore hauler facing −x: cab, a spine of ten rock pods, engines at the back. */
function hauler(seed: number, accent: string, hi: string) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const gk = new Kit(rng(seed + 1));
  k.box(3.2, 2.8, 2.8, S.white, -9.4, -1.4, 0, { r: 0.3, shade: 0.2 });
  k.box(3.24, 0.5, 2.84, accent, -9.4, 0.1, 0, { r: 0.04, shade: 0 });
  k.box(3.24, 0.14, 2.84, hi, -9.4, -0.12, 0, { r: 0, shade: 0 });
  gk.box(0.5, 0.9, 2.0, '#3c6a7c', -11.0, 0.35, 0, { r: 0.12, shade: 0 });
  k.box(13.5, 0.9, 0.9, S.grey, -1.0, -0.45, 0, { r: 0.1, shade: 0.1 });
  for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) {
    const x = -6.0 + i * 2.2, z = sz * 1.05;
    for (const [y, zz] of [[-0.95, -0.9], [-0.95, 0.9], [0.85, -0.9], [0.85, 0.9]] as const) k.box(2.0, 0.14, 0.14, S.mid, x, y, z + zz, { r: 0, jitter: 0 });
    for (const dx of [-1, 1]) for (const zz of [-0.9, 0.9]) k.box(0.14, 1.9, 0.14, S.mid, x + dx * 0.95, -0.95, z + zz, { r: 0, jitter: 0 });
    k.box(1.9, 0.12, 1.8, S.grey, x, -0.98, z, { r: 0, jitter: 0, shade: 0 });
  }
  k.box(2.4, 2.4, 2.6, S.light, 6.6, -1.2, 0, { r: 0.22, shade: 0.2 });
  for (const [y, z] of [[0.3, 0.7], [0.3, -0.7], [-0.75, 0]] as const) k.cyl(0.5, 0.32, 1.0, S.dark, 7.8, y, z, 12, { rz: Math.PI / 2, shade: 0 });
  k.box(1.0, 1.8, 0.1, S.white, 4.4, 0.2, 1.4, { r: 0.04, shade: 0 });
  k.box(1.0, 1.8, 0.1, S.white, 4.4, 0.2, -1.4, { r: 0.04, shade: 0 });
  g.add(k.build(), gk.build(glassMat));
  // the rock heaps (one mesh per pod, so they empty one by one)
  const r = rng(seed + 5);
  const heaps: THREE.Mesh[] = [];
  const rm = paint();
  for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) {
    const hk = new Kit(rng(seed + 10 + i));
    for (let j = 0; j < 5; j++) {
      const gg = new THREE.DodecahedronGeometry(0.45 + r() * 0.25, 0);
      gg.scale(1.1, 0.8, 1).rotateY(r() * 3).translate((r() - 0.5) * 1.1, -0.55 + r() * 0.7, (r() - 0.5) * 1.0);
      hk.geo(gg, [S.rock, S.rock2, S.rock3, S.rock4][(i + j) % 4], 0.1, 0.1);
    }
    const m = hk.build(rm);
    m.position.set(-6.0 + i * 2.2, 0, sz * 1.05);
    heaps.push(m);
    g.add(m);
  }
  const eng = halo([V(8.4, 0.3, 0.7), V(8.4, 0.3, -0.7), V(8.4, -0.75, 0)], [2.2, 2.2, 2.2], '#7fe8ff', 0.9);
  g.add(eng.obj);
  const retro = halo([V(-11.2, -0.6, 1.0), V(-11.2, -0.6, -1.0)], [1.4, 1.4], '#bff6ff', 0.8);
  g.add(retro.obj);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), lit('#ff4a3a', 2));
  lamp.position.set(-9.4, 1.55, 0);
  lamp.userData.beacon = seed * 0.3;
  g.add(lamp);
  return { obj: g, heaps, eng, retro };
}

export function yardsDock(o: Act3SetOpts): Piece {
  const flags = parseFlags(o.variant);
  const live = !flags.halted;
  const W = o.w, D = o.d, zs = yardsZ(D);
  const g = new THREE.Group();
  g.name = 'set:yardsDock';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  const E = 3.4;
  const ys = SPINE.y + SPINE.s / 2, yb = SPINE.y - SPINE.s / 2;
  truss(k, -W / 2, E, zs, { collars: [true, false] });
  endCap(k, g, E, zs, 1);
  // ── the feed silo, its cone into the spine (the feed line starts under it) ──
  const SXo = -7.6, SZ = zs - 4.4, SR = 3.2, sy0 = ys + 1.8, sy1 = 23.0;
  k.cyl(SR, SR, sy1 - sy0, S.light, SXo, sy0, SZ, 24, { shade: 0.18 });
  for (let y = sy0 + 2; y < sy1 - 0.5; y += 2.6) k.cyl(SR + 0.08, SR + 0.08, 0.3, S.mid, SXo, y, SZ, 24, { shade: 0 });
  k.cyl(SR + 0.1, SR + 0.1, 0.8, o.accent, SXo, sy1 - 3.4, SZ, 24, { shade: 0 });
  k.geo(new THREE.SphereGeometry(SR, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1).translate(SXo, sy1, SZ), S.white, 0.03, 0);
  k.cyl(SR, 1.0, 1.8, S.mid, SXo, ys, SZ, 20, { shade: 0.1 });
  pipe(k, [V(SXo, ys + 0.2, SZ + 0.5), V(SXo + 0.8, ys - 0.4, zs - 1.0)], 0.6, S.grey, 10);
  k.box(3.0, 3.0, 3.0, S.grey, SXo + 0.3, SPINE.y - 1.5, zs, { r: 0.14, shade: 0.15 });
  for (const x of [SXo - 2.4, SXo + 2.4]) k.box(0.5, sy0 - ys + 0.4, 0.5, S.dark, x, ys, SZ + 2.0, { r: 0.05 });
  plate(g, 'FEED', 2.8, SXo + Math.sin(-0.35) * (SR + 0.05), sy1 - 1.6, SZ + Math.cos(-0.35) * (SR + 0.05), '#5fd3b5', '#16141f', -0.35, 1.0);
  const feed = new FeedLine(g, -W / 2, SXo - 0.9, zs);
  g.add(feed.obj);
  // ── the catcher cone (axis along +x, mouth to the right) ──
  const CY = 16.6, CZ = zs + 0.4, cx0 = 0.6, cx1 = 14.2, r0 = 1.5, r1 = 7.6;
  const rad = (x: number) => r0 + ((x - cx0) / (cx1 - cx0)) * (r1 - r0);
  for (let i = 0; i <= 4; i++) {
    const x = cx0 + (i / 4) * (cx1 - cx0);
    k.geo(new THREE.TorusGeometry(rad(x), i === 4 ? 0.3 : 0.18, 6, 40).rotateY(Math.PI / 2).translate(x, CY, CZ), i === 4 ? S.white : S.light, 0.02, 0);
  }
  const NS = 16;
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * Math.PI * 2;
    k.beam(V(cx0, CY + Math.cos(a) * r0, CZ + Math.sin(a) * r0), V(cx1, CY + Math.cos(a) * r1, CZ + Math.sin(a) * r1), 0.14, S.mid);
  }
  // the throat: a collar and the tube down to the silo
  k.cyl(r0 + 0.3, r0 + 0.3, 1.4, S.grey, cx0 - 1.2, CY, CZ, 16, { rz: -Math.PI / 2, shade: 0 });
  pipe(k, [V(cx0 - 1.0, CY, CZ), V(-3.0, CY, CZ - 1.0), V(SXo + 2.2, sy1 - 2.4, SZ + 1.6)], 0.85, S.light, 12);
  // the boom holding the cone off the spine's end
  for (const dz of [-1.2, 1.2]) {
    k.beam(V(E - 0.2, ys - 0.2, zs + dz), V(cx0 + 1.4, CY - rad(cx0 + 1.4) + 0.1, CZ + dz * 0.5), 0.32, S.light);
    k.beam(V(-1.0, ys, zs + dz), V(cx0 + 0.2, CY - r0, CZ + dz * 0.5), 0.26, S.light);
  }
  g.add(k.build());
  // the net: a diamond mesh of lines over the cone, and a faint skin
  const net: THREE.Vector3[] = [];
  const NN = 28, NL = 10;
  for (const sgn of [-1, 1]) for (let i = 0; i < NN; i++) for (let j = 0; j < NL; j++) {
    const t0 = j / NL, t1 = (j + 1) / NL;
    const a0 = (i / NN) * Math.PI * 2 + sgn * t0 * 1.4, a1 = (i / NN) * Math.PI * 2 + sgn * t1 * 1.4;
    const x0 = lerp(cx0, cx1, t0), x1 = lerp(cx0, cx1, t1);
    net.push(V(x0, CY + Math.cos(a0) * rad(x0), CZ + Math.sin(a0) * rad(x0)), V(x1, CY + Math.cos(a1) * rad(x1), CZ + Math.sin(a1) * rad(x1)));
  }
  const netLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(net), new THREE.LineBasicMaterial({ color: '#c3bcc7', transparent: true, opacity: 0.55 }));
  g.add(netLines);
  const skin = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, cx1 - cx0, 32, 1, true).rotateZ(-Math.PI / 2).translate((cx0 + cx1) / 2, CY, CZ), new THREE.MeshStandardMaterial({ color: '#c3bcc7', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 }));
  g.add(skin);
  // lights chasing round the mouth
  const mouth: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = lit('#5fd3b5', 0.2, '#156466');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), m);
    b.position.set(cx1 + 0.15, CY + Math.cos(a) * (r1 + 0.05), CZ + Math.sin(a) * (r1 + 0.05));
    g.add(b);
    mouth.push(m);
  }
  const warn = warnLamp(g, cx1 + 0.2, CY + r1 + 0.7, CZ, flags.halted, 1.1);
  // ── the capsule coming in from the mass driver, and the flash when it's caught ──
  const cap = new THREE.Group();
  const ck = new Kit(rng(o.seed + 3));
  ck.cyl(0.42, 0.42, 1.3, S.white, -0.65, 0, 0, 12, { rz: -Math.PI / 2, shade: 0 });
  ck.cyl(0.44, 0.44, 0.3, S.gold, -0.15, 0, 0, 12, { rz: -Math.PI / 2, shade: 0 });
  ck.geo(new THREE.ConeGeometry(0.42, 0.6, 12).rotateZ(Math.PI / 2).translate(-0.95, 0, 0), S.light, 0.02, 0);
  cap.add(ck.build());
  const trail = halo([0, 1, 2, 3, 4, 5].map((i) => V(0.9 + i * 0.9, 0, 0)), [2.0, 1.7, 1.4, 1.1, 0.8, 0.5], '#ffb347', 0.85);
  cap.add(trail.obj);
  const capGlow = halo([V(0, 0, 0)], [2.6], '#fff2c0', 0.9);
  cap.add(capGlow.obj);
  g.add(cap);
  const flash = halo([V(cx0 + 0.6, CY, CZ)], [9], '#ffe9a8', 1);
  g.add(flash.obj);
  // ── the hauler, its docking arms and the unloading trolley ──
  const H = hauler(o.seed + 7, o.accent, o.hi);
  const HS = 1.3;
  H.obj.scale.setScalar(HS);
  g.add(H.obj);
  const dock = V(-1.6, yb - 3.7, zs + 3.6);
  const armK = new Kit(rng(o.seed + 8));
  for (const x of [-8.2 * HS, 3.4 * HS]) armK.box(1.2, 0.4, 1.2, S.dark, x, -0.4, 0, { r: 0.06 });
  const clampBase = armK.build();
  clampBase.position.set(dock.x, yb, dock.z);
  g.add(clampBase);
  const struts: THREE.Mesh[] = [];
  for (const x of [-8.2 * HS + dock.x, 3.4 * HS + dock.x]) {
    const sk = new Kit(rng(o.seed + 9));
    sk.box(0.45, 1, 0.45, S.hazard, 0, -1, 0, { r: 0.04, shade: 0 });
    const m = sk.build();
    m.position.set(x, yb - 0.4, dock.z);
    g.add(m);
    struts.push(m);
  }
  const trolley = new THREE.Group();
  const tk = new Kit(rng(o.seed + 10));
  tk.box(2.2, 0.7, 2.8, S.light, 0, -0.7, 0, { r: 0.12 });
  tk.cyl(0.4, 0.55, 1.0, S.dark, 0, -1.7, 0, 10, { shade: 0 });
  trolley.add(tk.build());
  trolley.position.set(dock.x, yb, dock.z);
  g.add(trolley);
  const berthL = [V(dock.x - 12.0, yb - 0.2, dock.z + 2.2), V(dock.x + 6.2, yb - 0.2, dock.z + 2.2)].map((p) => {
    const m = lit('#7dff9a', 1.5, '#1f4a2e');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), m);
    b.position.copy(p);
    g.add(b);
    return m;
  });
  const T = 40, off = (o.seed % 7) * 3.1;
  const S0 = V(48, -5, zs + 16), E0 = V(52, 4, zs + 20);
  anim.add((e) => {
    spaceTime.value = e.t;
    feed.update(e, live ? 1 : 0);
    // capsules every 4.5 s
    const cp = live ? ((e.t + off) % 4.5) / 4.5 : 0;
    const flying = live && cp < 0.8;
    cap.visible = flying;
    if (flying) {
      const s = cp / 0.8;
      cap.position.set(cx0 + 1.0 + 95 * (1 - s) * (1 - s), CY + (1 - s) * 2.5, CZ);
    }
    flash.set(live && cp >= 0.8 ? 1 - (cp - 0.8) / 0.2 : 0);
    mouth.forEach((m, i) => { m.emissiveIntensity = live ? (((Math.floor(e.t * 6) + i) % 4 === 0) ? 3 : 0.4) : 0.2; });
    // the hauler: in (0–10), docked + unloading (10–26), out (26–34), away (34–40)
    const tt = live ? (e.t + off) % T : 18;
    let p: THREE.Vector3;
    let eng = 0, retro = 0, docked = 0;
    if (tt < 10) { p = S0.clone().lerp(dock, 1 - Math.pow(1 - tt / 10, 2.2)); eng = tt < 2.5 ? 0.9 : 0; retro = tt > 6 ? 0.8 + Math.sin(e.t * 25) * 0.2 : 0; docked = span(8.5, 10, tt); }
    else if (tt < 26) { p = dock.clone(); docked = 1; }
    else if (tt < 34) { const u = (tt - 26) / 8; p = dock.clone().lerp(E0, u * u); retro = u < 0.7 ? 0.9 : 0.3; docked = 1 - span(26, 27.5, tt); }
    else p = E0.clone();
    H.obj.position.copy(p);
    H.obj.visible = tt < 34;
    H.eng.set(eng);
    H.retro.set(retro);
    // pods empty one by one while docked, refill while away
    const un = span(11, 25, tt) * 10;
    H.heaps.forEach((m, i) => { const left = tt < 10 || tt >= 34 ? 1 : 1 - Math.min(1, Math.max(0, un - i)); m.scale.setScalar(Math.max(0.02, left)); m.visible = left > 0.03; });
    const pod = Math.min(9, Math.floor(un));
    trolley.position.x = dock.x + HS * (tt >= 10 && tt < 26 ? -6.0 + Math.floor(pod / 2) * 2.2 : -1.0);
    struts.forEach((m) => { m.scale.y = 0.6 + docked * 2.0; });
    berthL.forEach((m) => { m.emissive.set(docked > 0.5 ? '#7dff9a' : '#ffb347'); m.emissiveIntensity = live ? (docked > 0.5 ? 1.6 : Math.sin(e.t * 5) > 0 ? 2 : 0.2) : 0.3; });
    warn(flags.halted ? 1 : Math.sin(e.t * 3) > 0.2 ? 1 : 0.1);
  });
  return { obj: g, w: W, d: D, h: 25, update: timed(g, anim) };
}

// ════════════════════════════════════════ THE EMPTY BERTH ════════════════════════════════════════
export function yardsBerth(o: Act3SetOpts): Piece {
  const W = o.w, D = o.d, zs = yardsZ(D);
  const label = o.label || 'L4';
  const g = new THREE.Group();
  g.name = 'set:yardsBerth';
  const anim = new Anim();
  const k = new Kit(rng(o.seed));
  const ys = SPINE.y + SPINE.s / 2, yb = SPINE.y - SPINE.s / 2;
  const X0 = -W / 2 + 2.6, X1 = W / 2 - 2.6;
  truss(k, X0, X1, zs, { collars: [false, false] });
  endCap(k, g, X0, zs, -1);
  endCap(k, g, X1, zs, 1);
  // ── the empty berth frame, clamps open ──
  const bx0 = -15.5, bx1 = 6.5, by0 = -5.4, bz0 = zs - 1.6, bz1 = zs + 8.2;
  for (const x of [bx0, bx1]) for (const z of [bz0, bz1]) k.box(0.48, yb - by0, 0.48, S.light, x, by0, z, { r: 0.08, shade: 0.1 });
  for (const z of [bz0, bz1]) {
    k.box(bx1 - bx0 + 0.48, 0.48, 0.48, S.light, (bx0 + bx1) / 2, by0, z, { r: 0.08, shade: 0 });
    k.box(bx1 - bx0 + 0.48, 0.5, 0.5, S.white, (bx0 + bx1) / 2, yb - 0.5, z, { r: 0.08, shade: 0 });
  }
  for (const x of [bx0, bx1]) {
    k.box(0.48, 0.48, bz1 - bz0, S.light, x, by0, (bz0 + bz1) / 2, { r: 0.08, shade: 0 });
    k.box(0.5, 0.5, bz1 - bz0, S.white, x, yb - 0.5, (bz0 + bz1) / 2, { r: 0.08, shade: 0 });
  }
  for (let x = bx0 + 2.75; x < bx1 - 1; x += 2.75) k.box(0.2, 0.2, bz1 - bz0, S.mid, x, by0 + 0.1, (bz0 + bz1) / 2, { r: 0, jitter: 0, shade: 0 });
  k.beam(V(bx0 + 0.3, by0 + 0.4, bz0), V(bx1 - 0.3, yb - 0.6, bz0), 0.2, S.mid);
  k.beam(V(bx1, by0 + 0.4, bz0 + 0.3), V(bx1, yb - 0.6, bz1 - 0.3), 0.2, S.mid);
  for (const x of [-11.5, -4.5, 2.5]) {
    k.box(2.2, 0.5, SPINE.s + 1.0, S.grey, x, yb - 0.5, zs, { r: 0.08, shade: 0 });
    // open claws: two prongs splayed out
    for (const sz of [-1, 1]) {
      k.beam(V(x - 0.6, yb - 0.5, zs + sz * 0.6), V(x - 0.6, yb - 2.2, zs + sz * 2.2), 0.3, S.hazard);
      k.beam(V(x + 0.6, yb - 0.5, zs + sz * 0.6), V(x + 0.6, yb - 2.2, zs + sz * 2.2), 0.3, S.hazard);
    }
  }
  // the sign board on the frame's front
  k.box(9.4, 2.9, 0.3, S.ink, -4.5, yb - 3.8, bz1 + 0.3, { r: 0.12, shade: 0 });
  k.box(9.6, 0.16, 0.34, '#5fd3b5', -4.5, yb - 0.96, bz1 + 0.3, { r: 0, shade: 0 });
  plate(g, `${label} YARDS`, 7.6, -4.5, yb - 1.8, bz1 + 0.48, '#fbf7f0', null, 0, 1.15);
  const awaiting = plate(g, 'AWAITING SEED', 7.8, -4.5, yb - 3.1, bz1 + 0.48, '#5fd3b5', null, 0, 0.85);
  // ── the survey beacon on a mast ──
  const MX = 16.5, mh = 13;
  for (let y = ys; y < ys + mh; y += 1.6) {
    k.beam(V(MX - 0.4, y, zs - 0.4), V(MX + 0.4, y + 1.6, zs + 0.4), 0.08, S.mid);
    k.beam(V(MX + 0.4, y, zs - 0.4), V(MX - 0.4, y + 1.6, zs + 0.4), 0.08, S.mid);
  }
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]] as const) k.box(0.14, mh, 0.14, S.light, MX + x, ys, zs + z, { r: 0, jitter: 0 });
  k.box(1.6, 0.4, 1.6, S.dark, MX, ys + mh, zs, { r: 0.06 });
  const dish = new THREE.SphereGeometry(1.4, 14, 6, 0, Math.PI * 2, 0, 0.95).scale(1, 0.4, 1).rotateZ(-0.9).translate(MX + 1.1, ys + mh - 2.4, zs + 0.3);
  k.geo(dish, S.white, 0.03, 0);
  const head = new THREE.Group();
  const hk = new Kit(rng(o.seed + 2));
  hk.cyl(0.7, 0.8, 1.2, S.light, 0, 0, 0, 12, { shade: 0.1 });
  hk.box(0.5, 0.5, 0.3, S.black, 0, 0.35, 0.72, { r: 0.05, shade: 0 });
  head.add(hk.build());
  const lens = lit('#a3f0d6', 2.4);
  const lm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.1), lens);
  lm.position.set(0, 0.6, 0.88);
  head.add(lm);
  const sweep = halo([V(0, 0.6, 1.4)], [4.5], '#a3f0d6', 0.8);
  head.add(sweep.obj);
  head.position.set(MX, ys + mh + 0.4, zs);
  g.add(head);
  const strobe = lit('#ffffff', 0);
  const sb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), strobe);
  sb.position.set(MX, ys + mh + 2.0, zs);
  g.add(sb);
  k.box(0.1, 0.5, 0.1, S.mid, MX, ys + mh + 1.5, zs, { r: 0, jitter: 0 });
  const flashH = halo([sb.position.clone()], [7], '#ffffff', 1);
  g.add(flashH.obj);
  // ── solar wings on a mast at the far end, up and down, turning slowly to the sun ──
  const WX = -21.5;
  k.box(0.6, 26, 0.6, S.light, WX, SPINE.y - 13, zs + 2.3, { r: 0.08, shade: 0 });
  k.box(1.4, 1.4, 2.2, S.grey, WX, SPINE.y - 0.7, zs + 1.4, { r: 0.12 });
  const wings = new THREE.Group();
  wings.position.set(WX, SPINE.y, zs + 2.3);
  const wk = new Kit(rng(o.seed + 3));
  for (const sy of [-1, 1]) {
    for (let i = 0; i < 6; i++) wk.box(5.6, 1.75, 0.08, i % 2 ? S.solar : S.solarL, 0, sy * (2.4 + i * 1.85) - 0.875, 0.45, { r: 0, jitter: 0.04, shade: 0 });
    wk.box(5.8, 0.16, 0.16, S.mid, 0, sy * 13.4 - 0.08, 0.45, { r: 0, jitter: 0 });
    for (const x of [-2.8, 2.8]) wk.box(0.16, 11.2, 0.16, S.mid, x, sy > 0 ? 2.2 : -13.4, 0.45, { r: 0, jitter: 0 });
    wk.box(0.3, 2.2, 0.3, S.mid, 0, sy > 0 ? 0.6 : -2.8, 0.45, { r: 0, jitter: 0 });
  }
  wings.add(wk.build());
  g.add(wings);
  // the survey crew's pod under the truss, and supply crates clamped on top
  const qx0 = 9.5, qx1 = 15.5;
  k.box(qx1 - qx0, yb - 1.2, 4.6, S.pale, (qx0 + qx1) / 2, 1.2, zs + 0.4, { r: 0.3, shade: 0.2 });
  k.box(qx1 - qx0 + 0.04, 0.5, 4.64, o.accent, (qx0 + qx1) / 2, yb - 1.3, zs + 0.4, { r: 0.04, shade: 0 });
  k.box(1.6, 1.6, 1.6, S.light, qx1 + 0.6, 2.4, zs + 0.4, { r: 0.2 });
  k.cyl(0.7, 0.7, 0.4, S.dark, qx1 + 1.4, 3.2, zs + 0.4, 12, { rz: -Math.PI / 2, shade: 0 });
  hcyl(k, 0.6, qx1 - qx0 - 0.6, S.foil, qx0 + 0.3, 0.9, zs + 0.4, 'x', 12);
  const crewWin = lit('#fde9a4', 1.5);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.05), crewWin);
    m.position.set(qx0 + 0.9 + i * 1.1, 3.6, zs + 2.74);
    g.add(m);
  }
  for (let i = 0; i < 3; i++) {
    const x = -13.5 + i * 3.3;
    k.box(2.8, 2.2, 2.6, i === 1 ? S.foil : i === 2 ? o.accent : S.light, x, ys, zs - 0.2, { r: 0.12, jitter: 0.06, shade: 0.2 });
    k.box(2.9, 0.18, 2.7, S.dark, x, ys + 0.5, zs - 0.2, { r: 0, jitter: 0, shade: 0 });
    k.box(2.9, 0.18, 2.7, S.dark, x, ys + 1.6, zs - 0.2, { r: 0, jitter: 0, shade: 0 });
  }
  // stakes along the far end of the truss, ready for the next sections
  const stakes: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const x = 9 + i * 1.6;
    k.box(0.14, 1.2, 0.14, S.mid, x, ys, zs + 1.4, { r: 0, jitter: 0 });
    const m = lit('#5fd3b5', 0.3, '#156466');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), m);
    b.position.set(x, ys + 1.3, zs + 1.4);
    g.add(b);
    stakes.push(m);
  }
  // chasing lights along the frame's top front beam
  const chase: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 10; i++) {
    const m = lit('#5fd3b5', 0.3, '#156466');
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), m);
    b.position.set(bx0 + 1.1 + i * ((bx1 - bx0 - 2.2) / 9), yb - 0.25, bz1 + 0.3);
    g.add(b);
    chase.push(m);
  }
  g.add(k.build());
  // ── the tug waiting off the berth, and a survey drone ──
  const tg = tug(o.accent, o.hi, o.seed + 5, 1.1);
  g.add(tg.obj);
  const dr = drone(o.seed + 6);
  g.add(dr.obj);
  const eva = spacewalker(o.seed + 7, o.accent);
  eva.obj.position.set(-4.6, yb - 3.6, zs + 2.4);
  eva.obj.rotation.set(-0.3, 0.4, 0.1);
  g.add(eva.obj);
  anim.add((e) => {
    eva.float(e.t);
    spaceTime.value = e.t;
    head.rotation.y = e.t * 0.9;
    const st = (e.t % 2.2) < 0.12;
    strobe.emissiveIntensity = st ? 6 : 0;
    flashH.set(st ? 1 : 0);
    sweep.set(0.6 + 0.2 * Math.sin(e.t * 3));
    wings.rotation.y = Math.sin(e.t * 0.05) * 0.3 - 0.25;
    chase.forEach((m, i) => { m.emissiveIntensity = (Math.floor(e.t * 4) + i) % 5 === 0 ? 3 : 0.35; });
    stakes.forEach((m, i) => { m.emissiveIntensity = (Math.floor(e.t * 1.5) + i) % 2 ? 2.4 : 0.3; });
    ((awaiting as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(e.t * 1.6);
    ((awaiting as THREE.Mesh).material as THREE.MeshBasicMaterial).transparent = true;
    // the tug holds station, nudging itself back with little RCS puffs
    tg.obj.position.set(12 + Math.sin(e.t * 0.21) * 1.2, -1 + Math.sin(e.t * 0.33) * 0.7, zs + 11 + Math.cos(e.t * 0.17) * 0.8);
    tg.obj.rotation.set(Math.sin(e.t * 0.3) * 0.04, Math.PI + Math.sin(e.t * 0.12) * 0.15, Math.sin(e.t * 0.25) * 0.05);
    tg.engine.set(Math.sin(e.t * 0.7) > 0.85 ? 0.7 : 0.08);
    const a = e.t * 0.25;
    dr.obj.position.set(-4.5 + Math.cos(a) * 12, 2 + Math.sin(e.t * 0.4) * 3, zs + 4 + Math.sin(a) * 9);
    dr.obj.rotation.y = -a - Math.PI / 2;
  });
  return { obj: g, w: W, d: D, h: ys + mh + 2.5, update: timed(g, anim) };
}
