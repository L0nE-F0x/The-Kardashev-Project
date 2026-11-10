/**
 * The bust kit's parts bin: palette colours, shared geometries and materials (made once, on first use, and kept),
 * and the small helpers every bust is assembled with. Nothing here needs a DOM: the busts can be built in Node.
 *
 * Units: a head is about 1 unit in radius, centred on the origin, facing +Z; +Y is up.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { KEYS, PALETTE } from '../../render/palette';

// ── colour ──
/** A palette index (`C.*`) as a hex string, from the base palette. */
export const hexOf = (index: number): string => PALETTE[KEYS[index - 1]] ?? '#ff00ff';
const colours = new Map<string, THREE.Color>();
/** A colour from a palette index or a hex string (shared: don't mutate it, `.clone()` first). */
export function colour(c: number | string): THREE.Color {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  let v = colours.get(hex);
  if (!v) colours.set(hex, (v = new THREE.Color(hex)));
  return v;
}
/** A blend of two colours, as a hex string (so it can key the material cache). */
export function blend(a: number | string, b: number | string, t: number): string {
  return '#' + colour(a).clone().lerp(colour(b), t).getHexString();
}
/** Lighter (k > 0) or darker (k < 0), keeping the hue. */
export function shade(c: number | string, k: number): string {
  const v = colour(c).clone();
  const hsl = { h: 0, s: 0, l: 0 };
  v.getHSL(hsl);
  v.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + k)));
  return '#' + v.getHexString();
}

