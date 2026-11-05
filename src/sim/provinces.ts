/**
 * Act IV: the blocs as provinces. Heat and water stress follow warming, waste heat and the water &
 * cooling programmes; wellbeing drifts toward a target set by power, access, the grid, heat, water,
 * the AI running the province and recent shocks. Wellbeing feeds relations, Council votes and the
 * AIs' trust; very low wellbeing brings unrest.
 */
import { CONTRACT_KINDS } from '../content/charter';
import { AIS, PLANET, PROVINCE0 } from '../content/planet';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp, rand } from './core';
import { modAdd, techMult } from './effects';
import { queueEvent } from './events';
import { addRelation } from './politics';
import { inMainGrid } from './supergrid';
import { habitatWellbeing } from './swarm';
import { warming } from './climate';
import { fusionTW } from './fusion';
import { wasteHeat } from './planetView';
import { overLine } from './swarm';

/** Beam stations delivering to a province (Act V), TW. */
function beamTWIn(s: GameState, r: RegionId): number {
  return (s.charter?.projects ?? []).filter((p) => p.kind === 'beam' && p.status === 'done' && p.where === r).reduce((a, p) => a + CONTRACT_KINDS.beam.sizes[p.size - 1], 0);
}

/** Water & cooling programmes finished in a province. */
function programmes(s: GameState, r: RegionId): number {
  return (s.charter?.projects ?? []).filter((p) => p.kind === 'desal' && p.status === 'done' && p.where === r).reduce((a, p) => a + CONTRACT_KINDS.desal.sizes[p.size - 1], 0);
}

/** Heat index a province has today. */
export function heatOf(s: GameState, r: RegionId): number {
  const w = warming(s);
  const stage = s.planet?.stage ?? 0;
  return clamp(PROVINCE0[r].heat + (w - 1.5) * 18 + (stage >= 3 ? 2.5 * wasteHeat(s, r) : 0) - 4 * programmes(s, r), 0, 100);
}

/** Water stress a province has today. */
export function waterOf(s: GameState, r: RegionId): number {
  return clamp(PROVINCE0[r].water + (warming(s) - 1.5) * 10 - 10 * programmes(s, r) - (inMainGrid(s, r) ? 4 : 0), 0, 100);
}

/** Where wellbeing is heading, and why. */
export function wellbeingTarget(s: GameState, r: RegionId): { v: number; parts: [string, number][] } {
  const pl = s.planet!;
  const c = s.charter!;
  const p = pl.provinces[r];
  const parts: [string, number][] = [
    ['Baseline', 50],
    ['Compute access', ((c.access[r] ?? 40) - 50) / 5],
    ['Clean power', ((c.world.blocs[r]?.clean ?? 0.4) - 0.5) * 16],
    ['On the supergrid', inMainGrid(s, r) ? 5 : 0],
    ['Heat', -(p.heat - 50) / 4],
    ['Water stress', -(p.water - 40) / 5],
    ['Abundant fusion', 3 * Math.min(1, fusionTW(s) / 3)],
    ['Warming', -Math.max(0, warming(s) - 1.6) * 10],
    [p.ai ? `${AIS[p.ai].name} runs it` : 'Run by the Charter', p.ai ? AIS[p.ai].care * 10 : 0],
    ['Recent shocks', modAdd(s, `prov:${r}`)],
  ];
  // Act V: gardens or the workshop, healthy years, power from the swarm, the Thermal Line
  const sy = s.system;
  if (sy) {
    const g = sy.garden[r];
    parts.push([g >= 0 ? 'Gardens and wild places' : 'Heavy industry', g >= 0 ? g / 12 : g / 25]);
    parts.push(['Healthy years', (sy.treated[r] / 100) * 7]);
    const avgT = REGION_IDS.reduce((a, x) => a + sy.treated[x], 0) / REGION_IDS.length;
    if (sy.longevity === 'market' && sy.treated[r] < 30 && avgT > 45) parts.push(['Left behind by the clinics', -6]);
    const beam = beamTWIn(s, r);
    if (beam > 0) parts.push(['Power from the swarm', Math.min(4, beam / 30)]);
    const over = overLine(s);
    if (over > 0) parts.push(['Over the Thermal Line', -Math.min(12, over * 40)]);
    // towns in the sky send goods and make room on the ground
    const hab = habitatWellbeing(s);
    if (hab >= 0.5) parts.push(['Goods and room from the habitats', hab]);
  }
  const v = parts.reduce((a, x) => a + x[1], 0) * techMult(s, 'wellbeingGain');
  return { v: clamp(v, 0, 100), parts: parts.filter((x) => Math.abs(x[1]) >= 0.5) };
}

/** Population-weighted average wellbeing. */
export function avgWellbeing(s: GameState): number {
  const pl = s.planet;
  if (!pl) return 0;
  let w = 0;
  let pop = 0;
  for (const r of REGION_IDS) {
    w += pl.provinces[r].wellbeing * pl.provinces[r].pop;
    pop += pl.provinces[r].pop;
  }
  return pop ? w / pop : 0;
}

export function minWellbeing(s: GameState): { r: RegionId; v: number } {
  const pl = s.planet!;
  let best: RegionId = 'ssa';
  for (const r of REGION_IDS) if (pl.provinces[r].wellbeing < pl.provinces[best].wellbeing) best = r;
  return { r: best, v: pl.provinces[best].wellbeing };
}

/** One day for every province. */
export function tickProvinces(s: GameState): void {
  const pl = s.planet;
  if (!pl || !s.charter) return;
  const monthly = s.day % 30 === 0;
  for (const r of REGION_IDS) {
    const p = pl.provinces[r];
    p.heat = heatOf(s, r);
    p.water = waterOf(s, r);
    const t = wellbeingTarget(s, r).v;
    p.wellbeing = clamp(p.wellbeing + (t - p.wellbeing) * 0.012, 0, 100);
    // people slowly follow the good life (and flee the heat)
    p.pop *= 1 + (0.004 + (p.wellbeing - 50) / 20_000) / 365;
    if (monthly) {
      addRelation(s, r, (p.wellbeing - 50) / 60);
      if (p.wellbeing < 30 && rand(s) < 0.2 && !s.flags.offline && s.day - Number(s.events.last['province-unrest'] ?? -9999) > 240) queueEvent(s, 'province-unrest', { region: r });
    }
  }
}

/** Checklist: every province at or above the goal. */
export function provincesThriving(s: GameState): boolean {
  return !!s.planet && REGION_IDS.every((r) => s.planet!.provinces[r].wellbeing >= PLANET.goalWellbeing);
}
