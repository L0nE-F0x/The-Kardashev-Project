/**
 * The sun's share of a megaproject: a GW-scale tracker field (a block of the sea of panels), a
 * concentrated-solar tower over its rings of heliostats, and a grid battery yard.
 */
import * as THREE from 'three';
import { col, Kit, lightPool, rng } from '../../../kit';
import { fenceMesh, type Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  Anim, beacon, CHARTER, fieldOf, floodMast, gantry, glowPoints, instances, insulatorUnit, jit, ledGreen, mirrorMat, P, panelMat, pipe,
  placard, standing, TAU, track, transformer, vehicle, V, warmPool, windows, xf, yard,
} from './common';

// ── the tracker field ────────────────────────────────────────────────────────────────────────
/** One table of a tracker row: four 2-in-portrait modules on a torque tube (x along the row). */
export function tableUnit(seed: number) {
  const k = new Kit(rng(seed));
  const m = 1.03;
  for (let i = 0; i < 4; i++) {
    const x = -1.5 * m + i * m;
    k.box(m - 0.05, 0.05, 2.0, P.panel, x, 0, 0, { r: 0, jitter: 0.1, shade: 0 });
    k.box(m - 0.05, 0.052, 0.035, '#5a74a8', x, 0, 0, { r: 0, jitter: 0, shade: 0 });
    k.box(m - 0.01, 0.03, 2.04, P.frame, x, -0.03, 0, { r: 0, jitter: 0, shade: 0 });
  }
  // the upper edge catches the light (the pixel art's highlight row)
  k.box(4 * m - 0.05, 0.06, 0.07, '#93bfe8', 0, 0.005, -0.985, { r: 0, jitter: 0.02, shade: 0 });
  k.box(4 * m, 0.12, 0.12, '#7a7186', 0, -0.16, 0, { r: 0, jitter: 0 });
  return k;
}
export function postUnit() {
  const k = new Kit(rng(2));
  k.box(0.13, 1.0, 0.13, '#8a8490', 0, 0, 0, { r: 0, jitter: 0 });
  k.box(0.3, 0.12, 0.24, '#5b5562', 0, 0.98, 0, { r: 0, jitter: 0 });
  return k;
}
function sheepUnit() {
  const k = new Kit(rng(9));
  for (const [x, z] of [[-0.3, -0.14], [-0.3, 0.14], [0.3, -0.14], [0.3, 0.14]]) k.box(0.08, 0.36, 0.08, '#3b2a24', x, 0, z, { r: 0 });
  k.box(0.95, 0.5, 0.56, '#efe9de', 0, 0.3, 0, { r: 0.2, jitter: 0.04 });
  k.box(0.28, 0.3, 0.26, '#2f2a3d', 0.55, 0.55, 0, { r: 0.08 });
  return k;
}

/**
 * A block of a GW-scale solar park: long tracker rows to the edges, a service track with inverter
 * skids, a cross track; sheep graze under the rows on farmland, cleaning robots ride them in the desert.
 */
