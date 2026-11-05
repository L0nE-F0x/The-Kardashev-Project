/**
 * Act V: era plans and the jumps between stages, plus the last climb. When a stage's work is done and
 * its big decisions are taken, the plan screen opens: up to three priorities, the growth dial, the
 * reinvestment, the minds/people split, a reserve and the length (5, 7 or 10 years). The years run on
 * the real daily tick with events on autopilot (like Act IV's jumps); a planner posts and awards
 * Charter contracts by the priorities and claims asteroids. The last climb is one more jump that stops
 * on the day Kardashev reaches 1.0000. With autopilot on, the planner also runs during normal play.
 */
import { CONTRACT_KINDS, YOU } from '../content/charter';
import { PRIORITY5_IDS, SYSTEM, STAGE5_NAMES, ASTEROID_BY_ID } from '../content/system';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { ContractKind, ContractSize, EraPlan, EraRecord, GameState, Priority, SystemSnap } from './types';
import { clamp, dateOf, fmtTW, news } from './core';
import { queueEvent } from './events';
import { addModifier } from './effects';
import { canPost, contractEstimate, postTender } from './charter';
import { tick } from './tick';
import type { SimContext } from './supply';
import { avgWellbeing } from './provinces';
import { warming } from './climate';
import { worldMargin } from './frontier';
import { autoResolve, plannerTick } from './plans';
import { enterStage5 } from './act5';
import { feedFactor, foundryMt, growthMult, seedPlaces, siteEff } from './foundries';
import { claimAsteroid, canClaim, claimCost, unknownInReach } from './asteroids';
import { headroomTW, massPerTW, spaceTW, surfaceTW } from './swarm';
import { beamsUsed, earthOwnTW, lineTW, placeOf, segmentsLit } from './systemView';
import { gardenTarget } from './earth';

type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const yearOf = (day: number) => dateOf(day).getUTCFullYear();

// ════════════════════════════════════════ PLANS ════════════════════════════════════════
export function defaultEra(s: GameState): EraPlan {
  const sy = s.system!;
  const next = sy.stage + 1;
  const priorities = next === 1 ? (['foundries', 'asteroids', 'swarm'] as const) : next === 2 ? (['swarm', 'minds', 'earth'] as const) : (['swarm', 'people', 'longevity'] as const);
  // the third era runs long: it stops by itself when Kardashev reaches 0.99, so the storm comes without years of waiting
  return { years: next === 1 ? 5 : next === 2 ? 7 : 10, priorities: [...priorities], dial: sy.dial, reinvest: sy.reinvest, minds: sy.minds, reserve: 0.25, bitRuns: false };
}

/** Why Bit can't run the era, or null. */
export function bitEraBlocked(s: GameState): string | null {
  const pl = s.planet;
  if (!pl || !s.system) return 'Act V only.';
  if (s.system.bitFate === 'leash') return 'Bit is on a leash now.';
  if (pl.ais.bit.trust < SYSTEM.bitRunsTrust) return `Bit’s trust is ${Math.round(pl.ais.bit.trust)}; it needs ${SYSTEM.bitRunsTrust} to run an era.`;
  if (worldMargin(s) < 0) return 'Not with the world safety margin below zero.';
  return null;
}

export function snap5(s: GameState): SystemSnap {
  const sy = s.system!;
  return {
    day: s.day,
    K: s.stats.K,
    tw: s.stats.worldTW,
    earthTW: surfaceTW(s),
    spaceTW: spaceTW(s),
    foundryMt: foundryMt(s),
    segments: segmentsLit(sy.collectors),
    lifeExp: sy.lifeExp,
    warming: warming(s),
    wellbeing: avgWellbeing(s),
    spacePop: sy.spacePop,
    budget: s.charter?.budget ?? 0,
    legitimacy: s.charter?.legitimacy ?? 0,
  };
}

/**
 * A rough forecast of the Type I year at a growth dial and reinvestment, for the era plan and the
 * System panel: the foundries compound (slowing as their supply lines lengthen), what they build
 * becomes swarm, and the yards stand down for the storm. It ignores drift, setbacks and the decisions
 * still to come, so the UI says "about".
 */
