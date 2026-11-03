import type { FacilityType } from '../sim/types';

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
  /** Typical power draw for a lab or HQ (MW). */
  loadMW?: number;
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
    capex: 45e6, buildMonths: 9, opex: 80_000, mw: 50, learn: 0.1, yearly: 0.93,
  },
  wind: {
    type: 'wind', name: 'Wind Farm', icon: '🌬', buildable: true,
    blurb: '50 MW of turbines. Blows day and night where the site is windy.',
    capex: 70e6, buildMonths: 12, opex: 150_000, mw: 50, learn: 0.06, yearly: 0.97,
  },
  gas: {
    type: 'gas', name: 'Gas Plant', icon: '🔥', buildable: true,
    blurb: '60 MW of firm power on demand. Turbines are back-ordered for years; burns fuel and emits CO₂.',
    capex: 60e6, buildMonths: 26, opex: 250_000, mw: 60, learn: 0, yearly: 1.04,
    leadNote: 'Turbine backlog',
  },
  battery: {
    type: 'battery', name: 'Battery Storage', icon: '🔋', buildable: true,
    blurb: '25 MW / 100 MWh. Stores midday solar for the night and smooths the wind.',
    capex: 32e6, buildMonths: 6, opex: 50_000, mw: 25, mwh: 100, learn: 0.1, yearly: 0.9,
  },
  datacenter: {
    type: 'datacenter', name: 'Data Center', icon: '🖥', buildable: true,
    blurb: '10 MW of IT capacity — room for ~8,300 accelerators. Needs power, cooling and chips.',
    capex: 90e6, buildMonths: 15, opex: 600_000, itMW: 10, learn: 0.05, yearly: 0.98,
  },
  lab: {
    type: 'lab', name: 'Research Lab', icon: '🧪', buildable: true,
    blurb: 'Fifty researchers and their whiteboards. Research output scales with local talent.',
    capex: 30e6, buildMonths: 6, opex: 3_500_000, rp: 1.6, learn: 0, yearly: 1.0, loadMW: 1,
  },
};

export const BUILDABLE: FacilityType[] = ['datacenter', 'solar', 'wind', 'battery', 'gas', 'lab'];
