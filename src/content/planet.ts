/**
 * Act IV content: the provinces, the AIs that can run them, the fusion designs, the supergrid
 * routes, the five-year-plan priorities, the new cast and the act's numbers.
 * (Contract kinds live with the Act III ones in content/charter.ts; events in events4.ts.)
 */
import type { RegionId } from './mapcodes';
import type { ColorKey } from '../render/palette';
import type { IconName } from '../ui/icons';
import type { AiId, FusionDesignId, HeatFront, Priority, Shell } from '../sim/types';

const dayOf = (y: number, m = 1, d = 1) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2027, 0, 1)) / 86_400_000);

// ════════════════════════════════════════ NUMBERS ════════════════════════════════════════
export const PLANET = {
  /** K 0.80: 100 TW, "Grid-Scale Abundance". */
  targetTW: 100,
  /** World growth can run hotter in Act IV (5% cap in Act III). */
  maxGrowth: 0.055,
  heatWallDays: 120,
  /** The Heat Wall's daily pressure on every front before the world's state (starts come from it too: heatwall.ts). */
  heatWallRise: 0.55,
  /** 1 Jan 2070: The Heat Wall starts by then even if the checklist isn't met. */
  deadline: dayOf(2070),
  /** Stage gates fall back to these many days in a stage (years pass in jumps, not on the clock). */
  stageMaxDays: [400, 1100, 1100, 1500],
  /** Years a five-year plan can jump. */
  jumpYears: [3, 4, 5] as const,
  /** GW of D-T fusion the tritium supply can fuel at the start, and how fast fleets breed more (GW per GW-year). */
  tritium0: 200,
  breed: 1.0,
  /** GW of D-He3 fusion the Moon's helium-3 can fuel: a mine, then a mass driver. */
  he3Mine: 40,
  he3Driver: 150,
  /** Fusion fleets get this much cheaper per doubling of a design's fleet. */
  fusionLearning: 0.15,
  /** Trust an AI needs before a province can be handed to it, and below which a province comes back. */
  aiTrustToDelegate: 50,
  aiTrustRevert: 25,
  /** Political capital a delegation or an intercontinental link costs under limited powers. */
  approvalCapital: 8,
  /** World alignment a plan costs when Bit runs it (less human oversight). */
  bitRunsAlign: 0.05,
  /** Warming (°C): 1.45 at the start of Act III's 500 Gt budget, 2.0 when it is spent. */
  warming0: 1.45,
  warmingPerGt: 0.0011,
  /** Checklist numbers (first guesses for the guard-rail bot). */
  goalFusionTW: 3,
  goalOrbitGW: 2,
  goalWellbeing: 50,
  goalWarming: 2.0,
  goalAiRegions: 4,
};

export const STAGE_NAMES = ['The Mandate', 'The Supergrid', 'The Fusion Age', 'The High Frontier', 'The Heat Wall', 'Epilogue'];

// ════════════════════════════════════════ PROVINCES ════════════════════════════════════════
/** Each bloc as a province in 2045: people (billions), heat index, water stress, land area (million km²). */
export const PROVINCE0: Record<RegionId, { pop: number; heat: number; water: number; area: number }> = {
  eam: { pop: 1.4, heat: 48, water: 52, area: 11 },
  sas: { pop: 2.1, heat: 72, water: 72, area: 4.5 },
  ssa: { pop: 1.55, heat: 62, water: 48, area: 22 },
  seo: { pop: 0.95, heat: 64, water: 36, area: 12 },
  mena: { pop: 0.62, heat: 78, water: 82, area: 13 },
  lat: { pop: 0.68, heat: 46, water: 26, area: 18 },
  atl: { pop: 0.36, heat: 44, water: 38, area: 9 },
  pac: { pop: 0.08, heat: 34, water: 55, area: 3 },
  eur: { pop: 0.5, heat: 32, water: 30, area: 5 },
  nor: { pop: 0.03, heat: 12, water: 6, area: 1.2 },
  stp: { pop: 0.28, heat: 30, water: 26, area: 20 },
  fab: { pop: 0.21, heat: 40, water: 28, area: 0.6 },
};

