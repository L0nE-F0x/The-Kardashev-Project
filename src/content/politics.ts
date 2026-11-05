import type { RegionId } from './mapcodes';
import type { SupplierId } from '../sim/types';

/**
 * Export rules: which flows a bloc blocks. Shipments of `items` from suppliers in the `from`
 * regions into the `to` regions need a licence (Sol) or local production (your own fab).
 */
export interface ExportRuleDef {
  id: string;
  name: string;
  /** Who imposes it (a bloc). */
  by: RegionId;
  blurb: string;
  item: 'accelerators' | 'euv' | 'hbm' | 'models' | 'minerals';
  /** Supplier ids affected (accelerators / hbm). */
  suppliers?: SupplierId[];
  to: RegionId[];
  /** Days a licence takes, and the relation you need with the destination's opponent (the `by` bloc). */
  licenceDays: number;
  licenceCost: number;
  minRelation: number;
  /** Active from the start of Act II. */
  initial?: boolean;
}

export const EXPORT_RULES: ExportRuleDef[] = [
  {
    id: 'chip-controls', name: 'Advanced Chip Controls', by: 'atl', item: 'accelerators', suppliers: ['lumen', 'kestrel'], to: ['eam', 'stp'],
    blurb: 'Leading-edge accelerators from Lumen and Kestrel may not ship to Mainland East Asia or the Steppe without a licence.',
    licenceDays: 150, licenceCost: 40e6, minRelation: 55, initial: true,
  },
  {
    id: 'euv-licensing', name: 'EUV Tool Licensing', by: 'eur', item: 'euv', to: ['eam', 'stp', 'mena', 'sas'],
    blurb: 'Veldt’s EUV machines need an export licence for fabs in these blocs.',
    licenceDays: 240, licenceCost: 80e6, minRelation: 50, initial: true,
  },
  {
    id: 'hbm-caps', name: 'HBM Export Caps', by: 'fab', item: 'hbm', to: ['eam', 'stp'],
    blurb: 'The Fab Belt caps high-bandwidth memory shipments into these blocs; chips built for them lose most of their HBM.',
    licenceDays: 120, licenceCost: 30e6, minRelation: 50,
  },
  {
    id: 'gulf-controls', name: 'Gulf Compute Conditions', by: 'atl', item: 'accelerators', suppliers: ['lumen', 'kestrel'], to: ['mena'],
    blurb: 'Accelerator shipments to the Gulf need end-use checks and a licence.',
    licenceDays: 90, licenceCost: 20e6, minRelation: 45,
  },
  {
    id: 'data-residency', name: 'Data Residency Act', by: 'eur', item: 'models', to: ['eur', 'nor'],
    blurb: 'Personal data must be processed in Europe: serving these markets from outside counts for half.',
    licenceDays: 0, licenceCost: 0, minRelation: 0,
  },
  {
    id: 'counter-controls', name: 'Mineral Counter-Controls', by: 'eam', item: 'minerals', to: [],
    blurb: 'Retaliation: gallium, germanium and rare-earth exports are restricted. Every fab outside Mainland East Asia slows down by 15%.',
    licenceDays: 0, licenceCost: 0, minRelation: 0,
  },
];

export const RULE_BY_ID: Record<string, ExportRuleDef> = Object.fromEntries(EXPORT_RULES.map((r) => [r.id, r]));

/** Treaties you can join at summits or from the Blocs screen. */
export interface TreatyDef {
  id: string;
  name: string;
  blurb: string;
  /** What it gives. */
  gives: string;
  /** What it asks. */
  asks: string;
  /** Relation change on signing, by bloc stance. */
  relation: { accelerate: number; neutral: number; cautious: number };
  /** Minimum safety allocation while a member (obligation). */
  minSafety?: number;
  /** Modifiers (TechKey-like keys read via treatyMult). */
  mods: Record<string, number>;
}

