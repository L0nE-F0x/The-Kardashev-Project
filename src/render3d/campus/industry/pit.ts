/**
 * The open-pit mine: a real terraced hole dug into the ground (the piece's `ground()` lowers the
 * land, its own bench mesh paints the rock), oval benches stepping down to the floor, a two-lane
 * haul road spiralling down the wide side, haul trucks shuttling between the shovel on the floor
 * and the tipping pad by the rim, a drill on a bench, light towers.
 *
 * The benches are nested ovals: contour s (0 = the rim, N = deep in the floor) has its centre and
 * radii slid linearly from the rim's to the floor's, so each bench is narrow on the back-left (steep,
 * the rock faces turned to the camera) and wide on the front and right, where the road runs.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, mix, noise, paintMat, poolMat, rng, type Paint } from '../../kit';
import { Plume } from '../../fx';
import type { Env } from '../../pieces';
import type { SetPieceFactory } from '../registry';
import { beacon, Lit, MINE_YELLOW, V, wheel } from './common';

export interface Rock { faces: Paint[]; tread: Paint; floor: Paint; berm: Paint; road: Paint; ore: Paint; stain?: Paint }
export const ROCKS: Record<string, Rock> = {
  red: { faces: ['#9c4f34', '#c27a4a', '#8c4a3a', '#b5623c', '#6f3a2e', '#a85a3c', '#d08a58'], tread: '#b77a52', floor: '#8f5a40', berm: '#b5744a', road: '#cf9f72', ore: '#9c4f34' },
  copper: { faces: ['#6f7468', '#8a8a78', '#5e6b5a', '#93907c', '#545c50', '#7d8070', '#a09a84'], tread: '#9c9886', floor: '#6c6c60', berm: '#9a9480', road: '#b8b19a', ore: '#5f7a62', stain: '#3f8f78' },
  lithium: { faces: ['#b8aea4', '#d4c4b8', '#a39a91', '#c9bfb2', '#c4a29c', '#968c84', '#ddd0c6'], tread: '#cfc6bb', floor: '#a8a097', berm: '#c6baaa', road: '#ded3c5', ore: '#e3d3cb' },
};

// ── the pit's shape ──────────────────────────────────────────────────────────────────────────
const N = 3;
const HB = 5.6;
const RUN = 2.0;
const C0 = { x: 0.5, z: -0.3, a: 29.5, b: 20.6 };
const CN = { x: -8.5, z: -7.5, a: 10, b: 7 };
const LW = 7.0;

const wob = (th: number) => 1 + 0.028 * Math.sin(3 * th + 1.1) + 0.018 * Math.sin(5 * th + 2.3) + 0.01 * Math.sin(9 * th + 0.4);
function cont(s: number) {
  const t = s / N;
  return { x: C0.x + (CN.x - C0.x) * t, z: C0.z + (CN.z - C0.z) * t, a: C0.a + (CN.a - C0.a) * t, b: C0.b + (CN.b - C0.b) * t };
}
/** A point on contour s at parameter angle th. */
function P(s: number, th: number): [number, number] {
  const c = cont(s), w = wob(th);
  return [c.x + w * c.a * Math.cos(th), c.z + w * c.b * Math.sin(th)];
}
/** World distance per unit of s along the radial line at th (constant in s). */
function sp(th: number) {
  const w = wob(th);
  return Math.hypot((CN.x - C0.x) / N + (w * (CN.a - C0.a) * Math.cos(th)) / N, (CN.z - C0.z) / N + (w * (CN.b - C0.b) * Math.sin(th)) / N);
}
const fOf = (th: number) => Math.min(0.6, RUN / sp(th));
/** The bench surface (no ramp, no berm). */
function B(s: number, th: number) {
  if (s <= 0) return 0;
  if (s >= N) return -HB * N;
  const k = Math.floor(s), u = s - k, f = fOf(th);
  return u < f ? -HB * (k + u / f) : -HB * (k + 1);
}
/** Which contour a point lies on (binary search; contours shrink as s grows). */
function sOf(x: number, z: number): { s: number; th: number } | null {
  const gAt = (s: number) => {
    const c = cont(s);
    const dx = (x - c.x) / c.a, dz = (z - c.z) / c.b;
    const th = Math.atan2(dz, dx);
    return { g: Math.hypot(dx, dz) / wob(th) - 1, th };
  };
  let lo = -0.9, hi = 4.2;
  const glo = gAt(lo);
  if (glo.g > 0) return null;
  const ghi = gAt(hi);
  if (ghi.g < 0) return { s: hi, th: ghi.th };
  let th = 0;
  for (let i = 0; i < 26; i++) {
    const m = (lo + hi) / 2, r = gAt(m);
    th = r.th;
    if (r.g < 0) lo = m; else hi = m;
  }
  return { s: (lo + hi) / 2, th };
}

