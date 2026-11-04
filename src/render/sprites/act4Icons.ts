/**
 * Act IV map sprites: fusion plants by design, air-capture fan banks, supergrid terminals,
 * rectenna fields, AI-region banners and the 2×2 aurora pulse that runs along the supergrid.
 * All drawn with palette keys into PixelCanvases (cached as textures by the callers).
 */
import type { Texture } from 'pixi.js';
import type { AiId, FusionDesignId } from '../../sim/types';
import { C, type ColorKey } from '../palette';
import { PixelCanvas } from '../pixels';
import { cachedTexture } from '../textures';
import { rampOf } from './charterIcons';

type Keys = Record<string, ColorKey | null>;

/** Grow a canvas by 1 px on every side and outline it. */
function framed(pc: PixelCanvas, outline: number = C.ink0, diagonal = false): PixelCanvas {
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  out.outline(outline, diagonal);
  return out;
}

// ── fusion plants ────────────────────────────────────────────────────────────────────────────
/** Each design's glyph: `p`/`q` are the plasma (they go dark while the plant is being built). */
const FUSION_GLYPH: Record<FusionDesignId, [string, Keys]> = {
  // a compact tokamak: a doughnut of pink plasma in its steel casing
  tokamak: [
    `
    ..aaa..
    .apqpa.
    apb.bqa
    .aqpqa.
    ..aaa..
  `,
    { a: 'ink8', b: 'vio2', p: 'pnk0', q: 'pnk1' },
  ],
  // a stellarator: the same bottle, lumpy and twisted, violet light winding round it
  stellarator: [
    `
    .aa.aa.
    apqaqpa
    aqb.bqa
    apqaqpa
    .aa.aa.
  `,
    { a: 'ink7', b: 'vio1', p: 'vio5', q: 'pnk1' },
  ],
  // laser ignition: beams converging on a target chamber
  laser: [
    `
    p..a..p
    .p.a.p.
    aabqbaa
    .p.a.p.
    p..a..p
  `,
    { a: 'ink6', b: 'ink8', p: 'org1', q: 'yel2' },
  ],
  // magnetised target: pistons ringed round a ball of liquid metal
  pinch: [
    `
    a.a.a
    .bcb.
    acqca
    .bcb.
    a.a.a
  `,
    { a: 'ink9', b: 'ink6', c: 'ink8', q: 'yel1' },
  ],
  // aneutronic D-He3: a cool cyan ring with direct-conversion fins
  dhe3: [
    `
    a.aaa.a
    aapqpaa
    apb.bqa
    aaqpqaa
    a.aaa.a
  `,
    { a: 'ink8', b: 'blu1', p: 'cyn5', q: 'cyn6' },
  ],
};

/**
 * A fusion plant at a megaproject site, by design. Online: lit plasma. Building: the dark
 * casing with a progress bar under it.
 */
export function fusionCanvas(design: FusionDesignId, building = false, progress = 1): PixelCanvas {
  const [rows, keys] = FUSION_GLYPH[design];
  const map: Keys = building ? { ...keys, p: 'ink4', q: 'ink5', a: 'ink6' } : keys;
  const pc = PixelCanvas.from(rows, map);
  if (!building) return framed(pc);
  const out = new PixelCanvas(pc.w, pc.h + 2);
  out.blit(pc, 0, 0);
  const filled = Math.max(1, Math.round(progress * pc.w));
  for (let x = 0; x < pc.w; x++) out.set(x, pc.h + 1, x < filled ? C.yel0 : C.ink3);
  return framed(out);
}
export function fusionTexture(design: FusionDesignId, building = false, progress = 1): Texture {
  const p = building ? Math.round(progress * 8) / 8 : 1;
  return cachedTexture(`fusion4:${design}:${building}:${p}`, () => fusionCanvas(design, building, p));
}

// ── direct air capture ───────────────────────────────────────────────────────────────────────
/** A bank of capture fans (spinning between two frames), clean air rising green from the top. */
export function dacCanvas(building = false, progress = 1, frame = 0): PixelCanvas {
  const [p, q] = frame % 2 ? ['c', 'b'] : ['b', 'c'];
  const pc = PixelCanvas.from(
    `
    .g...g...g.
    aaaaaaaaaaa
    a${p}${q}${p}a${p}${q}${p}a${p}a
    a${q}${p}${q}a${q}${p}${q}a${q}a
    aaaaaaaaaaa
  `,
    building ? { a: 'ink5', b: 'ink3', c: 'ink4', g: null } : { a: 'ink7', b: 'ink2', c: 'ink9', g: 'grn6' },
  );
  if (!building) return framed(pc);
  const out = new PixelCanvas(pc.w, pc.h + 2);
  out.blit(pc, 0, 0);
  const filled = Math.max(1, Math.round(progress * pc.w));
  for (let x = 0; x < pc.w; x++) out.set(x, pc.h + 1, x < filled ? C.yel0 : C.ink3);
  return framed(out);
}
export function dacTexture(building = false, progress = 1, frame = 0): Texture {
  const p = building ? Math.round(progress * 8) / 8 : 1;
  return cachedTexture(`dac4:${building}:${p}:${frame % 2}`, () => dacCanvas(building, p, frame));
}

