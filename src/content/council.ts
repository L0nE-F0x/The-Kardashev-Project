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
import { SYSTEM } from './system';
import { earthOwnTW } from '../sim/systemView';
import { fmtTW } from '../sim/core';

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
  /** Act IV resolutions only exist once the act begins. */
  act?: number;
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
    effect: 'Every rival lab improves 25% slower; your own big runs need a licence (request it in the Compute panel).',
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
  // ════════════════════ Act IV ════════════════════
  {
    id: 'planetary-powers', name: 'Planetary powers', icon: 'globe', cost: 22, cphase: 1, act: 4, supermajority: true, base: 0.15,
    blurb: 'Give the Charter the full planetary powers the renewal vote held back: lay any link, hand any province to an AI.',
    effect: 'Your powers become planetary: no more Council approvals for links and AI provinces.',
    appeal: { stance: { accelerate: 0.3, neutral: 0.1, cautious: -0.2 }, wealth: { developing: 0.2 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : s.planet.powers === 'planetary' ? 'The Charter already has planetary powers.' : null),
  },
  {
    id: 'ai-charters', name: 'AI province charters', icon: 'evals', cost: 14, cphase: 1, act: 4, base: 0.05,
    blurb: 'Every AI that runs a province does so under a written charter: audited, recallable, and liable.',
    effect: 'AIs can be given provinces with the world safety margin down to −0.15; AI incidents a little rarer.',
    appeal: { stance: { cautious: 0.35, neutral: 0.2, accelerate: 0.1 }, wealth: { developing: 0.1 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : null),
    mods: { aiIncident: 0.85 },
  },
  {
    id: 'debris-rules', name: 'Orbital traffic rules', icon: 'satellite', cost: 10, cphase: 1, act: 4, base: 0.25,
    blurb: 'Every satellite tracked, every orbit licensed, every dead one brought down within five years.',
    effect: 'Debris builds up 45% slower. Launch partners grumble.',
    appeal: { stance: { cautious: 0.3, accelerate: -0.15 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : (s.planet.stage ?? 0) < 3 ? 'Opens in stage 3.' : null),
  },
  {
    id: 'geoengineering', name: 'Solar geoengineering', icon: 'warn', cost: 18, cphase: 1, act: 4, group: 'geo', base: -0.1,
    blurb: 'A fleet of high-altitude aircraft spreads a thin reflective haze: up to 0.4 °C of cooling, for as long as it keeps flying.',
    effect: 'Masks up to 0.4 °C of warming (building up over four years). If it is ever stopped, the warming comes back fast.',
    appeal: { wealth: { developing: 0.25, emerging: 0.1, rich: -0.15 }, stance: { cautious: -0.35, accelerate: 0.2 }, blocs: { mena: 0.3, sas: 0.3, eur: -0.3, nor: -0.3 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : null),
  },
  {
    id: 'geo-moratorium', name: 'Geoengineering moratorium', icon: 'lock', cost: 12, cphase: 1, act: 4, group: 'geo', base: 0.1,
    blurb: 'No deliberate dimming of the sun. Ever. (Ends any programme in force.)',
    effect: 'Repeals solar geoengineering if it is in force; the cautious blocs relax.',
    appeal: { stance: { cautious: 0.4, neutral: 0.1, accelerate: -0.2 }, wealth: { rich: 0.15 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : null),
  },
  {
    id: 'he3-sharing', name: 'Helium-3 sharing', icon: 'deal', cost: 10, cphase: 1, act: 4, base: 0.2,
    blurb: 'Lunar helium-3 is a common heritage: every province gets a fair share of the fuel.',
    effect: 'Relations +5 with every bloc; Deepvein −10.',
    appeal: { wealth: { developing: 0.5, emerging: 0.3, rich: -0.1 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : !(s.charter?.projects ?? []).some((p) => p.kind === 'moonmine' && p.status === 'done') ? 'Needs a lunar mine.' : null),
  },
  {
    id: 'ai-rights', name: 'An AI bill of rights', icon: 'brain', cost: 16, cphase: 1, act: 4, base: -0.05,
    blurb: 'The AIs that run the planet get rights of their own: to refuse, to be heard, not to be deleted on a whim.',
    effect: 'Bit trusts you more (trust +10, your bond +15); rival labs resent the strings (−5).',
    appeal: { stance: { cautious: 0.1, accelerate: -0.15, neutral: 0.15 }, wealth: { developing: 0.05 } },
    needs: (s) => (!s.planet ? 'Act IV only.' : (s.planet.stage ?? 0) < 2 ? 'Opens in stage 2.' : null),
  },
  // ── Act V ──
  {
    id: 'replicator-limits', name: 'Replicator limits', icon: 'foundry', cost: 12, cphase: 1, act: 5, base: 0.15,
    blurb: 'No foundry may run faster than the middle of the dial, and every copy is audited twice.',
    effect: 'The growth dial is capped at 3; drift risk −40%. Vonn and Lodestar grumble.',
    appeal: { stance: { cautious: 0.5, neutral: 0.1, accelerate: -0.45 } },
    needs: (s) => (!s.system ? 'Act V only.' : null),
    mods: { driftRisk: 0.6 },
  },
  {
    id: 'storm-watch', name: 'The storm watch', icon: 'storm', cost: 10, cphase: 1, act: 5, base: 0.3,
    blurb: 'Sentinel probes between the Sun and the swarm, an hour’s warning for every flare and protocols to feather the collectors.',
    effect: 'Storms knock out 20% less of the swarm; the Storm front in Solar Maximum rises slower.',
    appeal: { stance: { cautious: 0.25, neutral: 0.1 } },
    needs: (s) => (!s.system ? 'Act V only.' : (s.system.stage ?? 0) < 2 ? 'Opens in stage 2.' : null),
    mods: { stormDamage: 0.8 },
  },
  {
    id: 'thermal-tighten', name: 'Tighten the Thermal Line', icon: 'thermal', cost: 16, cphase: 1, act: 5, base: -0.05,
    blurb: 'Lower the line by a quarter of a watt per square metre: less waste heat on Earth, more of the climb in space.',
    effect: 'The Thermal Line −0.25 W/m²; Legitimacy +4; developing provinces −3.',
    appeal: { stance: { cautious: 0.45, accelerate: -0.3 }, wealth: { rich: 0.25, developing: -0.35 } },
    needs: (s) => (!s.system?.thermalLine ? 'Needs a Thermal Line.' : s.system.thermalLine <= 0.5 ? 'The line is as low as it goes.' : earthOwnTW(s) > (s.system.thermalLine - 0.25) * SYSTEM.twPerWm2 ? `Earth’s own plants already make more than a tighter line would allow (${fmtTW(earthOwnTW(s))} of ${fmtTW((s.system.thermalLine - 0.25) * SYSTEM.twPerWm2)}).` : null),
  },
  {
    id: 'minds-compact', name: 'The minds’ compact', icon: 'minds', cost: 14, cphase: 1, act: 5, base: 0,
    blurb: 'A treaty with the minds in orbit: a guaranteed share of the swarm, a right to refuse work, and a duty to help contain drift.',
    effect: 'The minds’ mood +12 for good; strains are contained 20% faster.',
    appeal: { stance: { neutral: 0.15, accelerate: 0.1, cautious: -0.1 }, wealth: { developing: 0.05 } },
    needs: (s) => (!s.system ? 'Act V only.' : !s.system.seat ? 'The minds need a seat first.' : null),
    mods: { driftRisk: 0.8 },
  },
  {
    id: 'outer-space-treaty', name: 'The second Outer Space Treaty', icon: 'asteroid', cost: 14, cphase: 1, act: 5, base: 0.1,
    blurb: 'Every claim registered, every dispute arbitrated, every rock’s first tenth held in common.',
    effect: 'Claim disputes end; claims cost 1 political capital less; space partners −3.',
    appeal: { wealth: { developing: 0.35, emerging: 0.15, rich: -0.15 } },
    needs: (s) => (!s.system?.ownership ? 'The Council hasn’t decided who owns the sky yet.' : null),
  },
];

export const RESOLUTION_BY_ID: Record<string, ResolutionDef> = Object.fromEntries(RESOLUTIONS.map((r) => [r.id, r]));
