/** Act III set pieces in 3D: the launch complex (see ../act3sets.ts for the footprints and options). */
import type { Act3PieceKind } from '../plan';
import type { Act3SetFactory } from '../act3sets';
import { launchPad } from './launch/pad';
import { vab } from './launch/vab';
import { tankFarm } from './launch/tanks';
import { launchSurvey } from './launch/survey';

export const SETS_LAUNCH: Partial<Record<Act3PieceKind, Act3SetFactory>> = {
  vab,
  launchPad,
  tankFarm,
  launchSurvey,
};
