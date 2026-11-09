/**
 * Shackleton's outpost: the surveyed site (the Charter's board, Kip's scout lander, the flag, a
 * rover at the end of its tracks, survey stakes; or the first landing kept as a monument; or plain
 * staked ground), the habitats (printed regolith domes, half-buried modules, airlocks, an
 * inflatable greenhouse under grow lights, solar wings, radiators, a dish aimed at the Earth), the
 * landing pad (a crew lander that lands, waits and lifts off again, throwing dust), the solar
 * masts on the rim (tracking the sun round the horizon) and the ice rig down in the permanently
 * shadowed crater.
 */
import * as THREE from 'three';
import { fbm, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { glowMat } from '../../../kit';
import { skyMat } from '../../plants2/parts';
import {
  airlock, arcBerm, astro, beacon, berm, boulder, charterBoard, crewLander, Ctx, Dust, floodMast, habModule, hcyl, lightPool, M, mixHex, moonFlag,
  pipeRun, pressRover, printedDome, radiator, roverTracks, scoutLander, solarWing, stakes, sunDir, surveyRover, TAU, track, V, type SunCache, LiteKit, } from './common';
import { arcTorus, halo, placard, plasmaMat, seeGlass, tintPool } from '../fusion/common';

const EARTH = V(-0.38, 0.12, -0.92).normalize();
/** A blinking marker light (shared material per colour; the piece drives it). */
function markerMat(c: string) {
  const m = glowMat(c, 0.4);
  m.userData.manual = true;
  return m;
}

// ── the survey site ──────────────────────────────────────────────────────────────────────────
export function moonSurvey(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, W, D } = c;
  const v = o.variant || 'board';
  const site = (o.label || 'SHACKLETON').toUpperCase();
  const r = rng(o.seed + 5);
  const blink = markerMat('red3');
  const lights: THREE.Vector3[] = [];
  if (v === 'board') {
    const b = charterBoard(site, 'SURVEY SITE', 7.2);
    b.position.set(-12.5, 3.0, 9.6);
    g.add(b);
    for (const s of [-1, 1]) k.box(0.2, 4.2, 0.2, M.steel, -12.5 + s * 3.2, 0, 9.5, { r: 0.02 });
    k.box(7.6, 0.2, 0.4, M.steelD, -12.5, 1.6, 9.45, { r: 0.02 });
    scoutLander(k, -4.0, -2.4, 0.5);
    moonFlag(g, k, 0.6, -0.8, 3.4, 0.25);
    astro(g, 2.6, 1.6, 0.5, o.seed + 1);
    roverTracks(k, [[-2.6, 0.2], [1.5, 2.6], [6.0, 4.4], [10.6, 5.2], [13.4, 5.4]], 1.0);
    surveyRover(k, 14.2, 5.4, 0);
    lights.push(...stakes(c, 10, -6.5, 16, 10, 4, o.seed));
    lights.push(...stakes(c, -10, -9, 10, 4, 5, o.seed + 1));
    // the lidar scanner on its tripod
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      k.beam(V(5 + Math.sin(a) * 0.6, 0, -4 + Math.cos(a) * 0.6), V(5, 1.4, -4), 0.06, M.steelD);
    }
    k.cyl(0.18, 0.18, 0.35, M.dark, 5, 1.4, -4, 10);
    lights.push(V(5, 1.9, -4));
    // boot prints from the lander to the flag
    for (let i = 0; i < 14; i++) k.box(0.16, 0.02, 0.28, '#7f7889', -2.2 + i * 0.36 + (i % 2) * 0.1, 0.02, -1.2 + i * 0.18 + (i % 2) * 0.22, { r: 0, jitter: 0, shade: 0 });
    for (let i = 0; i < 3; i++) k.box(0.8, 0.6, 0.8, i % 2 ? M.white : M.foil, -7.4 + i * 1.0, 0, 1.2 + (i % 2) * 0.4, { r: 0.06, ry: i * 0.4 });
  } else if (v === 'monument') {
    scoutLander(k, -3.5, -1.5, 0.5);
    moonFlag(g, k, 1.6, 0.4, 3.4, 0.25);
    // roped off: posts and a gold rope
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const p = V(-1.2 + Math.sin(a) * 7.2, 0, -0.8 + Math.cos(a) * 5.4);
      k.box(0.12, 1.0, 0.12, M.steel, p.x, 0, p.z, { r: 0, jitter: 0 });
      ring.push(p.setY(0.86));
    }
    for (let i = 0; i < ring.length; i++) k.beam(ring[i], ring[(i + 1) % ring.length], 0.05, 'yel0');
    // the plaque
    k.box(3.6, 1.2, 0.4, mixHex(M.dark, '#8c5a3c', 0.3), 2.2, 0, 6.2, { r: 0.08 });
    placard(g, 'FIRST LANDING', 3.2, 2.2, 0.82, 6.42, '#fde9a4', '#5a3a28');
    roverTracks(k, [[-8, 2], [-4, 6], [4, 9.5], [14, 10]], 1.0);
    lights.push(...stakes(c, 12, -6, 10, 10, 4, o.seed));
    astro(g, 4.8, 4.2, -0.6, o.seed + 2);
  } else {
    lights.push(...stakes(c, 0, -1, W - 6, D - 8, 4, o.seed));
    // tape lines between some stakes: the plan of what comes next
    for (const z of [-9, 3]) track(k, -W / 2 + 3, z, W / 2 - 3, z, 0.08, 'org1', 0.05);
    for (const x of [-12, 4]) track(k, x, -D / 2 + 3, x, D / 2 - 4, 0.08, 'org1', 0.05);
    roverTracks(k, [[-W / 2 + 1, 8], [-6, 6], [6, 7], [W / 2 - 1, 9]], 1.0);
  }
  for (let i = 0; i < 6; i++) boulder(k, -W / 2 + 2 + r() * (W - 4), -D / 2 + 1.5 + r() * 4, 0.3 + r() * 0.5, o.seed + i);
  const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), blink, Math.max(1, lights.length));
  lights.forEach((p, i) => lm.setMatrixAt(i, new THREE.Matrix4().setPosition(p)));
  lm.count = lights.length;
  g.add(lm);
  c.anim.extra.push((e) => { blink.emissiveIntensity = Math.sin(e.t * 2.4) > 0.3 ? 3.0 : 0.2; });
  c.finish();
  return { obj: g, w: W, d: D, h: 5, update: c.update };
}

