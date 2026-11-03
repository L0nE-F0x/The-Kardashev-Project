/**
 * Shared formulas: costs, build times, chip specs, capability maths. Pure functions so the UI
 * can preview exactly what the simulation will do.
 */
import { CHIP_SUPPLIERS, RENTAL } from '../content/companies';
import { FACILITIES } from '../content/facilities';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import type { FacilityType, GameState, SupplierId } from './types';
import { clamp, yearsElapsed } from './core';
import { modMult, techMult } from './effects';

export const START_CASH = 400e6;
/** Model FLOP utilisation when training / serving. */
export const MFU = 0.4;
export const BASE_PUE = 1.3;
export const INFER_REV_PER_ACCEL_MONTH = 3_500;
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

/** Model generations the player trains in Act I (FLOP targets). */
export const MODEL_PLAN = [
  { name: 'Bit-1', flop: 1e24 },
  { name: 'Bit-2', flop: 2e26 },
  { name: 'Bit-3', flop: 2e27 },
  { name: 'Bit-4', flop: 1.5e28 },
  { name: 'Bit-5', flop: 1e29 },
];

export const CAPABILITY_TIERS = ['—', 'Chatbot', 'Assistant', 'Agent', 'Researcher', 'Scientist', 'Polymath', 'Superintelligence'];

export function tierOf(c: number): number {
  return clamp(Math.floor(c), 0, CAPABILITY_TIERS.length - 1);
}

// ── facilities ──────────────────────────────────────────────────────────────────────────────
export function buildCost(s: GameState, type: FacilityType): number {
  const def = FACILITIES[type];
  const built = s.built[type] ?? 0;
  const learning = Math.pow(1 - def.learn, Math.log2(1 + built));
  const drift = Math.pow(def.yearly, yearsElapsed(s.day));
  let cost = def.capex * learning * drift;
  if (type === 'battery') cost *= techMult(s, 'batteryCost');
  return cost * modMult(s, `cost:${type}`);
}

export function permitFactor(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  const region = REGIONS[site.region];
  const license = s.regions[site.region].license;
  return region.permit * (1.25 - 0.5 * (license / 100)) * techMult(s, 'permit');
}

export function buildDays(s: GameState, siteId: string, type: FacilityType): number {
  const def = FACILITIES[type];
  let days = def.buildMonths * DAYS_PER_MONTH;
  // generation equipment queues don't care about permits as much as land use does
  days *= type === 'gas' ? 0.5 + 0.5 * permitFactor(s, siteId) : permitFactor(s, siteId);
  if (type === 'datacenter') days *= techMult(s, 'dcBuild');
  days *= modMult(s, 'construction') * modMult(s, `construction:${type}`);
  return Math.max(30, Math.round(days));
}

export function gridLeadDays(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  const region = REGIONS[site.region];
  const queue = 1 + 0.15 * s.sites[siteId].grid.pending.length;
  return Math.max(45, Math.round(region.interconnectMonths * DAYS_PER_MONTH * queue * techMult(s, 'interconnect') * modMult(s, 'interconnect') * (1.2 - 0.4 * (s.regions[site.region].license / 100))));
}

export function gridHeadroomLeft(s: GameState, siteId: string): number {
  const st = s.sites[siteId];
  const pending = st.grid.pending.reduce((a, p) => a + p.mw, 0);
  return Math.max(0, siteDef(siteId).gridHeadroom - st.grid.mw - pending);
}

export function gridPrice(s: GameState, siteId: string): number {
  const site = siteDef(siteId);
  return REGIONS[site.region].gridPrice * site.priceMult * modMult(s, `region:${site.region}:price`);
}

export function linkCost(km: number): number {
  return km * LINK_COST_PER_KM;
}

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

export function dcCapacityUnits(kw: number): number {
  return Math.floor((FACILITIES.datacenter.itMW! * 1000) / kw);
}

// ── chips ───────────────────────────────────────────────────────────────────────────────────
export function chipSpec(s: GameState, supplier: SupplierId) {
  const def = CHIP_SUPPLIERS[supplier];
  const y = yearsElapsed(s.day);
  return {
    price: def.price * Math.pow(0.97, y) * modMult(s, `supplier:${supplier}:price`) * modMult(s, 'supplier:*:price'),
    perf: def.perf * Math.pow(1.3, y),
    kw: def.kw * Math.pow(1.05, y),
  };
}

/** Accelerators per day a supplier can deliver to you right now. */
export function supplierDailyRate(s: GameState, supplier: SupplierId): number {
  const def = CHIP_SUPPLIERS[supplier];
  const shortage = Math.max(0, 1 - s.market.hbm);
  const hbmFactor = 1 - Math.min(0.9, def.hbmExposure * techMult(s, 'hbmExposure') * shortage * 1.6);
  const growth = Math.pow(1.25, yearsElapsed(s.day));
  return (def.monthly / DAYS_PER_MONTH) * hbmFactor * growth * modMult(s, `supplier:${supplier}:rate`) * modMult(s, 'supplier:*:rate');
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
  if (s.safety.cumFlop <= 0) return BASELINE_ALIGNMENT;
  return Math.max(BASELINE_ALIGNMENT, Math.log10(s.safety.cumFlop * techMult(s, 'safetyEff')) - 22);
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
  let q = clamp(1 + 0.35 * (c - frontier(s)), 0.12, 1.4);
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
];
