import type { GameState } from '../sim/types';
import { SAVE_VERSION } from '../sim/state';

const SAVE_KEY = 'kardashev.save.v1';
const SETTINGS_KEY = 'kardashev.settings.v1';

export interface Settings {
  sound: boolean;
  offline: boolean;
  /** Extra whole-number pixel zoom (1 = automatic). */
  zoom: number;
  tutorialHints: boolean;
}

const DEFAULT_SETTINGS: Settings = { sound: true, offline: true, zoom: 1, tutorialHints: true };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Bring older saves up to the current schema. */
function migrate(raw: GameState): GameState | null {
  if (!raw || typeof raw !== 'object' || typeof raw.day !== 'number') return null;
  if (raw.version > SAVE_VERSION) return null;
  raw.research.pool ??= 0;
  raw.version = SAVE_VERSION;
  return raw;
}

export function loadSave(): GameState | null {
  try {
    const txt = storage()?.getItem(SAVE_KEY);
    if (!txt) return null;
    return migrate(JSON.parse(txt));
  } catch {
    return null;
  }
}

export function writeSave(s: GameState): void {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked — the game keeps running
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Portable save string for backups or moving between devices. */
export function exportSave(s: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

export function importSave(code: string): GameState | null {
  try {
    return migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  try {
    const txt = storage()?.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(txt ? JSON.parse(txt) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
