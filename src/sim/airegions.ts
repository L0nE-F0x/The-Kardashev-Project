/**
 * Act IV: AIs that run provinces. Hand a province to an AI once the world's safety margin and that
 * AI's trust allow it (limited powers also cost political capital). Each AI dispatches and builds by
 * its temperament; good years earn trust, incidents cost it, and a province comes back to you when
 * trust falls too far. Rival AIs lobby for provinces of their own.
 */
import { AI_IDS, AIS, PLANET } from '../content/planet';
import { REGIONS } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { AiId, GameState } from './types';

type Result = { ok: true } | { ok: false; reason: string };
import { clamp, news, rand } from './core';
import { addModifier, techMult } from './effects';
import { queueEvent } from './events';
import { worldMargin } from './frontier';
import { addCapital, addLegitimacy, addPartnerRel } from './charter';

const fail = (reason: string): Result => ({ ok: false, reason });
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

/** Provinces each AI runs. */
export function regionsOf(s: GameState, ai: AiId): RegionId[] {
  const pl = s.planet;
  return pl ? REGION_IDS.filter((r) => pl.provinces[r].ai === ai) : [];
}

export function aiRegionCount(s: GameState): number {
  const pl = s.planet;
  return pl ? REGION_IDS.filter((r) => pl.provinces[r].ai).length : 0;
}

/** The world safety margin a delegation needs (AI charters relax it). */
export const marginNeeded = (s: GameState) => (passed(s, 'ai-charters') ? -0.15 : 0);

export function canDelegate(s: GameState, r: RegionId, ai: AiId): string | null {
  const pl = s.planet;
  if (!pl) return 'Act IV only.';
  if (pl.stage < 1) return 'Opens with the first five-year plan.';
  if (pl.provinces[r].ai === ai) return `${AIS[ai].name} already runs it.`;
  if (s.charter?.council.walkouts[r]) return `${REGIONS[r].name} has walked out of the Charter.`;
  if (worldMargin(s) < marginNeeded(s)) return 'The world safety margin is below zero: nobody trusts any AI with a province right now.';
  if (pl.ais[ai].trust < PLANET.aiTrustToDelegate) return `${AIS[ai].name}’s trust is ${Math.round(pl.ais[ai].trust)}; it needs ${PLANET.aiTrustToDelegate}.`;
  if (pl.powers !== 'planetary' && (s.charter?.capital ?? 0) < PLANET.approvalCapital) return `Your powers are limited: the Council has to approve it (${PLANET.approvalCapital} political capital).`;
  const owner = AIS[ai].owner;
  if (owner !== 'charter' && (s.charter?.partners[owner]?.rel ?? 50) < 30) return `${AIS[ai].name}’s lab won’t work with you.`;
  return null;
}

export function delegate(s: GameState, r: RegionId, ai: AiId): Result {
  const why = canDelegate(s, r, ai);
  if (why) return fail(why);
  const pl = s.planet!;
  if (pl.powers !== 'planetary') addCapital(s, -PLANET.approvalCapital);
  const before = pl.provinces[r].ai;
  pl.provinces[r].ai = ai;
  pl.provinces[r].aiSince = s.day;
  const owner = AIS[ai].owner;
  if (owner !== 'charter') addPartnerRel(s, owner, 6);
  news(s, `🤖 ${REGIONS[r].name} is now run by ${AIS[ai].name}${before ? ` (taking over from ${AIS[before].name})` : ''}.`, 'event');
  return { ok: true };
}

export function recall(s: GameState, r: RegionId): Result {
  const pl = s.planet;
  const ai = pl?.provinces[r].ai;
  if (!pl || !ai) return fail('No AI runs it.');
  pl.provinces[r].ai = null;
  pl.ais[ai].trust = clamp(pl.ais[ai].trust - 3, 0, 100);
  if (AIS[ai].owner !== 'charter') addPartnerRel(s, AIS[ai].owner, -4);
  news(s, `🖐 The Charter takes ${REGIONS[r].name} back from ${AIS[ai].name}.`);
  return { ok: true };
}

export function addTrust(s: GameState, ai: AiId, d: number): void {
  const st = s.planet?.ais[ai];
  if (st) st.trust = clamp(st.trust + d, 0, 100);
}

/** An AI's incident in one of its provinces. */
export function aiIncident(s: GameState, r: RegionId, ai: AiId): void {
  const pl = s.planet!;
  const st = pl.ais[ai];
  st.incidents += 1;
  st.lastIncident = s.day;
  addTrust(s, ai, -12);
  addModifier(s, `prov:${r}`, 240, `${AIS[ai].name} incident`, { add: -8 });
  addLegitimacy(s, -1.5);
  if (st.trust < PLANET.aiTrustRevert) {
    for (const x of REGION_IDS) if (pl.provinces[x].ai === ai) pl.provinces[x].ai = null;
    news(s, `🚨 Trust in ${AIS[ai].name} collapses: every province it ran comes back to the Charter.`, 'bad');
  }
}

/** One day for the AIs. */
export function tickAis(s: GameState): void {
  const pl = s.planet;
  if (!pl) return;
  const margin = worldMargin(s);
  for (const r of REGION_IDS) {
    const ai = pl.provinces[r].ai;
    if (!ai) continue;
    const def = AIS[ai];
    const st = pl.ais[ai];
    // incidents: riskier AIs, low trust and a negative world margin make them likelier
    const chance = 0.0007 * def.risk * (1.5 - st.trust / 100) * (margin < 0 ? 2 : 1) * techMult(s, 'aiIncident');
    if (rand(s) < chance && s.day - st.lastIncident > 90) {
      if (s.flags.offline) aiIncident(s, r, ai);
      else queueEvent(s, 'ai-incident', { region: r, ai });
      continue;
    }
    // good years earn trust; neglected provinces cost it
    const wb = pl.provinces[r].wellbeing;
    if (wb >= 50 && s.day - st.lastIncident > 180) addTrust(s, ai, 0.02);
    else if (wb < 35) addTrust(s, ai, -0.01);
  }
  // AIs that run nothing still build a reputation through their labs' work
  if (s.day % 30 === 0) for (const ai of AI_IDS) if (!regionsOf(s, ai).length) addTrust(s, ai, margin >= 0 ? 0.15 : -0.1);
}

/** Growth the AIs add to the world economy. */
export function aiGrowth(s: GameState): number {
  const pl = s.planet;
  if (!pl) return 0;
  return REGION_IDS.reduce((a, r) => a + (pl.provinces[r].ai ? AIS[pl.provinces[r].ai!].growth : 0), 0);
}

/** Compute access an AI adds to its provinces (per month, used by computeAccess). */
export function aiAccessBonus(s: GameState, r: RegionId): number {
  const ai = s.planet?.provinces[r].ai;
  if (!ai) return 0;
  const months = Math.max(0, (s.day - s.planet!.provinces[r].aiSince) / 30.4);
  return Math.min(20, AIS[ai].access * months);
}
