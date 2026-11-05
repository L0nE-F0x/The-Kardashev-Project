/**
 * Act III's finale, "The Threshold": 120 days on three fronts at once —
 *   grid     — the Long Summer: a planetary heatwave strains every grid
 *   frontier — a lab's model nears superintelligence and fails an evaluation
 *   council  — a faction walks out and threatens the rival Concord
 * then the renewal vote on the Charter's planetary powers, and the cliffhanger.
 */
import { ACCESS0, CHARTER, FACTION_IDS, FACTIONS, factionOf, TOTAL_VOTES, VOTES, WEALTH } from '../content/charter';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import { HALLS } from '../content/facilities';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { FactionId, GameState, ThresholdFront, ThresholdState } from './types';
import { clamp, news } from './core';
import { addModifier, modAdd } from './effects';
import { queueEvent, scheduleEvent } from './events';
import { facilityIT } from './model';
import { addRelationAll } from './politics';
import { addLegitimacy, bitOnDesk, companyShare, minAccess } from './charter';
import { MANDATE_GOALS, OBJECTIVE_BY_ID } from '../content/objectives';
import { charterFirmGW, hvdcOnline } from './world';
import { capInForce, leadingLab, worldMargin } from './frontier';

export const THRESHOLD_FRONTS: ThresholdFront[] = ['grid', 'frontier', 'council'];
export const FRONT3_NAMES: Record<ThresholdFront, string> = { grid: 'The Grid', frontier: 'The Frontier', council: 'The Council' };

const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);
const mission = (s: GameState, id: string) => !!s.charter?.missions[id];

/** The tensest faction (the one that walks out). */
function tensest(s: GameState): FactionId {
  const k = s.charter!.council.factions;
  return [...FACTION_IDS].sort((a, b) => k[b].tension - k[a].tension)[0];
}

/** Your company's two biggest regions by IT (they feel the heatwave). */
function yourRegions(s: GameState): RegionId[] {
  const by: Partial<Record<RegionId, number>> = {};
  for (const f of s.facilities) if (HALLS.includes(f.type) && f.status === 'online') by[siteDef(f.siteId).region] = (by[siteDef(f.siteId).region] ?? 0) + facilityIT(f);
  return (Object.entries(by) as [RegionId, number][]).sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(0, 2);
}

export function startThreshold(s: GameState): void {
  const c = s.charter;
  if (!c || c.threshold) return;
  c.phase = 4;
  s.flags.cphase4Day = s.day;
  const lab = leadingLab(s);
  const faction = tensest(s);
  const t: ThresholdState = {
    startDay: s.day,
    endDay: s.day + CHARTER.thresholdDays,
    fronts: {
      grid: { pressure: passed(s, 'emergency-powers') ? 10 : 20, lost: false },
      frontier: { pressure: mission(s, 'safe-frontier') ? 5 : 20, lost: false },
      council: { pressure: 20, lost: false },
    },
    lab,
    faction,
    done: false,
  };
  c.threshold = t;
  // the Long Summer
  for (const r of yourRegions(s)) {
    addModifier(s, `region:${r}:grid`, 100, 'The Long Summer: grid derated', { mult: 0.7 });
    addModifier(s, `region:${r}:cooling`, 100, 'The Long Summer: cooling struggles', { mult: 0.9 });
  }
  queueEvent(s, 'threshold-begin', { lab, faction });
  scheduleEvent(s, 'threshold-grid', 8, {});
  scheduleEvent(s, 'threshold-frontier', 18, { lab });
  scheduleEvent(s, 'threshold-council', 28, { faction });
  scheduleEvent(s, 'threshold-grid-2', 55, {});
  scheduleEvent(s, 'threshold-frontier-2', 70, { lab });
  scheduleEvent(s, 'threshold-council-2', 85, { faction });
  news(s, '🌡 The Threshold: the Long Summer, a model at the edge, and a Council coming apart — all at once.', 'bad');
}

export function pressure3(s: GameState, front: ThresholdFront, d: number): void {
  const t = s.charter?.threshold;
  if (!t || t.done) return;
  const fr = t.fronts[front];
  if (fr.lost) return;
  fr.pressure = clamp(fr.pressure + d, 0, 100);
}

