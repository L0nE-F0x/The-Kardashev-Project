/**
 * "The Crunch": Act II's finale. Ninety days with three fronts under pressure at once:
 *   grid   — a heat dome over your biggest regions (grid derating, cooling losses)
 *   supply — a blockade in the Fab Belt (Lumen Hsinchu, Hanbit and Stackwell Hiroshima stall)
 *   safety — a rival's rushed model causes an incident; blocs vote on a pause
 * Pressure rises every day from the world state and falls with the player's choices. A front at
 * 100 is lost. Fronts held at the end become Charter Standing (0–3).
 */
import { REGIONS } from '../content/regions';
import type { RegionId } from '../content/mapcodes';
import { siteDef } from '../content/sites';
import { HALLS } from '../content/facilities';
import type { FinaleState, FrontId, GameState } from './types';
import { clamp, fmtMW, fmtNum, news } from './core';
import { addModifier, modAdd, modMult } from './effects';
import { queueEvent, scheduleEvent } from './events';
import { facilityIT, facilityMW } from './model';
import { addRelation, addRelationAll } from './politics';

export const FINALE_DAYS = 90;
export const FRONT_NAMES: Record<FrontId, string> = { grid: 'The Grid', supply: 'The Supply Chain', safety: 'Public Trust' };

/** Daily pressure numbers for the three fronts (see crunchRise). */
export const CRUNCH = {
  grid: { base: 0.5, unserved: 1.3, drawMax: 0.4, drawMW: 600, batteryMax: 0.35, batteryMW: 1000, firmMax: 0.3, firmMW: 1000 },
  supply: { base: 0.9, stuck: 2, stuckMax: 0.4, stuckFloor: 20_000, empty: 1, emptyMax: 0.35, emptyFree: 0.1, contracts: 1.5, contractsMax: 0.5, lumen: 0.15, stock: 20_000, stockMax: 0.3 },
  safety: { base: 0.45, negMargin: 1.2, training: 0.1 },
};

/** Your two biggest regions by IT capacity (fallback: your home region, then a big neighbour). Never the same one twice. */
export function heatRegions(s: GameState): RegionId[] {
  const by: Partial<Record<RegionId, number>> = {};
  for (const f of s.facilities) if (HALLS.includes(f.type) && f.status === 'online') by[siteDef(f.siteId).region] = (by[siteDef(f.siteId).region] ?? 0) + facilityIT(f);
  const top = (Object.entries(by) as [RegionId, number][]).sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const out = top.slice(0, 2);
  const home = siteDef(s.company.homeSite).region;
  for (const r of [home, 'atl', 'pac', 'eur'] as RegionId[]) if (out.length < 2 && !out.includes(r)) out.push(r);
  return out;
}

export function startFinale(s: GameState): void {
  if (s.finale) return;
  s.phase = 4;
  s.flags.phase4Day = s.day;
  const regions = heatRegions(s);
  const rival = [...s.market.rivals].filter((r) => !r.open).sort((a, b) => b.capability - a.capability)[0]?.id ?? 'meridian';
  const f: FinaleState = {
    startDay: s.day,
    endDay: s.day + FINALE_DAYS,
    fronts: { grid: { pressure: 20, lost: false }, supply: { pressure: 20, lost: false }, safety: { pressure: 20, lost: false } },
    regions,
    rival,
    done: false,
  };
  s.finale = f;
  // the heat dome (it breaks when the Crunch ends)
  for (const r of regions) {
    addModifier(s, `region:${r}:grid`, FINALE_DAYS, 'Heat dome: grid derated', { mult: 0.55 });
    addModifier(s, `region:${r}:cooling`, FINALE_DAYS, 'Heat dome: cooling struggles', { mult: 0.88 });
    addModifier(s, `region:${r}:solar`, FINALE_DAYS, 'Heat dome: panels run hot', { mult: 0.92 });
  }
  // the blockade (ships move again when the Crunch ends)
  addModifier(s, 'supplier:lumen:rate', FINALE_DAYS, 'Fab Belt blockade', { mult: 0.35 });
  addModifier(s, 'supplier:*:price', FINALE_DAYS, 'Fab Belt blockade', { mult: 1.4 });
  s.market.hbm = Math.max(0.4, s.market.hbm - 0.35);
  for (const sh of s.shipments) {
    if (siteDef(sh.from).region !== 'fab' || sh.portDay <= s.day) continue;
    sh.portDay += 45;
    sh.arriveDay += 45;
    sh.delayed = true;
  }
  queueEvent(s, 'crunch-begin', { r1: regions[0], r2: regions[1], rival });
  scheduleEvent(s, 'crunch-grid', 6, { region: regions[0] });
  scheduleEvent(s, 'crunch-supply', 14, {});
  scheduleEvent(s, 'crunch-safety', 22, { rival });
  scheduleEvent(s, 'crunch-grid-2', 45, { region: regions[1] ?? regions[0] });
  scheduleEvent(s, 'crunch-supply-2', 55, {});
  scheduleEvent(s, 'crunch-safety-2', 66, { rival });
  news(s, '🌡 The Crunch begins: heat dome, blockade and a rogue model, all at once.', 'bad');
}

