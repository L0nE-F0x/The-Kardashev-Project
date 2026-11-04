/**
 * Act IV portraits: Dr. Lena Moreau, the four new partner CEOs (Twistfield, Kindle, Quickpinch,
 * Carbonfold), Ade Bello on the Moon, the three rival AIs as abstract faces (Apex, Weft,
 * Sapling) and Bit-8/9, in every mood.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/act4-portraits.test.ts
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
const ACT4 = ['twistfield', 'kindle', 'quickpinch', 'carbonfold', 'ade', 'apex', 'weft', 'sapling'];

describe('act IV portraits', () => {
  it('every Act IV speaker has a portrait of their own, in every mood', async () => {
    const { ceoPortraitCanvas, portraitCanvas, CEO_IDS } = await import('../src/render/sprites/portraits');
    const { PARTNERS } = await import('../src/content/charter');
    const { CAST4 } = await import('../src/content/planet');
    const generic = ceoPortraitCanvas('nobody').data.join();
    for (const id of [...Object.keys(PARTNERS), ...Object.keys(CAST4)]) expect(CEO_IDS).toContain(id);
    const seen = new Set<string>();
    for (const id of ACT4) {
      const per = new Set<string>();
      for (const m of moods) {
        const data = ceoPortraitCanvas(id, m).data.join();
        expect(data).not.toBe(generic);
        per.add(data);
      }
      // the mood shows on the face
      expect(per.size).toBeGreaterThanOrEqual(4);
      seen.add(ceoPortraitCanvas(id, 'neutral').data.join());
    }
    expect(seen.size).toBe(ACT4.length);
    // Lena has her own look, and moods
    const lena = new Set(moods.map((m) => portraitCanvas('lena', m).data.join()));
    expect(lena.size).toBeGreaterThanOrEqual(4);
    // Bit keeps growing: 7, 8 and 9 all differ, and 9 is the ceiling
    const gens = [7, 8, 9].map((g) => portraitCanvas('bit', 'neutral', g).data.join());
    expect(new Set(gens).size).toBe(3);
    expect(portraitCanvas('bit', 'neutral', 12).data.join()).toBe(gens[2]);
    // nothing spills past the rounded corners
    for (const id of ACT4) {
      const pc = ceoPortraitCanvas(id, 'happy');
      expect(pc.get(0, 0)).toBe(0);
      expect(pc.get(31, 31)).toBe(0);
    }
  });
});

describe.skipIf(!dir)('act IV portrait sheets', () => {
  beforeAll(() => setEra(3));
  afterAll(() => setEra(0));
  const out = (name: string, pc: PixelCanvas, scale: number) => {
    fs.mkdirSync(dir!, { recursive: true });
    fs.writeFileSync(path.join(dir!, name), pixelCanvasToPng([pc], scale));
  };

  it('portraits', async () => {
    const { portraitCanvas, ceoPortraitCanvas } = await import('../src/render/sprites/portraits');
    // every new face across the moods: Lena, the partners, Ade, the AIs, Bit-7…9
    const rows: ((m: (typeof moods)[number]) => PixelCanvas)[] = [
      (m) => portraitCanvas('lena', m),
      ...ACT4.map((id) => (m: (typeof moods)[number]) => ceoPortraitCanvas(id, m)),
      (m) => portraitCanvas('bit', m, 7),
      (m) => portraitCanvas('bit', m, 8),
      (m) => portraitCanvas('bit', m, 9),
    ];
    const sheet = new PixelCanvas(34 * moods.length, 34 * rows.length);
    sheet.rect(0, 0, sheet.w, sheet.h, C.ink1);
    rows.forEach((row, r) => moods.forEach((m, c) => sheet.blit(row(m), c * 34 + 1, r * 34 + 1)));
    out('act4-portraits-moods.png', sheet, 3);
    // neutral close-ups next to some Act III faces for scale and style
    const ids: (() => PixelCanvas)[] = [
      () => portraitCanvas('lena', 'neutral'),
      ...ACT4.map((id) => () => ceoPortraitCanvas(id, 'neutral')),
      () => portraitCanvas('bit', 'neutral', 8),
      () => portraitCanvas('bit', 'happy', 9),
      () => ceoPortraitCanvas('sunforge', 'neutral'),
      () => portraitCanvas('kip', 'neutral'),
    ];
    const zoom = new PixelCanvas(34 * 7, 34 * Math.ceil(ids.length / 7));
    zoom.rect(0, 0, zoom.w, zoom.h, C.ink1);
    ids.forEach((f, i) => zoom.blit(f(), (i % 7) * 34 + 1, Math.floor(i / 7) * 34 + 1));
    out('act4-portraits-zoom.png', zoom, 5);
    // the Bit line from 0 to 9
    const line = new PixelCanvas(34 * 10, 34);
    line.rect(0, 0, line.w, line.h, C.ink1);
    for (let g = 0; g <= 9; g++) line.blit(portraitCanvas('bit', 'happy', g), g * 34 + 1, 1);
    out('act4-portraits-bit-line.png', line, 4);
  });
});