/** Each Mandate goal leans on one front: while it's unmet, that front has less to stand on. */
export const MANDATE_FRONT: Record<string, ThresholdFront> = {
  'a3-k075': 'grid',
  'a3-clean': 'grid',
  'a3-regime': 'frontier',
  'a3-orbital': 'frontier',
  'a3-access40': 'council',
  'a3-legit': 'council',
  'a3-chips': 'council',
};
/** Daily pressure per unmet Mandate goal on its front. */
const UNMET_PRESSURE = 0.1;

/** A Mandate goal is met (ticked off, or true right now — the same check as the Mandate list). */
export const mandateMet = (s: GameState, id: string) => s.objectives.done.includes(id) || !!OBJECTIVE_BY_ID[id]?.done(s);
export const mandateCount = (s: GameState) => MANDATE_GOALS.filter((id) => mandateMet(s, id)).length;

/** "The crisis" itself: it builds through the 120 days, from 0.3 a day to 1.1 at the end. */
function crisisToday(s: GameState): number {
  const t = s.charter?.threshold;
  const f = t ? clamp((s.day - t.startDay) / Math.max(1, t.endDay - t.startDay), 0, 1) : 0;
  return 0.3 + 0.8 * f;
}

/** Today's pressure rise per front, with the parts that make it up (the tracker explains them). */
export function frontRise(s: GameState, front: ThresholdFront): { v: number; parts: [string, number][] } {
  const c = s.charter!;
  const parts: [string, number][] = [['The crisis (it keeps building)', crisisToday(s)]];
  for (const id of MANDATE_GOALS) if (MANDATE_FRONT[id] === front && !mandateMet(s, id)) parts.push([`Mandate unmet: ${OBJECTIVE_BY_ID[id].title}`, UNMET_PRESSURE]);
  if (front === 'grid') {
    const w = c.world;
    if (w.carbonGt < 0) parts.push(['Carbon budget blown', 0.35]);
    else if (w.carbonGt < 100) parts.push(['Carbon budget nearly gone', 0.15]);
    parts.push(['Too little firm clean power', 0.45 * (1 - Math.min(1, charterFirmGW(s) / 300))]);
    const links = hvdcOnline(s).length;
    if (links) parts.push(['HVDC links reroute power', -Math.min(0.3, links * 0.08)]);
    if (mission(s, 'clean-power')) parts.push(['Clean Power for All', -0.2]);
    if (mission(s, 'backbone')) parts.push(['The Global Backbone', -0.1]);
    if (passed(s, 'emergency-powers')) parts.push(['Emergency powers', -0.15]);
  } else if (front === 'frontier') {
    const m = worldMargin(s);
    if (m < 0) parts.push(['Negative world safety margin', -m * 0.9]);
    if (passed(s, 'run-licensing')) parts.push(['Run licensing', -0.15]);
    if (c.projects.some((p) => p.kind === 'evals' && p.status === 'done')) parts.push(['Evals programme', -0.15]);
    if (bitOnDesk(s)) parts.push(['Bit on the case', -0.15]);
    if (mission(s, 'safe-frontier')) parts.push(['A Safe Frontier', -0.3]);
    if (passed(s, 'open-weights')) parts.push(['Open weights everywhere', 0.12]);
    if (capInForce(s)) parts.push(['Compute cap', -0.1]);
  } else {
    const k = c.council;
    const maxT = Math.max(...FACTION_IDS.map((f) => k.factions[f].tension));
    if (maxT > 50) parts.push(['Faction tension', (maxT - 50) / 120]);
    const w = Object.keys(k.walkouts).length;
    if (w) parts.push(['Walkouts', 0.12 * w]);
    parts.push(['Legitimacy', -(c.legitimacy - 50) / 120]);
    if (minAccess(s) >= 40) parts.push(['Every bloc has access', -0.15]);
    if (mission(s, 'compute-everyone')) parts.push(['Compute for Everyone', -0.15]);
    if (k.concord) parts.push(['The Concord Initiative', 0.2]);
  }
  const relief = modAdd(s, `threshold:${front}`);
  if (relief) parts.push(['Your crisis measures', -relief]);
  return { v: parts.reduce((a, [, x]) => a + x, 0), parts };
}

