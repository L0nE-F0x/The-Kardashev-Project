/**
 * Act III framework: founding the Charter (from a finished Act II or the "Start at Act III" preset),
 * the Charter's phases, the Mandate, The Threshold, the renewal vote and the ending.
 */
import { MANDATE_GOALS, OBJECTIVES } from '../content/objectives';
import { THRESHOLD_DEADLINE } from '../content/charter';
import { TECHS } from '../content/techs';
import { BUILD_SITES, siteDef } from '../content/sites';
import { DIFFICULTIES } from '../content/difficulty';
import { CABLES } from '../content/network';
import type { Facility, GameState } from './types';
import { monthKey, news, nextId } from './core';
import { queueEvent, scheduleEvent } from './events';
import { createCharter } from './charterInit';
import { initialWorldAlignment } from './frontier';
import { startThreshold } from './threshold';
import { algoEff, capabilityOf, chipSpec, dcCapacityUnits, facilityIT } from './model';
import { tickRivals } from './ai';
import { techMult } from './effects';
import { newAct2Game } from './act2';
import type { NewGameOptions } from './state';

export function beginAct3(s: GameState): void {
  if ((s.act ?? 1) >= 3) return;
  s.act = 3;
  s.phase = 5;
  s.flags.act3Started = s.day;
  s.flags.cphase1Day = s.day;
  s.charter = createCharter(s);
  s.charter.regime.alignment = initialWorldAlignment(s);
  queueEvent(s, 'act3-begin', { standing: s.charter.standing });
  scheduleEvent(s, 'founding-seat', 20);
  scheduleEvent(s, 'founding-budget', 45);
  scheduleEvent(s, 'kip-1', 70);
  scheduleEvent(s, 'bit-5q', 200);
  news(s, '🎬 Act III · The Charter begins.', 'good');
}

function enterCharterPhase(s: GameState, n: number): void {
  const c = s.charter!;
  c.phase = n;
  s.flags[`cphase${n}Day`] = s.day;
  if (n === 2) queueEvent(s, 'cphase-buildout');
  if (n === 3) queueEvent(s, 'cphase-frontier');
}

const done = (s: GameState, id: string) => s.objectives.done.includes(id);

export function tickAct3(s: GameState): void {
  if ((s.act ?? 1) === 2) {
    if (s.flags.act2Complete && !s.events.active && !s.events.queue.length) beginAct3(s);
    return;
  }
  const c = s.charter;
  if (!c) return;
  const since = (n: number) => s.day - Number(s.flags[`cphase${n}Day`] ?? s.day);
  switch (c.phase) {
    case 1: {
      const ready = c.projects.length > 0 && c.council.history.some((h) => h.passed) && !!s.flags.budgetRatified;
      if (ready || since(1) >= 360) enterCharterPhase(s, 2);
      break;
    }
    case 2: {
      const built = c.projects.filter((p) => p.status === 'done').length;
      if ((built >= 6 && s.stats.K >= 0.738) || since(2) >= 900) enterCharterPhase(s, 3);
      break;
    }
    case 3: {
      const ready = MANDATE_GOALS.every((id) => done(s, id));
      const late = s.day >= THRESHOLD_DEADLINE && since(3) >= 365;
      if (ready || late) startThreshold(s);
      break;
    }
    case 4:
      if (c.threshold?.done && !s.flags.renewalQueued) {
        s.flags.renewalQueued = true;
        scheduleEvent(s, 'renewal', 14);
      }
      break;
  }
}

/** The best megasite for a home region (or any open one). */
function presetMegasite(home: string): string {
  const region = siteDef(home).region;
  const mega = BUILD_SITES.filter((x) => x.megasite);
  return (mega.find((x) => x.region === region) ?? mega.find((x) => x.id === 'wyoming') ?? mega[0]).id;
}

/**
 * "Start at Act III": a public company in January 2035 — a gigawatt campus, two 200 MW halls at home,
 * its own clean power, Bit-4, ~$25B and Charter Standing 2.
 */