// ── the ramp ─────────────────────────────────────────────────────────────────────────────────
const TH_S = 0.75 * Math.PI;
const TH_E = -0.3 * Math.PI;
const LEAD = 0.075 * Math.PI;
const LAND = 0.07 * Math.PI;
const RAMP = (TH_S - TH_E - (N - 1) * LAND) / N;
const ease = (t: number) => t * 0.6 + t * t * (3 - 2 * t) * 0.4;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** The haul road at angle th: its level and the contour where its outer (cut) edge runs. */
function laneAt(th: number): { y: number; sc: number } {
  if (th > TH_S) {
    // the lead-in along the rim: level, swinging in from outside the pit
    const t = smooth(Math.min(1, (TH_S + LEAD - th) / LEAD));
    return { y: 0, sc: ((t - 1) * (LW + 1)) / sp(th) };
  }
  let u = TH_S - th;
  for (let j = 0; j < N; j++) {
    if (u < RAMP) { const e = ease(u / RAMP); return { y: -HB * (j + e), sc: j + fOf(th) * e }; }
    u -= RAMP;
    if (j < N - 1) {
      if (u < LAND) return { y: -HB * (j + 1), sc: j + fOf(th) + (1 - fOf(th)) * smooth(u / LAND) };
      u -= LAND;
    }
  }
  return { y: -HB * N, sc: N - 1 + fOf(th) };
}
/** A point on one of the road's lanes (0 = outer, by the cut; 1 = inner, by the windrow). */
function lanePoint(th: number, lane: 0 | 1): THREE.Vector3 {
  const { y, sc } = laneAt(th);
  const [x, z] = P(sc + (lane ? 4.45 : 1.55) / sp(th), th);
  return new THREE.Vector3(x, y + 0.08, z);
}

