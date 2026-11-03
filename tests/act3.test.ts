import { describe, expect, it } from 'vitest';
import { botDay3 } from './helpers/act3bot';
import { tick } from '../src/sim/tick';
import { newAct3Game } from '../src/sim/act3';
import { newAct2Game } from '../src/sim/act2';
import { fmtDate } from '../src/sim/core';
import { migrate } from '../src/save/save';
import { minAccess } from '../src/sim/charter';
import { worldMargin } from '../src/sim/frontier';
import { loadWorld } from './helpers/world';
import { MISSIONS } from '../src/content/charter';

const ctx = { router: loadWorld().router };

describe('act III', () => {
  it('migrates a v3 save (Act II sandbox) and founds the Charter', () => {
    const s = newAct2Game({ name: 'Old', homeSite: 'london', seed: 4 });
    s.flags.act2Complete = s.day;
    s.flags.act2Shown = true;
    s.phase = 5;
    const old = JSON.parse(JSON.stringify(s));
    delete old.charter;
    old.version = 3;
    const m = migrate(old)!;
    expect(m.charter).toBeNull();
    m.events.active = null;
    m.events.queue = [];
    for (let d = 0; d < 30; d++) tick(m, ctx);
    expect(m.act).toBe(3);
    expect(m.charter).not.toBeNull();
    expect(Number.isFinite(m.charter!.budget)).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => {
      const s = newAct3Game({ name: 'Det', homeSite: 'n-virginia', seed: 11 });
      for (let d = 0; d < 500; d++) {
        botDay3(s);
        tick(s, ctx);
      }
      return JSON.stringify({ cash: s.finance.cash, budget: s.charter!.budget, day: s.day, phase: s.charter!.phase, projects: s.charter!.projects.length, news: s.news.slice(0, 5) });
    };
    expect(run()).toEqual(run());
  });

  it('a delegating Steward reaches the renewal vote without stalling', () => {
    const s = newAct3Game({ name: 'Charter Bot', homeSite: 'bay-area', seed: 21 });
    const start = s.day;
    let end = -1;
    for (let d = 0; d < 365 * 11; d++) {
      botDay3(s);
      tick(s, ctx);
      const c = s.charter!;
      for (const v of [s.finance.cash, s.stats.K, c.budget, c.legitimacy, c.world.tw, c.world.carbonGt, c.regime.alignment]) expect(Number.isFinite(v)).toBe(true);
      if (d % 182 === 0) {
        // eslint-disable-next-line no-console
        console.log(
          fmtDate(s.day),
          `ph${c.phase}`,
          `K ${s.stats.K.toFixed(4)} (${s.stats.worldTW.toFixed(1)} TW, +${c.world.charterTW.toFixed(2)} Charter, g ${(c.world.growth * 100).toFixed(2)}%)`,
          `budget ${(c.budget / 1e9).toFixed(0)}B`,
          `cash ${(s.finance.cash / 1e9).toFixed(0)}B`,
          `L ${c.legitimacy.toFixed(0)} PC ${c.capital.toFixed(0)}`,
          `proj ${c.projects.filter((p) => p.status === 'done').length}/${c.projects.length} tend ${c.tenders.length}`,
          `miss ${Object.keys(c.missions).join(',') || '-'}`,
          `access≥ ${minAccess(s).toFixed(0)}`,
          `wm ${worldMargin(s).toFixed(2)} m ${s.stats.margin.toFixed(2)}`,
          `CO2 ${c.world.carbonGt.toFixed(0)}Gt`,
          `res ${c.council.passed.join(',') || '-'}`,
          `trust ${c.blindTrust ? 'on' : 'off'}`,
          `models ${s.models.length}`,
        );
      }
      if (s.flags.act3Complete && end < 0) {
        end = s.day;
        break;
      }
    }
    const c = s.charter!;
    // eslint-disable-next-line no-console
    console.log('Act III ended', end > 0 ? fmtDate(end) : 'never', 'years', ((end - start) / 365).toFixed(1), 'renewal', c.renewal?.outcome, `${c.renewal?.yes}-${c.renewal?.no}`, 'held', c.threshold?.held, 'K', s.stats.K.toFixed(4), 'missions', MISSIONS.filter((m) => c.missions[m.id]).map((m) => m.id).join(','), 'done', s.objectives.done.filter((o) => o.startsWith('a3')).join(','));
    expect(end).toBeGreaterThan(0);
    expect((end - start) / 365).toBeLessThan(10.5);
  });
});
