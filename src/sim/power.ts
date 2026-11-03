import { FACILITIES } from '../content/facilities';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import type { GameState, SitePower } from './types';
import { modMult, techMult } from './effects';
import { GAS_CO2_PER_MWH, GAS_FUEL_PER_MWH, gridPrice, pueAt } from './model';

export interface PowerResult {
  sites: Record<string, SitePower>;
  /** $ spent today on grid electricity and gas fuel. */
  gridCost: number;
  fuelCost: number;
  /** Tonnes CO₂ today. */
  co2: number;
  co2ByRegion: Record<string, number>;
  /** Average MW the player generated today (solar + wind + gas). */
  genMW: number;
  load: number;
  served: number;
}

interface Pool {
  load: number;
  solar: number;
  wind: number;
  gasCap: number;
  battMW: number;
  battMWh: number;
  grid: number;
}

/** Sites the player is active at (any facility or grid connection). */
export function activeSites(s: GameState): string[] {
  const set = new Set<string>();
  for (const f of s.facilities) set.add(f.siteId);
  for (const [id, st] of Object.entries(s.sites)) if (st.grid.mw > 0 || st.grid.pending.length) set.add(id);
  return [...set];
}

function siteLoad(s: GameState, siteId: string): number {
  let mw = 0;
  const pue = pueAt(s, siteId);
  for (const f of s.facilities) {
    if (f.siteId !== siteId || f.status !== 'online') continue;
    if (f.type === 'datacenter') for (const r of f.racks ?? []) mw += (r.qty * r.kw * pue) / 1000;
    else mw += FACILITIES[f.type].loadMW ?? 0;
  }
  return mw;
}

function sitePool(s: GameState, siteId: string): Pool {
  const site = siteDef(siteId);
  const p: Pool = { load: siteLoad(s, siteId), solar: 0, wind: 0, gasCap: 0, battMW: 0, battMWh: 0, grid: s.sites[siteId]?.grid.mw ?? 0 };
  const solarCF = site.solarCF * techMult(s, 'solarCF') * modMult(s, `region:${site.region}:solar`);
  const windCF = site.windCF * techMult(s, 'windCF') * modMult(s, `region:${site.region}:wind`);
  for (const f of s.facilities) {
    if (f.siteId !== siteId || f.status !== 'online') continue;
    const def = FACILITIES[f.type];
    if (f.type === 'solar') p.solar += def.mw! * solarCF;
    else if (f.type === 'wind') p.wind += def.mw! * windCF;
    else if (f.type === 'gas') p.gasCap += def.mw! * 0.95 * modMult(s, 'gas:availability');
    else if (f.type === 'battery') {
      p.battMW += def.mw!;
      p.battMWh += def.mwh! * techMult(s, 'batteryMWh');
    }
  }
  p.grid *= modMult(s, `region:${site.region}:grid`);
  return p;
}

/**
 * Daily power balance. Sites joined by transmission links pool their supply. Solar only
 * fully counts with batteries to carry it through the night; gas and grid fill the gap.
 */
export function solvePower(s: GameState): PowerResult {
  const ids = activeSites(s);
  const pools: Record<string, Pool> = {};
  for (const id of ids) pools[id] = sitePool(s, id);

  // islands via online links (union-find)
  const parent: Record<string, string> = {};
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const id of ids) parent[id] = id;
  const linkLoss: Record<string, number> = {};
  for (const l of s.links) {
    if (l.status !== 'online' || !(l.a in parent) || !(l.b in parent)) continue;
    parent[find(l.a)] = find(l.b);
    linkLoss[l.a] = Math.min(linkLoss[l.a] ?? 1, l.lossPct / 100);
    linkLoss[l.b] = Math.min(linkLoss[l.b] ?? 1, l.lossPct / 100);
  }
  const islands: Record<string, string[]> = {};
  for (const id of ids) (islands[find(id)] ??= []).push(id);

  const res: PowerResult = { sites: {}, gridCost: 0, fuelCost: 0, co2: 0, co2ByRegion: {}, genMW: 0, load: 0, served: 0 };
  const fuelPrice = GAS_FUEL_PER_MWH * s.market.gasPrice * techMult(s, 'gasFuel');
  const gasCo2 = GAS_CO2_PER_MWH * techMult(s, 'gasCO2');

  for (const members of Object.values(islands)) {
    // pool the island; generation at load-free sites crosses a line and loses a little
    const P: Pool = { load: 0, solar: 0, wind: 0, gasCap: 0, battMW: 0, battMWh: 0, grid: 0 };
    for (const id of members) {
      const p = pools[id];
      const loss = members.length > 1 && p.load === 0 ? linkLoss[id] ?? 0 : 0;
      P.load += p.load;
      P.solar += p.solar * (1 - loss);
      P.wind += p.wind * (1 - loss);
      P.gasCap += p.gasCap * (1 - loss);
      P.battMW += p.battMW;
      P.battMWh += p.battMWh;
      P.grid += p.grid;
    }
    const covS = P.solar > 0 ? Math.min(1, P.battMWh / (P.solar * 14)) : 0;
    const usableSolar = P.solar * (0.45 + 0.55 * covS);
    const leftMWh = Math.max(0, P.battMWh - P.solar * 14);
    const covW = P.wind > 0 ? Math.min(1, leftMWh / (P.wind * 6)) : 0;
    const usableWind = P.wind * (0.7 + 0.3 * covW);
    const variable = Math.min(P.load, usableSolar + usableWind);
    let need = P.load - variable;
    const gasUsed = Math.min(P.gasCap, need);
    need -= gasUsed;
    const gridUsed = Math.min(P.grid, need);
    need -= gridUsed;
    const served = P.load - need;
    const frac = P.load > 0 ? served / P.load : 1;
    const curtailed = Math.max(0, P.solar + P.wind - variable);

    res.load += P.load;
    res.served += served;
    res.genMW += variable + gasUsed;

    for (const id of members) {
      const p = pools[id];
      const site = siteDef(id);
      const gShare = P.grid > 0 ? p.grid / P.grid : 0;
      const fShare = P.gasCap > 0 ? p.gasCap / P.gasCap : 0;
      const siteGrid = gridUsed * gShare;
      const siteGas = gasUsed * fShare;
      res.gridCost += siteGrid * 24 * gridPrice(s, id);
      res.fuelCost += siteGas * 24 * fuelPrice;
      const co2 = siteGas * 24 * gasCo2 + siteGrid * 24 * REGIONS[site.region].gridCarbon;
      res.co2 += co2;
      res.co2ByRegion[site.region] = (res.co2ByRegion[site.region] ?? 0) + co2;
      const localGen = p.solar + p.wind + p.gasCap;
      res.sites[id] = {
        load: p.load,
        solar: p.solar,
        wind: p.wind,
        gas: p.gasCap,
        gasUsed: siteGas,
        gridUsed: siteGrid,
        battery: p.battMW,
        served: p.load * frac,
        frac,
        curtailed: P.solar + P.wind > 0 ? curtailed * ((p.solar + p.wind) / (P.solar + P.wind)) : 0,
        imported: Math.max(0, p.load * frac - Math.min(p.load, localGen) - siteGrid),
        exported: p.load === 0 && members.length > 1 ? Math.min(localGen, variable + gasUsed) : 0,
      };
    }
  }
  return res;
}
