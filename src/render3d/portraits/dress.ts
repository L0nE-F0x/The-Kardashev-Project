/**
 * Neck, shoulders and what people wear: the bust below the chin. The shoulders are one soft bell in the cloth's
 * colour; collars, lapels, scarves, vests, pins and patches are laid on it. Chest pieces follow the bell's surface.
 */
import * as THREE from 'three';
import { C } from '../../render/palette';
import { blend, faceOut, geo, gloss, hexOf, lit, matte, put, rand, shade, shared, stick, type V3 } from './parts';
import { skinOf } from './head';
import type { Look } from './looks';

const PI = Math.PI;
/** How deep the shoulders are, front to back, against their width. */
const DEPTH = 0.64;
/** The bell's profile: radius by height (y from the collar down). */
const PROFILE: [number, number][] = [[0.0, -1.24], [0.3, -1.25], [0.47, -1.3], [0.66, -1.39], [0.95, -1.52], [1.24, -1.7], [1.45, -1.93], [1.56, -2.2], [1.62, -2.6], [1.64, -3.1]];
function radiusAt(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    if (y >= PROFILE[i][1]) {
      const [r0, y0] = PROFILE[i - 1];
      const [r1, y1] = PROFILE[i];
      return r0 + ((r1 - r0) * (y0 - y)) / (y0 - y1);
    }
  }
  return PROFILE[PROFILE.length - 1][0];
}
/** The point on the chest at (x, y), lifted off the cloth. */
export function chest(x: number, y: number, lift = 0): V3 {
  const r = radiusAt(y);
  const z = Math.sqrt(Math.max(0.0001, r * r - x * x)) * DEPTH;
  return [x, y, z + lift];
}
const bell = (grow = 0) =>
  shared(`bell:${grow}`, () => {
    const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r + (r > 0 ? grow : 0), y + grow * 0.5));
    const g = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(36), 56);
    g.scale(1, 1, DEPTH);
    return faceOut(g, (n, p) => n.x * p.x + n.z * p.z);
  });
/** A bell with a slot down the front (a vest or an open coat over what's under it). */
const openBell = (grow: number, gap: number) =>
  shared(`open-bell:${grow}:${gap}`, () => {
    const pts = PROFILE.filter(([r]) => r > 0.4).map(([r, y]) => new THREE.Vector2(r + grow, y + grow * 0.4));
    // lathe angles run from +Z round by +X: start just right of the front, stop just left of it
    const g = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(30), 52, gap, PI * 2 - gap * 2);
    g.scale(1, 1, DEPTH);
    return faceOut(g, (n, p) => n.x * p.x + n.z * p.z);
  });

/** A band of cloth lying on the chest between two edges (each a path of [x, y] by t = 0…1). */
function panel(key: string, left: (t: number) => [number, number], right: (t: number) => [number, number], lift: number, rows = 10, cols = 6): THREE.BufferGeometry {
  return shared(`panel:${key}:${lift}`, () => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const a = left(t);
      const b = right(t);
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        pos.push(...chest(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, lift));
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * (cols + 1) + i;
      idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return faceOut(g, (n) => n.z);
  });
}
/** The V of a collar: `top` wide at the neck, closing at `foot`. */
const V_TOP = -1.3;
const vee = (half: number, foot: number) => ({
  left: (t: number): [number, number] => [-half * (1 - t), V_TOP + (foot - V_TOP) * t],
  right: (t: number): [number, number] => [half * (1 - t), V_TOP + (foot - V_TOP) * t],
});

const plaids = new Map<string, THREE.MeshStandardMaterial>();
/** A checked shirt: the cloth with lines of the check colour woven through it. */
function plaidMat(cloth: string, check: string): THREE.MeshStandardMaterial {
  const key = `${cloth}:${check}`;
  let m = plaids.get(key);
  if (!m) {
    const N = 16;
    const data = new Uint8Array(N * N * 4);
    const a = new THREE.Color(cloth).convertLinearToSRGB();
    const b = new THREE.Color(check).convertLinearToSRGB();
    const dark = new THREE.Color(shade(cloth, -0.1)).convertLinearToSRGB();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const lx = x % 8 < 2;
      const ly = y % 8 < 2;
      const c = lx && ly ? dark : lx || ly ? b : a;
      const o = (y * N + x) * 4;
      data[o] = c.r * 255;
      data[o + 1] = c.g * 255;
      data[o + 2] = c.b * 255;
      data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 5);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
    plaids.set(key, m);
  }
  return m;
}

