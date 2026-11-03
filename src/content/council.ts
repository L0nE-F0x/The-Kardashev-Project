/**
 * Act III: the resolutions the Council can vote on. Each bloc weighs a resolution by its stance,
 * faction and wealth (plus relations, Legitimacy and whatever you did to sway it). Effects are
 * applied in sim/council.ts; multiplicative ones are read through techMult via `mods`.
 */
import type { FactionId, GameState } from '../sim/types';
import type { RegionId } from './mapcodes';
import type { Stance } from './regions';
import type { TechKey } from './techs';
import type { IconName } from '../ui/icons';
import type { Wealth } from './charter';

export interface ResolutionDef {
  id: string;
  name: string;
  icon: IconName;
  blurb: string;
  effect: string;
  /** Political capital to table it. */
  cost: number;
  cphase: number;
  /** Baseline appeal to every bloc (−1..1). */
  base?: number;
  appeal: {
    stance?: Partial<Record<Stance, number>>;
    faction?: Partial<Record<FactionId, number>>;
    wealth?: Partial<Record<Wealth, number>>;
    blocs?: Partial<Record<RegionId, number>>;
  };
  /** Needs two thirds of the votes cast. */
  supermajority?: boolean;
  /** Passing one member of a group repeals the others. */
  group?: string;
  /** Why it can't be tabled right now, or null. */
  needs?: (s: GameState) => string | null;
  mods?: Partial<Record<TechKey, number>>;
}

