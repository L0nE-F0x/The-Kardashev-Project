/**
 * The research lab: the Meshy building with its car park; tier 2 adds a two-storey wing on its east side,
 * tier 3 makes it a small campus (a three-storey wing, a rear range, a planted court by the entrance).
 * The wings are built in code in the model's own terms: cream render over a terracotta base course, a
 * charcoal parapet, ribbon glazing in dark frames, teal at the entrance.
 */
import * as THREE from 'three';
import { col, glowMat, Kit, lightPool, rng } from '../../kit';
import { model } from '../../models';
import type { Piece } from '../../pieces';
import { parkedCars } from '../life';
import type { Placement } from '../trees';
import { fanRotor, lampHeadMat, P, plants, poleLamp, wallLamp, warmPool } from '../plants2/parts';

const CREAM = '#efe6d6', BASE = '#cf6a3a', CAP = '#4a4452', FRAME = '#3a3442', TEAL = '#1f7f78';

/** The wings' glazing: dark glass by day, lit at the garage's level at night (the plants' window glow burnt out beside the model's own panes). */
const wingWin = glowMat('yel1', 0);
wingWin.color.copy(col(P.glass));
wingWin.userData.nightOnly = 0.78;
wingWin.userData.scope = 0;

interface Rect { x0: number; z0: number; x1: number; z1: number }
type Face = 'z+' | 'z-' | 'x+' | 'x-';
/** `faces`: which walls are glazed, and from which storey up (0 = every floor). */
interface WingOpts { storeys: number; faces: Partial<Record<Face, number>>; door?: number; seed: number }

