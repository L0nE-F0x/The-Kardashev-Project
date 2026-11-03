/**
 * Act II framework: starting the act (from a finished Act I or the "Start at Act II" preset),
 * phase transitions, the Series B, the race, the finale trigger and the IPO.
 */
import { EXPORT_RULES } from '../content/politics';
import { IPO_GOALS, OBJECTIVES, SERIES_B_GOALS } from '../content/objectives';
import { DIFFICULTIES } from '../content/difficulty';
import { BUILD_SITES, siteDef } from '../content/sites';
import type { GameState } from './types';
import { monthKey, news, randInt } from './core';
import { queueEvent, scheduleEvent } from './events';
import { startFinale } from './finale';
import { alignmentOf, algoEff, capabilityOf, chipSpec, currentCapability, dcCapacityUnits, frontier } from './model';
import { newGame, type NewGameOptions } from './state';
import { tickRivals } from './ai';
import { techMult } from './effects';

/** 1 July 2034: The Crunch starts by then even if the checklist isn't done. */
export const CRUNCH_DEADLINE = Math.round((Date.UTC(2034, 6, 1) - Date.UTC(2027, 0, 1)) / 86_400_000);

export function beginAct2(s: GameState): void {
  if ((s.act ?? 1) >= 2) return;
  s.act = 2;
  s.phase = 1;
  s.flags.act2Started = s.day;
  s.flags.phase1Day = s.day;
  s.politics.rules = EXPORT_RULES.filter((r) => r.initial).map((r) => r.id);
  s.politics.nextSummit = s.day + 420;
  s.startups.nextOffer = s.day + 90;
  for (const r of s.market.rivals) r.nextBuild = s.day + randInt(s, 20, 150);
  // elections are staggered over the act from the day it starts
  Object.values(s.blocs).forEach((b, i) => (b.nextElection = s.day + 120 + ((i * 397) % 1460)));
  queueEvent(s, 'act2-begin');
  news(s, '🎬 Act II · The Scale-Up begins.', 'good');
}

function enterPhase(s: GameState, n: number): void {
  s.phase = n;
  s.flags[`phase${n}Day`] = s.day;
  if (n === 2) queueEvent(s, 'phase-stack');
  if (n === 3) {
    queueEvent(s, 'phase-race');
    scheduleEvent(s, 'takeover-1', randInt(s, 180, 260));
  }
}

const done = (s: GameState, id: string) => s.objectives.done.includes(id);

export function tickAct(s: GameState): void {
  if ((s.act ?? 1) === 1) {
    if (s.flags.act1Complete && !s.events.active && !s.events.queue.length) beginAct2(s);
    return;
  }
  if (!s.flags.reachedFrontier && s.models.length >= 3 && currentCapability(s) >= frontier(s)) {
    s.flags.reachedFrontier = s.day;
    news(s, '🏁 You are at the frontier. For now.', 'good');
  }
  switch (s.phase) {
    case 1:
      if (!s.flags.seriesBQueued && SERIES_B_GOALS.every((id) => done(s, id))) {
        s.flags.seriesBQueued = true;
        queueEvent(s, 'series-b');
      }
      if (s.finance.round === 'B') enterPhase(s, 2);
      break;
    case 2: {
      const since = s.day - Number(s.flags.phase2Day ?? s.day);
      const phase2Done = OBJECTIVES.filter((o) => o.act === 2 && o.phase === 2 && done(s, o.id)).length;
      if ((phase2Done >= 3 && since >= 240) || since >= 540) enterPhase(s, 3);
      break;
    }
    case 3: {
      const ready = IPO_GOALS.every((id) => done(s, id));
      const late = s.day >= CRUNCH_DEADLINE && s.day - Number(s.flags.phase3Day ?? s.day) >= 180;
      if (ready || late) startFinale(s);
      break;
    }
    case 4:
      if (s.finale?.done && !s.flags.ipoQueued) {
        s.flags.ipoQueued = true;
        scheduleEvent(s, 'ipo', 12);
      }
      break;
  }
}

