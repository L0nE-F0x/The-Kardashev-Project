/**
 * Aurora's homes: terraced houses round a shared courtyard garden ('settle', 'early'), the
 * work stations' dorm blocks, the private plan's villas with pools and its slender glass towers,
 * and a new district going up (cranes, timber frames, the builder's cabins).
 */
import * as THREE from 'three';
import { Kit, mix, rng, type Paint } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  At, bench, bike, blob, CREW, festoon, floorY, flowerBed, Hab, H, hedge, home, lampPost, laundry, patch, paving, pergola,
  picket, poolWaterMat, strip, table, TAU, towerGlass, V, vegBed,
} from './common';
import { builderBoard, cabin, hoarding, P as MP, towerCrane, workCrane } from '../mega/common';

const WALLS: Paint[] = [H.render, H.peach, H.sand, H.sage, H.rose, H.render2];
const lv = (o: Act3SetOpts) => Math.max(0, Math.min(3, o.n ?? 1));

/** A garden swing on an A-frame (it swings), facing ±z. */
export function swing(h: Hab, x: number, z: number) {
  for (const s of [-1, 1]) {
    h.k.beam(V(x + s * 1.1, 0, z - 0.7), V(x + s * 1.0, 2.2, z), 0.1, H.timberD);
    h.k.beam(V(x + s * 1.1, 0, z + 0.7), V(x + s * 1.0, 2.2, z), 0.1, H.timberD);
  }
  h.k.box(2.4, 0.14, 0.14, H.timber, x, 2.15, z, { r: 0.03 });
  const sw = new THREE.Group();
  const kit = new Kit(rng(3));
  for (const dx of [-0.25, 0.25]) kit.box(0.03, 1.55, 0.03, H.steelD, dx, -1.6, 0, { r: 0, jitter: 0 });
  kit.box(0.6, 0.06, 0.26, H.red, 0, -1.65, 0, { r: 0.02 });
  sw.add(kit.build());
  sw.position.set(x, 2.15 + floorY(z), z);
  h.g.add(sw);
  h.anim.add((e) => { sw.rotation.x = Math.sin(e.t * 2.3 + x) * 0.4; });
}
/** A cat sitting (body, head, ears, a curled tail). */
export function cat(h: Hab, x: number, z: number, ry: number, y = 0) {
  const a = new At(x, y, z, ry);
  const c: Paint = h.pick(['#433c52', '#f08a46', '#e6e0e3', '#5f3b28']);
  a.box(h.k, 0.24, 0.26, 0.36, c, 0, 0, 0, 0.08, 0.04, 0.1);
  a.box(h.k, 0.22, 0.2, 0.2, c, 0, 0.26, 0.12, 0.07, 0.04, 0);
  for (const sx of [-0.07, 0.07]) a.geo(h.k, new THREE.ConeGeometry(0.04, 0.09, 4).translate(sx, 0.5, 0.14), c, 0.02);
  a.box(h.k, 0.06, 0.06, 0.3, c, 0.1, 0.02, -0.2, 0.02, 0.04, 0, 0.5);
}

