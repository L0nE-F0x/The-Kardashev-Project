/**
 * The 3D look test's shared kit: palette colours, a builder that merges bevelled, hand-painted
 * boxes (and other shapes) into one mesh, and value noise for terrain.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, type ColorKey } from '../render/palette';
import { LAMP_LAYER } from './atmosphere';

export type Paint = ColorKey | THREE.Color | string;

const colorCache = new Map<string, THREE.Color>();
/** A palette key (or hex) as a linear THREE.Color. */
export function col(p: Paint): THREE.Color {
  if (p instanceof THREE.Color) return p;
  const hex = (PALETTE as Record<string, string>)[p] ?? p;
  let c = colorCache.get(hex);
  if (!c) colorCache.set(hex, (c = new THREE.Color(hex)));
  return c;
}
export const mix = (a: Paint, b: Paint, t: number) => col(a).clone().lerp(col(b), t);

// ── random + noise ───────────────────────────────────────────────────────────────────────────
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1]. */
export function noise(x: number, y: number, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, seed = 1, oct = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f, seed + i * 17); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── cloud shadows ────────────────────────────────────────────────────────────────────────────
/** Shared by every lit material: soft cloud shadows drifting over the land (sunlight only). */
export const cloudUniforms = { uCloudTime: { value: 0 }, uCloudK: { value: 0.32 }, uCloudTex: { value: null as THREE.Texture | null } };
function cloudTexture() {
  const n = 256, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // tileable fbm: sample on a torus-ish wrap by blending
      let v = 0, amp = 0.5, f = 1 / 32, tot = 0;
      for (let o = 0; o < 4; o++) {
        const p = n * f;
        const xi = (x * f) % p, yi = (y * f) % p;
        const xa = Math.floor(xi), ya = Math.floor(yi);
        const fx = xi - xa, fy = yi - ya;
        const h = (a: number, b: number) => noise((a % p) + 0.5, (b % p) + 0.5, 300 + o);
        const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
        const val = h(xa, ya) * (1 - u) * (1 - w) + h(xa + 1, ya) * u * (1 - w) + h(xa, ya + 1) * (1 - u) * w + h(xa + 1, ya + 1) * u * w;
        v += val * amp; tot += amp; amp *= 0.5; f *= 2;
      }
      const c = Math.round((v / tot) * 255);
      data.set([c, c, c, 255], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Hook a standard material up to the cloud shadows (chains any existing onBeforeCompile). */
export function withClouds<M extends THREE.MeshStandardMaterial>(m: M): M {
  cloudUniforms.uCloudTex.value ??= cloudTexture();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, cloudUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cwp = instanceMatrix * cwp;
        #endif
        vCloudXZ = (modelMatrix * cwp).xz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ; uniform sampler2D uCloudTex; uniform float uCloudTime; uniform float uCloudK;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float cl = texture2D(uCloudTex, vCloudXZ * 0.0042 + vec2(uCloudTime * 0.006, uCloudTime * 0.0022)).r;
          float sh2 = 1.0 - uCloudK * smoothstep(0.5, 0.66, cl);
          reflectedLight.directDiffuse *= sh2;
          reflectedLight.directSpecular *= sh2;
        }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '-clouds';
  return m;
}

// ── ground grain ─────────────────────────────────────────────────────────────────────────────
let grainTex: THREE.DataTexture | null = null;
/** Tileable noise (r, g: two soft fields; b: fine speckle), shared by the ground, the cliffs and the water. */
export function grainTexture() {
  if (grainTex) return grainTex;
  const n = 256, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      // tileable: wrap the noise lattice at the texture size
      const v = (o: number, f: number) => {
        const p = n / f;
        const xi = x / f, yi = y / f;
        const xa = Math.floor(xi), ya = Math.floor(yi), fx = xi - xa, fy = yi - ya;
        const h = (a: number, b: number) => noise(((a % p) + p) % p + 0.5, ((b % p) + p) % p + 0.5, o);
        const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
        return h(xa, ya) * (1 - u) * (1 - w) + h(xa + 1, ya) * u * (1 - w) + h(xa, ya + 1) * (1 - u) * w + h(xa + 1, ya + 1) * u * w;
      };
      const r = v(1, 4) * 0.5 + v(2, 8) * 0.3 + v(3, 16) * 0.2;
      const g = v(4, 32) * 0.6 + v(5, 64) * 0.4;
      // b: fine speckle (blades and grit up close; it averages out in the mipmaps further off)
      const b = noise(x + 0.5, y + 0.5, 6) * 0.55 + v(7, 2) * 0.45;
      data.set([r * 255, g * 255, b * 255, 255], (y * n + x) * 4);
    }
  grainTex = new THREE.DataTexture(data, n, n);
  grainTex.userData.shared = true;
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.magFilter = THREE.LinearFilter;
  grainTex.minFilter = THREE.LinearMipmapLinearFilter;
  grainTex.generateMipmaps = true;
  grainTex.anisotropy = 8;
  grainTex.needsUpdate = true;
  return grainTex;
}
/** Fine, world-space grain on the ground (dry patches, worn spots), fading with distance. */
export function withGrain<M extends THREE.MeshStandardMaterial>(m: M, k = 0.22): M {
  const tex = grainTexture();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uGrain = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGrainW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainW; uniform sampler2D uGrain;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 a = texture2D(uGrain, vGrainW.xz * 0.011).rg;
          vec2 b = texture2D(uGrain, vGrainW.xz * 0.06 + 0.37).rg;
          float fade = 1.0 - smoothstep(120.0, 520.0, distance(vGrainW, cameraPosition));
          float gr = (a.r - 0.5) * 0.9 + (b.g - 0.5) * 0.7;
          diffuseColor.rgb *= 1.0 + gr * ${k.toFixed(3)} * (0.4 + 0.6 * fade);
          // dry, paler flecks
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.92), smoothstep(0.62, 0.8, b.r) * 0.5 * fade);
          // up close: turf (clumps a few tens of centimetres across, and speckle)
          float nearK = (1.0 - smoothstep(18.0, 120.0, distance(vGrainW, cameraPosition))) * ${Math.min(1, k * 4).toFixed(3)};
          float sp = texture2D(uGrain, vGrainW.xz * 0.12 + 0.11).b;
          float cl = texture2D(uGrain, vGrainW.xz * 0.27 + 0.53).r;
          diffuseColor.rgb *= 1.0 + ((sp - 0.5) * 0.34 + (cl - 0.5) * 0.4) * nearK;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.95, 0.8), smoothstep(0.55, 0.75, cl) * 0.35 * nearK);
        }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '-grain';
  return m;
}

