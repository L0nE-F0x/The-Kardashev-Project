/** Player actions. Each validates, spends, mutates, and reports why it can't when it can't. */
import { CHIP_SUPPLIERS, RENTAL } from '../content/companies';
import { FACILITIES } from '../content/facilities';
import { siteDef, siteDistanceKm, siteOpen } from '../content/sites';
import { TECHS, TECH_BY_ID } from '../content/techs';
import { CABLE_BY_ID, FIBER_COST_PER_KM, FIBER_MAX_KM, OWN_CABLE_COST, OWN_CABLE_MONTHS } from '../content/network';
import { DEAL_BY_ID, MINE_BY_ID } from '../content/stack';
import { LOBBY, RULE_BY_ID, SOVEREIGN_BY_ID, TREATY_BY_ID } from '../content/politics';
import { STARTUP_BY_ID } from '../content/rivals';
import { JOB_BY_ADVISOR } from '../content/jobs';
import { FINANCE } from '../content/capital';
import { REGIONS } from '../content/regions';
import type { RegionId } from '../content/mapcodes';
import type { AdvisorId, FacilityType, GameState, Job, SupplierId } from './types';
import { clamp, fmtMoney, fmtMW, news, nextId } from './core';
import { earn, spend } from './economy';
import { nextModelPlan } from './ai';
import { addModifier, hasTech, techMult } from './effects';
import {
  buildCost,
  buildDays,
  chipSpec,
  DAYS_PER_MONTH,
  facilitySlots,
  GRID_FEE_PER_MW,
  gridHeadroomLeft,
  gridLeadDays,
  landCost,
  linkCost,
  linkDays,
  linkLossPct,
  linkMaxKm,
  MAX_EXTRA_SLOTS,
  nextTier,
  permitFactor,
  rentalMax,
  SHIP_COST,
  siteSlots,
  supplierDailyRate,
  upgradeCost,
  upgradeDays,
} from './model';
import { ownFabSites, planShipment, supplierOrigin, type SimContext } from './supply';
import { addRelation, blocIT, licencePending, orderBlockedBy } from './politics';
import { CONTRACT_MIN_SIGN, contractDeliverable } from './network';
import { creditLeft, loanRate, monthlyPayment } from './capital';
import { ownRunStatus } from './frontier';

export type Result = { ok: true } | { ok: false; reason: string };

/** Whether a tech is open in this act and phase (ignoring prerequisites). */
export function techAvailable(s: GameState, techId: string): boolean {
  const t = TECH_BY_ID[techId];
  if (!t) return false;
  if ((t.act ?? 1) > (s.act ?? 1)) return false;
  if (t.phase && (s.act ?? 1) === 2 && s.phase < t.phase) return false;
  if (t.cphase && (s.act ?? 1) >= 3 && (s.charter?.phase ?? 0) < t.cphase) return false;
  if (t.stage && (s.act ?? 1) >= 4 && (s.planet?.stage ?? 0) < t.stage) return false;
  if (t.vstage !== undefined && (s.system?.stage ?? -1) < t.vstage) return false;
  return true;
}
/** Techs you could start right now (open in this act and phase, prerequisites met, not done). */
export function researchable(s: GameState): string[] {
  return TECHS.filter((t) => !s.research.done.includes(t.id) && techAvailable(s, t.id) && (t.requires ?? []).every((r) => s.research.done.includes(r))).map((t) => t.id);
}

const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export const PHASE_NAMES = ['', 'Gigawatts', 'The Stack', 'The Race', 'The Crunch', 'Epilogue'];

/** Plots taken at a site: your facilities (some take several) and rival campuses. */
export function slotsUsed(s: GameState, siteId: string): number {
  let n = 0;
  for (const f of s.facilities) if (f.siteId === siteId) n += facilitySlots(f);
  for (const b of s.rivalBuilds ?? []) if (b.siteId === siteId) n += b.slots;
  return n;
}

