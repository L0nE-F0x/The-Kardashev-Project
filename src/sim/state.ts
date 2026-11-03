import { RIVALS_START } from '../content/companies';
import { REGION_IDS } from '../content/mapcodes';
import { REGIONS } from '../content/regions';
import { SITES } from '../content/sites';
import type { GameState, Stats } from './types';
import { monthKey, randInt } from './core';
import { emptyLedger } from './economy';
import { kardashev, START_CASH, worldBaselineTW } from './model';

export const SAVE_VERSION = 1;

export function emptyStats(): Stats {
  return {
    ownedAccel: 0, installedAccel: 0, rentedAccel: 0, computeEF: 0, trainPFd: 0, powerLoad: 0, powerServed: 0, playerGenMW: 0,
    revenueMonth: 0, costMonth: 0, rpPerDay: 0, capability: 0, frontier: 0, alignment: 0, margin: 0,
    K: kardashev(worldBaselineTW(0) * 1e12), worldTW: worldBaselineTW(0), inferQuality: 0, inferDemand: 0, carbonMtYear: 0, sitePower: {},
  };
}

export function newGame(opts: { name: string; homeSite: string; seed?: number }): GameState {
  const seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    day: 0,
    company: { name: opts.name.trim() || 'Little Sun Labs', homeSite: opts.homeSite },
    finance: { cash: START_CASH, round: 'seed', valuation: 80e6, month: emptyLedger(), monthKey: monthKey(0), history: [], bridgeLoans: 0 },
    facilities: [{ id: 'f0', type: 'hq', siteId: opts.homeSite, status: 'online', progress: 0, buildDays: 0, startedDay: 0, onlineDay: 0 }],
    sites: {},
    links: [],
    orders: [],
    shipments: [],
    rental: { units: 0 },
    alloc: { train: 0.7, infer: 0.2, research: 0.1, safety: 0 },
    training: null,
    models: [],
    research: { current: null, progress: 0, done: [], pool: 0 },
    safety: { cumFlop: 0, incidents: 0, lastIncidentDay: -999 },
    regions: Object.fromEntries(REGION_IDS.map((r) => [r, { license: REGIONS[r].license0 }])) as GameState['regions'],
    market: { rivals: [], hbm: 1, gasPrice: 1 },
    modifiers: [],
    events: { active: null, queue: [], history: [], last: {}, nextRoll: 50 },
    objectives: { done: [] },
    flags: {},
    news: [],
    carbon: { cumMt: 0 },
    built: {},
    stats: emptyStats(),
    nextId: 1,
  };
  for (const site of SITES) if (site.kind === 'build') s.sites[site.id] = { grid: { mw: site.id === opts.homeSite ? 1 : 0, pending: [] }, inventory: [] };
  s.market.rivals = RIVALS_START.map((r) => ({ id: r.id, name: r.name, capability: r.capability, open: r.open, modelGen: r.open ? 3 : 5, nextRelease: randInt(s, 40, r.cadence) }));
  s.events.active = { id: 'welcome', ctx: {}, day: 0 };
  s.events.last.welcome = 0;
  return s;
}
