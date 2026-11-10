/**
 * Shared bits for the Charter's Geneva campus (and the Charter's marks elsewhere): the twelve bloc
 * banners and the Charter flag waving on their poles, the emblem (a white planet in a gold orbit on
 * a blue disc), glass that lights up at night, signs that glow after dark, and people.
 */
import * as THREE from 'three';
import { glowMat, Kit, rng, withClouds, type Paint } from '../../../kit';
import { sign } from '../../../fx';
import type { Env } from '../../../pieces';
import { Crowd } from '../../life';
import { KEYS, PALETTE } from '../../../../render/palette';
import { BLOC_BANNERS, BLOC_ORDER, blocBannerAt } from '../../planKit';
import type { PersonName } from '../../../models';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hexOf = (idx: number) => PALETTE[KEYS[idx - 1]] ?? '#ffffff';

/** The Charter's colours. */
export const CH = { field: PALETTE.blu3, dark: PALETTE.blu2, ring: PALETTE.yel0, ringDark: PALETTE.org1, planet: PALETTE.white };

// ── banners ──────────────────────────────────────────────────────────────────────────────────
const BW = 64, BH = 40, COLS = 4, ROWS = 4;
/** Atlas cell of the Charter's own flag (the blocs are 0..11 in BLOC_ORDER). */
export const CHARTER_FLAG = 12;

