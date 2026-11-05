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
    if (txt) return { got: {}, met: [], places: [], ...(JSON.parse(txt) as Partial<AchievementStore>) };
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
