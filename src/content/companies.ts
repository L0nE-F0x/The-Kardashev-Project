import type { SupplierId } from '../sim/types';

export interface ChipSupplierDef {
  id: SupplierId;
  name: string;
  short: string;
  blurb: string;
  /** $ per accelerator. */
  price: number;
  /** PFLOP/s per accelerator. */
  perf: number;
  /** kW per accelerator. */
  kw: number;
  /** Accelerators per month available to customers your size. */
  monthly: number;
  /** How hard HBM shortages hit this supplier (0..1). */
  hbmExposure: number;
  sites: string[];
}

export const CHIP_SUPPLIERS: Record<SupplierId, ChipSupplierDef> = {
  lumen: {
    id: 'lumen', name: 'Lumen Foundry', short: 'Lumen',
    blurb: 'Leading-edge accelerators from the biggest lines: the fastest chips, and the most of them each month.',
    price: 30_000, perf: 3.0, kw: 1.2, monthly: 2600, hbmExposure: 1.0, sites: ['lumen-hsinchu', 'lumen-phoenix'],
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel Semiconductor', short: 'Kestrel',
    blurb: 'A node behind and hungrier for customers: about 20% cheaper, a bit less efficient, and it makes fewer chips a month.',
    price: 24_000, perf: 2.5, kw: 1.25, monthly: 1700, hbmExposure: 0.8, sites: ['kestrel-ohio', 'kestrel-magdeburg'],
  },
  own: {
    id: 'own', name: 'Your Fab (Kestrel JV)', short: 'Own fab',
    blurb: 'Your joint-venture fab. Chips at cost, no queue but your own — HBM and packaging still apply.',
    price: 9_000, perf: 2.8, kw: 1.2, monthly: 0, hbmExposure: 0.9, sites: [],
  },
};

/** Suppliers you can order from (the JV fab only once it is online). */
export const MARKET_SUPPLIERS: SupplierId[] = ['lumen', 'kestrel'];

/** Companies that appear on the map and in events (Acts I–II: suppliers; Act III: partners). */
export const COMPANIES = {
  lumen: { name: 'Lumen Foundry', sector: 'Logic fabs', quirk: 'Reliable, expensive, always booked solid.' },
  kestrel: { name: 'Kestrel Semiconductor', sector: 'Logic fabs', quirk: 'Scrappy challenger that will cut you a deal.' },
  stackwell: { name: 'Stackwell Memory', sector: 'HBM', quirk: 'Steady but cautious about expanding.' },
  hanbit: { name: 'Hanbit Memory', sector: 'HBM', quirk: 'Market leader; its yields set everyone’s lead times.' },
  veldt: { name: 'Veldt Optics', sector: 'Lithography', quirk: 'Sole maker of EUV tools — the ultimate chokepoint.' },
  bondline: { name: 'Bondline Packaging', sector: 'Advanced packaging', quirk: 'Quietly the tightest bottleneck of all.' },
  cumulus: { name: 'Cumulus Cloud', sector: 'Cloud', quirk: 'Rents you compute by the hour, at a price.' },
  tidewater: { name: 'Tidewater Freight', sector: 'Shipping', quirk: 'Moves everything, everywhere, eventually.' },
  halcyon: { name: 'Halcyon Power', sector: 'Utilities', quirk: 'Builds power plants for anyone who pays.' },
  meridian: { name: 'Meridian Intelligence', sector: 'AI lab', quirk: 'The frontier lab. Ships fast, talks safety.' },
  lattice: { name: 'Lattice Labs', sector: 'AI lab', quirk: 'Research-heavy rival with deep pockets.' },
  orchard: { name: 'Open Orchard', sector: 'AI lab', quirk: 'Gives its models away and undercuts everyone.' },
  littlesun: { name: 'Little Sun Reactors', sector: 'Small modular reactors', quirk: 'Factory-built reactors with a waiting list longer than a reactor licence.' },
  saltflat: { name: 'Saltflat Lithium', sector: 'Mining', quirk: 'Turns brine and sunshine into battery metal.' },
  deepvein: { name: 'Deepvein Minerals', sector: 'Mining', quirk: 'Copper and cobalt, dug deep and sold dear.' },
  clearair: { name: 'Clearair Gases', sector: 'Industrial gases', quirk: 'Neon, argon, helium — the invisible inputs every fab needs.' },
} as const;

/** CEOs who show up in deals and rival events (portraits are procedural). */
export const CEOS: Record<string, { name: string; company: string; vibe: string }> = {
  meridian: { name: 'Dana Voss', company: 'Meridian Intelligence', vibe: 'Charismatic, competitive, always one launch ahead.' },
  lattice: { name: 'Prof. Anand Iyer', company: 'Lattice Labs', vibe: 'Soft-spoken scientist with a very large budget.' },
  orchard: { name: 'Tove Brandt', company: 'Open Orchard', vibe: 'Open-source evangelist; thinks closed models are a phase.' },
  kestrel: { name: 'Marco Bellini', company: 'Kestrel Semiconductor', vibe: 'Hungry challenger who will cut you a deal.' },
  littlesun: { name: 'Ada Nwosu', company: 'Little Sun Reactors', vibe: 'Nuclear engineer turned salesperson; deeply patient.' },
  veldt: { name: 'Hendrik Maas', company: 'Veldt Optics', vibe: 'Owns the only EUV factory on Earth and knows it.' },
  board: { name: 'Eleanor Grant', company: 'Your board', vibe: 'Chair of your board. Polite, precise, keeps score.' },
};

/** Cloud rental from Cumulus. */
export const RENTAL = {
  pricePerMonth: 1_750,
  perf: 3.0,
  step: 500,
  max: 4_000,
};

export const RIVALS_START = [
  { id: 'meridian', name: 'Meridian Intelligence', capability: 4.1, open: false, cadence: 200 },
  { id: 'lattice', name: 'Lattice Labs', capability: 3.9, open: false, cadence: 240 },
  { id: 'orchard', name: 'Open Orchard', capability: 3.3, open: true, cadence: 210 },
] as const;