export function tickThreshold(s: GameState): void {
  const c = s.charter;
  const t = c?.threshold;
  if (!c || !t || t.done) return;
  for (const f of THRESHOLD_FRONTS) pressure3(s, f, frontRise(s, f).v);
  for (const f of THRESHOLD_FRONTS) {
    const fr = t.fronts[f];
    if (fr.lost || fr.pressure < 100) continue;
    fr.lost = true;
    loseFront(s, f);
  }
  if (s.day >= t.endDay) {
    t.done = true;
    t.held = THRESHOLD_FRONTS.filter((f) => !t.fronts[f].lost).length;
    queueEvent(s, 'threshold-end', { held: t.held });
    news(s, `🌤 The Threshold is behind us. Fronts held: ${t.held} of 3.`, t.held >= 2 ? 'good' : 'bad');
  }
}

function loseFront(s: GameState, f: ThresholdFront): void {
  const c = s.charter!;
  const t = c.threshold!;
  if (f === 'grid') {
    addModifier(s, 'world:growth', 730, 'The Long Summer blackouts', { add: -0.005 });
    for (const r of yourRegions(s)) addModifier(s, `region:${r}:grid`, 60, 'Rolling blackouts', { mult: 0.45 });
    addLegitimacy(s, -8);
    news(s, `⚫ Front lost — ${FRONT3_NAMES.grid}: blackouts roll across three continents. The Charter gets the blame.`, 'bad');
  } else if (f === 'frontier') {
    addModifier(s, 'training', 180, 'Global pause on frontier training', { mult: 0.3 });
    for (const r of s.market.rivals) addModifier(s, `rival:${r.id}:pace`, 180, 'Global training pause', { mult: 0.3 });
    addLegitimacy(s, -10);
    addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? -8 : -3));
    news(s, `⚫ Front lost — ${FRONT3_NAMES.frontier}: the blocs order a global pause on frontier training.`, 'bad');
  } else {
    for (const r of FACTIONS[t.faction].members) if (!c.council.walkouts[r]) c.council.walkouts[r] = { since: s.day, demand: 'the renewal vote' };
    addLegitimacy(s, -10);
    news(s, `⚫ Front lost — ${FRONT3_NAMES.council}: the ${FACTIONS[t.faction].name} walks out of the Charter.`, 'bad');
  }
}

// ════════════════════════════════════════ RENEWAL ════════════════════════════════════════
export type Speech = 'abundance' | 'safety' | 'everyone' | 'record';

export const SPEECHES: Record<Speech, { label: string; detail: string }> = {
  abundance: { label: '“Abundance, for everyone”', detail: 'Developing and pro-build blocs warm to you; cautious ones less so.' },
  safety: { label: '“Safety first, always”', detail: 'Cautious blocs warm to you; pro-build ones less so.' },
  everyone: { label: '“A Charter for every bloc”', detail: 'The Eastern and Non-aligned blocs warm to you; the Atlantic shrugs.' },
  record: { label: '“Let the record speak”', detail: 'No pitch at all. Works if your Legitimacy is high.' },
};

/** A speech only moves the blocs near the line: it swings a close vote, it can't save a lost one. */
function speechBonus(s: GameState, r: RegionId, speech: Speech | null): number {
  if (!speech) return 0;
  const stance = s.blocs[r].stance;
  switch (speech) {
    case 'abundance':
      return (WEALTH[r] === 'developing' ? 0.2 : 0) + (stance === 'accelerate' ? 0.1 : stance === 'cautious' ? -0.1 : 0);
    case 'safety':
      return stance === 'cautious' ? 0.25 : stance === 'accelerate' ? -0.1 : 0.05;
    case 'everyone':
      return factionOf(r) === 'atlantic' ? -0.05 : 0.15;
    case 'record':
      return (s.charter!.legitimacy - 55) / 100;
  }
}

export interface RenewalForecast {
  votes: Record<RegionId, 'yes' | 'no' | 'absent'>;
  /** Each bloc's lean (above zero votes yes). */
  lean: Record<RegionId, number>;
  yes: number;
  no: number;
  share: number;
  outcome: 'planetary' | 'limited' | 'caretaker';
}

/**
 * The record every bloc judges (the same for all twelve): what the Mandate delivered, Legitimacy, how
 * the Threshold went and whether the Steward's own company did suspiciously well out of the Charter.
 */
export function renewalRecord(s: GameState): [string, number][] {
  const c = s.charter!;
  const parts: [string, number][] = [];
  const met = mandateCount(s);
  parts.push([`The Mandate: ${met} of ${MANDATE_GOALS.length} goals met`, 0.06 * (met - 0.5)]);
  parts.push([`Legitimacy ${Math.round(c.legitimacy)}`, (c.legitimacy - 40) / 100]);
  // the Threshold counts once it has been faced (a forecast before it is neutral on it)
  if (c.threshold?.done) {
    const held = c.threshold.held ?? 0;
    parts.push([`The Threshold: ${held} of 3 fronts held`, 0.08 * (held - 2)]);
  }
  const mine = companyShare(s);
  if (mine > 0.1) parts.push([`Your company won ${Math.round(mine * 100)}% of the Charter’s contract money`, -Math.min(1.2, (mine - 0.1) * 1.5)]);
  return parts;
}

