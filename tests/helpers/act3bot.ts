import * as A from '../../src/sim/actions';
import { RESOLUTIONS } from '../../src/content/council';
import { REGION_IDS } from '../../src/content/mapcodes';
import type { GameState } from '../../src/sim/types';
import { autoResolve, botDay as act2Day } from './act2bot';
import { canTable, forecast, tableResolution, whipBloc, canWhip, voteScore } from '../../src/sim/council';
import { RESOLUTION_BY_ID } from '../../src/content/council';
import { nextMissionContract, setDesk, bitTrusted } from '../../src/sim/desk';
import { canPost, postTender } from '../../src/sim/charter';
import { LAUNCH_SITES } from '../../src/content/sites';
import { requestOwnLicence, ownRunStatus } from '../../src/sim/frontier';
import { nextModelPlan } from '../../src/sim/ai';

/** Resolutions a sensible Steward pushes, in order. */
const AGENDA = ['access-pledge', 'run-licensing', 'incident-reporting', 'staged-release', 'export-harmony', 'orbital-commons', 'dues-raise', 'compute-cap', 'emergency-powers'];

/** A delegating Act III player: the company in a blind trust, the Charter desks on, missions in order. */
export function botDay3(s: GameState) {
  autoResolve(s);
  if (s.act < 3 || !s.charter) {
    act2Day(s);
    return;
  }
  const c = s.charter;
  if (s.day % 7 === 1) {
    if (!c.desk.penny?.on) setDesk(s, 'penny', { on: true, a: 10e9 });
    if (!c.desk.mira?.on) setDesk(s, 'mira', { on: true, a: 12, b: 0 });
    if (!c.desk.juno?.on) setDesk(s, 'juno', { on: true, a: 2 });
    if (!c.desk.sol?.on) setDesk(s, 'sol', { on: true, a: 10 });
    if (!c.desk.kip?.on && c.phase >= 2) setDesk(s, 'kip', { on: true, a: 0 });
    if (!c.desk.bit?.on && bitTrusted(s) === null) setDesk(s, 'bit', { on: true, a: 3 });
  }
  if (!s.research.current) {
    // the trustee picks research when the company is in the trust; otherwise do it here
    act2Day(s);
  }
  // your own frontier runs above the cap: take the evals route
  if (!s.training) {
    const plan = nextModelPlan(s);
    if (ownRunStatus(s, plan.gen, plan.flop) === 'needed') requestOwnLicence(s, plan.gen, false);
  }
  if (s.day % 15 !== 0) return;
  // post toward missions while the treasury allows (Bit does this when trusted)
  if (!c.desk.bit?.on) {
    for (let i = 0; i < 3 && c.tenders.length < 6 && c.budget > 20e9; i++) {
      const next = nextMissionContract(s);
      if (!next) break;
      postTender(s, next.kind, next.size, next.where);
    }
  }
  if (c.phase >= 2 && !c.projects.some((p) => p.kind === 'launch') && canPost(s, 'launch', 1, LAUNCH_SITES[0].id) === null) postTender(s, 'launch', 1, LAUNCH_SITES[0].id);
  // the Council: table what would pass (or nearly), whip the rest
  for (const id of AGENDA) {
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
  void RESOLUTIONS;
  void A;
}
