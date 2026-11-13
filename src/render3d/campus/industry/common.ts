/**
 * Shared bits for the view-only set pieces: brand looks, building blocks with real parapets and
 * cladding, rooftop plant, stacks, pipes, tanks, lit windows, signs, flags, spinning fans and the
 * small vehicles the pieces need (forklift, haul truck). Everything is built with the Kit (bevelled,
 * hand-painted, matte) in the game's palette.
 */
import * as THREE from 'three';
import { plantOn } from '../trees';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { col, glowMat, Kit, lightPool, mix, poolMat, withClouds, type Paint } from '../../kit';
import { sign } from '../../fx';
import type { Env } from '../../pieces';
import { BRANDS, type SetPieceOpts } from '../registry';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The top of the gravel pad the scene lays under every piece that doesn't reshape the ground: flat decals sit on it. */
export const G = 0.12;

// ── brands ───────────────────────────────────────────────────────────────────────────────────
export interface Look { name: string; accent: string; hi: string }

const MINES: Record<string, Look> = {
  'mine-atacama': { name: 'SALTFLAT', accent: '#2fae9b', hi: '#5fd3b5' },
  'mine-pilbara': { name: 'PILBARA LI', accent: '#f08a46', hi: '#fbd46e' },
  'mine-copperbelt': { name: 'DEEPVEIN', accent: '#df5f3e', hi: '#f7b258' },
  'mine-helium': { name: 'HELIUM', accent: '#4a7cb6', hi: '#9cc4ea' },
  'mine-neon': { name: 'CLEARAIR', accent: '#e86aa0', hi: '#f7a6c4' },
};

/** The piece's brand colours (suppliers from BRANDS, mines from their own list, else teal). */
export function brandOf(o: SetPieceOpts): Look {
  const b = BRANDS[o.brand] ?? MINES[o.brand];
  if (b) return { name: o.label || b.name, accent: b.accent, hi: b.hi };
  return { name: o.label || o.brand.toUpperCase(), accent: '#2fae9b', hi: '#5fd3b5' };
}

// ── palette for buildings ────────────────────────────────────────────────────────────────────
export const P = {
  wall: '#ddd6cc', wallHi: '#ece6dc', wallCool: '#d3d0cc', steel: '#c9c1b6', plinth: '#a39a91',
  roof: '#5b5562', roofHi: '#6f6878', trim: '#8a8490', trim2: '#9d95a6', dark: '#433c52',
  plant: '#b9c2c4', plant2: '#8a959a', fan: '#5e6670', glass: '#3b6f7a', glassB: '#34506b',
  concrete: '#bdb4aa', asphalt: '#6f6878', tank: '#ece6dc', pipe: '#9d95a6', ink: '#2f2a3d',
} as const;

// ── blocks ───────────────────────────────────────────────────────────────────────────────────
export interface BlockOpts {
  wall?: Paint;
  roof?: Paint;
  edge?: Paint;
  /** Accent band near the top (null = none). */
  band?: Paint | null;
  bandH?: number;
  /** Horizontal panel joints every n units (0 = none). */
  joints?: number;
  /** Vertical ribs every n units on the long faces (0 = none). */
  ribs?: number;
  /** Bevel of the main mass. */
  r?: number;
  /** A dark louvre band from y0 to y1 (a sub-fab or plant floor). */
  louvre?: [number, number];
  plinth?: boolean;
  /** Which faces get joints/ribs: front (+z), back, left (-x), right (+x). */
  faces?: ('f' | 'b' | 'l' | 'r')[];
}

