/**
 * Act III: the Charter's safety regime. The world safety margin is how well the field as a whole can
 * check its strongest model: world alignment (grown by Charter programmes, licensing, your own
 * research and the labs' work) minus the frontier (the best model of any lab, yours included).
 * Below zero, rival labs have incidents. The compute cap slows everyone; your own big runs need a
 * Charter licence, which you can fast-track (a conflict of interest) or put through evals.
 */
import { CONTRACT_KINDS } from '../content/charter';
import type { GameState } from './types';
import { clamp, news, pick, rand } from './core';
import { techMult } from './effects';
import { queueEvent } from './events';
import { alignmentOf, currentCapability, incidentChance } from './model';
import { addLegitimacy } from './charter';
import { DIFFICULTIES } from '../content/difficulty';

/** Above this a training run needs a Charter licence once the compute cap is in force. */
export const COMPUTE_CAP = 3e30;
/** Days the evals route takes for your own licence. */
export const LICENCE_EVALS_DAYS = 90;

const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

/** The best model anywhere (rivals, open labs, you). */
export function worldFrontier(s: GameState): number {
  return Math.max(currentCapability(s), ...s.market.rivals.map((r) => r.capability));
}

export function worldMargin(s: GameState): number {
  const c = s.charter;
  if (!c) return s.stats.margin;
  return c.regime.alignment - worldFrontier(s);
}

/** The lab with the strongest model other than you. */
export function leadingLab(s: GameState): string {
  return [...s.market.rivals].sort((a, b) => b.capability - a.capability)[0]?.id ?? 'meridian';
}

/** Where world alignment starts when the Charter is founded. */
export function initialWorldAlignment(s: GameState): number {
  return Math.max(alignmentOf(s) - 0.15, worldFrontier(s) - 0.25);
}

export function capInForce(s: GameState): boolean {
  return (s.act ?? 1) >= 3 && passed(s, 'compute-cap');
}

/** Whether your next run needs a Charter licence, and whether you have one. */
export function ownRunStatus(s: GameState, gen: number, flop: number): 'free' | 'licensed' | 'pending' | 'needed' {
  if (!capInForce(s) || flop <= COMPUTE_CAP) return 'free';
  const l = s.charter!.regime.ownLicence;
  if (!l || l.gen !== gen) return 'needed';
  return s.day >= l.readyDay ? 'licensed' : 'pending';
}

export type Result = { ok: true } | { ok: false; reason: string };

/** Ask the Charter for a licence for your next run: the evals route (90 days) or the fast track (Legitimacy). */
export function requestOwnLicence(s: GameState, gen: number, fast: boolean): Result {
  const c = s.charter;
  if (!c) return { ok: false, reason: 'No Charter yet.' };
  if (c.regime.ownLicence?.gen === gen) return { ok: false, reason: 'Already requested.' };
  c.regime.ownLicence = { gen, readyDay: s.day + (fast ? 0 : LICENCE_EVALS_DAYS) };
  if (fast) {
    addLegitimacy(s, -8 * (s.flags.dualClass ? 1.25 : 1) * (c.blindTrust ? 0.5 : 1));
    news(s, `⚠ You fast-track a Charter licence for your own Bit-${gen} run. The Council takes notes.`, 'bad');
  } else news(s, `🧪 Bit-${gen} goes to the Charter’s evaluators. Licence in about three months.`);
  return { ok: true };
}

export function tickRegime(s: GameState): void {
  const c = s.charter;
  if (!c) return;
  const g = c.regime;
  // the field's own safety work, the Charter's programmes, licensing and Bit
  const interp = c.projects.filter((p) => p.kind === 'interp' && p.status === 'done').length;
  let drift = 0.08 + 0.04 * Math.min(3, interp) + (passed(s, 'run-licensing') ? 0.03 : 0) + (c.desk.bit?.on ? 0.03 : 0);
  // running programmes help a little while they run
  drift += 0.03 * Math.min(3, c.projects.filter((p) => (p.kind === 'evals' || p.kind === 'interp') && p.status === 'building').length);
  g.alignment += (drift * techMult(s, 'alignGain')) / 365;
  // your own research is shared through the regime: it can pull the field up to roughly even with
  // its strongest model, but a healthy margin takes the Charter's own programmes
  const pull = Math.min(alignmentOf(s) - 0.4, worldFrontier(s) + 0.05);
  if (pull > g.alignment) g.alignment += (pull - g.alignment) * 0.005;
  const m = worldMargin(s);
  g.marginDays = m >= 0 ? g.marginDays + 1 : 0;

  // incidents at rival labs when the field can't keep up (twice a month)
  if (s.day % 15 === 7 && s.day - g.lastIncident > 60 && !s.flags.offline) {
    const p = (incidentChance(m) / 3) * DIFFICULTIES[s.meta.difficulty].incident * techMult(s, 'incidentSeverity') * (passed(s, 'open-weights') ? 1.25 : 1);
    if (rand(s) < p) {
      g.incidents += 1;
      g.lastIncident = s.day;
      const lab = pick(s, s.market.rivals.map((r) => r.id));
      queueEvent(s, 'rival-incident', { lab, severe: m < -0.4 ? 1 : 0 });
    }
  }
  // licence requests from rival labs (with licensing in force)
  if (passed(s, 'run-licensing') && s.day % 30 === 11 && rand(s) < 0.12 && s.day - Number(s.events.last['licence-request'] ?? -9999) > 240) {
    queueEvent(s, 'licence-request', { lab: leadingLab(s) });
  }
  void CONTRACT_KINDS;
  void clamp;
}
