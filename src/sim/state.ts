import { RIVALS_START } from '../content/companies';
import { DIFFICULTIES, FOUNDERS, type Difficulty, type EventRate, type FounderId, type RivalPace } from '../content/difficulty';
import { REGION_IDS } from '../content/mapcodes';
import { REGIONS } from '../content/regions';
import { SITES } from '../content/sites';
import type { GameState, Stats } from './types';
import { monthKey, randInt } from './core';
import { emptyLedger } from './economy';
import { kardashev, worldBaselineTW } from './model';

export const SAVE_VERSION = 5;

export interface NewGameOptions {
  name: string;
  homeSite: string;
  seed?: number;
  difficulty?: Difficulty;
  founder?: FounderId;
  eventRate?: EventRate;
  rivalPace?: RivalPace;
  /** Overrides the difficulty's seed money (custom start). */
  startCash?: number;
  tutorial?: boolean;
}

export function emptyStats(): Stats {
  return {
    ownedAccel: 0, installedAccel: 0, rentedAccel: 0, computeEF: 0, trainPFd: 0, powerLoad: 0, powerServed: 0, playerGenMW: 0,
    revenueMonth: 0, costMonth: 0, rpPerDay: 0, capability: 0, frontier: 0, alignment: 0, margin: 0,
    K: kardashev(worldBaselineTW(0) * 1e12), worldTW: worldBaselineTW(0), inferQuality: 0, inferDemand: 0, carbonMtYear: 0, sitePower: {},
    itMW: 0, genAvgMW: 0, cleanGenMW: 0, served: {}, demandByRegion: {}, pools: {},
  };
}

/**
 * Fill in every Act II field that is missing. New games and old saves both pass through here,
 * so the systems always exist (they stay dormant until Act II).
 */
export function ensureAct2State(s: GameState): GameState {
  s.act ??= s.flags?.act1Complete && s.flags?.act2Started ? 2 : 1;
  s.phase ??= 0;
  s.network ??= { fiber: [], leases: [], own: [], cuts: {} };
  s.stack ??= { deals: [], stakes: {} };
  s.market.pkg ??= 1;
  s.market.materials ??= { lithium: 1, copper: 1, helium: 1, neon: 1 };
  s.events.scheduled ??= [];
  s.politics ??= { rules: [], treaties: [], pending: [], nextSummit: 0 };
  s.capital ??= { board: null, loans: [], contracts: [], offers: [], sovereign: [], ipo: null };
  s.rivalBuilds ??= [];
  s.startups ??= { offers: [], bought: [], nextOffer: 0 };
  s.jobs ??= {};
  s.finale ??= null;
  // Act III (created when the act begins)
  s.charter ??= null;
  // Act IV (created when the act begins)
  s.planet ??= null;
  s.finance.month.debt ??= 0;
  for (const h of s.finance.history) h.debt ??= 0;
  s.talent ??= Object.fromEntries(REGION_IDS.map((r) => [r, 1])) as GameState['talent'];
  if (!s.blocs) {
    s.blocs = {} as GameState['blocs'];
    REGION_IDS.forEach((r, i) => {
      const def = REGIONS[r];
      s.blocs[r] = {
        relation: Math.round(40 + (def.license0 - 50) * 0.4),
        stance: def.stance,
        // elections staggered over the act
        nextElection: 900 + ((i * 397) % 1460),
        poll: 0,
        licences: [],
        lobby: 0,
      };
    });
  }
  for (const site of SITES) if (site.kind === 'build' && !s.sites[site.id]) s.sites[site.id] = { grid: { mw: 0, pending: [] }, inventory: [] };
  const st = s.stats as Partial<Stats>;
  st.itMW ??= 0;
  st.genAvgMW ??= 0;
  st.cleanGenMW ??= 0;
  st.served ??= {};
  st.demandByRegion ??= {};
  st.pools ??= {};
  return s;
}

export function newGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
  const difficulty = opts.difficulty ?? 'standard';
  const founder = FOUNDERS[opts.founder ?? 'classic'];
  const startCash = Math.max(10e6, (opts.startCash ?? DIFFICULTIES[difficulty].cash) + founder.cash);
  const s = {
    version: SAVE_VERSION,
    meta: {
      difficulty,
      founder: founder.id,
      eventRate: opts.eventRate ?? 'normal',
      rivalPace: opts.rivalPace ?? 'normal',
      startCash,
      playtime: 0,
      tutorialStep: opts.tutorial ? 0 : -1,
      createdAt: Date.now(),
    },
    seed,
    rng: seed,
    day: 0,
    company: { name: opts.name.trim() || 'Little Sun Labs', homeSite: opts.homeSite },
    finance: { cash: startCash, round: 'seed', valuation: 80e6, month: emptyLedger(), monthKey: monthKey(0), history: [], bridgeLoans: 0 },
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
    regions: Object.fromEntries(REGION_IDS.map((r) => [r, { license: Math.max(0, Math.min(100, REGIONS[r].license0 + founder.trust)) }])) as GameState['regions'],
    market: { rivals: [], hbm: 1, gasPrice: 1, pkg: 1, materials: { lithium: 1, copper: 1, helium: 1, neon: 1 } },
    modifiers: [],
    events: { active: null, queue: [], history: [], last: {}, nextRoll: 50, scheduled: [] },
    objectives: { done: [] },
    flags: {},
    news: [],
    carbon: { cumMt: 0 },
    built: {},
    stats: emptyStats(),
    nextId: 1,
    act: 1,
    phase: 0,
  } as unknown as GameState;
  for (const site of SITES) if (site.kind === 'build') s.sites[site.id] = { grid: { mw: site.id === opts.homeSite ? 1 : 0, pending: [] }, inventory: [] };
  s.market.rivals = RIVALS_START.map((r) => ({ id: r.id, name: r.name, capability: r.capability, open: r.open, modelGen: r.open ? 3 : 5, nextRelease: randInt(s, 40, r.cadence) }));
  s.events.active = { id: 'welcome', ctx: {}, day: 0 };
  s.events.last.welcome = 0;
  return ensureAct2State(s);
}