// ── mesh helpers ─────────────────────────────────────────────────────────────────────────────
class Sheet {
  pos: number[] = [];
  colr: number[] = [];
  idx: number[] = [];
  v(x: number, y: number, z: number, c: THREE.Color) { this.pos.push(x, y, z); this.colr.push(c.r, c.g, c.b); return this.pos.length / 3 - 1; }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, b, d, c); }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  build(flipIfDown = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    if (flipIfDown) {
      // make the sheet face up
      const n = g.attributes.normal;
      let up = 0;
      for (let i = 0; i < n.count; i += 7) up += n.getY(i);
      if (up < 0) {
        for (let i = 0; i < this.idx.length; i += 3) { const t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t; }
        g.setIndex(this.idx);
        g.computeVertexNormals();
      }
    }
    const m = new THREE.Mesh(g, paintMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

const jit = (c: Paint, n: number, k = 0.12) => col(c).clone().multiplyScalar(1 + (n - 0.5) * k);

/** The benches: a ring grid round the pit (hard edges at crests and toes), the floor as a fan. */
function benchMesh(rock: Rock, seed: number) {
  const J = 200;
  const sh = new Sheet();
  const bermK = (th: number) => {
    // no berm where the road comes in
    const d = Math.abs(Math.atan2(Math.sin(th - (TH_S + LEAD * 0.55)), Math.cos(th - (TH_S + LEAD * 0.55))));
    return Math.min(1, Math.max(0, (d - LEAD * 0.75) / 0.12));
  };
  const faceCol = (y: number, th: number, n: number) => {
    const fy = -y + (noise(th * 5, y * 0.4, seed) - 0.5) * 1.4;
    const nf = rock.faces.length;
    const c = jit(rock.faces[((Math.floor(fy / 1.4) % nf) + nf) % nf], n, 0.2);
    // darker towards each toe, streaks down the face
    const toe = ((-y % HB) + HB) % HB / HB;
    c.multiplyScalar(1 - 0.16 * toe * toe - (noise(th * 26, 1, seed + 4) - 0.5) * 0.14);
    if (rock.stain && noise(th * 9, y * 0.6, seed + 3) > 0.72) c.lerp(col(rock.stain), 0.45);
    return c;
  };
  type Ring = { s: (th: number) => number; y: (th: number) => number; c: (th: number, y: number, n: number) => THREE.Color };
  const rings: Ring[] = [];
  const treadC = (th: number, _y: number, n: number) => jit(mix(rock.tread, rock.berm, 0.2 + noise(th * 3, 4, seed) * 0.3), n, 0.1);
  const bermC = (_th: number, _y: number, n: number) => jit(rock.berm, n, 0.1);
  rings.push({ s: (th) => -3.3 / sp(th), y: () => -0.08, c: bermC });
  rings.push({ s: (th) => -2.4 / sp(th), y: (th) => 0.06 + 0.8 * bermK(th), c: bermC });
  rings.push({ s: (th) => -1.6 / sp(th), y: (th) => 0.06 + 0.8 * bermK(th), c: bermC });
  rings.push({ s: (th) => -0.6 / sp(th), y: () => 0.04, c: treadC });
  for (let k = 0; k < N; k++) {
    const rough = (th: number, a: number) => (noise(th * 7 + k * 3, a, seed + 9) - 0.5) * 0.55;
    rings.push({ s: () => k, y: () => -HB * k, c: treadC });
    rings.push({ s: () => k, y: () => -HB * k, c: faceCol });
    rings.push({ s: (th) => k + 0.12 * fOf(th), y: () => -HB * (k + 0.06), c: faceCol });
    const crag = (th: number, a: number) => ((noise(th * 24 + k * 5, a, seed + 11) - 0.5) * 0.7 + (noise(th * 61, a + k, seed + 12) - 0.5) * 0.35) / sp(th);
    rings.push({ s: (th) => k + 0.4 * fOf(th) + crag(th, 1), y: (th) => -HB * (k + 0.4) + rough(th, 1), c: faceCol });
    rings.push({ s: (th) => k + 0.72 * fOf(th) + crag(th, 2), y: (th) => -HB * (k + 0.74) + rough(th, 2), c: faceCol });
    rings.push({ s: (th) => k + fOf(th), y: () => -HB * (k + 1), c: faceCol });
    const lastC = k === N - 1 ? (th: number, _y: number, n: number) => jit(mix(rock.floor, rock.tread, noise(th * 4, 9, seed) * 0.4), n, 0.1) : treadC;
    rings.push({ s: (th) => k + fOf(th), y: () => -HB * (k + 1), c: lastC });
    if (k < N - 1) rings.push({ s: (th) => k + fOf(th) + (1 - fOf(th)) * 0.5, y: () => -HB * (k + 1), c: treadC });
  }
  const R = rings.length;
  const ids: number[][] = [];
  let cx = 0, cz = 0;
  for (let j = 0; j < J; j++) {
    const th = (j / J) * Math.PI * 2 - Math.PI;
    const col: number[] = [];
    for (let i = 0; i < R; i++) {
      const rg = rings[i];
      const [x, z] = P(rg.s(th), th);
      const y = rg.y(th);
      col.push(sh.v(x, y, z, rg.c(th, y, noise(j * 0.7, i * 1.3, seed + 1))));
      if (i === R - 1) { cx += x; cz += z; }
    }
    ids.push(col);
  }
  for (let j = 0; j < J; j++) {
    const a = ids[j], b = ids[(j + 1) % J];
    for (let i = 0; i + 1 < R; i++) sh.quad(a[i], b[i], a[i + 1], b[i + 1]);
  }
  const ctr = sh.v(cx / J, -HB * N, cz / J, col(rock.floor));
  for (let j = 0; j < J; j++) sh.tri(ids[j][R - 1], ids[(j + 1) % J][R - 1], ctr);
  return sh.build();
}

/** The haul road: a level road surface with a windrow on its open side and the fill below it. */
function rampMesh(rock: Rock, seed: number) {
  const sh = new Sheet();
  const steps = 260;
  const th0 = TH_S + LEAD, th1 = TH_E - 0.04;
  const rows: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const th = th0 + (th1 - th0) * (i / steps);
    const { y, sc } = laneAt(th);
    const q = sp(th);
    const n = noise(i * 0.3, 2, seed);
    const road = jit(rock.road, n, 0.08), wr = jit(mix(rock.road, rock.faces[0], 0.45), n, 0.1), fill = jit(mix(rock.berm, rock.faces[1], 0.35), n, 0.14);
    const sIn = sc + LW / q;
    const below = Math.min(B(sIn, th), y);
    const hFill = y - below;
    const sBot = sIn + (0.5 * hFill + 0.3) / q;
    const pts: [number, number, THREE.Color][] = [
      [sc - 0.7 / q, y + 0.07, road],
      [sc + (LW - 1.1) / q, y + 0.07, road],
      [sc + (LW - 1.1) / q, y + 0.07, wr],
      [sc + (LW - 0.55) / q, y + 0.62, wr],
      [sIn, y + 0.07, wr],
      [sIn, y + 0.07, fill],
      [sBot, Math.min(B(sBot, th), y) - 0.35, fill],
    ];
    rows.push(pts.map(([s, yy, c]) => { const [x, z] = P(s, th); return sh.v(x, yy, z, c); }));
  }
  for (let i = 0; i < steps; i++) {
    const a = rows[i], b = rows[i + 1];
    for (let k = 0; k + 1 < a.length; k++) sh.quad(a[k], b[k], a[k + 1], b[k + 1]);
  }
  return sh.build();
}

// ── machines ─────────────────────────────────────────────────────────────────────────────────
/** Headlights for a set of trucks (they light up at night). */
export function truckLights() {
  const m = glowMat('#fff2c8', 0.05);
  m.userData.nightOnly = 3;
  return m;
}

/** A big mining haul truck (forward = +z), about 6.4 long. The bed tips about its rear hinge. */
export function haulTruck(rock: Rock, seed: number, lights?: THREE.Material) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const k = new Kit(rng(seed));
  const Y: Paint = MINE_YELLOW, dk: Paint = '#3a3442';
  k.box(1.5, 0.7, 5.8, dk, 0, 0.75, -0.1, { r: 0.08 });
  for (const sx of [-1.18, 1.18]) {
    wheel(k, sx, 0.95, 2.05, 0.95, 0.78, '#2a2630', '#8a8490', 14);
    wheel(k, sx, 0.95, -1.75, 0.95, 0.95, '#2a2630', '#8a8490', 14);
  }
  // the front: radiator, upper deck, the cab on the left, a ladder up
  k.box(1.7, 1.5, 1.1, Y, 0, 0.9, 2.55, { r: 0.12 });
  k.box(1.3, 1.0, 0.1, '#433c52', 0, 1.1, 3.12, { r: 0.02 });
  k.box(3.3, 0.22, 1.8, Y, 0, 2.3, 2.4, { r: 0.05 });
  k.box(1.25, 1.25, 1.35, Y, -0.95, 2.5, 2.35, { r: 0.12 });
  k.box(1.1, 0.6, 0.08, '#34506b', -0.95, 3.0, 3.03, { r: 0.02, jitter: 0 });
  k.box(0.08, 0.6, 1.0, '#34506b', -1.58, 3.0, 2.35, { r: 0.02, jitter: 0 });
  k.box(3.3, 0.06, 0.06, '#e6e0e3', 0, 2.95, 3.28, { r: 0, jitter: 0 }); // deck rail
  k.beam(V(-1.55, 0.35, 3.3), V(-0.9, 2.3, 3.2), 0.12, '#5b5562');
  g.add(k.build());
  const hk = new Kit();
  for (const sx of [-0.55, 0.55]) hk.box(0.5, 0.25, 0.1, '#ffffff', sx, 1.6, 3.12, { r: 0, jitter: 0, shade: 0 });
  const hm = hk.build(lights ?? truckLights());
  hm.castShadow = false;
  g.add(hm);
  // the dump body: floor, sides, a sloped tail, the canopy over the cab
  const bed = new THREE.Group();
  bed.position.set(0, 1.55, -2.9);
  const bk = new Kit(rng(seed + 1));
  bk.box(3.2, 0.25, 4.7, Y, 0, 0, 2.35, { r: 0.06 });
  for (const sx of [-1.55, 1.55]) bk.box(0.18, 1.45, 4.7, Y, sx, 0.15, 2.35, { r: 0.05 });
  bk.box(3.2, 1.9, 0.2, Y, 0, 0.15, 4.62, { r: 0.05 });
  bk.box(3.4, 0.16, 1.9, Y, 0, 2.0, 5.4, { r: 0.04 });
  bk.box(3.2, 0.12, 0.12, '#c99a3a', 0, 1.55, 0.06, { r: 0, jitter: 0 });
  for (const sx of [-1.66, 1.66]) for (let z = 0.6; z < 4.6; z += 1.2) bk.box(0.06, 1.3, 0.12, '#d99f30', sx, 0.2, z, { r: 0, jitter: 0 });
  bed.add(bk.build());
  const lk = new Kit(rng(seed + 2));
  lk.geo(new THREE.IcosahedronGeometry(1.5, 1).scale(1.0, 0.45, 1.55).translate(0, 0.75, 2.4), rock.ore, 0.12);
  const load = lk.build();
  bed.add(load);
  g.add(bed);
  return { obj: g, bed, load };
}

