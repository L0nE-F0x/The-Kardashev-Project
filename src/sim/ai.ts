import { FACILITIES, HALLS } from '../content/facilities';
import type { RegionId } from '../content/mapcodes';
import { serveMarkets } from './network';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import { TECH_BY_ID } from '../content/techs';
import { RENTAL } from '../content/companies';
import { RIVAL_PACES } from '../content/difficulty';
import type { GameState } from './types';
import { clamp, fmtSci, news, rand } from './core';
import { modMult, techMult } from './effects';
import type { PowerResult } from './power';
import {
  algoEff,
  capabilityOf,
  CAPABILITY_TIERS,
  currentCapability,
  inferDemand,
  inferQuality,
  INFER_REV_PER_ACCEL_MONTH,
  inferPriceTrend,
  DAYS_PER_MONTH,
  frontier,
  MFU,
  MODEL_PLAN,
  tierMult,
  tierOf,
} from './model';
import { sandboxResearch } from './sandbox';

export interface ComputeResult {
  /** Peak PFLOP/s available today. */
  totalPF: number;
  ownedPF: number;
  rentedPF: number;
  /** Demand-weighted location factor for inference revenue. */
  locationFactor: number;
  installed: number;
  revenueDay: number;
  rpDay: number;
  trainFlopDay: number;
  safetyFlopDay: number;
  // ── Act II markets ──
  contractDay: number;
  penaltyDay: number;
  served: Partial<Record<RegionId, number>>;
  demand: Partial<Record<RegionId, number>>;
  delivered: Record<string, number>;
}

/** Turn served power + installed racks into compute, then spend it per the allocation. */
export function tickCompute(s: GameState, power: PowerResult): ComputeResult {
  const r = computeOutputs(s, power);
  s.safety.cumFlop += r.safetyFlopDay;
  if (s.training) {
    s.training.done += r.trainFlopDay;
    if (s.training.done >= s.training.target) releaseModel(s);
  }
  applyResearch(s, r.rpDay);
  return r;
}

