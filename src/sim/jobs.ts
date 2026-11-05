/**
 * Act II advisor jobs (standing orders). Each advisor runs one job once a week and reports in the
 * news. Penny's cash floor gates everyone else's automatic spending.
 */
import { FACILITIES, HALLS } from '../content/facilities';
import { JOB_BY_ADVISOR } from '../content/jobs';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import { REGION_IDS } from '../content/mapcodes';
import type { AdvisorId, FacilityType, GameState, Job, SupplierId } from './types';
import { fmtMoney, fmtMW, news } from './core';
import { spend } from './economy';
import { buildCost, chipSpec, DAYS_PER_MONTH, facilityIT, facilityMW, gridHeadroomLeft, landCost, pueAt, supplierDailyRate } from './model';
import { applyLicence, borrow, build, buyLand, canApplyLicence, canBuild, canBuyLand, canUpgrade, placeOrder, requestGrid, setAlloc, startTraining, upgradeFacility } from './actions';
import type { SimContext } from './supply';
import { ownFabSites } from './supply';
import { creditLeft } from './capital';
import { addRelation, exportBlock, orderBlockedBy } from './politics';
import { EXPORT_RULES } from '../content/politics';

const job = (s: GameState, id: AdvisorId): Job | null => {
  const j = s.jobs[id];
  const def = JOB_BY_ADVISOR[id];
  return j?.on && def && s.phase >= def.phase ? j : null;
};

function report(s: GameState, who: AdvisorId, text: string): void {
  const names: Partial<Record<AdvisorId, string>> = { mira: 'Mira', juno: 'Juno', penny: 'Penny', sol: 'Sol', iris: 'Iris', bit: 'Bit' };
  news(s, `🗂 ${names[who]}: ${text}`);
  const j = s.jobs[who];
  if (j) j.last = s.day;
}

/** Cash above Penny's floor (everything if she isn't on the job). */
export function spendable(s: GameState): number {
  const p = job(s, 'penny');
  return s.finance.cash - (p ? p.a : 0);
}

export function tickJobs(s: GameState, ctx: SimContext): void {
  if ((s.act ?? 1) < 2 || s.flags.offline === 'skip') return;
  if (s.day % 7 !== 0) return;
  penny(s);
  iris(s);
  bit(s);
  mira(s, ctx);
  juno(s);
  if (s.day % 28 === 0) sol(s);
}

function penny(s: GameState): void {
  const j = job(s, 'penny');
  if (!j || s.finance.cash >= j.a) return;
  const need = j.a - s.finance.cash + 200e6;
  const can = creditLeft(s);
  if (can < 100e6) return;
  const amt = Math.min(can, need);
  if (borrow(s, amt, 'Credit line (Penny)').ok) report(s, 'penny', `drew ${fmtMoney(amt)} on a credit line to hold the cash floor.`);
}

function iris(s: GameState): void {
  const j = job(s, 'iris');
  if (!j) return;
  const m = s.stats.margin;
  if (m < j.a && s.alloc.safety < 0.4) {
    setAlloc(s, 'safety', Math.min(0.4, s.alloc.safety + 0.02));
    if (!s.jobs.iris!.last || s.day - s.jobs.iris!.last > 60) report(s, 'iris', `raised safety compute to ${Math.round(s.alloc.safety * 100)}% to keep the margin above ${j.a.toFixed(2)}.`);
  } else if (m > j.a + 0.6 && s.alloc.safety > 0.06) setAlloc(s, 'safety', s.alloc.safety - 0.01);
}

function bit(s: GameState): void {
  const j = job(s, 'bit');
  if (!j || s.training) return;
  const def = JOB_BY_ADVISOR.bit!;
  if (def.minMargin !== undefined && s.stats.margin < def.minMargin) return;
  if (startTraining(s).ok) {
    if (s.alloc.train < j.a) setAlloc(s, 'train', j.a);
    report(s, 'bit', `started training ${s.training!.name}. I promise to be careful.`);
  }
}

