/**
 * Achievements: milestones in every act, a few good (or brave) choices, the sandbox, and the fun
 * corners of the dioramas. Kept per device (save/achievements.ts). Most are checks on the state;
 * `done: null` ones are unlocked by the game when something happens on screen (`game.achieve`).
 * Campaign achievements don't unlock in a sandbox; `sandbox: true` ones only unlock there. The ids
 * are stable: they map onto Steam achievements later.
 */
import type { IconName } from '../ui/icons';
import type { GameState } from '../sim/types';
import { linksBuilt } from '../sim/supergrid';
import { fusionTW } from '../sim/fusion';
import { moonStage } from '../sim/orbit';
import { claimsTotal } from '../sim/asteroids';
import { segmentsLit } from '../sim/systemView';
import { TECHS } from './techs';
import { REGION_IDS } from './mapcodes';

export type Tier = 'bronze' | 'silver' | 'gold';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  tier: Tier;
  /** Which act it belongs to (for grouping); 0 = anywhere. */
  act: number;
  /** Only in a sandbox. */
  sandbox?: boolean;
  /** Hidden until unlocked. */
  secret?: boolean;
  /** Unlocked when this holds (checked every second of play); null = the game unlocks it on an event. */
  done: ((s: GameState) => boolean) | null;
}