/** Why a facility type can never go at this site (geography, act, phase, tech), or null. Ignores cash and plots. */
export function siteRestriction(s: GameState, siteId: string, type: FacilityType): string | null {
  const site = siteDef(siteId);
  const def = FACILITIES[type];
  if (site.kind !== 'build') return 'Not a buildable site';
  if (!def.buildable) return 'Not buildable';
  if ((def.act ?? 1) > (s.act ?? 1)) return 'Opens in Act II';
  if (def.phase && (s.act ?? 1) === 2 && s.phase < def.phase) return `Opens in phase ${def.phase} · ${PHASE_NAMES[def.phase]}`;
  if (def.tech && !hasTech(s, def.tech)) return `Needs research: ${TECH_BY_ID[def.tech]?.name ?? def.tech}`;
  const here = (t: FacilityType) => s.facilities.filter((f) => f.siteId === siteId && f.type === t).length;
  if (def.needs === 'hydro' && here('hydro') >= (site.hydro ?? 0)) return site.hydro ? 'The river is fully used' : 'Needs a river site';
  if (def.needs === 'geo') {
    const min = hasTech(s, 'egs') ? 0.3 : 0.6;
    if ((site.geo ?? 0) < min) return site.geo && site.geo >= 0.3 ? 'Needs Enhanced Geothermal research' : 'No hot rock here';
  }
  if (def.needs === 'reactor') {
    if (!site.reactorMW) return 'Only at a retired reactor';
    if (here('restart') > 0) return 'Already restarted';
    if (s.blocs[site.region].relation < 50) return 'Needs government relations ≥ 50';
  }
  if (def.needs === 'water' && site.water < (type === 'fab' ? 0.6 : 0.4)) return type === 'fab' ? 'A fab needs plenty of water' : 'Needs cooling water';
  if ((type === 'smr' || type === 'reactor') && s.regions[site.region].license < 55) return 'Needs local trust ≥ 55';
  if ((type === 'smr' || type === 'reactor') && s.blocs[site.region].stance === 'cautious' && s.blocs[site.region].relation < 60) return 'This government won’t approve new reactors (relations < 60)';
  if (type === 'gas' && s.politics.treaties.includes('grid-compact')) return 'The Clean Grid Compact rules out new gas';
  if (type === 'gas' && s.charter?.council.passed.includes('fossil-freeze')) return 'The Council has frozen new fossil power';
  return null;
}

export function canBuild(s: GameState, siteId: string, type: FacilityType): string | null {
  const site = siteDef(siteId);
  if (site.kind !== 'build') return 'Not a buildable site';
  if (!siteOpen(site, s.act ?? 1, s.phase ?? 0)) return 'Not open yet';
  const restricted = siteRestriction(s, siteId, type);
  if (restricted) return restricted;
  const need = FACILITIES[type].slots ?? 1;
  if (slotsUsed(s, siteId) + need > siteSlots(s, siteId)) return need > 1 ? `Needs ${need} free plots` : 'No free plots at this site';
  if (s.regions[site.region].license < 15) return 'Permits frozen — local trust too low';
  const cost = buildCost(s, type);
  if (s.finance.cash < cost) return `Needs ${fmtMoney(cost)}`;
  return null;
}

export function build(s: GameState, siteId: string, type: FacilityType): Result {
  const why = canBuild(s, siteId, type);
  if (why) return fail(why);
  const cost = buildCost(s, type);
  spend(s, 'capex', cost);
  const days = buildDays(s, siteId, type);
  s.facilities.push({ id: nextId(s, 'f'), type, siteId, status: 'building', progress: 0, buildDays: days, startedDay: s.day, racks: type === 'datacenter' || type === 'campus' ? [] : undefined });
  s.built[type] = (s.built[type] ?? 0) + 1;
  news(s, `🏗 Broke ground on a ${FACILITIES[type].name} at ${siteDef(siteId).name} (${fmtMoney(cost)}).`);
  return OK;
}

export function gridOptions(s: GameState, siteId: string): number[] {
  const left = gridHeadroomLeft(s, siteId);
  return [5, 10, 20, 50].filter((mw) => mw <= left);
}

export function requestGrid(s: GameState, siteId: string, mw: number): Result {
  const site = siteDef(siteId);
  if (site.kind !== 'build') return fail('Not a buildable site');
  if (mw > gridHeadroomLeft(s, siteId)) return fail('The local grid has no more spare capacity');
  const cost = mw * GRID_FEE_PER_MW;
  if (s.finance.cash < cost) return fail(`Needs ${fmtMoney(cost)}`);
  spend(s, 'capex', cost);
  const days = gridLeadDays(s, siteId);
  s.sites[siteId].grid.pending.push({ mw, readyDay: s.day + days, requestedDay: s.day });
  news(s, `🔌 Requested ${fmtMW(mw)} grid connection at ${site.name}.`);
  return OK;
}

