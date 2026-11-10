/**
 * What flies in the orbit view, as lit scale models: orbital data centres (server drums on a truss,
 * solar wings, radiators), space-solar stations (a field of gold film with a transmitter looking
 * down), beam relays, build scaffolds, the L4/L5 foundry yards and the habitat cylinders. Each kind is
 * modelled once and shared by every copy; running lights, strobes and windows go to the scene's Lamps.
 * Models face the Earth along +z (the scene turns them with `lookAt`).
 */
import * as THREE from 'three';
import { Kit, rng } from '../kit';
import type { Lamps } from '../space/lamps';

export type StationKind = 'odc' | 'sps' | 'relay' | 'build' | 'yard' | 'habitat';

const shared = <M extends THREE.Material>(m: M) => { m.userData.shared = true; return m; };
const hullMat = shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }));
// solar cells: near-black glass that flashes when the Sun's reflection finds the camera
const panelMat = shared(new THREE.MeshStandardMaterial({ color: 0x1a2b58, roughness: 0.22, metalness: 0.9, emissive: 0x050a1c }));
const foilMat = shared(new THREE.MeshStandardMaterial({ color: 0xd8a23e, roughness: 0.32, metalness: 0.9, emissive: 0x2c1a04 }));
const windowMat = shared(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.0) }));

const WHITE = new THREE.Color(7, 7, 7.6), RED = new THREE.Color(7, 0.9, 0.5), GREEN = new THREE.Color(0.6, 6, 1.4), WARM = new THREE.Color(5, 3.1, 1.4);
const CYAN = new THREE.Color(1, 4.6, 4), AMBER = new THREE.Color(6.5, 3.2, 0.4), FURNACE = new THREE.Color(8, 2.4, 0.5);

type LampDef = [x: number, y: number, z: number, color: THREE.Color, size: number, period?: number, duty?: number];
interface Model { hull: THREE.BufferGeometry; panels?: THREE.BufferGeometry; foil?: THREE.BufferGeometry; windows?: THREE.BufferGeometry; lamps: LampDef[] }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const QUARTER = Math.PI / 2;

/** The twelve edges of a box frame as truss members. */
function frame(k: Kit, w: number, h: number, d: number, t: number, paint: string, at = V(0, 0, 0)) {
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    k.beam(V(-w / 2, (a * h) / 2, (b * d) / 2).add(at), V(w / 2, (a * h) / 2, (b * d) / 2).add(at), t, paint);
    k.beam(V((a * w) / 2, -h / 2, (b * d) / 2).add(at), V((a * w) / 2, h / 2, (b * d) / 2).add(at), t, paint);
    k.beam(V((a * w) / 2, (b * h) / 2, -d / 2).add(at), V((a * w) / 2, (b * h) / 2, d / 2).add(at), t, paint);
  }
}

