/**
 * Shared formulas: costs, build times, chip specs, capability maths. Pure functions so the UI
 * can preview exactly what the simulation will do.
 */
import { CHIP_SUPPLIERS, RENTAL } from '../content/companies';
import { POOL_TUNING } from '../content/stack';
import { DIFFICULTIES, FOUNDERS } from '../content/difficulty';
import { FACILITIES } from '../content/facilities';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import type { Facility, FacilityType, GameState, SupplierId } from './types';
import { clamp, yearsElapsed } from './core';
import { modMult, techMult } from './effects';

export const START_CASH = 450e6;
/** Model FLOP utilisation when training / serving. */
export const MFU = 0.4;
export const BASE_PUE = 1.3;
export const INFER_REV_PER_ACCEL_MONTH = 3_500;

/** Act II: the price of a unit of inference falls every year as everyone's chips get faster. */
export function inferPriceTrend(s: GameState): number {
  return (s.act ?? 1) >= 2 ? Math.pow(0.8, Math.max(0, yearsElapsed(s.day) - 2.2)) : 1;
}
export const DAYS_PER_MONTH = 30.4;
export const SEA_KM_PER_DAY = 650;
export const LAND_KM_PER_DAY = 450;
export const AIR_KM_PER_DAY = 9_000;
export const SHIP_COST = { sea: 150, air: 900 } as const;
export const GRID_FEE_PER_MW = 150_000;
export const LINK_COST_PER_KM = 400_000;
export const LINK_MAX_KM = 1_500;
export const LINK_LOSS_PER_100KM = 0.6;
export const GAS_FUEL_PER_MWH = 38;
export const GAS_CO2_PER_MWH = 0.45;
export const WORLD_TW_2027 = 19.6;
export const WORLD_GROWTH = 0.016;

/** Model generations the player trains (FLOP targets). Act I: Bit-1/2. Act II: Bit-3/4 (5 for the keen). */
export const MODEL_PLAN = [
  { name: 'Bit-1', flop: 1e24 },
  { name: 'Bit-2', flop: 2e26 },
  { name: 'Bit-3', flop: 1e27 },
  { name: 'Bit-4', flop: 2e28 },
  { name: 'Bit-5', flop: 2e29 },
  { name: 'Bit-6', flop: 1.5e30 },
];

export const CAPABILITY_TIERS = ['—', 'Chatbot', 'Assistant', 'Agent', 'Researcher', 'Scientist', 'Polymath', 'Architect', 'Oracle', 'Superintelligence'];

export function tierOf(c: number): number {
  return clamp(Math.floor(c), 0, CAPABILITY_TIERS.length - 1);
}

// ── facilities ──────────────────────────────────────────────────────────────────────────────
/** Raw-material price effects on what you build (copper everywhere, lithium for batteries). */
export function materialMult(s: GameState, type: FacilityType | 'link'): number {
  const m = s.market.materials;
  if (!m) return 1;
  const hedge = (mat: 'lithium' | 'copper') => 1 - Math.min(0.8, stakeShare(s, mat) * 2.5);
  let k = 1 + 0.15 * (m.copper - 1) * hedge('copper');
  if (type === 'battery') k *= 1 + 0.45 * (m.lithium - 1) * hedge('lithium');
  return Math.max(0.5, k);
}

/** Your combined stake in mines of one material (0..). */
export function stakeShare(s: GameState, material: string): number {
  let v = 0;
  for (const [id, share] of Object.entries(s.stack?.stakes ?? {})) if (MINE_MATERIAL[id] === material) v += share;
  return v;
}

const MINE_MATERIAL: Record<string, string> = { 'mine-atacama': 'lithium', 'mine-pilbara': 'lithium', 'mine-copperbelt': 'copper', 'mine-helium': 'helium', 'mine-neon': 'neon' };

function learnDrift(s: GameState, type: FacilityType): number {
  const def = FACILITIES[type];
  const built = s.built[type] ?? 0;
  return Math.pow(1 - def.learn, Math.log2(1 + built)) * Math.pow(def.yearly, yearsElapsed(s.day));
}

export function buildCost(s: GameState, type: FacilityType): number {
  const def = FACILITIES[type];
  let cost = def.capex * learnDrift(s, type);
  if (type === 'battery') cost *= techMult(s, 'batteryCost');
  if (type === 'solar') cost *= techMult(s, 'solarCost');
  if (type === 'wind') cost *= techMult(s, 'windCost');
  return cost * modMult(s, `cost:${type}`) * materialMult(s, type);
}