// ── homes round a courtyard ──────────────────────────────────────────────────────────────────
/** Terraced homes round a shared garden: beds, fruit trees, a pergola, the washing out, bikes, neighbours. */
export function habHouses(o: Act3SetOpts): Piece {
  const n = lv(o), early = o.variant === 'early';
  const seed = o.seed + (o.vseed ?? 0) * 31;
  const h = new Hab(seed, o.w, o.d);
  const r = rng(seed);
  const walls = [...WALLS].sort(() => r() - 0.5);
  const grow = early ? Math.max(0, n - 1) : n;
  // the lane along the front, the courtyard's paths
  strip(h.k, -14.4, 10.3, 14.4, 10.3, 2.1, H.path);
  for (const sx of [-1, 1]) strip(h.k, sx * 14.4, 10.3, sx * 14.4, 10.3, 0.01, H.pathD);
  strip(h.k, 0, 9.3, 0, -3.6, 1.3, H.path);
  strip(h.k, -7.6, -3.4, 7.6, -3.4, 1.3, H.path);
  strip(h.k, -7.6, 2.8, -1, 2.8, 1.1, H.path);
  if (n >= 1) strip(h.k, 7.6, 2.8, 1, 2.8, 1.1, H.path);
  // the homes: two at the back, one each side facing in
  const style = (i: number) => (seed + i) % 3;
  home(h, -3.3, -7.3, 0, { w: 6.4, d: 5.8, style: style(0), wall: walls[0], lived: n });
  home(h, 3.3, -7.3, 0, { w: 6.4, d: 5.8, style: style(1), wall: walls[1], wall2: style(1) === 2 ? walls[1] : walls[2], lived: n });
  home(h, -11.1, 0.9, Math.PI / 2, { w: 6.6, d: 5.4, style: style(2), wall: walls[3], lived: n });
  if (n >= 1) home(h, 11.1, 0.9, -Math.PI / 2, { w: 6.6, d: 5.4, style: style(3), wall: walls[4], lived: n });
  else {
    // the plot next door, waiting: stakes, a young tree, a bench
    for (const [x, z] of [[8.4, -2], [13.6, -2], [13.6, 4], [8.4, 4]]) h.k.box(0.1, 0.9, 0.1, H.timberL, x, 0, z, { r: 0 });
    h.k.beam(V(8.4, 0.75, -2), V(13.6, 0.75, -2), 0.03, H.orange);
    h.k.beam(V(13.6, 0.75, -2), V(13.6, 0.75, 4), 0.03, H.orange);
    h.k.beam(V(8.4, 0.75, 4), V(13.6, 0.75, 4), 0.03, H.orange);
    h.tree('birch', 11, 1, 0.55);
    for (let i = 0; i < 3; i++) h.k.box(2.2, 0.16, 1.1, H.timberL, 11.2, 0.05 + i * 0.17, 6.2, { r: 0.02 });
  }
  // front gardens of the wings: hedges with gates, flower beds, a big tree on each corner
  hedge(h, -14.2, 8.4, -9.8, 8.4, 0.9, 0.7);
  if (n >= 1) hedge(h, 9.8, 8.4, 14.2, 8.4, 0.9, 0.7);
  picket(h, -7.7, 8.6, -1.2, 8.6, H.white);
  picket(h, 1.2, 8.6, 7.7, 8.6, H.white);
  h.tree('broadleaf', -13.4, 5.2, 0.85 + grow * 0.15);
  h.tree(n >= 1 ? 'broadleaf' : 'birch', 13.2, 6.4, 0.9 + grow * 0.25);
  flowerBed(h, -9.0, -3.4, 1.4, 1.2);
  flowerBed(h, 9.0, -3.4, 1.4, 1.2);
  // the courtyard: raised beds, fruit trees, a pergola with a table, the washing, a swing
  const beds = 2 + Math.min(2, n);
  for (let i = 0; i < beds; i++) vegBed(h, -5.6 + (i % 2) * 2.6, 0.2 + Math.floor(i / 2) * 2.6 + (i >= 2 ? 1.4 : 0), 2.0, 1.2, 0, 0.6 + grow * 0.15);
  h.tree('fruit', 4.6, -0.6, 0.6 + grow * 0.14);
  if (n >= 1) h.tree('fruit', 6.4, 5.6, 0.55 + grow * 0.14);
  h.tree(n >= 2 ? 'blossom' : 'blob', -5.2, 7.2, 0.6 + grow * 0.12);
  if (n >= 1) laundry(h, 1.6, -1.4, 6.2, -1.9, 1.9);
  if (n >= 2) {
    pergola(h, 3.4, 5.0, 3.2, 2.4, grow / 3);
    table(h, 3.4, 5.0, null, 4);
  } else bench(h, 3.4, 5.4, 0);
  if (n >= 3) {
    // a sandpit and a swing for the little ones
    h.k.box(2.0, 0.25, 2.0, H.timber, -1.9, 0, 5.9, { r: 0.05 });
    h.k.box(1.8, 0.06, 1.8, H.straw, -1.9, 0.22, 5.9, { r: 0 });
    swing(h, -1.9, 3.6);
  }
  // bikes against the fence, a bench and lamps along the lane
  const nb = [1, 2, 3, 5][n];
  for (let i = 0; i < nb; i++) bike(h, -6.8 + i * 0.75, 8.0, Math.PI / 2 + (r() - 0.5) * 0.2);
  bench(h, 9.6, 11.6, Math.PI);
  lampPost(h, -10.4, 11.6);
  lampPost(h, 6.0, 11.6);
  // people: neighbours over the fence, someone in the beds, walkers on the lane, kids
  h.walk([[-13.5, 10.6], [13.5, 10.0]], null, { pause: [2, 6] });
  if (n >= 1) h.chat(1.2, 7.4, 2);
  if (n >= 1) h.stand(-4.3, 1.6, 0.6, 'office');
  if (n >= 2) h.walk([[0.2, 9.8], [0.2, -3.0], [-5.4, -3.4]], null, { pause: [3, 8] });
  if (n >= 2) h.walk([[12.8, 9.6], [-6, 10.7]], 'engineer');
  if (n >= 3) {
    h.kid(-1.9, 4.2, 1.6);
    h.kid(1.4, 1.8, 1.8);
    h.kid(-2.4, 6.6, 1.2);
    cat(h, -0.9, 6.0, 0.6, 0.25);
  }
  return h.finish(9.5);
}

