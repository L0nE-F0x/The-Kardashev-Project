/**
 * Act III set pieces in 3D: the megaproject kit (see ../act3sets.ts for the footprints and
 * options). A megaproject site is a row-wrapped sea of these blocks, more of them per stage: the
 * pieces themselves live in ./mega/.
 */
import type { Act3PieceKind } from '../../../render/diorama/act3Pieces';
import type { Act3SetFactory } from '../act3sets';
import { cspTower, solarField, storageYard } from './mega/solar';
import { converter, megaOffice, megaSub, seaSurvey, survey } from './mega/grid';
import { jackup, seaSub, windField, windSea } from './mega/wind';
import { binaryPlant, geoPad, reactorUnit } from './mega/thermal';
import { pumpedHydro } from './mega/hydro';
import { megaBuild } from './mega/build';

export const SETS_MEGA: Partial<Record<Act3PieceKind, Act3SetFactory>> = {
  solarField, cspTower, storageYard,
  survey, seaSurvey, megaOffice, megaSub, converter,
  windField, windSea, seaSub, jackup,
  reactorUnit, geoPad, binaryPlant, pumpedHydro, megaBuild,
};