export const tierOfFacility = (f: Facility): number => f.tier ?? 1;

/** Capacity multiplier for a facility's current tier. */
export function tierMult(f: Facility, tier = tierOfFacility(f)): number {
  if (tier <= 1) return 1;
  return FACILITIES[f.type].tiers?.[tier - 2]?.mult ?? 1;
}

/** Nameplate MW of a generator (or battery power). */
export function facilityMW(f: Facility): number {
  const def = FACILITIES[f.type];
  if (f.type === 'restart') return siteDef(f.siteId).reactorMW ?? def.mw ?? 0;
  return (def.mw ?? 0) * tierMult(f);
}

/** IT MW of a data hall or campus. */
export function facilityIT(f: Facility): number {
  return (FACILITIES[f.type].itMW ?? 0) * tierMult(f);
}

export function facilityOpex(f: Facility): number {
  return FACILITIES[f.type].opex * tierMult(f);
}

export function facilitySlots(f: Facility): number {
  return f.type === 'hq' ? 0 : FACILITIES[f.type].slots ?? 1;
}

/** The next tier for a facility, if any. */
export function nextTier(f: Facility) {
  const tiers = FACILITIES[f.type].tiers;
  const t = tierOfFacility(f);
  if (!tiers || t - 1 >= tiers.length) return null;
  return { tier: t + 1, def: tiers[t - 1] };
}

export function upgradeCost(s: GameState, f: Facility): number {
  const nt = nextTier(f);
  if (!nt) return 0;
  let cost = nt.def.capex * learnDrift(s, f.type);
  if (f.type === 'battery') cost *= techMult(s, 'batteryCost');
  if (f.type === 'solar') cost *= techMult(s, 'solarCost');
  if (f.type === 'wind') cost *= techMult(s, 'windCost');
  return cost * modMult(s, `cost:${f.type}`) * materialMult(s, f.type);
}

export function upgradeDays(s: GameState, f: Facility): number {
  const nt = nextTier(f);
  if (!nt) return 0;
  let days = nt.def.months * DAYS_PER_MONTH * (0.6 + 0.4 * permitFactor(s, f.siteId));
  if (f.type === 'datacenter') days *= techMult(s, 'dcBuild');
  if (NUCLEAR_TYPES.includes(f.type)) days *= techMult(s, 'nuclearBuild');
  days *= modMult(s, 'construction') * modMult(s, `construction:${f.type}`);
  return Math.max(30, Math.round(days));
}

const NUCLEAR_TYPES: FacilityType[] = ['restart', 'smr', 'reactor'];

/** Plots at a site, including land you bought. */
export function siteSlots(s: GameState, siteId: string): number {
  return siteDef(siteId).slots + (s.sites[siteId]?.extraSlots ?? 0);
}

/** Price of one more plot at a site (each one costs more). */
export function landCost(s: GameState, siteId: string): number {
  const extra = s.sites[siteId]?.extraSlots ?? 0;
  const site = siteDef(siteId);
  return 60e6 * site.priceMult * Math.pow(1.6, extra) * (REGIONS[site.region].permit);
}
export const MAX_EXTRA_SLOTS = 3;

/** Packaging capacity per month a packaging plant adds. */
export function facilityPkgUnits(s: GameState, f: Facility): number {
  return (FACILITIES[f.type].pkgUnits ?? 0) * tierMult(f) * techMult(s, 'pkgEff');
}

export function permitFactor(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  const region = REGIONS[site.region];
  const license = s.regions[site.region].license;
  return region.permit * (1.25 - 0.5 * (license / 100)) * techMult(s, 'permit') * modMult(s, `region:${site.region}:permit`);
}

export function buildDays(s: GameState, siteId: string, type: FacilityType): number {
  const def = FACILITIES[type];
  let days = def.buildMonths * DAYS_PER_MONTH;
  // equipment queues (turbines, reactors, fabs) don't care about permits as much as land use does
  const queued = type === 'gas' || type === 'smr' || type === 'fab' || type === 'packaging';
  days *= queued ? 0.5 + 0.5 * permitFactor(s, siteId) : permitFactor(s, siteId);
  if (type === 'datacenter' || type === 'campus') days *= techMult(s, 'dcBuild');
  if (NUCLEAR_TYPES.includes(type)) days *= techMult(s, 'nuclearBuild');
  days *= modMult(s, 'construction') * modMult(s, `construction:${type}`);
  return Math.max(30, Math.round(days));
}

