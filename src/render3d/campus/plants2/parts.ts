/**
 * Shared parts for Act II's plants: pipes, tanks, transformers, switchyards, cooling towers
 * (mechanical and natural draft), clad sheds, windows, lamps and beacons. Everything goes
 * through a Kit (bevelled, hand-painted, one mesh per group); the moving bits (fans, plumes) are
 * collected in an `Anim` the piece updates.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { col, glowMat, Kit, lightPool, poolMat, withClouds, type BoxOpts, type Paint } from '../../kit';
import { Plume, sign, type PlumeOpts } from '../../fx';
import type { Env } from '../../pieces';
import { plantField, type Placement, type TreeKind } from '../trees';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ── colours ──────────────────────────────────────────────────────────────────────────────────
export const P = {
  concrete: '#d2c9bc', concrete2: '#c4bbae', concreteOld: '#b3a999', concreteDark: '#9d958a',
  cream: '#ece6dc', cream2: '#e7dfd2', wall: '#ddd6cc',
  roof: '#5b5562', membrane: '#6f6878', asphalt: '#625c6a', gravel: '#b7ad9e',
  steel: '#8a8490', steel2: '#9d95a6', steelDark: '#6a6474', galv: '#b4b8bc',
  silver: '#d3d6d8', silverBand: '#aeb2b6',
  hvac: '#b9c2c4', hvacDark: '#8a959a', fan: '#433c52',
  xfmr: '#8a8f80', xfmrFin: '#727868', insulator: '#d8cfc3', insulatorBrown: '#8c5a44',
  glass: '#3e6a78', glassDark: '#2f4c5a',
  safety: 'yel0', rust: '#8c5a3c',
} as const;

// ── night-lit materials (made at import: they belong to no scene and are never disposed) ─────
function nightGlow(day: Paint, glow: Paint, k: number) {
  const m = glowMat(glow, 0);
  m.color.copy(col(day));
  m.userData.nightOnly = k;
  return m;
}
/** Office and control-room windows: blue-grey glass by day, warm at night. */
export const winMat = nightGlow(P.glass, 'yel1', 1.15);
/** Cleanroom and gowning windows: a cool white at night. */
export const coolWinMat = nightGlow('#6f97a3', '#d9f2ee', 1.0);
/** Roof glazing (north lights, skylights): a soft glow, much dimmer than windows. */
export const skyMat = nightGlow('#86a9b5', '#e6efe0', 0.38);
/** Lamp heads and wall packs. */
export const lampHeadMat = nightGlow('#e9e1d2', 'yel1', 3.0);
/** Lit signs and logo panels. */
export const warmPool = poolMat('#ffd9a0', 0.5);
export const coolPool = poolMat('#cfeee8', 0.45);
const beaconBase = glowMat('red3', 0.2);
const beaconGeo = new THREE.SphereGeometry(0.24, 8, 6);

/** Water: blue-green and a touch glossy (the only shiny thing besides glass). */
export const lakeMat = withClouds(new THREE.MeshStandardMaterial({ color: col('#2f6f86'), roughness: 0.14, metalness: 0.12 }));
export const riverMat = withClouds(new THREE.MeshStandardMaterial({ color: col('#3a8590'), roughness: 0.2, metalness: 0.1 }));
/** Glazing with a little sheen (vertex coloured). */
export const glassMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15 }));

/** A sign that is lit at night (fx.sign is plain paint: dark after sunset); by day it is the same painted panel. */
export function litSign(text: string, w: number, fg: Paint, bg: Paint | null, k = 0.75) {
  const s = sign(text, w, fg, bg);
  const old = s.material as THREE.MeshStandardMaterial;
  const m = glowMat('#ffffff', 0);
  m.map = old.map;
  m.emissiveMap = old.map;
  m.transparent = old.transparent;
  m.roughness = 0.7;
  m.userData.nightOnly = k;
  old.dispose();
  s.material = m;
  return s;
}

/** A red aviation light that blinks (the scene and the lab blink anything with userData.beacon). */
export function beacon(g: THREE.Object3D, x: number, y: number, z: number, phase = 0) {
  const b = new THREE.Mesh(beaconGeo, beaconBase.clone());
  b.position.set(x, y, z);
  b.userData.beacon = phase;
  g.add(b);
  return b;
}

/** Trees, rocks, scrub: the shared plants (campus/trees.ts), a mix of each kind's variants. */
export function plants(kind: TreeKind, at: Placement[]) {
  return plantField(kind, at);
}

