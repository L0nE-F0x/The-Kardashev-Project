/**
 * Act III–V set pieces in 3D, by the shared planner's kinds (`act3Plan` in render/diorama/
 * act3Pieces.ts decides what stands where: the 3D scene lays the same list out on real ground).
 * Footprints are fixed per kind (ACT3_SIZE); builders get the planner's colours, labels, variants,
 * unit numbers and build progress.
 */
import type { Act3PieceKind } from '../../render/diorama/act3Pieces';
import type { SetPieceOpts } from './registry';
import type { Piece } from '../pieces';

export interface Act3SetOpts extends SetPieceOpts {
  /** The planner's accent colours (hex), e.g. a builder's livery or the Charter's gold. */
  accent: string;
  hi: string;
  /** A unit number or size class. */
  n?: number;
  /** Construction progress 0..1 (already in quarter steps), when the piece is being built. */
  p?: number;
  /** The partner building it (colours and signs). */
  builder?: string;
  /** Small variety seed from the planner (alternating tiles). */
  vseed?: number;
  /** The site's backdrop (ground colours under the kit). */
  backdrop?: string;
  /** Out at sea. */
  offshore?: boolean;
}

export type Act3SetFactory = (o: Act3SetOpts) => Piece;

/** Footprints (w × d) per kind, in world units (a campus plot is 28 × 26). */
export const ACT3_SIZE: Partial<Record<Act3PieceKind, [number, number]>> = {
  // Geneva: the Charter's headquarters
  secretariat: [52, 30], council: [36, 32], plaza: [30, 26], jetty: [22, 34],
  // megaprojects
  survey: [46, 32], seaSurvey: [46, 32], megaOffice: [20, 16], megaSub: [30, 24], converter: [36, 26],
  solarField: [50, 40], cspTower: [56, 56], storageYard: [30, 24], windField: [50, 40], windSea: [50, 40],
  seaSub: [22, 22], jackup: [28, 16], reactorUnit: [36, 32], pumpedHydro: [62, 52], geoPad: [30, 24],
  binaryPlant: [30, 24], megaBuild: [44, 34],
  // the launch complex
  vab: [40, 36], launchPad: [40, 40], tankFarm: [30, 24], launchSurvey: [60, 40],
  // Act IV
  fusionPlant: [44, 36], dacFarm: [40, 24],
  moonSurvey: [40, 30], moonHab: [30, 26], moonPad: [30, 30], rimSolar: [40, 24], iceRig: [30, 26], regolithMine: [40, 30],
  he3Plant: [30, 26], he3Tanks: [24, 20], massDriver: [90, 20], moonBuild: [34, 28],
  // Act V (on the Moon)
  moonFoundry: [40, 30],
};

import { SETS_GENEVA } from './sets/geneva';
import { SETS_LAUNCH } from './sets/launch';
import { SETS_MEGA } from './sets/mega';

export const ACT3_SETS: Partial<Record<Act3PieceKind, Act3SetFactory>> = { ...SETS_GENEVA, ...SETS_LAUNCH, ...SETS_MEGA };