// ── the habitats ─────────────────────────────────────────────────────────────────────────────
/** A point on a dome (half-ellipsoid rx × h at cx, cz) at height y, angle a (from +z): position and outward yaw. */
function onDome(cx: number, cz: number, rx: number, h: number, y: number, a: number, out = 0.02) {
  const rr = rx * Math.sqrt(Math.max(0, 1 - (y / h) ** 2)) + out;
  return { p: V(cx + Math.sin(a) * rr, y, cz + Math.cos(a) * rr), ry: a, tilt: Math.atan2(rx * (y / h), h * Math.sqrt(Math.max(0.01, 1 - (y / h) ** 2))) };
}

export function moonHab(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const site = (o.label || 'SHACKLETON').toUpperCase();
  // the domes
  const A = { x: -7.0, z: -4.2, rx: 6.0, h: 5.4 }, B = { x: 5.6, z: -5.4, rx: 3.9, h: 3.6 };
  printedDome(k, A.x, A.z, A.rx, A.h);
  printedDome(k, B.x, B.z, B.rx, B.h);
  k.cyl(A.rx + 0.3, A.rx + 0.5, 0.3, M.reg3, A.x, 0, A.z, 40, { shade: 0 });
  k.cyl(B.rx + 0.3, B.rx + 0.5, 0.3, M.reg3, B.x, 0, B.z, 40, { shade: 0 });
  // crowns: a vent and a lit oculus
  k.cyl(0.7, 0.8, 0.5, M.white2, A.x, A.h - 0.1, A.z, 14);
  const ocul = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.18, 14).translate(A.x, A.h + 0.45, A.z), skyMat);
  g.add(ocul);
  // portholes round the front of both domes
  for (const [d, ys, as] of [[A, [1.3, 2.6], [-0.9, -0.45, 0, 0.45, 0.9]], [B, [1.1], [-0.6, 0, 0.6, 1.2]]] as [typeof A, number[], number[]][])
    for (const y of ys)
      for (const a of as) {
        if (d === A && y < 2 && Math.abs(a) < 0.2) continue;
        const q = onDome(d.x, d.z, d.rx, d.h, y, a, 0.02);
        k.geo(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12).rotateX(Math.PI / 2 - q.tilt).rotateY(q.ry).translate(q.p.x, q.p.y, q.p.z), M.white, 0.02, 0);
        c.lit.geo(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12).rotateX(Math.PI / 2 - q.tilt).rotateY(q.ry).translate(q.p.x + Math.sin(a) * 0.04, q.p.y, q.p.z + Math.cos(a) * 0.04), M.glass, 0, 0);
      }
  // the site's name over the big dome's door, the airlocks
  const sq = onDome(A.x, A.z, A.rx, A.h, 3.7, 0, 0.12);
  placard(g, site, 4.4, sq.p.x, sq.p.y, sq.p.z + 0.25, '#5fd3b5', M.dark).rotation.x = -sq.tilt;
  airlock(k, A.x + Math.sin(0.55) * (A.rx + 0.5), A.z + Math.cos(0.55) * (A.rx + 0.5), 0.55, L.acc);
  airlock(k, B.x + B.rx + 0.5, B.z + 0.4, Math.PI / 2, L.acc);
  // the tube between them, half under a berm
  hcyl(k, 0.85, B.x - B.rx - (A.x + A.rx) + 1.6, M.white, (A.x + A.rx + B.x - B.rx) / 2, 0.95, A.z - 0.5, 'x', 18);
  berm(k, (A.x + A.rx + B.x - B.rx) / 2, A.z - 0.5, B.x - B.rx - (A.x + A.rx) + 0.6, 3.0, 1.35);
  // a habitat module under a regolith berm to the front, its airlock out the end
  habModule(k, -8.8, 1.35, 7.2, 7.0, 1.3, L.acc);
  berm(k, -9.6, 6.5, 5.4, 3.6, 2.55);
  for (let i = 0; i < 4; i++) c.lit.box(0.5, 0.4, 0.1, M.glass, -8.4 + i * 0.75, 1.5, 8.52, { r: 0.04, jitter: 0 });
  airlock(k, -4.1, 7.2, Math.PI / 2, L.acc);
  // the greenhouse: an inflatable glass dome, beds of green under violet grow lights
  const gx = 8.4, gz = 4.4, gr = 3.6;
  k.cyl(gr + 0.25, gr + 0.3, 0.35, M.white2, gx, 0, gz, 32, { shade: 0 });
  for (let i = 0; i < 4; i++) {
    const z = gz - 2.0 + i * 1.3;
    const w = 2 * Math.sqrt(Math.max(0, (gr - 0.5) ** 2 - (z - gz) ** 2));
    k.box(w, 0.5, 0.8, '#6a5a48', gx, 0.35, z, { r: 0.05 });
    k.box(w - 0.2, 0.35, 0.7, 'grn5', gx, 0.85, z, { r: 0.12, jitter: 0.08 });
  }
  const grow = plasmaMat('#d08fdc', 1.2);
  const bars = new LiteKit(rng(o.seed + 6));
  for (let i = 0; i < 3; i++) bars.box(4.6, 0.1, 0.16, '#ffffff', gx, 2.3, gz - 1.4 + i * 1.4, { r: 0, jitter: 0, shade: 0 });
  g.add(bars.build(grow));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(gr, 28, 12, 0, TAU, 0, Math.PI / 2).translate(gx, 0.3, gz), seeGlass);
  dome.renderOrder = 3;
  g.add(dome);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    let prev = V(gx + Math.sin(a) * gr, 0.3, gz + Math.cos(a) * gr);
    for (let s = 1; s <= 6; s++) {
      const t = (s / 6) * (Math.PI / 2);
      const q = V(gx + Math.sin(a) * gr * Math.cos(t), 0.3 + gr * Math.sin(t), gz + Math.cos(a) * gr * Math.cos(t));
      k.beam(prev, q, 0.07, M.white);
      prev = q;
    }
  }
  for (const y of [1.2, 2.4]) k.geo(arcTorus(Math.sqrt(gr * gr - (y - 0.3) ** 2), 0.05, 0, TAU, 4, 40).translate(gx, y, gz), M.white, 0, 0);
  lightPool(g, gx, 0, gz + 3, 6, tintPool('#d08fdc', 0.4), 1.4);
  airlock(k, gx - gr - 0.4, gz - 0.6, -Math.PI / 2, L.acc);
  // power: solar wings on masts at the back, radiators, the dish aimed at the Earth
  for (const [x, z] of [[-11.2, -10.6], [0.2, -11.0]] as [number, number][]) {
    k.cyl(0.14, 0.18, 4.2, M.steel, x, 0, z, 8);
    solarWing(k, x - 1.7, 4.6, z, 3.2, 2.4, 0.65, 0.12);
    solarWing(k, x + 1.7, 4.6, z, 3.2, 2.4, 0.65, 0.12);
    k.box(4.6, 0.12, 0.12, M.steelD, x, 4.6, z, { r: 0, ry: 0.65 });
  }
  radiator(k, 12.4, -3.2, 5, 2.4, 3.0, 0.2);
  const mx = 12.4, mz = -10.4;
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as [number, number][]) {
    const pa = V(mx + Math.sin((a / 3) * TAU) * 0.5, 0, mz + Math.cos((a / 3) * TAU) * 0.5), pb = V(mx + Math.sin((b / 3) * TAU) * 0.5, 0, mz + Math.cos((b / 3) * TAU) * 0.5);
    k.beam(pa, pa.clone().setY(7), 0.09, M.steel);
    for (let y = 1; y < 7; y += 1.4) k.beam(pa.clone().setY(y), pb.clone().setY(y + 0.7), 0.04, M.steel);
  }
  const dish = new THREE.CylinderGeometry(1.4, 0.2, 0.5, 18, 1, true).rotateX(Math.PI / 2);
  dish.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), EARTH)).translate(mx + EARTH.x * 0.6, 7.6, mz + EARTH.z * 0.6);
  k.geo(dish, '#f1eee8', 0.02, 0);
  k.geo(new THREE.CylinderGeometry(1.38, 1.38, 0.05, 18).rotateX(Math.PI / 2).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), EARTH)).translate(mx + EARTH.x * 0.35, 7.6, mz + EARTH.z * 0.35), '#d9d6d2', 0.02, 0);
  beacon(g, mx, 7.5, mz, 0.6);
  beacon(g, A.x, A.h + 0.9, A.z, 2.0);
  // the yard: the flag, a parked rover, floodlights, crates, a figure at the door
  moonFlag(g, k, 1.6, 2.6, 3.4, 0.3);
  pressRover(k, c.lit, 1.6, 8.6, -0.25, L.acc);
  roverTracks(k, [[-14, 10.5], [-4, 9.4], [1.6, 8.6]], 1.9);
  floodMast(c, -13.2, 9.6, 5.5, 0.6, 5);
  floodMast(c, 13.2, 9.8, 5.5, -0.7, 5);
  for (let i = 0; i < 3; i++) k.box(1.0, 0.8, 0.9, i % 2 ? M.white : L.acc, 11.4 + (i % 2) * 1.2, 0, 9.4 - (i > 1 ? 1.2 : 0), { r: 0.06 });
  astro(g, A.x + 1.4, A.z + A.rx + 2.6, 0.4, o.seed + 3);
  c.anim.extra.push((e) => { grow.emissiveIntensity = 1.2 + 0.08 * Math.sin(e.t * 1.3); });
  c.finish();
  return { obj: g, w: W, d: D, h: 8.6, update: c.update };
}