// ── a placement: add shapes to a Kit through a transform (so compound parts can turn) ─────────
export class At {
  private m: THREE.Matrix4;
  constructor(readonly k: Kit, x = 0, y = 0, z = 0, ry = 0) {
    this.m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  }
  box(w: number, h: number, d: number, paint: Paint, x = 0, y = 0, z = 0, o: BoxOpts = {}) {
    const r = o.r ?? Math.min(0.12, Math.min(w, h, d) * 0.06);
    const g = r > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y + h / 2, z);
    g.applyMatrix4(this.m);
    this.k.geo(g, paint, o.jitter ?? 0.05, o.shade ?? 0.25);
    return this;
  }
  cyl(rt: number, rb: number, h: number, paint: Paint, x = 0, y = 0, z = 0, seg = 10, shade = 0.2) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(x, y + h / 2, z);
    g.applyMatrix4(this.m);
    this.k.geo(g, paint, 0.04, shade);
    return this;
  }
  geo(g: THREE.BufferGeometry, paint: Paint, jitter = 0.05, shade = 0) {
    g.applyMatrix4(this.m);
    this.k.geo(g, paint, jitter, shade);
    return this;
  }
  beam(a: THREE.Vector3, b: THREE.Vector3, t: number, paint: Paint) {
    this.k.beam(a.clone().applyMatrix4(this.m), b.clone().applyMatrix4(this.m), t, paint);
    return this;
  }
  /** A local point in the parent's space. */
  pt(x: number, y: number, z: number) { return V(x, y, z).applyMatrix4(this.m); }
}

// ── pipes ────────────────────────────────────────────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
export function pipe(k: Kit, a: THREE.Vector3, b: THREE.Vector3, r: number, paint: Paint, seg = 8, jitter = 0.02) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-3) return;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  k.geo(g, paint, jitter, 0);
}
/** A pipe along a polyline, with rounded joints and optional cladding bands every `band` units. */
export function pipeRun(k: Kit, pts: THREE.Vector3[], r: number, paint: Paint, o: { seg?: number; band?: number; bandPaint?: Paint } = {}) {
  const seg = o.seg ?? 8;
  for (let i = 0; i + 1 < pts.length; i++) {
    pipe(k, pts[i], pts[i + 1], r, paint, seg);
    if (o.band) {
      const len = pts[i].distanceTo(pts[i + 1]);
      for (let s = o.band; s < len - 0.3; s += o.band) {
        const p = pts[i].clone().lerp(pts[i + 1], s / len), q = pts[i].clone().lerp(pts[i + 1], (s + 0.08) / len);
        pipe(k, p, q, r * 1.07, o.bandPaint ?? P.silverBand, seg, 0);
      }
    }
  }
  for (let i = 1; i + 1 < pts.length; i++) k.geo(new THREE.SphereGeometry(r * 1.02, seg, Math.max(4, seg >> 1)).translate(pts[i].x, pts[i].y, pts[i].z), paint, 0.01, 0);
}
/** Little H-stands under a horizontal pipe run (every `step` units along each segment). */
export function pipeStands(k: Kit, pts: THREE.Vector3[], r: number, step = 2.6, ground = 0, paint: Paint = P.steel) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.y - b.y) > 0.05) continue;
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / step));
    const dir = b.clone().sub(a).normalize();
    const side = V(-dir.z, 0, dir.x);
    for (let s = 0; s <= n; s++) {
      if ((s === 0 && i > 0) || (s === n && i + 2 < pts.length)) continue;
      const p = a.clone().lerp(b, s / n);
      const h = p.y - r - ground;
      if (h < 0.2) continue;
      for (const sg of [-1, 1]) k.box(0.12, h, 0.12, paint, p.x + side.x * sg * (r + 0.1), ground, p.z + side.z * sg * (r + 0.1), { r: 0, jitter: 0 });
      k.box(Math.abs(side.x) * (2 * r + 0.4) + 0.14, 0.12, Math.abs(side.z) * (2 * r + 0.4) + 0.14, paint, p.x, p.y - r - 0.12, p.z, { r: 0, jitter: 0 });
    }
  }
}

