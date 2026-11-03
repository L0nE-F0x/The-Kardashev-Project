import type { DealKind } from '../sim/types';
import type { Materials } from '../sim/types';

/** Supply deals Mira can sign (Act II, phase 2+). Costs are 2029 prices. */
export interface DealDef {
  id: string;
  kind: DealKind;
  partner: string;
  partnerName: string;
  name: string;
  blurb: string;
  /** Accelerators per month covered. */
  units: number;
  /** Up-front cost ($). */
  cost: number;
  /** Days until the capacity starts. */
  leadDays: number;
  /** How long it lasts (days). 0 = permanent. */
  days: number;
  /** Price change on that supplier's chips while active (co-funded lines). */
  priceMult?: number;
  phase: number;
}

export const DEALS: DealDef[] = [
  {
    id: 'reserve-lumen', kind: 'reserve', partner: 'lumen', partnerName: 'Lumen Foundry', name: 'Lumen capacity reservation', phase: 2,
    blurb: 'Prepay for a guaranteed slice of Lumen’s wafer starts for a year. Rivals can’t bid it away.',
    units: 6000, cost: 650e6, leadDays: 30, days: 365,
  },
  {
    id: 'reserve-kestrel', kind: 'reserve', partner: 'kestrel', partnerName: 'Kestrel Semiconductor', name: 'Kestrel capacity reservation', phase: 2,
    blurb: 'Kestrel is hungry: a cheaper guaranteed allocation for a year.',
    units: 5000, cost: 380e6, leadDays: 30, days: 365,
  },
  {
    id: 'cofund-kestrel', kind: 'cofund', partner: 'kestrel', partnerName: 'Kestrel Semiconductor', name: 'Co-fund a Kestrel line', phase: 2,
    blurb: 'Pay for a new production line in Ohio. Eighteen months later it is yours to draw on, forever, at a discount.',
    units: 9000, cost: 1.8e9, leadDays: 540, days: 0, priceMult: 0.92,
  },
  {
    id: 'cofund-lumen', kind: 'cofund', partner: 'lumen', partnerName: 'Lumen Foundry', name: 'Co-fund a Lumen line', phase: 3,
    blurb: 'Lumen rarely takes partners. For three billion dollars it will make an exception.',
    units: 12000, cost: 3.2e9, leadDays: 600, days: 0, priceMult: 0.95,
  },
  {
    id: 'hbm-stackwell', kind: 'hbm', partner: 'stackwell', partnerName: 'Stackwell Memory', name: 'Stackwell HBM allocation', phase: 2,
    blurb: 'A two-year memory allocation: the chips it covers ignore HBM shortages.',
    units: 8000, cost: 420e6, leadDays: 45, days: 730,
  },
  {
    id: 'hbm-hanbit', kind: 'hbm', partner: 'hanbit', partnerName: 'Hanbit Memory', name: 'Hanbit HBM priority', phase: 2,
    blurb: 'Front of the line at the HBM leader. Pricier, bigger, two years.',
    units: 14000, cost: 900e6, leadDays: 45, days: 730,
  },
  {
    id: 'pkg-bondline', kind: 'packaging', partner: 'bondline', partnerName: 'Bondline Packaging', name: 'Bondline packaging slots', phase: 2,
    blurb: 'Reserved slots on Bondline’s advanced-packaging lines in Penang for two years.',
    units: 8000, cost: 380e6, leadDays: 60, days: 730,
  },
];

export const DEAL_BY_ID: Record<string, DealDef> = Object.fromEntries(DEALS.map((d) => [d.id, d]));

/** Mines and gas works you can take a stake in. Effects hedge your exposure to price swings. */
export interface MineDef {
  id: string;
  material: keyof Materials;
  company: string;
  /** Price of a 10% stake ($, 2029). */
  price: number;
  /** Most you can own. */
  max: number;
  /** $ per month per 10% at a price index of 1. */
  income: number;
}

export const MINES: MineDef[] = [
  { id: 'mine-atacama', material: 'lithium', company: 'saltflat', price: 350e6, max: 0.3, income: 3.5e6 },
  { id: 'mine-pilbara', material: 'lithium', company: 'saltflat', price: 280e6, max: 0.3, income: 2.8e6 },
  { id: 'mine-copperbelt', material: 'copper', company: 'deepvein', price: 450e6, max: 0.3, income: 4.5e6 },
  { id: 'mine-helium', material: 'helium', company: 'clearair', price: 200e6, max: 0.3, income: 1.8e6 },
  { id: 'mine-neon', material: 'neon', company: 'clearair', price: 120e6, max: 0.3, income: 1.1e6 },
];

export const MINE_BY_ID: Record<string, MineDef> = Object.fromEntries(MINES.map((m) => [m.id, m]));

export const MATERIALS: Record<keyof Materials, { name: string; icon: string; uses: string }> = {
  lithium: { name: 'Lithium', icon: '🔋', uses: 'Battery prices' },
  copper: { name: 'Copper', icon: '🟫', uses: 'Every build and every power line' },
  helium: { name: 'Helium', icon: '🎈', uses: 'Fab output (cooling and leak checks)' },
  neon: { name: 'Neon', icon: '✨', uses: 'Fab output (lithography lasers)' },
};

/** Packaging plants and HBM: global availability is shared with rivals. */
export const POOL_TUNING = {
  /** Packaging shortage → rate loss. */
  pkgSlope: 1.4,
  /** How much each rival campus under construction tightens the HBM/packaging markets. */
  rivalPressure: 0.035,
  /** Your logic allocation shrinks as rivals compete for wafers. */
  competition: 0.12,
};
