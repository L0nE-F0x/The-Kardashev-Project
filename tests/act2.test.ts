import { describe, expect, it } from 'vitest';
import { botDay } from './helpers/act2bot';
import { tick } from '../src/sim/tick';
import { newAct2Game } from '../src/sim/act2';
import { siteDef } from '../src/content/sites';
import { currentCapability, frontier } from '../src/sim/model';
import { fmtDate } from '../src/sim/core';
import { migrate } from '../src/save/save';
import { loadWorld } from './helpers/world';

const ctx = { router: loadWorld().router };

describe('act II', () => {
  it('migrates a v2 save and keeps it running', () => {
    const s = newAct2Game({ name: 'Old', homeSite: 'london', seed: 4 });
    const old = JSON.parse(JSON.stringify(s));
    delete old.network;
    delete old.blocs;
    delete old.capital;
    old.version = 2;
    const m = migrate(old)!;
    expect(m.network.fiber).toEqual([]);
    expect(Object.keys(m.blocs).length).toBe(12);
    for (let d = 0; d < 60; d++) tick(m, ctx);
    expect(Number.isFinite(m.finance.cash)).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => {
      const s = newAct2Game({ name: 'Det', homeSite: 'n-virginia', seed: 11 });
      for (let d = 0; d < 400; d++) {
        botDay(s);
        tick(s, ctx);
      }
      return JSON.stringify({ cash: s.finance.cash, day: s.day, phase: s.phase, rb: s.rivalBuilds.length, news: s.news.slice(0, 5) });
    };
    expect(run()).toEqual(run());
  });

  it('a delegating player reaches the IPO in 4–6 game years', () => {
    const s = newAct2Game({ name: 'Scale Bot', homeSite: 'bay-area', seed: 21 });
    const start = s.day;
    let ipo = -1;
    for (let d = 0; d < 365 * 7; d++) {
      botDay(s);
      tick(s, ctx);
      for (const v of [s.finance.cash, s.stats.K, s.stats.computeEF, s.stats.margin, s.stats.revenueMonth]) expect(Number.isFinite(v)).toBe(true);
      if (d % 182 === 0) {
        // eslint-disable-next-line no-console
        console.log(
          fmtDate(s.day),
          `ph${s.phase}`,
          `cash ${(s.finance.cash / 1e9).toFixed(1)}B`,
          `IT ${s.stats.itMW.toFixed(0)}MW`,
          `gen ${s.stats.genAvgMW.toFixed(0)}MW (${s.stats.cleanGenMW.toFixed(0)} clean)`,
          `rev ${(s.stats.revenueMonth / 1e6).toFixed(0)}M/mo`,
          `chips ${s.stats.installedAccel}`,
          `cap ${currentCapability(s).toFixed(2)} vs ${frontier(s).toFixed(2)}`,
          `margin ${s.stats.margin.toFixed(2)}`,
          `debt ${(s.capital.loans.reduce((a, l) => a + l.balance, 0) / 1e9).toFixed(1)}B`,
          `rivals ${s.rivalBuilds.length}`,
          `obj ${s.objectives.done.filter((o) => o.startsWith('a2')).length}`,
        );
      }
      if (s.flags.act2Complete && ipo < 0) {
        ipo = s.day;
        break;
      }
    }
    // eslint-disable-next-line no-console
    console.log('IPO on', ipo > 0 ? fmtDate(ipo) : 'never', 'years', ((ipo - start) / 365).toFixed(1), 'standing', s.finale?.standing, 'valuation', ((s.capital.ipo?.valuation ?? 0) / 1e9).toFixed(0), 'B', 'done', s.objectives.done.filter((o) => o.startsWith('a2')).join(','), 'home', siteDef(s.company.homeSite).name);
    expect(ipo).toBeGreaterThan(0);
    expect((ipo - start) / 365).toBeGreaterThan(3.5);
    expect((ipo - start) / 365).toBeLessThan(6.5);
  });
});
