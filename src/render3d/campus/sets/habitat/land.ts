/**
 * Aurora's working land: the farm (stepped crop terraces, an orchard, a barn and a glasshouse —
 * or, for the work stations, a hydroponics hall under pink grow lights) and the works (water tanks,
 * pipes, the pump house, heat exchangers venting).
 */
import * as THREE from 'three';
import { Kit, rng } from '../../../kit';
import { Plume } from '../../../fx';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { pipeRun, pipeStands, shed, tank } from '../../plants2/parts';
import { At, blob, crates, floorY, gable, greenRoof, growMat, Hab, H, hedge, patch, picket, pondMat, strip, V, vegBed, win } from './common';

const lv = (o: Act3SetOpts) => Math.max(0, Math.min(3, o.n ?? 1));
const glassHouseMat = new THREE.MeshStandardMaterial({ color: 0xd6eaf0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });

// ── the farm ─────────────────────────────────────────────────────────────────────────────────
/** One crop terrace: a stone retaining wall, soil, and rows of a crop. */
function terrace(h: Hab, x0: number, x1: number, z0: number, z1: number, y: number, crop: 'wheat' | 'greens' | 'beans' | 'roots', grown: number) {
  const k = h.k, w = x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = z1 - z0;
  k.box(w, y, d, '#b3a999', cx, 0, cz, { r: 0.08, jitter: 0.03, shade: 0.2 });
  for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.1) k.box(0.9, y * 0.45, 0.06, '#a39a91', x, y * 0.3, z1 + 0.01, { r: 0.03, jitter: 0.06, shade: 0 });
  k.box(w - 0.2, 0.08, d - 0.2, H.soil, cx, y - 0.02, cz, { r: 0, jitter: 0.03, shade: 0 });
  const rows = Math.round((d - 0.4) / 0.62);
  for (let j = 0; j < rows; j++) {
    const z = z0 + 0.5 + j * ((d - 0.8) / Math.max(1, rows - 1));
    if (crop === 'wheat') {
      h.leaf.box(w - 0.5, 0.55 + grown * 0.15, 0.48, j % 2 ? H.wheat : '#e0b86a', cx, y + 0.02, z, { r: 0.1, jitter: 0.06, shade: 0.35 });
      for (let x = x0 + 0.5; x < x1 - 0.4; x += 0.5) h.dot(x + (h.r() - 0.5) * 0.3, y + 0.62 + grown * 0.15, z + (h.r() - 0.5) * 0.3, 0.1, '#e6c784');
    } else if (crop === 'greens') {
      for (let x = x0 + 0.45; x < x1 - 0.3; x += 0.62) h.leaf.geo(blob(0.22 + grown * 0.04 + h.r() * 0.05, h.r).translate(x, y + 0.15, z), j % 2 ? '#7dae3f' : '#8fb552', 0.18);
    } else if (crop === 'roots') {
      for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.42) h.leaf.geo(new THREE.ConeGeometry(0.14, 0.4 + grown * 0.05, 4).translate(x, y + 0.2, z), j % 2 ? '#4f8a3a' : '#5a9537', 0.2);
    } else {
      // beans up poles
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.0) {
        k.beam(V(x - 0.2, y, z), V(x, y + 1.6, z), 0.04, H.timberD);
        k.beam(V(x + 0.2, y, z), V(x, y + 1.6, z), 0.04, H.timberD);
        for (let yy = 0.3; yy < 1.5; yy += 0.4) h.leaf.geo(blob(0.2, h.r).translate(x + (h.r() - 0.5) * 0.2, y + yy, z), H.ivyL, 0.2);
      }
    }
  }
}

