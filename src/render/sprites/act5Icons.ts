/**
 * Act V map sprites: the rectenna fields where the swarm's beams come down. Palette keys into
 * PixelCanvases; the MapScene caches them as textures.
 */
import type { Texture } from 'pixi.js';
import { C } from '../palette';
import { PixelCanvas } from '../pixels';
import { cachedTexture } from '../textures';

/**
 * One rectenna field for the swarm's beams: a wide oval of antenna rows (pale mesh striped with
 * darker dipole lines) in a dark rim, a gold receiver mast at the centre. (Act IV's space-solar
 * rectennas are smaller and rimless, with a pink receiver.) `fine` is the detailed LOD. Building:
 * the rim dotted, the rows laid from the left up to `progress`, a work light at the laying front.
 */
export function beamFieldCanvas(fine: boolean, building = false, progress = 1): PixelCanvas {
  const rx = fine ? 5 : 3;
  const ry = fine ? 2.8 : 1.8;
  const iw = Math.ceil(rx * 2);
  const ih = Math.ceil(ry * 2);
  const inner = new PixelCanvas(iw, ih);
  const cx = iw / 2;
  const cy = ih / 2;
  const front = Math.round(progress * iw);
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      if (building) {
        if (x < front) inner.set(x, y, y % 2 ? C.ink5 : (x + y) % 4 === 0 ? C.ink6 : C.ink8);
        else inner.set(x, y, C.snd3);
        continue;
      }
      if (fine) inner.set(x, y, y % 2 ? C.ink5 : (x + (y >> 1)) % 3 === 0 ? C.ice3 : C.ink8);
      else inner.set(x, y, (x + y) % 2 ? C.ink6 : C.ice2);
    }
  }
  const pc = new PixelCanvas(iw + 2, ih + 2);
  pc.blit(inner, 1, 1);
  if (building) {
    // the survey line: a dotted rim round the plot
    const rim = new PixelCanvas(pc.w, pc.h);
    rim.blit(inner, 1, 1);
    rim.outline(C.ink9);
    for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (rim.get(x, y) === C.ink9 && !pc.get(x, y) && (x + y) % 2 === 0) pc.set(x, y, C.ink9);
    // unlaid ground stays bare inside the rim
    for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.get(x, y) === C.snd3) pc.set(x, y, 0);
    if (front > 0 && front < iw) pc.set(front + 1, Math.floor(cy) + 1, C.yel1);
    return pc;
  }
  pc.outline(C.ink2);
  // the receiver mast catches the beam
  const mx = Math.floor(cx) + 1;
  const my = Math.floor(cy) + 1;
  pc.set(mx, my, C.yel2);
  pc.set(mx - 1, my, C.yel0);
  if (fine) {
    pc.set(mx, my - 1, C.white);
    pc.set(mx + 1, my, C.org1);
  }
  return pc;
}

export function beamFieldTexture(fine: boolean, building = false, progress = 1): Texture {
  const p = building ? Math.round(progress * 8) / 8 : 1;
  return cachedTexture(`beamfield:${fine}:${building}:${p}`, () => beamFieldCanvas(fine, building, p));
}
