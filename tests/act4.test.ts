import { describe, expect, it } from 'vitest';
import { botDay4 } from './helpers/act4bot';
import { tick } from '../src/sim/tick';
import { newAct4Game, ACT4_START_DAY } from '../src/sim/act4preset';
import { planetChecklist } from '../src/sim/act4';
import { dateOf, fmtDate } from '../src/sim/core';
const yearOf = (d: number) => dateOf(d).getUTCFullYear();
import { warming } from '../src/sim/climate';
import { avgWellbeing } from '../src/sim/provinces';
import { fusionTW } from '../src/sim/fusion';
import { linksBuilt } from '../src/sim/supergrid';
import { orbitGW, moonStage } from '../src/sim/orbit';
import { aiRegionCount } from '../src/sim/airegions';
import { worldMargin } from '../src/sim/frontier';
import { PLANET } from '../src/content/planet';
import { loadWorld } from './helpers/world';
import { migrate } from '../src/save/save';
import { newAct3Game } from '../src/sim/act3';
import { SAVE_VERSION } from '../src/sim/state';
import { confirmPlan, jumpStep } from '../src/sim/plans';
import { resolveEvent } from '../src/sim/events';
import { EVENT_BY_ID } from '../src/content/events';
import type { GameState } from '../src/sim/types';

const ctx = { router: loadWorld().router };

