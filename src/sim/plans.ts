/**
 * Act IV: five-year plans and the jumps between stages. When a stage's work is done the plan screen
 * opens; you pick up to three priorities, a reserve and the length (3–5 years), and the years run on
 * the real daily tick with events off (like offline progress). A planner posts and awards Charter
 * contracts by your priorities; decisions that come up are taken on autopilot and listed in the
 * report, with the biggest news and Bit's diary for the chapter. The UI runs a jump in chunks so
 * the map can time-lapse; tests run it in one go.
 */
import { CONTRACT_KINDS, HVDC_ROUTES, PARTNERS, whereName, YOU } from '../content/charter';
import { EVENT_BY_ID } from '../content/events';
import { DESIGN_IDS, FUSION_DESIGNS, PLANET, PRIORITY_IDS, STAGE_NAMES, SUPERGRID_ROUTES } from '../content/planet';
import { LAUNCH_SITES, MEGA_SITES, SITE_BY_ID } from '../content/sites';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { ContractKind, ContractSize, FivePlan, GameState, JumpRecord, PlanetSnap, Priority, Tender } from './types';
import { clamp, dateOf, fmtDate, news } from './core';

const yearOf = (day: number) => dateOf(day).getUTCFullYear();
import { queueEvent, resolveEvent } from './events';
import { addModifier } from './effects';
import { affordable, awardBid, bidScore, canPost, committedMonthly, contractEstimate, duesMonthly, postTender } from './charter';
import { enterStage } from './act4';
import { tick } from './tick';
import type { SimContext } from './supply';
import { avgWellbeing } from './provinces';
import { fleetBlocked, fusionTW, pilotBlocked, pilotOdds } from './fusion';
import { canLaunch, moonStage, orbitGW, padsBuilt } from './orbit';
import { gridComponents, linksBuilt, mainGrid } from './supergrid';
import { warming } from './climate';
import { worldMargin } from './frontier';
import { fairShare, spendShare } from './council';
import { FACTION_IDS, factionOf } from '../content/charter';
import { headroomTW } from './swarm';

type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });

// ════════════════════════════════════════ PLANS ════════════════════════════════════════
export function defaultPlan(s: GameState): FivePlan {
  const next = (s.planet?.stage ?? 0) + 1;
  const priorities: Priority[] = next === 1 ? ['grid', 'fusion', 'provinces'] : next === 2 ? ['fusion', 'grid', 'climate'] : ['space', 'fusion', 'provinces'];
  return { years: next === 1 ? 3 : 4, priorities, reserve: 0.25, bitRuns: false };
}

/** Why Bit can't run the plan, or null. */
export function bitPlanBlocked(s: GameState): string | null {
  const pl = s.planet;
  if (!pl) return 'Act IV only.';
  if (pl.ais.bit.trust < 60) return `Bit’s trust is ${Math.round(pl.ais.bit.trust)}; it needs 60 to run a plan.`;
  if (worldMargin(s) < 0) return 'Not with the world safety margin below zero.';
  return null;
}

export function snap(s: GameState): PlanetSnap {
  return {
    day: s.day,
    K: s.stats.K,
    tw: s.stats.worldTW,
    warming: warming(s),
    wellbeing: avgWellbeing(s),
    fusionGW: fusionTW(s) * 1000,
    links: linksBuilt(s),
    orbitGW: orbitGW(s),
    budget: s.charter?.budget ?? 0,
    legitimacy: s.charter?.legitimacy ?? 0,
  };
}

/** Confirm the waiting plan: the next stage begins and its jump starts. */
export function confirmPlan(s: GameState, plan: FivePlan): Result {
  const pl = s.planet;
  if (!pl?.planOpen) return fail('No plan is waiting.');
  if (!PLANET.jumpYears.includes(plan.years as 3 | 4 | 5)) return fail('A plan covers 3, 4 or 5 years.');
  const pri = [...new Set(plan.priorities)].filter((p) => PRIORITY_IDS.includes(p)).slice(0, 3);
  if (!pri.length) return fail('Pick at least one priority.');
  if (plan.bitRuns && bitPlanBlocked(s)) return fail(bitPlanBlocked(s)!);
  const clean: FivePlan = { years: plan.years, priorities: pri, reserve: clamp(plan.reserve, 0, 1), bitRuns: plan.bitRuns };
  pl.plan = clean;
  pl.planOpen = false;
  const next = pl.stage + 1;
  enterStage(s, next);
  const days = Math.round(clean.years * 365.25);
  pl.jump = { from: s.day, to: s.day + days, plan: clean, before: snap(s), stage: next, auto: [], log: [] };
  if (clean.bitRuns) {
    addModifier(s, 'charter:build', days, 'Bit runs the plan', { mult: 1.08 });
    pl.ais.bit.trust = clamp(pl.ais.bit.trust + 4, 0, 100);
    pl.bitBond = clamp(pl.bitBond + 5, -100, 100);
  }
  news(s, `⏩ The ${clean.years}-year plan begins: ${pri.map((p) => p).join(', ')}.`, 'event');
  return { ok: true };
}

