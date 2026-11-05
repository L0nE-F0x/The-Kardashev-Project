import { describe, expect, it } from 'vitest';
import { newAct5Game } from '../src/sim/act5preset';
import { tick } from '../src/sim/tick';
import { fmtDate, dateOf } from '../src/sim/core';
import { migrate } from '../src/save/save';
import { SAVE_VERSION } from '../src/sim/state';
import { SYSTEM } from '../src/content/system';
import { typeIChecklist } from '../src/sim/act5';
import { foundryMt } from '../src/sim/foundries';
import { spaceTW, surfaceTW, idleTW } from '../src/sim/swarm';
import { segmentsLit } from '../src/sim/systemView';
import { avgWellbeing } from '../src/sim/provinces';
import { warming } from '../src/sim/climate';
import { botDay5 } from './helpers/act5bot';
import { EVENT_BY_ID } from '../src/content/events';
import { loadWorld } from './helpers/world';

const yearOf = (day: number) => dateOf(day).getUTCFullYear();

describe('Act V · Type I', () => {
  const ctx = { router: loadWorld().router };

  it('"Start at Act V" opens in January 2068 with a system', () => {
    const s = newAct5Game({ name: 'Swarm Labs', homeSite: 'bay-area', seed: 5 }, ctx);
    expect(s.act).toBe(5);
    expect(yearOf(s.day)).toBe(2068);
    expect(s.system).not.toBeNull();
    expect(s.system!.stage).toBe(0);
    expect(s.stats.K).toBeGreaterThan(0.79);
    expect(s.stats.K).toBeLessThan(0.81);
    expect(s.models.length).toBeGreaterThanOrEqual(9);
    expect(s.events.active?.id).toBe('act5-begin');
  });

  it('a cast card always has a choice to take, therapies ready or not', () => {
    const s = newAct5Game({ name: 'Cast', homeSite: 'bay-area', seed: 8 }, ctx);
    for (const rate of [0.2, 0.5]) {
      s.system!.lifeRate = rate;
      for (const id of ['penny', 'juno', 'mira', 'sol', 'lena', 'kip', 'iris']) {
        const choices = EVENT_BY_ID[`cast-${id}`].choices(s, {});
        expect(choices.some((c) => !c.disabled), `cast-${id} at lifeRate ${rate}`).toBe(true);
      }
    }
  });

  it('migrates an Act IV save (no system yet)', () => {
    const s = newAct5Game({ name: 'Old Save', homeSite: 'bay-area', seed: 6 }, ctx);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.system;
    raw.version = 5;
    const m = migrate(raw)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.system).toBeNull();
  });

  it('a hands-off Steward reaches Type I without stalling', () => {
    const s = newAct5Game({ name: 'Type I Bot', homeSite: 'bay-area', seed: 31 }, ctx);
    const start = s.day;
    let last = -1;
    for (let d = 0; d < 365 * 50 && !s.flags.typeI; d++) {
      botDay5(s, ctx);
      tick(s, ctx);
      const sy = s.system!;
      for (const v of [s.stats.K, s.charter!.budget, s.charter!.legitimacy, sy.collectors, sy.rings, sy.habitat, sy.lifeExp, sy.mindsMood, warming(s), foundryMt(s)]) expect(Number.isFinite(v)).toBe(true);
      if (sy.stage !== last || d % 365 === 0) {
        last = sy.stage;
        // eslint-disable-next-line no-console
        console.log(
          fmtDate(s.day), `st${sy.stage} e${sy.eras.length}`,
          `K ${s.stats.K.toFixed(4)} (${s.stats.worldTW.toFixed(0)} TW: earth ${surfaceTW(s).toFixed(0)} space ${spaceTW(s).toFixed(1)} idle ${idleTW(s).toFixed(1)})`,
          `fd ${sy.foundries.length} ${foundryMt(s).toFixed(2)}Mt arcs ${segmentsLit(sy.collectors)} col ${sy.collectors.toFixed(1)} ring ${sy.rings.toFixed(1)} hab ${sy.habitat.toFixed(1)} beam ${sy.beams}`,
          `ast ${Object.values(sy.asteroids).map((a) => a.status).join('')}`,
          `budget ${(s.charter!.budget / 1e9).toFixed(0)}B L ${s.charter!.legitimacy.toFixed(0)} cap ${s.charter!.capital.toFixed(0)}`,
          `life ${sy.lifeExp.toFixed(1)} (+${sy.lifeRate.toFixed(2)}) wb ${avgWellbeing(s).toFixed(0)} warm ${warming(s).toFixed(2)} (heat ${sy.heatWarming.toFixed(2)}) mood ${sy.mindsMood.toFixed(0)}`,
          `dec ${[sy.thermalLine, sy.ownership, sy.earth, sy.seat, sy.longevity, sy.settlement, sy.bitFate, sy.next].map((x) => x ?? '-').join(',')}`,
          `check ${typeIChecklist(s).filter((g) => g.done).map((g) => g.id).join(',')}`,
          `tend ${s.charter!.tenders.length} drift ${sy.foundries.filter((f) => f.drift > 0).length}`,
        );
      }
    }
    const sy = s.system!;
    // eslint-disable-next-line no-console
    console.log('Type I', s.flags.typeI ? fmtDate(Number(s.flags.typeI)) : 'never', 'years', ((s.day - start) / 365).toFixed(1), 'eras', sy.eras.map((e) => `${yearOf(e.from)}→${yearOf(e.to)}${e.last ? '*' : ''}`).join(' '), 'held', sy.solarmax?.held, 'checklist', typeIChecklist(s).map((g) => `${g.id}:${g.done ? 'y' : 'n'}(${g.note})`).join(' '));
    for (const e of sy.eras) {
      // eslint-disable-next-line no-console
      console.log('ERA', fmtDate(e.from), '→', fmtDate(e.to), '\n  auto:', e.auto.join(' | '), '\n  built:', e.built.join(', '), '\n  diary:', e.diary.join(' / '));
    }
    expect(s.flags.typeI).toBeTruthy();
    expect(yearOf(Number(s.flags.typeI))).toBeLessThanOrEqual(2115);
    void SYSTEM;
  }, 240_000);
});
