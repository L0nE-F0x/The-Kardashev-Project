import type { GameState } from '../../src/sim/types';
import { confirmEra, defaultEra, runEra } from '../../src/sim/eras';
import { resolveEvent } from '../../src/sim/events';
import { EVENT_BY_ID } from '../../src/content/events';
import type { SimContext } from '../../src/sim/supply';

/** Take each waiting decision: the first available choice (what autopilot would do). */
function decide(s: GameState): void {
  for (let i = 0; i < 12 && s.events.active; i++) {
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
 * A hands-off Act V steward: the first sensible choice on every card and big decision, the default
 * era plans, and autopilot on between eras (the era planner keeps posting and awarding contracts).
 */
export function botDay5(s: GameState, ctx: SimContext): void {
  const sy = s.system;
  if (!sy) return;
  s.flags.autopilot5 = true;
  decide(s);
  if (sy.planOpen && !s.events.active) {
    const r = confirmEra(s, defaultEra(s));
    if (r.ok) runEra(s, ctx);
    decide(s);
    return;
  }
  if (sy.jump) {
    runEra(s, ctx);
    decide(s);
  }
}