function drawEmblem(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  // orbit behind, planet, orbit in front
  const ring = (front: boolean) => {
    g.beginPath();
    g.ellipse(cx, cy, s * 1.0, s * 0.36, -0.32, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.strokeStyle = front ? CH.ring : CH.ringDark;
    g.lineWidth = s * 0.16;
    g.stroke();
  };
  ring(false);
  g.beginPath();
  g.arc(cx, cy, s * 0.46, 0, Math.PI * 2);
  const grd = g.createLinearGradient(cx - s * 0.4, cy - s * 0.4, cx + s * 0.4, cy + s * 0.4);
  grd.addColorStop(0, PALETTE.white);
  grd.addColorStop(1, PALETTE.ice1);
  g.fillStyle = grd;
  g.fill();
  ring(true);
}

let atlas: THREE.CanvasTexture | null = null;
/** The twelve bloc banners (BLOC_ORDER) and the Charter flag, 64×40 each, in one texture. */
function bannerAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = BW * COLS;
  c.height = BH * ROWS;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  BLOC_ORDER.forEach((id, n) => {
    const f = BLOC_BANNERS[id];
    const ox = (n % COLS) * BW, oy = Math.floor(n / COLS) * BH;
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < BW; x++) {
        const i = (x + 0.5) / 8, j = (y + 0.5) / 8;
        // the swallowtail cut out of the fly
        if (i > 6 && Math.abs(j - 2.5) < (i - 6) * 0.75) continue;
        let a: boolean;
        switch (f.field) {
          case 'h2': a = j < 3; break;
          case 'v2': a = i < 4; break;
          case 'd2': a = i + j * 1.6 < 7.4; break;
          case 'wave': a = j < 2.5 + Math.sin(i * 1.3) * 0.55; break;
          case 'band': a = !(j >= 2 && j < 3); break;
          case 'chevron': a = !(i < 3 - Math.abs(j - 2.5)); break;
          case 'hoist': a = !(i < 2); break;
        }
        let hex = hexOf(a ? f.a : f.b);
        // the emblem: the pixel banner's own mark, cell by cell
        const m = blocBannerAt(id, Math.floor(i), Math.floor(j));
        if (m && m !== f.a && m !== f.b) hex = hexOf(m);
        const k = ((oy + y) * c.width + ox + x) * 4;
        img.data[k] = parseInt(hex.slice(1, 3), 16);
        img.data[k + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[k + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[k + 3] = 255;
      }
  });
  g.putImageData(img, 0, 0);
  // the Charter flag: blue, with the emblem
  const ox = (CHARTER_FLAG % COLS) * BW, oy = Math.floor(CHARTER_FLAG / COLS) * BH;
  g.fillStyle = CH.field;
  g.fillRect(ox, oy, BW, BH);
  drawEmblem(g, ox + BW / 2, oy + BH / 2, 15);
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

export interface FlagSpec {
  /** Top of the pole (the flag hangs from here). */
  x: number;
  y: number;
  z: number;
  /** Banner index: 0..11 = BLOC_ORDER, CHARTER_FLAG = the Charter. */
  banner: number;
  w?: number;
  h?: number;
  /** Direction the fly points (0 = +x, the wind's way). */
  ry?: number;
}

/**
 * Flags on a breeze: one mesh for all of them, the cloth rippling from hoist to fly. Poles are
 * the caller's (see `flagPole`).
 */
export class Flags {
  readonly mesh: THREE.Mesh;
  private lx: Float32Array;
  private ly: Float32Array;
  private fi: Uint16Array;
  private specs: Required<FlagSpec>[];
  private mat: THREE.MeshStandardMaterial;
  constructor(specs: FlagSpec[]) {
    this.specs = specs.map((s) => ({ w: 2.4, h: 1.5, ry: 0, ...s }));
    const parts: THREE.BufferGeometry[] = [];
    const lx: number[] = [], ly: number[] = [], fi: number[] = [];
    this.specs.forEach((s, n) => {
      const g = new THREE.PlaneGeometry(s.w, s.h, 10, 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const cx = s.banner % COLS, cy = Math.floor(s.banner / COLS);
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (cx + uv.getX(i)) / COLS, 1 - (cy + 1 - uv.getY(i)) / ROWS);
        lx.push(pos.getX(i) + s.w / 2);
        ly.push(pos.getY(i) - s.h / 2);
        fi.push(n);
      }
      parts.push(g);
    });
    const merged = mergeIndexed(parts);
    this.lx = new Float32Array(lx);
    this.ly = new Float32Array(ly);
    this.fi = new Uint16Array(fi);
    const tex = bannerAtlas();
    this.mat = withClouds(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 0.85, alphaTest: 0.5 }));
    this.mesh = new THREE.Mesh(merged, this.mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.update({ t: 0, dt: 0, night: 0 });
  }
  update(e: Env) {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = this.specs[this.fi[i]];
      const x = this.lx[i], y = this.ly[i];
      const u = x / s.w;
      const ph = this.fi[i] * 1.7;
      const wave = Math.sin(e.t * 4.2 - x * 2.1 + ph) * 0.22 * u + Math.sin(e.t * 2.3 - x * 1.2 + ph * 0.6) * 0.1 * u;
      const droop = u * u * 0.12 * (1 + Math.sin(e.t * 0.7 + ph) * 0.5);
      const lxw = x * (1 - 0.04 * u), lyw = y - droop, lzw = wave;
      const c = Math.cos(s.ry), sn = Math.sin(s.ry);
      pos.setXYZ(i, s.x + lxw * c + lzw * sn, s.y + lyw, s.z - lxw * sn + lzw * c);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mat.emissiveIntensity = e.night * 0.28;
  }
}

function mergeIndexed(parts: THREE.BufferGeometry[]) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.attributes.position.count; ni += p.index!.count; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, ov * 3);
    uv.set(p.attributes.uv.array as Float32Array, ov * 2);
    const ix = p.index!.array;
    for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += p.attributes.position.count;
    oi += ix.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** A flagpole with a gold finial, base at (x, y0, z), `h` tall. */
export function flagPole(k: Kit, x: number, y0: number, z: number, h: number) {
  k.cyl(0.07, 0.1, h, '#e6e0e3', x, y0, z, 8, { shade: 0.1 });
  k.cyl(0.22, 0.26, 0.2, '#9d95a6', x, y0, z, 10);
  k.geo(new THREE.SphereGeometry(0.13, 8, 6).translate(x, y0 + h + 0.08, z), 'yel0', 0.02);
}

// ── the emblem ───────────────────────────────────────────────────────────────────────────────
let emblemTex: THREE.CanvasTexture | null = null;
function emblemTexture() {
  if (emblemTex) return emblemTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fillStyle = CH.dark;
  g.fill();
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fillStyle = CH.field;
  g.fill();
  drawEmblem(g, 64, 64, 40);
  emblemTex = new THREE.CanvasTexture(c);
  emblemTex.colorSpace = THREE.SRGBColorSpace;
  emblemTex.anisotropy = 4;
  return emblemTex;
}

