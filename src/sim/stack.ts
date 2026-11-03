/**
 * Act II chip stack markets: shared packaging capacity, raw material prices, deal expiry.
 * (The pool maths that turns these into delivery rates lives in model.ts#supplierPools.)
 */
import { DEAL_BY_ID, POOL_TUNING } from '../content/stack';
import type { GameState, Materials } from './types';
import { clamp, news, rand } from './core';

export function tickStack(s: GameState): void {
  if ((s.act ?? 1) < 2) return;
  const building = s.rivalBuilds.filter((b) => b.status === 'building').length;
  const target = 1 - POOL_TUNING.rivalPressure * building;
  s.market.pkg += (target - s.market.pkg) * 0.01 + (rand(s) - 0.5) * 0.008;
  s.market.pkg = clamp(s.market.pkg, 0.35, 1.25);
  const m = s.market.materials;
  for (const k of Object.keys(m) as (keyof Materials)[]) {
    m[k] += (1 - m[k]) * 0.006 + (rand(s) - 0.5) * 0.01;
    m[k] = clamp(m[k], 0.5, 4);
  }
  const expired = s.stack.deals.filter((d) => d.endDay > 0 && s.day > d.endDay);
  if (expired.length) {
    for (const d of expired) news(s, `📑 ${DEAL_BY_ID[d.id.split('#')[0]]?.name ?? 'A supply deal'} has expired.`, 'info');
    s.stack.deals = s.stack.deals.filter((d) => !(d.endDay > 0 && s.day > d.endDay));
  }
}

/** Push a raw material price (events). */
export function shockMaterial(s: GameState, k: keyof Materials, mult: number): void {
  s.market.materials[k] = clamp(s.market.materials[k] * mult, 0.5, 4);
}
