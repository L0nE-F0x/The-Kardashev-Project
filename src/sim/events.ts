import { EVENT_BY_ID, EVENTS } from '../content/events';
import { DIFFICULTIES, EVENT_RATES } from '../content/difficulty';
import type { GameState } from './types';
import { rand, randInt, weightedPick } from './core';
import { currentCapability, incidentChance } from './model';

export function queueEvent(s: GameState, id: string, ctx: Record<string, string | number> = {}): void {
  if (s.events.queue.some((e) => e.id === id) || s.events.active?.id === id) return;
  s.events.queue.push({ id, ctx, day: s.day });
}

/** Queue an event a number of days from now (event chains, finale beats). */
export function scheduleEvent(s: GameState, id: string, days: number, ctx: Record<string, string | number> = {}): void {
  s.events.scheduled.push({ id, day: s.day + Math.max(0, Math.round(days)), ctx });
}

/** Roll for random events, safety incidents and cash crises; surface the next queued card. */
export function tickEvents(s: GameState): void {
  if (s.flags.offline) return;

  // chained / scripted events that have come due
  if (s.events.scheduled?.length) {
    const due = s.events.scheduled.filter((e) => e.day <= s.day);
    if (due.length) {
      s.events.scheduled = s.events.scheduled.filter((e) => e.day > s.day);
      for (const e of due) if (EVENT_BY_ID[e.id]) queueEvent(s, e.id, e.ctx);
    }
  }

  // safety incidents — checked twice a month once a model is in the wild
  const c = currentCapability(s);
  if (c > 0 && s.day % 15 === 0 && s.day - s.safety.lastIncidentDay > 45) {
    const p = (incidentChance(s.stats.margin) / 2) * DIFFICULTIES[s.meta.difficulty].incident;
    if (rand(s) < p) {
      const major = c >= 2.5 && s.stats.margin < -0.3 && rand(s) < 0.6;
      queueEvent(s, major ? 'incident-major' : 'incident-minor');
      if (major) s.flags.lastMajorIncident = s.day;
      s.safety.incidents += 1;
      s.safety.lastIncidentDay = s.day;
    }
  }

  // out of money
  if (s.finance.cash < 0) {
    if (DIFFICULTIES[s.meta.difficulty].broke === 'bankrupt') queueEvent(s, 'bankruptcy');
    else if ((s.events.last['bridge-loan'] ?? -999) < s.day - 60) queueEvent(s, 'bridge-loan');
  }

  // the random pool
  const rate = EVENT_RATES[s.meta.eventRate].mult;
  if (rate > 0 && s.day >= s.events.nextRoll) {
    const [lo, hi] = DIFFICULTIES[s.meta.difficulty].eventDays;
    s.events.nextRoll = s.day + Math.round(randInt(s, lo, hi) * rate);
    const candidates: { item: { id: string; ctx: Record<string, string | number> }; weight: number }[] = [];
    for (const def of EVENTS) {
      if (!def.weight) continue;
      if (def.minDay && s.day < def.minDay) continue;
      if ((def.act ?? 1) > (s.act ?? 1)) continue;
      if (def.phase && ((s.act ?? 1) < 2 || s.phase < def.phase)) continue;
      if (def.actOnly && def.actOnly !== (s.act ?? 1)) continue;
      if (def.cphase && ((s.act ?? 1) < 3 || (s.charter?.phase ?? 0) < def.cphase)) continue;
      const last = s.events.last[def.id];
      if (last !== undefined && (def.once || s.day - last < (def.cooldown ?? 365))) continue;
      const w = def.weight(s);
      if (w <= 0) continue;
      const ctx = def.setup ? def.setup(s) : {};
      if (!ctx) continue;
      candidates.push({ item: { id: def.id, ctx }, weight: w });
    }
    const chosen = weightedPick(s, candidates);
    if (chosen) queueEvent(s, chosen.id, chosen.ctx);
  }

  if (!s.events.active && s.events.queue.length) {
    s.events.active = s.events.queue.shift()!;
    s.events.last[s.events.active.id] = s.day;
  }
}

/** Apply the player's choice on the active event card. */
export function resolveEvent(s: GameState, choiceIndex: number): boolean {
  const active = s.events.active;
  if (!active) return false;
  const def = EVENT_BY_ID[active.id];
  if (!def) {
    s.events.active = null;
    return false;
  }
  const choices = def.choices(s, active.ctx);
  const choice = choices[choiceIndex];
  if (!choice || choice.disabled) return false;
  choice.apply(s, active.ctx);
  s.events.history.push({ id: active.id, day: s.day, choice: choiceIndex });
  if (s.events.history.length > 80) s.events.history.shift();
  s.events.active = null;
  if (s.events.queue.length) {
    s.events.active = s.events.queue.shift()!;
    s.events.last[s.events.active.id] = s.day;
  }
  return true;
}
