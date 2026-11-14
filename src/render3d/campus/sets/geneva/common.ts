/**
 * Shared bits for the Charter's Geneva campus (and the Charter's marks elsewhere): the twelve bloc
 * banners and the Charter flag waving on their poles, the emblem (a white planet in a gold orbit on
 * a blue disc), glass that lights up at night, signs that glow after dark, and people.
 */
import * as THREE from 'three';
import { plantOn } from '../../trees';
import { glowMat, Kit, rng, withClouds, type Paint } from '../../../kit';
import { sign } from '../../../fx';
import type { Env } from '../../../pieces';
import { Crowd } from '../../life';
import { KEYS, PALETTE } from '../../../../render/palette';
import { BLOC_BANNERS, BLOC_ORDER, markSize, type BannerMark } from '../../planKit';
import type { PersonName } from '../../../models';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hexOf = (idx: number) => PALETTE[KEYS[idx - 1]] ?? '#ffffff';

/** The Charter's colours. */
export const CH = { field: PALETTE.blu3, dark: PALETTE.blu2, ring: PALETTE.yel0, ringDark: PALETTE.org1, planet: PALETTE.white };

// ── banners ──────────────────────────────────────────────────────────────────────────────────
/** One banner in the atlas: an 8×5 design grid of `U` pixels a cell. */
const U = 32, BW = 8 * U, BH = 5 * U, COLS = 4, ROWS = 4;
/** The swallowtail: how far in from the fly the notch reaches, and the part of the height it opens over (both 0..1). */
const TAIL = { in: 0.25, open: 0.6 };
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

/**
 * The blocs' emblems as heraldic devices, each drawn in its own box on the design grid (origin at the box's top
 * left, one cell = 1): plain shapes with smooth edges that still read at a flag's size from across the plaza.
 */
const MARK_ART: Record<BannerMark, (g: CanvasRenderingContext2D, w: number, h: number) => void> = {
  // a column: shaft, base and capital
  pillar: (g, w, h) => {
    g.fillRect(w / 2 - 0.3, 0.3, 0.6, h - 0.6);
    for (const y of [0, h - 0.34]) { g.beginPath(); g.roundRect(w / 2 - 0.75, y, 1.5, 0.34, 0.1); g.fill(); }
  },
  ring: (g, w, h) => { g.lineWidth = 0.5; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 2 - 0.3, 0, Math.PI * 2); g.stroke(); },
  // a white world over the arc of its path
  orbit: (g, w, h) => {
    g.lineWidth = 0.34; g.lineCap = 'round';
    g.beginPath(); g.ellipse(w / 2, h * 0.42, w / 2 - 0.2, h * 0.5, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
    g.fillStyle = PALETTE.white;
    g.beginPath(); g.arc(w / 2, h * 0.34, 0.5, 0, Math.PI * 2); g.fill();
  },
  // three bars stepping down from the hoist
  step: (g, _w, h) => { for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect(i * 1.08, i * (h / 3), 0.84, h - i * (h / 3), [0.26, 0.26, 0, 0]); g.fill(); } },
  wave: (g, w, h) => {
    g.lineWidth = 0.4; g.lineCap = 'round';
    for (const y of [h * 0.28, h * 0.78]) {
      g.beginPath();
      for (let x = 0.2; x <= w - 0.19; x += 0.1) g.lineTo(x, y + Math.sin((x - 0.2) * ((Math.PI * 4) / (w - 0.4))) * 0.3);
      g.stroke();
    }
  },
  chevron: (g, w, h) => { g.lineWidth = 0.62; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(0.35, 0.2); g.lineTo(w - 0.75, h / 2); g.lineTo(0.35, h - 0.2); g.stroke(); },
  peak: (g, w, h) => { g.beginPath(); g.moveTo(0, h); g.lineTo(w / 2, 0.05); g.lineTo(w, h); g.closePath(); g.fill(); },
  pair: (g, w, h) => { for (const x of [0.55, w - 0.55]) { g.beginPath(); g.arc(x, h / 2, 0.55, 0, Math.PI * 2); g.fill(); } },
  diamond: (g, w, h) => { g.lineWidth = 0.44; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(w / 2, 0.3); g.lineTo(w - 0.35, h / 2); g.lineTo(w / 2, h - 0.3); g.lineTo(0.35, h / 2); g.closePath(); g.stroke(); },
  arch: (g, w, h) => { g.lineWidth = 0.56; g.lineCap = 'butt'; g.beginPath(); g.moveTo(0.4, h); g.lineTo(0.4, h * 0.62); g.arc(w / 2, h * 0.62, w / 2 - 0.4, Math.PI, 0); g.lineTo(w - 0.4, h); g.stroke(); },
  // a leaf from the foot of the hoist up towards the fly
  leaf: (g, w, h) => { g.beginPath(); g.moveTo(0.1, h - 0.1); g.quadraticCurveTo(0.2, 0.3, w - 0.1, 0.1); g.quadraticCurveTo(w - 0.3, h - 0.2, 0.1, h - 0.1); g.fill(); },
  dot: (g, w, h) => { g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 2 - 0.08, 0, Math.PI * 2); g.fill(); },
};