export function canLink(s: GameState, a: string, b: string): string | null {
  if (a === b) return 'Pick two different sites';
  const A = siteDef(a);
  const B = siteDef(b);
  if (A.kind !== 'build' || B.kind !== 'build') return 'Links connect your own sites';
  if (!s.facilities.some((f) => f.siteId === a) || !s.facilities.some((f) => f.siteId === b)) return 'Both sites need at least one facility';
  if (s.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return 'Already linked';
  const km = siteDistanceKm(a, b);
  const max = linkMaxKm(s);
  if (km > max) return `Too far (${Math.round(km)} km > ${Math.round(max)} km)`;
  if (s.finance.cash < linkCost(km, s)) return `Needs ${fmtMoney(linkCost(km, s))}`;
  return null;
}

export function buildLink(s: GameState, a: string, b: string): Result {
  const why = canLink(s, a, b);
  if (why) return fail(why);
  const km = siteDistanceKm(a, b);
  spend(s, 'capex', linkCost(km, s));
  s.links.push({ id: nextId(s, 'l'), a, b, km, status: 'building', progress: 0, buildDays: linkDays(s, km, a, b), capacityMW: 1000, lossPct: linkLossPct(s, km) });
  news(s, `⚡ Started a ${Math.round(km)} km transmission line: ${siteDef(a).name} ⇄ ${siteDef(b).name}.`);
  return OK;
}

export interface OrderQuote {
  unitPrice: number;
  chips: number;
  shipping: number;
  total: number;
  fromSite: string;
  firstDays: number;
  lastDays: number;
  transitDays: number;
  perf: number;
  kw: number;
}

export function quoteOrder(s: GameState, ctx: SimContext, supplier: SupplierId, qty: number, dest: string, mode: 'sea' | 'air'): OrderQuote {
  const spec = chipSpec(s, supplier);
  const fromSite = supplierOrigin(supplier, dest, s);
  const ahead = s.orders.filter((o) => !o.done && o.supplier === supplier).reduce((a, o) => a + (o.qty - o.produced), 0);
  const rate = Math.max(1, supplierDailyRate(s, supplier));
  const plan = planShipment(s, ctx, fromSite, dest, mode);
  const transitDays = plan.seaDays + plan.landDays;
  const firstDays = (ahead + Math.min(qty, rate * 7)) / rate + 7 + transitDays;
  const lastDays = (ahead + qty) / rate + 3 + transitDays;
  const chips = spec.price * qty;
  const shipping = SHIP_COST[mode] * qty;
  return { unitPrice: spec.price, chips, shipping, total: chips + shipping, fromSite, firstDays, lastDays, transitDays, perf: spec.perf, kw: spec.kw };
}

export function placeOrder(s: GameState, ctx: SimContext, supplier: SupplierId, qty: number, dest: string, mode: 'sea' | 'air'): Result {
  if (qty <= 0) return fail('Order at least one accelerator');
  if (siteDef(dest).kind !== 'build') return fail('Ship to one of your sites');
  if (supplier === 'own' && !ownFabSites(s).length) return fail('Your fab is not online yet');
  const rule = orderBlockedBy(s, supplier, siteDef(dest).region);
  if (rule) return fail(`Blocked by ${rule.name} — Sol can apply for a licence`);
  const q = quoteOrder(s, ctx, supplier, qty, dest, mode);
  if (s.finance.cash < q.total) return fail(`Needs ${fmtMoney(q.total)}`);
  spend(s, 'chips', q.chips);
  spend(s, 'shipping', q.shipping);
  s.orders.push({ id: nextId(s, 'o'), supplier, fromSite: q.fromSite, qty, produced: 0, shipped: 0, pendingShip: 0, dest, mode, placedDay: s.day, unitPrice: q.unitPrice, perf: q.perf, kw: q.kw, done: false });
  news(s, `📦 Ordered ${qty.toLocaleString()} ${CHIP_SUPPLIERS[supplier].short} accelerators for ${siteDef(dest).name} (${fmtMoney(q.total)}).`);
  return OK;
}

export function setRental(s: GameState, units: number): Result {
  const max = rentalMax(s);
  const u = clamp(Math.round(units / RENTAL.step) * RENTAL.step, 0, max);
  s.rental.units = u;
  return OK;
}

export type AllocKey = keyof GameState['alloc'];

/** Set one allocation share and rescale the others so the total stays 100%. */
export function setAlloc(s: GameState, key: AllocKey, value: number): void {
  const cap = key === 'safety' && s.flags.safetyCapUntil && s.day < Number(s.flags.safetyCapUntil) ? Number(s.flags.safetyCapValue ?? 0.05) : 1;
  const v = clamp(value, 0, cap);
  const others = (Object.keys(s.alloc) as AllocKey[]).filter((k) => k !== key);
  const rest = others.reduce((a, k) => a + s.alloc[k], 0);
  const remain = 1 - v;
  for (const k of others) s.alloc[k] = rest > 1e-9 ? (s.alloc[k] / rest) * remain : remain / others.length;
  s.alloc[key] = v;
}

export function startTraining(s: GameState): Result {
  if (s.training) return fail('A training run is already in progress');
  const plan = nextModelPlan(s);
  const lic = ownRunStatus(s, plan.gen, plan.flop);
  if (lic === 'needed') return fail(`${plan.name} is above the Charter’s compute cap — request a licence (Charter → Frontier)`);
  if (lic === 'pending') return fail(`${plan.name}’s licence is still with the Charter’s evaluators`);
  s.training = { name: plan.name, gen: plan.gen, target: plan.flop, done: 0, startDay: s.day };
  news(s, `🧠 Training run started: ${plan.name}.`);
  return OK;
}

export function setResearch(s: GameState, techId: string): Result {
  const t = TECH_BY_ID[techId];
  if (!t) return fail('Unknown tech');
  if (s.research.done.includes(techId)) return fail('Already researched');
  if (!techAvailable(s, techId)) return fail(t.act && t.act > (s.act ?? 1) ? `Opens in Act ${t.act === 3 ? 'III' : 'II'}` : 'Opens later in the act');
  if ((t.requires ?? []).some((r) => !s.research.done.includes(r))) return fail('Prerequisites missing');
  if (s.research.current && s.research.current !== techId) {
    // switching keeps progress banked in the pool
    s.research.pool += s.research.progress;
    s.research.progress = 0;
  }
  s.research.current = techId;
  return OK;
}

// ════════════════════════════════════ ACT II ════════════════════════════════════════════
const act2 = (s: GameState) => (s.act ?? 1) >= 2;

/** Why a facility can't be expanded right now, or null. */
export function canUpgrade(s: GameState, facilityId: string): string | null {
  const f = s.facilities.find((x) => x.id === facilityId);
  if (!f) return 'Unknown facility';
  if (!act2(s)) return 'Expansions open in Act II';
  if (f.status !== 'online') return 'Finish building it first';
  if (f.upgrade) return 'Already expanding';
  const nt = nextTier(f);
  if (!nt) return 'Already at full size';
  if (nt.def.phase && s.phase < nt.def.phase) return `Opens in phase ${nt.def.phase} · ${PHASE_NAMES[nt.def.phase]}`;
  if (nt.def.tech && !hasTech(s, nt.def.tech)) return `Needs research: ${TECH_BY_ID[nt.def.tech]?.name ?? nt.def.tech}`;
  if (s.regions[siteDef(f.siteId).region].license < 15) return 'Permits frozen — local trust too low';
  const cost = upgradeCost(s, f);
  if (s.finance.cash < cost) return `Needs ${fmtMoney(cost)}`;
  return null;
}

export function upgradeFacility(s: GameState, facilityId: string): Result {
  const why = canUpgrade(s, facilityId);
  if (why) return fail(why);
  const f = s.facilities.find((x) => x.id === facilityId)!;
  const nt = nextTier(f)!;
  const cost = upgradeCost(s, f);
  spend(s, 'capex', cost);
  f.upgrade = { to: nt.tier, progress: 0, buildDays: upgradeDays(s, f) };
  s.built[f.type] = (s.built[f.type] ?? 0) + 1;
  news(s, `🏗 Expanding the ${FACILITIES[f.type].name} at ${siteDef(f.siteId).name} to ${nt.def.label} (${fmtMoney(cost)}).`);
  return OK;
}

export function canBuyLand(s: GameState, siteId: string): string | null {
  const site = siteDef(siteId);
  if (!act2(s)) return 'Opens in Act II';
  if (site.kind !== 'build') return 'Not a buildable site';
  if ((s.sites[siteId]?.extraSlots ?? 0) >= MAX_EXTRA_SLOTS) return 'No more land for sale here';
  if (s.regions[site.region].license < 40) return 'Needs local trust ≥ 40';
  const cost = landCost(s, siteId);
  if (s.finance.cash < cost) return `Needs ${fmtMoney(cost)}`;
  return null;
}

export function buyLand(s: GameState, siteId: string): Result {
  const why = canBuyLand(s, siteId);
  if (why) return fail(why);
  const cost = landCost(s, siteId);
  spend(s, 'capex', cost);
  s.sites[siteId].extraSlots = (s.sites[siteId].extraSlots ?? 0) + 1;
  news(s, `🗺 Bought more land at ${siteDef(siteId).name} (${fmtMoney(cost)}): one more plot.`);
  return OK;
}

// ── networks ──
export function fiberCost(km: number): number {
  return km * FIBER_COST_PER_KM;
}

export function fiberDays(s: GameState, km: number, a: string, b: string): number {
  return Math.round((3 + km / 400) * DAYS_PER_MONTH * (permitFactor(s, a) + permitFactor(s, b)) / 2);
}

export function canFiber(s: GameState, a: string, b: string): string | null {
  if (!act2(s)) return 'Fiber opens in Act II';
  if (a === b) return 'Pick two different sites';
  const A = siteDef(a);
  const B = siteDef(b);
  if (A.kind !== 'build' || B.kind !== 'build') return 'Fiber joins your own sites (lease cables at landing stations)';
  if (!s.facilities.some((f) => f.siteId === a) || !s.facilities.some((f) => f.siteId === b)) return 'Both sites need at least one facility';
  if (s.network.fiber.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return 'Already joined by fiber';
  const km = siteDistanceKm(a, b);
  if (km > FIBER_MAX_KM) return `Too far for overland fiber (${Math.round(km)} km > ${FIBER_MAX_KM} km)`;
  if (s.finance.cash < fiberCost(km)) return `Needs ${fmtMoney(fiberCost(km))}`;
  return null;
}

export function buildFiber(s: GameState, a: string, b: string): Result {
  const why = canFiber(s, a, b);
  if (why) return fail(why);
  const km = siteDistanceKm(a, b);
  spend(s, 'capex', fiberCost(km));
  s.network.fiber.push({ id: nextId(s, 'fb'), a, b, km, status: 'building', progress: 0, buildDays: fiberDays(s, km, a, b) });
  news(s, `🌐 Laying ${Math.round(km)} km of fiber: ${siteDef(a).name} ⇄ ${siteDef(b).name}.`);
  return OK;
}

export function leaseCable(s: GameState, cableId: string): Result {
  const c = CABLE_BY_ID[cableId];
  if (!c) return fail('Unknown cable');
  if (!act2(s)) return fail('Cables open in Act II');
  if (s.network.leases.includes(cableId)) return fail('Already leased');
  if (s.finance.cash < c.lease) return fail(`Needs ${fmtMoney(c.lease)}`);
  spend(s, 'opex', c.lease);
  s.network.leases.push(cableId);
  news(s, `🌊 Leased capacity on ${c.name} (${fmtMoney(c.lease)}/month).`);
  return OK;
}

export function dropLease(s: GameState, cableId: string): Result {
  if (!s.network.leases.includes(cableId)) return fail('Not leased');
  s.network.leases = s.network.leases.filter((x) => x !== cableId);
  news(s, `🌊 Gave up capacity on ${CABLE_BY_ID[cableId]?.name ?? cableId}.`);
  return OK;
}

/** Monthly cost of all your cable leases. */
export function leaseCost(s: GameState): number {
  return s.network.leases.reduce((a, id) => a + (CABLE_BY_ID[id]?.lease ?? 0), 0);
}

export function canOwnCable(s: GameState, a: string, b: string): string | null {
  if (!act2(s)) return 'Cables open in Act II';
  if (a === b) return 'Pick two different landing stations';
  if (siteDef(a).kind !== 'landing' || siteDef(b).kind !== 'landing') return 'Cables run between landing stations';
  if (s.network.own.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))) return 'You already own a cable here';
  if (s.finance.cash < OWN_CABLE_COST) return `Needs ${fmtMoney(OWN_CABLE_COST)}`;
  return null;
}

