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
import { clamp, news } from './core';
import { addModifier, modAdd } from './effects';
import { queueEvent, scheduleEvent } from './events';
import { facilityIT, facilityMW } from './model';
import { addRelation, addRelationAll } from './politics';

export const FINALE_DAYS = 90;
export const FRONT_NAMES: Record<FrontId, string> = { grid: 'The Grid', supply: 'The Supply Chain', safety: 'Public Trust' };

/** Your two biggest regions by IT capacity (fallback: home region + a neighbour). */
function heatRegions(s: GameState): RegionId[] {
  const by: Partial<Record<RegionId, number>> = {};
  for (const f of s.facilities) if (HALLS.includes(f.type) && f.status === 'online') by[siteDef(f.siteId).region] = (by[siteDef(f.siteId).region] ?? 0) + facilityIT(f);
  const top = (Object.entries(by) as [RegionId, number][]).sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const home = siteDef(s.company.homeSite).region;
  const out = top.slice(0, 2);
  if (!out.length) out.push(home);
  if (out.length < 2) out.push(home === 'atl' ? 'pac' : 'atl');
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
  // the heat dome
  for (const r of regions) {
    addModifier(s, `region:${r}:grid`, 70, 'Heat dome: grid derated', { mult: 0.55 });
    addModifier(s, `region:${r}:cooling`, 70, 'Heat dome: cooling struggles', { mult: 0.88 });
    addModifier(s, `region:${r}:solar`, 70, 'Heat dome: panels run hot', { mult: 0.92 });
  }
  // the blockade
  addModifier(s, 'supplier:lumen:rate', 80, 'Fab Belt blockade', { mult: 0.35 });
  addModifier(s, 'supplier:*:price', 80, 'Fab Belt blockade', { mult: 1.4 });
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

export function tickFinale(s: GameState): void {
  const f = s.finale;
  if (!f || f.done) return;
  const sp = s.stats.sitePower;
  // ── grid: unserved load and grid draw in the heat-dome regions push pressure up ──
  let load = 0;
  let served = 0;
  let gridDraw = 0;
  let battery = 0;
  let firm = 0;
  for (const [id, p] of Object.entries(sp)) {
    if (!f.regions.includes(siteDef(id).region)) continue;
    load += p.load;
    served += p.served;
    gridDraw += p.gridUsed;
    battery += p.battery;
    firm += p.firm;
  }
  const frac = load > 0 ? served / load : 1;
  const gridRise = 0.35 + 5 * (1 - frac) + Math.min(0.8, gridDraw / 400) - Math.min(0.6, battery / 500) - Math.min(0.4, firm / 800) - modAdd(s, 'crunch:grid');
  pressure(s, 'grid', gridRise);

  // ── supply: chips stuck at sea, contracts under-delivered, no alternatives ──
  const ownFab = s.facilities.some((x) => x.type === 'fab' && x.status === 'online');
  const inventory = Object.values(s.sites).reduce((a, st) => a + st.inventory.reduce((b, x) => b + x.qty, 0), 0);
  const shortfall = s.capital.contracts.reduce((a, c) => a + Math.max(0, 0.95 - (c.delivered ?? 1)), 0);
  const supplyRise =
    0.4 + shortfall * 2 + (s.orders.some((o) => !o.done && o.supplier === 'lumen') ? 0.2 : 0) - (ownFab ? 0.35 : 0) - (inventory > 5000 ? 0.2 : 0) -
    (s.stack.deals.some((d) => d.kind === 'hbm' || d.kind === 'packaging') ? 0.15 : 0) - modAdd(s, 'crunch:supply');
  pressure(s, 'supply', supplyRise);

  // ── public trust: your safety record and standing with governments ──
  const avgRelation = Object.values(s.blocs).reduce((a, b) => a + b.relation, 0) / Object.keys(s.blocs).length;
  const safetyRise =
    0.4 + Math.max(0, -s.stats.margin) * 0.8 - (s.stats.margin > 0.5 ? 0.25 : 0) - (s.politics.treaties.includes('evals-pact') ? 0.25 : 0) -
    (s.alloc.safety >= 0.12 ? 0.15 : 0) + (avgRelation < 40 ? 0.25 : avgRelation > 60 ? -0.15 : 0) - modAdd(s, 'crunch:safety');
  pressure(s, 'safety', safetyRise);

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
