/**
 * Grass for the 3D campuses: clumps of real blades (tapered, curved, dark at the root and sun-bleached at the
 * tip) that sway in the wind, used two ways: a sparse carpet over the whole land (ground.ts), and a dense patch
 * that follows the camera when you zoom in close, so a close-up shows turf rather than bare paint. The patch is
 * laid on a world grid (each cell's clump hashed from the cell), so it never swims as the camera moves, and it
 * thins out at its rim instead of ending in a line.
 */
import * as THREE from 'three';
import { cloudUniforms, col, withClouds, type Paint } from '../kit';

type H = (x: number, z: number) => number;

const hash = (x: number, z: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * One clump: `n` blades from a small base, leaning out and curving over, about 1 unit tall at scale 1.
 * Normals point mostly up, so the blades light like a lawn (no black backs).
 */
export function clumpGeometry(n = 12, seed = 1, height = 0.62): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], colr: number[] = [], idx: number[] = [];
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const SEG = 3;
  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + rnd() * 0.8;
    const rr = Math.sqrt(rnd()) * 0.09;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const lean = 0.25 + rnd() * 0.55;
    const len = height * (0.6 + rnd() * 0.6);
    const w = 0.028 + rnd() * 0.022;
    const face = a + (rnd() - 0.5) * 1.2;
    const dx = Math.cos(a), dz = Math.sin(a);
    const sx = Math.cos(face + Math.PI / 2), sz = Math.sin(face + Math.PI / 2);
    const tipC = 0.92 + rnd() * 0.22;
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      // up, then over: the lean grows with the square of the height
      const y = len * t * (1 - 0.18 * lean * t);
      const out = len * lean * t * t * 0.7;
      const half = w * (1 - t * 0.92);
      const cx = bx + dx * out, cz = bz + dz * out;
      for (const s of [-1, 1]) {
        pos.push(cx + sx * half * s, y, cz + sz * half * s);
        nrm.push(dx * 0.25, 1, dz * 0.25);
        // the root the ground's own colour, the blade catching the light towards a sun-bleached tip
        const k = 0.96 + 0.26 * t;
        const st = Math.max(0, t - 0.55) * 2.2 * (tipC - 0.9);
        colr.push(k * (1 + st * 0.5), k * (1.04 + st * 0.3), k * (0.9 - st * 0.2));
      }
    }
    for (let i = 0; i < SEG; i++) {
      const a0 = base + i * 2;
      idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  const nn = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < nn.count; i++) { const v = new THREE.Vector3(nn.getX(i), nn.getY(i), nn.getZ(i)).normalize(); nn.setXYZ(i, v.x, v.y, v.z); }
  g.computeBoundingSphere();
  return g;
}

/** Fade uniforms for the camera patch: clumps shrink away towards the rim (r <= 0: off). */
export const grassFade = { uGrassC: { value: new THREE.Vector2() }, uGrassR: { value: 0 } };

