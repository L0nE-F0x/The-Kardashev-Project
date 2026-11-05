import { CHIP_SUPPLIERS } from '../content/companies';
import { siteDef } from '../content/sites';
import { routeBetween, type Router } from '../world/routing';
import { CHOKEPOINT_BY_ID } from '../world/routing';
import type { Batch, GameState, Order, Shipment, SupplierId } from './types';
import { fmtNum, news, nextId } from './core';
import { closedChokepoints, modMult } from './effects';
import { AIR_KM_PER_DAY, facilityIT, LAND_KM_PER_DAY, SEA_KM_PER_DAY, supplierDailyRate } from './model';
import { HALLS } from '../content/facilities';
import { haversineKm } from '../content/sites';

export interface SimContext {
  router: Router | null;
}

/** Your online fab sites (the 'own' supplier ships from these). */
export function ownFabSites(s: GameState): string[] {
  return s.facilities.filter((f) => f.type === 'fab' && f.status === 'online').map((f) => f.siteId);
}

/** Choose the supplier site closest (by straight line) to a destination. */
export function supplierOrigin(supplier: SupplierId, dest: string, s?: GameState): string {
  const d = siteDef(dest);
  const sites = supplier === 'own' && s ? ownFabSites(s) : CHIP_SUPPLIERS[supplier].sites;
  if (!sites.length) return CHIP_SUPPLIERS.kestrel.sites[0];
  let best = sites[0];
  let bestKm = Infinity;
  for (const id of sites) {
    const sd = siteDef(id);
    const km = haversineKm(sd.lat, sd.lon, d.lat, d.lon);
    if (km < bestKm) {
      bestKm = km;
      best = id;
    }
  }
  return best;
}

/** Transit time and path for a shipment leaving today. */
export function planShipment(s: GameState, ctx: SimContext, from: string, dest: string, mode: 'sea' | 'air') {
  const closed = closedChokepoints(s);
  if (!ctx.router) {
    const a = siteDef(from);
    const b = siteDef(dest);
    const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const days = mode === 'air' ? 3 + km / AIR_KM_PER_DAY : 6 + (km * 1.4) / SEA_KM_PER_DAY;
    return { route: [[a.lon, a.lat], [b.lon, b.lat]] as [number, number][], overland: [] as [number, number][], seaDays: days, landDays: 0, chokepoints: [] as string[] };
  }
  const r = routeBetween(ctx.router, from, dest, mode, closed);
  const delay = modMult(s, 'shipping:delay');
  if (mode === 'air') {
    return { route: r.path, overland: r.overland, seaDays: (3 + r.km / AIR_KM_PER_DAY) * delay, landDays: 1, chokepoints: [] };
  }
  return {
    route: r.path,
    overland: r.overland,
    seaDays: (5 + r.km / SEA_KM_PER_DAY) * delay,
    landDays: 1 + r.overlandKm / LAND_KM_PER_DAY,
    chokepoints: r.chokepoints,
  };
}

/** Run supplier production lines, dispatch weekly shipments, deliver arrivals. */
export function tickSupply(s: GameState, ctx: SimContext): void {
  // production: each supplier works through its queue in order
  for (const supplier of Object.keys(CHIP_SUPPLIERS) as SupplierId[]) {
    let capacity = supplierDailyRate(s, supplier);
    for (const o of s.orders) {
      if (o.done || o.supplier !== supplier || capacity <= 0) continue;
      const remaining = o.qty - o.produced;
      const take = Math.min(remaining, capacity);
      o.produced += take;
      o.pendingShip += take;
      capacity -= take;
    }
  }
  // dispatch: weekly, or when the order is complete
  for (const o of s.orders) {
    if (o.done) continue;
    const complete = o.produced >= o.qty - 1e-6;
    const lot = Math.floor(o.pendingShip);
    if (lot <= 0) {
      // nothing (whole) left to ship and nothing left to make — e.g. a quake moved the rest to Kestrel: it's done
      if (complete) {
        o.done = true;
        o.pendingShip = 0;
      }
      continue;
    }
    if (!complete && (s.day - o.placedDay) % 7 !== 0) continue;
    if (!complete && lot < Math.min(250, o.qty)) continue;
    dispatch(s, ctx, o, complete ? Math.round(o.pendingShip) : lot);
    if (complete) {
      o.done = true;
      o.pendingShip = 0;
    }
  }
  // arrivals
  const arrived: Shipment[] = [];
  s.shipments = s.shipments.filter((sh) => {
    if (s.day >= sh.arriveDay) {
      arrived.push(sh);
      return false;
    }
    return true;
  });
  for (const sh of arrived) {
    s.sites[sh.dest].inventory.push({ ...sh.batch });
    news(s, `📦 ${fmtNum(sh.batch.qty, 0)} accelerators arrived at ${siteDef(sh.dest).name}.`, 'good');
    installInventory(s, sh.dest);
  }
  s.orders = s.orders.filter((o) => !o.done || s.shipments.some((sh) => sh.orderId === o.id));
}

