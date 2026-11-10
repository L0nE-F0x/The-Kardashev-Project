/**
 * Act V set pieces in 3D: Aurora's town, inside the habitat cylinder (see ../act3sets.ts for the
 * footprints and options). `variant` = the settlement plan ('settle' families, farms, schools;
 * 'stations' dorms and works; 'private' villas and towers; 'early' before a plan), `n` = how
 * lived-in (0..3: more homes, people, laundry, bikes, gardens grown in, lit rooms). Built flat on
 * y = 0 and bent up onto the cylinder's floor. The pieces live in ./habitat/.
 */
import type { Act3PieceKind } from '../plan';
import type { Act3SetFactory } from '../act3sets';
import { habBuild, habDorms, habHouses, habTower, habVilla } from './habitat/homes';
import { habPark, habSchool, habSquare } from './habitat/civic';
import { habFarm, habWorks } from './habitat/land';

export const SETS_HABITAT: Partial<Record<Act3PieceKind, Act3SetFactory>> = {
  habHouses, habSchool, habPark, habFarm, habSquare, habDorms, habWorks, habTower, habVilla, habBuild,
};