/** A lab wing, footprint x0..x1 × z0..z1: glazing on the open `faces`, a door on the front at x = `door`. Returns the roof height. */
function wing(k: Kit, lit: Kit, lamps: Kit, g: THREE.Group, fans: THREE.Object3D[], r: Rect, o: WingOpts) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
  const fh = 3.3, h = o.storeys * fh + 0.5;
  const rand = rng(o.seed);
  k.box(w + 0.3, 0.3, d + 0.3, '#a39a91', x, 0, z, { r: 0.05 });
  k.box(w, h, d, CREAM, x, 0.2, z, { r: 0.14, jitter: 0.02, shade: 0.12 });
  k.box(w + 0.05, 0.85, d + 0.05, BASE, x, 0.25, z, { r: 0.04, jitter: 0.04, shade: 0.1 });
  k.box(w + 0.28, 0.42, d + 0.28, CAP, x, h + 0.05, z, { r: 0.08, shade: 0 });
  k.box(w - 0.5, 0.08, d - 0.5, P.membrane, x, h + 0.42, z, { r: 0, shade: 0, jitter: 0.02 });
  // ribbon glazing, a storey at a time: a dark frame, panes (most lit at night), a sill
  for (const face of Object.keys(o.faces) as Face[]) {
    const along = face === 'z+' || face === 'z-' ? w : d;
    const c0 = (face === 'z+' || face === 'z-' ? x : z) - along / 2, c = face === 'z+' ? r.z1 : face === 'z-' ? r.z0 : face === 'x+' ? r.x1 : r.x0;
    const sgn = face === 'z+' || face === 'x+' ? 1 : -1;
    const zf = face === 'z+' || face === 'z-';
    for (let s = o.faces[face] ?? 0; s < o.storeys; s++) {
      const y = 0.2 + s * fh + 1.25, ph = 1.55;
      // the ground floor leaves room for the door
      const gapAt = s === 0 && o.door !== undefined && face === 'z+' ? o.door : null;
      const m0 = c0 + 0.7, m1 = c0 + along - 0.7;
      const runs: [number, number][] = gapAt === null ? [[m0, m1]] : [[m0, gapAt - 1.6], [gapAt + 1.6, m1]];
      for (const [a, b] of runs) {
        if (b - a < 1.2) continue;
        const n = Math.max(1, Math.round((b - a) / 1.45)), pw = (b - a) / n;
        const mid = (a + b) / 2;
        if (zf) {
          k.box(b - a + 0.16, ph + 0.16, 0.08, FRAME, mid, y - 0.08, c + sgn * 0.01, { r: 0, jitter: 0, shade: 0 });
          k.box(b - a + 0.3, 0.1, 0.22, '#d8cfc3', mid, y - 0.18, c + sgn * 0.06, { r: 0.02, jitter: 0, shade: 0 });
        } else {
          k.box(0.08, ph + 0.16, b - a + 0.16, FRAME, c + sgn * 0.01, y - 0.08, mid, { r: 0, jitter: 0, shade: 0 });
          k.box(0.22, 0.1, b - a + 0.3, '#d8cfc3', c + sgn * 0.06, y - 0.18, mid, { r: 0.02, jitter: 0, shade: 0 });
        }
        for (let i = 0; i < n; i++) {
          const into = rand() < 0.72 ? lit : k;
          const p = a + (i + 0.5) * pw;
          if (zf) into.box(pw - 0.1, ph, 0.08, P.glass, p, y, c + sgn * 0.035, { r: 0, jitter: 0.04, shade: 0 });
          else into.box(0.08, ph, pw - 0.1, P.glass, c + sgn * 0.035, y, p, { r: 0, jitter: 0.04, shade: 0 });
        }
      }
    }
  }
  if (o.door !== undefined) {
    // the entrance: a teal pier up the front, glass doors, a canopy, a lamp
    const dx = o.door;
    k.box(0.5, h + 0.5, 0.36, TEAL, dx - 1.45, 0.2, r.z1 + 0.1, { r: 0.05, jitter: 0.03, shade: 0.08 });
    k.box(2.3, 2.45, 0.1, FRAME, dx, 0.3, r.z1 + 0.02, { r: 0, jitter: 0, shade: 0 });
    for (const sx of [-0.55, 0.55]) lit.box(1.0, 2.2, 0.08, P.glass, dx + sx, 0.42, r.z1 + 0.05, { r: 0, jitter: 0.03, shade: 0 });
    for (const sx of [-0.12, 0.12]) k.box(0.04, 0.5, 0.06, '#c9c7c0', dx + sx, 1.2, r.z1 + 0.11, { r: 0, jitter: 0 });
    k.box(3.0, 0.2, 1.7, TEAL, dx + 0.1, 2.85, r.z1 + 0.85, { r: 0.05, shade: 0 });
    for (const sx of [-1.2, 1.4]) k.box(0.1, 2.65, 0.1, FRAME, dx + sx, 0.2, r.z1 + 1.55, { r: 0, jitter: 0 });
    k.box(2.8, 0.09, 1.6, '#cfc6bd', dx + 0.1, 0.06, r.z1 + 0.85, { r: 0.02, shade: 0, jitter: 0.02 });
    wallLamp(lamps, g, dx + 0.1, 2.72, r.z1 + 0.5, 0, undefined, 3);
  }
  // the roof: air handlers with their fans, a stair head, flues
  const top = h + 0.47;
  const long = Math.max(w, d), alongX = w > d;
  const n = Math.max(1, Math.floor((long - 3.4) / 4.2));
  for (let i = 0; i < n; i++) {
    const t = -long / 2 + 1.9 + (n > 1 ? (i * (long - 6.4)) / (n - 1) : 0);
    const ux = alongX ? x + t : x - 1.2, uz = alongX ? z - 0.3 : z + t;
    k.box(2.6, 1.0, 1.9, P.hvac, ux, top, uz, { r: 0.1, jitter: 0.03 });
    k.box(2.66, 0.16, 1.96, P.hvacDark, ux, top + 0.04, uz, { r: 0.03, shade: 0 });
    for (const fx of [-0.62, 0.62]) {
      k.cyl(0.5, 0.5, 0.08, '#5e6670', ux + fx, top + 1.0, uz, 14, { shade: 0 });
      const f = fanRotor(0.44);
      f.position.set(ux + fx, top + 1.13, uz);
      g.add(f);
      fans.push(f);
    }
  }
  // the stair head at the far end
  const sx = r.x1 - 1.5, sz = alongX ? z : r.z1 - 2.0;
  k.box(1.8, 1.9, 2.2, CREAM, sx, top, sz, { r: 0.08 });
  k.box(1.95, 0.14, 2.35, CAP, sx, top + 1.9, sz, { r: 0.04, shade: 0 });
  k.box(0.8, 1.6, 0.06, FRAME, sx - 0.3, top + 0.05, sz + 1.12, { r: 0, jitter: 0 });
  for (const [fx, fz] of [[0.34, -0.36], [0.4, -0.3]]) k.cyl(0.11, 0.11, 0.9, P.silver, x + fx * w, top, z + fz * d, 8);
  return top;
}

/**
 * The model's own windows, lit at night: warm or cool panes just in front of the painted glass (measured on the
 * model at 15 long, in its own coordinates: x across, v towards the front, both from its centre), some left dark,
 * dark glazing bars over them. `open` says which faces are not built against (a wing covers the east and the rear).
 * The whole group is shown only at night: by day the model's own glass is what you see.
 */