// ── tanks ────────────────────────────────────────────────────────────────────────────────────
export interface TankOpts { y?: number; cap?: 'dome' | 'flat' | 'cone'; band?: Paint; seg?: number; ladder?: boolean; plinth?: boolean }
/** A vertical tank (water, chemicals, nitrogen) with a domed, flat or conical top. */
export function tank(k: Kit, x: number, z: number, r: number, h: number, paint: Paint, o: TankOpts = {}) {
  const y = o.y ?? 0, seg = o.seg ?? 16;
  if (o.plinth !== false) k.cyl(r + 0.25, r + 0.3, 0.3, P.concrete2, x, y, z, seg, { shade: 0.1 });
  const y0 = y + (o.plinth !== false ? 0.25 : 0);
  k.cyl(r, r, h, paint, x, y0, z, seg, { shade: 0.14, jitter: 0.03 });
  const cap = o.cap ?? 'dome';
  if (cap === 'dome') k.geo(new THREE.SphereGeometry(r, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1).translate(x, y0 + h, z), paint, 0.02);
  else if (cap === 'cone') k.geo(new THREE.ConeGeometry(r * 1.02, r * 0.45, seg, 1).translate(x, y0 + h + r * 0.225, z), paint, 0.02);
  else k.cyl(r * 1.02, r * 1.02, 0.12, P.steel2, x, y0 + h, z, seg, { shade: 0 });
  if (o.band) k.cyl(r * 1.015, r * 1.015, Math.min(0.5, h * 0.09), o.band, x, y0 + h * 0.8, z, seg, { shade: 0, jitter: 0.01 });
  if (o.ladder) {
    k.box(0.42, h, 0.08, P.steelDark, x, y0, z + r + 0.04, { r: 0, jitter: 0 });
    k.box(0.5, 0.06, 0.5, P.steel, x, y0 + h, z + r - 0.1, { r: 0, jitter: 0 });
  }
}
/** A Horton sphere on legs (bulk gas), base at y = 0. */
export function sphereTank(k: Kit, x: number, z: number, r: number, paint: Paint, legPaint: Paint = P.steel) {
  const cy = r * 1.3;
  k.geo(new THREE.SphereGeometry(r, 18, 12).translate(x, cy, z), paint, 0.02, 0);
  k.geo(new THREE.TorusGeometry(r * 1.005, 0.07, 4, 28).rotateX(Math.PI / 2).translate(x, cy, z), P.steel2, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    k.box(0.22, cy, 0.22, legPaint, x + Math.cos(a) * r * 0.97, 0, z + Math.sin(a) * r * 0.97, { r: 0.03, jitter: 0 });
    k.cyl(0.32, 0.36, 0.3, P.concrete2, x + Math.cos(a) * r * 0.97, 0, z + Math.sin(a) * r * 0.97, 6, { shade: 0 });
  }
  // a stair spiralling up one side, a little platform on top
  k.box(0.7, 0.08, 0.7, P.steel, x, cy + r - 0.02, z, { r: 0, jitter: 0 });
  k.beam(V(x + r * 0.95, 0.1, z + 0.6), V(x + r * 0.55, cy + r * 0.8, z + r * 0.2), 0.12, P.steelDark);
}

