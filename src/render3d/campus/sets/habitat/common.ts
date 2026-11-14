/**
 * Shared bits for Aurora's town (inside the habitat cylinder): the floor's curve (everything is
 * built flat on y = 0, then bent up onto the cylinder so paths and lawns never sink into it), a
 * builder that keeps the paint, glass, lit-window and leaf kits apart, Solarpunk homes (plinths,
 * set-back upper floors with terraces, gabled, green or monopitch roofs, timber frames, window
 * boxes, climbers), gardens (beds, hedges, flowers, fruit trees), street furniture (benches, lamps,
 * bikes, washing lines, festoons, pergolas), water, and people (residents, kids at play).
 * Light inside Aurora is always day: lit windows glow softly all the time.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { col, glowMat, Kit, kitDetail, mix, rng, withClouds, type Paint } from '../../../kit';
import { sign } from '../../../fx';
import type { Env, Piece } from '../../../pieces';
import { Crowd } from '../../life';
import { hasModel, person as rigged, type PersonName } from '../../../models';

/** While the townsfolk are still loading, a loaded figure stands in (the scene rebuilds once they arrive). */
const STAND_IN: Partial<Record<PersonName, PersonName>> = { resident_a: 'office', resident_b: 'engineer', kid_a: 'office', kid_b: 'researcher' };
const fig = (k: PersonName): PersonName => (hasModel(k) ? k : STAND_IN[k] ?? k);
import { habFloor } from '../../habitatShell';
import { plantField, type TreeKind } from '../../trees';
import { waterMaterial } from '../../water';
import { glassMat } from '../../plants2/parts';
import { Anim, plantMat, V } from '../mega/common';

export { V, Anim };
export const TAU = Math.PI * 2;

// ── the floor ────────────────────────────────────────────────────────────────────────────────
/** The cylinder's floor under a point of the piece (it rises towards the front and back edges). */
export const floorY = (z: number) => habFloor(z);

/** Lift every vertex onto the curved floor (a vertical shear: walls stay upright). */
export function bend(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  if (!p) return g;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + floorY(p.getZ(i)));
  p.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// ── colours ──────────────────────────────────────────────────────────────────────────────────
export const H = {
  render: '#ece6dc', render2: '#e9dfcc', sand: '#f3e2b0', peach: '#efc9a4', clay: '#d98a5c', rose: '#e8b4a0', sage: '#c9d6b4',
  timber: '#b07a46', timberD: '#8c5a34', timberL: '#cf9a62', deck: '#a8754a',
  tile: '#b9553a', tileD: '#93402f', slate: '#5b5562',
  sedum: '#7a9a45', sedumL: '#9cb850', moss: '#5a8a3a', ivy: '#3f7b35', ivyL: '#5a9537',
  path: '#e6d7b8', pathD: '#cdb994', paving: '#ddd3c2', pavingD: '#c4b8a6', stone: '#cfc5b3', stoneD: '#a39a91',
  hedge: '#3f7b35', hedgeD: '#2c6233', soil: '#6b4a32', soilD: '#4e3626', straw: '#e6c784', wheat: '#d4a862',
  frame: '#5b5562', white: '#fbf7f0', ink: '#433c52', steel: '#9d95a6', steelD: '#7a7186', steelL: '#c3bcc7',
  red: '#c23a3f', orange: '#f08a46', yellow: '#fbd46e', teal: '#2fae9b', blue: '#4a7cb6', green: '#5a9537', gold: '#fbd46e', goldD: '#d4a862',
} as const;

/** Washing, shirts, umbrellas: the town's bright bits. */
export const BRIGHT: Paint[] = ['#c23a3f', '#fbd46e', '#4a7cb6', '#f7a6c4', '#fbf7f0', '#2fae9b', '#f08a46', '#a862c4', '#93bfe8'];
export const FLOWERS: Paint[] = ['#e86aa0', '#fbd46e', '#c23a3f', '#d08fdc', '#fbf7f0', '#f08a46', '#f7a6c4'];

// ── materials ────────────────────────────────────────────────────────────────────────────────
/** Lit windows: warm rooms seen from the street (Aurora is always day, so they glow gently). */
export const litMat = glowMat('#ffd98a', 0.42);
litMat.color.copy(col('#e8cf98'));
litMat.roughness = 0.5;
/** Grow lights (hydroponics): pink-violet. */
export const growMat = glowMat('#f7a6c4', 0.9);
growMat.color.copy(col('#d08fdc'));
/** Festoon bulbs. */
export const bulbMat = glowMat('#fff1c4', 1.1);
/** A pond. */
/**
 * Still water (ponds, channels, pools, the fountain): the scene's own water look (ripples, the sky's mirror), a
 * little clear. `Hab.finish` gives each sheet the depth that look reads.
 */
function stillWater(shallow: Paint, deep: Paint, opacity: number, depth: number) {
  const m = waterMaterial(shallow, deep);
  m.transparent = true;
  m.opacity = opacity;
  m.userData.shared = true;
  m.userData.depth = depth;
  return m;
}
export const pondMat = stillWater('#5fa7a2', '#1f5876', 0.9, 4.4);
export const poolWaterMat = stillWater('#45b4c6', '#17779c', 0.8, 3.0);
/** Tower glass with a little sheen (vertex coloured). */
export const towerGlass = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.06 }));

// ── the builder ──────────────────────────────────────────────────────────────────────────────
/**
 * One piece's kits: `k` paint, `glass` panes, `lit` lit panes, `leaf` foliage (faceted). `trees`
 * and `dots` (flowers, fruit) are instanced. `finish()` bends it all onto the floor.
 */
