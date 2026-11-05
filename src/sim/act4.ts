/**
 * Act IV framework: the planet as one system. Begins after Act III's liftoff (or from the "Start at
 * Act IV" preset). Stages: 0 The Mandate · 1 The Supergrid · 2 The Fusion Age · 3 The High Frontier ·
 * 4 The Heat Wall · 5 done. Between stages the player sets a five-year plan and the years jump
 * (plans.ts). The planetary checklist (live conditions) starts the Heat Wall (heatwall.ts).
 */
import { PLANET, STAGE_NAMES } from '../content/planet';
import { PARTNERS } from '../content/charter';
import type { GameState } from './types';
import { news } from './core';
import { queueEvent, scheduleEvent } from './events';
import { createPlanet } from './planetInit';
import { allJoined } from './supergrid';
import { designsOnline, fusionTW } from './fusion';
import { moonStage, orbitGW } from './orbit';
import { provincesThriving } from './provinces';
import { warming } from './climate';
import { aiRegionCount } from './airegions';
import { worldMargin } from './frontier';
import { startHeatWall } from './heatwall';

export function beginAct4(s: GameState): void {
  if ((s.act ?? 1) >= 4) return;
  s.act = 4;
  s.flags.act4Started = s.day;
  s.flags.stage0Day = s.day;
  s.planet = createPlanet(s);
  // partners new in Act IV (fusion designs, air capture) join the Charter's books
  const c = s.charter;
  if (c) for (const [id, def] of Object.entries(PARTNERS)) if ((def.act ?? 3) <= 4) c.partners[id] ??= { rel: def.rel0, won: 0, done: 0, snubs: 0 };
  queueEvent(s, 'act4-begin');
  scheduleEvent(s, 'company-choice', 8);
  if (s.planet.powers === 'caretaker') scheduleEvent(s, 'second-mandate', 40);
  // the planner keeps working the plan between jumps unless you take the contracts back (Planet → Overview)
  s.flags.autopilot4 = true;
  news(s, '🎬 Act IV · Planetary begins.', 'good');
}

/** Move to a stage (called when a five-year plan is confirmed, before its jump). */
export function enterStage(s: GameState, n: number): void {
  const pl = s.planet!;
  pl.stage = n;
  pl.stageDay = s.day;
  s.flags[`stage${n}Day`] = s.day;
  news(s, `🌍 Stage ${n} · ${STAGE_NAMES[n]}.`, 'good');
}

/** A stage's work is done: the next five-year plan is waiting. */
export function openPlan(s: GameState): void {
  const pl = s.planet!;
  if (pl.planOpen) return;
  pl.planOpen = true;
  news(s, `🗓 The next five-year plan is waiting: ${STAGE_NAMES[pl.stage + 1]} (Planet → Overview).`, 'event');
  queueEvent(s, 'plan-ready');
}

// ════════════════════════════════════════ THE CHECKLIST ════════════════════════════════════════
export interface GoalCheck {
  id: string;
  label: string;
  done: boolean;
  /** Progress text for the tracker. */
  note: string;
}

/** The planetary checklist, live (the Heat Wall starts when every item holds). */
export function planetChecklist(s: GameState): GoalCheck[] {
  const tw = s.stats.worldTW;
  const fus = fusionTW(s);
  const designs = designsOnline(s).length;
  const orbit = orbitGW(s);
  const moon = moonStage(s);
  const w = warming(s);
  const ais = aiRegionCount(s);
  const margin = worldMargin(s);
  const pl = s.planet;
  const worst = pl ? Math.min(...Object.values(pl.provinces).map((p) => p.wellbeing)) : 0;
  return [
    { id: 'k80', label: 'Kardashev 0.80', done: s.stats.K >= 0.8, note: `${tw.toFixed(1)} / ${PLANET.targetTW} TW` },
    { id: 'grid', label: 'A supergrid joining every province', done: allJoined(s), note: '' },
    { id: 'fusion', label: `Fusion from two designs, ${PLANET.goalFusionTW} TW`, done: fus >= PLANET.goalFusionTW && designs >= 2, note: `${fus.toFixed(2)} TW · ${designs} design${designs === 1 ? '' : 's'}` },
    { id: 'orbit', label: `Orbital compute (${PLANET.goalOrbitGW} GW)`, done: orbit >= PLANET.goalOrbitGW, note: `${orbit} GW` },
    { id: 'moon', label: 'A Moon base with a mass driver', done: moon >= 3, note: ['none', 'outpost', 'mine', 'mass driver'][moon] },
    { id: 'wellbeing', label: `Every province’s wellbeing ≥ ${PLANET.goalWellbeing}`, done: provincesThriving(s), note: `lowest ${Math.round(worst)}` },
    { id: 'warming', label: `Warming under ${PLANET.goalWarming.toFixed(1)} °C`, done: w < PLANET.goalWarming, note: `${w.toFixed(2)} °C` },
    { id: 'ai', label: `${PLANET.goalAiRegions} AI provinces, safety margin ≥ 0`, done: ais >= PLANET.goalAiRegions && margin >= 0, note: `${ais} · margin ${margin >= 0 ? '+' : ''}${margin.toFixed(2)}` },
  ];
}