export function gridLeadDays(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  const region = REGIONS[site.region];
  const queue = 1 + 0.15 * s.sites[siteId].grid.pending.length;
  return Math.max(45, Math.round(region.interconnectMonths * DAYS_PER_MONTH * queue * techMult(s, 'interconnect') * modMult(s, 'interconnect') * (1.2 - 0.4 * (s.regions[site.region].license / 100))));
}

/** Grid capacity rival campuses have taken at a site. */
export function rivalGridMW(s: GameState, siteId: string): number {
  let mw = 0;
  for (const b of s.rivalBuilds ?? []) if (b.siteId === siteId) mw += b.itMW * 0.35;
  return mw;
}

export function gridHeadroomLeft(s: GameState, siteId: string): number {
  const st = s.sites[siteId];
  const pending = st.grid.pending.reduce((a, p) => a + p.mw, 0);
  return Math.max(0, siteDef(siteId).gridHeadroom - st.grid.mw - pending - rivalGridMW(s, siteId));
}

export function gridPrice(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  return REGIONS[site.region].gridPrice * site.priceMult * modMult(s, `region:${site.region}:price`) * modMult(s, 'grid:price');
}

export function linkCost(km: number, s?: GameState): number {
  return km * LINK_COST_PER_KM * (s ? materialMult(s, 'link') * (hasTechFlag(s, 'hvdc') ? 1.3 : 1) : 1);
}

export function linkMaxKm(s: GameState): number {
  return LINK_MAX_KM * techMult(s, 'linkRange');
}

export function linkLossPct(s: GameState, km: number): number {
  return (km / 100) * LINK_LOSS_PER_100KM * techMult(s, 'linkLoss');
}

const hasTechFlag = (s: GameState, id: string) => s.research.done.includes(id);

export function linkDays(s: GameState, km: number, a: string, b: string): number {
  const pf = (permitFactor(s, a) + permitFactor(s, b)) / 2;
  return Math.round((10 + km / 150) * DAYS_PER_MONTH * pf);
}

// ── data centers / cooling ──────────────────────────────────────────────────────────────────
export function pueAt(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  let pue = BASE_PUE * techMult(s, 'pue');
  pue += Math.max(0, site.climateC - 20) * 0.012 * techMult(s, 'heatPenalty');
  pue -= Math.max(0, 10 - site.climateC) * 0.008;
  if (site.water < 0.3) pue += 0.08 * techMult(s, 'waterPenalty');
  return Math.max(1.05, pue);
}

/** Accelerators that fit in a hall of `itMW` (default: one 10 MW tier-1 data center). */
export function dcCapacityUnits(kw: number, itMW = FACILITIES.datacenter.itMW!): number {
  return Math.floor((itMW * 1000) / kw);
}

// ── chips ───────────────────────────────────────────────────────────────────────────────────
export function chipSpec(s: GameState, supplier: SupplierId) {
  const def = CHIP_SUPPLIERS[supplier];
  const y = yearsElapsed(s.day);
  let dealPrice = 1;
  for (const d of s.stack?.deals ?? []) if (d.kind === 'cofund' && d.partner === supplier && s.day >= d.readyDay) dealPrice = Math.min(dealPrice, d.partner === 'lumen' ? 0.95 : 0.92);
  return {
    price: def.price * Math.pow(0.97, y) * dealPrice * modMult(s, `supplier:${supplier}:price`) * (supplier === 'own' ? 1 : modMult(s, 'supplier:*:price')) * (s.meta?.sandbox?.chips ?? 1),
    perf: def.perf * Math.pow(1.3, y),
    kw: def.kw * Math.pow(1.05, y),
  };
}

/** Deal capacity (accelerators/month) of one kind that is live today, optionally for one partner. */
export function dealUnits(s: GameState, kind: string, partner?: string): number {
  let u = 0;
  for (const d of s.stack?.deals ?? []) {
    if (d.kind !== kind || (partner && d.partner !== partner)) continue;
    if (s.day < d.readyDay || (d.endDay > 0 && s.day > d.endDay)) continue;
    u += d.units;
  }
  return u;
}

