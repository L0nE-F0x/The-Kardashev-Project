/**
 * The dock icons: every one is 15×15 with its outline closed (nothing but outline on the border). With PREVIEW_DIR
 * set it writes dock-icons.png: each icon at 2×, 3× and 4× on a dock button, the old 9×9 icon beside it, and a
 * mock of the whole dock.
 *   PREVIEW_DIR=/some/dir npx vitest run tests/dock-icons.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { C, paletteTable } from '../src/render/palette';
import type { PixelCanvas } from '../src/render/pixels';
import { encodePngRgba } from '../tools/lib/png';
import { DOCK_ICON_NAMES, DOCK_SIZE, dockIconCanvas } from '../src/ui/dockIcons';
import { iconCanvas, ICON_NAMES, type IconName } from '../src/ui/icons';

describe('dock icons', () => {
  it('draws every icon at 15×15 inside a closed outline', () => {
    for (const name of DOCK_ICON_NAMES) {
      const pc = dockIconCanvas(name);
      expect([pc.w, pc.h]).toEqual([DOCK_SIZE, DOCK_SIZE]);
      let filled = 0;
      for (let y = 0; y < pc.h; y++)
        for (let x = 0; x < pc.w; x++) {
          const c = pc.get(x, y);
          if (c && c !== C.ink0) filled++;
          const edge = x === 0 || y === 0 || x === pc.w - 1 || y === pc.h - 1;
          if (edge) expect(c === 0 || c === C.ink0, `${name} ${x},${y}`).toBe(true);
        }
      expect(filled, name).toBeGreaterThan(40);
    }
  });

  it('has a 9×9 icon of the same name for the classic look', () => {
    for (const name of DOCK_ICON_NAMES) expect(ICON_NAMES, name).toContain(name as IconName);
  });

  it.runIf(!!process.env.PREVIEW_DIR)('writes the contact sheet', () => {
    const table = paletteTable();
    const W = 900;
    const rowH = 80;
    const H = 20 + DOCK_ICON_NAMES.length * rowH;
    const rgba = new Uint8Array(W * H * 4);
    const fill = (x0: number, y0: number, w: number, h: number, [r, g, b]: number[]) => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = (y * W + x) * 4;
          rgba.set([r, g, b, 255], i);
        }
    };
    const blit = (pc: PixelCanvas, x0: number, y0: number, k: number) => {
      for (let y = 0; y < pc.h; y++)
        for (let x = 0; x < pc.w; x++) {
          const c = pc.get(x, y);
          if (!c) continue;
          fill(x0 + x * k, y0 + y * k, k, k, [table[c * 4], table[c * 4 + 1], table[c * 4 + 2]]);
        }
    };
    const bg = [0x16, 0x14, 0x1f];
    const btn = [0x2a, 0x25, 0x38];
    fill(0, 0, W, H, bg);
    DOCK_ICON_NAMES.forEach((name, i) => {
      const y = 10 + i * rowH;
      let x = 10;
      for (const k of [2, 3, 4]) {
        const b = DOCK_SIZE * k + 14;
        fill(x, y, b, b, btn);
        blit(dockIconCanvas(name), x + 7, y + 7, k);
        x += b + 12;
      }
      // the old 9×9 at 3× for comparison
      fill(x + 20, y, 41, 41, btn);
      blit(iconCanvas(name as IconName), x + 27, y + 7, 3);
    });
    // a mock dock: the whole set in a column at 3×, the way it sits on screen
    const dx = 620;
    fill(dx - 6, 4, 60, DOCK_ICON_NAMES.length * 51 + 8, [0x0b, 0x0a, 0x12]);
    DOCK_ICON_NAMES.forEach((name, i) => {
      fill(dx, 10 + i * 51, 47, 47, btn);
      blit(dockIconCanvas(name), dx + 1, 11 + i * 51, 3);
    });
    const dir = process.env.PREVIEW_DIR!;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'dock-icons.png'), encodePngRgba(W, H, rgba));

    // DOCK_ZOOM=deal,blocs → dock-zoom.png: those icons at 10× on a grid, for pixel work
    const zoom = (process.env.DOCK_ZOOM ?? '').split(',').filter((n) => DOCK_ICON_NAMES.includes(n as never));
    if (zoom.length) {
      const k = 10;
      const cell = DOCK_SIZE * k + 20;
      const zw = cell * Math.min(4, zoom.length);
      const zh = cell * Math.ceil(zoom.length / 4);
      const z = new Uint8Array(zw * zh * 4);
      for (let i = 0; i < zw * zh; i++) z.set([0x2a, 0x25, 0x38, 255], i * 4);
      zoom.forEach((name, n) => {
        const pc = dockIconCanvas(name as never);
        const ox = (n % 4) * cell + 10;
        const oy = Math.floor(n / 4) * cell + 10;
        for (let y = 0; y < pc.h * k; y++)
          for (let x = 0; x < pc.w * k; x++) {
            const c = pc.get(Math.floor(x / k), Math.floor(y / k));
            const grid = x % k === 0 || y % k === 0;
            const i = ((oy + y) * zw + ox + x) * 4;
            if (c) z.set([table[c * 4] * (grid ? 0.8 : 1), table[c * 4 + 1] * (grid ? 0.8 : 1), table[c * 4 + 2] * (grid ? 0.8 : 1), 255], i);
            else if (grid) z.set([0x34, 0x2f, 0x44, 255], i);
          }
      });
      fs.writeFileSync(path.join(dir, 'dock-zoom.png'), encodePngRgba(zw, zh, z));
    }
  });
});