/** A hydraulic front shovel on crawlers (faces +z). */
function shovel(seed: number) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const Y: Paint = MINE_YELLOW, dk: Paint = '#3a3442';
  for (const sx of [-1.6, 1.6]) {
    k.box(1.15, 1.0, 5.2, dk, sx, 0, 0, { r: 0.25 });
    for (let z = -2.3; z <= 2.3; z += 0.5) k.box(1.2, 0.08, 0.14, '#4e4148', sx, 1.0, z, { r: 0, jitter: 0 });
  }
  k.box(2.2, 0.8, 2.8, '#5b5562', 0, 0.55, 0, { r: 0.1 });
  g.add(k.build());
  const upper = new THREE.Group();
  upper.position.y = 1.35;
  const uk = new Kit(rng(seed + 1));
  uk.box(3.9, 2.1, 4.6, Y, 0, 0, -0.6, { r: 0.18 });
  uk.box(3.95, 1.3, 1.1, '#433c52', 0, 0.2, -3.05, { r: 0.12 });
  for (let y = 0.6; y < 1.9; y += 0.3) uk.box(0.05, 0.12, 2.4, '#c99a3a', 1.97, y, -1.3, { r: 0, jitter: 0 });
  uk.box(1.5, 1.6, 1.6, Y, -1.15, 2.1, 0.8, { r: 0.12 });
  uk.box(1.3, 0.8, 0.08, '#34506b', -1.15, 2.7, 1.62, { r: 0.02, jitter: 0 });
  uk.box(3.9, 0.08, 0.08, '#e6e0e3', 0, 3.0, -2.6, { r: 0, jitter: 0 });
  uk.cyl(0.14, 0.14, 1.1, '#5b5562', 1.2, 2.1, -1.8, 6);
  upper.add(uk.build());
  const boom = new THREE.Group();
  boom.position.set(0.5, 1.6, 1.4);
  const bk = new Kit(rng(seed + 2));
  bk.box(0.9, 0.95, 5.6, Y, 0, -0.45, 2.6, { r: 0.12 });
  bk.cyl(0.14, 0.14, 3.6, '#c3bcc7', 0.55, 0.0, 1.2, 6, { rx: Math.PI / 2 - 0.15 });
  boom.add(bk.build());
  const stick = new THREE.Group();
  stick.position.set(0, 0, 5.3);
  const sk = new Kit(rng(seed + 3));
  sk.box(0.7, 0.75, 3.8, Y, 0, -0.38, 1.8, { r: 0.1 });
  stick.add(sk.build());
  const bucket = new THREE.Group();
  bucket.position.set(0, 0, 3.7);
  const kk = new Kit(rng(seed + 4));
  kk.box(2.5, 1.5, 1.7, '#d99f30', 0, -0.9, 0.6, { r: 0.14 });
  kk.box(2.3, 0.2, 0.06, '#433c52', 0, -0.9, 1.48, { r: 0, jitter: 0 });
  for (let i = 0; i < 5; i++) kk.box(0.18, 0.18, 0.4, '#8a8490', -1.0 + i * 0.5, -0.95, 1.6, { r: 0.03 });
  bucket.add(kk.build());
  stick.add(bucket);
  boom.add(stick);
  upper.add(boom);
  g.add(upper);
  return { obj: g, upper, boom, stick, bucket };
}