function dispatch(s: GameState, ctx: SimContext, o: Order, qty: number): void {
  if (qty <= 0) return;
  const plan = planShipment(s, ctx, o.fromSite, o.dest, o.mode);
  const portDay = s.day + Math.max(1, Math.round(plan.seaDays));
  const arriveDay = portDay + Math.max(0, Math.round(plan.landDays));
  const sh: Shipment = {
    id: nextId(s, 'sh'),
    orderId: o.id,
    batch: { qty, perf: o.perf, kw: o.kw, supplier: o.supplier },
    from: o.fromSite,
    dest: o.dest,
    mode: o.mode,
    departDay: s.day,
    portDay,
    arriveDay,
    route: plan.route,
    overland: plan.overland,
    chokepoints: plan.chokepoints,
    delayed: false,
  };
  s.shipments.push(sh);
  o.pendingShip = Math.max(0, o.pendingShip - qty);
  o.shipped += qty;
  const via = plan.chokepoints.length ? ` via ${plan.chokepoints.map((c) => CHOKEPOINT_BY_ID[c]?.name ?? c).join(', ')}` : '';
  news(s, `${o.mode === 'air' ? '✈' : '🚢'} ${fmtNum(qty, 0)} accelerators left ${siteDef(o.fromSite).name}${via}.`);
}

/** Move inventory at a site into any data center with rack space. */
export function installInventory(s: GameState, siteId: string): number {
  const inv = s.sites[siteId]?.inventory;
  if (!inv?.length) return 0;
  let installed = 0;
  for (const dc of s.facilities) {
    if (dc.siteId !== siteId || !HALLS.includes(dc.type) || dc.status !== 'online') continue;
    dc.racks ??= [];
    while (inv.length) {
      const batch = inv[0];
      const usedKw = dc.racks.reduce((a, r) => a + r.qty * r.kw, 0);
      const freeUnits = Math.floor((facilityIT(dc) * 1000 - usedKw) / batch.kw);
      if (freeUnits <= 0) break;
      const take = Math.min(batch.qty, freeUnits);
      const same = dc.racks.find((r) => r.perf === batch.perf && r.supplier === batch.supplier);
      if (same) same.qty += take;
      else dc.racks.push({ ...batch, qty: take });
      batch.qty -= take;
      installed += take;
      if (batch.qty <= 0) inv.shift();
    }
  }
  return installed;
}

/**
 * Rack space at a site, in chips of `kw` each: the halls there (built or still building) against everything already
 * installed, in the warehouse, at sea and still in a fab queue for it. The Orders panel sizes an order from it.
 */
export function hallSpace(s: GameState, siteId: string, kw: number): { cap: number; free: number } {
  let capKw = 0;
  let usedKw = 0;
  for (const f of s.facilities) {
    if (f.siteId !== siteId || !HALLS.includes(f.type)) continue;
    capKw += facilityIT(f) * 1000;
    for (const r of f.racks ?? []) usedKw += r.qty * r.kw;
  }
  for (const b of s.sites[siteId]?.inventory ?? []) usedKw += b.qty * b.kw;
  for (const sh of s.shipments) if (sh.dest === siteId) usedKw += sh.batch.qty * sh.batch.kw;
  for (const o of s.orders) if (!o.done && o.dest === siteId) usedKw += Math.max(0, o.qty - o.shipped) * o.kw;
  return { cap: Math.floor(capKw / kw), free: Math.max(0, Math.floor((capKw - usedKw) / kw)) };
}

export function inventoryCount(s: GameState, siteId: string): number {
  return (s.sites[siteId]?.inventory ?? []).reduce((a: number, b: Batch) => a + b.qty, 0);
}

/** Re-route ships that are about to sail through a newly closed chokepoint. */
export function delayShipmentsThrough(s: GameState, chokepoint: string, days: number): number {
  let n = 0;
  for (const sh of s.shipments) {
    if (sh.mode !== 'sea' || !sh.chokepoints.includes(chokepoint) || sh.portDay <= s.day) continue;
    sh.portDay += days;
    sh.arriveDay += days;
    sh.delayed = true;
    n++;
  }
  if (n) news(s, `⚠ ${n} shipment${n > 1 ? 's' : ''} rerouted around ${CHOKEPOINT_BY_ID[chokepoint]?.name ?? chokepoint} (+${days} days).`, 'bad');
  return n;
}