/** One bloc's lean on renewing the Charter with planetary powers, part by part (above zero votes yes). */
export function renewalParts(s: GameState, r: RegionId, speech: Speech | null = null, record = renewalRecord(s)): [string, number][] {
  const c = s.charter!;
  const parts = [...record];
  // what the Charter did for this bloc's access to compute (it started the decade at ACCESS0)
  const access = c.access[r] ?? ACCESS0[r];
  parts.push([`Compute access ${Math.round(access)} (${Math.round(ACCESS0[r])} when the Charter began)`, clamp((access - ACCESS0[r]) / 60, -0.25, 0.25)]);
  const rel = s.blocs[r].relation;
  parts.push([`Relations ${Math.round(rel)}`, clamp((rel - 55) / 200, -0.2, 0.15)]);
  const f = factionOf(r);
  const tension = c.council.factions[f].tension;
  if (tension > 40) parts.push([`${FACTIONS[f].name} tension ${Math.round(tension)}`, -(tension - 40) / 120]);
  // a walkout still votes in the end, grudgingly
  if (c.council.walkouts[r]) parts.push(['Walked out', -0.5]);
  const stance = s.blocs[r].stance;
  if (stance === 'cautious') parts.push(['Wary of planetary powers', -0.1]);
  else if (stance === 'accelerate') parts.push(['Wants the build-out', 0.08]);
  const sp = speechBonus(s, r, speech);
  if (sp) parts.push(['Your speech', sp]);
  return parts;
}

export function renewalForecast(s: GameState, speech: Speech | null = null): RenewalForecast {
  const votes = {} as Record<RegionId, 'yes' | 'no' | 'absent'>;
  const lean = {} as Record<RegionId, number>;
  const record = renewalRecord(s);
  let yes = 0;
  let no = 0;
  for (const r of REGION_IDS) {
    const v = renewalParts(s, r, speech, record).reduce((a, [, x]) => a + x, 0);
    lean[r] = v;
    votes[r] = v > 0 ? 'yes' : 'no';
    if (v > 0) yes += VOTES[r];
    else no += VOTES[r];
  }
  const share = yes / Math.max(1, yes + no);
  return { votes, lean, yes, no, share, outcome: share >= 2 / 3 ? 'planetary' : share > 0.5 ? 'limited' : 'caretaker' };
}

export const RENEWAL_NAMES: Record<RenewalForecast['outcome'], string> = {
  planetary: 'The Planetary Charter',
  limited: 'Renewed, with limits',
  caretaker: 'A caretaker term',
};

/** What each outcome means for Act IV (the renewal card and the Overview say it). */
export const RENEWAL_MEANS: Record<RenewalForecast['outcome'], string> = {
  planetary: 'Two thirds or more: full planetary powers. In Act IV you lay any supergrid link and hand any province to an AI without asking the Council.',
  limited: 'More than half: the Charter goes on, but every supergrid link and every AI province needs the Council’s approval (political capital each time).',
  caretaker: 'Half or less: a caretaker term. The same approvals as a limited renewal, and the Charter has to win planetary powers back in a Council vote.',
};

export function holdRenewal(s: GameState, speech: Speech): RenewalForecast {
  const c = s.charter!;
  const fc = renewalForecast(s, speech);
  c.renewal = { day: s.day, yes: fc.yes, no: fc.no, outcome: fc.outcome };
  c.phase = 5;
  s.flags.cphase5Day = s.day;
  // walkouts come back for the new term
  c.council.walkouts = {};
  addLegitimacy(s, fc.outcome === 'planetary' ? 10 : fc.outcome === 'limited' ? 3 : -5);
  news(s, `🗳 The Council votes ${fc.yes}–${fc.no}: ${RENEWAL_NAMES[fc.outcome]}.`, fc.outcome === 'caretaker' ? 'bad' : 'good');
  scheduleEvent(s, 'liftoff', 12, {});
  return fc;
}

void TOTAL_VOTES;
void REGIONS;
