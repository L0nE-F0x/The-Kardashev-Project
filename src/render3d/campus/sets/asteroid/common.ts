/**
 * Shared bits for the asteroids (Act V): rock by type (C dark carbon with bluish dust, S grey-brown
 * stone, M grey-blue nickel-iron with glints), faceted boulders and pebbles (instanced), craters
 * and dust drifts that follow the small world's curve, anchors and tethers (nothing stays put out
 * here without them), stiff flags and plates in the owner's colours, beacons that blink in any
 * colour, suited crews bounding about, and dust sprays that fly in slow ballistic arcs (no air:
 * dust, not steam).
 */
import * as THREE from 'three';
import { col, glowMat, Kit, noise, rng, type Paint } from '../../../kit';
import { plumeUniforms } from '../../../fx';
import type { Env, Piece } from '../../../pieces';
import { hasModel, loadModels, person } from '../../../models';
import { parseFlags, type YardFlags } from '../../planKit';
import { Anim, V } from '../mega/common';

export { Anim, V };
export const TAU = Math.PI * 2;
export type Rock = 'C' | 'S' | 'M';

// ── the small world ──────────────────────────────────────────────────────────────────────────
/** How fast the ground falls away from the piece's centre (the lab's asteroid curve). */
export const CURVE = 220;
/** The ground under a point of the piece. */
export const gy = (x: number, z: number) => -(x * x + z * z) / (2 * CURVE);
/** Drape a geometry over the curve (decals: craters, dust, tracks). */
export function drape(g: THREE.BufferGeometry, lift = 0.04) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + gy(p.getX(i), p.getZ(i)) + lift);
  p.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// ── rock by type ─────────────────────────────────────────────────────────────────────────────
export interface RockLook { base: string; lit: string; dark: string; dust: string; hi: string; fresh: string; tint: string }
export const ROCK: Record<Rock, RockLook> = {
  // (carbon rock is the darkest of the three, but still has to read against a black sky: it was near-black in shade)
  C: { base: '#4c4659', lit: '#5f586d', dark: '#342f40', dust: '#374262', hi: '#7e768f', fresh: '#978fa5', tint: '#3d4a6c' },
  S: { base: '#7a6a66', lit: '#8f7c76', dark: '#56484a', dust: '#a08a70', hi: '#b3a093', fresh: '#cdbdaa', tint: '#9c7c62' },
  M: { base: '#666176', lit: '#7f7a92', dark: '#45405a', dust: '#4f5d80', hi: '#b9b4c8', fresh: '#e0dce8', tint: '#566a96' },
};
export const typeOf = (variant?: string): Rock => {
  const t = (variant ?? '').split('|')[0];
  return t === 'C' || t === 'M' ? t : 'S';
};
export const flagsOf = (variant?: string): YardFlags => parseFlags((variant ?? '').split('|')[1]);

/** Faceted rock (flat shaded). */
export const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true });
/** Nickel-iron: faceted, with a dull sheen that glints. */
export const metalRockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55, flatShading: true });
/** Equipment glass (lit from inside, softly, all the time out here). */
export const portMat = glowMat('yel1', 0);
portMat.color.copy(col('#3d5f6e'));
portMat.userData.nightOnly = 1.2;
/** The smelter's port and fresh-cut molten metal. */
export const moltenMat = new THREE.MeshStandardMaterial({ color: col('#f7b258'), emissive: col('#f08a46'), emissiveIntensity: 1.6, roughness: 0.6 });
export const coldPortMat = new THREE.MeshStandardMaterial({ color: col('#64172a'), roughness: 0.8 });
export const cyanLit = new THREE.MeshStandardMaterial({ color: col('#5fd3b5'), emissive: col('#5fd3b5'), emissiveIntensity: 1.2, roughness: 0.5 });
export const cyanDark = new THREE.MeshStandardMaterial({ color: col('#156466'), roughness: 0.7 });

