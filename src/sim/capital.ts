/**
 * Act II money: project finance (loans against your assets), the board and its quarterly reviews,
 * enterprise compute contracts and the IPO valuation.
 */
import { BOARD, CUSTOMERS, FINANCE } from '../content/capital';
import { FACILITIES } from '../content/facilities';
import { REGIONS } from '../content/regions';
import { siteDef } from '../content/sites';
import type { ComputeContract, GameState } from './types';
import { clamp, fmtMoney, news, nextId, pick, rand, randInt, yearsElapsed } from './core';
import { spend } from './economy';
import { queueEvent } from './events';
import { buildCost, currentCapability, DAYS_PER_MONTH, facilitySlots, frontier, INFER_REV_PER_ACCEL_MONTH, inferPriceTrend, tierMult } from './model';
import type { ComputeResult } from './ai';

/** Rough book value of what you own (for borrowing against). */
export function assetValue(s: GameState): number {
  let v = 0;
  for (const f of s.facilities) {
    if (f.type === 'hq' || f.status !== 'online') continue;
    v += buildCost(s, f.type) * (0.6 + 0.4 * tierMult(f)) * Math.max(1, facilitySlots(f));
    for (const r of f.racks ?? []) v += r.qty * 12_000;
  }
  return v;
}

export function debtTotal(s: GameState): number {
  return s.capital.loans.reduce((a, l) => a + l.balance, 0);
}

/** How much more you can borrow right now. */
export function creditLeft(s: GameState): number {
  return Math.max(0, assetValue(s) * FINANCE.ltv - debtTotal(s));
}

/** Interest rate offered by your home bloc's stance. */
export function loanRate(s: GameState): number {
  const home = siteDef(s.company.homeSite).region;
  const conf = s.capital.board?.confidence ?? 60;
  return FINANCE.rate[s.blocs[home]?.stance ?? 'neutral'] + (conf < 40 ? 0.01 : 0);
}

export function monthlyPayment(principal: number, rate: number, years: number): number {
  const r = rate / 12;
  const n = years * 12;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** IPO valuation: revenue multiple adjusted by growth, frontier position, board confidence, safety and the finale. */
export function ipoValuation(s: GameState): number {
  const rev = s.stats.revenueMonth * 12;
  const gap = currentCapability(s) - frontier(s);
  const frontierMult = clamp(1 + gap * 0.35, 0.6, 1.6);
  const conf = (s.capital.board?.confidence ?? 60) / 60;
  const safety = s.stats.margin >= 0 ? 1.1 : s.stats.margin >= -0.25 ? 1 : 0.85;
  const standing = 0.8 + 0.15 * (s.finale?.standing ?? 0);
  const growth = clamp(1 + (s.stats.revenueMonth / Math.max(1, s.capital.board?.baseline ?? s.stats.revenueMonth) - 1), 0.8, 1.5);
  return Math.max(30e9, rev * 18 * frontierMult * clamp(conf, 0.6, 1.4) * safety * standing * growth);
}

export function tickCapital(s: GameState, compute: ComputeResult): void {
  if ((s.act ?? 1) < 2) return;
  const cap = s.capital;

  // loans: daily share of the monthly payment
  for (const l of cap.loans) {
    if (l.balance <= 0) continue;
    const interest = (l.balance * l.rate) / 365;
    const pay = Math.min(l.monthly / DAYS_PER_MONTH, l.balance + interest);
    l.balance = Math.max(0, l.balance - (pay - interest));
    spend(s, 'debt', pay);
  }
  const paidOff = cap.loans.filter((l) => l.balance <= 1);
  if (paidOff.length) {
    for (const l of paidOff) news(s, `🏦 ${l.label} paid off.`, 'good');
    cap.loans = cap.loans.filter((l) => l.balance > 1);
  }

  // contracts: penalties for under-delivery, track delivery, retire finished ones
  if (compute.penaltyDay > 0) spend(s, 'other', compute.penaltyDay);
  for (const c of cap.contracts) {
    const d = compute.delivered[c.id];
    if (d !== undefined) c.delivered = (c.delivered ?? 1) * 0.9 + Math.min(1, d) * 0.1;
  }
  const ended = cap.contracts.filter((c) => s.day > c.endDay);
  if (ended.length) {
    for (const c of ended) {
      news(s, `📄 Contract with ${c.customer} completed (${Math.round((c.delivered ?? 1) * 100)}% delivered).`, (c.delivered ?? 1) > 0.9 ? 'good' : 'info');
      if (cap.board) cap.board.confidence = clamp(cap.board.confidence + ((c.delivered ?? 1) > 0.9 ? 2 : -4), 0, 100);
    }
    cap.contracts = cap.contracts.filter((c) => s.day <= c.endDay);
  }
  cap.offers = cap.offers.filter((o) => (o.expires ?? 0) >= s.day);
  if (s.phase >= 2 && s.day % 45 === 0 && cap.offers.length < 3) cap.offers.push(makeOffer(s));

  // the board's quarterly review
  const b = cap.board;
  if (b && s.day >= b.nextReview) {
    const growth = b.baseline > 0 ? s.stats.revenueMonth / b.baseline - 1 : 1;
    const passed = growth >= b.target;
    b.confidence = clamp(b.confidence + (passed ? 8 : growth > 0 ? -6 : -12), 0, 100);
    if (passed) s.flags.boardPassed = s.day;
    else b.misses += 1;
    queueEvent(s, 'board-review', { growth: Math.round(growth * 100), target: Math.round(b.target * 100), passed: passed ? 1 : 0 });
    b.baseline = Math.max(1, s.stats.revenueMonth);
    b.nextReview = s.day + BOARD.reviewDays;
    if (b.confidence < 30 && !s.flags.ceoReview) queueEvent(s, 'ceo-review');
  }
}

/** A new enterprise contract offer. */
export function makeOffer(s: GameState): ComputeContract {
  const cust = pick(s, CUSTOMERS);
  const region = pick(s, cust.regions);
  const growth = Math.pow(1.5, Math.max(0, yearsElapsed(s.day) - 2.5));
  const units = Math.round((randInt(s, cust.units[0], cust.units[1]) * growth) / 500) * 500;
  const months = randInt(s, cust.months[0], cust.months[1]);
  const monthly = units * INFER_REV_PER_ACCEL_MONTH * inferPriceTrend(s) * cust.premium * (0.9 + rand(s) * 0.2);
  return {
    id: nextId(s, 'k'),
    customer: cust.name,
    region,
    units,
    monthly,
    penalty: monthly * 0.6,
    months,
    startDay: 0,
    endDay: 0,
    expires: s.day + 60,
  };
}

export function contractLabel(c: ComputeContract): string {
  return `${c.customer} · ${REGIONS[c.region].short} · ${c.units.toLocaleString()} accel-eq · ${fmtMoney(c.monthly)}/mo × ${c.months}`;
}

/** Monthly opex of everything you run (used by jobs and the board). */
export function monthlyOpex(s: GameState): number {
  return s.facilities.reduce((a, f) => a + (f.status === 'online' ? FACILITIES[f.type].opex * tierMult(f) : 0), 0);
}
