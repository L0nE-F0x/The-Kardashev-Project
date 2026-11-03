/**
 * Act III: the world's energy. Every bloc has a baseline (TW, clean share) that grows on its own and
 * faster as the Charter's projects, missions and links pile up; fossil plants retire faster where the
 * Charter builds clean power. The Charter's own projects add on top. Emissions burn the carbon budget.
 * Acts I–II keep the old closed-form world (worldBaselineTW), so they are unchanged.
 */
import { CHARTER, CONTRACT_KINDS, ENERGY_KINDS, HVDC_ROUTES, WEALTH } from '../content/charter';
import { MEGA_SITES } from '../content/sites';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp, yearsElapsed } from './core';
import { modAdd, techMult } from './effects';

/** Growth weight by wealth: developing blocs grow fastest. */
const GROWTH_WEIGHT = { rich: 0.65, emerging: 1.1, developing: 1.55 } as const;

const missionDone = (s: GameState, id: string) => !!s.charter?.missions[id];
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

/** HVDC routes with a finished link. */
export function hvdcOnline(s: GameState): string[] {
  return [...new Set((s.charter?.projects ?? []).filter((p) => p.kind === 'hvdc' && p.status === 'done').map((p) => p.where))];
}

/** How much of a megaproject's output reaches customers (links, missions, research). */
export function siteYield(s: GameState, siteId: string): number {
  let y = techMult(s, 'energyYield');
  if (missionDone(s, 'backbone')) y *= 1.15;
  const linked = hvdcOnline(s).some((id) => HVDC_ROUTES.find((r) => r.id === id)?.mega === siteId);
  if (linked) y *= 1.1;
  return y;
}

/** Charter clean energy online, TW average, after yields. */
export function charterTW(s: GameState): number {
  let gw = 0;
  for (const p of s.charter?.projects ?? []) {
    if (p.status !== 'done' || !ENERGY_KINDS.includes(p.kind)) continue;
    gw += (p.gw ?? 0) * siteYield(s, p.where);
  }
  return gw / 1000;
}

/** Charter GW online per bloc (for the World screen and retirement maths). */
export function charterGWByRegion(s: GameState): Partial<Record<RegionId, number>> {
  const out: Partial<Record<RegionId, number>> = {};
  for (const p of s.charter?.projects ?? []) {
    if (p.status !== 'done' || !ENERGY_KINDS.includes(p.kind)) continue;
    out[p.region] = (out[p.region] ?? 0) + (p.gw ?? 0) * siteYield(s, p.where);
  }
  return out;
}

/** Firm clean share of Charter energy (nuclear, hydro, geothermal) — the grid front reads it. */
export function charterFirmGW(s: GameState): number {
  return (s.charter?.projects ?? []).filter((p) => p.status === 'done' && (p.kind === 'nuclear' || p.kind === 'hydro' || p.kind === 'geo')).reduce((a, p) => a + (p.gw ?? 0), 0);
}

/** The world economy's growth rate this year and what drives it. */
export function growthParts(s: GameState): { label: string; v: number }[] {
  const c = s.charter;
  if (!c) return [];
  const tw = c.world.charterTW;
  const parts = [
    { label: 'Underlying growth', v: CHARTER.baseGrowth },
    { label: 'Charter energy spillovers', v: Math.min(0.012, 0.0035 * tw) },
    { label: 'Clean Power for All', v: missionDone(s, 'clean-power') ? 0.005 : 0 },
    { label: 'The Global Backbone', v: missionDone(s, 'backbone') ? 0.003 : 0 },
    { label: 'HVDC links', v: 0.0015 * hvdcOnline(s).length },
    { label: 'Compute for Everyone', v: missionDone(s, 'compute-everyone') ? 0.0025 : 0 },
    { label: 'The Chip Commons', v: missionDone(s, 'chip-commons') ? 0.002 : 0 },
    { label: 'Open weights', v: passed(s, 'open-weights') ? 0.002 : 0 },
    { label: 'Carbon overshoot', v: c.world.carbonGt < 0 ? -0.004 : 0 },
    { label: 'Setbacks', v: modAdd(s, 'world:growth') },
  ];
  return parts.filter((x) => x.v !== 0);
}

export function worldGrowth(s: GameState): number {
  return clamp(
    growthParts(s).reduce((a, x) => a + x.v, 0),
    0,
    CHARTER.maxGrowth,
  );
}

/** Clean share of newly built energy worldwide. */
export function newCleanShare(s: GameState): number {
  const c = s.charter;
  if (!c) return 0.35;
  const years = yearsElapsed(s.day - c.founded);
  return clamp(0.35 + 0.02 * years + 0.06 * c.world.charterTW + (missionDone(s, 'clean-power') ? 0.15 : 0) + (passed(s, 'fossil-freeze') ? 0.15 : 0), 0.2, 0.95);
}

/** One day of the world. */
export function tickWorld(s: GameState): void {
  const c = s.charter;
  if (!c) return;
  const w = c.world;
  w.charterTW = charterTW(s);
  w.growth = worldGrowth(s);
  w.newClean = newCleanShare(s);
  const local = charterGWByRegion(s);
  const megaRegions = new Set(MEGA_SITES.filter((m) => (c.projects ?? []).some((p) => p.where === m.id && p.status === 'done')).map((m) => m.region));
  let total = 0;
  let co2 = 0;
  for (const r of REGION_IDS) {
    const b = w.blocs[r];
    const g = (w.growth * GROWTH_WEIGHT[WEALTH[r]]) / 365;
    const added = b.tw * g;
    const cleanShareNew = clamp(w.newClean + (megaRegions.has(r) ? 0.08 : 0), 0, 0.98);
    let cleanTW = b.tw * b.clean + added * cleanShareNew;
    // cheap Charter power next door pushes fossil plants into early retirement
    const fossil = b.tw * (1 - b.clean);
    const localShare = (local[r] ?? 0) / 1000 / Math.max(0.1, b.tw);
    const retire = (fossil * (0.012 + 0.05 * Math.min(1, localShare) + (passed(s, 'fossil-freeze') ? 0.006 : 0))) / 365;
    cleanTW += Math.min(fossil, retire);
    b.tw += added;
    b.clean = clamp(cleanTW / b.tw, 0, 0.99);
    total += b.tw;
    co2 += b.tw * (1 - b.clean) * CHARTER.gtPerFossilTW;
  }
  w.tw = total;
  w.co2Gt = co2;
  w.carbonGt -= co2 / 365;
}

/** World power that counts for K (baseline + Charter), TW. */
export function worldTW(s: GameState): number {
  const c = s.charter;
  return c ? c.world.tw + c.world.charterTW : 0;
}

/** Years until the carbon budget runs out at today's rate (Infinity if emissions are ~0). */
export function carbonYearsLeft(s: GameState): number {
  const w = s.charter?.world;
  if (!w) return Infinity;
  if (w.carbonGt <= 0) return 0;
  return w.co2Gt > 0.01 ? w.carbonGt / w.co2Gt : Infinity;
}

/** World clean share (baseline + Charter). */
export function worldClean(s: GameState): number {
  const w = s.charter?.world;
  if (!w) return 0;
  let clean = 0;
  for (const r of REGION_IDS) clean += w.blocs[r].tw * w.blocs[r].clean;
  return (clean + w.charterTW) / Math.max(0.1, w.tw + w.charterTW);
}

void CONTRACT_KINDS;