/** Extrude a (z, y) profile across x0..x1 (dam monoliths, sawtooth roofs, stepped blocks). */
export function extrudeX(k: Kit, x0: number, x1: number, prof: [number, number][], paint: Paint, shade = 0.12, bevel = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(prof[0][0], prof[0][1]);
  for (let i = 1; i < prof.length; i++) s.lineTo(prof[i][0], prof[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(x1, 0, 0);
  k.geo(g, paint, 0.035, shade);
}

// ── electrics ────────────────────────────────────────────────────────────────────────────────
/** A power transformer: plinth, tank with radiator fins, bushings and a conservator. Local x = long side. */
export function transformer(a: At, x: number, z: number, s = 1) {
  a.box(3.0 * s, 0.3, 2.2 * s, P.concrete2, x, 0, z, { r: 0.05, shade: 0 });
  a.box(2.2 * s, 2.0 * s, 1.5 * s, P.xfmr, x, 0.3, z, { r: 0.08 });
  for (let i = 0; i < 6; i++) a.box(0.08, 1.5 * s, 0.5 * s, P.xfmrFin, x - 0.95 * s + i * 0.38 * s, 0.45, z + 1.0 * s, { r: 0, jitter: 0 });
  for (let i = 0; i < 6; i++) a.box(0.08, 1.5 * s, 0.5 * s, P.xfmrFin, x - 0.95 * s + i * 0.38 * s, 0.45, z - 1.0 * s, { r: 0, jitter: 0 });
  a.geo(new THREE.CylinderGeometry(0.28 * s, 0.28 * s, 1.6 * s, 8).rotateZ(Math.PI / 2).translate(x, 2.75 * s + 0.3, z - 0.45 * s), P.xfmr, 0.03);
  for (const bx of [-0.65, 0, 0.65]) {
    a.cyl(0.09 * s, 0.13 * s, 0.9 * s, P.insulatorBrown, x + bx * s, 2.3 * s + 0.3, z + 0.2 * s, 6, 0);
    a.cyl(0.05, 0.05, 0.12, P.steel, x + bx * s, 3.2 * s + 0.3, z + 0.2 * s, 6, 0);
  }
}
/** A lattice gantry (two posts + a beam) carrying insulator strings; returns the wire points. */
export function gantry(a: At, x: number, z: number, w: number, h: number, paint: Paint = P.galv) {
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    a.box(0.32, h, 0.32, paint, x + (sx * w) / 2, 0, z, { r: 0.02, jitter: 0.02 });
    a.box(0.7, 0.25, 0.7, P.concrete2, x + (sx * w) / 2, 0, z, { r: 0.03, shade: 0 });
  }
  a.box(w + 0.5, 0.36, 0.36, paint, x, h - 0.2, z, { r: 0.02, jitter: 0.02 });
  for (let i = 0; i < 3; i++) {
    const px = x - w / 2 + (w * (i + 1)) / 4;
    a.cyl(0.07, 0.07, 0.9, P.insulator, px, h - 1.1, z, 6, 0);
    pts.push(a.pt(px, h - 1.15, z));
  }
  return pts;
}
/** A breaker on a stand (an HV bay's equipment). */
export function breaker(a: At, x: number, z: number) {
  a.box(0.5, 1.6, 0.5, P.galv, x, 0, z, { r: 0.02 });
  a.box(1.1, 0.5, 0.6, '#c9c7c0', x, 1.6, z, { r: 0.06 });
  for (const bx of [-0.35, 0.35]) a.cyl(0.08, 0.1, 0.8, P.insulator, x + bx, 2.1, z, 6, 0);
}
/** Disconnect switch: two insulator posts on a frame. */
export function isolator(a: At, x: number, z: number) {
  a.box(1.4, 0.18, 0.18, P.galv, x, 1.8, z, { r: 0, jitter: 0 });
  a.box(0.18, 1.8, 0.18, P.galv, x - 0.6, 0, z, { r: 0, jitter: 0 });
  a.box(0.18, 1.8, 0.18, P.galv, x + 0.6, 0, z, { r: 0, jitter: 0 });
  for (const bx of [-0.5, 0.5]) a.cyl(0.07, 0.09, 0.9, P.insulator, x + bx, 1.95, z, 6, 0);
}

/**
 * A fenced HV switchyard on gravel, `w` (local x) × `d` (local z), centred at (x, z) and turned by
 * `ry`: bays of breakers and isolators under gantries, transformers at the back. Returns the
 * gantries' wire points (in the parent's space) so lines can run in and out.
 */
export function switchyard(k: Kit, g: THREE.Group, x: number, z: number, w: number, d: number, o: { ry?: number; bays?: number; xfmrs?: number; gantryH?: number; y?: number } = {}) {
  const a = new At(k, x, o.y ?? 0, z, o.ry ?? 0);
  const bays = o.bays ?? 2, H = o.gantryH ?? 5;
  a.box(w, 0.1, d, P.gravel, 0, 0.06, 0, { r: 0.02, shade: 0, jitter: 0.02 });
  const lines: THREE.Vector3[][] = [];
  const bw = (w - 1.6) / bays;
  for (let b = 0; b < bays; b++) {
    const bx = -w / 2 + 0.8 + bw * (b + 0.5);
    lines.push(gantry(a, bx, -d / 2 + 1.2, bw * 0.8, H));
    lines.push(gantry(a, bx, d / 2 - 1.4, bw * 0.8, H - 0.6));
    for (let i = 0; i < 3; i++) {
      const px = bx - bw * 0.4 + (bw * 0.8 * (i + 1)) / 4;
      breaker(a, px, -0.4);
      a.cyl(0.07, 0.09, 1.0, P.insulator, px, 0.1, d * 0.22, 6, 0);
      a.box(0.22, 1.2, 0.22, P.galv, px, 0, d * 0.22, { r: 0, jitter: 0 });
    }
    isolator(a, bx, d * 0.36 - 0.6);
  }
  const nx = o.xfmrs ?? 0;
  for (let i = 0; i < nx; i++) transformer(a, -w / 2 + 2 + i * 3.4, -d / 2 + 3.4, 0.9);
  // the fence round it
  const fk = new At(k, x, o.y ?? 0, z, o.ry ?? 0);
  const post = P.steel;
  const hw = w / 2 - 0.1, hd = d / 2 - 0.1;
  const runs: [number, number, number, number][] = [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [-hw, -hd, -hw, hd], [-hw, hd, -1.2, hd], [1.2, hd, hw, hd]];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) fk.box(0.1, 1.5, 0.1, post, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, { r: 0, jitter: 0 });
    fk.beam(V(x0, 1.45, z0), V(x1, 1.45, z1), 0.05, post);
  }
  const mesh = new THREE.Group();
  mesh.position.set(x, o.y ?? 0, z);
  mesh.rotation.y = o.ry ?? 0;
  fenceMeshAt(mesh, w - 0.2, d - 0.2, 2.4, 1.45);
  g.add(mesh);
  return lines;
}