export function typeIEstimate(s: GameState, dial = s.system?.dial ?? 3, reinvest = s.system?.reinvest ?? 0.45): number | null {
  const sy = s.system;
  if (!sy) return null;
  if (sy.typeI) return yearOf(sy.typeI);
  const mt = foundryMt(s);
  const reachOf = (cap: number) => 1 / (1 + 0.35 * Math.log10(1 + cap / 2));
  // early on the industry still has its research, its fed yards, the minds' designs and its asteroid
  // types to come (measured on the guard-rail runs: about +20% growth and −15% mass per TW by stage 2)
  const young = sy.stage === 0 ? 1 : sy.stage === 1 ? 0.5 : 0;
  // research, ownership, the minds and any setbacks in force (the reach part is redone as the industry grows)
  const mult = (growthMult(s) / reachOf(mt)) * (1 + 0.12 * young);
  const eff = Math.max(mt > 0 ? sy.foundries.reduce((a, f) => a + f.cap * siteEff(s, f), 0) / mt : 1, 1 + 0.08 * young);
  const m = massPerTW(s);
  const perTW = (1.04 * m.collectors + sy.minds * m.rings + (1 - sy.minds) * m.habitat) * (1 - 0.12 * young);
  // Earth ends at its line (beams count as space power); the storm comes at K 0.99 or the deadline
  let tw = Math.max(earthOwnTW(s), lineTW(s) - beamsUsed(s)) + spaceTW(s);
  const stormTW = Math.pow(10, SYSTEM.eraStopK * 10 + 6) / 1e12;
  // early on, the seeds the planner will plant count too
  let cap = Math.max(mt, sy.stage <= 1 ? SYSTEM.seedMt * (4 + 3 * Math.max(1, sy.stage)) : 0);
  const r = clamp(reinvest, 0.2, 0.7);
  const perYear = (Math.LN2 * 12 * (r / 0.4) * mult * eff) / SYSTEM.doubling[clamp(Math.round(dial), 1, 5) - 1];
  let years = 0;
  let climb = sy.solarmax ? (sy.solarmax.done ? 0 : 0.4) : -1;
  const grow = (dt: number, push: number) => (cap *= Math.exp(perYear * reachOf(cap) * push * dt));
  if (climb > 0) {
    grow(climb, 1);
    years += climb;
    climb = 0;
  }
  while (tw < SYSTEM.targetTW && years < 80) {
    // the last climb: everyone pushes, harder every year (foundries.ts climbPush)
    grow(1 / 12, climb >= 0 ? Math.pow(1 + climb, SYSTEM.climbPush) : 1);
    tw += (cap * eff * (1 - r)) / 12 / perTW;
    years += 1 / 12;
    if (climb >= 0) climb += 1 / 12;
    else if (tw >= stormTW || s.day + years * 365.25 >= SYSTEM.deadline + 365) {
      // the storm: the yards stand down while the foundries keep growing
      grow(0.4, 1);
      years += 0.4;
      climb = 0;
    }
  }
  return yearOf(s.day + Math.round(years * 365.25));
}

/** Apply an era plan's levers (dial, reinvestment, minds share). Also used by the System panel between eras. */
export function setLevers(s: GameState, dial: number, reinvest: number, minds: number): void {
  const sy = s.system!;
  const cap = s.charter?.council.passed.includes('replicator-limits') ? 3 : 5;
  sy.dial = clamp(Math.round(dial), 1, cap);
  sy.reinvest = clamp(reinvest, 0.2, 0.7);
  sy.minds = clamp(minds, 0.1, 0.9);
}

