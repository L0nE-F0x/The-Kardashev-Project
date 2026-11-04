/**
 * Act V framework: Type I. Begins after Act IV's ending (or from the "Start at Act V" preset).
 * Stages: 0 The Thermal Line · 1 The Foundries · 2 The Swarm · 3 The Last Climb · 4 Solar Maximum ·
 * 5 Type I. Between stages the player makes the era's big decisions, sets an era plan and the years
 * jump (eras.ts). The Type I checklist (live) starts Solar Maximum (solarmax.ts); after it, the last
 * climb runs until Kardashev reaches 1.0000.
 */
import { PARTNERS } from '../content/charter';
import { SYSTEM, STAGE5_NAMES } from '../content/system';
import { REGION_IDS } from '../content/mapcodes';
import type { GameState } from './types';
import { fmtTW, news } from './core';
import { queueEvent, scheduleEvent } from './events';
import { createSystem } from './systemInit';
import { segmentsLit } from './systemView';
import { claimsTotal } from './asteroids';
import { overLine, spaceTW, surfaceTW } from './swarm';
import { warming } from './climate';
import { worldMargin } from './frontier';
import { startSolarMax } from './solarmax';
import { lineTW } from './systemView';

export function beginAct5(s: GameState): void {
  if ((s.act ?? 1) >= 5) return;
  s.act = 5;
  s.flags.act5Started = s.day;
  s.flags.vstage0Day = s.day;
  s.system = createSystem(s);
  const c = s.charter;
  if (c) for (const [id, def] of Object.entries(PARTNERS)) c.partners[id] ??= { rel: def.rel0, won: 0, done: 0, snubs: 0 };
  queueEvent(s, 'act5-begin');
  scheduleEvent(s, 'v-thermal-line', 3);
  scheduleEvent(s, 'v-ownership', 12);
  scheduleEvent(s, 'cast-penny', 45);
  news(s, '🎬 Act V · Type I begins.', 'good');
}

/** Move to a stage (when an era plan is confirmed, before its jump). */
export function enterStage5(s: GameState, n: number): void {
  const sy = s.system!;
  sy.stage = n;
  sy.stageDay = s.day;
  s.flags[`vstage${n}Day`] = s.day;
  news(s, `☀ Stage ${n} · ${STAGE5_NAMES[n]}.`, 'good');
}

/** A stage's work is done (and its decisions taken): the next era plan is waiting. */
export function openEraPlan(s: GameState): void {
  const sy = s.system!;
  if (sy.planOpen) return;
  sy.planOpen = true;
  news(s, `🗓 ${STAGE5_NAMES[sy.stage]} is done. The next era plan is waiting (System → Plan).`, 'event');
  queueEvent(s, 'era-ready');
}

// ════════════════════════════════════════ THE CHECKLIST ════════════════════════════════════════
export interface GoalCheck5 {
  id: string;
  label: string;
  done: boolean;
  note: string;
}

/** The Type I checklist, live (Solar Maximum starts when every item holds). */
export function typeIChecklist(s: GameState): GoalCheck5[] {
  const sy = s.system;
  const pl = s.planet;
  const worst = pl ? Math.min(...REGION_IDS.map((r) => pl.provinces[r].wellbeing)) : 0;
  const w = warming(s);
  const m = worldMargin(s);
  return [
    { id: 'k99', label: `Kardashev ${SYSTEM.goalK.toFixed(2)}`, done: s.stats.K >= SYSTEM.goalK, note: `${fmtTW(s.stats.worldTW)} · space ${fmtTW(spaceTW(s))}` },
    { id: 'line', label: 'Earth within its Thermal Line', done: !!sy?.thermalLine && overLine(s) <= 0, note: sy ? `${fmtTW(surfaceTW(s))} / ${fmtTW(lineTW(s))}` : '' },
    { id: 'wellbeing', label: `Every province’s wellbeing ≥ ${SYSTEM.goalWellbeing}`, done: !!pl && worst >= SYSTEM.goalWellbeing, note: `lowest ${Math.round(worst)}` },
    { id: 'warming', label: `Warming under ${SYSTEM.goalWarming.toFixed(1)} °C`, done: w < SYSTEM.goalWarming, note: `${w.toFixed(2)} °C` },
    { id: 'escape', label: 'Longevity escape velocity', done: !!sy?.escape, note: sy ? `+${(sy.lifeRate).toFixed(2)} years a year · ${sy.lifeExp.toFixed(0)} healthy years` : '' },
    { id: 'minds', label: 'The minds at peace (a seat settled, mood ≥ 50)', done: !!sy?.seat && sy.mindsMood >= 50, note: sy ? `mood ${Math.round(sy.mindsMood)}` : '' },
    { id: 'margin', label: 'World safety margin ≥ 0', done: m >= 0, note: `${m >= 0 ? '+' : ''}${m.toFixed(2)}` },
    { id: 'mercury', label: 'Mercury surveyed', done: (sy?.mercury ?? 0) >= 2, note: ['not yet', 'probe on its way', 'surveyed'][sy?.mercury ?? 0] },
  ];
}

