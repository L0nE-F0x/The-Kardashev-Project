/**
 * Every 3D piece by name: facility types (with their tiers) and the view-only set pieces
 * (supplier fabs, mines, landing stations…). The campus scene and the lab page both build from here.
 */
import type { Facility, FacilityType } from '../../sim/types';
import type { Piece } from '../pieces';
import { ACT1_PIECES } from './act1';
import { ACT2_PLANTS } from './plants2';
import { SET_PIECES, type SetPieceKind } from './industry';

export interface PieceOpts {
  /** Stable per facility (variety). */
  seed: number;
  /** The plot (or merged plots) it stands on, in world units. */
  w: number;
  d: number;
  /** Size tier 1..3 (an upgrade under way builds at the target tier). */
  tier: number;
  /** The facility, when it is one (status, racks, upgrade…). */
  f?: Facility;
}

export interface SetPieceOpts extends PieceOpts {
  /** Brand: 'lumen', 'kestrel', 'stackwell', 'hanbit', 'veldt', 'bondline', 'cumulus', or a mine/owner id. */
  brand: string;
  /** Sign text. */
  label: string;
  variant?: string;
}

export type PieceFactory = (o: PieceOpts) => Piece;
export type SetPieceFactory = (o: SetPieceOpts) => Piece;

export const FACILITY_PIECES: Partial<Record<FacilityType, PieceFactory>> = { ...ACT1_PIECES, ...ACT2_PLANTS };
export { SET_PIECES, type SetPieceKind };

/** Brand colours for set pieces and signs (the map markers use the same). */
export const BRANDS: Record<string, { name: string; accent: string; hi: string }> = {
  lumen: { name: 'LUMEN', accent: '#2fae9b', hi: '#5fd3b5' },
  kestrel: { name: 'KESTREL', accent: '#df5f3e', hi: '#f08a46' },
  stackwell: { name: 'STACKWELL', accent: '#7e43a8', hi: '#a862c4' },
  hanbit: { name: 'HANBIT', accent: '#e86aa0', hi: '#f7a6c4' },
  veldt: { name: 'VELDT', accent: '#fbd46e', hi: '#fde9a4' },
  bondline: { name: 'BONDLINE', accent: '#5a9537', hi: '#7dae3f' },
  cumulus: { name: 'CUMULUS', accent: '#4a7cb6', hi: '#9cc4ea' },
};