export class Hab {
  readonly g = new THREE.Group();
  readonly anim = new Anim();
  readonly k: Kit;
  readonly glass: Kit;
  readonly lit: Kit;
  readonly leaf: Kit;
  readonly r: () => number;
  readonly crowd = new Crowd();
  private trees = new Map<TreeKind | 'cypress' | 'fruit' | 'blossom', { x: number; z: number; s: number; ry: number; y: number; tint: number }[]>();
  private dots: { x: number; y: number; z: number; s: number; c: Paint }[] = [];
  private extra: { m: THREE.Mesh; bend: boolean }[] = [];
  constructor(seed: number, readonly W: number, readonly D: number) {
    this.r = rng(seed * 7 + 3);
    this.k = new Kit(rng(seed + 1));
    this.glass = new Kit(rng(seed + 2));
    this.lit = new Kit(rng(seed + 3));
    this.leaf = new Kit(rng(seed + 4));
    this.anim.add((e) => this.crowd.update(e));
  }
  /** A random pick. */
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.r() * a.length)]; }
  /** A tree (instanced), base at y above the floor. */
  tree(kind: TreeKind | 'cypress' | 'fruit' | 'blossom', x: number, z: number, s: number, y = 0, tint = 1) {
    let l = this.trees.get(kind);
    if (!l) this.trees.set(kind, (l = []));
    l.push({ x, z, s, ry: this.r() * TAU, y, tint: (0.9 + this.r() * 0.2) * tint });
    if (kind === 'fruit') for (let i = 0; i < 7; i++) {
      const a = this.r() * TAU, rr = (0.55 + this.r() * 0.5) * s, hy = (1.4 + this.r() * 0.9) * s;
      this.dots.push({ x: x + Math.cos(a) * rr, y: y + hy, z: z + Math.sin(a) * rr, s: 0.12 * Math.max(0.8, s), c: this.r() < 0.7 ? '#c23a3f' : '#f08a46' });
    }
  }
  /** Flowers (instanced dots) scattered in a rectangle, y = their height. */
  flowers(x: number, z: number, w: number, d: number, n: number, y = 0.25, palette: readonly Paint[] = FLOWERS) {
    for (let i = 0; i < n; i++) this.dots.push({ x: x + (this.r() - 0.5) * w, y: y + this.r() * 0.12, z: z + (this.r() - 0.5) * d, s: 0.09 + this.r() * 0.06, c: palette[Math.floor(this.r() * palette.length)] });
  }
  dot(x: number, y: number, z: number, s: number, c: Paint) { this.dots.push({ x, y, z, s, c }); }
  /** A mesh to add as is (bent onto the floor unless `flat`). */
  mesh(m: THREE.Mesh, flat = false) { this.extra.push({ m, bend: !flat }); return m; }
  /** A person standing (feet-together frame), `y` above the floor (on a terrace, a deck). */
  stand(x: number, z: number, ry: number, kind: PersonName = 'office', h = 1.75, y = 0) {
    const p = rigged(fig(kind), h * (0.95 + this.r() * 0.1));
    if (!p) return;
    p.walk.time = 0;
    p.mixer.update(0);
    p.walk.paused = true;
    p.obj.position.set(x, y + floorY(z), z);
    p.obj.rotation.y = ry;
    this.g.add(p.obj);
  }
  /** Two or three people chatting in a ring. */
  chat(x: number, z: number, n: number, kinds: readonly PersonName[] = RESIDENTS) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.r() * 0.4;
      this.stand(x + Math.cos(a) * 0.55, z + Math.sin(a) * 0.55, Math.atan2(-Math.cos(a), -Math.sin(a)), this.pick(kinds));
    }
  }
  /**
   * Someone walking a route of points, there and back the same way (the crowd closes a path from its last point
   * straight to its first: across whatever stands between). `loop`: the points are a round already.
   */
  walk(pts: [number, number][], kind: PersonName | null = null, o: { speed?: number; height?: number; pause?: [number, number]; loop?: boolean } = {}) {
    const route = o.loop || pts.length < 3 ? pts : [...pts, ...pts.slice(1, -1).reverse()];
    this.crowd.add(fig(kind ?? this.pick(RESIDENTS)), route, (_x, z) => floorY(z), { speed: o.speed, height: o.height, pause: o.pause ?? [1, 5] });
  }
  /** A child running about a small loop round (x, z). */
  kid(x: number, z: number, r = 1.6) {
    const n = 4 + Math.floor(this.r() * 3), a0 = this.r() * TAU;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU, rr = r * (0.5 + this.r() * 0.6);
      pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
    }
    const k = this.pick(['kid_a', 'kid_b'] as PersonName[]);
    // the children's own figures are 1.25–1.3 tall; a stand-in adult is scaled down to about that
    this.crowd.add(fig(k), pts, (_x, zz) => floorY(zz), { speed: 1.9 + this.r() * 0.6, height: hasModel(k) ? 1.12 + this.r() * 0.22 : 1.05 + this.r() * 0.2, pause: [0.4, 2] });
  }
  /** A sign (text in the UI font) facing +z, turned by ry. */
  sign(text: string, w: number, x: number, y: number, z: number, fg: Paint = H.white, bg: Paint | null = null, ry = 0, maxH = 0) {
    const s = sign(text, w, fg, bg);
    const sh = s.userData.signHeight as number;
    if (maxH && sh > maxH) s.scale.setScalar(maxH / sh);
    s.position.set(x, y + floorY(z), z);
    s.rotation.y = ry;
    this.g.add(s);
    return s;
  }

  finish(h: number, extra: Partial<Piece> = {}): Piece {
    const add = (k: Kit, mat?: THREE.Material, shadow = true) => {
      if (k.empty) return;
      const m = k.build(mat);
      bend(m.geometry);
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.g.add(m);
    };
    add(this.k);
    add(this.glass, glassMat);
    add(this.lit, litMat, false);
    add(this.leaf, plantMat);
    for (const [kind, at] of this.trees) {
      // the town's own two shapes are built here; every other kind is one of the shared plants (trees.ts), a mix of
      // its variants, standing on the curved floor
      if (kind === 'cypress' || kind === 'blossom') {
        const im = new THREE.InstancedMesh(kind === 'cypress' ? cypressGeo() : blossomGeo(), plantMat, at.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
        at.forEach((p, i) => {
          q.setFromAxisAngle(UP, p.ry);
          m.compose(V(p.x, p.y + floorY(p.z), p.z), q, V(p.s, p.s, p.s));
          im.setMatrixAt(i, m);
          im.setColorAt(i, c.setScalar(p.tint));
        });
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.g.add(im);
      } else this.g.add(plantField(kind === 'fruit' ? 'blob' : kind, at.map((p) => ({ x: p.x, y: p.y + floorY(p.z), z: p.z, s: p.s, ry: p.ry, tint: p.tint }))));
    }
    if (this.dots.length) {
      const im = new THREE.InstancedMesh(dotGeo, plantMat, this.dots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      this.dots.forEach((d, i) => {
        m.compose(V(d.x, d.y + floorY(d.z), d.z), q, V(d.s, d.s, d.s));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col(d.c));
      });
      im.castShadow = false;
      im.computeBoundingSphere();
      this.g.add(im);
    }
    for (const { m, bend: b } of this.extra) {
      if (b) bend(m.geometry);
      // water: one depth over the whole sheet (past where the water look would draw surf)
      const depth = (m.material as THREE.Material).userData?.depth as number | undefined;
      if (depth && !m.geometry.attributes.aDepth) m.geometry.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(m.geometry.attributes.position.count).fill(depth), 1));
      this.g.add(m);
    }
    this.g.add(this.crowd.group);
    return { obj: this.g, w: this.W, d: this.D, h, update: this.anim.update, ...extra };
  }
}
const UP = new THREE.Vector3(0, 1, 0);
const dotGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const c = new Float32Array(g.attributes.position.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
})();
let cypress: THREE.BufferGeometry | null = null;
/** A tall slim cypress (the villas' trees), about 1 unit tall per unit of scale. */
function cypressGeo() {
  if (cypress) return cypress;
  const k = new Kit(rng(5));
  k.cyl(0.08, 0.1, 0.5, '#5c3a26', 0, 0, 0, 5);
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  const r = rng(9);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k2 = 0.85 + r() * 0.25;
    p.setXYZ(i, p.getX(i) * k2 * (1 - Math.max(0, y) * 0.9), y * 4.2 + 2.4, p.getZ(i) * k2 * (1 - Math.max(0, y) * 0.9));
  }
  k.geo(g, '#2f5a3e', 0.12);
  k.geo(new THREE.IcosahedronGeometry(0.34, 0).scale(1, 3, 1).translate(0.12, 2.2, 0.1), '#356848', 0.12);
  cypress = k.build().geometry;
  return cypress;
}

