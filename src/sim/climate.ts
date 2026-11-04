/**
 * Act IV: warming in °C. Act III's 2 °C carbon budget keeps burning down with emissions; warming
 * follows what has been spent (1.45 °C when the budget was 500 Gt, 2.0 °C when it's gone). Direct air
 * capture puts carbon back in the budget; solar geoengineering masks some warming while it runs
 * and rebounds fast if it stops.
 */
import { CHARTER, CONTRACT_KINDS } from '../content/charter';
import { PLANET } from '../content/planet';
import type { GameState } from './types';
import { techMult } from './effects';

const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

/** Warming before geoengineering (°C). */
export function rawWarming(s: GameState): number {
  const left = s.charter?.world.carbonGt ?? CHARTER.carbon0;
  return PLANET.warming0 + PLANET.warmingPerGt * (CHARTER.carbon0 - left);
}

/** Warming felt today (°C). */
export function warming(s: GameState): number {
  return rawWarming(s) - (s.planet?.mask ?? 0);
}

/** Air capture running, Gt CO₂ a year. */
export function dacGt(s: GameState): number {
  return (s.charter?.projects ?? []).filter((p) => p.kind === 'dac' && p.status === 'done').reduce((a, p) => a + CONTRACT_KINDS.dac.sizes[p.size - 1], 0) * techMult(s, 'dacEff');
}

/** One day of climate repair. */
export function tickClimate(s: GameState): void {
  const pl = s.planet;
  const c = s.charter;
  if (!pl || !c) return;
  c.world.carbonGt += dacGt(s) / 365;
  // geoengineering: the mask builds up slowly while it's in force and falls away fast when it stops
  if (passed(s, 'geoengineering')) pl.mask = Math.min(0.4, pl.mask + 0.1 / 365);
  else if (pl.mask > 0) pl.mask = Math.max(0, pl.mask - 0.2 / 365);
}
