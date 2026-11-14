/**
 * Pumped-storage hydro: a battery the size of a lake. The piece raises its own mountain (through
 * `ground`) with a hanging valley at the top, plugged by a concrete dam over the upper reservoir;
 * penstocks and an inclined railway run down the face to a powerhouse on the lower lake. Pumps
 * push water uphill when power is cheap and it falls back through the turbines when it isn't.
 * The same scheme, part built, is the hydro build-out site (megaBuild).
 */
import * as THREE from 'three';
import { col, fbm, Kit, lightPool, noise, rng, smooth, withClouds, withGrain } from '../../../kit';
import { BACKDROPS, type Backdrop } from '../../ground';
import type { Piece } from '../../../pieces';
import { treeField, type TreeKind } from '../../trees';
import type { Act3SetOpts } from '../../act3sets';
import {
  Anim, beacon, builderBoard, cabin, CHARTER, fieldOf, flag, gantry, hoarding, lakeMat, lampHead, laydown, latticeTower, P, placard,
  plantMat, ribbon, sagWires, standing, towerCrane, transformer, V, vehicle, warmPool, windows, workCrane, workPool,
} from './common';

type Win = [number, number, number, number, number, number?][];

/**
 * The scheme is designed on a 62 × 52 footprint, with BACK more behind it for the massif to come down to the land at
 * a mountain's slope (on 52 alone its back was a wall), and scaled to fit others. Z0..Z1 = its depth, back to front.
 */
const NW = 62, ND = 52, BACK = 12;
const Z0 = -ND / 2 - BACK, Z1 = ND / 2;
/** How far inside the footprint's edge a point is. */
const inside = (x: number, z: number) => Math.min(NW / 2 - Math.abs(x), z - Z0, Z1 - z);
const TOP = 21, CREST = 19.8, FLOOR = 15.4, UPPER = 18.6, LOWER = -0.6, DAM_Z = -6.2, TOE = 10.6;

interface Shape { bx: number; lx: number; px: number; peaks: [number, number, number][]; seed: number }
function shapeOf(v: number, seed: number): Shape {
  const bx = [0, -5, 3][v];
  return {
    bx, lx: bx * 0.4 + 1.5, px: bx + 12.5, seed: 40 + v * 7 + (seed % 5),
    peaks: [[bx - 11, -15.5, [8, 5, 10][v]], [bx + 11, -16, [6, 10, 7][v]], [bx - 1, -20, [4, 6, 3][v]]],
  };
}