// ── the supergrid ────────────────────────────────────────────────────────────────────────────
/** A supergrid terminal: a converter hall with a superconducting cable head glowing on its roof. */
export function terminalCanvas(status: 'planned' | 'building' | 'online' | 'down'): PixelCanvas {
  const keys: Record<typeof status, Keys> = {
    online: { a: 'white', b: 'ink8', c: 'cyn6', d: 'vio4' },
    building: { a: 'ink7', b: 'ink6', c: 'ink4', d: 'ink5' },
    planned: { a: 'ink6', b: 'ink5', c: 'ink3', d: 'ink4' },
    down: { a: 'red3', b: 'ink6', c: 'red1', d: 'red2' },
  };
  const pc = PixelCanvas.from(
    `
    ..a..
    .dad.
    bbbbb
    bcbcb
  `,
    keys[status],
  );
  return framed(pc);
}
export function terminalTexture(status: 'planned' | 'building' | 'online' | 'down'): Texture {
  return cachedTexture(`sgterm:${status}`, () => terminalCanvas(status));
}

/** A 2×2 pulse of aurora light for the supergrid (the head is white, the tail tinted). */
export function sgPulseCanvas(): PixelCanvas {
  const pc = new PixelCanvas(2, 2);
  pc.rect(0, 0, 2, 2, C.white);
  return pc;
}
export function sgPulseTexture(): Texture {
  return cachedTexture('sgpulse', sgPulseCanvas);
}

// ── rectennas ────────────────────────────────────────────────────────────────────────────────
/**
 * A rectenna field: an oval of pale mesh panels round a receiver, the spot a space-solar beam
 * lands on. Building: the surveyed outline only, filled in as far as it has got. `big` at the
 * close zoom level.
 */
export function rectennaCanvas(big: boolean, building = false, progress = 1): PixelCanvas {
  const rx = big ? 5.5 : 3.5;
  const ry = big ? 3.2 : 2.2;
  const w = Math.ceil(rx * 2);
  const h = Math.ceil(ry * 2);
  const pc = new PixelCanvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const edge = d > 0.62;
      if (building) {
        // the survey line (dotted), and mesh laid from the left up to the progress
        const rim = d > (big ? 0.7 : 0.55);
        if (rim) {
          if ((x + y) % 2 === 0) pc.set(x, y, C.ink8);
        } else if ((x + 0.5) / w < progress) pc.set(x, y, (x + y) % 2 === 0 ? C.ink8 : C.ink6);
        continue;
      }
      if (edge) pc.set(x, y, C.ink7);
      else pc.set(x, y, (x + y) % 2 === 0 ? C.ice2 : (y % 2 ? C.ink6 : C.ink8));
    }
  }
  if (!building) {
    // the receiver at the centre catches the beam
    pc.set(Math.floor(cx), Math.floor(cy), C.pnk1);
    if (big) pc.set(Math.floor(cx) - 1, Math.floor(cy), C.pnk0);
  }
  return pc;
}

// ── AI regions ───────────────────────────────────────────────────────────────────────────────
/** Each AI's mark on its banner: one or two pixels in the light colour. */
const AI_MARK: Record<AiId, [number, number][]> = {
  // Bit: an eye
  bit: [[2, 1], [2, 2]],
  // Apex: a chevron
  apex: [[1, 1], [2, 2], [3, 1]],
  // Weft: a checker weave
  weft: [[1, 1], [3, 1], [2, 2]],
  // Sapling: a sprouting leaf
  sapling: [[2, 3], [2, 2], [3, 1]],
};

/**
 * A small banner for a province run by an AI: a swallow-tailed pennant in the AI's colour on a
 * pale pole, its mark on the cloth. `frame` flutters the tail.
 */
export function aiBannerCanvas(ai: AiId, color: ColorKey, frame = 0): PixelCanvas {
  const [dk, base, lt] = rampOf(color);
  const pc = new PixelCanvas(6, 9);
  for (let y = 0; y < 9; y++) pc.set(0, y, y === 0 ? C.white : C.ink8);
  // the cloth, swallow-tailed: the outer rows reach further than the middle ones
  const f = frame % 2;
  for (let y = 0; y < 4; y++) {
    const len = y === 0 || y === 3 ? 5 : 4;
    for (let x = 1; x <= len; x++) pc.set(x, y + (f && x >= 4 ? 1 : 0), x >= 4 ? C[dk] : C[base]);
  }
  if (f) pc.set(4, 0, C[base]);
  for (const [x, y] of AI_MARK[ai]) if (y < 4) pc.set(x, y, C[lt]);
  pc.set(1, 0, C[lt]);
  return framed(pc);
}
export function aiBannerTexture(ai: AiId, color: ColorKey, frame = 0): Texture {
  return cachedTexture(`aibanner:${ai}:${color}:${frame % 2}`, () => aiBannerCanvas(ai, color, frame));
}
