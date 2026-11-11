/**
 * Act I's facility types in 3D, with their tiers. A plot never grows (the sim gives a facility a
 * fixed number of plots), so a higher tier shows as more on the same ground: a bigger, taller hall,
 * denser rows, taller turbines, a combined-cycle block with its own stacks, a lab campus.
 */
import * as THREE from 'three';
import type { FacilityType } from '../../sim/types';
import { glowMat, Kit, rng } from '../kit';
import { model } from '../models';
import { batteryYard, dataHall, solarFarm, windFarm, type Piece } from '../pieces';
import { parkedCars } from './life';
import { Plume } from '../fx';
import type { PieceFactory } from './registry';

function beaconAt(g: THREE.Object3D, x: number, y: number, z: number, phase = 0) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat('red3', 0.2).clone());
  b.position.set(x, y, z);
  b.userData.beacon = phase;
  g.add(b);
}

/** The garage the company started in, on its own lot with a driveway and a car. */
function hq(o: { seed: number }): Piece {
  const g = new THREE.Group();
  const house = model('garage', 17);
  house.position.z = -2;
  g.add(house);
  const k = new Kit(rng(o.seed));
  // the drive from the garage bay and the path from the front door, down to the street. The lawn (the plot's pad)
  // tops out at 0.12: both lie just proud of it, or they vanish under the grass
  k.box(5.5, 0.08, 9, '#cfc6bd', -4, 0.07, 8.5, { r: 0.04, shade: 0 });
  k.box(0.9, 0.08, 10.2, '#cfc6bd', 3.4, 0.07, 7.7, { r: 0.02, shade: 0 });
  k.box(0.35, 1.0, 0.35, '#c23a3f', 5.5, 0, 11.5, { r: 0.05 });
  k.box(0.6, 0.4, 0.4, '#5b5562', 5.5, 1.0, 11.5, { r: 0.08 });
  // the picket fence, open at the driveway and at the front path's gate
  for (let x = -12; x < 12; x += 0.5) if ((x < -7 || x > -1) && (x < 2.9 || x > 4.1)) k.box(0.1, 0.7, 0.05, '#efe8de', x, 0, 12.6, { r: 0, jitter: 0.02 });
  // a hedge along the side, shrubs by the house, a tree in the back yard
  for (let z = -10; z < 10; z += 0.9) k.geo(new THREE.IcosahedronGeometry(0.55, 0).scale(1, 0.8, 1).translate(-12.2, 0.4, z), '#3f6b35', 0.18);
  for (const [x, z] of [[2, 4.6], [6, 4.4], [9, 4.8], [-9, 4.5]]) k.geo(new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.75, 1).translate(x, 0.45, z), '#4a7a3a', 0.2);
  k.cyl(0.25, 0.32, 2.4, '#5c3a26', 9, 0, -10, 6);
  k.geo(new THREE.IcosahedronGeometry(2.2, 1).scale(1, 0.9, 1).translate(9, 3.6, -10), '#3f7b35', 0.18);
  g.add(k.build());
  parkedCars(g, -4, 9, 1, 3, o.seed, -Math.PI / 2);
  // the garage glows at night (the lab inside never sleeps)
  const light = new THREE.PointLight(0xffc27a, 0, 16, 1.6);
  light.position.set(-3.5, 2.2, 2.5);
  g.add(light);
  return {
    obj: g, w: 22, d: 24, h: 8, update(e) { light.intensity = e.night * 50; },
    // the front door up the path, and the open garage bay off the driveway (where the lab began); the model stands
    // on its own concrete apron, so the walls are 3.5 m behind its front edge (the gabled wing a little less)
    doors: [{ x: 2.9, z: 0.8 }, { x: -5.0, z: 0.3 }],
    blockers: [
      { x0: -8.6, z0: -7.1, x1: 8.6, z1: -0.4 },
      { x0: 3.8, z0: -0.4, x1: 8.6, z1: 0.9 },
      ...([[2, 4.6], [6, 4.4], [9, 4.8], [-9, 4.5]] as [number, number][]).map(([x, z]) => ({ x0: x - 0.7, z0: z - 0.55, x1: x + 0.7, z1: z + 0.55 })),
      { x0: -12.8, z0: -10.6, x1: -11.6, z1: 10.4 },
      { x0: 8.65, z0: -10.35, x1: 9.35, z1: -9.65 },
      { x0: 5.25, z0: 11.25, x1: 5.75, z1: 11.75 },
      { x0: -12.05, z0: 12.5, x1: -7.2, z1: 12.7 }, { x0: -0.8, z0: 12.5, x1: 2.75, z1: 12.7 }, { x0: 4.25, z0: 12.5, x1: 11.85, z1: 12.7 },
    ],
  };
}