export function solarField(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const v = (o.vseed ?? 0) % 3;
  const f = fieldOf(o.backdrop);
  const r = rng(o.seed + v * 101);
  const tilt = 0.44, tubeY = 1.42;
  const trackZ = [1, -5, 5][v], trackW = 3.4;
  const crossX = [-W * 0.16, W * 0.22, -W * 0.3][v], crossW = 2.6;
  const ground = new Kit(rng(o.seed + 3));
  track(ground, -W / 2, trackZ, W / 2, trackZ, trackW, f.track);
  track(ground, crossX, -D / 2, crossX, D / 2, crossW, f.track);
  // worn strips under the rows (graded ground between the posts)
  const rowsZ: number[] = [];
  const pitch = 2.55;
  for (let z = -D / 2 + 1.4; z <= D / 2 - 1.2; z += pitch) if (Math.abs(z - trackZ) > trackW / 2 + 1.1) rowsZ.push(z);
  // panels and posts
  const tables: THREE.Matrix4[][] = [[], [], []];
  const posts: THREE.Matrix4[] = [];
  const tl = 4 * 1.03 + 0.12;
  const spans: [number, number][] = [[-W / 2 + 0.7, crossX - crossW / 2 - 0.5], [crossX + crossW / 2 + 0.5, W / 2 - 0.7]];
  for (const [ri, z] of rowsZ.entries())
    for (const [a, b] of spans) {
      const n = Math.floor((b - a) / tl);
      if (n < 1) continue;
      const x0 = (a + b) / 2 - (n * tl) / 2 + tl / 2;
      track(ground, x0 - tl / 2, z + 0.3, x0 + (n - 0.5) * tl, z + 0.3, 1.3, f.worn, 0.0);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * tl;
        tables[(ri * 7 + i * 3 + v) % 3].push(xf(x, tubeY + 0.18, z, 0, tilt));
        posts.push(xf(x, 0, z, 0, 0, 1, 0, tubeY + 0.06));
      }
    }
  const tj = jit(r, 0.07);
  tables.forEach((at, i) => g.add(instances(tableUnit(o.seed + i * 7), at, panelMat, tj)));
  g.add(instances(postUnit(), posts));
  // inverter skids where the tracks meet and along the service track
  const kit = new Kit(rng(o.seed + 5));
  const glow: [number, number, number, number, number, number?][] = [];
  const skids = [crossX + 6, crossX - 12, crossX + 22].filter((x) => Math.abs(x) < W / 2 - 4);
  for (const [i, sx] of skids.entries()) {
    const sz = trackZ - trackW / 2 - 0.2 - (i % 2 ? 0 : 0);
    kit.box(6.6, 0.25, 2.6, P.concreteD, sx, 0, sz - 1.2, { r: 0.05 });
    kit.box(3.6, 2.3, 2.0, P.white, sx - 1.2, 0.25, sz - 1.2, { r: 0.1 });
    kit.box(3.62, 0.25, 2.02, CHARTER.field, sx - 1.2, 2.2, sz - 1.2, { r: 0.04, shade: 0 });
    for (let d = 0; d < 3; d++) kit.box(0.9, 1.6, 0.05, '#c9c1b6', sx - 2.4 + d * 1.15, 0.45, sz - 0.18, { r: 0.02, shade: 0 });
    transformer(kit, sx + 2.0, sz - 1.2, 0.55, CHARTER.field);
    for (let d = 0; d < 3; d++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), ledGreen);
      led.position.set(sx - 2.4 + d * 1.15, 1.85, sz - 0.14);
      g.add(led);
    }
  }
  // a crew on the track
  vehicle(g, 'pickup', skids[0] - 7, trackZ + 0.6, 0.05 + Math.PI);
  standing(g, skids[0] - 3.5, trackZ + 0.2, 0.6, o.seed + 1);
  standing(g, skids[0] - 2.6, trackZ - 0.3, -2.2, o.seed + 2);
  g.add(kit.build());
  if (glow.length) windows(g, glow);
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  // sheep under the rows on farmland; cleaning robots in the desert
  if (f.grazing && o.backdrop !== 'mountain') {
    const at: THREE.Matrix4[] = [];
    for (let i = 0; i < 16; i++) {
      const z = rowsZ[Math.floor(r() * rowsZ.length)] + 1.2;
      const x = (r() - 0.5) * (W - 4);
      if (Math.abs(x - crossX) < 2) continue;
      at.push(xf(x, 0, z, r() * 6.28, 0, 0.95 + r() * 0.15));
    }
    g.add(instances(sheepUnit(), at, undefined, jit(r, 0.06)));
  } else {
    const rk = new Kit(rng(4));
    rk.box(1.1, 0.22, 2.1, '#ece6dc', 0, 0, 0, { r: 0.06 });
    rk.box(0.2, 0.26, 2.1, '#5b5562', 0.45, 0.02, 0, { r: 0.03 });
    rk.box(0.16, 0.06, 0.16, '#5fd3b5', -0.3, 0.22, 0.7, { r: 0 });
    const geo = rk.build().geometry;
    const robotMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const z = rowsZ[(i * 3 + v * 2 + 1) % rowsZ.length];
      const row = new THREE.Group();
      row.position.set(0, tubeY + 0.18, z);
      row.rotation.x = tilt;
      const bot = new THREE.Mesh(geo, robotMat);
      bot.castShadow = true;
      bot.position.y = 0.08;
      row.add(bot);
      g.add(row);
      const span = spans[i % 2];
      const ph = r() * 6.28, sp = 0.05 + r() * 0.04;
      anim.add((e) => { bot.position.x = span[0] + 1 + (span[1] - span[0] - 2) * (0.5 + 0.5 * Math.sin(e.t * sp + ph)); });
    }
  }
  return { obj: g, w: W, d: D, h: 3, update: anim.update, ground: () => null };
}