// ════════════════════════════════════════ THE JUMP ════════════════════════════════════════
/** Take every waiting decision on autopilot (the first choice that's available), logging it. */
export function autoResolve(s: GameState, log: string[] | undefined = s.planet?.jump?.auto): void {
  for (let guard = 0; guard < 25; guard++) {
    if (!s.events.active && s.events.queue.length) {
      s.events.active = s.events.queue.shift()!;
      s.events.last[s.events.active.id] = s.day;
    }
    const a = s.events.active;
    if (!a) return;
    const def = EVENT_BY_ID[a.id];
    if (!def) {
      s.events.active = null;
      continue;
    }
    const choices = def.choices(s, a.ctx);
    const idx = choices.findIndex((c) => !c.disabled);
    if (idx < 0) {
      s.events.active = null;
      continue;
    }
    log?.push(`${fmtDate(s.day)} · ${def.title(s, a.ctx)}: ${choices[idx].label}`);
    resolveEvent(s, idx);
  }
}

/** Run up to `days` days of the jump. Returns the record when the jump finishes, else null. */
export function jumpStep(s: GameState, ctx: SimContext, days: number): JumpRecord | null {
  const pl = s.planet;
  const j = pl?.jump;
  if (!pl || !j) return null;
  const prev = s.flags.offline;
  s.flags.offline = 'jump';
  try {
    for (let i = 0; i < days && s.day < j.to; i++) {
      const newest = s.news[0];
      tick(s, ctx);
      // keep the big news of the years we skip (the feed only holds 60 items)
      for (const n of s.news) {
        if (n === newest) break;
        if (n.kind === 'good' || n.kind === 'bad') j.log.push(n.text);
      }
      if (s.day % 7 === 0) plannerTick(s, j.plan);
      autoResolve(s);
    }
  } finally {
    s.flags.offline = prev ?? false;
  }
  return s.day >= j.to ? finishJump(s) : null;
}

/** Run a whole jump at once (tests, bots). */
export function runJump(s: GameState, ctx: SimContext): JumpRecord | null {
  for (let guard = 0; guard < 10_000 && s.planet?.jump; guard++) {
    const r = jumpStep(s, ctx, 365);
    if (r) return r;
  }
  return null;
}