/** A building mass: plinth, walls, a recessed roof behind a parapet, optional cladding. */
export function block(k: Kit, x: number, z: number, w: number, d: number, h: number, o: BlockOpts = {}, y = 0) {
  const wall = o.wall ?? P.wall, roof = o.roof ?? P.roof, edge = o.edge ?? P.roof;
  const r = o.r ?? Math.min(0.35, Math.min(w, d, h) * 0.03 + 0.08);
  if (o.plinth !== false) k.box(w + 0.5, 0.45, d + 0.5, P.plinth, x, y, z, { r: 0.08, shade: 0.1 });
  k.box(w, h, d, wall, x, y, z, { r, jitter: 0.025, shade: 0.16 });
  // the roof deck, then a parapet round it
  k.box(w - 0.5, 0.16, d - 0.5, roof, x, y + h - 0.02, z, { r: 0, jitter: 0.03, shade: 0 });
  const pt = 0.32, ph = 0.6;
  k.box(w + 0.12, ph, pt, edge, x, y + h - 0.1, z + d / 2 - pt / 2 + 0.06, { r: 0.08, shade: 0 });
  k.box(w + 0.12, ph, pt, edge, x, y + h - 0.1, z - d / 2 + pt / 2 - 0.06, { r: 0.08, shade: 0 });
  k.box(pt, ph, d - 0.4, edge, x + w / 2 - pt / 2 + 0.06, y + h - 0.1, z, { r: 0.08, shade: 0 });
  k.box(pt, ph, d - 0.4, edge, x - w / 2 + pt / 2 - 0.06, y + h - 0.1, z, { r: 0.08, shade: 0 });
  if (o.band) {
    const bh = o.bandH ?? 0.6;
    k.box(w + 0.06, bh, d + 0.06, o.band, x, y + h - bh - 0.55, z, { r: 0.04, shade: 0, jitter: 0.02 });
  }
  if (o.louvre) {
    const [y0, y1] = o.louvre;
    k.box(w + 0.04, y1 - y0, d + 0.04, '#6f6878', x, y + y0, z, { r: 0.03, shade: 0, jitter: 0.02 });
    for (let yy = y0 + 0.22; yy < y1 - 0.1; yy += 0.28) k.box(w + 0.1, 0.06, d + 0.1, '#8a8490', x, y + yy, z, { r: 0, jitter: 0 });
  }
  const faces = o.faces ?? ['f', 'b', 'l', 'r'];
  const jc = mix(wall, '#7a7186', 0.28);
  if (o.joints) {
    const top = h - (o.band ? (o.bandH ?? 0.6) + 0.6 : 0.6);
    const lo = o.louvre ? o.louvre[1] + 0.3 : 1.2;
    for (let yy = lo; yy < top - 0.2; yy += o.joints) {
      if (faces.includes('f')) k.box(w - 0.3, 0.07, 0.06, jc, x, y + yy, z + d / 2 + 0.01, { r: 0, jitter: 0 });
      if (faces.includes('b')) k.box(w - 0.3, 0.07, 0.06, jc, x, y + yy, z - d / 2 - 0.01, { r: 0, jitter: 0 });
      if (faces.includes('l')) k.box(0.06, 0.07, d - 0.3, jc, x - w / 2 - 0.01, y + yy, z, { r: 0, jitter: 0 });
      if (faces.includes('r')) k.box(0.06, 0.07, d - 0.3, jc, x + w / 2 + 0.01, y + yy, z, { r: 0, jitter: 0 });
    }
  }
  if (o.ribs) {
    const y0 = o.louvre ? o.louvre[1] : 0.5;
    const top = h - (o.band ? (o.bandH ?? 0.6) + 0.6 : 0.7);
    const rc = mix(wall, '#9d95a6', 0.35);
    for (let xx = x - w / 2 + o.ribs / 2; xx < x + w / 2 - 0.3; xx += o.ribs) {
      if (faces.includes('f')) k.box(0.2, top - y0, 0.1, rc, xx, y + y0, z + d / 2 + 0.02, { r: 0, jitter: 0.01, shade: 0 });
      if (faces.includes('b')) k.box(0.2, top - y0, 0.1, rc, xx, y + y0, z - d / 2 - 0.02, { r: 0, jitter: 0.01, shade: 0 });
    }
    for (let zz = z - d / 2 + o.ribs / 2; zz < z + d / 2 - 0.3; zz += o.ribs) {
      if (faces.includes('l')) k.box(0.1, top - y0, 0.2, rc, x - w / 2 - 0.02, y + y0, zz, { r: 0, jitter: 0.01, shade: 0 });
      if (faces.includes('r')) k.box(0.1, top - y0, 0.2, rc, x + w / 2 + 0.02, y + y0, zz, { r: 0, jitter: 0.01, shade: 0 });
    }
  }
}

