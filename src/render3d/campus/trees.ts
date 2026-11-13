/**
 * Trees and plants, built in code the way a model-maker builds them: a trunk and limbs, a dark core of foliage, and
 * over it a shell of leaf sprays (small cards carrying a painted cluster of leaves, cut out by the texture's alpha),
 * shaded as one soft crown. Every kind comes in a few variants and two levels of detail: the full tree near the
 * campus, a plain solid one for the far land. One texture (drawn here), one material, one draw call per variant.
 * The foliage sways a little in the wind.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cloudUniforms, col, noise, rng, withClouds, type Paint } from '../kit';

export type TreeKind = 'pine' | 'palm' | 'saguaro' | 'barrel' | 'birch' | 'broadleaf' | 'blob' | 'acacia' | 'shrub' | 'tuft' | 'rock' | 'boulder'
  | 'oak' | 'mesquite' | 'sage';

/** How many variants each kind comes in. */
const VARIANTS: Record<TreeKind, number> = { pine: 3, palm: 2, saguaro: 3, barrel: 2, birch: 2, broadleaf: 3, blob: 2, acacia: 2, shrub: 3, tuft: 2, rock: 3, boulder: 2, oak: 3, mesquite: 2, sage: 2 };

// ── the leaf texture ──────────────────────────────────────────────────────────────────────────
// A 4×2 sheet of 256 px cells, grey leaves on nothing (the colour comes from the vertices):
// leaves A, leaves B, small leaves, a needle spray / a palm frond (two cells wide), solid, a dry twig.
type Cell = 'leafA' | 'leafB' | 'fine' | 'needle' | 'frond' | 'solid' | 'twig';
const CELLS: Record<Cell, [number, number, number, number]> = {
  leafA: [0, 0, 1, 1], leafB: [1, 0, 1, 1], fine: [2, 0, 1, 1], needle: [3, 0, 1, 1], frond: [0, 1, 2, 1], solid: [2, 1, 1, 1], twig: [3, 1, 1, 1],
};
/** A cell's corners in texture coordinates (inset a little, so its neighbours don't bleed in). */
function cellUV(c: Cell): [number, number, number, number] {
  const [x, y, w, h] = CELLS[c];
  const e = 4 / 256;
  return [(x + e) / 4, (y + e) / 2, (x + w - e) / 4, (y + h - e) / 2];
}

let leafTex: THREE.Texture | null = null;
function leafTexture(): THREE.Texture {
  if (leafTex) return leafTex;
  const W = 1024, H = 512, S = 256;
  if (typeof document === 'undefined') {
    leafTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    leafTex.needsUpdate = true;
    return leafTex;
  }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const r = rng(4711);
  const grey = (v: number) => { const k = Math.round(Math.max(0, Math.min(255, v))); return `rgb(${k},${k},${k})`; };
  /** A pointed leaf from its stalk at (x, y), `len` long, pointing along `ang`. */
  const leaf = (x: number, y: number, len: number, wid: number, ang: number, v: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(wid, len * 0.22, wid * 0.85, len * 0.72, 0, len);
    g.bezierCurveTo(-wid * 0.85, len * 0.72, -wid, len * 0.22, 0, 0);
    g.fillStyle = grey(v);
    g.fill();
    // one half a little darker, a midrib: the leaf folds along it
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(wid, len * 0.22, wid * 0.85, len * 0.72, 0, len);
    g.closePath();
    g.fillStyle = grey(v * 0.86);
    g.fill();
    g.strokeStyle = grey(v * 1.12);
    g.lineWidth = Math.max(1, wid * 0.09);
    g.beginPath();
    g.moveTo(0, len * 0.06);
    g.lineTo(0, len * 0.93);
    g.stroke();
    g.restore();
  };
  const inCell = (c: Cell, draw: (w: number, h: number) => void) => {
    const [cx, cy, cw, ch] = CELLS[c];
    g.save();
    g.beginPath();
    g.rect(cx * S + 6, cy * S + 6, cw * S - 12, ch * S - 12);
    g.clip();
    g.translate(cx * S, cy * S);
    draw(cw * S, ch * S);
    g.restore();
  };
  // a spray of broad leaves: dark ones underneath, light ones on top, fanning out from the middle
  const spray = (n: number, len: [number, number], wid: number, reach: number) => (w: number, h: number) => {
    const leaves = Array.from({ length: n }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * reach;
      return { x: w / 2 + Math.cos(a) * d * 0.55, y: h / 2 + Math.sin(a) * d * 0.55, a: a + (r() - 0.5) * 1.3, l: len[0] + r() * (len[1] - len[0]), v: 168 + r() * 87 };
    }).sort((p, q) => p.v - q.v);
    for (const l of leaves) leaf(l.x, l.y, l.l, l.l * wid * (0.85 + r() * 0.3), l.a - Math.PI / 2, l.v);
  };
  inCell('leafA', spray(34, [52, 80], 0.3, 92));
  inCell('leafB', spray(26, [60, 92], 0.34, 84));
  inCell('fine', spray(120, [20, 31], 0.36, 150));
  // a conifer's spray: twigs fanning up from the stalk, needles down both sides of each
  inCell('needle', (w, h) => {
    const twigs = 7;
    for (let i = 0; i < twigs; i++) {
      const t = i / (twigs - 1) - 0.5;
      const a = -Math.PI / 2 + t * 1.75, L = 226 - Math.abs(t) * 150, v = 150 + r() * 95;
      const ox = w / 2, oy = h - 10;
      g.strokeStyle = grey(v * 0.6);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a) * L, oy + Math.sin(a) * L);
      g.stroke();
      g.lineWidth = 3.4;
      for (let d = 14; d < L; d += 6.5) {
        const px = ox + Math.cos(a) * d, py = oy + Math.sin(a) * d;
        const nl = (20 + r() * 12) * (1 - (d / L) * 0.45);
        g.strokeStyle = grey(v * (0.82 + r() * 0.3));
        for (const side of [-1, 1]) {
          const na = a + side * (0.62 + r() * 0.2);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
          g.stroke();
        }
      }
    }
  });
  // a palm frond: the rib along the middle, leaflets raked forward on both sides, longest half way out
  inCell('frond', (w, h) => {
    const y0 = h / 2;
    g.strokeStyle = grey(165);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(8, y0);
    g.lineTo(w - 14, y0);
    g.stroke();
    for (let x = 18; x < w - 22; x += 10.5) {
      const t = x / w;
      const L = 104 * Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI), 0.55) + 12;
      for (const side of [-1, 1]) leaf(x, y0, L * (0.9 + r() * 0.2), 6.2, -Math.PI / 2 + side * (0.95 + r() * 0.12), 150 + r() * 105);
    }
  });
  inCell('solid', (w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); });
  // dry scrub: thin forking twigs with a few small leaves
  inCell('twig', (w, h) => {
    const branch = (x: number, y: number, a: number, L: number, depth: number) => {
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      g.strokeStyle = grey(150 + r() * 60);
      g.lineWidth = 2.4 + depth * 1.1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      for (let d = 0.3; d < 1; d += 0.16) leaf(x + (x2 - x) * d, y + (y2 - y) * d, 15 + r() * 9, 5.5, a - Math.PI / 2 + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), 170 + r() * 85);
      if (depth > 0) for (const s of [-1, 1]) branch(x2, y2, a + s * (0.3 + r() * 0.4), L * (0.62 + r() * 0.2), depth - 1);
    };
    for (let i = 0; i < 5; i++) branch(w / 2 + (i - 2) * 9, h - 10, -Math.PI / 2 + (i - 2) * 0.33, 62 + r() * 26, 2);
  });
  // where nothing is drawn the colour is the leaves' grey (not black), so the cut-out edges don't go dark
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 8) { d[i] = d[i + 1] = d[i + 2] = 190; d[i + 3] = 0; }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer), W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.userData.shared = true;
  leafTex = t;
  return t;
}