/** Neck, shoulders and clothes. `fig` is the figure (the head's pivot is at the top of the neck). */
export function dress(fig: THREE.Object3D, L: Look) {
  const skin = skinOf(L);
  const cloth = hexMid(L);
  const clothLight = blend(L.cloth[1], L.cloth[2], 0.75);
  const clothDark = blend(L.cloth[0], L.cloth[1], 0.4);
  const body = L.plaid !== undefined ? plaidMat(cloth, blend(L.plaid, L.cloth[0], 0.3)) : matte(cloth, 0.9);
  const part = (g: THREE.BufferGeometry, m: THREE.Material, p: V3, o: Parameters<typeof put>[4] = {}) => put(fig, g, m, p, o);

  // the neck
  part(geo.cyl(), matte(blend(skin.base, skin.shadow, 0.25), 0.75), [0, -1.08, -0.04], { s: [0.36, 0.7, 0.36] });
  if (L.age === 2) part(geo.torus(0.05, PI * 0.6), matte(skin.crease, 0.8), [0, -1.02, -0.04], { s: [0.355, 0.355, 1], r: [PI / 2, 0, PI * 0.2], ghost: true });
  // the shoulders
  part(bell(), body, [0, 0, 0]);

  const open = L.suit || L.coat;
  if (open) {
    // a jacket or a lab coat: the shirt in the V, lapels either side, perhaps a tie
    const shirt = L.suit ? L.suit.shirt : blend(L.cloth[0], C.ink6, 0.5);
    const foot = L.coat ? -2.5 : -2.32;
    const v = vee(0.42, foot);
    if (L.weave) {
      // a woven top under the coat: bands of colour
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        part(panel(`weave-v:${i}:${foot}`, (t) => v.left(t0 + (t1 - t0) * t), (t) => v.right(t0 + (t1 - t0) * t), 0.012, 2, 6), matte(L.weave[i % L.weave.length], 0.9), [0, 0, 0], { ghost: true });
      }
    } else part(panel(`v:${foot}`, v.left, v.right, 0.012), matte(shirt, 0.85), [0, 0, 0], { ghost: true });
    const lapelC = L.coat ? shade(cloth, -0.07) : clothLight;
    for (const side of [-1, 1]) {
      const inner = (t: number): [number, number] => [side * 0.42 * (1 - t), V_TOP + (foot - V_TOP) * t];
      const outer = (t: number): [number, number] => [side * (0.42 * (1 - t) + 0.3 * Math.sin(Math.min(1, t * 1.25) * PI) + 0.1 * (1 - t)), V_TOP - 0.05 + (foot - V_TOP) * t];
      part(panel(`lapel:${side}:${foot}`, side < 0 ? outer : inner, side < 0 ? inner : outer, 0.035, 10, 3), matte(lapelC, 0.88), [0, 0, 0]);
    }
    if (L.suit?.tie !== undefined) {
      const tie = matte(L.suit.tie, 0.7);
      part(geo.ball(), tie, chest(0, -1.42, 0.03), { s: [0.1, 0.085, 0.07] });
      part(panel('tie', (t) => [-0.065 - 0.05 * Math.sin(t * PI * 0.9), -1.46 - t * 0.9], (t) => [0.065 + 0.05 * Math.sin(t * PI * 0.9), -1.46 - t * 0.9], 0.03, 6, 2), tie, [0, 0, 0], { ghost: true });
    }
    // the collar standing at the neck
    part(geo.torus(0.07, PI * 1.5), matte(L.suit ? clothLight : lapelC, 0.88), [0, -1.3, -0.05], { s: [0.47, 0.47, 0.5], r: [PI / 2, 0, PI * 0.75] });
  }
  if (L.turtleneck) {
    part(geo.cyl(), matte(cloth, 0.95), [0, -1.14, -0.04], { s: [0.42, 0.5, 0.42] });
    for (const y of [-0.93, -1.07, -1.21]) part(geo.torus(0.05), matte(y === -0.93 ? clothLight : cloth, 0.95), [0, y, -0.04], { s: [0.42, 0.42, 0.9], r: [PI / 2, 0, 0] });
  }
  if (L.hoodie) {
    // the hood lying on the shoulders, drawstrings down the front
    part(geo.ball(), matte(clothDark, 0.95), [0, -1.3, -0.5], { s: [0.8, 0.42, 0.5] });
    part(geo.torus(0.3), matte(clothLight, 0.95), [0, -1.33, -0.02], { s: [0.56, 0.52, 0.42], r: [PI / 2 + 0.22, 0, 0] });
    for (const side of [-1, 1]) {
      stick(fig, matte(C.ink9, 0.7), chest(side * 0.2, -1.5, 0.03), chest(side * 0.22, -1.95, 0.03), 0.022);
      part(geo.ball(), matte(C.ink9, 0.7), chest(side * 0.22, -1.98, 0.035), { s: [0.035, 0.05, 0.035] });
    }
  }
  if (L.scarf !== undefined) {
    const wool = matte(L.scarf, 0.95);
    part(geo.torus(0.36), wool, [0, -1.22, 0], { s: [0.5, 0.5, 0.4], r: [PI / 2 + 0.12, 0, 0] });
    part(geo.ball(), matte(shade(hexOf(L.scarf), -0.06), 0.95), [0.22, -1.34, 0.4], { s: [0.2, 0.17, 0.16] });
    part(geo.box(0.3), wool, chest(0.3, -1.78, 0.05), { s: [0.26, 0.72, 0.1], r: [0.5, 0, -0.1] });
  }
  if (L.mandarin) {
    // a stand collar and a line of buttons
    part(geo.torus(0.09, PI * 1.82), matte(clothLight, 0.88), [0, -1.24, -0.04], { s: [0.44, 0.44, 1.25], r: [PI / 2, 0, PI * 0.5 + PI * 0.09] });
    part(panel('placket', (t) => [-0.025, -1.36 - t * 1.2], (t) => [0.025, -1.36 - t * 1.2], 0.012, 6, 1), matte(clothDark, 0.9), [0, 0, 0], { ghost: true });
    for (const y of [-1.5, -1.76, -2.02]) part(geo.ball(), gloss(C.ink8, 0.4), chest(0.07, y, 0.02), { s: [0.04, 0.04, 0.025] });
  }
  if (L.vest) {
    const [dark, light] = L.vest;
    const vm = matte(blend(dark, light, 0.6), 0.9);
    part(openBell(0.035, 0.3), vm, [0, 0, 0]);
    // its edge down the front
    for (const side of [-1, 1]) part(panel(`vest-edge:${side}`, (t) => [side * 0.3 + side * 0.34 * Math.max(0, 1 - t * 2.2), -1.4 - t * 1.2], (t) => [side * 0.37 + side * 0.34 * Math.max(0, 1 - t * 2.2), -1.4 - t * 1.2], 0.042, 8, 1), matte(light, 0.9), [0, 0, 0], { ghost: true });
    if (L.hivis) {
      // reflective straps over the shoulders and across the chest
      const tape = matte(C.yel2, 0.45);
      for (const side of [-1, 1]) {
        part(panel(`hivis:${side}`, (t) => [side * (0.62 + t * 0.06), -1.42 - t * 1.2], (t) => [side * (0.8 + t * 0.06), -1.46 - t * 1.2], 0.05, 8, 2), tape, [0, 0, 0], { ghost: true });
        part(panel(`hivis-x:${side}`, (t) => [side * (0.36 + t * 1.1), -2.08], (t) => [side * (0.36 + t * 1.1), -2.24], 0.05, 6, 1), tape, [0, 0, 0], { ghost: true });
      }
    }
  }
  if (L.knit !== undefined) {
    // a knitted yoke: a ring of diamonds and dots round the collar
    const yarn = matte(L.knit, 0.95);
    const n = 15;
    for (let i = 0; i < n; i++) {
      const x = -1.05 + (2.1 * i) / (n - 1);
      const y = -1.5 - 0.3 * (1 - Math.cos((x / 1.05) * 1.2)) - 0.06;
      put(fig, geo.gem(), yarn, chest(x * 0.95, y - 0.02 * (i % 2), 0.02), { s: [0.055, 0.075, 0.02] });
      if (i < n - 1) put(fig, geo.ball(), yarn, chest((x + 0.075) * 0.95, y - 0.17, 0.015), { s: [0.03, 0.03, 0.015] });
    }
    for (const side of [-1, 1]) part(panel(`knit-band:${side}`, (t) => [side * t * 1.12, -1.42 - 0.3 * (1 - Math.cos(t * 1.2 * 1.07))], (t) => [side * t * 1.12, -1.46 - 0.3 * (1 - Math.cos(t * 1.2 * 1.07))], 0.014, 8, 1), yarn, [0, 0, 0], { ghost: true });
  }
  if (L.weave && !open) {
    // a woven collar: stripes round the neck (a poncho, a wrapper)
    const n = L.weave.length + 1;
    for (let i = 0; i < n; i++) {
      const y0 = -1.33 - i * 0.14;
      for (const side of [-1, 1]) {
        part(panel(`weave:${i}:${side}`, (t) => [side * t * (0.72 + i * 0.16), y0 - 0.2 * t * t], (t) => [side * t * (0.76 + i * 0.16), y0 - 0.13 - 0.2 * t * t], 0.014 + i * 0.001, 8, 1), matte(L.weave[i % L.weave.length], 0.92), [0, 0, 0], { ghost: true });
      }
    }
  }
  if (L.patch !== undefined) {
    // a mission patch on the chest
    const at = chest(-0.72, -1.9, 0.045);
    const tilt: V3 = [-0.25, -0.5, 0];
    part(geo.plate(), matte(L.patch, 0.8), at, { s: 0.16, r: tilt, ghost: true });
    part(geo.torus(0.12), matte(C.white, 0.8), at, { s: [0.15, 0.15, 0.05], r: tilt, ghost: true });
    part(geo.gem(), matte(C.white, 0.8), [at[0], at[1], at[2] + 0.012], { s: [0.035, 0.085, 0.01], r: [tilt[0], tilt[1], 0.5], ghost: true });
  }
  if (L.pin !== undefined) {
    const at = chest(-0.47, -1.76, 0.065);
    part(geo.ball(), gloss(L.pin, 0.25), at, { s: [0.07, 0.07, 0.04] });
    put(fig, geo.ball(), lit(C.white, 0.9), [at[0] - 0.02, at[1] + 0.025, at[2] + 0.035], { s: 0.014, ghost: true });
  }
  if (L.necklace !== undefined) {
    // a string of beads
    const bead = gloss(L.necklace, 0.3);
    for (let i = 0; i < 13; i++) {
      const u = i / 6 - 1;
      part(geo.ball(), bead, chest(u * 0.4, -1.36 - 0.3 * (1 - u * u), 0.04 + (open ? 0.02 : 0)), { s: 0.043 });
    }
  }
  if (L.eva) {
    // a spacesuit: the metal neck ring, a hose port, a chest display
    part(geo.torus(0.18), matte(C.ink8, 0.5), [0, -1.3, -0.02], { s: [0.66, 0.58, 0.55], r: [PI / 2 + 0.1, 0, 0] });
    part(geo.torus(0.07), matte(C.ink5, 0.5), [0, -1.22, -0.02], { s: [0.58, 0.5, 0.6], r: [PI / 2 + 0.1, 0, 0] });
    part(geo.torus(0.035), matte(C.white, 0.4), [0, -1.36, 0], { s: [0.78, 0.68, 0.6], r: [PI / 2 + 0.1, 0, 0] });
    part(geo.cyl(), matte(C.ink6, 0.5), chest(0.62, -1.62, 0.05), { s: [0.07, 0.1, 0.07], r: [1.1, 0, -0.4] });
    const at = chest(0.5, -2.0, 0.04);
    part(geo.box(0.2), matte(C.ink2, 0.5), at, { s: [0.36, 0.24, 0.08], r: [-0.2, 0.3, 0] });
    put(fig, geo.ball(), lit(C.grn6), [at[0] - 0.08, at[1] + 0.03, at[2] + 0.05], { s: 0.035, ghost: true });
    put(fig, geo.ball(), lit(C.org1), [at[0] + 0.07, at[1] - 0.03, at[2] + 0.04], { s: 0.035, ghost: true });
  }
  if (L.tattoo !== undefined) {
    // a laser beam zig-zagging across the neck between two mirrors
    const ink = matte(L.tattoo, 0.7);
    const zig: V3[] = [-0.2, -0.1, 0, 0.1, 0.2].map((x, i) => [x, -1.02 + (i % 2 ? 0.05 : -0.05), Math.sqrt(0.36 * 0.36 - x * x) - 0.035]);
    for (let i = 1; i < zig.length; i++) stick(fig, ink, zig[i - 1], zig[i], 0.014).castShadow = false;
    put(fig, geo.ball(), lit(C.white), zig[4], { s: 0.022, ghost: true });
  }
  if (L.stethoscope !== undefined) {
    // round the neck, the chest piece hanging on one side
    const tubeM = matte(L.stethoscope, 0.5);
    part(geo.torus(0.075, PI * 1.24), tubeM, [0, -1.36, -0.02], { s: [0.6, 0.58, 0.6], r: [PI / 2 + 0.2, 0, PI * 0.88] });
    stick(fig, tubeM, chest(-0.52, -1.46, 0.07), chest(-0.4, -2.0, 0.08), 0.042);
    stick(fig, tubeM, chest(0.52, -1.46, 0.07), chest(0.46, -1.86, 0.08), 0.042);
    part(geo.ball(), gloss(C.ink8, 0.3), chest(-0.4, -2.04, 0.09), { s: [0.06, 0.06, 0.05] });
    part(geo.cyl(), gloss(C.ink8, 0.3), chest(0.46, -1.95, 0.1), { s: [0.12, 0.06, 0.12], r: [PI / 2 - 0.3, 0, 0] });
    put(fig, geo.ball(), lit(C.white, 0.9), chest(0.42, -1.91, 0.15), { s: 0.026, ghost: true });
  }
  if (L.pillow) {
    // a travel pillow round the neck, open under the chin
    const [dark, light] = L.pillow;
    const foam = matte(blend(dark, light, 0.6), 0.95);
    part(geo.torus(0.36, PI * 1.5), foam, [0, -1.2, -0.08], { s: [0.62, 0.62, 0.62], r: [PI / 2, 0, PI * 0.75] });
    // its two rounded ends, either side of the chin
    for (const side of [-1, 1]) part(geo.ball(), foam, [side * 0.44, -1.2, 0.36], { s: 0.225 });
  }
  if (L.mask !== undefined) {
    // a face mask (or a bandana) pulled down under the chin
    part(geo.ball(), matte(L.mask, 0.9), [0, -0.98, 0.3], { s: [0.38, 0.17, 0.3] });
    part(geo.torus(0.06, PI), matte(blend(L.mask, C.white, 0.6), 0.9), [0, -0.9, 0.3], { s: [0.36, 0.3, 0.3], r: [PI / 2, 0, 0] });
  }
  if (L.dust !== undefined) {
    // dust on the shoulders
    const r = rand(17);
    const d = matte(L.dust, 1);
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 2.6;
      const y = -1.5 - r() * 0.6 - Math.abs(x) * 0.22;
      part(geo.ball(), d, chest(x, y, 0.008), { s: [0.03 + r() * 0.03, 0.025, 0.012], ghost: true });
    }
  }
}

/** The cloth's main tone. */
function hexMid(L: Look): string {
  return blend(L.cloth[1], L.cloth[2], 0.18);
}
