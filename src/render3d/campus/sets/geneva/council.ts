/**
 * The Council hall: a round assembly chamber on a stone podium — a glazed drum ringed by timber
 * columns, an entablature with the twelve blocs' colours, a glass dome under a diamond timber
 * gridshell crowned by a lantern and the Charter's flag — entered through a portico carrying
 * THE KARDASHEV PROJECT in gold on blue. At night the chamber glows through the glass.
 */
import * as THREE from 'three';
import { plantField } from '../../trees';
import { Kit, lightPool, poolMat, rng, type Paint } from '../../../kit';
import { type Piece } from '../../../pieces';
import type { Act3SetOpts } from '../../act3sets';
import { KEYS, PALETTE } from '../../../../render/palette';
import { BLOC_FRIEZE, BLOC_ORDER } from '../../planKit';
import { CH, CHARTER_FLAG, emblemDisc, flagPole, Flags, greenery, litGlass, litSign, paving, People, plantedTree, V } from './common';
import { beacon, fit } from './secretariat';

const STONE: Paint = '#ece6dc';
const STONE2: Paint = '#d6cdbf';
const TIMBER: Paint = '#c39d68';
const hexOf = (idx: number) => PALETTE[KEYS[idx - 1]] ?? '#ffffff';

export function council(o: Act3SetOpts): Piece {
  const g = new THREE.Group();
  g.name = 'set:council';
  const k = new Kit(rng(o.seed));
  const glass = new Kit(rng(o.seed + 1)), dome = new Kit(rng(o.seed + 2)), lantern = new Kit(rng(o.seed + 3));
  const accent = o.accent ?? '#f7b258';
  const CZ = -1.2; // the rotunda's centre
  const B = 0.2;
  const PODIUM = 1.1, RD = 10, HD = 7.2, TOPD = PODIUM + HD;
  const ENT = TOPD + 1.1, FRZ = ENT + 1.0, COR = FRZ + 0.35;
  const DR = 10, DH = 8.2;
  paving(k, -17.8, -15.8, 17.8, 15.8, 0, 2.6);
  // lawns in the corners, edged with stone, hedges round the back
  for (const sx of [-1, 1]) {
    for (const [x0, x1, z0, z1] of [[12.4, 17.4, -15.4, -9], [12.6, 17.4, 6.5, 15.4]] as const) {
      const xa = sx * x0, xb = sx * x1;
      k.box(Math.abs(xb - xa) + 0.3, 0.26, z1 - z0 + 0.3, STONE2, (xa + xb) / 2, B - 0.05, (z0 + z1) / 2, { r: 0.04, shade: 0 });
      k.box(Math.abs(xb - xa), 0.12, z1 - z0, '#6f9446', (xa + xb) / 2, B + 0.1, (z0 + z1) / 2, { r: 0.04, jitter: 0.05, shade: 0 });
    }
    for (let z = -14.8; z < -9.4; z += 1.3) greenery(k, sx * 16.8, B + 0.18, z, 0.75, o.seed + 90 + z * 3 + sx);
  }
  // ── podium ──
  k.cyl(13.8, 13.9, 0.5 - B, STONE2, 0, B, CZ, 64, { shade: 0.1 });
  k.cyl(12.4, 12.5, PODIUM - 0.5, STONE, 0, 0.5, CZ, 64, { shade: 0.1 });
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    k.box(0.06, 0.012, 1.3, '#bdb3a6', Math.sin(t) * 13.1, 0.5, CZ + Math.cos(t) * 13.1, { r: 0, jitter: 0, shade: 0, ry: t });
  }
  // ── the drum: glass behind a ring of timber columns ──
  glass.geo(new THREE.CylinderGeometry(RD, RD, HD, 56, 1, true).translate(0, PODIUM + HD / 2, CZ), '#3a5f86', 0.03, 0.15);
  k.cyl(RD + 0.08, RD + 0.08, 0.32, STONE, 0, PODIUM + HD * 0.47, CZ, 56, { shade: 0 });
  k.cyl(RD - 0.3, RD - 0.3, HD, '#2a3a4c', 0, PODIUM, CZ, 40);
  const NC = 30;
  for (let i = 0; i < NC; i++) {
    const t = ((i + 0.5) / NC) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) < 0.42) continue; // the portico
    const x = Math.sin(t) * (RD + 0.75), z = CZ + Math.cos(t) * (RD + 0.75);
    k.cyl(0.3, 0.34, HD, TIMBER, x, PODIUM, z, 10, { shade: 0.1 });
    k.box(0.9, 0.22, 0.9, STONE, x, PODIUM, z, { r: 0.04, ry: t });
    // mullions on the glass behind
    glass.box(0.12, HD, 0.14, '#8a6a48', Math.sin(t + Math.PI / NC) * (RD + 0.05), PODIUM, CZ + Math.cos(t + Math.PI / NC) * (RD + 0.05), { r: 0, jitter: 0.02, ry: t });
  }
  // ── the entablature, the blocs' frieze, the cornice ──
  k.cyl(RD + 1.3, RD + 1.3, ENT - TOPD, STONE, 0, TOPD, CZ, 64, { shade: 0.05 });
  BLOC_ORDER.forEach((id, i) => {
    const [fa, fb] = BLOC_FRIEZE[id];
    const t0 = ((i - 0.5) / 12) * Math.PI * 2;
    const seg = (r: number, h: number, y: number, c: string) => k.geo(new THREE.CylinderGeometry(r, r, h, 6, 1, true, t0, (Math.PI * 2) / 12 - 0.012).translate(0, y + h / 2, CZ), c, 0.02);
    seg(RD + 1.34, 0.5, ENT + 0.46, hexOf(fa));
    seg(RD + 1.34, 0.44, ENT + 0.02, hexOf(fb));
  });
  k.cyl(RD + 1.32, RD + 1.32, FRZ - ENT, '#5b5562', 0, ENT, CZ, 64, { shade: 0 });
  k.cyl(RD + 1.7, RD + 1.6, COR - FRZ, STONE, 0, FRZ, CZ, 64, { shade: 0 });
  // a planted ring at the dome's foot
  for (let i = 0; i < 34; i++) {
    const t = (i / 34) * Math.PI * 2;
    greenery(k, Math.sin(t) * (DR + 0.9), COR - 0.1, CZ + Math.cos(t) * (DR + 0.9), 0.62, o.seed + i * 7, i % 3 === 0);
  }
  // ── the dome: glass under a diamond timber gridshell ──
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI / 2;
    prof.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * DR), Math.sin(a) * DH));
  }
  dome.geo(new THREE.LatheGeometry(prof, 48).translate(0, COR, CZ), '#9cc0de', 0.03, 0.35);
  const on = (lon: number, lat: number, out = 1.015) => V(Math.sin(lon) * Math.cos(lat) * DR * out, COR + Math.sin(lat) * DH * out, CZ + Math.cos(lon) * Math.cos(lat) * DR * out);
  const RIBS = 18, STEPS = 9, LATMAX = Math.PI / 2 - 0.17;
  for (let r = 0; r < RIBS; r++) {
    const l0 = (r / RIBS) * Math.PI * 2;
    for (const f of [-1, 1]) {
      let prev = on(l0, 0);
      for (let s = 1; s <= STEPS; s++) {
        const lat = (s / STEPS) * LATMAX;
        const p = on(l0 + f * lat * 1.05, lat);
        k.beam(prev, p, 0.17, TIMBER);
        prev = p;
      }
    }
  }
  for (const lat of [0, 0.45, 0.9, LATMAX]) {
    const n = Math.max(12, Math.round(40 * Math.cos(lat)));
    for (let i = 0; i < n; i++) k.beam(on((i / n) * Math.PI * 2, lat), on(((i + 1) / n) * Math.PI * 2, lat), lat === 0 ? 0.3 : 0.15, lat === 0 ? '#a07a48' : TIMBER);
  }
  // ── the lantern and the Charter's flag ──
  const LY = COR + DH * Math.sin(LATMAX) - 0.1, LR = DR * Math.cos(LATMAX) + 0.15;
  lantern.geo(new THREE.CylinderGeometry(LR - 0.2, LR - 0.2, 1.9, 20, 1, true).translate(0, LY + 0.95, CZ), '#9cc0de', 0.02);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    k.box(0.16, 1.9, 0.16, TIMBER, Math.sin(t) * (LR - 0.15), LY, CZ + Math.cos(t) * (LR - 0.15), { r: 0, ry: t });
  }
  k.cyl(LR + 0.2, LR + 0.1, 0.35, STONE, 0, LY + 1.9, CZ, 24);
  k.geo(new THREE.SphereGeometry(LR * 0.8, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, LY + 2.25, CZ), '#d4a862', 0.03);
  const FY = LY + 2.25 + LR * 0.8;
  flagPole(k, 0, FY - 0.1, CZ, 4.4);
  beacon(g, 0, FY + 4.55, CZ, 0.7);
  // ── the portico: columns, the inscription on Charter blue, the doors, steps ──
  const PZ0 = CZ + RD - 1.4, PZ1 = CZ + RD + 3.2;
  k.box(14.4, PODIUM, PZ1 - PZ0 + 0.6, STONE, 0, 0, (PZ0 + PZ1) / 2 + 0.3, { r: 0.06, shade: 0.1 });
  for (let i = 0; i < 6; i++) {
    const x = -5.5 + i * 2.2;
    k.cyl(0.34, 0.38, HD, TIMBER, x, PODIUM, PZ1 - 0.5, 12, { shade: 0.1 });
    k.box(0.95, 0.24, 0.95, STONE, x, PODIUM, PZ1 - 0.5, { r: 0.04 });
  }
  k.box(14.2, ENT - TOPD + 0.4, PZ1 - PZ0 + 0.3, CH.field, 0, TOPD, (PZ0 + PZ1) / 2 - 0.05, { r: 0.08, shade: 0.05 });
  k.box(14.3, 0.16, PZ1 - PZ0 + 0.4, accent, 0, TOPD, (PZ0 + PZ1) / 2 - 0.05, { r: 0.03, jitter: 0, shade: 0 });
  k.box(14.8, 0.35, PZ1 - PZ0 + 0.9, STONE, 0, ENT + 0.4, (PZ0 + PZ1) / 2, { r: 0.06, shade: 0 });
  const ins = fit(litSign('THE KARDASHEV PROJECT', 20, accent, null, 0.9), 12.6, 0.82);
  ins.position.set(0, TOPD + 0.86, PZ1 + 0.11);
  g.add(ins);
  // the doors: a tall glazed entrance under a stone panel with the emblem
  glass.box(5.2, 5.0, 0.14, '#5d86a8', 0, PODIUM, CZ + RD + 0.25, { r: 0, jitter: 0.02 });
  for (let x = -2.6; x <= 2.61; x += 1.3) k.box(0.1, 5.0, 0.2, TIMBER, x, PODIUM, CZ + RD + 0.3, { r: 0, jitter: 0.02 });
  k.box(6.2, HD - 5.0, 0.5, STONE, 0, PODIUM + 5.0, CZ + RD + 0.2, { r: 0.05 });
  const em = emblemDisc(1.7, 0.7);
  em.position.set(0, PODIUM + 6.1, CZ + RD + 0.47);
  g.add(em);
  for (let i = 0; i < 4; i++) {
    const z = PZ1 + 0.3 + i * 0.62;
    k.box(15 + i * 0.8, PODIUM * (1 - (i + 1) / 5), 0.62, STONE, 0, 0, z + 0.31, { r: 0.03, jitter: 0.01, shade: 0.05 });
  }
  // flags either side of the steps, trees in planters at the corners
  flagPole(k, -9.2, B, PZ1 + 1.8, 8.6);
  flagPole(k, 9.2, B, PZ1 + 1.8, 8.6);
  plantedTree(k, -14.8, B + 0.2, 11.4, 1.15, o.seed + 31);
  plantedTree(k, 14.8, B + 0.2, 11.4, 1.15, o.seed + 32);
  g.add(plantField('oak', [{ x: -14.2, y: B + 0.2, z: -10.6, s: 0.88, ry: 0.5 }, { x: 14.2, y: B + 0.2, z: -10.2, s: 0.82, ry: 2.6 }]));
  const fl = new Flags([
    { x: 0.08, y: FY + 4.3, z: CZ, banner: CHARTER_FLAG, w: 2.8, h: 1.75 },
    { x: -9.12, y: B + 8.55, z: PZ1 + 1.8, banner: CHARTER_FLAG, w: 2.6, h: 1.6 },
    { x: 9.28, y: B + 8.55, z: PZ1 + 1.8, banner: CHARTER_FLAG, w: 2.6, h: 1.6 },
  ]);
  g.add(fl.mesh);
  // night: floodlights washing the colonnade, the chamber glowing through the glass
  const wash = poolMat('#ffd9a0', 0.5);
  for (let i = 0; i < 10; i++) {
    const t = ((i + 0.5) / 10) * Math.PI * 2;
    lightPool(g, Math.sin(t) * 11.8, PODIUM, CZ + Math.cos(t) * 11.8, 2.6, wash);
  }
  lightPool(g, 0, B, PZ1 + 2.6, 5, wash, 1.6);
  const domeGlass = litGlass('org2', 0.42);
  domeGlass.roughness = 0.45;
  domeGlass.metalness = 0.05;
  g.add(k.build(), glass.build(litGlass('yel1', 0.85)), dome.build(domeGlass), lantern.build(litGlass('yel1', 1.1)));
  // people: round the podium, up the steps, a few on the portico
  const h = (x: number, z: number) => {
    if (Math.abs(x) < 7.2 && z > PZ0 && z < PZ1 + 0.3) return PODIUM;
    if (Math.abs(x) < 8 && z >= PZ1 + 0.3 && z < PZ1 + 2.8) return PODIUM * (1 - (z - PZ1 - 0.3) / 2.5);
    const d = Math.hypot(x, z - CZ);
    return d < 12.4 ? PODIUM : d < 13.8 ? 0.5 : B;
  };
  const ppl = new People(h);
  const ring: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = 0.75 + (i / 12) * (Math.PI * 2 - 1.5);
    ring.push([Math.sin(t) * 14.7, CZ + Math.cos(t) * 14.7]);
  }
  ring.push([-8.6, 15.2], [8.6, 15.2]);
  ppl.walk(ring);
  ppl.walk([...ring.slice(6), ...ring.slice(0, 6)], 'office');
  ppl.walk([[-3, 15.4], [-2.2, PZ1 + 0.2], [-1.4, CZ + RD + 1.1], [1.6, CZ + RD + 1.2], [2.4, PZ1 + 0.4], [4, 15.4]], 'scientist');
  ppl.walk([[-11, -15.5], [11, -15.5]], 'researcher');
  ppl.stand(-4.4, PZ1 - 1.6, 0.3, 'office');
  ppl.stand(-3.7, PZ1 - 1.1, -2.4, 'engineer');
  ppl.stand(5.2, PZ1 + 2.0, 2.9);
  g.add(ppl.group);
  return {
    obj: g, w: 36, d: 32, h: FY + 6,
    // the glazed entrance in the portico, up the steps on the podium
    doors: [{ x: 0, z: CZ + RD + 0.25 + 0.7 }],
    ground: () => null,
    update(e) {
      fl.update(e);
      ppl.update(e);
    },
  };
}
