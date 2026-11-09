/**
 * The Meshy models: loaded on demand (each scene asks for what it needs), re-centred (bottom at
 * y = 0, centred in x/z), made matte and given a light pull towards the game's palette so they sit
 * with the code-built pieces. People are rigged: copies share a skeleton layout and the walk clip.
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

// the page lives at /play3d/: the models sit next to it, in /3d/models/
const BASE = '../3d/models/';
const templates = new Map<string, THREE.Object3D>();
const loading = new Map<string, Promise<void>>();
const clips = new Map<string, THREE.AnimationClip>();
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
      // people come as Meshy's walk file: the rigged figure and its walk cycle in one
      if (person && g.animations[0]) clips.set(n, g.animations[0]);
    })();
    loading.set(n, p);
    return p;
  })).then(() => undefined);
}

export const hasModel = (n: string) => templates.has(n);

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
  return o;
}

/** A rigged person `height` tall with its own mixer playing the walk (null if not loaded). */
export function person(n: PersonName, height = 1.75): { obj: THREE.Object3D; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction } | null {
  const t = templates.get(n);
  const clip = clips.get(n);
  if (!t || !clip) return null;
  const o = cloneSkinned(t);
  const s = t.userData.size as THREE.Vector3;
  o.scale.setScalar(height / s.y);
  const mixer = new THREE.AnimationMixer(o);
  const walk = mixer.clipAction(clip);
  walk.play();
  return { obj: o, mixer, walk };
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
