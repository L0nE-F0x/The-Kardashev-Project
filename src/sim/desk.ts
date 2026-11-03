/**
 * Act III: the Charter desk — standing orders for the Kardashev Project itself (the act's
 * delegation tier). Mira awards tenders, Juno oversees late projects, Sol whips votes for what you
 * tabled, Penny keeps a treasury reserve, Kip keeps the space programme moving, and Bit — once
 * trusted — runs the whole tender pipeline toward the next mission.
 */
import { CONTRACT_KINDS, MEGA_STAGES, MISSIONS, missionProgress, YOU } from '../content/charter';
import { RESOLUTION_BY_ID } from '../content/council';
import { LAUNCH_SITES, MEGA_SITES } from '../content/sites';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { AdvisorId, ContractKind, ContractSize, GameState, Job } from './types';
import { fmtMoney, news } from './core';
import { affordable, awardBid, bidScore, canAward, canPost, expediteCost, expediteProject, isLate, partnerBidders, postTender } from './charter';
import { canWhip, forecast, voteScore, whipBloc } from './council';
import { megaStage } from '../content/charter';
import { worldMargin } from './frontier';

export interface DeskDef {
  advisor: AdvisorId;
  title: string;
  blurb: string;
  a: { label: string; min: number; max: number; step: number; fmt: 'money' | 'pct' | 'count'; def: number };
  b?: { label: string; options: [number, string][]; def: number };
  cphase: number;
}

export const DESKS: DeskDef[] = [
  {
    advisor: 'penny', title: 'Treasury reserve', cphase: 1,
    blurb: 'Penny keeps a reserve in the treasury. Below it, the other desks stop committing new money.',
    a: { label: 'Reserve', min: 0, max: 100e9, step: 5e9, fmt: 'money', def: 15e9 },
  },
  {
    advisor: 'mira', title: 'Tender desk', cphase: 1,
    blurb: 'Mira awards each tender to its best-value bid once the bids are in.',
    a: { label: 'Award after (days of bidding)', min: 7, max: 21, step: 1, fmt: 'count', def: 15 },
    b: { label: 'Your own company', options: [[0, 'Never award it'], [1, 'Only if clearly best']], def: 0 },
  },
  {
    advisor: 'juno', title: 'Project oversight', cphase: 1,
    blurb: 'Juno puts overtime crews on late projects when the treasury can spare it.',
    a: { label: 'Expedite when late by (months)', min: 0, max: 12, step: 1, fmt: 'count', def: 2 },
  },
  {
    advisor: 'sol', title: 'Council whip', cphase: 1,
    blurb: 'Before each session Sol spends political capital on blocs leaning against what you tabled.',
    a: { label: 'Capital to keep in hand', min: 0, max: 60, step: 5, fmt: 'count', def: 15 },
  },
  {
    advisor: 'kip', title: 'Space programme', cphase: 2,
    blurb: 'Kip posts the next step of First Steps Off-World as soon as it can be built.',
    a: { label: 'Preferred launch site', min: 0, max: LAUNCH_SITES.length - 1, step: 1, fmt: 'count', def: 0 },
  },
  {
    advisor: 'bit', title: 'Co-pilot', cphase: 1,
    blurb: 'Bit posts the contracts the next mission needs and awards them. Needs trust: your safety margin ≥ 0.25 and a positive world margin (or A Safe Frontier).',
    a: { label: 'Tenders open at once', min: 1, max: 4, step: 1, fmt: 'count', def: 2 },
  },
];
export const DESK_BY_ADVISOR: Partial<Record<AdvisorId, DeskDef>> = Object.fromEntries(DESKS.map((d) => [d.advisor, d]));

/** Bit's co-pilot desk needs trust. */
export function bitTrusted(s: GameState): string | null {
  if (s.charter?.missions['safe-frontier']) return null;
  if (s.flags.bitDispatch && s.stats.margin >= 0.1 && worldMargin(s) >= -0.1) return null;
  if (s.stats.margin < 0.25) return 'Needs your safety margin ≥ 0.25';
  if (worldMargin(s) < 0) return 'Needs a positive world safety margin';
  return null;
}

export type Result = { ok: true } | { ok: false; reason: string };

export function setDesk(s: GameState, advisor: AdvisorId, patch: Partial<Job>): Result {
  const c = s.charter;
  const def = DESK_BY_ADVISOR[advisor];
  if (!c || !def) return { ok: false, reason: 'No such desk.' };
  if (c.phase < def.cphase) return { ok: false, reason: `Opens in Charter phase ${def.cphase}.` };
  if (patch.on && advisor === 'bit') {
    const why = bitTrusted(s);
    if (why) return { ok: false, reason: `${why} — you only automate what you trust.` };
  }
  const cur: Job = c.desk[advisor] ?? { on: false, a: def.a.def, b: def.b?.def };
  c.desk[advisor] = { ...cur, ...patch };
  return { ok: true };
}

