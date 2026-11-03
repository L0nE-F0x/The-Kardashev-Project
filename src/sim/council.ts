/**
 * Act III: the Council of the Kardashev Project. Resolutions are tabled with political capital and
 * voted on every 90 days by twelve weighted seats. A bloc's vote comes from the resolution's appeal
 * to its stance, faction and wealth, plus relations, Legitimacy and whatever you did to sway it.
 * Factions build tension; very unhappy blocs walk out; a lot of tension founds the rival Concord.
 */
import { CHARTER, FACTION_IDS, FACTIONS, factionOf, TOTAL_VOTES, VOTES, WEALTH } from '../content/charter';
import { RESOLUTION_BY_ID, type ResolutionDef } from '../content/council';
import { REGIONS } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { FactionId, GameState } from './types';
import { clamp, fmtMoney, news, pick, rand } from './core';
import { addRelation } from './politics';
import { queueEvent } from './events';
import { addCapital, addLegitimacy, addPartnerRel, chSpend } from './charter';

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export type Vote = 'yes' | 'no' | 'abstain' | 'absent';

/** How a bloc leans on a resolution (positive = yes). */
export function voteScore(s: GameState, r: RegionId, res: ResolutionDef): number {
  const c = s.charter!;
  const b = s.blocs[r];
  const f = factionOf(r);
  let v = res.base ?? 0;
  v += res.appeal.stance?.[b.stance] ?? 0;
  v += res.appeal.faction?.[f] ?? 0;
  v += res.appeal.wealth?.[WEALTH[r]] ?? 0;
  v += res.appeal.blocs?.[r] ?? 0;
  v += (b.relation - 50) / 100;
  v += (c.legitimacy - 50) / 150;
  v += c.council.sway[r] ?? 0;
  v -= Math.max(0, c.council.factions[f].tension - 40) / 250;
  return v;
}

export function voteOf(s: GameState, r: RegionId, res: ResolutionDef): Vote {
  const c = s.charter!;
  if (c.council.walkouts[r]) return 'absent';
  const v = voteScore(s, r, res);
  return v > 0.1 ? 'yes' : v < -0.1 ? 'no' : 'abstain';
}

export interface Forecast {
  votes: Record<RegionId, Vote>;
  yes: number;
  no: number;
  abstain: number;
  passes: boolean;
}

export function forecast(s: GameState, id: string): Forecast {
  const res = RESOLUTION_BY_ID[id];
  const votes = {} as Record<RegionId, Vote>;
  let yes = 0;
  let no = 0;
  let abstain = 0;
  for (const r of REGION_IDS) {
    const v = voteOf(s, r, res);
    votes[r] = v;
    if (v === 'yes') yes += VOTES[r];
    else if (v === 'no') no += VOTES[r];
    else if (v === 'abstain') abstain += VOTES[r];
  }
  const passes = res.supermajority ? yes >= (2 / 3) * (yes + no) && yes > 0 : yes > no;
  return { votes, yes, no, abstain, passes };
}

// ════════════════════════════════════════ ACTIONS ════════════════════════════════════════
export function canTable(s: GameState, id: string): string | null {
  const c = s.charter;
  const res = RESOLUTION_BY_ID[id];
  if (!c || !res) return 'No such resolution.';
  if (c.phase < res.cphase) return `Opens in phase ${res.cphase}.`;
  if (c.council.passed.includes(id)) return 'Already in force.';
  if (c.council.agenda.includes(id)) return 'Already on the agenda.';
  if (c.council.agenda.length >= CHARTER.maxAgenda) return 'The agenda is full (three per session).';
  if (c.capital < res.cost) return `Needs ${res.cost} political capital.`;
  const n = res.needs?.(s);
  if (n) return n;
  return null;
}

export function tableResolution(s: GameState, id: string): Result {
  const why = canTable(s, id);
  if (why) return fail(why);
  const c = s.charter!;
  c.capital -= RESOLUTION_BY_ID[id].cost;
  c.council.agenda.push(id);
  news(s, `🗳 Tabled for the next Council session: ${RESOLUTION_BY_ID[id].name}.`);
  return OK;
}

export function withdrawResolution(s: GameState, id: string): Result {
  const c = s.charter;
  if (!c || !c.council.agenda.includes(id)) return fail('Not on the agenda.');
  c.council.agenda = c.council.agenda.filter((x) => x !== id);
  // half the capital comes back
  addCapital(s, Math.floor(RESOLUTION_BY_ID[id].cost / 2));
  return OK;
}

