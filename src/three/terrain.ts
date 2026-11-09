/**
 * The land: each site is a slab cut out of the world, a rolling top with a soil-and-rock cross
 * section on its sides. Layouts (plots, roads, pads) are in slab-local units, x right, z towards
 * the camera.
 */
import * as THREE from 'three';
import { col, fbm, Kit, mix, noise, rng, smooth, paintMat, type Paint } from './kit';

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Road { pts: [number, number][]; w: number; kind: 'highway' | 'asphalt' | 'caliche' | 'street' }

export interface SlabDef {
  id: string;
  /** World position of the slab's centre. */
  at: THREE.Vector3;
  w: number;
  d: number;
  seed: number;
  biome: 'plains' | 'coast';
  plots: Rect[];
  roads: Road[];
  /** Extra flat pads (substation, houses…). */
  flats: Rect[];
  depth: number;
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });

// ── the two sites of the test ────────────────────────────────────────────────────────────────
export const TEXAS: SlabDef = {
  id: 'west-texas', at: new THREE.Vector3(0, 0, 0), w: 144, d: 96, seed: 11, biome: 'plains', depth: 16,
  plots: [rect(-12, 18, 28, 26), rect(20, 18, 28, 26), rect(52, 18, 28, 26), rect(-12, -16, 28, 26), rect(20, -16, 28, 26), rect(52, -16, 28, 26)],
  roads: [
    { pts: [[-72, 39], [72, 39]], w: 8, kind: 'highway' },
    { pts: [[-30, 35], [-30, -33]], w: 5, kind: 'asphalt' },
    { pts: [[-30, 1], [69, 1]], w: 5, kind: 'asphalt' },
    { pts: [[-30, -33], [-44, -38], [-62, -36], [-72, -40]], w: 3, kind: 'caliche' },
    { pts: [[-44, -38], [-50, -20], [-56, -12]], w: 2.5, kind: 'caliche' },
    { pts: [[69, 1], [69, -34], [40, -42], [28, -43]], w: 2.5, kind: 'caliche' },
  ],
  flats: [rect(-47, 25, 18, 14), rect(-58, 11, 9, 9), rect(9, -41.5, 17, 9)],
};

export const BAY: SlabDef = {
  id: 'bay-area', at: new THREE.Vector3(-175, 0, 40), w: 84, d: 58, seed: 5, biome: 'coast', depth: 14,
  plots: [],
  roads: [{ pts: [[-42, 12], [42, 12]], w: 7, kind: 'street' }],
  flats: [rect(0, -1, 20, 18), rect(-23, -1, 18, 18), rect(23, -1, 18, 18), rect(0, 22, 84, 12)],
};

// ── height and colour ────────────────────────────────────────────────────────────────────────
function distToRect(x: number, z: number, r: Rect) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}
function distToSeg(x: number, z: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
}
export function roadDist(def: SlabDef, x: number, z: number) {
  let best = 1e9;
  for (const r of def.roads) for (let i = 0; i + 1 < r.pts.length; i++) best = Math.min(best, distToSeg(x, z, r.pts[i], r.pts[i + 1]) - r.w / 2);
  return best;
}
/** How far from anything that must stay flat (plots, pads, roads). */
export function flatDist(def: SlabDef, x: number, z: number) {
  let best = roadDist(def, x, z);
  for (const r of def.plots) best = Math.min(best, distToRect(x, z, r) - 1.5);
  for (const r of def.flats) best = Math.min(best, distToRect(x, z, r) - 0.5);
  return best;
}

export function heightAt(def: SlabDef, x: number, z: number) {
  const s = def.seed;
  if (def.biome === 'plains') {
    const h = (fbm(x * 0.022, z * 0.022, s, 4) - 0.45) * 5 + (fbm(x * 0.09, z * 0.09, s + 5, 2) - 0.5) * 0.7;
    return h * smooth(0, 7, flatDist(def, x, z));
  }
  // coast: the street and lots flat, golden hills rising behind
  const hill = smooth(-10, -27, z) * (7 + fbm(x * 0.05, 0, s, 3) * 8);
  const roll = (fbm(x * 0.06, z * 0.06, s + 3, 3) - 0.5) * 1.2;
  return (hill + roll * smooth(-6, -14, z)) * smooth(0, 4, flatDist(def, x, z));
}