let blossom: THREE.BufferGeometry | null = null;
/** A flowering tree: a crooked trunk under clouds of pink and white blossom. */
function blossomGeo() {
  if (blossom) return blossom;
  const k = new Kit(rng(8));
  k.cyl(0.12, 0.2, 1.4, '#5c3a26', 0, 0, 0, 6);
  k.beam(V(0, 1.2, 0), V(0.5, 2.0, 0.2), 0.14, '#5c3a26');
  k.beam(V(0, 1.2, 0), V(-0.45, 1.9, -0.25), 0.12, '#5c3a26');
  const r = rng(4);
  const tints = ['#f7a6c4', '#f2b8cf', '#fbe3ec', '#e88fb2'];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, rr = i ? 0.75 : 0;
    k.geo(blob(0.62 + r() * 0.25, r, 1).translate(Math.cos(a) * rr, 2.25 + r() * 0.5 + (i ? 0 : 0.4), Math.sin(a) * rr), tints[i % 4], 0.1);
  }
  blossom = k.build().geometry;
  return blossom;
}

export const RESIDENTS: PersonName[] = ['resident_a', 'resident_b', 'office', 'resident_a', 'engineer', 'resident_b', 'researcher', 'scientist'];
export const CREW: PersonName[] = ['worker', 'worker', 'engineer'];

// ── placements (a turned frame for compound parts) ───────────────────────────────────────────
/** Shapes added through a transform (so a house can face any way). */
export class At {
  readonly m: THREE.Matrix4;
  constructor(x = 0, y = 0, z = 0, ry = 0) { this.m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z); }
  box(k: Kit, w: number, h: number, d: number, paint: Paint, x = 0, y = 0, z = 0, r = -1, jitter = 0.05, shade = 0.22, ry = 0) {
    const rr = r >= 0 ? r : Math.min(0.12, Math.min(w, h, d) * 0.06);
    const g = rr > 0.001 ? roundBox(w, h, d, rr) : new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z).applyMatrix4(this.m);
    k.geo(g, paint, jitter, shade);
    return this;
  }
  cyl(k: Kit, rt: number, rb: number, h: number, paint: Paint, x = 0, y = 0, z = 0, seg = 10, shade = 0.15) {
    k.geo(new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(x, y + h / 2, z).applyMatrix4(this.m), paint, 0.04, shade);
    return this;
  }
  geo(k: Kit, g: THREE.BufferGeometry, paint: Paint, jitter = 0.05, shade = 0) {
    k.geo(g.applyMatrix4(this.m), paint, jitter, shade);
    return this;
  }
  beam(k: Kit, a: THREE.Vector3, b: THREE.Vector3, t: number, paint: Paint) {
    k.beam(a.clone().applyMatrix4(this.m), b.clone().applyMatrix4(this.m), t, paint);
    return this;
  }
  pt(x: number, y: number, z: number) { return V(x, y, z).applyMatrix4(this.m); }
}
const roundBox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, kitDetail.bevelSeg, r);

/** A gabled (pitched) roof prism, ridge along local x, eaves at y0. */
export function gable(w: number, d: number, rise: number, y0: number, over = 0.3) {
  const s = new THREE.Shape();
  const hd = d / 2 + over;
  s.moveTo(-hd, 0);
  s.lineTo(hd, 0);
  s.lineTo(hd, 0.14);
  s.lineTo(0, rise + 0.14);
  s.lineTo(-hd, 0.14);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(-(w / 2 + over), y0, 0);
  return g;
}
/** A monopitch roof slab sloping down to the back (−z). */
export function monopitch(w: number, d: number, hi: number, lo: number, y0: number, over = 0.35) {
  const s = new THREE.Shape();
  const hd = d / 2 + over;
  s.moveTo(-hd, lo);
  s.lineTo(hd, hi);
  s.lineTo(hd, hi + 0.22);
  s.lineTo(-hd, lo + 0.22);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(-(w / 2 + over), y0, 0);
  return g;
}

