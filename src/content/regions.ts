import type { RegionId } from './mapcodes';

export type Stance = 'accelerate' | 'neutral' | 'cautious';

export interface RegionDef {
  id: RegionId;
  name: string;
  short: string;
  blurb: string;
  /** Map label anchor. */
  label: { lat: number; lon: number };
  stance: Stance;
  /** Construction time multiplier from permitting (1 = normal). */
  permit: number;
  /** Grid electricity price, $/MWh. */
  gridPrice: number;
  /** Grid carbon intensity, t CO₂ / MWh. */
  gridCarbon: number;
  /** Typical months to get a new grid connection. */
  interconnectMonths: number;
  /** Starting social license (0..100). */
  license0: number;
  /** How strongly carbon emissions dent opinion here. */
  green: number;
  /** Inference demand weight (users nearby, cable landings). */
  demand: number;
  hazards: { quake: number; storm: number; heat: number; drought: number };
}

export const REGIONS: Record<RegionId, RegionDef> = {
  pac: {
    id: 'pac', name: 'Pacific Coast', short: 'PAC',
    blurb: 'Talent capital of the AI boom. Hydro in the north, sun in the south, faults everywhere.',
    label: { lat: 53, lon: -125 }, stance: 'neutral', permit: 1.15, gridPrice: 95, gridCarbon: 0.2,
    interconnectMonths: 20, license0: 55, green: 1.3, demand: 1.1, hazards: { quake: 0.7, storm: 0.1, heat: 0.4, drought: 0.6 },
  },
  atl: {
    id: 'atl', name: 'Atlantic & Heartland', short: 'ATL',
    blurb: 'Data center alley, shale gas and prairie wind — with a grid queue years long.',
    label: { lat: 46, lon: -88 }, stance: 'accelerate', permit: 0.9, gridPrice: 72, gridCarbon: 0.38,
    interconnectMonths: 26, license0: 60, green: 0.6, demand: 1.25, hazards: { quake: 0.05, storm: 0.45, heat: 0.4, drought: 0.3 },
  },
  lat: {
    id: 'lat', name: 'Latin America', short: 'LAT',
    blurb: 'The lithium triangle, giant hydro dams and the sunniest desert on Earth.',
    label: { lat: -12, lon: -58 }, stance: 'neutral', permit: 1.0, gridPrice: 78, gridCarbon: 0.18,
    interconnectMonths: 14, license0: 62, green: 0.8, demand: 0.75, hazards: { quake: 0.5, storm: 0.3, heat: 0.4, drought: 0.4 },
  },
  eur: {
    id: 'eur', name: 'Europe', short: 'EUR',
    blurb: 'Home of the only EUV toolmaker. Strict rules, pricey power, nuclear and North Sea wind.',
    label: { lat: 49, lon: 13 }, stance: 'cautious', permit: 1.35, gridPrice: 118, gridCarbon: 0.22,
    interconnectMonths: 28, license0: 50, green: 1.6, demand: 1.0, hazards: { quake: 0.05, storm: 0.2, heat: 0.35, drought: 0.3 },
  },
  nor: {
    id: 'nor', name: 'Nordics & Arctic', short: 'NOR',
    blurb: 'Cheap clean hydro and geothermal, free cooling, and very few neighbours.',
    label: { lat: 65, lon: 18 }, stance: 'neutral', permit: 1.05, gridPrice: 42, gridCarbon: 0.03,
    interconnectMonths: 12, license0: 64, green: 1.5, demand: 0.6, hazards: { quake: 0.1, storm: 0.25, heat: 0.0, drought: 0.1 },
  },
  stp: {
    id: 'stp', name: 'Eurasian Steppe', short: 'STP',
    blurb: 'Endless wind, uranium, Siberian hydro — and long supply lines.',
    label: { lat: 56, lon: 78 }, stance: 'accelerate', permit: 0.85, gridPrice: 48, gridCarbon: 0.55,
    interconnectMonths: 10, license0: 60, green: 0.3, demand: 0.45, hazards: { quake: 0.15, storm: 0.15, heat: 0.2, drought: 0.3 },
  },
  mena: {
    id: 'mena', name: 'Gulf & Sahara', short: 'MENA',
    blurb: 'Sovereign capital, limitless sun, brutal heat, and water from the sea.',
    label: { lat: 25, lon: 22 }, stance: 'accelerate', permit: 0.75, gridPrice: 55, gridCarbon: 0.55,
    interconnectMonths: 8, license0: 70, green: 0.3, demand: 0.6, hazards: { quake: 0.15, storm: 0.15, heat: 0.95, drought: 0.8 },
  },
  ssa: {
    id: 'ssa', name: 'Sub-Saharan Africa', short: 'SSA',
    blurb: 'Copper and cobalt, geothermal rift valleys and the youngest workforce on the planet.',
    label: { lat: -3, lon: 23 }, stance: 'neutral', permit: 1.0, gridPrice: 88, gridCarbon: 0.45,
    interconnectMonths: 18, license0: 66, green: 0.5, demand: 0.5, hazards: { quake: 0.15, storm: 0.2, heat: 0.5, drought: 0.5 },
  },
  sas: {
    id: 'sas', name: 'South Asia', short: 'SAS',
    blurb: 'A billion users, deep talent, monsoons and heat.',
    label: { lat: 22, lon: 78 }, stance: 'accelerate', permit: 0.95, gridPrice: 80, gridCarbon: 0.7,
    interconnectMonths: 16, license0: 64, green: 0.7, demand: 1.0, hazards: { quake: 0.25, storm: 0.45, heat: 0.9, drought: 0.5 },
  },
  eam: {
    id: 'eam', name: 'Mainland East Asia', short: 'EAM',
    blurb: 'Manufacturing scale, rare-earth processing and cheap power — behind export controls.',
    label: { lat: 33, lon: 105 }, stance: 'accelerate', permit: 0.7, gridPrice: 62, gridCarbon: 0.55,
    interconnectMonths: 8, license0: 70, green: 0.5, demand: 1.0, hazards: { quake: 0.3, storm: 0.35, heat: 0.35, drought: 0.3 },
  },
  fab: {
    id: 'fab', name: 'Pacific Fab Belt', short: 'FAB',
    blurb: 'Where the leading-edge chips and memory are made. Typhoons, quakes and geopolitics.',
    label: { lat: 39, lon: 137 }, stance: 'neutral', permit: 1.1, gridPrice: 110, gridCarbon: 0.45,
    interconnectMonths: 20, license0: 58, green: 1.0, demand: 1.1, hazards: { quake: 0.85, storm: 0.6, heat: 0.3, drought: 0.25 },
  },
  seo: {
    id: 'seo', name: 'SE Asia & Oceania', short: 'SEO',
    blurb: 'Chip packaging hubs, the Malacca chokepoint and the sunburnt Australian outback.',
    label: { lat: -2, lon: 116 }, stance: 'accelerate', permit: 0.9, gridPrice: 86, gridCarbon: 0.55,
    interconnectMonths: 14, license0: 62, green: 0.9, demand: 0.9, hazards: { quake: 0.35, storm: 0.5, heat: 0.65, drought: 0.4 },
  },
};

export const STANCE_LABEL: Record<Stance, string> = {
  accelerate: 'Pro-build',
  neutral: 'Neutral',
  cautious: 'Cautious',
};
