import type { AiId, FivePlan, GameState } from '../../src/sim/types';
import { REGION_IDS } from '../../src/content/mapcodes';
import { RESOLUTION_BY_ID } from '../../src/content/council';
import { botDay3 } from './act3bot';
import { canTable, canWhip, forecast, tableResolution, voteScore, whipBloc } from '../../src/sim/council';
import { confirmPlan, defaultPlan, runJump } from '../../src/sim/plans';
import { canDelegate, delegate } from '../../src/sim/airegions';
import { resolveEvent } from '../../src/sim/events';
import { EVENT_BY_ID } from '../../src/content/events';
import type { SimContext } from '../../src/sim/supply';

const AGENDA4 = ['ai-charters', 'planetary-powers', 'debris-rules', 'he3-sharing', 'access-pledge', 'run-licensing'];

/** Take each waiting decision: the first available choice (what autopilot would do). */
function decide(s: GameState): void {
  for (let i = 0; i < 10 && s.events.active; i++) {
    const def = EVENT_BY_ID[s.events.active.id];
    if (!def) {
      s.events.active = null;
      break;
    }
    const choices = def.choices(s, s.events.active.ctx);
    const idx = Math.max(0, choices.findIndex((c) => !c.disabled));
    resolveEvent(s, idx);
  }
}

/**
 * A planning Act IV player: takes the first sensible choice, accepts the default five-year plans and
 * jumps, leaves the autopilot on between jumps (the planner keeps working the plan's priorities), hands
 * provinces to the most trusted AIs, and tables the Act IV resolutions.
 */
export function botDay4(s: GameState, ctx: SimContext): void {
  if ((s.act ?? 1) < 4 || !s.planet) {
    botDay3(s);
    return;
  }
  decide(s);
  const pl = s.planet;
  if (pl.planOpen && !s.events.active) {
    const plan: FivePlan = defaultPlan(s);
    const r = confirmPlan(s, plan);
    if (r.ok) runJump(s, ctx);
    decide(s);
    return;
  }
  // the planner runs between jumps through the game's own autopilot (on by default from the Mandate)
  s.flags.autopilot4 = true;
  if (s.day % 30 === 0 && pl.stage >= 1) {
    const order: AiId[] = ['weft', 'bit', 'sapling', 'apex'];
    let count = REGION_IDS.filter((r) => pl.provinces[r].ai).length;
    for (const r of [...REGION_IDS].sort((a, b) => pl.provinces[a].wellbeing - pl.provinces[b].wellbeing)) {
      if (count >= 6 || pl.provinces[r].ai) continue;
      const ai = [...order].sort((a, b) => pl.ais[b].trust - pl.ais[a].trust).find((a) => canDelegate(s, r, a) === null);
      if (ai && delegate(s, r, ai).ok) count++;
    }
  }
  if (s.day % 15 === 0) {
    const c = s.charter!;
    for (const id of AGENDA4) {
      if (c.council.agenda.length >= 2) break;
      if (canTable(s, id) !== null) continue;
      const fc = forecast(s, id);
      if (fc.yes + 6 >= fc.no) tableResolution(s, id);
    }
    if (c.council.nextSession - s.day < 20) {
      for (const id of c.council.agenda) {
        const res = RESOLUTION_BY_ID[id];
        for (const r of [...REGION_IDS].sort((a, b) => voteScore(s, b, res) - voteScore(s, a, res))) {
          if (forecast(s, id).passes) break;
          if (canWhip(s, r) === null && voteScore(s, r, res) > -0.5) whipBloc(s, r);
        }
      }
    }
  }
}
