/** Field Guide progress is global (shared by all companies), so the menu can show it too. */
const KEY = 'kardashev.guide.v1';

interface GuideStore {
  unlocked: string[];
  seen: string[];
}

function load(): GuideStore {
  try {
    const txt = window.localStorage.getItem(KEY);
    if (txt) return { unlocked: [], seen: [], ...(JSON.parse(txt) as Partial<GuideStore>) };
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
