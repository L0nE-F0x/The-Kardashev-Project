/**
 * Act IV–V set pieces in 3D: fusion (see ../act3sets.ts for the footprints and options).
 * `fusionPlant` draws one plant of a fleet in its design (`variant`: tokamak, stellarator, laser,
 * pinch, dhe3; `n` = unit number; the builder's livery), `dacFarm` a block of direct air capture.
 */
import type { Act3PieceKind } from '../plan';
import type { Act3SetFactory, Act3SetOpts } from '../act3sets';
import type { Piece } from '../../pieces';
import { tokamakPlant } from './fusion/tokamak';
import { stellaratorPlant } from './fusion/stellarator';
import { laserPlant } from './fusion/laser';
import { pinchPlant } from './fusion/pinch';
import { dhe3Plant } from './fusion/dhe3';
import { dacFarm } from './fusion/dac';

function fusionPlant(o: Act3SetOpts): Piece {
  switch (o.variant) {
    case 'stellarator': return stellaratorPlant(o);
    case 'laser': return laserPlant(o);
    case 'pinch': return pinchPlant(o);
    case 'dhe3': return dhe3Plant(o);
    default: return tokamakPlant(o);
  }
}

export const SETS_FUSION: Partial<Record<Act3PieceKind, Act3SetFactory>> = { fusionPlant, dacFarm };