// ── windows ──────────────────────────────────────────────────────────────────────────────────
/** A framed window on a +z face (in `a`'s frame): the pane goes to glass or lit, the frame to paint. */
export function win(h: Hab, a: At, x: number, y: number, z: number, w: number, hh: number, lit: boolean, frame: Paint = H.white, sill = true) {
  a.box(lit ? h.lit : h.glass, w, hh, 0.06, lit ? '#ffffff' : '#4a6b78', x, y, z + 0.02, 0, 0.03, 0);
  const t = 0.1;
  a.box(h.k, w + t * 2, t, 0.12, frame, x, y + hh, z + 0.03, 0, 0.02, 0);
  a.box(h.k, w + t * 2, t, 0.12, frame, x, y - t, z + 0.03, 0, 0.02, 0);
  a.box(h.k, t, hh, 0.12, frame, x - w / 2 - t / 2, y, z + 0.03, 0, 0.02, 0);
  a.box(h.k, t, hh, 0.12, frame, x + w / 2 + t / 2, y, z + 0.03, 0, 0.02, 0);
  if (w > 1.2) a.box(h.k, 0.06, hh, 0.1, frame, x, y, z + 0.04, 0, 0.02, 0);
  if (sill) a.box(h.k, w + 0.3, 0.1, 0.3, H.stone, x, y - 0.18, z + 0.12, 0.02, 0.02, 0);
}
/** A window box of flowers under a window. */
export function windowBox(h: Hab, a: At, x: number, y: number, z: number, w: number) {
  a.box(h.k, w, 0.3, 0.34, H.timber, x, y, z + 0.17, 0.04);
  flowersAt(h, a, x, y + 0.36, z + 0.17, w * 0.85, 0.22, Math.round(w * 5));
  a.box(h.leaf, w * 0.9, 0.18, 0.26, H.ivyL, x, y + 0.24, z + 0.17, 0.05, 0.15, 0);
}
/** Flowers over a local w × d rectangle of a turned frame. */
export function flowersAt(h: Hab, a: At, x: number, y: number, z: number, w: number, d: number, n: number) {
  const p = a.pt(x, y, z);
  const ax = Math.abs(a.m.elements[0]), az = Math.abs(a.m.elements[2]);
  h.flowers(p.x, p.z, w * ax + d * az, w * az + d * ax, n, p.y);
}

// ── a home ───────────────────────────────────────────────────────────────────────────────────
export interface HomeOpts {
  w: number;
  d: number;
  /** 0 gabled tiles, 1 flat green roof, 2 monopitch with timber cladding. */
  style: number;
  storeys?: number;
  wall?: Paint;
  wall2?: Paint;
  roof?: Paint;
  door?: Paint;
  /** 0..3 how lived-in (window boxes, climbers, lit rooms). */
  lived: number;
  /** Fraction of windows lit. */
  litFrac?: number;
}

/**
 * A two-storey Solarpunk home facing local +z: a stone plinth, rendered ground floor with a big
 * window and a timber door under a canopy, the upper floor set back behind a planted terrace,
 * a gabled, green or monopitch roof. Returns the top height.
 */
