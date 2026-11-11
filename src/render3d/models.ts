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
  | 'garage' | 'lab' | 'gasplant' | 'substation' | 'watertower' | 'bungalow' | 'mesquite' | 'oak'
  | 'pickup' | 'semitruck' | 'sedan' | 'hatchback' | 'suv' | 'van' | 'mixer' | 'flatbed'
  | 'rock_a' | 'boulder_a' | 'broadleaf_a' | 'pine_a';
/** Scenery models near a campus: rocks, a bush, two trees (the code-built ones stand further out). */
export const SCENERY: ModelName[] = ['rock_a', 'boulder_a', 'broadleaf_a', 'pine_a'];
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
const DECK_CELLS = 96;

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
      if (nl < 1e-9 || Math.abs(ny) / nl < 0.75) continue;
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
  if (i < 0 || j < 0 || i >= d.nx || j >= d.nz) return null;
  const h = d.h[j * d.nx + i];
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