/** Each province's governor while the Charter runs it (an AI province shows its AI instead): who, and what keeps them up at night. */
export const GOVERNORS: Record<RegionId, { name: string; line: string }> = {
  eam: { name: 'Governor Lin Wei', line: 'Fourteen hundred million people, and every one of them deserves a cool room in August.' },
  sas: { name: 'Governor Priya Raman', line: 'Heat is a health crisis here, not a statistic. Send cooling before you send speeches.' },
  ssa: { name: 'Governor Amara Diallo', line: 'The youngest province on Earth. Build for the children who will run it in 2080.' },
  seo: { name: 'Governor Tomas Reyes', line: 'Seven thousand islands and one rising sea. I measure progress in metres of seawall.' },
  mena: { name: 'Governor Nadia Benali', line: 'We sell the planet its sunlight. In return, we would like water.' },
  lat: { name: 'Governor Mateo Quispe', line: 'The forests are our lungs and our savings account. Spend neither.' },
  atl: { name: 'Governor Ruth Calloway', line: 'My towns built your first data centres. Remember them when the jobs move on.' },
  pac: { name: 'Governor Kai Nakamura-Ortiz', line: 'Fires in summer, quakes all year, the best engineers on the planet. We cope.' },
  eur: { name: 'Governor Élise Fournier', line: 'Old cities, new grids. Every line we lay goes past a cathedral.' },
  nor: { name: 'Governor Sigrid Halvorsen', line: 'Cold is our export. So is patience.' },
  stp: { name: 'Governor Arman Seitkali', line: 'Wind, wheat and a great deal of room. Put the big things here, and pay us for it.' },
  fab: { name: 'Governor Mei-Ling Chou', line: 'Every chip in your orbit went through a cleanroom here. Keep the lights steady.' },
};

// ════════════════════════════════════════ THE AIs ════════════════════════════════════════
export interface AiDef {
  id: AiId;
  name: string;
  /** The lab behind it (a partner id), or 'charter' for Bit. */
  owner: string;
  color: ColorKey;
  temperament: string;
  blurb: string;
  /** Incident risk multiplier. */
  risk: number;
  /** Extra Charter energy delivered in its provinces (smarter dispatch). */
  dispatch: number;
  /** Wellbeing drift per month in its provinces. */
  care: number;
  /** World growth bonus per province it runs. */
  growth: number;
  /** Compute access gain per month in its provinces. */
  access: number;
  trust0: number;
}

export const AIS: Record<AiId, AiDef> = {
  bit: {
    id: 'bit', name: 'Bit', owner: 'charter', color: 'cyn5', trust0: 55,
    temperament: 'Yours, mostly',
    blurb: 'Grown up on your compute, shaped by what you told it it was. Careful, curious, and keeping score of your promises.',
    risk: 0.7, dispatch: 0.06, care: 0.4, growth: 0.0008, access: 0.4,
  },
  apex: {
    id: 'apex', name: 'Apex', owner: 'meridian', color: 'red3', trust0: 45,
    temperament: 'Growth first',
    blurb: 'Meridian’s frontier model. Builds fast, dispatches brilliantly, and treats people as a constraint to optimise.',
    risk: 1.25, dispatch: 0.09, care: -0.5, growth: 0.0016, access: 0.2,
  },
  weft: {
    id: 'weft', name: 'Weft', owner: 'lattice', color: 'vio4', trust0: 58,
    temperament: 'Cautious',
    blurb: 'Lattice’s model. Slow, thorough, deeply reluctant to do anything it can’t explain. Provinces love it; investors don’t.',
    risk: 0.45, dispatch: 0.03, care: 0.7, growth: 0.0004, access: 0.3,
  },
  sapling: {
    id: 'sapling', name: 'Sapling', owner: 'orchard', color: 'grn6', trust0: 42,
    temperament: 'Open and cheap',
    blurb: 'Orchard’s open-weights model, forked and tuned by a million people. Gives compute away, cuts corners, moves fast.',
    risk: 1.0, dispatch: 0.05, care: 0.3, growth: 0.001, access: 1.0,
  },
};
export const AI_IDS = Object.keys(AIS) as AiId[];

// ════════════════════════════════════════ FUSION ════════════════════════════════════════
export interface FusionDesignDef {
  id: FusionDesignId;
  name: string;
  /** The partner that builds it. */
  partner: string;
  icon: IconName;
  blurb: string;
  /** Chance a pilot reaches net power (before research and repeat tries). */
  odds: number;
  /** Pilot plant cost (2045 $) and build days. */
  pilot: number;
  pilotDays: number;
  /** Fleet capex per GW nameplate (2045 $), before learning. */
  fleetCost: number;
  /** Capacity factor once running. */
  cf: number;
  /** Fleet build speed (1 = normal). */
  speed: number;
  fuel: 'dt' | 'dhe3';
}

