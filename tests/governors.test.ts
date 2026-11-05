import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_IDS } from '../src/content/mapcodes';
import { GOVERNORS } from '../src/content/planet';
import { paletteTable } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';

describe('province governors', () => {
  it('every province has a governor with a face of their own', async () => {
    const { governorPortraitCanvas } = await import('../src/render/sprites/portraits');
    const seen = new Set<string>();
    for (const r of REGION_IDS) {
      expect(GOVERNORS[r]?.name, r).toBeTruthy();
      const d = governorPortraitCanvas(r).data.join();
      expect(seen.has(d), r).toBe(false);
      seen.add(d);
    }
  });

  it.skipIf(!process.env.PREVIEW_DIR)('writes a sheet', async () => {
    const { governorPortraitCanvas } = await import('../src/render/sprites/portraits');
    const moods = ['neutral', 'happy', 'worried'] as const;
    const W = 32 * REGION_IDS.length, H = 32 * moods.length;
    const sheet = new PixelCanvas(W, H);
    REGION_IDS.forEach((r, i) => moods.forEach((m, j) => sheet.blit(governorPortraitCanvas(r, m), i * 32, j * 32)));
    const Z = 4, pal = paletteTable(), out = new Uint8Array(W * Z * H * Z * 4);
    for (let y = 0; y < H * Z; y++) for (let x = 0; x < W * Z; x++) {
      const c = sheet.data[Math.floor(y / Z) * W + Math.floor(x / Z)]; const o = (y * W * Z + x) * 4;
      out[o] = pal[c * 4]; out[o + 1] = pal[c * 4 + 1]; out[o + 2] = pal[c * 4 + 2]; out[o + 3] = 255;
    }
    fs.writeFileSync(path.join(process.env.PREVIEW_DIR!, 'governors.png'), encodePngRgba(W * Z, H * Z, out));
  });
});
