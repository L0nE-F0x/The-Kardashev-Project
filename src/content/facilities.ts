import type { FacilityType } from '../sim/types';

/** An expansion step. Sizes multiply the facility's base capacity (and its opex). */
export interface TierDef {
  /** Capacity multiplier versus tier 1. */
  mult: number;
  /** Extra capex for this step, 2027 prices before learning-curve discounts. */
  capex: number;
  months: number;
  /** Research needed before this tier can be built. */
  tech?: string;
  /** Act II phase needed (1 Gigawatts · 2 The Stack · 3 The Race). */
  phase?: number;
  /** Short label, e.g. "50 MW hall". */
  label: string;
}

export type SiteNeed = 'hydro' | 'geo' | 'reactor' | 'water';

export interface FacilityDef {
  type: FacilityType;
  name: string;
  icon: string;
  blurb: string;
  buildable: boolean;
  /** Capex in $ at the 2027 start, before learning-curve discounts. */
  capex: number;
  buildMonths: number;
  /** Fixed operating cost per month ($). Staff costs for labs. */
  opex: number;
  /** Nameplate MW (generation / battery power). */
  mw?: number;
  /** Battery energy (MWh). */
  mwh?: number;
  /** Data center critical IT capacity (MW). */
  itMW?: number;
  /** Research points per day (before site talent). */
  rp?: number;
  /** Learning rate per doubling of your own builds (Wright's law). */
  learn: number;
  /** Price drift per year from the global market (0.93 = −7%/yr). */
  yearly: number;
  /** Long-lead equipment note for the UI. */
  leadNote?: string;
  /** Typical power draw for a lab, HQ, fab or plant (MW). */
  loadMW?: number;
  // ── Act II ──
  /** Firm generation: average output as a fraction of nameplate. */
  cf?: number;
  /** Emits no CO₂ when generating. */
  clean?: boolean;
  /** Plots it takes (default 1). */
  slots?: number;
  /** Available from this act (default 1). */
  act?: number;
  /** Act II phase needed. */
  phase?: number;
  /** Research needed first. */
  tech?: string;
  /** What the site must have. */
  needs?: SiteNeed;
  /** Accelerators per month of packaging capacity (packaging plant). */
  pkgUnits?: number;
  /** Accelerators per month (fab). */
  fabUnits?: number;
  /** Tier 2 and 3 (index 0 = tier 2). */
  tiers?: TierDef[];
}