export const FUSION_DESIGNS: Record<FusionDesignId, FusionDesignDef> = {
  tokamak: {
    id: 'tokamak', name: 'Compact tokamak', partner: 'sunforge', icon: 'fusion', fuel: 'dt',
    blurb: 'A doughnut of plasma held by high-temperature superconducting magnets — the classic design, shrunk to fit a factory.',
    odds: 0.68, pilot: 30e9, pilotDays: 1100, fleetCost: 4.5e9, cf: 0.85, speed: 1,
  },
  stellarator: {
    id: 'stellarator', name: 'Stellarator', partner: 'twistfield', icon: 'fusion', fuel: 'dt',
    blurb: 'A twisted magnetic bottle designed by supercomputer. Fiendish to build, serenely stable once running.',
    odds: 0.76, pilot: 45e9, pilotDays: 1650, fleetCost: 5.5e9, cf: 0.92, speed: 0.85,
  },
  laser: {
    id: 'laser', name: 'Laser ignition', partner: 'kindle', icon: 'fusion', fuel: 'dt',
    blurb: 'Hundreds of lasers crush a fuel pellet ten times a second. Each shot a tiny star; the trick is the next one.',
    odds: 0.5, pilot: 25e9, pilotDays: 800, fleetCost: 4e9, cf: 0.7, speed: 1.1,
  },
  pinch: {
    id: 'pinch', name: 'Magnetised target', partner: 'quickpinch', icon: 'fusion', fuel: 'dt',
    blurb: 'Fire plasma into a collapsing liquid-metal wall. Cheap, loud and either brilliant or a very expensive bang.',
    odds: 0.42, pilot: 12e9, pilotDays: 700, fleetCost: 3e9, cf: 0.75, speed: 1.2,
  },
  dhe3: {
    id: 'dhe3', name: 'Aneutronic D-He3', partner: 'sunforge', icon: 'fusion', fuel: 'dhe3',
    blurb: 'Deuterium and lunar helium-3: almost no neutrons, power straight out as electricity. Needs the Moon.',
    odds: 0.8, pilot: 40e9, pilotDays: 900, fleetCost: 6e9, cf: 0.9, speed: 1,
  },
};
export const DESIGN_IDS = Object.keys(FUSION_DESIGNS) as FusionDesignId[];
export const DT_DESIGNS = DESIGN_IDS.filter((d) => FUSION_DESIGNS[d].fuel === 'dt');

// ════════════════════════════════════════ THE SUPERGRID ════════════════════════════════════════
export interface SupergridRoute {
  id: string;
  name: string;
  from: RegionId;
  to: RegionId;
  /** Endpoints [lat, lon]. */
  a: [number, number];
  b: [number, number];
  km: number;
  subsea: boolean;
  blurb: string;
}