/** The ground in the scheme's own (62 × 52) coordinates. */
function heightOf(sh: Shape) {
  const { bx, lx, px } = sh;
  return (x: number, z: number) => {
    const edge = smooth(0, 5, inside(x, z));
    // the massif: a plateau with falling flanks, rugged up high, three summits on the rim
    // (the back falls over half as far again as the flanks: a long ridge running away behind the reservoir)
    const dxo = Math.max(0, Math.abs(x - bx) - 15), dzb = Math.max(0, -18 - z), dzf = Math.max(0, z + 6.5);
    const d = Math.hypot(dxo, dzb * 0.7, dzf * 1.08);
    const base = TOP * (1 - smooth(0, 13, d));
    let h = base + (fbm(x * 0.09, z * 0.09, sh.seed, 3) - 0.35) * 5 * smooth(3, 16, base);
    for (const [px2, pz, ph] of sh.peaks) h += ph * Math.exp(-((x - px2) ** 2 + (z - pz) ** 2) / 34) * smooth(8, 18, base);
    // the hanging valley (upper reservoir basin)
    const q = Math.hypot((x - bx) / 10.5, (z + 12.5) / 5.5);
    h = FLOOR + (h - FLOOR) * smooth(0.72, 1.0, q);
    // the valley mouth: a gully from the dam down the face
    if (z > -10) {
      const wall = smooth(5.2, 8.6, Math.abs(x - bx)) + (1 - smooth(-10, -8.6, z));
      // behind the dam the notch sits at the reservoir floor; below it a flat apron at the dam's toe, then the gully falls to the lake
      const gully = z < DAM_Z ? FLOOR : Math.max(-3, TOE - Math.max(0, z - DAM_Z - 7) * 1.62) + (fbm(x * 0.3, z * 0.3, sh.seed + 3, 2) - 0.5) * 0.5 * smooth(DAM_Z + 6, DAM_Z + 9, z);
      h = h + (Math.min(h, gully) - h) * (1 - Math.min(1, wall));
    }
    // a terrace for the powerhouse and its switchyard, cut into the foot of the face
    const tdx = Math.max(0, Math.abs(x - (px + 3)) - 10), tdz = Math.max(0, Math.abs(z - 4.6) - 3.2);
    h *= smooth(0, 2.6, Math.hypot(tdx, tdz));
    // the lower reservoir
    const q2 = Math.hypot((x - lx) / 21, (z - 15) / 7.5);
    if (q2 < 1) h = -2.8 + (Math.min(h, 0) + 2.8) * smooth(0.66, 1.0, q2) + Math.max(0, h) * smooth(0.66, 1, q2);
    if (h <= 0) return h * edge;
    // the foot of the massif wanders in and out (the footprint's straight edge showed as a ruled line under a sheer
    // wall, from behind above all)
    const foot = inside(x, z) - 4.2 * fbm(x * 0.13 + 9, z * 0.13, sh.seed + 11, 2);
    return h * smooth(0, 5.5, foot);
  };
}

/**
 * Sinking the real ground under the piece's own mountain: a little at the foot (to zero at the edges), a lot under
 * the heights. The land's grid is coarser than the skin (up to 3 units far from the middle of a big site), and on
 * the steep back wall its straight facets cut out through the skin as a jagged band of bare cliff.
 */
const dipAt = (h: number) => 0.6 * smooth(0.05, 1.2, Math.abs(h)) + Math.max(0, h - 1.2) * 0.55;