function groundColor(def: SlabDef, x: number, z: number, y: number): THREE.Color {
  const s = def.seed;
  const n1 = fbm(x * 0.05, z * 0.05, s + 31, 3);
  const n2 = noise(x * 0.35, z * 0.35, s + 7);
  if (def.biome === 'plains') {
    // dry grass with olive patches, red dirt where it's bare, darker in hollows
    let c = mix('snd6', '#a9a556', smooth(0.42, 0.62, n1));
    c.lerp(col('#b9784a'), smooth(0.66, 0.8, fbm(x * 0.03, z * 0.03, s + 99, 3)) * 0.75);
    c.lerp(col('snd7'), smooth(0.7, 0.9, n2) * 0.25);
    c.multiplyScalar(0.92 + y * 0.03 + (n2 - 0.5) * 0.08);
    // worn ground next to roads
    const rd = roadDist(def, x, z);
    c.lerp(col('#c99a62'), (1 - smooth(0, 3, rd)) * 0.6);
    return c;
  }
  let c = mix('#6f9446', '#8f9a45', smooth(0.4, 0.65, n1));
  // the hills go golden
  c.lerp(mix('snd6', '#c79a4a', n2), smooth(1, 5, y) * 0.85);
  c.multiplyScalar(0.93 + (n2 - 0.5) * 0.1);
  return c;
}

// strata on the sides: depth below the surface → colour
const STRATA: [number, Paint][] = [
  [0, '#6b4a2c'], [0.7, '#9c4f34'], [2.6, '#b5623c'], [3.6, '#e3c891'], [4.6, '#c08850'], [6.6, '#a8703f'], [7.4, '#d4a862'],
  [9.5, '#7c5a49'], [12, '#4e4148'], [99, '#4e4148'],
];
const STRATA_COAST: [number, Paint][] = [
  [0, '#4a3524'], [0.8, '#7d5232'], [3, '#9c6c3d'], [4.2, '#bfae9f'], [5.4, '#82706d'], [8, '#66575a'], [99, '#4e4148'],
];
function strataColor(def: SlabDef, depth: number, along: number) {
  const bands = def.biome === 'plains' ? STRATA : STRATA_COAST;
  const d = depth + (noise(along * 0.12, depth * 0.2, def.seed) - 0.5) * 1.4;
  for (let i = 0; i + 1 < bands.length; i++) {
    if (d < bands[i + 1][0]) {
      const c = col(bands[i][1]).clone();
      // soft blend at the band's top edge, a little grain
      const t = smooth(bands[i + 1][0] - 0.25, bands[i + 1][0], d);
      c.lerp(col(bands[i + 1][1]), t);
      return c.multiplyScalar(0.9 + noise(along * 0.8, depth * 1.6, def.seed + 3) * 0.16);
    }
  }
  return col('rck2').clone();
}

// ── building the slab ────────────────────────────────────────────────────────────────────────
export interface Slab {
  def: SlabDef;
  group: THREE.Group;
  /** Height at a slab-local point. */
  h: (x: number, z: number) => number;
}

