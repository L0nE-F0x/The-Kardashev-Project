/**
 * Act I's facility types in 3D, with their tiers. A plot never grows (the sim gives a facility a
 * fixed number of plots), so a higher tier shows as more on the same ground: a bigger, taller hall,
 * denser rows, taller turbines, a combined-cycle block with its own stacks, a lab campus.
 */
import * as THREE from 'three';
import type { FacilityType } from '../../sim/types';
import { dataHall, type Piece } from '../pieces';
import type { PieceFactory } from './registry';
import { battery, solar, wind } from './act1/energy';
import { gas } from './act1/gas';
import { hq } from './act1/hq';
import { lab } from './act1/lab';

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

export const ACT1_PIECES: Partial<Record<FacilityType, PieceFactory>> = {
  hq,
  datacenter: hall,
  solar,
  wind,
  battery,
  gas,
  lab,
};