// ── the landing pad ──────────────────────────────────────────────────────────────────────────
const PAD_PERIOD = 40;
export function moonPad(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const R = 10.8;
  // the fused-regolith slab, joints and the target ring
  k.cyl(R + 0.3, R + 0.5, 0.18, M.reg3, 0, 0, 0, 56, { shade: 0 });
  k.cyl(R, R, 0.28, '#6f6878', 0, 0, 0, 56, { shade: 0, jitter: 0.02 });
  for (const rr of [4.2, 7.6]) k.geo(arcTorus(rr, 0.05, 0, TAU, 3, 64).translate(0, 0.28, 0), '#857e8f', 0, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    k.box(0.08, 0.03, R - 1.2, '#857e8f', Math.sin(a) * (R / 2 + 0.4), 0.28, Math.cos(a) * (R / 2 + 0.4), { r: 0, ry: a, jitter: 0, shade: 0 });
  }
  k.geo(arcTorus(2.6, 0.16, 0, TAU, 3, 48).translate(0, 0.29, 0), 'yel0', 0, 0);
  const pa = placard(g, 'PAD A', 3.4, 0, 0.31, 6.0, '#fde9a4', null);
  pa.rotation.x = -Math.PI / 2;
  // edge lights that chase round the rim
  const edge = markerMat('#5fd3b5');
  const edgeOff = markerMat('#156466');
  const ek = new LiteKit(rng(1)), ek2 = new LiteKit(rng(2));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    (i % 2 ? ek2 : ek).box(0.3, 0.16, 0.3, '#ffffff', Math.sin(a) * (R - 0.25), 0.28, Math.cos(a) * (R - 0.25), { r: 0.03, jitter: 0 });
  }
  g.add(ek.build(edge), ek2.build(edgeOff));
  // the blast berm round the back
  arcBerm(k, R + 0.9, R + 4.0, 2.0, Math.PI * 0.55, Math.PI * 1.5);
  // floodlights, cargo, a hopper parked by the side, a crew lift tower
  floodMast(c, -12.4, 11.6, 8, Math.PI * 0.75, 6, 0, 8);
  floodMast(c, 12.6, -11.0, 8, -Math.PI * 0.25, 6, 0, 8);
  for (let i = 0; i < 4; i++) k.box(1.2, 0.9 + (i % 2) * 0.4, 1.0, i % 2 ? M.white : L.acc, 9.8 + (i % 2) * 1.3, 0.28, 8.4 - Math.floor(i / 2) * 1.2, { r: 0.06 });
  scoutLander(k, -11.6, 9.4, -0.6);
  const tx = 3.8, tz = -2.4;
  for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) k.box(0.14, 11.2, 0.14, M.steel, tx + sx, 0.28, tz + sz, { r: 0, jitter: 0 });
  for (let y = 1.6; y < 11; y += 1.6) k.box(1.14, 0.08, 1.14, M.steelD, tx, y, tz, { r: 0, jitter: 0 });
  k.box(1.8, 0.14, 0.7, M.steel, tx - 1.2, 9.6, tz + 0.2, { r: 0, jitter: 0 });
  beacon(g, tx, 11.8, tz, 0.4);
  astro(g, 6.6, 7.6, -0.8, o.seed + 4);
  // the crew lander: lands, waits, lifts off
  const lander = crewLander(L.acc, L.hi, o.seed + 7);
  g.add(lander.obj);
  const dust = new Dust(320, '#cfc8d2', 0.95);
  g.add(dust.obj);
  const glow = halo([V(0, 1.0, 0)], [7], '#dfeaff', 0);
  lander.obj.add(glow.obj);
  const rand = rng(o.seed + 9);
  let cued = -1, emitAcc = 0;
  c.anim.extra.push((e) => {
    const cyc = Math.floor((e.t + o.seed % 9) / PAD_PERIOD);
    const u = ((e.t + o.seed % 9) % PAD_PERIOD + PAD_PERIOD) % PAD_PERIOD;
    let y = 0, thrust = 0;
    if (u < 7) { const s = u / 7; y = 70 * (1 - s) ** 2; thrust = 0.6 + 0.4 * s; }
    else if (u < 30) { y = 0; thrust = 0; }
    else if (u < 31.4) { y = 0; thrust = (u - 30) / 1.4; }
    else { const s = u - 31.4; y = 1.6 * s * s; thrust = 1; }
    lander.obj.visible = y < 180;
    lander.obj.position.y = y;
    lander.flame.visible = thrust > 0.02;
    const fl = thrust * (0.85 + Math.sin(e.t * 31) * 0.1 + Math.sin(e.t * 17) * 0.05);
    lander.flame.scale.set(0.6 + 0.5 * fl, 0.4 + 0.8 * fl, 0.6 + 0.5 * fl);
    glow.set(thrust * 0.9);
    // dust: thrown out flat when the engines fire near the slab
    if (thrust > 0 && y < 9) {
      emitAcc += e.dt * 170 * thrust * (1 - y / 9);
      const n = Math.floor(emitAcc);
      emitAcc -= n;
      if (n) dust.emit(0, 0.3, 0, n, 10, 1.6, rand, 0, TAU, 2.2);
    }
    if (u >= 31.4 && cued !== cyc) { cued = cyc; e.cue?.('launch'); }
    dust.update(e);
    const ch = Math.floor(e.t * 6) % 2;
    edge.emissiveIntensity = ch ? 2.2 : 0.4;
    edgeOff.emissiveIntensity = ch ? 0.4 : 2.2;
  });
  c.finish();
  return { obj: g, w: W, d: D, h: lander.h + 0.3, update: c.update };
}