// ── rooftop plant ────────────────────────────────────────────────────────────────────────────
/** Spinning fans, all in one instanced mesh. */
export class Fans {
  private at: { x: number; y: number; z: number; r: number; spin: number; a: number }[] = [];
  private mesh: THREE.InstancedMesh | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  speed = 1;
  add(x: number, y: number, z: number, r: number, spin = 6) {
    this.at.push({ x, y, z, r, spin: spin * (0.8 + ((this.at.length * 37) % 10) / 25), a: this.at.length * 0.7 });
  }
  /** Fan rings go in the kit, blades in their own mesh (call after adding them all). */
  build(parent: THREE.Object3D, k: Kit, ring: Paint = P.fan) {
    for (const f of this.at) {
      k.cyl(f.r, f.r, 0.12, ring, f.x, f.y - 0.08, f.z, 16, { shade: 0, jitter: 0.02 });
      k.cyl(f.r * 0.82, f.r * 0.82, 0.06, '#2f2a3d', f.x, f.y - 0.01, f.z, 14, { shade: 0, jitter: 0 });
    }
    if (!this.at.length) return;
    const g = new THREE.BoxGeometry(1.7, 0.05, 0.26);
    const merged = mergeGeometries([g, g.clone().rotateY(Math.PI / 2)])!;
    merged.translate(0, 0.02, 0);
    this.mesh = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ color: col('#433c52'), roughness: 0.75 }), this.at.length);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    parent.add(this.mesh);
    this.update({ t: 0, dt: 0, night: 0 });
  }
  update(e: Env) {
    if (!this.mesh) return;
    this.at.forEach((f, i) => {
      f.a += e.dt * f.spin * this.speed;
      this.q.setFromAxisAngle(this.up, f.a);
      this.s.set(f.r * 0.98, 1, f.r * 0.98);
      this.p.set(f.x, f.y, f.z);
      this.mesh!.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A rooftop air handler: a long box with louvres along its sides and fans on top. */
export function airHandler(k: Kit, fans: Fans, x: number, y: number, z: number, w: number, d: number, h = 1.6, nFans = 0, paint: Paint = P.plant) {
  k.box(w, 0.25, d + 0.2, P.trim, x, y, z, { r: 0, shade: 0 });
  k.box(w, h, d, paint, x, y + 0.2, z, { r: 0.12, jitter: 0.03, shade: 0.12 });
  k.box(w + 0.04, 0.16, d + 0.04, P.plant2, x, y + 0.24, z, { r: 0, shade: 0 });
  // louvres on the long sides
  for (let yy = 0.55; yy < h - 0.2; yy += 0.24) {
    k.box(w * 0.86, 0.05, 0.05, P.plant2, x, y + 0.2 + yy, z + d / 2 + 0.02, { r: 0, jitter: 0 });
    k.box(w * 0.86, 0.05, 0.05, P.plant2, x, y + 0.2 + yy, z - d / 2 - 0.02, { r: 0, jitter: 0 });
  }
  const n = nFans || Math.max(1, Math.floor(w / 2.4));
  const fr = Math.min(d * 0.38, (w / n) * 0.4);
  for (let i = 0; i < n; i++) fans.add(x - w / 2 + (w / n) * (i + 0.5), y + h + 0.3, z, fr);
}

/** A cooling-tower cell: a box with a fan stack on top. */
export function coolingCell(k: Kit, fans: Fans, x: number, y: number, z: number, s = 3.2, h = 3.2, paint: Paint = '#b8bfc0') {
  k.box(s, h, s, paint, x, y, z, { r: 0.12, jitter: 0.03, shade: 0.2 });
  for (let yy = 0.5; yy < h * 0.55; yy += 0.28) {
    k.box(s * 0.84, 0.06, 0.05, P.plant2, x, y + yy, z + s / 2 + 0.02, { r: 0, jitter: 0 });
    k.box(0.05, 0.06, s * 0.84, P.plant2, x - s / 2 - 0.02, y + yy, z, { r: 0, jitter: 0 });
    k.box(0.05, 0.06, s * 0.84, P.plant2, x + s / 2 + 0.02, y + yy, z, { r: 0, jitter: 0 });
  }
  k.cyl(s * 0.42, s * 0.46, 0.7, paint, x, y + h, z, 18, { shade: 0.1 });
  fans.add(x, y + h + 0.62, z, s * 0.36, 4.5);
}

/** An exhaust stack (base collar, a coloured band at the top). */
export function stack(k: Kit, x: number, y: number, z: number, r: number, h: number, paint: Paint = '#c3bcc7', band: Paint | null = null) {
  k.cyl(r * 1.35, r * 1.4, 0.35, P.trim, x, y, z, 12, { shade: 0 });
  k.cyl(r, r * 1.05, h, paint, x, y, z, 12, { shade: 0.12, jitter: 0.03 });
  k.cyl(r * 1.08, r * 1.08, 0.3, band ?? P.trim, x, y + h - 0.7, z, 12, { shade: 0 });
  k.cyl(r * 1.02, r * 1.02, 0.12, '#433c52', x, y + h - 0.02, z, 12, { shade: 0 });
}

/** A round pipe between two points. */
export function tube(k: Kit, a: THREE.Vector3, b: THREE.Vector3, r: number, paint: Paint = P.pipe, seg = 8) {
  const len = a.distanceTo(b);
  if (len < 0.01) return;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  k.geo(g, paint, 0.03, 0);
}

/** A pipe along a polyline, with a ball at each bend. */
export function pipeRun(k: Kit, pts: THREE.Vector3[], r: number, paint: Paint = P.pipe) {
  for (let i = 0; i + 1 < pts.length; i++) tube(k, pts[i], pts[i + 1], r, paint);
  for (let i = 1; i + 1 < pts.length; i++) k.geo(new THREE.SphereGeometry(r * 1.15, 8, 6).translate(pts[i].x, pts[i].y, pts[i].z), paint, 0.02, 0);
}

/** A vertical tank on legs with a domed head (cryogenic gases, chemicals). */
export function vTank(k: Kit, x: number, z: number, r: number, h: number, paint: Paint = P.tank, legs = 0.8, band: Paint | null = null) {
  const y0 = legs;
  if (legs > 0) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.box(0.22, legs + 0.3, 0.22, P.trim, x + Math.cos(a) * r * 0.72, 0, z + Math.sin(a) * r * 0.72, { r: 0.02, jitter: 0 });
    }
    k.cyl(r * 0.8, r * 0.8, 0.12, P.trim, x, legs - 0.05, z, 14, { shade: 0 });
  } else k.cyl(r * 1.08, r * 1.12, 0.35, P.concrete, x, 0, z, 16, { shade: 0 });
  k.cyl(r, r, h, paint, x, y0, z, 18, { shade: 0.14, jitter: 0.02 });
  k.geo(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(x, y0 + h, z), paint, 0.02, 0);
  if (band) k.cyl(r * 1.02, r * 1.02, 0.35, band, x, y0 + h * 0.72, z, 18, { shade: 0 });
  // a ladder up the side: two rails and rungs
  for (const sx of [-0.22, 0.22]) k.box(0.06, h + 0.3, 0.06, P.trim, x + sx, y0, z + r + 0.14, { r: 0, jitter: 0 });
  for (let yy = 0.3; yy < h; yy += 0.45) k.box(0.44, 0.04, 0.04, P.trim, x, y0 + yy, z + r + 0.14, { r: 0, jitter: 0 });
}

/** A horizontal tank on two saddles, axis along x (or z when `alongZ`). */
export function hTank(k: Kit, x: number, z: number, r: number, len: number, paint: Paint = P.tank, alongZ = false, y = 0.5) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 16);
  g.rotateZ(Math.PI / 2);
  if (alongZ) g.rotateY(Math.PI / 2);
  g.translate(x, y + r, z);
  k.geo(g, paint, 0.03, 0);
  for (const s of [-0.32, 0.32]) {
    const sx = alongZ ? x : x + s * len, sz = alongZ ? z + s * len : z;
    k.box(alongZ ? r * 1.7 : 0.45, y + r * 0.6, alongZ ? 0.45 : r * 1.7, P.concrete, sx, 0, sz, { r: 0.05 });
  }
}

