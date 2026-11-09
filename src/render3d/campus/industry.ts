/**
 * View-only set pieces in 3D (supplier fabs, the cloud provider, mines, cable landing stations) and
 * rival campuses. Each is a handmade scale model built in code (see art3d/DIRECTION.md), sized to
 * the footprint in viewOnly.ts#SET_SIZE, front (entrance, signs) towards +z. The drawers live in
 * ./industry/: common.ts (brands, blocks, plant, glass, signs, flags, fans), small.ts (offices,
 * yards, the landing station), fabs.ts (fabs, the EUV hall, packaging, cloud halls), pit.ts (the
 * open pit, its haul trucks and shovel), mines.ts (ponds, the salt plant, the crusher, gas works)
 * and rival.ts (rival labs' campuses).
 */
import type { SetPieceFactory } from './registry';
import { SMALL_PIECES } from './industry/small';
import { FAB_PIECES } from './industry/fabs';
import { openPit } from './industry/pit';
import { MINE_PIECES } from './industry/mines';
import { RIVAL_PIECES } from './industry/rival';

export type SetPieceKind =
  | 'logicFab' | 'memFab' | 'euvHall' | 'pkgLines' | 'cloudHall' | 'admin' | 'gasYard' | 'warehouse' | 'crateYard'
  | 'brinePonds' | 'saltPlant' | 'openPit' | 'crusher' | 'gasWorks' | 'cableHut' | 'manhole' | 'rival';

export const SET_PIECES: Partial<Record<SetPieceKind, SetPieceFactory>> = {
  ...SMALL_PIECES,
  ...FAB_PIECES,
  openPit,
  ...MINE_PIECES,
  ...RIVAL_PIECES,
};