// ── the solar masts on the rim ───────────────────────────────────────────────────────────────
export function rimSolar(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const hw = W / 2, hd = D / 2;
  const ground = (x: number, z: number) => {
    if (Math.abs(x) > hw || Math.abs(z) > hd) return null;
    const fade = Math.min(1, (hw - Math.abs(x)) / 5) * Math.min(1, (hd - Math.abs(z)) / 2.5);
    const crest = 3.2 * Math.exp(-(((z + 1.5) / 5.2) ** 2));
    return fade * (crest + (fbm(x * 0.15, z * 0.15, 31, 2) - 0.5) * 0.6);
  };
  const h = (x: number, z: number) => ground(x, z) ?? 0;
  const masts: { head: THREE.Group; x: number; z: number }[] = [];
  const MH = 22;
  [-15, -7.5, 0, 7.5, 15].forEach((x, i) => {
    const z = -1.5 + (i % 2 ? 1.6 : -1.2);
    const y0 = h(x, z) - 0.2;
    k.box(1.4, 0.6, 1.4, M.reg3, x, y0, z, { r: 0.08 });
    k.cyl(0.24, 0.32, MH, M.white2, x, y0 + 0.5, z, 10, { shade: 0.06 });
    for (const yy of [6, 12, 18]) k.cyl(0.42, 0.42, 0.14, M.steel, x, y0 + yy, z, 10, { shade: 0 });
    // guy wires to anchors
    for (let a = 0; a < 3; a++) {
      const ang = (a / 3) * TAU + 0.5;
      const ax = x + Math.sin(ang) * 4.4, az = z + Math.cos(ang) * 4.2;
      k.box(0.4, 0.3, 0.4, M.steelD, ax, h(ax, az) - 0.1, az, { r: 0.04 });
      k.beam(V(ax, h(ax, az) + 0.1, az), V(x, y0 + 14, z), 0.04, '#5b5562');
    }
    k.box(1.1, 1.0, 0.8, M.white, x + 0.9, y0 + 0.5, z + 0.8, { r: 0.08 });
    k.box(1.12, 0.2, 0.82, L.acc, x + 0.9, y0 + 1.25, z + 0.8, { r: 0.02, shade: 0 });
    // the array: a tall vertical blanket on a turning head
    const head = new THREE.Group();
    head.position.set(x, y0, z);
    const hk = new LiteKit(rng(o.seed + i));
    hk.box(0.7, 0.6, 0.7, M.steelD, 0, MH - 0.2, 0, { r: 0.06 });
    hk.box(0.18, 13.8, 0.18, M.steel, 0, 7.6, -0.32, { r: 0 });
    const pw = 3.6, ph = 13.2, py = 7.9;
    hk.box(pw, ph, 0.1, M.panel, 0, py, -0.5, { r: 0.02, jitter: 0.02, shade: 0 });
    hk.box(pw - 0.1, ph - 0.1, 0.06, '#e8e4de', 0, py + 0.05, -0.58, { r: 0, jitter: 0, shade: 0 });
    for (let j = 1; j < 4; j++) hk.box(0.04, ph, 0.12, M.panelL, -pw / 2 + (j * pw) / 4, py, -0.48, { r: 0, jitter: 0, shade: 0 });
    for (let j = 1; j < 12; j++) hk.box(pw, 0.04, 0.12, M.panelL, 0, py + (j * ph) / 12, -0.48, { r: 0, jitter: 0, shade: 0 });
    for (const yy of [py, py + ph]) hk.box(pw + 0.3, 0.16, 0.2, M.steel, 0, yy - 0.08, -0.5, { r: 0, jitter: 0 });
    for (const s of [-1, 1]) hk.box(0.12, ph, 0.18, M.steel, s * (pw / 2 + 0.06), py, -0.5, { r: 0, jitter: 0 });
    head.add(hk.build());
    beacon(head, 0, MH + 0.55, 0, 0);
    g.add(head);
    masts.push({ head, x, z });
  });
  // cables down the slope to the converter
  const cx = 2.0, cz = 8.4;
  k.box(4.2, 2.2, 2.6, M.white, cx, h(cx, cz) - 0.1, cz, { r: 0.12 });
  k.box(4.24, 0.3, 2.64, L.acc, cx, h(cx, cz) + 1.5, cz, { r: 0.02, shade: 0 });
  radiator(k, cx + 3.6, cz, 3, 1.8, 2.2, 0, h(cx + 3.6, cz) - 0.1);
  for (const m of masts) {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 6; s++) {
      const x = m.x + 0.9 + (cx - m.x - 0.9) * (s / 6), z = m.z + 0.8 + (cz - 1.2 - m.z - 0.8) * (s / 6);
      pts.push(V(x, h(x, z) + 0.08, z));
    }
    for (let s = 0; s < 6; s++) k.beam(pts[s], pts[s + 1], 0.08, '#433c52');
  }
  roverTracks(k, [[-hw + 1, 6], [-8, 5.4], [0, 6.6], [hw - 1, 5.6]].map(([x, z]) => [x, z] as [number, number]), 1.9);
  astro(g, cx - 3.0, cz + 1.0, 0.6, o.seed + 2, h(cx - 3, cz + 1));
  const cache: SunCache = {};
  let yaw = Math.atan2(-0.64, 0.75);
  c.anim.extra.push((e) => {
    const s = sunDir(g, cache, e.t);
    const want = Math.atan2(s.x, s.z) + Math.PI;
    let d = want - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += d * Math.min(1, e.dt * 0.6);
    // the panel faces the sun (its face is on -z of the head), with a slow hunt
    for (const [i, m] of masts.entries()) m.head.rotation.y = yaw + Math.sin(e.t * 0.05 + i) * 0.02;
  });
  c.finish();
  return { obj: g, w: W, d: D, h: MH + 4, update: c.update, ground };
}