const shapeCache = new Map<string, THREE.BufferGeometry>();
/** A boulder (about radius 1, its bottom sunk to y ≈ −0.4), one of four shapes per type. */
export function boulderGeo(type: Rock, v: number, detail = 1) {
  const key = `${type}${v}${detail}`;
  let g = shapeCache.get(key);
  if (g) return g;
  const L = ROCK[type];
  g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const sq = [0.62, 0.75, 0.55, 0.85][v % 4];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + noise(x * 1.6 + z * 0.7 + v * 3.1, y * 1.6 + z * 0.4, 40 + v) * 0.46;
    p.setXYZ(i, x * k * (1 + (v % 2) * 0.2), y * k * sq + 0.15, z * k);
  }
  const cols = new Float32Array(p.count * 3);
  const r = rng(11 + v);
  const c = new THREE.Color();
  const ny = faceUp(p);
  for (let i = 0; i < p.count; i += 3) {
    const yc = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const n = r();
    c.copy(col(L.base)).lerp(col(n < 0.25 ? L.dark : n > 0.8 ? L.lit : L.base), 0.6);
    if (n > 0.93) c.copy(col(type === 'M' ? L.hi : L.tint));
    c.lerp(col(L.hi), Math.max(0, ny[i / 3] - 0.55) * 1.1);
    c.multiplyScalar(0.8 + Math.min(1, Math.max(0, yc + 0.3)) * 0.3);
    for (let j = 0; j < 3; j++) cols.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  shapeCache.set(key, g);
  return g;
}

/** How much each triangle of a non-indexed geometry faces up (its normal's y). */
export function faceUp(p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const out: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    out.push(b.sub(a).cross(c.sub(a)).normalize().y);
  }
  return out;
}
/** Decals (dust, tracks, crater floors): see-through, so they darken or tint whatever ground lies under them. */
export const decalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

// ── canvas text (plates, boards, flags) ──────────────────────────────────────────────────────
const texCache = new Map<string, THREE.Texture>();
export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
export const FONT = (px: number, w = 700) => `${w} ${px}px 'Atkinson Hyperlegible Next', system-ui, sans-serif`;
export const hexOf = (p: Paint) => `#${col(p).getHexString(THREE.SRGBColorSpace)}`;