/** Wind in the plants: the higher a vertex, the more it sways (instanced: phase from the instance's place). */
export function withSway<M extends THREE.MeshStandardMaterial>(m: M, amount = 0.08, fade = false): M {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uCloudTime = cloudUniforms.uCloudTime;
    if (fade) Object.assign(sh.uniforms, grassFade);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uCloudTime;${fade ? '\nuniform vec2 uGrassC; uniform float uGrassR;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 iw = vec3(0.0);
          #ifdef USE_INSTANCING
            iw = instanceMatrix[3].xyz;
          #endif
          ${fade ? `if (uGrassR > 0.0) { float e = distance(iw.xz, uGrassC) / uGrassR; transformed *= 1.0 - smoothstep(0.4, 1.0, e); }` : ''}
          float hgt = max(transformed.y, 0.0);
          float gust = 0.6 + 0.4 * sin(uCloudTime * 0.37 + iw.x * 0.021 + iw.z * 0.013);
          float ph = uCloudTime * 1.9 + iw.x * 0.31 + iw.z * 0.23;
          float bend = hgt * hgt * ${amount.toFixed(3)} * gust;
          transformed.x += (sin(ph) * 0.8 + sin(ph * 2.3 + 1.7) * 0.25) * bend;
          transformed.z += (cos(ph * 0.8) * 0.5) * bend;
        }`);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + `-sway${amount}${fade ? 'f' : ''}`;
  return m;
}

const grassMats: Partial<Record<'patch' | 'carpet', THREE.MeshStandardMaterial>> = {};
/** The grass material (double-sided blades, vertex colours × each clump's colour, wind); the patch's thins at its rim. */
export function grassMaterial(kind: 'patch' | 'carpet' = 'carpet') {
  const m0 = grassMats[kind];
  if (m0) return m0;
  const m = withSway(withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide })), 0.32, kind === 'patch');
  // both faces of a blade light alike (three flips a double-sided normal on the back face, which leaves half the blades black)
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  m.userData.shared = true;
  grassMats[kind] = m;
  return m;
}

let clumpShared: THREE.BufferGeometry | null = null;
export function sharedClump() {
  clumpShared ??= clumpGeometry(15, 3, 0.55);
  clumpShared.userData.shared = true;
  return clumpShared;
}

/** The colours grass takes on a backdrop's ground (two greens/straws to pick between). */
export function grassColours(ground: [Paint, Paint, Paint]): [THREE.Color, THREE.Color] {
  const a = col(ground[0]).clone().multiplyScalar(1.12), b = col(ground[1]).clone().multiplyScalar(1.18);
  return [a, b];
}

/**
 * The dense grass round the camera. `ok(x, z)` says where grass may grow (not on roads, pads, water); it's laid
 * out again only when the camera's spot moves to a new 4 m cell.
 */
export class GrassPatch {
  readonly mesh: THREE.InstancedMesh;
  private key = '';
  private readonly cell: number;
  private readonly radius: number;

  constructor(private readonly h: H, private readonly ok: (x: number, z: number) => boolean, private readonly colours: [THREE.Color, THREE.Color], private readonly tint: (x: number, z: number, out: THREE.Color) => THREE.Color, opts: { radius?: number; cell?: number; density?: number; scale?: [number, number] } = {}) {
    this.radius = opts.radius ?? 38;
    this.cell = opts.cell ?? 0.85;
    this.density = opts.density ?? 1;
    this.scale = opts.scale ?? [0.75, 1.35];
    const max = Math.ceil(Math.PI * (this.radius / this.cell) ** 2 * 1.05);
    this.mesh = new THREE.InstancedMesh(sharedClump(), grassMaterial('patch'), max);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'grass-patch';
  }
  private readonly density: number;
  private readonly scale: [number, number];

  /** Follow the camera's ground point; shown only when the camera is close enough to see grass. */
  update(target: THREE.Vector3, camDist: number) {
    const show = camDist < 150;
    this.mesh.visible = show;
    if (!show) { grassFade.uGrassR.value = 0; return; }
    const snap = 4;
    const cx = Math.round(target.x / snap) * snap, cz = Math.round(target.z / snap) * snap;
    grassFade.uGrassC.value.set(cx, cz);
    grassFade.uGrassR.value = this.radius;
    const key = `${cx},${cz}`;
    if (key === this.key) return;
    this.key = key;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const c = new THREE.Color();
    const R = this.radius, C = this.cell;
    const i0 = Math.floor((cx - R) / C), i1 = Math.ceil((cx + R) / C), j0 = Math.floor((cz - R) / C), j1 = Math.ceil((cz + R) / C);
    let n = 0;
    const cap = this.mesh.instanceMatrix.count;
    for (let j = j0; j <= j1 && n < cap; j++)
      for (let i = i0; i <= i1 && n < cap; i++) {
        if (hash(i, j, 7) > this.density) continue;
        const x = (i + hash(i, j, 1)) * C, z = (j + hash(i, j, 2)) * C;
        if ((x - cx) ** 2 + (z - cz) ** 2 > R * R) continue;
        // meadow, not lawn: patches thin out where the noise says so
        if (hash(i >> 3, j >> 3, 5) < 0.18 && hash(i, j, 6) < 0.6) continue;
        if (!this.ok(x, z)) continue;
        const s = this.scale[0] + hash(i, j, 3) * (this.scale[1] - this.scale[0]);
        e.set(0, hash(i, j, 4) * Math.PI * 2, 0);
        q.setFromEuler(e);
        p.set(x, this.h(x, z) - 0.02, z);
        sc.set(s, s * (0.8 + hash(i, j, 8) * 0.4), s);
        m.compose(p, q, sc);
        this.mesh.setMatrixAt(n, m);
        this.tint(x, z, c).lerp(hash(i >> 2, j >> 2, 9) < 0.5 ? this.colours[0] : this.colours[1], 0.2 + hash(i, j, 10) * 0.15).multiplyScalar(0.92 + hash(i, j, 11) * 0.16);
        this.mesh.setColorAt(n, c);
        n++;
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Lay it out again next frame (the campus changed under it). */
  invalidate() { this.key = ''; }

  dispose() {
    this.mesh.dispose();
  }
}
