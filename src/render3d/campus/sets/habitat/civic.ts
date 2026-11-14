/**
 * Aurora's civic places: the school (a bell tower, a playground with swings and a slide, a court),
 * the park (a pond with ducks, big trees, a bandstand with festoon lights) and the town square
 * (the town hall with its clock and Aurora's flag, a fountain, a café, market stalls).
 */
import * as THREE from 'three';
import { col, Kit, rng, type Paint } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import {
  At, bench, bike, blobOutline, BRIGHT, crates, festoon, flag, floorY, flowerBed, gable, greenRoof, Hab, H, hedge, lampPost, patch, paving,
  pondMat, poolWaterMat, stoneEdge, strip, table, TAU, V, water, win,
} from './common';

const lv = (o: Act3SetOpts) => Math.max(0, Math.min(3, o.n ?? 1));
/** Aurora's own colours: green and gold. */
const AURORA = ['#5a9537', '#5a9537', '#fbd46e', '#3f7b35', '#3f7b35'];

/** A clock face (white disc, gold rim) with hands that turn, facing +z at (x, y, z). */
function clock(h: Hab, x: number, y: number, z: number, r: number) {
  const fy = floorY(z);
  h.k.cyl(r + 0.12, r + 0.12, 0.12, H.gold, x, y + fy, z, 18, { rx: Math.PI / 2, shade: 0 });
  h.k.cyl(r, r, 0.14, H.white, x, y + fy, z + 0.02, 18, { rx: Math.PI / 2, shade: 0 });
  const mat = new THREE.MeshStandardMaterial({ color: col(H.ink), roughness: 0.7 });
  const hands: THREE.Mesh[] = [];
  for (const [len, t] of [[r * 0.85, 0.08], [r * 0.55, 0.12]] as [number, number][]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, 0.04).translate(0, len / 2 - 0.05, 0), mat);
    m.position.set(x, y + fy, z + 0.12);
    h.g.add(m);
    hands.push(m);
  }
  h.anim.add((e) => {
    hands[0].rotation.z = -e.t * 0.25;
    hands[1].rotation.z = -e.t * 0.25 / 12 - 1.2;
  });
}

