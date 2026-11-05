/**
 * The balance report: every act's bot on Relaxed, Standard and Hard over several seeds. For each
 * run: did it finish, how many game years, the longest stretch without progress (no objective,
 * model, act phase or stage change), cards seen, the lowest cash (and the Charter's lowest
 * treasury from Act III), bankruptcies, NaNs. Then a summary per act: mean years per difficulty and
 * how far Relaxed and Hard sit from Standard. Skipped unless BALANCE is set:
 *   BALANCE=1 npx vitest run tests/balance.test.ts
 *   BALANCE=1 BALANCE_ACTS=4,5 BALANCE_SEEDS=21,7 BALANCE_DIR=/some/dir npx vitest run tests/balance.test.ts
 * Writes balance-act<N>.md (and .json) to BALANCE_DIR (default: the OS temp dir).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { newGame, type NewGameOptions } from '../src/sim/state';
import { newAct2Game } from '../src/sim/act2';
import { newAct3Game } from '../src/sim/act3';
import { newAct4Game } from '../src/sim/act4preset';
import { newAct5Game } from '../src/sim/act5preset';
import { tick } from '../src/sim/tick';
import { fmtDate } from '../src/sim/core';
import { PLANET } from '../src/content/planet';
import type { GameState } from '../src/sim/types';
import type { Difficulty } from '../src/content/difficulty';
import { loadWorld } from './helpers/world';
import { act1Plans, botDay1, type Act1Plan } from './helpers/act1bot';
import { botDay } from './helpers/act2bot';
import { botDay3 } from './helpers/act3bot';
import { botDay4 } from './helpers/act4bot';
import { botDay5 } from './helpers/act5bot';

const RUN = !!process.env.BALANCE;
const ACTS = (process.env.BALANCE_ACTS ?? '1,2,3,4,5').split(',').map(Number);
const SEEDS = (process.env.BALANCE_SEEDS ?? '21,7,42').split(',').map(Number);
const DIFFS: Difficulty[] = ['relaxed', 'standard', 'hard'];
const OUT = process.env.BALANCE_DIR ?? os.tmpdir();

const ctx = { router: loadWorld().router };

interface ActRunner {
  title: string;
  make: (o: NewGameOptions) => GameState;
  bot: (s: GameState, plan?: unknown) => void;
  done: (s: GameState) => boolean;
  /** Give up after this many days. */
  maxDays: (s: GameState) => number;
  /** A number that moves when the act makes progress (phases, stages, eras). */
  stage: (s: GameState) => number;
}

const RUNNERS: Record<number, ActRunner> = {
  1: { title: 'I · The Garage', make: (o) => newGame(o), bot: (s, plan) => botDay1(s, ctx, plan as Act1Plan | undefined), done: (s) => !!s.flags.act1Complete, maxDays: () => 365 * 6, stage: (s) => s.phase },
  2: { title: 'II · The Scale-Up', make: (o) => newAct2Game(o), bot: (s) => botDay(s, true), done: (s) => !!s.flags.act2Complete, maxDays: () => 365 * 9, stage: (s) => s.phase },
  3: { title: 'III · The Charter', make: (o) => newAct3Game(o), bot: (s) => botDay3(s), done: (s) => !!s.flags.act3Complete, maxDays: () => 365 * 13, stage: (s) => s.charter?.phase ?? 0 },
  4: {
    title: 'IV · Planetary',
    make: (o) => newAct4Game(o, ctx),
    bot: (s) => botDay4(s, ctx),
    done: (s) => !!s.flags.act4Complete,
    maxDays: (s) => Math.max(365 * 10, PLANET.deadline + 900 - s.day),
    stage: (s) => (s.planet?.stage ?? 0) * 100 + (s.planet?.jumps.length ?? 0),
  },
  5: { title: 'V · Type I', make: (o) => newAct5Game(o, ctx), bot: (s) => botDay5(s, ctx), done: (s) => !!s.flags.typeI, maxDays: () => 365 * 50, stage: (s) => (s.system?.stage ?? 0) * 100 + (s.system?.eras.length ?? 0) },
};

interface RunResult {
  act: number;
  difficulty: Difficulty;
  seed: number;
  finished: boolean;
  years: number;
  /** Longest stretch without progress, in days, and when it began. */
  stall: number;
  stallFrom: string;
  cards: number;
  minCash: number;
  minTreasury: number | null;
  bankrupt: boolean;
  nan: string | null;
  ms: number;
  /** The Act I plan that won the search. */
  plan?: string;
}

