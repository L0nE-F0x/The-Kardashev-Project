/**
 * The portrait kit as a whole, as far as Node can see it (no WebGL here: see tests/helpers/busts.ts): the module
 * imports without a DOM and answers '' there, every look in the game builds into a sound bust, every hair style and
 * every body of Bit's is told apart, and Bit's generations pick the right body.
 */
import { describe, expect, it } from 'vitest';
import type { Mood } from '../src/content/events';
import { avatarShot } from '../src/render3d/portraits/avatars';
import { bitShot } from '../src/render3d/portraits/bit';
import { personShot } from '../src/render3d/portraits/bust';
import { AVATAR_IDS, bitModel, CEO_IDS, CEO_LOOKS, GENERIC_CEO, GOVERNOR_LOOKS, isAvatar, lookAt, LOOKS, type Look } from '../src/render3d/portraits/looks';
import { ceoPortraitUrl, governorPortraitUrl, portraitKey, portraitUrl } from '../src/render3d/portraits/portraits';
import { MOODS, survey } from './helpers/busts';

const EVERYONE: [string, Look][] = [
  ...Object.entries(LOOKS).map(([id, l]) => [`advisor ${id}`, l] as [string, Look]),
  ...Object.entries(CEO_LOOKS).map(([id, l]) => [`ceo ${id}`, l] as [string, Look]),
  ...Object.entries(GOVERNOR_LOOKS).map(([id, l]) => [`governor ${id}`, l] as [string, Look]),
  ['generic', GENERIC_CEO],
];

describe('portraits', () => {
  it('imports without a DOM and renders nothing there', () => {
    expect(typeof document).toBe('undefined');
    expect(portraitUrl('juno')).toBe('');
    expect(portraitUrl('bit', 'happy', 4)).toBe('');
    expect(ceoPortraitUrl('meridian', 'angry')).toBe('');
    expect(ceoPortraitUrl('apex')).toBe('');
    expect(governorPortraitUrl('eur')).toBe('');
  });

  it('every look builds a sound bust in every mood, and no two people are alike', () => {
    const neutral = new Map<string, string>();
    for (const [who, look] of EVERYONE) {
      for (const m of MOODS) {
        const s = survey(personShot(look, m));
        expect(s.meshes, `${who} ${m}`).toBeGreaterThan(12);
        expect(s.broken, `${who} ${m}`).toBe(0);
        if (m === 'neutral') {
          expect(neutral.has(s.print), `${who} looks exactly like ${neutral.get(s.print)}`).toBe(false);
          neutral.set(s.print, who);
        }
      }
    }
  });

  it('every hair style in the game is a shape of its own', () => {
    const styles = new Set(EVERYONE.map(([, l]) => l.style));
    // the same person in each style, so only the hair differs
    const base = LOOKS.penny;
    const prints = new Set([...styles].map((style) => survey(personShot({ ...base, style }, 'neutral')).print));
    expect(prints.size).toBe(styles.size);
    expect(styles.size).toBeGreaterThanOrEqual(30);
  });

  it('a look\'s extras all show: taking one away changes the bust', () => {
    // every optional field of Look that some look in the game sets
    const always = new Set(['bg', 'skin', 'hair', 'cloth', 'style', 'age']);
    const silent: string[] = [];
    for (const [who, look] of EVERYONE) {
      const full = survey(personShot(look, 'neutral')).print;
      for (const key of Object.keys(look) as (keyof Look)[]) {
        if (always.has(key) || look[key] === false || look[key] === undefined) continue;
        const without = { ...look, [key]: undefined } as Look;
        if (survey(personShot(without, 'neutral')).print === full) silent.push(`${who}: ${key}`);
      }
    }
    // the only extras that change nothing are the ones that spell out their style's own default colours
    expect(silent).toEqual(['ceo deepvein: hat', 'ceo saltflat: band', 'ceo quickpinch: band', 'ceo amaru: hat']);
    // age shows on a face too (the renewed face is told by its glow, which is one of the extras)
    for (const age of [1, 2]) expect(survey(personShot(lookAt('penny', age), 'neutral')).print).not.toBe(survey(personShot({ ...lookAt('penny', age), age: undefined }, 'neutral')).print);
  });

  it("Bit's generations map to its six bodies", () => {
    const family = (g: number) => bitModel(g).family;
    expect([0, 1, 2, 3].map(family)).toEqual(['classic', 'classic', 'classic', 'classic']);
    expect([4, 5].map(family)).toEqual(['next', 'next']);
    expect([6, 7].map(family)).toEqual(['oracle', 'oracle']);
    expect([8, 9].map(family)).toEqual(['planetary', 'planetary']);
    expect(family(10)).toBe('steward');
    expect(family(11)).toBe('free');
    // each generation is built as itself; beyond 11 it is Bit-9, below 0 and nonsense the first ones
    for (let g = 0; g <= 11; g++) expect(bitModel(g).gen).toBe(g);
    expect(bitModel(12)).toEqual({ family: 'planetary', gen: 9 });
    expect(bitModel(-3)).toEqual({ family: 'classic', gen: 0 });
    expect(bitModel(Number.NaN)).toEqual({ family: 'classic', gen: 1 });
    expect(bitModel(2.7)).toEqual({ family: 'classic', gen: 2 });
    // all twelve differ, in every mood they build soundly, and the moods show (Bit-0 is asleep: one face)
    const prints = new Set<string>();
    for (let g = 0; g <= 11; g++) {
      const per = new Set<string>();
      for (const m of MOODS) {
        const s = survey(bitShot(bitModel(g), m));
        expect(s.broken, `Bit-${g} ${m}`).toBe(0);
        per.add(s.print);
      }
      if (g > 0) expect(per.size, `Bit-${g}`).toBe(MOODS.length);
      prints.add(survey(bitShot(bitModel(g), 'neutral')).print);
    }
    expect(prints.size).toBe(12);
  });

  it('the four AIs are avatars, each its own form, with moods', () => {
    expect([...AVATAR_IDS]).toEqual(['apex', 'weft', 'sapling', 'chorus']);
    for (const id of AVATAR_IDS) expect(CEO_IDS).toContain(id);
    expect(isAvatar('meridian')).toBe(false);
    const forms = new Set<string>();
    for (const id of AVATAR_IDS) {
      const per = new Set<string>();
      for (const m of MOODS) {
        const s = survey(avatarShot(id, m));
        expect(s.broken, `${id} ${m}`).toBe(0);
        per.add(s.print);
      }
      expect(per.size, id).toBe(MOODS.length);
      forms.add(survey(avatarShot(id, 'neutral')).print);
    }
    expect(forms.size).toBe(AVATAR_IDS.length);
  });

  it('a portrait is remembered by who, mood, body and age, and an unknown mood is neutral', () => {
    expect(portraitKey('juno', 'happy', 1, 0)).not.toBe(portraitKey('juno', 'worried', 1, 0));
    expect(portraitKey('bit', 'happy', 4, 0)).not.toBe(portraitKey('bit', 'happy', 5, 0));
    expect(portraitKey('bit', 'happy', 12, 0)).toBe(portraitKey('bit', 'happy', 9, 0));
    expect(portraitKey('juno', 'smug' as Mood, 1, 0)).toBe(portraitKey('juno', 'neutral', 1, 0));
  });
});
