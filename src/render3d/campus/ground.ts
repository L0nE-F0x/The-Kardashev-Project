/**
 * The land round a campus, out to the horizon: a backdrop per site (plains, desert, coast,
 * mountain, boreal, temperate, tropical, savanna, volcanic, lunar), flattened where the campus
 * stands, with far scenery (mesas, ranges, hills, sea, a volcano) and its plants.
 */
import * as THREE from 'three';
import { col, fbm, mix, noise, rng, smooth, withClouds, withGrain, type Paint } from '../kit';
import type { Rect } from './layout';
import { treeField, type Placement, type TreeKind } from './trees';
import { quality } from '../quality';
import { grassColours, grassMaterial, sharedClump } from './grass';
import { inField, planFields, type Field } from './fields';

export type Backdrop = 'plains' | 'desert' | 'coast' | 'mountain' | 'boreal' | 'temperate' | 'tropical' | 'savanna' | 'volcanic' | 'lunar';

interface BackdropDef {
  /** Ground colours: base, a second patch colour, bare earth. */
  ground: [Paint, Paint, Paint];
  /** Rock on slopes and far relief; snow above snowLine (null = none). */
  rock: Paint;
  snowLine: number | null;
  /** Gentle relief near the campus. */
  relief: number;
  far: 'mesas' | 'range' | 'hills' | 'flat' | 'volcano' | 'dunes';
  /** Sea level (null = no sea or lakes). */
  water: number | null;
  /** Where the sea is (coast): z beyond this goes under (negative = behind the campus). */
  seaZ?: number;
  plants: { kind: TreeKind | 'mesquite' | 'oak'; n: number; s: [number, number]; near?: boolean; cluster?: number }[];
  /** Strata colours for mesa and cliff sides (bottom → top). */
  strata?: Paint[];
}