// ── the materials ─────────────────────────────────────────────────────────────────────────────
/** How strongly the foliage moves (0 with reduced motion). */
export const treeUniforms = { uTreeSway: { value: 1 } };
let foliage: THREE.MeshStandardMaterial | null = null;
/** Every tree and bush: the leaf sheet cut out by its alpha, coloured by the vertices, moved by the wind. */
export function foliageMaterial(): THREE.MeshStandardMaterial {
  if (foliage) return foliage;
  const m = new THREE.MeshStandardMaterial({ map: leafTexture(), vertexColors: true, alphaTest: 0.4, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTreeSway = treeUniforms.uTreeSway;
    sh.uniforms.uCloudTime = cloudUniforms.uCloudTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway; uniform float uTreeSway; uniform float uCloudTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // the crown leans with the gusts; the leaf sprays (sway >= 1) flutter on top of that
          #ifdef USE_INSTANCING
            vec3 swP = (instanceMatrix * vec4(position, 1.0)).xyz;
          #else
            vec3 swP = position;
          #endif
          float swA = uCloudTime * 1.15 + swP.x * 0.07 + swP.z * 0.05;
          float gust = sin(swA) * 0.6 + sin(swA * 2.3 + 1.7) * 0.4;
          // (the whole part says whether it is a spray, the fraction how far up the tree it is)
          float lean = fract(sway);
          float flut = step(1.0, sway) * (0.4 + lean);
          transformed.x += uTreeSway * (lean * lean * 0.05 * gust + flut * 0.035 * sin(uCloudTime * 3.1 + swP.x * 2.1 + swP.y * 1.3));
          transformed.z += uTreeSway * (lean * lean * 0.03 * sin(swA * 0.8 + 0.9) + flut * 0.03 * sin(uCloudTime * 2.7 + swP.z * 2.3 + swP.y * 1.9));
        }`);
  };
  m.customProgramCacheKey = () => 'kp-foliage';
  m.userData.shared = true;
  foliage = withClouds(m);
  return foliage;
}
let stone: THREE.MeshStandardMaterial | null = null;
function stoneMaterial() {
  stone ??= withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  stone.userData.shared = true;
  return stone;
}

// ── the builder ───────────────────────────────────────────────────────────────────────────────
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A unit icosphere's corners and faces, by detail. */
const icos = new Map<number, { p: THREE.Vector3[]; idx: number[] }>();
function ico(detail: number) {
  let o = icos.get(detail);
  if (!o) {
    const raw = new THREE.IcosahedronGeometry(1, detail);
    raw.deleteAttribute('normal');
    raw.deleteAttribute('uv');
    const g = mergeVertices(raw, 1e-4);
    const pos = g.attributes.position;
    o = { p: Array.from({ length: pos.count }, (_, i) => V(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()), idx: Array.from(g.index!.array) };
    icos.set(detail, o);
    raw.dispose();
    g.dispose();
  }
  return o;
}

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  colr: number[] = [];
  uv: number[] = [];
  sway: number[] = [];
  idx: number[] = [];
  /** The tree's height, for how much each part sways. */
  H = 4;
  private solidUV: [number, number];
  constructor(readonly r: () => number, readonly seed: number) {
    const s = cellUV('solid');
    this.solidUV = [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2];
  }

  vert(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, k: number, u: number, v: number, sw: number) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.colr.push(c.r * k, c.g * k, c.b * k);
    this.uv.push(u, v);
    this.sway.push(sw);
    return this.pos.length / 3 - 1;
  }

  /** How far a point leans with the wind: nothing at the foot, all of it at the top. */
  lean(y: number) { return Math.min(0.99, smooth01(0.12, 1, y / this.H)); }

  /**
   * A tapering tube along a path (a trunk, a limb, a cactus): `ribs` > 0 flutes it. `paint(t, j)` gives the colour
   * and shade along it (t: 0 at the start, 1 at the end; j: which side).
   */
  tube(path: THREE.Vector3[], radii: number[], sides: number, paint: (t: number, j: number) => [THREE.Color, number], o: { ribs?: number; cap?: boolean; sway?: number } = {}) {
    const base = this.pos.length / 3;
    const n = path.length;
    let ref = V(1, 0, 0);
    const tan = V(), a = V(), b = V(), p = V(), nn = V();
    for (let i = 0; i < n; i++) {
      tan.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize();
      // carry the frame along (no twist): the last ring's reference, squared to the new direction
      a.copy(ref).addScaledVector(tan, -ref.dot(tan));
      if (a.lengthSq() < 1e-6) a.set(0, 0, 1).addScaledVector(tan, -tan.z);
      a.normalize();
      ref = a.clone();
      b.crossVectors(tan, a);
      const t = n > 1 ? i / (n - 1) : 0;
      for (let j = 0; j < sides; j++) {
        const ang = (j / sides) * Math.PI * 2;
        const rr = radii[i] * (1 + (o.ribs ?? 0) * (j % 2 ? 1 : -1));
        nn.copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
        p.copy(path[i]).addScaledVector(nn, rr);
        const [c, k] = paint(t, j);
        this.vert(p, nn, c, k, this.solidUV[0], this.solidUV[1], (o.sway ?? 1) * this.lean(p.y));
      }
    }
    for (let i = 0; i + 1 < n; i++)
      for (let j = 0; j < sides; j++) {
        const q0 = base + i * sides + j, q1 = base + i * sides + ((j + 1) % sides), q2 = q0 + sides, q3 = q1 + sides;
        this.idx.push(q0, q1, q2, q1, q3, q2);
      }
    if (o.cap) {
      const [c, k] = paint(1, 0);
      const top = this.vert(path[n - 1], tan, c, k, this.solidUV[0], this.solidUV[1], (o.sway ?? 1) * this.lean(path[n - 1].y));
      for (let j = 0; j < sides; j++) this.idx.push(base + (n - 1) * sides + j, base + (n - 1) * sides + ((j + 1) % sides), top);
    }
  }

  /** A lumpy ball of foliage (the dark heart of a crown, or a whole far-off crown), shaded as part of the crown round `cc`. */
  blob(c: THREE.Vector3, rad: number, detail: number, squash: number, light: THREE.Color, dark: THREE.Color, cc: THREE.Vector3, lumps = 0.5) {
    const { p, idx } = ico(detail);
    const base = this.pos.length / 3;
    const sd = this.seed + Math.round(c.x * 31 + c.y * 17 + c.z * 13);
    const q = V(), n = V(), cl = new THREE.Color();
    for (const d of p) {
      const k = 1 + (noise(d.x * 2.3 + d.z * 1.3 + 9, d.y * 2.3 - d.z * 1.1 + 5, sd) - 0.5) * lumps + (noise(d.x * 5.1 + 3, d.y * 5.1 + d.z * 4.3, sd + 7) - 0.5) * lumps * 0.45;
      q.set(c.x + d.x * rad * k, c.y + d.y * rad * k * squash, c.z + d.z * rad * k);
      n.copy(q).sub(cc).normalize().lerp(d, 0.45).addScaledVector(UP, 0.2).normalize();
      const up = smooth01(-0.7, 0.75, d.y);
      cl.copy(dark).lerp(light, up);
      this.vert(q, n, cl, 0.86 + noise(d.x * 9, d.y * 9 + d.z * 7, sd + 3) * 0.28, this.solidUV[0], this.solidUV[1], this.lean(q.y));
    }
    for (const i of idx) this.idx.push(base + i);
  }

  /**
   * A leaf spray: a card facing `face`, `w` × `h`, turned `roll` about its own normal. Seen from both sides, shaded
   * by `n` (the crown's own roundness, not the card's flatness). `foot`: the card grows from the point instead of
   * being centred on it (a needle spray from its stalk, a frond from the crown).
   */
  card(at: THREE.Vector3, face: THREE.Vector3, w: number, h: number, roll: number, cell: Cell, c: THREE.Color, k: number, n: THREE.Vector3, o: { foot?: boolean; along?: THREE.Vector3; sway?: number } = {}) {
    const f = face.clone().normalize();
    // across and up the card
    const t = o.along ? V().crossVectors(o.along, f) : V().crossVectors(UP, f);
    if (t.lengthSq() < 1e-5) t.set(1, 0, 0);
    t.normalize();
    const b = V().crossVectors(f, t).normalize();
    if (!o.along && roll) { const c2 = Math.cos(roll), s2 = Math.sin(roll); const t2 = t.clone().multiplyScalar(c2).addScaledVector(b, s2); b.multiplyScalar(c2).addScaledVector(t, -s2); t.copy(t2); }
    const [u0, v0, u1, v1] = cellUV(cell);
    const y0 = o.foot ? 0 : -h / 2, y1 = o.foot ? h : h / 2;
    const corners: [number, number, number, number][] = [[-w / 2, y0, u0, v1], [w / 2, y0, u1, v1], [w / 2, y1, u1, v0], [-w / 2, y1, u0, v0]];
    const p = V();
    const i0 = this.pos.length / 3;
    for (const [x, y, u, v] of corners) {
      p.copy(at).addScaledVector(t, x).addScaledVector(b, y);
      this.vert(p, n, c, k, u, v, 1 + (o.sway ?? 1) * this.lean(p.y));
    }
    // both faces, one set of normals
    this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3, i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
  }

  /** A long card bent along a curve (a palm frond, a blade of grass): `pts` down its middle, `w` wide. */
  strip(pts: THREE.Vector3[], w: (t: number) => number, side: THREE.Vector3, cell: Cell, paint: (t: number) => [THREE.Color, number], n: (t: number) => THREE.Vector3, sway = 1) {
    const [u0, v0, u1, v1] = cellUV(cell);
    const i0 = this.pos.length / 3;
    const p = V();
    pts.forEach((c, i) => {
      const t = i / (pts.length - 1);
      const [cl, k] = paint(t);
      for (const s of [-1, 1]) {
        p.copy(c).addScaledVector(side, s * w(t) / 2);
        this.vert(p, n(t), cl, k, u0 + (u1 - u0) * t, s < 0 ? v0 : v1, 1 + Math.min(0.99, sway * this.lean(p.y)));
      }
    });
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = i0 + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.shared = true;
    return g;
  }
}

// ── the parts of a tree ───────────────────────────────────────────────────────────────────────
interface Clump { c: THREE.Vector3; r: number; squash?: number }
interface Leaves {
  light: Paint; dark: Paint; core: Paint;
  cells: Cell[];
  /** Sprays per clump, and their size as a share of the clump's radius. */
  n: number; size: number;
  /** How open the crown is (0 = a solid heart in every clump, 1 = none). */
  airy?: number;
  /** Lay the sprays flat (an acacia's table top). */
  flat?: boolean;
}

/** Bark: the colour broken up along and round the trunk, darker at the foot. */
function bark(c: Paint, seed: number, streak = 0.22): (t: number, j: number) => [THREE.Color, number] {
  const base = col(c).clone();
  return (t, j) => [base, (0.78 + 0.3 * smooth01(0, 0.25, t)) * (1 - streak / 2 + streak * noise(j * 1.7 + seed, t * 9, seed))];
}

/** The crown: each clump a dark heart (near) under a shell of leaf sprays, or a plain lumpy ball (far). */
function crown(b: Builder, clumps: Clump[], L: Leaves, far: boolean) {
  const r = b.r;
  const light = col(L.light), dark = col(L.dark), core = col(L.core);
  // the crown's middle and reach: what the shading is rounded about
  const cc = V();
  for (const cl of clumps) cc.add(cl.c);
  cc.multiplyScalar(1 / clumps.length);
  let cr = 0.5, lo = Infinity, hi = -Infinity;
  for (const cl of clumps) { cr = Math.max(cr, cl.c.distanceTo(cc) + cl.r); lo = Math.min(lo, cl.c.y - cl.r * (cl.squash ?? 1)); hi = Math.max(hi, cl.c.y + cl.r * (cl.squash ?? 1)); }
  const shadeC = V(cc.x, lo + (hi - lo) * 0.3, cc.z);
  if (far) {
    // (in the full crown's average colour: its sprays have dark gaps between them, a plain ball has none)
    for (const cl of clumps) b.blob(cl.c, cl.r * 1.02, b.H < 2 ? 0 : 1, cl.squash ?? 1, light.clone().lerp(dark, 0.6), core.clone().lerp(dark, 0.35), shadeC, 0.55);
    return;
  }
  const d = V(), p = V(), n = V(), face = V(), c = new THREE.Color();
  for (const cl of clumps) {
    const sq = cl.squash ?? 1;
    if (r() >= (L.airy ?? 0)) b.blob(cl.c, cl.r * 0.66, 1, sq, dark.clone().lerp(core, 0.35), core, shadeC, 0.4);
    const count = Math.round(L.n * (0.85 + r() * 0.3) * Math.max(0.5, cl.r));
    for (let i = 0; i < count; i++) {
      // spread evenly round the clump (a golden-angle spiral), thinner underneath
      const y = 1 - ((i + 0.5) / count) * 1.72;
      const rad = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.39996 + r() * 0.6;
      d.set(Math.cos(th) * rad, y, Math.sin(th) * rad);
      const out = 0.8 + r() * 0.3;
      p.set(cl.c.x + d.x * cl.r * out, cl.c.y + d.y * cl.r * out * sq, cl.c.z + d.z * cl.r * out);
      face.copy(d).add(V((r() - 0.5) * 0.9, (r() - 0.5) * 0.9 + (L.flat ? 1.6 : 0.25), (r() - 0.5) * 0.9));
      // lit as part of the whole crown: brighter up and out, darker inside and under
      const t = smooth01(-0.15, 1, (p.y - lo) / Math.max(0.1, hi - lo)) * 0.75 + smooth01(0.3, 1, p.distanceTo(shadeC) / cr) * 0.25;
      c.copy(dark).lerp(light, Math.min(1, t * 0.85 + r() * 0.25));
      n.copy(p).sub(shadeC).normalize().addScaledVector(UP, 0.35).normalize();
      const size = cl.r * L.size * (0.8 + r() * 0.45);
      b.card(p, face, size, size, r() * Math.PI * 2, L.cells[Math.floor(r() * L.cells.length)], c, 0.72 + t * 0.36 + (r() - 0.5) * 0.1, n);
    }
  }
}

/** A trunk up to a fork, and a limb from the fork into each clump. */
function limbs(b: Builder, foot: THREE.Vector3, fork: THREE.Vector3, r0: number, clumps: Clump[], paint: (t: number, j: number) => [THREE.Color, number], far: boolean, bend = 0.12) {
  const r = b.r;
  const mid = foot.clone().lerp(fork, 0.5).add(V((r() - 0.5) * bend, 0, (r() - 0.5) * bend));
  const sides = far ? 5 : 8;
  // a flare at the roots
  b.tube([foot.clone().add(V(0, -0.15, 0)), foot.clone().add(V(0, 0.12, 0)), mid, fork], [r0 * 1.55, r0 * 1.08, r0 * 0.9, r0 * 0.74], sides, paint);
  if (far) return;
  for (const cl of clumps) {
    const end = cl.c.clone().add(V(0, cl.r * 0.1, 0));
    const m = fork.clone().lerp(end, 0.5).add(V(0, fork.distanceTo(end) * 0.12, 0));
    const lr = r0 * (0.4 + 0.22 * Math.min(1, cl.r));
    b.tube([fork.clone().add(V(0, -0.05, 0)), m, end], [lr, lr * 0.72, lr * 0.3], 5, (t, j) => { const [c, k] = paint(0.5 + t * 0.5, j); return [c, k * 0.92]; });
  }
}

// ── the kinds ─────────────────────────────────────────────────────────────────────────────────
const BROAD: Leaves = { light: '#7fa648', dark: '#3f6a2c', core: '#243f1e', cells: ['leafA', 'leafB'], n: 30, size: 0.95 };

function broadleafTree(b: Builder, far: boolean, o: { h: number; trunk: number; r0: number; spread: number; clumps: number; top: number; leaves: Leaves; bark: Paint }) {
  const r = b.r;
  b.H = o.h;
  const fork = V((r() - 0.5) * 0.25, o.trunk, (r() - 0.5) * 0.25);
  const clumps: Clump[] = [{ c: V((r() - 0.5) * 0.3, o.h - o.top, (r() - 0.5) * 0.3), r: o.top }];
  const a0 = r() * 6.28;
  for (let i = 0; i < o.clumps; i++) {
    const a = a0 + (i / o.clumps) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const rad = o.top * (0.62 + r() * 0.24), d = o.spread * (0.8 + r() * 0.35);
    clumps.push({ c: V(Math.cos(a) * d, o.trunk + (o.h - o.trunk) * (0.3 + r() * 0.25), Math.sin(a) * d), r: rad, squash: 0.85 + r() * 0.2 });
  }
  limbs(b, V(), fork, o.r0, clumps, bark(o.bark, b.seed), far);
  crown(b, clumps, o.leaves, far);
}

function pineTree(b: Builder, far: boolean, v: number) {
  const r = b.r;
  const H = 4.4 + (v - 1) * 0.35;
  b.H = H;
  const lean = V((r() - 0.5) * 0.14, 0, (r() - 0.5) * 0.14);
  const at = (t: number) => V(lean.x * t * t * H, t * H, lean.z * t * t * H);
  const brk = bark('#93604a', b.seed, 0.3);
  b.tube([at(-0.03), at(0.03), at(0.35), at(0.7), at(0.97)], [0.24, 0.16, 0.12, 0.075, 0.02], far ? 5 : 7, brk);
  const light = col('#4f8a5c'), dark = col('#27503c'), core = col('#17332a');
  const tiers = far ? 5 : 8 + (v % 2);
  const y0 = H * (0.2 + v * 0.03);
  const c = new THREE.Color(), n = V(), out = V();
  if (far) {
    // skirts of boughs, one over the next: fluted cones, dark under the rim
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers, y = y0 + (H - y0) * t, reach = 1.5 * (1 - t * 0.82), hh = (H - y0) / tiers * 1.9;
      const p0 = at(y / H), p1 = at(Math.min(1, (y + hh) / H));
      b.tube([V(p0.x, y - 0.12, p0.z), V(p0.x, y + hh * 0.35, p0.z), V(p1.x, y + hh, p1.z)], [reach, reach * 0.55, 0.03], 9, (tt, j) => [c.copy(dark).lerp(light, tt * 0.8 + (j % 2) * 0.2).clone(), 0.8 + tt * 0.3], { ribs: 0.16 });
    }
    return;
  }
  // the dark heart round the trunk
  b.tube([at(y0 / H), at(0.55), at(0.98)], [0.5, 0.36, 0.03], 7, (t) => [core, 0.9 + t * 0.2], { ribs: 0.12 });
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y = y0 + (H * 0.97 - y0) * t;
    const reach = (1.55 - t * 1.2) * (0.9 + r() * 0.2);
    const boughs = t > 0.8 ? 4 : 6;
    const a0 = r() * 6.28;
    const ctr = at(y / H);
    for (let k = 0; k < boughs; k++) {
      const a = a0 + (k / boughs) * Math.PI * 2 + (r() - 0.5) * 0.4;
      // out from the trunk and drooping, more so lower down; the top ones reach up
      const droop = 0.42 - t * 0.75 + (r() - 0.5) * 0.15;
      out.set(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop));
      const face = V().crossVectors(out, V(-Math.sin(a), 0, Math.cos(a))).normalize();
      if (face.y < 0) face.negate();
      n.set(Math.cos(a) * 0.6, 0.75, Math.sin(a) * 0.6).normalize();
      c.copy(dark).lerp(light, 0.25 + t * 0.35 + r() * 0.3);
      b.card(V(ctr.x + Math.cos(a) * 0.08, y, ctr.z + Math.sin(a) * 0.08), face, reach * 0.95, reach, 0, 'needle', c.clone(), 0.78 + t * 0.3 + (r() - 0.5) * 0.1, n.clone(), { foot: true, along: out.clone() });
    }
  }
  // the leader
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + r();
    out.set(Math.cos(a) * 0.28, 0.96, Math.sin(a) * 0.28).normalize();
    b.card(at(0.9), V(-Math.sin(a), 0.1, Math.cos(a)), 0.5, 0.75, 0, 'needle', light.clone(), 1.05, V(Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4).normalize(), { foot: true, along: out.clone() });
  }
}

function palmTree(b: Builder, far: boolean, v: number) {
  const r = b.r;
  const H = 5.2 + v * 0.5;
  b.H = H + 1;
  const bendA = r() * 6.28, bend = 0.5 + r() * 0.45;
  const at = (t: number) => V(Math.cos(bendA) * bend * t * t, t * H, Math.sin(bendA) * bend * t * t);
  const light = col('#9a7a55'), darkB = col('#6f5740');
  const n = far ? 5 : 11;
  // a ringed trunk: old frond scars
  b.tube(Array.from({ length: n }, (_, i) => at(i / (n - 1))), Array.from({ length: n }, (_, i) => (i === 0 ? 0.3 : 0.2 - (i / n) * 0.07) * (far ? 1 : 1 + (i % 2) * 0.08)), far ? 5 : 8, (t, j) => [Math.round(t * (n - 1)) % 2 ? light : darkB, 0.85 + noise(j, t * 20, b.seed) * 0.25]);
  const top = at(1);
  const leafL = col('#7fae4a'), leafD = col('#3f7a36');
  const fronds = far ? 8 : 13;
  const side = V(), c = new THREE.Color();
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + r() * 0.4;
    // young fronds stand up, old ones hang
    const up = 1.05 - (k % 3) * 0.55 + (r() - 0.5) * 0.2, L = 2.5 + r() * 0.6;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const pts: THREE.Vector3[] = [];
    const segs = far ? 3 : 7;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // an arc: out along `dir`, up at first, drooping under its own weight
      pts.push(V(top.x + dir.x * L * t, top.y + 0.15 + Math.sin(up) * L * t - 1.25 * t * t * L * 0.55, top.z + dir.z * L * t));
    }
    side.set(-dir.z, 0, dir.x);
    const shade = 0.75 + (up > 0.6 ? 0.3 : up > 0.2 ? 0.15 : 0);
    b.strip(pts, (t) => (far ? 0.75 * (1 - t * 0.8) : 1.25), side.clone(), far ? 'solid' : 'frond', (t) => [c.copy(leafD).lerp(leafL, 0.3 + t * 0.5 + (up > 0.5 ? 0.2 : 0)).clone(), shade], () => V(dir.x * 0.35, 0.9, dir.z * 0.35).normalize());
  }
  if (!far) {
    // the crown shaft and a few coconuts
    b.blob(top.clone().add(V(0, 0.05, 0)), 0.3, 1, 1.2, col('#8a9a52'), col('#5c5a34'), top, 0.2);
    for (let k = 0; k < 4; k++) b.blob(top.clone().add(V(Math.cos(k * 1.7) * 0.26, -0.22, Math.sin(k * 1.7) * 0.26)), 0.13, 0, 1, col('#6a5232'), col('#4a3a24'), top, 0.1);
  }
}

function cactus(b: Builder, far: boolean, v: number) {
  const r = b.r;
  b.H = 99;
  const H = 3.5 + v * 0.35;
  const crest = col('#7a9c62'), valley = col('#4a6f44');
  const sides = far ? 8 : 16;
  const paint = (t: number, j: number): [THREE.Color, number] => [j % 2 ? crest : valley, 0.85 + t * 0.2];
  // a column with a rounded top
  const column = (path: THREE.Vector3[], rad: number) => {
    const last = path[path.length - 1], prev = path[path.length - 2];
    const dir = last.clone().sub(prev).normalize();
    const pts = [...path], radii = path.map(() => rad);
    radii[0] = rad * 0.9;
    for (const [d, k] of [[0.45, 0.88], [0.8, 0.55], [0.98, 0.12]] as const) { pts.push(last.clone().addScaledVector(dir, rad * d)); radii.push(rad * k); }
    b.tube(pts, radii, sides, paint, { ribs: 0.09, cap: true, sway: 0 });
  };
  column([V(0, -0.1, 0), V(0, H * 0.5, 0), V(0, H, 0)], 0.33);
  const arms = v === 2 ? 3 : v === 1 ? 1 : 2;
  for (let i = 0; i < arms; i++) {
    const a = r() * 6.28 + i * 2.2, y = H * (0.3 + r() * 0.25), up = 0.9 + r() * 0.9, d = 0.72 + r() * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a);
    column([V(dx * 0.2, y, dz * 0.2), V(dx * d * 0.75, y + 0.06, dz * d * 0.75), V(dx * d, y + 0.38, dz * d), V(dx * d, y + 0.38 + up, dz * d)], 0.21);
  }
}

function barrel(b: Builder, far: boolean, v: number) {
  b.H = 99;
  const crest = col('#86a25e'), valley = col('#4f7242');
  const R = 0.42 + v * 0.06, H = 0.62 + v * 0.12;
  const n = 7;
  b.tube(Array.from({ length: n }, (_, i) => V(0, -0.05 + (i / (n - 1)) * H, 0)), Array.from({ length: n }, (_, i) => R * Math.max(0.12, Math.sin(Math.min(1, 0.22 + (i / (n - 1)) * 0.8) * Math.PI) ** 0.6)), far ? 8 : 16, (t, j) => [j % 2 ? crest : valley, 0.82 + t * 0.25], { ribs: 0.12, cap: true, sway: 0 });
  if (!far) b.blob(V(0, H - 0.02, 0), 0.11, 0, 0.7, col(v ? '#e8c14a' : '#e06a9a'), col('#b04a6a'), V(0, H - 0.3, 0), 0.2);
}

function shrub(b: Builder, far: boolean, v: number, dry: boolean) {
  const r = b.r;
  b.H = 1.6;
  const L: Leaves = dry
    ? { light: '#a3a886', dark: '#6f7a5c', core: '#4f5a44', cells: ['twig', 'fine'], n: 26, size: 1.25, airy: 0.5 }
    : { light: '#7e9a44', dark: '#48682e', core: '#22361c', cells: ['fine', 'leafA'], n: 40, size: 1.15 };
  const lobes = 2 + ((v + 1) % 3);
  const clumps: Clump[] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * 6.28 + r(), d = i ? 0.3 + r() * 0.16 : 0;
    const rad = (i ? 0.36 : 0.5) * (0.9 + r() * 0.25) * (dry ? 0.9 : 1);
    clumps.push({ c: V(Math.cos(a) * d, rad * (dry ? 0.62 : 0.8), Math.sin(a) * d), r: rad, squash: dry ? 0.72 : 0.9 });
  }
  if (!far) {
    // a few woody stems at the foot
    const brk = bark(dry ? '#8a7a66' : '#6f5a44', b.seed);
    for (const cl of clumps) b.tube([V(cl.c.x * 0.3, -0.05, cl.c.z * 0.3), V(cl.c.x * 0.8, cl.c.y * 0.6, cl.c.z * 0.8)], [0.05, 0.025], 4, brk);
  }
  crown(b, clumps, L, far);
}

function tuft(b: Builder, v: number) {
  const r = b.r;
  b.H = 0.7;
  const n = 11 + v * 3;
  const green = col('#9aa052'), straw = col('#c4b06a'), root = col('#7a7a3e');
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, out = 0.1 + r() * 0.32, h = 0.38 + r() * 0.34;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const base = V(dir.x * 0.05, 0, dir.z * 0.05);
    const mix2 = r();
    b.strip([base, base.clone().addScaledVector(dir, out * 0.35).add(V(0, h * 0.6, 0)), base.clone().addScaledVector(dir, out).add(V(0, h, 0))], (t) => 0.055 * (1 - t * 0.85), V(-dir.z, 0, dir.x), 'solid',
      (t) => [c.copy(root).lerp(mix2 < 0.5 ? green : straw, t).clone(), 0.8 + t * 0.3], () => UP, 1.4);
  }
}

function rock(v: number, big: boolean): THREE.BufferGeometry {
  // a broken stone: an icosphere pushed about and cut flat underneath, faceted
  const r = rng(900 + v * 13 + (big ? 50 : 0));
  const g = new THREE.IcosahedronGeometry(big ? 1.4 : 0.6, 1);
  const p = g.attributes.position;
  const sx = 1 + r() * 0.35, sz = 0.85 + r() * 0.3, sy = big ? 0.62 + r() * 0.2 : 0.55 + r() * 0.2;
  const sd = 40 + v;
  const cols = new Float32Array(p.count * 3);
  const base = col(big ? '#8a7a72' : '#a08d84');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.8 + noise(x * 1.9 + 3, z * 1.9 + y * 1.3, sd) * 0.45;
    // a few flat breaks: snap the lumps to steps
    const q = Math.round(k * 5) / 5 * 0.6 + k * 0.4;
    p.setXYZ(i, x * q * sx, Math.max((big ? -0.25 : -0.1), y * q * sy) + (big ? 0.4 : 0.18), z * q * sz);
  }
  const ng = g.toNonIndexed();
  const np = ng.attributes.position;
  for (let i = 0; i < np.count; i += 3) {
    const k = 0.84 + r() * 0.3, top = (np.getY(i) + np.getY(i + 1) + np.getY(i + 2)) / 3;
    const lift = 0.9 + smooth01(0, big ? 1.2 : 0.5, top) * 0.18;
    for (let j = 0; j < 3; j++) cols.set([base.r * k * lift, base.g * k * lift, base.b * k * lift * 0.98], (i + j) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(cols.slice(0, np.count * 3), 3));
  ng.deleteAttribute('uv');
  ng.computeVertexNormals();
  ng.computeBoundingSphere();
  ng.userData.shared = true;
  return ng;
}

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * One kind's geometry (its `variant`, near or `far`), base at y = 0; about as tall as the old kinds were at scale 1
 * (a pine 4.4, a broadleaf 4.2, an oak 6.5, a palm 6), so placements keep their sizes.
 */
export function treeGeometry(kind: TreeKind, variant = 0, far = false): THREE.BufferGeometry {
  const v = ((variant % VARIANTS[kind]) + VARIANTS[kind]) % VARIANTS[kind];
  const key = `${kind}:${v}:${far ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let g: THREE.BufferGeometry;
  if (kind === 'rock' || kind === 'boulder') g = rock(v, kind === 'boulder');
  else {
    const seed = 100 + v * 37 + kind.length * 7 + kind.charCodeAt(0);
    const b = new Builder(rng(seed), seed);
    switch (kind) {
      case 'broadleaf': broadleafTree(b, far, { h: 4.2 + v * 0.25, trunk: 1.35 + v * 0.12, r0: 0.17, spread: 0.95, clumps: 3 + (v % 2), top: 1.12, leaves: BROAD, bark: '#8a6a52' }); break;
      case 'oak': broadleafTree(b, far, { h: 6.4 + v * 0.3, trunk: 1.9 + v * 0.15, r0: 0.3, spread: 1.75, clumps: 5 + (v % 2), top: 1.6, leaves: { ...BROAD, light: '#76a046', dark: '#3a6630', n: 34, size: 0.82 }, bark: '#84695a' }); break;
      case 'blob': broadleafTree(b, far, { h: 2.9 + v * 0.15, trunk: 0.85, r0: 0.12, spread: 0.5, clumps: 2, top: 0.95, leaves: { ...BROAD, light: '#86aa4c', dark: '#4a7632', n: 34, size: 0.9 }, bark: '#8c6c50' }); break;
      case 'birch': {
        b.H = 4.3;
        const r = b.r;
        const lean = (r() - 0.5) * 0.5;
        const white = col('#ece6da'), mark = col('#3b3632');
        // a slim white stem with dark scars
        const stem = [V(0, -0.1, 0), V(lean * 0.1, 0.8, 0), V(lean * 0.4, 2.0, 0.05), V(lean * 0.6, 3.1, 0.08)];
        b.tube(stem, [0.14, 0.1, 0.075, 0.04], far ? 5 : 7, (t, j) => [noise(j * 3.1 + v, t * 17, 77 + v) > 0.74 ? mark : white, 0.86 + 0.18 * noise(j, t * 5, 5)]);
        const clumps: Clump[] = [];
        for (let i = 0; i < 4; i++) clumps.push({ c: V(lean * (0.3 + i * 0.12) + (r() - 0.5) * 0.7, 2.0 + i * 0.6, (r() - 0.5) * 0.7), r: 0.78 - i * 0.09, squash: 1.1 });
        if (!far) for (const cl of clumps.slice(0, 3)) b.tube([V(lean * 0.4, cl.c.y - 0.5, 0.05), cl.c], [0.035, 0.015], 4, () => [white, 0.8]);
        crown(b, clumps, { light: '#a9c25a', dark: '#5f8a3a', core: '#3a5a2a', cells: ['fine'], n: 30, size: 1.25, airy: 0.6 }, far);
        break;
      }
      case 'acacia':
      case 'mesquite': {
        const mesq = kind === 'mesquite';
        const r = b.r;
        b.H = mesq ? 3.2 : 3.0;
        const brk = bark(mesq ? '#6f5a4c' : '#7d6048', b.seed);
        const clumps: Clump[] = [];
        if (mesq) {
          // several stems leaning out from the foot, each under its own cloud of fine leaves
          const stems = 3 + v;
          for (let i = 0; i < stems; i++) {
            const a = (i / stems) * 6.28 + r() * 0.7, d = 1.0 + r() * 0.7, y = 1.9 + r() * 0.7;
            const end = V(Math.cos(a) * d, y, Math.sin(a) * d);
            b.tube([V(Math.cos(a) * 0.08, -0.1, Math.sin(a) * 0.08), V(Math.cos(a) * d * 0.3, y * 0.45, Math.sin(a) * d * 0.3), V(Math.cos(a) * d * 0.75, y * 0.82, Math.sin(a) * d * 0.75), end], [0.15, 0.11, 0.075, 0.035], far ? 4 : 6, brk);
            clumps.push({ c: end.clone().add(V(0, 0.15, 0)), r: 0.95 + r() * 0.3, squash: 0.62 });
            clumps.push({ c: end.clone().add(V(Math.cos(a + 1.3) * 0.8, -0.05, Math.sin(a + 1.3) * 0.8)), r: 0.7 + r() * 0.2, squash: 0.6 });
          }
          crown(b, clumps, { light: '#98a85c', dark: '#5c7440', core: '#3c4c2c', cells: ['fine', 'twig'], n: 24, size: 1.1, airy: 0.65 }, far);
        } else {
          // a leaning trunk forking into a flat table of leaves
          const la = r() * 6.28;
          const fork = V(Math.cos(la) * 0.3, 1.45, Math.sin(la) * 0.3);
          const n = 5 + v;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * 6.28 + r() * 0.5, d = i === 0 ? 0.1 : 1.0 + r() * 0.55;
            clumps.push({ c: V(fork.x + Math.cos(a) * d, 2.5 + r() * 0.2, fork.z + Math.sin(a) * d), r: 0.82 + r() * 0.2, squash: 0.36 });
          }
          limbs(b, V(), fork, 0.16, clumps, brk, far, 0.3);
          crown(b, clumps, { light: '#9aa650', dark: '#5f7436', core: '#3e4e28', cells: ['fine'], n: 26, size: 1.05, airy: 0.4, flat: true }, far);
        }
        break;
      }
      case 'pine': pineTree(b, far, v); break;
      case 'palm': palmTree(b, far, v); break;
      case 'saguaro': cactus(b, far, v); break;
      case 'barrel': barrel(b, far, v); break;
      case 'shrub': shrub(b, far, v, false); break;
      case 'sage': shrub(b, far, v, true); break;
      case 'tuft': tuft(b, v); break;
    }
    g = b.build();
  }
  cache.set(key, g);
  return g;
}

/** Where a tree stands; `rx` tips it (round x, after its spin) to stand square to curved ground. */
export interface Placement { x: number; y: number; z: number; s: number; ry: number; tint?: number; rx?: number }

const hash2 = (x: number, z: number, k: number) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

function field(geo: THREE.BufferGeometry, mat: THREE.Material, at: Placement[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, at.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const c = new THREE.Color();
  at.forEach((p, i) => {
    e.set(p.rx ?? 0, p.ry, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    im.setMatrixAt(i, m);
    // no two quite the same green
    const t = p.tint ?? 1;
    c.setRGB(t * (0.93 + hash2(p.x, p.z, 1) * 0.14), t * (0.95 + hash2(p.x, p.z, 2) * 0.1), t * (0.9 + hash2(p.x, p.z, 3) * 0.2));
    im.setColorAt(i, c);
  });
  im.count = at.length;
  im.castShadow = true;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

const isStone = (k: TreeKind) => k === 'rock' || k === 'boulder';

/**
 * Plants of one kind, a mix of its variants (which one by where it stands). `far`: the plain, cheap ones for the
 * far land. `shadow: false`: ground cover and far trees don't cast.
 */
export function plantField(kind: TreeKind, at: Placement[], o: { far?: boolean; shadow?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = `plants:${kind}${o.far ? ':far' : ''}`;
  const n = VARIANTS[kind];
  const by: Placement[][] = Array.from({ length: n }, () => []);
  for (const p of at) by[Math.floor(hash2(p.x, p.z, 9) * n) % n].push(p);
  by.forEach((list, v) => {
    if (!list.length) return;
    const im = field(treeGeometry(kind, v, !!o.far), isStone(kind) ? stoneMaterial() : foliageMaterial(), list);
    im.castShadow = o.shadow !== false;
    g.add(im);
  });
  return g;
}

/**
 * Instanced plants of one kind as a single mesh (its first variant): the older call, still used by pieces that plant
 * their own. The material argument is no longer used (every plant shares the foliage material).
 */
export function treeField(kind: TreeKind, at: Placement[], _mat?: THREE.Material): THREE.InstancedMesh {
  void _mat;
  return field(treeGeometry(kind, 0, false), isStone(kind) ? stoneMaterial() : foliageMaterial(), at);
}
