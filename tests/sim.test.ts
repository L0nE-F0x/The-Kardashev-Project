import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { build, placeOrder, requestGrid, setAlloc, setRental, setResearch, startTraining } from '../src/sim/actions';
import { resolveEvent } from '../src/sim/events';
import { simulateOffline } from '../src/sim/offline';
import { TECHS } from '../src/content/techs';
import { EVENT_BY_ID } from '../src/content/events';
import type { GameState } from '../src/sim/types';
import { loadWorld } from './helpers/world';

const ctx = { router: loadWorld().router };

/** Resolve any event card by picking the first enabled choice. */
function autoResolve(s: GameState) {
  while (s.events.active) {
    const def = EVENT_BY_ID[s.events.active.id];
    const choices = def.choices(s, s.events.active.ctx);
    const idx = Math.max(0, choices.findIndex((c) => !c.disabled));
    resolveEvent(s, idx);
  }
}

/** A simple scripted player that follows the tutorial. */
function botDay(s: GameState) {
  autoResolve(s);
  if (s.day === 1) {
    setRental(s, 2000);
    startTraining(s);
    setAlloc(s, 'safety', 0.1);
    build(s, 'west-texas', 'datacenter');
    build(s, 'west-texas', 'solar');
    build(s, 'west-texas', 'battery');
    requestGrid(s, 'west-texas', 20);
    placeOrder(s, ctx, 'kestrel', 4000, 'west-texas', 'sea');
    placeOrder(s, ctx, 'lumen', 4000, 'west-texas', 'sea');
  }
  if (!s.research.current) {
    const next = TECHS.find((t) => !s.research.done.includes(t.id) && (t.requires ?? []).every((r) => s.research.done.includes(r)));
    if (next) setResearch(s, next.id);
  }
  if (!s.training && s.models.length < 2) startTraining(s);
  if (s.models.length >= 1 && s.alloc.infer < 0.3) setAlloc(s, 'infer', 0.35);
  if (s.day === 400) setRental(s, 0);
}

describe('simulation', () => {
  it('is deterministic for the same seed and actions', () => {
    const run = () => {
      const s = newGame({ name: 'Test', homeSite: 'bay-area', seed: 42 });
      for (let d = 0; d < 300; d++) {
        botDay(s);
        tick(s, ctx);
      }
      return JSON.stringify({ cash: s.finance.cash, day: s.day, models: s.models, k: s.stats.K, news: s.news.slice(0, 5) });
    };
    expect(run()).toEqual(run());
  });

  it('a tutorial-following player can finish Act I in a few years', () => {
    const s = newGame({ name: 'Bot Labs', homeSite: 'bay-area', seed: 7 });
    let finished = -1;
    for (let d = 0; d < 365 * 4; d++) {
      botDay(s);
      tick(s, ctx);
      for (const v of [s.finance.cash, s.stats.K, s.stats.computeEF, s.stats.margin]) expect(Number.isFinite(v)).toBe(true);
      if (s.flags.act1Complete && finished < 0) finished = s.day;
    }
    // eslint-disable-next-line no-console
    console.log('Act I finished on day', finished, 'cash', (s.finance.cash / 1e6).toFixed(0), 'M', 'models', s.models.map((m) => `${m.name}:${m.capability.toFixed(2)}`).join(' '), 'objectives', s.objectives.done.join(','));
    expect(s.models.length).toBeGreaterThanOrEqual(2);
    expect(finished).toBeGreaterThan(200);
    expect(finished).toBeLessThan(365 * 4);
  });

  it('offline progress advances the world without firing events', () => {
    const s = newGame({ name: 'Idle', homeSite: 'london', seed: 3 });
    autoResolve(s);
    setRental(s, 1000);
    startTraining(s);
    const report = simulateOffline(s, ctx, 3 * 3_600_000);
    expect(report).not.toBeNull();
    expect(report!.days).toBe(90);
    expect(s.day).toBe(90);
    expect(s.events.active).toBeNull();
  });

  it('round-trips through JSON', () => {
    const s = newGame({ name: 'Save', homeSite: 'bengaluru', seed: 9 });
    for (let d = 0; d < 120; d++) {
      botDay(s);
      tick(s, ctx);
    }
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    tick(s, ctx);
    tick(copy, ctx);
    expect(copy.finance.cash).toBeCloseTo(s.finance.cash, 2);
  });
});
