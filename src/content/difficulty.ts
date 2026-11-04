import type { TechKey } from './techs';

export type Difficulty = 'relaxed' | 'standard' | 'hard';
export type FounderId = 'classic' | 'safety' | 'hardware' | 'growth' | 'energy' | 'steward';
export type EventRate = 'off' | 'low' | 'normal' | 'high';
export type RivalPace = 'slow' | 'normal' | 'fast';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  blurb: string;
  cash: number;
  /** Days between random events [min, max]. */
  eventDays: [number, number];
  /** Multiplier on what crises cost you. */
  crisis: number;
  /** Multiplier on safety-incident risk. */
  incident: number;
  /** What happens when the money runs out. */
  broke: 'cheap-loan' | 'loan' | 'bankrupt';
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  relaxed: {
    id: 'relaxed', name: 'Relaxed', blurb: 'More seed money, calmer world, gentler crises. A cozy build.',
    cash: 600e6, eventDays: [60, 100], crisis: 0.7, incident: 0.6, broke: 'cheap-loan',
  },
  standard: {
    id: 'standard', name: 'Standard', blurb: 'The game as designed: real constraints, real trade-offs.',
    cash: 400e6, eventDays: [42, 72], crisis: 1, incident: 1, broke: 'loan',
  },
  hard: {
    id: 'hard', name: 'Hard', blurb: 'Lean seed round, frequent crises — and running out of cash ends the company.',
    cash: 250e6, eventDays: [30, 55], crisis: 1.5, incident: 1.5, broke: 'bankrupt',
  },
};

export const EVENT_RATES: Record<EventRate, { name: string; mult: number }> = {
  off: { name: 'Off', mult: 0 },
  low: { name: 'Low', mult: 1.6 },
  normal: { name: 'Normal', mult: 1 },
  high: { name: 'High', mult: 0.6 },
};

export const RIVAL_PACES: Record<RivalPace, { name: string; mult: number }> = {
  slow: { name: 'Slow', mult: 0.8 },
  normal: { name: 'Normal', mult: 1 },
  fast: { name: 'Fast', mult: 1.25 },
};

export interface FounderDef {
  id: FounderId;
  name: string;
  icon: 'shield' | 'compute' | 'cash' | 'solar' | 'hq' | 'swarm';
  /** New Game+: only selectable once a campaign has reached Type I. */
  unlock?: 'typeI';
  tagline: string;
  perk: string;
  flaw: string;
  mods: Partial<Record<TechKey, number>>;
  cash: number;
  trust: number;
  alignment: number;
}

export const FOUNDERS: Record<FounderId, FounderDef> = {
  classic: {
    id: 'classic', name: 'Classic', icon: 'hq', tagline: 'Three friends, a garage and a plan.',
    perk: 'No perk', flaw: 'No flaw', mods: {}, cash: 0, trust: 0, alignment: 0,
  },
  safety: {
    id: 'safety', name: 'Safety-First', icon: 'shield', tagline: 'Alignment researchers who started a company.',
    perk: 'Safety research ×1.5 · trust +5 everywhere', flaw: 'Seed money −$50M',
    mods: { safetyEff: 1.5 }, cash: -50e6, trust: 5, alignment: 0,
  },
  hardware: {
    id: 'hardware', name: 'Hardware Nerds', icon: 'compute', tagline: 'They build their own racks for fun.',
    perk: 'Data centers build 20% faster · PUE −0.05', flaw: 'Research −15%',
    mods: { dcBuild: 0.8, pue: 0.962, research: 0.85 }, cash: 0, trust: 0, alignment: 0,
  },
  growth: {
    id: 'growth', name: 'Growth Hackers', icon: 'cash', tagline: 'Ship it, then ship it again.',
    perk: 'Inference revenue +20%', flaw: 'Alignment −0.25 · trust −5',
    mods: { inferEff: 1.2 }, cash: 0, trust: -5, alignment: -0.25,
  },
  energy: {
    id: 'energy', name: 'Energy Natives', icon: 'solar', tagline: 'Ex-utility engineers who speak fluent grid.',
    perk: 'Solar, wind & batteries 15% cheaper · grid connections 25% sooner', flaw: 'Training efficiency ×0.85',
    mods: { solarCost: 0.85, windCost: 0.85, batteryCost: 0.85, interconnect: 0.75, algoEff: 0.85 }, cash: 0, trust: 0, alignment: 0,
  },
  steward: {
    id: 'steward', name: 'The Steward', icon: 'swarm', unlock: 'typeI', tagline: 'You have done this before. Somehow, you remember.',
    perk: 'Research +10% · trust +3 · Charter contracts 5% cheaper · foundries 5% faster', flaw: 'Rivals take you seriously from day one (rival boost +10%)',
    mods: { research: 1.1, charterCost: 0.95, foundryGrowth: 1.05, rivalBoost: 1.1 }, cash: 0, trust: 3, alignment: 0,
  },
};
