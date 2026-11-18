/**
 * The whole campaign on one save: the garage → the IPO → the renewal → the Heat Wall → Type I.
 * `npm test` plays it once. The matrix (difficulty × founder × home site × how cards are answered × seeds, with
 * and without saving and loading along the way) runs with
 *   CAMPAIGN=1 npx vitest run tests/campaign.test.ts          (CAMPAIGN_DIR=… for the report, default the OS temp dir)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fmtDate } from '../src/sim/core';
import { HOME_SITES } from '../src/content/sites';
import type { Difficulty, FounderId } from '../src/content/difficulty';
import { loadWorld } from './helpers/world';
import { act1Plans, ACT1_DEFAULT, type Act1Plan } from './helpers/act1bot';
import { differences, playCampaign, type CampaignOpts, type CampaignResult, type Pick } from './helpers/campaign';

const ctx = { router: loadWorld().router };
const MATRIX = !!process.env.CAMPAIGN;
const OUT = process.env.CAMPAIGN_DIR ?? os.tmpdir();

const yr = (d: number | null | undefined) => (d === null || d === undefined ? '—' : fmtDate(d, true));
const span = (r: CampaignResult, a: number) => (r.acts[a]?.end != null ? ((r.acts[a].end! - r.acts[a].start) / 365).toFixed(1) : r.acts[a] ? 'open' : '—');

/** Act I needs a plan that fits the difficulty's seed money: the default, or the first of the grid that finishes. */
function planFor(o: CampaignOpts): Act1Plan {
  const tries = [ACT1_DEFAULT, ...act1Plans()];
  for (const plan of tries) {
    const r = playCampaign({ ...o, plan, untilAct: 1, maxDays: 365 * 6 }, ctx);
    if (r.acts[1].end !== null && !r.gameOver) return plan;
  }
  return ACT1_DEFAULT;
}

function line(label: string, r: CampaignResult): string {
  const top = Object.entries(r.cards).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${id}×${n}`).join(' ');
  return `| ${label} | ${r.typeI ? yr(r.typeI) : r.gameOver ? '**game over**' : '**never**'} | ${[1, 2, 3, 4, 5].map((a) => span(r, a)).join(' / ')} | ${[1, 2, 3, 4, 5].map((a) => r.cardsByAct[a] ?? 0).join(' / ')} | ${r.stall.days} d (act ${r.stall.act}, from ${yr(r.stall.from)}) | ${top} | ${r.problems.length ? r.problems.slice(0, 3).join(' ; ') : 'none'} | ${(r.ms / 1000).toFixed(0)} s |`;
}

describe('the whole campaign on one save', () => {
  it('a player who follows the advisors goes from the garage to Type I', () => {
    const r = playCampaign({ name: 'Campaign Bot', homeSite: 'bay-area', seed: 21 }, ctx);
    // eslint-disable-next-line no-console
    console.log(`Type I ${yr(r.typeI)} · years per act ${[1, 2, 3, 4, 5].map((a) => span(r, a)).join(' / ')} · cards ${[1, 2, 3, 4, 5].map((a) => r.cardsByAct[a] ?? 0).join(' / ')} · longest wait ${r.stall.days} d in act ${r.stall.act}`);
    expect(r.problems).toEqual([]);
    expect(r.gameOver).toBe(false);
    expect(r.typeI).not.toBeNull();
    for (let a = 1; a <= 5; a++) expect(r.acts[a]?.end, `act ${a} ends`).not.toBeNull();
  }, 300_000);

  it('saving and loading along the way changes nothing', () => {
    const o: CampaignOpts = { name: 'Campaign Bot', homeSite: 'bay-area', seed: 21, untilAct: 3 };
    const a = playCampaign(o, ctx);
    const b = playCampaign({ ...o, reloadEvery: 97 }, ctx);
    expect(b.problems).toEqual([]);
    expect(b.s.day).toBe(a.s.day);
    b.s.meta.createdAt = a.s.meta.createdAt; // the one thing that is the clock's, not the game's
    expect(differences(JSON.parse(JSON.stringify(a.s)), JSON.parse(JSON.stringify(b.s)))).toEqual([]);
  }, 300_000);
});

describe.skipIf(!MATRIX)('the campaign matrix', () => {
  it('every kind of player reaches Type I', () => {
    const rows: string[] = ['| Run | Type I | Years per act I / II / III / IV / V | Cards per act | Longest wait (I–III) | Most seen cards | Problems | Run |', '|---|---|---|---|---|---|---|---|'];
    const bad: string[] = [];
    const run = (label: string, o: CampaignOpts) => {
      const plan = planFor(o);
      const r = playCampaign({ ...o, plan }, ctx);
      rows.push(line(label, r));
      if (r.problems.length || !r.typeI) bad.push(`${label}: ${r.typeI ? '' : r.gameOver ? 'game over. ' : 'never reached Type I. '}${r.problems.join(' ; ')}`);
      fs.writeFileSync(path.join(OUT, 'campaign-matrix.md'), rows.join('\n') + '\n');
      return r;
    };
    const base = { name: 'Matrix Bot', homeSite: 'bay-area' };
    const diffs: Difficulty[] = ['relaxed', 'standard', 'hard'];
    const founders: FounderId[] = ['classic', 'safety', 'hardware', 'growth', 'energy', 'steward'];
    const picks: Pick[] = ['first', 'last', 'random'];
    for (const difficulty of diffs) for (const seed of [21, 7, 42]) run(`${difficulty} · seed ${seed}`, { ...base, difficulty, seed });
    for (const founder of founders.slice(1)) for (const difficulty of diffs) run(`${founder} · ${difficulty}`, { ...base, founder, difficulty, seed: 5 });
    for (const site of HOME_SITES) run(`home ${site.id}`, { ...base, homeSite: site.id, seed: 9 });
    for (const pick of picks.slice(1)) for (const difficulty of diffs) for (const seed of [3, 11, 19]) run(`cards: ${pick} · ${difficulty} · seed ${seed}`, { ...base, pick, pickSeed: seed, difficulty, seed });
    for (const eventRate of ['off', 'low', 'high'] as const) run(`events ${eventRate}`, { ...base, eventRate, seed: 13 });
    for (const rivalPace of ['slow', 'fast'] as const) run(`rivals ${rivalPace}`, { ...base, rivalPace, seed: 13 });
    for (const reloadEvery of [1, 30, 365]) run(`reload every ${reloadEvery} d`, { ...base, reloadEvery, seed: 21 });
    // eslint-disable-next-line no-console
    console.log('\n' + rows.join('\n') + '\n');
    expect(bad).toEqual([]);
  }, 4 * 60 * 60 * 1000);
});