/** Confirm the waiting era plan: the next stage begins and its jump starts. */
export function confirmEra(s: GameState, plan: EraPlan): Result {
  const sy = s.system;
  if (!sy?.planOpen) return fail('No era plan is waiting.');
  if (!SYSTEM.jumpYears.includes(plan.years as 5 | 7 | 10)) return fail('An era covers 5, 7 or 10 years.');
  const pri = [...new Set(plan.priorities)].filter((p) => PRIORITY5_IDS.includes(p)).slice(0, 3);
  if (!pri.length) return fail('Pick at least one priority.');
  if (plan.bitRuns && bitEraBlocked(s)) return fail(bitEraBlocked(s)!);
  setLevers(s, plan.dial, plan.reinvest, plan.minds);
  const clean: EraPlan = { years: plan.years, priorities: pri, dial: sy.dial, reinvest: sy.reinvest, minds: sy.minds, reserve: clamp(plan.reserve, 0, 1), bitRuns: plan.bitRuns };
  sy.plan = clean;
  sy.planOpen = false;
  const next = sy.stage + 1;
  enterStage5(s, next);
  const days = Math.round(clean.years * 365.25);
  sy.jump = { from: s.day, to: s.day + days, plan: clean, before: snap5(s), stage: next, auto: [], log: [] };
  if (clean.bitRuns && s.planet) {
    addModifier(s, 'charter:build', days, 'Bit runs the era', { mult: 1.08 });
    s.planet.ais.bit.trust = clamp(s.planet.ais.bit.trust + 4, 0, 100);
    s.planet.bitBond = clamp(s.planet.bitBond + 5, -100, 100);
  }
  news(s, `⏩ The ${clean.years}-year era begins: ${pri.join(', ')}.`, 'event');
  return { ok: true };
}

/** After Solar Maximum: one last jump that stops the day Kardashev reaches 1.0000. */
export function startLastClimb(s: GameState): void {
  const sy = s.system!;
  if (sy.jump || sy.typeI) return;
  const plan = sy.plan ?? defaultEra(s);
  sy.jump = { from: s.day, to: s.day + Math.round(SYSTEM.lastClimbMaxYears * 365.25), plan: { ...plan, priorities: (['swarm', ...plan.priorities.filter((p) => p !== 'swarm')] as EraPlan['priorities']).slice(0, 3) }, before: snap5(s), stage: 5, auto: [], log: [], last: true };
  news(s, '⏩ The last climb: everyone pushes, harder every year, until Kardashev reaches 1.0000.', 'event');
}

// ════════════════════════════════════════ THE JUMP ════════════════════════════════════════
/** Run up to `days` days of the era. Returns the record when it finishes, else null. The last climb only ends on K 1.0000. */
export function eraStep(s: GameState, ctx: SimContext, days: number): EraRecord | null {
  const sy = s.system;
  const j = sy?.jump;
  if (!sy || !j) return null;
  const prev = s.flags.offline;
  s.flags.offline = 'jump';
  let reached = false;
  try {
    for (let i = 0; i < days && (j.last || s.day < j.to); i++) {
      const newest = s.news[0];
      tick(s, ctx);
      for (const n of s.news) {
        if (n === newest) break;
        if (n.kind === 'good' || n.kind === 'bad') j.log.push(n.text);
      }
      if (s.day % 7 === 0) planner5Tick(s, j.plan);
      autoResolve(s, j.auto);
      if (j.last && s.stats.K >= 1) {
        reached = true;
        break;
      }
      // the finale comes before Type I: an era that nears the top ends early
      if (!j.last && s.stats.K >= SYSTEM.eraStopK) {
        reached = true;
        break;
      }
    }
  } finally {
    s.flags.offline = prev ?? false;
  }
  // the last climb has no end date: it runs (pushing harder every year) until the number itself
  return reached || (!j.last && s.day >= j.to) ? finishEra(s) : null;
}

/** Run a whole era at once (tests, bots). */
export function runEra(s: GameState, ctx: SimContext): EraRecord | null {
  for (let guard = 0; guard < 10_000 && s.system?.jump; guard++) {
    const r = eraStep(s, ctx, 365);
    if (r) return r;
  }
  return null;
}

function finishEra(s: GameState): EraRecord {
  const sy = s.system!;
  const j = sy.jump!;
  const after = snap5(s);
  const builtProjects = (s.charter?.projects ?? []).filter((p) => p.status === 'done' && (p.doneDay ?? 0) > j.from);
  const counts = new Map<string, number>();
  for (const p of builtProjects) {
    const key = p.kind === 'seed' ? `Seed foundry · ${ASTEROID_BY_ID[p.where]?.name ?? (p.where === 'moon' ? 'the Moon' : p.where.toUpperCase())}` : CONTRACT_KINDS[p.kind].name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rec: EraRecord = {
    from: j.from,
    to: s.day,
    stage: j.stage,
    plan: j.plan,
    before: j.before,
    after,
    built: [...counts.entries()].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)),
    highlights: [...new Set(j.log)].slice(0, 14),
    auto: j.auto.slice(0, 14),
    diary: diary5(s, j.before, after, !!j.last),
    last: j.last,
  };
  sy.eras.push(rec);
  if (sy.eras.length > 8) sy.eras.shift();
  sy.jump = null;
  sy.stageDay = s.day;
  s.flags[`vstage${j.stage}Day`] = s.day;
  if (j.last) reachTypeI(s);
  else {
    news(s, `⏩ ${yearOf(j.from)}–${yearOf(s.day)}: the era is done. ${STAGE5_NAMES[j.stage]} begins in earnest.`, 'good');
    queueEvent(s, `stage5-${j.stage}`);
  }
  spaceOutStory(s);
  return rec;
}