// ── materials ────────────────────────────────────────────────────────────────────────────────
/** The matte vertex-coloured material every code-built piece shares. */
export const paintMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }));
paintMat.userData.shared = true;

/** Glowing bits (windows, beacons, screens): emissive driven by the time of day. */
export function glowMat(c: Paint, base = 0.15) {
  // smooth: by day a window mirrors the sky
  const m = new THREE.MeshStandardMaterial({ color: col(c), emissive: col(c), emissiveIntensity: base, roughness: 0.28 });
  m.userData.glowBase = base;
  m.userData.scope = scope;
  glowMats.push(m);
  return m;
}
export const glowMats: THREE.MeshStandardMaterial[] = [];

/**
 * Night-lit materials belong to the scene that made them: a scene opens a scope, and closing it
 * drops that scene's glows and light pools from the lists the sky drives.
 */
let scope = 0;
let nextScope = 1;
export function openScope() { scope = nextScope++; return scope; }
export function closeScope(id: number) {
  for (const list of [glowMats, poolMats] as THREE.Material[][]) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].userData.scope === id) { list[i].dispose(); list.splice(i, 1); }
  }
  if (scope === id) scope = 0;
}

/**
 * Pools of light at night. They aren't drawn in the view: the scene draws them from above into its lamp field
 * (atmosphere.ts), which then lights the ground, walls, cars and people near each lamp.
 */