let atlas: THREE.CanvasTexture | null = null;
/**
 * The twelve bloc banners (BLOC_ORDER) and the Charter flag in one texture, drawn as shapes (smooth at any
 * distance: they were 8-pixel blocks). The cloth's swallowtail is cut in the mesh, not in the picture.
 */
function bannerAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = BW * COLS;
  c.height = BH * ROWS;
  const g = c.getContext('2d')!;
  BLOC_ORDER.forEach((id, n) => {
    const f = BLOC_BANNERS[id];
    g.save();
    g.translate((n % COLS) * BW, Math.floor(n / COLS) * BH);
    g.beginPath();
    g.rect(0, 0, BW, BH);
    g.clip();
    g.scale(U, U);
    g.fillStyle = hexOf(f.a);
    g.fillRect(0, 0, 8, 5);
    // the second colour's share of the field
    g.fillStyle = hexOf(f.b);
    g.beginPath();
    switch (f.field) {
      case 'h2': g.rect(0, 3, 8, 2); break;
      case 'v2': g.rect(4, 0, 4, 5); break;
      case 'd2': g.moveTo(7.4, 0); g.lineTo(8, 0); g.lineTo(8, 5); g.lineTo(-0.6, 5); break;
      case 'wave':
        g.moveTo(0, 5);
        for (let x = 0; x <= 8.01; x += 0.125) g.lineTo(x, 2.5 + Math.sin(x * 1.3) * 0.55);
        g.lineTo(8, 5);
        break;
      case 'band': g.rect(0, 2, 8, 1); break;
      case 'chevron': g.moveTo(0, 0); g.lineTo(0.5, 0); g.lineTo(3, 2.5); g.lineTo(0.5, 5); g.lineTo(0, 5); break;
      case 'hoist': g.rect(0, 0, 2, 5); break;
    }
    g.fill();
    // the emblem
    const [mw, mh] = markSize(f.mark);
    g.translate(f.at[0], f.at[1]);
    g.fillStyle = g.strokeStyle = hexOf(f.m);
    MARK_ART[f.mark](g, mw, mh);
    g.restore();
  });
  // the Charter flag: blue, with the emblem
  const ox = (CHARTER_FLAG % COLS) * BW, oy = Math.floor(CHARTER_FLAG / COLS) * BH;
  g.fillStyle = CH.field;
  g.fillRect(ox, oy, BW, BH);
  drawEmblem(g, ox + BW / 2, oy + BH / 2, BH * 0.375);
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
      const g = new THREE.PlaneGeometry(s.w, s.h, 10, 4);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const cx = s.banner % COLS, cy = Math.floor(s.banner / COLS);
      const tailed = s.banner !== CHARTER_FLAG;
      for (let i = 0; i < uv.count; i++) {
        let u = uv.getX(i), v = uv.getY(i);
        if (tailed) {
          // a bloc's banner is swallow-tailed: the rows move to the notch's corners, and the middle of the fly is
          // drawn in to its point
          if (Math.abs(v - 0.25) < 0.01 || Math.abs(v - 0.75) < 0.01) v = 0.5 + Math.sign(v - 0.5) * (TAIL.open / 2);
          if (u > 0.5 && Math.abs(v - 0.5) < 0.01) u = 0.5 + (u - 0.5) * (1 - 2 * TAIL.in);
          pos.setXY(i, (u - 0.5) * s.w, (v - 0.5) * s.h);
        }
        // (a hair inside the cell, so a neighbour's colour never shows along an edge from far off)
        u = 0.004 + u * 0.992; v = 0.006 + v * 0.988;
        uv.setXY(i, (cx + u) / COLS, 1 - (cy + 1 - v) / ROWS);
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
    this.mat = withClouds(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 0.85 }));
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
  // a leafy clump (the shared plants: trees.ts), a bloom or two on top
  plantOn(k, 'shrub', { x, y: y - 0.02, z, s: s * (0.95 + r() * 0.3), ry: r() * 6.3, tint: 0.92 + r() * 0.16 }, false);
  if (flowers && r() < 0.7) k.geo(new THREE.IcosahedronGeometry(s * 0.2, 0).translate(x + (r() - 0.5) * s * 0.8, y + s * 0.78, z + s * 0.2), r() < 0.5 ? 'pnk1' : 'yel1', 0.1);
}

