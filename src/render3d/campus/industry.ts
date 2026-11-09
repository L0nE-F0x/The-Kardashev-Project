/**
 * View-only set pieces in 3D (supplier fabs, the cloud provider, mines, cable landing stations) and
 * rival campuses. (Being built: see SPEC §28.)
 */
import type { SetPieceFactory } from './registry';

export type SetPieceKind =
  | 'logicFab' | 'memFab' | 'euvHall' | 'pkgLines' | 'cloudHall' | 'admin' | 'gasYard' | 'warehouse' | 'crateYard'
  | 'brinePonds' | 'saltPlant' | 'openPit' | 'crusher' | 'gasWorks' | 'cableHut' | 'manhole' | 'rival';

export const SET_PIECES: Partial<Record<SetPieceKind, SetPieceFactory>> = {};
