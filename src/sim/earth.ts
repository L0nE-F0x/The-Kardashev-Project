/**
 * Act V: what Earth becomes. Each province drifts between garden (+100: industry moved up, rivers and
 * forests back) and forge (−100: Earth's workshop, up to the Thermal Line), toward the target the
 * Council's decision sets; rewilding programmes push a province greener.
 */
import { WEALTH } from '../content/charter';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp } from './core';

/** Rewilding programmes finished in a province. */
export function rewilds(s: GameState, r: RegionId): number {
  return (s.charter?.projects ?? []).filter((p) => p.kind === 'rewild' && p.status === 'done' && p.where === r).reduce((a, p) => a + p.size, 0);
}

/** The garden value a province is heading for. */
export function gardenTarget(s: GameState, r: RegionId): number {
  const sy = s.system!;
  const wb = s.planet?.provinces[r]?.wellbeing ?? 50;
  let base: number;
  switch (sy.earth) {
    case 'garden': base = 55; break;
    case 'workshop': base = -45; break;
    case 'provinces': base = WEALTH[r] === 'rich' ? 50 : WEALTH[r] === 'emerging' ? 0 : -25 + (wb - 50) * 0.6; break;
    default: return sy.garden[r];
  }
  return clamp(base + 18 * rewilds(s, r), -100, 100);
}

export function tickEarth(s: GameState): void {
  const sy = s.system;
  if (!sy || s.day % 30 !== 0) return;
  for (const r of REGION_IDS) {
    const t = gardenTarget(s, r);
    const step = 1.2 + 0.8 * rewilds(s, r);
    sy.garden[r] = clamp(sy.garden[r] + clamp(t - sy.garden[r], -step, step), -100, 100);
  }
}