export function buildSlab(def: SlabDef): Slab {
  const group = new THREE.Group();
  group.position.copy(def.at);
  const h = (x: number, z: number) => heightAt(def, x, z);
  const step = def.biome === 'plains' ? 0.75 : 0.6;
  const nx = Math.round(def.w / step), nz = Math.round(def.d / step);

  // the top
  const top = new THREE.PlaneGeometry(def.w, def.d, nx, nz);
  top.rotateX(-Math.PI / 2);
  const pos = top.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = h(x, z);
    pos.setY(i, y);
    const c = groundColor(def, x, z, y);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  top.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  top.computeVertexNormals();
  const topMesh = new THREE.Mesh(top, paintMat);
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  topMesh.name = 'ground';
  group.add(topMesh);

  // the sides: a skirt per edge, coloured by depth below the surface
  const bottom = -def.depth;
  const rows = Math.round(def.depth / 0.4);
  const edges: { n: number; at: (t: number) => [number, number]; out: [number, number] }[] = [
    { n: nx, at: (t) => [-def.w / 2 + t * def.w, def.d / 2], out: [0, 1] },
    { n: nx, at: (t) => [def.w / 2 - t * def.w, -def.d / 2], out: [0, -1] },
    { n: nz, at: (t) => [def.w / 2, def.d / 2 - t * def.d], out: [1, 0] },
    { n: nz, at: (t) => [-def.w / 2, -def.d / 2 + t * def.d], out: [-1, 0] },
  ];
  const sideParts: THREE.BufferGeometry[] = [];
  for (const e of edges) {
    const verts: number[] = [], cols: number[] = [], idx: number[] = [];
    for (let i = 0; i <= e.n; i++) {
      const [x, z] = e.at(i / e.n);
      const yTop = h(x, z);
      const along = i * step + (e.out[0] ? 500 : 0) + (e.out[1] < 0 || e.out[0] < 0 ? 1000 : 0);
      for (let j = 0; j <= rows; j++) {
        const y = yTop + (bottom - yTop) * (j / rows);
        // a little bulge so the sides read as dug earth, not a wall
        const bulge = (noise(along * 0.3, y * 0.4, def.seed + 9) - 0.5) * 0.35 * Math.min(1, j / 2);
        verts.push(x + e.out[0] * bulge, y, z + e.out[1] * bulge);
        const c = strataColor(def, yTop - y, along);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < e.n; i++)
      for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j, b = a + rows + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    // winding: make faces point outwards
    g.computeVertexNormals();
    const n = g.attributes.normal;
    if (n.getX(0) * e.out[0] + n.getZ(0) * e.out[1] < 0) {
      for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    sideParts.push(g);
  }
  for (const g of sideParts) {
    const m = new THREE.Mesh(g, paintMat);
    m.receiveShadow = true;
    group.add(m);
  }
  // the underside
  const under = new Kit();
  under.box(def.w, 0.6, def.d, '#3a2f33', 0, bottom - 0.3, 0, { r: 0.3, shade: 0 });
  group.add(under.build());

  // roads
  group.add(buildRoads(def, h));
  return { def, group, h };
}

function buildRoads(def: SlabDef, h: (x: number, z: number) => number) {
  const kit = new Kit(rng(def.seed + 40));
  const surface: Record<Road['kind'], Paint> = { highway: '#58565c', asphalt: '#66636a', caliche: '#d9c08e', street: '#5e5b62' };
  for (const r of def.roads) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(len / 3));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        const y = h(mx, mz);
        // overlap a little so the joints don't gap; rounded joints at bends
        kit.box(r.w, 0.12, len / steps + (r.kind === 'caliche' ? 0.4 : 0.05), surface[r.kind], mx, y - 0.05, mz, { r: 0.04, ry: ang, jitter: 0.02, shade: 0 });
      }
      if (i > 0) kit.cyl(r.w / 2, r.w / 2, 0.12, surface[r.kind], ax, h(ax, az) - 0.05, az, 14, { jitter: 0, shade: 0 });
      // markings
      if (r.kind === 'highway' || r.kind === 'street') {
        for (let d = 2; d < len - 2; d += 5) {
          const x = ax + (bx - ax) * (d / len), z = az + (bz - az) * (d / len);
          kit.box(0.25, 0.02, 2.4, r.kind === 'highway' ? 'yel0' : 'ink9', x, h(x, z) + 0.07, z, { r: 0, ry: ang, jitter: 0 });
        }
        for (const side of [-1, 1]) {
          const ox = Math.cos(ang) * side * (r.w / 2 - 0.5), oz = -Math.sin(ang) * side * (r.w / 2 - 0.5);
          kit.box(0.18, 0.02, len, 'ink8', (ax + bx) / 2 + ox, 0.07, (az + bz) / 2 + oz, { r: 0, ry: ang, jitter: 0 });
        }
      }
      if (r.kind === 'street') {
        // sidewalks and kerbs
        for (const side of [-1, 1]) {
          const off = r.w / 2 + 1.1;
          const ox = Math.cos(ang) * side * off, oz = -Math.sin(ang) * side * off;
          kit.box(2.2, 0.22, len, '#cfc6bd', (ax + bx) / 2 + ox, -0.05, (az + bz) / 2 + oz, { r: 0.05, ry: ang, jitter: 0.02, shade: 0 });
        }
      }
    }
  }
  const m = kit.build();
  m.castShadow = false;
  return m;
}

/** Points scattered over the slab, away from flat things, for scrub, rocks and trees. */
export function scatter(def: SlabDef, n: number, seed: number, minFlat = 2, filter?: (x: number, z: number) => boolean) {
  const r = rng(seed);
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const x = (r() - 0.5) * (def.w - 3), z = (r() - 0.5) * (def.d - 3);
    if (flatDist(def, x, z) < minFlat) continue;
    if (filter && !filter(x, z)) continue;
    out.push([x, z]);
  }
  return out;
}
