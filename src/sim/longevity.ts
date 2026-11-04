/**
 * Act V: longevity escape velocity. The minds in orbit design therapies; clinics bring them to the
 * provinces. Healthy life expectancy climbs by `lifeRate` years a year, weighted by how many people
 * are treated; escape velocity is when it climbs faster than a year per year. Who gets treated first
 * follows the Council's decision: everyone at once (slower, fair), by need (the developing provinces
 * first) or those who can pay (fast, unequal).
 */
import { SYSTEM } from '../content/system';
import { WEALTH } from '../content/charter';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp, news } from './core';
import { modAdd, techMult } from './effects';
import { queueEvent } from './events';

/** Clinic programmes finished in a province. */
export function clinics(s: GameState, r: RegionId): number {
  return (s.charter?.projects ?? []).filter((p) => p.kind === 'clinic' && p.status === 'done' && p.where === r).reduce((a, p) => a + p.size, 0);
}

/** How fast healthy life expectancy could climb today (years per year). */
export function lifeRateTarget(s: GameState): number {
  const sy = s.system!;
  const plan = sy.longevity === 'market' ? 1.15 : sy.longevity === 'everyone' ? 0.9 : 1;
  const minds = Math.min(0.85, 0.24 * Math.log10(1 + sy.rings / 20));
  const allClinics = REGION_IDS.reduce((a, r) => a + clinics(s, r), 0);
  return Math.min(1.8, (0.18 + minds + Math.min(0.3, 0.01 * allClinics) + modAdd(s, 'longevity:rate')) * plan * techMult(s, 'longevity'));
}

/** Treatment coverage a province is heading for (0..100). */
export function treatedTarget(s: GameState, r: RegionId): number {
  const sy = s.system!;
  if (sy.lifeRate < 0.35 || !sy.longevity) return 0;
  const wealth = WEALTH[r];
  const base = sy.longevity === 'everyone' ? 55 : sy.longevity === 'need' ? (wealth === 'developing' ? 70 : wealth === 'emerging' ? 55 : 40) : wealth === 'rich' ? 85 : wealth === 'emerging' ? 45 : 20;
  const ramp = clamp((sy.lifeRate - 0.35) / 0.8, 0, 1);
  return clamp(base * (0.4 + 0.6 * ramp) + 15 * clinics(s, r), 0, 100);
}

export const avgTreated = (s: GameState) => (s.system ? REGION_IDS.reduce((a, r) => a + s.system!.treated[r], 0) / REGION_IDS.length : 0);

export function tickLongevity(s: GameState): void {
  const sy = s.system;
  if (!sy) return;
  sy.lifeRate += (lifeRateTarget(s) - sy.lifeRate) / 365;
  const coverage = 0.3 + 0.7 * (avgTreated(s) / 100);
  sy.lifeExp += (sy.lifeRate * coverage) / 365;
  if (s.day % 30 === 0) for (const r of REGION_IDS) sy.treated[r] += (treatedTarget(s, r) - sy.treated[r]) * 0.04;
  if (!sy.escape && sy.lifeRate * coverage >= 1) {
    sy.escape = s.day;
    news(s, '🧬 Longevity escape velocity: healthy life expectancy is now rising by more than a year every year.', 'good');
    queueEvent(s, 'v-escape');
  }
  void SYSTEM;
}
