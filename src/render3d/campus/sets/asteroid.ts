/**
 * Act V set pieces in 3D: the asteroids (see ../act3sets.ts for the footprints and options).
 * `variant` = the rock type (C carbon, S stone, M metal) and, after a `|`, the yards' flags
 * (h halted, q1–3 quarantine) or `post` (the claim at a working mine). The pieces live in
 * ./asteroid/.
 */
import type { Act3PieceKind } from '../plan';
import type { Act3SetFactory } from '../act3sets';
import { astBeacon, astCatapult, astClaim, astRig, astRocks } from './asteroid/pieces';

export const SETS_ASTEROID: Partial<Record<Act3PieceKind, Act3SetFactory>> = { astRocks, astBeacon, astClaim, astRig, astCatapult };