/** See-through chain-link panels round a rectangle (centred on the group's origin). */
const meshMat = new THREE.MeshStandardMaterial({ color: col('#9a94a0'), transparent: true, opacity: 0.26, roughness: 1, side: THREE.DoubleSide, depthWrite: false });
/** The front side's fenced stretches: everything but the gate in the middle and any other `gaps` (x ranges: a building standing in the fence line). */
function frontRuns(w: number, gate: number, gaps: [number, number][] = []) {
  const cuts = [[-gate / 2, gate / 2], ...gaps].filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  let x = -w / 2;
  for (const [a, b] of cuts) {
    if (a - x > 0.3) runs.push([x, a]);
    x = Math.max(x, b);
  }
  if (w / 2 - x > 0.3) runs.push([x, w / 2]);
  return runs;
}
export function fenceMeshAt(group: THREE.Object3D, w: number, d: number, gate = 6, h = 1.25, gaps: [number, number][] = []) {
  const add = (len: number, x: number, z: number, ry: number) => {
    if (len <= 0.05) return;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), meshMat);
    p.position.set(x, h / 2, z);
    p.rotation.y = ry;
    group.add(p);
  };
  add(w, 0, -d / 2, 0);
  add(d, w / 2, 0, Math.PI / 2);
  add(d, -w / 2, 0, Math.PI / 2);
  for (const [a, b] of frontRuns(w, gate, gaps)) add(b - a, (a + b) / 2, d / 2, 0);
}
/** Fence posts and rails round a rectangle centred at (x, z), with a gate gap in the front side (and any other `gaps` there). */
export function fencePosts(k: Kit, x: number, z: number, w: number, d: number, gate = 6, post: Paint = P.steel, h = 1.3, gaps: [number, number][] = []) {
  const sides: [number, number, number, number][] = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2]];
  for (const [a, b] of frontRuns(w, gate, gaps)) sides.push([a, d / 2, b, d / 2]);
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.1) continue;
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) k.box(0.12, h, 0.12, post, x + x0 + ((x1 - x0) * i) / n, 0, z + z0 + ((z1 - z0) * i) / n, { r: 0, jitter: 0 });
    for (const y of [0.35, h - 0.05]) k.beam(V(x + x0, y, z + z0), V(x + x1, y, z + z1), 0.06, post);
  }
}

/** Sagging wires between successive points of each line. */
export function sagWires(k: Kit, lines: THREE.Vector3[][], sag = 0.6, paint: Paint = '#3a3442', t = 0.05) {
  for (const line of lines)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      const n = 8;
      let prev = a;
      for (let s = 1; s <= n; s++) {
        const q = a.clone().lerp(b, s / n);
        q.y -= Math.sin((Math.PI * s) / n) * sag * Math.min(1, a.distanceTo(b) / 8);
        k.beam(prev, q, t, paint);
        prev = q;
      }
    }
}