export function buildOwnCable(s: GameState, a: string, b: string): Result {
  const why = canOwnCable(s, a, b);
  if (why) return fail(why);
  spend(s, 'capex', OWN_CABLE_COST);
  s.network.own.push({ id: nextId(s, 'oc'), a, b, status: 'building', progress: 0, buildDays: Math.round(OWN_CABLE_MONTHS * DAYS_PER_MONTH) });
  news(s, `🌊 Commissioned your own subsea cable: ${siteDef(a).name} ⇄ ${siteDef(b).name}.`);
  return OK;
}

// ── the stack ──
export function canSignDeal(s: GameState, dealId: string): string | null {
  const d = DEAL_BY_ID[dealId];
  if (!d) return 'Unknown deal';
  if (!act2(s) || s.phase < d.phase) return `Opens in phase ${d.phase} · ${PHASE_NAMES[d.phase]}`;
  if (s.stack.deals.some((x) => x.id.split('#')[0] === dealId && (x.endDay === 0 || x.endDay >= s.day))) return 'Already signed';
  if (s.finance.cash < d.cost) return `Needs ${fmtMoney(d.cost)}`;
  return null;
}

export function signDeal(s: GameState, dealId: string): Result {
  const why = canSignDeal(s, dealId);
  if (why) return fail(why);
  const d = DEAL_BY_ID[dealId];
  spend(s, 'chips', d.cost);
  s.stack.deals.push({ id: `${d.id}#${nextId(s, '')}`, kind: d.kind, partner: d.partner, units: d.units, startDay: s.day, readyDay: s.day + d.leadDays, endDay: d.days ? s.day + d.leadDays + d.days : 0 });
  news(s, `🤝 Signed: ${d.name} with ${d.partnerName} (${fmtMoney(d.cost)}).`, 'good');
  return OK;
}

