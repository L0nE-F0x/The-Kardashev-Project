import { FACILITIES } from '../content/facilities';
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
  DAYS_PER_MONTH,
  MFU,
  MODEL_PLAN,
  tierOf,
} from './model';

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
  for (const f of s.facilities) {
    if (f.type !== 'datacenter' || f.status !== 'online') continue;
    const frac = power.sites[f.siteId]?.frac ?? 0;
    const site = siteDef(f.siteId);
    const cooling = modMult(s, `site:${f.siteId}:cooling`) * modMult(s, `region:${site.region}:cooling`);
    for (const r of f.racks ?? []) {
      const pf = r.qty * r.perf * frac * cooling;
      ownedPF += pf;
      installed += r.qty;
      locWeighted += pf * REGIONS[site.region].demand * (site.demand ?? 1);
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
  const revenueDay = c > 0 && !s.flags.inferencePaused ? paid * perAccelDay + Math.max(0, accelEq - demand) * perAccelDay * 0.15 : 0;

  // ── research ──
  let talent = 0;
  for (const f of s.facilities) {
    if (f.status !== 'online') continue;
    if (f.type === 'lab') talent += FACILITIES.lab.rp! * siteDef(f.siteId).talent;
    if (f.type === 'hq') talent += FACILITIES.hq.rp! * Math.sqrt(siteDef(f.siteId).talent);
  }
  const researchAccel = (totalPF * a.research) / RENTAL.perf;
  const rpDay = talent * (1 + Math.sqrt(researchAccel / 800)) * (1 + 0.15 * Math.max(0, c - 1)) * techMult(s, 'research') * modMult(s, 'research');

  return { totalPF, ownedPF, rentedPF, locationFactor, installed, revenueDay, rpDay, trainFlopDay, safetyFlopDay };
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
    const step = (interval / 365) * (r.open ? 0.62 : 0.55) * (0.8 + rand(s) * 0.4) * pace;
    r.capability += step;
    r.modelGen += 1;
    r.nextRelease = s.day + Math.round(interval);
    const label = r.open ? `${r.name} open-sources Orchard-${r.modelGen}` : `${r.name} launches ${r.name.split(' ')[0]}-${r.modelGen}`;
    news(s, `📣 ${label} (capability ${r.capability.toFixed(2)}).`, r.open ? 'info' : 'info');
  }
  // slow mean-reverting markets
  s.market.hbm += (1 - s.market.hbm) * 0.01 + (rand(s) - 0.5) * 0.006;
  s.market.hbm = clamp(s.market.hbm, 0.4, 1.3);
  s.market.gasPrice += (1 - s.market.gasPrice) * 0.008 + (rand(s) - 0.5) * 0.01;
  s.market.gasPrice = clamp(s.market.gasPrice, 0.5, 3);
}
