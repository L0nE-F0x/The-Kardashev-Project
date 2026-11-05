import { FACILITIES } from '../content/facilities';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import type { GameState, Ledger } from './types';
import { clamp, fmtMoney, monthKey, monthLabelOfKey, news } from './core';
import { modAdd, techMult } from './effects';
import { DAYS_PER_MONTH, facilityOpex, rentalPrice } from './model';
import { MINE_BY_ID } from '../content/stack';
import type { PowerResult } from './power';
import type { ComputeResult } from './ai';
import { REGION_IDS } from '../content/mapcodes';
import { FOUNDERS } from '../content/difficulty';

export const emptyLedger = (): Ledger => ({ revenue: 0, debt: 0, rental: 0, power: 0, fuel: 0, opex: 0, staff: 0, capex: 0, chips: 0, shipping: 0, funding: 0, other: 0 });

/** Record a cash movement (+ income / − spend) in this month's ledger. */
export function spend(s: GameState, category: keyof Ledger, amount: number): void {
  s.finance.cash -= amount;
  s.finance.month[category] += category === 'revenue' || category === 'funding' ? -amount : amount;
}

export function earn(s: GameState, category: 'revenue' | 'funding' | 'other', amount: number): void {
  s.finance.cash += amount;
  if (category === 'other') s.finance.month.other -= amount;
  else s.finance.month[category] += amount;
}

/** Daily operating cash flow. Returns the day's net burn for stats. */
/** Act IV: a company you sold or handed to the Charter as a public utility isn't yours any more. */
export function companyHandedOver(s: GameState): boolean {
  return s.planet?.company === 'sell' || s.planet?.company === 'utility';
}

export function tickEconomy(s: GameState, power: PowerResult, compute: ComputeResult): { revenue: number; costs: number } {
  // its books are its new owners' business: nothing lands on yours
  if (companyHandedOver(s)) return { revenue: 0, costs: 0 };
  const perDay = 1 / DAYS_PER_MONTH;
  let costs = 0;
  const rent = s.rental.units * rentalPrice(s) * perDay;
  spend(s, 'rental', rent);
  costs += rent;
  spend(s, 'power', power.gridCost);
  spend(s, 'fuel', power.fuelCost);
  costs += power.gridCost + power.fuelCost;
  for (const f of s.facilities) {
    if (f.status !== 'online') continue;
    const opex = (f.type === 'hq' ? FACILITIES.hq.opex : facilityOpex(f)) * perDay;
    if (f.type === 'lab' || f.type === 'hq') spend(s, 'staff', opex);
    else spend(s, 'opex', opex);
    costs += opex;
  }
  const extra = modAdd(s, 'cost:monthly') * perDay;
  if (extra) {
    spend(s, 'other', extra);
    costs += extra;
  }
  earn(s, 'revenue', compute.revenueDay);
  if (power.sales > 0) earn(s, 'other', power.sales);
  // mine stakes pay a dividend that rises with the price of what they dig up
  for (const [id, share] of Object.entries(s.stack?.stakes ?? {})) {
    const m = MINE_BY_ID[id];
    if (m && share > 0) earn(s, 'other', ((m.income * share) / 0.1) * (s.market.materials?.[m.material] ?? 1) * perDay);
  }

  // monthly rollover
  const mk = monthKey(s.day);
  if (mk !== s.finance.monthKey) {
    const m = s.finance.month;
    s.finance.history.push({ ...m, label: monthLabelOfKey(s.finance.monthKey), cashEnd: s.finance.cash });
    if (s.finance.history.length > 36) s.finance.history.shift();
    s.finance.month = emptyLedger();
    s.finance.monthKey = mk;
    const net = m.revenue - (m.rental + m.power + m.fuel + m.opex + m.staff + m.capex + m.chips + m.shipping + m.other);
    news(s, `📊 ${monthLabelOfKey(mk - 1)}: revenue ${fmtMoney(m.revenue)}, net ${fmtMoney(net)}.`, net >= 0 ? 'good' : 'info');
  }
  return { revenue: compute.revenueDay, costs };
}

/** Regional social license drifts with what you build, what you burn and how you behave. */
export function tickLicense(s: GameState, power: PowerResult): void {
  const gain = techMult(s, 'licenseGain');
  const jobs: Record<string, number> = {};
  for (const f of s.facilities) {
    if (f.type === 'hq') continue;
    const r = siteDef(f.siteId).region;
    jobs[r] = (jobs[r] ?? 0) + (f.status === 'online' ? 1 : 0.5);
  }
  const strain: Record<string, number> = {};
  for (const [id, sp] of Object.entries(power.sites)) {
    const r = siteDef(id).region;
    strain[r] = (strain[r] ?? 0) + sp.gridUsed;
  }
  const trustBonus = FOUNDERS[s.meta?.founder ?? 'classic']?.trust ?? 0;
  for (const r of REGION_IDS) {
    const def = REGIONS[r];
    const st = s.regions[r];
    let d = (def.license0 + trustBonus - st.license) * 0.0015;
    d += Math.min(0.02, (jobs[r] ?? 0) * 0.004) * gain;
    d -= (strain[r] ?? 0) * 0.00035;
    d -= ((power.co2ByRegion[r] ?? 0) / 1000) * def.green * 0.0025;
    st.license = clamp(st.license + d, 0, 100);
  }
}