/** Ease (negative) or add (positive) pressure on a front. */
export function pressure(s: GameState, front: FrontId, d: number): void {
  const f = s.finale;
  if (!f || f.done) return;
  const fr = f.fronts[front];
  if (fr.lost) return;
  fr.pressure = clamp(fr.pressure + d, 0, 100);
}

/**
 * How fast a front's pressure moves today, and why: the crisis itself pushes, your preparation and
 * your crisis measures push back. Pure, so the daily tick and the tracker's tooltip read the same numbers.
 */
export function crunchRise(s: GameState, front: FrontId): { v: number; parts: [string, number][] } {
  const f = s.finale;
  const parts: [string, number][] = [];
  if (!f) return { v: 0, parts };
  if (front === 'grid') {
    // the heat dome derates the public grid in two of your regions: what you can't carry yourself shows up as blackouts
    let load = 0;
    let served = 0;
    let gridDraw = 0;
    let battery = 0;
    let firm = 0;
    for (const [id, p] of Object.entries(s.stats.sitePower ?? {})) {
      if (!f.regions.includes(siteDef(id).region)) continue;
      load += p.load;
      served += p.served;
      gridDraw += p.gridUsed;
      battery += p.battery;
      firm += p.firm;
    }
    parts.push(['The heat dome', CRUNCH.grid.base]);
    const unserved = load > 0 ? 1 - served / load : 0;
    if (unserved > 0.005) parts.push([`Load you can’t power (${Math.round(unserved * 100)}%)`, CRUNCH.grid.unserved * unserved]);
    if (gridDraw >= 1) parts.push([`Drawing ${fmtMW(gridDraw)} from a derated grid`, Math.min(CRUNCH.grid.drawMax, gridDraw / CRUNCH.grid.drawMW)]);
    if (battery >= 1) parts.push([`Batteries carry the peaks (${fmtMW(battery)})`, -Math.min(CRUNCH.grid.batteryMax, battery / CRUNCH.grid.batteryMW)]);
    if (firm >= 1) parts.push([`Firm power (${fmtMW(firm)})`, -Math.min(CRUNCH.grid.firmMax, firm / CRUNCH.grid.firmMW)]);
  } else if (front === 'supply') {
    // the blockade: chips stuck at sea, racks waiting for them, customers waiting on those racks
    parts.push(['The blockade', CRUNCH.supply.base]);
    let stuck = 0;
    for (const sh of s.shipments) if (sh.delayed && sh.arriveDay > s.day) stuck += sh.batch.qty;
    const installed = Math.max(CRUNCH.supply.stuckFloor, s.stats.installedAccel);
    if (stuck > 0) parts.push([`${fmtNum(stuck, 0)} chips stuck at sea`, Math.min(CRUNCH.supply.stuckMax, (stuck / installed) * CRUNCH.supply.stuck)]);
    const empty = emptyRackShare(s);
    if (empty > CRUNCH.supply.emptyFree) parts.push([`Empty racks (${Math.round(empty * 100)}% of your halls)`, Math.min(CRUNCH.supply.emptyMax, (empty - CRUNCH.supply.emptyFree) * CRUNCH.supply.empty)]);
    const shortfall = s.capital.contracts.reduce((a, c) => a + Math.max(0, 0.95 - (c.delivered ?? 1)), 0);
    if (shortfall > 0) parts.push(['Contracts short of delivery', Math.min(CRUNCH.supply.contractsMax, shortfall * CRUNCH.supply.contracts)]);
    if (s.orders.some((o) => !o.done && o.supplier === 'lumen' && o.produced < o.qty)) parts.push(['Orders waiting at Lumen (inside the blockade)', CRUNCH.supply.lumen]);
    if (s.facilities.some((x) => x.type === 'fab' && x.status === 'online')) parts.push(['Your own fab', -0.35]);
    const inventory = Object.values(s.sites).reduce((a, st) => a + st.inventory.reduce((b, x) => b + x.qty, 0), 0);
    if (inventory >= 500) parts.push([`A stockpile of ${fmtNum(inventory, 0)} chips`, -Math.min(CRUNCH.supply.stockMax, inventory / CRUNCH.supply.stock)]);
    if (s.stack.deals.some((d) => (d.kind === 'hbm' || d.kind === 'packaging') && s.day >= d.readyDay && (d.endDay === 0 || d.endDay >= s.day)))
      parts.push(['Memory and packaging deals', -0.15]);
  } else {
    // public trust: the blocs vote on a pause, and your record is the argument
    parts.push(['The pause debate', CRUNCH.safety.base]);
    const m = s.stats.margin;
    if (m < 0) parts.push([`Negative safety margin (${m.toFixed(2)})`, -m * CRUNCH.safety.negMargin]);
    else if (m >= 0.05) parts.push([`Safety margin ${m.toFixed(2)}`, -Math.min(0.3, m * 0.4)]);
    if (s.politics.treaties.includes('evals-pact')) parts.push(['Evaluations Pact member', -0.2]);
    if (s.alloc.safety >= 0.12) parts.push(['Safety compute ≥ 12%', -0.15]);
    if (s.training && s.alloc.train >= 0.3 && modMult(s, 'training') > 0.5) parts.push(['Training flat out while they debate a pause', CRUNCH.safety.training]);
    const avg = Object.values(s.blocs).reduce((a, b) => a + b.relation, 0) / Math.max(1, Object.keys(s.blocs).length);
    const rel = clamp((50 - avg) * 0.012, -0.2, 0.3);
    if (Math.abs(rel) >= 0.01) parts.push([`Relations with governments (avg ${Math.round(avg)})`, rel]);
  }
  const relief = modAdd(s, `crunch:${front}`);
  if (relief) parts.push(['Your crisis measures', -relief]);
  return { v: parts.reduce((a, [, x]) => a + x, 0), parts };
}