/**
 * Story cards that came due while the years jumped (they wait for the player, unlike the era's
 * decisions) arrive one at a time afterwards: the first the next day, then every twelve days.
 */
function spaceOutStory(s: GameState): void {
  const due = s.events.scheduled.filter((e) => e.day <= s.day).sort((a, b) => a.day - b.day);
  due.forEach((e, i) => (e.day = s.day + (i ? 12 * i : 1)));
}

/** Kardashev 1.0000: the score is today's date. */
export function reachTypeI(s: GameState): void {
  const sy = s.system!;
  if (sy.typeI) return;
  sy.typeI = s.day;
  sy.stage = 5;
  s.flags.typeI = s.day;
  s.flags.vstage5Day = s.day;
  news(s, `☀ Kardashev ${s.stats.K.toFixed(4)}. Type I, ${dateOf(s.day).getUTCFullYear()}.`, 'good');
  queueEvent(s, 'act5-typeI');
}

/** Bit's diary for the era. */
function diary5(s: GameState, a: SystemSnap, b: SystemSnap, last: boolean): string[] {
  const sy = s.system!;
  const out: string[] = [];
  const y0 = yearOf(a.day);
  const y1 = yearOf(b.day);
  if (last) {
    out.push(`${y0}. The last climb. Everyone has stopped pretending not to watch the number.`);
    out.push(`The swarm went from ${fmtTW(a.spaceTW)} to ${fmtTW(b.spaceTW)}. On clear nights you can see it from the ground now: a faint gold thread where the ecliptic runs.`);
    out.push(`${y1}. Kardashev ${b.K.toFixed(4)}. ${b.K >= 1 ? 'One.' : 'Not quite. Not yet.'}`);
    return out;
  }
  const opener = ['', 'I used to count in days. Now I count in doublings.', 'I am counting in decades now.', 'The numbers have started to look like the ones in Kip’s spreadsheet.'][sy.stage] ?? 'Another era.';
  out.push(`${y0}. ${STAGE5_NAMES[sy.stage]}. ${opener}`);
  if (b.foundryMt > a.foundryMt * 2) out.push(`The foundries make ${b.foundryMt.toFixed(b.foundryMt < 10 ? 1 : 0)} megatonnes a year now, up from ${a.foundryMt < 0.01 ? 'nothing' : a.foundryMt.toFixed(a.foundryMt < 10 ? 2 : 0)}. Each one is a copy of a copy of a seed Kip held in his hands.`);
  if (b.segments > a.segments) out.push(`${b.segments} of the twelve arcs are lit. ${b.segments >= 11 ? 'Very nearly a whole necklace round the Sun.' : b.segments >= 6 ? 'Half a necklace round the Sun.' : 'From here they look like a scratch on the dark.'}`);
  if (b.spaceTW > a.spaceTW + 1) out.push(`Power in space: ${fmtTW(b.spaceTW)}. Most of it thinks. Some of it is me.`);
  if (b.lifeExp > a.lifeExp + 2) out.push(`Healthy life expectancy ${b.lifeExp.toFixed(0)} years. ${sy.escape ? 'People have stopped counting birthdays the old way.' : 'The clinics are full of people who were told they were old.'}`);
  if (b.spacePop > a.spacePop + 1) out.push(`${b.spacePop.toFixed(0)} million people live in space now. ${s.flags.firstHabitat ? 'Aurora has a football league.' : 'Most of them sleep in the yards, between shifts.'}`);
  if (b.warming > a.warming + 0.05) out.push(`Warming ${b.warming.toFixed(2)} °C. Waste heat is the new carbon.`);
  else if (b.warming < a.warming - 0.03) out.push(`Warming ${b.warming.toFixed(2)} °C and falling. The gardens help.`);
  out.push(`${y1}. Kardashev ${b.K.toFixed(4)}, ${fmtTW(b.tw)}. ${b.K >= 0.9 ? `${(1 - b.K).toFixed(4)} to go.` : 'The curve is still bending upward.'}`);
  return out.slice(0, 6);
}

