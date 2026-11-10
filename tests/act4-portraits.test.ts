/**
 * Act IV portraits: Dr. Lena Moreau, the four new partner CEOs (Twistfield, Kindle, Quickpinch, Carbonfold),
 * Ade Bello on the Moon, the three rival AIs as abstract forms (Apex, Weft, Sapling) and Bit-7…9.
 * The portraits are 3D busts rendered in the browser; here we check what needs no WebGL: everyone has a look of
 * their own, their bust builds in every mood, and the moods change it. To see them: /play/portraits.html (dev).
 */
import { describe, expect, it } from 'vitest';
import { avatarShot } from '../src/render3d/portraits/avatars';
import { bitShot } from '../src/render3d/portraits/bit';
import { personShot } from '../src/render3d/portraits/bust';
import { bitModel, CEO_IDS, CEO_LOOKS, ceoLook, GENERIC_CEO, isAvatar, LOOKS } from '../src/render3d/portraits/looks';
import { MOODS, survey } from './helpers/busts';

const ACT4 = ['twistfield', 'kindle', 'quickpinch', 'carbonfold', 'ade', 'apex', 'weft', 'sapling'];
const shot = (id: string, mood: (typeof MOODS)[number]) => (isAvatar(id) ? avatarShot(id, mood) : personShot(ceoLook(id), mood));

describe('act IV portraits', () => {
  it('every Act IV speaker has a portrait of their own, in every mood', async () => {
    const { PARTNERS } = await import('../src/content/charter');
    const { CAST4 } = await import('../src/content/planet');
    for (const id of [...Object.keys(PARTNERS), ...Object.keys(CAST4)]) expect(CEO_IDS, id).toContain(id);
    const seen = new Set<string>();
    for (const id of ACT4) {
      // a person has a look of their own (not the generic executive's); an AI is an avatar
      if (!isAvatar(id)) {
        expect(CEO_LOOKS, id).toHaveProperty(id);
        expect(ceoLook(id), id).not.toBe(GENERIC_CEO);
      }
      const per = new Set<string>();
      for (const m of MOODS) {
        const s = survey(shot(id, m));
        expect(s.meshes, `${id} ${m}`).toBeGreaterThan(10);
        expect(s.broken, `${id} ${m}`).toBe(0);
        per.add(s.print);
      }
      // every mood shows
      expect(per.size, id).toBe(MOODS.length);
      seen.add(survey(shot(id, 'neutral')).print);
    }
    expect(seen.size).toBe(ACT4.length);
    // someone nobody drew gets the generic executive, not a crash
    expect(ceoLook('nobody')).toBe(GENERIC_CEO);
    expect(survey(shot('nobody', 'neutral')).broken).toBe(0);
  });

  it('Lena has her own look, and moods', () => {
    expect(LOOKS.lena.torus, 'the plasma ring behind her').toBeTruthy();
    const lena = new Set(MOODS.map((m) => survey(personShot(LOOKS.lena, m)).print));
    expect(lena.size).toBe(MOODS.length);
  });

  it('Bit keeps growing: 7, 8 and 9 all differ, and 9 is the last model generation', () => {
    expect(bitModel(7)).toEqual({ family: 'oracle', gen: 7 });
    expect(bitModel(8)).toEqual({ family: 'planetary', gen: 8 });
    expect(bitModel(9)).toEqual({ family: 'planetary', gen: 9 });
    expect(bitModel(12)).toEqual(bitModel(9));
    const prints = [7, 8, 9].map((g) => survey(bitShot(bitModel(g), 'neutral')));
    for (const p of prints) expect(p.broken).toBe(0);
    expect(new Set(prints.map((p) => p.print)).size).toBe(3);
    for (const g of [7, 8, 9]) expect(new Set(MOODS.map((m) => survey(bitShot(bitModel(g), m)).print)).size, `Bit-${g}`).toBe(MOODS.length);
  });
});