// ── the solar tower ──────────────────────────────────────────────────────────────────────────
function heliostatUnit(seed: number) {
  const k = new Kit(rng(seed));
  // the mirror (facets with thin gaps), its frame and the drive arm behind
  for (const [x, z] of [[-0.56, -0.4], [0.56, -0.4], [-0.56, 0.4], [0.56, 0.4]]) k.box(1.08, 0.05, 0.76, '#b4d2ee', x, 0.03, z, { r: 0, jitter: 0.05, shade: 0 });
  k.box(2.26, 0.05, 1.62, '#7d8aa0', 0, -0.02, 0, { r: 0, jitter: 0, shade: 0 });
  k.box(1.8, 0.12, 0.12, '#5b5562', 0, -0.12, 0, { r: 0, jitter: 0 });
  return k;
}
function pedestalUnit() {
  const k = new Kit(rng(3));
  k.cyl(0.24, 0.3, 0.12, P.concreteD, 0, 0, 0, 8, { shade: 0 });
  k.cyl(0.09, 0.11, 1.35, '#8a8490', 0, 0.1, 0, 6, { shade: 0.1 });
  k.box(0.3, 0.26, 0.3, '#5b5562', 0, 1.3, 0, { r: 0 });
  return k;
}

/**
 * Concentrated solar power with molten-salt storage: rings of heliostats all aimed at a receiver
 * on a tall tower that shines like a second sun by day; the hot and cold salt tanks and the
 * turbine hall at its foot keep generating after dark.
 */