export function stakePrice(s: GameState, mineId: string): number {
  const m = MINE_BY_ID[mineId];
  return m ? m.price * (s.market.materials[m.material] ?? 1) ** 0.5 : 0;
}

export function buyStake(s: GameState, mineId: string): Result {
  const m = MINE_BY_ID[mineId];
  if (!m) return fail('Unknown mine');
  if (!act2(s) || s.phase < 2) return fail('Stakes open in phase 2 · The Stack');
  const have = s.stack.stakes[mineId] ?? 0;
  if (have + 0.1 > m.max + 1e-9) return fail(`Most you can own is ${Math.round(m.max * 100)}%`);
  const price = stakePrice(s, mineId);
  if (s.finance.cash < price) return fail(`Needs ${fmtMoney(price)}`);
  spend(s, 'capex', price);
  s.stack.stakes[mineId] = Math.round((have + 0.1) * 10) / 10;
  news(s, `⛏ Bought 10% of ${siteDef(mineId).name} (${fmtMoney(price)}).`, 'good');
  return OK;
}

// ── politics ──
export function lobby(s: GameState, region: RegionId): Result {
  if (!act2(s)) return fail('Opens in Act II');
  if (s.finance.cash < LOBBY.cost) return fail(`Needs ${fmtMoney(LOBBY.cost)}`);
  spend(s, 'other', LOBBY.cost);
  const b = s.blocs[region];
  addRelation(s, region, LOBBY.relation * Math.max(0.25, 1 - b.lobby * 0.2));
  b.lobby += LOBBY.heat;
  b.poll = clamp(b.poll + 0.05, -1, 1);
  news(s, `🏛 Lobbying in ${REGIONS[region].name} (${fmtMoney(LOBBY.cost)}).`);
  return OK;
}

