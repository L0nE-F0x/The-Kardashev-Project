import type { RegionId } from './mapcodes';

/** Existing subsea cable systems you can lease capacity on (Act II). */
export interface CableDef {
  id: string;
  name: string;
  /** Landing station site ids. */
  a: string;
  b: string;
  /** Monthly lease for a meaningful slice of capacity. */
  lease: number;
  /** Weight for anchor-drag / sabotage events (busy, shallow or contested seas are riskier). */
  risk: number;
}

export const CABLES: CableDef[] = [
  { id: 'c-atlantic', name: 'Atlantic Crossing', a: 'cls-virginia', b: 'cls-cornwall', lease: 6e6, risk: 0.6 },
  { id: 'c-ella', name: 'EllaLight', a: 'cls-fortaleza', b: 'cls-marseille', lease: 5e6, risk: 0.5 },
  { id: 'c-americas', name: 'Americas Spine', a: 'cls-virginia', b: 'cls-fortaleza', lease: 4e6, risk: 0.4 },
  { id: 'c-pacific', name: 'Pacific Light', a: 'cls-losangeles', b: 'cls-chikura', lease: 8e6, risk: 0.6 },
  { id: 'c-southern', name: 'Southern Cross Next', a: 'cls-losangeles', b: 'cls-sydney', lease: 7e6, risk: 0.4 },
  { id: 'c-redsea', name: 'Red Sea Gateway', a: 'cls-marseille', b: 'cls-djibouti', lease: 5e6, risk: 1.4 },
  { id: 'c-arabian', name: 'Arabian Express', a: 'cls-djibouti', b: 'cls-mumbai', lease: 4e6, risk: 1.0 },
  { id: 'c-indian', name: 'Bay of Bengal Link', a: 'cls-mumbai', b: 'cls-singapore', lease: 4e6, risk: 0.7 },
  { id: 'c-asiapac', name: 'Asia-Pacific Gateway', a: 'cls-singapore', b: 'cls-chikura', lease: 6e6, risk: 1.1 },
  { id: 'c-indopac', name: 'Indigo Link', a: 'cls-singapore', b: 'cls-sydney', lease: 4e6, risk: 0.5 },
];

export const CABLE_BY_ID: Record<string, CableDef> = Object.fromEntries(CABLES.map((c) => [c.id, c]));

/** Overland fiber. */
export const FIBER_COST_PER_KM = 80_000;
export const FIBER_MAX_KM = 5_000;
/** Laying your own subsea cable. */
export const OWN_CABLE_COST = 1.2e9;
export const OWN_CABLE_MONTHS = 24;
export const LEASE_SETUP_DAYS = 45;

/**
 * Serving efficiency (latency + bandwidth) for inference sold into another region.
 * Same region 1.0; your own network ~0.9; the public internet on the same continent 0.72,
 * across an ocean 0.5.
 */
export const SERVE_EFF = { local: 1, private: 0.9, privateHop: 0.04, continent: 0.72, ocean: 0.5 };

/** Continents for "same landmass" checks. */
export const CONTINENT: Record<RegionId, 'americas' | 'europe' | 'africa' | 'asia' | 'oceania'> = {
  pac: 'americas', atl: 'americas', lat: 'americas',
  eur: 'europe', nor: 'europe', stp: 'asia',
  mena: 'africa', ssa: 'africa',
  sas: 'asia', eam: 'asia', fab: 'asia', seo: 'oceania',
};