export function home(h: Hab, x: number, z: number, ry: number, o: HomeOpts) {
  const a = new At(x, 0, z, ry);
  const { w, d } = o;
  const k = h.k;
  const wall = o.wall ?? H.render, wall2 = o.wall2 ?? wall, roof = o.roof ?? H.tile, door = o.door ?? h.pick([H.teal, '#4a7cb6', H.red, '#5a9537', H.timberD]);
  const lit = () => h.r() < (o.litFrac ?? 0.2 + o.lived * 0.12);
  const two = (o.storeys ?? 2) >= 2;
  const g1 = 3.0, g2 = 2.7, sb = two ? 1.5 : 0;
  a.box(k, w + 0.36, 0.34, d + 0.36, H.stone, 0, 0, 0, 0.06, 0.03, 0.1);
  a.box(k, w, g1, d, wall, 0, 0.3, 0, 0.1, 0.03, 0.14);
  // ground floor front: a timber door under a canopy, a big window, a side window
  const dx = -w / 2 + 1.1;
  a.box(k, 1.0, 2.15, 0.12, door, dx, 0.32, d / 2 + 0.03, 0.03, 0.04, 0);
  a.box(k, 0.08, 0.08, 0.06, H.gold, dx + 0.32, 1.3, d / 2 + 0.12, 0, 0, 0);
  a.box(k, 1.7, 0.12, 1.0, H.timber, dx, 2.62, d / 2 + 0.5, 0.03, 0.04, 0);
  for (const sx of [-0.75, 0.75]) a.box(k, 0.09, 2.3, 0.09, H.timberD, dx + sx, 0.32, d / 2 + 0.92, 0, 0.03, 0);
  a.box(k, 1.2, 0.14, 0.9, H.stone, dx, 0.12, d / 2 + 0.5, 0.03, 0.02, 0);
  const bw = Math.min(2.6, w - 3.0);
  win(h, a, dx + 1.0 + bw / 2 + 0.3, 0.95, d / 2, bw, 1.55, lit(), H.white);
  if (o.lived >= 1 && !two) windowBox(h, a, dx + 1.0 + bw / 2 + 0.3, 0.62, d / 2, bw);
  // side windows
  for (const s of [-1, 1]) {
    const sa = new At(0, 0, 0, 0);
    sa.m.copy(a.m).multiply(new THREE.Matrix4().makeRotationY((s * Math.PI) / 2));
    win(h, sa, 0, 1.0, w / 2, 0.9, 1.1, lit(), H.white);
  }
  let top = 0.3 + g1;
  if (two) {
    // the terrace: decking, a planter along its edge, a timber rail
    const tz = d / 2 - sb / 2;
    a.box(k, w + 0.1, 0.22, d + 0.1, o.style === 1 ? H.slate : H.stoneD, 0, top - 0.02, 0, 0.04, 0.02, 0);
    a.box(k, w - 0.4, 0.06, sb - 0.2, H.deck, 0, top + 0.2, tz, 0, 0.04, 0);
    a.box(k, w - 0.2, 0.4, 0.3, H.timber, 0, top + 0.2, d / 2 - 0.2, 0.04, 0.04, 0.1);
    a.box(h.leaf, w - 0.4, 0.3, 0.26, H.ivyL, 0, top + 0.55, d / 2 - 0.2, 0.05, 0.16, 0);
    if (o.lived >= 1) flowersAt(h, a, 0, top + 0.72, d / 2 - 0.2, w - 0.8, 0.22, Math.round(w * 2.2));
    for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) a.box(k, 0.1, 1.0, sb - 0.2, H.timberD, sx, top + 0.2, tz, 0, 0.03, 0);
    // the upper floor
    const ud = d - sb;
    const y2 = top + 0.2;
    a.box(k, w, g2, ud, wall2, 0, y2, -sb / 2, 0.1, 0.03, 0.08);
    const fz = d / 2 - sb;
    if (o.style === 2) for (let bx = -w / 2 + 0.25; bx < w / 2 - 0.1; bx += 0.4) a.box(k, 0.14, g2 - 0.1, 0.08, h.r() < 0.5 ? H.timber : H.timberL, bx, y2, fz + 0.04, 0, 0.06, 0.05);
    // a terrace door and a window
    a.box(lit() ? h.lit : h.glass, 1.0, 2.0, 0.06, lit() ? '#ffffff' : '#4a6b78', -w / 2 + 1.3, y2 + 0.1, fz + (o.style === 2 ? 0.12 : 0.03), 0, 0.03, 0);
    a.box(k, 1.2, 0.12, 0.14, H.white, -w / 2 + 1.3, y2 + 2.1, fz + 0.1, 0, 0.02, 0);
    win(h, a, w / 2 - 1.5, y2 + 0.9, fz + (o.style === 2 ? 0.1 : 0), 1.3, 1.2, lit(), H.white);
    if (o.lived >= 1) windowBox(h, a, w / 2 - 1.5, y2 + 0.56, fz + (o.style === 2 ? 0.1 : 0), 1.4);
    for (const s of [-1, 1]) {
      const sa = new At(0, 0, 0, 0);
      sa.m.copy(a.m).multiply(new THREE.Matrix4().makeRotationY((s * Math.PI) / 2)).multiply(new THREE.Matrix4().makeTranslation(sb / 2 * s, 0, 0));
      win(h, sa, 0, y2 + 1.0, w / 2, 0.8, 1.0, lit(), H.white, false);
    }
    top = y2 + g2;
    if (o.style === 0) {
      a.geo(k, gable(w, ud, 2.1, top - 0.02), roof, 0.04, 0.08);
      a.box(k, w + 0.7, 0.16, 0.24, H.tileD, 0, top + 2.15, -sb / 2, 0.04, 0.02, 0);
      // a dormer-ish skylight
      a.box(h.glass, 1.0, 0.06, 0.9, '#6f97a3', w / 4, top + 1.0, -sb / 2 + ud / 4 + 0.05, 0, 0.02, 0);
      top += 2.3;
    } else if (o.style === 2) {
      a.geo(k, monopitch(w, ud, 1.3, 0.1, top - 0.02), '#9d95a6', 0.03, 0.05);
      for (let sx = -w / 2 + 0.2; sx < w / 2; sx += 0.55) a.geo(k, new THREE.BoxGeometry(0.06, 0.08, ud + 0.6).rotateX(-Math.atan2(1.2, ud + 0.7)).translate(sx, top + 0.92, -sb / 2), '#c3bcc7', 0.02, 0);
      top += 1.6;
    } else {
      greenRoof(h, a, w, ud, top, 0, -sb / 2, o.lived);
      top += 0.6;
    }
  } else {
    greenRoof(h, a, w, d, top, 0, 0, o.lived);
    top += 0.6;
  }
  // climbers up a corner
  if (o.lived >= 2) {
    const cx = w / 2 - 0.35, ch = (two ? 4.5 : 2.6) * (0.6 + h.r() * 0.4);
    for (let y = 0.4; y < ch; y += 0.5) a.geo(h.leaf, blob(0.38 + h.r() * 0.15, h.r).translate(cx + (h.r() - 0.5) * 0.3, y, d / 2 + 0.12), h.r() < 0.5 ? H.ivy : H.ivyL, 0.18);
  }
  return top;
}

/** A flat green roof: parapet, sedum, planters with shrubs, a skylight, a small tree on the bigger ones. */
export function greenRoof(h: Hab, a: At, w: number, d: number, y: number, x = 0, z = 0, lived = 1) {
  const k = h.k;
  a.box(k, w + 0.2, 0.3, d + 0.2, H.slate, x, y - 0.05, z, 0.05, 0.02, 0);
  a.box(k, w - 0.3, 0.12, d - 0.3, H.sedum, x, y + 0.2, z, 0.03, 0.1, 0);
  // low growth on the sedum: grass in tufts, a shrub or two (the shared plants)
  for (let i = 0; i < 9; i++) {
    const p = a.pt(x + (h.r() - 0.5) * (w - 1.2), y + 0.3, z + (h.r() - 0.5) * (d - 1.2));
    if (i < 3) h.tree('shrub', p.x, p.z, 0.3 + h.r() * 0.18, p.y);
    else h.tree('tuft', p.x, p.z, 0.6 + h.r() * 0.4, p.y);
  }
  a.box(h.glass, 1.0, 0.1, 0.8, '#6f97a3', x - w / 4, y + 0.3, z - d / 6, 0.02, 0.02, 0);
  a.box(k, 1.2, 0.12, 1.0, H.white, x - w / 4, y + 0.2, z - d / 6, 0.03, 0.02, 0);
  if (w * d > 24) {
    a.box(k, 1.4, 0.55, 1.4, H.timber, x + w / 4, y + 0.2, z + d / 6, 0.05, 0.04, 0.1);
    const p = a.pt(x + w / 4, y + 0.75, z + d / 6);
    h.tree(lived >= 2 ? 'broadleaf' : 'blob', p.x, p.z, 0.55 + lived * 0.12, p.y);
  }
}