/** A blast-hole drill parked on a bench (mast up). */
function drill(k: Kit, x: number, y: number, z: number, ry: number) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx: number, dz: number): [number, number] => [x + dx * c + dz * s, z - dx * s + dz * c];
  for (const sx of [-1.1, 1.1]) { const [px, pz] = at(sx, 0); k.box(0.8, 0.8, 4.2, '#3a3442', px, y, pz, { r: 0.18, ry }); }
  k.box(2.8, 1.6, 3.6, '#e9e1d2', x, y + 0.8, z, { r: 0.14, ry });
  { const [px, pz] = at(-0.7, 1.2); k.box(1.2, 1.2, 1.1, MINE_YELLOW, px, y + 2.4, pz, { r: 0.1, ry }); }
  const [mx, mz] = at(0, 1.9);
  for (const sx of [-0.25, 0.25]) { const [px, pz] = at(sx, 1.9); k.box(0.14, 9.5, 0.14, '#c23a3f', px, y + 1.2, pz, { r: 0, jitter: 0, ry }); }
  for (let yy = 1.8; yy < 10; yy += 0.9) k.box(0.6, 0.07, 0.07, '#c23a3f', mx, y + yy, mz, { r: 0, jitter: 0, ry });
  return [mx, y + 10.8, mz] as const;
}

/** A mobile light tower: a trailer with a mast and four lamps (they glow at night, light pools below). */
function lightTower(g: THREE.Object3D, k: Kit, lamp: Kit, x: number, y: number, z: number, ry: number, pool: THREE.MeshBasicMaterial) {
  k.box(1.4, 1.1, 2.4, '#e9e1d2', x, y + 0.45, z, { r: 0.12, ry });
  k.box(1.5, 0.12, 2.5, '#fbd46e', x, y + 1.05, z, { r: 0.02, ry });
  wheel(k, x, y + 0.42, z, 0.42, 1.7);
  k.box(0.14, 7.6, 0.14, '#9d95a6', x, y + 1.2, z, { r: 0, jitter: 0 });
  k.box(1.9, 0.12, 0.12, '#9d95a6', x, y + 8.6, z, { r: 0, jitter: 0, ry });
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const d of [-0.7, -0.25, 0.25, 0.7]) lamp.box(0.36, 0.42, 0.18, '#ffffff', x + d * c, y + 8.75, z - d * s, { r: 0, jitter: 0, ry });
  lightPool(g, x + Math.sin(ry) * 5, y, z + Math.cos(ry) * 5, 9, pool);
}