// ── the school ───────────────────────────────────────────────────────────────────────────────
export function habSchool(o: Act3SetOpts): Piece {
  const n = lv(o);
  const stations = o.variant === 'stations';
  const seed = o.seed + (o.vseed ?? 0) * 17;
  const h = new Hab(seed, o.w, o.d);
  const r = rng(seed);
  const wall: Paint = stations ? '#e6e0e3' : H.sand, wall2: Paint = stations ? '#c3bcc7' : '#e9d29a', trim: Paint = stations ? H.teal : '#93243a';
  // the main block: two storeys, rows of tall windows, a cornice, a green roof
  const a = new At(-5, 0, -7.2);
  const bw = 16, bd = 5.6;
  a.box(h.k, bw + 0.4, 0.34, bd + 0.4, H.stone, 0, 0, 0, 0.06);
  a.box(h.k, bw, 6.1, bd, wall, 0, 0.3, 0, 0.12, 0.03, 0.12);
  a.box(h.k, bw + 0.1, 0.25, bd + 0.1, wall2, 0, 3.2, 0, 0.04, 0.02, 0);
  a.box(h.k, bw + 0.3, 0.5, bd + 0.3, trim, 0, 6.35, 0, 0.06, 0.03, 0);
  greenRoof(h, a, bw, bd, 6.8, 0, 0, n);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 6; i++) {
      const x = -bw / 2 + 1.4 + i * 2.65;
      if (Math.abs(x) < 1.6) continue;
      win(h, a, x, 1.0 + row * 3.05, bd / 2, 1.5, 1.8, r() < 0.25 + n * 0.08, H.white);
    }
  // the bell tower over the door, its clock, the sign
  const tx = -5, tz = -4.2;
  h.k.box(3.0, 11.4, 2.6, wall, tx, 0, tz - 0.4, { r: 0.1, jitter: 0.03, shade: 0.12 });
  h.k.box(3.1, 0.3, 2.7, trim, tx, 8.6, tz - 0.4, { r: 0.04 });
  for (const [sx, sz] of [[-1.2, 0.7], [1.2, 0.7], [-1.2, -1.5], [1.2, -1.5]]) h.k.box(0.5, 2.2, 0.5, wall, tx + sx, 8.9, tz + sz, { r: 0.05 });
  h.k.geo(new THREE.CylinderGeometry(0.45, 0.65, 0.8, 10).translate(tx, 9.9, tz - 0.4), H.goldD, 0.03);
  h.k.box(3.3, 0.3, 2.9, trim, tx, 11.1, tz - 0.4, { r: 0.04 });
  h.k.geo(new THREE.ConeGeometry(2.3, 2.4, 4, 1).rotateY(Math.PI / 4).translate(tx, 12.6, tz - 0.4), trim, 0.04);
  h.k.geo(new THREE.SphereGeometry(0.16, 8, 6).translate(tx, 13.9, tz - 0.4), H.gold, 0);
  clock(h, tx, 7.0, tz + 0.92, 0.75);
  h.k.box(1.6, 2.4, 0.14, H.timberD, tx, 0.32, tz + 0.9, { r: 0.04 });
  h.k.box(2.6, 0.14, 1.3, trim, tx, 2.9, tz + 1.5, { r: 0.03 });
  h.sign('AURORA SCHOOL', 3.6, tx, 4.4, tz + 0.95, H.white, '#264276');
  // the classroom wing, forward on the left: glass doors onto the court
  const wa = new At(-10.6, 0, -1.0);
  wa.box(h.k, 4.8, 3.4, 6.0, wall, 0, 0.3, 0, 0.1, 0.03, 0.12);
  wa.box(h.k, 5.0, 0.34, 6.2, H.stone, 0, 0, 0, 0.06);
  greenRoof(h, wa, 4.8, 6.0, 3.7, 0, 0, n);
  for (let i = 0; i < 2; i++) {
    const ra = new At(-10.6, 0, -1.0, Math.PI / 2);
    win(h, ra, -1.4 + i * 2.8, 0.6, 2.4, 2.0, 2.2, r() < 0.4, H.white, false);
  }
  // the court: green with white lines, two little goals
  patch(h.k, -5.4, 6.8, 13.0, 6.8, '#5f8f4a', 0.02, 0.06);
  for (const [x0, z0, x1, z1] of [[-11.6, 3.6, 0.8, 3.6], [-11.6, 10.0, 0.8, 10.0], [-11.6, 3.6, -11.6, 10.0], [0.8, 3.6, 0.8, 10.0], [-5.4, 3.6, -5.4, 10.0]] as [number, number, number, number][]) strip(h.k, x0, z0, x1, z1, 0.1, H.white, 0.08, 0.02);
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * TAU;
    h.k.box(0.32, 0.02, 0.1, H.white, -5.4 + Math.cos(t) * 1.3, 0.08, 6.8 + Math.sin(t) * 1.3, { r: 0, ry: -t + Math.PI / 2, jitter: 0, shade: 0 });
  }
  for (const gx of [-11.3, 0.5]) {
    const s = gx < 0 ? 1 : -1;
    for (const gz of [5.8, 7.8]) h.k.box(0.1, 1.3, 0.1, H.white, gx, 0, gz, { r: 0 });
    h.k.box(0.1, 0.1, 2.1, H.white, gx, 1.3, 6.8, { r: 0 });
    h.k.beam(V(gx, 1.3, 5.8), V(gx - s * 0.6, 0, 5.8), 0.05, H.white);
    h.k.beam(V(gx, 1.3, 7.8), V(gx - s * 0.6, 0, 7.8), 0.05, H.white);
  }
  // the playground: soft ground, swings, a slide, a climbing dome, a sandpit
  patch(h.k, 8.4, -3.2, 9.2, 9.6, '#c97a56', 0.02, 0.07);
  patch(h.k, 9.6, 2.6, 5.6, 3.0, '#4f9aa0', 0.03, 0.07);
  // swings (they swing)
  const sx0 = 8.4, sz = -6.4;
  for (const s of [-1, 1]) {
    h.k.beam(V(sx0 + s * 2.2, 0, sz - 0.8), V(sx0 + s * 2.0, 2.6, sz), 0.12, H.red);
    h.k.beam(V(sx0 + s * 2.2, 0, sz + 0.8), V(sx0 + s * 2.0, 2.6, sz), 0.12, H.red);
  }
  h.k.box(4.4, 0.16, 0.16, '#93243a', sx0, 2.55, sz, { r: 0.03 });
  for (let i = 0; i < 2; i++) {
    const sw = new THREE.Group();
    const sk = new Kit(rng(seed + i));
    for (const dx of [-0.25, 0.25]) sk.box(0.03, 1.9, 0.03, H.steelD, dx, -1.95, 0, { r: 0, jitter: 0 });
    sk.box(0.6, 0.06, 0.28, H.yellow, 0, -2.0, 0, { r: 0.02 });
    sw.add(sk.build());
    sw.position.set(sx0 - 0.9 + i * 1.8, 2.55 + floorY(sz), sz);
    h.g.add(sw);
    const ph = i * 1.7;
    const amp = 0.35 + n * 0.08;
    h.anim.add((e) => { sw.rotation.x = Math.sin(e.t * 2.1 + ph) * amp; });
  }
  // the slide
  const lx = 11.8, lz = 1.6;
  for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) h.k.box(0.1, 1.9, 0.1, H.steelD, lx + dx, 0, lz + dz, { r: 0 });
  h.k.box(1.1, 0.12, 1.1, H.blue, lx, 1.9, lz, { r: 0.03 });
  h.k.geo(new THREE.ConeGeometry(0.85, 0.7, 4, 1).rotateY(Math.PI / 4).translate(lx, 3.1, lz), H.red, 0.04);
  for (const dx of [-0.45, 0.45]) h.k.box(0.08, 1.0, 0.08, H.steelD, lx + dx, 2.0, lz + 0.45, { r: 0 });
  for (let y = 0.3; y < 1.9; y += 0.35) h.k.box(0.9, 0.06, 0.06, H.steelD, lx, y, lz - 0.5, { r: 0 });
  const chute = new THREE.BoxGeometry(0.7, 0.08, 3.0).rotateX(-0.58).translate(lx, 1.05, lz + 1.65);
  h.k.geo(chute, H.yellow, 0.03, 0);
  for (const dx of [-0.36, 0.36]) h.k.geo(new THREE.BoxGeometry(0.06, 0.24, 3.0).rotateX(-0.58).translate(lx + dx, 1.18, lz + 1.65), '#f08a46', 0.03, 0);
  // the climbing dome
  const dome = new THREE.IcosahedronGeometry(1.5, 1);
  const dp = dome.attributes.position;
  const seen = new Set<string>();
  for (let i = 0; i < dp.count; i += 3)
    for (let j = 0; j < 3; j++) {
      const p = V(dp.getX(i + j), dp.getY(i + j), dp.getZ(i + j)), q = V(dp.getX(i + ((j + 1) % 3)), dp.getY(i + ((j + 1) % 3)), dp.getZ(i + ((j + 1) % 3)));
      if (p.y < -0.05 && q.y < -0.05) continue;
      const key = [p, q].map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      p.y = Math.max(0, p.y); q.y = Math.max(0, q.y);
      h.k.beam(p.add(V(6.0, 0, 1.4)), q.add(V(6.0, 0, 1.4)), 0.07, i % 2 ? H.teal : H.yellow);
    }
  // a sandpit
  h.k.box(2.4, 0.25, 2.0, H.timber, 7.4, 0, -1.6, { r: 0.05 });
  h.k.box(2.2, 0.06, 1.8, H.straw, 7.4, 0.22, -1.6, { r: 0 });
  // trees, a fence round the yard, bikes
  h.tree('broadleaf', 13.0, -9.0, 1.1 + n * 0.15);
  h.tree('broadleaf', 12.8, 8.4, 0.9 + n * 0.15);
  h.tree('birch', 4.4, 8.6, 0.9 + n * 0.1);
  for (const [x0, z0, x1, z1] of [[3.6, 10.0, 13.4, 10.0], [13.4, -10.2, 13.4, 10.0]] as [number, number, number, number][]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0; t <= len; t += 1.2) h.k.box(0.08, 1.1, 0.08, H.steelD, x0 + ((x1 - x0) * t) / len, 0, z0 + ((z1 - z0) * t) / len, { r: 0 });
    h.k.beam(V(x0, 1.05, z0), V(x1, 1.05, z1), 0.05, H.steelD);
    h.k.beam(V(x0, 0.5, z0), V(x1, 0.5, z1), 0.04, H.steelD);
  }
  for (let i = 0; i < 1 + n; i++) bike(h, 0.4 + i * 0.75, -2.4, Math.PI / 2);
  flowerBed(h, -1.6, -3.7, 2.0, 0.8);
  flowerBed(h, -8.4, -3.7, 2.0, 0.8);
  // the path from the door to the street, lunch tables in the yard, the flag
  strip(h.k, tx, -3.0, tx, 1.6, 1.6, H.path);
  strip(h.k, -8.0, 1.6, 2.6, 1.6, 1.6, H.path);
  strip(h.k, 2.2, 1.6, 2.2, 10.8, 1.6, H.path);
  strip(h.k, -13.6, 10.9, 13.6, 10.9, 1.2, H.path);
  for (const [px, pz] of [[-7.2, -1.2], [-2.6, -1.0]] as [number, number][]) {
    h.k.box(2.2, 0.08, 0.8, H.timberL, px, 0.74, pz, { r: 0.02 });
    for (const s of [-0.75, 0.75]) h.k.box(2.2, 0.06, 0.3, H.timberL, px, 0.44, pz + s, { r: 0.02 });
    for (const sx of [-0.85, 0.85]) h.k.box(0.08, 0.74, 1.8, H.timberD, px + sx, 0, pz, { r: 0 });
  }
  flag(h, 0.8, 0.4, 7.0, AURORA, 1.8);
  // children everywhere, a teacher keeping an eye
  const kids = 2 + n * 2;
  const spots: [number, number, number][] = [[-8, 6.2, 2.4], [-3, 7.4, 2.2], [8.4, -3.2, 1.6], [10.4, 3.0, 1.4], [6.0, 1.4, 1.4], [-6, 5.2, 1.6], [9.0, -0.8, 1.2], [-1.5, 6.4, 1.8]];
  for (let i = 0; i < kids; i++) h.kid(spots[i % spots.length][0], spots[i % spots.length][1], spots[i % spots.length][2]);
  h.stand(4.6, -2.4, -0.6, 'office');
  if (n >= 2) h.stand(-7.0, 2.8, 0.4, 'researcher');
  return h.finish(14.2);
}

const duckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

// ── the park ─────────────────────────────────────────────────────────────────────────────────
export function habPark(o: Act3SetOpts): Piece {
  const n = lv(o);
  const priv = o.variant === 'private';
  const seed = o.seed + (o.vseed ?? 0) * 13;
  const h = new Hab(seed, o.w, o.d);
  const r = rng(seed);
  // the path round the pond and on to the bandstand
  const loop: [number, number][] = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * TAU;
    loop.push([-3.6 + Math.cos(t) * 9.4, 0.6 + Math.sin(t) * 7.0]);
  }
  for (let i = 0; i + 1 < loop.length; i++) strip(h.k, loop[i][0], loop[i][1], loop[i + 1][0], loop[i + 1][1], 1.4, H.path);
  strip(h.k, 5.6, -1.0, 9.0, -3.2, 1.4, H.path);
  strip(h.k, -3.6, 7.6, -3.6, 11.4, 1.4, H.path);
  // the pond: water, a stone edge, reeds, lily pads, a little jetty
  const pond = blobOutline(-3.8, 0.4, 6.0, 3.6, r);
  // (the bed is the pond's own outline: a rectangle under it showed its corners past the stones)
  h.k.geo(new THREE.ShapeGeometry(new THREE.Shape(pond.map(([x, z]) => new THREE.Vector2(x, -z))), 4).rotateX(-Math.PI / 2).translate(0, 0.03, 0), '#3d6a70', 0.02, 0);
  water(h, pond, 0.16, pondMat);
  stoneEdge(h, pond, 0.55);
  for (let i = 0; i < 16; i++) {
    // reeds in clumps along the far bank (the shared grass tufts, grown tall)
    const [px, pz] = pond[Math.floor(r() * 9) + 9];
    const x = px + (r() - 0.5) * 0.7, z = pz + (r() - 0.5) * 0.7;
    h.tree('tuft', x, z, 1.5 + r() * 0.9, 0.08, 0.82);
  }
  for (let i = 0; i < 6; i++) h.leaf.cyl(0.32, 0.32, 0.03, '#5a9537', -6 + r() * 6, 0.17, -0.6 + r() * 2.4, 9, { shade: 0 });
  h.k.box(1.6, 0.2, 2.4, H.deck, -3.8, 0.12, 4.6, { r: 0.03 });
  for (const [dx, dz] of [[-0.7, 3.6], [0.7, 3.6]]) h.k.box(0.14, 0.3, 0.14, H.timberD, -3.8 + dx, 0, dz, { r: 0 });
  // ducks gliding round
  const duck = new Kit(rng(4));
  duck.box(0.34, 0.2, 0.5, H.white, 0, 0, 0, { r: 0.08 });
  duck.box(0.16, 0.22, 0.16, '#3f7b35', 0, 0.16, 0.24, { r: 0.05 });
  duck.box(0.08, 0.05, 0.12, H.orange, 0, 0.26, 0.36, { r: 0 });
  const duckGeo = duck.build().geometry;
  for (let i = 0; i < 2 + Math.min(2, n); i++) {
    const d = new THREE.Mesh(duckGeo, duckMat);
    d.castShadow = true;
    h.g.add(d);
    const ph = i * 2.1, rx = 2.0 + i * 0.7, rz = 1.2 + i * 0.4, sp = 0.12 + i * 0.03;
    h.anim.add((e) => {
      const t = e.t * sp + ph;
      const x = -3.8 + Math.cos(t) * rx, z = 0.4 + Math.sin(t) * rz;
      d.position.set(x, 0.16 + floorY(z) + Math.sin(e.t * 3 + ph) * 0.01, z);
      d.rotation.y = -t;
    });
  }
  // the bandstand: an octagon of white columns under a green roof, festoon lights
  const bx = 9.6, bz = -5.2;
  h.k.cyl(3.0, 3.2, 0.6, H.stone, bx, 0, bz, 8, { shade: 0.15 });
  h.k.box(1.6, 0.3, 0.8, H.stone, bx - 1.6, 0, bz + 2.9, { r: 0.04, ry: -0.5 });
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * TAU + Math.PI / 8;
    h.k.cyl(0.12, 0.14, 3.0, H.white, bx + Math.cos(t) * 2.6, 0.6, bz + Math.sin(t) * 2.6, 8);
  }
  h.k.cyl(3.25, 3.25, 0.3, H.white, bx, 3.6, bz, 8, { shade: 0 });
  const roof = new THREE.ConeGeometry(3.4, 1.8, 8, 1);
  h.k.geo(roof.translate(bx, 4.8, bz), '#3f7b35', 0.04, 0);
  h.k.geo(new THREE.ConeGeometry(0.2, 0.8, 6).translate(bx, 6.1, bz), H.gold, 0);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * TAU + Math.PI / 8;
    h.k.box(0.16, 0.36, 0.16, i % 2 ? '#5a9537' : H.gold, bx + Math.cos(t) * 3.3, 3.55, bz + Math.sin(t) * 3.3, { r: 0.03 });
  }
  for (const [px, pz] of [[4.4, -1.6], [13.6, -1.0]]) {
    h.k.box(0.14, 3.0, 0.14, H.frame, px, 0, pz, { r: 0 });
    festoon(h, V(bx + (px < bx ? -2.8 : 2.8), 3.5 + floorY(bz), bz + 1.0), V(px, 3.0 + floorY(pz), pz), 0.5, 9);
  }
  if (priv) {
    h.k.box(1.8, 0.8, 0.1, H.ink, bx, 4.0, bz + 3.2, { r: 0.03 });
    h.sign('CLUB', 1.4, bx, 4.15, bz + 3.27, H.gold, null, 0, 0.6);
  } else {
    h.stand(bx - 0.8, bz + 0.6, 0.3, 'office');
    h.stand(bx + 0.9, bz + 0.2, -0.3, 'engineer');
  }
  // big trees round the edge, benches facing the water, beds along the front
  const trees: [string, number, number, number][] = [['broadleaf', -12.6, -8.6, 2.0], ['blossom', -6.4, -9.6, 1.3], ['birch', 1.4, -9.8, 1.5], ['pine', -13.2, 2.0, 1.2], ['broadleaf', 12.8, 6.8, 1.9], ['blossom', 4.8, 8.8, 1.1], ['broadleaf', -12.0, 8.8, 1.5]];
  for (const [k, x, z, s] of trees) h.tree(k as 'broadleaf', x, z, s * (0.85 + n * 0.06));
  for (const [x, z, ry] of [[-9.8, 7.2, Math.PI * 0.85], [2.6, 7.0, Math.PI * 1.1], [4.6, -4.6, -0.6], [-11.8, -3.6, Math.PI * 0.55]] as [number, number, number][]) bench(h, x, z, ry);
  flowerBed(h, 8.6, 9.6, 6.0, 1.2);
  flowerBed(h, -12.0, 4.6, 1.4, 2.4);
  hedge(h, 6.2, -10.6, 13.8, -10.6, 1.0, 0.8);
  lampPost(h, 6.0, 1.0);
  lampPost(h, -13.0, -1.2);
  // a picnic on the grass
  if (n >= 1) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) h.k.box(0.5, 0.03, 0.5, (i + j) % 2 ? H.white : H.red, 8.0 + i * 0.5, 0.02, 5.0 + j * 0.5, { r: 0, jitter: 0.02, shade: 0 });
    h.k.box(0.5, 0.36, 0.34, H.timberL, 9.6, 0.05, 5.0, { r: 0.05 });
    h.chat(9.0, 6.6, 2);
  }
  // people strolling the loop, kids by the water
  const strolls = Math.max(1, n);
  for (let i = 0; i < strolls; i++) {
    const off = Math.floor((i / strolls) * 28);
    const path = [...loop.slice(off), ...loop.slice(0, off)].filter((_, j) => j % 3 === 0);
    h.walk(i % 2 ? path.reverse() : path, null, { pause: [1, 4], speed: 0.9 });
  }
  if (n >= 2) { h.kid(-9.2, 3.8, 1.2); h.kid(1.8, 4.8, 1.0); }
  if (n >= 3) {
    h.kid(-0.4, -4.8, 1.2);
    // a dog
    h.k.box(0.3, 0.32, 0.7, H.timberD, 3.2, 0.28, 3.6, { r: 0.1 });
    h.k.box(0.26, 0.26, 0.3, H.timberD, 3.2, 0.5, 4.0, { r: 0.08 });
    for (const [dx, dz] of [[-0.1, -0.25], [0.1, -0.25], [-0.1, 0.25], [0.1, 0.25]]) h.k.box(0.07, 0.3, 0.07, H.timberD, 3.2 + dx, 0, 3.6 + dz, { r: 0 });
  }
  return h.finish(8);
}