/** Pure: what today's compute produces, without applying it. */
export function computeOutputs(s: GameState, power: PowerResult): ComputeResult {
  let ownedPF = 0;
  let locWeighted = 0;
  let installed = 0;
  const pfByRegion: Partial<Record<RegionId, number>> = {};
  for (const f of s.facilities) {
    if (!HALLS.includes(f.type) || f.status !== 'online') continue;
    const frac = power.sites[f.siteId]?.frac ?? 0;
    const site = siteDef(f.siteId);
    const cooling = modMult(s, `site:${f.siteId}:cooling`) * modMult(s, `region:${site.region}:cooling`);
    for (const r of f.racks ?? []) {
      const pf = r.qty * r.perf * frac * cooling;
      ownedPF += pf;
      installed += r.qty;
      locWeighted += pf * REGIONS[site.region].demand * (site.demand ?? 1);
      pfByRegion[site.region] = (pfByRegion[site.region] ?? 0) + pf * (site.demand ?? 1);
    }
  }
  const rentedPF = s.rental.units * RENTAL.perf * modMult(s, 'rental:availability');
  const totalPF = ownedPF + rentedPF;
  const locationFactor = totalPF > 0 ? clamp((locWeighted + rentedPF * 1.05) / totalPF, 0.6, 1.3) : 1;

  const effFlops = totalPF * 1e15 * MFU;
  const a = s.alloc;
  // with no training run queued, the training share serves customers instead of idling
  const trainShare = s.training ? a.train : 0;
  const inferShare = a.infer + (s.training ? 0 : a.train);
  const trainFlopDay = effFlops * trainShare * 86400 * modMult(s, 'training');
  const safetyFlopDay = effFlops * a.safety * 86400;

  // ── inference revenue ──
  const c = currentCapability(s);
  const accelEq = (totalPF * inferShare) / RENTAL.perf;
  const demand = inferDemand(s, c);
  const perAccelDay = (INFER_REV_PER_ACCEL_MONTH / DAYS_PER_MONTH) * inferQuality(s, c) * techMult(s, 'inferEff') * modMult(s, 'revenue') * locationFactor;
  const paid = Math.min(accelEq, demand);
  let revenueDay = c > 0 && !s.flags.inferencePaused ? paid * perAccelDay + Math.max(0, accelEq - demand) * perAccelDay * 0.15 : 0;
  let contractDay = 0;
  let penaltyDay = 0;
  let served: Partial<Record<RegionId, number>> = {};
  let demandBy: Partial<Record<RegionId, number>> = {};
  let delivered: Record<string, number> = {};

  // ── Act II: regional markets, contracts ──
  if ((s.act ?? 1) >= 2) {
    const supply: Partial<Record<RegionId, number>> = {};
    for (const [r, pf] of Object.entries(pfByRegion)) supply[r as RegionId] = ((pf ?? 0) * inferShare) / RENTAL.perf;
    const rentedEq = (rentedPF * inferShare) / RENTAL.perf;
    const perDay = (INFER_REV_PER_ACCEL_MONTH / DAYS_PER_MONTH) * inferPriceTrend(s) * inferQuality(s, c) * techMult(s, 'inferEff') * modMult(s, 'revenue');
    if (c > 0 && !s.flags.inferencePaused) {
      const m = serveMarkets(s, supply, rentedEq, demand, perDay);
      revenueDay = m.revenueDay + m.contractDay;
      contractDay = m.contractDay;
      penaltyDay = m.penaltyDay;
      served = m.served;
      demandBy = m.demand;
      delivered = m.delivered;
    } else revenueDay = 0;
  }

  // ── research ──
  let talent = 0;
  const act2 = (s.act ?? 1) >= 2;
  for (const f of s.facilities) {
    if (f.status !== 'online') continue;
    const site = siteDef(f.siteId);
    const pool = act2 ? 0.55 + 0.45 * (s.talent[site.region] ?? 1) : 1;
    if (f.type === 'lab') talent += FACILITIES.lab.rp! * site.talent * tierMult(f) * pool * modMult(s, `site:${f.siteId}:lab`);
    if (f.type === 'hq') talent += FACILITIES.hq.rp! * Math.sqrt(site.talent);
  }
  const researchAccel = (totalPF * a.research) / RENTAL.perf;
  const rpDay = talent * (1 + Math.sqrt(researchAccel / 800)) * (1 + 0.15 * Math.max(0, c - 1)) * techMult(s, 'research') * modMult(s, 'research') * sandboxResearch(s);

  return { totalPF, ownedPF, rentedPF, locationFactor, installed, revenueDay, rpDay, trainFlopDay, safetyFlopDay, contractDay, penaltyDay, served, demand: demandBy, delivered };
}

/** Unspent research can only be banked so far — labs need a direction. */
export const RESEARCH_POOL_CAP = 80;

function applyResearch(s: GameState, rp: number): void {
  const r = s.research;
  r.pool += rp;
  if (!r.current) {
    r.pool = Math.min(r.pool, RESEARCH_POOL_CAP);
    return;
  }
  const tech = TECH_BY_ID[r.current];
  if (!tech) {
    r.current = null;
    return;
  }
  const take = Math.min(r.pool, tech.cost - r.progress);
  r.progress += take;
  r.pool -= take;
  if (r.progress >= tech.cost - 1e-9) {
    r.done.push(tech.id);
    r.current = null;
    r.progress = 0;
    news(s, `🔬 Research complete: ${tech.name}. ${tech.effect}`, 'good');
  }
}

