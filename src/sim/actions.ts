/** Player actions. Each validates, spends, mutates, and reports why it can't when it can't. */
import { CHIP_SUPPLIERS, RENTAL } from '../content/companies';
import { FACILITIES } from '../content/facilities';
import { siteDef, siteDistanceKm } from '../content/sites';
import { TECH_BY_ID } from '../content/techs';
import type { FacilityType, GameState, SupplierId } from './types';
import { clamp, fmtMoney, fmtMW, news, nextId } from './core';
import { spend } from './economy';
import { nextModelPlan } from './ai';
import {
  buildCost,
  buildDays,
  chipSpec,
  GRID_FEE_PER_MW,
  gridHeadroomLeft,
  gridLeadDays,
  LINK_LOSS_PER_100KM,
  LINK_MAX_KM,
  linkCost,
  linkDays,
  rentalMax,
  SHIP_COST,
  supplierDailyRate,
} from './model';
import { planShipment, supplierOrigin, type SimContext } from './supply';

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export function slotsUsed(s: GameState, siteId: string): number {
  return s.facilities.filter((f) => f.siteId === siteId && f.type !== 'hq').length;
}

export function canBuild(s: GameState, siteId: string, type: FacilityType): string | null {
  const site = siteDef(siteId);
  if (site.kind !== 'build') return 'Not a buildable site';
  if (!FACILITIES[type].buildable) return 'Not buildable';
  if (slotsUsed(s, siteId) >= site.slots) return 'No free plots at this site';
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
  s.facilities.push({ id: nextId(s, 'f'), type, siteId, status: 'building', progress: 0, buildDays: days, startedDay: s.day, racks: type === 'datacenter' ? [] : undefined });
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
  if (km > LINK_MAX_KM) return `Too far (${Math.round(km)} km > ${LINK_MAX_KM} km)`;
  if (s.finance.cash < linkCost(km)) return `Needs ${fmtMoney(linkCost(km))}`;
  return null;
}

export function buildLink(s: GameState, a: string, b: string): Result {
  const why = canLink(s, a, b);
  if (why) return fail(why);
  const km = siteDistanceKm(a, b);
  spend(s, 'capex', linkCost(km));
  s.links.push({ id: nextId(s, 'l'), a, b, km, status: 'building', progress: 0, buildDays: linkDays(s, km, a, b), capacityMW: 1000, lossPct: (km / 100) * LINK_LOSS_PER_100KM });
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
  const fromSite = supplierOrigin(supplier, dest);
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
  const cap = key === 'safety' && s.flags.safetyCapUntil && s.day < Number(s.flags.safetyCapUntil) ? 0.05 : 1;
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
  s.training = { name: plan.name, gen: plan.gen, target: plan.flop, done: 0, startDay: s.day };
  news(s, `🧠 Training run started: ${plan.name}.`);
  return OK;
}

export function setResearch(s: GameState, techId: string): Result {
  const t = TECH_BY_ID[techId];
  if (!t) return fail('Unknown tech');
  if (s.research.done.includes(techId)) return fail('Already researched');
  if ((t.requires ?? []).some((r) => !s.research.done.includes(r))) return fail('Prerequisites missing');
  if (s.research.current && s.research.current !== techId) {
    // switching keeps progress banked in the pool
    s.research.pool += s.research.progress;
    s.research.progress = 0;
  }
  s.research.current = techId;
  return OK;
}
