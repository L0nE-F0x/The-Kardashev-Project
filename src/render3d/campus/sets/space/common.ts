/**
 * Shared parts for Act V's orbital set pieces (the L4/L5 yards and Ring One): the colours, the
 * truss spine every yards section clamps onto (it lines up from piece to piece), the feed line
 * whose rock pods flow across the seams, robot arms with a two-link IK, tugs, drones, welding
 * sparks and soft glows, the glinting gold film, radiator root glow, blueprint lines and the yards'
 * flags. No air out here: no plumes, only light (engine glows, sparks, beacons, lit windows).
 */
import * as THREE from 'three';
import { col, Kit, rng, type Paint } from '../../../kit';
import { plumeUniforms } from '../../../fx';
import { Anim, V, TAU, clamp01, glowPoints, placard } from '../mega/common';
import type { Env } from '../../../pieces';

export { Anim, V, TAU, clamp01, glowPoints, placard };
export type { Env };

export const smooth01 = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 over [a, b] of x, smoothed. */
export const span = (a: number, b: number, x: number) => smooth01((x - a) / (b - a));

// ── colours ──────────────────────────────────────────────────────────────────────────────────
export const S = {
  white: '#f3efe8', pale: '#e6e0e3', light: '#c3bcc7', mid: '#9d95a6', grey: '#7a7186', dark: '#5b536a',
  deep: '#433c52', black: '#2f2a3d', void: '#221e2e', ink: '#16141f',
  foil: '#e2b45c', foilD: '#c0903f', foilL: '#f3d58a',
  arm: '#fbd46e', armD: '#f0a448', armJ: '#3a3448',
  rock: '#66575a', rock2: '#4e4148', rock3: '#82706d', rock4: '#a08d84',
  solar: '#1b2c58', solarL: '#2c4a86', glass: '#27404e',
  hazard: '#f4c64e', red: '#c23a3f',
  // the Charter's banner
  field: '#345c96', gold: '#fbd46e',
} as const;

// ── the yards' flags (as the pixel game's flagString / parseFlags) ───────────────────────────
export interface YardFlags { halted: boolean; storm: number; q: number }
export function parseFlags(s: string | undefined): YardFlags {
  const t = s ?? '';
  return { halted: t.includes('h'), storm: Number(/s(\d)/.exec(t)?.[1] ?? 0), q: Number(/q(\d)/.exec(t)?.[1] ?? 0) };
}
export type Product = 'c' | 'r' | 'h';
export const asProduct = (c: string | undefined): Product => (c === 'r' || c === 'h' ? c : 'c');

// ── materials ────────────────────────────────────────────────────────────────────────────────
/** Matte vertex colours, its own instance (so it can take clipping planes). */
export function paint(clip?: THREE.Plane[]) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  if (clip) { m.clippingPlanes = clip; m.clipShadows = true; }
  return m;
}
/** A lit thing (windows, LEDs, a furnace): its own emissive, never touched by the sky. */
export function lit(c: Paint, k = 1.4, day: Paint = '#2a2f3c') {
  return new THREE.MeshStandardMaterial({ color: col(day), emissive: col(c), emissiveIntensity: k, roughness: 0.55 });
}
/** Dark glass with a touch of sheen (cockpits, the hub's panes). */
export const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.3 });

/** The time every glint and pulse shader reads (pieces bump it each frame). */
export const spaceTime = { value: 0 };

/**
 * Thin-film collector material: vertex-coloured gold, a little sheen, and a bright glint that
 * sweeps across each panel (object space, so every panel or instance glints on its own).
 */
export function filmMat(o: { clip?: THREE.Plane[]; transparent?: boolean; k?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.18, side: THREE.DoubleSide, transparent: !!o.transparent });
  if (o.clip) { m.clippingPlanes = o.clip; m.clipShadows = true; }
  const k = (o.k ?? 1.5).toFixed(2);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = spaceTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGl;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGl = position;
        #ifdef USE_INSTANCING
          vGl += instanceMatrix[3].xyz * 0.61;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGl; uniform float uT;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float ph = vGl.x * 0.5 + vGl.y * 0.9 + vGl.z * 0.3 - uT * 3.1;
          float b = mod(ph, 19.0);
          float g = smoothstep(1.3, 0.0, abs(b - 9.5));
          totalEmissiveRadiance += vec3(1.0, 0.92, 0.66) * g * ${k} * diffuseColor.rgb;
        }`);
  };
  m.customProgramCacheKey = () => `film-${k}`;
  return m;
}

/**
 * Radiator panels: pale, vertex coloured, glowing a dull warm red near their roots (outside the
 * band y0..y1 the glow falls off over `fall`); `u.pulse` breathes it, `u.flick` is the storm.
 */
export function radiatorMat(y0: number, y1: number, glow: Paint = '#e0603c', fall = 4.5, k = 0.9, axis: 'y' | 'absx' = 'y') {
  const u = { uY0: { value: y0 }, uY1: { value: y1 }, uFall: { value: fall }, uGlow: { value: col(glow).clone().multiplyScalar(k) }, uPulse: { value: 1 } };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRY;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRY = ${axis === 'y' ? 'position.y' : 'abs(position.x)'};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRY; uniform float uY0; uniform float uY1; uniform float uFall; uniform vec3 uGlow; uniform float uPulse;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float d = max(0.0, max(uY0 - vRY, vRY - uY1));
          totalEmissiveRadiance += uGlow * uPulse * exp(-d / uFall);
        }`);
  };
  m.customProgramCacheKey = () => `radiator-glow-${axis}`;
  return { mat: m, u };
}