function runAct(act: number, difficulty: Difficulty, seed: number, plan?: unknown): RunResult {
  const R = RUNNERS[act];
  const t0 = Date.now();
  const s = R.make({ name: 'Balance Bot', homeSite: 'bay-area', seed, difficulty });
  const start = s.day;
  const limit = R.maxDays(s);
  let lastProgress = s.day;
  let stall = 0;
  let stallFrom = s.day;
  let mark = `${s.objectives.done.length}|${s.models.length}|${R.stage(s)}`;
  let cards = 0;
  let seen: unknown = null;
  let minCash = s.finance.cash;
  let minTreasury: number | null = s.charter ? s.charter.budget : null;
  let nan: string | null = null;
  for (let d = 0; d < limit && !R.done(s) && !s.meta.gameOver; d++) {
    if (s.events.active && s.events.active !== seen) cards++;
    seen = s.events.active;
    R.bot(s, plan);
    tick(s, ctx);
    const m = `${s.objectives.done.length}|${s.models.length}|${R.stage(s)}`;
    if (m !== mark) {
      mark = m;
      if (s.day - lastProgress > stall) {
        stall = s.day - lastProgress;
        stallFrom = lastProgress;
      }
      lastProgress = s.day;
    }
    minCash = Math.min(minCash, s.finance.cash);
    if (s.charter) minTreasury = Math.min(minTreasury ?? s.charter.budget, s.charter.budget);
    if (!nan) {
      const probe: [string, number][] = [['cash', s.finance.cash], ['K', s.stats.K], ['margin', s.stats.margin]];
      if (s.charter) probe.push(['treasury', s.charter.budget], ['legitimacy', s.charter.legitimacy]);
      for (const [k, v] of probe) if (!Number.isFinite(v)) nan = `${k} on ${fmtDate(s.day)}`;
    }
  }
  // a stall that runs to the end counts too
  if (s.day - lastProgress > stall) {
    stall = s.day - lastProgress;
    stallFrom = lastProgress;
  }
  const finished = R.done(s);
  const endDay = act === 5 && s.flags.typeI ? Number(s.flags.typeI) : s.day;
  return {
    act,
    difficulty,
    seed,
    finished,
    years: (endDay - start) / 365,
    stall,
    stallFrom: fmtDate(stallFrom),
    cards,
    minCash,
    minTreasury,
    bankrupt: !!s.meta.gameOver,
    nan,
    ms: Date.now() - t0,
  };
}

const money = (v: number) => `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1e9).toFixed(Math.abs(v) < 1e10 ? 2 : 0)}B`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function report(act: number, rows: RunResult[]): string {
  const out: string[] = [`## Act ${RUNNERS[act].title}`, '', '| Difficulty | Seed | Finished | Years | Longest stall | Cards | Lowest cash | Lowest treasury | Run |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    out.push(
      `| ${r.difficulty} | ${r.seed} | ${r.finished ? 'yes' : r.bankrupt ? '**bankrupt**' : '**no**'}${r.nan ? ` NaN: ${r.nan}` : ''} | ${r.years.toFixed(1)} | ${r.stall} d from ${r.stallFrom} | ${r.cards} | ${money(r.minCash)} | ${r.minTreasury === null ? '—' : money(r.minTreasury)} | ${(r.ms / 1000).toFixed(0)} s |${r.plan ? ` ${r.plan}` : ''}`,
    );
  }
  const by = (d: Difficulty) => mean(rows.filter((r) => r.difficulty === d && r.finished).map((r) => r.years));
  const std = by('standard');
  out.push('');
  out.push(
    `Mean years: relaxed ${by('relaxed').toFixed(2)} (${(((by('relaxed') - std) / std) * 100).toFixed(0)}%), standard ${std.toFixed(2)}, hard ${by('hard').toFixed(2)} (${(((by('hard') - std) / std) * 100).toFixed(0)}%) — target: relaxed 15–25% faster, hard 15–25% slower, no stall over ~120 days.`,
  );
  return out.join('\n');
}

describe.skipIf(!RUN)('balance report', () => {
  for (const act of ACTS) {
    it(`Act ${act} on every difficulty`, () => {
      const rows: RunResult[] = [];
      for (const d of DIFFS)
        for (const seed of SEEDS) {
          if (act !== 1) {
            rows.push(runAct(act, d, seed));
            continue;
          }
          // Act I: try a grid of sensible plans; the fastest one that finishes is what a good player gets
          const tries = act1Plans().map((p) => ({ p, r: runAct(1, d, seed, p) }));
          const ok = tries.filter((t) => t.r.finished).sort((a, b) => a.r.years - b.r.years);
          const best = ok[0] ?? tries.sort((a, b) => b.r.years - a.r.years)[0];
          rows.push({ ...best.r, plan: `${ok.length}/${tries.length} plans finish; best: rent ${best.p.rental}, ${best.p.orders} chips, ${best.p.battery ? 'battery' : 'no battery'}, infer ${best.p.infer}` });
        }
      const md = report(act, rows);
      fs.writeFileSync(path.join(OUT, `balance-act${act}.md`), md + '\n');
      fs.writeFileSync(path.join(OUT, `balance-act${act}.json`), JSON.stringify(rows, null, 1));
      // eslint-disable-next-line no-console
      console.log('\n' + md + '\n');
      for (const r of rows) expect(r.nan, `${r.difficulty} ${r.seed}`).toBeNull();
    }, 60 * 60 * 1000);
  }
});
