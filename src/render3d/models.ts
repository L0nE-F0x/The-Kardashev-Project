/**
 * The Meshy models: loaded on demand (each scene asks for what it needs), re-centred (bottom at
 * y = 0, centred in x/z), made matte and given a light pull towards the game's palette so they sit
 * with the code-built pieces. People are rigged: copies share a skeleton layout and their figure's clips (the walk
 * from rigging, and Meshy library actions merged in with tools/glb-anim.mjs: idle, chat, phone, drink…).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PALETTE } from '../render/palette';
import { withClouds } from './kit';

export type ModelName =
  | 'garage' | 'lab' | 'gasplant' | 'substation' | 'watertower' | 'bungalow'
  | 'pickup' | 'semitruck' | 'sedan' | 'hatchback' | 'suv' | 'van' | 'mixer' | 'flatbed'
  | 'rock_a' | 'boulder_a' | 'cow_a' | 'cow_b';
/** Scenery models near a campus: rocks (trees and bushes are built in code: campus/trees.ts). */
export const SCENERY: ModelName[] = ['rock_a', 'boulder_a'];
export type PersonName = 'worker' | 'engineer' | 'researcher' | 'scientist' | 'office'
  | 'adv_juno' | 'adv_penny' | 'adv_mira' | 'adv_sol' | 'adv_iris' | 'adv_kip' | 'adv_lena' | 'astronaut'
  | 'kid_a' | 'kid_b' | 'resident_a' | 'resident_b';
/** The crowd's everyday figures (loaded at boot). */
export const PEOPLE: PersonName[] = ['worker', 'engineer', 'researcher', 'scientist', 'office'];
/** Everyone with a rig (advisors and astronauts load when a scene needs them). */
/** Townsfolk: two children and two people in everyday clothes (Aurora's town, Geneva's plaza; loaded there). */
export const TOWNSFOLK: PersonName[] = ['kid_a', 'kid_b', 'resident_a', 'resident_b'];
const RIGGED = new Set<string>([...PEOPLE, ...TOWNSFOLK, 'adv_juno', 'adv_penny', 'adv_mira', 'adv_sol', 'adv_iris', 'adv_kip', 'adv_lena', 'astronaut']);
export const CARS: ModelName[] = ['sedan', 'hatchback', 'suv', 'pickup', 'van'];
/** Everything on wheels: these get glass that mirrors the sky, and a paint job of their own (`paintCar`). */
const VEHICLES = new Set<string>(['pickup', 'semitruck', 'sedan', 'hatchback', 'suv', 'van', 'mixer', 'flatbed']);

// the page lives at /play/: the models sit next to it, in /3d/models/
const BASE = '../3d/models/';
const templates = new Map<string, THREE.Object3D>();
const loading = new Map<string, Promise<void>>();
/** Each rigged figure's clips by name ('walk' first, then whatever the file carries). */
const clips = new Map<string, Map<string, THREE.AnimationClip>>();
const loader = new GLTFLoader();

/** Shared uniform: how hard textures are pulled to the palette. */
export const paletteUniforms = { uPalPull: { value: 0.22 } };

const PAL_KEYS = ['ink3', 'ink5', 'ink7', 'ink8', 'ink9', 'white', 'sky3', 'sky4', 'grn2', 'grn3', 'grn4', 'grn5', 'grn6', 'grn7',
  'snd2', 'snd3', 'snd4', 'snd5', 'snd6', 'snd7', 'snd8', 'rck2', 'rck3', 'rck4', 'rck5', 'rck6', 'red2', 'red3', 'org0', 'org1',
  'org2', 'yel0', 'yel1', 'cyn2', 'cyn3', 'cyn4', 'blu1', 'blu2', 'blu3', 'blu4', 'blu5', 'skn3', 'skn5'] as const;
const palLinear = PAL_KEYS.map((k) => new THREE.Color(PALETTE[k]));

function paletteMaterial(src: THREE.MeshStandardMaterial, skinned = false) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, color: 0xffffff, roughness: 0.9, metalness: 0 });
  if (m.map) m.map.anisotropy = 4;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPalPull = paletteUniforms.uPalPull;
    sh.uniforms.uPal = { value: palLinear };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uPalPull;\nuniform vec3 uPal[${palLinear.length}];`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb; vec3 best = c; float bd = 1e9;
          for (int i = 0; i < ${palLinear.length}; i++) {
            vec3 d = (sqrt(uPal[i]) - sqrt(c)) * vec3(0.9, 1.2, 0.8);
            float dd = dot(d, d);
            if (dd < bd) { bd = dd; best = uPal[i]; }
          }
          diffuseColor.rgb = mix(c, best, uPalPull);
        }`);
  };
  m.customProgramCacheKey = () => 'kp-palette' + (skinned ? '-skin' : '');
  return withClouds(m);
}

// ── vehicles: glass and paint ─────────────────────────────────────────────────────────────────
// The vehicles come with everything painted into one texture, windows included. Two things make them read as real
// cars. Glass: the dark, cool texels above the wheels (never the level roof) turn smooth and near-black, so they
// mirror the sky and catch the sun like a windscreen. Paint: a car park of one model is a row of clones, so each
// car's body colour is turned to another one in the shader (the body's own hue, found from its texture when the
// model loads, is rotated and scaled to the new colour; a white body is tinted instead), leaving tyres, lights,
// trim and glass as they were.

