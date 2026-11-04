/** Act IV's starting state. Kept separate so tests and previews can build one cheaply. */
import { AI_IDS, AIS, DESIGN_IDS, PLANET, PROVINCE0 } from '../content/planet';
import { REGION_IDS } from '../content/mapcodes';
import type { AiId, FusionDesignId, FusionDesignState, GameState, PlanetState, Province } from './types';
import { clamp } from './core';

/** Wellbeing a province settles toward at the start of the act (the daily model refines it). */
function wellbeing0(s: GameState, r: (typeof REGION_IDS)[number]): number {
  const p = PROVINCE0[r];
  const access = s.charter?.access[r] ?? 40;
  const clean = s.charter?.world.blocs[r]?.clean ?? 0.4;
  return clamp(Math.round(48 + access / 6 + clean * 12 - p.heat / 5 - p.water / 6), 15, 85);
}

/** A fresh planet for this world, shaped by how Act III ended. */
export function createPlanet(s: GameState): PlanetState {
  const c = s.charter;
  const powers = c?.renewal?.outcome ?? 'limited';
  const held = c?.threshold?.held ?? 1;
  const provinces = {} as Record<(typeof REGION_IDS)[number], Province>;
  for (const r of REGION_IDS) {
    const p = PROVINCE0[r];
    provinces[r] = { pop: p.pop, heat: p.heat, water: p.water, wellbeing: wellbeing0(s, r), ai: null, aiSince: 0 };
  }
  const fusion = {} as Record<FusionDesignId, FusionDesignState>;
  for (const d of DESIGN_IDS) fusion[d] = { status: 'idle', tries: 0 };
  // Sunforge's Act III pilot plant reached ignition at liftoff if the Charter funded it
  if (s.flags.fusionPilot) fusion.tokamak = { status: 'won', tries: 1, resolvedDay: Number(s.flags.fusionPilot) };
  const answer = String(s.flags.bitAnswer ?? '');
  const ais = {} as Record<AiId, { trust: number; incidents: number; lastIncident: number }>;
  for (const id of AI_IDS) {
    let trust = AIS[id].trust0 + 4 * held;
    if (id === 'bit' && (answer === 'self' || answer === 'everyone')) trust += 6;
    if (id === 'bit' && s.flags.bitDispatch) trust += 4;
    ais[id] = { trust: clamp(trust, 0, 100), incidents: 0, lastIncident: -9999 };
  }
  return {
    stage: 0,
    begun: s.day,
    stageDay: s.day,
    powers,
    company: null,
    plan: null,
    planOpen: false,
    jump: null,
    jumps: [],
    provinces,
    mask: 0,
    tritium: PLANET.tritium0,
    fusion,
    ais,
    bitBond: answer === 'everyone' ? 10 : answer === 'self' ? 5 : 0,
    bitArc: 0,
    debris: { leo: s.flags.orbitalTest ? 14 : 10, geo: s.flags.spaceSolar ? 6 : 4, cis: 1 },
    collisions: 0,
    lastCollision: -9999,
    heatwall: null,
  };
}