let poolTex: THREE.Texture | null = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  // bright under the lamp, then a long soft skirt (roughly the inverse square from a lamp a few metres up)
  for (const [at, a] of [[0, 1], [0.12, 0.86], [0.25, 0.56], [0.4, 0.3], [0.6, 0.12], [0.8, 0.035], [1, 0]]) grd.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.userData.shared = true;
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}
export const poolMats: THREE.MeshBasicMaterial[] = [];
export function poolMat(c: Paint, strength = 0.8) {
  const m = new THREE.MeshBasicMaterial({ color: col(c), map: poolTexture(), transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
  m.userData.strength = strength;
  m.userData.scope = scope;
  poolMats.push(m);
  return m;
}
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function lightPool(parent: THREE.Object3D, x: number, y: number, z: number, r: number, mat: THREE.MeshBasicMaterial, sx = 1) {
  const m = new THREE.Mesh(poolGeo, mat);
  m.scale.set(r * 2 * sx, 1, r * 2);
  m.position.set(x, y + 0.12, z);
  m.layers.set(LAMP_LAYER);
  parent.add(m);
  return m;
}

// ── the builder ──────────────────────────────────────────────────────────────────────────────
export interface BoxOpts {
  /** Bevel radius (default: 6% of the smallest side, capped). 0 = sharp. */
  r?: number;
  ry?: number;
  /** Colour jitter (0 = flat). */
  jitter?: number;
  /** Darken towards the bottom (fake contact shade), 0..1. */
  shade?: number;
  /** Bevel segments (default: 2 on high detail, 1 on medium/low). */
  seg?: number;
}

/** Bevel segments for rounded boxes (the quality presets set it: fewer triangles on phones). */
export const kitDetail = { bevelSeg: 2 };

/**
 * Collects shapes and merges them into one mesh with vertex colours: one draw call per object,
 * and every face gets a little hand-painted variation.
 */
export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  /** Things that go with what this kit builds but can't be merged into it (planting): `build` hangs them on the mesh. */
  extra: THREE.Object3D[] = [];
  constructor(private rand: () => number = rng(7)) {}

  /** Bevelled box, centred at (x, y, z) with y = its bottom. */
  box(w: number, h: number, d: number, paint: Paint, x = 0, y = 0, z = 0, o: BoxOpts = {}) {
    const r = o.r ?? Math.min(0.12, Math.min(w, h, d) * 0.06);
    const g = r > 0.001 ? new RoundedBoxGeometry(w, h, d, o.seg ?? kitDetail.bevelSeg, r) : new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    return this.add(g, paint, o.jitter ?? 0.05, o.shade ?? 0.25, y, h);
  }

  /**
   * A cylinder standing on (x, y, z), `h` tall. With `rx`/`rz` it tips over about its BASE (it grows from the point
   * along the tilted axis), not about its middle.
   */
  cyl(rTop: number, rBot: number, h: number, paint: Paint, x = 0, y = 0, z = 0, seg = 10, o: { rx?: number; rz?: number; jitter?: number; shade?: number } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
    g.translate(0, h / 2, 0);
    if (o.rx) g.rotateX(o.rx);
    if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    return this.add(g, paint, o.jitter ?? 0.04, o.shade ?? 0.2, y, h);
  }

  /** Any geometry already in place. */
  geo(g: THREE.BufferGeometry, paint: Paint, jitter = 0.05, shade = 0) {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    return this.add(g, paint, jitter, shade, bb.min.y, bb.max.y - bb.min.y);
  }

  /** A thin beam between two points (lattice members, rails, wires). */
  beam(a: THREE.Vector3, b: THREE.Vector3, t: number, paint: Paint) {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(t, len, t);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(g, paint, 0.03, 0, Math.min(a.y, b.y), Math.abs(a.y - b.y) + t);
  }

  private add(g: THREE.BufferGeometry, paint: Paint, jitter: number, shade: number, y0: number, h: number) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    const base = col(paint).clone();
    if (jitter) {
      const hsl = { h: 0, s: 0, l: 0 };
      base.getHSL(hsl);
      base.setHSL(hsl.h + (this.rand() - 0.5) * jitter * 0.25, hsl.s * (1 + (this.rand() - 0.5) * jitter * 2), hsl.l * (1 + (this.rand() - 0.5) * jitter * 2));
    }
    const pos = ng.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = h > 0.01 ? (pos.getY(i) - y0) / h : 1;
      const k = 1 - shade * (1 - Math.min(1, Math.max(0, t)));
      colors[i * 3] = base.r * k;
      colors[i * 3 + 1] = base.g * k;
      colors[i * 3 + 2] = base.b * k;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(ng);
    return this;
  }

  get empty() { return this.parts.length === 0; }

  /** One mesh (shadows on). */
  build(mat: THREE.Material = paintMat) {
    const g = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    for (const o of this.extra) m.add(o);
    this.extra = [];
    return m;
  }
}

/** Put an object's shadows on (recursively). */
export function shadows(o: THREE.Object3D, cast = true, receive = true) {
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = cast; c.receiveShadow = receive; } });
  return o;
}

// ── freeing a scene ──────────────────────────────────────────────────────────────────────────
const TEX_KEYS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap', 'displacementMap'] as const;

/**
 * Free what a scene built on the GPU when it goes: geometries, materials (their shader programs), their
 * textures (sign canvases, data textures) and shadow maps. Shared things stay: anything marked
 * `userData.shared` (model geometry and materials, cached kit textures, the Earth's textures) and model
 * images (ImageBitmaps the model cache keeps using).
 */
export function disposeObject(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
  const addTex = (t: unknown) => { if (t && (t as THREE.Texture).isTexture) texs.add(t as THREE.Texture); };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
    const l = o as THREE.DirectionalLight;
    if (l.isLight && l.shadow?.map) l.shadow.dispose();
    // every rigged figure's skeleton holds a bone texture of its own
    const sk = o as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) sk.skeleton?.dispose();
  });
  if (root instanceof THREE.Scene) { addTex(root.background); addTex(root.environment); }
  for (const mat of mats) {
    if (mat.userData.shared) continue;
    const rec = mat as unknown as Record<string, unknown>;
    for (const k of TEX_KEYS) addTex(rec[k]);
    const u = (mat as THREE.ShaderMaterial).uniforms;
    if (u) for (const v of Object.values(u)) addTex(v?.value);
    mat.dispose();
  }
  for (const t of texs) {
    if (t.userData.shared || (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap)) continue;
    t.dispose();
  }
}