const desk = (s: GameState, id: AdvisorId): Job | null => {
  const j = s.charter?.desk[id];
  const def = DESK_BY_ADVISOR[id];
  return j?.on && def && (s.charter?.phase ?? 0) >= def.cphase ? j : null;
};

/** Treasury money the desks may commit (above Penny's reserve). */
export function deskBudget(s: GameState): number {
  const c = s.charter!;
  const p = desk(s, 'penny');
  return c.budget - (p ? p.a : 0);
}

function report(s: GameState, who: AdvisorId, text: string): void {
  const names: Partial<Record<AdvisorId, string>> = { mira: 'Mira', juno: 'Juno', penny: 'Penny', sol: 'Sol', kip: 'Kip', bit: 'Bit' };
  news(s, `🗂 ${names[who]} (Charter desk): ${text}`);
  const j = s.charter?.desk[who];
  if (j) j.last = s.day;
}

export function tickDesk(s: GameState): void {
  const c = s.charter;
  if (!c || s.day % 7 !== 5) return;
  tenderDesk(s);
  oversight(s);
  whip(s);
  space(s);
  copilot(s);
}

/** Award a tender to its best-value bid (Mira, and Bit's co-pilot). */
function awardBest(s: GameState, allowYou: boolean, minAgeDays: number, who: AdvisorId): number {
  const c = s.charter!;
  let n = 0;
  for (const t of [...c.tenders]) {
    if (s.day - t.postedDay < minAgeDays && t.pending.length) continue;
    if (!t.bids.length) continue;
    const ranked = t.bids.map((b, i) => ({ b, i, score: bidScore(s, t, b) })).sort((x, y) => x.score - y.score);
    let pickIdx = -1;
    for (const r of ranked) {
      if (r.b.partner === YOU) {
        const bestOther = ranked.find((x) => x.b.partner !== YOU);
        if (!allowYou || (bestOther && r.score > bestOther.score * 0.97)) continue;
      }
      pickIdx = r.i;
      break;
    }
    if (pickIdx < 0) continue;
    if (t.bids[pickIdx].price * 0.2 > deskBudget(s)) continue;
    if (!affordable(s, t.bids[pickIdx].price, t.bids[pickIdx].days)) continue;
    if (canAward(s, t.id, pickIdx) !== null) continue;
    const name = CONTRACT_KINDS[t.kind].name;
    if (awardBid(s, t.id, pickIdx).ok) {
      n += 1;
      report(s, who, `awarded ${name} to the best-value bid.`);
    }
  }
  return n;
}

function tenderDesk(s: GameState): void {
  const j = desk(s, 'mira');
  if (!j) return;
  awardBest(s, (j.b ?? 0) === 1, j.a, 'mira');
}

function oversight(s: GameState): void {
  const j = desk(s, 'juno');
  if (!j) return;
  const c = s.charter!;
  for (const p of c.projects) {
    if (p.status !== 'building' || !isLate(s, p) || s.flags[`expedited:${p.id}`]) continue;
    if (s.day - (p.startDay + p.promised) < j.a * 30.4) continue;
    if (expediteCost(p) > deskBudget(s)) continue;
    if (expediteProject(s, p.id).ok) report(s, 'juno', `put overtime crews on a late ${CONTRACT_KINDS[p.kind].name.toLowerCase()} (${fmtMoney(expediteCost(p))}).`);
  }
}

function whip(s: GameState): void {
  const j = desk(s, 'sol');
  if (!j) return;
  const c = s.charter!;
  if (c.council.nextSession - s.day > 14 || !c.council.agenda.length) return;
  let used = 0;
  for (const id of c.council.agenda) {
    const fc = forecast(s, id);
    if (fc.passes) continue;
    const res = RESOLUTION_BY_ID[id];
    const swing = (REGION_IDS as readonly RegionId[]).filter((r) => fc.votes[r] !== 'yes' && fc.votes[r] !== 'absent').sort((a, b) => voteScore(s, b, res) - voteScore(s, a, res));
    for (const r of swing) {
      if (c.capital - 6 < j.a || canWhip(s, r) !== null) break;
      if (voteScore(s, r, res) < -0.6) continue;
      whipBloc(s, r);
      used += 1;
      if (forecast(s, id).passes) break;
    }
  }
  if (used) report(s, 'sol', `leaned on ${used} delegation${used > 1 ? 's' : ''} before the session.`);
}

function space(s: GameState): void {
  const j = desk(s, 'kip');
  if (!j) return;
  const c = s.charter!;
  const has = (k: ContractKind) => c.projects.some((p) => p.kind === k && p.status !== 'cancelled') || c.tenders.some((t) => t.kind === k);
  const site = LAUNCH_SITES[Math.round(j.a)]?.id ?? LAUNCH_SITES[0].id;
  const steps: [ContractKind, string][] = [['launch', site], ['orbital', 'global'], ['spacesolar', 'global']];
  for (const [k, where] of steps) {
    if (has(k)) continue;
    if (canPost(s, k, 1, where) === null && deskBudget(s) > 5e9) {
      postTender(s, k, 1, where);
      report(s, 'kip', `posted the ${CONTRACT_KINDS[k].name.toLowerCase()} tender. Orbit, here we come!`);
    }
    break;
  }
}

