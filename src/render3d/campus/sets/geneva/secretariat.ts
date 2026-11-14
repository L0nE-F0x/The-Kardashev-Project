/**
 * The Charter's secretariat: a long glass slab between solid stone ends, lifted on a colonnade of
 * pilotis over a glazed lobby, with a vertical forest of planters on every floor, the Charter's
 * name in gold on a blue crown, a solar pergola and roof garden on top, a lower wing with a meadow
 * roof, and the twelve blocs' banners along the forecourt behind a reflecting pool.
 */
import * as THREE from 'three';
import { plantField } from '../../trees';
import { glowMat, Kit, lightPool, poolMat, rng, type Paint } from '../../../kit';
import { waterMaterial } from '../../water';
import { streetLamp, type Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { bench, CH, CHARTER_FLAG, emblemDisc, flagPole, Flags, glassMat, greenery, litGlass, litSign, lampMat, paving, People, plantedTree, type FlagSpec } from './common';

const STONE: Paint = '#ece6dc';
const STONE2: Paint = '#d6cdbf';
const TIMBER: Paint = '#c39d68';
const GLASS: Paint[] = ['#3c5f86', '#365a80', '#42688f', '#2f5178'];

/**
 * Still water in a stone basin: the scene's own water (ripples, the sky's mirror, the glints), a little clear so the
 * tiled floor shows through. Its geometry carries `aDepth` (see `basinWater`).
 */
export const waterMat = waterMaterial('#63b4c2', '#1c4a72');
waterMat.transparent = true;
waterMat.opacity = 0.8;
waterMat.userData.shared = true;

/**
 * A basin's water sheet with the depth the water look reads: clear and pale at the walls, bluer toward the middle
 * (always past the depth where that look draws surf: this is a pool, not a beach). A rectangle w × d, or a disc of
 * radius w when d is 0; flat at y = 0, centred.
 */
export function basinWater(w: number, d = 0) {
  const g = d ? new THREE.PlaneGeometry(w, d, Math.max(2, Math.round(w / 0.7)), Math.max(2, Math.round(d / 0.7))) : new THREE.CircleGeometry(w, 40);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const depth = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const edge = d ? Math.min(w / 2 - Math.abs(p.getX(i)), d / 2 - Math.abs(p.getZ(i))) : w - Math.hypot(p.getX(i), p.getZ(i));
    const t = Math.min(1, Math.max(0, edge / 1.1));
    depth[i] = 2.4 + t * t * (3 - 2 * t) * 2.8;
  }
  g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  const m = new THREE.Mesh(g, waterMat);
  m.receiveShadow = true;
  return m;
}

/** Fit a sign into a box (keeps its aspect). */
export function fit(s: THREE.Mesh, maxW: number, maxH: number) {
  const w = (s.geometry as THREE.PlaneGeometry).parameters.width, h = s.userData.signHeight as number;
  s.scale.setScalar(Math.min(maxW / w, maxH / h));
  return s;
}

/** A red aviation light (blinks by itself). */
export function beacon(g: THREE.Object3D, x: number, y: number, z: number, phase = 0) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat('red3', 0.2).clone());
  b.position.set(x, y, z);
  b.userData.beacon = phase;
  g.add(b);
}

/**
 * A glass curtain wall facing +z (or −z with `back`), storey by storey: bays between fins, some
 * lit at night. Adds the glass to `dark` or a lit kit; fins, slab edges and planters to `k`.
 */
