/**
 * Act II's plants in 3D: hydro, geothermal, reactor restart, SMR pack, nuclear plant, packaging
 * plant, fab and the gigawatt campus, each with its tiers (a plot never grows, so a higher tier is
 * more and taller on the same ground). The pieces live in ./plants2/, sharing ./plants2/parts.ts.
 */
import type { FacilityType } from '../../sim/types';
import type { PieceFactory } from './registry';
import { hydro } from './plants2/hydro';
import { geothermal } from './plants2/geothermal';
import { reactor, restart, smr } from './plants2/nuclear';
import { fab, packaging } from './plants2/industry2';
import { campus } from './plants2/campus';

export const ACT2_PLANTS: Partial<Record<FacilityType, PieceFactory>> = {
  hydro,
  geothermal,
  restart,
  smr,
  reactor,
  packaging,
  fab,
  campus,
};
