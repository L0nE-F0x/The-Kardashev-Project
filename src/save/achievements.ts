/** Achievements are kept per device (shared by all companies), like the Field Guide. */
const KEY = 'kardashev.achievements.v1';

export interface AchievementStore {
  /** id → real-world ms it was unlocked. */
  got: Record<string, number>;
  /** Advisors greeted on campus ("Meet the team"). */
  met: string[];
  /** Places visited up close ("World tour"). */
  places: string[];
}

function load(): AchievementStore {
  try {
    const txt = window.localStorage.getItem(KEY);
    if (txt) {
      // only what is the right kind of thing is kept (a damaged record crashed the Achievements screen)
      const raw = JSON.parse(txt) as Partial<AchievementStore> | null;
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      const got: AchievementStore['got'] = {};
      if (raw?.got && typeof raw.got === 'object' && !Array.isArray(raw.got)) for (const [k, v] of Object.entries(raw.got)) if (typeof v === 'number' && Number.isFinite(v)) got[k] = v;
      return { ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}), got, met: list(raw?.met), places: list(raw?.places) } as AchievementStore;
    }
  } catch {
    /* ignore */
  }
  return { got: {}, met: [], places: [] };
}

let store: AchievementStore | null = null;

export function achievements(): AchievementStore {
  return (store ??= load());
}

export function saveAchievements(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(achievements()));
  } catch {
    /* ignore */
  }
}