export const RESOLUTIONS: ResolutionDef[] = [
  {
    id: 'dues-raise', name: 'Raise the dues', icon: 'cash', cost: 12, cphase: 1, base: 0.15,
    blurb: 'Every bloc pays 25% more into the Charter.',
    effect: 'Dues +25% (up to 1.6× the founding level).',
    appeal: { wealth: { rich: -0.25, emerging: -0.35, developing: -0.55 }, stance: { accelerate: 0.15 } },
    needs: (s) => ((s.charter?.dues ?? 1) >= 1.59 ? 'Dues are already at their ceiling.' : null),
  },
  {
    id: 'dues-relief', name: 'Dues relief for developing blocs', icon: 'trust', cost: 10, cphase: 1, base: 0.05,
    blurb: 'Developing blocs pay half; the rich make up part of the gap.',
    effect: 'Developing blocs’ dues ×0.5, everyone else’s ×1.05; their relations +6.',
    appeal: { wealth: { rich: -0.2, emerging: 0.1, developing: 0.9 } },
  },
  {
    id: 'compute-cap', name: 'Frontier compute cap', icon: 'compute', cost: 18, cphase: 3,
    blurb: 'No training run above 3×10³⁰ FLOP without a Charter licence — for every lab, yours included.',
    effect: 'Every rival lab improves 25% slower; your own big runs need a licence (Charter → Frontier).',
    appeal: { stance: { cautious: 0.7, neutral: 0.2, accelerate: -0.6 }, wealth: { developing: 0.15 } },
  },
  {
    id: 'run-licensing', name: 'Frontier run licensing', icon: 'evals', cost: 15, cphase: 2,
    blurb: 'Labs need a Charter licence and an independent evaluation before a frontier release.',
    effect: 'World alignment +0.1; incidents 20% less severe; labs file licence requests.',
    appeal: { stance: { cautious: 0.6, neutral: 0.3, accelerate: -0.2 } },
    mods: { incidentSeverity: 0.8 },
  },
  {
    id: 'open-weights', name: 'Open weights for all', icon: 'globe', cost: 14, cphase: 2, group: 'weights',
    blurb: 'Any model may be released openly, at any capability.',
    effect: 'Orchard races ahead; world growth +0.2%/yr; access +5 everywhere; incident risk +25%.',
    appeal: { stance: { accelerate: 0.2, neutral: 0.1, cautious: -0.6 }, wealth: { developing: 0.6, emerging: 0.3, rich: -0.25 } },
  },
  {
    id: 'staged-release', name: 'Staged open release', icon: 'clock', cost: 12, cphase: 2, group: 'weights',
    blurb: 'Weights go open after independent evals, about eighteen months behind the frontier.',
    effect: 'Research +5% for everyone; access +2 everywhere; incidents 5% less severe.',
    appeal: { stance: { neutral: 0.3, cautious: 0.25, accelerate: 0.1 }, wealth: { developing: 0.15 } },
    mods: { research: 1.05, incidentSeverity: 0.95 },
  },
  {
    id: 'closed-frontier', name: 'Close the frontier', icon: 'lock', cost: 14, cphase: 2, group: 'weights',
    blurb: 'No open weights above Architect level, anywhere.',
    effect: 'Incidents 15% less severe; Orchard slows and resents you; developing blocs lose a little access.',
    appeal: { stance: { cautious: 0.55, accelerate: -0.3 }, wealth: { developing: -0.5, rich: 0.3 } },
    mods: { incidentSeverity: 0.85 },
  },
  {
    id: 'export-harmony', name: 'Harmonise export rules', icon: 'deal', cost: 20, cphase: 2,
    blurb: 'Lift the chip and memory export controls between members.',
    effect: 'Advanced Chip Controls, HBM Export Caps and Gulf Compute Conditions lifted; Eastern tension −15.',
    appeal: { faction: { eastern: 0.9, nonaligned: 0.35, atlantic: -0.55 }, blocs: { mena: 0.3 } },
    needs: (s) => (['chip-controls', 'hbm-caps', 'gulf-controls'].some((r) => s.politics.rules.includes(r)) ? null : 'No chip export rules are in force.'),
  },
  {
    id: 'fossil-freeze', name: 'No new fossil power', icon: 'co2', cost: 14, cphase: 2,
    blurb: 'No new coal or gas plants anywhere in the Charter — yours included.',
    effect: 'New energy worldwide 15% cleaner; your company can’t build gas plants.',
    appeal: { stance: { cautious: 0.45, neutral: 0.15 }, blocs: { stp: -0.7, mena: -0.6, eam: -0.15 }, wealth: { developing: -0.2 } },
  },
  {
    id: 'access-pledge', name: 'The Access Pledge', icon: 'access', cost: 12, cphase: 1,
    blurb: 'A quarter of Charter spending goes to the blocs with the least compute.',
    effect: 'Access grows 50% faster in developing blocs; Legitimacy +3.',
    appeal: { wealth: { developing: 0.9, emerging: 0.3, rich: -0.3 } },
  },
  {
    id: 'emergency-powers', name: 'Emergency powers', icon: 'warn', cost: 25, cphase: 3, supermajority: true, base: 0.1,
    blurb: 'In a declared crisis the Steward may redirect power, chips and compute across blocs.',
    effect: 'Unlocks emergency actions in a crisis; the Threshold’s grid front starts easier.',
    appeal: { stance: { accelerate: 0.2, neutral: 0.1, cautious: -0.2 }, faction: { eastern: -0.2 } },
  },
  {
    id: 'orbital-commons', name: 'Orbital commons protocol', icon: 'satellite', cost: 8, cphase: 2, base: 0.3,
    blurb: 'Shared rules for launches, debris and orbital slots.',
    effect: 'Space contracts 20% cheaper and faster; Legitimacy +1.',
    appeal: { stance: { cautious: 0.1 } },
  },
  {
    id: 'incident-reporting', name: 'Mandatory incident reporting', icon: 'news', cost: 10, cphase: 1,
    blurb: 'Every lab reports every safety incident to the Charter within 72 hours.',
    effect: 'Incidents 15% less severe; the AI labs grumble.',
    appeal: { stance: { cautious: 0.5, neutral: 0.3, accelerate: -0.1 } },
    mods: { incidentSeverity: 0.85 },
  },
  {
    id: 'windfall-levy', name: 'AI windfall levy', icon: 'finance', cost: 16, cphase: 2,
    blurb: 'Every AI lab pays 2% of its revenue into the Charter. Including yours.',
    effect: 'The treasury gets 2% of every lab’s revenue; your company pays too; the labs resent it.',
    appeal: { wealth: { developing: 0.6, emerging: 0.3, rich: -0.4 }, stance: { accelerate: -0.15 } },
  },
];

export const RESOLUTION_BY_ID: Record<string, ResolutionDef> = Object.fromEntries(RESOLUTIONS.map((r) => [r.id, r]));
