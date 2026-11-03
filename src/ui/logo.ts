import { C } from '../render/palette';
import { PixelCanvas, toDataUrl } from '../render/pixels';
import { drawText, measureText } from '../render/font';

/** Chunky bevelled pixel logo built from the 3×5 font. Returns the indexed canvas. */
export function logoCanvas(): PixelCanvas {
  const big = 'KARDASHEV';
  const S = 3; // each font pixel → 3×3 block
  const bigW = measureText(big) * S;
  const W = bigW + 16;
  const H = 5 * S + 26;
  const pc = new PixelCanvas(W, H);
  const glyphs = new PixelCanvas(measureText(big), 5);
  drawText(glyphs, big, 0, 0, C.white);
  const ox = 8;
  const oy = 10;
  for (let y = 0; y < 5; y++) for (let x = 0; x < glyphs.w; x++) if (glyphs.get(x, y)) pc.rect(ox + x * S + 2, oy + y * S + 2, S, S, C.vio1);
  const ramp = [C.yel2, C.yel1, C.yel0, C.org2, C.org1, C.org0];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < glyphs.w; x++) {
      if (!glyphs.get(x, y)) continue;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const gy = y * S + j;
          pc.set(ox + x * S + i, oy + gy, ramp[Math.min(ramp.length - 1, Math.floor((gy / (5 * S)) * ramp.length))]);
        }
      }
      if (!glyphs.get(x, y - 1)) pc.hline(ox + x * S, oy + y * S, S, C.white);
    }
  }
  pc.outline(C.ink0);
  drawText(pc, 'THE', ox, 2, C.cyn5);
  const proj = 'P R O J E C T';
  drawText(pc, proj, W - 8 - measureText(proj), oy + 5 * S + 6, C.cyn5);
  pc.circle(W - 10, 5, 3, C.yel0);
  pc.set(W - 11, 4, C.yel2);
  const barEnd = W - 12 - measureText(proj) - ox;
  for (let i = 0; i < barEnd; i += 2) pc.set(ox + i, oy + 5 * S + 8, i < barEnd * 0.73 ? C.cyn4 : C.ink5);
  return pc;
}

let url: string | null = null;
export function logoUrl(): string {
  return (url ??= toDataUrl(logoCanvas()));
}