function model(kind: StationKind, variant: number): Model {
  const r = rng(variant * 31 + kind.length * 7 + 3);
  const k = new Kit(r), p = new Kit(r), f = new Kit(r), w = new Kit(r);
  const lamps: LampDef[] = [];
  if (kind === 'odc') {
    // a truss spine carrying server drums, with solar wings out to the sides and white radiators fore and aft
    const drums = 2 + (variant % 2);
    const len = drums * 1.9 + 1.2;
    k.beam(V(-len / 2, 0, 0), V(len / 2, 0, 0), 0.16, '#9d95a6');
    for (let i = 0; i < drums; i++) {
      const x = (i - (drums - 1) / 2) * 1.9;
      k.cyl(0.52, 0.52, 1.5, '#e9e3e6', x - 0.75, 0, 0, 14, { rz: -QUARTER });
      k.cyl(0.56, 0.56, 0.12, '#c3bcc7', x - 0.06, 0, 0, 14, { rz: -QUARTER });
      lamps.push([x, 0, 0.56, CYAN, 0.2]);
      // wings: two long panels a side, on a boom
      for (const s of [-1, 1]) {
        k.beam(V(x, s * 0.5, 0), V(x, s * 5.2, 0), 0.07, '#c3bcc7');
        p.box(1.5, 2.1, 0.05, '#1a2b58', x, s > 0 ? 0.8 : -2.9, 0, { r: 0 });
        p.box(1.5, 2.1, 0.05, '#1a2b58', x, s > 0 ? 3.05 : -5.15, 0, { r: 0 });
      }
    }
    for (const s of [-1, 1]) k.box(len * 0.55, 0.05, 1.5, '#f6f1ea', 0, -0.025, s * 1.45, { r: 0, jitter: 0.02 });
    k.cyl(0.55, 0.1, 0.4, '#e9e3e6', len / 2 - 0.5, 0, 0.3, 12, { rx: QUARTER });
    lamps.push([-len / 2, 0, 0, WHITE, 0.3, 1.9, 0.07], [len / 2, 0, 0, WHITE, 0.3, 1.9, 0.07], [0, 5.2, 0, RED, 0.24], [0, -5.2, 0, GREEN, 0.24]);
  } else if (kind === 'sps') {
    // a field of gold film on a light frame, a hub behind its middle, the transmitter looking down at the Earth
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) f.box(2.7, 2.7, 0.04, '#d8a23e', i * 2.9, j * 2.9 - 1.35, -0.7, { r: 0 });
    for (let i = -2; i <= 1; i++) {
      k.beam(V(i * 2.9 + 1.45, -4.4, -0.7), V(i * 2.9 + 1.45, 4.4, -0.7), 0.06, '#9d95a6');
      k.beam(V(-4.4, i * 2.9 + 1.45, -0.7), V(4.4, i * 2.9 + 1.45, -0.7), 0.06, '#9d95a6');
    }
    k.box(1.1, 1.1, 1.1, '#e9e3e6', 0, -0.55, -0.1, { r: 0.1 });
    k.cyl(1.35, 0.25, 0.75, '#f6f1ea', 0, 0, 0.45, 18, { rx: QUARTER });
    lamps.push([0, 0, 1.25, WARM, 0.5], [0, 0, -1.3, WHITE, 0.3, 2.3, 0.07]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) lamps.push([a * 4.3, b * 4.3, -0.7, AMBER, 0.2]);
  } else if (kind === 'relay') {
    // a dish that catches the swarm's beam, a dish that sends it down
    k.box(0.9, 0.9, 0.9, '#e9e3e6', 0, -0.45, 0, { r: 0.1 });
    k.cyl(1.0, 0.2, 0.55, '#f6f1ea', 0, 0, 0.45, 16, { rx: QUARTER });
    k.cyl(1.6, 0.25, 0.7, '#d9d2d6', 0, 0, -0.45, 18, { rx: -QUARTER });
    for (const s of [-1, 1]) {
      k.beam(V(0, s * 0.45, 0), V(0, s * 3, 0), 0.06, '#c3bcc7');
      p.box(0.9, 2.2, 0.05, '#1a2b58', 0, s > 0 ? 0.8 : -3, 0, { r: 0 });
    }
    lamps.push([0, 0, 1.05, CYAN, 0.36], [0, 3, 0, WHITE, 0.26, 2.1, 0.07]);
  } else if (kind === 'build') {
    // a data centre going up inside its scaffold: a drum in place, welding flashes, hazard lamps on the corners
    frame(k, 4.4, 2.4, 2.4, 0.08, '#f08a46');
    k.cyl(0.52, 0.52, 1.5, '#e9e3e6', -1.6, 0, 0, 14, { rz: -QUARTER });
    k.beam(V(-2.2, 0, 0), V(2.2, 0, 0), 0.14, '#9d95a6');
    p.box(1.4, 1.6, 0.05, '#1a2b58', 1.2, 1.3, 0, { r: 0 });
    lamps.push([0.6, 0.2, 0.3, WHITE, 0.34, 0.37, 0.22], [1.5, -0.4, -0.5, WHITE, 0.3, 0.53, 0.18]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) lamps.push([a * 2.2, b * 1.2, 1.2, AMBER, 0.22, 1.4, 0.5]);
  } else if (kind === 'yard') {
    // a foundry yard: a long gantry, the furnace, tanks, and a sail of gold film taking shape on the slip
    frame(k, 8, 2.6, 2.6, 0.1, '#9d95a6');
    for (let i = -3; i <= 3; i += 2) k.beam(V(i, -1.3, -1.3), V(i + 1, 1.3, 1.3), 0.06, '#c3bcc7');
    k.box(1.8, 1.5, 1.6, '#d9d2d6', -2.6, -0.75, 0, { r: 0.1 });
    k.cyl(0.5, 0.5, 1.6, '#e9e3e6', -0.6, -0.9, -0.7, 12, { rz: -QUARTER });
    k.cyl(0.5, 0.5, 1.6, '#e9e3e6', -0.6, -0.9, 0.7, 12, { rz: -QUARTER });
    f.geo(new THREE.CylinderGeometry(1.9, 1.9, 0.04, 6).rotateX(QUARTER).translate(2.4 + (variant % 3) * 0.3, 0.1, 0), '#d8a23e', 0.04);
    k.beam(V(1, 1.3, 0), V(3.6, 2.4, 0), 0.08, '#fbd46e');
    lamps.push([-2.6, 0, 0.9, FURNACE, 0.55, 2.6, 0.75], [-4, 1.3, 1.3, WHITE, 0.3, 1.7, 0.07], [4, -1.3, -1.3, WHITE, 0.3, 1.7, 0.07], [3.6, 2.4, 0, AMBER, 0.24, 1.2, 0.5], [0.4, 1.3, 1.3, WARM, 0.2]);
  } else {
    // a habitat: a long drum turning for gravity, three strips of land and three of window, mirrors to feed them light
    k.cyl(2.2, 2.2, 12, '#e6e0e3', -6, 0, 0, 24, { rz: -QUARTER });
    k.cyl(2.2, 0.9, 1.1, '#c3bcc7', 6, 0, 0, 24, { rz: -QUARTER });
    k.cyl(0.9, 2.2, 1.1, '#c3bcc7', -7.1, 0, 0, 24, { rz: -QUARTER });
    k.cyl(0.4, 0.4, 1.8, '#9d95a6', 7, 0, 0, 10, { rz: -QUARTER });
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      w.geo(new THREE.BoxGeometry(11, 0.06, 1.5).translate(0, 2.2, 0).rotateX(a), '#fde9a4', 0);
      f.geo(new THREE.BoxGeometry(10.5, 0.04, 2.2).translate(0, 0, 0).rotateZ(0.42).translate(-0.6, 3.9, 0).rotateX(a), '#d8a23e', 0.03);
      lamps.push([7.9, c * 0.2, sn * 0.2, s === 0 ? RED : WHITE, 0.3, 2.4, s === 0 ? 0.5 : 0.07], [-7.1, c * 0.9, sn * 0.9, AMBER, 0.2]);
    }
  }
  const out: Model = { hull: k.build().geometry, lamps };
  if (!p.empty) out.panels = p.build().geometry;
  if (!f.empty) out.foil = f.build().geometry;
  if (!w.empty) out.windows = w.build().geometry;
  // (shared between copies: a station leaving the scene must not take its model with it)
  for (const g of [out.hull, out.panels, out.foil, out.windows]) if (g) g.userData.shared = true;
  return out;
}

