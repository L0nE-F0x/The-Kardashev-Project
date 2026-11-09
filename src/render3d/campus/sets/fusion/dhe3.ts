/**
 * The aneutronic D–He3 plant (Sunforge): sleek, white and gold, no steam and no big shielding.
 * A long white capsule on saddles, banded in gold coil rings, a glazed burn chamber in the middle
 * under a glowing halo ring; plasmoids race in from both ends along the slot and merge in a flash.
 * Power comes straight out through the gold-finned direct converter into an inverter hall —
 * no turbines, no cooling towers — with helium-3 canisters from the Moon on a rack, a reflecting
 * pool and trees.
 */
import * as THREE from 'three';
import { col, rng } from '../../../kit';
import type { Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import type { TreeKind } from '../../trees';
import { lakeMat, plants, switchyard } from '../../plants2/parts';
import {
  LiteKit, carPark, controlBlock, coreMat, Ctx, glowPool, halo, hcyl, lampsAt, P, plasmaGas, plasmaMat, seeGlass, shed, siteBase, stepUp, TAU, V,
} from './common';
import { windowRow } from '../../plants2/parts';

const PERIOD = 2.2;
const WHITE = '#f4f1ec', GOLD = '#fbd46e';

/** A canvas sign: a gold crescent Moon and HE-3 (the fuel's from the Moon). */
function crescentSign(w: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f2a3d';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = GOLD;
  g.beginPath(); g.arc(90, 80, 56, 0, TAU); g.fill();
  g.fillStyle = '#2f2a3d';
  g.beginPath(); g.arc(114, 64, 50, 0, TAU); g.fill();
  g.fillStyle = '#fbf7f0';
  g.font = `700 86px 'Atkinson Hyperlegible Next', system-ui, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText('HE-3', 180, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 160) / 512), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
}

const TREE_BY: Record<string, TreeKind> = { desert: 'shrub', boreal: 'pine', tropical: 'palm', savanna: 'acacia', volcanic: 'shrub', mountain: 'pine' };

export function dhe3Plant(o: Act3SetOpts): Piece {
  const c = new Ctx(o);
  const { k, g, W, D, r } = c;
  const roadX = 8.6;
  siteBase(c, roadX, 6.0, '#d6cfc5');
  k.box(3.0, 0.06, D - 8, P.asphalt, roadX, 0.02, 2.2, { r: 0.03, shade: 0, jitter: 0.02 });
  // ── the capsule ──
  const cx = -9.6, cy = 4.0, cz = -5.6, R = 2.3, len = 20;
  const x0 = cx - len / 2, x1 = cx + len / 2;
  k.box(len + 1.6, 0.7, 6.6, WHITE, cx, 0, cz, { r: 0.2, shade: 0.12 });
  k.box(len + 1.66, 0.14, 6.66, GOLD, cx, 0.4, cz, { r: 0.03, shade: 0 });
  for (let i = 0; i < 8; i++) {
    const x = x0 + 1.4 + (i * (len - 2.8)) / 7;
    if (Math.abs(x - cx) < 2.4) continue;
    k.box(0.9, cy - R + 0.5 - 0.7, 3.4, '#e3ded6', x, 0.7, cz, { r: 0.1, shade: 0.1 });
  }
  // shell in two halves round the glazed burn chamber, end caps, a dark slot along the front
  const burn = 1.7;
  for (const [a, b] of [[x0, cx - burn], [cx + burn, x1]]) hcyl(k, R, b - a, WHITE, (a + b) / 2, cy, cz, 'x', 36, 0);
  for (const [x, s] of [[x0, -1], [x1, 1]] as [number, number][]) k.geo(new THREE.SphereGeometry(R, 32, 12, 0, TAU, 0, Math.PI / 2).rotateZ((-s * Math.PI) / 2).scale(0.55, 1, 1).translate(x, cy, cz), WHITE, 0.02, 0);
  k.box(len - 5, 0.34, 0.12, '#2f2a3d', cx - 0.0, cy - 0.17, cz + R - 0.02, { r: 0, jitter: 0, shade: 0 });
  const inner = new LiteKit(rng(o.seed + 8));
  inner.geo(new THREE.CylinderGeometry(R * 0.9, R * 0.9, burn * 2, 24, 1, true).rotateZ(Math.PI / 2).translate(cx, cy, cz), '#3a3442', 0, 0);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, burn * 2, 32, 1, true).rotateZ(Math.PI / 2).translate(cx, cy, cz), seeGlass);
  glass.renderOrder = 3;
  // the gold coil rings (they glow as the plasmoids pass), the formation sections fatter
  const ringMat = plasmaMat(GOLD, 0.18);
  const rings = new LiteKit(rng(o.seed + 9));
  const ringXs: number[] = [];
  for (let x = x0 + 0.9; x < x1 - 0.5; x += 1.25) {
    if (Math.abs(x - cx) < burn + 0.4) continue;
    const fat = Math.abs(x - cx) > len / 2 - 4.5;
    rings.geo(new THREE.TorusGeometry(R + (fat ? 0.26 : 0.12), fat ? 0.26 : 0.17, 6, 36).rotateY(Math.PI / 2).translate(x, cy, cz), '#ffffff', 0, 0);
    ringXs.push(x);
  }
  // the halo ring round the burn chamber on two struts
  const haloMat = plasmaMat('#fde9a4', 0.8);
  const haloR = new THREE.Mesh(new THREE.TorusGeometry(R + 0.75, 0.34, 8, 48).rotateY(Math.PI / 2).translate(cx, cy, cz), haloMat);
  for (const s of [-1, 1]) k.box(0.42, cy - 0.7 - 0.2, 0.42, WHITE, cx, 0.7, cz + s * (R + 0.75), { r: 0.06 });
  k.box(0.5, 0.5, 0.5, GOLD, cx, cy + R + 0.95, cz, { r: 0.08 });
  // the plasmoids: two in the slot racing to the middle, a flash of gas in the chamber
  const pMat = coreMat('#fff6d8', 2.2);
  const plasmoids = [-1, 1].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(0.9, 0.11, 0.06), pMat);
    m.position.set(cx, cy, cz + R + 0.06);
    g.add(m);
    return m;
  });
  const gas = plasmaGas('#fde9a4', 1.3, 0.2);
  const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12).scale(1.5, 0.95, 0.95).translate(cx, cy, cz), gas.mat);
  blob.renderOrder = 4;
  g.add(inner.build(), glass, rings.build(ringMat), haloR, blob);
  const hl = halo([V(cx, cy, cz + R), V(cx, cy + R + 0.75, cz), V(cx, cy, cz + R + 0.75)], [12, 4, 4], '#fde9a4', 0);
  g.add(hl.obj);
  glowPool(c, cx, cz + 4.5, 8, '#fde9a4', 0.38, 1.6);
  // ── the direct converter: a bank of gold fins, busbars to the inverter hall ──
  const fx = 4.4, fz = cz;
  k.box(4.4, 0.6, 5.0, WHITE, fx, 0, fz, { r: 0.12 });
  for (let i = 0; i < 12; i++) k.box(0.1, 3.8 + (i % 2) * 0.5, 4.0, i % 2 ? '#e8b84a' : GOLD, fx - 1.65 + i * 0.3, 0.6, fz, { r: 0.02, jitter: 0.02, shade: 0.05 });
  k.box(4.0, 0.3, 4.4, WHITE, fx, 5.0, fz, { r: 0.08 });
  hcyl(k, 0.7, fx - 2.2 - x1 + 0.2, WHITE, (fx - 2.2 + x1) / 2 + 0.1, cy, cz, 'x', 16);
  k.box(1.0, cy - 0.7, 1.0, '#e3ded6', (fx - 2.2 + x1) / 2 + 0.5, 0.0, cz, { r: 0.1 });
  for (const dz of [-0.8, 0, 0.8]) k.box(0.3, 0.3, 0.3, GOLD, fx + 2.4, 3.2, fz + dz, { r: 0.04 });
  for (const dz of [-0.8, 0, 0.8]) k.beam(V(fx + 2.4, 3.35, fz + dz), V(10.6, 3.35, -10.8 + dz), 0.22, GOLD);
  for (const x of [6.9, 10.4]) k.box(0.3, 3.2, 0.5, '#d9d3ca', x, 0, -5.6 + ((x - 6.8) / 3.8) * -5.2, { r: 0.04 });
  // the inverter hall: long, white, a glass band lit at night
  const ix = 15.2, iz = -12.2, iw = 11.4, idp = 7.6;
  const iTop = shed(k, ix, iz, iw, idp, 5.2, { wall: WHITE, band: GOLD, ribs: 0, roof: '#d9d3ca' });
  windowRow(k, c.lit, 'z+', iz + idp / 2 + 0.03, ix - iw / 2 + 0.6, ix + iw / 2 - 0.6, 2.0, 1.6, 1.4, 0.18, r, 0.85);
  windowRow(k, c.lit, 'x-', ix - iw / 2 - 0.03, iz - idp / 2 + 0.6, iz + idp / 2 - 0.6, 2.0, 1.4, 1.4, 0.2, r, 0.8);
  for (let x = ix - iw / 2 + 1.4; x < ix + iw / 2 - 1; x += 2.2) k.box(1.4, 0.12, 2.2, '#2c3f6e', x, iTop, iz, { r: 0.02, shade: 0 });
  const lines = switchyard(k, g, 14.8, 11.6, 11.0, 7.0, { bays: 2, gantryH: 5.2 });
  stepUp(c, [12.2, 16.0], iz + idp / 2 + 1.8, [lines[0], lines[2]], 0.8);
  // helium-3 from the Moon: canisters on a rack, the crescent sign
  const hx = 15.6, hz = 1.4;
  k.box(9.0, 0.3, 4.4, '#cfc8bd', hx, 0, hz, { r: 0.05 });
  for (const lvl of [0, 1])
    for (let i = 0; i < 4; i++) {
      const x = hx - 3.3 + i * 2.2, y = 0.9 + lvl * 1.25;
      hcyl(k, 0.55, 3.4, WHITE, x, y, hz, 'z', 14);
      for (const s of [-1.2, 1.2]) k.geo(new THREE.TorusGeometry(0.57, 0.07, 4, 16).translate(x, y, hz + s), GOLD, 0, 0);
    }
  for (const s of [-1, 1]) k.box(9.0, 0.16, 0.2, '#8a8490', hx, 0.4, hz + s * 1.6, { r: 0 });
  for (const x of [hx - 4.4, hx + 4.4]) k.box(0.2, 2.6, 3.4, '#8a8490', x, 0.3, hz, { r: 0.02 });
  const cs = crescentSign(3.4);
  cs.position.set(hx - 2.4, 3.4, hz + 1.8);
  k.box(0.14, 3.0, 0.14, P.steelDark, hx - 3.6, 0.3, hz + 1.75, { r: 0 });
  k.box(0.14, 3.0, 0.14, P.steelDark, hx - 1.2, 0.3, hz + 1.75, { r: 0 });
  g.add(cs);
  // ── the pool, lawns and trees, the visitors' centre ──
  k.box(19.6, 0.16, 3.6, '#e3ded6', cx - 0.4, 0, 1.2, { r: 0.05, shade: 0 });
  k.box(18.9, 0.04, 2.9, '#2f4c5a', cx - 0.4, 0.13, 1.2, { r: 0, shade: 0, jitter: 0 });
  const pool = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.06, 2.8).translate(cx - 0.4, 0.18, 1.2), lakeMat);
  pool.receiveShadow = true;
  g.add(pool);
  const lawn = '#86a85a';
  k.box(14, 0.08, 3.4, lawn, -13.6, 0.02, 6.4, { r: 0.04, shade: 0, jitter: 0.03 });
  const kind = TREE_BY[o.backdrop ?? ''] ?? 'broadleaf';
  const trees = [[-19.6, 6.8], [-16.4, 5.8], [-11.0, 6.9], [-7.6, 5.9], [-20.0, -15.2], [-1.2, 6.4], [6.4, 13.4]].map(([x, z], i) => ({ x, y: 0, z, s: 0.95 + ((i * 37) % 10) / 25, ry: i * 1.7 }));
  g.add(plants(kind, trees));
  controlBlock(c, -14.6, 12.8, 10.2, 4.4, 4.8);
  carPark(c, -3.4, 14.2, 5);
  lampsAt(c, [[-0.8, 9.4, -1], [7.0, -3.6, -1], [-20.8, -6, 1], [10.8, 4.6, 1]]);
  // ── the pulse ──
  const rc = col(GOLD).clone(), white = col('#fff6d8').clone();
  c.anim.extra.push((e) => {
    const u = ((e.t + (o.seed % 5) * 0.3) % PERIOD + PERIOD) % PERIOD;
    const run = 0.9;
    const t = Math.min(1, u / run), ease = t * t;
    const half = len / 2 - 3.2;
    plasmoids.forEach((m, i) => {
      m.visible = u < run;
      m.position.x = cx + (i ? 1 : -1) * half * (1 - ease);
    });
    const f = u >= run ? Math.exp(-(u - run) / 0.18) : 0, after = u >= run ? Math.exp(-(u - run) / 0.6) : 0;
    // rings light as a plasmoid passes them
    const px = half * (1 - ease);
    ringMat.emissiveIntensity = 0.18 + e.night * 0.6 + f * 2.5 + (u < run ? 0.6 * Math.exp(-Math.abs(Math.abs(px) - half * 0.5) / 2) : 0);
    ringMat.emissive.copy(rc).lerp(white, f * 0.6);
    haloMat.emissiveIntensity = 0.8 + e.night * 1.4 + f * 5 + after * 1.2;
    gas.set(0.5 + e.night * 0.5 + f * 2.2 + after * 0.6);
    hl.set(f * 0.9 + after * 0.15 + e.night * 0.08);
  });
  c.finish();
  return { obj: g, w: W, d: D, h: Math.max(cy + R + 1.6, 9.0), update: c.update, ground: () => null };
}
