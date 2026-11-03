import type { RegionId } from './mapcodes';

/** Enterprise customers who offer multi-year compute contracts (Act II, phase 2+). */
export interface CustomerDef {
  id: string;
  name: string;
  sector: string;
  /** Regions they buy in. */
  regions: RegionId[];
  /** Typical size, accelerator-equivalents. */
  units: [number, number];
  months: [number, number];
  /** Price premium per accelerator-equivalent over the spot inference market. */
  premium: number;
}

export const CUSTOMERS: CustomerDef[] = [
  { id: 'helix', name: 'Helix Therapeutics', sector: 'Drug discovery', regions: ['atl', 'eur', 'pac'], units: [8000, 30000], months: [18, 36], premium: 1.5 },
  { id: 'northbank', name: 'Northbank Financial', sector: 'Banking', regions: ['atl', 'eur', 'fab'], units: [10000, 40000], months: [24, 36], premium: 1.4 },
  { id: 'tessera', name: 'Tessera Motors', sector: 'Autonomous driving', regions: ['pac', 'eam', 'eur'], units: [15000, 60000], months: [12, 30], premium: 1.3 },
  { id: 'meridian-gov', name: 'Civic Systems Agency', sector: 'Government', regions: ['atl', 'eur', 'sas', 'mena'], units: [10000, 50000], months: [24, 48], premium: 1.25 },
  { id: 'kaleido', name: 'Kaleido Studios', sector: 'Media', regions: ['pac', 'sas', 'seo'], units: [5000, 25000], months: [12, 24], premium: 1.35 },
  { id: 'orbitel', name: 'Orbitel Telecom', sector: 'Telecom', regions: ['lat', 'ssa', 'sas', 'seo'], units: [8000, 35000], months: [18, 36], premium: 1.3 },
  { id: 'gridmind', name: 'GridMind Utilities', sector: 'Energy', regions: ['nor', 'eur', 'atl', 'mena'], units: [6000, 20000], months: [24, 36], premium: 1.4 },
  { id: 'sakura', name: 'Sakura Robotics', sector: 'Robotics', regions: ['fab', 'eam', 'seo'], units: [10000, 45000], months: [18, 36], premium: 1.35 },
];

export const CUSTOMER_BY_ID: Record<string, CustomerDef> = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));

export const SERIES_B = { amount: 8e9, valuation: 60e9 };

/** The board: quarterly reviews after the Series B. */
export const BOARD = {
  reviewDays: 91,
  /** Revenue growth asked per quarter. */
  target: 0.15,
  start: 65,
};

/** Project finance: borrow against what you own. */
export const FINANCE = {
  /** Fraction of an asset's value you can borrow. */
  ltv: 0.7,
  /** Annual rate by bloc stance. */
  rate: { accelerate: 0.06, neutral: 0.07, cautious: 0.085 },
  years: 10,
};
