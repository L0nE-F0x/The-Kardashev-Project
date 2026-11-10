/**
 * Act IV–V set pieces in 3D: the Moon (see ../act3sets.ts for the footprints and options).
 * Shackleton Base grows as the pixel game's `moonPlan` lays it out: the surveyed site, the outpost
 * (habitats, the pad, solar masts on the rim, the ice rig in the shadowed crater), the mine (the
 * regolith cut, the helium-3 plant and its tanks), the mass driver, whatever is being built in the
 * builder's colours, and in Act V the Moon's own foundry.
 */
import type { Act3PieceKind } from '../plan';
import type { Act3SetFactory } from '../act3sets';
import { iceRig, moonHab, moonPad, moonSurvey, rimSolar } from './moon/outpost';
import { he3Plant, he3Tanks, regolithMine } from './moon/mine';
import { massDriver } from './moon/driver';
import { moonBuild } from './moon/build';
import { moonFoundry } from './moon/foundry';

export const SETS_MOON: Partial<Record<Act3PieceKind, Act3SetFactory>> = {
  moonSurvey, moonHab, moonPad, rimSolar, iceRig, regolithMine, he3Plant, he3Tanks, massDriver, moonBuild, moonFoundry,
};
