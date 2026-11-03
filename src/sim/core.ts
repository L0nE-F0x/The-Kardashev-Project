import type { GameState, NewsItem } from './types';

// ── RNG (mulberry32, state lives in GameState so saves resume deterministically) ─────────────
export function rand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: GameState, lo: number, hi: number): number {
  return lo + Math.floor(rand(s) * (hi - lo + 1));
}

export function pick<T>(s: GameState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length)];
}

export function weightedPick<T>(s: GameState, items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((a, b) => a + Math.max(0, b.weight), 0);
  if (total <= 0) return null;
  let r = rand(s) * total;
  for (const it of items) {
    r -= Math.max(0, it.weight);
    if (r <= 0) return it.item;
  }
  return items[items.length - 1].item;
}

export function nextId(s: GameState, prefix: string): string {
  s.nextId += 1;
  return `${prefix}${s.nextId}`;
}

// ── calendar ────────────────────────────────────────────────────────────────────────────────
export const START_MS = Date.UTC(2027, 0, 1);
const DAY_MS = 86_400_000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dateOf(day: number): Date {
  return new Date(START_MS + Math.floor(day) * DAY_MS);
}

export function yearOf(day: number): number {
  return dateOf(day).getUTCFullYear() + dateOf(day).getUTCMonth() / 12;
}

/** Fractional years since the start of the campaign. */
export function yearsElapsed(day: number): number {
  return day / 365.25;
}

/** year*12 + month — changes exactly once per calendar month. */
export function monthKey(day: number): number {
  const d = dateOf(day);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function fmtDate(day: number, long = false): string {
  const d = dateOf(day);
  if (long) return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtMonth(day: number): string {
  const d = dateOf(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthLabelOfKey(key: number): string {
  return `${MONTHS[key % 12]} ${Math.floor(key / 12)}`;
}

// ── news ────────────────────────────────────────────────────────────────────────────────────
export function news(s: GameState, text: string, kind: NewsItem['kind'] = 'info'): void {
  s.news.unshift({ day: s.day, text, kind });
  if (s.news.length > 60) s.news.length = 60;
}

// ── formatting helpers shared by sim text + UI ──────────────────────────────────────────────
export function fmtMoney(v: number, digits = 1): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(digits)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmtNum(v: number, digits = 1): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(digits === 0 ? 0 : 1)}k`;
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(digits);
}

export function fmtMW(mw: number): string {
  if (Math.abs(mw) >= 1e6) return `${(mw / 1e6).toFixed(2)} TW`;
  if (Math.abs(mw) >= 1000) return `${(mw / 1000).toFixed(2)} GW`;
  return `${mw.toFixed(mw < 10 ? 1 : 0)} MW`;
}

/** 1.2e26 → "1.2×10²⁶" */
export function fmtSci(v: number, digits = 1): string {
  if (v <= 0) return '0';
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  const sup = String(e)
    .split('')
    .map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(ch)] ?? ch)
    .join('');
  return `${m.toFixed(digits)}×10${sup}`;
}

export function fmtDays(d: number): string {
  if (d >= 60) return `${Math.round(d / 30.4)} mo`;
  if (d >= 14) return `${Math.round(d / 7)} wk`;
  return `${Math.max(0, Math.round(d))} d`;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