export function canWhip(s: GameState, r: RegionId): string | null {
  const c = s.charter;
  if (!c) return 'No Council yet.';
  if (c.council.walkouts[r]) return 'They walked out.';
  if ((c.council.sway[r] ?? 0) >= 0.6) return 'You’ve leaned on them as hard as you can this session.';
  if (c.capital < CHARTER.whipCost) return `Needs ${CHARTER.whipCost} political capital.`;
  return null;
}

/** Spend political capital leaning on a bloc before the next session. */
export function whipBloc(s: GameState, r: RegionId): Result {
  const why = canWhip(s, r);
  if (why) return fail(why);
  const c = s.charter!;
  c.capital -= CHARTER.whipCost;
  c.council.sway[r] = (c.council.sway[r] ?? 0) + CHARTER.whipSway;
  return OK;
}

export const favourCost = (s: GameState, r: RegionId) => 1.5e9 * (VOTES[r] / 6) * Math.pow(1.05, Math.max(0, (s.day - (s.charter?.founded ?? s.day)) / 365));

export function canFavour(s: GameState, r: RegionId): string | null {
  const c = s.charter;
  if (!c) return 'No Council yet.';
  if (c.council.walkouts[r]) return 'They walked out.';
  if ((c.council.sway[r] ?? 0) >= 0.6) return 'They’ve had all the favours they can take this session.';
  const cost = favourCost(s, r);
  if (c.budget < cost) return `Needs ${fmtMoney(cost)} in the treasury.`;
  return null;
}

/** A favour from the treasury: a hospital wing, a research grant, a road. */
export function favourBloc(s: GameState, r: RegionId): Result {
  const why = canFavour(s, r);
  if (why) return fail(why);
  const c = s.charter!;
  chSpend(s, 'favours', favourCost(s, r));
  c.council.sway[r] = (c.council.sway[r] ?? 0) + CHARTER.favourSway;
  addRelation(s, r, 3);
  // the others notice
  if (rand(s) < 0.2) addLegitimacy(s, -1);
  return OK;
}

// ════════════════════════════════════════ PASSING ════════════════════════════════════════
function applyResolution(s: GameState, id: string): void {
  const c = s.charter!;
  const res = RESOLUTION_BY_ID[id];
  if (res.group) c.council.passed = c.council.passed.filter((x) => RESOLUTION_BY_ID[x]?.group !== res.group);
  c.council.passed.push(id);
  switch (id) {
    case 'dues-raise':
      c.dues = Math.min(1.6, c.dues * 1.25);
      break;
    case 'dues-relief':
      for (const r of REGION_IDS) if (WEALTH[r] === 'developing') addRelation(s, r, 6);
      break;
    case 'export-harmony':
      s.politics.rules = s.politics.rules.filter((x) => !['chip-controls', 'hbm-caps', 'gulf-controls'].includes(x));
      c.council.factions.eastern.tension = clamp(c.council.factions.eastern.tension - 15, 0, 100);
      addRelation(s, 'eam', 8);
      addRelation(s, 'stp', 8);
      break;
    case 'access-pledge':
      addLegitimacy(s, 3);
      break;
    case 'orbital-commons':
      addLegitimacy(s, 1);
      break;
    case 'incident-reporting':
      for (const lab of ['meridian', 'lattice', 'orchard']) addPartnerRel(s, lab, -5);
      break;
    case 'windfall-levy':
      for (const lab of ['meridian', 'lattice', 'orchard']) addPartnerRel(s, lab, -10);
      break;
    case 'closed-frontier':
      addPartnerRel(s, 'orchard', -25);
      break;
    case 'open-weights':
      addPartnerRel(s, 'orchard', 12);
      break;
    case 'emergency-powers':
      if (!c.threshold) addLegitimacy(s, -2);
      break;
    case 'run-licensing':
      c.regime.alignment += 0.1;
      break;
  }
}

/** Hold a Council session: vote on the agenda, record it, move tension. */
export function holdSession(s: GameState): { id: string; passed: boolean; yes: number; no: number }[] {
  const c = s.charter!;
  const results: { id: string; passed: boolean; yes: number; no: number }[] = [];
  for (const id of c.council.agenda) {
    const fc = forecast(s, id);
    results.push({ id, passed: fc.passes, yes: fc.yes, no: fc.no });
    c.council.history.unshift({ day: s.day, id, passed: fc.passes, yes: fc.yes, no: fc.no });
    if (fc.passes) {
      applyResolution(s, id);
      addLegitimacy(s, 1.5);
    } else addLegitimacy(s, -2);
    // factions that lost the vote get tenser; winners relax a little
    for (const f of FACTION_IDS) {
      const members = FACTIONS[f].members.filter((r) => fc.votes[r] !== 'absent');
      if (!members.length) continue;
      const against = members.filter((r) => (fc.passes ? fc.votes[r] === 'no' : fc.votes[r] === 'yes')).length / members.length;
      c.council.factions[f].tension = clamp(c.council.factions[f].tension + (against > 0.5 ? 6 : -2), 0, 100);
    }
  }
  c.council.history = c.council.history.slice(0, 40);
  c.council.agenda = [];
  c.council.sway = {};
  c.council.sessions += 1;
  c.council.nextSession = s.day + CHARTER.sessionDays;
  return results;
}