/** Pick the build site in the home region with the most room for a ready-made campus. */
function presetCampus(home: string): string {
  const region = siteDef(home).region;
  const options = BUILD_SITES.filter((x) => x.region === region && !x.act && x.slots >= 5);
  options.sort((a, b) => b.slots - a.slots || a.priceMult - b.priceMult);
  return options[0]?.id ?? home;
}

/**
 * "Start at Act II": a ready-made Series-A company in spring 2029. The home HQ stays where you
 * chose; the campus goes to the roomiest site in that region.
 */
export function newAct2Game(opts: NewGameOptions): GameState {
  const s = newGame({ ...opts, tutorial: false });
  s.events.active = null;
  const day = 800;
  // the world moves on without you for two years
  for (let d = 0; d < day; d++) {
    s.day = d;
    tickRivals(s);
  }
  s.day = day;
  s.meta.act2Start = true;
  s.finance.monthKey = monthKey(day);
  s.finance.cash = { relaxed: 2.6e9, standard: 2e9, hard: 1.5e9 }[s.meta.difficulty] ?? DIFFICULTIES.standard.cash * 5;
  s.finance.round = 'A';
  s.finance.valuation = 12e9;
  s.research.done = ['moe', 'distillation', 'scaling-laws', 'liquid-cooling', 'trackers', 'lfp-cells', 'interp-1', 'fast-track', 'hbm-futures', 'constitution', 'spec-decoding'];
  const eff = algoEff(s);
  s.models = [
    { name: 'Bit-1', gen: 1, flop: 1e24, capability: capabilityOf(1e24, eff / 3), day: 120 },
    { name: 'Bit-2', gen: 2, flop: 2e26, capability: capabilityOf(2e26, eff), day: 720 },
  ];
  const cap = s.models[1].capability;
  s.safety.cumFlop = Math.pow(10, cap + 22 - 0.15) / techMult(s, 'safetyEff');
  const campus = presetCampus(opts.homeSite);
  const spec = chipSpec(s, 'lumen');
  const dc = (id: string) => ({ id, type: 'datacenter' as const, siteId: campus, status: 'online' as const, progress: 450, buildDays: 450, startedDay: 200, onlineDay: 650, racks: [{ qty: Math.floor(dcCapacityUnits(spec.kw) * 0.95), perf: spec.perf * 0.8, kw: spec.kw, supplier: 'lumen' as const }] });
  s.facilities.push(
    dc('f101'),
    dc('f102'),
    { id: 'f103', type: 'solar', siteId: campus, status: 'online', progress: 270, buildDays: 270, startedDay: 300, onlineDay: 570 },
    { id: 'f104', type: 'battery', siteId: campus, status: 'online', progress: 180, buildDays: 180, startedDay: 400, onlineDay: 580 },
  );
  if (campus !== opts.homeSite) s.facilities.push({ id: 'f105', type: 'lab', siteId: opts.homeSite, status: 'online', progress: 180, buildDays: 180, startedDay: 300, onlineDay: 480 });
  s.sites[campus].grid.mw = 20;
  s.sites[opts.homeSite].grid.mw = Math.max(s.sites[opts.homeSite].grid.mw, 5);
  s.built = { datacenter: 2, solar: 1, battery: 1, lab: campus !== opts.homeSite ? 1 : 0 };
  s.nextId = 200;
  s.alloc = { train: 0.35, infer: 0.5, research: 0.05, safety: 0.1 };
  s.objectives.done = OBJECTIVES.filter((o) => (o.act ?? 1) === 1).map((o) => o.id);
  s.flags.act1Complete = day - 1;
  s.flags.act1Shown = true;
  s.flags.seriesAQueued = true;
  s.events.last = { welcome: 0, 'series-a': day - 1 };
  s.events.nextRoll = day + 60;
  void alignmentOf;
  s.news = [];
  beginAct2(s);
  // show the Act II card straight away
  s.events.active = s.events.queue.shift() ?? null;
  if (s.events.active) s.events.last[s.events.active.id] = s.day;
  return s;
}
