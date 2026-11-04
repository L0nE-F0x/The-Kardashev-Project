/**
 * Act V: the asteroids. Surveys reveal them (near-Earth first, the main belt from stage 2); claims
 * follow the ownership rule (the Commons: only the Charter claims, for political capital; Concessions:
 * the Charter claims and licenses partners to work them; Claims: blocs and partners stake their own,
 * fast and quarrelsome). A foundry planted on a claim works it.
 */
import { ASTEROIDS, ASTEROID_BY_ID } from '../content/system';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import { REGIONS } from '../content/regions';
import { PARTNERS } from '../content/charter';
import type { GameState } from './types';
import { news, pick, rand } from './core';
import { queueEvent } from './events';
import { addCapital } from './charter';
import { plantSeed } from './foundries';

type Result = { ok: true } | { ok: false; reason: string };

/** Asteroids a survey can still reveal now. */
export function unknownInReach(s: GameState): string[] {
  const sy = s.system;
  if (!sy) return [];
  const main = sy.stage >= 2;
  return ASTEROIDS.filter((a) => sy.asteroids[a.id].status === 0 && (a.belt === 'nea' || main)).map((a) => a.id);
}

/** A survey finished: up to three new bodies are mapped. */
export function completeSurvey(s: GameState): string[] {
  const sy = s.system!;
  const found = unknownInReach(s).slice(0, 3);
  for (const id of found) sy.asteroids[id].status = 1;
  if (found.length) news(s, `🔭 The survey maps ${found.map((id) => `${ASTEROID_BY_ID[id].name} (${ASTEROID_BY_ID[id].type})`).join(', ')}.`, 'good');
  return found;
}

/** Political capital a Charter claim costs under the ownership rule. */
export function claimCost(s: GameState): number {
  const own = s.system?.ownership ?? 'commons';
  return own === 'commons' ? 4 : own === 'concessions' ? 3 : 2;
}

export function canClaim(s: GameState, id: string): string | null {
  const sy = s.system;
  if (!sy) return 'Act V only.';
  const st = sy.asteroids[id];
  if (!st) return 'Unknown asteroid.';
  if (st.status === 0) return 'Survey it first.';
  if (st.status >= 2) return `Already claimed${st.owner ? ` by ${ownerName(st.owner)}` : ''}.`;
  if (!sy.ownership) return 'The Council hasn’t decided who owns the sky yet.';
  if ((s.charter?.capital ?? 0) < claimCost(s)) return `Needs ${claimCost(s)} political capital.`;
  return null;
}

export function claimAsteroid(s: GameState, id: string): Result {
  const why = canClaim(s, id);
  if (why) return { ok: false, reason: why };
  const sy = s.system!;
  addCapital(s, -claimCost(s));
  sy.asteroids[id] = { status: 2, owner: 'charter' };
  news(s, `🚩 The Charter claims ${ASTEROID_BY_ID[id].name}.`, 'good');
  return { ok: true };
}

export const claimsBy = (s: GameState, owner: string) => Object.values(s.system?.asteroids ?? {}).filter((a) => a.status >= 2 && a.owner === owner).length;
export const claimsTotal = (s: GameState) => Object.values(s.system?.asteroids ?? {}).filter((a) => a.status >= 2).length;

export function ownerName(owner: string): string {
  return owner === 'charter' ? 'the Charter' : ownerLabel(owner);
}

/** Monthly: other claimants move (Claims) and licensed partners plant their own seeds (Claims and Concessions). */
export function tickAsteroids(s: GameState): void {
  const sy = s.system;
  if (!sy || s.day % 30 !== 0 || !sy.ownership) return;
  const surveyed = ASTEROIDS.filter((a) => sy.asteroids[a.id].status === 1);
  if (sy.ownership === 'claims' && surveyed.length && rand(s) < 0.18) {
    const a = pick(s, surveyed);
    const owner = rand(s) < 0.55 ? pick(s, ['lodestar', 'vonn', 'karman', 'parabola']) : pick(s, REGION_IDS);
    sy.asteroids[a.id] = { status: 2, owner };
    news(s, `🚩 ${ownerLabel(owner)} stakes a claim on ${a.name}.`, 'info');
    if (rand(s) < 0.35) queueEvent(s, 'v-claim-dispute', { asteroid: a.id, owner });
  }
  // private and licensed seeds: the space economy grows beyond the Charter's own contracts
  if (sy.ownership !== 'commons' && sy.stage >= 1) {
    const chance = sy.ownership === 'claims' ? 0.05 : 0.03;
    for (const a of ASTEROIDS) {
      const st = sy.asteroids[a.id];
      if (st.status !== 2 || !st.owner || st.owner === 'charter') continue;
      if (rand(s) < chance) {
        plantSeed(s, a.id, st.owner, 0.8);
        news(s, `🏭 ${ownerLabel(st.owner)} plants a seed foundry on ${a.name}.`, 'info');
      }
    }
  }
}

export function ownerLabel(owner: string): string {
  if (owner === 'charter') return 'The Charter';
  if (PARTNERS[owner]) return PARTNERS[owner].short;
  return REGIONS[owner as RegionId]?.name ?? owner;
}
