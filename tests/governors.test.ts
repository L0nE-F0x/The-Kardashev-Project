import { describe, expect, it } from 'vitest';
import { REGION_IDS } from '../src/content/mapcodes';
import { GOVERNORS } from '../src/content/planet';
import { personShot } from '../src/render3d/portraits/bust';
import { GENERIC_CEO, GOVERNOR_LOOKS, governorLook } from '../src/render3d/portraits/looks';
import { MOODS, survey } from './helpers/busts';

describe('province governors', () => {
  it('every province has a governor with a face of their own', () => {
    expect(Object.keys(GOVERNOR_LOOKS).sort()).toEqual([...REGION_IDS].sort());
    const looks = new Set<string>();
    const busts = new Set<string>();
    for (const r of REGION_IDS) {
      expect(GOVERNORS[r]?.name, r).toBeTruthy();
      const look = governorLook(r);
      expect(look, r).not.toBe(GENERIC_CEO);
      looks.add(JSON.stringify(look));
      const s = survey(personShot(look, 'neutral'));
      expect(s.broken, r).toBe(0);
      busts.add(s.print);
      // the Planet panel shows them neutral, happy or worried: all three read
      expect(new Set(MOODS.map((m) => survey(personShot(look, m)).print)).size, r).toBe(MOODS.length);
    }
    expect(looks.size).toBe(REGION_IDS.length);
    expect(busts.size).toBe(REGION_IDS.length);
    // a province nobody governs falls back to the generic executive
    expect(governorLook('nowhere')).toBe(GENERIC_CEO);
  });
});
