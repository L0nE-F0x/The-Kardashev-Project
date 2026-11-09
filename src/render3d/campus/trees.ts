/**
 * Code-built trees and plants in the scale-model style (chunky, faceted, hand-painted), for the
 * kinds there's no Meshy model of, and cheap far-away stand-ins. Each kind is one geometry with
 * vertex colours, drawn instanced.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { col, rng, type Paint } from '../kit';

export type TreeKind = 'pine' | 'palm' | 'saguaro' | 'barrel' | 'birch' | 'broadleaf' | 'blob' | 'acacia' | 'shrub' | 'tuft' | 'rock' | 'boulder';

function paint(g: THREE.BufferGeometry, c: Paint, jitter: number, seed: number) {
  const ng = g.index ? g.toNonIndexed() : g;
  const r = rng(seed);
  const pos = ng.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const base = col(c);
  // per-face jitter: three vertices at a time
  for (let i = 0; i < pos.count; i += 3) {
    const k = 1 + (r() - 0.5) * jitter;
    for (let j = 0; j < 3 && i + j < pos.count; j++) cols.set([base.r * k, base.g * k, base.b * k], (i + j) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  for (const key of Object.keys(ng.attributes)) if (key !== 'position' && key !== 'color') ng.deleteAttribute(key);
  return ng;
}

function blobby(r: number, detail: number, seed: number, squash = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const rr = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const k = 0.85 + rr() * 0.3;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  return g;
}

const cache = new Map<TreeKind, THREE.BufferGeometry>();

/** One merged, vertex-coloured geometry per kind, about 1 unit tall per unit of `scale` (base at y = 0). */
export function treeGeometry(kind: TreeKind): THREE.BufferGeometry {
  const c = cache.get(kind);
  if (c) return c;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, p: Paint, j = 0.12, seed = 1) => parts.push(paint(g, p, j, seed));
  switch (kind) {
    case 'pine': {
      add(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6).translate(0, 0.8, 0), '#5c3a26');
      const tiers: [number, number, number, string][] = [[1.6, 1.9, 1.2, '#2f5a3e'], [1.25, 1.6, 2.4, '#356848'], [0.85, 1.3, 3.5, '#3d7550']];
      tiers.forEach(([r, h, y, c2], i) => add(new THREE.ConeGeometry(r, h, 7, 1).translate(0, y, 0), c2, 0.14, i + 3));
      break;
    }
    case 'palm': {
      // a curved trunk in segments, fronds drooping from the crown
      let x = 0, y = 0;
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.CylinderGeometry(0.13, 0.16, 0.9, 6).translate(0, 0.45, 0).rotateZ(-0.07 * i).translate(x, y, 0);
        add(seg, i % 2 ? '#8a6a48' : '#7a5c3e', 0.05, i);
        x += Math.sin(0.07 * i) * 0.9;
        y += Math.cos(0.07 * i) * 0.88;
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = new THREE.BoxGeometry(2.2, 0.06, 0.5).translate(1.1, 0, 0).rotateZ(-0.45).rotateY(a).translate(x, y + 0.05, 0);
        add(leaf, i % 2 ? '#4f8a3a' : '#5f9a42', 0.1, i + 10);
      }
      add(new THREE.SphereGeometry(0.28, 6, 5).translate(x, y - 0.1, 0), '#6b5a2a');
      break;
    }
    case 'saguaro': {
      add(new THREE.CylinderGeometry(0.32, 0.36, 3.6, 8).translate(0, 1.8, 0), '#5f8a4a', 0.08);
      add(new THREE.SphereGeometry(0.32, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 3.6, 0), '#6b9652');
      for (const [s, h, up] of [[1, 1.4, 1.3], [-1, 1.9, 1.0]] as const) {
        add(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 7).rotateZ(Math.PI / 2).translate(s * 0.6, h, 0), '#5f8a4a', 0.08);
        add(new THREE.CylinderGeometry(0.22, 0.24, up, 7).translate(s * 1.0, h + up / 2, 0), '#668f4e', 0.08);
        add(new THREE.SphereGeometry(0.22, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(s * 1.0, h + up, 0), '#6b9652');
      }
      break;
    }
    case 'barrel':
      add(blobby(0.5, 1, 3, 0.8).translate(0, 0.35, 0), '#6b8f4e', 0.1);
      add(new THREE.SphereGeometry(0.16, 6, 4).translate(0, 0.75, 0), '#e86aa0');
      break;
    case 'birch':
      add(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 6).translate(0, 1.3, 0), '#e6e0d6', 0.12);
      add(blobby(1.0, 1, 5, 1.25).translate(0, 3.1, 0), '#7fa84a', 0.16, 2);
      add(blobby(0.7, 1, 6, 1.1).translate(0.5, 2.6, 0.2), '#8fb552', 0.16, 3);
      break;
    case 'broadleaf':
      add(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6).translate(0, 0.8, 0), '#5c3a26');
      add(blobby(1.3, 1, 7).translate(0, 2.4, 0), '#3f7b35', 0.18, 2);
      add(blobby(0.95, 1, 8).translate(0.8, 2.0, 0.3), '#4a8a3a', 0.18, 3);
      add(blobby(0.9, 1, 9).translate(-0.7, 2.1, -0.3), '#367030', 0.18, 4);
      break;
    case 'blob':
      add(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 5).translate(0, 0.5, 0), '#5c3a26');
      add(blobby(1.1, 0, 11).translate(0, 1.8, 0), '#4a7a3a', 0.2, 2);
      break;
    case 'acacia':
      add(new THREE.CylinderGeometry(0.1, 0.18, 2.2, 6).translate(0, 1.1, 0).rotateZ(0.08), '#5c3a26');
      add(blobby(1.8, 1, 13, 0.32).translate(0.15, 2.45, 0), '#6f8a3a', 0.16, 2);
      break;
    case 'shrub':
      add(blobby(0.7, 0, 15, 0.75).translate(0, 0.35, 0), '#6f7a3c', 0.25);
      break;
    case 'tuft':
      for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.06, 0.6, 3).rotateZ((i - 2) * 0.22).translate((i - 2) * 0.08, 0.28, 0), '#a8a456', 0.2, i);
      break;
    case 'rock':
      add(new THREE.DodecahedronGeometry(0.6, 0).scale(1, 0.6, 1).translate(0, 0.2, 0), '#a08d84', 0.2);
      break;
    case 'boulder':
      add(new THREE.DodecahedronGeometry(1.4, 1).scale(1.2, 0.75, 1).translate(0, 0.5, 0), '#8a7a72', 0.2);
      break;
  }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  cache.set(kind, g);
  return g;
}

/** Where a tree stands; `rx` tips it (round x, after its spin) to stand square to curved ground. */
export interface Placement { x: number; y: number; z: number; s: number; ry: number; tint?: number; rx?: number }

/** Instanced trees of one kind, with a little colour and size variation each. */
export function treeField(kind: TreeKind, at: Placement[], mat: THREE.Material): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(treeGeometry(kind), mat, Math.max(1, at.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const c = new THREE.Color();
  at.forEach((p, i) => {
    e.set(p.rx ?? 0, p.ry, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    im.setMatrixAt(i, m);
    c.setScalar(p.tint ?? 1);
    im.setColorAt(i, c);
  });
  im.count = at.length;
  im.castShadow = true;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}
