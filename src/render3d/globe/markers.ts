/**
 * The globe's site markers: little scale-model plinths (one per site, by what stands there), the ships and planes
 * that carry freight, and the rings of light under them. The models are drawn after the clouds (they're the map,
 * not the planet) and keep some of their colour on the night side.
 */
import * as THREE from 'three';
import type { SiteDef } from '../../content/sites';
import { Kit, rng } from '../kit';
import { OVER_CLOUDS } from './soft';

export type MarkerKind = 'home' | 'owned' | 'build' | 'supplier' | 'cloud' | 'landing' | 'mine' | 'charter' | 'mega' | 'launch' | 'other';

export interface Marker {
  site: SiteDef;
  group: THREE.Group;
  sig: string;
  kind: MarkerKind;
  /** Height of the top above the surface, in marker units. */
  top: number;
}

/**
 * The paint for every little model on the globe. Flagged transparent only to be drawn after the clouds (it writes
 * depth, so the models still hide each other properly); a share of its colour glows, so a model on the night
 * side reads as a lit miniature rather than a grey lump.
 */
export const modelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, transparent: true });
modelMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.16;');
};
modelMat.userData.shared = true;

/** A model built with the kit, in the globe's paint, drawn over the clouds. */
export function model(k: Kit) {
  const m = k.build(modelMat);
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = OVER_CLOUDS + 2;
  return m;
}

export const KIND_COL: Record<MarkerKind, string> = {
  home: '#fbd46e', owned: '#5fd3b5', build: '#e9e1d2', supplier: '#a862c4', cloud: '#6c9fd2', landing: '#2fae9b',
  mine: '#d4a862', charter: '#f7b258', mega: '#f08a46', launch: '#e6e0e3', other: '#c3bcc7',
};

const RIVAL_COL: Record<string, string> = { meridian: '#c23a3f', lattice: '#7e43a8', orchard: '#5a9537' };

export function makeMarker(site: SiteDef, kind: MarkerKind, online: boolean[], sig: string, rivals: { owner: string; building: boolean }[] = [], active = false): Marker {
  const k = new Kit(rng(site.id.length * 31 + site.lat * 7));
  const col = active ? '#a3f0d6' : KIND_COL[kind];
  // rivals' halls stand on little pads beside the plinth (a crane while they build)
  rivals.forEach((r, i) => {
    const a = -0.9 + i * 0.75, x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55;
    k.geo(new THREE.CylinderGeometry(0.42, 0.46, 0.18, 6).translate(x, 0.09, z), '#433c52', 0.02);
    k.box(0.5, r.building ? 0.25 : 0.42, 0.4, RIVAL_COL[r.owner] ?? '#9d95a6', x, 0.18, z, { r: 0.03 });
    if (r.building) {
      k.box(0.05, 0.75, 0.05, '#fbd46e', x + 0.2, 0.18, z, { r: 0, jitter: 0 });
      k.box(0.5, 0.05, 0.05, '#fbd46e', x + 0.2, 0.9, z, { r: 0, jitter: 0 });
    }
  });
  const hexPlinth = (r: number, h: number, c: string, y = 0) => k.geo(new THREE.CylinderGeometry(r, r * 1.08, h, 6).translate(0, y + h / 2, 0), c, 0.02);
  hexPlinth(1.15, 0.28, '#433c52');
  hexPlinth(1.0, 0.16, col, 0.28);
  let top = 0.6;
  if (kind === 'home') {
    k.box(0.9, 0.55, 0.7, '#efe8de', 0, 0.44, 0, { r: 0.04 });
    k.geo(new THREE.ConeGeometry(0.72, 0.42, 4).rotateY(Math.PI / 4).translate(0, 0.99 + 0.21, 0), '#5b5562', 0);
    k.box(0.38, 0.32, 0.05, '#f7b258', 0.12, 0.44, 0.36, { r: 0 });
    top = 1.45;
  } else if (kind === 'owned') {
    const n = Math.max(1, Math.min(6, online.length));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, r = n > 1 ? 0.48 : 0;
      const h = 0.35 + ((i * 37) % 5) * 0.08;
      k.box(0.42, h, 0.36, online[i] === false ? '#fbd46e' : '#e7e1d6', Math.cos(a) * r, 0.44, Math.sin(a) * r, { r: 0.03 });
      k.box(0.44, 0.06, 0.38, online[i] === false ? '#df5f3e' : '#5b5562', Math.cos(a) * r, 0.44 + h, Math.sin(a) * r, { r: 0.01 });
    }
    top = 1.25;
  } else if (kind === 'build') {
    k.cyl(0.04, 0.04, 0.9, '#9d95a6', 0, 0.44, 0, 6);
    k.box(0.4, 0.24, 0.03, '#df5f3e', 0.2, 1.08, 0, { r: 0 });
    top = 1.4;
  } else if (kind === 'supplier') {
    k.box(0.95, 0.42, 0.6, '#d8cfc3', 0, 0.44, 0, { r: 0.03 });
    k.cyl(0.1, 0.12, 0.8, '#7a7186', 0.3, 0.44, -0.12, 8);
    k.box(0.5, 0.18, 0.62, '#7e43a8', -0.18, 0.86, 0, { r: 0.02 });
    top = 1.3;
  } else if (kind === 'cloud') {
    for (const [x, y, r] of [[-0.25, 0.75, 0.3], [0.1, 0.82, 0.36], [0.4, 0.72, 0.26]]) k.geo(new THREE.SphereGeometry(r, 10, 8).translate(x, y, 0), '#e6eef8', 0.02);
    top = 1.2;
  } else if (kind === 'mine') {
    k.geo(new THREE.ConeGeometry(0.6, 0.55, 7).translate(0, 0.44 + 0.27, 0), '#9c6c3d', 0.04);
    top = 1.1;
  } else if (kind === 'landing') {
    k.geo(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.44, 0), '#efe8de', 0.02);
    top = 1.0;
  } else {
    k.box(0.6, 0.6, 0.6, col, 0, 0.44, 0, { r: 0.08 });
    top = 1.15;
  }
  const g = new THREE.Group();
  g.add(model(k));
  return { site, group: g, sig, kind, top };
}