// ── glass, signs, flags, lights ──────────────────────────────────────────────────────────────
/** Night-lit glass: a kit for the window panes, built with a glow material (no shadows). */
export class Lit {
  readonly k = new Kit();
  readonly mat: THREE.MeshStandardMaterial;
  constructor(c: Paint = '#ffe2a8', k = 1.1, day: Paint = '#3d5f6e') {
    this.mat = glowMat(c, 0);
    this.mat.color.copy(col(day));
    this.mat.roughness = 0.45;
    this.mat.userData.nightOnly = k;
  }
  /** A pane facing +z (or rotated by ry). */
  pane(w: number, h: number, x: number, y: number, z: number, ry = 0) {
    this.k.box(w, h, 0.04, '#ffffff', x, y, z, { r: 0, jitter: 0, shade: 0, ry });
    return this;
  }
  /** A pane facing ±x. */
  paneX(d: number, h: number, x: number, y: number, z: number) {
    this.k.box(0.04, h, d, '#ffffff', x, y, z, { r: 0, jitter: 0, shade: 0 });
    return this;
  }
  build(parent: THREE.Object3D) {
    if (this.k.empty) return;
    const m = this.k.build(this.mat);
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
  }
}

/** A curtain wall on a face (+z by default): dark glass with mullions and transoms, panes that light up. */
export function curtain(k: Kit, lit: Lit, x: number, y: number, z: number, w: number, h: number, o: { glass?: Paint; frame?: Paint; bay?: number; floor?: number; facing?: 'z' | 'x' | '-z' | '-x'; litFrac?: number; seed?: number } = {}) {
  const glass = o.glass ?? P.glass, frame = o.frame ?? '#5b5562';
  const bay = o.bay ?? 1.6, floor = o.floor ?? 3;
  const f = o.facing ?? 'z';
  const sx = f === 'x' ? 1 : f === '-x' ? -1 : 0, sz = f === 'z' ? 1 : f === '-z' ? -1 : 0;
  const along = (a: number, b: number, c: number, wid: number, hh: number, dep: number, paint: Paint) => {
    // a box `wid` wide along the face, `dep` deep out of it, centred at `a` along the face, b = y, c = offset out
    if (sz) k.box(wid, hh, dep, paint, x + a, y + b, z + sz * c, { r: 0, jitter: 0.02, shade: 0 });
    else k.box(dep, hh, wid, paint, x + sx * c, y + b, z + a, { r: 0, jitter: 0.02, shade: 0 });
  };
  along(0, 0, 0.02, w, h, 0.08, glass);
  const nb = Math.max(1, Math.round(w / bay));
  for (let i = 0; i <= nb; i++) along(-w / 2 + (w * i) / nb, 0, 0.08, 0.1, h, 0.1, frame);
  const nf = Math.max(1, Math.round(h / floor));
  for (let j = 0; j <= nf; j++) along(0, Math.min(h - 0.16, (h * j) / nf), 0.08, w, 0.16, 0.12, frame);
  // lit panes: most of each floor, a few dark
  let s = (o.seed ?? 7) * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let j = 0; j < nf; j++)
    for (let i = 0; i < nb; i++) {
      if (rnd() > (o.litFrac ?? 0.8)) continue;
      const a = -w / 2 + (w * (i + 0.5)) / nb, b = (h * j) / nf + 0.25, pw = w / nb - 0.2, ph = h / nf - 0.5;
      if (sz) lit.pane(pw, ph, x + a, y + b, z + sz * 0.075);
      else lit.paneX(pw, ph, x + sx * 0.075, y + b, z + a);
    }
}

