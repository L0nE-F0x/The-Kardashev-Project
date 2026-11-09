/**
 * The gigawatt campus on four plots: four big two-storey data halls round a central spine (the
 * campus substation at the back, two steaming cooling-tower banks, the operations tower at the
 * front), a cross street between the rows and a front plaza. Load drives every hall's lights and
 * fans and the cooling plumes.
 */
import * as THREE from 'three';
import { Kit, rng } from '../../kit';
import { dataHall, type Piece } from '../../pieces';
import type { PieceOpts } from '../registry';
import {
  Anim, beacon, coolWinMat, glassMat, lampHeadMat, mechTower, P, paving, plants, poleLamp, shed, switchyard, wallLamp, windowRow, winMat,
} from './parts';
import type { Placement } from '../trees';

export function campus(o: PieceOpts): Piece & { setLoad(f: number): void } {
  const r = rng(o.seed);
  const g = new THREE.Group();
  const anim = new Anim();
  const k = new Kit(rng(o.seed + 1));
  const lit = new Kit(rng(o.seed + 2));
  const cool = new Kit(rng(o.seed + 3));
  const lamps = new Kit(rng(o.seed + 4));
  const glass = new Kit(rng(o.seed + 5));
  const W = o.w / 2, D = o.d / 2;
  // the four halls (their own fans, glow bands and generators)
  const halls = ([[-17, -16.4], [17, -16.4], [-17, 9.6], [17, 9.6]] as [number, number][]).map(([x, z], i) => {
    const h = dataHall(o.seed + i * 17, { W: 21, D: 12, H: 9, chRows: 3, storeys: 2, noParking: true });
    h.obj.position.set(x, 0, z);
    g.add(h.obj);
    return h;
  });
  // streets: the cross street between the rows, the front road, the spine's service lane
  paving(k, 0, -1.5, o.w - 2, 3.6);
  paving(k, 0, D - 2.4, o.w - 2, 2.8);
  for (let x = -W + 3; x < W - 2; x += 3.2) k.box(1.4, 0.02, 0.14, '#e6e0e3', x, 0.18, -1.5, { r: 0, jitter: 0, shade: 0 });
  for (const x of [-27, -18, -8.4, 8.4, 18, 27]) poleLamp(k, lamps, g, x, 0.6, 5.2, x < 0 ? 1 : -1);

  // the spine: the substation (back), two cooling banks, the operations tower (front)
  switchyard(k, g, 0, -D + 7.6, 11.2, 12.0, { bays: 3, xfmrs: 3, gantryH: 6.2 });
  const tA = mechTower(k, g, anim, -0.4, -8.8, { cells: 2, cell: 4.6, h: 7.4, ry: Math.PI / 2, plume: { size1: 11, life: 7, count: 16 } }, o.seed + 30);
  const tB = mechTower(k, g, anim, -0.4, 5.8, { cells: 2, cell: 4.6, h: 7.4, ry: Math.PI / 2, plume: { size1: 11, life: 7, count: 16 } }, o.seed + 40);
  // cooling water to the halls along the cross street
  for (const sx of [-1, 1]) {
    k.box(0.9, 0.9, 3.2, '#6f7f88', sx * 3.4, 0.1, -1.5, { r: 0.1 });
  }

  // the operations tower: a podium, a glass tower with floor bands, a crown with the company's teal
  const tx = 0, tz = D - 10.4;
  const podTop = shed(k, tx, tz, 10.6, 8.6, 4.2, { wall: P.cream, band: 'cyn3', ribs: 0 });
  windowRow(k, lit, 'z+', tz + 4.32, tx - 4.8, tx + 4.8, 1.0, 1.3, 2.2, 0.15, r, 0.8);
  for (const f of ['x+', 'x-'] as const) windowRow(k, lit, f, tx + (f === 'x+' ? 5.32 : -5.32), tz - 3.8, tz + 3.8, 1.0, 1.3, 2.2, 0.15, r, 0.7);
  k.box(5.0, 0.3, 2.6, 'cyn3', tx, 3.4, tz + 5.4, { r: 0.05 });
  for (const sx of [-2.2, 2.2]) k.box(0.18, 3.3, 0.18, P.steel, tx + sx, 0.15, tz + 6.4, { r: 0, jitter: 0 });
  cool.box(3.0, 2.6, 0.08, '#86a9b5', tx, 0.35, tz + 4.34, { r: 0, jitter: 0 });
  const TW = 7.4, TD = 6.8, floors = 8, fh = 2.3;
  const ty0 = podTop - 0.2;
  glass.box(TW, floors * fh, TD, '#4f7f8e', tx, ty0, tz - 0.4, { r: 0.12, jitter: 0.02, shade: 0.05 });
  for (let i = 0; i <= floors; i++) k.box(TW + 0.16, 0.24, TD + 0.16, '#e6e0e3', tx, ty0 + i * fh - 0.12, tz - 0.4, { r: 0.05, shade: 0, jitter: 0.01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.4, floors * fh, 0.4, '#e6e0e3', tx + sx * (TW / 2 - 0.05), ty0, tz - 0.4 + sz * (TD / 2 - 0.05), { r: 0.06, shade: 0 });
  for (let i = 0; i < floors; i++) {
    const y = ty0 + i * fh + 0.45;
    windowRow(glass, lit, 'z+', tz - 0.4 + TD / 2 + 0.02, tx - TW / 2 + 0.4, tx + TW / 2 - 0.4, y + 0.1, 1.0, 1.1, 0.25, r, 0.45);
    windowRow(glass, lit, 'x-', tx - TW / 2 - 0.02, tz - 0.4 - TD / 2 + 0.4, tz - 0.4 + TD / 2 - 0.4, y + 0.1, 1.0, 1.1, 0.25, r, 0.4);
    windowRow(glass, lit, 'x+', tx + TW / 2 + 0.02, tz - 0.4 - TD / 2 + 0.4, tz - 0.4 + TD / 2 - 0.4, y + 0.1, 1.0, 1.1, 0.25, r, 0.4);
  }
  const crown = ty0 + floors * fh;
  k.box(TW - 0.8, 2.0, TD - 0.8, '#d9d3ca', tx, crown, tz - 0.4, { r: 0.1 });
  k.box(TW + 0.2, 0.5, TD + 0.2, 'cyn3', tx, crown + 1.6, tz - 0.4, { r: 0.06, shade: 0 });
  k.box(2.4, 1.2, 2.0, P.hvac, tx - 1.6, crown + 2.0, tz - 1.2, { r: 0.08 });
  k.box(0.2, 3.4, 0.2, P.steel, tx + 2.2, crown + 2.0, tz - 1.6, { r: 0, jitter: 0 });
  const cyan = new Kit(rng(o.seed + 6));
  cyan.box(TW + 0.24, 0.16, TD + 0.24, 'cyn5', tx, crown + 1.4, tz - 0.4, { r: 0, jitter: 0, shade: 0 });
  beacon(g, tx + 2.2, crown + 5.6, tz - 1.6, 0.3);
  for (const sx of [-1, 1]) beacon(g, tx + sx * (TW / 2 - 0.2), crown + 2.4, tz - 0.4 + TD / 2 - 0.2, 1.2 + sx);
  // the front plaza: paving, trees in planters, lamps, a flagpole
  paving(k, tx, D - 4.6, 15, 3.4, '#cfc6b8', 0.12);
  const trees: Placement[] = [];
  for (const x of [-6.6, -3.4, 3.4, 6.6]) {
    k.box(1.6, 0.5, 1.6, '#b9b1a6', tx + x, 0.12, D - 4.6, { r: 0.08 });
    trees.push({ x: tx + x, y: 0.6, z: D - 4.6, s: 0.55 + r() * 0.15, ry: r() * 6.3, tint: 1 });
  }
  g.add(plants('broadleaf', trees));
  k.box(0.14, 7, 0.14, '#e6e0e3', tx + 8.6, 0.1, D - 5.0, { r: 0, jitter: 0 });
  k.box(1.6, 1.0, 0.04, 'cyn3', tx + 9.4, 5.8, D - 5.0, { r: 0, jitter: 0 });
  for (const x of [-7.6, 7.6]) wallLamp(lamps, g, tx + x * 0.6, 3.0, tz + 4.5);
  g.add(k.build(), glass.build(glassMat), lit.build(winMat), cool.build(coolWinMat), lamps.build(lampHeadMat));
  const band = cyan.build(coolWinMat);
  g.add(band);

  return {
    obj: g, w: o.w, d: o.d, h: Math.max(crown + 3.6, tA, tB),
    setLoad(f) { for (const h of halls) h.setLoad(f); anim.load = f; },
    progress(p) { anim.done = p; },
    update(e) { for (const h of halls) h.update?.(e); anim.update(e); },
  };
}