// ── materials ──
const mats = new Map<string, THREE.Material>();
function mat<M extends THREE.Material>(key: string, make: () => M): M {
  let m = mats.get(key) as M | undefined;
  if (!m) mats.set(key, (m = make()));
  return m;
}
/** The figures' paint: matte, no metal. */
export function matte(c: number | string, rough = 0.84): THREE.MeshStandardMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`m:${hex}:${rough}`, () => new THREE.MeshStandardMaterial({ color: colour(hex), roughness: rough, metalness: 0 }));
}
/** A glazed bead: eyes, lenses, polished trim. */
export const gloss = (c: number | string, rough = 0.28) => matte(c, rough);
/** Paint laid thinly over what's under it (blush, stubble, lens tint). */
export function sheer(c: number | string, opacity: number): THREE.MeshStandardMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`s:${hex}:${opacity}`, () => new THREE.MeshStandardMaterial({ color: colour(hex), roughness: 0.9, metalness: 0, transparent: true, opacity, depthWrite: false }));
}
/** Paint that thins out where the geometry says so (a `veil`'s per-vertex alpha): stubble, a shaved head. */
export function tint(c: number | string, opacity: number): THREE.MeshStandardMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`t:${hex}:${opacity}`, () => new THREE.MeshStandardMaterial({ color: colour(hex), roughness: 0.95, metalness: 0, transparent: true, opacity, vertexColors: true, depthWrite: false }));
}
let fade: THREE.DataTexture | null = null;
/** Paint airbrushed on (`geo.plate()`): full in the middle, fading out to the rim. Lit like the rest. */
export function soft(c: number | string, opacity: number): THREE.MeshStandardMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`f:${hex}:${opacity}`, () => {
    if (!fade) {
      const N = 48;
      const data = new Uint8Array(N * N * 4);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2);
        const a = Math.max(0, 1 - d);
        const v = Math.round(255 * a * a * (3 - 2 * a));
        data.set([v, v, v, 255], (y * N + x) * 4);
      }
      fade = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      fade.magFilter = fade.minFilter = THREE.LinearFilter;
      fade.needsUpdate = true;
    }
    return new THREE.MeshStandardMaterial({ color: colour(hex), roughness: 0.9, metalness: 0, transparent: true, opacity, alphaMap: fade, depthWrite: false });
  });
}
/** Something that is a light: unlit, at full strength. */
export function lit(c: number | string, opacity = 1): THREE.MeshBasicMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`l:${hex}:${opacity}`, () => new THREE.MeshBasicMaterial({ color: colour(hex), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }));
}
/** An unlit colour seen from inside (the far wall of a tube you look along). */
export function inside(c: number | string): THREE.MeshBasicMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`i:${hex}`, () => new THREE.MeshBasicMaterial({ color: colour(hex), side: THREE.BackSide, toneMapped: false }));
}
/** Light added on top of what's behind it (auras, beams, the soft part of a glow). */
export function additive(c: number | string, opacity = 1): THREE.MeshBasicMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`a:${hex}:${opacity}`, () => new THREE.MeshBasicMaterial({ color: colour(hex), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
}
/** A soft round glow on a flat disc (`geo.disc()`): bright in the middle, gone at the rim. Additive. */
export function haloMat(c: number | string, strength = 1): THREE.ShaderMaterial {
  const hex = typeof c === 'number' ? hexOf(c) : c;
  return mat(`h:${hex}:${strength}`, () => new THREE.ShaderMaterial({
    uniforms: { uCol: { value: colour(hex) }, uK: { value: strength } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `uniform vec3 uCol; uniform float uK; varying vec2 vUv;
      void main() {
        float d = length( vUv - 0.5 ) * 2.0;
        float a = pow( max( 1.0 - d, 0.0 ), 2.2 ) * uK;
        gl_FragColor = vec4( uCol * a, 1.0 );
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

// ── geometries ──
const geos = new Map<string, THREE.BufferGeometry>();
/** A geometry made once and shared by every bust that asks for the same key. */
export function shared<G extends THREE.BufferGeometry>(key: string, make: () => G): G {
  let g = geos.get(key) as G | undefined;
  if (!g) {
    const t = performance.now();
    geos.set(key, (g = make()));
    const G = globalThis as unknown as { __pg?: Record<string, [number, number]> };
    const kind = key.split(':').slice(0, 2).join(':').replace(/[-.\d]+$/, '');
    const e = ((G.__pg ??= {})[kind] ??= [0, 0]);
    e[0]++;
    e[1] += performance.now() - t;
  }
  return g;
}
export const geo = {
  /** A unit ball for small things (scale it into any ellipsoid). */
  ball: () => shared('ball', () => new THREE.SphereGeometry(1, 20, 14)),
  /** A unit ball for head-sized things. */
  orb: () => shared('orb', () => new THREE.SphereGeometry(1, 48, 32)),
  /** The upper half of a unit ball (domes, hats). */
  dome: () => shared('dome', () => new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)),
  /** A unit cylinder: radius 1, from y = -0.5 to 0.5. */
  cyl: () => shared('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 28)),
  /** A unit cone: base radius 1 at y = 0, the tip at y = 1. */
  cone: () => shared('cone', () => new THREE.ConeGeometry(1, 1, 14).translate(0, 0.5, 0)),
  /** A capsule lying along X: 1 long tip to tip, 0.12 in radius (scale Y/Z for its thickness). */
  pill: () => shared('pill', () => new THREE.CapsuleGeometry(0.12, 0.76, 5, 10).rotateZ(Math.PI / 2)),
  /** A flat unit disc facing +Z, with UVs (for `haloMat`). */
  disc: () => shared('disc', () => new THREE.PlaneGeometry(2, 2)),
  /** A flat round plate facing +Z. */
  plate: () => shared('plate', () => new THREE.CircleGeometry(1, 28)),
  /** A ring in the XY plane: radius 1, tube radius `tube`, optionally only an arc of it (radians, from +X anticlockwise). */
  torus: (tube: number, arc = Math.PI * 2, seg = 48) => shared(`torus:${tube}:${arc.toFixed(3)}:${seg}`, () => new THREE.TorusGeometry(1, tube, 8, seg, arc)),
  /** A box with rounded edges, 1 × 1 × 1. */
  box: (r = 0.12) => shared(`box:${r}`, () => new RoundedBoxGeometry(1, 1, 1, 2, r)),
  /** An eight-sided gem: 1 tall each way from the middle. */
  gem: () => shared('gem', () => new THREE.OctahedronGeometry(1, 0)),
  /** A tube along points (Catmull-Rom), keyed by the caller. */
  tube: (key: string, pts: () => THREE.Vector3[], radius: number, closed = false, seg = 24) =>
    shared(`tube:${key}:${radius}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts(), closed, 'centripetal'), seg, radius, 7, closed)),
};

// ── assembly ──
export type V3 = [number, number, number];
export interface Put {
  /** Scale: one number or [x, y, z]. */
  s?: number | V3;
  /** Euler rotation in radians (XYZ order). */
  r?: V3;
  /** Draw order nudge for see-through layers. */
  order?: number;
  /** Cast no shadow (glows, thin overlays). */
  ghost?: boolean;
}
/** Hang a mesh on a parent at a place. */
export function put(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, p: V3, o: Put = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(p[0], p[1], p[2]);
  if (o.s !== undefined) {
    if (typeof o.s === 'number') mesh.scale.setScalar(o.s);
    else mesh.scale.set(o.s[0], o.s[1], o.s[2]);
  }
  if (o.r) mesh.rotation.set(o.r[0], o.r[1], o.r[2]);
  if (o.order) mesh.renderOrder = o.order;
  const painted = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  mesh.castShadow = painted && !o.ghost && !m.transparent;
  mesh.receiveShadow = painted;
  parent.add(mesh);
  return mesh;
}
/** A soft glow facing the camera's way (+Z in the unturned studio): put these on the unturned part of a shot. */
export function halo(parent: THREE.Object3D, c: number | string, p: V3, size: number, strength = 1): THREE.Mesh {
  return put(parent, geo.disc(), haloMat(c, strength), p, { s: size, ghost: true });
}
export function group(parent: THREE.Object3D, p: V3 = [0, 0, 0], r?: V3): THREE.Group {
  const g = new THREE.Group();
  g.position.set(p[0], p[1], p[2]);
  if (r) g.rotation.set(r[0], r[1], r[2]);
  parent.add(g);
  return g;
}
/** A stick from a to b (a cylinder), e.g. antennas, straps, constellation lines. */
export function stick(parent: THREE.Object3D, m: THREE.Material, a: V3, b: V3, radius: number): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mesh = put(parent, geo.cyl(), m, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { s: [radius, len, radius] });
  mesh.quaternion.setFromUnitVectors(UP, vb.sub(va).normalize());
  return mesh;
}
const UP = new THREE.Vector3(0, 1, 0);

/** Make a hand-built surface face the right way: flip its triangles if `outward(normal, position)` sums negative. */
export function faceOut<G extends THREE.BufferGeometry>(g: G, outward: (n: THREE.Vector3, p: THREE.Vector3) => number): G {
  g.computeVertexNormals();
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < g.attributes.position.count; i++) sum += outward(n.fromBufferAttribute(g.attributes.normal, i), p.fromBufferAttribute(g.attributes.position, i));
  if (sum < 0 && g.index) {
    const idx = g.index;
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** A small repeatable random stream (the busts never use Math.random: a face must come out the same every time). */
export function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A bump: 1 at `x = c`, falling to nothing about `w` away. */
export const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

/** What a builder hands the studio: the whole set (backdrop and figure), ready to photograph. */
export interface Shot {
  root: THREE.Group;
}