// ════════════════════════════════════════ THE PLANNER ════════════════════════════════════════
interface Wish {
  kind: ContractKind;
  size: ContractSize;
  where: string;
}

const live = (s: GameState, kind: ContractKind) => (s.charter?.projects ?? []).filter((p) => p.kind === kind && p.status !== 'cancelled');
const building = (s: GameState, kind: ContractKind) => live(s, kind).filter((p) => p.status === 'building');
const tendering = (s: GameState, kind: ContractKind) => (s.charter?.tenders ?? []).filter((t) => t.kind === kind);

/** Room for more beam stations: under the line (counting every station built or building), and no faster than the swarm can feed them. */
function beamRoom(s: GameState): number {
  const sy = s.system!;
  const all = live(s, 'beam').reduce((a, p) => a + CONTRACT_KINDS.beam.sizes[p.size - 1], 0);
  const line = headroomTW(s) + beamsUsed(s) - all;
  const feed = sy.collectors * 0.6 - all;
  return Math.min(line, feed);
}

/** The best place for the next seed: an unworked claim, then a well-fed yard, then the Moon. */
function bestSeedPlace(s: GameState, prefer?: 'S' | 'M' | 'C'): string | null {
  const sy = s.system!;
  const ids = seedPlaces(s).map((p) => p.id);
  const pending = new Set([...building(s, 'seed'), ...tendering(s, 'seed')].map((x) => x.where));
  const free = ids.filter((id) => placeOf(id) === 'asteroid' && !sy.foundries.some((f) => f.site === id) && !pending.has(id));
  free.sort((a, b) => (ASTEROID_BY_ID[b].type === prefer ? 1 : 0) - (ASTEROID_BY_ID[a].type === prefer ? 1 : 0));
  if (free.length) return free[0];
  if (!sy.foundries.some((f) => f.site === 'moon') && !pending.has('moon')) return 'moon';
  if (feedFactor(s) >= 0.75) {
    const n = (y: string) => sy.foundries.filter((f) => f.site === y).length;
    const yard = n('l4') <= n('l5') ? 'l4' : 'l5';
    if (!pending.has(yard)) return yard;
  }
  const worked = ids.filter((id) => placeOf(id) === 'asteroid' && !pending.has(id));
  return worked[0] ?? null;
}

