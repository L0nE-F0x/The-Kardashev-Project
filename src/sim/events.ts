import { EVENT_BY_ID, EVENTS, type EventDef } from '../content/events';
import { DIFFICULTIES, EVENT_RATES } from '../content/difficulty';
import type { GameState } from './types';
import { news, rand, randInt, weightedPick } from './core';
import { currentCapability, incidentChance } from './model';
import { companyHandedOver } from './economy';

export function queueEvent(s: GameState, id: string, ctx: Record<string, string | number> = {}): void {
  if (s.events.queue.some((e) => e.id === id) || s.events.active?.id === id) return;
  s.events.queue.push({ id, ctx, day: s.day });
}

/** Queue an event a number of days from now (event chains, finale beats). */
export function scheduleEvent(s: GameState, id: string, days: number, ctx: Record<string, string | number> = {}): void {
  s.events.scheduled.push({ id, day: s.day + Math.max(0, Math.round(days)), ctx });
}

/**
 * A finale is under way (the Crunch, the Threshold and the renewal vote, the Heat Wall, Solar Maximum): its own cards
 * are the story, so no random card interrupts it.
 */
export function finaleRunning(s: GameState): boolean {
  if (s.finale && !s.finale.done) return true;
  const cp = s.charter?.phase ?? 0;
  if (s.charter && (s.act ?? 1) === 3 && cp >= 4 && cp <= 5) return true;
  if (s.planet?.heatwall && !s.planet.heatwall.done) return true;
  if (s.system?.solarmax && !s.system.solarmax.done) return true;
  return false;
}

/** A card about running the company: the Act I–II pool (no Charter phase, no Act V stage). */
function companyCard(def: EventDef): boolean {
  return (def.act ?? 1) <= 2 && def.cphase === undefined && def.vstage === undefined;
}

/** From Act III the company is one actor among many: are you still the one running it? */
export function runsCompany(s: GameState): boolean {
  return !s.charter || (!s.charter.blindTrust && !companyHandedOver(s));
}

/** The few cards from earlier acts that still make sense in the swarm age (the rest of Act V's pool is its own). */
const ACT5_EXTRA = new Set(['orbit-collision', 'hvdc-fault', 'partner-favour']);

/** Is this random card worth asking about, given where the campaign is? (Later acts drop the earlier acts' noise.) */
function poolFits(s: GameState, def: EventDef): boolean {
  if (s.system) return def.vstage !== undefined || ACT5_EXTRA.has(def.id);
  if (companyCard(def) && !runsCompany(s)) return false;
  return true;
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

  // Bit's tutorial (the first ten minutes) isn't interrupted by random cards or incidents; the first one comes a
  // few weeks after it ends
  const tutorial = (s.meta.tutorialStep ?? -1) >= 0 && (s.act ?? 1) === 1;
  if (tutorial) s.events.nextRoll = Math.max(s.events.nextRoll, s.day + 20);

  // safety incidents — checked twice a month once a model is in the wild
  const c = currentCapability(s);
  if (c > 0 && !tutorial && s.day % 15 === 0 && s.day - s.safety.lastIncidentDay > 45) {
    const p = (incidentChance(s.stats.margin) / 2) * DIFFICULTIES[s.meta.difficulty].incident;
    if (rand(s) < p) {
      const major = c >= 2.5 && s.stats.margin < -0.3 && rand(s) < 0.6;
      queueEvent(s, major ? 'incident-major' : 'incident-minor');
      if (major) s.flags.lastMajorIncident = s.day;
      s.safety.incidents += 1;
      s.safety.lastIncidentDay = s.day;
    }
  }

  // out of money (a company you sold or handed over is someone else's to rescue)
  if (s.finance.cash < 0 && !companyHandedOver(s)) {
    // Hard ends the company when it runs dry, but only while it IS the game: from Act III you're the Steward,
    // and a company in trouble gets a bridge loan like everyone else's
    if (DIFFICULTIES[s.meta.difficulty].broke === 'bankrupt' && !s.charter) queueEvent(s, 'bankruptcy');
    else if ((s.events.last['bridge-loan'] ?? -999) < s.day - 60) queueEvent(s, 'bridge-loan');
  }

  // the random pool (quiet while a finale runs; the Act V era is half as chatty)
  const rate = EVENT_RATES[s.meta.eventRate].mult;
  if (rate > 0 && s.day >= s.events.nextRoll && finaleRunning(s)) s.events.nextRoll = s.day + 7;
  else if (rate > 0 && s.day >= s.events.nextRoll) {
    const [lo, hi] = DIFFICULTIES[s.meta.difficulty].eventDays;
    s.events.nextRoll = s.day + Math.round(randInt(s, lo, hi) * rate * (s.system ? 1.5 : 1));
    const candidates: { item: { id: string; ctx: Record<string, string | number> }; weight: number }[] = [];
    for (const def of EVENTS) {
      if (!def.weight) continue;
      if (def.minDay && s.day < def.minDay) continue;
      if ((def.act ?? 1) > (s.act ?? 1)) continue;
      if (def.phase && ((s.act ?? 1) < 2 || s.phase < def.phase)) continue;
      if (def.actOnly && def.actOnly !== (s.act ?? 1)) continue;
      if (def.cphase && ((s.act ?? 1) < 3 || (s.charter?.phase ?? 0) < def.cphase)) continue;
      if (def.vstage !== undefined && (!s.system || s.system.stage < def.vstage || s.system.stage >= 4)) continue;
      if (!poolFits(s, def)) continue;
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

  surfaceNext(s);
}

/**
 * Put the next queued card in front of the player. While the company sits in the blind trust (or belongs to someone
 * else), its own cards — a bridge loan, a chain from the Scale-Up — are the trustee's: answered with the first
 * sensible choice and reported in the news.
 */
function surfaceNext(s: GameState): void {
  while (!s.events.active && s.events.queue.length) {
    const next = s.events.queue.shift()!;
    s.events.last[next.id] = s.day;
    const def = EVENT_BY_ID[next.id];
    if (def && s.charter && companyCard(def) && !runsCompany(s)) {
      const choices = def.choices(s, next.ctx);
      const i = choices.findIndex((c) => !c.disabled);
      if (i >= 0) {
        choices[i].apply(s, next.ctx);
        s.events.history.push({ id: next.id, day: s.day, choice: i });
        if (s.events.history.length > 80) s.events.history.shift();
        news(s, `🗂 ${companyHandedOver(s) ? 'Its new owners' : 'The trustee'}: “${def.title(s, next.ctx)}” — ${choices[i].label}.`, 'event');
      }
      continue;
    }
    s.events.active = next;
  }
}

/**
 * A way out for a card whose choices are all disabled (nothing on it can be afforded or applies any more): it goes,
 * nothing happens, and the next card (if any) comes up.
 */
export function dismissEvent(s: GameState): boolean {
  const active = s.events.active;
  if (!active) return false;
  const def = EVENT_BY_ID[active.id];
  if (def && def.choices(s, active.ctx).some((c) => !c.disabled)) return false;
  s.events.history.push({ id: active.id, day: s.day, choice: -1 });
  if (s.events.history.length > 80) s.events.history.shift();
  s.events.active = null;
  surfaceNext(s);
  return true;
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
  surfaceNext(s);
  return true;
}