export function shipMesh() {
  const k = new Kit(rng(3));
  k.box(1.8, 0.32, 0.55, '#93243a', 0, 0, 0, { r: 0.08 });
  k.box(1.75, 0.12, 0.5, '#efe8de', 0, 0.32, 0, { r: 0.02 });
  for (let i = 0; i < 4; i++) k.box(0.3, 0.24, 0.42, ['#345c96', '#df5f3e', '#2fae9b', '#fbd46e'][i], -0.55 + i * 0.32, 0.44, 0, { r: 0.02 });
  k.box(0.3, 0.45, 0.45, '#efe8de', 0.72, 0.44, 0, { r: 0.04 });
  const g = new THREE.Group();
  g.add(model(k));
  return g;
}

/** Freight on the road: what a sea shipment is while it crosses land to or from its port (bow, here the cab, towards +x). */
export function truckMesh() {
  const k = new Kit(rng(5));
  k.box(1.25, 0.5, 0.5, '#e6e0e3', -0.25, 0.14, 0, { r: 0.05 });
  k.box(0.42, 0.42, 0.48, '#c23a3f', 0.66, 0.14, 0, { r: 0.06 });
  k.box(1.9, 0.12, 0.44, '#433c52', 0, 0, 0, { r: 0.02 });
  const g = new THREE.Group();
  g.add(model(k));
  return g;
}

export function planeMesh() {
  const k = new Kit(rng(4));
  k.cyl(0.13, 0.13, 1.6, '#e6e0e3', 0, 0, 0, 8, { rz: Math.PI / 2 });
  k.box(0.35, 0.05, 1.7, '#c3bcc7', 0.1 - 0.8, 0, 0, { r: 0 });
  k.box(0.25, 0.4, 0.05, '#c23a3f', -1.5, 0, 0, { r: 0 });
  const g = new THREE.Group();
  g.add(model(k));
  return g;
}

/**
 * The light under the markers: a soft pool in the site's colour, a fine ring round the plinth, and a ring that
 * swells out and fades (slow where you own something, quick and bright round the chosen site). All of them in one
 * instanced draw; the scene lays them out each frame with `begin`, `add`, `end`.
 */
export class Halos {
  readonly mesh: THREE.InstancedMesh;
  private aux: THREE.InstancedBufferAttribute;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(max = 200) {
    const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.aux = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    this.aux.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aux', this.aux);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `attribute vec2 aux; varying vec2 vP; varying vec3 vTint; varying vec2 vAux;
        void main(){ vP = position.xz; vTint = instanceColor; vAux = aux;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float time; varying vec2 vP; varying vec3 vTint; varying vec2 vAux;
        void main(){
          float r = length(vP), fw = max(fwidth(r), 1e-4);
          if (r > 1.0) discard;
          // a pool of light, a fine ring round the plinth
          float pool = exp(-r * r * 5.0) * 0.42;
          float ring = 1.0 - smoothstep(0.012, 0.012 + fw * 1.5, abs(r - 0.5));
          // the ping: a ring swelling out to the edge and fading as it goes
          float t = fract(time * (0.28 + vAux.x * 0.22) + vAux.y);
          float ping = (1.0 - smoothstep(0.014, 0.014 + fw * 1.5, abs(r - mix(0.5, 0.96, t)))) * (1.0 - t) * (1.0 - t) * vAux.x;
          float light = pool * (0.5 + vAux.x * 0.5) + ring * (0.3 + vAux.x * 0.5) + ping * 0.9;
          // light added over a faint shade (it has to read on sunlit desert and on the night side alike)
          gl_FragColor = vec4(vTint * light * 1.1, exp(-r * r * 3.0) * 0.34);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = OVER_CLOUDS + 1;
    this.mesh.setColorAt(0, this.c);
  }

  begin(time: number) {
    this.n = 0;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.time.value = time;
  }

  /** `p` on the surface with normal `n`; `size` = the halo's radius in world units; `beat` 0 (still) .. 1 (calling out). */
  add(p: THREE.Vector3, n: THREE.Vector3, size: number, color: string, beat: number, phase: number) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.q.setFromUnitVectors(Halos.UP, n);
    this.mesh.setMatrixAt(this.n, this.m.compose(p, this.q, this.s.setScalar(size)));
    this.mesh.setColorAt(this.n, this.c.set(color));
    this.aux.setXY(this.n, beat, phase);
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.aux.needsUpdate = true;
  }
}