export function releaseModel(s: GameState): void {
  const run = s.training!;
  const capability = capabilityOf(run.target, algoEff(s));
  s.models.push({ name: run.name, gen: run.gen, flop: run.target, capability, day: s.day });
  s.training = null;
  const tier = CAPABILITY_TIERS[tierOf(capability)];
  news(s, `🤖 ${run.name} released! ${fmtSci(run.target)} FLOP → capability ${capability.toFixed(2)} (${tier}).`, 'good');
  s.flags.lastRelease = s.day;
  // Act II's race with Meridian has a finish line: the model that ships in phase 3 (Bit-4)
  const meridian = (s.act ?? 1) === 2 && run.gen === 4 ? s.market.rivals.find((r) => r.id === 'meridian') : undefined;
  if (meridian) {
    const gap = capability - meridian.capability;
    news(
      s,
      gap >= 0
        ? `🏁 The race: ${run.name} (${capability.toFixed(2)}) overtakes Meridian (${meridian.capability.toFixed(2)})${capability >= frontier(s) ? ' and takes the frontier' : ''}. The IPO bankers noticed.`
        : `🏁 The race: Meridian still leads, ${meridian.capability.toFixed(2)} to ${run.name}’s ${capability.toFixed(2)}. ${gap > -0.3 ? 'Close enough to matter at the IPO.' : 'The IPO bankers will price the gap.'}`,
      gap >= 0 ? 'good' : 'bad',
    );
  }
  if ((s.act ?? 1) >= 2 && capability >= frontier(s) && !s.flags.reachedFrontier) {
    s.flags.reachedFrontier = s.day;
    if (!meridian) news(s, `🏁 ${run.name} matches the frontier. Meridian is no longer alone at the top.`, 'good');
  }
}

export function nextModelPlan(s: GameState) {
  const gen = s.models.length + (s.training ? 1 : 0);
  return { gen: gen + 1, ...(MODEL_PLAN[gen] ?? { name: `Bit-${gen + 1}`, flop: MODEL_PLAN[MODEL_PLAN.length - 1].flop * 10 ** (gen - MODEL_PLAN.length + 1) }) };
}

/** Rival labs ship new frontier models on a cadence; the open lab drags prices down. */
export function tickRivals(s: GameState): void {
  for (const r of s.market.rivals) {
    if (s.day < r.nextRelease) continue;
    const interval = 170 + rand(s) * 90;
    const pace = RIVAL_PACES[s.meta?.rivalPace ?? 'normal']?.mult ?? 1;
    let step = (interval / 365) * (r.open ? 0.62 : 0.55) * (0.8 + rand(s) * 0.4) * pace;
    if ((s.act ?? 1) >= 2) {
      // the scaling era slows down for everyone; campuses they actually build still help
      const theirMW = (s.rivalBuilds ?? []).filter((b) => b.owner === r.id && b.status === 'online').reduce((a, b) => a + b.itMW, 0);
      step *= 0.32 * (1 + Math.min(0.5, theirMW / 2500)) * techMult(s, 'rivalBoost') * modMult(s, `rival:${r.id}:pace`);
    }
    if ((s.act ?? 1) >= 3 && s.charter) {
      const passed = s.charter.council.passed;
      if (passed.includes('compute-cap')) step *= 0.75;
      if (r.open && passed.includes('open-weights')) step *= 1.3;
      if (r.open && passed.includes('closed-frontier')) step *= 0.6;
    }
    r.capability += step;
    r.modelGen += 1;
    r.nextRelease = s.day + Math.round(interval);
    const label = r.open ? `${r.name} open-sources Orchard-${r.modelGen}` : `${r.name} launches ${r.name.split(' ')[0]}-${r.modelGen}`;
    news(s, `📣 ${label} (capability ${r.capability.toFixed(2)}).`, r.open ? 'info' : 'info');
  }
  // slow mean-reverting markets (rival campuses under construction tighten memory)
  const building = (s.act ?? 1) >= 2 ? (s.rivalBuilds ?? []).filter((b) => b.status === 'building').length : 0;
  s.market.hbm += (1 - 0.03 * building - s.market.hbm) * 0.01 + (rand(s) - 0.5) * 0.006;
  s.market.hbm = clamp(s.market.hbm, 0.4, 1.3);
  s.market.gasPrice += (1 - s.market.gasPrice) * 0.008 + (rand(s) - 0.5) * 0.01;
  s.market.gasPrice = clamp(s.market.gasPrice, 0.5, 3);
}