export function canApplyLicence(s: GameState, ruleId: string, region: RegionId): string | null {
  const r = RULE_BY_ID[ruleId];
  if (!r) return 'Unknown rule';
  if (!s.politics.rules.includes(ruleId)) return 'That rule isn’t in force';
  if (!r.to.includes(region)) return 'The rule doesn’t cover that bloc';
  if (r.licenceDays <= 0) return 'No licence exists for this — build locally';
  if (s.blocs[region].licences.includes(ruleId)) return 'Already licensed';
  if (licencePending(s, ruleId, region)) return 'Application in progress';
  if (s.blocs[r.by].relation < r.minRelation) return `${REGIONS[r.by].name} needs relations ≥ ${r.minRelation}`;
  if (s.finance.cash < r.licenceCost) return `Needs ${fmtMoney(r.licenceCost)}`;
  return null;
}

export function applyLicence(s: GameState, ruleId: string, region: RegionId): Result {
  const why = canApplyLicence(s, ruleId, region);
  if (why) return fail(why);
  const r = RULE_BY_ID[ruleId];
  spend(s, 'other', r.licenceCost);
  s.politics.pending.push({ rule: ruleId, region, readyDay: s.day + Math.round(r.licenceDays * techMult(s, 'licenceDays')) });
  news(s, `📜 Applied for a ${r.name} licence for ${REGIONS[region].name}.`);
  return OK;
}

