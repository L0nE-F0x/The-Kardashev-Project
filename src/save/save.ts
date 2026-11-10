import type { GameState } from '../sim/types';
import { ensureAct2State, SAVE_VERSION } from '../sim/state';
import { dateOf } from '../sim/core';
import { EVENT_BY_ID } from '../content/events';
import { saveTextFile } from '../platform/platform';

/**
 * Saves live in localStorage as numbered slots (up to MAX_SLOTS companies), plus a small index
 * so the menu can show cards without parsing every save (the desktop app's webview keeps its own storage).
 */
const INDEX_KEY = 'kardashev.slots.v1';
const SLOT_PREFIX = 'kardashev.slot.';
const LEGACY_KEY = 'kardashev.save.v1';
export const MAX_SLOTS = 5;

export interface SlotInfo {
  id: string;
  name: string;
  home: string;
  day: number;
  dateLabel: string;
  K: number;
  model: string;
  difficulty: string;
  founder: string;
  playtime: number;
  savedAt: number;
  act1: boolean;
  /** Current act (2 = The Scale-Up). */
  act?: number;
  act2?: boolean;
  act3?: boolean;
  act4?: boolean;
  /** The year the campaign reached Type I. */
  typeI?: number;
  gameOver: boolean;
  /** A sandbox company. */
  sandbox?: boolean;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Bring older saves up to the current schema. */
export function migrate(raw: GameState): GameState | null {
  if (!raw || typeof raw !== 'object' || typeof raw.day !== 'number') return null;
  if (raw.version > SAVE_VERSION) return null;
  raw.research.pool ??= 0;
  raw.meta ??= {
    difficulty: 'standard',
    founder: 'classic',
    eventRate: 'normal',
    rivalPace: 'normal',
    startCash: 400e6,
    playtime: 0,
    tutorialStep: -1,
    createdAt: raw.savedAt ?? Date.now(),
  };
  ensureAct2State(raw);
  // a card this version doesn't know (renamed or removed) would block the clock forever: let it go
  const known = (e: { id: string } | null | undefined) => !!e && !!EVENT_BY_ID[e.id];
  if (raw.events) {
    if (raw.events.active && !known(raw.events.active)) raw.events.active = null;
    raw.events.queue = (raw.events.queue ?? []).filter(known);
    raw.events.scheduled = (raw.events.scheduled ?? []).filter(known);
  }
  raw.version = SAVE_VERSION;
  return raw;
}

function infoOf(id: string, s: GameState): SlotInfo {
  const d = dateOf(s.day);
  return {
    id,
    name: s.company.name,
    home: s.company.homeSite,
    day: s.day,
    dateLabel: `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`,
    K: s.stats.K,
    model: s.models[s.models.length - 1]?.name ?? 'No model',
    difficulty: s.meta.difficulty,
    founder: s.meta.founder,
    playtime: s.meta.playtime,
    savedAt: s.savedAt ?? Date.now(),
    act1: !!s.flags.act1Complete,
    act: s.act ?? 1,
    act2: !!s.flags.act2Complete,
    act3: !!s.flags.act3Complete,
    act4: !!s.flags.act4Complete,
    typeI: s.system?.typeI ? new Date(Date.UTC(2027, 0, 1) + s.system.typeI * 86_400_000).getUTCFullYear() : undefined,
    gameOver: !!s.meta.gameOver,
    sandbox: !!s.meta.sandbox,
  };
}

function readIndex(): SlotInfo[] {
  try {
    const txt = storage()?.getItem(INDEX_KEY);
    return txt ? (JSON.parse(txt) as SlotInfo[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SlotInfo[]): void {
  try {
    storage()?.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked */
  }
}

/** One-time move of the pre-slots single save into slot 1. */
export function migrateLegacySave(): void {
  const st = storage();
  if (!st) return;
  try {
    const txt = st.getItem(LEGACY_KEY);
    if (!txt) return;
    const s = migrate(JSON.parse(txt));
    if (s && listSlots().length < MAX_SLOTS) writeSlot(newSlotId(), s);
    st.removeItem(LEGACY_KEY);
  } catch {
    /* ignore a corrupt legacy save */
  }
}

/** Slots, most recently played first. */
export function listSlots(): SlotInfo[] {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

export function newSlotId(): string {
  const used = new Set(readIndex().map((s) => s.id));
  for (let i = 1; i <= 99; i++) if (!used.has(String(i))) return String(i);
  return String(Date.now());
}

export function loadSlot(id: string): GameState | null {
  try {
    const txt = storage()?.getItem(SLOT_PREFIX + id);
    return txt ? migrate(JSON.parse(txt)) : null;
  } catch {
    return null;
  }
}

export function writeSlot(id: string, s: GameState): boolean {
  try {
    s.savedAt = Date.now();
    storage()?.setItem(SLOT_PREFIX + id, JSON.stringify(s));
    const list = readIndex().filter((x) => x.id !== id);
    list.push(infoOf(id, s));
    writeIndex(list);
    return true;
  } catch {
    return false; // storage full or blocked — the game keeps running
  }
}

export function deleteSlot(id: string): void {
  try {
    storage()?.removeItem(SLOT_PREFIX + id);
  } catch {
    /* ignore */
  }
  writeIndex(readIndex().filter((x) => x.id !== id));
}

export function renameSlot(id: string, name: string): void {
  const s = loadSlot(id);
  if (!s) return;
  s.company.name = name.trim() || s.company.name;
  writeSlot(id, s);
}

/** Portable save string for backups or moving between devices. */
export function exportSave(s: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

export function importSave(code: string): GameState | null {
  const text = code.trim();
  try {
    // accept both save codes and raw JSON (from an exported file)
    const json = text.startsWith('{') ? text : decodeURIComponent(escape(atob(text)));
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Download a save as a .json file. */
export function downloadSave(s: GameState): void {
  saveTextFile(`${s.company.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'company'}-day${s.day}.kardashev.json`, JSON.stringify(s));
}

/** Remove every save and setting (Data → reset). */
export function wipeAllData(): void {
  const st = storage();
  if (!st) return;
  const keys: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (k && k.startsWith('kardashev.')) keys.push(k);
  }
  keys.forEach((k) => st.removeItem(k));
}