function mira(s: GameState, ctx: SimContext): void {
  const j = job(s, 'mira');
  if (!j) return;
  let budget = Math.min(j.a / 4.33, spendable(s));
  if (budget < 20e6) return;
  // free rack space per hall site, minus what's already inbound
  const inbound: Record<string, number> = {};
  for (const o of s.orders) if (!o.done) inbound[o.dest] = (inbound[o.dest] ?? 0) + (o.qty - o.shipped);
  for (const sh of s.shipments) inbound[sh.dest] = (inbound[sh.dest] ?? 0) + sh.batch.qty;
  const sites = [...new Set(s.facilities.filter((f) => HALLS.includes(f.type)).map((f) => f.siteId))];
  let ordered = 0;
  let roomy = 0; // sites with free racks
  let powerless = 0; // ... but no power to run more chips
  for (const siteId of sites) {
    const kw = chipSpec(s, 'lumen').kw;
    let cap = 0;
    let used = 0;
    for (const f of s.facilities) {
      if (f.siteId !== siteId || !HALLS.includes(f.type)) continue;
      cap += (facilityIT(f) * 1000) / kw;
      if (f.upgrade) cap += 0; // only plan for what exists
      for (const r of f.racks ?? []) used += r.qty;
    }
    const inv = (s.sites[siteId]?.inventory ?? []).reduce((a, b) => a + b.qty, 0);
    // only order what the site's power can actually run
    const sp = s.stats.sitePower[siteId];
    const supplyMW = sp ? sp.firm + sp.solar * 0.6 + sp.wind * 0.8 + sp.gas + (s.sites[siteId]?.grid.mw ?? 0) : 0;
    const perUnitMW = (kw * pueAt(s, siteId)) / 1000;
    const powerRoom = Math.floor((supplyMW * 1.05 - (sp?.load ?? 0)) / perUnitMW) - inv - (inbound[siteId] ?? 0);
    const rackRoom = cap - used - inv - (inbound[siteId] ?? 0);
    if (rackRoom >= 500) roomy++;
    if (rackRoom >= 500 && powerRoom < 500) powerless++;
    const free = Math.min(rackRoom, powerRoom);
    if (free < 500) continue;
    const supplier = pickSupplier(s, j.b ?? 0, siteDef(siteId).region);
    if (!supplier) {
      // in Act II, say it again every month: empty halls are easy to miss when someone else does the ordering
      const last = s.flags[`miraBlocked:${siteId}`];
      if (typeof last !== 'number' || (!s.charter && s.day - last >= 30)) {
        report(s, 'mira', `I can’t stock ${siteDef(siteId).name}. ${exportBlock(s, siteId) ?? 'Export rules block every supplier.'}`);
        s.flags[`miraBlocked:${siteId}`] = s.day;
      }
      continue;
    }
    delete s.flags[`miraBlocked:${siteId}`];
    const price = chipSpec(s, supplier).price + 150;
    const qty = Math.floor(Math.min(free, budget / price) / 500) * 500;
    if (qty < 500) continue;
    if (placeOrder(s, ctx, supplier, qty, siteId, 'sea').ok) {
      budget -= qty * price;
      ordered += qty;
    }
  }
  if (ordered) report(s, 'mira', `ordered ${ordered.toLocaleString()} accelerators to fill free rack space.`);
  // nothing left to fill: a delegating player should hear that growth now needs halls (or power), every few months
  else if (!s.charter && sites.length && s.day - Number(s.flags.miraFullDay ?? -1e9) >= 90) {
    if (!roomy) {
      report(s, 'mira', 'every hall is full or has chips on the way. To grow, build a new hall or expand one (Upgrade on the site).');
      s.flags.miraFullDay = s.day;
    } else if (powerless === roomy) {
      report(s, 'mira', 'the halls have empty racks, but no power to run more chips there. Juno’s job (or a grid connection) comes first.');
      s.flags.miraFullDay = s.day;
    }
  }
}