export function cspTower(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const anim = new Anim();
  const W = o.w, D = o.d;
  const f = fieldOf(o.backdrop);
  const r = rng(o.seed + 17);
  const tx = -2, tz = 3;
  const towerH = 36, recY = towerH + 1;
  const sun = V(-0.25, 0.8, 0.55).normalize();
  const block = { x0: 6, x1: W / 2 - 0.5, z0: 13, z1: D / 2 - 0.5 };
  const kit = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  // access road to the tower, ring track round the tower
  track(ground, tx, tz + 3, tx, D / 2, 3.2, f.track);
  track(ground, tx + 1.5, 17.5, W / 2, 17.5, 3, f.track);
  ground.geo(new THREE.RingGeometry(4.4, 6.2, 28).rotateX(-Math.PI / 2).translate(tx, 0.04, tz), f.track, 0.02);
  ground.geo(new THREE.CircleGeometry(4.4, 28).rotateX(-Math.PI / 2).translate(tx, 0.05, tz), P.gravel, 0.02);
  // heliostats: staggered rings, each mirror bisecting the sun and the receiver
  const mir: THREE.Matrix4[][] = [[], []];
  const ped: THREE.Matrix4[] = [];
  const rec = V(tx, recY, tz);
  let ring = 0;
  for (let rad = 7.4; rad < 44; rad += 2.55 + ring * 0.03, ring++) {
    const n = Math.floor((TAU * rad) / 2.6);
    const off = (ring % 2) * 0.5;
    for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * TAU;
      const x = tx + Math.cos(a) * rad, z = tz + Math.sin(a) * rad;
      if (Math.abs(x) > W / 2 - 1.2 || Math.abs(z) > D / 2 - 1.2) continue;
      if (x > block.x0 - 1 && z > block.z0 - 1) continue;
      if (Math.abs(x - tx) < 2.6 && z > tz) continue;
      if (Math.abs(z - 17.5) < 2.4 && x > tx) continue;
      const p = V(x, 1.75, z);
      const toR = rec.clone().sub(p).normalize();
      const nrm = toR.add(sun).normalize();
      mir[(i + ring) % 2].push(xf(x, 1.75, z, Math.atan2(nrm.x, nrm.z), Math.acos(nrm.y), 1));
      ped.push(xf(x, 0, z, a));
    }
  }
  const mj = jit(r, 0.06);
  mir.forEach((at, i) => g.add(instances(heliostatUnit(o.seed + i), at, mirrorMat, mj)));
  g.add(instances(pedestalUnit(), ped));
  // the tower: slipformed concrete, the receiver, a heat shield and a crown with beacons
  kit.box(7, 3.2, 7, P.concrete, tx, 0, tz, { r: 0.18 });
  kit.box(7.1, 0.35, 7.1, CHARTER.field, tx, 2.8, tz, { r: 0.06, shade: 0 });
  kit.cyl(1.55, 2.3, towerH - 3, '#d8d0c4', tx, 3, tz, 20, { shade: 0.12, jitter: 0.015 });
  for (let y = 6; y < towerH - 2; y += 4.5) {
    const rr = 2.3 - ((y - 3) / (towerH - 3)) * 0.75;
    kit.cyl(rr + 0.03, rr + 0.03, 0.12, '#bfb6aa', tx, y, tz, 20, { shade: 0 });
  }
  kit.cyl(2.2, 1.7, 1.2, '#efe8de', tx, towerH - 1.4, tz, 20, { shade: 0 });
  kit.cyl(2.2, 2.2, 0.5, '#5b5562', tx, recY - 1.8, tz, 20, { shade: 0 });
  kit.cyl(2.25, 2.25, 0.6, '#efe8de', tx, recY + 2.8, tz, 20, { shade: 0 });
  kit.cyl(1.6, 2.0, 1.6, '#d8d0c4', tx, recY + 3.4, tz, 16, { shade: 0 });
  kit.box(0.2, 3.2, 0.2, P.steel, tx, recY + 5, tz, { r: 0 });
  beacon(g, tx, recY + 8.4, tz, 0.4);
  beacon(g, tx + 1.9, recY + 3.3, tz, 1.9);
  beacon(g, tx - 1.9, recY + 3.3, tz, 1.9);
  // the receiver: white-hot by day, a faint ember after dark
  const recMat = new THREE.MeshStandardMaterial({ color: col('#fff1d0'), emissive: col('#fff3d6'), emissiveIntensity: 2, roughness: 0.5 });
  const receiver = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 4.6, 24, 1, true).translate(tx, recY + 0.5, tz), recMat);
  g.add(receiver);
  const ribs = new Kit(rng(4));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ribs.box(0.1, 4.6, 0.08, '#e8c98e', tx + Math.cos(a) * 2.08, recY - 1.8, tz + Math.sin(a) * 2.08, { r: 0, ry: -a, jitter: 0, shade: 0 });
  }
  const ribMesh = ribs.build(recMat);
  ribMesh.castShadow = false;
  g.add(ribMesh);
  // a halo round it and faint shafts of concentrated light from the field (dotted, like the pixel art's)
  const halo = glowPoints([V(tx, recY + 0.5, tz + 0.6), V(tx, recY + 0.5, tz + 0.6)], [26, 9], '#fff0d0', 0.6);
  g.add(halo);
  const shaftPts: THREE.Vector3[] = [], shaftSz: number[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.2, rad = 11 + (i % 4) * 6;
    const p = V(tx + Math.cos(a) * rad, 1.8, tz + Math.sin(a) * rad);
    for (let k = 0; k < 16; k++) {
      const t = 0.15 + (k / 16) * 0.8;
      shaftPts.push(p.clone().lerp(rec, t));
      shaftSz.push(1.6 + t * 1.6);
    }
  }
  const shafts = glowPoints(shaftPts, shaftSz, '#fff4dc', 0.1);
  g.add(shafts);
  // the power block: hot and cold salt tanks, steam generator, turbine hall
  const bx = (block.x0 + block.x1) / 2, bz = (block.z0 + block.z1) / 2;
  yard(ground, block.x1 - block.x0, block.z1 - block.z0, bx, bz, P.gravel);
  for (const [i, x] of [block.x0 + 4.2, block.x0 + 12].entries()) {
    const hot = i === 0;
    kit.cyl(3.4, 3.4, 0.5, P.concreteD, x, 0, block.z0 + 4.4, 24);
    kit.cyl(3.1, 3.1, 5, hot ? '#b9b0a4' : '#e3ddd3', x, 0.4, block.z0 + 4.4, 24, { shade: 0.1 });
    kit.cyl(3.15, 3.15, 0.5, hot ? P.orange : CHARTER.field, x, 4.2, block.z0 + 4.4, 24, { shade: 0 });
    kit.geo(new THREE.SphereGeometry(3.1, 24, 6, 0, TAU, 0, 0.42).translate(x, 5.4 - 3.1 * Math.cos(0.42), block.z0 + 4.4), hot ? '#a8a094' : '#d8d0c4', 0.02);
    for (let s = 0; s < 3; s++) kit.box(0.12, 5.3, 0.12, P.steelD, x - 3.25 + s * 0.15, 0, block.z0 + 4.4 + (s - 1) * 0.6, { r: 0 });
  }
  kit.box(5.2, 3.6, 3.4, '#ddd6cc', block.x0 + 6, 0, block.z1 - 4.2, { r: 0.12 });
  kit.box(8.6, 5.2, 5.2, '#e3ddd3', block.x1 - 5.2, 0, block.z1 - 3.4, { r: 0.18 });
  kit.box(8.8, 0.45, 5.4, CHARTER.field, block.x1 - 5.2, 4.4, block.z1 - 3.4, { r: 0.05, shade: 0 });
  kit.box(8.9, 0.3, 5.5, '#5b5562', block.x1 - 5.2, 5.2, block.z1 - 3.4, { r: 0.05, shade: 0 });
  for (let i = 0; i < 4; i++) kit.box(1.0, 1.1, 0.06, P.glassD, block.x1 - 8.2 + i * 2, 2.4, block.z1 - 0.78, { r: 0.02, shade: 0 });
  windows(g, [0, 1, 2, 3].map((i): [number, number, number, number, number] => [block.x1 - 8.2 + i * 2, 2.95, block.z1 - 0.72, 0.9, 1.0]));
  placard(g, 'SALT STORAGE', 4.2, block.x0 + 8.1, 2.2, block.z0 + 7.6, '#fbf7f0', CHARTER.dark);
  // the salt lines from the tower to the tanks
  pipe(kit, [V(tx + 3.5, 1.2, tz + 2), V(block.x0 + 1.2, 1.2, tz + 2), V(block.x0 + 1.2, 1.2, block.z0 + 4.4), V(block.x0 + 4.2, 1.2, block.z0 + 4.4)], 0.22, P.silver);
  pipe(kit, [V(tx + 3.5, 1.8, tz + 2.6), V(block.x0 + 1.8, 1.8, tz + 2.6), V(block.x0 + 1.8, 1.8, block.z0 + 1.2), V(block.x0 + 12, 1.8, block.z0 + 1.2), V(block.x0 + 12, 1.8, block.z0 + 1.8)], 0.2, '#c9c1b6');
  transformer(kit, block.x1 - 3, block.z0 + 2.4, 0.7, CHARTER.field);
  floodMast(g, kit, block.x0 + 1, block.z1 - 1, 10, Math.PI * 0.8);
  vehicle(g, 'pickup', tx + 0.8, D / 2 - 4, Math.PI / 2 + 0.05);
  standing(g, tx - 2.6, tz + 5.4, 0.4, o.seed + 3);
  standing(g, block.x0 + 3, block.z1 - 1.2, -0.6, o.seed + 4);
  g.add(kit.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  anim.add((e) => {
    const day = 1 - e.night;
    recMat.emissiveIntensity = 0.12 + day * 2.4;
    recMat.emissive.copy(col('#ffb070')).lerp(col('#fff3d6'), day);
    (halo.material as THREE.ShaderMaterial).uniforms.opacity.value = 0.04 + day * 0.55;
    (shafts.material as THREE.ShaderMaterial).uniforms.opacity.value = day * (0.07 + 0.03 * Math.sin(e.t * 1.3));
    shafts.visible = day > 0.05;
  });
  return { obj: g, w: W, d: D, h: recY + 8, update: anim.update, ground: () => null };
}
// ── grid batteries ───────────────────────────────────────────────────────────────────────────
export function containerUnit(band: string) {
  const k = new Kit(rng(21));
  // the body and band keep their bevels; the small parts are plain boxes (it's drawn many times)
  k.box(3.7, 0.18, 1.7, '#8a8490', 0, 0, 0, { r: 0, jitter: 0 });
  k.box(3.6, 2.0, 1.6, '#ece6dc', 0, 0.16, 0, { r: 0.1, jitter: 0.03, shade: 0.14 });
  k.box(3.64, 0.22, 1.64, band, 0, 1.9, 0, { r: 0, shade: 0 });
  for (let i = 0; i < 4; i++) {
    k.box(0.78, 1.5, 0.05, '#d8d0c4', -1.31 + i * 0.87, 0.3, 0.81, { r: 0, jitter: 0.02, shade: 0 });
    k.box(0.05, 0.3, 0.06, '#7a7186', -1.0 + i * 0.87, 0.95, 0.85, { r: 0, jitter: 0 });
  }
  k.box(1.3, 0.42, 1.0, '#b9c2c4', 0.9, 2.16, 0, { r: 0.06 });
  k.cyl(0.32, 0.32, 0.06, '#5e6670', 0.9, 2.58, 0, 10, { shade: 0 });
  k.box(0.9, 0.1, 1.2, '#b9c2c4', -1.0, 2.16, 0, { r: 0 });
  return k;
}