/** A round planter with a small tree in it (base at y). */
export function plantedTree(k: Kit, x: number, y: number, z: number, s: number, seed: number) {
  const r = rng(seed);
  k.cyl(s * 0.9, s * 0.8, s * 0.55, '#bdb3a6', x, y, z, 14, { shade: 0.15 });
  k.cyl(s * 0.8, s * 0.8, 0.06, '#5f3b28', x, y + s * 0.5, z, 14);
  plantOn(k, 'blob', { x, y: y + s * 0.52, z, s: s * 0.9, ry: r() * 6.3, tint: 0.94 + r() * 0.12 });
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
/**
 * Someone sitting (on a bench or a café chair, seat at y), facing +z turned by ry: two legs with
 * shoes on the ground, a torso with shoulders, arms down to hands resting on the thighs, a head
 * with hair. Built into the piece's own mesh, in the proportions of the rigged walkers beside them
 * (a block with a ball on it read as a placeholder next to those).
 */
const HAIR: Paint[] = ['snd1', 'ink2', 'snd4', 'org0', '#5c3a26', '#2f2a3d', '#c9c2c4', '#8c4a3a'];
const TROUSERS: Paint[] = ['#3b4a6e', '#4e4148', '#7d5232', '#2f2a3d', '#6a6f7a', '#8a7a5c'];
export function sitter(k: Kit, x: number, y: number, z: number, ry: number, seed: number, floor = 0) {
  // (neighbouring seeds give neighbouring first draws: every sitter wore the same yellow shirt. Scramble the seed.)
  const r = rng(Math.floor(Math.abs(Math.sin(seed * 12.9898 + 4.1) * 43758.5453) * 1000) + 1);
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
  const legs = TROUSERS[Math.floor(r() * TROUSERS.length)];
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const sleeves = r() < 0.5; // long sleeves, or bare forearms
  const lean = (r() - 0.5) * 0.12; // nobody sits bolt upright in line
  const put = (w: number, h: number, d: number, paint: Paint, lx: number, ly: number, lz: number, rad = 0.04) => {
    const [px, pz] = at(lx, lz);
    k.box(w, h, d, paint, px, ly, pz, { r: rad, ry, jitter: 0.02 });
  };
  const knee = y + 0.15;
  for (const sx of [-0.115, 0.115]) {
    put(0.17, 0.16, 0.5, legs, sx, y, 0.2, 0.05); // thigh
    put(0.15, knee - floor - 0.07, 0.15, legs, sx, floor + 0.07, 0.4, 0.04); // shin
    put(0.16, 0.09, 0.28, '#2f2a3d', sx, floor, 0.46, 0.03); // shoe
  }
  put(0.4, 0.2, 0.26, legs, 0, y, -0.04, 0.06); // hips
  put(0.42, 0.44, 0.25, shirt, 0, y + 0.17, -0.06 + lean, 0.09); // chest
  put(0.5, 0.13, 0.25, shirt, 0, y + 0.5, -0.06 + lean, 0.06); // shoulders
  for (const sx of [-0.27, 0.27]) {
    put(0.12, 0.34, 0.14, shirt, sx, y + 0.24, -0.02 + lean, 0.05); // upper arm
    put(0.11, 0.11, 0.3, sleeves ? shirt : skin, sx * 0.85, y + 0.17, 0.14, 0.04); // forearm along the thigh
    put(0.1, 0.09, 0.11, skin, sx * 0.7, y + 0.17, 0.31, 0.04); // hand
  }
  put(0.13, 0.1, 0.13, skin, 0, y + 0.61, -0.05 + lean, 0.04); // neck
  const [hx, hz] = at(0, -0.04 + lean);
  const hy = y + 0.87;
  k.geo(new THREE.SphereGeometry(0.19, 12, 9).scale(1, 1.06, 1).translate(hx, hy, hz), skin, 0.02);
  // hair: a cap over the crown and down the back of the head (longer on some)
  const long = r() < 0.4;
  const cap = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * (long ? 0.62 : 0.5)).rotateX(-0.42).rotateY(ry).translate(hx, hy + 0.03, hz);
  k.geo(cap, hair, 0.03);
}
