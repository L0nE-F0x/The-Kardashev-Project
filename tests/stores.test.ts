/**
 * What the game keeps on the player's machine besides the saves: settings, the Field Guide's unlocks, the
 * achievements, the list of save slots. Whatever is found there (a file cut short, another program's data, a hand
 * edit), the game starts. `{"unlocked":null}` in the Field Guide's record once stopped it at the loading screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const JUNK = ['', 'null', '7', '"x"', '[]', '{}', '{', '[1,2', '{"unlocked":null,"seen":"x"}', '{"got":null}', '{"got":[1],"met":7,"places":{}}', '[null,7,{"id":3},{"id":"1","name":"A"}]', '{"uiScale":0,"master":"loud","quality3d":"ultra","interfaceLook":9,"colorblind":null,"autosaveSec":-1,"wheel":4}', '{"uiScale":"NaN","music":1e9}'];
const KEYS = ['kardashev.settings.v1', 'kardashev.guide.v1', 'kardashev.achievements.v1', 'kardashev.slots.v1'];

function fakeWindow(data: Record<string, string>) {
  const store = new Map(Object.entries(data));
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage, matchMedia: () => ({ matches: false }) };
  (globalThis as unknown as { localStorage: unknown }).localStorage = localStorage;
}

describe('what is kept on the player’s machine', () => {
  beforeEach(() => vi.resetModules());

  it('reads whatever it finds there without breaking', async () => {
    for (const key of KEYS)
      for (const junk of JUNK) {
        vi.resetModules();
        fakeWindow({ [key]: junk });
        const at = `${key} = ${junk}`;
        const settings = await import('../src/save/settings');
        const guide = await import('../src/save/guide');
        const ach = await import('../src/save/achievements');
        const save = await import('../src/save/save');
        const s = settings.loadSettings();
        expect(s.uiScale, at).toBeGreaterThanOrEqual(0.75);
        expect(s.uiScale, at).toBeLessThanOrEqual(2);
        for (const v of [s.master, s.music, s.sfx, s.ambience]) expect(v >= 0 && v <= 1, at).toBe(true);
        expect(['auto', 'high', 'medium', 'low'], at).toContain(s.quality3d);
        expect(s.interfaceLook === 'auto' || (s.interfaceLook >= 1 && s.interfaceLook <= 5), at).toBe(true);
        expect(() => settings.lookFor(s, 3), at).not.toThrow();
        // the Field Guide: the title screen asks for its badge at start-up
        expect(() => guide.guideUnseen(), at).not.toThrow();
        expect(guide.guideUnlocked() instanceof Set, at).toBe(true);
        expect(() => (guide.unlockGuide(['kardashev']), guide.markGuideSeen('kardashev')), at).not.toThrow();
        // achievements: every list is a list, every date a number
        const a = ach.achievements();
        expect(Array.isArray(a.met) && Array.isArray(a.places) && typeof a.got === 'object' && a.got !== null, at).toBe(true);
        for (const v of Object.values(a.got)) expect(typeof v, at).toBe('number');
        // the slots: only whole entries are listed
        for (const slot of save.listSlots()) expect(typeof slot.id === 'string' && typeof slot.name === 'string' && Number.isFinite(slot.savedAt), at).toBe(true);
        expect(() => save.newSlotId(), at).not.toThrow();
      }
  });

  it('puts a company back in the list when its save is on disk and the list was lost', async () => {
    const { newGame } = await import('../src/sim/state');
    const good = JSON.stringify(newGame({ name: 'Still Here', homeSite: 'london', seed: 2 }));
    for (const index of [undefined, 'null', '{', '[]', '[{"id":"9"}]']) {
      vi.resetModules();
      fakeWindow({ 'kardashev.slot.3': good, 'kardashev.slot.4': good.slice(0, 500), ...(index === undefined ? {} : { 'kardashev.slots.v1': index }) });
      const save = await import('../src/save/save');
      const slots = save.listSlots();
      expect(slots.map((x) => `${x.id}:${x.name}`), `index = ${index}`).toEqual(['3:Still Here']);
      expect(save.loadSlot('3')?.company.name).toBe('Still Here');
      // the one that no longer loads is refused, and still there for whoever can mend it
      expect(save.loadSlot('4')).toBeNull();
    }
  });
});
