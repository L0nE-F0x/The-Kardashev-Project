import { actObjectives, goalsMetForSeriesA } from '../content/objectives';
import { FACILITIES, GENERATORS, HALLS } from '../content/facilities';
import { tickStack } from './stack';
import { tickCapital } from './capital';
import { tickPolitics } from './politics';
import { tickRivalBuilds } from './rivals';
import { tickJobs } from './jobs';
import { tickFinale } from './finale';
import { tickAct } from './act2';
import { tickAct3 } from './act3';
import { tickCharter } from './charter';
import { tickWorld } from './world';
import { tickCouncil } from './council';
import { tickRegime } from './frontier';
import { tickTrustee } from './trustee';
import { tickDesk } from './desk';
import { tickThreshold } from './threshold';
import { leaseCost } from './actions';
import { spend } from './economy';
import { ADVISORS } from '../content/advisors';
import type { GameState } from './types';
import { news } from './core';
import { expireModifiers } from './effects';
import { tickConstruction } from './build';
import { tickSupply, type SimContext } from './supply';
import { solvePower, type PowerResult } from './power';
import { computeOutputs, tickCompute, tickRivals, type ComputeResult } from './ai';
import { earn, tickEconomy, tickLicense } from './economy';
import { queueEvent, tickEvents } from './events';
import {
  alignmentOf,
  currentCapability,
  DAYS_PER_MONTH,
  facilityIT,
  facilityMW,
  frontier,
  inferDemand,
  inferQuality,
  kardashev,
  supplierPools,
  worldBaselineTW,
} from './model';
import { RENTAL } from '../content/companies';

/** Advance the world by one day. */
export function tick(s: GameState, ctx: SimContext): void {
  s.day += 1;
  const act2 = (s.act ?? 1) >= 2;
  tickConstruction(s);
  tickSupply(s, ctx);
  if (act2) tickStack(s);
  const power = solvePower(s);
  const compute = tickCompute(s, power);
  const econ = tickEconomy(s, power, compute);
  if (act2) {
    const lease = leaseCost(s) / DAYS_PER_MONTH;
    if (lease) spend(s, 'opex', lease);
    tickCapital(s, compute);
    tickPolitics(s);
    tickRivalBuilds(s);
  }
  const act3 = (s.act ?? 1) >= 3 && !!s.charter;
  if (act3) {
    tickCharter(s, compute.revenueDay);
    tickWorld(s);
    tickCouncil(s);
    tickRegime(s);
  }
  tickLicense(s, power);
  tickRivals(s);
  s.carbon.cumMt += power.co2 / 1e6;
  updateStats(s, power, compute, econ.costs);
  if (act2) {
    tickJobs(s, ctx);
    tickFinale(s);
  }
  if (act3) {
    tickTrustee(s);
    tickDesk(s);
    tickThreshold(s);
  }
  tickObjectives(s);
  tickAct(s);
  tickAct3(s);
  tickEvents(s);
  expireModifiers(s);
}

/** Recompute derived numbers without advancing time (e.g. right after a player action). */
export function refreshStats(s: GameState): void {
  const power = solvePower(s);
  const compute = computeOutputs(s, power);
  updateStats(s, power, compute, s.stats.costMonth / DAYS_PER_MONTH);
}

function updateStats(s: GameState, power: PowerResult, compute: ComputeResult, costDay: number): void {
  const st = s.stats;
  const c = currentCapability(s);
  let owned = 0;
  for (const f of s.facilities) for (const r of f.racks ?? []) owned += r.qty;
  for (const site of Object.values(s.sites)) for (const b of site.inventory) owned += b.qty;
  st.ownedAccel = owned;
  st.installedAccel = compute.installed;
  st.rentedAccel = s.rental.units;
  st.computeEF = compute.totalPF / 1000;
  st.trainPFd = compute.trainFlopDay;
  st.powerLoad = power.load;
  st.powerServed = power.served;
  st.playerGenMW = power.genMW;
  st.revenueMonth = compute.revenueDay * DAYS_PER_MONTH;
  st.costMonth = costDay * DAYS_PER_MONTH;
  st.rpPerDay = compute.rpDay;
  st.capability = c;
  st.frontier = frontier(s);
  st.alignment = alignmentOf(s);
  st.margin = st.alignment - c;
  // Act III: the world's energy is a living system (Acts I–II keep the closed form)
  st.worldTW = (s.charter ? s.charter.world.tw + s.charter.world.charterTW : worldBaselineTW(s.day)) + power.genMW / 1e6;
  st.K = kardashev(st.worldTW * 1e12);
  st.inferQuality = inferQuality(s, c);
  st.inferDemand = inferDemand(s, c) * RENTAL.perf;
  st.carbonMtYear = (power.co2 * 365) / 1e6;
  st.sitePower = power.sites;
  let it = 0;
  let gen = 0;
  let clean = 0;
  for (const f of s.facilities) {
    if (f.status !== 'online') continue;
    if (HALLS.includes(f.type)) it += facilityIT(f);
    if (GENERATORS.includes(f.type)) {
      const mw = facilityMW(f);
      gen += mw;
      if (FACILITIES[f.type].clean) clean += mw;
    }
  }
  st.itMW = it;
  st.genAvgMW = gen;
  st.cleanGenMW = clean;
  st.served = compute.served ?? {};
  st.demandByRegion = compute.demand ?? {};
  if ((s.act ?? 1) >= 2) {
    st.pools = {};
    for (const sup of ['lumen', 'kestrel', 'own'] as const) st.pools[sup] = supplierPools(s, sup);
  }
}

function tickObjectives(s: GameState): void {
  for (const o of actObjectives(s)) {
    if (s.objectives.done.includes(o.id)) continue;
    if (!(o.after ?? []).every((a) => s.objectives.done.includes(a))) continue;
    if (!o.done(s)) continue;
    s.objectives.done.push(o.id);
    if (o.reward?.cash) earn(s, 'other', o.reward.cash);
    if (o.reward?.rp) s.research.pool += o.reward.rp;
    news(s, `✅ ${o.title}${o.reward ? ` — ${o.reward.text}` : ''}`, 'good');
    s.flags.lastObjective = o.id;
    s.flags.lastObjectiveDay = s.day;
    s.flags.lastObjectiveAdvisor = ADVISORS[o.advisor].id;
  }
  if (!s.flags.act1Complete && !s.flags.seriesAQueued && goalsMetForSeriesA(s)) {
    s.flags.seriesAQueued = true;
    queueEvent(s, 'series-a');
  }
}
