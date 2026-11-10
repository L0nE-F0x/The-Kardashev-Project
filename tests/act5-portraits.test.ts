/**
 * Act V portraits: the cast growing older (greying, elder, renewed by the treatments), Bit's final forms (Bit-10
 * the co-steward, Bit-11 a free mind in the swarm), the successors and new faces (Wren, Ify, Kenta, Amaru, Priya,
 * Tobias), the Act V partner CEOs (Lodestar, Vonn, Evergreen) and Chorus, the minds' envoy.
 * The portraits are 3D busts rendered in the browser; here we check what needs no WebGL: the looks, how age changes
 * them, which body Bit wears, and that every bust builds in every mood. To see them: /play/portraits.html (dev).
 */
import { describe, expect, it } from 'vitest';
import { avatarShot } from '../src/render3d/portraits/avatars';
import { bitShot } from '../src/render3d/portraits/bit';
import { personShot } from '../src/render3d/portraits/bust';
import { AGED, bitModel, CEO_IDS, CEO_LOOKS, ceoLook, GENERIC_CEO, isAvatar, lookAt, LOOKS } from '../src/render3d/portraits/looks';
import { portraitKey } from '../src/render3d/portraits/portraits';
import { MOODS, survey } from './helpers/busts';

const CAST = ['penny', 'juno', 'mira', 'sol', 'iris', 'kip', 'lena'] as const;
const ACT5 = ['wren', 'ify', 'kenta', 'amaru', 'priya', 'tobias', 'lodestar', 'vonn', 'evergreen', 'chorus'];
const shot = (id: string, mood: (typeof MOODS)[number]) => (isAvatar(id) ? avatarShot(id, mood) : personShot(ceoLook(id), mood));

describe('act V portraits', () => {
  it('every Act V speaker has a portrait of their own, in every mood', async () => {
    const { PARTNERS } = await import('../src/content/charter');
    const { CAST5 } = await import('../src/content/system');
    for (const id of [...Object.keys(PARTNERS), ...Object.keys(CAST5)]) expect(CEO_IDS, id).toContain(id);
    expect([...ACT5].sort()).toEqual([...Object.keys(CAST5), 'lodestar', 'vonn', 'evergreen'].sort());
    const seen = new Set<string>();
    for (const id of ACT5) {
      if (!isAvatar(id)) {
        expect(CEO_LOOKS, id).toHaveProperty(id);
        expect(ceoLook(id), id).not.toBe(GENERIC_CEO);
      }
      const per = new Set<string>();
      for (const m of MOODS) {
        const s = survey(shot(id, m));
        expect(s.broken, `${id} ${m}`).toBe(0);
        per.add(s.print);
      }
      // every mood shows
      expect(per.size, id).toBe(MOODS.length);
      seen.add(survey(shot(id, 'neutral')).print);
    }
    expect(seen.size).toBe(ACT5.length);
  });

  it('the cast ages: four looks each, age 0 exactly as before', () => {
    expect(Object.keys(AGED).sort()).toEqual([...CAST].sort());
    for (const id of CAST) {
      // age 0 (and anything that is not an age) is the Act I–IV look itself
      expect(lookAt(id, 0)).toBe(LOOKS[id]);
      expect(lookAt(id, 7)).toBe(LOOKS[id]);
      const looks = [0, 1, 2, 3].map((a) => lookAt(id, a));
      expect(new Set(looks.map((l) => JSON.stringify(l))).size, id).toBe(4);
      expect(looks.slice(1).map((l) => l.age), id).toEqual([1, 2, 3]);
      // age never touches who they are: the same skin, clothes, hair style and backdrop
      for (const l of looks) expect([l.skin, l.cloth, l.style, l.bg], id).toEqual([LOOKS[id].skin, LOOKS[id].cloth, LOOKS[id].style, LOOKS[id].bg]);
      // greying changes the hair; the treatments give a glow and take the tired eyes away
      expect(looks[1].hair, id).not.toEqual(looks[0].hair);
      expect(looks[3].glow, id).toBe(true);
      expect(looks[3].bags, id).toBe(false);
      // the busts differ at every age, and moods still read at every age
      const busts = looks.map((l) => survey(personShot(l, 'neutral')));
      for (const b of busts) expect(b.broken, id).toBe(0);
      expect(new Set(busts.map((b) => b.print)).size, id).toBe(4);
      for (const l of looks.slice(1)) expect(new Set(MOODS.map((m) => survey(personShot(l, m)).print)).size, id).toBe(MOODS.length);
    }
  });

  it("Bit doesn't age, and an age that isn't one counts as 0", () => {
    expect(portraitKey('bit', 'neutral', 9, 2)).toBe(portraitKey('bit', 'neutral', 9, 0));
    expect(portraitKey('penny', 'neutral', 9, 2)).not.toBe(portraitKey('penny', 'neutral', 9, 0));
    expect(portraitKey('penny', 'neutral', 3, 2)).toBe(portraitKey('penny', 'neutral', 9, 2));
    expect(portraitKey('penny', 'happy', 1, 5)).toBe(portraitKey('penny', 'happy', 1, 0));
  });

  it("Bit's final forms", () => {
    expect(bitModel(9)).toEqual({ family: 'planetary', gen: 9 });
    expect(bitModel(10)).toEqual({ family: 'steward', gen: 10 });
    expect(bitModel(11)).toEqual({ family: 'free', gen: 11 });
    // 12 and up still fall back to Bit-9
    expect(bitModel(12)).toEqual(bitModel(9));
    expect(bitModel(40)).toEqual(bitModel(9));
    const prints = [9, 10, 11].map((g) => survey(bitShot(bitModel(g), 'neutral')));
    for (const p of prints) expect(p.broken).toBe(0);
    expect(new Set(prints.map((p) => p.print)).size).toBe(3);
    for (const g of [10, 11]) expect(new Set(MOODS.map((m) => survey(bitShot(bitModel(g), m)).print)).size, `Bit-${g}`).toBe(MOODS.length);
  });
});