export const BACKDROPS: Record<Backdrop, BackdropDef> = {
  plains: {
    ground: ['#c9a861', '#a9a556', '#b9784a'], rock: '#a8703f', snowLine: null, relief: 2.4, far: 'mesas', water: null,
    strata: ['#9c4f34', '#b5623c', '#e3c891', '#c08850', '#a8703f', '#d4a862'],
    plants: [{ kind: 'mesquite', n: 120, s: [0.7, 1.3], near: true, cluster: 4 }, { kind: 'shrub', n: 1600, s: [0.6, 1.4] }, { kind: 'tuft', n: 1400, s: [0.8, 1.4] }, { kind: 'rock', n: 260, s: [0.4, 1.2] }, { kind: 'acacia', n: 220, s: [0.9, 1.4] }],
  },
  desert: {
    ground: ['#e0bf82', '#d8b070', '#c9925a'], rock: '#b5623c', snowLine: null, relief: 3, far: 'mesas', water: null,
    strata: ['#8c4a3a', '#b5623c', '#d9925a', '#e9c48a', '#c08850', '#e0b070'],
    plants: [{ kind: 'saguaro', n: 220, s: [0.8, 1.5] }, { kind: 'barrel', n: 260, s: [0.7, 1.3] }, { kind: 'shrub', n: 500, s: [0.4, 0.9] }, { kind: 'rock', n: 500, s: [0.5, 1.6] }, { kind: 'boulder', n: 90, s: [0.6, 1.8] }],
  },
  coast: {
    ground: ['#6f8f45', '#93a052', '#a88a52'], rock: '#9a8574', snowLine: null, relief: 4, far: 'hills', water: -1.2, seaZ: -150,
    plants: [{ kind: 'oak', n: 150, s: [0.6, 1.2], near: true, cluster: 3 }, { kind: 'broadleaf', n: 500, s: [0.8, 1.4] }, { kind: 'shrub', n: 1200, s: [0.6, 1.3] }, { kind: 'tuft', n: 800, s: [0.8, 1.3] }, { kind: 'palm', n: 40, s: [1.2, 1.6] }],
  },
  mountain: {
    ground: ['#7d8f4e', '#9aa05a', '#a08870'], rock: '#8a7a72', snowLine: 70, relief: 6, far: 'range', water: null,
    plants: [{ kind: 'pine', n: 1600, s: [1.2, 2.4] }, { kind: 'rock', n: 700, s: [0.6, 1.8] }, { kind: 'boulder', n: 200, s: [0.7, 2] }, { kind: 'tuft', n: 800, s: [0.8, 1.3] }],
  },
  boreal: {
    ground: ['#5f7f4a', '#7a8a52', '#8a7a62'], rock: '#82706d', snowLine: null, relief: 5, far: 'hills', water: -1.5,
    plants: [{ kind: 'pine', n: 2600, s: [1.2, 2.2] }, { kind: 'birch', n: 700, s: [0.9, 1.4] }, { kind: 'rock', n: 400, s: [0.6, 1.5] }, { kind: 'boulder', n: 120, s: [0.6, 1.5] }],
  },
  temperate: {
    ground: ['#6f9446', '#8fa456', '#9c7a4a'], rock: '#8a7a72', snowLine: null, relief: 3.5, far: 'hills', water: -2.5,
    plants: [{ kind: 'oak', n: 140, s: [0.7, 1.2], near: true, cluster: 3 }, { kind: 'broadleaf', n: 1300, s: [0.9, 1.6], cluster: 6 }, { kind: 'birch', n: 200, s: [0.9, 1.3] }, { kind: 'shrub', n: 700, s: [0.6, 1.2] }],
  },
  tropical: {
    ground: ['#4f8a3a', '#6f9a42', '#9c6a3d'], rock: '#7d6a5a', snowLine: null, relief: 5, far: 'hills', water: -1.8,
    plants: [{ kind: 'palm', n: 700, s: [1.0, 1.6] }, { kind: 'broadleaf', n: 1800, s: [1.0, 1.8], cluster: 5 }, { kind: 'shrub', n: 1200, s: [0.7, 1.4] }],
  },
  savanna: {
    ground: ['#c9a454', '#b0a05a', '#b9784a'], rock: '#9a7a5a', snowLine: null, relief: 2, far: 'hills', water: null,
    plants: [{ kind: 'mesquite', n: 90, s: [0.9, 1.4], near: true }, { kind: 'acacia', n: 500, s: [1.1, 1.8] }, { kind: 'tuft', n: 2400, s: [0.9, 1.6] }, { kind: 'shrub', n: 500, s: [0.5, 1.1] }, { kind: 'boulder', n: 70, s: [0.8, 2.2] }],
  },
  volcanic: {
    ground: ['#6a7a4a', '#4f5a46', '#3a3436'], rock: '#3f3538', snowLine: 110, relief: 4, far: 'volcano', water: -2,
    plants: [{ kind: 'shrub', n: 900, s: [0.4, 1.0] }, { kind: 'tuft', n: 900, s: [0.8, 1.2] }, { kind: 'rock', n: 900, s: [0.6, 1.8] }, { kind: 'boulder', n: 200, s: [0.6, 1.8] }],
  },
  lunar: {
    ground: ['#9d95a6', '#8a8490', '#7a7186'], rock: '#66575a', snowLine: null, relief: 3, far: 'flat', water: null,
    plants: [{ kind: 'rock', n: 900, s: [0.5, 2] }, { kind: 'boulder', n: 160, s: [0.6, 2.2] }],
  },
};

export interface Ground {
  mesh: THREE.Mesh;
  water: THREE.Mesh | null;
  plants: THREE.Object3D;
  /** The height of the ground as drawn (the mesh's own triangles), so whatever stands on it sits on it. */
  h: (x: number, z: number) => number;
  /** The ground's own colour at a point (grass takes it at the root). */
  tint: (x: number, z: number, out: THREE.Color) => THREE.Color;
  def: BackdropDef;
  /** Farmland round the campus (none unless asked for). */
  fields?: Field[];
}

/** A road the ground is graded for: a straight run from a to b, w wide. `valley`: the far relief opens out round it. */
export interface GradedRoad { a: [number, number]; b: [number, number]; w: number; valley?: boolean }

const distToRect = (x: number, z: number, r: Rect) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** Grid coordinates: fine near the campus, coarser towards the horizon. */
function axis(extent: number) {
  const out: number[] = [0];
  let x = 0;
  while (x < extent) {
    const step = x < 110 ? 1.4 : 1.4 + (x - 110) * 0.045;
    x += step;
    out.push(x);
  }
  return [...out.slice(1).reverse().map((v) => -v), ...out];
}