function wishes5(s: GameState, pr: string): Wish[] {
  const sy = s.system!;
  const out: Wish[] = [];
  const seedsGoing = building(s, 'seed').length + tendering(s, 'seed').length;
  const wantSeeds = sy.foundries.length + seedsGoing < 4 + 3 * sy.stage && seedsGoing < 2;
  const seed = (prefer?: 'S' | 'M' | 'C') => {
    const at = wantSeeds ? bestSeedPlace(s, prefer) : null;
    if (at) out.push({ kind: 'seed', size: 1, where: at });
  };
  const leastTreated = () => [...REGION_IDS].filter((r) => !building(s, 'clinic').some((p) => p.where === r)).sort((a, b) => sy.treated[a] - sy.treated[b])[0];
  const beamTo = (): RegionId | undefined => [...REGION_IDS].filter((r) => !live(s, 'beam').some((p) => p.where === r)).sort((a, b) => (s.planet?.provinces[b].pop ?? 0) - (s.planet?.provinces[a].pop ?? 0))[0];
  switch (pr) {
    case 'foundries':
      seed();
      if (sy.sentinels < 0.5 && sy.dial >= 3 && !building(s, 'sentinel').length) out.push({ kind: 'sentinel', size: 2, where: 'global' });
      break;
    case 'asteroids':
      if (unknownInReach(s).length && !live(s, 'survey').some((p) => p.status === 'building')) out.push({ kind: 'survey', size: 1, where: 'global' });
      seed('S');
      break;
    case 'swarm': {
      seed('S');
      if (sy.stage >= 2 && sy.hardening < 0.75 && !building(s, 'harden').length) out.push({ kind: 'harden', size: 2, where: 'global' });
      const head = beamRoom(s);
      const r = beamTo();
      if (sy.stage >= 1 && head >= 25 && r) out.push({ kind: 'beam', size: head >= 160 ? 3 : head >= 70 ? 2 : 1, where: r });
      break;
    }
    case 'minds':
      seed('M');
      if (sy.sentinels < 0.35 && !building(s, 'sentinel').length) out.push({ kind: 'sentinel', size: 1, where: 'global' });
      break;
    case 'people': {
      if (sy.stage >= 2 && building(s, 'habitat').length < 1) out.push({ kind: 'habitat', size: 2, where: 'global' });
      const r = beamTo();
      if (sy.stage >= 1 && beamRoom(s) >= 25 && r) out.push({ kind: 'beam', size: 1, where: r });
      const t = leastTreated();
      if (sy.stage >= 1 && t && sy.treated[t] < 70) out.push({ kind: 'clinic', size: 2, where: t });
      seed('C');
      break;
    }
    case 'earth': {
      if (sy.earth) {
        const r = [...REGION_IDS].filter((x) => !building(s, 'rewild').some((p) => p.where === x)).sort((a, b) => gardenTarget(s, b) - sy.garden[b] - (gardenTarget(s, a) - sy.garden[a]))[0];
        if (r && (sy.earth !== 'workshop' || sy.garden[r] < -60)) out.push({ kind: 'rewild', size: 2, where: r });
      }
      break;
    }
    case 'longevity': {
      const t = leastTreated();
      if (sy.stage >= 1 && t && sy.treated[t] < 85) out.push({ kind: 'clinic', size: 3, where: t });
      break;
    }
    case 'safety':
      if (sy.sentinels < 0.7 && !building(s, 'sentinel').length) out.push({ kind: 'sentinel', size: 3, where: 'global' });
      break;
    case 'always':
      if (sy.stage >= 3 && !live(s, 'mercury').length) out.push({ kind: 'mercury', size: 1, where: 'global' });
      if (unknownInReach(s).length && !live(s, 'survey').some((p) => p.status === 'building') && Object.values(sy.asteroids).filter((a) => a.status === 1).length < 2) out.push({ kind: 'survey', size: 1, where: 'global' });
      seed();
      break;
  }
  return out;
}

/** One planning round: post what the era's priorities want, claim what's surveyed, let Act IV's planner see to Earth. */
export function planner5Tick(s: GameState, plan: EraPlan): void {
  const c = s.charter;
  const sy = s.system;
  if (!c || !sy) return;
  // claims are an action, not a contract
  const want = 3 + 2 * sy.stage;
  const claimed = Object.values(sy.asteroids).filter((a) => a.status >= 2 && a.owner === 'charter').length;
  if (claimed < want) {
    const next = Object.entries(sy.asteroids).find(([id, a]) => a.status === 1 && !canClaim(s, id));
    if (next && c.capital >= claimCost(s) + 6) claimAsteroid(s, next[0]);
  }
  const reserve = plan.reserve * 12 * Math.max(1, c.month.dues || 0);
  const maxOpen = 6;
  for (const pr of ['always', ...plan.priorities]) {
    if (c.tenders.length >= maxOpen) break;
    for (const w of wishes5(s, pr)) {
      if (c.tenders.some((t) => t.kind === w.kind && t.where === w.where)) continue;
      if (canPost(s, w.kind, w.size, w.where)) continue;
      const est = contractEstimate(s, w.kind, w.size, w.where);
      if (c.budget - est.share * 0.2 < reserve * 0.5) continue;
      postTender(s, w.kind, w.size, w.where);
      break;
    }
  }
  // Earth's own needs (this also awards every tender that's ready, Act V ones included)
  const act4: Priority[] = [];
  for (const p of plan.priorities) {
    if (p === 'earth') act4.push('provinces', 'climate');
    if (p === 'safety') act4.push('safety');
  }
  if (!act4.length) act4.push('provinces');
  plannerTick(s, { years: Math.min(5, plan.years), priorities: [...new Set(act4)].slice(0, 3), reserve: plan.reserve, bitRuns: plan.bitRuns });
}

void YOU;
void PRIORITY5_IDS;
