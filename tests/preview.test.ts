/**
 * Renders art to PNG files for eyeballing without a browser.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/preview.test.ts
 * Skipped unless PREVIEW_DIR is set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { decodeWorldMap } from '../src/world/mapData';
import { renderBorders, renderTerrain } from '../src/render/worldMap/terrain';
import { setEra, type Era } from '../src/render/palette';
import { PixelCanvas } from '../src/render/pixels';
import { pixelCanvasToPng } from '../tools/lib/png';

const dir = process.env.PREVIEW_DIR;
const crop = (pc: PixelCanvas, x: number, y: number, w: number, h: number) => {
  const out = new PixelCanvas(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.set(i, j, pc.get(x + i, y + j));
  return out;
};

describe.skipIf(!dir)('art previews', () => {
  it('world map', () => {
    const buf = fs.readFileSync(path.resolve(__dirname, '../src/content/generated/worldmap.bin'));
    const lods = decodeWorldMap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    fs.mkdirSync(dir!, { recursive: true });
    const lod0 = lods[0];
    const t0 = renderTerrain(lod0);
    fs.writeFileSync(path.join(dir!, 'map-lod0.png'), pixelCanvasToPng([t0, renderBorders(lod0)], 2));
    const lod1 = lods[1];
    const t1 = renderTerrain(lod1);
    const b1 = renderBorders(lod1);
    // Europe/Africa and East Asia crops at 3×
    fs.writeFileSync(path.join(dir!, 'map-lod1-europe.png'), pixelCanvasToPng([crop(t1, 660, 120, 320, 180), crop(b1, 660, 120, 320, 180)], 3));
    fs.writeFileSync(path.join(dir!, 'map-lod1-asia.png'), pixelCanvasToPng([crop(t1, 1080, 160, 320, 180), crop(b1, 1080, 160, 320, 180)], 3));
    fs.writeFileSync(path.join(dir!, 'map-lod1-americas.png'), pixelCanvasToPng([crop(t1, 180, 140, 320, 180), crop(b1, 180, 140, 320, 180)], 3));
    for (const era of [0, 2, 3] as Era[]) {
      setEra(era);
      fs.writeFileSync(path.join(dir!, `map-era${era}.png`), pixelCanvasToPng([crop(t1, 600, 100, 360, 200)], 2));
    }
    setEra(0);
  });
});

describe.skipIf(!dir)('portrait previews', () => {
  it('advisors × moods', async () => {
    const { portraitCanvas } = await import('../src/render/sprites/portraits');
    const ids = ['juno', 'penny', 'mira', 'sol', 'iris', 'kip', 'bit'] as const;
    const moods = ['neutral', 'happy', 'worried', 'angry', 'excited'] as const;
    const sheet = new PixelCanvas(34 * moods.length + 34 * 3, 34 * ids.length);
    ids.forEach((id, row) => {
      moods.forEach((m, col) => sheet.blit(portraitCanvas(id, m, 2), col * 34, row * 34));
    });
    [0, 1, 3].forEach((g, i) => sheet.blit(portraitCanvas('bit', 'neutral', g), (moods.length + i) * 34, 6 * 34));
    fs.writeFileSync(path.join(dir!, 'portraits.png'), pixelCanvasToPng([sheet], 4));
  });
});
