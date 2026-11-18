/**
 * One save from the garage to Type I: the five acts' bots chained on a single state, the way a player's own
 * campaign runs (the per-act tests start from presets). Along the way it watches for what must never happen to a
 * paying player: an exception, a number that isn't one (NaN is written to a save as null), a card nobody can
 * answer, a stretch where nothing moves, a company that ends.
 *
 * Used by tests/campaign.test.ts (one run in `npm test`; the matrix with CAMPAIGN=1).
 */
import { newGame, type NewGameOptions } from '../../src/sim/state';
import { tick } from '../../src/sim/tick';
import { dismissEvent, resolveEvent } from '../../src/sim/events';
import { EVENT_BY_ID } from '../../src/content/events';
import { migrate } from '../../src/save/save';
import type { GameState } from '../../src/sim/types';
import type { SimContext } from '../../src/sim/supply';
import { ACT1_DEFAULT, botDay1, type Act1Plan } from './act1bot';
import { botDay4 } from './act4bot';
import { botDay5 } from './act5bot';

/** How the campaign's player answers a card: the suggested choice, the last one on the card, or any at random. */
export type Pick = 'first' | 'last' | 'random';

export interface CampaignOpts extends NewGameOptions {
  pick?: Pick;
  /** Seed for `pick: 'random'` (its own generator: the sim's stays untouched). */
  pickSeed?: number;
  plan?: Act1Plan;
  /** Save and load (JSON + migrate) every this many days, as a player who quits and comes back does. */
  reloadEvery?: number;
  /** Stop here even if Type I hasn't come (default: 110 game years). */
  maxDays?: number;
  /** Stop when this act is complete (to test one stretch). */
  untilAct?: number;
  /** Called after every tick. */
  onDay?: (s: GameState) => void;
}

export interface CampaignResult {
  s: GameState;
  /** The day each act began (act 1: 0) and was completed (its flag). */
  acts: Record<number, { start: number; end: number | null }>;
  typeI: number | null;
  gameOver: boolean;
  days: number;
  /** Cards put in front of the player: by id, and how many per act. */
  cards: Record<string, number>;
  cardsByAct: Record<number, number>;
  /** Everything that must not happen, with the day it did. */
  problems: string[];
  /** The longest stretch with no goal, model, phase or stage moving, in Acts I–III (the later acts jump). */
  stall: { days: number; from: number; act: number };
  ms: number;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every number in the state that isn't finite, as paths (`charter.world.tw`). */
export function nonFinite(v: unknown, path = '', out: string[] = [], depth = 0): string[] {
  if (out.length > 12 || depth > 12) return out;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} = ${v}`);
  } else if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) nonFinite(v[i], `${path}[${i}]`, out, depth + 1);
  } else if (v && typeof v === 'object') {
    for (const k in v as Record<string, unknown>) nonFinite((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out, depth + 1);
  }
  return out;
}

/** Where two states differ (paths), for a short failure message instead of two megabytes of JSON. */
export function differences(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 12) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    if (!(a === undefined && b === undefined)) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} ≠ ${JSON.stringify(b)?.slice(0, 60)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out);
  return out;
}

const progressMark = (s: GameState) =>
  `${s.act}|${s.objectives.done.length}|${s.models.length}|${s.phase}|${s.charter?.phase ?? 0}|${s.planet?.stage ?? 0}|${s.planet?.jumps.length ?? 0}|${s.system?.stage ?? 0}|${s.system?.eras.length ?? 0}`;

export function playCampaign(opts: CampaignOpts, ctx: SimContext): CampaignResult {
  const t0 = Date.now();
  let s = newGame(opts);
  const pick = opts.pick ?? 'first';
  const rnd = mulberry(opts.pickSeed ?? 1);
  const maxDays = opts.maxDays ?? 365 * 110;
  const plan = opts.plan ?? ACT1_DEFAULT;
  const acts: CampaignResult['acts'] = { 1: { start: 0, end: null } };
  const cards: Record<string, number> = {};
  const cardsByAct: Record<number, number> = {};
  const problems: string[] = [];
  const problem = (what: string) => {
    if (problems.length < 40) problems.push(`day ${s.day} (act ${s.act}): ${what}`);
  };
  let seen: unknown = null;
  let mark = progressMark(s);
  let lastMove = 0;
  const stall = { days: 0, from: 0, act: 1 };
  let stuckCard = 0;

  /** Answer the card on the table the way this campaign's player does. */
  const answer = () => {
    for (let guard = 0; guard < 30 && s.events.active; guard++) {
      const active = s.events.active;
      const def = EVENT_BY_ID[active.id];
      if (!def) {
        problem(`a card with no definition: ${active.id}`);
        s.events.active = null;
        return;
      }
      const choices = def.choices(s, active.ctx);
      const open = choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
      if (!open.length) {
        // the interface shows Continue: it must work
        if (!dismissEvent(s)) problem(`card ${active.id}: no choice can be taken and it can't be dismissed`);
        continue;
      }
      const i = pick === 'first' ? open[0] : pick === 'last' ? open[open.length - 1] : open[Math.floor(rnd() * open.length)];
      if (!resolveEvent(s, i)) problem(`card ${active.id}: choice ${i} refused`);
    }
  };

  for (let d = 0; d < maxDays; d++) {
    if (s.flags.typeI || s.meta.gameOver) break;
    if (opts.untilAct && s.flags[`act${opts.untilAct}Complete`]) break;
    try {
      if (s.events.active && s.events.active !== seen) {
        cards[s.events.active.id] = (cards[s.events.active.id] ?? 0) + 1;
        cardsByAct[s.act] = (cardsByAct[s.act] ?? 0) + 1;
      }
      seen = s.events.active;
      answer();
      if (s.act <= 1) botDay1(s, ctx, plan);
      else if (!s.system) botDay4(s, ctx);
      else botDay5(s, ctx);
      // a card the bots' own answering left on the table for days is a card nobody can answer
      if (s.events.active && s.events.active === seen) {
        if (++stuckCard === 30) problem(`card ${s.events.active.id} has sat unanswered for 30 days`);
      } else stuckCard = 0;
      tick(s, ctx);
    } catch (e) {
      problem(`exception: ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ') ?? e}`);
      break;
    }
    // acts as they turn
    for (let a = 1; a <= 4; a++) {
      const flag = s.flags[`act${a}Complete`];
      if (flag && acts[a] && acts[a].end === null) acts[a].end = Number(flag);
      if (s.act > a && !acts[a + 1]) acts[a + 1] = { start: s.day, end: null };
    }
    const m = progressMark(s);
    if (m !== mark) {
      mark = m;
      lastMove = s.day;
    } else if (s.act <= 3 && s.day - lastMove > stall.days) {
      stall.days = s.day - lastMove;
      stall.from = lastMove;
      stall.act = s.act;
    }
    if (s.day % 30 === 0) for (const p of nonFinite(s)) problem(`not a number: ${p}`);
    if (opts.reloadEvery && s.day % opts.reloadEvery === 0) {
      const back = migrate(JSON.parse(JSON.stringify(s)));
      if (!back) {
        problem('the save would not load');
        break;
      }
      s = back;
      seen = s.events.active;
    }
    opts.onDay?.(s);
  }
  for (const p of nonFinite(s)) problem(`not a number at the end: ${p}`);
  if (s.flags.typeI && acts[5]) acts[5].end = Number(s.flags.typeI);
  return { s, acts, typeI: s.flags.typeI ? Number(s.flags.typeI) : null, gameOver: !!s.meta.gameOver, days: s.day, cards, cardsByAct, problems, stall, ms: Date.now() - t0 };
}