function curtainWall(o: {
  k: Kit; dark: Kit; warm: Kit; cool: Kit; x0: number; x1: number; z: number; y0: number; storeys: number; sh: number;
  bay: number; seed: number; back?: boolean; planters?: boolean; accent?: Paint;
}) {
  const r = rng(o.seed);
  const dir = o.back ? -1 : 1;
  const W = o.x1 - o.x0;
  const nb = Math.round(W / o.bay), bay = W / nb;
  for (let s = 0; s < o.storeys; s++) {
    const y = o.y0 + s * o.sh;
    // floor slab edge
    o.k.box(W + 0.2, 0.42, 0.7, s === 0 && o.accent ? o.accent : STONE, (o.x0 + o.x1) / 2, y, o.z + dir * 0.12, { r: 0.06, jitter: 0.015, shade: 0 });
    // the bays: runs of lit and dark glass
    const busy = 0.25 + r() * 0.6;
    let run = 0, runLit = -1;
    const flush = (end: number) => {
      if (run === 0) return;
      const xa = o.x0 + (end - run) * bay, xb = o.x0 + end * bay;
      const kit = runLit === 0 ? o.dark : runLit === 1 ? o.warm : o.cool;
      kit.box(xb - xa, o.sh - 0.42, 0.12, GLASS[Math.floor(r() * GLASS.length)], (xa + xb) / 2, y + 0.42, o.z - dir * 0.18, { r: 0, jitter: 0.04, shade: 0.1 });
      run = 0;
    };
    for (let b = 0; b < nb; b++) {
      const lit = r() < busy ? (r() < 0.78 ? 1 : 2) : 0;
      if (lit !== runLit) { flush(b); runLit = lit; }
      run++;
    }
    flush(nb);
    // planters on the slab edge, spilling greenery (the vertical forest)
    if (o.planters && s > 0) {
      for (let b = 0; b < nb; b++) {
        if (r() < 0.22) continue;
        const x = o.x0 + (b + 0.5) * bay;
        o.k.box(bay * 0.8, 0.34, 0.42, '#9c6c3d', x, y + 0.42, o.z + dir * 0.28, { r: 0, jitter: 0.05 });
        greenery(o.k, x, y + 0.62, o.z + dir * 0.3, 0.68, o.seed * 31 + s * 17 + b, true);
        if (r() < 0.5) o.k.geo(new THREE.IcosahedronGeometry(0.28, 0).scale(1, 2.2, 0.7).translate(x + (r() - 0.5) * 0.6, y - 0.3, o.z + dir * 0.48), '#2c6233', 0.15);
      }
    }
  }
  // the roof slab edge
  o.k.box(W + 0.2, 0.42, 0.7, STONE, (o.x0 + o.x1) / 2, o.y0 + o.storeys * o.sh, o.z + dir * 0.12, { r: 0.06, jitter: 0.015, shade: 0 });
  // vertical timber fins between the bays
  for (let b = 0; b <= nb; b++) {
    const x = o.x0 + b * bay;
    o.k.box(0.13, o.storeys * o.sh, 0.5, TIMBER, x, o.y0, o.z + dir * 0.1, { r: 0, jitter: 0.04, shade: 0.05 });
  }
}