const since = (s: GameState, n: number) => s.day - Number(s.flags[`vstage${n}Day`] ?? s.day);
const waiting = (s: GameState) => !!s.events.active || s.events.queue.length > 0;

/** The day's Act V gates. */
export function tickAct5(s: GameState): void {
  if ((s.act ?? 1) === 4) {
    if (s.flags.act4Complete && !waiting(s)) beginAct5(s);
    return;
  }
  const sy = s.system;
  if (!sy || sy.jump || sy.planOpen) return;
  const max = SYSTEM.stageMaxDays;
  switch (sy.stage) {
    case 0:
      if (sy.thermalLine && sy.ownership && since(s, 0) >= 30) openEraPlan(s);
      else if (since(s, 0) >= max[0] && !waiting(s)) {
        sy.thermalLine ??= SYSTEM.lines[0];
        sy.ownership ??= 'commons';
        openEraPlan(s);
      }
      break;
    case 1: {
      const ready = sy.foundries.length >= 3 && claimsTotal(s) >= 3 && segmentsLit(sy.collectors) >= 2 && since(s, 1) >= 365;
      if (ready || since(s, 1) >= max[1]) gate(s, ['v-earth'], () => !!sy.earth);
      break;
    }
    case 2:
      if (s.stats.K >= SYSTEM.eraStopK) {
        // a fast run: the last climb is already in reach, so stage 3 starts without a jump
        gate(s, ['v-longevity', 'v-minds'], () => !!sy.longevity && !!s.flags.mindsSplitDecided, () => {
          enterStage5(s, 3);
          queueEvent(s, 'stage5-3');
        });
      } else if ((s.stats.K >= 0.9 && since(s, 2) >= 365) || since(s, 2) >= max[2]) gate(s, ['v-longevity', 'v-minds'], () => !!sy.longevity && !!s.flags.mindsSplitDecided);
      break;
    case 3: {
      const ready = typeIChecklist(s).every((g) => g.done) || s.stats.K >= 0.995;
      const late = s.day >= SYSTEM.deadline && since(s, 3) >= 365;
      if (ready || late || since(s, 3) >= max[3]) {
        // Bit's choice comes before the storm
        if (!sy.bitFate) {
          if (!s.flags.bitFateQueued) {
            s.flags.bitFateQueued = true;
            queueEvent(s, 'v-bit');
          }
          if (!waiting(s) && since(s, 3) >= max[3] + 60) sy.bitFate = 'leash';
          break;
        }
        if (!waiting(s)) startSolarMax(s);
      }
      break;
    }
    case 4:
      if (sy.solarmax?.done && !s.flags.smEndQueued) {
        s.flags.smEndQueued = true;
        queueEvent(s, 'sm-end');
      }
      break;
  }
}

/** A stage gate: queue its big decisions once, open the plan when they're taken. */
function gate(s: GameState, decisions: string[], taken: () => boolean, then: () => void = () => openEraPlan(s)): void {
  const key = `gate${s.system!.stage}`;
  if (!s.flags[key]) {
    s.flags[key] = s.day;
    for (const d of decisions) queueEvent(s, d);
    return;
  }
  if (taken() || (!waiting(s) && s.day - Number(s.flags[key]) > 60)) then();
}