export interface GroundOpts {
  backdrop: Backdrop;
  seed: number;
  /** Flat where the campus stands. */
  flat: Rect;
  /** Where nothing may grow (the campus as it is today); defaults to `flat`. */
  clear?: Rect;
  /** Bring the sea in to this z (a landing station's beach). Turns any backdrop into a coast. */
  seaZ?: number;
  /** A small world: the ground falls away with this radius (an asteroid's horizon). */
  curve?: number;
  /** Pieces that reshape the ground (world coordinates): a height, or null to keep the land. */
  carve?: (x: number, z: number) => number | null;
  /** Roads: the land is graded to a smooth profile along each (cuts and embankments), in order (a later road meets an earlier one at its height). */
  roads: GradedRoad[];
  /** Lay out farmland round the campus (fields along the highway at this z). */
  farms?: { highwayZ: number };
}

/** Kinds with a Meshy model for the near ring: how many of them near the campus at most (full detail), how near. */
const NEAR_MODEL: Partial<Record<TreeKind, { cap: number; r: number }>> = {
  rock: { cap: 260, r: 170 }, boulder: { cap: 90, r: 220 }, shrub: { cap: 240, r: 150 }, broadleaf: { cap: 170, r: 200 }, pine: { cap: 240, r: 210 },
};

/** How far out from the campus centre plants cast shadows (the sun's shadow map covers about this much). */
const SHADOW_R = 240;

export type GroundModels = Partial<Record<'mesquite' | 'oak' | TreeKind, (at: Placement[]) => THREE.Object3D | null>>;