/** The Charter's emblem as a disc `d` across, facing +z; glows softly at night (k). */
export function emblemDisc(d: number, k = 0.5) {
  const m = glowMat('#ffffff', 0);
  m.userData.nightOnly = k;
  m.map = m.emissiveMap = emblemTexture();
  m.alphaTest = 0.5;
  m.roughness = 0.6;
  return new THREE.Mesh(new THREE.CircleGeometry(d / 2, 32), m);
}

// ── night light ──────────────────────────────────────────────────────────────────────────────
/** Glass that is `glass` by day and glows `glow` at night (vertex colours tint it). */
export function litGlass(glow: Paint, k = 1.2) {
  const m = glowMat(glow, 0);
  m.userData.nightOnly = k;
  m.color.set('#ffffff');
  m.vertexColors = true;
  m.roughness = 0.32;
  m.metalness = 0.12;
  return m;
}
/** Glass that stays dark (unlit bays, the sky in it). */
export const glassMat = withClouds(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.18 }));

/** A sign (see fx.sign) that glows after dark. */
export function litSign(text: string, w: number, fg: Paint, bg: Paint | null = null, k = 0.9) {
  const s = sign(text, w, fg, bg);
  const old = s.material as THREE.MeshStandardMaterial;
  const m = glowMat('#ffffff', 0);
  m.userData.nightOnly = k;
  m.map = m.emissiveMap = old.map;
  m.transparent = !bg;
  m.roughness = 0.7;
  old.dispose();
  s.material = m;
  return s;
}

/** A warm lamp head (glows at night). */
export function lampMat(c: Paint = 'yel1', k = 3) {
  const m = glowMat(c, 0);
  m.userData.glowBase = 0;
  m.userData.nightOnly = k;
  return m;
}

// ── people ───────────────────────────────────────────────────────────────────────────────────
/**
 * People for a set piece: walkers on loops and people standing about (facing `ry`). Feet at the
 * height `y` gives (a number or a function of x, z).
 */
export class People {
  readonly crowd = new Crowd();
  get group() { return this.crowd.group; }
  constructor(private y: number | ((x: number, z: number) => number) = 0) {}
  private h = (x: number, z: number) => (typeof this.y === 'number' ? this.y : this.y(x, z));
  walk(pts: [number, number][], kind: PersonName | null = null, speed?: number) {
    return this.crowd.add(kind, pts, this.h, { speed, pause: [0.5, 5] });
  }
  stand(x: number, z: number, ry: number, kind: PersonName | null = null, height?: number) {
    const w = this.crowd.add(kind, [[x, z]], this.h, { height });
    w.obj.rotation.y = ry;
    if (w.walk) { w.walk.time = 0; w.walk.paused = true; }
    return w;
  }
  update(e: Env) { this.crowd.update(e); }
}

// ── stone and greenery ───────────────────────────────────────────────────────────────────────
/** Light-stone paving: a slab with a joint grid (thin darker strips). */
export function paving(k: Kit, x0: number, z0: number, x1: number, z1: number, y = 0, step = 2.4, stone: Paint = '#ddd5c8', joint: Paint = '#bdb3a6') {
  const w = x1 - x0, d = z1 - z0;
  k.box(w, 0.2, d, stone, (x0 + x1) / 2, y, (z0 + z1) / 2, { r: 0.05, jitter: 0.015, shade: 0 });
  for (let x = x0 + step; x < x1 - 0.3; x += step) k.box(0.07, 0.012, d - 0.2, joint, x, y + 0.2, (z0 + z1) / 2, { r: 0, jitter: 0, shade: 0 });
  for (let z = z0 + step; z < z1 - 0.3; z += step) k.box(w - 0.2, 0.012, 0.07, joint, (x0 + x1) / 2, y + 0.2, z, { r: 0, jitter: 0, shade: 0 });
}