// ── the builder ──────────────────────────────────────────────────────────────────────────────
export class Ast {
  readonly g = new THREE.Group();
  readonly anim = new Anim();
  readonly k: Kit;
  /** Lit ports and windows. */
  readonly port: Kit;
  readonly r: () => number;
  readonly L: RockLook;
  private rocks = new Map<number, THREE.Matrix4[]>();
  private tints = new Map<number, number[]>();
  private pebbles: THREE.Matrix4[] = [];
  private decal: Kit;
  private solid: Kit;
  constructor(seed: number, readonly type: Rock, readonly W: number, readonly D: number) {
    this.r = rng(seed * 13 + 5);
    this.k = new Kit(rng(seed + 1));
    this.port = new Kit(rng(seed + 2));
    this.decal = new Kit(rng(seed + 3));
    this.solid = new Kit(rng(seed + 4));
    this.L = ROCK[type];
  }
  /** A boulder of radius s at (x, z), sunk into the ground. */
  boulder(x: number, z: number, s: number, sink = 0.3) {
    const v = Math.floor(this.r() * 4);
    let l = this.rocks.get(v);
    if (!l) { this.rocks.set(v, (l = [])); this.tints.set(v, []); }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.r() - 0.5) * 0.5, this.r() * TAU, (this.r() - 0.5) * 0.5));
    l.push(new THREE.Matrix4().compose(V(x, gy(x, z) - s * sink, z), q, V(s, s, s)));
    this.tints.get(v)!.push(0.85 + this.r() * 0.3);
  }
  /** A boulder with its centre at a given height (a heap in a bin, a cairn). */
  boulderAt(x: number, y: number, z: number, s: number) {
    const v = Math.floor(this.r() * 4);
    let l = this.rocks.get(v);
    if (!l) { this.rocks.set(v, (l = [])); this.tints.set(v, []); }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.r() * 3, this.r() * TAU, this.r() * 3));
    l.push(new THREE.Matrix4().compose(V(x, y, z), q, V(s, s, s)));
    this.tints.get(v)!.push(0.85 + this.r() * 0.3);
  }
  /** Scatter boulders in a box (avoiding `keep` rectangles), radius from lo to hi (skewed small). */
  scatter(n: number, lo: number, hi: number, x0: number, z0: number, x1: number, z1: number, keep: [number, number, number, number][] = []) {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const x = x0 + this.r() * (x1 - x0), z = z0 + this.r() * (z1 - z0);
      if (keep.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue;
      const t = this.r();
      this.boulder(x, z, lo + (hi - lo) * t * t);
      i++;
    }
  }
  /** Pebbles and grit. */
  grit(n: number, x0: number, z0: number, x1: number, z1: number, keep: [number, number, number, number][] = []) {
    for (let i = 0; i < n; i++) {
      const x = x0 + this.r() * (x1 - x0), z = z0 + this.r() * (z1 - z0);
      if (keep.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue;
      const s = 0.05 + this.r() * this.r() * 0.2;
      this.pebbles.push(new THREE.Matrix4().compose(V(x, gy(x, z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(this.r(), this.r() * 6, this.r())), V(s, s * 0.7, s)));
    }
  }
  /** A crater: a raised rim, a darker floor, ejecta round it. */
  crater(x: number, z: number, rad: number) {
    const L = this.L;
    const floor = new THREE.CircleGeometry(rad * 0.9, 20).rotateX(-Math.PI / 2).translate(x, 0, z);
    this.decal.geo(drape(floor, 0.03), '#0b0a12', 0.03, 0);
    // an uneven rim: a raised ring, lumpy round the circle, slumped on one side
    const ph = this.r() * TAU, rh = 0.12 + rad * 0.09;
    const prof = [V(rad * 0.62, -0.05, 0), V(rad * 0.86, rh * 0.7, 0), V(rad * 1.0, rh, 0), V(rad * 1.18, rh * 0.55, 0), V(rad * 1.5, -0.04, 0)].map((v) => new THREE.Vector2(v.x, v.y));
    const rim = new THREE.LatheGeometry(prof, 30).toNonIndexed();
    const rp = rim.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const vx = rp.getX(i), vz = rp.getZ(i), a = Math.atan2(vz, vx);
      const k = 1 + 0.08 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 7 + ph * 2);
      const hk = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(a + ph)) + 0.25 * noise(a * 2, 3, 9);
      rp.setXYZ(i, x + vx * k, rp.getY(i) * hk, z + vz * k);
    }
    const rc = new Float32Array(rp.count * 3), c = new THREE.Color();
    for (let i = 0; i < rp.count; i += 3) {
      c.copy(col(L.base)).lerp(col(L.hi), 0.2 + this.r() * 0.3);
      for (let j = 0; j < 3; j++) rc.set([c.r, c.g, c.b], (i + j) * 3);
    }
    rim.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    rim.deleteAttribute('uv');
    drape(rim, 0);
    rim.computeVertexNormals();
    const rm = new THREE.Mesh(rim, rockMat);
    rm.receiveShadow = true;
    rm.castShadow = true;
    this.g.add(rm);
    for (let i = 0; i < Math.round(rad * 3); i++) {
      const a = this.r() * TAU, rr = rad * (1.15 + this.r() * 0.6);
      this.boulder(x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.12 + this.r() * 0.25 * Math.min(1.5, rad / 2));
    }
  }
  /** A drift of dust (an irregular flat patch). */
  dust(x: number, z: number, rx: number, rz: number, paint: Paint = this.L.dust) {
    const pts: THREE.Vector2[] = [];
    const ph = this.r() * TAU;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, k = 0.75 + 0.25 * Math.sin(a * 3 + ph) + this.r() * 0.15;
      pts.push(new THREE.Vector2(x + Math.cos(a) * rx * k, -(z + Math.sin(a) * rz * k)));
    }
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
    this.decal.geo(drape(g, 0.05), paint, 0.04, 0);
  }
  /** A worn track (bootprints, wheel ruts) from (x0, z0) to (x1, z1). */
  track(x0: number, z0: number, x1: number, z1: number, w = 0.9, paint: Paint = '#221e2e') {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
    // two ruts, a little wobble along them
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(len, w * 0.28, Math.max(1, Math.ceil(len / 1.2)), 1).rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + s * w * 0.36 + Math.sin(p.getX(i) * 0.4 + s) * 0.06);
      g.rotateY(ry).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      this.decal.geo(drape(g, 0.045), paint, 0.03, 0);
    }
  }
  /** An anchor bolt driven into the rock (a plate and an eye). */
  anchor(x: number, z: number) {
    const y = gy(x, z);
    this.k.cyl(0.32, 0.38, 0.14, '#5b536a', x, y - 0.02, z, 8, { shade: 0 });
    this.k.cyl(0.08, 0.08, 0.4, '#9d95a6', x, y, z, 6);
    this.k.geo(new THREE.TorusGeometry(0.14, 0.04, 4, 10).translate(x, y + 0.46, z), '#c3bcc7', 0);
    return V(x, y + 0.46, z);
  }
  /** A tether from a point on a structure down to a new anchor at (x, z): taut, nearly straight. */
  tether(from: THREE.Vector3, x: number, z: number, paint: Paint = '#e6e0e3') {
    const to = this.anchor(x, z);
    this.k.beam(from, to, 0.045, paint);
    // a tensioner partway down
    const m = from.clone().lerp(to, 0.7);
    this.k.box(0.12, 0.3, 0.12, '#fbd46e', m.x, m.y - 0.15, m.z, { r: 0, jitter: 0 });
  }
  /** A light that blinks (in any colour): the scene blinks anything with userData.beacon. */
  beacon(x: number, y: number, z: number, paint: Paint, phase = 0, s = 1) {
    const b = new THREE.Mesh(beaconGeo, glowMat(paint, 0.25).clone());
    b.position.set(x, y, z);
    b.scale.setScalar(s);
    b.userData.beacon = phase;
    this.g.add(b);
    return b;
  }
  /** A steady little light (on unless halted). */
  lamp(x: number, y: number, z: number, mat: THREE.Material, s = 0.12) {
    const m = new THREE.Mesh(lampGeo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    this.g.add(m);
    return m;
  }
  /** A plate with text (glowing letters on a panel), facing +z turned by ry. */
  plate(text: string, w: number, x: number, y: number, z: number, fg: Paint, bg: Paint, ry = 0) {
    const ph = w * 0.32;
    const tex = canvasTex(`astplate:${text}:${hexOf(fg)}:${hexOf(bg)}`, 512, 164, (g) => {
      g.fillStyle = hexOf(bg); g.fillRect(0, 0, 512, 164);
      g.strokeStyle = hexOf(fg); g.lineWidth = 8; g.strokeRect(6, 6, 500, 152);
      g.fillStyle = hexOf(fg); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = FONT(text.length > 10 ? 64 : 92); g.fillText(text, 256, 88, 470);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ph), new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.g.add(m);
    return m;
  }
  /** A stiff flag (a rod along its top edge holds it out: no air) in the owner's colours. */
  flag(x: number, z: number, h: number, accent: Paint, hi: Paint, text = '', w = 2.6) {
    const y = gy(x, z);
    this.k.cyl(0.07, 0.09, h, '#e6e0e3', x, y - 0.2, z, 8);
    this.k.geo(new THREE.CylinderGeometry(0.04, 0.04, w + 0.1, 6).rotateZ(Math.PI / 2).translate(x + w / 2, y + h - 0.25, z), '#e6e0e3', 0);
    this.k.cyl(0.3, 0.36, 0.2, '#5b536a', x, y - 0.05, z, 8, { shade: 0 });
    const fh = w * 0.62;
    const tex = canvasTex(`astflag:${hexOf(accent)}:${hexOf(hi)}:${text}`, 256, 160, (g) => {
      g.fillStyle = hexOf(accent); g.fillRect(0, 0, 256, 160);
      g.fillStyle = hexOf(hi); g.fillRect(0, 118, 256, 22); g.fillRect(0, 0, 40, 160);
      if (text) { g.fillStyle = '#fbf7f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = FONT(text.length > 6 ? 40 : 58); g.fillText(text, 148, 62, 196); }
    });
    // a frozen ripple
    const geo = new THREE.PlaneGeometry(w, fh, 8, 1).translate(w / 2, 0, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2.6) * 0.06 * (p.getX(i) / w));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
    m.position.set(x + 0.06, y + h - 0.25 - fh / 2 - 0.02, z);
    m.castShadow = true;
    this.g.add(m);
  }
  /**
   * A suited figure standing (loads the astronaut the first time). Nobody just stands on a rock this small (a
   * careless step is a launch): boots on a restraint plate bolted to the ground, a short tether from the hip to
   * an anchor beside it.
   */
  suit(x: number, z: number, ry: number) {
    const y = gy(x, z);
    this.k.box(0.78, 0.05, 0.6, '#5b536a', x, y - 0.01, z, { r: 0.02, ry });
    for (const s of [-1, 1]) this.k.box(0.07, 0.04, 0.6, '#f0a448', x + Math.cos(ry) * s * 0.36, y + 0.03, z - Math.sin(ry) * s * 0.36, { r: 0, jitter: 0, ry });
    const ax = x + Math.cos(ry) * 0.85 - Math.sin(ry) * 0.25, az = z - Math.sin(ry) * 0.85 - Math.cos(ry) * 0.25;
    const eye = this.anchor(ax, az);
    const hip = V(x, y + 0.98, z);
    hip.add(V(ax - x, 0, az - z).normalize().multiplyScalar(0.24));
    this.k.beam(hip, eye, 0.03, '#f0a448');
    const put = () => {
      const p = person('astronaut', 1.8);
      if (!p) return;
      p.walk.time = 0;
      p.mixer.update(0);
      p.walk.paused = true;
      p.obj.position.set(x, y + 0.04, z);
      p.obj.rotation.y = ry;
      this.g.add(p.obj);
    };
    if (hasModel('astronaut')) put();
    else loadModels(['astronaut']).then(put).catch(() => {});
  }
  /**
   * A suited figure going round between points. Gravity here is a few thousandths of a g, so nobody walks: a
   * guide line is strung between stanchions along the route, the figure is clipped to it by a short tether and
   * glides from one stanchion to the next just clear of the ground, legs still, leaning into the way it goes
   * (a push off, a slow drift, a catch), then turns for the next leg.
   */
  bound(pts: [number, number][], seed: number) {
    const n = pts.length, LH = 1.32, OFF = 0.6;
    // the stanchions stand off the outside of the route
    let area = 0;
    for (let i = 0; i < n; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n]; area += x0 * z1 - x1 * z0; }
    const sg = area >= 0 ? 1 : -1;
    const normal = (i: number) => { const [x0, z0] = pts[(i + n) % n], [x1, z1] = pts[(i + 1) % n]; const l = Math.hypot(x1 - x0, z1 - z0) || 1; return [(sg * (z1 - z0)) / l, (-sg * (x1 - x0)) / l]; };
    const tops = pts.map(([x, z], i) => {
      const [ax, az] = normal(i - 1), [bx, bz] = normal(i);
      let nx = ax + bx, nz = az + bz;
      const l = Math.hypot(nx, nz);
      if (n < 3 || l < 0.2) { [nx, nz] = normal(0); } else { nx /= l; nz /= l; }
      const reach = n < 3 ? OFF : OFF / Math.max(0.55, nx * bx + nz * bz);
      const px = x + nx * reach, pz = z + nz * reach, py = gy(px, pz);
      this.k.cyl(0.2, 0.24, 0.08, '#5b536a', px, py - 0.02, pz, 8, { shade: 0 });
      this.k.cyl(0.045, 0.055, LH, '#9d95a6', px, py, pz, 6);
      this.k.cyl(0.07, 0.07, 0.16, '#f0a448', px, py + LH - 0.34, pz, 6, { shade: 0 });
      this.k.geo(new THREE.TorusGeometry(0.09, 0.03, 4, 8).translate(px, py + LH + 0.06, pz), '#c3bcc7', 0);
      return V(px, py + LH, pz);
    });
    const legs = n < 3 ? 1 : n;
    for (let i = 0; i < legs; i++) this.k.beam(tops[i], tops[(i + 1) % n], 0.03, '#f0a448');
    const put = () => {
      const p = person('astronaut', 1.8);
      if (!p) return;
      this.g.add(p.obj);
      p.walk.time = 0;
      p.mixer.update(0);
      p.walk.paused = true;
      p.obj.rotation.order = 'YXZ';
      const tether = new THREE.Mesh(tetherGeo, tetherMat);
      tether.castShadow = false;
      this.g.add(tether);
      const HOVER = 0.12;
      const path = pts.map(([x, z]) => V(x, gy(x, z) + HOVER, z));
      const yawOf = (i: number) => { const a = path[i], b = path[(i + 1) % n]; return Math.atan2(b.x - a.x, b.z - a.z); };
      let i = 0, t = 0, wait = 1 + (seed % 3), yaw = yawOf(0);
      p.obj.position.copy(path[0]);
      p.obj.rotation.y = yaw;
      const hip = V(0, 0, 0), on = V(0, 0, 0), seg = V(0, 0, 0), up = V(0, 1, 0);
      const clip = () => {
        // the tether: from the hip to the nearest point of this leg's line
        hip.copy(p.obj.position);
        hip.y += 1.0;
        const A = tops[n < 3 ? 0 : i], B = tops[n < 3 ? 1 : (i + 1) % n];
        seg.copy(B).sub(A);
        const u = Math.min(1, Math.max(0, on.copy(hip).sub(A).dot(seg) / seg.lengthSq()));
        on.copy(A).addScaledVector(seg, u);
        seg.copy(on).sub(hip);
        const len = seg.length() || 1;
        tether.position.copy(hip).addScaledVector(seg, 0.5);
        tether.scale.set(1, len, 1);
        tether.quaternion.setFromUnitVectors(up, seg.divideScalar(len));
      };
      clip();
      this.anim.add((e) => {
        if (wait > 0) {
          // holding the stanchion: turn slowly to face the next leg
          wait -= e.dt;
          const want = yawOf(i);
          let d = want - yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          yaw += d * Math.min(1, e.dt * 1.6);
          p.obj.rotation.set(0, yaw, 0);
          p.obj.position.copy(path[i]);
          clip();
          return;
        }
        const a = path[i], b = path[(i + 1) % n];
        const len = a.distanceTo(b) || 1;
        t += (e.dt * 0.55) / len;
        if (t >= 1) { t = 0; i = (i + 1) % n; wait = 3 + ((seed + i) % 4); p.obj.position.copy(path[i]); p.obj.rotation.x = 0; clip(); return; }
        // the push, the drift, the catch: fastest in the middle, a shallow arc, leaning into it
        const s = t * t * (3 - 2 * t), mid = Math.sin(t * Math.PI);
        p.obj.position.lerpVectors(a, b, s);
        p.obj.position.y += mid * Math.min(0.3, len * 0.04);
        yaw = yawOf(i);
        p.obj.rotation.set(mid * 0.4, yaw, 0);
        clip();
      });
    };
    if (hasModel('astronaut')) put();
    else loadModels(['astronaut']).then(put).catch(() => {});
  }

  finish(h: number, extra: Partial<Piece> = {}): Piece {
    const metal = this.type === 'M';
    for (const [v, at] of this.rocks) {
      const im = new THREE.InstancedMesh(boulderGeo(this.type, v), metal && v === 2 ? metalRockMat : rockMat, at.length);
      const c = new THREE.Color();
      at.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setScalar(this.tints.get(v)![i])); });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.g.add(im);
    }
    if (this.pebbles.length) {
      const im = new THREE.InstancedMesh(boulderGeo(this.type, 1, 0), metal ? metalRockMat : rockMat, this.pebbles.length);
      this.pebbles.forEach((m, i) => im.setMatrixAt(i, m));
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.g.add(im);
    }
    if (!this.decal.empty) {
      const m = this.decal.build(decalMat);
      m.castShadow = false;
      m.renderOrder = 1;
      this.g.add(m);
    }
    if (!this.solid.empty) this.g.add(this.solid.build(rockMat));
    if (!this.k.empty) this.g.add(this.k.build());
    if (!this.port.empty) {
      const m = this.port.build(portMat);
      m.castShadow = false;
      this.g.add(m);
    }
    return { obj: this.g, w: this.W, d: this.D, h, update: this.anim.update, ...extra };
  }
}
const tetherGeo = new THREE.BoxGeometry(0.03, 1, 0.03);
tetherGeo.userData.shared = true;
const tetherMat = new THREE.MeshStandardMaterial({ color: col('#f0a448'), roughness: 0.8 });
tetherMat.userData.shared = true;
const beaconGeo = new THREE.SphereGeometry(0.22, 8, 6);
beaconGeo.userData.shared = true;
const lampGeo = new THREE.SphereGeometry(1, 8, 6);
lampGeo.userData.shared = true;