export function signTreaty(s: GameState, id: string): Result {
  const t = TREATY_BY_ID[id];
  if (!t) return fail('Unknown treaty');
  if (!act2(s)) return fail('Opens in Act II');
  if (s.politics.treaties.includes(id)) return fail('Already a member');
  if (t.minSafety && s.alloc.safety + 1e-9 < t.minSafety) return fail(`Raise safety compute to ${Math.round(t.minSafety * 100)}% first`);
  s.politics.treaties.push(id);
  // capitals remember a walk-out: rejoining within a year of leaving earns no goodwill
  const rejoin = s.day - Number(s.flags[`treatyLeft:${id}`] ?? -1e9) < TREATY_REJOIN_DAYS;
  if (!rejoin) for (const r of Object.keys(s.blocs) as RegionId[]) addRelation(s, r, t.relation[s.blocs[r].stance]);
  news(s, rejoin ? `✍ Rejoined the ${t.name}. Capitals remember you walked out: no goodwill this time.` : `✍ Signed the ${t.name}.`, rejoin ? 'info' : 'good');
  return OK;
}

/** Leaving a treaty and rejoining within this many days earns no relations. */
export const TREATY_REJOIN_DAYS = 365;

export function leaveTreaty(s: GameState, id: string): Result {
  if (!s.politics.treaties.includes(id)) return fail('Not a member');
  s.politics.treaties = s.politics.treaties.filter((x) => x !== id);
  s.flags[`treatyLeft:${id}`] = s.day;
  for (const r of Object.keys(s.blocs) as RegionId[]) addRelation(s, r, s.blocs[r].stance === 'cautious' ? -8 : -3);
  news(s, `✍ Left the ${TREATY_BY_ID[id]?.name ?? id}.`, 'bad');
  return OK;
}

export function acceptSovereign(s: GameState, dealId: string): Result {
  const d = s.capital.sovereign.find((x) => x.id === dealId);
  if (!d || d.status !== 'offer') return fail('That offer is gone');
  const def = SOVEREIGN_BY_ID[d.def];
  d.status = 'active';
  d.byDay = s.day + def.days;
  d.baseMW = blocIT(s, d.region); // only new capacity counts
  if (def.power) addModifier(s, `region:${d.region}:price`, def.days, `${def.title}: cheap power`, { mult: def.power });
  if (def.permit) addModifier(s, `region:${d.region}:permit`, def.days, `${def.title}: fast permits`, { mult: def.permit });
  addRelation(s, d.region, 4);
  news(s, `🤝 Accepted ${REGIONS[d.region].name}'s ${def.title}: ${fmtMW(d.needMW)} of IT there by the deadline.`, 'good');
  return OK;
}

