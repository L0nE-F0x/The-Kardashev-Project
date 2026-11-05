/**
 * "Start at Act IV": the Act III preset played through to January 2045 — a renewed Planetary Charter,
 * every Act III mission done, Sunforge's pilot lit, a launch complex, megaprojects and HVDC links.
 */
import { CONTRACT_KINDS, HVDC_BY_ID } from '../content/charter';
import { OBJECTIVES } from '../content/objectives';
import { EVENTS } from '../content/events';
import { SITE_BY_ID } from '../content/sites';
import { TECHS } from '../content/techs';
import type { ContractKind, GameState } from './types';
import { newAct3Game } from './act3';
import { beginAct4 } from './act4';
import { tick } from './tick';
import { nextModelPlan } from './ai';
import { algoEff, capabilityOf } from './model';
import { techMult } from './effects';
import type { NewGameOptions } from './state';
import type { SimContext } from './supply';

function addDone(s: GameState, kind: ContractKind, where: string, size: 1 | 2 | 3, builder: string): void {
  const c = s.charter!;
  const def = CONTRACT_KINDS[kind];
  const region = SITE_BY_ID[where]?.region ?? HVDC_BY_ID[where]?.from ?? 'eur';
  const days = def.days[size - 1];
  c.projects.push({
    id: `pre${c.projects.length}`, kind, size, where, region, builder, value: 1e9, price: 0, paid: 0, arrears: 0,
    startDay: s.day - days, days, promised: days, progress: days, status: 'done', doneDay: s.day, troubles: 0,
    gw: def.cat === 'energy' ? def.sizes[size - 1] : undefined,
  });
}

export const ACT4_START_DAY = Math.round((Date.UTC(2045, 0, 1) - Date.UTC(2027, 0, 1)) / 86_400_000);

/**
 * A preset skips the acts before `act`: their one-off story cards count as told, so they don't surface
 * decades late (Bit asking its Bit-6 question in 2089). `keep` spares cards that still offer something
 * live (Bit's offer to take the Charter's co-pilot desk is still worth making in 2045).
 */
export function retireEarlierStories(s: GameState, act: number, keep: string[] = []): void {
  for (const def of EVENTS) {
    if (!def.once || !def.weight || keep.includes(def.id)) continue;
    const of = def.act ?? (def.vstage !== undefined ? 5 : def.cphase ? 3 : def.phase ? 2 : 1);
    if (of < act) s.events.last[def.id] ??= s.day - 1;
  }
}

export function newAct4Game(opts: NewGameOptions, ctx: SimContext): GameState {
  const s = newAct3Game(opts);
  s.events.active = null;
  s.events.queue = [];
  const c = s.charter!;
  // a decade of the Charter, compressed: the big Act III results without playing them
  c.phase = 6;
  c.legitimacy = 68;
  c.capital = 45;
  c.budget = 220e9;
  c.renewal = { day: s.day, yes: 74, no: 26, outcome: 'planetary' };
  c.threshold = { startDay: s.day, endDay: s.day, fronts: { grid: { pressure: 40, lost: false }, frontier: { pressure: 55, lost: false }, council: { pressure: 30, lost: false } }, lab: 'meridian', faction: 'eastern', done: true, held: 3 };
  c.council.passed = ['run-licensing', 'access-pledge', 'orbital-commons'];
  for (const m of ['clean-power', 'compute-everyone', 'chip-commons', 'safe-frontier', 'backbone', 'offworld']) c.missions[m] = s.day;
  Object.assign(s.flags, { launchSite: 'launch-guiana', orbitalTest: s.day, spaceSolar: s.day, fusionPilot: s.day, act4Space: s.day, bitAnswer: 'everyone', trustDecided: true });
  s.research.done = TECHS.filter((t) => (t.act ?? 1) <= 3).map((t) => t.id);
  s.objectives.done = OBJECTIVES.filter((o) => (o.act ?? 1) <= 3).map((o) => o.id);
  s.meta.act4Start = true;
  addDone(s, 'launch', 'launch-guiana', 1, 'parabola');
  addDone(s, 'solar', 'mega-sahara', 3, 'halcyon');
  addDone(s, 'solar', 'mega-outback', 2, 'saltflat');
  addDone(s, 'wind', 'mega-northsea', 2, 'tidewater');
  addDone(s, 'wind', 'mega-plains', 2, 'halcyon');
  addDone(s, 'nuclear', 'mega-pacific', 2, 'littlesun');
  addDone(s, 'hydro', 'mega-nordic', 2, 'brightwater');
  addDone(s, 'hvdc', 'hvdc-sahara', 2, 'spanwire');
  addDone(s, 'hvdc', 'hvdc-northsea', 2, 'spanwire');
  addDone(s, 'evals', 'global', 2, 'lattice');
  addDone(s, 'interp', 'global', 2, 'lattice');
  c.regime.alignment += 0.6;
  // fast-forward the world to January 2045 (Act III's systems run; events wait)
  s.flags.offline = 'skip';
  try {
    while (s.day < ACT4_START_DAY) tick(s, ctx);
  } finally {
    s.flags.offline = false;
  }
  s.events.active = null;
  s.events.queue = [];
  s.events.scheduled = [];
  s.news = [];
  // the company kept training through the decade: Bit-5, Bit-6 and Bit-7
  s.training = null;
  const eff = algoEff(s);
  for (const day of [ACT4_START_DAY - 2400, ACT4_START_DAY - 1300, ACT4_START_DAY - 300]) {
    const plan = nextModelPlan(s);
    s.models.push({ name: plan.name, gen: plan.gen, flop: plan.flop, capability: capabilityOf(plan.flop, eff), day });
  }
  const cap = s.models[s.models.length - 1].capability;
  s.safety.cumFlop = Math.max(s.safety.cumFlop, Math.pow(10, cap + 22 + 0.1) / techMult(s, 'safetyEff'));
  // the Charter enters its second term whole: no walkouts, no late payers
  c.council.walkouts = {};
  c.council.late = {};
  Object.assign(s.flags, { liftoff: s.day, act3Complete: s.day, act3Shown: true });
  retireEarlierStories(s, 4, ['bit-7q']);
  beginAct4(s);
  s.events.active = s.events.queue.shift() ?? null;
  if (s.events.active) s.events.last[s.events.active.id] = s.day;
  return s;
}