export function secretariat(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  g.name = 'set:secretariat';
  const seed = o.seed;
  const k = new Kit(rng(seed));
  const dark = new Kit(rng(seed + 1)), warm = new Kit(rng(seed + 2)), cool = new Kit(rng(seed + 3));
  const accent = o.accent ?? '#f7b258';
  const B = 0.2; // paving top
  // ── the ground: paving, the building's plinth, entrance steps ──
  paving(k, -25.6, -14.6, 25.6, 14.6, 0, 2.4);
  k.box(50, 0.45, 14.8, STONE2, 0.6, B, -5.6, { r: 0.08, shade: 0.1 });
  k.box(13, 0.3, 1.0, STONE2, -6, B, 2.3, { r: 0.04, shade: 0 });
  k.box(13, 0.15, 0.9, STONE2, -6, B, 3.2, { r: 0.04, shade: 0 });
  const P = B + 0.45;
  // ── the tower ──
  const TX0 = -23, TX1 = 11, TZ0 = -12, TZ1 = 0;
  const L0 = 5.6, SH = 3.1, N = 6, TOP = L0 + N * SH;
  // lobby: glazed, set back behind the pilotis
  warm.box(TX1 - TX0 - 1.4, L0 - P, 0.14, '#5d86a8', (TX0 + TX1) / 2, P, -2.2, { r: 0, jitter: 0.02 });
  dark.box(TX1 - TX0 - 1.4, L0 - P, 8.1, '#33475e', (TX0 + TX1) / 2, P, -6.5, { r: 0, jitter: 0 });
  for (let x = TX0 + 1.4; x < TX1 - 0.6; x += 1.6) k.box(0.1, L0 - P, 0.16, TIMBER, x, P, -2.1, { r: 0, jitter: 0.03 });
  k.box(TX1 - TX0 - 1.4, 0.3, 0.2, TIMBER, (TX0 + TX1) / 2, P + 2.6, -2.1, { r: 0, jitter: 0.02 });
  // pilotis along the front and the back
  for (let x = TX0 + 1.6; x < TX1 - 0.8; x += 2.9) {
    k.cyl(0.3, 0.3, L0 - P, '#f3eee6', x, P, -0.6, 12, { shade: 0.12 });
    k.cyl(0.3, 0.3, L0 - P, '#f3eee6', x, P, TZ0 + 0.6, 12, { shade: 0.12 });
  }
  // the upper slab: core, glass on both long faces, solid stone ends
  k.box(TX1 - TX0 - 0.8, TOP - L0, TZ1 - TZ0 - 0.9, '#3a4a5c', (TX0 + TX1) / 2, L0, (TZ0 + TZ1) / 2, { r: 0, jitter: 0 });
  curtainWall({ k, dark, warm, cool, x0: TX0 + 0.6, x1: TX1 - 0.6, z: TZ1 - 0.2, y0: L0, storeys: N, sh: SH, bay: 1.42, seed: seed + 11, planters: true, accent });
  curtainWall({ k, dark, warm, cool, x0: TX0 + 0.6, x1: TX1 - 0.6, z: TZ0 + 0.2, y0: L0, storeys: N, sh: SH, bay: 2.1, seed: seed + 12, back: true });
  for (const x of [TX0, TX1]) {
    k.box(1.2, TOP - L0 + 0.4, TZ1 - TZ0 + 0.5, STONE, x, L0 - 0.4, (TZ0 + TZ1) / 2, { r: 0.1, jitter: 0.02, shade: 0.1 });
    for (let y = L0 + 1.2; y < TOP - 0.5; y += SH) k.box(1.24, 0.08, TZ1 - TZ0 + 0.54, STONE2, x, y, (TZ0 + TZ1) / 2, { r: 0, jitter: 0, shade: 0 });
  }
  // the blue crown with the Charter's name, a gold rule under it
  k.box(TX1 - TX0 + 1.4, 2.6, TZ1 - TZ0 + 0.9, CH.field, (TX0 + TX1) / 2, TOP, (TZ0 + TZ1) / 2, { r: 0.1, jitter: 0.02, shade: 0.05 });
  k.box(TX1 - TX0 + 1.46, 0.2, TZ1 - TZ0 + 0.96, accent, (TX0 + TX1) / 2, TOP, (TZ0 + TZ1) / 2, { r: 0.03, jitter: 0, shade: 0 });
  const ROOF = TOP + 2.6;
  const name = fit(litSign(o.label || 'CHARTER', 20, accent, null, 1.1), 18, 1.9);
  name.position.set(-3.4, TOP + 1.38, TZ1 + 0.47);
  g.add(name);
  const em = emblemDisc(2.1, 0.6);
  em.position.set(-3.4 - (name.scale.x * (name.geometry as THREE.PlaneGeometry).parameters.width) / 2 - 1.1, TOP + 1.32, TZ1 + 0.47);
  g.add(em);
  // ── the roof: a solar pergola, a roof garden, plant, the Charter's flag ──
  k.box(TX1 - TX0 - 0.2, 0.12, TZ1 - TZ0 - 0.2, '#8d8794', (TX0 + TX1) / 2, ROOF, (TZ0 + TZ1) / 2, { r: 0, jitter: 0, shade: 0 });
  for (let x = -20.5; x <= 1.5; x += 5.5)
    for (const z of [-10.6, -1.6]) k.box(0.18, 2.0, 0.18, '#7a7186', x, ROOF, z, { r: 0, jitter: 0 });
  for (const z of [-10.6, -1.6]) k.box(22.4, 0.2, 0.22, '#7a7186', -9.5, ROOF + 2.0, z, { r: 0, jitter: 0 });
  const panels = new Kit(rng(seed + 5));
  for (let row = 0; row < 4; row++)
    for (let c = 0; c < 10; c++) panels.box(2.08, 0.07, 2.05, '#2c3f6e', -20.4 + c * 2.2, 0, -9.6 + row * 2.3, { r: 0, jitter: 0.06, shade: 0 });
  const pm = panels.build();
  pm.position.y = ROOF + 2.22;
  g.add(pm);
  k.box(7.6, 0.3, 9.6, '#4f7d3a', 6.4, ROOF, -6, { r: 0.08, jitter: 0.04, shade: 0 });
  plantedTree(k, 4.6, ROOF + 0.3, -8.4, 1.0, seed + 7);
  plantedTree(k, 8.6, ROOF + 0.3, -3.6, 0.85, seed + 8);
  for (let i = 0; i < 6; i++) greenery(k, 3.6 + (i % 3) * 2.4, ROOF + 0.25, -10.4 + Math.floor(i / 3) * 8.4, 0.6, seed + 40 + i, true);
  k.box(2.6, 1.3, 1.8, '#b9c2c4', 7.8, ROOF + 0.3, -9.6, { r: 0.1 });
  flagPole(k, -21.4, ROOF, -6, 6.4);
  for (const [x, z, ph] of [[TX0 - 0.4, TZ1 + 0.2, 0], [TX1 + 0.4, TZ1 + 0.2, 1.4], [TX0 - 0.4, TZ0 - 0.2, 2.2]] as const) beacon(g, x, ROOF + 0.3, z, ph);
  // ── the wing: three floors on a lobby, a meadow roof ──
  const WX0 = TX1 + 0.6, WX1 = 24.6, WZ0 = -12, WZ1 = -1.6, WTOP = L0 + 3 * SH;
  warm.box(WX1 - WX0 - 0.8, L0 - P, 0.14, '#5d86a8', (WX0 + WX1) / 2, P, WZ1 - 0.6, { r: 0, jitter: 0.02 });
  dark.box(WX1 - WX0 - 0.8, L0 - P, WZ1 - WZ0 - 1.4, '#33475e', (WX0 + WX1) / 2, P, (WZ0 + WZ1) / 2 - 0.4, { r: 0, jitter: 0 });
  for (let x = WX0 + 1.2; x < WX1 - 0.6; x += 1.6) k.box(0.1, L0 - P, 0.16, TIMBER, x, P, WZ1 - 0.5, { r: 0, jitter: 0.03 });
  k.box(WX1 - WX0 - 0.6, WTOP - L0, WZ1 - WZ0 - 0.9, '#3a4a5c', (WX0 + WX1) / 2, L0, (WZ0 + WZ1) / 2, { r: 0, jitter: 0 });
  curtainWall({ k, dark, warm, cool, x0: WX0 + 0.2, x1: WX1 - 0.6, z: WZ1 - 0.2, y0: L0, storeys: 3, sh: SH, bay: 1.42, seed: seed + 13, planters: true, accent });
  k.box(1.2, WTOP - P + 0.4, WZ1 - WZ0 + 0.5, STONE, WX1, P, (WZ0 + WZ1) / 2, { r: 0.1, jitter: 0.02, shade: 0.1 });
  k.box(WX1 - WX0 + 0.6, 0.6, WZ1 - WZ0 + 0.6, STONE, (WX0 + WX1) / 2, WTOP, (WZ0 + WZ1) / 2, { r: 0.08 });
  k.box(WX1 - WX0 - 0.4, 0.25, WZ1 - WZ0 - 0.4, '#6f9446', (WX0 + WX1) / 2, WTOP + 0.5, (WZ0 + WZ1) / 2, { r: 0.05, jitter: 0.05, shade: 0 });
  for (let i = 0; i < 10; i++) greenery(k, WX0 + 1.4 + (i % 5) * 2.4, WTOP + 0.7, WZ0 + 2 + Math.floor(i / 5) * 5.6, 0.5, seed + 60 + i, true);
  plantedTree(k, WX0 + 3.2, WTOP + 0.75, WZ0 + 4.6, 1.05, seed + 9);
  plantedTree(k, WX1 - 2.6, WTOP + 0.75, WZ0 + 3, 0.9, seed + 10);
  // ── the entrance: a timber-soffit canopy with the secretariat's name ──
  k.box(11, 0.62, 5.4, '#f3eee6', -6, 4.5, 2.1, { r: 0.08, shade: 0 });
  k.box(10.6, 0.06, 5.0, TIMBER, -6, 4.47, 2.1, { r: 0, jitter: 0.02, shade: 0 });
  for (const x of [-10.8, -1.2]) k.cyl(0.13, 0.13, 4.5 - B, '#7a7186', x, B, 4.66, 8);
  const ent = fit(litSign('SECRETARIAT', 8, '#2f2a3d', null, 0.2), 6, 0.42);
  ent.position.set(-6, 4.81, 4.82);
  g.add(ent);
  // ── the forecourt: a reflecting pool, the flag alley, benches, trees, lamps ──
  const PX0 = -17, PX1 = 5, PZ0 = 5.4, PZ1 = 8.2;
  {
    // the basin: a tiled floor, low stone walls under a coping of cut slabs that oversails them, the water a hand
    // below the coping's lip
    const pw = PX1 - PX0, pd = PZ1 - PZ0, cx = (PX0 + PX1) / 2, cz = (PZ0 + PZ1) / 2;
    const tr = rng(seed + 61);
    k.box(pw, 0.05, pd, '#33586b', cx, B, cz, { r: 0, jitter: 0, shade: 0 });
    const TILE: Paint[] = ['#5f9fb4', '#5593a9', '#69a9bc', '#4f8aa1'];
    const tn = Math.round(pw / 0.7), tm = Math.round(pd / 0.7), tw = pw / tn, td = pd / tm;
    for (let i = 0; i < tn; i++) for (let j = 0; j < tm; j++)
      k.box(tw - 0.04, 0.02, td - 0.04, TILE[Math.floor(tr() * TILE.length)], PX0 + (i + 0.5) * tw, B + 0.05, PZ0 + (j + 0.5) * td, { r: 0, jitter: 0.03, shade: 0 });
    const sides: [number, number, number, number][] = [[pw + 0.8, 0.4, cx, PZ0 - 0.2], [pw + 0.8, 0.4, cx, PZ1 + 0.2], [0.4, pd, PX0 - 0.2, cz], [0.4, pd, PX1 + 0.2, cz]];
    for (const [w, d, x, z] of sides) {
      k.box(w, 0.36, d, STONE2, x, B, z, { r: 0.02, jitter: 0.01, shade: 0.18 });
      // the coping, slab by slab
      const along = w > d, len = along ? w : d, n = Math.max(1, Math.round(len / 2.4)), step = len / n;
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * step;
        k.box(along ? step - 0.03 : 0.54, 0.09, along ? 0.54 : step - 0.03, STONE, along ? x + u : x, B + 0.36, along ? z : z + u, { r: 0.025, jitter: 0.025, shade: 0 });
      }
    }
    const water = basinWater(pw, pd);
    water.position.set(cx, B + 0.33, cz);
    g.add(water);
    // lamps under the water along the building's side: the pool glows at night
    const wl = lampMat('ice2', 1.6);
    for (let x = PX0 + 1.8; x < PX1 - 1; x += 3.68) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), wl);
      m.position.set(x, B + 0.18, PZ0 + 0.03);
      g.add(m);
    }
  }
  for (const x of [-12, -5, 1.5]) bench(k, x, B, 9.3, Math.PI);
  k.box(50, 0.03, 1.6, '#bfb5a6', 0, B, 11.6, { r: 0, jitter: 0, shade: 0 });
  const flags: FlagSpec[] = [];
  for (let i = 0; i < 12; i++) {
    const x = -23 + i * 4.05;
    flagPole(k, x, B, 11.6, 10);
    flags.push({ x: x + 0.08, y: B + 9.95, z: 11.6, banner: i, w: 2.9, h: 1.8 });
  }
  flags.push({ x: -21.32, y: ROOF + 6.35, z: -6, banner: CHARTER_FLAG, w: 3.1, h: 1.95 });
  const fl = new Flags(flags);
  g.add(fl.mesh);
  plantedTree(k, 9.5, B, 6.8, 1.15, seed + 21);
  plantedTree(k, -21.5, B, 6.2, 1.1, seed + 22);
  for (const x of [-24.4, 24.2]) for (const z of [-13.6, -9.4, -5.2]) greenery(k, x, B, z, 0.8, seed + 70 + x + z);
  g.add(plantField('oak', [{ x: 20.5, y: B, z: 5.2, s: 1.1, ry: 0.4 }, { x: -23, y: B, z: 1.6, s: 0.86, ry: 2.2 }]));
  for (const x of [-19, -7, 5, 17]) streetLamp(g, k, x, B, 13.9, 1);
  // ── night light: the canopy's downlights, lit lobby floors ──
  const dl = lampMat('yel1', 2.2);
  for (const x of [-9, -6, -3]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), dl);
    m.position.set(x, 4.44, 3.2);
    g.add(m);
  }
  const lobbyPool = poolMat('#ffe2b0', 0.55);
  lightPool(g, -6, B + 0.02, 3.6, 5.2, lobbyPool, 1.6);
  for (const x of [-18, 6, 17.5]) lightPool(g, x, P, -0.2, 3.2, lobbyPool, 1.4);
  // ── assemble ──
  g.add(k.build(), dark.build(glassMat), warm.build(litGlass('yel1', 0.8)), cool.build(litGlass('ice2', 0.6)));
  // people on the forecourt
  const ppl = new People(B);
  ppl.walk([[-19, 4.25], [7.5, 4.25], [7.5, 10.2], [-19, 10.2]]);
  ppl.walk([[-6, 3.4], [7, 4.6], [8, 12.8], [-4, 12.8], [-18.5, 12.8], [-19.4, 4.2]], 'office');
  ppl.walk([[12, 2.8], [23, 9.5], [14, 13.4]], 'researcher');
  ppl.walk([[-14, 13.2], [-24.5, 13.2], [-24.5, 3.2], [-19, 3.2], [-19, 10.5]]);
  ppl.stand(-14.2, 2.5, 0.4, 'office');
  ppl.stand(-13.5, 2.95, -2.6, 'engineer');
  ppl.stand(-1.8, 9.0, Math.PI, 'scientist');
  g.add(ppl.group);
  return {
    obj: g, w: 52, d: 30, h: ROOF + 7,
    // into the glazed lobby behind the pilotis, under the canopy, up the entrance steps onto the plinth
    doors: [{ x: -5.45, z: -2.2 + 0.7 }],
    ground: () => null,
    update(e) {
      fl.update(e);
      ppl.update(e);
    },
  };
}
