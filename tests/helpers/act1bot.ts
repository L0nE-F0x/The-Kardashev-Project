/**
 * The Act I bot: a scripted player that follows the tutorial (rent, train, build a small campus at
 * West Texas, order chips, research down the list) and answers every card with its first enabled
 * choice. Used by the Act I test and the balance report.
 */
import { build, placeOrder, requestGrid, setAlloc, setRental, setResearch, startTraining } from '../../src/sim/actions';
import { resolveEvent } from '../../src/sim/events';
import { TECHS } from '../../src/content/techs';
import { EVENT_BY_ID } from '../../src/content/events';
import type { GameState } from '../../src/sim/types';
import type { SimContext } from '../../src/sim/supply';

/** Resolve any event card by picking the first enabled choice. */
export function autoResolve1(s: GameState) {
  while (s.events.active) {
    const def = EVENT_BY_ID[s.events.active.id];
    const choices = def.choices(s, s.events.active.ctx);
    const idx = Math.max(0, choices.findIndex((c) => !c.disabled));
    resolveEvent(s, idx);
  }
}

/** How an Act I player plays: the original bot is the default; the balance report searches the rest. */
export interface Act1Plan {
  /** Rented accelerators until `rentalStop`. */
  rental: number;
  rentalStop: number;
  /** Accelerators ordered on day 1, split between the two suppliers. */
  orders: number;
  solar: boolean;
  battery: boolean;
  /** Share of compute serving inference once Bit-1 ships. */
  infer: number;
  /** Order more chips when the hall has room and cash is above this (0 = never). */
  restockAbove: number;
}

export const ACT1_DEFAULT: Act1Plan = { rental: 2000, rentalStop: 400, orders: 8000, solar: true, battery: true, infer: 0.35, restockAbove: 0 };

/** The plans the balance report tries on every difficulty (the best one that finishes counts). */
export function act1Plans(): Act1Plan[] {
  const out: Act1Plan[] = [];
  for (const orders of [3000, 5000, 8000])
    for (const rental of [500, 2000])
      for (const battery of [false, true])
        for (const infer of [0.35, 0.55]) out.push({ rental, rentalStop: rental > 1000 ? 400 : 300, orders, solar: true, battery, infer, restockAbove: 150e6 });
  return out;
}

/**
 * A simple scripted player that follows the tutorial: rent, train, build a small campus at West
 * Texas, order chips, research down the list. The default plan is the original bot the Act I test
 * pins; the balance report passes others.
 */
export function botDay1(s: GameState, ctx: SimContext, plan: Act1Plan = ACT1_DEFAULT) {
  autoResolve1(s);
  if (s.day === 1) {
    setRental(s, plan.rental);
    startTraining(s);
    setAlloc(s, 'safety', 0.1);
    build(s, 'west-texas', 'datacenter');
    if (plan.solar) build(s, 'west-texas', 'solar');
    if (plan.battery) build(s, 'west-texas', 'battery');
    requestGrid(s, 'west-texas', 20);
    placeOrder(s, ctx, 'kestrel', plan.orders / 2, 'west-texas', 'sea');
    placeOrder(s, ctx, 'lumen', plan.orders / 2, 'west-texas', 'sea');
  }
  if (!s.research.current) {
    const next = TECHS.find((t) => !s.research.done.includes(t.id) && (t.requires ?? []).every((r) => s.research.done.includes(r)));
    if (next) setResearch(s, next.id);
  }
  if (!s.training && s.models.length < 2) startTraining(s);
  if (s.models.length >= 1 && s.alloc.infer < plan.infer - 0.05) setAlloc(s, 'infer', plan.infer);
  if (s.day === plan.rentalStop) setRental(s, 0);
  // keep the hall stocked when there's money to spare
  if (plan.restockAbove && s.day % 60 === 0 && s.day > 1 && s.finance.cash > plan.restockAbove && s.orders.length === 0) {
    const room = s.facilities.filter((f) => f.type === 'datacenter').reduce((a, f) => a + 8300 - (f.racks ?? []).reduce((b, r) => b + r.qty, 0), 0);
    if (room >= 1000) placeOrder(s, ctx, 'kestrel', Math.min(room, 2000), 'west-texas', 'sea');
  }
}