// ── the ice rig in the permanently shadowed crater ──────────────────────────────────────────
export function iceRig(o: Act3SetOpts): Piece {
  const c = new Ctx(o, 'SHACKLETON');
  const { k, g, L, W, D } = c;
  const hw = W / 2, hd = D / 2, FLOOR = -5.6;
  const ground = (x: number, z: number) => {
    if (Math.abs(x) > hw || Math.abs(z) > hd) return null;
    const rho = Math.hypot(x / (hw - 0.5), (z + 0.5) / (hd - 0.5));
    // the near (front) rim lower so we can see in
    const sz = Math.min(1, Math.max(0, (z + 6) / 12));
    const rim = 1.7 * (1 - 0.5 * sz * sz * (3 - 2 * sz));
    let y: number;
    if (rho < 0.48) y = FLOOR;
    else if (rho < 0.84) { const t = (rho - 0.48) / 0.36; y = FLOOR + (rim - FLOOR) * (t * t * (3 - 2 * t)); }
    else if (rho < 1) { const t = (rho - 0.84) / 0.16; y = rim * (1 - t * t * (3 - 2 * t)); }
    else y = 0;
    return y + (fbm(x * 0.2, z * 0.2, 41, 2) - 0.5) * (rho < 0.5 ? 0.2 : 0.5) * Math.min(1, (1 - Math.min(1, rho)) * 6);
  };
  const fy = FLOOR;
  // frost on the floor: pale patches of ice in the dark
  for (let i = 0; i < 9; i++) {
    const a = i * 2.1, rr = 1.5 + (i % 4) * 1.3;
    k.cyl(0.9 + (i % 3) * 0.4, 1.0 + (i % 3) * 0.4, 0.06, M.ice, Math.sin(a) * rr * 1.2, fy - 0.02, -0.5 + Math.cos(a) * rr * 0.8, 10, { shade: 0, jitter: 0.04 });
  }
  // the rig: a lattice derrick over a heated drill head, a heater house, tanks
  const rx = -1.6, rz = -1.6, H = 8.4;
  k.box(4.6, 0.4, 4.6, M.reg3, rx, fy, rz, { r: 0.08 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.beam(V(rx + sx * 1.7, fy + 0.4, rz + sz * 1.7), V(rx + sx * 0.35, fy + H, rz + sz * 0.35), 0.16, L.acc);
  for (let y = 1.4; y < H; y += 1.5) {
    const hh = 1.7 - ((y - 0.4) / H) * 1.35;
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) k.beam(V(rx + ax * hh, fy + y, rz + az * hh), V(rx + bx * hh, fy + y, rz + bz * hh), 0.07, M.steel);
  }
  k.box(1.0, 0.6, 1.0, M.steelD, rx, fy + H, rz, { r: 0.05 });
  k.cyl(0.18, 0.18, H - 0.6, M.steel, rx, fy + 0.4, rz, 8);
  const hot = plasmaMat('#f7b258', 1.6);
  const heat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 1.0, 12).translate(rx, fy + 0.8, rz), hot);
  g.add(heat);
  const hl = halo([V(rx, fy + 0.9, rz)], [4], '#f7b258', 0.6);
  g.add(hl.obj);
  beacon(g, rx, fy + H + 0.8, rz, 0.3);
  k.box(3.4, 2.4, 2.4, M.white, rx + 4.4, fy, rz - 0.6, { r: 0.12 });
  k.box(3.44, 0.3, 2.44, L.acc, rx + 4.4, fy + 1.9, rz - 0.6, { r: 0.02, shade: 0 });
  c.lit.box(1.2, 0.6, 0.1, M.glass, rx + 4.4, fy + 1.1, rz + 0.62, { r: 0.03, jitter: 0 });
  pipeRun(k, [V(rx + 1.0, fy + 1.4, rz), V(rx + 2.7, fy + 1.4, rz)], 0.16, M.steel, { seg: 8 });
  for (const [x, z] of [[rx - 3.6, rz + 0.6], [rx - 3.6, rz - 2.2]] as [number, number][]) {
    k.cyl(0.95, 0.95, 2.8, M.white2, x, fy, z, 16, { shade: 0.1 });
    k.cyl(0.97, 0.97, 0.7, M.frost, x, fy, z, 16, { shade: 0 });
    k.cyl(0.97, 0.97, 0.2, L.acc, x, fy + 2.2, z, 16, { shade: 0 });
  }
  pipeRun(k, [V(rx - 2.6, fy + 1.6, rz - 0.8), V(rx - 1.0, fy + 1.6, rz - 0.8)], 0.14, M.steel, { seg: 8 });
  // a little excavator working the frozen floor, lights on
  const ex = 4.6, ez = 2.2;
  k.box(2.2, 0.7, 1.6, M.dark, ex, fy, ez, { r: 0.2 });
  k.box(1.6, 1.0, 1.4, 'yel0', ex, fy + 0.7, ez, { r: 0.1 });
  k.beam(V(ex - 0.6, fy + 1.4, ez), V(ex - 2.4, fy + 2.4, ez), 0.24, 'yel0');
  k.beam(V(ex - 2.4, fy + 2.4, ez), V(ex - 3.0, fy + 0.5, ez), 0.2, 'yel0');
  k.box(0.7, 0.5, 0.8, M.steelD, ex - 3.0, fy + 0.1, ez, { r: 0.05 });
  c.lamps.box(0.3, 0.2, 0.2, '#e9e1d2', ex - 0.4, fy + 1.8, ez + 0.5, { r: 0.02 });
  // floodlights on the rim aimed down into the dark, and their pools on the floor
  const rimAt = (a: number) => {
    const x = Math.sin(a) * (hw - 3.4), z = -0.5 + Math.cos(a) * (hd - 3.4);
    return V(x, ground(x, z) ?? 0, z);
  };
  for (const a of [Math.PI * 0.78, Math.PI * 1.25, Math.PI * 1.75, Math.PI * 0.25]) {
    const p = rimAt(a);
    floodMast(c, p.x, p.z, 4.2, a + Math.PI, 0, p.y - 0.2, 0.1);
  }
  for (const [x, z, r] of [[rx, rz, 6.5], [ex - 1, ez, 4.4], [rx - 3.6, rz, 3.5]] as [number, number, number][]) lightPool(g, x, fy, z, r, tintPool('#e8f2ff', 0.75));
  // frost glints in the lamp light
  const gl: THREE.Vector3[] = [];
  const rr = rng(o.seed + 3);
  for (let i = 0; i < 26; i++) {
    const a = rr() * TAU, d = 1.5 + rr() * 6;
    gl.push(V(Math.sin(a) * d * 1.3, fy + 0.1, -0.5 + Math.cos(a) * d * 0.85));
  }
  const glints = halo(gl, gl.map(() => 0.5), '#dff0ff', 0.7);
  g.add(glints.obj);
  // the cableway up to the hut on the rim (right), a bucket riding it
  const hut = rimAt(Math.PI * 0.45);
  k.box(3.0, 2.4, 2.6, M.white, hut.x + 0.4, hut.y - 0.1, hut.z, { r: 0.1 });
  k.box(3.04, 0.3, 2.64, L.acc, hut.x + 0.4, hut.y + 1.8, hut.z, { r: 0.02, shade: 0 });
  c.lit.box(0.1, 0.6, 1.0, M.glass, hut.x - 1.12, hut.y + 1.0, hut.z, { r: 0.02, jitter: 0 });
  k.box(0.3, 4.6, 0.3, M.steel, hut.x - 1.4, hut.y - 0.1, hut.z - 1.4, { r: 0 });
  const top0 = V(rx + 0.4, fy + H - 0.6, rz), top1 = V(hut.x - 1.4, hut.y + 4.4, hut.z - 1.4);
  for (let s = 0; s < 10; s++) {
    const a = top0.clone().lerp(top1, s / 10), b = top0.clone().lerp(top1, (s + 1) / 10);
    a.y -= Math.sin((Math.PI * s) / 10) * 0.6;
    b.y -= Math.sin((Math.PI * (s + 1)) / 10) * 0.6;
    k.beam(a, b, 0.05, '#433c52');
  }
  const bk = new LiteKit(rng(o.seed + 4));
  bk.box(0.6, 0.6, 0.6, L.acc, 0, -1.0, 0, { r: 0.06 });
  bk.box(0.06, 0.5, 0.06, M.steelD, 0, -0.5, 0, { r: 0 });
  const bucket = bk.build();
  g.add(bucket);
  astro(g, rx + 2.6, rz + 2.8, 0.8, o.seed + 1, fy);
  astro(g, hut.x - 2.4, hut.z + 1.6, -1.2, o.seed + 2, hut.y);
  c.anim.extra.push((e) => {
    const f = 1 + Math.sin(e.t * 5.3) * 0.08 + Math.sin(e.t * 13) * 0.05;
    hot.emissiveIntensity = 1.7 * f;
    hl.set(0.55 * f);
    glints.set(0.45 + 0.3 * Math.sin(e.t * 2.1));
    const s = (Math.sin(e.t * 0.25) + 1) / 2;
    const p = top0.clone().lerp(top1, s);
    p.y -= Math.sin(Math.PI * s) * 0.6;
    bucket.position.copy(p);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: 10, update: c.update, ground };
}