export function habFarm(o: Act3SetOpts): Piece {
  const n = lv(o);
  const stations = o.variant === 'stations';
  const seed = o.seed + (o.vseed ?? 0) * 7;
  const h = new Hab(seed, o.w, o.d);
  const r = rng(seed);
  const grown = o.variant === 'early' ? Math.max(0, n - 1) : n;
  // the farm track from the lane to the barn, an irrigation channel between the terraces and the yard
  strip(h.k, 0.6, 12.4, 0.6, -11.6, 2.2, '#cdb994');
  strip(h.k, -16.4, 11.4, 16.4, 11.4, 1.6, '#cdb994');
  strip(h.k, -1.2, 10.4, -1.2, -11.6, 0.7, '#9d95a6', 0.0, 0.18);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 22, 1, 1, 18).translate(-1.2, 0.2, -0.6), pondMat);
  h.mesh(ch);
  // the terraces, stepping up towards the back
  const crops: ('wheat' | 'greens' | 'beans' | 'roots')[] = ['greens', 'wheat', 'beans', 'wheat'];
  const tz: [number, number, number][] = [[6.6, 10.0, 0.4], [3.0, 6.6, 0.85], [-0.6, 3.0, 1.3], [-4.2, -0.6, 1.75]];
  tz.forEach(([z0, z1, y], i) => terrace(h, -16.2, -2.2, z0, z1, y, crops[(i + seed) % crops.length], grown));
  // the orchard behind
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) h.tree('fruit', -14.4 + i * 3.6 + (j ? 1.6 : 0), -6.8 - j * 3.4, 0.7 + grown * 0.12 + r() * 0.1);
  hedge(h, -16.4, -11.8, -3.0, -11.8, 0.9, 0.7);
  // a farm robot working down the front terrace
  const bot = new THREE.Group();
  const bk = new Kit(rng(seed + 3));
  bk.box(1.1, 0.4, 0.7, '#e6e0e3', 0, 0.25, 0, { r: 0.1 });
  bk.box(1.12, 0.1, 0.72, H.green, 0, 0.55, 0, { r: 0.03 });
  for (const dx of [-0.35, 0.35]) for (const dz of [-0.38, 0.38]) bk.cyl(0.18, 0.18, 0.1, '#2f2a3d', dx, 0.18, dz, 10, { rx: Math.PI / 2, shade: 0 });
  bk.box(0.5, 0.1, 0.5, '#2c3f6e', 0, 0.65, 0, { r: 0.02 });
  bot.add(bk.build());
  h.g.add(bot);
  h.anim.add((e) => {
    const t = (Math.sin(e.t * 0.12 + seed) * 0.5 + 0.5);
    const x = -15.4 + t * 12.4, z = 8.3;
    bot.position.set(x, 0.4 + floorY(z), z);
    bot.rotation.y = Math.cos(e.t * 0.12 + seed) > 0 ? 0 : Math.PI;
  });
  if (stations) {
    // the hydroponics hall: racks under grow lights, seen through a glass front
    const hx = 9.0, hz = -3.6, hw = 13.0, hd = 9.0, hh = 5.2;
    shed(h.k, hx, hz, hw, hd, hh, { wall: '#d8d2cc', roof: '#7a7186', ribs: 1.6, band: H.teal });
    // a glazed bay along the front: racks of greens under pink grow lights
    const wz = hz + hd / 2 + 0.25, fz = wz + 1.5;
    h.k.box(hw - 1.6, hh - 1.0, 0.06, '#2f2a3d', hx, 0.5, wz + 0.04, { r: 0 });
    h.k.box(hw - 1.0, 0.25, 1.7, '#7a7186', hx, hh - 0.6, wz + 0.8, { r: 0.04 });
    h.k.box(hw - 1.0, 0.3, 1.7, H.stone, hx, 0, wz + 0.8, { r: 0.04 });
    for (let lvl = 0; lvl < 3; lvl++) {
      const y = 0.7 + lvl * 1.3;
      h.k.box(hw - 2.0, 0.08, 0.7, '#9d95a6', hx, y, wz + 0.6, { r: 0 });
      for (let x = hx - hw / 2 + 1.4; x < hx + hw / 2 - 1.2; x += 0.42) h.leaf.geo(blob(0.17, h.r).translate(x, y + 0.2, wz + 0.6), (Math.round(x * 3) % 2) ? '#7dae3f' : '#5a9537', 0.2);
      h.mesh(new THREE.Mesh(new THREE.BoxGeometry(hw - 2.0, 0.07, 0.25, 8, 1, 1).translate(hx, y + 0.95, wz + 0.6), growMat));
    }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(hw - 1.0, hh - 1.4, 0.06, 8, 1, 1).translate(hx, 0.3 + (hh - 1.4) / 2, fz), glassHouseMat);
    glass.renderOrder = 3;
    h.mesh(glass);
    for (let x = hx - (hw - 1.0) / 2; x <= hx + (hw - 1.0) / 2 + 0.01; x += (hw - 1.0) / 10) h.k.box(0.1, hh - 1.3, 0.12, '#5b5562', x, 0.3, fz, { r: 0 });
    for (const sx of [-1, 1]) h.k.box(0.1, hh - 1.3, 1.6, '#5b5562', hx + (sx * (hw - 1.0)) / 2, 0.3, wz + 0.8, { r: 0 });
    h.sign('HYDRO', 2.4, hx, hh + 0.1, wz + 0.05, '#f7a6c4', '#2f2a3d', 0, 0.75);
    pipeRun(h.k, [V(hx + hw / 2 + 0.4, 0.6, hz - 2), V(hx + hw / 2 + 0.4, 3.6, hz - 2), V(hx + hw / 2 + 0.4, 3.6, hz + 2)], 0.2, '#9d95a6');
    for (let i = 0; i < 3; i++) tank(h.k, 12.6 - i * 2.6, 6.4, 0.8, 2.2, '#c3bcc7', { band: H.teal });
  } else {
    // the red barn: board walls, a grey roof, a white-framed door, a hayloft
    const bx = 8.6, bz = -6.4;
    const a = new At(bx, 0, bz);
    a.box(h.k, 7.6, 0.3, 6.4, H.stone, 0, 0, 0, 0.05);
    a.box(h.k, 7.2, 4.0, 6.0, '#a8343a', 0, 0.28, 0, 0.08, 0.03, 0.15);
    for (let x = -3.4; x < 3.6; x += 0.45) a.box(h.k, 0.06, 3.8, 0.06, '#8a2a30', x, 0.34, 3.02, 0, 0.03, 0);
    a.geo(h.k, gable(7.2, 6.0, 2.6, 4.26).rotateY(Math.PI / 2), '#7a7186', 0.03, 0.05);
    a.box(h.k, 2.4, 2.8, 0.1, '#93243a', 0, 0.3, 3.04, 0.02);
    for (const [p, q] of [[V(-1.2, 0.3, 3.1), V(1.2, 3.1, 3.1)], [V(1.2, 0.3, 3.1), V(-1.2, 3.1, 3.1)]]) a.beam(h.k, p, q, 0.12, H.white);
    for (const s of [-1, 1]) a.box(h.k, 0.12, 2.8, 0.14, H.white, s * 1.25, 0.3, 3.08, 0);
    a.box(h.k, 2.6, 0.12, 0.14, H.white, 0, 3.1, 3.08, 0);
    win(h, a, 0, 4.6, 3.0, 0.9, 0.8, false, H.white, false);
    // round hay bales and crates of produce
    for (let i = 0; i < 2 + grown; i++) h.k.cyl(0.7, 0.7, 1.2, H.straw, 4.0 + (i % 3) * 1.5, 0.7, -1.8 - Math.floor(i / 3) * 1.4, 14, { rx: Math.PI / 2, shade: 0.15 });
    crates(h, 12.6, -1.6, 3 + grown, 0);
    // the glasshouse: white frames over green rows
    const gx = 9.4, gz = 4.4, gw = 9.6, gd = 4.8, gh = 2.4;
    h.k.box(gw + 0.3, 0.3, gd + 0.3, H.stone, gx, 0, gz, { r: 0.04 });
    for (let x = -gw / 2; x <= gw / 2 + 0.01; x += gw / 8) {
      for (const s of [-1, 1]) h.k.box(0.08, gh, 0.08, H.white, gx + x, 0.3, gz + (s * gd) / 2, { r: 0 });
      for (const s of [-1, 1]) h.k.beam(V(gx + x, 0.3 + gh, gz + (s * gd) / 2), V(gx + x, 0.3 + gh + 1.2, gz), 0.07, H.white);
    }
    h.k.box(gw, 0.08, 0.08, H.white, gx, 0.3 + gh + 1.2, gz, { r: 0 });
    for (const s of [-1, 1]) h.k.box(gw, 0.08, 0.08, H.white, gx, 0.3 + gh, gz + (s * gd) / 2, { r: 0 });
    const walls = new THREE.BoxGeometry(gw, gh, gd, 8, 1, 4).translate(gx, 0.3 + gh / 2, gz);
    const roofG = gable(gw, gd, 1.2, 0.3 + gh, 0).translate(gx, 0, gz);
    const wm = new THREE.Mesh(walls, glassHouseMat), rm = new THREE.Mesh(roofG, glassHouseMat);
    wm.renderOrder = rm.renderOrder = 3;
    h.mesh(wm);
    h.mesh(rm);
    for (let j = 0; j < 3; j++) vegBed(h, gx, gz - 1.5 + j * 1.5, gw - 1.2, 0.8, 0, 0.8 + grown * 0.15);
  }
  // beehives, a hen house with its run, a wheelbarrow
  for (let i = 0; i < 4; i++) {
    const x = 4.0 + i * 1.3, z = 9.4;
    h.k.box(0.8, 0.3, 0.7, H.timberD, x, 0, z, { r: 0.02 });
    for (let j = 0; j < 3; j++) h.k.box(0.72, 0.3, 0.62, j === 1 ? H.yellow : H.white, x, 0.3 + j * 0.3, z, { r: 0.03, jitter: 0.04 });
    h.k.box(0.86, 0.1, 0.76, H.slate, x, 1.2, z, { r: 0.02 });
  }
  const cx = 13.2, cz = 9.0;
  h.k.box(2.4, 1.4, 1.8, H.timberL, cx, 0.4, cz - 2.2, { r: 0.05 });
  for (const s of [-1, 1]) h.k.geo(new THREE.BoxGeometry(2.6, 0.08, 1.2).rotateX(s * 0.6).translate(cx, 2.05, cz - 2.2 + s * 0.45), H.tile, 0.03, 0);
  for (const [dx, dz] of [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]]) h.k.box(0.12, 0.45, 0.12, H.timberD, cx + dx, 0, cz - 2.2 + dz, { r: 0 });
  picket(h, cx - 2.6, cz - 1.2, cx - 2.6, cz + 1.8, '#c3bcc7', 0.9);
  picket(h, cx - 2.6, cz + 1.8, cx + 2.6, cz + 1.8, '#c3bcc7', 0.9);
  picket(h, cx + 2.6, cz - 1.2, cx + 2.6, cz + 1.8, '#c3bcc7', 0.9);
  for (let i = 0; i < 4 + grown; i++) {
    const x = cx - 2 + h.r() * 4, z = cz - 0.8 + h.r() * 2.2;
    const c = h.pick([H.white, '#8c5a34', '#d98a5c']);
    h.k.box(0.26, 0.24, 0.36, c, x, 0.12, z, { r: 0.08, ry: h.r() * 6 });
    h.k.box(0.12, 0.14, 0.12, c, x, 0.34, z + 0.12, { r: 0.04 });
    h.k.box(0.05, 0.06, 0.05, H.red, x, 0.48, z + 0.13, { r: 0 });
  }
  const wb = new At(2.6, 0, 6.0, 0.6);
  wb.box(h.k, 1.0, 0.4, 0.7, '#4a7cb6', 0, 0.35, 0, 0.06);
  wb.geo(h.k, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10).rotateX(Math.PI / 2).translate(0.6, 0.2, 0), '#2f2a3d', 0.02);
  for (const s of [-0.25, 0.25]) wb.beam(h.k, V(0.4, 0.4, s), V(-1.0, 0.7, s), 0.06, H.timberD);
  wb.box(h.leaf, 0.8, 0.2, 0.55, '#7dae3f', 0, 0.7, 0, 0.08, 0.2, 0);
  // compost bins and a water butt by the track
  for (let i = 0; i < 3; i++) h.k.box(1.0, 0.9, 1.0, H.timber, 3.0, 0, 1.0 + i * 1.1, { r: 0.04 });
  h.k.cyl(0.45, 0.45, 1.0, '#4a7cb6', 3.0, 0, -0.6, 12);
  // people at work
  h.stand(-9.4, 5.2, 0.3, 'engineer');
  if (n >= 1) h.walk([[0.6, 11.6], [0.6, -4.0], [5.2, -2.6]], 'worker', { pause: [3, 7] });
  if (n >= 2) h.stand(-6.0, 1.4, -0.4, 'office');
  if (n >= 2) h.walk([[-15, 11.6], [-2.6, 11.2]], null);
  if (n >= 3) { h.kid(4.2, 10.0, 1.2); h.stand(-12.6, -8.8, 0.6, 'office'); }
  return h.finish(stations ? 6.4 : 7.4);
}