function pickSupplier(s: GameState, mode: number, region: (typeof REGION_IDS)[number]): SupplierId | null {
  const options: SupplierId[] = ownFabSites(s).length ? ['own', 'lumen', 'kestrel'] : ['lumen', 'kestrel'];
  const ok = options.filter((x) => !orderBlockedBy(s, x, region));
  if (!ok.length) return null;
  if (mode === 1 && ok.includes('lumen')) return 'lumen';
  if (mode === 2 && ok.includes('kestrel')) return 'kestrel';
  // shortest queue relative to rate
  let best = ok[0];
  let bestDays = Infinity;
  for (const x of ok) {
    const ahead = s.orders.filter((o) => !o.done && o.supplier === x).reduce((a, o) => a + o.qty - o.produced, 0);
    const days = ahead / Math.max(1, supplierDailyRate(s, x));
    if (days < bestDays) {
      bestDays = days;
      best = x;
    }
  }
  return best;
}

function juno(s: GameState): void {
  const j = job(s, 'juno');
  if (!j) return;
  const acted: string[] = [];
  // provision for the halls you've built, not just the chips already in them
  const hallMW: Record<string, number> = {};
  for (const f of s.facilities) if (HALLS.includes(f.type) && f.status === 'online') hallMW[f.siteId] = (hallMW[f.siteId] ?? 0) + facilityIT(f) * pueAt(s, f.siteId) * 0.85;
  const sites = new Set([...Object.keys(hallMW), ...Object.entries(s.stats.sitePower).filter(([, p]) => p.load >= 1).map(([id]) => id)]);
  for (const siteId of sites) {
    const sp = s.stats.sitePower[siteId];
    const site = siteDef(siteId);
    if (site.kind !== 'build') continue;
    // count generation already under construction here, so Juno doesn't pile on
    let coming = 0;
    for (const f of s.facilities) {
      if (f.siteId !== siteId || !FACILITIES[f.type].mw) continue;
      const def = FACILITIES[f.type];
      const avg = (mw: number) => (f.type === 'solar' ? mw * site.solarCF * 0.6 : f.type === 'wind' ? mw * site.windCF * 0.8 : f.type === 'battery' ? 0 : mw * (def.cf ?? 0.95));
      if (f.status === 'building') coming += avg(facilityMW(f));
      else if (f.upgrade) coming += avg(facilityMW({ ...f, tier: f.upgrade.to }) - facilityMW(f));
    }
    const supply = sp ? sp.firm + sp.solar * 0.6 + sp.wind * 0.8 + sp.gas : 0;
    const total = supply + coming + (s.sites[siteId]?.grid.mw ?? 0) + s.sites[siteId].grid.pending.reduce((a, p) => a + p.mw, 0);
    const target = Math.max(sp?.load ?? 0, hallMW[siteId] ?? 0) * (1 + j.a);
    if (total >= target) continue;
    const done = junoBuild(s, siteId, j.b ?? 0, target - total);
    if (done) acted.push(`${done} at ${site.name}`);
  }
  if (acted.length) report(s, 'juno', `started ${acted.join('; ')}.`);
}