/** A lumpy little ball of foliage. */
export function blob(r: number, rand: () => number, detail = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + rand() * 0.32;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  return g;
}

// ── ground ───────────────────────────────────────────────────────────────────────────────────
/** A flat strip from (x0, z0) to (x1, z1), subdivided so it can follow the floor. */
export function strip(k: Kit, x0: number, z0: number, x1: number, z1: number, w: number, paint: Paint, y = 0.02, t = 0.07) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.BoxGeometry(len, t, w, Math.max(1, Math.ceil(len / 1.2)), 1, Math.max(1, Math.ceil(w / 1.2)));
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, y + t / 2, (z0 + z1) / 2);
  k.geo(g, paint, 0.03, 0);
}
/** A paved or gravel patch (subdivided), centred at (x, z). */
export function patch(k: Kit, x: number, z: number, w: number, d: number, paint: Paint, y = 0.02, t = 0.07) {
  const g = new THREE.BoxGeometry(w, t, d, Math.max(1, Math.ceil(w / 1.2)), 1, Math.max(1, Math.ceil(d / 1.2)));
  g.translate(x, y + t / 2, z);
  k.geo(g, paint, 0.025, 0);
}
/** Paving slabs: a patch with a grid of slightly different slabs. */
export function paving(h: Hab, x: number, z: number, w: number, d: number, a: Paint = H.paving, b: Paint = H.pavingD, s = 1.6) {
  patch(h.k, x, z, w, d, b, 0.0, 0.06);
  const nx = Math.max(1, Math.round(w / s)), nz = Math.max(1, Math.round(d / s));
  const sw = w / nx, sd = d / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) h.k.box(sw - 0.12, 0.06, sd - 0.12, h.r() < 0.25 ? mix(a, b, 0.4) : a, x - w / 2 + sw * (i + 0.5), 0.04, z - d / 2 + sd * (j + 0.5), { r: 0, jitter: 0.03, shade: 0 });
}
/**
 * A clipped hedge from (x0, z0) to (x1, z1): a dark heart (what shows between the leaves) under a close row of
 * the shared shrubs (trees.ts), no two the same size.
 */
export function hedge(h: Hab, x0: number, z0: number, x1: number, z1: number, ht = 0.9, t = 0.7) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  h.leaf.box(len - 0.5, ht * 0.5, t * 0.4, '#1f3a1e', (x0 + x1) / 2, 0, (z0 + z1) / 2, { r: 0.1, ry, jitter: 0.04, shade: 0.3 });
  // a shrub is about 1.15 tall and 1.5 across at scale 1: stood shoulder to shoulder
  const s = ht / 1.15;
  const n = Math.max(2, Math.round(len / (0.6 * s)));
  const px = -(z1 - z0) / len, pz = (x1 - x0) / len;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, side = (h.r() - 0.5) * t * 0.16;
    h.tree('shrub', x0 + (x1 - x0) * u + px * side, z0 + (z1 - z0) * u + pz * side, s * (0.9 + h.r() * 0.2), -0.04, 0.84);
  }
}
/** A low picket fence along a line. */
export function picket(h: Hab, x0: number, z0: number, x1: number, z1: number, paint: Paint = H.white, ht = 0.9) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.32));
  for (let i = 0; i <= n; i++) h.k.box(0.09, ht, 0.06, paint, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, { r: 0, jitter: 0.02, shade: 0.1 });
  for (const y of [0.25, ht - 0.25]) h.k.beam(V(x0, y, z0), V(x1, y, z1), 0.07, paint);
}
/** A raised vegetable bed (timber sides, dark soil, rows of greens). */
export function vegBed(h: Hab, x: number, z: number, w: number, d: number, ry = 0, grown = 1) {
  const a = new At(x, 0, z, ry);
  a.box(h.k, w, 0.45, d, H.timber, 0, 0, 0, 0.04, 0.05, 0.2);
  a.box(h.k, w - 0.2, 0.06, d - 0.2, H.soil, 0, 0.43, 0, 0, 0.05, 0);
  const rows = Math.max(1, Math.round(d / 0.55));
  for (let j = 0; j < rows; j++) {
    const lz = -d / 2 + (d / rows) * (j + 0.5);
    const n = Math.max(1, Math.round(w / 0.5));
    for (let i = 0; i < n; i++) {
      if (h.r() > 0.35 + grown * 0.25) continue;
      const lx = -w / 2 + (w / n) * (i + 0.5);
      const g = blob(0.16 + h.r() * 0.08 * grown, h.r).translate(lx, 0.55, lz);
      a.geo(h.leaf, g, j % 3 === 2 ? '#8fb552' : j % 3 === 1 ? '#5a9537' : '#7dae3f', 0.2);
    }
  }
}
/** A flower bed edged in stone. */
export function flowerBed(h: Hab, x: number, z: number, w: number, d: number, n = 0) {
  h.k.box(w, 0.25, d, H.stone, x, 0, z, { r: 0.08, jitter: 0.03, shade: 0.1 });
  h.k.box(w - 0.24, 0.05, d - 0.24, H.soil, x, 0.23, z, { r: 0, jitter: 0.03, shade: 0 });
  // leafy mounds (the shared shrubs, small) filling the bed, the blooms standing on them
  const nx = Math.max(1, Math.round((w - 0.3) / 0.55)), nz = Math.max(1, Math.round((d - 0.3) / 0.55));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
    h.tree('shrub', x - (w - 0.3) / 2 + ((i + 0.3 + h.r() * 0.4) / nx) * (w - 0.3), z - (d - 0.3) / 2 + ((j + 0.3 + h.r() * 0.4) / nz) * (d - 0.3), 0.3 + h.r() * 0.12, 0.24);
  h.flowers(x, z, w - 0.4, d - 0.4, n || Math.round(w * d * 4), 0.5);
}