// ── buildings ────────────────────────────────────────────────────────────────────────────────
export interface ShedOpts {
  wall?: Paint; roof?: Paint; plinth?: Paint | null; band?: Paint | null; bandY?: number;
  /** Rib spacing on the cladding (0 = smooth). */
  ribs?: number; rib?: Paint;
  /** Parapet cap height (0 = none, just a roof slab). */
  parapet?: number;
  y?: number;
}
/** A clad industrial building, w × d × h, standing on (x, z). Returns the roof height. */
export function shed(k: Kit, x: number, z: number, w: number, d: number, h: number, o: ShedOpts = {}) {
  const y = o.y ?? 0;
  const wall = o.wall ?? P.wall;
  if (o.plinth !== null) k.box(w + 0.4, 0.45, d + 0.4, o.plinth ?? '#a39a91', x, y, z, { r: 0.06 });
  k.box(w, h, d, wall, x, y + 0.3, z, { r: 0.16, jitter: 0.025, shade: 0.16 });
  const rs = o.ribs ?? 1.2;
  if (rs > 0) {
    const rib = o.rib ?? mixHex(wall, '#7a7186', 0.14);
    for (let i = x - w / 2 + rs * 0.75; i < x + w / 2 - rs * 0.4; i += rs) {
      k.box(0.18, h - 1.0, 0.1, rib, i, y + 0.75, z + d / 2 + 0.02, { r: 0.03, jitter: 0.01, shade: 0 });
      k.box(0.18, h - 1.0, 0.1, rib, i, y + 0.75, z - d / 2 - 0.02, { r: 0.03, jitter: 0.01, shade: 0 });
    }
    for (let i = z - d / 2 + rs * 0.75; i < z + d / 2 - rs * 0.4; i += rs) {
      k.box(0.1, h - 1.0, 0.18, rib, x + w / 2 + 0.02, y + 0.75, i, { r: 0.03, jitter: 0.01, shade: 0 });
      k.box(0.1, h - 1.0, 0.18, rib, x - w / 2 - 0.02, y + 0.75, i, { r: 0.03, jitter: 0.01, shade: 0 });
    }
  }
  const top = y + 0.3 + h;
  const par = o.parapet ?? 0.45;
  k.box(w + 0.28, par || 0.25, d + 0.28, o.roof ?? P.roof, x, top - 0.1, z, { r: 0.08, shade: 0 });
  k.box(w - 0.4, 0.1, d - 0.4, P.membrane, x, top - 0.1 + (par || 0.25) - 0.16, z, { r: 0, shade: 0, jitter: 0.02 });
  if (o.band) k.box(w + 0.03, 0.4, d + 0.03, o.band, x, o.bandY ?? top - 0.85, z, { r: 0.04, shade: 0 });
  return top + (par || 0.25) - 0.1;
}
const mixCache = new Map<string, string>();
export function mixHex(a: Paint, b: Paint, t: number) {
  const key = `${String(a)}|${String(b)}|${t}`;
  let v = mixCache.get(key);
  if (!v) mixCache.set(key, (v = '#' + col(a).clone().lerp(col(b), t).getHexString()));
  return v;
}
/** A roll-up door with slats on a +z face. */
export function rollDoor(k: Kit, x: number, y: number, z: number, w: number, h: number, paint: Paint = P.steel) {
  k.box(w, h, 0.12, paint, x, y, z, { r: 0.02 });
  for (let yy = y + 0.3; yy < y + h - 0.1; yy += 0.32) k.box(w - 0.1, 0.04, 0.05, mixHex(paint, '#433c52', 0.25), x, yy, z + 0.07, { r: 0, jitter: 0 });
}
/** Window panes in a row on a face; some lit at night (into `lit`), the rest plain glass (into `k`). */
export function windowRow(k: Kit, lit: Kit, face: 'z+' | 'z-' | 'x+' | 'x-', c: number, from: number, to: number, y: number, ww: number, wh: number, gap: number, rand: () => number, litFrac = 0.7) {
  const n = Math.max(1, Math.floor((to - from + gap) / (ww + gap)));
  const span = n * ww + (n - 1) * gap;
  const s0 = (from + to) / 2 - span / 2 + ww / 2;
  for (let i = 0; i < n; i++) {
    const s = s0 + i * (ww + gap);
    const into = rand() < litFrac ? lit : k;
    if (face === 'z+' || face === 'z-') into.box(ww, wh, 0.08, P.glass, s, y, c + (face === 'z+' ? 0.03 : -0.03), { r: 0, jitter: 0.04, shade: 0 });
    else into.box(0.08, wh, ww, P.glass, c + (face === 'x+' ? 0.03 : -0.03), y, s, { r: 0, jitter: 0.04, shade: 0 });
  }
}
/** A wall pack light (head glows at night, a pool on the ground). */
export function wallLamp(lamps: Kit, g: THREE.Object3D, x: number, y: number, z: number, ground = 0, pool = warmPool, r = 3.4) {
  lamps.box(0.5, 0.18, 0.22, '#e9e1d2', x, y, z, { r: 0, jitter: 0 });
  lightPool(g, x, ground, z + 1.6, r, pool);
}
/** A pole lamp (pole into `k`, head into `lamps`). */
export function poleLamp(k: Kit, lamps: Kit, g: THREE.Object3D, x: number, z: number, h = 4.6, dir = 1, y = 0, pool = warmPool) {
  k.box(0.14, h, 0.14, P.roof, x, y, z, { r: 0, jitter: 0 });
  k.box(1.1, 0.12, 0.14, P.roof, x + dir * 0.5, y + h - 0.1, z, { r: 0, jitter: 0 });
  lamps.box(0.6, 0.14, 0.3, '#e9e1d2', x + dir * 1.0, y + h - 0.2, z, { r: 0, jitter: 0 });
  lightPool(g, x + dir * 1.0, y, z, 4.0, pool);
}
/** Asphalt or concrete paving (sits on the plot pad, which tops out at y = 0.12). */
export function paving(k: Kit, x: number, z: number, w: number, d: number, paint: Paint = P.asphalt, y = 0.1) {
  k.box(w, 0.08, d, paint, x, y, z, { r: 0.03, shade: 0, jitter: 0.02 });
}
/** Parking bay lines along x. */
export function bayLines(k: Kit, x0: number, z: number, n: number, gap: number, len = 2.2, y = 0.18) {
  for (let i = 0; i <= n; i++) k.box(0.1, 0.02, len, 'ink9', x0 + i * gap, y, z, { r: 0, jitter: 0, shade: 0 });
}

// ── animation bookkeeping ────────────────────────────────────────────────────────────────────
/** What moves in a piece: fans (spin about y), plumes, and things only shown when it's finished. */
export class Anim {
  fans: { o: THREE.Object3D; speed: number }[] = [];
  plumes: { p: Plume; k: number }[] = [];
  /** 0..1: how hard the plant is working (fans and plumes follow it). */
  load = 1;
  done = 1;
  extra: ((e: Env) => void)[] = [];
  plume(g: THREE.Object3D, x: number, y: number, z: number, o: PlumeOpts, seed: number, k = 1) {
    const p = new Plume(o, seed);
    p.obj.position.set(x, y, z);
    g.add(p.obj);
    this.plumes.push({ p, k });
    return p;
  }
  update(e: Env) {
    const run = this.done >= 1 ? 1 : 0;
    for (const f of this.fans) f.o.rotation.y += e.dt * f.speed * run * (0.35 + 0.65 * this.load);
    for (const { p, k } of this.plumes) {
      p.strength = run * k * (0.25 + 0.75 * this.load);
      p.obj.visible = run > 0;
      if (run) p.update(e);
    }
    for (const f of this.extra) f(e);
  }
}