const yearOfDay = (day: number) => new Date(Date.UTC(2027, 0, 1) + day * 86_400_000).getUTCFullYear();
const online = (s: GameState, types: string[]) => s.facilities.some((f) => types.includes(f.type) && f.status === 'online');
const projectsDone = (s: GameState, kinds?: string[]) => (s.charter?.projects ?? []).filter((p) => p.status === 'done' && (!kinds || kinds.includes(p.kind))).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Act I · The Garage ──
  { id: 'hello-world', name: 'Hello, world', desc: 'Train Bit-1.', icon: 'brain', tier: 'bronze', act: 1, done: (s) => s.models.length >= 1 },
  { id: 'own-iron', name: 'Own iron', desc: 'Bring your first data centre online.', icon: 'datacenter', tier: 'bronze', act: 1, done: (s) => online(s, ['datacenter', 'campus']) },
  { id: 'term-sheets', name: 'Term sheets', desc: 'Raise your Series A and finish Act I.', icon: 'cash', tier: 'silver', act: 1, done: (s) => !!s.flags.act1Complete },
  { id: 'garage-sprint', name: 'Garage sprint', desc: 'Finish Act I before 2029.', icon: 'clock', tier: 'gold', act: 1, done: (s) => typeof s.flags.act1Complete === 'number' && s.flags.act1Complete < 730 && !s.meta.act2Start },
  { id: 'lean-and-mean', name: 'Lean and mean', desc: 'Finish Act I on Hard.', icon: 'shield', tier: 'gold', act: 1, done: (s) => !!s.flags.act1Complete && s.meta.difficulty === 'hard' && !s.meta.act2Start },
  { id: 'safety-first', name: 'Safety first', desc: 'Ship Bit-2 with a safety margin of +0.5 or better.', icon: 'evals', tier: 'silver', act: 1, done: (s) => s.models.length === 2 && s.stats.margin >= 0.5 },

  // ── Act II · The Scale-Up ──
  { id: 'gigawatt', name: 'Gigawatt', desc: 'Run a gigawatt of IT capacity.', icon: 'power', tier: 'silver', act: 2, done: (s) => (s.stats.itMW ?? 0) >= 1000 },
  { id: 'atoms', name: 'Splitting atoms', desc: 'Bring a reactor, an SMR or a restarted plant online.', icon: 'nuclear', tier: 'bronze', act: 2, done: (s) => online(s, ['reactor', 'smr', 'restart']) },
  { id: 'whole-stack', name: 'The whole stack', desc: 'Run your own fab and packaging plant.', icon: 'fab', tier: 'silver', act: 2, done: (s) => online(s, ['fab']) && online(s, ['packaging']) },
  { id: 'ring-the-bell', name: 'Ring the bell', desc: 'Take the company public and finish Act II.', icon: 'ipo', tier: 'silver', act: 2, done: (s) => !!s.flags.act2Complete },
  { id: 'no-bridges', name: 'No bridges', desc: 'Finish Act II without ever taking a bridge loan.', icon: 'finance', tier: 'gold', act: 2, done: (s) => !!s.flags.act2Complete && s.finance.bridgeLoans === 0 && !s.meta.act2Start && !s.meta.act3Start },
  { id: 'friends-everywhere', name: 'Friends everywhere', desc: 'Have every bloc at 60 or better with you.', icon: 'blocs', tier: 'gold', act: 2, done: (s) => s.act >= 2 && !!s.blocs && REGION_IDS.every((r) => (s.blocs[r]?.relation ?? 0) >= 60) },

  // ── Act III · The Charter ──
  { id: 'the-steward', name: 'The Steward', desc: 'Accept the Charter: run the Kardashev Project.', icon: 'charter', tier: 'bronze', act: 3, done: (s) => !!s.charter },
  { id: 'megaproject', name: 'Megaproject', desc: 'Complete a Charter project.', icon: 'mega', tier: 'bronze', act: 3, done: (s) => projectsDone(s) >= 1 },
  { id: 'liftoff', name: 'Liftoff', desc: 'Open a Charter launch site.', icon: 'launch', tier: 'silver', act: 3, done: (s) => projectsDone(s, ['launch']) >= 1 },
  { id: 'held-the-threshold', name: 'Held the threshold', desc: 'Hold all three fronts of The Threshold.', icon: 'threshold', tier: 'gold', act: 3, done: (s) => (s.charter?.threshold?.held ?? 0) >= 3 },
  { id: 'planetary-mandate', name: 'Planetary mandate', desc: 'Win the renewal vote with full planetary powers.', icon: 'vote', tier: 'gold', act: 3, done: (s) => s.charter?.renewal?.outcome === 'planetary' },
  { id: 'clean-hands', name: 'Clean hands', desc: 'Face the renewal vote with your company in a blind trust.', icon: 'trust', tier: 'silver', act: 3, done: (s) => !!s.charter?.renewal && !!s.charter.blindTrust },

  // ── Act IV · Planetary ──
  { id: 'follow-the-sun', name: 'Follow the sun', desc: 'Build five supergrid links.', icon: 'supergrid', tier: 'silver', act: 4, done: (s) => !!s.planet && linksBuilt(s) >= 5 },
  { id: 'star-in-a-bottle', name: 'A star in a bottle', desc: 'Put fusion power on the grid.', icon: 'fusion', tier: 'silver', act: 4, done: (s) => !!s.planet && fusionTW(s) > 0 },
  { id: 'shackleton', name: 'Shackleton Base', desc: 'Build a base on the Moon.', icon: 'moon', tier: 'bronze', act: 4, done: (s) => !!s.planet && moonStage(s) >= 1 },
  { id: 'throw-it-up', name: 'Throw it up', desc: 'Fire the lunar mass driver.', icon: 'massdriver', tier: 'silver', act: 4, done: (s) => !!s.planet && moonStage(s) >= 3 },
  { id: 'held-the-heat', name: 'Held the heat', desc: 'Hold all three fronts of the Heat Wall.', icon: 'heat', tier: 'gold', act: 4, done: (s) => (s.planet?.heatwall?.held ?? 0) >= 3 },
  { id: 'planetary', name: 'Planetary', desc: 'Finish Act IV.', icon: 'globe', tier: 'silver', act: 4, done: (s) => !!s.flags.act4Complete },

  // ── Act V · Type I ──
  { id: 'thermal-line', name: 'The Thermal Line', desc: 'Draw the line around Earth.', icon: 'thermal', tier: 'bronze', act: 5, done: (s) => !!s.system?.thermalLine },
  { id: 'first-seed', name: 'First seed', desc: 'Plant a self-replicating foundry.', icon: 'foundry', tier: 'bronze', act: 5, done: (s) => (s.system?.foundries.length ?? 0) >= 1 },
  { id: 'staking-claims', name: 'Staking claims', desc: 'Claim three asteroids.', icon: 'asteroid', tier: 'silver', act: 5, done: (s) => !!s.system && claimsTotal(s) >= 3 },
  { id: 'first-light', name: 'First light', desc: 'Light the first arc of the swarm.', icon: 'swarm', tier: 'silver', act: 5, done: (s) => !!s.system && segmentsLit(s.system.collectors) >= 1 },
  { id: 'solar-maximum', name: 'Solar maximum', desc: 'Hold all three fronts when the storm hits.', icon: 'storm', tier: 'gold', act: 5, done: (s) => (s.system?.solarmax?.held ?? 0) >= 3 },
  { id: 'type-i', name: 'Type I', desc: 'Reach Kardashev 1.0000.', icon: 'k', tier: 'gold', act: 5, done: (s) => !!s.system?.typeI },
  { id: 'ahead-of-schedule', name: 'Ahead of schedule', desc: 'Reach Type I before 2090.', icon: 'jump', tier: 'gold', act: 5, done: (s) => !!s.system?.typeI && yearOfDay(s.system.typeI) < 2090 },
  { id: 'garden-world', name: 'A garden world', desc: 'Let Earth become a garden.', icon: 'garden', tier: 'silver', act: 5, secret: true, done: (s) => s.system?.earth === 'garden' },

  // ── Around campus ──
  { id: 'meet-the-team', name: 'Meet the team', desc: 'Say hello to Juno, Penny, Mira, Sol, Iris and Bit on campus.', icon: 'team', tier: 'bronze', act: 0, done: null },
  { id: 'night-launch', name: 'Night launch', desc: 'Watch a rocket lift off at night.', icon: 'launch', tier: 'bronze', act: 0, secret: true, done: null },
  { id: 'world-tour', name: 'World tour', desc: 'Visit ten different places up close.', icon: 'map', tier: 'bronze', act: 0, done: null },

  // ── Sandbox ──
  { id: 'sandcastle', name: 'Sandcastle', desc: 'In a sandbox, run fifty facilities.', icon: 'campus', tier: 'bronze', act: 0, sandbox: true, done: (s) => s.facilities.filter((f) => f.status === 'online').length >= 50 },
  { id: 'mad-scientist', name: 'Mad scientist', desc: 'In a sandbox, know every technology there is.', icon: 'research', tier: 'silver', act: 0, sandbox: true, done: (s) => TECHS.every((t) => s.research.done.includes(t.id)) },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** The cast you have to meet for "Meet the team". */
export const TEAM_TO_MEET = ['juno', 'penny', 'mira', 'sol', 'iris', 'bit'];

/** Which achievements a state now earns (campaign ones only outside a sandbox, and vice versa). */
export function earned(s: GameState, have: Record<string, number>): AchievementDef[] {
  const sandbox = !!s.meta.sandbox;
  // an act a preset skipped isn't yours to collect
  const from = s.meta.act5Start ? 5 : s.meta.act4Start ? 4 : s.meta.act3Start ? 3 : s.meta.act2Start ? 2 : 1;
  return ACHIEVEMENTS.filter((a) => !have[a.id] && a.done && !!a.sandbox === sandbox && (a.act === 0 || a.act >= from) && a.done(s));
}