/** Your own packaging capacity (plants online), accelerators/month. */
export function ownPackaging(s: GameState): number {
  let u = 0;
  for (const f of s.facilities) if (f.type === 'packaging' && f.status === 'online') u += facilityPkgUnits(s, f);
  return u;
}

/** Monthly output of your fab, before HBM and packaging. */
export function ownFabUnits(s: GameState): number {
  let u = 0;
  for (const f of s.facilities) if (f.type === 'fab' && f.status === 'online') u += (FACILITIES.fab.fabUnits ?? 0) * Math.pow(1.25, Math.max(0, yearsElapsed(s.day - (f.onlineDay ?? s.day))));
  return u * fabMaterialFactor(s);
}

/** Helium and neon price spikes slow fabs (yours and theirs). */
export function fabMaterialFactor(s: GameState): number {
  const m = s.market.materials;
  if (!m) return 1;
  const hit = (mat: 'helium' | 'neon', k: number) => Math.max(0, m[mat] - 1) * k * (1 - Math.min(0.8, stakeShare(s, mat) * 2.5));
  const minerals = s.politics?.rules.includes('counter-controls') ? 0.85 : 1;
  return clamp(1 - hit('helium', 0.25) - hit('neon', 0.3), 0.4, 1) * minerals;
}

/**
 * The three pools behind every accelerator: wafers (logic), HBM and packaging. Monthly figures
 * for one supplier, for you, today. The slowest pool sets the rate.
 */
export function supplierPools(s: GameState, supplier: SupplierId): { logic: number; hbm: number; pkg: number; rate: number } {
  const def = CHIP_SUPPLIERS[supplier];
  const growth = Math.pow(1.25, yearsElapsed(s.day));
  const act2 = (s.act ?? 1) >= 2;
  // ── logic: your allocation of wafer starts ──
  let logic: number;
  if (supplier === 'own') logic = ownFabUnits(s);
  else {
    // a Series-A hyperscaler gets a real allocation, not a garage's
    const size = act2 ? ACT2_ALLOCATION : 1;
    const base = def.monthly * size * growth * modMult(s, `supplier:${supplier}:rate`) * modMult(s, 'supplier:*:rate') * fabMaterialFactor(s);
    const rivals = act2 ? (s.rivalBuilds ?? []).filter((b) => b.status === 'building').length : 0;
    const competition = 1 / (1 + POOL_TUNING.competition * rivals);
    logic = base * competition + dealUnits(s, 'reserve', supplier) + dealUnits(s, 'cofund', supplier);
  }
  // ── HBM: shortages hit everyone, deals shield part of the volume ──
  const shortage = Math.max(0, 1 - s.market.hbm * modMult(s, 'market:hbm'));
  const hbmFactor = 1 - Math.min(0.9, def.hbmExposure * techMult(s, 'hbmExposure') * shortage * 1.6);
  const hbmCovered = act2 ? Math.min(logic, dealUnits(s, 'hbm')) : 0;
  const hbm = hbmCovered + (logic - hbmCovered) * hbmFactor;
  // ── packaging (Act II): Bondline's lines are shared; your plant and slots are not ──
  let pkg = logic;
  if (act2) {
    const pShort = Math.max(0, 1 - (s.market.pkg ?? 1) * modMult(s, 'market:pkg'));
    const pFactor = 1 - Math.min(0.85, pShort * POOL_TUNING.pkgSlope * (2 - techMult(s, 'pkgEff')));
    const own = ownPackaging(s) + dealUnits(s, 'packaging');
    const share = supplierShare(s, supplier);
    const covered = Math.min(logic, own * share);
    pkg = covered + (logic - covered) * pFactor;
  }
  const rate = Math.max(0, Math.min(logic, hbm, pkg));
  return { logic, hbm, pkg, rate };
}

/** How much bigger your base wafer allocation is once you're a hyperscaler (Act II). */
export const ACT2_ALLOCATION = 4;

/** Split your own packaging/HBM capacity across suppliers in proportion to what you have queued. */
function supplierShare(s: GameState, supplier: SupplierId): number {
  const q: Record<string, number> = {};
  let total = 0;
  for (const o of s.orders) {
    if (o.done) continue;
    const left = o.qty - o.produced;
    q[o.supplier] = (q[o.supplier] ?? 0) + left;
    total += left;
  }
  if (total <= 0) return 1;
  return (q[supplier] ?? 0) / total;
}