// ── the private plan: villas ─────────────────────────────────────────────────────────────────
/** A white modernist villa facing +z at (x, z): a long glass ground floor, a cantilevered upper box, timber fins. */
function villa(h: Hab, x: number, z: number, w: number, d: number, flip: number, n: number) {
  const a = new At(x, 0, z);
  const k = h.k;
  a.box(k, w + 0.6, 0.3, d + 0.6, H.stone, 0, 0, 0, 0.05);
  // ground floor: white ends, glass between
  a.box(k, 1.0, 3.2, d, H.white, -w / 2 + 0.5, 0.28, 0, 0.06, 0.02, 0.08);
  a.box(k, 1.0, 3.2, d, H.white, w / 2 - 0.5, 0.28, 0, 0.06, 0.02, 0.08);
  a.box(k, w - 2, 3.2, d - 0.8, '#e6e0e3', 0, 0.28, -0.4, 0.04, 0.02, 0.06);
  for (let i = 0; i < 5; i++) {
    const px = -w / 2 + 1.0 + ((w - 2) * (i + 0.5)) / 5;
    a.box(h.r() < 0.25 + n * 0.08 ? h.lit : h.glass, (w - 2) / 5 - 0.12, 2.9, 0.06, '#4a6b78', px, 0.32, d / 2 - 0.38, 0, 0.03, 0);
    a.box(k, 0.08, 3.0, 0.1, H.ink, px - (w - 2) / 10, 0.3, d / 2 - 0.34, 0, 0, 0);
  }
  a.box(k, w + 0.3, 0.32, d + 0.3, H.white, 0, 3.45, 0, 0.04, 0.02, 0);
  // the upper box, slid out over the terrace
  const uw = w * 0.62, ux = flip * (w / 2 - uw / 2 + 1.2);
  a.box(k, uw, 2.9, d - 0.6, H.white, ux, 3.75, -0.5, 0.05, 0.02, 0.05);
  a.box(h.lit, uw - 1.2, 1.3, 0.06, '#ffffff', ux, 4.6, d / 2 - 0.77, 0, 0.03, 0);
  a.box(k, uw + 0.2, 0.24, d - 0.4, '#d6d0cc', ux, 6.6, -0.5, 0.03, 0.02, 0);
  for (let i = 0; i < 7; i++) a.box(k, 0.14, 2.7, 0.18, H.timberL, ux - uw / 2 + 0.4 + i * 0.3, 3.85, d / 2 - 0.68, 0, 0.05, 0);
  // the terrace on the low roof: a glass balustrade, loungers, planters
  const tx = -flip * (w / 2 - (w - uw) / 2 + 0.6);
  a.box(h.glass, w - uw - 0.6, 0.9, 0.05, '#9cc4ea', tx, 3.77, d / 2 + 0.05, 0, 0.02, 0);
  for (const pz of [-d / 4, d / 4 - 0.5]) {
    a.box(k, 1.0, 0.45, 0.8, H.timber, tx + flip * (w - uw) / 3, 3.77, pz, 0.04);
    const p = a.pt(tx + flip * (w - uw) / 3, 4.2, pz);
    h.tree('blob', p.x, p.z, 0.35, p.y);
  }
  a.box(k, 1.8, 0.2, 0.7, H.white, tx - flip * 0.6, 3.8, 0.4, 0.05, 0.02, 0);
}
/** A pool with white coping, loungers and an umbrella. */
function pool(h: Hab, x: number, z: number, w: number, d: number, swimmer: boolean) {
  h.k.box(w + 1.2, 0.2, d + 1.2, H.white, x, 0, z, { r: 0.06, jitter: 0.02, shade: 0 });
  h.k.box(w, 0.06, d, '#2c6f86', x, 0.17, z, { r: 0, jitter: 0, shade: 0 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d, Math.ceil(w), 1, Math.ceil(d)).translate(x, 0.2, z), poolWaterMat);
  m.receiveShadow = true;
  h.mesh(m);
  for (let i = 0; i < 2; i++) {
    const lx = x - w / 2 + 1.0 + i * 1.3, lz = z + d / 2 + 1.5;
    h.k.box(0.7, 0.3, 1.9, H.white, lx, 0, lz, { r: 0.05 });
    h.k.geo(new THREE.BoxGeometry(0.66, 0.08, 0.8).rotateX(0.6).translate(lx, 0.55, lz - 0.7), H.white, 0.02, 0);
    h.k.box(0.6, 0.06, 1.0, h.pick([H.yellow, H.teal, '#f7a6c4']), lx, 0.32, lz + 0.3, { r: 0.02 });
  }
  h.k.cyl(0.04, 0.04, 2.4, H.white, x - w / 2 + 3.6, 0, z + d / 2 + 1.4, 6);
  h.k.geo(new THREE.ConeGeometry(1.3, 0.45, 8).translate(x - w / 2 + 3.6, 2.5, z + d / 2 + 1.4), H.white, 0.03, 0);
  if (swimmer) {
    const s = new THREE.Group();
    const sk = new Kit(rng(7));
    sk.geo(new THREE.SphereGeometry(0.14, 8, 6), '#c58a5a', 0);
    sk.geo(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), h.pick([H.red, H.yellow, H.blue]), 0);
    sk.box(0.7, 0.06, 0.12, '#c58a5a', 0, -0.05, -0.2, { r: 0.02 });
    sk.box(0.3, 0.05, 0.6, '#3f8fae', 0, -0.1, -0.5, { r: 0.02 });
    s.add(sk.build());
    h.g.add(s);
    h.anim.add((e) => {
      const t = (Math.sin(e.t * 0.25) * 0.5 + 0.5);
      const sx = x - w / 2 + 0.8 + t * (w - 1.6);
      s.position.set(sx, 0.2 + floorY(z), z + Math.sin(e.t * 0.7) * 0.2);
      s.rotation.y = Math.cos(e.t * 0.25) > 0 ? Math.PI / 2 : -Math.PI / 2;
      s.children[0].rotation.z = Math.sin(e.t * 4) * 0.25;
    });
  }
}
export function habVilla(o: Act3SetOpts): Piece {
  const n = lv(o);
  const seed = o.seed + (o.vseed ?? 0) * 19;
  const h = new Hab(seed, o.w, o.d);
  // two villas, each with its pool, in walled gardens
  villa(h, -6.6, -6.8, 10.2, 5.4, 1, n);
  villa(h, 7.2, -4.0, 8.4, 5.0, -1, n);
  pool(h, -6.8, 0.8, 7.2, 3.2, n >= 1);
  pool(h, 7.4, 3.8, 5.6, 2.6, n >= 3);
  // garden walls with gates, a stone drive between the two, cypress, palms, hedges
  for (const [x0, z0, x1, z1] of [[-12.6, 9.8, -1.6, 9.8], [1.6, 9.8, 12.6, 9.8], [-12.6, -10.4, -12.6, 9.8], [12.6, -10.4, 12.6, 9.8]] as [number, number, number, number][]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    h.k.box(x1 === x0 ? 0.35 : len, 1.0, x1 === x0 ? len : 0.35, H.white, (x0 + x1) / 2, 0, (z0 + z1) / 2, { r: 0.08, jitter: 0.02, shade: 0.1 });
    h.k.box(x1 === x0 ? 0.45 : len + 0.1, 0.1, x1 === x0 ? len + 0.1 : 0.45, H.stone, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, { r: 0.03 });
  }
  strip(h.k, 0.6, 11.4, 0.6, -1.0, 2.0, H.paving);
  strip(h.k, 0.6, -1.0, 2.8, -2.4, 1.6, H.paving);
  hedge(h, -0.8, -0.6, -0.8, 8.8, 1.0, 0.7);
  hedge(h, 2.0, 1.0, 2.0, 8.8, 1.0, 0.7);
  for (const [x, z, s] of [[-12.0, -9.6, 1.15], [-12.0, -7.0, 1.05], [12.0, -9.8, 1.2], [12.0, -7.4, 1.1], [12.0, -5.0, 1.0], [-11.8, 8.6, 1.1], [-9.6, 8.8, 1.0], [11.8, 8.6, 1.1]] as [number, number, number][]) h.tree('cypress', x, z, s);
  h.tree('broadleaf', -11.2, 4.6, 1.0 + n * 0.1);
  h.tree('palm', 4.4, 7.8, 1.2);
  h.tree('palm', 10.6, 7.0, 1.1);
  h.tree('palm', -2.6, 4.6, 1.0);
  hedge(h, 3.4, 8.8, 9.0, 8.8, 0.8, 0.6);
  flowerBed(h, -8.6, 4.8, 3.4, 0.8);
  flowerBed(h, 9.6, -0.2, 2.4, 0.8);
  // people at their leisure
  h.stand(-4.4, 2.9, 2.8, 'office');
  if (n >= 1) h.stand(7.6, 6.2, 3.3, 'researcher');
  if (n >= 2) h.chat(-9.2, 3.2, 2);
  if (n >= 2) h.walk([[0.6, 11.2], [0.6, -0.8], [2.6, -2.2]], null, { pause: [3, 8] });
  if (n >= 3) festoon(h, V(-10.4, 2.6 + floorY(-1.6), -1.6), V(-2.8, 2.6 + floorY(-1.6), -1.6), 0.5, 9);
  if (n >= 3) for (const [x, z] of [[-10.4, -1.6], [-2.8, -1.6]]) h.k.box(0.1, 2.6, 0.1, H.frame, x, 0, z, { r: 0 });
  return h.finish(7);
}