/** Share of your online halls' IT capacity with no chips in it. */
function emptyRackShare(s: GameState): number {
  let it = 0;
  let used = 0;
  for (const x of s.facilities) {
    if (!HALLS.includes(x.type) || x.status !== 'online') continue;
    it += facilityIT(x) * 1000;
    for (const r of x.racks ?? []) used += r.qty * r.kw;
  }
  return it > 0 ? clamp(1 - used / it, 0, 1) : 0;
}

export function tickFinale(s: GameState): void {
  const f = s.finale;
  if (!f || f.done) return;
  for (const id of ['grid', 'supply', 'safety'] as FrontId[]) pressure(s, id, crunchRise(s, id).v);

  for (const id of ['grid', 'supply', 'safety'] as FrontId[]) {
    const fr = f.fronts[id];
    if (fr.lost || fr.pressure < 100) continue;
    fr.lost = true;
    loseFront(s, id);
  }

  if (s.day >= f.endDay) {
    f.done = true;
    f.standing = (['grid', 'supply', 'safety'] as FrontId[]).filter((k) => !f.fronts[k].lost).length;
    queueEvent(s, 'crunch-end', { standing: f.standing });
    news(s, `🌤 The Crunch is over. Fronts held: ${f.standing} of 3.`, f.standing >= 2 ? 'good' : 'bad');
  }
}

function loseFront(s: GameState, id: FrontId): void {
  const f = s.finale!;
  if (id === 'grid') {
    for (const r of f.regions) {
      const st = s.regions[r];
      if (st) st.license = clamp(st.license - 12, 0, 100);
      addRelation(s, r, -10);
      addModifier(s, `region:${r}:grid`, 60, 'Rolling blackouts', { mult: 0.4 });
    }
    news(s, `⚫ Front lost — ${FRONT_NAMES.grid}: rolling blackouts across ${f.regions.map((r) => REGIONS[r].name).join(' and ')}. Data centers get the blame.`, 'bad');
  } else if (id === 'supply') {
    addModifier(s, 'supplier:*:rate', 120, 'Supply chain seized up', { mult: 0.5 });
    for (const c of s.capital.contracts) c.delivered = Math.min(c.delivered ?? 1, 0.6);
    news(s, `⚫ Front lost — ${FRONT_NAMES.supply}: deliveries freeze and customers start invoking penalty clauses.`, 'bad');
  } else {
    addModifier(s, 'training', 120, 'Emergency pause on frontier training', { mult: 0.3 });
    addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? -10 : -4));
    news(s, `⚫ Front lost — ${FRONT_NAMES.safety}: the blocs impose an emergency pause on frontier training.`, 'bad');
  }
}

/** Generation in the heat-dome regions you could lend to the grid (for event text). */
export function finaleBatteryMW(s: GameState): number {
  const f = s.finale;
  if (!f) return 0;
  let mw = 0;
  for (const x of s.facilities) if (x.type === 'battery' && x.status === 'online' && f.regions.includes(siteDef(x.siteId).region)) mw += facilityMW(x);
  return mw;
}
