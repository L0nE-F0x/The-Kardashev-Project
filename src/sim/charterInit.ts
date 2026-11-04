/** The Kardashev Project's starting state (Act III). Kept separate so tests and previews can build one cheaply. */
import { ACCESS0, CHARTER, FACTION_IDS, PARTNERS, WORLD0 } from '../content/charter';
import { REGION_IDS } from '../content/mapcodes';
import type { CharterLedger, CharterState, FactionId, GameState, WorldBloc } from './types';
import { clamp, monthKey } from './core';
import { worldBaselineTW } from './model';

export const emptyCharterLedger = (): CharterLedger => ({ dues: 0, income: 0, payments: 0, programmes: 0, favours: 0, other: 0 });

/** A fresh Charter for this company, shaped by how Act II ended. */
export function createCharter(s: GameState): CharterState {
  const standing = clamp(Math.round(s.finale?.standing ?? Number(s.flags.charterStanding ?? 1)), 0, 3);
  const tw = worldBaselineTW(s.day);
  const blocs = {} as Record<(typeof REGION_IDS)[number], WorldBloc>;
  for (const r of REGION_IDS) blocs[r] = { tw: tw * WORLD0[r].share, clean: WORLD0[r].clean };
  const clean = REGION_IDS.reduce((a, r) => a + blocs[r].tw * blocs[r].clean, 0) / tw;
  const partners: CharterState['partners'] = {};
  for (const [id, def] of Object.entries(PARTNERS)) {
    if ((def.act ?? 3) > 3) continue; // Act IV's partners join when that act begins
    let rel = def.rel0;
    // companies you did business with in Act II remember it
    if ((s.stack?.deals ?? []).some((d) => d.partner === id)) rel += 10;
    if (id === 'meridian' && s.flags.investorSeat) rel += 15;
    if (id === 'littlesun' && s.facilities.some((f) => f.type === 'smr')) rel += 8;
    if (id === 'kestrel' && s.facilities.some((f) => f.type === 'fab')) rel += 10;
    partners[id] = { rel: clamp(rel, 0, 100), won: 0, done: 0, snubs: 0 };
  }
  const factions = Object.fromEntries(FACTION_IDS.map((f) => [f, { tension: f === 'eastern' ? 30 : 20 }])) as Record<FactionId, { tension: number }>;
  if (s.flags.broker) factions.eastern.tension -= 10;
  return {
    phase: 1,
    founded: s.day,
    budget: CHARTER.founding,
    month: emptyCharterLedger(),
    monthKey: monthKey(s.day),
    history: [],
    dues: 1,
    legitimacy: clamp(40 + 6 * standing + (s.flags.broker ? 5 : 0) - (s.flags.dualClass ? 3 : 0), 0, 100),
    capital: 10 + 10 * standing,
    standing,
    partners,
    tenders: [],
    projects: [],
    missions: {},
    access: { ...ACCESS0 },
    blindTrust: false,
    trustDay: -9999,
    desk: {},
    world: { tw, growth: CHARTER.baseGrowth, charterTW: 0, blocs, carbonGt: CHARTER.carbon0, co2Gt: tw * (1 - clean) * CHARTER.gtPerFossilTW, newClean: 0.35 },
    council: {
      passed: [],
      agenda: [],
      nextSession: s.day + 75,
      sessions: 0,
      sway: {},
      factions,
      walkouts: {},
      late: {},
      concord: null,
      history: [],
    },
    regime: { alignment: 0, marginDays: 0, ownLicence: null, incidents: 0, lastIncident: -9999 },
    threshold: null,
    renewal: null,
  };
}