export const FACILITIES: Record<FacilityType, FacilityDef> = {
  hq: {
    type: 'hq', name: 'Garage HQ', icon: '🏠', buildable: false,
    blurb: 'Where it all started: three desks, one rack and a lot of whiteboard.',
    capex: 0, buildMonths: 0, opex: 600_000, rp: 0.9, learn: 0, yearly: 1, loadMW: 0.2,
  },
  solar: {
    type: 'solar', name: 'Solar Farm', icon: '☀', buildable: true,
    blurb: '50 MW of panels. Cheap and quick to build, but only shines by day — pair with batteries.',
    capex: 45e6, buildMonths: 9, opex: 80_000, mw: 50, learn: 0.1, yearly: 0.93, clean: true,
    tiers: [
      { mult: 5, capex: 180e6, months: 9, label: '250 MW', phase: 1 },
      { mult: 20, capex: 600e6, months: 14, label: '1 GW', phase: 3 },
    ],
  },
  wind: {
    type: 'wind', name: 'Wind Farm', icon: '🌬', buildable: true,
    blurb: '50 MW of turbines. Blows day and night where the site is windy.',
    capex: 70e6, buildMonths: 12, opex: 150_000, mw: 50, learn: 0.06, yearly: 0.97, clean: true,
    tiers: [
      { mult: 4, capex: 210e6, months: 12, label: '200 MW', phase: 1 },
      { mult: 12, capex: 520e6, months: 18, label: '600 MW', phase: 3 },
    ],
  },
  gas: {
    type: 'gas', name: 'Gas Plant', icon: '🔥', buildable: true,
    blurb: '60 MW of firm power on demand. Turbines are back-ordered for years; burns fuel and emits CO₂.',
    capex: 60e6, buildMonths: 26, opex: 250_000, mw: 60, learn: 0, yearly: 1.04,
    leadNote: 'Turbine backlog',
    tiers: [
      { mult: 5, capex: 260e6, months: 30, label: '300 MW CCGT', phase: 1 },
      { mult: 10, capex: 330e6, months: 36, label: '600 MW', phase: 3 },
    ],
  },
  battery: {
    type: 'battery', name: 'Battery Storage', icon: '🔋', buildable: true,
    blurb: '25 MW / 100 MWh. Stores midday solar for the night and smooths the wind.',
    capex: 32e6, buildMonths: 6, opex: 50_000, mw: 25, mwh: 100, learn: 0.1, yearly: 0.9,
    tiers: [
      { mult: 4, capex: 100e6, months: 6, label: '400 MWh', phase: 1 },
      { mult: 16, capex: 330e6, months: 9, label: '1.6 GWh', phase: 3 },
    ],
  },
  datacenter: {
    type: 'datacenter', name: 'Data Center', icon: '🖥', buildable: true,
    blurb: '10 MW of IT capacity — room for ~8,300 accelerators. Needs power, cooling and chips.',
    capex: 90e6, buildMonths: 10, opex: 600_000, itMW: 10, learn: 0.05, yearly: 0.98,
    tiers: [
      { mult: 5, capex: 350e6, months: 12, label: '50 MW hall', phase: 1 },
      { mult: 20, capex: 1.2e9, months: 18, label: '200 MW hall', phase: 3, tech: 'liquid-cooling' },
    ],
  },
  lab: {
    type: 'lab', name: 'Research Lab', icon: '🧪', buildable: true,
    blurb: 'Fifty researchers and their whiteboards. Research output scales with local talent.',
    capex: 30e6, buildMonths: 6, opex: 3_500_000, rp: 1.6, learn: 0, yearly: 1.0, loadMW: 1,
    tiers: [
      { mult: 4, capex: 80e6, months: 8, label: '200 researchers', phase: 1 },
      { mult: 10, capex: 200e6, months: 12, label: '500 researchers', phase: 3 },
    ],
  },
  // ── Act II ────────────────────────────────────────────────────────────────────────────────
  hydro: {
    type: 'hydro', name: 'Hydro Plant', icon: '💧', buildable: true, act: 2, needs: 'hydro',
    blurb: '150 MW of new turbines on a river or an existing dam. Firm, clean and cheap to run — until a drought.',
    capex: 400e6, buildMonths: 36, opex: 300_000, mw: 150, cf: 0.5, clean: true, learn: 0.03, yearly: 1.0,
    leadNote: 'River sites only',
    tiers: [{ mult: 2, capex: 350e6, months: 30, label: '300 MW', phase: 2 }],
  },
  geothermal: {
    type: 'geothermal', name: 'Geothermal Plant', icon: '♨', buildable: true, act: 2, needs: 'geo',
    blurb: '50 MW of steam from hot rock. Runs around the clock with no fuel and no emissions.',
    capex: 250e6, buildMonths: 30, opex: 400_000, mw: 50, cf: 0.9, clean: true, learn: 0.08, yearly: 0.98,
    leadNote: 'Volcanic or hot-rock sites',
    tiers: [
      { mult: 2, capex: 200e6, months: 24, label: '100 MW', phase: 1 },
      { mult: 4, capex: 380e6, months: 30, label: '200 MW', phase: 3 },
    ],
  },
  restart: {
    type: 'restart', name: 'Reactor Restart', icon: '⚛', buildable: true, act: 2, needs: 'reactor',
    blurb: 'Bring a retired reactor back to life: new fuel, new staff, old concrete. Firm, clean power in about two years.',
    capex: 1.6e9, buildMonths: 24, opex: 12e6, mw: 800, cf: 0.92, clean: true, learn: 0, yearly: 1.0,
    leadNote: 'Needs government relations ≥ 50',
  },
  smr: {
    type: 'smr', name: 'SMR Pack', icon: '⚛', buildable: true, act: 2, phase: 2, needs: 'water',
    blurb: 'Four factory-built small reactors from Little Sun (300 MW). The order queue is years long.',
    capex: 2.4e9, buildMonths: 54, opex: 5e6, mw: 300, cf: 0.93, clean: true, learn: 0.12, yearly: 0.97,
    leadNote: 'Little Sun queue: 4–5 years',
    tiers: [{ mult: 2, capex: 2.0e9, months: 48, label: '600 MW', phase: 3 }],
  },
  reactor: {
    type: 'reactor', name: 'Nuclear Plant', icon: '⚛', buildable: true, act: 2, phase: 3, needs: 'water', slots: 2,
    blurb: 'A 1.1 GW reactor. A decade of concrete, steel and paperwork — then sixty years of clean, firm power.',
    capex: 10e9, buildMonths: 108, opex: 15e6, mw: 1100, cf: 0.92, clean: true, learn: 0.05, yearly: 1.0,
    leadNote: '8–10 years to build',
  },
  packaging: {
    type: 'packaging', name: 'Packaging Plant', icon: '🧩', buildable: true, act: 2, phase: 2,
    blurb: 'Advanced packaging lines that bond logic dies to HBM stacks: 6,000 accelerators a month, all yours.',
    capex: 1.5e9, buildMonths: 24, opex: 6e6, pkgUnits: 6000, loadMW: 20, learn: 0.05, yearly: 0.98,
    tiers: [
      { mult: 2, capex: 1.1e9, months: 18, label: '12k / month', phase: 2 },
      { mult: 4, capex: 2e9, months: 24, label: '24k / month', phase: 3 },
    ],
  },
  fab: {
    type: 'fab', name: 'Fab (Kestrel JV)', icon: '🏭', buildable: true, act: 2, phase: 2, needs: 'water', slots: 2,
    blurb: 'A joint-venture logic fab with Kestrel. Four years, ultrapure water, firm power and Veldt’s EUV tools — then chips at cost.',
    capex: 8e9, buildMonths: 48, opex: 40e6, fabUnits: 8000, loadMW: 200, learn: 0, yearly: 1.0,
    leadNote: 'Needs Veldt EUV tools',
  },
  campus: {
    type: 'campus', name: 'Gigawatt Campus', icon: '🏙', buildable: true, act: 2, phase: 3, tech: 'gw-campus', slots: 4,
    blurb: 'A city of data halls: 1 GW of IT capacity, its own substations and a skyline of cooling towers.',
    capex: 7e9, buildMonths: 30, opex: 50e6, itMW: 1000, learn: 0.05, yearly: 0.98,
  },
};

export const BUILDABLE: FacilityType[] = ['datacenter', 'solar', 'wind', 'battery', 'gas', 'lab', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus'];

/** Generation facilities (have a nameplate MW). */
export const GENERATORS: FacilityType[] = ['solar', 'wind', 'gas', 'hydro', 'geothermal', 'restart', 'smr', 'reactor'];
/** Firm, always-available generation (runs before gas). */
export const FIRM: FacilityType[] = ['hydro', 'geothermal', 'restart', 'smr', 'reactor'];
export const NUCLEAR: FacilityType[] = ['restart', 'smr', 'reactor'];
/** Facilities that hold accelerators. */
export const HALLS: FacilityType[] = ['datacenter', 'campus'];
