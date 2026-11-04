/** Act V's starting state. Kept separate so tests and previews can build one cheaply. */
import { ASTEROIDS, SYSTEM } from '../content/system';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { AsteroidState, GameState, SystemState } from './types';
import { clamp } from './core';

/** A fresh system for this world, shaped by how Act IV ended. */
export function createSystem(s: GameState): SystemState {
  const held = s.planet?.heatwall?.held ?? 1;
  const garden = {} as Record<RegionId, number>;
  const treated = {} as Record<RegionId, number>;
  for (const r of REGION_IDS) {
    // provinces that thrived in Act IV start a little greener
    const wb = s.planet?.provinces[r]?.wellbeing ?? 50;
    garden[r] = clamp(Math.round((wb - 55) / 2), -30, 30);
    treated[r] = 0;
  }
  const asteroids: Record<string, AsteroidState> = {};
  for (const a of ASTEROIDS) asteroids[a.id] = { status: 0, owner: null };
  return {
    stage: 0,
    begun: s.day,
    stageDay: s.day,
    thermalLine: null,
    ownership: null,
    earth: null,
    longevity: null,
    seat: null,
    settlement: null,
    bitFate: null,
    next: null,
    dial: 3,
    reinvest: 0.45,
    minds: 0.5,
    foundries: [],
    asteroids,
    collectors: 0,
    rings: 0,
    habitat: 0,
    beams: 0,
    damage: 0,
    spacePop: 0,
    hardening: 0.1 * held,
    sentinels: 0,
    mercury: 0,
    garden,
    heatWarming: 0,
    lifeExp: SYSTEM.lifeExp0,
    lifeRate: 0.2,
    escape: null,
    treated,
    mindsMood: 50 + 5 * held,
    bitArc: 0,
    cast: {},
    plan: null,
    planOpen: false,
    jump: null,
    eras: [],
    solarmax: null,
    typeI: null,
  };
}
