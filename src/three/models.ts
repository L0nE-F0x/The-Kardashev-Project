/**
 * The Meshy hero models: loaded once, re-centred (bottom at y = 0, centred in x/z), made matte, and
 * given a light pull towards the game's palette so they sit with the code-built pieces.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE } from '../render/palette';
import { withClouds } from './kit';

export type ModelName = 'garage' | 'lab' | 'gasplant' | 'substation' | 'watertower' | 'bungalow' | 'pickup' | 'semitruck' | 'mesquite' | 'oak';
const NAMES: ModelName[] = ['garage', 'lab', 'gasplant', 'substation', 'watertower', 'bungalow', 'pickup', 'semitruck', 'mesquite', 'oak'];

/** Turn each model so its front faces +z (towards the default camera). Checked by eye. */
const FACING: Partial<Record<ModelName, number>> = {};

const templates = new Map<ModelName, THREE.Object3D>();

/** Shared uniforms: how hard textures are pulled to the palette (the Pixel look turns it off). */
export const paletteUniforms = { uPalPull: { value: 0.22 } };

const PAL_KEYS = ['ink3', 'ink5', 'ink7', 'ink8', 'ink9', 'white', 'sky3', 'sky4', 'grn2', 'grn3', 'grn4', 'grn5', 'grn6', 'grn7',
  'snd2', 'snd3', 'snd4', 'snd5', 'snd6', 'snd7', 'snd8', 'rck2', 'rck3', 'rck4', 'rck5', 'rck6', 'red2', 'red3', 'org0', 'org1',
  'org2', 'yel0', 'yel1', 'cyn2', 'cyn3', 'cyn4', 'blu1', 'blu2', 'blu3', 'blu4', 'blu5', 'skn3', 'skn5'] as const;
const palLinear = PAL_KEYS.map((k) => new THREE.Color(PALETTE[k]));

function paletteMaterial(src: THREE.MeshStandardMaterial) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, color: 0xffffff, roughness: 0.9, metalness: 0 });
  if (m.map) m.map.anisotropy = 4;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPalPull = paletteUniforms.uPalPull;
    sh.uniforms.uPal = { value: palLinear };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uPalPull;\nuniform vec3 uPal[${palLinear.length}];`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb; vec3 best = c; float bd = 1e9;
          for (int i = 0; i < ${palLinear.length}; i++) {
            vec3 d = (sqrt(uPal[i]) - sqrt(c)) * vec3(0.9, 1.2, 0.8);
            float dd = dot(d, d);
            if (dd < bd) { bd = dd; best = uPal[i]; }
          }
          diffuseColor.rgb = mix(c, best, uPalPull);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'kp-palette';
  return withClouds(m);
}

export async function loadModels(base = '/3d/models/') {
  const loader = new GLTFLoader();
  await Promise.all(NAMES.map(async (n) => {
    const g = await loader.loadAsync(`${base}${n}.glb`);
    const root = g.scene;
    root.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.userData.shared = true;
        mesh.material = paletteMaterial(mesh.material as THREE.MeshStandardMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    root.rotation.y = FACING[n] ?? 0;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const wrap = new THREE.Group();
    root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    wrap.add(root);
    wrap.userData.size = box.getSize(new THREE.Vector3());
    templates.set(n, wrap);
  }));
}

/**
 * A copy of a model scaled so its longest side (x or z) is `size` units. Geometry and materials
 * are shared; call `ownMaterials` before changing a copy's materials (e.g. clipping).
 */
export function model(n: ModelName, size: number): THREE.Object3D {
  const t = templates.get(n);
  if (!t) throw new Error(`model ${n} not loaded`);
  const o = t.clone(true);
  const s = t.userData.size as THREE.Vector3;
  o.scale.setScalar(size / Math.max(s.x, s.z));
  o.userData.size = s.clone().multiplyScalar(size / Math.max(s.x, s.z));
  return o;
}

/** The model's geometry + material pairs (for instancing trees and scrub). */
export function modelParts(n: ModelName) {
  const t = templates.get(n)!;
  t.updateMatrixWorld(true);
  const out: { geo: THREE.BufferGeometry; mat: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  t.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) out.push({ geo: m.geometry, mat: m.material as THREE.Material, matrix: m.matrixWorld.clone() });
  });
  return { parts: out, size: t.userData.size as THREE.Vector3 };
}
