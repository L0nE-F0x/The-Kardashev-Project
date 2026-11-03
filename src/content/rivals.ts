import type { RegionId } from './mapcodes';

/** How each rival picks sites for campuses (Act II). */
export interface RivalPrefs {
  color: string;
  /** Weights for site scoring. */
  headroom: number;
  cheap: number;
  talent: number;
  clean: number;
  /** Campus size range (MW IT). */
  size: [number, number];
  /** Days between new campuses. */
  every: [number, number];
  regions?: RegionId[];
}

export const RIVAL_PREFS: Record<string, RivalPrefs> = {
  meridian: { color: 'red3', headroom: 1.2, cheap: 1, talent: 0.3, clean: 0.2, size: [100, 400], every: [140, 220] },
  lattice: { color: 'vio4', headroom: 0.6, cheap: 0.4, talent: 1.4, clean: 0.6, size: [60, 200], every: [200, 300] },
  orchard: { color: 'grn5', headroom: 0.5, cheap: 1.5, talent: 0.2, clean: 0.3, size: [50, 150], every: [180, 280] },
};

/** Startups that come up for sale (Act II). */
export interface StartupDef {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** A tech you get immediately. */
  tech?: string;
  /** Research points. */
  rp?: number;
  /** Talent restored in a region. */
  talent?: RegionId;
  /** A modifier you get permanently (key → mult). */
  mods?: Record<string, number>;
  gives: string;
  phase: number;
}

export const STARTUPS: StartupDef[] = [
  { id: 'coldplate', name: 'Coldplate Systems', blurb: 'Two-phase immersion cooling, five patents and a very loud founder.', price: 450e6, mods: { pue: 0.95 }, gives: 'Data center PUE −5%', phase: 1 },
  { id: 'gridsense', name: 'GridSense', blurb: 'Software that finds spare capacity hiding in congested grids.', price: 380e6, mods: { interconnect: 0.8 }, gives: 'Grid connections 20% sooner', phase: 1 },
  { id: 'tinylab', name: 'Kestrel Bay Labs', blurb: 'Twelve brilliant researchers in a Bengaluru co-working space.', price: 300e6, rp: 40, talent: 'sas', gives: '+40 research, refills South Asia’s talent pool', phase: 1 },
  { id: 'proofworks', name: 'Proofworks', blurb: 'Formal verification for neural networks. Iris has been reading their papers at lunch.', price: 520e6, mods: { safetyEff: 1.3 }, gives: 'Safety research ×1.3', phase: 2 },
  { id: 'sparsity', name: 'Sparsity AI', blurb: 'A compiler that makes every accelerator do a bit more.', price: 800e6, mods: { algoEff: 1.25 }, gives: 'Training efficiency ×1.25', phase: 2 },
  { id: 'voltaic', name: 'Voltaic Storage', blurb: 'Iron-air batteries that hold a hundred hours.', price: 600e6, mods: { batteryMWh: 1.3 }, gives: 'Batteries store 30% more', phase: 2 },
  { id: 'atlas-agents', name: 'Atlas Agents', blurb: 'Enterprise agents with ten thousand paying customers.', price: 1.4e9, mods: { demand: 1.2 }, gives: 'Market demand ×1.2', phase: 3 },
  { id: 'lumina-photonics', name: 'Lumina Photonics', blurb: 'Optical interconnects between racks: less power, more bandwidth.', price: 1.1e9, mods: { pue: 0.94, inferEff: 1.1 }, gives: 'PUE −6%, inference +10%', phase: 3 },
];

export const STARTUP_BY_ID: Record<string, StartupDef> = Object.fromEntries(STARTUPS.map((x) => [x.id, x]));