/** A fan rotor: four blades and a hub, flat, spinning about y (one mesh). */
const fanGeoCache = new Map<number, THREE.BufferGeometry>();
const fanMat = withClouds(new THREE.MeshStandardMaterial({ color: col(P.fan), roughness: 0.75 }));
export function fanRotor(r: number) {
  const key = Math.round(r * 100);
  let geo = fanGeoCache.get(key);
  if (!geo) {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.BoxGeometry(r * 0.92, 0.05, r * 0.3).translate(r * 0.5, 0, 0);
      b.rotateX(0.25);
      b.rotateY((i * Math.PI) / 2);
      parts.push(b.toNonIndexed());
    }
    parts.push(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.18, 8).toNonIndexed());
    for (const p of parts) for (const n of Object.keys(p.attributes)) if (n !== 'position' && n !== 'normal') p.deleteAttribute(n);
    geo = mergeAll(parts);
    fanGeoCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, fanMat);
  m.castShadow = true;
  return m;
}
function mergeAll(parts: THREE.BufferGeometry[]) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// ── cooling ──────────────────────────────────────────────────────────────────────────────────
export interface MechTowerOpts { cells: number; cell?: number; h?: number; ry?: number; plume?: PlumeOpts; plumeK?: number; casing?: Paint; y?: number }
/**
 * A mechanical-draft cooling tower: a row of square cells over a concrete basin, louvred air
 * inlets, a fan deck with a fan stack per cell (spinning fans, a steam plume each), a stair.
 * Centred at (x, z); local x runs along the cells. Returns its height.
 */
export function mechTower(k: Kit, g: THREE.Group, anim: Anim, x: number, z: number, o: MechTowerOpts, seed: number) {
  const c = o.cell ?? 4, n = o.cells, H = o.h ?? 6.2, ry = o.ry ?? 0, y = o.y ?? 0;
  const W = c * n, D = c;
  const a = new At(k, x, y, z, ry);
  const casing = o.casing ?? '#cfccc4';
  a.box(W + 0.8, 0.7, D + 0.8, P.concrete2, 0, 0, 0, { r: 0.08 });
  // louvred inlets on both long sides, piers between cells
  a.box(W - 0.1, 1.9, D - 0.1, '#4a4452', 0, 0.7, 0, { r: 0.02, shade: 0 });
  for (let yy = 0.85; yy < 2.5; yy += 0.3)
    for (const sz of [-1, 1]) a.box(W - 0.2, 0.07, 0.16, '#8e8a92', 0, yy, sz * (D / 2 - 0.02), { r: 0, jitter: 0, shade: 0 });
  for (let i = 0; i <= n; i++) a.box(0.4, 1.9, D + 0.1, P.concrete, -W / 2 + i * c, 0.7, 0, { r: 0.04 });
  // casing, ribbed panels, the fan deck and its rail
  a.box(W + 0.1, H - 3.6, D + 0.1, casing, 0, 2.6, 0, { r: 0.1, shade: 0.08, jitter: 0.03 });
  for (let i = 0; i < n * 3; i++) {
    const px = -W / 2 + (i + 0.5) * (c / 3);
    for (const sz of [-1, 1]) a.box(0.1, H - 3.8, 0.08, mixHex(casing, '#7a7186', 0.15), px, 2.7, sz * (D / 2 + 0.07), { r: 0, jitter: 0, shade: 0 });
  }
  const deck = H - 1.0;
  a.box(W + 0.3, 0.2, D + 0.3, P.steel2, 0, deck, 0, { r: 0.03, shade: 0 });
  for (const sz of [-1, 1]) a.beam(V(-W / 2, deck + 0.9, sz * (D / 2 + 0.1)), V(W / 2, deck + 0.9, sz * (D / 2 + 0.1)), 0.06, P.safety);
  for (let i = 0; i <= n * 2; i++) for (const sz of [-1, 1]) a.box(0.06, 0.9, 0.06, P.safety, -W / 2 + (i * c) / 2, deck + 0.1, sz * (D / 2 + 0.1), { r: 0, jitter: 0 });
  // stair up the end
  a.beam(V(W / 2 + 0.6, 0.7, D / 2 - 0.3), V(W / 2 + 0.6, deck, -D / 2 + 0.6), 0.28, P.steel);
  a.box(0.9, 0.12, 1.0, P.steel, W / 2 + 0.6, deck, -D / 2 + 0.5, { r: 0, jitter: 0 });
  const rStack = c * 0.36;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + c * (i + 0.5);
    a.cyl(rStack, rStack * 1.12, 1.5, casing, cx, deck + 0.2, 0, 20, 0.1);
    a.cyl(rStack * 0.9, rStack * 0.9, 0.06, '#2c2834', cx, deck + 1.66, 0, 20, 0);
    const f = fanRotor(rStack * 0.85);
    const p = a.pt(cx, deck + 1.76, 0);
    f.position.copy(p);
    g.add(f);
    anim.fans.push({ o: f, speed: 3.5 + ((seed + i * 3) % 4) * 0.4 });
    const pp = a.pt(cx, deck + 1.8, 0);
    anim.plume(g, pp.x, pp.y, pp.z, { count: 14, life: 6, rise: 2.0, size0: c * 0.7, size1: c * 2.2, opacity: 0.6, radius: rStack * 0.6, wind: 0.7, ...o.plume }, seed + i * 11, o.plumeK ?? 1);
  }
  return y + deck + 1.7;
}