// ── the private plan: glass towers ───────────────────────────────────────────────────────────
const GLASS: Paint[] = ['#93bfe8', '#6c9fd2', '#4a7cb6', '#c4e0f2', '#6597d8'];
/** A slender glass tower: rounded glass floors shading lighter towards the top, white slab lines, gold rings,
 *  hanging gardens on the corners, a garden setback, a gold crown (and a spire on the tallest). */
function tower(h: Hab, x: number, z: number, s: number, ht: number, seed: number, spire = false) {
  const r = rng(seed);
  const k = h.k, fl = 2.6;
  // the lobby: dark glass behind a gold canopy, a few lit panes
  k.box(s + 2.4, 0.3, s + 2.4, '#5b5562', x, 0, z, { r: 0.06 });
  const lobby = new Kit(rng(seed + 9));
  lobby.box(s + 1.2, 3.2, s + 1.2, '#3e5e6c', x, 0.28, z, { r: 0.3, jitter: 0.02, shade: 0 });
  const lm = lobby.build(towerGlass);
  h.mesh(lm);
  for (let i = 0; i < 4; i++) h.lit.box(0.7, 2.2, 0.05, '#ffffff', x - s / 2 + 0.4 + i * ((s - 0.8) / 3), 0.5, z + s / 2 + 0.63, { r: 0, jitter: 0, shade: 0 });
  k.box(s + 2.0, 0.22, s + 2.0, H.gold, x, 3.45, z, { r: 0.06, shade: 0 });
  for (const [fx, fz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.22, 3.2, 0.22, H.white, x + (fx * (s + 1.2)) / 2, 0.28, z + (fz * (s + 1.2)) / 2, { r: 0.04 });
  const step = Math.round((ht * 0.62) / fl) * fl;
  const parts: [number, number, number][] = [[3.7, step, s], [3.7 + step, ht - 3.7 - step, s * 0.78]];
  for (const [y0, hh, sw] of parts) {
    if (hh <= 0.5) continue;
    const g = new Kit(rng(seed + y0));
    const floors = Math.max(1, Math.round(hh / fl + 0.01));
    for (let f = 0; f < floors; f++) {
      const yf = y0 + f * fl;
      const t = Math.min(1, yf / ht);
      const c = mix(mix('#6c9fd2', '#c4e0f2', t * 0.9), GLASS[Math.floor(r() * GLASS.length)], 0.15);
      g.box(sw, fl - 0.14, sw, c, x, yf + 0.1, z, { r: sw * 0.12, jitter: 0.02, shade: 0 });
      const ring = (f + 1) % 6 === 0;
      k.box(sw + 0.16, ring ? 0.26 : 0.12, sw + 0.16, ring ? H.gold : '#e6e0e3', x, yf, z, { r: sw * 0.13, jitter: 0.01, shade: 0 });
      // a few lit rooms
      for (let q = 0; q < 2; q++) {
        if (r() > 0.22) continue;
        const off = (r() - 0.5) * sw * 0.6;
        if (r() < 0.5) h.lit.box(0.55, fl - 0.9, 0.04, '#ffffff', x + off, yf + 0.5, z + sw / 2 + 0.01, { r: 0, jitter: 0, shade: 0 });
        else h.lit.box(0.04, fl - 0.9, 0.55, '#ffffff', x - sw / 2 - 0.01, yf + 0.5, z + off, { r: 0, jitter: 0, shade: 0 });
      }
      // hanging gardens on alternate corners every third floor
      if (f % 3 === 1) {
        const [cx, cz] = [[-1, 1], [1, 1], [-1, -1]][(f + seed) % 3];
        const px = x + cx * (sw / 2 - 0.2), pz = z + cz * (sw / 2 - 0.2);
        k.box(1.3, 0.4, 1.3, '#e6e0e3', px + cx * 0.35, yf - 0.05, pz + cz * 0.35, { r: 0.08 });
        for (let j = 0; j < 3; j++) h.leaf.geo(blob(0.34 + r() * 0.12, r).translate(px + cx * 0.35 + (r() - 0.5) * 0.7, yf + 0.45 + r() * 0.2, pz + cz * 0.35 + (r() - 0.5) * 0.7), j % 2 ? H.ivyL : H.ivy, 0.2);
        h.leaf.geo(blob(0.22, r).scale(0.8, 1.6, 0.8).translate(px + cx * 0.75, yf - 0.35, pz + cz * 0.75), H.ivyL, 0.2);
      }
    }
    const gm = g.build(towerGlass);
    gm.castShadow = true;
    h.mesh(gm);
    // slim white fins up the front and side middles
    for (const [fx, fz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) k.box(fx ? 0.24 : 0.12, hh, fz ? 0.24 : 0.12, H.white, x + (fx * (sw + 0.14)) / 2, y0, z + (fz * (sw + 0.14)) / 2, { r: 0.03, jitter: 0.01, shade: 0 });
  }
  // the setback garden
  const gy = 3.7 + step;
  k.box(s + 0.3, 0.3, s + 0.3, H.gold, x, gy - 0.05, z, { r: s * 0.12 });
  k.box(s - 0.2, 0.14, s - 0.2, H.sedum, x, gy + 0.2, z, { r: s * 0.1 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4, rr = s * 0.42;
    h.tree(i % 2 ? 'blob' : 'blossom', x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.42 + r() * 0.12, gy + 0.3);
  }
  // the crown: a gold frame round a roof garden
  const ty = ht, cs = s * 0.78;
  k.box(cs + 0.4, 0.35, cs + 0.4, H.gold, x, ty - 0.1, z, { r: cs * 0.13 });
  for (const [fx, fz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(0.18, 1.6, 0.18, H.gold, x + (fx * cs) / 2.2, ty, z + (fz * cs) / 2.2, { r: 0.03 });
  k.box(cs + 0.3, 0.18, cs + 0.3, H.goldD, x, ty + 1.6, z, { r: cs * 0.13 });
  k.box(cs - 0.3, 0.12, cs - 0.3, H.sedum, x, ty + 0.2, z, { r: 0 });
  h.tree('broadleaf', x, z, 0.5, ty + 0.25);
  if (spire) {
    k.cyl(0.08, 0.22, 5.0, H.gold, x, ty + 1.75, z, 8);
    k.geo(new THREE.SphereGeometry(0.22, 8, 6).translate(x, ty + 6.8, z), H.gold, 0);
    return ty + 7;
  }
  return ty + 1.8;
}
export function habTower(o: Act3SetOpts): Piece {
  const n = lv(o);
  const seed = o.seed + (o.vseed ?? 0) * 23;
  const h = new Hab(seed, o.w, o.d);
  // the plaza: dark stone with a long reflecting pool, planters, a gold ring on a plinth
  paving(h, 0, 0.5, 21.0, 20.4, '#c3bcc7', '#9d95a6', 1.8);
  const t1 = tower(h, -5.2, -5.0, 4.6, 30, seed, true);
  const t2 = tower(h, 4.8, -6.4, 3.9, 22.6, seed + 1);
  const t3 = tower(h, 5.8, 2.6, 3.4, 16.4, seed + 2);
  h.k.box(9.4, 0.26, 2.8, '#5b5562', -4.4, 0, 5.2, { r: 0.05 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.04, 2.2, 9, 1, 2).translate(-4.4, 0.24, 5.2), poolWaterMat);
  h.mesh(m);
  h.k.box(1.0, 1.2, 1.0, '#5b5562', -9.2, 0, 7.6, { r: 0.06 });
  h.k.geo(new THREE.TorusGeometry(1.0, 0.16, 8, 24).translate(-9.2, 2.4, 7.6), H.gold, 0.02, 0);
  for (const [px, pz] of [[1.2, 9.0], [9.6, 8.6], [-10.0, 0.8], [9.8, -1.6]] as [number, number][]) {
    h.k.box(1.8, 0.6, 1.8, '#9d95a6', px, 0, pz, { r: 0.08 });
    h.tree('broadleaf', px, pz, 0.7 + n * 0.08, 0.6);
  }
  bench(h, -4.4, 7.4, Math.PI);
  bench(h, 3.0, 6.6, Math.PI);
  // people crossing the plaza
  const paths: [number, number][][] = [[[-10, 9.6], [9, 10]], [[-1.2, 9.5], [-1.6, -1.4]], [[8.6, 6.2], [-8.6, 2.4]], [[2.2, 10.2], [2.0, 4.4]], [[-9.6, -2], [-0.4, 9]]];
  for (let i = 0; i < 2 + n; i++) h.walk(paths[i % paths.length], i % 2 ? 'office' : null, { pause: [1, 4] });
  if (n >= 2) h.chat(-0.2, 7.2, 2);
  return h.finish(Math.max(t1, t2, t3));
}

// ── the work stations: dorm blocks ───────────────────────────────────────────────────────────
const BANDS: Paint[] = ['#1c8780', '#f08a46', '#5a9537', '#4a7cb6', '#fbd46e'];
function dormBlock(h: Hab, x0: number, x1: number, z: number, d: number, floors: number, label: string) {
  const k = h.k, fl = 2.9;
  const w = x1 - x0, cx = (x0 + x1) / 2;
  k.box(w + 0.4, 0.3, d + 0.4, H.stone, cx, 0, z, { r: 0.05 });
  for (let f = 0; f < floors; f++) {
    const y = 0.3 + f * fl;
    // modules, two to a floor, the joint showing
    for (let m = 0; m < 2; m++) {
      const mx = x0 + (w / 2) * (m + 0.5) + (f % 2 ? 0.12 : -0.12);
      k.box(w / 2 - 0.1, fl - 0.08, d, f % 2 ? '#e6e0e3' : '#d8d2cc', mx, y, z, { r: 0.12, jitter: 0.03, shade: 0.08 });
      for (let rx = -w / 4 + 0.4; rx < w / 4 - 0.2; rx += 0.6) k.box(0.08, fl - 0.5, 0.06, '#c3bcc7', mx + rx, y + 0.2, z - d / 2 - 0.02, { r: 0, jitter: 0, shade: 0 });
    }
    k.box(w + 0.06, 0.22, d + 0.06, BANDS[f % BANDS.length], cx, y + fl - 0.42, z, { r: 0.03, shade: 0 });
    // the front: doors and windows along a gallery
    const fz = z + d / 2;
    for (let i = 0; i < Math.floor(w / 2.4); i++) {
      const px = x0 + 1.2 + i * 2.4;
      k.box(0.8, 2.0, 0.08, BANDS[(f + i) % BANDS.length], px - 0.5, y + 0.05, fz + 0.03, { r: 0, jitter: 0.05 });
      const lit = h.r() < 0.22 + (floors - 3) * 0.06;
      (lit ? h.lit : h.glass).box(0.9, 0.9, 0.06, lit ? '#ffffff' : '#4a6b78', px + 0.55, y + 1.0, fz + 0.03, { r: 0, jitter: 0.03, shade: 0 });
      k.box(1.06, 0.08, 0.14, H.white, px + 0.55, y + 0.94, fz + 0.06, { r: 0 });
    }
    if (f > 0) {
      // a gallery with a railing
      k.box(w + 0.8, 0.16, 1.3, '#9d95a6', cx, y - 0.1, fz + 0.65, { r: 0.02 });
      k.beam(V(x0 - 0.4, y + 1.0, fz + 1.25), V(x1 + 0.4, y + 1.0, fz + 1.25), 0.06, H.steelD);
      for (let px = x0 - 0.3; px <= x1 + 0.35; px += 1.0) k.box(0.05, 1.0, 0.05, H.steelD, px, y, fz + 1.25, { r: 0, jitter: 0 });
      if (h.r() < 0.5) {
        const p = x0 + 1 + h.r() * (w - 2);
        k.box(0.6, 0.35, 0.3, H.timber, p, y + 1.0, fz + 1.35, { r: 0.03 });
        h.leaf.geo(blob(0.3, h.r).translate(p, y + 1.45, fz + 1.35), H.ivyL, 0.18);
      }
    }
    if (f > 0) for (const px of [x0 - 0.3, x1 + 0.3]) k.box(0.14, fl, 0.14, H.steelD, px, y - fl, fz + 1.25, { r: 0 });
  }
  const top = 0.3 + floors * fl;
  k.box(w + 0.2, 0.3, d + 0.2, '#7a7186', cx, top - 0.05, z, { r: 0.04 });
  // roof: a water tank, pipes, a planter garden
  k.cyl(1.0, 1.0, 1.6, '#c3bcc7', x0 + 1.6, top, z - 0.8, 12);
  k.cyl(1.04, 1.04, 0.2, H.teal, x0 + 1.6, top + 1.1, z - 0.8, 12, { shade: 0 });
  for (const dz of [-1.6, -1.1]) k.geo(new THREE.CylinderGeometry(0.14, 0.14, w - 2, 8).rotateZ(Math.PI / 2).translate(cx + 1, top + 0.45, z + dz), '#9d95a6', 0.02, 0);
  for (let i = 0; i < 3; i++) {
    k.box(1.6, 0.5, 0.9, H.timber, x1 - 1.5 - i * 1.9, top + 0.2, z + 1.4, { r: 0.04 });
    for (let j = 0; j < 3; j++) h.leaf.geo(blob(0.26, h.r).translate(x1 - 2.0 - i * 1.9 + j * 0.5, top + 0.85, z + 1.4), j % 2 ? H.ivyL : '#7dae3f', 0.2);
  }
  h.sign(label, 1.4, x0 + 0.9, top - 1.2, z + d / 2 + 0.06, H.white, '#1c8780', 0, 0.7);
  return top;
}
export function habDorms(o: Act3SetOpts): Piece {
  const n = lv(o);
  const seed = o.seed + (o.vseed ?? 0) * 29;
  const h = new Hab(seed, o.w, o.d);
  const floors = 3 + Math.min(2, n);
  paving(h, 0, 4.6, 27.0, 11.6, '#cfc7bb', '#b7ad9e', 1.6);
  const t1 = dormBlock(h, -13.0, -1.8, -6.4, 5.6, floors, 'D-1');
  const t2 = dormBlock(h, 2.4, 13.0, -6.4, 5.6, floors - 1, 'D-2');
  // the outside stair between them: flights and landings
  const sx = 0.3, fz = -2.2;
  for (let f = 0; f < floors - 1; f++) {
    const y0 = 0.3 + f * 2.9, y1 = y0 + 2.9;
    const up = f % 2 === 0;
    h.k.beam(V(sx - 0.8, up ? y0 : y0 + 1.45, fz + (up ? 0.2 : 1.6)), V(sx + 0.8, up ? y0 + 1.45 : y1, fz + (up ? 1.6 : 0.2)), 0.16, '#7a7186');
    for (let st = 0; st < 8; st++) {
      const t = st / 8;
      const yy = (up ? y0 : y0 + 1.45) + t * 1.45, zz = fz + (up ? 0.2 + t * 1.4 : 1.6 - t * 1.4);
      h.k.box(1.6, 0.08, 0.32, '#9d95a6', sx, yy, zz, { r: 0 });
    }
    h.k.box(2.2, 0.14, 1.4, '#9d95a6', sx, y0 + 1.45, fz + (up ? 1.6 : 0.2), { r: 0.02 });
    for (const lx of [sx - 1.1, sx + 1.1]) h.k.box(0.12, 2.9, 0.12, H.steelD, lx, y0, fz + 0.9, { r: 0 });
  }
  // washing strung across the gap, pipes along the fronts
  for (let f = 1; f < floors - 1; f++) laundry(h, -1.6, -3.0 - f * 0.1, 2.2, -3.0, 0.3 + f * 2.9 + 1.9);
  // the canteen kiosk, its tables, bikes, planters
  const kx = 7.6, kz = 5.0;
  h.k.box(4.6, 3.0, 3.0, '#e6e0e3', kx, 0, kz, { r: 0.1 });
  h.k.box(4.8, 0.3, 3.2, '#f08a46', kx, 3.0, kz, { r: 0.04 });
  h.lit.box(3.0, 1.1, 0.06, '#ffffff', kx, 1.2, kz + 1.52, { r: 0, jitter: 0, shade: 0 });
  h.k.box(3.4, 0.14, 0.9, '#f08a46', kx, 2.5, kz + 1.9, { r: 0.02 });
  h.sign('CANTEEN', 2.6, kx, 3.55, kz + 1.62, H.white, null, 0, 0.6);
  for (let i = 0; i < 3; i++) table(h, 3.0 + i * 2.4, 8.4, null, 3);
  for (let i = 0; i < 2 + n; i++) bike(h, -12.4 + i * 0.75, 0.8, Math.PI / 2);
  for (let i = 0; i < 3; i++) vegBed(h, -9 + i * 2.8, 6.0, 2.2, 1.1, 0, 0.6 + n * 0.12);
  h.tree('birch', -12.4, 8.6, 1.0 + n * 0.08);
  h.tree('broadleaf', 12.4, 9.0, 0.9 + n * 0.1);
  // trees in planters, benches, a hedge along the street
  for (const [px, pz] of [[-3.0, 2.6], [4.0, 1.8]] as [number, number][]) {
    h.k.box(1.8, 0.55, 1.8, '#a39a91', px, 0, pz, { r: 0.08 });
    h.tree('broadleaf', px, pz, 0.8 + n * 0.1, 0.55);
    bench(h, px, pz + 1.6, 0);
  }
  hedge(h, -13.4, 10.6, -1.0, 10.6, 0.8, 0.6);
  // people: residents on their way, a chat at the canteen
  h.walk([[-12, 1.6], [0.2, -1.2], [12, 1.4]], null, { pause: [2, 6] });
  h.walk([[0.3, -1.0], [4, 7.0], [10, 7.4]], 'engineer');
  h.chat(5.2, 7.0, 2);
  if (n >= 1) h.walk([[-13, 3.4], [6, 3.2]], 'worker');
  if (n >= 2) { h.stand(-6, 4.4, 0.4, 'worker'); h.walk([[12, 10.4], [-11, 10.0]]); }
  if (n >= 3) h.chat(-10.4, 9.8, 3);
  return h.finish(Math.max(t1, t2) + 1.8);
}

// ── a new district going up ──────────────────────────────────────────────────────────────────
export function habBuild(o: Act3SetOpts): Piece {
  const seed = o.seed + (o.vseed ?? 0) * 37;
  const h = new Hab(seed, o.w, o.d);
  const acc: Paint = o.accent ?? '#f08a46', hi: Paint = o.hi ?? '#fbd46e';
  const k = h.k;
  patch(k, 0, -1.6, 26.0, 15.0, '#c4b8a6', 0.0, 0.06);
  // home one: walls up in timber panels, window holes, a roof truss waiting
  const a = new At(-5.8, 0, -5.6);
  a.box(k, 8.4, 0.34, 6.4, '#b3a999', 0, 0, 0, 0.05);
  a.box(k, 8.0, 3.0, 0.24, H.timberL, 0, 0.32, -2.9, 0.03, 0.06, 0.1);
  a.box(k, 0.24, 3.0, 6.0, H.timberL, -3.9, 0.32, 0, 0.03, 0.06, 0.1);
  a.box(k, 0.24, 3.0, 6.0, H.timberL, 3.9, 0.32, 0, 0.03, 0.06, 0.1);
  for (const px of [-3.0, -0.2, 2.6]) {
    a.box(k, 1.8, 3.0, 0.24, H.timberL, px, 0.32, 2.9, 0.03, 0.06, 0.1);
  }
  for (const [px, py] of [[-1.6, 1.3], [1.2, 1.3]]) a.box(k, 1.0, 1.2, 0.3, '#5f3b28', px, 0.32 + py, 2.9, 0, 0.02, 0);
  a.box(k, 8.2, 0.24, 6.2, H.timber, 0, 3.32, 0, 0.03, 0.04, 0);
  for (let i = 0; i < 5; i++) {
    const tx = -3.6 + i * 1.8;
    a.beam(k, V(tx, 3.55, -3.0), V(tx, 5.3, 0), 0.14, H.timberD);
    a.beam(k, V(tx, 5.3, 0), V(tx, 3.55, 3.0), 0.14, H.timberD);
  }
  a.beam(k, V(-3.8, 5.3, 0), V(3.8, 5.3, 0), 0.16, H.timberD);
  // scaffold round it
  for (let i = 0; i <= 5; i++) for (const sz of [-3.6, 3.6]) k.box(0.08, 5.0, 0.08, acc, -10.0 + i * 1.7, 0, -5.6 + sz, { r: 0 });
  for (const yy of [1.7, 3.4]) for (const sz of [-3.6, 3.6]) {
    k.box(8.6, 0.06, 0.06, acc, -5.8, yy + 0.9, -5.6 + sz, { r: 0 });
    k.box(8.6, 0.08, 0.7, H.timberL, -5.8, yy, -5.6 + sz + (sz > 0 ? 0.35 : -0.35), { r: 0 });
  }
  // home two: a frame of posts and beams on its slab
  const b = new At(5.4, 0, -5.8);
  b.box(k, 7.2, 0.34, 6.0, '#b3a999', 0, 0, 0, 0.05);
  for (const px of [-3.2, -1.1, 1.1, 3.2]) for (const pz of [-2.6, 2.6]) b.box(k, 0.26, 5.6, 0.26, H.timberL, px, 0.32, pz, 0.03, 0.06, 0.1);
  for (const pz of [-2.6, 2.6]) for (const yy of [3.0, 5.8]) b.box(k, 6.8, 0.3, 0.28, H.timber, 0, yy, pz, 0.03, 0.05, 0);
  for (const px of [-3.2, 0, 3.2]) b.box(k, 0.26, 0.3, 5.5, H.timber, px, 3.0, 0, 0.03, 0.05, 0);
  b.box(k, 6.6, 0.18, 2.6, H.timberL, 0, 3.3, -1.3, 0.02, 0.04, 0);
  for (const [x0, x1] of [[-3.2, -1.1], [1.1, 3.2]]) b.beam(k, V(x0, 0.4, 2.62), V(x1, 2.9, 2.62), 0.08, H.timberD);
  // the crane, in the builder's colours, swinging a panel over
  const cr = towerCrane(17, 15, acc, hi, seed);
  cr.position.set(1.0, floorY(1.0) , 1.0);
  cr.scale.setScalar(0.9);
  h.g.add(cr);
  const hook = cr.userData.hook as THREE.Object3D;
  const load = new Kit(rng(seed + 5));
  load.box(3.0, 0.24, 1.4, H.timberL, 0, -2.6, 0, { r: 0.03 });
  hook.children[0].add(load.build());
  h.anim.add((e) => workCrane(cr, e, 2.3, 0.9, 6));
  // laydown: panel stacks, window crates, the cabins, the board
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) k.box(2.6, 0.2, 1.3, j % 2 ? H.timberL : H.timber, -10.4 + i * 3.0, 0.06 + j * 0.21, 3.2, { r: 0.02 });
  for (let i = 0; i < 3; i++) k.box(1.2, 1.4, 0.4, '#a07848', -1.6 + i * 1.4, 0, 3.4, { r: 0.03 });
  const glow: [number, number, number, number, number, number?][] = [];
  cabin(k, glow, 9.2, 5.0, 6.0, 2.6, MP.cream, acc);
  cabin(k, glow, 9.2, 5.0, 6.0, 2.6, MP.cream, acc, 2.95);
  const bd = builderBoard(o.label || 'AURORA', 5.0, acc, hi);
  bd.position.set(-5.4, 2.6 + floorY(10.0), 10.0);
  h.g.add(bd);
  for (const sx of [-2.3, 2.3]) k.box(0.18, 3.4, 0.18, '#7a7186', -5.4 + sx, 0, 9.9, { r: 0.02 });
  hoarding(k, -13.6, 13.6, 10.6, acc, hi, [[-1.6, 2.8]]);
  // the crew
  h.walk([[-10, 1.2], [-2.4, 1.0], [-2.6, 6.8]], 'worker', { pause: [2, 5] });
  h.walk([[2.0, 0.6], [8.0, 1.4], [8.2, 3.2]], 'worker', { pause: [2, 6] });
  h.stand(-7.6, -1.4, 0.4, 'engineer');
  h.stand(4.4, -2.0, -0.3, 'worker');
  if ((o.n ?? 0) >= 2) h.chat(9.4, 7.6, 2, CREW);
  return h.finish(18);
}