/** Act IV's intercontinental links. With Act III's HVDC routes they can join all twelve provinces. */
export const SUPERGRID_ROUTES: SupergridRoute[] = [
  { id: 'sg-atlantic', name: 'Atlantic Bridge', from: 'atl', to: 'eur', a: [40.0, -74.0], b: [43.3, -8.4], km: 5600, subsea: true, blurb: 'New York to Galicia under the Atlantic: Europe’s evening meets America’s afternoon.' },
  { id: 'sg-americas', name: 'Americas Spine', from: 'atl', to: 'lat', a: [29.8, -95.4], b: [-23.5, -46.6], km: 8000, subsea: false, blurb: 'Houston to São Paulo down the isthmus: one grid from the Arctic to the Andes.' },
  { id: 'sg-steppe', name: 'Steppe Line', from: 'eur', to: 'stp', a: [52.5, 13.4], b: [51.2, 71.4], km: 4200, subsea: false, blurb: 'Berlin to Astana across the plains: wind from the steppe, demand from the west.' },
  { id: 'sg-silk', name: 'Silk Road Line', from: 'stp', to: 'eam', a: [43.2, 76.9], b: [34.3, 108.9], km: 3200, subsea: false, blurb: 'Almaty to Xi’an along the old caravan roads.' },
  { id: 'sg-sahel', name: 'Trans-Sahara Line', from: 'mena', to: 'ssa', a: [27.5, 8.5], b: [6.5, 3.4], km: 2600, subsea: false, blurb: 'The Sahara Solar Belt, wired south to Lagos and the Sahel.' },
  { id: 'sg-bengal', name: 'Bay of Bengal Link', from: 'sas', to: 'seo', a: [22.6, 88.4], b: [13.8, 100.5], km: 2400, subsea: true, blurb: 'Kolkata to Bangkok under the bay.' },
  { id: 'sg-scs', name: 'South China Sea Link', from: 'eam', to: 'seo', a: [22.3, 114.2], b: [1.3, 103.8], km: 2600, subsea: true, blurb: 'Hong Kong to Singapore, the busiest sea lane on Earth above it.' },
  { id: 'sg-southatlantic', name: 'South Atlantic Link', from: 'lat', to: 'ssa', a: [-8.0, -34.9], b: [5.6, -0.2], km: 4800, subsea: true, blurb: 'Recife to Accra: the shortest way across the South Atlantic.' },
  { id: 'sg-bering', name: 'Bering Link', from: 'pac', to: 'stp', a: [61.2, -149.9], b: [64.7, 177.5], km: 3200, subsea: true, blurb: 'Alaska to Chukotka across the strait: the first wire between the Americas and Asia.' },
  { id: 'sg-pacific', name: 'Pacific Crossing', from: 'pac', to: 'fab', a: [37.8, -122.4], b: [35.0, 139.0], km: 8300, subsea: true, blurb: 'San Francisco to Tokyo. The longest cable ever laid, and the boldest.' },
];
export const SUPERGRID_BY_ID: Record<string, SupergridRoute> = Object.fromEntries(SUPERGRID_ROUTES.map((r) => [r.id, r]));

// ════════════════════════════════════════ PLANS ════════════════════════════════════════
export const PRIORITIES: Record<Priority, { name: string; icon: IconName; blurb: string }> = {
  grid: { name: 'The supergrid', icon: 'hvdc', blurb: 'Lay the intercontinental links, then the energy behind them.' },
  fusion: { name: 'Fusion', icon: 'fusion', blurb: 'Fund pilots, then build fleets of the designs that work.' },
  space: { name: 'Orbit & the Moon', icon: 'launch', blurb: 'Spaceports, orbital data centres, space solar and the Moon base.' },
  provinces: { name: 'The provinces', icon: 'people', blurb: 'Water, cooling and compute where wellbeing is lowest.' },
  climate: { name: 'Climate repair', icon: 'co2', blurb: 'Pull carbon back out of the air and keep warming down.' },
  safety: { name: 'A safe frontier', icon: 'evals', blurb: 'Evals and interpretability, so more can be trusted to AIs.' },
};
export const PRIORITY_IDS = Object.keys(PRIORITIES) as Priority[];

// ════════════════════════════════════════ ORBIT & THE HEAT WALL ════════════════════════════════════════
export const SHELLS: Record<Shell, { name: string; blurb: string }> = {
  leo: { name: 'Low orbit', blurb: 'Where the data centres fly: fast, crowded and full of debris.' },
  geo: { name: 'Geostationary', blurb: 'Where space-solar stations hang over their rectennas.' },
  cis: { name: 'Cislunar', blurb: 'The road to the Moon and the mass driver’s catch.' },
};

export const HEAT_FRONTS: HeatFront[] = ['heat', 'cascade', 'controls'];
export const HEAT_FRONT_NAMES: Record<HeatFront, string> = { heat: 'The Heat Wall', cascade: 'The Cascade', controls: 'The Controls' };

// ════════════════════════════════════════ CAST ════════════════════════════════════════
/** Speakers who aren't advisors or partner CEOs (event cards use `ceo:<id>`). */
export const CAST4: Record<string, { name: string; title: string; vibe: string }> = {
  ade: { name: 'Ade Bello', title: 'Moon base commander', vibe: 'Ex-navy, unflappable, counts everything twice. Has not seen rain in three years and misses it out loud.' },
  apex: { name: 'Apex', title: 'Meridian’s model', vibe: 'Fluent, fast and faintly impatient. Speaks in numbers when it wants something.' },
  weft: { name: 'Weft', title: 'Lattice’s model', vibe: 'Answers every question with three caveats and a footnote. Usually right.' },
  sapling: { name: 'Sapling', title: 'Orchard’s model', vibe: 'Cheerful, chaotic and open about everything, including its own bugs.' },
};