/**
 * A data hall, set back on its plot so its car park and transformers sit inside the yard's fence (the plot is
 * 26 deep: hall, generators, entrance, aisle and car park only just fit).
 */
function hall(o: { seed: number; tier: number }): Piece {
  const [p, back] = o.tier >= 3 ? [dataHall(o.seed, { W: 25, D: 15, H: 10, chRows: 3, storeys: 2, noParking: true }), 0.8]
    : o.tier === 2 ? [dataHall(o.seed, { W: 24, D: 13, H: 7.2, chRows: 3 }), 2.4] : [dataHall(o.seed), 1.6];
  const g = new THREE.Group();
  p.obj.position.z = -back;
  g.add(p.obj);
  const at = <T extends { z: number }>(v: T) => ({ ...v, z: v.z - back });
  return {
    ...p, obj: g,
    doors: p.doors?.map(at),
    blockers: p.blockers?.map((r) => ({ ...r, z0: r.z0 - back, z1: r.z1 - back })),
  };
}

function solar(o: { seed: number; w: number; d: number; tier: number }): Piece {
  const rows = o.tier >= 3 ? 14 : o.tier === 2 ? 11 : 8;
  return solarFarm(o.seed, o.w - 2, o.d - 3, rows, o.tier >= 2 ? 1.3 : 0.9);
}

/** A gas plant: tier 1 the peaker; tier 2 adds a heat-recovery boiler and its stack (combined cycle); tier 3 a second block. */
function gas(o: { seed: number; tier: number }): Piece {
  const g = new THREE.Group();
  const big = o.tier >= 2;
  const m = model('gasplant', big ? 19 : 24);
  m.position.set(big ? -3 : 0, 0, big ? 2 : 0);
  g.add(m);
  const s = m.userData.size as THREE.Vector3;
  beaconAt(g, m.position.x - s.x * 0.2, s.y * 0.97, m.position.z - s.z * 0.15, 1.3);
  const plumes: Plume[] = [];
  if (big) {
    const k = new Kit(rng(o.seed));
    const blocks = o.tier >= 3 ? 2 : 1;
    for (let b = 0; b < blocks; b++) {
      const x = 9 - b * 6, z = -7;
      // heat-recovery steam generator: a tall boxy boiler, a steel stack, a duct back to the turbine
      k.box(4.2, 9, 3.4, '#c9c1b6', x, 0, z, { r: 0.12, shade: 0.2 });
      for (let y = 1.5; y < 9; y += 1.5) k.box(4.25, 0.12, 3.45, '#a39a91', x, y, z, { r: 0, jitter: 0 });
      k.cyl(0.9, 1.05, 16, '#8a8490', x, 0, z - 2.8, 16);
      k.cyl(0.95, 0.95, 0.5, '#df5f3e', x, 14.5, z - 2.8, 16);
      k.box(1.6, 1.6, 6, '#9d95a6', x - 3.2, 3, z + 3, { r: 0.1 });
      beaconAt(g, x, 16.3, z - 2.8, b * 2);
      const p = new Plume({ count: 16, life: 6, rise: 2.4, size0: 1.6, size1: 6, color: '#ece8e2', opacity: 0.35, radius: 0.6 }, o.seed + b);
      p.obj.position.set(x, 16, z - 2.8);
      plumes.push(p);
      g.add(p.obj);
    }
    // an air-cooled condenser deck on stilts with its fans
    if (o.tier >= 3) {
      k.box(9, 0.6, 5, '#b9c2c4', -4, 6, -8.5, { r: 0.08 });
      for (let x = -8; x <= 0; x += 2.6) for (let y = 0; y < 2; y++) k.cyl(0.9, 0.9, 0.2, '#5e6670', x + 0.3, 6.6, -9.7 + y * 2.4, 14);
      for (const x of [-8, -4, 0]) for (const z of [-10.5, -6.5]) k.box(0.3, 6, 0.3, '#8a8490', x, 0, z, { r: 0, jitter: 0 });
    }
    g.add(k.build());
  }
  // the operators' pickup, inside the yard by the gate
  parkedCars(g, big ? 9.5 : 11.7, big ? 6.5 : 5, 1, 3, o.seed + 4, Math.PI / 2, ['pickup']);
  // what stands on the model's slab (its halls, stacks and the control room; the slab's rim is walkable)
  const L = big ? 19 : 24, mx = m.position.x, mz = m.position.z, hx = (0.839 * L) / 2, hz = L / 2;
  const blockers = [{ x0: mx - hx + 0.6, z0: mz - hz + 0.6, x1: mx + hx - 0.6, z1: mz + hz - 1.2 }];
  if (big) {
    for (let b = 0; b < (o.tier >= 3 ? 2 : 1); b++) blockers.push({ x0: 9 - b * 6 - 2.2, z0: -10.9, x1: 9 - b * 6 + 2.2, z1: -5.2 });
    if (o.tier >= 3) blockers.push({ x0: -8.2, z0: -10.7, x1: 0.2, z1: -6.3 });
  }
  return {
    obj: g, w: 26, d: 24, h: big ? 17 : s.y + 0.5,
    // (the operators go in by the left enclosure at the front)
    doors: [{ x: mx - hx * 0.7, z: mz + hz - 0.5 }],
    blockers,
    update(e) { for (const p of plumes) p.update(e); },
  };
}