/**
 * A hyperbolic natural-draft cooling tower on its ring of raking legs, over a dark basin, the
 * shell hand-painted in lifts and panels (`weather` = how stained). Returns the lip height and
 * radius (for the plume).
 */
export function draftTower(k: Kit, x: number, z: number, h: number, r: number, o: { paint?: Paint; weather?: number; legH?: number; stripe?: Paint | null } = {}) {
  const paint = o.paint ?? '#d6cfc4';
  const wea = o.weather ?? 0.25;
  const legH = o.legH ?? Math.max(1.6, h * 0.07);
  const sh = h - legH;
  // the basin and its curb
  k.cyl(r * 1.08, r * 1.1, 0.5, P.concrete2, x, 0, z, 36, { shade: 0.1 });
  k.cyl(r * 0.98, r * 0.98, 0.06, '#2c3e48', x, 0.48, z, 36, { shade: 0 });
  // raking legs (pairs leaning both ways round the ring)
  const nl = Math.round(r * 3.2);
  for (let i = 0; i < nl; i++) {
    const a0 = (i / nl) * Math.PI * 2;
    const a1 = a0 + Math.PI / nl;
    const p0 = V(x + Math.cos(a0) * r * 0.99, 0.4, z + Math.sin(a0) * r * 0.99), p1 = V(x + Math.cos(a1) * r * 0.99, legH + 0.05, z + Math.sin(a1) * r * 0.99);
    const p2 = V(x + Math.cos(a0 + (2 * Math.PI) / nl) * r * 0.99, 0.4, z + Math.sin(a0 + (2 * Math.PI) / nl) * r * 0.99);
    k.beam(p0, p1, 0.32, P.concrete2);
    k.beam(p2, p1, 0.32, P.concrete2);
  }
  // the shell in hand-painted panels: 4 lifts × 12 slices
  const prof = towerProfile(sh, r);
  const lifts = 4, slices = 12, seg = 36;
  for (let L = 0; L < lifts; L++) {
    const i0 = Math.floor((L / lifts) * (prof.length - 1)), i1 = Math.floor(((L + 1) / lifts) * (prof.length - 1));
    const pts = prof.slice(i0, i1 + 1);
    for (let s = 0; s < slices; s++) {
      const outer = new THREE.LatheGeometry(pts, seg / slices, (s / slices) * Math.PI * 2, (Math.PI * 2) / slices).translate(x, legH, z);
      const stain = Math.sin(s * 2.7 + L * 1.3) * 0.5 + 0.5;
      const c = mixHex(paint, '#8f877c', wea * (0.25 + 0.75 * stain) * (L === 0 ? 1.1 : L === lifts - 1 ? 0.8 : 0.6));
      k.geo(outer, c, 0.04, L === 0 ? 0.12 : 0);
    }
  }
  // inside (seen over the lip): the reversed profile, darker
  const inner = towerProfile(sh, r * 0.965).reverse();
  k.geo(new THREE.LatheGeometry(inner, 24).translate(x, legH, z), mixHex(paint, '#433c52', 0.45), 0.02, 0);
  // the lip ring (and an optional painted band near the top)
  const top = prof[prof.length - 1];
  k.geo(new THREE.TorusGeometry(top.x * 0.985, 0.16, 4, 40).rotateX(Math.PI / 2).translate(x, legH + sh - 0.05, z), mixHex(paint, '#7a7186', 0.2), 0.02, 0);
  if (o.stripe) {
    const i = prof.length - 3;
    k.geo(new THREE.LatheGeometry([prof[i], prof[i + 1]], seg).translate(x, legH + 0.01, z).scale(1.003, 1, 1.003), o.stripe, 0.02, 0);
  }
  // the ring beam over the legs
  k.geo(new THREE.CylinderGeometry(prof[0].x * 1.0, prof[0].x * 1.01, 0.5, seg, 1, true).translate(x, legH + 0.25, z), P.concrete2, 0.02, 0);
  return { top: legH + sh, r: top.x };
}
/** The hyperbolic profile (as fx.coolingTowerGeometry): wide base, a throat at 78%, a slight flare at the lip. */
function towerProfile(h: number, r: number) {
  const pts: THREE.Vector2[] = [];
  const throat = 0.62, throatY = 0.78;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const kk = t < throatY ? 1 - (1 - throat) * Math.sin(((t / throatY) * Math.PI) / 2) : throat + ((t - throatY) / (1 - throatY)) * 0.06;
    pts.push(new THREE.Vector2(r * kk, t * h));
  }
  return pts;
}