/** What Bit would post next: the cheapest contract that moves the nearest unfinished mission. */
function nextMissionContract(s: GameState): { kind: ContractKind; size: ContractSize; where: string } | null {
  const c = s.charter!;
  // spread the effort: the mission furthest from done goes first
  const frac = (m: (typeof MISSIONS)[number]) => {
    const g = missionProgress(s, m).goals;
    return g.reduce((a, [x, y]) => a + Math.min(1, x / Math.max(1e-9, y)), 0) / Math.max(1, g.length);
  };
  const open = MISSIONS.filter((m) => !c.missions[m.id] && c.phase >= m.cphase && m.id !== 'offworld').sort((a, b) => frac(a) - frac(b));
  const tryPost = (kind: ContractKind, size: ContractSize, where: string) => (canPost(s, kind, size, where) === null && partnerBidders(s, kind).length ? { kind, size, where } : null);
  for (const m of open) {
    const pr = missionProgress(s, m);
    if (m.id === 'clean-power') {
      const r = bestEnergy(s, true);
      if (r) return r;
    }
    if (m.id === 'compute-everyone') {
      const worst = [...REGION_IDS].sort((a, b) => c.access[a] - c.access[b]);
      for (const r of worst) {
        if (c.access[r] >= 50) break;
        const x = tryPost('compute', 3, r) ?? tryPost('cable', 2, r);
        if (x) return x;
      }
    }
    if (m.id === 'chip-commons') {
      const needs: ContractKind[] = [];
      if (pr.goals[0][0] < 3) needs.push('fab');
      if (pr.goals[1][0] < 2) needs.push('hbm');
      if (pr.goals[2][0] < 2) needs.push('pkg');
      const hosts: RegionId[] = ['sas', 'seo', 'lat', 'eur', 'atl', 'mena'];
      for (const k of needs) for (const r of hosts) {
        const x = tryPost(k, 1, r);
        if (x) return x;
      }
    }
    if (m.id === 'backbone') {
      for (const route of ['hvdc-sahara', 'hvdc-northsea', 'hvdc-plains', 'hvdc-gulf', 'hvdc-outback', 'hvdc-gobi']) {
        const x = tryPost('hvdc', 2, route);
        if (x) return x;
      }
    }
    if (m.id === 'safe-frontier') {
      const x = tryPost('evals', 2, 'global') ?? tryPost('interp', 2, 'global');
      if (x) return x;
    }
  }
  // missions done: keep climbing toward K 0.75 with energy at the megaprojects
  if (s.stats.K < 0.75) return bestEnergy(s, false);
  return null;
}

/** Quick, cheap energy first (solar, wind), spread across sites, a medium start at each new site. */
const KIND_ORDER: ContractKind[] = ['solar', 'wind', 'geo', 'hydro', 'nuclear'];
function bestEnergy(s: GameState, forStages: boolean): { kind: ContractKind; size: ContractSize; where: string } | null {
  const c = s.charter!;
  const busy = (id: string) => c.projects.filter((p) => p.where === id && p.status === 'building').length + c.tenders.filter((t) => t.where === id).length;
  const options: { kind: ContractKind; where: string; score: number }[] = [];
  for (const site of MEGA_SITES) {
    if (forStages && megaStage(s, site.id) >= MEGA_STAGES.length) continue;
    if (busy(site.id) >= 2) continue;
    for (const kind of site.mega ?? []) {
      const cf = kind === 'solar' ? site.solarCF : kind === 'wind' ? site.windCF : 0.3;
      options.push({ kind, where: site.id, score: KIND_ORDER.indexOf(kind) * 0.5 - cf + busy(site.id) * 0.4 });
    }
  }
  options.sort((a, b) => a.score - b.score);
  for (const o of options) {
    const first = !c.projects.some((p) => p.where === o.where && p.status !== 'cancelled');
    const order: ContractSize[] = first ? [2, 1] : [3, 2];
    if (!partnerBidders(s, o.kind).length) continue;
    for (const size of order) if (canPost(s, o.kind, size, o.where) === null) return { kind: o.kind, size, where: o.where };
  }
  return null;
}

function copilot(s: GameState): void {
  const j = desk(s, 'bit');
  if (!j) return;
  if (bitTrusted(s) !== null) {
    s.charter!.desk.bit!.on = false;
    report(s, 'bit', 'stepping back from the desk until the margins are healthy again. That seems right.');
    return;
  }
  const c = s.charter!;
  awardBest(s, false, 12, 'bit');
  if (c.tenders.length < j.a && deskBudget(s) > 10e9) {
    const next = nextMissionContract(s);
    if (next && postTender(s, next.kind, next.size, next.where).ok) report(s, 'bit', `posted ${CONTRACT_KINDS[next.kind].name.toLowerCase()} toward the next mission.`);
  }
}

export { nextMissionContract };
