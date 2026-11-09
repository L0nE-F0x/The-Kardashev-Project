/** Act III set pieces in 3D: the Charter's headquarters in Geneva (see ../act3sets.ts for the footprints and options). */
import type { Act3PieceKind } from '../../../render/diorama/act3Pieces';
import type { Act3SetFactory } from '../act3sets';
import { secretariat } from './geneva/secretariat';
import { council } from './geneva/council';
import { plaza } from './geneva/plaza';
import { jetty } from './geneva/jetty';

export const SETS_GENEVA: Partial<Record<Act3PieceKind, Act3SetFactory>> = {
  secretariat,
  council,
  plaza,
  jetty,
};
