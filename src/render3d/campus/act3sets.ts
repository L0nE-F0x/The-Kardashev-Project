/**
 * Act III–V set pieces in 3D, by the shared planner's kinds (`act3Plan` in render/diorama/
 * act3Pieces.ts decides what stands where: the 3D scene lays the same list out on real ground).
 * Footprints are fixed per kind (ACT3_SIZE); builders get the planner's colours, labels, variants,
 * unit numbers and build progress.
 */
import type { Act3PieceKind } from './plan';
import type { SetPieceOpts } from './registry';
import type { Piece } from '../pieces';

export interface Act3SetOpts extends SetPieceOpts {
  /** The planner's accent colours (hex), e.g. a builder's livery or the Charter's gold. */
  accent: string;
  hi: string;
  /** A unit number or size class. */
  n?: number;
  /** Construction progress 0..1 (already in quarter steps), when the piece is being built. */
  p?: number;
  /** The partner building it (colours and signs). */
  builder?: string;
  /** Small variety seed from the planner (alternating tiles). */
  vseed?: number;
  /** The site's backdrop (ground colours under the kit). */
  backdrop?: string;
  /** Out at sea. */
  offshore?: boolean;
}

export type Act3SetFactory = (o: Act3SetOpts) => Piece;

export { ACT3_SIZE } from './act3sizes';

import { SETS_GENEVA } from './sets/geneva';
import { SETS_LAUNCH } from './sets/launch';
import { SETS_MEGA } from './sets/mega';
import { SETS_FUSION } from './sets/fusion';
import { SETS_MOON } from './sets/moon';
import { SETS_SPACE } from './sets/space';
import { SETS_HABITAT } from './sets/habitat';
import { SETS_ASTEROID } from './sets/asteroid';

export const ACT3_SETS: Partial<Record<Act3PieceKind, Act3SetFactory>> = { ...SETS_GENEVA, ...SETS_LAUNCH, ...SETS_MEGA, ...SETS_FUSION, ...SETS_MOON, ...SETS_SPACE, ...SETS_HABITAT, ...SETS_ASTEROID };