/** Accelerators per day a supplier can deliver to you right now. */
export function supplierDailyRate(s: GameState, supplier: SupplierId): number {
  return supplierPools(s, supplier).rate / DAYS_PER_MONTH;
}

export function rentalPrice(s: GameState): number {
  return RENTAL.pricePerMonth * Math.pow(0.9, yearsElapsed(s.day)) * modMult(s, 'rental:price');
}

export function rentalMax(s: GameState): number {
  return Math.round((RENTAL.max * Math.pow(1.5, yearsElapsed(s.day))) / RENTAL.step) * RENTAL.step;
}

// ── models / capability ─────────────────────────────────────────────────────────────────────
export function algoEff(s: GameState): number {
  return techMult(s, 'algoEff');
}

export function capabilityOf(flop: number, eff: number): number {
  return Math.max(0, Math.log10(flop * eff) - 23);
}

export function currentCapability(s: GameState): number {
  return s.models.reduce((m, x) => Math.max(m, x.capability), 0);
}

/** Standard post-training (RLHF-style) every lab gets for free. */
export const BASELINE_ALIGNMENT = 1.2;

export function alignmentOf(s: GameState): number {
  const offset = FOUNDERS[s.meta?.founder ?? 'classic']?.alignment ?? 0;
  if (s.safety.cumFlop <= 0) return BASELINE_ALIGNMENT + offset;
  return Math.max(BASELINE_ALIGNMENT, Math.log10(s.safety.cumFlop * techMult(s, 'safetyEff')) - 22) + offset;
}

/** What crises cost on this difficulty (event prices are written for Standard). */
export function crisisCost(s: GameState, amount: number): number {
  // Act II companies are ~10× bigger; Act I crisis prices scale with them
  const scale = (s.act ?? 1) >= 2 ? 2.5 * Math.pow(1.4, Math.max(0, yearsElapsed(s.day) - 2.2)) : 1;
  return amount * scale * crisisMult(s);
}

/** Crisis price for Act II events, which are already written at Act II scale (difficulty only). */
export function crisisCost2(s: GameState, amount: number): number {
  return amount * Math.pow(1.15, Math.max(0, yearsElapsed(s.day) - 2.2)) * crisisMult(s);
}

/** How hard crises hit: the difficulty, times the sandbox's supply-shock slider. */
export function crisisMult(s: GameState): number {
  return (DIFFICULTIES[s.meta?.difficulty ?? 'standard']?.crisis ?? 1) * (s.meta?.sandbox?.shocks ?? 1);
}

/** Monthly probability of a safety incident at a given margin. */
export function incidentChance(margin: number): number {
  return clamp(0.04 * Math.pow(10, -margin), 0.002, 0.6);
}

export function frontier(s: GameState): number {
  return s.market.rivals.filter((r) => !r.open).reduce((m, r) => Math.max(m, r.capability), 0);
}

export function openBest(s: GameState): number {
  return s.market.rivals.filter((r) => r.open).reduce((m, r) => Math.max(m, r.capability), 0);
}

export function inferQuality(s: GameState, c = currentCapability(s)): number {
  if (c <= 0) return 0;
  let q = clamp(1 + ((s.act ?? 1) >= 2 ? 0.28 : 0.35) * (c - frontier(s)), 0.12, 1.4);
  if (c < openBest(s)) q *= 0.75;
  return q;
}

/** Accelerator-equivalents of inference the market will buy from you at full price. */
export function inferDemand(s: GameState, c = currentCapability(s)): number {
  if (c <= 0) return 0;
  return 2000 * Math.pow(3, c - 1) * techMult(s, 'demand') * Math.pow(1.35, yearsElapsed(s.day));
}

// ── world ───────────────────────────────────────────────────────────────────────────────────
export function kardashev(totalWatts: number): number {
  return (Math.log10(totalWatts) - 6) / 10;
}

export function worldBaselineTW(day: number): number {
  return WORLD_TW_2027 * Math.pow(1 + WORLD_GROWTH, yearsElapsed(day));
}

export const K_MILESTONES = [
  { k: 0.75, label: 'First Milestone' },
  { k: 0.8, label: 'Grid-Scale Abundance' },
  { k: 0.9, label: 'Planetary Engineering' },
  { k: 1.0, label: 'Type I Civilisation' },
  { k: 2.0, label: 'Type II Civilisation (10²⁶ W — coming later)' },
];