/** Builds stations, sharing each kind's geometry between its copies. */
export class Fleet {
  private models = new Map<string, Model>();

  constructor(private readonly lamps: Lamps) {}

  /** A station of `kind` (`variant` picks among its shapes), with its lamps lit. */
  make(kind: StationKind, variant = 0) {
    const key = `${kind}${variant % 3}`;
    let m = this.models.get(key);
    if (!m) this.models.set(key, (m = model(kind, variant % 3)));
    const g = new THREE.Group();
    const part = (geo: THREE.BufferGeometry | undefined, mat: THREE.Material) => { if (geo) g.add(new THREE.Mesh(geo, mat)); };
    part(m.hull, hullMat);
    part(m.panels, panelMat);
    part(m.foil, foilMat);
    part(m.windows, windowMat);
    // every copy blinks on its own beat
    const phase = (variant * 0.37) % 1;
    for (const [x, y, z, color, size, period, duty] of m.lamps) this.lamps.add(g, x, y, z, color, size, period ?? 0, duty ?? 1, phase);
    return g;
  }

  /** Free the shared models (the scene's own dispose skips them: stations come and go while it lives). */
  dispose() {
    for (const m of this.models.values()) for (const g of [m.hull, m.panels, m.foil, m.windows]) g?.dispose();
    this.models.clear();
  }
}
