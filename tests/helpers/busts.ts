/**
 * What the portrait tests can check without WebGL: the busts are plain three.js scene graphs, so Node can build
 * them, look for broken geometry and tell two of them apart. (The pictures themselves need a browser: the dev page
 * /play/portraits.html is the contact sheet.)
 */
import * as THREE from 'three';
import type { Shot } from '../../src/render3d/portraits/parts';

export const MOODS = ['neutral', 'happy', 'worried', 'angry', 'excited'] as const;

const sound = new WeakMap<THREE.BufferGeometry, boolean>();
/** True when every position in a geometry is a real number (checked once per shared geometry). */
function finite(g: THREE.BufferGeometry): boolean {
  let ok = sound.get(g);
  if (ok === undefined) {
    const a = g.attributes.position.array as ArrayLike<number>;
    ok = a.length > 0;
    for (let i = 0; ok && i < a.length; i++) if (!Number.isFinite(a[i])) ok = false;
    sound.set(g, ok);
  }
  return ok;
}

export interface Survey {
  meshes: number;
  /** Meshes whose geometry or placement holds a NaN or an infinity. */
  broken: number;
  /** A fingerprint of everything in the shot: which shapes, where, how big, what colour. */
  print: string;
}

/** Walk a shot: count its meshes, find anything broken, and fingerprint it. */
export function survey(shot: Shot): Survey {
  shot.root.updateMatrixWorld(true);
  const rows: string[] = [];
  let meshes = 0;
  let broken = 0;
  shot.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const e = m.matrixWorld.elements;
    if (!finite(m.geometry) || e.some((v) => !Number.isFinite(v))) broken++;
    const mat = m.material as THREE.Material & { color?: THREE.Color; uniforms?: Record<string, { value: unknown }> };
    const colour = mat.color ? mat.color.getHexString() : JSON.stringify(Object.values(mat.uniforms ?? {}).map((u) => (u.value as THREE.Color)?.isColor ? (u.value as THREE.Color).getHexString() : ''));
    rows.push(`${m.geometry.attributes.position.count}|${colour}|${Array.from(e, (v) => v.toFixed(3)).join(',')}`);
  });
  return { meshes, broken, print: rows.sort().join('\n') };
}