function modelWindows(g: THREE.Group, lamps: Kit, mx: number, mz: number, s: number, seed: number, open: { east: boolean; back: boolean }) {
  const rand = rng(seed);
  // a lit lobby, offices with the lights on, the cool white of the lab floors; nothing brighter than the garage's panes
  const mats = [['yel1', 0.72], ['#ffc98a', 0.42], ['#dff2e8', 0.55], ['#cfe9e2', 0.34]].map(([c, kk]) => {
    const m = glowMat(c as string, 0);
    m.color.set('#1c2226');
    m.userData.nightOnly = kk;
    return m;
  });
  const kits = mats.map((_, i) => new Kit(rng(seed + 31 + i)));
  const bars = new Kit(rng(seed + 30));
  const BAR = '#2a2630';
  /**
   * Panes on a wall. `face`: which way it looks; `c` = the glass's depth along that axis (model coordinates);
   * a0..a1 along the wall, y0..y1 up it, cols × rows panes; `pick` chooses each pane's light (−1 = dark).
   */
  const glaze = (face: Face, c: number, a0: number, a1: number, y0: number, y1: number, cols: number, rows: number, pick: (i: number, j: number) => number, splits?: number[]) => {
    const sgn = face === 'z+' || face === 'x+' ? 1 : -1, zf = face === 'z+' || face === 'z-';
    const at = (a: number, y: number, w: number, h: number, off: number, k: Kit, paint: string) => {
      const p = c * s + sgn * off;
      if (zf) k.box(w * s, h * s, 0.02, paint, mx + a * s, y * s, mz + p, { r: 0, jitter: 0, shade: 0 });
      else k.box(0.02, h * s, w * s, paint, mx + p, y * s, mz + a * s, { r: 0, jitter: 0, shade: 0 });
    };
    const edges = splits ?? Array.from({ length: cols + 1 }, (_, i) => a0 + ((a1 - a0) * i) / cols);
    const ph = (y1 - y0) / rows;
    for (let i = 0; i < edges.length - 1; i++)
      for (let j = 0; j < rows; j++) {
        const m = pick(i, j);
        if (m >= 0) at((edges[i] + edges[i + 1]) / 2, y0 + j * ph + 0.04, edges[i + 1] - edges[i] - 0.08, ph - 0.08, 0.03, kits[m], '#ffffff');
      }
    for (const e of edges) at(e, y0 - 0.04, 0.09, y1 - y0 + 0.08, 0.045, bars, BAR);
    for (let j = 0; j <= rows; j++) at((a0 + a1) / 2, y0 + j * ph - 0.04, a1 - a0 + 0.09, 0.08, 0.045, bars, BAR);
  };
  const some = (dark: number, a: number, b: number) => () => (rand() < dark ? -1 : rand() < 0.7 ? a : b);
  // the front: the double-height lobby (its glass doors in the middle two bays), the tall window in the slate block
  const lobby = [-1.19, 0.19, 1.57, 2.81, 4.19];
  glaze('z+', 5.72, -1.19, 4.19, 3.0, 4.3, 4, 1, (i) => (i === 1 ? 1 : 0), lobby);
  glaze('z+', 5.72, -1.19, 0.19, 1.05, 3.0, 1, 1, () => 0);
  glaze('z+', 5.72, 2.81, 4.19, 1.05, 3.0, 1, 1, () => 1);
  glaze('z+', 5.72, 0.19, 2.81, 0.35, 3.0, 2, 1, () => 0);
  glaze('z+', 5.3, -4.19, -2.95, 1.44, 4.3, 1, 2, (_, j) => (j ? 2 : -1));
  if (open.east) {
    // the east wall: the tall window by the corner, a ribbon of lab windows in the teal band above
    glaze('x+', 5.875, 2.65, 4.22, 1.36, 4.0, 1, 2, (_, j) => (j ? 1 : 0));
    glaze('x+', 6.24, -3.95, 2.2, 4.85, 6.35, 6, 1, some(0.34, 2, 3));
  }
  if (open.back) {
    glaze('z-', -5.79, 2.42, 4.37, 1.54, 4.39, 2, 2, some(0.3, 1, 3));
    glaze('z-', -5.82, -4.23, -2.47, 1.63, 4.39, 2, 2, some(0.3, 2, 1));
    glaze('z-', -5.916, -4.15, 2.1, 5.0, 6.5, 6, 1, some(0.34, 2, 3));
    // a bulkhead light on the back wall between the windows
    lamps.box(0.42, 0.16, 0.2, '#e9e1d2', mx, 3.5 * s, mz - 5.916 * s - 0.1, { r: 0, jitter: 0 });
    lightPool(g, mx, 0, mz - 5.916 * s - 1.7, 3.2, warmPool);
  }
  // downlights under the entrance canopy, a bulkhead on the blank west wall
  for (const x of [0.5, 2.6]) lamps.box(0.5, 0.07, 0.3, '#e9e1d2', mx + x * s, 4.36 * s, mz + 6.7 * s, { r: 0, jitter: 0 });
  lightPool(g, mx + 1.55 * s, 0, mz + 6.9 * s, 3.8, warmPool);
  lamps.box(0.2, 0.16, 0.42, '#e9e1d2', mx - 6.25 * s - 0.1, 3.3 * s, mz + 0.5 * s, { r: 0, jitter: 0 });
  lightPool(g, mx - 6.25 * s - 1.7, 0, mz + 0.5 * s, 3.0, warmPool);
  const night = new THREE.Group();
  kits.forEach((k, i) => { if (!k.empty) { const m = k.build(mats[i]); m.castShadow = false; night.add(m); } });
  const bm = bars.build();
  bm.castShadow = false;
  night.add(bm);
  night.visible = false;
  g.add(night);
  return night;
}