/** What a vehicle's texture says about it: its body paint (mean colour in YIQ of the square-rooted colour). */
interface CarLook { mode: 0 | 1 | 2; i: number; q: number; y: number; ch: number }
/** Per model: the luma under which a texel is glass (from, to), how far up the vehicle glass starts, and the paint mode if the texture's own answer is wrong. */
const CAR_GLASS: Record<string, { lum: [number, number]; from: number; mode?: 0 | 1 | 2; hubs?: boolean; tol?: number; cab?: number }> = {
  // (hubs: the model's wheels are painted a colour no wheel has: the wheel zone's odd colours go to steel)
  sedan: { lum: [0.075, 0.115], from: 0.46, hubs: true },
  hatchback: { lum: [0.09, 0.15], from: 0.44 },
  suv: { lum: [0.1, 0.15], from: 0.5 },
  pickup: { lum: [0.1, 0.16], from: 0.5 },
  van: { lum: [0.14, 0.21], from: 0.36, mode: 1 },
  semitruck: { lum: [0.09, 0.15], from: 0.36, mode: 1 },
  // (cab: the flatbed's timber deck and its load's straps are nearly its cab's colour, so a new paint would stain
  // them: only the cab is painted, the front third of its length)
  flatbed: { lum: [0.09, 0.15], from: 0.4, mode: 1, cab: 0.335 },
  mixer: { lum: [0.09, 0.15], from: 0.42, mode: 1 },
};
/** The colours cars come in (muted, in the palette's spirit); null = the model's own. */
const CAR_PAINTS: (string | null)[] = [null, '#d9d4c8', '#8f959b', '#3b3e44', '#1c1d20', '#2f5a86', '#8c2f2a', '#2f6157', '#c79a3a', '#6d7f8c', '#7a3140', '#b9aa8c'];
const yiq = (c: THREE.Color) => {
  // (on the square root of the linear colour: close to how the eye spaces colours, cheap in a shader)
  const r = Math.sqrt(c.r), g = Math.sqrt(c.g), b = Math.sqrt(c.b);
  return { y: 0.299 * r + 0.587 * g + 0.114 * b, i: 0.596 * r - 0.274 * g - 0.322 * b, q: 0.211 * r - 0.523 * g + 0.312 * b };
};

/** Read a vehicle's body paint off its texture: the hue most of its coloured texels share, or a white body. */
function carLook(map: THREE.Texture | null): CarLook {
  const none: CarLook = { mode: 0, i: 1, q: 0, y: 1, ch: 0 };
  const img = map?.image as CanvasImageSource | undefined;
  if (!img || typeof document === 'undefined') return none;
  const N = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return none;
  cx.drawImage(img, 0, 0, N, N);
  const d = cx.getImageData(0, 0, N, N).data;
  const BINS = 36;
  const hist = new Float32Array(BINS), si = new Float32Array(BINS), sq = new Float32Array(BINS), sy = new Float32Array(BINS), sn = new Float32Array(BINS);
  let white = 0, whiteY = 0, coloured = 0;
  const c = new THREE.Color();
  for (let k = 0; k < d.length; k += 4) {
    c.setRGB(d[k] / 255, d[k + 1] / 255, d[k + 2] / 255, THREE.SRGBColorSpace);
    const { y, i, q } = yiq(c);
    const ch = Math.hypot(i, q);
    if (ch > 0.09 && y > 0.2) {
      const b = Math.floor(((Math.atan2(q, i) / (Math.PI * 2) + 1) % 1) * BINS) % BINS;
      hist[b] += ch; si[b] += i; sq[b] += q; sy[b] += y; sn[b]++;
      coloured++;
    } else if (ch < 0.06 && y > 0.68) { white++; whiteY += y; }
  }
  // the fullest three neighbouring bins (30° of hue)
  let best = 0, bw = -1;
  for (let b = 0; b < BINS; b++) { const w = hist[(b + BINS - 1) % BINS] + hist[b] + hist[(b + 1) % BINS]; if (w > bw) { bw = w; best = b; } }
  let I = 0, Q = 0, Y = 0, n = 0;
  for (const b of [(best + BINS - 1) % BINS, best, (best + 1) % BINS]) { I += si[b]; Q += sq[b]; Y += sy[b]; n += sn[b]; }
  if (white > coloured * 0.9 && white > 300) return { mode: 2, i: 1, q: 0, y: whiteY / white, ch: 0 };
  if (n < 120) return none;
  const ch = Math.hypot(I, Q) / n;
  return { mode: 1, i: I / n / ch, q: Q / n / ch, y: Y / n, ch };
}

/** The uniforms that turn a body of `look` into `paint` (null: leave it). */
function paintUniforms(look: CarLook, mode: 0 | 1 | 2, paint: string | null) {
  const body = new THREE.Vector4(look.i, look.q, 0.86, 0);
  const to = new THREE.Vector4(1, 0, 1, 1);
  if (paint && mode) {
    const t = new THREE.Color(paint);
    const p = yiq(t);
    if (mode === 2) {
      // a white body: lay the colour over it (the body's own white comes out as the colour)
      const w = look.y * look.y;
      to.set(Math.min(1.6, t.r / w), Math.min(1.6, t.g / w), Math.min(1.6, t.b / w), 0);
      body.w = 2;
    } else if (look.ch > 0.02) {
      const pc = Math.hypot(p.i, p.q);
      // turn the body's hue to the paint's (a grey or black paint keeps the hue and drops the colour)
      const turn = pc > 0.03 ? Math.atan2(p.q, p.i) - Math.atan2(look.q, look.i) : 0;
      to.set(Math.cos(turn), Math.sin(turn), Math.min(2.2, pc / look.ch), Math.min(2, p.y / look.y));
      body.w = 1;
    }
  }
  return { body, to };
}