/** Juno's choice of what to build to cover a shortfall. Returns a description or null. */
function junoBuild(s: GameState, siteId: string, mode: number, shortMW: number): string | null {
  const site = siteDef(siteId);
  const floor = spendable(s);
  const tryBuild = (type: FacilityType): string | null => {
    if (canBuild(s, siteId, type) !== null) return null;
    if (buildCost(s, type) > floor) return null;
    return build(s, siteId, type).ok ? FACILITIES[type].name : null;
  };
  const tryUpgrade = (type: FacilityType): string | null => {
    const f = s.facilities.find((x) => x.siteId === siteId && x.type === type && canUpgrade(s, x.id) === null);
    if (!f) return null;
    return upgradeFacility(s, f.id).ok ? `${FACILITIES[type].name} expansion` : null;
  };
  // quick renewables first (months, not years); firm plants when the shortfall is big and lasting
  const clean: FacilityType[] = site.windCF >= site.solarCF * 1.3 ? ['wind', 'solar'] : ['solar', 'wind'];
  const firm: FacilityType[] = [];
  if ((site.geo ?? 0) >= 0.3) firm.push('geothermal');
  if (site.hydro) firm.push('hydro');
  const order: FacilityType[] =
    mode === 2 ? [...firm, 'smr', 'gas', ...clean] : mode === 1 ? ['solar', 'gas', 'wind', 'battery'] : shortMW > 150 ? [...clean, ...firm, 'battery'] : [...clean, 'battery', ...firm];
  // solar wants ~8 hours of storage behind it to count at night: top up batteries first when short
  const solarAvg = s.facilities.filter((f) => f.siteId === siteId && f.type === 'solar').reduce((a, f) => a + facilityMW(f) * site.solarCF, 0);
  const battMWh = s.facilities.filter((f) => f.siteId === siteId && f.type === 'battery').reduce((a, f) => a + (FACILITIES.battery.mwh ?? 0) * (facilityMW(f) / (FACILITIES.battery.mw ?? 1)), 0);
  if (mode !== 1 && solarAvg > 20 && battMWh < solarAvg * 8) {
    const r = tryUpgrade('battery') ?? tryBuild('battery');
    if (r) return r;
  }
  const needBattery = site.solarCF > 0 && !s.facilities.some((f) => f.siteId === siteId && f.type === 'battery');
  for (const type of order) {
    const r = tryUpgrade(type) ?? tryBuild(type);
    if (r) {
      if (type === 'solar' && needBattery) tryBuild('battery');
      return r;
    }
  }
  // out of plots: ask the grid, then buy land
  const left = gridHeadroomLeft(s, siteId);
  if (left >= 5 && !s.sites[siteId].grid.pending.length) {
    const mw = [50, 20, 10, 5].find((x) => x <= left && x <= shortMW * 1.5) ?? 5;
    if (requestGrid(s, siteId, mw).ok) return `a ${fmtMW(mw)} grid request`;
  }
  if (canBuyLand(s, siteId) === null && landCost(s, siteId) * 4 < floor && buyLand(s, siteId).ok) return 'a land purchase';
  return null;
}

function sol(s: GameState): void {
  const j = job(s, 'sol');
  if (!j) return;
  const bits: string[] = [];
  // licences for rules that block places you operate
  const regions = new Set(s.facilities.map((f) => siteDef(f.siteId).region));
  for (const rule of EXPORT_RULES) {
    if (!s.politics.rules.includes(rule.id)) continue;
    for (const r of rule.to) {
      if (!regions.has(r)) continue;
      if (canApplyLicence(s, rule.id, r) === null && spendable(s) > rule.licenceCost && applyLicence(s, rule.id, r).ok) bits.push(`applied for a ${rule.name} licence (${REGIONS[r].short})`);
    }
  }
  // small gestures where relations are slipping
  let budget = Math.min(j.a, Math.max(0, spendable(s)));
  for (const r of regions) {
    const b = s.blocs[r];
    if (b.relation >= 40 || budget < 10e6) continue;
    const amt = Math.min(budget, 25e6);
    spend(s, 'other', amt);
    addRelation(s, r, amt / 10e6);
    budget -= amt;
    bits.push(`funded a community programme in ${REGIONS[r].short}`);
  }
  if (bits.length) report(s, 'sol', `${bits.join('; ')}.`);
}

/** For the UI: a monthly-ish estimate of what a job will spend. */
export function jobSpendHint(s: GameState, id: AdvisorId): string {
  const j = s.jobs[id];
  if (!j) return '';
  if (id === 'mira') return `${fmtMoney(j.a)}/month max`;
  if (id === 'sol') return `${fmtMoney(j.a)}/month max`;
  if (id === 'penny') return `floor ${fmtMoney(j.a)}`;
  if (id === 'juno') return 'builds plants with cash above Penny’s floor';
  if (id === 'iris' || id === 'bit') return 'moves compute, spends no cash';
  return '';
}

export const DAYS_PER_JOB_TICK = 7;
export const JOB_MONTH = DAYS_PER_MONTH;