const terrainMat = withGrain(withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
/**
 * The mountain's own skin (the real ground sits just under it): meadow at the foot, forest on the
 * lower flanks, alpine meadow, bare rock on the steep faces and the summits, snow on the peaks.
 */
function mountainMesh(h: (x: number, z: number) => number, backdrop: string | undefined, seed: number, sh: Shape, wet: boolean) {
  const bd = (backdrop ?? 'mountain') as Backdrop;
  const ground = BACKDROPS[bd]?.ground ?? BACKDROPS.mountain.ground;
  const green = bd === 'mountain' || bd === 'boreal' || bd === 'temperate' || bd === 'coast' || bd === 'tropical';
  const dry = bd === 'desert';
  const pal = {
    low: col(ground[0]), forest: col(green ? '#4f6b3a' : dry ? '#c9925a' : '#a59a54'), meadow: col(green ? '#879a50' : dry ? '#c08850' : '#b0a462'),
    rock: col(dry ? '#b5623c' : bd === 'plains' || bd === 'savanna' ? '#a08d84' : '#8a7a72'), rockD: col(dry ? '#8c4a3a' : '#6e605c'),
    mud: col('#5a5a46'), scree: col('#b3a596'), snow: col('#eef3f8'),
  };
  const snowy = !dry && bd !== 'tropical' && bd !== 'savanna';
  const step = 0.75, inset = 0.6;
  const xs: number[] = [], zs: number[] = [];
  for (let x = -NW / 2 + inset; x <= NW / 2 - inset + 0.01; x += step) xs.push(x);
  for (let z = Z0 + inset; z <= Z1 - inset + 0.01; z += step) zs.push(z);
  const pos = new Float32Array(xs.length * zs.length * 3), cols = new Float32Array(xs.length * zs.length * 3);
  const c = new THREE.Color();
  let i = 0;
  for (const z of zs)
    for (const x of xs) {
      const y = h(x, z);
      const slope = Math.hypot(h(x + 0.6, z) - h(x - 0.6, z), h(x, z + 0.6) - h(x, z - 0.6)) / 1.2;
      const n = noise(x * 0.35, z * 0.35, seed) - 0.5, n2 = noise(x * 0.09, z * 0.09, seed + 5);
      c.copy(pal.low);
      c.lerp(pal.forest, smooth(1.2, 3.5, y) * (1 - smooth(11, 14, y + n * 3)));
      c.lerp(pal.meadow, smooth(11, 14, y + n * 3) * (1 - smooth(16, 19, y)));
      c.lerp(n2 > 0.5 ? pal.rock : pal.rockD, Math.max(smooth(3.0, 3.8, slope + n * 0.5), smooth(17, 20.5, y + n * 3)));
      if (y > TOE - 1 && y < FLOOR + 0.5 && slope < 0.6) c.lerp(pal.scree, 0.6);
      if (y < LOWER - 0.2) c.lerp(pal.mud, smooth(LOWER - 0.2, LOWER - 1.2, y));
      // a shingle shore round the lower lake, and the stream's stony bed down the gully
      const shore = Math.hypot((x - sh.lx) / 21, (z - 15) / 7.5);
      if (shore > 0.9 && shore < 1.16 && y < 1.2) c.lerp(pal.scree, 0.7 * (1 - Math.abs(shore - 1.03) / 0.13) * (0.7 + n * 0.6));
      if (wet && z > DAM_Z + 3 && z < 9.6) c.lerp(n2 > 0.5 ? pal.scree : pal.rock, 0.85 * (1 - smooth(1.0, 2.5, Math.abs(x - creekX(sh, z)) + n * 0.6)));
      if (snowy) c.lerp(pal.snow, smooth(23, 25.5, y + n * 3) * (1 - smooth(1.8, 2.6, slope) * 0.5));
      c.multiplyScalar(0.94 + n * 0.12);
      // round the foot the skin dives under the real ground, so the seam follows the contour
      pos.set([x, y - 0.35 * (1 - smooth(0.25, 0.9, Math.abs(y))), z], i * 3);
      cols.set([c.r, c.g, c.b], i * 3);
      i++;
    }
  const idx: number[] = [];
  for (let j = 0; j + 1 < zs.length; j++)
    for (let q = 0; q + 1 < xs.length; q++) {
      const a = j * xs.length + q, b = a + 1, c2 = a + xs.length, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, terrainMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
/** Where the stream runs, down the gully from the dam's toe. */
const creekX = (sh: Shape, z: number) => sh.bx + Math.sin(z * 0.7) * 0.9;
/** The dam: horizontal lifts along a gentle arch (bulging upstream), stepped on the downstream face. */
function dam(k: Kit, sh: Shape, top: number, lamps: THREE.Vector3[]) {
  const n = 12, half = 9.6;
  const zAt = (x: number) => DAM_Z - 1.4 * (1 - ((x - sh.bx) / half) ** 2) - 0.4;
  const thick = (y: number) => 1.8 + (CREST - y) * 0.5;
  const y0 = TOE - 0.8;
  // a gravity section (vertical upstream face, sloping downstream face) swept along the arch
  const shape = new THREE.Shape();
  shape.moveTo(0, y0);
  shape.lineTo(thick(y0), y0);
  shape.lineTo(thick(top), top);
  shape.lineTo(0, top);
  shape.closePath();
  const up = V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const xa = sh.bx - half + (i * 2 * half) / n, xb = xa + (2 * half) / n;
    const a = V(xa, 0, zAt(xa)), b = V(xb, 0, zAt(xb));
    const t = b.clone().sub(a);
    const len = t.length();
    t.normalize();
    const nrm = V(-t.z, 0, t.x);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.14, bevelEnabled: false });
    const m = new THREE.Matrix4().makeBasis(nrm, up, t.clone().negate()).setPosition(b.clone().addScaledVector(t, 0.07));
    geo.applyMatrix4(m);
    k.geo(geo, i % 2 ? '#d6cec2' : '#d1c9bc', 0.015, 0.06);
    // lift lines on the downstream face
    for (let y = TOE + 1.2; y < top - 0.5; y += 1.8) {
      const u = thick(y) + 0.03;
      k.beam(a.clone().addScaledVector(nrm, u).setY(y), b.clone().addScaledVector(nrm, u).setY(y), 0.09, '#b3aa9e');
    }
  }
  if (top < CREST - 0.01) return;
  // the crest road, parapets, lamps
  for (let i = 0; i < n; i++) {
    const xa = sh.bx - half + (i * 2 * half) / n, xb = xa + (2 * half) / n;
    const za = zAt(xa), zb = zAt(xb);
    const ry = -Math.atan2(zb - za, xb - xa);
    const cx = (xa + xb) / 2, cz = (za + zb) / 2 + 0.6;
    const len = Math.hypot(xb - xa, zb - za) + 0.12;
    k.box(len, 0.3, 2.6, '#bdb4aa', cx, CREST, cz, { r: 0.04, ry, shade: 0 });
    for (const off of [-1.2, 1.2]) k.box(len, 0.55, 0.18, '#e3ddd3', cx - Math.sin(ry) * off, CREST + 0.3, cz + Math.cos(ry) * off, { r: 0.03, ry, shade: 0 });
    if (i % 3 === 1) {
      k.box(0.1, 2.2, 0.1, P.dark, cx, CREST + 0.3, cz + 1.3, { r: 0 });
      lamps.push(V(cx, CREST + 2.5, cz + 1.3));
    }
  }
}

