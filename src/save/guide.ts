/** Field Guide progress is global (shared by all companies), so the menu can show it too. */
const KEY = 'kardashev.guide.v1';

interface GuideStore {
  unlocked: string[];
  seen: string[];
}

function load(): GuideStore {
  try {
    const txt = window.localStorage.getItem(KEY);
    if (txt) {
      // only what is the right kind of thing is kept: `{"unlocked":null}` on disk stopped the game at its loading
      // screen ("Failed to start"), for good
      const raw = JSON.parse(txt) as Partial<GuideStore> | null;
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      return { unlocked: list(raw?.unlocked), seen: list(raw?.seen) };
    }
  } catch {
    /* ignore */
  }
  return { unlocked: [], seen: [] };
}

let store: GuideStore | null = null;
const get = () => (store ??= load());

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(get()));
  } catch {
    /* ignore */
  }
}

export function guideUnlocked(): Set<string> {
  return new Set(get().unlocked);
}

/** Unlock entries; returns the ones that were new. */
export function unlockGuide(ids: string[]): string[] {
  const s = get();
  const fresh = ids.filter((id) => !s.unlocked.includes(id));
  if (fresh.length) {
    s.unlocked.push(...fresh);
    persist();
  }
  return fresh;
}

export function markGuideSeen(id: string): void {
  const s = get();
  if (!s.seen.includes(id)) {
    s.seen.push(id);
    persist();
  }
}

export function guideUnseen(): number {
  const s = get();
  return s.unlocked.filter((id) => !s.seen.includes(id)).length;
}

export function isGuideSeen(id: string): boolean {
  return get().seen.includes(id);
}