/** A grid battery yard: rows of containers back to back, inverters at the row ends, the HV transformer at the front. */
export function storageYard(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  const W = o.w, D = o.d;
  const band = o.accent || CHARTER.field;
  const kit = new Kit(rng(o.seed));
  const ground = new Kit(rng(o.seed + 1));
  yard(ground, W - 1.2, D - 1.2);
  const at: THREE.Matrix4[] = [];
  const leds: THREE.Matrix4[] = [];
  const n = 5, cw = 3.6, gap = 0.55;
  const x0 = -W / 2 + 2.6 + cw / 2;
  const pairs = 3;
  for (let p = 0; p < pairs; p++) {
    const zc = -D / 2 + 3.2 + p * 5.2;
    for (const side of [-1, 1]) {
      const z = zc + side * 0.95;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (cw + gap);
        at.push(xf(x, 0.05, z, side < 0 ? Math.PI : 0));
        leds.push(xf(x - 1.0 + (side < 0 ? 2.0 : 0), 1.72, z + side * 0.84, side < 0 ? Math.PI : 0));
      }
    }
    // inverter + MV transformer skid at the row end, a cable trench down the aisle
    const ex = x0 + n * (cw + gap) + 0.8;
    kit.box(2.2, 2.2, 1.6, '#d8d0c4', ex, 0.05, zc - 0.9, { r: 0.1 });
    kit.box(2.22, 0.2, 1.62, band, ex, 2.0, zc - 0.9, { r: 0.04, shade: 0 });
    transformer(kit, ex + 0.2, zc + 1.1, 0.5, band);
    kit.box(n * (cw + gap), 0.08, 0.5, '#8a8490', x0 + ((n - 1) * (cw + gap)) / 2, 0.04, zc, { r: 0, jitter: 0 });
  }
  const im = instances(containerUnit(band), at, undefined, jit(rng(o.seed + 2), 0.04));
  g.add(im);
  const lk = new Kit(rng(1));
  lk.box(0.1, 0.1, 0.04, '#ffffff', 0, 0, 0, { r: 0 });
  lk.box(0.1, 0.1, 0.04, '#ffffff', 0.2, 0, 0, { r: 0 });
  const ledMesh = instances(lk, leds, ledGreen);
  ledMesh.castShadow = false;
  g.add(ledMesh);
  // the HV end: a transformer, a gantry and the line out; the control house; lights; a fence
  const fz = D / 2 - 4.6;
  transformer(kit, W / 2 - 6.5, fz, 1.0, band);
  gantry(kit, W / 2 - 6.5, fz - 3.4, 4.4, 7);
  const ins = insulatorUnit();
  const insAt: THREE.Matrix4[] = [];
  for (let i = 0; i < 3; i++) insAt.push(xf(W / 2 - 12 + i * 1.4, 0, fz - 0.4, 0, 0, 1.6));
  g.add(instances(ins, insAt));
  kit.box(7, 3.0, 3.6, P.wall, -W / 2 + 5.4, 0, fz + 0.4, { r: 0.12 });
  kit.box(7.1, 0.3, 3.7, band, -W / 2 + 5.4, 2.7, fz + 0.4, { r: 0.04, shade: 0 });
  kit.box(7.3, 0.2, 3.9, P.roof, -W / 2 + 5.4, 3.0, fz + 0.4, { r: 0.04, shade: 0 });
  for (let i = 0; i < 3; i++) kit.box(1.1, 0.9, 0.06, P.glassD, -W / 2 + 3.2 + i * 1.8, 1.4, fz + 2.21, { r: 0.02, shade: 0 });
  windows(g, [0, 1, 2].map((i): [number, number, number, number, number] => [-W / 2 + 3.2 + i * 1.8, 1.85, fz + 2.26, 1.0, 0.8]));
  placard(g, 'GRID STORAGE', 4.2, -W / 2 + 5.4, 2.3, fz + 2.26, '#fbf7f0', null);
  beacon(g, W / 2 - 6.5, 7.6, fz - 3.4, 0.6);
  floodMast(g, kit, -W / 2 + 1.2, -D / 2 + 1.2, 9, Math.PI * 0.25);
  floodMast(g, kit, W / 2 - 1.2, -D / 2 + 1.2, 9, -Math.PI * 0.25);
  lightPool(g, -W / 2 + 5.4, 0, fz + 3.6, 3.5, warmPool);
  fenceMesh(g, W - 0.8, D - 0.8, 6);
  const fk = new Kit(rng(3));
  for (const [x0, z0, x1, z1] of [[-W / 2 + 0.4, -D / 2 + 0.4, W / 2 - 0.4, -D / 2 + 0.4], [-W / 2 + 0.4, -D / 2 + 0.4, -W / 2 + 0.4, D / 2 - 0.4], [W / 2 - 0.4, -D / 2 + 0.4, W / 2 - 0.4, D / 2 - 0.4], [-W / 2 + 0.4, D / 2 - 0.4, -3, D / 2 - 0.4], [3, D / 2 - 0.4, W / 2 - 0.4, D / 2 - 0.4]] as [number, number, number, number][]) {
    const len = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= m; i++) fk.box(0.1, 1.3, 0.1, '#8a8490', x0 + ((x1 - x0) * i) / m, 0, z0 + ((z1 - z0) * i) / m, { r: 0, jitter: 0 });
  }
  g.add(fk.build());
  standing(g, x0 + 2, -D / 2 + 5.6, 1.2, o.seed + 5);
  vehicle(g, 'van', -W / 2 + 6, D / 2 - 1.6, 0);
  g.add(kit.build());
  const gm = ground.build();
  gm.castShadow = false;
  g.add(gm);
  return { obj: g, w: W, d: D, h: 8, ground: () => null };
}