// ── the square ───────────────────────────────────────────────────────────────────────────────
export function habSquare(o: Act3SetOpts): Piece {
  const n = lv(o);
  const priv = o.variant === 'private';
  const seed = o.seed + (o.vseed ?? 0) * 11;
  const h = new Hab(seed, o.w, o.d);
  const r = rng(seed);
  paving(h, 0, 2.6, 25.0, 15.6, H.paving, H.pavingD, 1.6);
  // the town hall: steps, a portico of columns under a pediment, the clock tower and the flag
  const hx = -5.0, hz = -7.4, hw = 14, hd = 5.6;
  h.k.box(hw + 0.6, 0.4, hd + 0.6, H.stone, hx, 0, hz, { r: 0.06 });
  h.k.box(hw, 6.0, hd, '#e6e0e3', hx, 0.36, hz, { r: 0.12, jitter: 0.03, shade: 0.12 });
  for (let s = 0; s < 3; s++) h.k.box(hw - 2 - s * 0.01, 0.2, 1.0 - s * 0.3, H.stone, hx, s * 0.2, hz + hd / 2 + 1.6 - s * 0.3, { r: 0.03 });
  h.k.box(hw - 1.6, 0.25, 2.2, H.stone, hx, 0.36, hz + hd / 2 + 0.9, { r: 0.04 });
  for (let i = 0; i < 6; i++) {
    const cx = hx - hw / 2 + 1.6 + i * ((hw - 3.2) / 5);
    h.k.cyl(0.26, 0.3, 4.6, H.white, cx, 0.6, hz + hd / 2 + 1.5, 12);
    h.k.box(0.7, 0.24, 0.7, H.white, cx, 5.2, hz + hd / 2 + 1.5, { r: 0.04 });
  }
  h.k.box(hw - 1.0, 0.7, 2.6, '#f1ece4', hx, 5.4, hz + hd / 2 + 1.0, { r: 0.06 });
  h.k.geo(gable(hw - 1.0, 2.6 + hd, 1.6, 6.1).translate(hx, 0, hz + 1.3), '#d6e2f0', 0.03, 0.05);
  h.sign('AURORA', 2.6, hx, 5.5, hz + hd / 2 + 2.36, H.gold, '#2f2a3d', 0, 0.55);
  for (let i = 0; i < 5; i++) win(h, new At(), hx - hw / 2 + 2.2 + i * 2.4, 1.6, hz + hd / 2, 1.0, 2.4, r() < 0.35, H.white, false);
  h.k.box(1.4, 2.6, 0.12, H.timberD, hx, 0.6, hz + hd / 2 + 0.03, { r: 0.04 });
  // the clock tower behind the pediment
  const cx = hx, cz = hz - 0.4;
  h.k.box(3.0, 12.2, 3.0, '#e6e0e3', cx, 0, cz, { r: 0.1, jitter: 0.03, shade: 0.1 });
  h.k.box(3.3, 0.3, 3.3, H.white, cx, 9.6, cz, { r: 0.05 });
  h.k.box(3.3, 0.3, 3.3, H.white, cx, 12.2, cz, { r: 0.05 });
  h.k.geo(new THREE.ConeGeometry(2.4, 2.2, 4, 1).rotateY(Math.PI / 4).translate(cx, 13.6, cz), H.teal, 0.04);
  clock(h, cx, 10.9, cz + 1.56, 0.95);
  flag(h, cx, cz, 17.4, AURORA, 2.6);
  // the fountain: a basin, a column with two bowls, water arcing out
  const fx = -3.6, fz = 4.0;
  h.k.cyl(2.6, 2.7, 0.3, H.stone, fx, 0, fz, 22, { shade: 0.1 });
  h.k.geo(new THREE.TorusGeometry(2.45, 0.22, 6, 28).rotateX(Math.PI / 2).scale(1, 1.6, 1).translate(fx, 0.62, fz), '#e6dccb', 0.03, 0);
  h.k.cyl(2.3, 2.3, 0.1, '#2c6f86', fx, 0.28, fz, 22, { shade: 0 });
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.04, 22, 1).translate(fx, 0.55, fz), poolWaterMat);
  h.mesh(fw);
  h.k.cyl(0.28, 0.36, 2.0, '#e6dccb', fx, 0.5, fz, 10);
  h.k.cyl(1.0, 0.4, 0.35, '#e6dccb', fx, 1.5, fz, 14);
  h.k.cyl(0.9, 0.9, 0.04, '#55b6c8', fx, 1.84, fz, 14, { shade: 0 });
  h.k.cyl(0.5, 0.2, 0.25, '#e6dccb', fx, 2.4, fz, 12);
  h.k.geo(new THREE.SphereGeometry(0.16, 8, 6).translate(fx, 2.75, fz), H.gold, 0);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.7, 6).translate(fx, 3.1 + floorY(fz), fz), new THREE.MeshStandardMaterial({ color: col('#e6f6f8'), roughness: 0.2, transparent: true, opacity: 0.6 }));
  h.g.add(spout);
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 5, 4), new THREE.MeshStandardMaterial({ color: col('#e6f6f8'), emissive: col('#9fd8e6'), emissiveIntensity: 0.25, roughness: 0.2, transparent: true, opacity: 0.85 }), 48);
  drops.castShadow = false;
  h.g.add(drops);
  const dm = new THREE.Matrix4();
  const fy = floorY(fz);
  h.anim.add((e) => {
    for (let i = 0; i < 48; i++) {
      const jet = i % 8, k = Math.floor(i / 8);
      const a = (jet / 8) * TAU;
      const t = ((e.t * 0.8 + k / 6) % 1);
      const top = jet % 2 === 0;
      const reach = top ? 0.95 : 2.1, up = top ? 0.6 : 0.45;
      const rr = (top ? 0.1 : 0.9) + reach * t, y = (top ? 3.3 : 1.9) + up * 4 * t * (1 - t) - (top ? 1.5 : 1.3) * t * t;
      dm.makeTranslation(fx + Math.cos(a) * rr, y + fy, fz + Math.sin(a) * rr);
      drops.setMatrixAt(i, dm);
    }
    drops.instanceMatrix.needsUpdate = true;
  });
  // the café: a striped awning, big windows, tables with umbrellas, festoon lights
  const kx = 7.4, kz = -7.6;
  h.k.box(8.6, 0.3, 5.0, H.stone, kx, 0, kz, { r: 0.05 });
  h.k.box(8.2, 3.6, 4.6, H.render, kx, 0.28, kz, { r: 0.1, jitter: 0.03, shade: 0.12 });
  greenRoof(h, new At(), 8.2, 4.6, 3.88, kx, kz, n);
  for (let i = 0; i < 2; i++) win(h, new At(), kx - 2.2 + i * 4.4, 0.8, kz + 2.3, 2.6, 2.0, true, H.timberD, false);
  h.k.box(1.0, 2.3, 0.12, H.timberD, kx, 0.3, kz + 2.33, { r: 0.03 });
  const stripe: Paint = priv ? '#2f2a3d' : H.red;
  for (let i = 0; i < 12; i++) h.k.geo(new THREE.BoxGeometry(0.72, 0.06, 1.7).rotateX(0.38).translate(kx - 4.0 + i * 0.72 + 0.36, 3.1, kz + 3.05), i % 2 ? H.white : stripe, 0.03, 0);
  h.k.box(8.7, 0.25, 0.08, stripe, kx, 2.55, kz + 3.85, { r: 0 });
  h.sign(priv ? 'MAISON' : 'CAFÉ', 1.6, kx, 3.75, kz + 2.34, H.white, null, 0, 0.6);
  const umb: Paint[] = [H.yellow, H.orange, H.yellow];
  for (let i = 0; i < 3; i++) table(h, kx - 3 + i * 3, -1.4, priv ? H.white : umb[i], 3);
  festoon(h, V(kx + 4.0, 3.3 + floorY(kz + 2.4), kz + 2.4), V(12.2, 3.2 + floorY(3.6), 3.6), 0.6, 10);
  h.k.box(0.14, 3.2, 0.14, H.frame, 12.2, 0, 3.6, { r: 0 });
  // market stalls along the front
  const stalls = n === 0 ? 1 : Math.min(3, n + 1);
  for (let i = 0; i < stalls; i++) {
    const sx = 9.6 - i * 3.6, sz = 7.6;
    for (const [dx, dz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) h.k.box(0.08, 2.2, 0.08, H.timberD, sx + dx, 0, sz + dz, { r: 0 });
    h.k.box(2.8, 0.9, 1.4, H.timberL, sx, 0, sz, { r: 0.04 });
    const c = BRIGHT[(i * 2 + seed) % BRIGHT.length];
    for (const s of [-1, 1]) h.k.geo(new THREE.BoxGeometry(3.0, 0.05, 1.0).rotateX(s * 0.4).translate(sx, 2.35, sz + s * 0.45), s < 0 ? c : H.white, 0.03, 0);
    crates(h, sx, sz + 0.1, 3, 0);
    if (i < 2) h.stand(sx + (r() - 0.5), sz + 1.6, Math.PI, 'office');
  }
  // trees in round planters with benches round them, lamps
  for (const [tx, tz, kind] of [[-11.2, 1.2, 'broadleaf'], [-11.2, 8.8, 'blossom'], [2.6, 9.2, 'broadleaf']] as [number, number, 'broadleaf'][]) {
    h.k.cyl(1.2, 1.3, 0.55, H.stone, tx, 0, tz, 12, { shade: 0.1 });
    h.k.cyl(1.0, 1.0, 0.06, H.soil, tx, 0.52, tz, 12, { shade: 0 });
    h.tree(kind, tx, tz, (kind === 'broadleaf' ? 1.0 : 0.9) + n * 0.14, 0.5);
  }
  bench(h, -8.6, 9.8, Math.PI);
  lampPost(h, 1.6, 0.2);
  lampPost(h, -11.6, -3.6);
  hedge(h, -12.4, -4.4, -12.4, -1.4, 0.9, 0.8);
  for (let i = 0; i < n + 1; i++) bike(h, -0.4 + i * 0.75, -3.8, Math.PI / 2);
  // people about
  const walkers = 1 + n;
  const paths: [number, number][][] = [[[-12, 10.5], [11, 10.2]], [[-4, -3.4], [-4, 1.0], [2, 6.4], [9, 4]], [[11.6, 1], [-10, 2.4]], [[-9.6, 6], [-0.6, 7.8]], [[5, -1.0], [5.6, 9.4]], [[-6.4, 0.4], [4, 0.2]], [[-12, 4], [0, 4.6]], [[2, 10.6], [-7, 10.4]]];
  for (let i = 0; i < walkers; i++) h.walk(paths[i % paths.length], null, { pause: [1, 5] });
  h.chat(-0.4, 4.6, 2);
  if (n >= 2) h.chat(4.6, 1.2, 2);
  if (n >= 3) h.kid(-3.6, 6.8, 1.4);
  return h.finish(17.6);
}