export function declineSovereign(s: GameState, dealId: string): Result {
  const d = s.capital.sovereign.find((x) => x.id === dealId);
  if (!d || d.status !== 'offer') return fail('That offer is gone');
  d.status = 'failed';
  addRelation(s, d.region, -2);
  return OK;
}

// ── capital ──
export function borrow(s: GameState, amount: number, label = 'Project finance'): Result {
  if (!act2(s)) return fail('Project finance opens in Act II');
  if (amount <= 0) return fail('Borrow something');
  const left = creditLeft(s);
  if (amount > left + 1) return fail(`You can borrow up to ${fmtMoney(left)} against your assets`);
  const rate = loanRate(s);
  const monthly = monthlyPayment(amount, rate, FINANCE.years);
  s.capital.loans.push({ id: nextId(s, 'ln'), label, principal: amount, balance: amount, rate, monthly, startDay: s.day, endDay: s.day + FINANCE.years * 365 });
  earn(s, 'funding', amount);
  news(s, `🏦 Borrowed ${fmtMoney(amount)} at ${(rate * 100).toFixed(1)}% (${fmtMoney(monthly)}/month).`);
  return OK;
}

export function repayLoan(s: GameState, loanId: string): Result {
  const l = s.capital.loans.find((x) => x.id === loanId);
  if (!l) return fail('No such loan');
  if (s.finance.cash < l.balance) return fail(`Needs ${fmtMoney(l.balance)}`);
  spend(s, 'debt', l.balance);
  s.capital.loans = s.capital.loans.filter((x) => x.id !== loanId);
  news(s, `🏦 Repaid ${l.label} early.`, 'good');
  return OK;
}

export function acceptContract(s: GameState, offerId: string): Result {
  const o = s.capital.offers.find((x) => x.id === offerId);
  if (!o) return fail('That offer has expired');
  const can = contractDeliverable(s, o).frac;
  if (can < CONTRACT_MIN_SIGN) return fail(`You could deliver only ${Math.round(can * 100)}% of this in ${REGIONS[o.region].name} today: build there, or reach it with fiber or a cable`);
  s.capital.offers = s.capital.offers.filter((x) => x.id !== offerId);
  s.capital.contracts.push({ ...o, startDay: s.day, endDay: s.day + Math.round(o.months * DAYS_PER_MONTH), expires: undefined, delivered: 1 });
  news(s, `📄 Signed a ${o.months}-month contract with ${o.customer}: ${fmtMoney(o.monthly)}/month.`, 'good');
  return OK;
}

export function declineContract(s: GameState, offerId: string): Result {
  s.capital.offers = s.capital.offers.filter((x) => x.id !== offerId);
  return OK;
}

export function buyStartup(s: GameState, offerId: string): Result {
  const o = s.startups.offers.find((x) => x.id === offerId);
  if (!o) return fail('Someone else bought it');
  const def = STARTUP_BY_ID[o.def];
  if (s.finance.cash < o.price) return fail(`Needs ${fmtMoney(o.price)}`);
  spend(s, 'capex', o.price);
  s.startups.offers = s.startups.offers.filter((x) => x.id !== offerId);
  s.startups.bought.push(def.id);
  if (def.tech && !s.research.done.includes(def.tech)) s.research.done.push(def.tech);
  if (def.rp) s.research.pool += def.rp;
  if (def.talent) s.talent[def.talent] = 1;
  news(s, `🦄 Acquired ${def.name} for ${fmtMoney(o.price)}: ${def.gives}.`, 'good');
  return OK;
}

// ── advisor jobs ──
export function setJob(s: GameState, advisor: AdvisorId, patch: Partial<Job>): Result {
  const def = JOB_BY_ADVISOR[advisor];
  if (!def) return fail('No job for that advisor');
  if (!act2(s) || s.phase < def.phase) return fail(`Opens in phase ${def.phase} · ${PHASE_NAMES[def.phase]}`);
  const cur: Job = s.jobs[advisor] ?? { on: false, a: def.a.def, b: def.b?.def };
  if (patch.on && def.minMargin !== undefined && s.stats.margin < def.minMargin) return fail(`Needs a safety margin ≥ ${def.minMargin} — you only automate what you trust`);
  s.jobs[advisor] = { ...cur, ...patch };
  return OK;
}