describe('Act IV', () => {
  it('"Start at Act IV" opens in January 2045 with a planet', () => {
    const s = newAct4Game({ name: 'Planet Co', homeSite: 'bay-area', seed: 3 }, ctx);
    expect(s.act).toBe(4);
    expect(s.day).toBe(ACT4_START_DAY);
    expect(s.planet?.stage).toBe(0);
    expect(s.planet?.powers).toBe('planetary');
    expect(s.planet?.fusion.tokamak.status).toBe('won');
    expect(s.events.active?.id).toBe('act4-begin');
    expect(s.charter?.partners.twistfield).toBeTruthy();
    expect(Number.isFinite(s.stats.K)).toBe(true);
    expect(s.stats.K).toBeGreaterThan(0.745);
    // the Charter's books are set after the decade's fast-forward (it used to hand over ~$1.6T and a negative margin)
    expect(s.charter!.budget).toBeLessThan(300e9);
    expect(worldMargin(s)).toBeGreaterThan(0);
    expect(s.flags.autopilot4).toBe(true);
  }, 60_000);

  /** Play the Mandate with first choices until the first plan opens. */
  const toFirstPlan = (s: GameState) => {
    for (let d = 0; d < 400 && !(s.planet!.planOpen && !s.events.active); d++) {
      for (let i = 0; i < 10 && s.events.active; i++) {
        const ch = EVENT_BY_ID[s.events.active.id].choices(s, s.events.active.ctx);
        resolveEvent(s, Math.max(0, ch.findIndex((c) => !c.disabled)));
      }
      if (!(s.planet!.planOpen && !s.events.active)) tick(s, ctx);
    }
  };

  it('a climate-first plan with no reserve pays its way through the jump', () => {
    const s = newAct4Game({ name: 'Spender', homeSite: 'bay-area', seed: 21 }, ctx);
    toFirstPlan(s);
    expect(confirmPlan(s, { years: 3, priorities: ['climate', 'provinces', 'safety'], reserve: 0, bitRuns: false }).ok).toBe(true);
    const c = s.charter!;
    let rec = null;
    for (let guard = 0; guard < 60 && !rec; guard++) {
      rec = jumpStep(s, ctx, 30);
      // the planner never commits more than the treasury and the dues can carry (it used to commit 3× the dues)
      expect(c.projects.some((p) => p.status === 'building' && p.arrears > 0)).toBe(false);
      expect(c.budget).toBeGreaterThan(0);
    }
    expect(rec?.cut).toBeUndefined();
  }, 60_000);

  it('a jump stops early, with its report, when Legitimacy crashes', () => {
    const s = newAct4Game({ name: 'Crash', homeSite: 'bay-area', seed: 5 }, ctx);
    toFirstPlan(s);
    expect(confirmPlan(s, { years: 3, priorities: ['grid'], reserve: 0.25, bitRuns: false }).ok).toBe(true);
    s.charter!.legitimacy = 12;
    const rec = jumpStep(s, ctx, 365);
    expect(rec?.cut).toMatch(/Legitimacy/);
    expect(s.planet!.jump).toBeNull();
    expect(s.planet!.stage).toBe(1);
    // the stage is played from the day the jump stopped
    expect(s.planet!.stageDay).toBe(s.day);
  }, 60_000);

  it('is deterministic through a jump', () => {
    const run = () => {
      const s = newAct4Game({ name: 'Det', homeSite: 'n-virginia', seed: 11 }, ctx);
      for (let d = 0; d < 500; d++) {
        botDay4(s, ctx);
        tick(s, ctx);
      }
      const c = s.charter!;
      return JSON.stringify({ day: s.day, stage: s.planet!.stage, jumps: s.planet!.jumps.length, budget: Math.round(c.budget), K: s.stats.K.toFixed(6), projects: c.projects.length, news: s.news.slice(0, 5) });
    };
    expect(run()).toEqual(run());
  }, 60_000);

  it('migrates an Act III save (no planet yet)', () => {
    const s = newAct3Game({ name: 'Old', homeSite: 'london', seed: 4 });
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.planet;
    raw.version = 4;
    const m = migrate(raw)!;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.planet).toBeNull();
  });

  it('a planning Steward reaches the end of Act IV without stalling', () => {
    const s = newAct4Game({ name: 'Planet Bot', homeSite: 'bay-area', seed: 21 }, ctx);
    const start = s.day;
    let end = -1;
    let lastStage = -1;
    for (let d = 0; d < 365 * 30 && s.day < PLANET.deadline + 900; d++) {
      botDay4(s, ctx);
      tick(s, ctx);
      const c = s.charter!;
      const pl = s.planet!;
      for (const v of [s.finance.cash, s.stats.K, c.budget, c.legitimacy, c.world.tw, c.world.carbonGt, pl.tritium, avgWellbeing(s), warming(s), pl.debris.leo]) expect(Number.isFinite(v)).toBe(true);
      if (pl.stage !== lastStage || d % 365 === 0) {
        lastStage = pl.stage;
        // eslint-disable-next-line no-console
        console.log(
          fmtDate(s.day),
          `st${pl.stage}${pl.jumps.length ? ` j${pl.jumps.length}` : ''}`,
          `K ${s.stats.K.toFixed(4)} (${s.stats.worldTW.toFixed(1)} TW, g ${(c.world.growth * 100).toFixed(2)}%)`,
          `budget ${(c.budget / 1e9).toFixed(0)}B`,
          `L ${c.legitimacy.toFixed(0)}`,
          `links ${linksBuilt(s)} fus ${fusionTW(s).toFixed(2)}TW trit ${pl.tritium.toFixed(0)}`,
          `orbit ${orbitGW(s)}GW moon ${moonStage(s)} leo ${pl.debris.leo.toFixed(0)}`,
          `wb ${avgWellbeing(s).toFixed(0)} warm ${warming(s).toFixed(2)} ai ${aiRegionCount(s)} wm ${worldMargin(s).toFixed(2)}`,
          `proj ${c.projects.filter((p) => p.status === 'done').length}/${c.projects.length} tend ${c.tenders.length}`,
          `check ${planetChecklist(s).filter((g) => g.done).map((g) => g.id).join(',')}`,
          `arrears ${c.projects.filter((p) => p.status === 'building' && p.arrears > 0).length} late ${c.projects.filter((p) => p.status === 'building' && s.day > p.startDay + p.promised + 15).length} walk ${Object.keys(c.council.walkouts).length} self ${s.flags.selfAwards ?? 0} inc ${Object.values(pl.ais).reduce((a, x) => a + x.incidents, 0)} trust ${c.blindTrust ? 'on' : 'off'} co ${pl.company}`,
        );
      }
      if (s.flags.act4Complete && end < 0) {
        end = s.day;
        break;
      }
    }
    const pl = s.planet!;
    // eslint-disable-next-line no-console
    console.log('Act IV ended', end > 0 ? fmtDate(end) : 'never', 'years', ((end - start) / 365).toFixed(1), 'jumps', pl.jumps.map((j) => `${yearOf(j.from)}→${yearOf(j.to)}`).join(' '), 'held', pl.heatwall?.held, 'K', s.stats.K.toFixed(4), 'checklist', planetChecklist(s).map((g) => `${g.id}:${g.done ? 'y' : 'n'}(${g.note})`).join(' '));
    for (const j of pl.jumps) {
      // eslint-disable-next-line no-console
      console.log('JUMP', fmtDate(j.from), '→', fmtDate(j.to), 'L', j.before.legitimacy.toFixed(0), '→', j.after.legitimacy.toFixed(0), '\n  auto:', j.auto.join(' | '), '\n  built:', j.built.join(', '), '\n  diary:', j.diary.join(' / '));
    }
    expect(pl.jumps.length).toBe(3);
    // the planner pays its way: no jump had to stop for an empty treasury, a Legitimacy crash or a walkout
    expect(pl.jumps.every((j) => !j.cut)).toBe(true);
    expect(end).toBeGreaterThan(0);
    // v0.8: reachable stage gates and shorter stage limits — the bot ends in mid-2062 (it was Aug 2066, when the
    // Fusion Age always ran out its 6-year limit; the guard rail was 2072)
    expect(yearOf(end)).toBeLessThanOrEqual(2064);
    // the Heat Wall pushes back (a front peaks around 50 for this bot) but a planning Steward holds it
    expect(pl.heatwall!.held).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