// ════════════════════════════════════════ THE TICK ════════════════════════════════════════
/** Charter spending per faction over the act so far, as a share of all spending. */
export function spendShare(s: GameState): Record<FactionId, number> {
  const c = s.charter!;
  const by: Record<string, number> = {};
  let total = 0;
  for (const p of c.projects) {
    if (p.status === 'cancelled') continue;
    const f = factionOf(p.region);
    by[f] = (by[f] ?? 0) + p.price;
    total += p.price;
  }
  return Object.fromEntries(FACTION_IDS.map((f) => [f, total > 0 ? (by[f] ?? 0) / total : 1 / 3])) as Record<FactionId, number>;
}

/** Each faction's share of the world economy (what "fair" spending looks like). */
const fairShare = (f: FactionId) => FACTIONS[f].members.reduce((a, r) => a + (VOTES[r] / TOTAL_VOTES), 0);

export function tickCouncil(s: GameState): void {
  const c = s.charter;
  if (!c) return;
  const k = c.council;
  if (s.day >= k.nextSession) {
    if (k.agenda.length) {
      const results = holdSession(s);
      queueEvent(s, 'council-session', { results: JSON.stringify(results) });
    } else {
      k.nextSession = s.day + CHARTER.sessionDays;
      k.sessions += 1;
      k.sway = {};
    }
  }
  if (s.day % 30 !== 0) return;
  // tension drifts with how fairly the money is spread
  const share = spendShare(s);
  for (const f of FACTION_IDS) {
    const gap = fairShare(f) - share[f];
    const t = k.factions[f];
    t.tension = clamp(t.tension + gap * 6 + (35 - t.tension) * 0.02, 0, 100);
  }
  // walkouts: very tense factions lose a member
  for (const f of FACTION_IDS) {
    const t = k.factions[f].tension;
    if (t < 65 || c.phase < 2) continue;
    const present = FACTIONS[f].members.filter((r) => !k.walkouts[r]);
    if (!present.length || rand(s) > (t - 60) / 120) continue;
    const r = present.sort((a, b) => s.blocs[a].relation - s.blocs[b].relation)[0];
    const demand = pick(s, ['a project at home', 'dues relief', 'a seat on the safety board', 'export rules lifted']);
    k.walkouts[r] = { since: s.day, demand };
    queueEvent(s, 'walkout', { region: r, faction: f, demand });
  }
  // walkouts end on their own once tempers cool
  for (const [r, w] of Object.entries(k.walkouts) as [RegionId, { since: number; demand: string }][]) {
    const f = factionOf(r);
    if (k.factions[f].tension < 45 && s.day - w.since > 120 && rand(s) < 0.3) {
      delete k.walkouts[r];
      addRelation(s, r, 4);
      news(s, `🤝 ${REGIONS[r].name} returns to the Council.`, 'good');
    }
  }
  // the Concord Initiative: when the Eastern Compact is furious for long enough
  const east = k.factions.eastern.tension;
  if (!k.concord && east >= 80 && c.phase >= 3 && rand(s) < 0.25) {
    const members: RegionId[] = ['eam', 'stp', ...(['mena', 'sas', 'seo', 'ssa', 'lat'] as RegionId[]).filter((r) => s.blocs[r].relation < 45 && rand(s) < 0.5)];
    k.concord = { formed: s.day, members };
    queueEvent(s, 'concord-founded', { members: members.join(',') });
  } else if (k.concord && east < 50 && rand(s) < 0.3) {
    news(s, '🕊 The Concord Initiative folds back into the Charter.', 'good');
    k.concord = null;
    addLegitimacy(s, 4);
  }
}

/** End a walkout by meeting the demand (events and the UI call this). */
export function endWalkout(s: GameState, r: RegionId): void {
  const k = s.charter?.council;
  if (!k?.walkouts[r]) return;
  delete k.walkouts[r];
  const f = factionOf(r);
  k.factions[f].tension = clamp(k.factions[f].tension - 12, 0, 100);
  addRelation(s, r, 6);
}