// ════════════════════════════════════════ STAGE GATES ════════════════════════════════════════
/** What ends the stage being played: the next five-year plan (stages 0–2) or The Heat Wall (stage 3). */
export interface StageGate {
  /** What has to hold (all at once). */
  items: GoalCheck[];
  /** Days into the stage before the items count (the stage is played for at least this long). */
  minDays: number;
  /** Day the stage began (its clock restarts when a jump ends). */
  start: number;
  /** The next step comes on this day at the latest, whatever the items say. */
  by: number;
  /** Everything holds and the minimum time has passed: the next step comes now. */
  ready: boolean;
}

/** The current stage's gate, shown on Planet → Overview and checked daily (null outside stages 0–3). */
export function stageGate(s: GameState): StageGate | null {
  const pl = s.planet;
  if (!pl || pl.stage > 3) return null;
  const start = Number(s.flags[`stage${pl.stage}Day`] ?? pl.stageDay);
  const days = s.day - start;
  const count = (id: string, label: string, n: number, need: number): GoalCheck => ({ id, label, done: n >= need, note: `${Math.min(n, need)} / ${need}` });
  let items: GoalCheck[];
  let minDays = 365;
  let maxDays = PLANET.stageMaxDays[pl.stage];
  switch (pl.stage) {
    case 0:
      // the first plan opens a few weeks in, once the company question is settled
      items = [{ id: 'company', label: 'Decide your company’s future', done: !!pl.company, note: '' }];
      minDays = 20;
      break;
    case 1: {
      const links = (s.charter?.projects ?? []).filter((p) => p.kind === 'link' && p.status === 'done').length;
      const pilots = Object.values(pl.fusion).reduce((a, f) => a + f.tries, 0);
      items = [count('links', 'Three supergrid links finished', links, 3), count('ai', 'An AI runs a province', aiRegionCount(s), 1), count('pilots', 'Two fusion pilots funded', pilots, 2)];
      break;
    }
    case 2:
      items = [
        count('fleet', 'A fusion fleet running', designsOnline(s).length, 1),
        { id: 'k77', label: 'Kardashev 0.77', done: s.stats.K >= 0.77, note: `${s.stats.K.toFixed(4)}` },
      ];
      break;
    default:
      // the High Frontier ends when the whole checklist holds — or a year into the stage once 2070 comes, or at the stage's limit
      items = planetChecklist(s);
      minDays = 0;
      maxDays = Math.min(maxDays, Math.max(365, PLANET.deadline - start));
  }
  const ready = items.every((g) => g.done) && days >= minDays;
  return { items, minDays, start, by: start + maxDays, ready };
}

export function tickAct4(s: GameState): void {
  if ((s.act ?? 1) === 3) {
    if (s.flags.act3Complete && !s.events.active && !s.events.queue.length) beginAct4(s);
    return;
  }
  const pl = s.planet;
  if (!pl || pl.jump || pl.planOpen) return;
  const gate = stageGate(s);
  const due = !!gate && (gate.ready || s.day >= gate.by);
  switch (pl.stage) {
    case 0:
      if (due) {
        pl.company ??= 'keep';
        openPlan(s);
      }
      break;
    case 1:
    case 2:
      if (due) openPlan(s);
      break;
    case 3:
      if (due) startHeatWall(s);
      break;
    case 4:
      if (pl.heatwall?.done && !s.flags.act4EndQueued) {
        s.flags.act4EndQueued = true;
        scheduleEvent(s, 'act4-end', 14);
      }
      break;
  }
}