/** A sign on a face: text in the UI font, facing +z unless turned. */
export function putSign(parent: THREE.Object3D, text: string, w: number, x: number, y: number, z: number, fg: Paint = '#fbf7f0', bg: Paint | null = null, ry = 0, glow = false, maxH = 0) {
  const s = sign(text, w, fg, bg, { glow });
  const sh = s.userData.signHeight as number;
  if (maxH && sh > maxH) s.scale.setScalar(maxH / sh);
  s.position.set(x, y, z);
  s.rotation.y = ry;
  parent.add(s);
  return s;
}

/** A name on a coloured panel: the text fits inside maxW × maxH and the panel hugs the text. Centred at (x, y), panel front at z + 0.08. */
export function signPanel(parent: THREE.Object3D, k: Kit, text: string, maxW: number, maxH: number, x: number, y: number, z: number, panel: Paint, fg: Paint = '#fbf7f0') {
  const s = sign(text, maxW, fg, null, { glow: true });
  const h0 = s.userData.signHeight as number;
  const sc = Math.min(1, maxH / h0);
  s.scale.setScalar(sc);
  s.position.set(x, y, z + 0.2);
  parent.add(s);
  const w = maxW * sc * 0.92, h = h0 * sc * 0.78;
  k.box(w + 0.7, h + 0.4, 0.16, panel, x, y - (h + 0.4) / 2, z, { r: 0.06, shade: 0 });
}