// ── soft light: sparks, crackles, glows ──────────────────────────────────────────────────────
let dotTex: THREE.Texture | null = null;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/**
 * Short-lived points: welding sparks spraying from a torch (`at` + `dir`), or crackles jumping
 * over a surface (`spawn` picks each one's birthplace). Additive, sized in world units.
 */
export class Sparks {
  readonly obj: THREE.Points;
  on = true;
  readonly at = new THREE.Vector3();
  readonly dir = new THREE.Vector3(0, 1, 0);
  /** Rate multiplier (0..1). */
  rate = 1;
  spawn: ((p: THREE.Vector3, r: () => number) => void) | null = null;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private extra: Float32Array;
  private r: () => number;
  constructor(private n = 28, hot: Paint = '#fff2c0', cool: Paint = '#f08a46', private size = 0.32, private speed = 3.2, private lifeS = 0.7, seed = 1, private spread = 0.9) {
    this.r = rng(seed);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.extra = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { this.life[i] = lifeS * (0.4 + this.r() * 0.8); this.age[i] = this.r() * this.life[i]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('extra', new THREE.BufferAttribute(this.extra, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: dotTexture() }, hot: { value: col(hot).clone() }, cool: { value: col(cool).clone() }, scale: plumeUniforms.scale },
      vertexShader: `attribute vec2 extra; varying vec2 vE; uniform float scale;
        void main(){ vE = extra; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.5, extra.x * scale / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 hot; uniform vec3 cool; varying vec2 vE;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vE.y; vec3 c = mix(cool, hot, vE.y); gl_FragColor = vec4(c * a * 2.2, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.obj = new THREE.Points(g, mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 7;
  }
  private born(i: number) {
    const r = this.r;
    const p = V(0, 0, 0);
    if (this.spawn) this.spawn(p, r);
    else p.copy(this.at);
    this.pos.set([p.x, p.y, p.z], i * 3);
    // a cone round dir
    const d = this.dir.clone().normalize();
    const a = V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(2 * this.spread).add(d).normalize();
    const sp = this.speed * (0.35 + r() * 0.9);
    this.vel.set([a.x * sp, a.y * sp, a.z * sp], i * 3);
    this.life[i] = this.lifeS * (0.4 + r() * 0.8);
    this.age[i] = 0;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        if (this.on && this.r() < this.rate) this.born(i);
        else { this.extra[i * 2 + 1] = 0; continue; }
      }
      const t = this.age[i] / this.life[i];
      for (let j = 0; j < 3; j++) this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt;
      this.extra[i * 2] = this.size * (1 - t * 0.6);
      this.extra[i * 2 + 1] = (1 - t) * (this.on || t < 1 ? 1 : 0);
    }
    (this.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.obj.geometry.attributes.extra as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Soft additive glows at fixed points, whose strength can be set (engine bells, beacons, a furnace). */
export function halo(pts: THREE.Vector3[], sizes: number[], c: Paint, opacity = 1) {
  const p = glowPoints(pts, sizes, c, opacity);
  const u = (p.material as THREE.ShaderMaterial).uniforms;
  return { obj: p, set: (k: number) => { u.opacity.value = opacity * k; }, color: u.color.value as THREE.Color };
}

// ── the truss spine ──────────────────────────────────────────────────────────────────────────
/** The spine's centre height and section (every yards piece shares them, so the sections join up). */
export const SPINE = { y: 8, s: 3.6 };
/** The yards' spine runs 13 units behind each piece's front edge (pieces of different depth line up). */
export const yardsZ = (d: number) => d / 2 - 13;

export interface TrussOpts {
  /** Heavy collars at the ends (where the next section bolts on). */
  collars?: [boolean, boolean];
  chord?: Paint; batten?: Paint; lace?: Paint;
  /** Bay length to aim for. */
  bay?: number;
  s?: number; y?: number;
}
/**
 * A square lattice truss along x from x0 to x1 (centre line at height y, depth z): four chords,
 * a frame at every node, zig-zag lacing on all four faces, and a bolted collar at each end.
 */
export function truss(k: Kit, x0: number, x1: number, z: number, o: TrussOpts = {}) {
  const s = o.s ?? SPINE.s, h = s / 2, yc = o.y ?? SPINE.y;
  const chord = o.chord ?? S.white, batten = o.batten ?? S.light, lace = o.lace ?? S.mid;
  const n = Math.max(1, Math.round((x1 - x0) / (o.bay ?? 3.2)));
  const bay = (x1 - x0) / n;
  const L = x1 - x0, cx = (x0 + x1) / 2;
  const ch = 0.4;
  for (const dy of [-1, 1]) for (const dz of [-1, 1]) k.box(L, ch, ch, chord, cx, yc + dy * (h - ch / 2) - ch / 2, z + dz * (h - ch / 2), { r: 0.08, shade: 0, jitter: 0.03 });
  const bt = 0.26;
  const lo = { r: 0.04, shade: 0, seg: 1 };
  for (let i = 1; i < n; i++) {
    const x = x0 + i * bay;
    k.box(bt, bt, s - 0.1, batten, x, yc + h - bt - 0.05, z, lo);
    k.box(bt, bt, s - 0.1, batten, x, yc - h + 0.05, z, lo);
    k.box(bt, s - 0.1, bt, batten, x, yc - h + 0.05, z + h - bt / 2 - 0.05, lo);
    k.box(bt, s - 0.1, bt, batten, x, yc - h + 0.05, z - h + bt / 2 + 0.05, lo);
    // node gussets on the front face
    k.box(0.5, 0.5, 0.1, chord, x, yc + h - 0.55, z + h + 0.02, { r: 0, shade: 0 });
    k.box(0.5, 0.5, 0.1, chord, x, yc - h + 0.05, z + h + 0.02, { r: 0, shade: 0 });
  }
  const e = h - 0.2;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * bay + 0.15, xb = x0 + (i + 1) * bay - 0.15;
    const up = i % 2 === 0;
    for (const sz of [-1, 1]) {
      // the front and back faces
      k.beam(V(xa, yc + (up ? -e : e), z + sz * e), V(xb, yc + (up ? e : -e), z + sz * e), 0.15, lace);
    }
    for (const sy of [-1, 1]) {
      // the top and bottom faces
      k.beam(V(xa, yc + sy * e, z + (up ? -e : e)), V(xb, yc + sy * e, z + (up ? e : -e)), 0.13, lace);
    }
  }
  const [cl, cr] = o.collars ?? [true, true];
  const collar = (x: number) => {
    const t = 0.32, w = 0.62, S2 = s + 0.5;
    k.box(t, w, S2, batten, x, yc + h - w + 0.25, z, { r: 0.06, shade: 0, seg: 1 });
    k.box(t, w, S2, batten, x, yc - h - 0.25, z, { r: 0.06, shade: 0, seg: 1 });
    k.box(t, S2 - 2 * w + 0.02, w, batten, x, yc - h + w - 0.26, z + h + 0.25 - w / 2, { r: 0.06, shade: 0, seg: 1 });
    k.box(t, S2 - 2 * w + 0.02, w, batten, x, yc - h + w - 0.26, z - h - 0.25 + w / 2, { r: 0.06, shade: 0, seg: 1 });
    // bolts round the flange
    for (const [by, bz] of [[h, h], [h, -h], [-h, h], [-h, -h], [h, 0], [-h, 0], [0, h], [0, -h]] as const)
      k.box(t + 0.12, 0.18, 0.18, S.dark, x, yc + by * 1.06 - 0.09, z + bz * 1.06, { r: 0, shade: 0 });
  };
  if (cl) collar(x0 + 0.16);
  if (cr) collar(x1 - 0.16);
  return { y0: yc - h, y1: yc + h, z0: z - h, z1: z + h };
}

/** A clamp saddle gripping the truss from below (a module hangs off it). */
export function clamp(k: Kit, x: number, z: number, w = 1.6, drop = 1.2, paint: Paint = S.grey) {
  const s = SPINE.s, h = s / 2, y = SPINE.y - h;
  k.box(w, 0.4, s + 1.0, paint, x, y - 0.4, z, { r: 0.08, shade: 0 });
  for (const sz of [-1, 1]) k.box(w, 1.3, 0.38, paint, x, y - 0.4, z + sz * (h + 0.32), { r: 0.08, shade: 0.1 });
  k.box(w * 0.6, drop, w * 0.6, S.dark, x, y - 0.4 - drop, z, { r: 0.08, shade: 0.2 });
}

// ── the feed line: rock pods flowing through the truss (continuous across the seams) ──────────
const podGeo = (() => {
  const k = new Kit(rng(41));
  const w = 1.5, h = 1.05;
  // a cage of four rails and end frames
  for (const [y, z] of [[0, -h / 2], [0, h / 2], [h, -h / 2], [h, h / 2]] as const) k.box(w, 0.12, 0.12, S.dark, 0, y - 0.06, z, { r: 0, jitter: 0 });
  for (const x of [-w / 2, w / 2]) {
    k.box(0.12, h, 0.12, S.dark, x, 0, -h / 2, { r: 0, jitter: 0 });
    k.box(0.12, h, 0.12, S.dark, x, 0, h / 2, { r: 0, jitter: 0 });
  }
  const r = rng(43);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.DodecahedronGeometry(0.34 + r() * 0.16, 0);
    g.scale(1 + r() * 0.4, 0.8 + r() * 0.3, 1);
    g.rotateY(r() * 3);
    g.translate((r() - 0.5) * 0.9, 0.35 + r() * 0.35, (r() - 0.5) * 0.5);
    k.geo(g, [S.rock, S.rock2, S.rock3, S.rock4][i % 4], 0.08, 0.1);
  }
  return k.build().geometry;
})();

/**
 * Pods of hauled rock riding a rail inside the truss toward the foundries (−x). Pods sit at whole
 * multiples of `gap` in WORLD x, so they flow straight on from one section into the next.
 */
export class FeedLine {
  readonly obj: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private wp = new THREE.Vector3();
  constructor(private owner: THREE.Object3D, private x0: number, private x1: number, private z: number, private gap = 5.5, private speed = 1.1, private y = SPINE.y - 1.2) {
    const n = Math.ceil((x1 - x0) / gap) + 1;
    this.obj = new THREE.InstancedMesh(podGeo, paint(), n);
    this.obj.castShadow = true;
    this.obj.frustumCulled = false;
  }
  /** `run` 0 = stopped (halted), 1 = running. */
  update(e: Env, run = 1) {
    this.owner.getWorldPosition(this.wp);
    const off = (e.t * this.speed * run) % this.gap;
    const first = Math.ceil((this.x0 + this.wp.x + off) / this.gap);
    let i = 0;
    for (let K = first; ; K++) {
      const x = K * this.gap - off - this.wp.x;
      if (x > this.x1 - 0.8 || i >= this.obj.count) break;
      if (x < this.x0 + 0.8) continue;
      this.m.makeTranslation(x, this.y, this.z);
      this.obj.setMatrixAt(i++, this.m);
    }
    for (let j = i; j < this.obj.count; j++) { this.m.makeScale(0, 0, 0); this.obj.setMatrixAt(j, this.m); }
    this.obj.instanceMatrix.needsUpdate = true;
  }
}

// ── robot arms ───────────────────────────────────────────────────────────────────────────────
export type Tool = 'grip' | 'torch' | 'claw';
export interface ArmOpts { tool?: Tool; hang?: boolean; seed?: number; base?: number; thick?: number; paint?: Paint; dark?: Paint }
/**
 * An industrial arm in yellow: a turntable base, two links and a tool. `reach(p)` swings the tip
 * to p (in the parent's space) with a two-link IK, eased so it moves like a machine; mount it
 * standing (`hang` false) or hanging from a beam. `tipWorld` = where its tool is (for sparks).
 */
export class RobotArm {
  readonly root = new THREE.Group();
  private yaw = new THREE.Group();
  private sh = new THREE.Group();
  private el = new THREE.Group();
  private tip = new THREE.Object3D();
  private inv = new THREE.Matrix4();
  private cur = new THREE.Vector3();
  private want = new THREE.Vector3();
  private started = false;
  readonly hb: number;
  constructor(readonly L1: number, readonly L2: number, x: number, y: number, z: number, o: ArmOpts = {}) {
    const t = o.thick ?? 0.5, yel = o.paint ?? S.arm, dk = o.dark ?? S.armD;
    this.hb = o.base ?? 1.0;
    this.root.position.set(x, y, z);
    if (o.hang) this.root.rotation.x = Math.PI;
    this.root.updateMatrix();
    this.inv.copy(this.root.matrix).invert();
    const bk = new Kit(rng(o.seed ?? 3));
    bk.cyl(0.85, 0.95, 0.3, S.dark, 0, 0, 0, 14, { shade: 0.1 });
    bk.cyl(0.55, 0.62, 0.25, S.black, 0, 0.3, 0, 12, { shade: 0 });
    this.root.add(bk.build());
    this.root.add(this.yaw);
    const yk = new Kit(rng((o.seed ?? 3) + 1));
    yk.cyl(0.52, 0.58, this.hb - 0.5, yel, 0, 0.5, 0, 12, { shade: 0.15 });
    yk.box(0.9, 0.7, 1.0, dk, 0, this.hb - 0.55, 0, { r: 0.12 });
    this.yaw.add(yk.build());
    this.sh.position.y = this.hb;
    this.yaw.add(this.sh);
    // the upper link along +x, joint housings across z
    const uk = new Kit(rng((o.seed ?? 3) + 2));
    uk.cyl(t * 0.85, t * 0.85, t * 2.1, S.armJ, 0, 0, -t * 1.05, 12, { rx: Math.PI / 2, shade: 0 });
    uk.box(L1, t * 1.1, t * 1.25, yel, L1 / 2, -t * 0.55, 0, { r: 0.12, shade: 0.12 });
    uk.box(L1 * 0.55, t * 0.5, t * 1.35, dk, L1 * 0.42, -t * 0.25, 0, { r: 0.08, shade: 0 });
    uk.cyl(t * 0.62, t * 0.62, t * 1.7, S.armJ, L1, 0, -t * 0.85, 12, { rx: Math.PI / 2, shade: 0 });
    this.sh.add(uk.build());
    this.el.position.x = L1;
    this.sh.add(this.el);
    const fk = new Kit(rng((o.seed ?? 3) + 3));
    const fl = L2 - 0.9;
    fk.box(fl, t * 0.82, t * 0.95, yel, fl / 2, -t * 0.41, 0, { r: 0.1, shade: 0.12 });
    fk.cyl(t * 0.42, t * 0.42, 0.5, S.armJ, fl + 0.05, 0, 0, 10, { rz: -Math.PI / 2, shade: 0 });
    const tool = o.tool ?? 'grip';
    if (tool === 'torch') {
      fk.cyl(0.13, 0.26, 0.6, S.black, fl + 0.3, 0, 0, 10, { rz: -Math.PI / 2, shade: 0 });
      fk.cyl(0.05, 0.08, 0.18, '#e9e1d2', fl + 0.85, 0, 0, 8, { rz: -Math.PI / 2, shade: 0 });
    } else {
      fk.box(0.36, t * 1.2, t * 1.2, S.black, fl + 0.4, -t * 0.6, 0, { r: 0.05 });
      const sp = tool === 'claw' ? 0.42 : 0.3;
      for (const s of [-1, 1]) {
        fk.box(0.55, 0.12, 0.14, S.mid, fl + 0.82, s * sp - 0.06, 0, { r: 0.02, shade: 0 });
        if (tool === 'claw') fk.box(0.14, 0.32, 0.14, S.mid, fl + 1.05, s * sp - (s < 0 ? 0 : 0.32), 0, { r: 0.02, shade: 0 });
      }
    }
    this.el.add(fk.build());
    this.tip.position.x = L2;
    this.el.add(this.tip);
  }
  /** Set the target (parent space); `snap` jumps there. */
  reach(p: THREE.Vector3, dt: number, ease = 5, snap = false) {
    this.want.copy(p);
    if (!this.started || snap) { this.cur.copy(p); this.started = true; }
    else this.cur.lerp(this.want, 1 - Math.exp(-dt * ease));
    this.solve(this.cur);
  }
  private solve(p: THREE.Vector3) {
    const l = p.clone().applyMatrix4(this.inv);
    const yaw = Math.atan2(-l.z, l.x);
    this.yaw.rotation.y = yaw;
    const r = Math.hypot(l.x, l.z), dy = l.y - this.hb;
    let d = Math.hypot(r, dy);
    const L1 = this.L1, L2 = this.L2;
    d = Math.min(L1 + L2 - 0.05, Math.max(Math.abs(L1 - L2) + 0.1, d));
    const a = Math.atan2(dy, r);
    const b = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const t1 = a + b;
    const ex = Math.cos(t1) * L1, ey = Math.sin(t1) * L1;
    const tx = Math.cos(a) * d, ty = Math.sin(a) * d;
    const f = Math.atan2(ty - ey, tx - ex);
    this.sh.rotation.z = t1;
    this.el.rotation.z = f - t1;
  }
  /** The tool tip in the parent's space (after the last reach). */
  tipIn(parent: THREE.Object3D, out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    this.tip.getWorldPosition(out);
    return parent.worldToLocal(out);
  }
  /** The tool's pointing direction in the parent's space. */
  dirIn(parent: THREE.Object3D, out = new THREE.Vector3()) {
    const a = this.tipIn(parent, V(0, 0, 0));
    const e = new THREE.Vector3();
    this.el.getWorldPosition(e);
    parent.worldToLocal(e);
    return out.copy(a).sub(e).normalize();
  }
}

// ── small craft ──────────────────────────────────────────────────────────────────────────────
/** A space tug facing +x (3.8 long): stubby hull, cockpit glass, a grapple, an engine bell that glows. */
export function tug(accent: Paint, hi: Paint, seed: number, s = 1) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const gl = new Kit(rng(seed + 1));
  k.box(2.6 * s, 1.25 * s, 1.5 * s, S.white, 0, -0.62 * s, 0, { r: 0.22 * s, shade: 0.25 });
  k.box(2.64 * s, 0.26 * s, 1.54 * s, accent, 0, -0.1 * s, 0, { r: 0.05, shade: 0 });
  k.box(1.0 * s, 0.6 * s, 1.1 * s, S.pale, 0.55 * s, 0.6 * s, 0, { r: 0.2 * s, shade: 0.1 });
  gl.box(0.7 * s, 0.4 * s, 1.0 * s, '#3c6a7c', 0.9 * s, 0.68 * s, 0, { r: 0.15 * s, shade: 0 });
  // the grapple: two arms and claws at the nose
  for (const sz of [-1, 1]) {
    k.box(0.9 * s, 0.16 * s, 0.16 * s, S.mid, 1.7 * s, -0.25 * s, sz * 0.45 * s, { r: 0.03, shade: 0 });
    k.box(0.16 * s, 0.5 * s, 0.16 * s, hi, 2.12 * s, -0.5 * s, sz * 0.45 * s, { r: 0.03, shade: 0 });
  }
  // RCS quads on the corners, the engine on the back
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.22 * s, 0.22 * s, 0.22 * s, S.grey, sx * 1.1 * s, 0.56 * s, sz * 0.8 * s, { r: 0.04, shade: 0 });
  k.cyl(0.38 * s, 0.22 * s, 0.5 * s, S.dark, -1.3 * s - 0.45 * s, -0.05 * s, 0, 12, { rz: Math.PI / 2, shade: 0 });
  k.cyl(0.42 * s, 0.42 * s, 0.2 * s, S.black, -1.95 * s, -0.05 * s, 0, 12, { rz: Math.PI / 2, shade: 0 });
  // a little solar panel on a stalk
  k.box(0.1 * s, 0.7 * s, 0.1 * s, S.mid, -0.6 * s, 0.6 * s, 0, { r: 0, jitter: 0 });
  k.box(1.2 * s, 0.06 * s, 0.9 * s, S.solar, -0.6 * s, 1.3 * s, 0, { r: 0.02, shade: 0 });
  const m = k.build();
  g.add(m);
  const gm = gl.build(glassMat);
  g.add(gm);
  const eng = halo([V(-2.15 * s, -0.05 * s, 0)], [1.6 * s], '#7fe8ff', 0.9);
  g.add(eng.obj);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 6, 4), lit('#ff5a4a', 2.5));
  lamp.position.set(0.55 * s, 0.95 * s, 0);
  lamp.userData.beacon = seed * 0.7;
  g.add(lamp);
  return { obj: g, engine: eng };
}

/** A maintenance drone (1.2 across): a white body, four thruster pods, a glowing eye. */
export function drone(seed: number, eye: Paint = '#5fd3b5') {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  k.box(0.9, 0.42, 0.7, S.pale, 0, -0.21, 0, { r: 0.12, shade: 0.2 });
  k.box(0.6, 0.18, 0.5, S.grey, 0, 0.2, 0, { r: 0.06, shade: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.beam(V(sx * 0.3, 0, sz * 0.25), V(sx * 0.62, 0, sz * 0.5), 0.07, S.mid);
    k.box(0.24, 0.24, 0.24, S.dark, sx * 0.62, -0.12, sz * 0.5, { r: 0.05, shade: 0 });
  }
  k.box(0.08, 0.3, 0.08, S.mid, -0.3, 0.38, 0, { r: 0, jitter: 0 });
  g.add(k.build());
  const em = lit(eye, 2.2);
  const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.08), em);
  e.position.set(0.46, -0.05, 0);
  e.rotation.y = Math.PI / 2;
  g.add(e);
  const glow = halo([V(0.5, -0.05, 0)], [0.9], eye, 0.7);
  g.add(glow.obj);
  return { obj: g, eye: em, glow };
}

// ── blueprint lines (the cyan drawing a copy is printed out of) ──────────────────────────────
/** Boxes as [cx, y0, cz, w, h, d] and cylinders as ['c', cx, y0, cz, r, h] (or along x: 'cx'). */
export type BlueShape = [number, number, number, number, number, number] | ['c' | 'cx', number, number, number, number, number];
export function blueprint(shapes: BlueShape[], c: Paint = '#5fd3b5', opacity = 0.85, clip?: THREE.Plane[]) {
  const pts: number[] = [];
  const seg = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (const sh of shapes) {
    if (sh[0] === 'c' || sh[0] === 'cx') {
      const [kind, cx, y0, cz, r, h] = sh as ['c' | 'cx', number, number, number, number, number];
      const n = 16;
      const at = (i: number, y: number) => {
        const a = (i / n) * TAU;
        return kind === 'c' ? V(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r) : V(cx + y, y0 + Math.cos(a) * r, cz + Math.sin(a) * r);
      };
      const ys = kind === 'c' ? [y0, y0 + h * 0.5, y0 + h] : [0, h * 0.5, h];
      for (const y of ys) for (let i = 0; i < n; i++) seg(at(i, y), at(i + 1, y));
      for (let i = 0; i < n; i += 4) seg(at(i, ys[0]), at(i, ys[2]));
      continue;
    }
    const [cx, y0, cz, w, h, d] = sh as number[];
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const c8 = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(c8[a], c8[b]);
    // a few construction lines across the front face
    for (let y = y0 + 1.5; y < y1 - 0.5; y += 1.5) seg(V(x0, y, z1), V(x1, y, z1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineBasicMaterial({ color: col(c), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  if (clip) m.clippingPlanes = clip;
  const ls = new THREE.LineSegments(g, m);
  ls.renderOrder = 6;
  return ls;
}

// ── odds and ends ────────────────────────────────────────────────────────────────────────────
/** A blinking warning light (amber or red) with a halo; returns a setter for its on/off state. */
export function warnLamp(parent: THREE.Object3D, x: number, y: number, z: number, red: boolean, s = 1) {
  const c = red ? '#ff4a3a' : '#ffb347';
  const m = lit(c, 0, red ? '#64172a' : '#7a4a20');
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 8, 6), m);
  b.position.set(x, y, z);
  parent.add(b);
  const h = halo([V(x, y, z)], [2.4 * s], c, 0.9);
  parent.add(h.obj);
  return (on: number) => { m.emissiveIntensity = on * 3; h.set(on); };
}

/** A glowing sign (the UI font), fitted inside w × maxH. */
export function plate(parent: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, fg: Paint, bg: Paint | null, ry = 0, maxH = 99, glow = true) {
  const s = placard(parent, text, w, x, y, z, fg, bg, ry, glow);
  const h = (s.userData.signHeight as number) ?? 1;
  if (h > maxH) s.scale.setScalar(maxH / h);
  return s;
}

/** Hex string of a paint (for canvas textures). */
export const hexOf = (p: Paint) => `#${col(p).getHexString(THREE.SRGBColorSpace)}`;

/** Clipping plane helper: a plane in the piece's local space, re-expressed in world space each frame. */
export class LocalPlane {
  readonly world = new THREE.Plane();
  constructor(readonly local: THREE.Plane) { this.world.copy(local); }
  sync(owner: THREE.Object3D) {
    owner.updateWorldMatrix(true, false);
    this.world.copy(this.local).applyMatrix4(owner.matrixWorld);
  }
}

/** Storm flicker: true when a light should drop out this instant (storm 0..3). */
export function flicker(t: number, seed: number, storm: number) {
  if (!storm) return false;
  const h = Math.sin(Math.floor(t * 12 + seed * 7.3) * 12.9898 + seed * 78.233) * 43758.5453;
  return h - Math.floor(h) < storm * 0.12;
}

/**
 * The end of a truss: a heavy terminal frame at x and a docking drum pointing `dir` (±1), with
 * nav lights (red to port, green to starboard). Returns the lights' meshes (they blink themselves).
 */
export function endCap(k: Kit, g: THREE.Object3D, x: number, z: number, dir: 1 | -1, y = SPINE.y) {
  const s = SPINE.s + 1.4;
  k.box(0.7, s, s, S.light, x + dir * 0.35, y - s / 2, z, { r: 0.18, shade: 0.15 });
  k.box(0.2, s - 1.0, s - 1.0, S.grey, x + dir * 0.8, y - s / 2 + 0.5, z, { r: 0.06, shade: 0 });
  k.cyl(1.25, 1.25, 1.4, S.white, x + dir * 0.7, y, z, 16, { rz: -dir * Math.PI / 2, shade: 0 });
  k.cyl(1.45, 1.45, 0.3, S.dark, x + dir * 1.9, y, z, 16, { rz: -dir * Math.PI / 2, shade: 0 });
  k.cyl(0.75, 0.75, 0.12, S.black, x + dir * 2.2, y, z, 14, { rz: -dir * Math.PI / 2, shade: 0 });
  for (const [dy, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) k.box(0.5, 0.5, 0.5, S.dark, x + dir * 0.9, y + dy * (s / 2 - 0.3) - 0.25, z + dz * (s / 2 - 0.3), { r: 0.06 });
  const out: THREE.Mesh[] = [];
  for (const [dz, c] of [[s / 2 - 0.1, '#7dff9a'], [-s / 2 + 0.1, '#ff4a3a']] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lit(c, 0.3));
    m.position.set(x + dir * 0.4, y + s / 2 + 0.1, z + dz);
    m.userData.beacon = dz > 0 ? 0.4 : 2.1;
    g.add(m);
    out.push(m);
  }
  return out;
}

/**
 * The piece's update, with an optional time offset (`obj.userData.tOff`, seconds) so a moment of a
 * cycle can be looked at in the lab.
 */
export function timed(obj: THREE.Object3D, anim: Anim) {
  return (e: Env) => {
    const off = obj.userData.tOff as number | undefined;
    anim.update(off ? { ...e, t: e.t + off } : e);
  };
}

/**
 * A light strip whose brightness travels along WORLD x (a slow wave running down the ring), so it
 * flows on unbroken from one section into the next. `u.speed`, `u.k` (base), `u.amp` (the wave).
 */
export function stripMat(c: Paint, base = 0.6, amp = 2.4) {
  const u = { uSpeed: { value: 6 }, uBase: { value: base }, uAmp: { value: amp } };
  const m = new THREE.MeshStandardMaterial({ color: '#1c2a30', emissive: col(c), emissiveIntensity: 1, roughness: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uT: spaceTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWX;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWX = (modelMatrix * vec4(transformed, 1.0)).x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWX; uniform float uT; uniform float uSpeed; uniform float uBase; uniform float uAmp;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float w = mod(vWX - uT * uSpeed, 64.0);
          float q = (w - 32.0) / 5.0, p = exp(-q * q);
          totalEmissiveRadiance *= uBase + uAmp * p;
        }`);
  };
  m.customProgramCacheKey = () => 'strip-wave';
  return { mat: m, u };
}

/**
 * A spacewalker (1.8 tall, for scale): white suit, gold visor, a life-support pack, limbs in a
 * floating pose, a helmet lamp. Faces +z; `float(t)` drifts the limbs a little. `tie(parent, at)` clips a safety
 * tether from the suit's hip ring to a point on the structure (in the parent's coordinates): nobody works outside
 * without one, and `float` keeps it taut as the walker moves.
 */
const UP_Y = new THREE.Vector3(0, 1, 0);
const tetherGeo = new THREE.BoxGeometry(0.035, 1, 0.035);
const clipGeo = new THREE.BoxGeometry(0.16, 0.1, 0.16);
const tetherMat = new THREE.MeshStandardMaterial({ color: col('#f0a448'), roughness: 0.8 });
export function spacewalker(seed: number, stripe: Paint = '#c23a3f') {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const suit = '#f1ede6', joint = '#c3bcc7';
  k.box(0.62, 0.72, 0.42, suit, 0, 0.9, 0, { r: 0.14, shade: 0.15 });
  k.box(0.64, 0.12, 0.44, stripe, 0, 1.28, 0, { r: 0.03, shade: 0 });
  k.box(0.56, 0.62, 0.3, S.light, 0, 0.98, -0.34, { r: 0.1, shade: 0.1 });
  k.box(0.46, 0.22, 0.12, S.dark, 0, 1.08, 0.24, { r: 0.04, shade: 0 });
  k.geo(new THREE.SphereGeometry(0.27, 14, 10).translate(0, 1.86, 0), suit, 0.02, 0);
  k.box(0.6, 0.16, 0.5, suit, 0, 0.78, 0, { r: 0.06, shade: 0 });
  const vg = new Kit(rng(seed + 1));
  vg.geo(new THREE.SphereGeometry(0.22, 12, 8, -0.9, 1.8, 0.9, 1.2).translate(0, 1.86, 0.08), S.gold, 0.02, 0);
  g.add(k.build(), vg.build(glassMat));
  const limb = (len: number, w: number) => {
    const lk = new Kit(rng(seed + 2));
    lk.box(w, len, w, suit, 0, -len, 0, { r: w * 0.3, shade: 0.1 });
    lk.box(w * 1.1, 0.12, w * 1.1, joint, 0, -len * 0.55, 0, { r: 0.03, shade: 0 });
    lk.box(w * 1.15, 0.2, w * 1.25, S.light, 0, -len - 0.12, 0.04, { r: 0.05, shade: 0 });
    const p = new THREE.Group();
    p.add(lk.build());
    return p;
  };
  const arms = [limb(0.68, 0.17), limb(0.68, 0.17)], legs = [limb(0.78, 0.22), limb(0.78, 0.22)];
  arms[0].position.set(-0.4, 1.5, 0); arms[1].position.set(0.4, 1.5, 0);
  legs[0].position.set(-0.17, 0.8, 0); legs[1].position.set(0.17, 0.8, 0);
  for (const l of [...arms, ...legs]) g.add(l);
  const lamp = halo([V(0.18, 2.02, 0.22)], [0.9], '#fff6d8', 0.9);
  g.add(lamp.obj);
  const ph = seed * 1.3;
  let line: THREE.Mesh | null = null;
  const made = V(0, 0, 0), hip = V(0, 0, 0), span = V(0, 0, 0);
  const taut = () => {
    if (!line) return;
    hip.set(0.3, 0.86, -0.2).applyQuaternion(g.quaternion).add(g.position);
    span.copy(made).sub(hip);
    const len = span.length() || 1;
    line.position.copy(hip).addScaledVector(span, 0.5);
    line.scale.set(1, len, 1);
    line.quaternion.setFromUnitVectors(UP_Y, span.divideScalar(len));
  };
  return {
    obj: g,
    tie(parent: THREE.Object3D, at: THREE.Vector3) {
      made.copy(at);
      line = new THREE.Mesh(tetherGeo, tetherMat);
      const clip = new THREE.Mesh(clipGeo, tetherMat);
      clip.position.copy(at);
      parent.add(line, clip);
      taut();
    },
    float(t: number) {
      taut();
      arms[0].rotation.set(-0.5 + Math.sin(t * 0.7 + ph) * 0.15, 0, -0.35);
      arms[1].rotation.set(-1.1 + Math.sin(t * 0.6 + ph + 1) * 0.2, 0, 0.3);
      legs[0].rotation.set(0.25 + Math.sin(t * 0.5 + ph) * 0.1, 0, -0.08);
      legs[1].rotation.set(-0.15 + Math.sin(t * 0.45 + ph + 2) * 0.1, 0, 0.1);
    },
  };
}