export function buildGround(o: GroundOpts, models: GroundModels = {}): Ground {
  const def = BACKDROPS[o.backdrop];
  const s = o.seed;
  const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
  };
  const flatD = (x: number, z: number) => distToRect(x, z, o.flat);
  const centre = { x: (o.flat.x0 + o.flat.x1) / 2, z: (o.flat.z0 + o.flat.z1) / 2 };
  const seaZ = o.seaZ ?? def.seaZ;
  const water = def.water ?? (o.seaZ !== undefined ? -1.2 : null);
  const valleys = o.roads.filter((r) => r.valley);
  /** The land as nature made it (the campus levelled, the far relief opening out along the highway's valley). */
  const hNat = (x: number, z: number) => {
    const fd = flatD(x, z);
    const d = Math.hypot(x - centre.x, z - centre.z);
    let y = (fbm(x * 0.012, z * 0.012, s, 4) - 0.45) * def.relief * 2 + (fbm(x * 0.05, z * 0.05, s + 5, 2) - 0.5) * def.relief * 0.3;
    y *= smooth(0, 30, fd);
    let farK = smooth(140, 420, d);
    for (const r of valleys) farK *= 0.12 + 0.88 * smooth(18, 240, segDist(x, z, r.a, r.b));
    switch (def.far) {
      case 'mesas': {
        const m = fbm(x * 0.004, z * 0.004, s + 11, 3);
        // flat-topped buttes with steep sides, mostly behind
        const top = smooth(0.56, 0.6, m) * (40 + fbm(x * 0.01, z * 0.01, s + 12, 2) * 30);
        y += top * farK * smooth(-60, -200, z) + top * 0.4 * farK;
        break;
      }
      case 'range': {
        const r = 1 - Math.abs(fbm(x * 0.0035, z * 0.0035, s + 13, 5) * 2 - 1);
        y += Math.pow(r, 2.2) * 210 * farK + fbm(x * 0.008, z * 0.008, s + 14, 3) * 40 * farK;
        break;
      }
      case 'hills':
        y += (fbm(x * 0.005, z * 0.005, s + 15, 4) - 0.3) * 70 * farK;
        break;
      case 'volcano': {
        const vx = x + 260, vz = z + 520;
        const vd = Math.hypot(vx, vz);
        y += Math.max(0, 190 - vd * 0.62) * (vd > 30 ? 1 : 0.8) + (fbm(x * 0.006, z * 0.006, s + 16, 3) - 0.3) * 40 * farK;
        break;
      }
      case 'dunes':
        y += (Math.sin(x * 0.02 + fbm(x * 0.004, z * 0.004, s, 2) * 6) * 0.5 + 0.5) * 12 * farK;
        break;
    }
    if (seaZ !== undefined && water !== null) {
      // the land drops to a beach and under the sea behind the campus
      const k = smooth(seaZ + 40, seaZ - 40, z + (fbm(x * 0.006, 0, s + 20, 3) - 0.5) * (o.seaZ !== undefined ? 40 : 140));
      y = Math.max(y, water + 0.9) * (1 - k) + (water - 6) * k;
    } else if (water !== null) {
      // lakes in the hollows
      const lake = smooth(0.62, 0.7, fbm(x * 0.006 + 40, z * 0.006, s + 21, 3)) * smooth(150, 280, d);
      y -= lake * 14;
    }
    return y;
  };
  // grade each road: sample the land along it, smooth that into an easy profile (above any water), then blend the
  // land to the profile across the road and its shoulders (a cut through a rise, an embankment over a dip)
  // what the pieces dig or the lake shore takes away comes first; the roads are graded over it (a causeway, not a dive)
  const hCarved = (x: number, z: number) => {
    const cv = o.carve?.(x, z);
    return cv !== undefined && cv !== null ? cv : hNat(x, z);
  };
  let hGraded = hCarved;
  for (const r of o.roads) {
    const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    if (len < 1) continue;
    const ux = (r.b[0] - r.a[0]) / len, uz = (r.b[1] - r.a[1]) / len;
    const STEP = 4, n = Math.ceil(len / STEP) + 1;
    let prof = new Float32Array(n);
    const prev = hGraded;
    for (let i = 0; i < n; i++) {
      const t = Math.min(len, i * STEP);
      let y = prev(r.a[0] + ux * t, r.a[1] + uz * t);
      if (water !== null) y = Math.max(y, water + 0.8);
      prof[i] = y;
    }
    // three box blurs ≈ a gaussian ~±40 m, ends held (they meet the campus or another road at its height)
    for (let pass = 0; pass < 3; pass++) {
      const out = new Float32Array(n), R = 7;
      for (let i = 0; i < n; i++) {
        let sum = 0, cnt = 0;
        for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { sum += prof[j]; cnt++; }
        out[i] = sum / cnt;
      }
      out[0] = prof[0]; out[n - 1] = prof[n - 1];
      prof = out;
    }
    const at = (t: number) => {
      const f = Math.max(0, Math.min(n - 1, t / STEP)), i = Math.min(n - 2, Math.floor(f)), k = f - i;
      return prof[i] * (1 - k) + prof[i + 1] * k;
    };
    const half = r.w / 2;
    hGraded = (x: number, z: number) => {
      const dx = x - r.a[0], dz = z - r.a[1];
      const t = Math.max(0, Math.min(len, dx * ux + dz * uz));
      const d = Math.hypot(dx - ux * t, dz - uz * t);
      if (d > half + 12) return prev(x, z);
      const k = 1 - smooth(half + 0.6, half + 12, d);
      const base = prev(x, z);
      return base + (at(t) - base) * k;
    };
  }
  const hExact = (x: number, z: number) => hGraded(x, z) - (o.curve ? (Math.pow(x - centre.x, 2) + Math.pow(z - centre.z, 2)) / (2 * o.curve) : 0);

  const xs = axis(1600), zs = axis(1600);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const cols = new Float32Array(nx * nz * 3);
  const strata = def.strata?.map((p) => col(p));
  const heights = new Float32Array(nx * nz);
  const h = hExact;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j];
      const y = hExact(x, z);
      heights[j * nx + i] = y;
      const k = (j * nx + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      // colour: patches, bare ground, slopes to rock, strata on mesa sides, snow up high, sand at the shore
      const n1 = fbm(x * 0.03, z * 0.03, s + 31, 3) * 0.6 + fbm(x * 0.11, z * 0.11, s + 32, 2) * 0.4, n2 = noise(x * 0.3, z * 0.3, s + 7);
      let c = mix(def.ground[0], def.ground[1], smooth(0.4, 0.64, n1));
      c.lerp(col(def.ground[2]), smooth(0.64, 0.84, fbm(x * 0.045, z * 0.045, s + 99, 3)) * 0.6);
      const dx = h(x + 1.5, z) - h(x - 1.5, z), dz = h(x, z + 1.5) - h(x, z - 1.5);
      const slope = Math.hypot(dx, dz) / 3;
      if (strata && y > 6) {
        const band = strata[Math.floor(((y + noise(x * 0.05, z * 0.05, s) * 3) / 6)) % strata.length];
        c.lerp(band, smooth(0.25, 0.6, slope));
      } else c.lerp(col(def.rock), smooth(0.35, 0.9, slope));
      if (def.snowLine !== null) c.lerp(col('#f1f6fb'), smooth(def.snowLine, def.snowLine + 20, y + n1 * 20) * (1 - smooth(1.2, 2, slope) * 0.4));
      if (water !== null) c.lerp(col('#e6d4a4'), smooth(water + 1.1, water + 0.25, y) * (1 - smooth(water - 1, water - 3, y)));
      c.multiplyScalar(0.92 + (n2 - 0.5) * 0.09);
      cols[k] = c.r; cols[k + 1] = c.g; cols[k + 2] = c.b;
    }
  const idx: number[] = [];
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i, b = a + 1, c2 = a + nx, d2 = c2 + 1;
      idx.push(a, c2, b, b, c2, d2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, groundMat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'ground';
  const surface = meshHeight(xs, zs, heights, hExact);
  const tint = meshTint(xs, zs, cols);
  const fields = o.farms ? planFields(o.backdrop, s, o.clear ?? o.flat, o.farms.highwayZ,
    (x, z) => water !== null && hExact(x, z) < water + 0.8,
    (x, z) => Math.abs(hExact(x + 3, z) - hExact(x - 3, z)) + Math.abs(hExact(x, z + 3) - hExact(x, z - 3)) > 2.6) : [];

  let waterMesh: THREE.Mesh | null = null;
  if (water !== null) {
    waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), waterMaterial());
    waterMesh.position.y = water;
    waterMesh.receiveShadow = true;
  }

  // plants: Meshy trees close in (a few), code-built ones everywhere
  const plants = new THREE.Group();
  const r = rng(s + 50);
  const clear = o.clear ?? o.flat;
  const okAt = (x: number, z: number, near: boolean) => {
    if (distToRect(x, z, clear) < 3) return false;
    for (const f of fields) if (inField(f, x, z, 2.5)) return false;
    for (const rd of o.roads) if (segDist(x, z, rd.a, rd.b) < rd.w / 2 + 2) return false;
    const y = surface(x, z);
    if (water !== null && y < water + 0.6) return false;
    if (def.snowLine !== null && y > def.snowLine) return false;
    if (near && Math.hypot(x - centre.x, z - centre.z) > 220) return false;
    return true;
  };
  const tintR = () => 0.85 + r() * 0.3;
  const carpet: BackdropDef['plants'] = o.backdrop === 'lunar' ? [] : o.backdrop === 'desert'
    ? [{ kind: 'shrub', n: 320, s: [0.35, 0.8] }, { kind: 'rock', n: 220, s: [0.25, 0.8] }]
    : [{ kind: 'tuft', n: 4200, s: [0.7, 1.4] }, { kind: 'shrub', n: 220, s: [0.45, 1.1] }, { kind: 'rock', n: 55, s: [0.5, 1.0] }];
  for (const p of [...def.plants, ...carpet.map((c) => ({ ...c, carpet: true }))] as (BackdropDef['plants'][number] & { carpet?: boolean })[]) {
    const at: Placement[] = [];
    const radius = p.carpet ? 150 : p.near ? 200 : p.kind === 'tuft' || p.kind === 'shrub' ? 320 : 700;
    const centres: [number, number][] = [];
    if (p.cluster) for (let i = 0; i < p.n / p.cluster; i++) centres.push([centre.x + (r() - 0.5) * radius * 2, centre.z + (r() - 0.5) * radius * 2]);
    const want = Math.round(p.n * quality.plants);
    for (let tries = 0; at.length < want && tries < want * 12; tries++) {
      let x: number, z: number;
      if (p.cluster && centres.length) {
        const c = centres[Math.floor(r() * centres.length)];
        x = c[0] + (r() - 0.5) * 22;
        z = c[1] + (r() - 0.5) * 18;
      } else {
        // denser near the campus: square the radius sample
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
        x = centre.x + Math.cos(a) * d;
        z = centre.z + Math.sin(a) * d * 0.9;
      }
      if (!okAt(x, z, !!p.near)) continue;
      at.push({ x, y: surface(x, z) - 0.05, z, s: p.s[0] + r() * (p.s[1] - p.s[0]), ry: r() * Math.PI * 2, tint: tintR() });
    }
    if (p.kind === 'mesquite' || p.kind === 'oak') {
      const obj = models[p.kind]?.(at);
      if (obj) plants.add(obj);
      continue;
    }
    // the nearest few as Meshy models, the rest code-built
    const nm = NEAR_MODEL[p.kind as TreeKind];
    const make = models[p.kind as TreeKind];
    if (nm && make && quality.plants >= 0.5) {
      const near: Placement[] = [], far: Placement[] = [];
      const cap = Math.round(nm.cap * quality.plants);
      for (const a of at) (near.length < cap && Math.hypot(a.x - centre.x, a.z - centre.z) < nm.r ? near : far).push(a);
      const obj = near.length ? make(near) : null;
      if (obj) {
        if (p.kind === 'rock' || p.kind === 'shrub') obj.traverse((c) => { c.castShadow = false; });
        plants.add(obj);
        at.length = 0;
        at.push(...far);
      }
    }
    if (p.kind === 'tuft') {
      // grass clumps: blades in the backdrop's own greens and straws, swaying
      const [ga, gb] = grassColours(def.ground);
      const im = new THREE.InstancedMesh(sharedClump(), grassMaterial('carpet'), Math.max(1, at.length));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      at.forEach((pl, i) => {
        q.setFromEuler(new THREE.Euler(pl.rx ?? 0, pl.ry, 0));
        m.compose(new THREE.Vector3(pl.x, pl.y, pl.z), q, new THREE.Vector3(pl.s * 1.3, pl.s * 1.25, pl.s * 1.3));
        im.setMatrixAt(i, m);
        tint(pl.x, pl.z, c).lerp(r() < 0.5 ? ga : gb, 0.25).multiplyScalar(0.92 + r() * 0.16);
        im.setColorAt(i, c);
      });
      im.count = at.length;
      im.castShadow = false;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      plants.add(im);
      continue;
    }
    // ground cover's shadows are too small to see, but thousands of them fill the shadow pass; and only plants
    // near the campus can cast into the shadow map at all (it covers the campus), so the far ones don't try
    const quiet = p.kind === 'rock' || (p.kind === 'shrub' && p.carpet);
    const nearAt = quiet ? [] : at.filter((a) => Math.hypot(a.x - centre.x, a.z - centre.z) < SHADOW_R);
    const farAt = quiet ? at : at.filter((a) => Math.hypot(a.x - centre.x, a.z - centre.z) >= SHADOW_R);
    const mat = p.kind === 'shrub' ? plantMatSmooth : plantMat;
    if (nearAt.length) plants.add(treeField(p.kind, nearAt, mat));
    if (farAt.length) { const f = treeField(p.kind, farAt, mat); f.castShadow = false; plants.add(f); }
  }
  return { mesh, water: waterMesh, plants, h: surface, tint, def, fields };
}

