/**
 * The Type I end card: a 480×270 pixel picture to save or share — the Sun ringed by the swarm, the
 * Earth on its arc, and the run's numbers in the pixel font. Pure PixelCanvas drawing (palette
 * indices only), so it renders headless in Node for tests and previews.
 */
import type { GameState } from '../sim/types';
import { C } from './palette';
import { PixelCanvas } from './pixels';
import { drawGlobe, drawStars } from './globe';
import { drawText, measureText, FONT_HEIGHT } from './font';
import { fmtTW } from '../sim/core';
import { spaceTW } from '../sim/swarm';
import { warming } from '../sim/climate';

export const END_W = 480;
export const END_H = 270;

/** The pixel font drawn at a whole-number scale (big titles stay crisp). */
function bigText(pc: PixelCanvas, str: string, x: number, y: number, c: number, scale: number): void {
  const tmp = new PixelCanvas(measureText(str) + 1, FONT_HEIGHT + 1);
  drawText(tmp, str, 0, 0, c);
  for (let yy = 0; yy < tmp.h; yy++)
    for (let xx = 0; xx < tmp.w; xx++) {
      const v = tmp.get(xx, yy);
      if (v) pc.rect(x + xx * scale, y + yy * scale, scale, scale, v);
    }
}

const widthAt = (str: string, scale: number) => measureText(str) * scale;

export interface EndCardInput {
  s: GameState;
  /** Equirectangular terrain for the little Earth (terrainCanvas(lod)) and its degrees per pixel. */
  terrain: PixelCanvas;
  res: number;
}

export function drawEndCard({ s, terrain, res }: EndCardInput): PixelCanvas {
  const pc = new PixelCanvas(END_W, END_H);
  // deep space, a few stars
  pc.vgradient(0, 0, END_W, END_H, [C.night0, C.night1, C.night2]);
  drawStars(pc, 2091, 260);
  // the Sun with a soft pixel glow, left of centre
  const sx = 132;
  const sy = 140;
  for (const [r, c, d] of [[46, C.dusk2, 0.25], [36, C.org0, 0.45], [28, C.org1, 0.7]] as const) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const q = (x * x + y * y) / (r * r);
        if (q > 1) continue;
        if (((x * 7 + y * 13) & 7) / 8 < d * (1 - q * 0.6)) pc.set(sx + x, sy + y, c);
      }
  }
  pc.circle(sx, sy, 20, C.yel1);
  pc.circle(sx, sy, 15, C.yel2);
  pc.circle(sx, sy, 9, C.white);
  // the swarm: a tilted ring of glints along Earth's orbit, brighter on the near side
  const rx = 112;
  const ry = 34;
  for (let a = 0; a < 360; a += 1.5) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(sx + Math.cos(t) * rx);
    const y = Math.round(sy + Math.sin(t) * ry);
    const near = Math.sin(t) > 0;
    if (!near && Math.hypot(x - sx, y - sy) < 22) continue; // behind the Sun
    const k = (Math.floor(a * 3.7) * 2654435761) >>> 0;
    pc.set(x, y, k % 5 === 0 ? C.white : near ? C.yel1 : C.org1);
    if (near && k % 3 === 0) pc.set(x, y + 1, C.yel0);
  }
  // the Earth on its arc, with the night side lit
  drawGlobe(pc, { terrain, res, lon0: 20, lat0: 18, cx: sx + 78, cy: sy + 24, r: 13, sun: { lat: 10, lon: -40 }, lights: true, atmosphere: true, smooth: true });
  // the words
  const right = 262;
  const year = s.system?.typeI ? new Date(Date.UTC(2027, 0, 1) + s.system.typeI * 86_400_000).getUTCFullYear() : new Date(Date.UTC(2027, 0, 1) + s.day * 86_400_000).getUTCFullYear();
  bigText(pc, 'TYPE I', right, 30, C.yel1, 4);
  bigText(pc, String(year), right, 60, C.white, 6);
  const name = s.company.name.toUpperCase().slice(0, 28);
  bigText(pc, name, right, 104, C.cyn5, 2);
  const lines = [
    `KARDASHEV ${s.stats.K.toFixed(4)}`,
    `${fmtTW(s.stats.worldTW).toUpperCase()} · ${fmtTW(spaceTW(s)).toUpperCase()} IN SPACE`,
    `WARMING ${warming(s).toFixed(2)} C`,
    `${s.models.length} MODELS · BIT-${Math.min(9, s.models.length)}`,
    s.system ? `HEALTHY YEARS ${s.system.lifeExp.toFixed(0)} · ${s.system.spacePop.toFixed(0)}M IN SPACE` : '',
    `${s.meta.difficulty.toUpperCase()} · SOLAR MAX ${s.system?.solarmax?.held ?? 0}/3`,
  ].filter(Boolean);
  lines.forEach((l, i) => drawText(pc, l, right, 126 + i * 10, i === 0 ? C.yel0 : C.ice2));
  // footer: the game's name and address
  pc.hline(right, 196, END_W - right - 18, C.ink4);
  bigText(pc, 'THE KARDASHEV PROJECT', right, 204, C.white, 1);
  drawText(pc, 'THEKARDASHEVPROJECT.NETLIFY.APP', right, 214, C.ink7);
  // a thin frame
  pc.box(4, 4, END_W - 8, END_H - 8, C.ink3);
  void widthAt;
  return pc;
}