export function newAct3Game(opts: NewGameOptions): GameState {
  const s = newAct2Game(opts);
  s.events.active = null;
  s.events.queue = [];
  s.events.scheduled = [];
  const day = 2929;
  for (let d = s.day; d < day; d++) {
    s.day = d;
    tickRivals(s);
  }
  s.day = day;
  s.meta.act3Start = true;
  s.finance.monthKey = monthKey(day);
  s.finance.cash = { relaxed: 32e9, standard: 25e9, hard: 18e9 }[s.meta.difficulty] ?? DIFFICULTIES.standard.cash * 60;
  s.finance.round = 'IPO';
  s.finance.valuation = 420e9;
  s.capital.ipo = { day: day - 60, valuation: 420e9, raised: 45e9 };
  s.capital.board = { confidence: 65, nextReview: day + 90, baseline: 1.4e9, misses: 0, target: 0.08 };
  s.research.done = TECHS.filter((t) => (t.act ?? 1) <= 2).map((t) => t.id);
  const eff = algoEff(s);
  s.models = [
    { name: 'Bit-1', gen: 1, flop: 1e24, capability: capabilityOf(1e24, eff / 20), day: 120 },
    { name: 'Bit-2', gen: 2, flop: 2e26, capability: capabilityOf(2e26, eff / 10), day: 720 },
    { name: 'Bit-3', gen: 3, flop: 1e27, capability: capabilityOf(1e27, eff / 3), day: 1500 },
    { name: 'Bit-4', gen: 4, flop: 2e28, capability: capabilityOf(2e28, eff), day: 2600 },
  ];
  const cap = s.models[3].capability;
  s.safety.cumFlop = Math.pow(10, cap + 22 + 0.1) / techMult(s, 'safetyEff');
  // the home campus: the two preset halls grow to 200 MW, plus solar, batteries and wind
  const campusSite = s.facilities.find((f) => f.type === 'datacenter')?.siteId ?? opts.homeSite;
  const spec = chipSpec(s, 'lumen');
  const fill = (f: Facility, k = 0.85) => (f.racks = [{ qty: Math.floor(dcCapacityUnits(spec.kw, facilityIT(f)) * k), perf: spec.perf * 0.85, kw: spec.kw, supplier: 'lumen' }]);
  for (const f of s.facilities) {
    if (f.type === 'datacenter') {
      f.tier = 3;
      fill(f);
    }
    if (f.type === 'solar' || f.type === 'battery') f.tier = 3;
  }
  const add = (type: Facility['type'], siteId: string, tier = 1): Facility => {
    const f: Facility = { id: nextId(s, 'f'), type, siteId, status: 'online', progress: 1, buildDays: 1, startedDay: day - 400, onlineDay: day - 60, tier };
    if (type === 'datacenter' || type === 'campus') f.racks = [];
    s.facilities.push(f);
    return f;
  };
  add('wind', campusSite, 3);
  // the gigawatt campus at a megasite
  const mega = presetMegasite(opts.homeSite);
  const campus = add('campus', mega);
  fill(campus, 0.7);
  add('solar', mega, 3);
  add('solar', mega, 3);
  add('battery', mega, 3);
  add('battery', mega, 3);
  add('wind', mega, 3);
  add('packaging', campusSite, 2);
  s.sites[campusSite].grid.mw = 300;
  s.sites[mega].grid.mw = 250;
  s.built = { datacenter: 6, solar: 4, battery: 4, wind: 3, campus: 1, packaging: 1, lab: 1 };
  s.network.leases = CABLES.slice(0, 2).map((c) => c.id);
  s.alloc = { train: 0.3, infer: 0.52, research: 0.06, safety: 0.12 };
  s.objectives.done = OBJECTIVES.filter((o) => (o.act ?? 1) <= 2).map((o) => o.id);
  Object.assign(s.flags, { seriesBQueued: true, ipoQueued: true, reachedFrontier: 2600, act2Complete: day - 30, act2Shown: true, boardPassed: day - 120 });
  s.finale = { startDay: day - 160, endDay: day - 70, fronts: { grid: { pressure: 60, lost: false }, supply: { pressure: 80, lost: false }, safety: { pressure: 100, lost: true } }, regions: [siteDef(campusSite).region], rival: 'meridian', done: true, standing: 2 };
  s.phase = 5;
  s.politics.treaties = ['evals-pact'];
  for (const id of ['mira', 'juno', 'penny', 'iris', 'bit', 'sol'] as const) s.jobs[id] = { on: true, a: { mira: 1.5e9, juno: 0.2, penny: 3e9, iris: 0.1, bit: 0.4, sol: 60e6 }[id], b: id === 'juno' || id === 'mira' ? 0 : undefined };
  s.events.last = { welcome: 0, 'series-a': 799, 'act2-begin': 800, ipo: day - 30 };
  // the Act II arcs already happened to this company
  for (const id of ['hbm-1', 'hbm-2', 'hbm-3', 'lines-1', 'lines-2', 'lines-3', 'restart-1', 'restart-2', 'race-1', 'race-2', 'bit-3', 'bit-4', 'queue-reform', 'sovereign-wealth', 'chip-diversion', 'takeover-1', 'takeover-2'])
    s.events.last[id] = day - 400;
  s.events.nextRoll = day + 75;
  // the Act II clocks restart: elections staggered over the coming years, the next startups in a few months
  Object.values(s.blocs).forEach((b, i) => (b.nextElection = day + 150 + ((i * 397) % 1460)));
  s.startups.nextOffer = day + 120;
  s.startups.offers = [];
  s.news = [];
  beginAct3(s);
  s.events.active = s.events.queue.shift() ?? null;
  if (s.events.active) s.events.last[s.events.active.id] = s.day;
  return s;
}