// ── the piece ────────────────────────────────────────────────────────────────────────────────
export const openPit: SetPieceFactory = (o) => {
  const rock = ROCKS[o.variant ?? 'red'] ?? ROCKS.red;
  const g = new THREE.Group();
  g.add(benchMesh(rock, o.seed));
  g.add(rampMesh(rock, o.seed));
  const k = new Kit(rng(o.seed));
  const lampK = new Kit();
  const pool = poolMat('#ffe2b0', 0.75);
  // the haul road from the rim to the tipping pad in the front-left corner, the pad and its stockpile
  const lead = lanePoint(TH_S + LEAD, 0), lead1 = lanePoint(TH_S + LEAD, 1);
  const roadIn = new THREE.Vector3((lead.x + lead1.x) / 2, 0, (lead.z + lead1.z) / 2);
  const padC = new THREE.Vector3(-28.4, 0, 18.6);
  const road = new Kit(rng(o.seed + 2));
  const seg = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    road.box(w, 0.1, len + w * 0.6, rock.road, (a.x + b.x) / 2, 0, (a.z + b.z) / 2, { r: 0.04, shade: 0, jitter: 0.04, ry: Math.atan2(b.x - a.x, b.z - a.z) });
  };
  const bend = new THREE.Vector3(roadIn.x - 3.2, 0, roadIn.z + 3.4);
  seg(roadIn, bend, LW);
  seg(bend, padC, LW);
  road.geo(new THREE.CylinderGeometry(5.3, 5.6, 0.16, 28).translate(padC.x, 0.02, padC.z), mix(rock.road, rock.berm, 0.3), 0.04, 0);
  // the tipping edge: a concrete block wall, the stockpile of ore behind it
  const stockC = new THREE.Vector3(padC.x - 3.2, 0, padC.z + 3.4);
  road.geo(new THREE.ConeGeometry(3.0, 2.8, 14, 3).translate(stockC.x, 1.35, stockC.z), rock.ore, 0.12);
  road.geo(new THREE.ConeGeometry(2.0, 1.7, 12, 2).translate(stockC.x + 2.6, 0.8, stockC.z + 0.8), mix(rock.ore, rock.berm, 0.3), 0.12);
  for (let i = 0; i < 4; i++) road.box(1.3, 0.75, 0.75, '#bdb4aa', padC.x - 5.2 + i * 1.35, 0, padC.z + 1.6 + i * 0.85, { r: 0.08, ry: -0.75 });
  const roadMesh = road.build();
  roadMesh.castShadow = false;
  g.add(roadMesh);
  // the shovel at the floor, digging the back-left face; the loading spot beside it
  const thShovel = -0.72 * Math.PI;
  const [shx, shz] = P(N - 1 + fOf(thShovel) + 3.8 / sp(thShovel), thShovel);
  const [fx, fz] = P(N - 1 + fOf(thShovel), thShovel);
  const sh = shovel(o.seed);
  sh.obj.position.set(shx, -HB * N + 0.05, shz);
  const faceYaw = Math.atan2(fx - shx, fz - shz);
  sh.obj.rotation.y = faceYaw;
  g.add(sh.obj);
  const FY = -HB * N + 0.08;
  const Fd = new THREE.Vector2(fx - shx, fz - shz).normalize();
  const fc = cont(N - 0.3);
  let Ld = new THREE.Vector2(-Fd.y, Fd.x);
  if (Ld.dot(new THREE.Vector2(fc.x - shx, fc.z - shz)) < 0) Ld = Ld.negate();
  const at = (l: number, f: number) => new THREE.Vector3(shx + Ld.x * l + Fd.x * f, FY, shz + Ld.y * l + Fd.y * f);
  const loadSpot = at(7.2, -0.6);
  // the trucks' loop: shovel → floor → up the inner lane → road → pad → tip → road → down the outer lane → floor → shovel
  const pts: THREE.Vector3[] = [];
  const fl = (s: number, th: number) => { const [x, z] = P(s, th); return new THREE.Vector3(x, -HB * N + 0.08, z); };
  pts.push(loadSpot);
  pts.push(at(7.4, -7));
  pts.push(fl(N - 1 + 0.55, -0.45 * Math.PI));
  for (let th = TH_E - 0.02; th <= TH_S + LEAD + 0.001; th += 0.035) pts.push(lanePoint(th, 1));
  pts.push(new THREE.Vector3(bend.x - 1.6, 0.12, bend.z + 1.0));
  pts.push(new THREE.Vector3(padC.x + 3.2, 0.12, padC.z - 2.6));
  pts.push(new THREE.Vector3(padC.x - 0.6, 0.12, padC.z - 3.4));
  pts.push(new THREE.Vector3(padC.x - 3.6, 0.12, padC.z - 0.6));
  const dumpSpot = new THREE.Vector3(padC.x - 1.0, 0.12, padC.z + 0.6);
  pts.push(dumpSpot);
  pts.push(new THREE.Vector3(padC.x + 2.6, 0.12, padC.z + 0.4));
  pts.push(new THREE.Vector3(bend.x + 0.8, 0.12, bend.z + 1.6));
  for (let th = TH_S + LEAD; th >= TH_E - 0.02 - 0.001; th -= 0.035) pts.push(lanePoint(th, 0));
  pts.push(fl(N - 1 + 0.3, -0.4 * Math.PI));
  pts.push(at(15, -3));
  pts.push(at(10.5, 2.2));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const M = 900;
  const path = curve.getSpacedPoints(M);
  const total = curve.getLength();
  const nearest = (p: THREE.Vector3) => { let bi = 0, bd = 1e9; path.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const iLoad = nearest(loadSpot), iDump = nearest(dumpSpot);
  const dLD = (((iDump - iLoad + M) % M) / M) * total, dDL = total - dLD;
  const V0 = 5.8, TA = 1.6, T_LOAD = 10, T_DUMP = 6;
  const t1 = dLD / V0 + TA, t2 = dDL / V0 + TA;
  const PER = T_LOAD + t1 + T_DUMP + t2;
  const travel = (tau: number, T: number, d: number) => {
    if (tau < TA) return (0.5 * V0 * tau * tau) / TA;
    if (tau < T - TA) return 0.5 * V0 * TA + V0 * (tau - TA);
    const r = T - tau;
    return d - (0.5 * V0 * r * r) / TA;
  };
  const lights = truckLights();
  const trucks = [0, 1, 2].map((i) => { const t = haulTruck(rock, o.seed + i * 11, lights); g.add(t.obj); return t; });
  const tmpA = new THREE.Vector3();
  const place = (obj: THREE.Object3D, dist: number) => {
    const u = ((dist / total) % 1 + 1) % 1;
    const f = u * M, i0 = Math.floor(f) % M, i1 = (i0 + 1) % M;
    obj.position.lerpVectors(path[i0], path[i1], f - Math.floor(f));
    const a = path[(i0 - 3 + M) % M], b = path[(i0 + 4) % M];
    tmpA.subVectors(b, a);
    obj.rotation.y = Math.atan2(tmpA.x, tmpA.z);
    obj.rotation.x = -Math.atan2(tmpA.y, Math.hypot(tmpA.x, tmpA.z));
  };
  // the drill on the back-right bench, light towers by the shovel and the pad
  const thDrill = -0.42 * Math.PI;
  const [dx, dz] = P(1 + fOf(thDrill) + 2.4 / sp(thDrill), thDrill);
  const mast = drill(k, dx, -HB, dz, thDrill + Math.PI / 2);
  beacon(g, mast[0], mast[1], mast[2], 0.4);
  const [ltx, ltz] = P(N - 1 + fOf(-0.82 * Math.PI) + 2.2 / sp(-0.82 * Math.PI), -0.82 * Math.PI);
  lightTower(g, k, lampK, ltx, -HB * N, ltz, faceYaw + 0.8, pool);
  lightTower(g, k, lampK, padC.x + 4.6, 0.1, padC.z + 3.8, -2.4, pool);
  // the site office, a fuel tank and a pickup in the front-right corner
  k.box(5.2, 2.5, 2.4, '#ece6dc', 29.4, 0.05, 20.6, { r: 0.12 });
  k.box(5.4, 0.18, 2.6, '#5b5562', 29.4, 2.55, 20.6, { r: 0.04 });
  k.box(1.6, 0.9, 0.06, '#34506b', 28.2, 1.2, 21.82, { r: 0, jitter: 0 });
  k.box(1.6, 0.9, 0.06, '#34506b', 30.6, 1.2, 21.82, { r: 0, jitter: 0 });
  const lit = new Lit('#ffe6b8', 1.2);
  lit.pane(1.4, 0.75, 28.2, 1.28, 21.87).pane(1.4, 0.75, 30.6, 1.28, 21.87);
  lit.build(g);
  k.geo(new THREE.CapsuleGeometry(0.75, 2.6, 4, 12).rotateZ(Math.PI / 2).translate(29.6, 1.0, 16.4), '#e6e0e3', 0.03);
  for (const x of [28.4, 30.8]) k.box(0.3, 0.5, 1.3, '#bdb4aa', x, 0, 16.4, { r: 0.04 });
  k.box(12, 0.1, 9, mix(rock.road, rock.berm, 0.4), 29, 0, 19.4, { r: 0.04, shade: 0, jitter: 0.04 });
  g.add(k.build());
  const lampMat = glowMat('yel1', 0);
  lampMat.userData.nightOnly = 3.5;
  const lm = lampK.build(lampMat);
  lm.castShadow = false;
  g.add(lm);
  lightPool(g, shx, -HB * N, shz, 7, pool);
  // dust where the shovel digs and where the trucks tip
  const dust = new Plume({ count: 14, life: 4, rise: 0.9, spread: 1.6, size0: 1.6, size1: 5.5, color: mix(rock.berm, '#e6d4a4', 0.5), opacity: 0.32, radius: 1.4, wind: 0.6 }, o.seed + 5);
  dust.obj.position.set(fx * 0.6 + shx * 0.4, -HB * N + 0.4, fz * 0.6 + shz * 0.4);
  g.add(dust.obj);
  const tipDust = new Plume({ count: 10, life: 3.5, rise: 0.8, spread: 1.4, size0: 1.4, size1: 4.6, color: mix(rock.berm, '#e6d4a4', 0.5), opacity: 0.35, radius: 1.2, wind: 0.6 }, o.seed + 6);
  tipDust.obj.position.set(stockC.x + 1.5, 0.4, stockC.z - 1.5);
  g.add(tipDust.obj);
  const truckYaw = Math.atan2(loadSpot.x - shx, loadSpot.z - shz);
  return {
    obj: g, w: 70, d: 50, h: 11,
    ground(x, z) {
      if (Math.abs(x) > 35.5 || Math.abs(z) > 25.5) return null;
      const r = sOf(x, z);
      if (!r) return null;
      const q = sp(r.th);
      if (r.s < -2.7 / q) return null;
      if (r.s < -1.5 / q) return -0.08;
      return Math.min(0, B(r.s + 2.2 / q, r.th)) - 0.55;
    },
    update(e: Env) {
      let loading = -1, tipping = 0;
      trucks.forEach((t, i) => {
        const tau = ((e.t + (i * PER) / 3) % PER + PER) % PER;
        let dist: number;
        let tilt = 0;
        if (tau < T_LOAD) {
          dist = (iLoad / M) * total;
          loading = tau / T_LOAD;
          t.load.visible = loading > 0.25;
          t.load.scale.y = Math.min(1, Math.max(0.2, (loading - 0.25) * 1.6));
        } else if (tau < T_LOAD + t1) {
          dist = (iLoad / M) * total + travel(tau - T_LOAD, t1, dLD);
          t.load.visible = true;
          t.load.scale.y = 1;
        } else if (tau < T_LOAD + t1 + T_DUMP) {
          dist = (iDump / M) * total;
          const p = (tau - T_LOAD - t1) / T_DUMP;
          tilt = Math.sin(Math.min(1, p * 1.25) * Math.PI) * 0.8;
          t.load.visible = p < 0.45;
          if (p > 0.3 && p < 0.7) tipping = 1;
        } else {
          dist = (iDump / M) * total + travel(tau - T_LOAD - t1 - T_DUMP, t2, dDL);
          t.load.visible = false;
        }
        place(t.obj, dist);
        t.bed.rotation.x = -tilt;
      });
      // the shovel: two passes per truck, dig → swing → dump → back
      const up = sh.upper, swingTo = Math.atan2(Math.sin(truckYaw - faceYaw), Math.cos(truckYaw - faceYaw));
      let sw = 0, boomA = 0.25, stickA = 0.9, bucketA = 0.4;
      if (loading >= 0) {
        const q = (loading * 2) % 1;
        if (q < 0.3) { const a = q / 0.3; sw = 0; boomA = 0.05 + a * 0.4; stickA = 1.3 - a * 0.9; bucketA = 0.9 - a * 0.9; }
        else if (q < 0.5) { const a = smooth((q - 0.3) / 0.2); sw = a; boomA = 0.45 + a * 0.15; stickA = 0.4; bucketA = 0; }
        else if (q < 0.65) { const a = (q - 0.5) / 0.15; sw = 1; boomA = 0.6; stickA = 0.4 + a * 0.3; bucketA = a * 1.3; }
        else { const a = smooth((q - 0.65) / 0.35); sw = 1 - a; boomA = 0.6 - a * 0.55; stickA = 0.7 + a * 0.6; bucketA = 1.3 - a * 0.4; }
      } else {
        const q = (e.t * 0.12) % 1;
        boomA = 0.15 + Math.sin(q * Math.PI * 2) * 0.12; stickA = 1.0 + Math.sin(q * Math.PI * 2 + 1) * 0.3; bucketA = 0.5;
      }
      up.rotation.y = sw * swingTo;
      sh.boom.rotation.x = -boomA;
      sh.stick.rotation.x = stickA;
      sh.bucket.rotation.x = -bucketA + 0.4;
      dust.strength = loading >= 0 ? 0.9 : 0.4;
      dust.update(e);
      tipDust.strength = tipping;
      tipDust.update(e);
    },
  };
};

