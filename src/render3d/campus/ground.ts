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
  h: (x: number, z: number) => number;
  def: BackdropDef;
}

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
  /** Extra flat strips (roads). */
  roads: { a: [number, number]; b: [number, number]; w: number }[];
}

export function buildGround(o: GroundOpts, models: Partial<Record<'mesquite' | 'oak', (at: Placement[]) => THREE.Object3D | null>> = {}): Ground {
  const def = BACKDROPS[o.backdrop];
  const s = o.seed;
  const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
  };
  const flatD = (x: number, z: number) => {
    let d = distToRect(x, z, o.flat);
    for (const r of o.roads) d = Math.min(d, segDist(x, z, r.a, r.b) - r.w / 2);
    return d;
  };
  const centre = { x: (o.flat.x0 + o.flat.x1) / 2, z: (o.flat.z0 + o.flat.z1) / 2 };
  const seaZ = o.seaZ ?? def.seaZ;
  const water = def.water ?? (o.seaZ !== undefined ? -1.2 : null);
  const h = (x: number, z: number) => hBase(x, z) - (o.curve ? (Math.pow(x - centre.x, 2) + Math.pow(z - centre.z, 2)) / (2 * o.curve) : 0);
  const hBase = (x: number, z: number) => {
    const cv = o.carve?.(x, z);
    if (cv !== undefined && cv !== null) return cv;
    const fd = flatD(x, z);
    const d = Math.hypot(x - centre.x, z - centre.z);
    let y = (fbm(x * 0.012, z * 0.012, s, 4) - 0.45) * def.relief * 2 + (fbm(x * 0.05, z * 0.05, s + 5, 2) - 0.5) * def.relief * 0.3;
    y *= smooth(0, 30, fd);
    const farK = smooth(140, 420, d);
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

  const xs = axis(1600), zs = axis(1600);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const cols = new Float32Array(nx * nz * 3);
  const strata = def.strata?.map((p) => col(p));
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j];
      const y = h(x, z);
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
    for (const rd of o.roads) if (segDist(x, z, rd.a, rd.b) < rd.w / 2 + 2) return false;
    const y = h(x, z);
    if (water !== null && y < water + 0.6) return false;
    if (def.snowLine !== null && y > def.snowLine) return false;
    if (near && Math.hypot(x - centre.x, z - centre.z) > 220) return false;
    return true;
  };
  const tintR = () => 0.85 + r() * 0.3;
  const carpet: BackdropDef['plants'] = o.backdrop === 'lunar' ? [] : o.backdrop === 'desert'
    ? [{ kind: 'shrub', n: 900, s: [0.35, 0.8] }, { kind: 'rock', n: 500, s: [0.25, 0.8] }]
    : [{ kind: 'tuft', n: 4200, s: [0.7, 1.4] }, { kind: 'shrub', n: 1100, s: [0.45, 1.1] }, { kind: 'rock', n: 300, s: [0.25, 0.7] }];
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
      at.push({ x, y: h(x, z) - 0.05, z, s: p.s[0] + r() * (p.s[1] - p.s[0]), ry: r() * Math.PI * 2, tint: tintR() });
    }
    if (p.kind === 'mesquite' || p.kind === 'oak') {
      const obj = models[p.kind]?.(at);
      if (obj) plants.add(obj);
      continue;
    }
    const field = treeField(p.kind, at, plantMat);
    // ground cover's shadows are too small to see, but thousands of them fill the shadow pass
    if (p.kind === 'tuft' || p.kind === 'rock' || (p.kind === 'shrub' && p.carpet)) field.castShadow = false;
    plants.add(field);
  }
  return { mesh, water: waterMesh, plants, h, def };
}

const groundMat = withGrain(withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
const plantMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));

function waterMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: col('#2c6399'), roughness: 0.3, metalness: 0.1 });
  return withClouds(m);
}