/** The scheme, finished (`build` undefined) or part built (`build.p`), scaled to the piece's footprint. */
export function hydroScheme(o: Act3SetOpts, build?: { p: number; acc: string; hi: string; label: string; size: number }): Piece {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const people = new THREE.Group();
  root.add(people);
  const anim = new Anim();
  const W = o.w, D = o.d;
  const s = Math.min(W / NW, D / (ND + BACK));
  g.scale.setScalar(s);
  // (the scheme's own origin stands BACK / 2 in front of the footprint's centre)
  const OFF = (BACK / 2) * s;
  g.position.z = OFF;
  people.position.z = OFF;
  const v = (o.vseed ?? 0) % 3;
  const sh = shapeOf(v, o.seed);
  const h = heightOf(sh);
  const p = build ? Math.max(0.1, Math.min(0.97, build.p)) : 1;
  const f = fieldOf(o.backdrop);
  const k = new Kit(rng(o.seed));
  const glow: Win = [];
  const lamps: THREE.Vector3[] = [];
  g.add(mountainMesh(h, o.backdrop, sh.seed, sh, p >= 1));
  const put = (x: number, z: number, ry: number, seed: number, kind?: 'worker' | 'engineer', y?: number) => standing(people, x * s, z * s, ry, seed, kind, (y ?? h(x, z)) * s);
  // the reservoirs
  if (p > 0.75) {
    const up = new THREE.Mesh(new THREE.PlaneGeometry(24.5, 12.6).rotateX(-Math.PI / 2), lakeMat);
    up.position.set(sh.bx, p >= 1 ? UPPER : FLOOR + 1.2, -12.4);
    up.receiveShadow = true;
    g.add(up);
  }
  // (while the scheme is being built the lower basin is a dry excavation: it is flooded when the works are done.
  // At a build site's half scale the land's coarse grid also let the water spread under the yard beside it)
  if (p >= 1) {
    const low = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).scale(21.5, 1, 8), lakeMat);
    low.position.set(sh.lx, LOWER, 15);
    low.receiveShadow = true;
    g.add(low);
  }
  // the dam
  dam(k, sh, p >= 1 ? CREST : TOE + (CREST - TOE) * p, lamps);
  if (p >= 1) {
    // the intake tower and its footbridge
    const ix = sh.bx + 6, iz = -10.4;
    k.cyl(1.3, 1.5, CREST + 1 - FLOOR, '#d8d0c4', ix, FLOOR, iz, 16);
    k.box(3, 2.2, 3, '#e3ddd3', ix, CREST + 1, iz, { r: 0.1 });
    k.box(3.2, 0.3, 3.2, CHARTER.field, ix, CREST + 3, iz, { r: 0.04, shade: 0 });
    k.box(1.0, 0.25, 3.4, '#bdb4aa', ix, CREST + 0.8, iz + 2.6, { r: 0.02 });
    glow.push([ix, CREST + 2.1, iz + 1.53, 1.6, 0.7]);
  }
  // penstocks (and the inclined railway beside them) down the face to the powerhouse
  const top = V(sh.bx + 10.8, 0, -6.4), bot = V(sh.px - 1.4, 0, 2.0);
  const N = 26;
  const along = (t: number, off: number) => {
    const x = top.x + (bot.x - top.x) * t + off, z = top.z + (bot.z - top.z) * t;
    return V(x, h(x, z), z);
  };
  const reach = p >= 1 ? 1 : p;
  for (const off of [-0.8, 0.8]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      if (1 - t > reach + 0.02) continue;
      const q = along(t, off);
      q.y = Math.max(q.y, 0) + 0.9;
      pts.push(q);
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      k.beam(a, b, 1.0, '#59626a');
      if (i % 4 === 0) k.box(1.5, 1.2, 1.0, P.concrete, a.x, a.y - 1.25, a.z, { r: 0.08 });
    }
  }
  // the inclined lift: rails, sleepers, a car going up and down
  const rail: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const q = along(i / N, 3.2);
    q.y = Math.max(q.y, 0) + 0.25;
    rail.push(q);
  }
  if (p >= 1) {
    for (let i = 0; i + 1 < rail.length; i++) {
      for (const o2 of [-0.45, 0.45]) k.beam(rail[i].clone().add(V(o2, 0.1, 0)), rail[i + 1].clone().add(V(o2, 0.1, 0)), 0.1, P.steelD);
      k.box(1.4, 0.12, 0.3, P.timberD, rail[i].x, rail[i].y - 0.05, rail[i].z, { r: 0 });
    }
    const car = new THREE.Group();
    const ck = new Kit(rng(3));
    ck.box(1.4, 1.5, 2.2, '#c23a3f', 0, 0.2, 0, { r: 0.14 });
    ck.box(1.44, 0.5, 2.24, P.glassD, 0, 1.0, 0, { r: 0.05, shade: 0 });
    car.add(ck.build());
    g.add(car);
    anim.add((e) => {
      const u = 0.5 - 0.5 * Math.cos(e.t * 0.05);
      const fi = u * (rail.length - 1), i = Math.min(rail.length - 2, Math.floor(fi));
      car.position.lerpVectors(rail[i], rail[i + 1], fi - i);
      car.rotation.y = Math.atan2(rail[i + 1].x - rail[i].x, rail[i + 1].z - rail[i].z);
    });
    // the valve house at the top
    const vt = along(0, 0);
    k.box(4.4, 2.6, 3.2, '#e3ddd3', vt.x, vt.y - 0.4, vt.z - 1.2, { r: 0.1 });
    k.box(4.5, 0.3, 3.3, CHARTER.field, vt.x, vt.y + 2.0, vt.z - 1.2, { r: 0.04, shade: 0 });
  }
  // the powerhouse at the water's edge, its tailrace churning the lake, the switchyard
  const px = sh.px, pz = 4.6, pw = 13, pd = 6, ph = 6.4;
  const wallTop = p >= 1 ? ph : Math.max(1, ph * p);
  k.box(pw + 0.6, 2.6, pd + 1.2, P.concreteD, px, -2.4, pz + 0.4, { r: 0.08 });
  k.box(pw, wallTop, pd, '#e3ddd3', px, 0.2, pz, { r: 0.14, jitter: 0.02, shade: 0.12 });
  if (p >= 1) {
    k.box(pw + 0.06, 0.6, pd + 0.06, CHARTER.field, px, ph - 0.6, pz, { r: 0.04, shade: 0 });
    k.box(pw + 0.4, 0.35, pd + 0.4, P.roof, px, ph + 0.2, pz, { r: 0.05, shade: 0 });
    for (let i = 0; i < 5; i++) {
      const x = px - pw / 2 + 1.6 + i * 2.45;
      k.box(1.2, 1.9, 0.06, P.glassD, x, 2.8, pz + pd / 2 + 0.02, { r: 0.02, shade: 0 });
      glow.push([x, 3.75, pz + pd / 2 + 0.07, 1.1, 1.8]);
    }
    for (let i = 0; i < 3; i++) k.box(2.0, 1.2, 0.3, '#2f2a3d', px - 4 + i * 4, -0.9, pz + pd / 2 + 0.1, { r: 0.1 });
    placard(g, 'PUMPED STORAGE', 6, px, 5.0, pz + pd / 2 + 0.06, '#fbf7f0', null);
    const foam = new THREE.MeshStandardMaterial({ color: 0xe8f3f0, transparent: true, opacity: 0.6, roughness: 0.9, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.2, 14).rotateX(-Math.PI / 2), foam);
      m.position.set(px - 4 + i * 4, LOWER + 0.05, pz + pd / 2 + 1.6);
      m.renderOrder = 1;
      g.add(m);
      anim.add((e) => { const q = 1 + 0.25 * Math.sin(e.t * 2.4 + i * 2); m.scale.set(q, 1, q * 1.3); });
    }
    const sx = px + 10;
    for (let i = 0; i < 2; i++) transformer(k, sx - 1.6 + i * 3.4, pz - 0.4, 0.8, CHARTER.field);
    gantry(k, sx, pz - 3, 7, 7);
    const tw = latticeTower(k, sx + 4.8, pz + 3, 15, 3, '#8a8490', 0, Math.PI / 2);
    for (const sd of [-1, 1]) {
      sagWires(k, V(sx + sd * 2.3, 6.8, pz - 3), V(sx + 4.8, tw.arms[0][0], pz + 3 + sd * 2.7), 0.4);
      sagWires(k, V(sx + 4.8, tw.arms[0][0], pz + 3 + sd * 2.7), V(NW / 2 + 1, tw.arms[0][0] - 2, pz + 3 + sd * 2.7), 0.3, 0.05, '#3a3442', 3);
    }
    beacon(g, sx + 4.8, 15.4, pz + 3, 0.6);
  }
  // the stream from the stilling basin at the dam's toe down the gully to the lake
  if (p >= 1) {
    const cpts: [number, number][] = [];
    for (let z = DAM_Z + 5.4; z <= 8.4; z += 0.8) cpts.push([creekX(sh, z), z]);
    const creek = new THREE.Mesh(ribbon(cpts, 1.3, h, 0.1), lakeMat);
    creek.receiveShadow = true;
    g.add(creek);
    const cr = rng(o.seed + 90);
    for (let z = DAM_Z + 5.6; z <= 8.8; z += 0.55) {
      // stones on both banks; a streak of white water every so often where the bed steepens
      for (const sd of [-1, 1]) {
        if (cr() < 0.25) continue;
        const x = creekX(sh, z) + sd * (0.95 + cr() * 0.5), rs = 0.22 + cr() * 0.3;
        k.geo(new THREE.IcosahedronGeometry(rs, 0).scale(1, 0.7, 1).rotateY(cr() * 6).translate(x, h(x, z) + rs * 0.25, z), cr() < 0.5 ? '#9a8f88' : '#b3a596', 0.06);
      }
      if (cr() < 0.4) {
        const x = creekX(sh, z);
        k.box(0.7 + cr() * 0.4, 0.05, 0.3, '#e8f3f0', x, h(x, z) + 0.13, z, { r: 0, jitter: 0.02, shade: 0, ry: cr() - 0.5 });
      }
    }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2).rotateX(-Math.PI / 2), lakeMat);
    pool.position.set(sh.bx, TOE + 0.12, DAM_Z + 4.6);
    g.add(pool);
  }
  // the road along the lake to the powerhouse
  const rdz = 24.2;
  const road = ribbon([[-NW / 2, rdz], [NW / 2 - 3, rdz], [NW / 2 - 3, 8.6], [px + 4, 8.2]], 2.8, (x, z) => Math.max(0, h(x, z)), 0.1);
  k.geo(road, f.track, 0.02, 0);
  // trees and rocks on the mountain
  const r = rng(o.seed + 70);
  const conifer = o.backdrop === 'mountain' || o.backdrop === 'boreal' || o.backdrop === 'temperate' || o.backdrop === 'coast';
  const trees: { x: number; y: number; z: number; s: number; ry: number; tint: number }[] = [];
  const rocks: typeof trees = [];
  for (let i = 0; i < 1100; i++) {
    const x = (r() - 0.5) * (NW - 4), z = Z0 + 2 + r() * (Z1 - Z0 - 4);
    const y = h(x, z);
    if (y < 1.2) continue;
    if (Math.abs(x - sh.bx) < 9.5 && z > -10.5 && z < 8) continue;
    if (Math.hypot((x - sh.bx) / 11.5, (z + 12.5) / 6.5) < 1) continue;
    const t = (x - top.x) * (bot.x - top.x) + (z - top.z) * (bot.z - top.z);
    const L2 = (bot.x - top.x) ** 2 + (bot.z - top.z) ** 2;
    const u = Math.max(0, Math.min(1, t / L2));
    if (Math.hypot(x - (top.x + (bot.x - top.x) * u) - 1.2, z - (top.z + (bot.z - top.z) * u)) < 4) continue;
    if (Math.abs(x - (sh.px + 3)) < 11 && Math.abs(z - 4.6) < 4.5) continue;
    if (y < 13.5 && trees.length < 420) trees.push({ x, y: y - 0.1, z, s: (conifer ? 0.85 : 0.6) + r() * 0.5, ry: r() * 6.28, tint: 0.85 + r() * 0.3 });
    else if (y > 12 && rocks.length < 40) rocks.push({ x, y: y - 0.3, z, s: 0.3 + r() * 0.45, ry: r() * 6.28, tint: 0.85 + r() * 0.3 });
  }
  const kind: TreeKind = conifer ? 'pine' : 'shrub';
  g.add(treeField(kind, trees, plantMat));
  if (!conifer) g.add(treeField('tuft', trees.slice(0, 120).map((t2) => ({ ...t2, x: t2.x + 1.3, z: t2.z - 0.8 })), plantMat));
  g.add(treeField('boulder', rocks, plantMat));
  // lamps on the crest, a crew, vehicles
  for (const l of lamps) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), lampHead);
    m.position.copy(l);
    g.add(m);
    lightPool(g, l.x, CREST + 0.15, l.z - 0.6, 2.6, warmPool);
  }
  if (p >= 1) {
    put(sh.bx - 2, DAM_Z + 0.2, 0.4, o.seed + 1, 'engineer', CREST + 0.3);
    put(px - 3, pz + pd / 2 + 1.0, 0.3, o.seed + 2, 'worker', 0);
    vehicle(g, 'pickup', px + 2, pz + pd / 2 + 1.3, 0.15);
  }
  if (build) {
    // the builder's works: cranes at the dam and the powerhouse, cabins, laydown, a board, flags
    const c1 = towerCrane(18, 18, build.acc, build.hi, o.seed + 5);
    c1.position.set(sh.bx - 11.5, h(sh.bx - 11.5, -8.5), -8.5);
    g.add(c1);
    const c2 = towerCrane(14, 16, build.acc, build.hi, o.seed + 6);
    c2.position.set(px + 8, 0, pz - 1);
    g.add(c2);
    anim.add((e) => { workCrane(c1, e, 0.6, 0.9, 8); workCrane(c2, e, 2.4, 1.1, 6); });
    for (let y = TOE + (CREST - TOE) * p; y < TOE + (CREST - TOE) * p + 2; y += 1) {
      k.box(20, 0.08, 0.08, '#c9a35a', sh.bx, y + 0.5, DAM_Z - 0.6, { r: 0 });
    }
    const top2 = TOE + (CREST - TOE) * p;
    for (let x = sh.bx - 9; x <= sh.bx + 9; x += 2.2) k.box(0.1, 2.2, 0.1, '#9d95a6', x, top2, DAM_Z + 1.2, { r: 0 });
    if (wallTop < ph) for (let x = px - pw / 2; x <= px + pw / 2 + 0.01; x += pw / 5) k.box(0.1, wallTop + 2, 0.1, '#9d95a6', x, 0, pz + pd / 2 + 0.6, { r: 0 });
    laydown(k, sh.bx + 14, -5, 6, 3.6, o.seed + 7, ['pipe', 'rebar', 'pipe']);
    laydown(k, px + 9, pz, 7, 4, o.seed + 8, ['rebar', 'crate', 'pipe']);
    cabin(k, glow, -NW / 2 + 6, rdz - 3, 6, 2.6, P.cream, build.acc);
    cabin(k, glow, -NW / 2 + 6, rdz - 3, 6, 2.6, P.cream, build.acc, 2.95);
    hoarding(k, -NW / 2 + 1, -NW / 2 + 16, rdz + 1.6, build.acc, build.hi);
    const bd = builderBoard(`${build.label} ${['', 'S', 'M', 'L'][build.size] ?? ''}`.trim(), 5.4, build.acc, build.hi);
    bd.position.set(-NW / 2 + 13.5, 3.2, rdz - 1.2);
    for (const sx of [-2.2, 2.2]) k.box(0.2, 3.2, 0.2, P.steelD, -NW / 2 + 13.5 + sx, 0, rdz - 1.3, { r: 0 });
    g.add(bd);
    flag(g, anim, -NW / 2 + 17.5, rdz - 1.4, 5, { a: build.acc, b: build.hi }, o.seed + 1, 0, 1.8);
    flag(g, anim, px - 7.5, pz + 4.5, 5, { a: build.acc, b: build.hi }, o.seed + 2, 0, 1.8);
    put(sh.bx + 1, DAM_Z + 1.6, 0.2, o.seed + 3, 'worker', top2);
    put(px - 2, pz + pd / 2 + 1.3, 2.4, o.seed + 4, 'worker', 0);
    put(-NW / 2 + 9.6, rdz - 1.2, 0.5, o.seed + 9, 'engineer', 0);
    vehicle(g, 'mixer', px + 4, pz + pd / 2 + 1.8, 0.1);
    vehicle(g, 'flatbed', -NW / 2 + 22, rdz, Math.PI);
    lightPool(g, px, 0, pz + pd / 2 + 2, 6, workPool);
  }
  g.add(k.build());
  windows(g, glow);
  return {
    obj: root, w: W, d: D, h: (CREST + 12) * s, update: anim.update,
    ground: (x, z) => {
      if (Math.abs(x) > W / 2 || Math.abs(z) > D / 2) return null;
      const y = h(x / s, (z - OFF) / s);
      return (y - dipAt(y)) * s;
    },
  };
}

/** A pumped-hydro scheme (see hydroScheme); `variant: 'build'` = under construction at progress `p`, in the builder's colours. */
export const pumpedHydro = (o: Act3SetOpts) => hydroScheme(o, o.variant === 'build' ? { p: o.p ?? 0.5, acc: o.accent || P.orange, hi: o.hi || P.yellow, label: o.label, size: o.n ?? 1 } : undefined);
