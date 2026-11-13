/**
 * Act I's facility types in 3D, with their tiers. A plot never grows (the sim gives a facility a
 * fixed number of plots), so a higher tier shows as more on the same ground: a bigger, taller hall,
 * denser rows, taller turbines, a combined-cycle block with its own stacks, a lab campus.
 */
import * as THREE from 'three';
import type { FacilityType } from '../../sim/types';
import { Kit, rng } from '../kit';
import { model } from '../models';
import { batteryYard, dataHall, solarFarm, windFarm, type Piece } from '../pieces';
import { parkedCars } from './life';
import type { PieceFactory } from './registry';
import { gas } from './act1/gas';
import { lab } from './act1/lab';

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
    walks: p.walks?.map((w) => w.map(at)),
    blockers: p.blockers?.map((r) => ({ ...r, z0: r.z0 - back, z1: r.z1 - back })),
  };
}

function solar(o: { seed: number; w: number; d: number; tier: number }): Piece {
  const rows = o.tier >= 3 ? 14 : o.tier === 2 ? 11 : 8;
  return solarFarm(o.seed, o.w - 2, o.d - 3, rows, o.tier >= 2 ? 1.3 : 0.9);
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
