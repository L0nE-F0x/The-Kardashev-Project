import type { GameState, NewsItem } from './types';
import { tick } from './tick';
import type { SimContext } from './supply';

/** Real hours away → game days. Active play runs ~1 day/second; idle runs 1 month per hour. */
export const OFFLINE_DAYS_PER_HOUR = 30;
export const OFFLINE_MAX_DAYS = 365;
export const OFFLINE_MIN_MINUTES = 5;

export interface Snapshot {
  day: number;
  cash: number;
  K: number;
  models: number;
  capability: number;
  techs: number;
  installed: number;
  online: number;
  revenueMonth: number;
}

export interface OfflineReport {
  hours: number;
  days: number;
  before: Snapshot;
  after: Snapshot;
  highlights: NewsItem[];
}

export function snapshot(s: GameState): Snapshot {
  return {
    day: s.day,
    cash: s.finance.cash,
    K: s.stats.K,
    models: s.models.length,
    capability: s.stats.capability,
    techs: s.research.done.length,
    installed: s.stats.installedAccel,
    online: s.facilities.filter((f) => f.status === 'online').length,
    revenueMonth: s.stats.revenueMonth,
  };
}

/**
 * Catch the world up after time away. Production, construction and deliveries keep going;
 * no new crises fire while you're gone (they wait for you).
 */
export function simulateOffline(s: GameState, ctx: SimContext, awayMs: number): OfflineReport | null {
  const hours = awayMs / 3_600_000;
  if (hours * 60 < OFFLINE_MIN_MINUTES) return null;
  const days = Math.min(OFFLINE_MAX_DAYS, Math.floor(hours * OFFLINE_DAYS_PER_HOUR));
  if (days < 1) return null;
  const before = snapshot(s);
  s.flags.offline = true;
  try {
    for (let i = 0; i < days; i++) tick(s, ctx);
  } finally {
    s.flags.offline = false;
  }
  const highlights = s.news.filter((n) => n.day > before.day && (n.kind === 'good' || n.kind === 'bad')).slice(0, 8);
  return { hours, days, before, after: snapshot(s), highlights };
}