// ── street furniture ─────────────────────────────────────────────────────────────────────────
/** A timber bench facing local +z. */
export function bench(h: Hab, x: number, z: number, ry = 0) {
  const a = new At(x, 0, z, ry);
  for (const sx of [-0.7, 0.7]) a.box(h.k, 0.1, 0.45, 0.45, H.ink, sx, 0, 0, 0, 0.02, 0);
  for (let i = 0; i < 3; i++) a.box(h.k, 1.7, 0.06, 0.12, H.timberL, 0, 0.45, -0.15 + i * 0.15, 0, 0.05, 0);
  for (let i = 0; i < 2; i++) a.box(h.k, 1.7, 0.12, 0.06, H.timberL, 0, 0.62 + i * 0.18, -0.26, 0, 0.05, 0);
}
/** A slender lamp post with a round head. */
export function lampPost(h: Hab, x: number, z: number, ht = 3.6) {
  h.k.cyl(0.06, 0.08, ht, H.frame, x, 0, z, 6);
  h.k.cyl(0.18, 0.18, 0.12, H.frame, x, 0, z, 8);
  h.k.geo(new THREE.SphereGeometry(0.22, 10, 8).translate(x, ht + 0.12, z), '#f6efe0', 0);
  h.k.cyl(0.26, 0.06, 0.12, H.frame, x, ht + 0.3, z, 8);
}
/** A bicycle (local x = its length) — frame colour from the bright list. */
export function bike(h: Hab, x: number, z: number, ry: number, paint: Paint = h.pick(BRIGHT)) {
  const a = new At(x, 0, z, ry);
  for (const wx of [-0.55, 0.55]) {
    a.geo(h.k, new THREE.TorusGeometry(0.32, 0.045, 5, 14).translate(wx, 0.36, 0), '#2f2a3d', 0.02);
    a.geo(h.k, new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6).rotateX(Math.PI / 2).translate(wx, 0.36, 0), H.steelL, 0);
  }
  const P = (px: number, py: number) => V(px, py, 0);
  for (const [p, q] of [[P(-0.55, 0.36), P(-0.05, 0.36)], [P(-0.05, 0.36), P(0.35, 0.8)], [P(-0.55, 0.36), P(-0.15, 0.82)], [P(-0.15, 0.82), P(0.35, 0.8)], [P(-0.05, 0.36), P(-0.15, 0.82)], [P(0.55, 0.36), P(0.38, 0.92)]] as [THREE.Vector3, THREE.Vector3][]) a.beam(h.k, p, q, 0.05, paint);
  a.box(h.k, 0.26, 0.06, 0.12, '#2f2a3d', -0.17, 0.86, 0, 0, 0, 0);
  a.box(h.k, 0.06, 0.05, 0.46, '#2f2a3d', 0.38, 0.95, 0, 0, 0, 0);
  if (h.r() < 0.5) a.box(h.k, 0.32, 0.22, 0.3, H.timber, 0.52, 0.82, 0, 0.02, 0.05, 0);
}
/** A washing line between two posts with the laundry out. */
export function laundry(h: Hab, x0: number, z0: number, x1: number, z1: number, ht = 1.9) {
  for (const [x, z] of [[x0, z0], [x1, z1]]) {
    h.k.box(0.1, ht + 0.1, 0.1, H.timberD, x, 0, z, { r: 0, jitter: 0.03 });
    h.k.box(0.5, 0.08, 0.08, H.timberD, x, ht, z, { r: 0, ry: -Math.atan2(z1 - z0, x1 - x0) + Math.PI / 2 });
  }
  const n = 8;
  let prev = V(x0, ht, z0);
  for (let s = 1; s <= n; s++) {
    const q = V(x0 + ((x1 - x0) * s) / n, ht - Math.sin((Math.PI * s) / n) * 0.2, z0 + ((z1 - z0) * s) / n);
    h.k.beam(prev, q, 0.025, H.white);
    prev = q;
  }
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  for (let t = 0.12; t < 0.9; t += 0.11 + h.r() * 0.06) {
    const sag = Math.sin(Math.PI * t) * 0.2;
    const cw = 0.35 + h.r() * 0.25, chh = 0.4 + h.r() * 0.35;
    h.k.box(cw, chh, 0.03, h.pick(BRIGHT), x0 + (x1 - x0) * t, ht - sag - chh - 0.02, z0 + (z1 - z0) * t, { r: 0, ry, jitter: 0.06, shade: 0 });
  }
}
/** String lights sagging between two points (glowing bulbs). */
export function festoon(h: Hab, a: THREE.Vector3, b: THREE.Vector3, sag = 0.5, n = 10) {
  const pts: THREE.Vector3[] = [];
  for (let s = 0; s <= n; s++) {
    const q = a.clone().lerp(b, s / n);
    q.y -= Math.sin((Math.PI * s) / n) * sag;
    pts.push(q);
  }
  for (let i = 0; i + 1 < pts.length; i++) h.k.beam(pts[i], pts[i + 1], 0.03, H.ink);
  const bk = new Kit(rng(3));
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i - 1].clone().lerp(pts[i], 0.5);
    bk.geo(new THREE.SphereGeometry(0.09, 6, 4).translate(q.x, q.y - 0.1, q.z), '#ffffff', 0, 0);
  }
  const m = bk.build(bulbMat);
  m.castShadow = false;
  h.mesh(m);
}
/** A timber pergola (posts and slats) with vines over it. */
export function pergola(h: Hab, x: number, z: number, w: number, d: number, vines = 1, ht = 2.5) {
  for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) h.k.box(0.16, ht, 0.16, H.timberD, x + sx, 0, z + sz, { r: 0.02 });
  for (const sz of [-d / 2, d / 2]) h.k.box(w + 0.4, 0.18, 0.16, H.timber, x, ht, z + sz, { r: 0.02 });
  for (let i = 0; i <= Math.round(w / 0.5); i++) h.k.box(0.08, 0.1, d + 0.5, H.timberL, x - w / 2 + (w * i) / Math.round(w / 0.5), ht + 0.18, z, { r: 0 });
  for (let i = 0; i < Math.round(w * d * vines * 0.8); i++) h.leaf.geo(blob(0.28 + h.r() * 0.18, h.r).translate(x + (h.r() - 0.5) * w, ht + 0.3, z + (h.r() - 0.5) * d), h.r() < 0.5 ? H.ivy : H.ivyL, 0.2);
  if (vines > 0.5) for (const sx of [-w / 2, w / 2]) for (let y = 0.4; y < ht; y += 0.55) h.leaf.geo(blob(0.22, h.r).translate(x + sx, y, z + d / 2), H.ivyL, 0.2);
}
/** A table with chairs round it (a café or a courtyard). */
export function table(h: Hab, x: number, z: number, umbrella: Paint | null = null, n = 4) {
  h.k.cyl(0.5, 0.5, 0.06, H.white, x, 0.74, z, 12, { shade: 0 });
  h.k.cyl(0.05, 0.05, 0.74, H.ink, x, 0, z, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.4;
    const cx = x + Math.cos(a) * 0.8, cz = z + Math.sin(a) * 0.8;
    h.k.box(0.4, 0.06, 0.4, H.timberL, cx, 0.44, cz, { r: 0.02, ry: -a });
    for (const [lx, lz] of [[0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]]) h.k.box(0.04, 0.44, 0.04, H.ink, cx + lx, 0, cz + lz, { r: 0, jitter: 0 });
    h.k.box(0.06, 0.45, 0.4, H.timberL, cx + Math.cos(a) * 0.2, 0.48, cz + Math.sin(a) * 0.2, { r: 0.02, ry: -a });
  }
  if (umbrella) {
    h.k.cyl(0.035, 0.035, 2.4, H.white, x, 0.74, z, 6);
    h.k.geo(new THREE.ConeGeometry(1.25, 0.5, 8, 1).translate(x, 2.9, z), umbrella, 0.04, 0);
    h.k.geo(new THREE.ConeGeometry(1.27, 0.08, 8, 1, true).translate(x, 2.66, z), mix(umbrella, '#2f2a3d', 0.15), 0.02, 0);
  }
}
/** A stack of crates of produce. */
export function crates(h: Hab, x: number, z: number, n: number, ry = 0) {
  const a = new At(x, 0, z, ry);
  const fill: Paint[] = ['#c23a3f', '#f08a46', '#7dae3f', '#fbd46e', '#a862c4'];
  for (let i = 0; i < n; i++) {
    const cx = (i % 3) * 0.62 - 0.62, cy = Math.floor(i / 3) * 0.42;
    a.box(h.k, 0.56, 0.38, 0.42, H.timberL, cx, cy, 0, 0.02, 0.06, 0.15);
    if (cy === 0 || i >= n - 3) a.box(h.leaf, 0.46, 0.1, 0.32, fill[(i + Math.floor(h.r() * 3)) % fill.length], cx, cy + 0.32, 0, 0.04, 0.2, 0);
  }
}
/** A flag that waves (a striped cloth on a pole), stripes from the top down. */
export function flag(h: Hab, x: number, z: number, ht: number, stripes: Paint[], w = 2.2, y = 0) {
  const fy = floorY(z);
  h.k.cyl(0.06, 0.08, ht, '#e6e0e3', x, y, z, 8);
  h.k.geo(new THREE.SphereGeometry(0.11, 8, 6).translate(x, y + ht + 0.05, z), H.gold, 0);
  const fh = w * 0.6;
  const geo = new THREE.PlaneGeometry(w, fh, 10, 4).translate(w / 2, 0, 0);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = 0.5 - pos.getY(i) / fh;
    const c = col(stripes[Math.min(stripes.length - 1, Math.floor(v * stripes.length * 0.9999))]);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const base = Float32Array.from(pos.array as Float32Array);
  const m = new THREE.Mesh(geo, flagMat);
  m.position.set(x + 0.06, y + fy + ht - fh / 2 - 0.1, z);
  m.castShadow = true;
  h.g.add(m);
  const ph = x * 0.7 + z;
  h.anim.add((e: Env) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3];
      p.setZ(i, Math.sin(bx * 2.4 - e.t * 2.6 + ph) * 0.12 * (bx / w));
      p.setY(i, base[i * 3 + 1] - (bx / w) * (bx / w) * 0.12);
    }
    p.needsUpdate = true;
  });
}
const flagMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));