/** A research lab: tier 2 adds a wing, tier 3 makes it a small campus round a courtyard. */
function lab(o: { seed: number; tier: number }): Piece {
  const g = new THREE.Group();
  const m = model('lab', o.tier >= 3 ? 13 : 15);
  m.position.set(o.tier >= 2 ? -4 : 0, 0, -2);
  g.add(m);
  const s = m.userData.size as THREE.Vector3;
  const k = new Kit(rng(o.seed));
  const wing = (x: number, z: number, w: number, d: number, h: number) => {
    k.box(w, h, d, '#ece6dc', x, 0, z, { r: 0.2, shade: 0.15 });
    k.box(w + 0.3, 0.4, d + 0.3, '#5b5562', x, h, z, { r: 0.1, shade: 0 });
    for (let y = 1.2; y < h - 0.5; y += 1.9) k.box(w + 0.05, 0.9, d * 0.8, '#3b6f7a', x, y, z, { r: 0.02, jitter: 0, shade: 0 });
    k.box(w * 0.5, 0.9, 1.6, '#b9c2c4', x, h + 0.4, z, { r: 0.08 });
  };
  if (o.tier >= 2) wing(7, -3, 7, 11, o.tier >= 3 ? 8 : 6);
  if (o.tier >= 3) {
    wing(-4, -11, 13, 4.5, 5);
    // a courtyard with trees between the buildings
    for (const [x, z] of [[2, 4], [5, 3.5]]) {
      k.cyl(0.18, 0.24, 1.6, '#5c3a26', x, 0, z, 6);
      k.geo(new THREE.IcosahedronGeometry(1.3, 1).translate(x, 2.6, z), '#3f7b35', 0.18);
    }
  }
  // the car park in front (a walk between it and the building, so the door can be reached)
  k.box(14, 0.06, 6, '#6f6878', 0, 0.02, 9.7, { r: 0.04, shade: 0 });
  for (let i = 0; i < 6; i++) k.box(0.12, 0.02, 2.4, 'ink9', -6 + i * 2.4, 0.08, 9.5, { r: 0, jitter: 0 });
  g.add(k.build());
  parkedCars(g, -6, 9.7, 6, 2.4, o.seed + 78, Math.PI / 2);
  const lm = glowMat('yel1', 0);
  lm.userData.nightOnly = 0.9;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(s.x * 0.3, s.y * 0.3, 0.05), lm);
  glow.position.set(m.position.x - s.x * 0.05, s.y * 0.25, -2 + s.z / 2 - 0.4);
  g.add(glow);
  // the building (the model is 0.834 as wide as it is deep) with the glass doors under the canopy set back in a
  // notch between the planters and the corner; the wings, the courtyard's trees
  const L = o.tier >= 3 ? 13 : 15, mx = m.position.x, hx = (0.834 * L) / 2, front = -2 + L / 2, wall = front - 1.0;
  const blockers = [
    { x0: mx - hx, z0: -2 - L / 2, x1: mx + hx, z1: wall },
    { x0: mx - hx, z0: wall, x1: mx, z1: front },
    { x0: mx + hx * 0.86, z0: wall, x1: mx + hx, z1: front },
  ];
  if (o.tier >= 2) blockers.push({ x0: 3.35, z0: -8.65, x1: 10.65, z1: 2.65 });
  if (o.tier >= 3) blockers.push({ x0: -10.65, z0: -13.4, x1: 2.65, z1: -8.6 }, { x0: 1.7, z0: 3.7, x1: 2.3, z1: 4.3 }, { x0: 4.7, z0: 3.2, x1: 5.3, z1: 3.8 });
  return {
    obj: g, w: 20, d: 22, h: Math.max(s.y, o.tier >= 3 ? 8.4 : 6.4) + 0.3,
    doors: [{ x: mx + hx * 0.38, z: wall + 0.65 }],
    blockers,
    // the lobby's light is a night thing (by day the panel would read as a board across the doors)
    update(e) { glow.visible = e.night > 0.05; },
  };
}

export const ACT1_PIECES: Partial<Record<FacilityType, PieceFactory>> = {
  hq,
  datacenter: hall,
  solar,
  wind: (o) => windFarm(o.seed, o.tier),
  battery: (o) => batteryYard(o.seed, o.tier),
  gas,
  lab,
};