/** Leafy clumps (planters, balconies, roof gardens): faceted blobs. */
export function greenery(k: Kit, x: number, y: number, z: number, s: number, seed: number, flowers = false) {
  const r = rng(seed);
  const greens: Paint[] = ['#3f7b35', '#4a8a3a', '#5a9537', '#367030'];
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(s * (0.55 + r() * 0.35), 0).scale(1, 0.8, 1).translate(x + (r() - 0.5) * s * 1.2, y + s * 0.35, z + (r() - 0.5) * s * 0.6);
    k.geo(g, greens[Math.floor(r() * greens.length)], 0.15);
  }
  if (flowers && r() < 0.7) k.geo(new THREE.IcosahedronGeometry(s * 0.22, 0).translate(x + (r() - 0.5) * s, y + s * 0.7, z + s * 0.25), r() < 0.5 ? 'pnk1' : 'yel1', 0.1);
}

/** A round planter with a small tree in it (base at y). */
export function plantedTree(k: Kit, x: number, y: number, z: number, s: number, seed: number) {
  const r = rng(seed);
  k.cyl(s * 0.9, s * 0.8, s * 0.55, '#bdb3a6', x, y, z, 14, { shade: 0.15 });
  k.cyl(s * 0.8, s * 0.8, 0.06, '#5f3b28', x, y + s * 0.5, z, 14);
  k.cyl(s * 0.08, s * 0.12, s * 1.4, '#5c3a26', x, y + s * 0.5, z, 6);
  const greens: Paint[] = ['#3f7b35', '#4a8a3a', '#367030', '#5a9537'];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(s * (0.55 + r() * 0.25), 1).translate(x + (r() - 0.5) * s * 0.8, y + s * (1.9 + r() * 0.5), z + (r() - 0.5) * s * 0.8);
    k.geo(g, greens[i % greens.length], 0.16);
  }
}

/** A timber park bench facing +z rotated by ry, at (x, y, z). */
export function bench(k: Kit, x: number, y: number, z: number, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const lx of [-0.75, 0.75]) {
    const [px, pz] = at(lx, 0);
    k.box(0.1, 0.42, 0.5, '#433c52', px, y, pz, { r: 0, jitter: 0, ry });
  }
  const [sx, sz] = at(0, 0);
  k.box(1.8, 0.07, 0.5, '#9c6c3d', sx, y + 0.42, sz, { r: 0.02, ry });
  const [bx, bz] = at(0, -0.24);
  k.box(1.8, 0.4, 0.06, '#9c6c3d', bx, y + 0.5, bz, { r: 0.02, ry });
}

const SHIRTS: Paint[] = ['cyn3', 'org1', 'blu4', 'red3', 'yel0', '#e9e1d2', 'vio3', 'grn5', 'pnk0'];
const SKIN: Paint[] = ['skn2', 'skn3', 'skn4', 'skn5'];
/** Someone sitting (on a bench or a café chair, seat at y), facing +z turned by ry. */
export function sitter(k: Kit, x: number, y: number, z: number, ry: number, seed: number, floor = 0) {
  const r = rng(seed);
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
  const legs: Paint = (['#3b4a6e', '#4e4148', '#7d5232', '#2f2a3d'] as Paint[])[Math.floor(r() * 4)];
  let [px, pz] = at(0, 0.16);
  k.box(0.4, 0.17, 0.46, legs, px, y, pz, { r: 0.05, ry });
  [px, pz] = at(0, 0.4);
  k.box(0.38, y - floor - 0.02, 0.17, legs, px, floor + 0.02, pz, { r: 0.04, ry });
  [px, pz] = at(0, -0.06);
  k.box(0.46, 0.58, 0.28, shirt, px, y + 0.12, pz, { r: 0.09, ry });
  k.geo(new THREE.SphereGeometry(0.17, 10, 8).translate(px, y + 0.88, pz), SKIN[Math.floor(r() * SKIN.length)], 0.02);
  if (r() < 0.55) k.geo(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(px, y + 0.92, pz - 0.02), (['snd1', 'ink2', 'snd4', 'org0'] as Paint[])[Math.floor(r() * 4)], 0);
}
