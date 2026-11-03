/**
 * Act II networks and regional inference markets. Demand lives in regions; a data hall serves
 * its own region at full quality, and others through your private network (fiber, cables) or the
 * public internet at a latency cost. Training doesn't care where it runs.
 */
import { CABLE_BY_ID, CONTINENT, SERVE_EFF } from '../content/network';
import { REGIONS } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import { siteDef } from '../content/sites';
import { RULE_BY_ID } from '../content/politics';
import type { ComputeContract, GameState } from './types';

export type RegionGraph = Record<RegionId, Set<RegionId>>;

/** Is a cable (content id or your own cable id) cut right now? */
export function cableCut(s: GameState, id: string): boolean {
  return (s.network.cuts[id] ?? -1) >= s.day;
}

/** Regions joined by your own fiber, leased capacity and cables. */
export function privateGraph(s: GameState): RegionGraph {
  const g = Object.fromEntries(REGION_IDS.map((r) => [r, new Set<RegionId>()])) as RegionGraph;
  const join = (a: RegionId, b: RegionId) => {
    if (a === b) return;
    g[a].add(b);
    g[b].add(a);
  };
  for (const f of s.network.fiber) if (f.status === 'online') join(siteDef(f.a).region, siteDef(f.b).region);
  for (const id of s.network.leases) {
    const c = CABLE_BY_ID[id];
    if (!c || cableCut(s, id)) continue;
    join(siteDef(c.a).region, siteDef(c.b).region);
  }
  for (const c of s.network.own) if (c.status === 'online' && !cableCut(s, c.id)) join(siteDef(c.a).region, siteDef(c.b).region);
  return g;
}

/** Hops between regions in your private network (Infinity if not connected). */
export function hops(g: RegionGraph, from: RegionId, to: RegionId): number {
  if (from === to) return 0;
  const seen = new Set<RegionId>([from]);
  let frontier: RegionId[] = [from];
  for (let d = 1; frontier.length && d < 12; d++) {
    const next: RegionId[] = [];
    for (const r of frontier)
      for (const n of g[r]) {
        if (seen.has(n)) continue;
        if (n === to) return d;
        seen.add(n);
        next.push(n);
      }
    frontier = next;
  }
  return Infinity;
}

const NEAR = new Set(['europe:africa', 'africa:europe', 'europe:asia', 'asia:europe', 'asia:africa', 'africa:asia', 'asia:oceania', 'oceania:asia']);

/** How well capacity in `from` serves customers in `to` (0..1). */
export function serveEff(s: GameState, g: RegionGraph, from: RegionId, to: RegionId): number {
  let e: number;
  if (from === to) e = SERVE_EFF.local;
  else {
    const h = hops(g, from, to);
    if (h < Infinity) e = SERVE_EFF.private - SERVE_EFF.privateHop * (h - 1);
    else {
      const a = CONTINENT[from];
      const b = CONTINENT[to];
      e = a === b ? SERVE_EFF.continent : NEAR.has(`${a}:${b}`) ? (SERVE_EFF.continent + SERVE_EFF.ocean) / 2 : SERVE_EFF.ocean;
    }
  }
  // data residency: serving a protected market from outside counts for half
  for (const id of s.politics.rules) {
    const r = RULE_BY_ID[id];
    if (r?.item === 'models' && r.to.includes(to) && !r.to.includes(from)) e *= 0.5;
  }
  return e;
}

/** Demand weights per region (users nearby, cable landings). */
export function demandWeights(): Record<RegionId, number> {
  const w = {} as Record<RegionId, number>;
  let total = 0;
  for (const r of REGION_IDS) total += REGIONS[r].demand;
  for (const r of REGION_IDS) w[r] = REGIONS[r].demand / total;
  return w;
}

export interface MarketResult {
  /** $ per day from spot inference, contracts and leftover batch work. */
  revenueDay: number;
  contractDay: number;
  penaltyDay: number;
  served: Partial<Record<RegionId, number>>;
  demand: Partial<Record<RegionId, number>>;
  /** Fraction of each contract delivered today. */
  delivered: Record<string, number>;
}

/**
 * Allocate inference capacity (accelerator-equivalents by region, plus cloud rentals that can go
 * anywhere) to contracts first, then to spot demand by best efficiency. Leftovers earn batch rates.
 */
export function serveMarkets(
  s: GameState,
  supply: Partial<Record<RegionId, number>>,
  rented: number,
  totalDemand: number,
  perAccelDay: number,
): MarketResult {
  const g = privateGraph(s);
  const w = demandWeights();
  const left: Partial<Record<RegionId | 'cloud', number>> = { ...supply, cloud: rented };
  const demand: Partial<Record<RegionId, number>> = {};
  for (const r of REGION_IDS) demand[r] = totalDemand * w[r] * (s.capital.sovereign.some((d) => d.region === r && d.status === 'active' && d.def === 'india-mission') ? 1.4 : 1);
  const res: MarketResult = { revenueDay: 0, contractDay: 0, penaltyDay: 0, served: {}, demand: { ...demand }, delivered: {} };
  const eff = (src: RegionId | 'cloud', dst: RegionId) => (src === 'cloud' ? 0.88 : serveEff(s, g, src, dst));
  const sources = Object.keys(left) as (RegionId | 'cloud')[];

  // contracts: guaranteed capacity at a premium; shortfalls cost a penalty
  for (const c of s.capital.contracts) {
    if (s.day > c.endDay) continue;
    let need = c.units;
    let quality = 0;
    const order = [...sources].sort((a, b) => eff(b, c.region) - eff(a, c.region));
    for (const src of order) {
      if (need <= 0) break;
      const e = eff(src, c.region);
      if (e < 0.6) continue;
      const take = Math.min(need, left[src] ?? 0);
      if (take <= 0) continue;
      left[src]! -= take;
      need -= take;
      quality += take * e;
    }
    const frac = c.units > 0 ? quality / c.units : 1;
    res.delivered[c.id] = frac;
    res.contractDay += (c.monthly / 30.4) * Math.min(1, frac);
    if (frac < 0.95) res.penaltyDay += (c.penalty / 30.4) * (1 - frac);
    res.served[c.region] = (res.served[c.region] ?? 0) + (c.units - need);
  }

  // spot markets: best (source, destination) pairs first
  const pairs: { src: RegionId | 'cloud'; dst: RegionId; e: number }[] = [];
  for (const src of sources) for (const dst of REGION_IDS) pairs.push({ src, dst, e: eff(src, dst) });
  pairs.sort((a, b) => b.e - a.e);
  for (const p of pairs) {
    const have = left[p.src] ?? 0;
    const want = demand[p.dst] ?? 0;
    if (have <= 0 || want <= 0) continue;
    const take = Math.min(have, want);
    left[p.src] = have - take;
    demand[p.dst] = want - take;
    res.revenueDay += take * p.e * perAccelDay;
    res.served[p.dst] = (res.served[p.dst] ?? 0) + take;
  }
  // leftover capacity runs batch jobs at a fraction of the price
  for (const src of sources) res.revenueDay += Math.max(0, left[src] ?? 0) * perAccelDay * 0.15;
  return res;
}

/** Contracts that are still running. */
export function activeContracts(s: GameState): ComputeContract[] {
  return s.capital.contracts.filter((c) => s.day <= c.endDay);
}
