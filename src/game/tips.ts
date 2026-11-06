import type { Game } from './game';
import type { AdvisorId, GameState } from '../sim/types';
import { researchable } from '../sim/actions';
import { facilityIT } from '../sim/model';
import { siteDef } from '../content/sites';
import { fmtMoney } from '../sim/core';

/**
 * Advisor tips: one-off, just-in-time nudges after Bit's tutorial ("the lab is idle", "you're crawling at 1× through
 * a ten-month build"). Each fires at most once per company, only when its condition has held for `days` game days
 * in a row, and goes away by itself once the player fixes it. They never stop the clock.
 * Settings → Gameplay → Advisor tips turns them off.
 */
export interface TipDef {
  id: string;
  advisor: AdvisorId;
  /** Acts it can fire in (default Acts I–II). */
  acts?: number[];
  /** Consecutive game days the condition must hold. */
  days: number;
  when: (s: GameState, g: Game) => boolean;
  text: (s: GameState, g: Game) => string;
  /** A one-click fix. */
  action?: { label: string; run: (g: Game) => void };
  /** A How to Play topic. */
  learn?: string;
}

export interface ActiveTip {
  id: string;
  advisor: AdvisorId;
  text: string;
  action?: TipDef['action'];
  learn?: string;
}

const halls = (s: GameState) => s.facilities.filter((f) => f.type === 'datacenter' && f.status === 'online');
const fill = (f: GameState['facilities'][number]) => {
  const cap = facilityIT(f) * 1000;
  return cap > 0 ? (f.racks ?? []).reduce((a, b) => a + b.qty * b.kw, 0) / cap : 1;
};
const chipsComing = (s: GameState, siteId: string) => s.orders.some((o) => !o.done && o.dest === siteId) || s.shipments.some((x) => x.dest === siteId);
/** Days until the soonest thing the player is waiting for: a build or the training run. */
function longestWait(s: GameState): number {
  let wait = 0;
  for (const f of s.facilities) if (f.status === 'building' && !f.blocked) wait = Math.max(wait, f.buildDays - f.progress);
  const run = s.training;
  if (run && s.stats.trainPFd > 0) wait = Math.max(wait, (run.target - run.done) / s.stats.trainPFd);
  return wait;
}
const jobOn = (s: GameState, id: AdvisorId) => !!s.jobs?.[id]?.on;

