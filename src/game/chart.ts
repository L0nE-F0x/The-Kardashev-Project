import type { ChartPoint, GameState } from '../sim/types';

export type { ChartPoint };
import { warming } from '../sim/climate';

/**
 * The Stats panel's history: one point per game month, kept on the save (`meta.chart`; the sim never reads it).
 * Written by the game layer after ticks, skips, jumps and eras. Old saves are back-filled from the finance history
 * (cash and revenue only).
 */

const EVERY = 30;
const MAX_POINTS = 1500;

export function sampleChart(s: GameState): void {
  const pts = (s.meta.chart ??= backfill(s));
  const last = pts[pts.length - 1];
  if (last && s.day - last.d < EVERY) return;
  const st = s.stats;
  pts.push({
    d: s.day,
    cash: s.finance.cash,
    rev: st.revenueMonth,
    cost: st.costMonth,
    ef: st.computeEF,
    mw: st.powerServed,
    load: st.powerLoad,
    k: st.K,
    cap: st.capability,
    frontier: st.frontier,
    margin: st.margin,
    chips: st.installedAccel + st.rentedAccel,
    ...(s.charter ? { charter: s.charter.budget } : {}),
    ...(s.planet ? { warm: warming(s) } : {}),
  });
  // a very long campaign: thin the oldest half to every other point
  if (pts.length > MAX_POINTS) {
    const half = Math.floor(pts.length / 2);
    s.meta.chart = [...pts.slice(0, half).filter((_, i) => i % 2 === 0), ...pts.slice(half)];
  }
}

/** A save from before the Stats panel: cash and revenue from the monthly finance records. */
function backfill(s: GameState): ChartPoint[] {
  const hist = s.finance.history ?? [];
  const n = hist.length;
  return hist.map((m, i) => ({
    d: Math.max(0, s.day - (n - i) * 30),
    cash: m.cashEnd,
    rev: m.revenue,
    cost: m.debt + m.rental + m.power + m.fuel + m.opex + m.staff + m.shipping + m.other,
    ef: NaN,
    mw: NaN,
    load: NaN,
    k: NaN,
    cap: NaN,
    frontier: NaN,
    margin: NaN,
    chips: NaN,
  }));
}
