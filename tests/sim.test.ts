import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { setRental, startTraining } from '../src/sim/actions';
import { simulateOffline } from '../src/sim/offline';
import type { GameState } from '../src/sim/types';
import { loadWorld } from './helpers/world';
import { autoResolve1 as autoResolve, botDay1 } from './helpers/act1bot';

const ctx = { router: loadWorld().router };

describe('simulation', () => {
  it('is deterministic for the same seed and actions', () => {
    const run = () => {
      const s = newGame({ name: 'Test', homeSite: 'bay-area', seed: 42 });
      for (let d = 0; d < 300; d++) {
        botDay1(s, ctx);
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
      botDay1(s, ctx);
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
      botDay1(s, ctx);
      tick(s, ctx);
    }
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    tick(s, ctx);
    tick(copy, ctx);
    expect(copy.finance.cash).toBeCloseTo(s.finance.cash, 2);
  });
});