/** Water in an outline (a pond, a pool), the surface `y` above the floor. */
export function water(h: Hab, pts: [number, number][], y: number, mat: THREE.Material = pondMat) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  // (the outline's points carry the bend: a pond is small enough for that)
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.renderOrder = 1;
  h.mesh(m);
  return m;
}
/** A smooth blob outline (for ponds), centred at (x, z), radii rx × rz. */
export function blobOutline(x: number, z: number, rx: number, rz: number, rand: () => number, n = 22) {
  const out: [number, number][] = [];
  const ph = rand() * TAU, ph2 = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + Math.sin(a * 2 + ph) * 0.12 + Math.sin(a * 3 + ph2) * 0.08;
    out.push([x + Math.cos(a) * rx * k, z + Math.sin(a) * rz * k]);
  }
  return out;
}
/** Rounded stones round an outline (a pond's edge). */
export function stoneEdge(h: Hab, pts: [number, number][], step = 0.5) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t < len; t += step) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      h.k.geo(new THREE.DodecahedronGeometry(0.28 + h.r() * 0.12, 0).scale(1.2, 0.55, 1).translate(x, 0.1, z), h.r() < 0.5 ? H.stone : H.stoneD, 0.08, 0);
    }
  }
}

/** A kerb-stone-edged lawn panel (shell grass shows through it; just its border). */
export function kerb(h: Hab, x: number, z: number, w: number, d: number, paint: Paint = H.stone) {
  for (const sz of [-1, 1]) strip(h.k, x - w / 2, z + (sz * d) / 2, x + w / 2, z + (sz * d) / 2, 0.22, paint, 0.02, 0.14);
  for (const sx of [-1, 1]) strip(h.k, x + (sx * w) / 2, z - d / 2, x + (sx * w) / 2, z + d / 2, 0.22, paint, 0.02, 0.14);
}