export function lab(o: { seed: number; tier: number }): Piece {
  const g = new THREE.Group();
  const L = o.tier >= 3 ? 13 : 15, s = L / 15;
  const mx = o.tier >= 2 ? -4 : 0, mz = -2;
  const m = model('lab', L);
  m.position.set(mx, 0, mz);
  g.add(m);
  const size = m.userData.size as THREE.Vector3;
  // the building's walls in the piece's units (measured on the model at 15 long, standing at z = −2)
  const bx1 = mx + 6.25 * s, bz0 = mz - 5.92 * s, bz1 = mz + 5.7 * s;
  const k = new Kit(rng(o.seed));
  const lit = new Kit(rng(o.seed + 1));
  const lamps = new Kit(rng(o.seed + 2));
  const fans: THREE.Object3D[] = [];
  const trees: Placement[] = [], bushes: Placement[] = [];
  const r = rng(o.seed + 3);
  let top = size.y;
  const blockers: Rect[] = [];
  const doors: { x: number; z: number }[] = [];
  if (o.tier === 2) {
    // a two-storey wing against the east wall, set back from the front
    const w: Rect = { x0: bx1 + 0.05, z0: bz0 - 0.4, x1: 10.6, z1: bz1 - 2.3 };
    top = Math.max(top, wing(k, lit, lamps, g, fans, w, { storeys: 2, faces: { 'z+': 0, 'x+': 0, 'z-': 0 }, door: w.x0 + 2.6, seed: o.seed + 10 }));
    blockers.push({ x0: w.x0 - 0.2, z0: w.z0 - 0.2, x1: w.x1 + 0.2, z1: w.z1 + 0.2 });
    doors.push({ x: w.x0 + 2.6, z: w.z1 + 0.75 });
    for (const [x, z] of [[8.2, w.z1 + 1.3], [9.6, w.z1 + 1.1]]) bushes.push({ x, y: 0.12, z, s: 1.0 + r() * 0.3, ry: r() * 6.3 });
  } else if (o.tier >= 3) {
    // a three-storey wing to the east running the depth of the plot, a rear range closing the back
    const e: Rect = { x0: bx1 + 0.05, z0: -12.3, x1: 10.5, z1: bz1 - 1.6 };
    const rear: Rect = { x0: -10.5, z0: -12.3, x1: e.x0 + 0.1, z1: bz0 - 1.55 };
    top = Math.max(top, wing(k, lit, lamps, g, fans, rear, { storeys: 2, faces: { 'x-': 0, 'z-': 0, 'z+': 1 }, seed: o.seed + 20 }));
    top = Math.max(top, wing(k, lit, lamps, g, fans, e, { storeys: 3, faces: { 'z+': 0, 'x+': 0, 'z-': 0, 'x-': 2 }, door: e.x0 + 3.2, seed: o.seed + 10 }));
    blockers.push({ x0: e.x0 - 0.2, z0: e.z0 - 0.2, x1: e.x1 + 0.2, z1: e.z1 + 0.2 }, { x0: rear.x0 - 0.2, z0: rear.z0 - 0.2, x1: rear.x1, z1: rear.z1 + 0.2 });
    doors.push({ x: e.x0 + 3.2, z: e.z1 + 0.75 });
    // the court in front of the east wing: two trees in planters (the scene sets out the benches)
    for (const x of [7.7, 9.8]) {
      const z = e.z1 + 3.1;
      k.box(1.5, 0.42, 1.5, '#b9b1a6', x, 0.1, z, { r: 0.06 });
      k.box(1.26, 0.06, 1.26, '#6b5a3a', x, 0.5, z, { r: 0, jitter: 0.03, shade: 0 });
      trees.push({ x, y: 0.5, z, s: 0.92 + r() * 0.12, ry: r() * 6.3 });
      blockers.push({ x0: x - 0.8, z0: z - 0.8, x1: x + 0.8, z1: z + 0.8 });
    }
  }
  // the car park in front: asphalt inside a kerb, bay lines, two lamps (a walk is left between it
  // and the building, so the doors can be reached)
  const pz = 9.55;
  for (const sx of [-1, 1]) k.box(0.2, 0.1, 5.95, '#b9b1a6', sx * 7.5, 0.06, pz - 0.075, { r: 0.03, shade: 0, jitter: 0.02 });
  k.box(15.2, 0.1, 0.2, '#b9b1a6', 0, 0.06, pz - 2.95, { r: 0.03, shade: 0, jitter: 0.02 });
  k.box(14.8, 0.06, 5.8, '#6f6878', 0, 0.085, pz, { r: 0.02, shade: 0, jitter: 0.02 });
  for (let i = 0; i <= 6; i++) k.box(0.1, 0.02, 4.4, '#e6e0e3', -7.2 + i * 2.4, 0.132, pz - 0.5, { r: 0, jitter: 0, shade: 0 });
  // (lamps from the ground itself: a light pool laid higher than the asphalt would lift the cars parked under it)
  for (const x of [-7.9, 7.9]) poleLamp(k, lamps, g, x, pz - 2.2, 4.7, x < 0 ? 1 : -1, 0);
  // the walk from the car park to the entrance
  k.box(15.2, 0.06, 1.5, '#cfc6bd', 0, 0.09, pz - 3.85, { r: 0.02, shade: 0, jitter: 0.02 });
  // tier 1: a bed down the east wall
  if (o.tier <= 1) for (let i = 0; i < 5; i++) bushes.push({ x: bx1 + 0.75 + (i % 2) * 0.15, y: 0.12, z: bz1 - 1.2 - i * 1.5, s: 0.9 + r() * 0.35, ry: r() * 6.3 });
  // the model's own windows at night (the east wall is built against from tier 2, the rear from tier 3)
  const night = modelWindows(g, lamps, mx, mz, s, o.seed + 40, { east: o.tier <= 1, back: o.tier <= 2 });
  g.add(k.build(), lamps.build(lampHeadMat));
  if (!lit.empty) g.add(lit.build(wingWin));
  if (trees.length) g.add(plants('broadleaf', trees));
  if (bushes.length) g.add(plants('shrub', bushes));
  parkedCars(g, -6, pz, 6, 2.4, o.seed + 78, Math.PI / 2);
  // the building (the model is 0.834 as wide as it is deep) with the glass doors under the canopy set back in a
  // notch between the planters and the corner
  const hx = (0.834 * L) / 2, front = mz + L / 2, wall = front - 1.0;
  return {
    obj: g, w: o.tier >= 2 ? 22 : 20, d: o.tier >= 3 ? 25 : 22, h: top + 0.3,
    doors: [{ x: mx + hx * 0.38, z: wall + 0.65 }, ...doors],
    blockers: [
      { x0: mx - hx, z0: mz - L / 2, x1: mx + hx, z1: wall },
      { x0: mx - hx, z0: wall, x1: mx, z1: front },
      { x0: mx + hx * 0.86, z0: wall, x1: mx + hx, z1: front },
      ...blockers,
      { x0: -8.1, z0: pz - 2.4, x1: -7.7, z1: pz - 2.0 }, { x0: 7.7, z0: pz - 2.4, x1: 8.1, z1: pz - 2.0 },
    ],
    // the lit panes are a night thing (by day the model's own glass shows)
    update(e) {
      night.visible = e.night > 0.05;
      for (const f of fans) f.rotation.y += e.dt * 4.2;
    },
  };
}