// ── dust in slow arcs ────────────────────────────────────────────────────────────────────────
let puffTex: THREE.Texture | null = null;
function puff() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}
export interface SprayOpts {
  count?: number;
  /** Seconds a grain lives. */
  life?: number;
  /** Launch direction (normalised) and the cone's spread (radians). */
  dir?: THREE.Vector3;
  spread?: number;
  /** Launch speed range. */
  speed?: [number, number];
  /** Gravity (units/s², tiny out here). */
  g?: number;
  size?: [number, number];
  color?: Paint;
  opacity?: number;
  /** Sparks: additive and bright. */
  additive?: boolean;
  /** The ground the grains settle on (piece coordinates, relative to the spray's origin). */
  floor?: number;
}
/**
 * Grains thrown out of a cutting face: each flies in a straight-ish ballistic arc (low gravity, no
 * air), spreads and fades. `strength` 0..1 thins it (0 = stopped).
 */
export class Spray {
  readonly obj: THREE.Points;
  strength = 1;
  private o: Required<SprayOpts>;
  private age: Float32Array;
  private vel: Float32Array;
  private r: () => number;
  constructor(opts: SprayOpts = {}, seed = 1) {
    this.o = { count: 60, life: 5, dir: V(1, 0.6, 0.2).normalize(), spread: 0.6, speed: [1.2, 3.2], g: 0.35, size: [0.25, 0.9], color: '#9d95a6', opacity: 0.7, additive: false, floor: -99, ...opts };
    const n = this.o.count;
    this.r = rng(seed);
    this.age = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.age[i] = (i / n) * this.o.life; this.launch(i); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('extra', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: this.o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: puff() }, color: { value: col(this.o.color).clone() }, opacity: { value: this.o.opacity }, scale: plumeUniforms.scale },
      vertexShader: `attribute vec2 extra; varying float vA; uniform float scale;
        void main(){ vA = extra.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = extra.x * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * opacity * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.obj = new THREE.Points(g, mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }
  private launch(i: number) {
    const o = this.o, d = o.dir;
    // a random direction in the cone round d
    const a = this.r() * TAU, s = Math.sqrt(this.r()) * o.spread;
    const side = Math.abs(d.y) < 0.9 ? V(0, 1, 0).cross(d).normalize() : V(1, 0, 0);
    const up = d.clone().cross(side).normalize();
    const v = d.clone().addScaledVector(side, Math.cos(a) * Math.tan(s)).addScaledVector(up, Math.sin(a) * Math.tan(s)).normalize();
    const sp = o.speed[0] + this.r() * (o.speed[1] - o.speed[0]);
    this.vel.set([v.x * sp, v.y * sp, v.z * sp], i * 3);
  }
  update(e: Env) {
    const o = this.o;
    const pos = this.obj.geometry.attributes.position as THREE.BufferAttribute;
    const ex = this.obj.geometry.attributes.extra as THREE.BufferAttribute;
    for (let i = 0; i < o.count; i++) {
      this.age[i] += e.dt;
      if (this.age[i] > o.life) {
        this.age[i] -= o.life;
        this.launch(i);
      }
      const t = this.age[i];
      const vx = this.vel[i * 3], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
      const y = Math.max(o.floor, vy * t - 0.5 * o.g * t * t);
      pos.setXYZ(i, vx * t, y, vz * t);
      const k = t / o.life;
      ex.setXY(i, o.size[0] + (o.size[1] - o.size[0]) * k, Math.min(1, k * 8) * (1 - k) * this.strength);
    }
    pos.needsUpdate = true;
    ex.needsUpdate = true;
  }
}

/** A short truss beam (two chords and lacing) between two points, for masts and booms. */
export function truss(k: Kit, a: THREE.Vector3, b: THREE.Vector3, w: number, paint: Paint, lace: Paint = paint, t = 0.09) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const side = (Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).cross(dir).normalize().multiplyScalar(w / 2);
  const a1 = a.clone().add(side), a2 = a.clone().sub(side), b1 = b.clone().add(side), b2 = b.clone().sub(side);
  k.beam(a1, b1, t, paint);
  k.beam(a2, b2, t, paint);
  const n = Math.max(2, Math.round(len / (w * 1.2)));
  for (let i = 0; i < n; i++) {
    const p = a1.clone().lerp(b1, i / n), q = a2.clone().lerp(b2, (i + 1) / n);
    k.beam(p, q, t * 0.6, lace);
  }
}