export const TREATIES: TreatyDef[] = [
  {
    id: 'evals-pact', name: 'Frontier Evaluations Pact',
    blurb: 'Labs submit every frontier model to independent red-teaming before release.',
    gives: 'Trust +30% faster everywhere, incidents 25% less severe, cautious blocs warm to you.',
    asks: 'Keep at least 8% of compute on safety.',
    relation: { accelerate: -2, neutral: 6, cautious: 12 }, minSafety: 0.08, mods: { licenseGain: 1.3, incidentSeverity: 0.75 },
  },
  {
    id: 'compute-accord', name: 'Compute Transparency Accord',
    blurb: 'Report every training run above a threshold to a shared registry.',
    gives: 'Export licences come 30% faster; relations up across the board.',
    asks: 'Rivals see your runs coming and keep pace: their progress +5%.',
    relation: { accelerate: 3, neutral: 6, cautious: 8 }, mods: { licenceDays: 0.7, rivalBoost: 1.05 },
  },
  {
    id: 'grid-compact', name: 'Clean Grid Compact',
    blurb: 'Commit to matching new data center load with new clean generation.',
    gives: 'Permits 15% faster; green regions trust you more.',
    asks: 'New gas plants are off the table while you are a member.',
    relation: { accelerate: 1, neutral: 5, cautious: 7 }, mods: { permit: 0.85, licenseGain: 1.15 },
  },
  {
    id: 'open-science', name: 'Open Science Charter',
    blurb: 'Publish safety research and older model weights for everyone.',
    gives: 'Research +15%; local trust grows 10% faster everywhere.',
    asks: 'Rivals gain a little from your work.',
    relation: { accelerate: 0, neutral: 4, cautious: 5 }, mods: { research: 1.15, rivalBoost: 1.05, licenseGain: 1.1 },
  },
];

export const TREATY_BY_ID: Record<string, TreatyDef> = Object.fromEntries(TREATIES.map((t) => [t.id, t]));

/** Sovereign deals a bloc can offer: build there, get something back. */
export interface SovereignDef {
  id: string;
  title: string;
  /** Which blocs offer it. */
  regions: RegionId[];
  needMW: number;
  days: number;
  reward: string;
  /** Strings attached. */
  strings: string;
  cash?: number;
  /** Power price multiplier in the bloc while active (and after, if completed). */
  power?: number;
  permit?: number;
  relation: number;
}

export const SOVEREIGN: SovereignDef[] = [
  { id: 'gulf-compute', title: 'Sovereign compute partnership', regions: ['mena'], needMW: 200, days: 900, cash: 3e9, relation: 12, reward: '$3B co-investment and cheap power', strings: 'A national model gets priority access to your capacity there.', power: 0.7 },
  { id: 'eu-gigafactory', title: 'AI gigafactory programme', regions: ['eur', 'nor'], needMW: 150, days: 900, cash: 1.5e9, relation: 10, reward: '$1.5B in grants and faster permits', strings: 'Data residency for European customers; local research jobs.', permit: 0.8 },
  { id: 'india-mission', title: 'National AI mission', regions: ['sas'], needMW: 100, days: 720, cash: 0.8e9, relation: 12, reward: '$800M and a huge local market', strings: 'Serve local languages at a discount for five years.', power: 0.85 },
  { id: 'chips-homeshoring', title: 'Domestic compute incentive', regions: ['atl', 'pac'], needMW: 300, days: 900, cash: 2e9, relation: 8, reward: '$2B in tax credits', strings: 'Your frontier training must stay onshore.', permit: 0.85 },
  { id: 'nordic-green', title: 'Green data center accord', regions: ['nor'], needMW: 100, days: 720, cash: 0.5e9, relation: 10, reward: 'Cheap hydro locked in for a decade', strings: 'Waste heat must warm the local towns.', power: 0.65 },
  { id: 'latam-corridor', title: 'Lithium-to-compute corridor', regions: ['lat'], needMW: 100, days: 720, cash: 0.6e9, relation: 10, reward: 'Grants and a lithium price cap', strings: 'Train local engineers; process lithium in-country.', power: 0.8 },
  { id: 'africa-gateway', title: 'Digital gateway initiative', regions: ['ssa'], needMW: 60, days: 720, cash: 0.5e9, relation: 14, reward: 'Grants, land and fast permits', strings: 'Open a research lab and train local staff.', permit: 0.7 },
  { id: 'asean-hub', title: 'Regional AI hub status', regions: ['seo'], needMW: 120, days: 720, cash: 0.7e9, relation: 10, reward: 'Tax holiday and grid priority', strings: 'Keep a share of capacity for local startups.', power: 0.85 },
];

export const SOVEREIGN_BY_ID: Record<string, SovereignDef> = Object.fromEntries(SOVEREIGN.map((d) => [d.id, d]));

/** Days between elections in a bloc (roughly every four years, staggered). */
export const ELECTION_DAYS = 1460;
/** Lobbying spend per click and its effect. */
export const LOBBY = { cost: 60e6, relation: 6, heat: 1 };
