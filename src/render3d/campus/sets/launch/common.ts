/**
 * Shared bits for the launch complex: exhaust and steam that billows (particles with their own
 * velocity, drag, growth and heat), the heavy lifter in a builder's livery, lattice towers and
 * masts, and painted text that wraps round a tank or a booster.
 */
import * as THREE from 'three';
import { col, Kit, rng, withClouds, type Paint } from '../../../kit';
import { plumeUniforms } from '../../../fx';
import type { Env } from '../../../pieces';
import { CH, V } from '../geneva/common';

export { V };

// ── billowing particles ──────────────────────────────────────────────────────────────────────
let puffTex: THREE.Texture | null = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 30, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

export interface Puff {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; s0: number; s1: number;
  /** Starts this hot (0..1: glows orange, cools off over the first part of its life). */
  heat?: number;
}

/**
 * Smoke, steam and exhaust as soft round puffs that are emitted one by one (bursts, trails) and
 * then live on their own: they slow down (drag), rise (buoyancy), drift with the wind, grow and
 * fade. Puffs near the flame glow (`light` = where the flame is and how bright).
 */
/** Launch smoke in the last light: a warm grey with some of the sky's pink in it. */
const DUSK_SMOKE = '#6f5d66';

export class Billow {
  readonly obj: THREE.Points;
  private n: number;
  private p: Float32Array;
  private v: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s: Float32Array;
  private heat: Float32Array;
  private next = 0;
  private mat: THREE.ShaderMaterial;
  private base: THREE.Color;
  constructor(n: number, private o: { color?: Paint; drag?: number; rise?: number; wind?: number; opacity?: number } = {}) {
    this.n = n;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.s = new Float32Array(n * 2);
    this.heat = new Float32Array(n);
    this.base = col(o.color ?? '#f1eee8').clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('extra', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: {
        map: { value: puffTexture() }, opacity: { value: o.opacity ?? 0.9 }, scale: plumeUniforms.scale,
        fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 2000 },
      },
      vertexShader: `attribute vec2 extra; attribute vec3 tint; varying float vA; varying vec3 vC; uniform float scale;
        #include <fog_pars_vertex>
        void main(){ vA = extra.y; vC = tint; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = extra.x * scale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform float opacity; varying float vA; varying vec3 vC;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * opacity * vA; if (a < 0.004) discard;
          // a little shading: lit from above, darker underneath
          float sh = 0.7 + 0.3 * (1.0 - gl_PointCoord.y);
          gl_FragColor = vec4(vC * sh, a);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.obj = new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 6;
  }

  emit(q: Puff) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.p.set([q.x, q.y, q.z], i * 3);
    this.v.set([q.vx, q.vy, q.vz], i * 3);
    this.age[i] = 0;
    this.life[i] = q.life;
    this.s[i * 2] = q.s0;
    this.s[i * 2 + 1] = q.s1;
    this.heat[i] = q.heat ?? 0;
  }

  get alive() {
    let k = 0;
    for (let i = 0; i < this.n; i++) if (this.age[i] < this.life[i]) k++;
    return k;
  }

  /** `light`: the flame's position and brightness (0 = none), lighting nearby puffs orange. */
  update(e: Env, light: { x: number; y: number; z: number; k: number } | null = null) {
    const pos = this.obj.geometry.attributes.position as THREE.BufferAttribute;
    const tint = this.obj.geometry.attributes.tint as THREE.BufferAttribute;
    const ex = this.obj.geometry.attributes.extra as THREE.BufferAttribute;
    const drag = this.o.drag ?? 1.2, rise = this.o.rise ?? 0.8, wind = this.o.wind ?? 1.2;
    const dt = Math.min(0.1, e.dt);
    const damp = Math.exp(-drag * dt);
    const night = e.night;
    // The smoke is not lit by the scene, so it takes the hour's light from here: white by day, the night's blue after
    // dark, and a dim warm grey round sunset and dusk. (Then the sun is nearly gone but the picture is developed about
    // twice as bright: left white, the smoke was the brightest thing on screen, flat blobs over the whole complex.)
    const ramp = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const dusk = ramp(0.015, 0.11, night) * (1 - ramp(0.5, 0.85, night));
    const br = this.base.clone().lerp(col('#5e6488'), night * 0.78).lerp(col(DUSK_SMOKE), dusk * 0.9);
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { ex.setXY(i, 0, 0); continue; }
      this.age[i] += dt;
      const t = Math.min(1, this.age[i] / this.life[i]);
      const j = i * 3;
      this.v[j] *= damp; this.v[j + 1] = this.v[j + 1] * damp + rise * dt; this.v[j + 2] *= damp;
      this.p[j] += (this.v[j] + wind * t) * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.3) { this.p[j + 1] = 0.3; this.v[j + 1] = Math.abs(this.v[j + 1]) * 0.3; }
      pos.setXYZ(i, this.p[j], this.p[j + 1], this.p[j + 2]);
      // heat: hot when born (exhaust), plus the flame's light on nearby puffs
      let h = this.heat[i] * Math.max(0, 1 - t * 3.2);
      if (light && light.k > 0) {
        const d = Math.hypot(this.p[j] - light.x, (this.p[j + 1] - light.y) * 0.7, this.p[j + 2] - light.z);
        h += light.k * Math.exp(-d / 9);
      }
      h = Math.min(1.6, h);
      tint.setXYZ(i, br.r + h * 2.6, br.g + h * 1.25, br.b + h * 0.35);
      const size = this.s[i * 2] + (this.s[i * 2 + 1] - this.s[i * 2]) * (1 - (1 - t) * (1 - t));
      ex.setXY(i, size, Math.min(1, t * 10) * Math.pow(1 - t, 1.3));
    }
    pos.needsUpdate = true;
    tint.needsUpdate = true;
    ex.needsUpdate = true;
  }
}

// ── lattice ──────────────────────────────────────────────────────────────────────────────────
/** A square lattice tower (base centre x, y0, z; `s` wide), with legs, rings and X-braces. */
export function latticeTower(k: Kit, x: number, y0: number, z: number, s: number, h: number, bay: number, c: Paint = '#8a8490', leg = 0.22, brace = 0.08) {
  const hs = s / 2;
  const corners: [number, number][] = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
  for (const [cx, cz] of corners) k.box(leg, h, leg, c, x + cx, y0, z + cz, { r: 0, jitter: 0.02 });
  for (let y = 0; y < h - 0.01; y += bay) {
    const y1 = Math.min(h, y + bay);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      k.beam(V(x + ax, y0 + y1, z + az), V(x + bx, y0 + y1, z + bz), brace * 1.4, c);
      k.beam(V(x + ax, y0 + y, z + az), V(x + bx, y0 + y1, z + bz), brace, c);
      k.beam(V(x + bx, y0 + y, z + bz), V(x + ax, y0 + y1, z + az), brace, c);
    }
  }
}

/** A slender triangular lattice mast (weather masts, lightning masts). */
export function latticeMast(k: Kit, x: number, y0: number, z: number, h: number, s = 0.8, c: Paint = '#9d95a6', bay = 1.6) {
  const pts = [0, 1, 2].map((i) => [Math.cos((i / 3) * Math.PI * 2) * s * 0.58, Math.sin((i / 3) * Math.PI * 2) * s * 0.58]);
  for (const [px, pz] of pts) k.box(0.12, h, 0.12, c, x + px, y0, z + pz, { r: 0, jitter: 0 });
  for (let y = 0; y < h - 0.01; y += bay) {
    const y1 = Math.min(h, y + bay);
    for (let i = 0; i < 3; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 3];
      k.beam(V(x + ax, y0 + y, z + az), V(x + bx, y0 + y1, z + bz), 0.05, c);
      k.beam(V(x + ax, y0 + y1, z + az), V(x + bx, y0 + y1, z + bz), 0.05, c);
    }
  }
}

/** A sagging wire from a to b as beams. */
export function sag(k: Kit, a: THREE.Vector3, b: THREE.Vector3, droop: number, t = 0.05, c: Paint = '#3a3442', n = 10) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const p = a.clone().lerp(b, f);
    p.y -= Math.sin(Math.PI * f) * droop;
    k.beam(prev, p, t, c);
    prev = p;
  }
}

// ── painted text on curved surfaces ──────────────────────────────────────────────────────────
/** Text drawn into a canvas, `vertical` = reading bottom to top (letters' tops to the left). */
export function textTexture(text: string, fg: Paint, vertical = false, bg: Paint | null = null) {
  const font = `700 72px 'Atkinson Hyperlegible Next', system-ui, sans-serif`;
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = font;
  const tw = Math.ceil(m.measureText(text).width) + 40, th = 100;
  const c = document.createElement('canvas');
  c.width = vertical ? th : tw;
  c.height = vertical ? tw : th;
  const g = c.getContext('2d')!;
  if (bg) { g.fillStyle = `#${col(bg).getHexString(THREE.SRGBColorSpace)}`; g.fillRect(0, 0, c.width, c.height); }
  if (vertical) { g.translate(0, c.height); g.rotate(-Math.PI / 2); }
  g.font = font;
  g.fillStyle = `#${col(fg).getHexString(THREE.SRGBColorSpace)}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, tw / 2, th / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: tw / th };
}

/** Vertical text painted up a cylinder (radius r, centred at angle `at`, 0 = +z), letters `w` tall. */
export function cylinderText(text: string, fg: Paint, r: number, y0: number, w: number, at = 0, mat?: THREE.MeshStandardMaterial) {
  const { tex, aspect } = textTexture(text, fg, true);
  const len = w * aspect;
  const geo = new THREE.CylinderGeometry(r, r, len, 10, 1, true, at - w / r / 2, w / r).translate(0, y0 + len / 2, 0);
  const m = mat ?? new THREE.MeshStandardMaterial({ roughness: 0.75 });
  m.map = tex;
  m.transparent = true;
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  return new THREE.Mesh(geo, m);
}

/** Horizontal text painted on a sphere's front (radius r, centre height cy), `h` tall. */
export function sphereText(text: string, fg: Paint, r: number, h: number, at = 0) {
  const { tex, aspect } = textTexture(text, fg);
  const w = h * aspect;
  const dPhi = w / r, dTheta = h / r;
  // SphereGeometry: phi = π/2 faces +z; `at` turns it round y
  const geo = new THREE.SphereGeometry(r, 14, 6, Math.PI / 2 - dPhi / 2, dPhi, Math.PI / 2 - dTheta / 2, dTheta);
  geo.rotateY(at);
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return new THREE.Mesh(geo, m);
}

// ── the rocket ───────────────────────────────────────────────────────────────────────────────
export const ROCKET = { R: 1.45, H: 37.6, BOOST: 22 };

/** A material for the rocket that can fade (a fresh one appearing on the pad) and be floodlit. */
export function rocketMaterial() {
  return withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, transparent: true, emissive: 0xd8e2f0, emissiveIntensity: 0 }));
}

/**
 * The heavy lifter, base at y = 0 (the engine bells' rims): booster with grid fins, folded legs and
 * soot, interstage, second stage, fairing with the Charter's mission patch. Livery from accent/hi.
 */
export function rocket(seed: number, accent: Paint, hi: Paint, label: string, mat: THREE.MeshStandardMaterial) {
  const g = new THREE.Group();
  const k = new Kit(rng(seed));
  const { R } = ROCKET;
  const WHITE: Paint = '#f3f0ea';
  // engine bells and the skirt
  for (const [x, z] of [[0, 0], [0.75, 0.3], [-0.75, 0.3], [0.45, -0.7], [-0.45, -0.7], [0, 0.85]] as const) k.cyl(0.18, 0.4, 1.1, '#433c52', x, 0, z, 10, { shade: 0.3 });
  k.cyl(R * 0.98, R * 0.9, 0.5, '#5b5562', 0, 0.9, 0, 24);
  // the booster: soot at the base, the livery band, a stripe
  const B0 = 1.4;
  k.cyl(R, R, 3.2, '#d6d0c8', 0, B0, 0, 28, { shade: 0.7, jitter: 0.01 });
  k.cyl(R, R, 2.6, accent, 0, B0 + 3.2, 0, 28, { shade: 0.08, jitter: 0.01 });
  k.cyl(R + 0.005, R + 0.005, 0.4, hi, 0, B0 + 5.8, 0, 28, { shade: 0, jitter: 0 });
  k.cyl(R, R, ROCKET.BOOST - 6.2, WHITE, 0, B0 + 6.2, 0, 28, { shade: 0.06, jitter: 0.01 });
  k.geo(new THREE.CylinderGeometry(R + 0.01, R + 0.01, ROCKET.BOOST - 7.5, 4, 1, true, -0.95, 0.16).translate(0, B0 + 6.6 + (ROCKET.BOOST - 7.5) / 2, 0), accent, 0.01);
  for (let y = B0 + 9; y < B0 + ROCKET.BOOST - 1; y += 4.2) k.cyl(R + 0.008, R + 0.008, 0.06, '#c3bcc7', 0, y, 0, 28, { shade: 0, jitter: 0 });
  // folded landing legs, grid fins at the top
  for (let i = 0; i < 4; i++) {
    const t = Math.PI / 4 + (i * Math.PI) / 2;
    k.box(0.32, 6.4, 0.18, '#433c52', Math.sin(t) * (R + 0.08), B0 - 0.2, Math.cos(t) * (R + 0.08), { r: 0.03, ry: t });
    const fx = Math.sin(t) * (R + 0.45), fz = Math.cos(t) * (R + 0.45);
    k.box(0.85, 0.75, 0.12, '#2f2a3d', fx, B0 + ROCKET.BOOST - 1.6, fz, { r: 0.02, ry: t + Math.PI / 2 });
  }
  // interstage (it stays with the booster), then the upper stack: second stage with the livery, the fairing
  const S0 = B0 + ROCKET.BOOST;
  k.cyl(R, R, 1.5, '#2f2a3d', 0, S0, 0, 28, { shade: 0.1 });
  const u = new Kit(rng(seed + 1));
  u.cyl(R, R, 6, WHITE, 0, S0 + 1.5, 0, 28, { shade: 0.05, jitter: 0.01 });
  u.cyl(R + 0.005, R + 0.005, 0.9, accent, 0, S0 + 4.4, 0, 28, { shade: 0, jitter: 0 });
  u.cyl(R + 0.008, R + 0.008, 0.22, hi, 0, S0 + 5.3, 0, 28, { shade: 0, jitter: 0 });
  // (the second stage's engine bell, seen while the stack is apart)
  u.cyl(0.35, 0.8, 1.1, '#433c52', 0, S0 + 0.4, 0, 12, { shade: 0.3 });
  const F0 = S0 + 7.5;
  u.cyl(R, R, 0.2, '#c3bcc7', 0, F0, 0, 28, { shade: 0 });
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const c = Math.max(0, t * 1.08 - 0.08);
    prof.push(new THREE.Vector2(Math.max(0.02, R * Math.sqrt(Math.max(0, 1 - c * c))), F0 + 0.2 + t * 6.2));
  }
  u.geo(new THREE.LatheGeometry(prof, 28), WHITE, 0.01);
  g.add(k.build(mat));
  // the builder's name up the booster, the mission patch on the fairing
  const nm = new THREE.MeshStandardMaterial({ roughness: 0.75, transparent: true });
  const name = cylinderText(label, '#2f2a3d', R + 0.012, B0 + 7.6, 1.2, -0.35, nm);
  g.add(name);
  const patch = cylinderPatch(R + 0.012, F0 + 0.9, 1.6, -0.3);
  // the upper stack is its own group (same coordinates as the booster): a pad mates it by crane
  const upper = new THREE.Group();
  upper.add(u.build(mat), patch);
  g.add(upper);
  g.userData.upper = upper;
  g.userData.split = S0 + 1.5;
  g.userData.top = F0 + 6.4;
  g.userData.fadeMats = [mat, nm, patch.material];
  return g;
}

let patchTex: THREE.CanvasTexture | null = null;
/** The Charter's emblem as a patch wrapped on a cylinder. */
function cylinderPatch(r: number, y0: number, h: number, at: number) {
  if (!patchTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.arc(48, 48, 46, 0, Math.PI * 2);
    g.fillStyle = CH.field;
    g.fill();
    g.beginPath();
    g.ellipse(48, 48, 36, 13, -0.32, Math.PI, Math.PI * 2);
    g.strokeStyle = CH.ringDark;
    g.lineWidth = 6;
    g.stroke();
    g.beginPath();
    g.arc(48, 48, 17, 0, Math.PI * 2);
    g.fillStyle = CH.planet;
    g.fill();
    g.beginPath();
    g.ellipse(48, 48, 36, 13, -0.32, 0, Math.PI);
    g.strokeStyle = CH.ring;
    g.stroke();
    patchTex = new THREE.CanvasTexture(c);
    patchTex.colorSpace = THREE.SRGBColorSpace;
  }
  const w = h;
  const geo = new THREE.CylinderGeometry(r, r, h, 8, 1, true, at - w / r / 2, w / r).translate(0, y0 + h / 2, 0);
  const m = new THREE.MeshStandardMaterial({ map: patchTex, transparent: true, roughness: 0.7, alphaTest: 0.3 });
  return new THREE.Mesh(geo, m);
}

// ── the flame ──────────────────────────────────────────────────────────────────────────────
let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/**
 * Engines burning: a column of additive glows (white-hot at the nozzles, orange, then red as it
 * thins) and a wide halo. Points, not meshes, so the ambient-occlusion pass leaves them alone.
 * `set(k)` 0..1 sizes it.
 */
export function flame() {
  const N = 16;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * 3), colr = new Float32Array((N + 1) * 3), ex = new Float32Array((N + 1) * 2);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('extra', new THREE.BufferAttribute(ex, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: glowTexture() }, scale: plumeUniforms.scale },
    vertexShader: `attribute vec2 extra; attribute vec3 tint; varying float vA; varying vec3 vC; uniform float scale;
      void main(){ vA = extra.y; vC = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = extra.x * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
      void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * a, a); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  pts.visible = false;
  const hot = new THREE.Color(5.5, 4.6, 3.0), mid = new THREE.Color(4.2, 2.0, 0.6), cool = new THREE.Color(2.2, 0.7, 0.18);
  const c = new THREE.Color();
  return {
    obj: pts as THREE.Object3D,
    set(kk: number, night: number, t: number) {
      pts.visible = kk > 0.01;
      if (!pts.visible) return;
      const len = 13 * kk * (0.92 + Math.sin(t * 41) * 0.05 + Math.sin(t * 67 + 1) * 0.04);
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        pos[i * 3] = Math.sin(t * 53 + i * 1.7) * 0.08 * f;
        pos[i * 3 + 1] = -0.2 - Math.pow(f, 1.25) * len;
        pos[i * 3 + 2] = Math.cos(t * 47 + i * 2.3) * 0.08 * f;
        if (f < 0.25) c.copy(hot).lerp(mid, f / 0.25); else c.copy(mid).lerp(cool, (f - 0.25) / 0.75);
        colr.set([c.r, c.g, c.b], i * 3);
        ex[i * 2] = (3.4 - f * 1.4 + Math.sin(t * 30 + i) * 0.25) * Math.max(0.35, kk);
        ex[i * 2 + 1] = (1 - f * 0.85) * 0.9;
      }
      // the halo round the nozzles: wide and soft, strongest at night
      pos.set([0, -2.2, 0], N * 3);
      colr.set([2.2, 1.0, 0.32], N * 3);
      ex[N * 2] = 8 + kk * (12 + night * 18);
      ex[N * 2 + 1] = 0.25 + night * 0.5;
      for (const k of ['position', 'tint', 'extra']) (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}
