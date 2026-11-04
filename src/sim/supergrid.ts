/**
 * Act IV: the supergrid. Intercontinental links (plus Act III's HVDC routes) join provinces into
 * grids. The wider a grid spans in longitude, the longer the sun shines on some part of it, so its
 * solar and wind waste less (curtailment falls) and storage needs shrink. Links fault now and then.
 */
import { ANCHORS, HVDC_BY_ID } from '../content/charter';
import { SUPERGRID_BY_ID } from '../content/planet';
import { REGIONS } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { GameState } from './types';
import { clamp, news, rand, randInt } from './core';
import { modMult, techMult } from './effects';

export const act4 = (s: GameState) => (s.act ?? 1) >= 4 && !!s.planet;

/** Province pairs joined by working links (Act IV links that aren't faulted, and Act III HVDC). */
export function gridEdges(s: GameState): [RegionId, RegionId][] {
  const out: [RegionId, RegionId][] = [];
  for (const p of s.charter?.projects ?? []) {
    if (p.status !== 'done') continue;
    if (p.kind === 'link' && (p.downUntil ?? 0) <= s.day) {
      const r = SUPERGRID_BY_ID[p.where];
      if (r) out.push([r.from, r.to]);
    } else if (p.kind === 'hvdc') {
      const r = HVDC_BY_ID[p.where];
      if (r && r.from !== r.to) out.push([r.from, r.to]);
    }
  }
  return out;
}

/** Act IV supergrid links finished (faulted ones included). */
export function linksBuilt(s: GameState): number {
  return new Set((s.charter?.projects ?? []).filter((p) => p.kind === 'link' && p.status === 'done').map((p) => p.where)).size;
}

/** Connected groups of provinces (single provinces included). */
export function gridComponents(s: GameState): RegionId[][] {
  const parent = Object.fromEntries(REGION_IDS.map((r) => [r, r])) as Record<RegionId, RegionId>;
  const find = (r: RegionId): RegionId => (parent[r] === r ? r : (parent[r] = find(parent[r])));
  for (const [a, b] of gridEdges(s)) parent[find(a)] = find(b);
  const groups = new Map<RegionId, RegionId[]>();
  for (const r of REGION_IDS) {
    const root = find(r);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/** The biggest joined grid (empty if no two provinces are linked). */
export function mainGrid(s: GameState): RegionId[] {
  const g = gridComponents(s)[0] ?? [];
  return g.length >= 2 ? g : [];
}

export function inMainGrid(s: GameState, r: RegionId): boolean {
  return mainGrid(s).includes(r);
}

/** All twelve provinces in one grid. */
export function allJoined(s: GameState): boolean {
  return mainGrid(s).length === REGION_IDS.length;
}

/** How much of the day the main grid spans (0..1): a grid stretching ~240° of longitude always has a sunny end. */
export function gridSpan(s: GameState): number {
  const comp = mainGrid(s);
  if (comp.length < 2) return 0;
  const lons = comp.map((r) => ANCHORS[r][1]).sort((a, b) => a - b);
  let gap = 360 - (lons[lons.length - 1] - lons[0]);
  for (let i = 0; i + 1 < lons.length; i++) gap = Math.max(gap, lons[i + 1] - lons[i]);
  return clamp((360 - gap) / 240, 0, 1);
}

/** Extra delivery from Charter energy in a province thanks to the grid (and an AI's dispatch there). */
export function gridYield(s: GameState, r: RegionId): number {
  if (!act4(s)) return 1;
  let y = inMainGrid(s, r) ? 1 + 0.25 * gridSpan(s) * techMult(s, 'linkYield') : 1;
  const ai = s.planet!.provinces[r]?.ai;
  if (ai) y *= 1 + aiDispatch(ai);
  return y;
}

const DISPATCH: Record<string, number> = { bit: 0.06, apex: 0.09, weft: 0.03, sapling: 0.05 };
const aiDispatch = (ai: string) => DISPATCH[ai] ?? 0;

/** World growth from the supergrid (Act IV). */
export function gridGrowth(s: GameState): number {
  if (!act4(s)) return 0;
  return Math.min(0.014, 0.002 * linksBuilt(s)) + (allJoined(s) ? 0.004 : 0);
}

/** One day: links fault now and then (storms, anchors, sabotage) and come back. */
export function tickSupergrid(s: GameState): void {
  if (!act4(s)) return;
  for (const p of s.charter!.projects) {
    if (p.kind !== 'link' || p.status !== 'done' || (p.downUntil ?? 0) > s.day) continue;
    const chance = (1 / (365 * 7)) * modMult(s, 'grid:faults') * (s.planet!.heatwall && !s.planet!.heatwall.done ? 2 : 1);
    if (rand(s) >= chance) continue;
    p.downUntil = s.day + randInt(s, 15, 50);
    const r = SUPERGRID_BY_ID[p.where];
    if (r) news(s, `⚡ A fault takes the ${r.name} down for a few weeks — ${REGIONS[r.from].short} and ${REGIONS[r.to].short} fall back on local power.`, 'bad');
  }
}