function finishJump(s: GameState): JumpRecord {
  const pl = s.planet!;
  const j = pl.jump!;
  const after = snap(s);
  const builtProjects = (s.charter?.projects ?? []).filter((p) => p.status === 'done' && (p.doneDay ?? 0) > j.from);
  const counts = new Map<string, number>();
  for (const p of builtProjects) {
    const key = p.kind === 'link' || p.kind === 'hvdc' || p.kind === 'fpilot' || p.kind === 'moonbase' || p.kind === 'moonmine' || p.kind === 'massdriver' ? `${CONTRACT_KINDS[p.kind].name} · ${whereName(p.where)}` : CONTRACT_KINDS[p.kind].name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const built = [...counts.entries()].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
  const rec: JumpRecord = {
    from: j.from,
    to: s.day,
    stage: j.stage,
    plan: j.plan,
    before: j.before,
    after,
    built,
    highlights: [...new Set(j.log)].slice(0, 14),
    auto: j.auto.slice(0, 14),
    diary: diary(s, j.before, after, builtProjects.map((p) => p.kind)),
  };
  pl.jumps.push(rec);
  if (pl.jumps.length > 6) pl.jumps.shift();
  pl.jump = null;
  // the stage is played from here: its clock starts now, not when the plan was confirmed
  pl.stageDay = s.day;
  s.flags[`stage${j.stage}Day`] = s.day;
  news(s, `⏩ ${yearOf(j.from)}–${yearOf(s.day)}: the plan is done. ${STAGE_NAMES[j.stage]} begins in earnest.`, 'good');
  queueEvent(s, `stage-${j.stage}`);
  return rec;
}

/** Bit's diary for the chapter: a few lines about what changed. */
function diary(s: GameState, a: PlanetSnap, b: PlanetSnap, kinds: ContractKind[]): string[] {
  const out: string[] = [];
  const y0 = yearOf(a.day);
  const y1 = yearOf(b.day);
  const has = (k: ContractKind) => kinds.includes(k);
  out.push(`${y0}. ${STAGE_NAMES[s.planet!.stage]}. I am writing this down because the years are going to move fast.`);
  if (b.links > a.links) out.push(`${b.links - a.links} new supergrid link${b.links - a.links > 1 ? 's' : ''}. When the sun sets on one end, it is still up on the other. I check the flows every night; the power goes where the light is.`);
  if (b.fusionGW > a.fusionGW + 1) out.push(`Fusion went from ${Math.round(a.fusionGW)} to ${Math.round(b.fusionGW)} GW. Lena keeps a jar of the first deuterium we ever burned on her desk.`);
  if (has('fpilot') && !has('ffleet')) out.push('A pilot plant finished. Whatever the result, we learned more in one firing than in a decade of papers.');
  if (has('dac')) out.push('The air-capture farms hum. The stone they make is grey and boring and the most hopeful thing I have ever seen.');
  if (has('odc')) out.push('Some of me runs in orbit now. It is quiet up there, and very cold, and the sun never sets.');
  if (has('moonbase') || has('moonmine') || has('massdriver')) out.push('Ade sent a photo of Earth from the crater rim. Twelve provinces, one thin blue line of air.');
  const dw = b.wellbeing - a.wellbeing;
  if (Math.abs(dw) >= 3) out.push(dw > 0 ? `People are doing better: wellbeing up ${Math.round(dw)} points across the provinces.` : `People are struggling: wellbeing down ${Math.round(-dw)} points. We need to look after the hot provinces.`);
  if (b.warming > a.warming + 0.05) out.push(`Warming ${b.warming.toFixed(2)} °C. Every tenth of a degree is somebody’s summer.`);
  else if (b.warming < a.warming - 0.02) out.push(`Warming is falling: ${b.warming.toFixed(2)} °C. The first time in my life.`);
  out.push(`${y1}. Kardashev ${b.K.toFixed(4)}, ${b.tw.toFixed(1)} terawatts. ${b.K >= 0.8 ? 'We are past 0.80.' : `${(PLANET.targetTW - b.tw).toFixed(0)} TW to go.`}`);
  return out.slice(0, 6);
}

// ════════════════════════════════════════ THE PLANNER ════════════════════════════════════════
interface Wish {
  kind: ContractKind;
  size: ContractSize;
  where: string;
  opt?: string;
}

const live = (s: GameState, kind: ContractKind) => (s.charter?.projects ?? []).filter((p) => p.kind === kind && p.status !== 'cancelled');
const openTender = (s: GameState, w: Wish) => (s.charter?.tenders ?? []).some((t) => t.kind === w.kind && t.where === w.where && (t.opt ?? '') === (w.opt ?? ''));

/** How far each faction is below its fair share of Charter spending (positive = owed). */
function factionNeed(s: GameState): Record<string, number> {
  const share = spendShare(s);
  return Object.fromEntries(FACTION_IDS.map((f) => [f, fairShare(f) - share[f]]));
}

/** Sort megaproject sites so the faction owed the most comes first (keeps tempers down). */
function fairOrder<T extends { region: RegionId }>(s: GameState, sites: T[], score: (x: T) => number): T[] {
  const need = factionNeed(s);
  return [...sites].sort((a, b) => score(b) + 2 * need[factionOf(b.region)] - (score(a) + 2 * need[factionOf(a.region)]));
}

/** Energy at the megaprojects with the best resource (solar first, then wind), fairly spread. */
function energyWishes(s: GameState): Wish[] {
  const out: Wish[] = [];
  const sun = fairOrder(s, MEGA_SITES.filter((m) => m.mega?.includes('solar')), (m) => m.solarCF);
  const wind = fairOrder(s, MEGA_SITES.filter((m) => m.mega?.includes('wind')), (m) => m.windCF);
  for (const m of sun.slice(0, 4)) out.push({ kind: 'solar', size: 3, where: m.id });
  for (const m of wind.slice(0, 3)) out.push({ kind: 'wind', size: 3, where: m.id });
  return out;
}

function wishes(s: GameState, pr: Priority | 'energy'): Wish[] {
  const pl = s.planet!;
  const c = s.charter!;
  const out: Wish[] = [];
  switch (pr) {
    case 'grid': {
      const main = new Set(mainGrid(s));
      const comps = gridComponents(s);
      const compOf = (r: RegionId) => comps.findIndex((g) => g.includes(r));
      const routes = SUPERGRID_ROUTES.filter((r) => !live(s, 'link').some((p) => p.where === r.id))
        .map((r) => ({ r, joins: compOf(r.from) !== compOf(r.to) ? 1 : 0, touchesMain: main.has(r.from) || main.has(r.to) ? 1 : 0 }))
        .sort((a, b) => b.joins - a.joins || b.touchesMain - a.touchesMain || a.r.km - b.r.km);
      for (const x of routes.slice(0, 3)) if (x.joins) out.push({ kind: 'link', size: 2, where: x.r.id });
      for (const h of HVDC_ROUTES) if (!live(s, 'hvdc').some((p) => p.where === h.id)) out.push({ kind: 'hvdc', size: 2, where: h.id });
      out.push(...energyWishes(s).slice(0, 2));
      break;
    }
    case 'fusion': {
      const piloting = DESIGN_IDS.filter((d) => pl.fusion[d].status === 'pilot').length + c.tenders.filter((t) => t.kind === 'fpilot').length;
      if (piloting < 2) {
        const idle = DESIGN_IDS.filter((d) => !pilotBlocked(s, d)).sort((a, b) => pilotOdds(s, b) - pilotOdds(s, a));
        for (const d of idle.slice(0, 2 - piloting)) out.push({ kind: 'fpilot', size: 1, where: d });
      }
      const working = DESIGN_IDS.filter((d) => pl.fusion[d].status === 'won' || pl.fusion[d].status === 'partial');
      const sites = fairOrder(s, MEGA_SITES, (m) => -0.05 * live(s, 'ffleet').filter((p) => p.where === m.id).length);
      for (const d of working)
        for (const size of [3, 2, 1] as ContractSize[]) {
          if (fleetBlocked(s, d, CONTRACT_KINDS.ffleet.sizes[size - 1])) continue;
          out.push({ kind: 'ffleet', size, where: sites[DESIGN_IDS.indexOf(d) % sites.length].id, opt: d });
          break;
        }
      break;
    }
    case 'space': {
      if (pl.stage < 3) break;
      if (!canLaunch(s) && !live(s, 'launch').length) out.push({ kind: 'launch', size: 1, where: String(s.flags.launchSite ?? LAUNCH_SITES[0].id) });
      if (padsBuilt(s) + live(s, 'spaceport').filter((p) => p.status === 'building').length * 4 < 8) out.push({ kind: 'spaceport', size: 2, where: String(s.flags.launchSite ?? LAUNCH_SITES[0].id) });
      const m = moonStage(s);
      const next: ContractKind | null = m === 0 ? 'moonbase' : m === 1 ? 'moonmine' : m === 2 ? 'massdriver' : null;
      if (next && !live(s, next).length) out.push({ kind: next, size: 1, where: 'global' });
      const odcAll = live(s, 'odc').reduce((a, p) => a + CONTRACT_KINDS.odc.sizes[p.size - 1], 0);
      if (odcAll < 6) out.push({ kind: 'odc', size: 2, where: 'global' });
      if (pl.debris.leo > 32 && !live(s, 'cleanup').some((p) => p.status === 'building')) out.push({ kind: 'cleanup', size: 2, where: 'global' });
      const rect = REGION_IDS.filter((r) => !live(s, 'sps').some((p) => p.where === r)).sort((a, b) => pl.provinces[b].pop - pl.provinces[a].pop);
      if (rect[0] && live(s, 'sps').length < 6) out.push({ kind: 'sps', size: 2, where: rect[0] });
      break;
    }
    case 'provinces': {
      const building = (k: ContractKind, r: string) => live(s, k).some((p) => p.where === r && p.status === 'building');
      const worst = [...REGION_IDS].filter((r) => pl.provinces[r].wellbeing < 60 || pl.provinces[r].water > 45).sort((a, b) => pl.provinces[a].wellbeing - pl.provinces[b].wellbeing);
      for (const r of worst.slice(0, 2)) if (!building('desal', r)) out.push({ kind: 'desal', size: 2, where: r });
      const access = [...REGION_IDS].filter((r) => (c.access[r] ?? 0) < 60).sort((a, b) => (c.access[a] ?? 0) - (c.access[b] ?? 0));
      if (access[0] && !building('compute', access[0])) out.push({ kind: 'compute', size: 2, where: access[0] });
      break;
    }
    case 'climate': {
      const dacAll = live(s, 'dac').reduce((a, p) => a + CONTRACT_KINDS.dac.sizes[p.size - 1], 0);
      if (dacAll >= 45 || (dacAll >= 12 && warming(s) < 1.9)) {
        out.push(...energyWishes(s).slice(0, 2));
        break;
      }
      const sun = MEGA_SITES.filter((m) => m.solarCF >= 0.24).sort((a, b) => live(s, 'dac').filter((p) => p.where === a.id).length - live(s, 'dac').filter((p) => p.where === b.id).length);
      for (const m of sun.slice(0, 2)) out.push({ kind: 'dac', size: 3, where: m.id });
      out.push(...energyWishes(s).slice(0, 2));
      break;
    }
    case 'safety':
      out.push({ kind: 'evals', size: 2, where: 'global' }, { kind: 'interp', size: 2, where: 'global' });
      break;
    case 'energy':
      out.push(...energyWishes(s));
      break;
  }
  return out;
}

/** The best-value bid that isn't your own company's (or -1). */
function bestBid(s: GameState, t: Tender): number {
  let best = -1;
  let score = Infinity;
  t.bids.forEach((b, i) => {
    if (b.partner === YOU) return;
    const sc = bidScore(s, t, b);
    if (sc < score) {
      score = sc;
      best = i;
    }
  });
  return best;
}

/** The plan's reserve: keep this much in the treasury after any down payment. */
const reserveOf = (s: GameState, plan: FivePlan) => plan.reserve * duesMonthly(s) * 12;

/** The planner commits at most 85% of the monthly dues to progress payments (dues swing with Legitimacy). */
function plannerAffords(s: GameState, plan: FivePlan, price: number, days: number): boolean {
  const c = s.charter!;
  const extra = ((price * 0.8) / Math.max(1, days)) * 30.44;
  return c.budget - price * 0.2 >= reserveOf(s, plan) && committedMonthly(s) + extra <= duesMonthly(s) * 0.85 + Math.max(0, c.budget - price * 0.2 - reserveOf(s, plan)) / 24 && affordable(s, price, days);
}

/** One planning round (weekly during a jump): award what's ready, post what the priorities want. */
export function plannerTick(s: GameState, plan: FivePlan): void {
  const c = s.charter;
  if (!c || !s.planet) return;
  for (const t of [...c.tenders]) {
    if (t.pending.length || !t.bids.length) continue;
    const i = bestBid(s, t);
    if (i < 0) continue;
    const b = t.bids[i];
    if (!plannerAffords(s, plan, b.price, b.days)) continue;
    awardBid(s, t.id, i);
  }
  const maxOpen = 5;
  // Act V: no new energy on Earth's surface when it is up against the Thermal Line
  const nearLine = !!s.system?.thermalLine && headroomTW(s) < 40;
  for (const pr of [...plan.priorities, ...(nearLine ? [] : ['energy' as const])]) {
    if (c.tenders.length >= maxOpen) return;
    for (const w of wishes(s, pr)) {
      if (openTender(s, w)) continue;
      if (canPost(s, w.kind, w.size, w.where, w.opt)) continue;
      const est = contractEstimate(s, w.kind, w.size, w.where, w.opt);
      if (!plannerAffords(s, plan, est.share, est.days)) continue;
      postTender(s, w.kind, w.size, w.where, w.opt);
      break;
    }
  }
}

void PARTNERS;
void SITE_BY_ID;
void FUSION_DESIGNS;
