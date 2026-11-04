/**
 * Act V portraits: the cast growing older (greying, elder, renewed by the treatments), Bit's final
 * forms (Bit-10 the co-steward, Bit-11 a free mind in the swarm), the successors and new faces
 * (Wren, Ify, Kenta, Amaru, Priya, Tobias), the Act V partner CEOs (Lodestar, Vonn, Evergreen) and
 * Chorus, the minds' envoy, in every mood.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act5-portraits.test.ts
 * The sheets are skipped unless PREVIEW_DIR is set; the coverage checks always run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { C, setEra } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { pixelCanvasToPng } from '../tools/lib/png';

const dir = process.env.PREVIEW_DIR;
const moods = ['neutral', 'happy', 'worried', 'angry', 'excited'] as const;
const CAST = ['penny', 'juno', 'mira', 'sol', 'iris', 'kip', 'lena'] as const;
const ACT5 = ['wren', 'ify', 'kenta', 'amaru', 'priya', 'tobias', 'lodestar', 'vonn', 'evergreen', 'chorus'];

describe('act V portraits', () => {
  it('every Act V speaker has a portrait of their own, in every mood', async () => {
    const { ceoPortraitCanvas, CEO_IDS } = await import('../src/render/sprites/portraits');
    const { PARTNERS } = await import('../src/content/charter');
    const { CAST5 } = await import('../src/content/system');
    const generic = ceoPortraitCanvas('nobody').data.join();
    for (const id of [...Object.keys(PARTNERS), ...Object.keys(CAST5)]) expect(CEO_IDS).toContain(id);
    expect([...ACT5].sort()).toEqual([...Object.keys(CAST5), 'lodestar', 'vonn', 'evergreen'].sort());
    const seen = new Set<string>();
    for (const id of ACT5) {
      const per = new Set<string>();
      for (const m of moods) {
        const data = ceoPortraitCanvas(id, m).data.join();
        expect(data).not.toBe(generic);
        per.add(data);
      }
      // the mood shows on the face
      expect(per.size).toBeGreaterThanOrEqual(4);
      seen.add(ceoPortraitCanvas(id, 'neutral').data.join());
      // nothing spills past the rounded corners
      const pc = ceoPortraitCanvas(id, 'happy');
      for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) expect(pc.get(x, y)).toBe(0);
    }
    expect(seen.size).toBe(ACT5.length);
  });

  it('the cast ages: four looks each, age 0 exactly as before', async () => {
    const { portraitCanvas } = await import('../src/render/sprites/portraits');
    for (const id of CAST) {
      for (const m of moods) expect(portraitCanvas(id, m, 1, 0).data.join()).toBe(portraitCanvas(id, m).data.join());
      const ages = [0, 1, 2, 3].map((a) => portraitCanvas(id, 'neutral', 1, a).data.join());
      expect(new Set(ages).size).toBe(4);
      // moods still read at every age
      for (const a of [1, 2, 3]) expect(new Set(moods.map((m) => portraitCanvas(id, m, 1, a).data.join())).size).toBeGreaterThanOrEqual(4);
      for (const a of [1, 2, 3]) {
        const pc = portraitCanvas(id, 'happy', 1, a);
        for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) expect(pc.get(x, y)).toBe(0);
      }
    }
    // Bit doesn't age
    expect(portraitCanvas('bit', 'neutral', 9, 2).data.join()).toBe(portraitCanvas('bit', 'neutral', 9).data.join());
  });

  it("Bit's final forms", async () => {
    const { portraitCanvas } = await import('../src/render/sprites/portraits');
    const gens = [9, 10, 11].map((g) => portraitCanvas('bit', 'neutral', g).data.join());
    expect(new Set(gens).size).toBe(3);
    // 12 and up still fall back to Bit-9
    expect(portraitCanvas('bit', 'neutral', 12).data.join()).toBe(gens[0]);
    for (const g of [10, 11]) {
      expect(new Set(moods.map((m) => portraitCanvas('bit', m, g).data.join())).size).toBeGreaterThanOrEqual(4);
      const pc = portraitCanvas('bit', 'excited', g);
      for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) expect(pc.get(x, y)).toBe(0);
    }
  });
});

describe.skipIf(!dir)('act V portrait sheets', () => {
  beforeAll(() => setEra(4));
  afterAll(() => setEra(0));
  const out = (name: string, pc: PixelCanvas, scale: number) => {
    fs.mkdirSync(dir!, { recursive: true });
    fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng([pc], scale));
  };

  it('portraits', async () => {
    const { portraitCanvas, ceoPortraitCanvas } = await import('../src/render/sprites/portraits');
    // the cast at ages 0–3 (neutral, then happy)
    for (const mood of ['neutral', 'happy'] as const) {
      const sheet = new PixelCanvas(34 * 4, 34 * CAST.length);
      sheet.rect(0, 0, sheet.w, sheet.h, C.ink1);
      CAST.forEach((id, r) => [0, 1, 2, 3].forEach((a) => sheet.blit(portraitCanvas(id, mood, 1, a), a * 34 + 1, r * 34 + 1)));
      out(`act5-portraits-ages-${mood}.png`, sheet, 4);
    }
    // every mood at age 2 and age 3
    for (const age of [2, 3]) {
      const sheet = new PixelCanvas(34 * moods.length, 34 * CAST.length);
      sheet.rect(0, 0, sheet.w, sheet.h, C.ink1);
      CAST.forEach((id, r) => moods.forEach((m, c) => sheet.blit(portraitCanvas(id, m, 1, age), c * 34 + 1, r * 34 + 1)));
      out(`act5-portraits-age${age}-moods.png`, sheet, 3);
    }
    // the new faces and Bit 9/10/11 in every mood
    const rows: ((m: (typeof moods)[number]) => PixelCanvas)[] = [
      ...ACT5.map((id) => (m: (typeof moods)[number]) => ceoPortraitCanvas(id, m)),
      (m) => portraitCanvas('bit', m, 9),
      (m) => portraitCanvas('bit', m, 10),
      (m) => portraitCanvas('bit', m, 11),
    ];
    const sheet = new PixelCanvas(34 * moods.length, 34 * rows.length);
    sheet.rect(0, 0, sheet.w, sheet.h, C.ink1);
    rows.forEach((row, r) => moods.forEach((m, c) => sheet.blit(row(m), c * 34 + 1, r * 34 + 1)));
    out('act5-portraits-moods.png', sheet, 3);
    // neutral close-ups, with their predecessors alongside
    const ids: (() => PixelCanvas)[] = [
      () => portraitCanvas('penny', 'neutral', 1, 2),
      () => ceoPortraitCanvas('wren'),
      () => portraitCanvas('juno', 'neutral', 1, 2),
      () => ceoPortraitCanvas('ify'),
      () => portraitCanvas('mira', 'neutral', 1, 2),
      () => ceoPortraitCanvas('kenta'),
      () => portraitCanvas('sol', 'neutral', 1, 2),
      () => ceoPortraitCanvas('amaru'),
      () => portraitCanvas('lena', 'neutral', 1, 2),
      () => ceoPortraitCanvas('priya'),
      () => ceoPortraitCanvas('tobias'),
      () => ceoPortraitCanvas('lodestar'),
      () => ceoPortraitCanvas('vonn'),
      () => ceoPortraitCanvas('evergreen'),
      () => ceoPortraitCanvas('chorus'),
      () => ceoPortraitCanvas('apex'),
      () => portraitCanvas('bit', 'happy', 10),
      () => portraitCanvas('bit', 'happy', 11),
    ];
    const zoom = new PixelCanvas(34 * 6, 34 * Math.ceil(ids.length / 6));
    zoom.rect(0, 0, zoom.w, zoom.h, C.ink1);
    ids.forEach((f, i) => zoom.blit(f(), (i % 6) * 34 + 1, Math.floor(i / 6) * 34 + 1));
    out('act5-portraits-zoom.png', zoom, 6);
    // the Bit line from 0 to 11
    const line = new PixelCanvas(34 * 12, 34);
    line.rect(0, 0, line.w, line.h, C.ink1);
    for (let g = 0; g <= 11; g++) line.blit(portraitCanvas('bit', 'happy', g), g * 34 + 1, 1);
    out('act5-portraits-bit-line.png', line, 4);
  });
});
