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
/** A figure with its sign, the minus a real one: +0.20, −0.38 (a hyphen read as a dash next to the cards' "−3"). */
export function signed(v: number, digits = 2): string {
  const t = Math.abs(v).toFixed(digits);
  return `${v < 0 && Number(t) !== 0 ? '−' : v >= 0 ? '+' : ''}${t}`;
}

export function fmtMoney(v: number, digits = 1): string {
  const sign = v < 0 ? '−' : '';
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

/** Terawatts, readable: 0.4 → "400 GW", 85 → "85 TW", 4200 → "4.20 PW". */
export function fmtTW(tw: number): string {
  const a = Math.abs(tw);
  if (a >= 1000) return `${(tw / 1000).toFixed(2)} PW`;
  if (a >= 100) return `${tw.toFixed(0)} TW`;
  if (a >= 1) return `${tw.toFixed(1)} TW`;
  return `${(tw * 1000).toFixed(0)} GW`;
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
  // Act V's rates run to absurd waits: years past two, and a word past a century
  if (d >= 36500) return 'centuries';
  if (d >= 730) return `${Math.round(d / 365)} yr`;
  if (d >= 60) return `${Math.round(d / 30.4)} mo`;
  if (d >= 14) return `${Math.round(d / 7)} wk`;
  return `${Math.max(0, Math.round(d))} d`;
}

// ── words ───────────────────────────────────────────────────────────────────────────────────
/**
 * A title written mid-sentence: its first word loses its capital, unless it is an acronym or a symbol (HBM line,
 * D-He3). Later words are left alone: they are lower case already, or names.
 */
export function midName(name: string): string {
  const first = name.split(' ')[0];
  return (first.match(/[A-Z]/g)?.length ?? 0) >= 2 || /\d/.test(first) ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

/** "a" or "an" before a word, by its sound: an EUV licence, an AI hub, a HVDC link is "an HVDC link". */
export function an(phrase: string): string {
  const w = phrase.trim().split(/[\s-]/)[0] ?? '';
  const acronym = w.length > 1 && w === w.toUpperCase() && /^[A-Z]/.test(w);
  const vowel = acronym ? /^[AEFHILMNORSX]/.test(w) : /^[aeiou]/i.test(w) && !/^(uni|use|usa|eu[^v]|one)/i.test(w);
  return `${vowel ? 'an' : 'a'} ${phrase}`;
}

/** "1 month", "3 months". */
export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A name's possessive: Lattice Labs’, Europe’s. */
export const poss = (name: string) => `${name}’${/s$/i.test(name) ? '' : 's'}`;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