/** A flag on a pole that waves. Colours are stripes from the hoist outwards (or top down when `rows`). */
export class Flag {
  readonly obj = new THREE.Group();
  private geo: THREE.PlaneGeometry;
  private base: Float32Array;
  private phase: number;
  constructor(k: Kit, x: number, z: number, h: number, stripes: Paint[], o: { w?: number; fh?: number; rows?: boolean; phase?: number } = {}) {
    const w = o.w ?? 2.4, fh = o.fh ?? 1.45;
    this.phase = o.phase ?? x * 0.7;
    k.cyl(0.07, 0.09, h, '#e6e0e3', x, 0, z, 8, { shade: 0.1 });
    k.geo(new THREE.SphereGeometry(0.12, 8, 6).translate(x, h + 0.05, z), '#d4a862', 0);
    k.cyl(0.25, 0.3, 0.15, P.concrete, x, 0, z, 10, { shade: 0 });
    this.geo = new THREE.PlaneGeometry(w, fh, 10, 4);
    this.geo.translate(w / 2, 0, 0);
    const pos = this.geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / w, v = 0.5 - pos.getY(i) / fh;
      const idx = Math.min(stripes.length - 1, Math.floor((o.rows ? v : u) * stripes.length * 0.9999));
      const c = col(stripes[idx]);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.base = new Float32Array(pos.array as Float32Array);
    const m = new THREE.Mesh(this.geo, flagMat);
    m.position.set(x + 0.08, h - fh / 2 - 0.1, z);
    m.castShadow = true;
    this.obj.add(m);
  }
  update(e: Env) {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3], y = this.base[i * 3 + 1];
      const k = x / 2.4;
      a[i * 3 + 2] = Math.sin(e.t * 3.2 + this.phase - x * 2.2 + y * 0.4) * 0.22 * k;
      a[i * 3] = x - k * k * 0.12;
      a[i * 3 + 1] = y - k * k * 0.18;
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
const flagMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));

/** Red aviation light (blinks via the scene's blinkBeacons). */
export function beacon(g: THREE.Object3D, x: number, y: number, z: number, phase = 0) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), glowMat('red3', 0.2).clone());
  b.position.set(x, y, z);
  b.userData.beacon = phase;
  g.add(b);
  return b;
}

/** Wall packs over doors with pools of light on the ground at night. */
export function wallLights(g: THREE.Object3D, spots: [number, number, number][], poolZ = 2.4, r = 3.4) {
  const m = glowMat('yel1', 0.05);
  const pool = poolMat('#ffe2b0', 0.5);
  const k = new Kit();
  for (const [x, y, z] of spots) k.box(0.5, 0.18, 0.22, '#ffffff', x, y, z + 0.1, { r: 0, jitter: 0, shade: 0 });
  const mesh = k.build(m);
  mesh.castShadow = false;
  g.add(mesh);
  for (const [x, , z] of spots) lightPool(g, x, 0, z + poolZ, r, pool);
}

/** Street lights along a line (heads glow at night, pools on the ground). */
export function lamps(g: THREE.Object3D, k: Kit, pts: [number, number][], dir: [number, number] = [0, 1], H = 5.2) {
  const head = glowMat('yel1', 0);
  head.userData.nightOnly = 3;
  const pool = poolMat('#ffd9a0', 0.55);
  const hk = new Kit();
  for (const [x, z] of pts) {
    k.box(0.14, H, 0.14, '#5b5562', x, 0, z, { r: 0, jitter: 0 });
    k.box(0.14 + Math.abs(dir[0]) * 1.0, 0.12, 0.14 + Math.abs(dir[1]) * 1.0, '#5b5562', x + dir[0] * 0.5, H - 0.1, z + dir[1] * 0.5, { r: 0, jitter: 0 });
    hk.box(0.5, 0.12, 0.3, '#ffffff', x + dir[0] * 0.95, H - 0.22, z + dir[1] * 0.95, { r: 0, jitter: 0, shade: 0 });
    lightPool(g, x + dir[0], 0, z + dir[1], 4, pool);
  }
  const m = hk.build(head);
  m.castShadow = false;
  g.add(m);
}

