/**
 * Act II's plants in 3D: hydro, geothermal, reactor restart, SMR pack, nuclear plant, packaging
 * plant, fab and the gigawatt campus, each with its tiers. (Being built: see SPEC §28.)
 */
import type { FacilityType } from '../../sim/types';
import type { PieceFactory } from './registry';

export const ACT2_PLANTS: Partial<Record<FacilityType, PieceFactory>> = {};