/** The ground's vertex colour at (x, z), bilinear over the grid cell. */
function meshTint(xs: number[], zs: number[], cols: Float32Array) {
  const nx = xs.length;
  const find = (a: number[], v: number) => {
    let lo = 0, hi = a.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= v) lo = m; else hi = m - 1; }
    return lo;
  };
  return (x: number, z: number, out: THREE.Color) => {
    const i = find(xs, Math.max(xs[0], Math.min(xs[nx - 1], x))), j = find(zs, Math.max(zs[0], Math.min(zs[zs.length - 1], z)));
    const u = Math.max(0, Math.min(1, (x - xs[i]) / (xs[i + 1] - xs[i]))), v = Math.max(0, Math.min(1, (z - zs[j]) / (zs[j + 1] - zs[j])));
    const k = (ii: number, jj: number, c: number) => cols[(jj * nx + ii) * 3 + c];
    const f = (c: number) => (k(i, j, c) * (1 - u) + k(i + 1, j, c) * u) * (1 - v) + (k(i, j + 1, c) * (1 - u) + k(i + 1, j + 1, c) * u) * v;
    return out.setRGB(f(0), f(1), f(2));
  };
}

/**
 * The height of the ground mesh itself at (x, z): the grid cell, then the triangle of it the point is in (the grid's
 * diagonals run from (i+1, j) to (i, j+1)). Out past the grid it falls back to the exact land.
 */
function meshHeight(xs: number[], zs: number[], hs: Float32Array, exact: (x: number, z: number) => number) {
  const nx = xs.length;
  const find = (a: number[], v: number) => {
    let lo = 0, hi = a.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= v) lo = m; else hi = m - 1; }
    return lo;
  };
  return (x: number, z: number) => {
    if (x < xs[0] || x > xs[nx - 1] || z < zs[0] || z > zs[zs.length - 1]) return exact(x, z);
    const i = find(xs, x), j = find(zs, z);
    const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const a = hs[j * nx + i], b = hs[j * nx + i + 1], c = hs[(j + 1) * nx + i], d = hs[(j + 1) * nx + i + 1];
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  };
}

const groundMat = withGrain(withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
const plantMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
/** Bushes shade smooth (their normals are rounded off in trees.ts). */
export const plantMatSmooth = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
plantMatSmooth.userData.shared = true;

function waterMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: col('#2c6399'), roughness: 0.3, metalness: 0.1 });
  return withClouds(m);
}