// ── the works ────────────────────────────────────────────────────────────────────────────────
export function habWorks(o: Act3SetOpts): Piece {
  const n = lv(o);
  const seed = o.seed + (o.vseed ?? 0) * 41;
  const h = new Hab(seed, o.w, o.d);
  const k = h.k;
  patch(k, 0, -2.4, 28.4, 15.2, '#c4b8a6', 0.0, 0.06);
  // the tanks: banded drums with ladders
  tank(k, -10.8, -6.6, 2.6, 8.0, '#d3d0cc', { band: H.teal, ladder: true, cap: 'dome' });
  tank(k, -5.6, -8.0, 2.0, 6.0, '#d3d0cc', { band: H.orange, ladder: true, cap: 'dome' });
  tank(k, -6.2, -3.2, 1.3, 3.6, '#c3bcc7', { band: H.teal, cap: 'cone' });
  // the pump house: clad walls, windows, its sign, a green roof
  const top = shed(k, 2.6, -6.0, 9.6, 6.2, 5.6, { wall: '#d8d2cc', roof: '#7a7186', ribs: 1.1, band: '#1c8780' });
  greenRoof(h, new At(), 9.0, 5.6, top - 0.25, 2.6, -6.0, n);
  for (let i = 0; i < 4; i++) win(h, new At(), -0.6 + i * 2.1, 2.6, -2.88, 1.3, 1.1, h.r() < 0.35, '#5b5562', false);
  k.box(2.4, 2.6, 0.12, '#9d95a6', 6.0, 0.3, -2.84, { r: 0.02 });
  for (let yy = 0.6; yy < 2.8; yy += 0.3) k.box(2.3, 0.04, 0.05, '#7a7186', 6.0, yy, -2.76, { r: 0, jitter: 0 });
  h.sign('WATER WORKS', 4.4, 1.0, 4.4, -2.82, H.white, '#1c8780', 0, 0.7);
  // pipes from the tanks into the pump house, on stands
  const p1 = [V(-8.2, 2.4, -6.6), V(-3.6, 2.4, -6.6), V(-3.6, 2.4, -5.0), V(-2.3, 2.4, -5.0)];
  const p2 = [V(-5.6, 1.4, -5.9), V(-5.6, 1.4, -4.6), V(-2.3, 1.4, -4.6)];
  pipeRun(k, p1, 0.32, '#9d95a6', { band: 1.6, bandPaint: H.teal });
  pipeRun(k, p2, 0.24, '#9d95a6', { band: 1.4, bandPaint: H.orange });
  pipeStands(k, p1, 0.32);
  pipeStands(k, p2, 0.24);
  // the heat exchangers: finned towers venting
  const ex: [number, number, number][] = [[9.4, -7.4, 9.0], [11.8, -5.0, 10.4], [12.4, -9.0, 7.8]];
  for (const [x, z, hh] of ex) {
    k.box(2.0, 0.4, 2.0, '#a39a91', x, 0, z, { r: 0.05 });
    k.box(1.4, hh, 1.4, '#c3bcc7', x, 0.4, z, { r: 0.06, jitter: 0.03, shade: 0.15 });
    for (let y = 1.0; y < hh; y += 0.45) k.box(1.7, 0.08, 1.7, '#9d95a6', x, y, z, { r: 0, jitter: 0 });
    k.box(1.7, 0.4, 1.7, '#7a7186', x, hh + 0.4, z, { r: 0.04 });
    k.cyl(0.5, 0.55, 0.6, '#9d95a6', x, hh + 0.8, z, 10);
    const pl = new Plume({ count: 16, life: 7, rise: 1.3, spread: 0.8, size0: 1.6, size1: 5.5, opacity: 0.55, radius: 0.4, wind: 0.25 }, seed + x);
    pl.obj.position.set(x, hh + 1.4 + floorY(z), z);
    h.g.add(pl.obj);
    h.anim.add((e) => pl.update(e));
  }
  pipeRun(k, [V(7.4, 1.8, -6.0), V(9.4, 1.8, -6.0), V(9.4, 1.8, -7.4)], 0.22, '#9d95a6');
  pipeRun(k, [V(7.4, 3.2, -4.4), V(11.8, 3.2, -4.4), V(11.8, 3.2, -5.0)], 0.22, '#9d95a6');
  // the clean-water basin out front, railed
  const bx = -4.4, bz = 3.6;
  k.box(9.4, 0.25, 4.4, '#a39a91', bx, 0, bz, { r: 0.06 });
  for (const s of [-1, 1]) k.box(9.4, 0.55, 0.4, '#b3a999', bx, 0, bz + s * 2.0, { r: 0.05 });
  for (const s of [-1, 1]) k.box(0.4, 0.55, 4.4, '#b3a999', bx + s * 4.5, 0, bz, { r: 0.05 });
  const wm = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.04, 3.6, 8, 1, 4).translate(bx, 0.44, bz), pondMat);
  h.mesh(wm);
  for (let x = bx - 4.6; x <= bx + 4.7; x += 1.15) for (const sz of [-2.15, 2.15]) k.box(0.06, 1.0, 0.06, H.yellow, x, 0.5, bz + sz, { r: 0 });
  for (const sz of [-2.15, 2.15]) k.beam(V(bx - 4.6, 1.45, bz + sz), V(bx + 4.6, 1.45, bz + sz), 0.05, H.yellow);
  k.box(0.6, 1.2, 0.6, '#9d95a6', bx + 5.2, 0, bz, { r: 0.04 });
  // a utility cart, greenery round the edge
  const cart = new At(6.2, 0, 3.8, 0.3);
  cart.box(k, 2.6, 0.7, 1.3, '#e6e0e3', 0, 0.35, 0, 0.1);
  cart.box(k, 0.9, 1.0, 1.25, '#1c8780', 0.8, 1.0, 0, 0.08);
  for (const dx of [-0.85, 0.85]) for (const dz of [-0.62, 0.62]) cart.geo(k, new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10).rotateX(Math.PI / 2).translate(dx, 0.3, dz), '#2f2a3d', 0.02);
  hedge(h, 2.0, 9.6, 13.6, 9.6, 0.9, 0.7);
  h.tree('broadleaf', -12.8, 8.4, 1.0 + n * 0.12);
  h.tree('birch', 12.8, 6.4, 0.9 + n * 0.1);
  crates(h, -12.4, 2.0, 3, 0.4);
  // the crew in overalls
  h.walk([[-8.4, -1.6], [4.4, -1.8], [8, -2.4]], 'worker', { pause: [2, 6] });
  h.stand(-2.2, -2.2, 0.8, 'worker');
  if (n >= 2) h.walk([[10.6, -2.4], [10.4, 2.6], [-9, 2.2]], 'engineer', { pause: [3, 6] });
  if (n >= 3) h.stand(5.4, 5.6, -2.4, 'worker');
  return h.finish(12);
}
