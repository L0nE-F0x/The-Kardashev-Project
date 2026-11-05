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
import { HALLS } from '../content/facilities';
import { RENTAL } from '../content/companies';
import type { ComputeContract, GameState } from './types';
import { modMult } from './effects';

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

type Source = RegionId | 'cloud';
/** Below this serving efficiency, capacity can't count toward a contract (too slow for an SLA). */
export const CONTRACT_MIN_EFF = 0.6;
/** Delivering less than this costs a penalty. */
export const CONTRACT_SLA = 0.95;
/** A contract you couldn't deliver at least this much of today can't be signed (the UI warns below CONTRACT_SLA). */
export const CONTRACT_MIN_SIGN = 0.5;

/** Give one contract its capacity from the best sources first; returns the quality-weighted share delivered and the units used. */
function allocateContract(left: Partial<Record<Source, number>>, eff: (src: Source, dst: RegionId) => number, c: ComputeContract): { frac: number; used: number; from: Source[] } {
  let need = c.units;
  let quality = 0;
  const from: Source[] = [];
  const order = (Object.keys(left) as Source[]).sort((a, b) => eff(b, c.region) - eff(a, c.region));
  for (const src of order) {
    if (need <= 0) break;
    const e = eff(src, c.region);
    if (e < CONTRACT_MIN_EFF) continue;
    const take = Math.min(need, left[src] ?? 0);
    if (take <= 0) continue;
    left[src]! -= take;
    need -= take;
    quality += take * e;
    from.push(src);
  }
  return { frac: c.units > 0 ? quality / c.units : 1, used: c.units - need, from };
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
  const left: Partial<Record<Source, number>> = { ...supply, cloud: rented };
  const demand: Partial<Record<RegionId, number>> = {};
  for (const r of REGION_IDS) demand[r] = totalDemand * w[r] * (s.capital.sovereign.some((d) => d.region === r && d.status === 'active' && d.def === 'india-mission') ? 1.4 : 1);
  const res: MarketResult = { revenueDay: 0, contractDay: 0, penaltyDay: 0, served: {}, demand: { ...demand }, delivered: {} };
  const eff = (src: Source, dst: RegionId) => (src === 'cloud' ? 0.88 : serveEff(s, g, src, dst));
  const sources = Object.keys(left) as Source[];

  // contracts: guaranteed capacity at a premium; shortfalls cost a penalty
  for (const c of s.capital.contracts) {
    if (s.day > c.endDay) continue;
    const { frac, used } = allocateContract(left, eff, c);
    res.delivered[c.id] = frac;
    res.contractDay += (c.monthly / 30.4) * Math.min(1, frac);
    if (frac < CONTRACT_SLA) res.penaltyDay += (c.penalty / 30.4) * (1 - frac);
    res.served[c.region] = (res.served[c.region] ?? 0) + used;
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

/** Today's inference capacity by region (accelerator-equivalents) plus cloud rentals: the same numbers ai.ts#computeOutputs serves markets with. */
export function inferenceSupply(s: GameState): { supply: Partial<Record<RegionId, number>>; rented: number } {
  const share = s.alloc.infer + (s.training ? 0 : s.alloc.train);
  const supply: Partial<Record<RegionId, number>> = {};
  for (const f of s.facilities) {
    if (!HALLS.includes(f.type) || f.status !== 'online') continue;
    const frac = s.stats.sitePower?.[f.siteId]?.frac ?? 0;
    const site = siteDef(f.siteId);
    const cooling = modMult(s, `site:${f.siteId}:cooling`) * modMult(s, `region:${site.region}:cooling`);
    for (const r of f.racks ?? []) supply[site.region] = (supply[site.region] ?? 0) + (r.qty * r.perf * frac * cooling * (site.demand ?? 1) * share) / RENTAL.perf;
  }
  return { supply, rented: s.rental.units * modMult(s, 'rental:availability') * share };
}

/**
 * What a contract would deliver if you signed it today, after the contracts you already serve: the
 * quality-weighted share (as the contract tracker counts it), where it would be served from, and the
 * money a month after penalties.
 */
export function contractDeliverable(s: GameState, c: ComputeContract): { frac: number; from: Source[]; net: number } {
  const g = privateGraph(s);
  const { supply, rented } = inferenceSupply(s);
  const left: Partial<Record<Source, number>> = { ...supply, cloud: rented };
  const eff = (src: Source, dst: RegionId) => (src === 'cloud' ? 0.88 : serveEff(s, g, src, dst));
  for (const k of s.capital.contracts) if (s.day <= k.endDay) allocateContract(left, eff, k);
  const { frac, from } = allocateContract(left, eff, c);
  const net = c.monthly * Math.min(1, frac) - (frac < CONTRACT_SLA ? c.penalty * (1 - frac) : 0);
  return { frac, from, net };
}