export const TIPS: TipDef[] = [
  {
    id: 'speed',
    advisor: 'bit',
    acts: [1, 2, 3],
    days: 40,
    when: (s, g) => g.speed === 1 && longestWait(s) > 60,
    text: (s) => `Psst — nothing needs us for about ${Math.round(longestWait(s) / 30)} months. Press ▶▶▶ (top left) and they fly by. I stop the clock the moment a card needs you.`,
    action: { label: 'Go faster', run: (g) => g.setSpeed(4) },
    learn: 'time',
  },
  {
    id: 'research-idle',
    advisor: 'iris',
    days: 12,
    when: (s) => !s.research.current && researchable(s).length > 0,
    text: () => 'The lab is idle — nobody told us what to work on next. Pick a research project: every one makes something cheaper, faster or smarter.',
    action: { label: 'Open Research', run: (g) => g.panel !== 'research' && g.openPanel('research') },
  },
  {
    id: 'brownout',
    advisor: 'juno',
    days: 6,
    when: (s) => s.stats.powerLoad > 1 && s.stats.powerServed < s.stats.powerLoad * 0.93,
    text: (s) => `We’re short of power: ${Math.round((1 - s.stats.powerServed / s.stats.powerLoad) * 100)}% of what our sites need isn’t there, so everything runs slower. Select the site that’s short and add generation, batteries or a grid connection.`,
    learn: 'power',
  },
  {
    id: 'empty-hall',
    advisor: 'mira',
    days: 20,
    when: (s) => !jobOn(s, 'mira') && halls(s).some((f) => fill(f) < 0.5 && !chipsComing(s, f.siteId)),
    text: (s) => {
      const f = halls(s).find((h) => fill(h) < 0.5 && !chipsComing(s, h.siteId))!;
      return `The hall at ${siteDef(f.siteId).name} is only ${Math.round(fill(f) * 100)}% full and no chips are on the way. Training speed is total compute — an empty rack is wasted concrete. Order more in Orders.`;
    },
    action: { label: 'Open Orders', run: (g) => g.panel !== 'orders' && g.openPanel('orders') },
    learn: 'chips',
  },
  {
    id: 'rentals',
    advisor: 'penny',
    days: 45,
    when: (s) => s.rental.units > 0 && s.stats.installedAccel >= 2000,
    text: (s) => `We still rent ${s.rental.units.toLocaleString()} chips from Cumulus though our own hall is running. Unless we need them for a training push, turning the rental down in Compute saves real money.`,
    action: { label: 'Open Compute', run: (g) => g.panel !== 'compute' && g.openPanel('compute') },
  },
  {
    id: 'train-idle',
    advisor: 'bit',
    days: 20,
    when: (s) => !s.training && s.models.length >= 1 && s.stats.installedAccel > 0 && !jobOn(s, 'bit'),
    text: () => 'No training run is going. Serving customers pays the bills, but the next model is how we grow — start a run in Compute when you’re ready.',
    action: { label: 'Open Compute', run: (g) => g.panel !== 'compute' && g.openPanel('compute') },
    learn: 'models',
  },
  {
    id: 'margin',
    advisor: 'iris',
    days: 8,
    when: (s) => s.models.length >= 1 && s.stats.margin < 0 && !jobOn(s, 'iris'),
    text: (s) => `Our safety margin is ${s.stats.margin.toFixed(2)} — the models are more capable than we can check. Below zero, incidents get likely. More compute on Safety, or safety research, brings it back.`,
    action: { label: 'Open Compute', run: (g) => g.panel !== 'compute' && g.openPanel('compute') },
    learn: 'models',
  },
  {
    id: 'runway',
    advisor: 'penny',
    days: 10,
    when: (s) => {
      const net = s.stats.revenueMonth - s.stats.costMonth;
      return net < 0 && s.finance.cash < -net * 6 && s.finance.cash > 0;
    },
    text: (s) => {
      const net = s.stats.costMonth - s.stats.revenueMonth;
      return `At ${fmtMoney(net)} a month going out, we have about ${Math.max(1, Math.floor(s.finance.cash / net))} months of cash. Finance shows where it goes — rentals and idle plants are the usual suspects.`;
    },
    action: { label: 'Open Finance', run: (g) => g.panel !== 'finance' && g.openPanel('finance') },
  },
  {
    id: 'campus',
    advisor: 'bit',
    acts: [1],
    days: 3,
    when: (s, g) => halls(s).length > 0 && !g.visitedCampus,
    text: () => 'Our first hall is online! Select its site and press View to walk around the campus — the people there are ours.',
    action: {
      label: 'Take me there',
      run: (g) => {
        const f = g.state ? halls(g.state)[0] : null;
        if (f) g.enterDiorama(f.siteId);
      },
    },
  },
];

const TIP_BY_ID = Object.fromEntries(TIPS.map((t) => [t.id, t]));

/** Run once per batch of ticks: count streaks, raise a tip, drop one that no longer applies. */
export function checkTips(g: Game, s: GameState, days: number, streak: Map<string, number>): ActiveTip | null | undefined {
  const seen = (s.meta.tipsSeen ??= []);
  const cur = g.tip;
  // the current tip goes away once its problem is fixed
  if (cur) {
    const def = TIP_BY_ID[cur.id];
    if (def && !def.when(s, g)) return null;
    return undefined;
  }
  if (!g.settings.tips || s.meta.tutorialStep >= 0 || s.events.active || g.mode !== 'map' && g.mode !== 'diorama') return undefined;
  const act = s.act ?? 1;
  for (const t of TIPS) {
    if (seen.includes(t.id) || !(t.acts ?? [1, 2]).includes(act)) continue;
    if (!t.when(s, g)) {
      streak.delete(t.id);
      continue;
    }
    const n = (streak.get(t.id) ?? 0) + days;
    streak.set(t.id, n);
    if (n >= t.days) {
      seen.push(t.id);
      streak.clear();
      return { id: t.id, advisor: t.advisor, text: t.text(s, g), action: t.action, learn: t.learn };
    }
  }
  return undefined;
}