// ── yard bits ────────────────────────────────────────────────────────────────────────────────
/** A painted car park (bays along x). */
export function carPark(k: Kit, x: number, z: number, w: number, d: number, bay = 2.3) {
  k.box(w, 0.06, d, P.asphalt, x, G, z, { r: 0.03, shade: 0, jitter: 0.02 });
  for (let xx = x - w / 2 + 0.4; xx <= x + w / 2 - 0.3; xx += bay) k.box(0.1, 0.02, d * 0.42, '#e6e0e3', xx, G + 0.06, z - d * 0.25, { r: 0, jitter: 0 });
}

/** A low hedge / shrubs and a few trees for corporate landscaping: the shared plants, hung on the kit's mesh. */
export function shrubs(k: Kit, pts: [number, number, number][], _green?: Paint) {
  void _green;
  pts.forEach(([x, z, s], i) => plantOn(k, 'shrub', { x, y: 0.1, z, s: s * 1.15, ry: i * 2.4 + x }, false));
}
export function tree(k: Kit, x: number, z: number, s = 1, _green?: Paint) {
  void _green;
  plantOn(k, 'broadleaf', { x, y: 0.08, z, s: s * 0.95, ry: x * 1.7 + z });
}

/** A forklift (forward = +z), about 3 long. */
export function forklift() {
  const k = new Kit();
  const body: Paint = '#f2b33d';
  k.box(1.3, 0.75, 2.2, body, 0, 0.35, -0.2, { r: 0.12 });
  k.box(1.32, 0.5, 0.7, '#433c52', 0, 0.35, -1.15, { r: 0.1 }); // counterweight
  for (const sx of [-0.52, 0.52]) for (const sz of [0.55, -0.95]) wheel(k, sx, 0.32, sz, 0.32, 0.28);
  // overhead guard
  for (const sx of [-0.55, 0.55]) for (const sz of [0.45, -0.7]) k.box(0.07, 1.25, 0.07, '#433c52', sx, 1.1, sz, { r: 0, jitter: 0 });
  k.box(1.25, 0.08, 1.3, '#433c52', 0, 2.33, -0.12, { r: 0.02 });
  k.box(0.5, 0.45, 0.4, '#5b5562', 0, 1.1, -0.4, { r: 0.06 }); // seat
  // mast and forks
  const mast = new Kit();
  for (const sx of [-0.4, 0.4]) mast.box(0.1, 2.5, 0.12, '#5b5562', sx, 0.1, 1.05, { r: 0, jitter: 0 });
  mast.box(0.9, 0.1, 0.12, '#5b5562', 0, 2.5, 1.05, { r: 0, jitter: 0 });
  const forks = new Kit();
  for (const sx of [-0.3, 0.3]) forks.box(0.12, 0.06, 1.1, '#7a7186', sx, 0, 0.6, { r: 0, jitter: 0 });
  forks.box(0.9, 0.5, 0.06, '#7a7186', 0, 0, 0.08, { r: 0, jitter: 0 });
  const g = new THREE.Group();
  g.add(k.build(), mast.build());
  const f = new THREE.Group();
  f.add(forks.build());
  f.position.set(0, 0.15, 1.05);
  g.add(f);
  g.userData.forks = f;
  return g;
}

/** A wheel (axis along x) centred at (x, y, z), with a hub. */
export function wheel(k: Kit, x: number, y: number, z: number, r: number, w: number, tyre: Paint = '#2f2a3d', hub: Paint = '#8a8490', seg = 12) {
  k.geo(new THREE.CylinderGeometry(r, r, w, seg, 1).rotateZ(Math.PI / 2).translate(x, y, z), tyre, 0.02, 0);
  k.geo(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.04, 8, 1).rotateZ(Math.PI / 2).translate(x, y, z), hub, 0.02, 0);
}

/** Paint shared by trucks and machines. */
export const MINE_YELLOW = '#f2b33d';