/** A vehicle's wheels: how far they have turned (x, radians) and how far the front ones are steered (y). */
export type WheelState = { value: THREE.Vector2 };
/** Parked: every shared vehicle material's wheels stand still, pointing ahead. */
const PARKED: WheelState = { value: new THREE.Vector2(0, 0) };

/** The wheels' part of a vehicle's vertex shader (the lit pass and the shadow pass share it). */
const WHEEL_VS = `
  attribute vec4 aAxle; uniform vec3 uCarAxis; uniform vec3 uCarUpDir; uniform vec2 uCarSpin;
  vec3 kpRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * (dot(k, v) * (1.0 - c)); }
  // round the axle, then (the front wheels, w = 2) round the upright through the wheel's middle
  vec3 kpWheel(vec3 v) { v = kpRot(v, uCarAxis, uCarSpin.x); return aAxle.w > 1.5 ? kpRot(v, uCarUpDir, uCarSpin.y) : v; }`;

function carMaterial(map: THREE.Texture | null, name: string, part: CarPart, look: CarLook, paint: string | null, spin: WheelState = PARKED) {
  const { up, axis, fwd } = part;
  const cfg = CAR_GLASS[name] ?? { lum: [0.09, 0.15] as [number, number], from: 0.45 };
  const m = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.55, metalness: 0 });
  const { body, to } = paintUniforms(look, cfg.mode ?? look.mode, paint);
  if (cfg.tol) body.z = cfg.tol;
  const glass = new THREE.Vector4(cfg.lum[0], cfg.lum[1], cfg.from, cfg.hubs ? 1 : 0);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPalPull = paletteUniforms.uPalPull;
    sh.uniforms.uPal = { value: palLinear };
    sh.uniforms.uCarBody = { value: body };
    sh.uniforms.uCarPaint = { value: to };
    sh.uniforms.uCarGlass = { value: glass };
    sh.uniforms.uCarUp = { value: up };
    sh.uniforms.uCarAxis = { value: axis };
    sh.uniforms.uCarFwd = { value: fwd };
    sh.uniforms.uCarCab = { value: cfg.cab ?? 2 };
    sh.uniforms.uCarSpin = spin;
    sh.uniforms.uCarUpDir = { value: part.upDir };
    // the wheels turn: their vertices (aAxle: the wheel's middle, w = 1, or 2 on the steered axle) go round
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uCarUp; varying float vCarY; uniform vec4 uCarFwd; varying float vCarX;${WHEEL_VS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (aAxle.w > 0.5) objectNormal = kpWheel(objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarY = dot(uCarUp.xyz, position) + uCarUp.w;\nvCarX = dot(uCarFwd.xyz, position) + uCarFwd.w;\nif (aAxle.w > 0.5) transformed = aAxle.xyz + kpWheel(transformed - aAxle.xyz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uPalPull; uniform vec3 uPal[${palLinear.length}];
        uniform vec4 uCarBody; uniform vec4 uCarPaint; uniform vec4 uCarGlass; varying float vCarY;
        uniform float uCarCab; varying float vCarX;
        float kpGlass = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = max(diffuseColor.rgb, 0.0);
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // glass: dark and cool, above the wheels
          kpGlass = (1.0 - smoothstep(uCarGlass.x, uCarGlass.y, lum)) * smoothstep(-0.012, 0.012, c.b - c.r) * smoothstep(uCarGlass.z, uCarGlass.z + 0.07, vCarY);
          vec3 g = sqrt(c);
          float Y = dot(g, vec3(0.299, 0.587, 0.114));
          vec2 iq = vec2(dot(g, vec3(0.596, -0.274, -0.322)), dot(g, vec3(0.211, -0.523, 0.312)));
          float ch = length(iq);
          float own = smoothstep(uCarBody.z, uCarBody.z + (1.0 - uCarBody.z) * 0.6, dot(iq / max(ch, 1e-4), uCarBody.xy));
          if (uCarGlass.w > 0.5) {
            float hub = (1.0 - smoothstep(0.28, 0.34, vCarY)) * (1.0 - own) * smoothstep(0.08, 0.14, ch) * smoothstep(0.3, 0.42, Y);
            c = mix(c, vec3(Y * Y * 0.9) * vec3(0.97, 1.0, 1.04), hub);
          }
          if (uCarBody.w > 1.5) {
            // a white body takes the paint; lights and chrome keep a little of their own
            float m = smoothstep(0.5, 0.66, Y) * (1.0 - smoothstep(0.05, 0.11, ch));
            c = mix(c, c * uCarPaint.rgb, m);
          } else if (uCarBody.w > 0.5) {
            float m = own * smoothstep(0.03, 0.09, ch) * (1.0 - kpGlass) * (1.0 - smoothstep(uCarCab, uCarCab + 0.012, vCarX));
            vec2 q2 = vec2(iq.x * uCarPaint.x - iq.y * uCarPaint.y, iq.x * uCarPaint.y + iq.y * uCarPaint.x) * uCarPaint.z;
            float y2 = Y * uCarPaint.w;
            vec3 g2 = clamp(vec3(y2 + 0.956 * q2.x + 0.621 * q2.y, y2 - 0.272 * q2.x - 0.647 * q2.y, y2 - 1.106 * q2.x + 1.703 * q2.y), 0.0, 1.0);
            c = mix(c, g2 * g2, m);
          }
          vec3 best = c; float bd = 1e9;
          for (int i = 0; i < ${palLinear.length}; i++) {
            vec3 d = (sqrt(uPal[i]) - sqrt(c)) * vec3(0.9, 1.2, 0.8);
            float dd = dot(d, d);
            if (dd < bd) { bd = dd; best = uPal[i]; }
          }
          diffuseColor.rgb = mix(c, best, uPalPull * 0.6);
        }`)
      .replace('#include <lights_physical_fragment>', `
        {
          // (a level roof is never a window)
          kpGlass *= 1.0 - smoothstep(0.9, 0.98, inverseTransformDirection(normal, viewMatrix).y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.02, 0.03), kpGlass * 0.8);
          roughnessFactor = mix(roughnessFactor, 0.07, kpGlass);
        }
        #include <lights_physical_fragment>
        material.specularColor = mix(material.specularColor, vec3(0.07), kpGlass);`);
  };
  m.customProgramCacheKey = () => 'kp-car';
  // (a moving vehicle's own material is freed with it; its texture is the model's, kept)
  if (spin === PARKED) m.userData.shared = true;
  if (map) map.userData.shared = true;
  return withClouds(m);
}

/** Per vehicle model: each mesh's texture, its "up" in the mesh's own space, its look, and the paints made so far. */
interface CarPart { map: THREE.Texture | null; up: THREE.Vector4; /** How far back from the nose (0–1). */ fwd: THREE.Vector4; axis: THREE.Vector3; upDir: THREE.Vector3 }
const carParts = new Map<string, { look: CarLook; meshes: CarPart[]; mats: Map<number, THREE.Material[]>; wheels: Wheel[] }>();

function carMats(n: string, paint: number): THREE.Material[] | null {
  const info = carParts.get(n);
  if (!info) return null;
  let m = info.mats.get(paint);
  if (!m) {
    m = info.meshes.map((p) => carMaterial(p.map, n, p, info.look, CAR_PAINTS[paint]));
    info.mats.set(paint, m);
  }
  return m;
}

// ── wheels that turn ─────────────────────────────────────────────────────────────────────────
// A vehicle is one mesh, wheels and all. When it loads, its wheels are found from its shape: the clumps of
// vertices that touch the ground are the tyres' contact patches, a circle fitted to the underside of each gives
// the axle's place and the wheel's radius, and every vertex inside that circle (and out beyond the tyre's inner
// face) is the wheel's. Those vertices carry their axle (`aAxle`), and the vehicle's material turns them.

/** A wheel in the model's own frame (front at -x, y up from the ground, z across): its axle and radius. */
export interface Wheel { x: number; r: number; side: 1 | -1; z0: number; /** The front axle's: it steers. */ steer?: boolean }

function findWheels(root: THREE.Object3D, off: THREE.Vector3, size: THREE.Vector3): Wheel[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh); });
  const P: Float32Array[] = meshes.map((m) => {
    const pos = m.geometry.getAttribute('position');
    const out = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).add(off); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    return out;
  });
  // the contact patches: what touches the ground, clumped along the vehicle on each side
  const wheels: Wheel[] = [];
  for (const side of [1, -1] as const) {
    const touch: [number, number][] = [];
    for (const p of P) for (let i = 0; i < p.length; i += 3) if (p[i + 1] < size.y * 0.03 && p[i + 2] * side > size.z * 0.12) touch.push([p[i], Math.abs(p[i + 2])]);
    touch.sort((a, b) => a[0] - b[0]);
    let from = 0;
    for (let i = 1; i <= touch.length; i++) {
      if (i < touch.length && touch[i][0] - touch[i - 1][0] < size.x * 0.035) continue;
      const clump = touch.slice(from, i);
      from = i;
      if (clump.length < 3) continue;
      const cx = (clump[0][0] + clump[clump.length - 1][0]) / 2;
      const z0 = Math.min(...clump.map((c) => c[1]));
      // the tyre's underside from the side: the lowest point at each distance from the axle's line
      const BW = size.x * 0.004, NB = 60;
      const low = new Float32Array(NB).fill(1e9);
      // (along every triangle's edges, not only at its corners: a low-poly wheel has a corner every 45°)
      const near = (p: Float32Array, i: number) => p[i * 3 + 2] * side >= z0 - size.z * 0.02 && Math.abs(p[i * 3] - cx) < NB * BW;
      meshes.forEach((m, mi) => {
        const p = P[mi], idx = m.geometry.getIndex();
        const n = idx ? idx.count : p.length / 3;
        for (let t = 0; t < n; t += 3) {
          const v = [idx ? idx.getX(t) : t, idx ? idx.getX(t + 1) : t + 1, idx ? idx.getX(t + 2) : t + 2];
          if (!near(p, v[0]) || !near(p, v[1]) || !near(p, v[2])) continue;
          for (let e = 0; e < 3; e++) {
            const a = v[e] * 3, b = v[(e + 1) % 3] * 3;
            const k = Math.max(1, Math.ceil(Math.abs(p[b] - p[a]) / (BW * 0.5)));
            for (let j = 0; j <= k; j++) {
              const f = j / k, bin = Math.floor(Math.abs(p[a] + (p[b] - p[a]) * f - cx) / BW), y = p[a + 1] + (p[b + 1] - p[a + 1]) * f;
              if (bin < NB && y < low[bin]) low[bin] = y;
            }
          }
        }
      });
      // the radius whose circle (resting on the ground) most of that underside lies on
      let best = 0, bs = -1;
      for (let r = size.y * 0.07; r <= size.y * 0.36; r += size.y * 0.0025) {
        let fit = 0, n = 0, err = 0;
        for (let b = 0; b < NB; b++) {
          const d = (b + 0.5) * BW;
          if (d < r * 0.35 || d > r * 0.96) continue;
          n++;
          const off = low[b] < 1e8 ? Math.abs(low[b] - (r - Math.sqrt(r * r - d * d))) / r : 1;
          if (off < 0.085) { fit++; err += off; }
        }
        // (most of the underside on the circle, and as close to it as can be)
        const sc = n >= 4 && fit ? fit / n - (err / fit) * 3 : 0;
        if (sc > bs + 1e-6) { bs = sc; best = r; }
      }
      if (bs >= 0.5) wheels.push({ x: cx, r: best, side, z0 });
    }
  }
  if (!wheels.length) { for (const m of meshes) m.geometry.setAttribute('aAxle', new THREE.BufferAttribute(new Float32Array(m.geometry.getAttribute('position').count * 4), 4)); return wheels; }
  // one size of wheel a vehicle (they all turn at one rate): the commonest fit
  const rs = wheels.map((w) => w.r).sort((a, b) => a - b);
  const R = rs[rs.length >> 1];
  for (const w of wheels) w.r = R;
  // which vertices are a wheel's: inside its circle, from the tyre's inner face outwards
  const key = (p: Float32Array, i: number) => `${Math.round(p[i] / size.x * 4000)},${Math.round(p[i + 1] / size.x * 4000)},${Math.round(p[i + 2] / size.x * 4000)}`;
  const owner = P.map((p) => {
    const o = new Int8Array(p.length / 3).fill(-1);
    for (let i = 0, v = 0; i < p.length; i += 3, v++) {
      for (let k = 0; k < wheels.length; k++) {
        const w = wheels[k];
        if (p[i + 2] * w.side < w.z0 - size.z * 0.025) continue;
        const dx = p[i] - w.x, dy = p[i + 1] - w.r;
        if (dx * dx + dy * dy <= w.r * w.r * 1.05) { o[v] = k; break; }
      }
    }
    return o;
  });
  // a triangle half on a wheel would be wrung like a cloth: its wheel-side corners stay with the body (and so does
  // every vertex that shares their place), until only whole triangles turn
  for (let pass = 0; pass < 6; pass++) {
    const drop = new Set<string>();
    meshes.forEach((m, mi) => {
      const idx = m.geometry.getIndex();
      const n = idx ? idx.count : P[mi].length / 3;
      const o = owner[mi];
      for (let t = 0; t < n; t += 3) {
        const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
        if (o[a] === o[b] && o[b] === o[c]) continue;
        for (const v of [a, b, c]) if (o[v] >= 0) drop.add(key(P[mi], v * 3));
      }
    });
    if (!drop.size) break;
    P.forEach((p, mi) => { const o = owner[mi]; for (let v = 0; v < o.length; v++) if (o[v] >= 0 && drop.has(key(p, v * 3))) o[v] = -1; });
  }
  // the front axle steers (the nose is at -x): each of its wheels swivels about its own middle
  const nose = Math.min(...wheels.map((w) => w.x));
  for (const w of wheels) w.steer = w.x - nose < size.x * 0.03;
  const mid = wheels.map(() => [1e9, -1e9]);
  P.forEach((p, mi) => { const o = owner[mi]; for (let v = 0; v < o.length; v++) if (o[v] >= 0) { const z = p[v * 3 + 2]; const m = mid[o[v]]; if (z < m[0]) m[0] = z; if (z > m[1]) m[1] = z; } });
  const inv = new THREE.Matrix4(), c = new THREE.Vector3();
  meshes.forEach((m, mi) => {
    inv.copy(m.matrixWorld).invert();
    const o = owner[mi];
    const a = new Float32Array(o.length * 4);
    for (let v = 0; v < o.length; v++) {
      if (o[v] < 0) continue;
      const w = wheels[o[v]];
      c.set(w.x, w.r, (mid[o[v]][0] + mid[o[v]][1]) / 2).sub(off).applyMatrix4(inv);
      a[v * 4] = c.x; a[v * 4 + 1] = c.y; a[v * 4 + 2] = c.z; a[v * 4 + 3] = w.steer ? 2 : 1;
    }
    m.geometry.setAttribute('aAxle', new THREE.BufferAttribute(a, 4));
  });
  return wheels;
}

/**
 * A vehicle that drives: its own materials, so its wheels can turn on their own. Returns the angle to advance
 * (`spin.value`, radians) and the wheels' radius in the copy's own size, or null for something without wheels.
 */
export function drivenCar(o: THREE.Object3D): { spin: WheelState; r: number; base: number } | null {
  const n = o.userData.model as string;
  const info = carParts.get(n);
  if (!info || !info.wheels.length) return null;
  const spin: WheelState = { value: new THREE.Vector2(0, 0) };
  const paint = CAR_PAINTS[(o.userData.paint as number) ?? 0];
  let i = 0;
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    const p = info.meshes[i++];
    if (!p) return;
    mesh.material = carMaterial(p.map, n, p, info.look, paint, spin);
    // its shadow's wheels turn with it
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      sh.uniforms.uCarAxis = { value: p.axis };
      sh.uniforms.uCarUpDir = { value: p.upDir };
      sh.uniforms.uCarSpin = spin;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>${WHEEL_VS}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (aAxle.w > 0.5) transformed = aAxle.xyz + kpWheel(transformed - aAxle.xyz);');
    };
    depth.customProgramCacheKey = () => 'kp-car-depth';
    mesh.customDepthMaterial = depth;
  });
  // (the distance between the first and the last axle: what the steering angle is worked out from)
  const xs = info.wheels.map((w) => w.x);
  return { spin, r: info.wheels[0].r * o.scale.x, base: Math.max(1, (Math.max(...xs) - Math.min(...xs)) * o.scale.x) };
}

export const wheelsOf = (n: string) => carParts.get(n)?.wheels ?? [];

/**
 * Give a vehicle from `model()` a paint job: `pick` (0–1, e.g. from the scene's seeded random) chooses among the
 * colours cars come in. About a third keep the model's own colour.
 */
export function paintCar(o: THREE.Object3D, pick: number) {
  const n = o.userData.model as string;
  if (!carParts.has(n)) return o;
  const k = pick < 0.3 ? 0 : 1 + Math.floor(((pick - 0.3) / 0.7) * (CAR_PAINTS.length - 1)) % (CAR_PAINTS.length - 1);
  const mats = carMats(n, k);
  if (!mats) return o;
  let i = 0;
  o.traverse((c) => { const mesh = c as THREE.Mesh; if (mesh.isMesh) mesh.material = mats[i++] ?? mesh.material; });
  o.userData.paint = k;
  return o;
}

function prepare(root: THREE.Object3D, skinned: boolean) {
  root.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.userData.shared = true;
      mesh.material = paletteMaterial(mesh.material as THREE.MeshStandardMaterial, skinned);
      (mesh.material as THREE.Material).userData.shared = true;
      mesh.castShadow = true;
      mesh.receiveShadow = !skinned;
      if (skinned) mesh.frustumCulled = false;
    }
  });
}

/** Load the named models (and people) if they aren't yet. */
export function loadModels(names: (ModelName | PersonName)[]): Promise<void> {
  return Promise.all(names.map((n) => {
    if (templates.has(n)) return Promise.resolve();
    let p = loading.get(n);
    if (p) return p;
    const person = RIGGED.has(n);
    p = (async () => {
      const g = await loader.loadAsync(`${BASE}${n}.glb`);
      const root = g.scene;
      prepare(root, person);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const wrap = new THREE.Group();
      root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      wrap.add(root);
      wrap.userData.size = box.getSize(new THREE.Vector3());
      if (VEHICLES.has(n)) {
        // each mesh's height up the vehicle (0 at the tyres' contact, 1 at the roof) from its own coordinates
        const size = wrap.userData.size as THREE.Vector3;
        const meshes: CarPart[] = [];
        let look: CarLook | null = null;
        const wheels = findWheels(root, root.position, size);
        root.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          const e = mesh.matrixWorld.elements;
          const map = (mesh.material as THREE.MeshStandardMaterial).map;
          look ??= carLook(map);
          // (the axle's direction in the mesh's own space: across the vehicle)
          const axis = new THREE.Vector3(e[2], e[6], e[10]).normalize();
          meshes.push({
            map, axis, upDir: new THREE.Vector3(e[1], e[5], e[9]).normalize(),
            up: new THREE.Vector4(e[1] / size.y, e[5] / size.y, e[9] / size.y, (e[13] - box.min.y) / size.y),
            fwd: new THREE.Vector4(e[0] / size.x, e[4] / size.x, e[8] / size.x, (e[12] - box.min.x) / size.x),
          });
        });
        carParts.set(n, { look: look ?? { mode: 0, i: 1, q: 0, y: 1, ch: 0 }, meshes, mats: new Map(), wheels });
        const own = carMats(n, 0)!;
        let i = 0;
        root.traverse((c) => { const mesh = c as THREE.Mesh; if (mesh.isMesh) mesh.material = own[i++]; });
      }
      templates.set(n, wrap);
      // people come as Meshy's walk file (the rigged figure and its walk cycle in one) with the library clips added
      if (person && g.animations[0]) clips.set(n, new Map(g.animations.map((a, i) => [i === 0 ? 'walk' : a.name, a])));
    })();
    loading.set(n, p);
    return p;
  })).then(() => undefined);
}

export const hasModel = (n: string) => templates.has(n);

// ── decks: what a building model lets people stand on ────────────────────────────────────────
// The buildings come with their own base (a concrete apron, a porch, steps), a foot or more above the ground the
// piece stands on. People are placed by the ground's height, so without this they wade through the slab. A deck is
// the model's low, upward-facing surfaces as a small height grid (model units, the model's own base = 0), made once
// per model by drawing its low triangles from above; `deckHeight` reads it for a placed copy.

interface Deck {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** Height of the walkable surface in each cell, 0 where there is none. */
  h: Float32Array;
}
const decks = new Map<string, Deck | null>();
/**
 * How high above its base a model's surface still counts as floor, as a share of its longest side: 0.6 m on the 17 m
 * garage, enough for its apron (0.3 m) and door step (0.5 m), not for the workbenches in its open bay (0.9 m).
 */
const DECK_BAND = 0.035;
const DECK_CELLS = 192;

export function deckOf(n: string): Deck | null {
  if (decks.has(n)) return decks.get(n)!;
  const t = templates.get(n);
  if (!t) return null;
  t.updateMatrixWorld(true);
  const s = t.userData.size as THREE.Vector3;
  const side = Math.max(s.x, s.z);
  const band = side * DECK_BAND;
  const cell = side / DECK_CELLS;
  const nx = Math.ceil(s.x / cell) + 1;
  const nz = Math.ceil(s.z / cell) + 1;
  const d: Deck = { x0: -s.x / 2, z0: -s.z / 2, cell, nx, nz, h: new Float32Array(nx * nz) };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let any = false;
  t.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    const idx = m.geometry.getIndex();
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m.matrixWorld);
      if (a.y > band || b.y > band || c.y > band) continue;
      // facing up (either winding: the models aren't all consistent), and not a sliver
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const ny = uz * vx - ux * vz;
      const nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
      // (a bevelled lip counts: people stand on an apron's sloped edge as on its top)
      if (nl < 1e-9 || Math.abs(ny) / nl < 0.5) continue;
      const den = ux * vz - vx * uz;
      if (Math.abs(den) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - d.x0) / cell));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x, c.x) - d.x0) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - d.z0) / cell));
      const j1 = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z, c.z) - d.z0) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let k = i0; k <= i1; k++) {
          const px = d.x0 + k * cell - a.x, pz = d.z0 + j * cell - a.z;
          const s1 = (px * vz - vx * pz) / den, s2 = (ux * pz - px * uz) / den;
          // a little slack, so a cell on a seam between two triangles is not left out
          if (s1 < -0.02 || s2 < -0.02 || s1 + s2 > 1.02) continue;
          const y = a.y + s1 * uy + s2 * vy;
          if (y > d.h[j * nx + k]) {
            d.h[j * nx + k] = y;
            any = true;
          }
        }
      }
    }
  });
  if (any) {
    // close the seams: a riser or a crack in the model leaves a strip a cell or two wide where only the base shows
    // through. Growing the floor by a cell and shrinking it again fills those strips and leaves the edges where
    // they were, so nobody drops through a step on the way to the door.
    const pass = (src: Float32Array, pick: (a: number, b: number) => number) => {
      const out = src.slice();
      for (let j = 1; j < nz - 1; j++) {
        for (let k = 1; k < nx - 1; k++) {
          let v = src[j * nx + k];
          for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) v = pick(v, src[(j + dj) * nx + k + dk]);
          out[j * nx + k] = v;
        }
      }
      return out;
    };
    d.h = pass(pass(d.h, Math.max), Math.min);
  }
  const out = any ? d : null;
  decks.set(n, out);
  return out;
}

const deckLocal = new THREE.Vector3();
/**
 * The world height of a placed model's floor under (x, z), or null when the point is off the model or over nothing
 * to stand on. `o` is a copy from `model()`, anywhere in a scene (its world matrix must be current); `inv` is the
 * inverse of that matrix, kept by the caller.
 */
export function deckHeight(o: THREE.Object3D, inv: THREE.Matrix4, x: number, y: number, z: number): number | null {
  const d = deckOf(o.userData.model as string);
  if (!d) return null;
  deckLocal.set(x, y, z).applyMatrix4(inv);
  // the copy's own matrix scales the template: model units are the template's
  const fx = (deckLocal.x - d.x0) / d.cell, fz = (deckLocal.z - d.z0) / d.cell;
  const i = Math.round(fx), j = Math.round(fz);
  if (i < -1 || j < -1 || i > d.nx || j > d.nz) return null;
  // a foot is as wide as a cell, and a deck's lip is often a cell the grid missed (a bevel, a long sliver of a
  // triangle): whoever stands at a deck's edge stands on the deck (the highest floor in the cells round them), not
  // 20 cm down in the lawn beside it
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ii = i + di, jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= d.nx || jj >= d.nz) continue;
    h = Math.max(h, d.h[jj * d.nx + ii]);
  }
  if (h <= 0) return null;
  return deckLocal.set(deckLocal.x, h, deckLocal.z).applyMatrix4(o.matrixWorld).y;
}

/**
 * A copy of a model scaled so its longest side (x or z) is `size` units. Geometry and materials
 * are shared; clipAbove gives a copy its own materials when it needs them.
 */
export function model(n: ModelName, size: number): THREE.Object3D {
  const t = templates.get(n);
  if (!t) return placeholder(size);
  const o = t.clone(true);
  const s = t.userData.size as THREE.Vector3;
  const k = size / Math.max(s.x, s.z);
  o.scale.setScalar(k);
  o.userData.size = s.clone().multiplyScalar(k);
  // which model this is a copy of (campusScene reads its floor from it: `deckHeight`)
  o.userData.model = n;
  return o;
}

/** What a figure can be doing (the clips' names, as tools/glb-anim.mjs names them). */
export type Act = 'walk' | 'idle' | 'chat' | 'listen' | 'talk' | 'phone' | 'drink' | 'walkphone' | 'sit' | 'inspect' | 'look'
  | 'hammer' | 'carry' | 'collect' | 'pickup';
/** What to play when a figure lacks a clip. */
const FALLBACK: Record<Act, Act[]> = {
  walk: [], idle: [], chat: ['talk', 'idle'], listen: ['idle'], talk: ['chat', 'idle'], phone: ['idle'], drink: ['idle'],
  walkphone: ['walk'], sit: ['idle'], inspect: ['pickup', 'look', 'idle'], look: ['idle'], hammer: ['collect', 'pickup', 'idle'],
  carry: ['walk'], collect: ['pickup', 'idle'], pickup: ['collect', 'idle'],
};
const WALKING = new Set<Act>(['walk', 'walkphone', 'carry']);
export const isWalking = (a: Act) => WALKING.has(a);

type BoneKey = 'spine' | 'neck' | 'rfore' | 'hips';
const BONE_NAMES: Record<string, BoneKey> = { Spine01: 'spine', neck: 'neck', RightForeArm: 'rfore', Hips: 'hips' };

/**
 * A rigged person and its animation. `play(act)` cross-fades to that clip, or the nearest one the figure has; a
 * figure with no idle clip stands on the walk's first frame and breathes, shifts its weight and (talking) moves a
 * hand on its bones, so nobody freezes mid-step.
 */
export class Figure {
  readonly mixer: THREE.AnimationMixer;
  /** The walk action (older callers pause it to stand a figure still). */
  readonly walk: THREE.AnimationAction;
  /** What it shows now. */
  act: Act = 'walk';
  private action: THREE.AnimationAction;
  private set: Map<string, THREE.AnimationClip>;
  private bones: Partial<Record<BoneKey, THREE.Object3D>> = {};
  private t = Math.random() * 10;
  private proc: 'none' | 'stand' | 'talk' = 'none';

  constructor(readonly obj: THREE.Object3D, readonly kind: PersonName) {
    this.set = clips.get(kind)!;
    this.mixer = new THREE.AnimationMixer(obj);
    this.walk = this.mixer.clipAction(this.set.get('walk')!);
    this.walk.play();
    this.action = this.walk;
    obj.traverse((o) => { const k = BONE_NAMES[o.name]; if (k) this.bones[k] = o; });
  }

  has(a: Act) { return this.set.has(a); }

  /** The act this figure really shows for `a`. */
  resolve(a: Act): Act {
    if (this.set.has(a)) return a;
    for (const f of FALLBACK[a]) if (this.set.has(f)) return f;
    return WALKING.has(a) ? 'walk' : 'idle';
  }

  /** Cross-fade to an act over `fade` seconds; returns what it plays. */
  play(want: Act, fade = 0.35): Act {
    const a = this.resolve(want);
    const clip = this.set.get(a);
    const still = !clip || (a === 'idle' && !this.set.has('idle'));
    this.proc = !still ? 'none' : want === 'chat' || want === 'talk' ? 'talk' : 'stand';
    const next = still ? this.walk : this.mixer.clipAction(clip!);
    if (next !== this.action || this.act !== a) {
      if (next !== this.action) {
        next.reset();
        next.enabled = true;
        next.setEffectiveWeight(1);
        next.play();
        if (fade > 0) next.crossFadeFrom(this.action, fade, false);
        else this.action.stop();
        this.action = next;
      }
      next.timeScale = 1;
      if (still) { next.paused = true; next.time = 0; } else {
        next.paused = false;
        // a looping idle starts somewhere along it, so a crowd doesn't breathe in step
        if (!WALKING.has(a)) next.time = Math.random() * clip!.duration;
      }
    }
    this.act = a;
    return a;
  }

  /** Walking pace: the cycle follows the ground speed (m/s). */
  pace(speed: number) {
    if (this.act === 'walk') this.action.timeScale = speed / 1.2;
    else if (WALKING.has(this.act)) this.action.timeScale = speed / 1.1;
  }

  update(dt: number) {
    this.mixer.update(dt);
    this.t += dt;
    if (this.proc === 'none') return;
    const t = this.t, b = this.bones;
    b.spine?.rotateX(Math.sin(t * 1.4) * 0.02).rotateZ(Math.sin(t * 0.37) * 0.035);
    b.hips?.rotateZ(Math.sin(t * 0.37) * 0.03);
    b.neck?.rotateY(Math.sin(t * 0.23) * 0.3 + Math.sin(t * 0.71) * 0.08);
    if (this.proc === 'talk') b.rfore?.rotateX(-0.45 - 0.35 * Math.max(0, Math.sin(t * 2.3))).rotateY(Math.sin(t * 3.1) * 0.25);
  }
}

/** A rigged person `height` tall, walking (null if its figure isn't loaded). */
export function person(n: PersonName, height = 1.75): Figure | null {
  const t = templates.get(n);
  if (!t || !clips.get(n)?.get('walk')) return null;
  const o = cloneSkinned(t);
  const s = t.userData.size as THREE.Vector3;
  o.scale.setScalar(height / s.y);
  return new Figure(o, n);
}

/** The model's geometry + material pairs (for instancing trees). */
export function modelParts(n: ModelName) {
  const t = templates.get(n);
  if (!t) return null;
  t.updateMatrixWorld(true);
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  t.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) out.push({ geo: m.geometry, mat: m.material as THREE.Material, matrix: m.matrixWorld.clone() });
  });
  return { parts: out, size: t.userData.size as THREE.Vector3 };
}

/** While a model loads (or if it's missing): a plain bevelled block. */
function placeholder(size: number) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.4, size * 0.7).translate(0, size * 0.2, 0), new THREE.MeshStandardMaterial({ color: 0xd8cfc3, roughness: 0.9 }));
  g.castShadow = true;
  const o = new THREE.Group();
  o.add(g);
  o.userData.size = new THREE.Vector3(size, size * 0.4, size * 0.7);
  return o;
}
