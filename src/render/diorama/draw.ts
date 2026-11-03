/**
 * Shared drawing helpers for diorama art: shading, towers, domes, tanks, windows, cranes and the
 * pixel bloom that gives night lights a soft (but still blocky) halo. Everything works on
 * indexed PixelCanvases with palette indices, so the era grading applies.
 */
import { C } from '../palette';
import { ditherAt, hash2, PixelCanvas, bayer } from '../pixels';
import { drawText, measureText } from '../font';

/** Shade the right part of a facade with an ordered dither (light comes from the left). */
export function facadeShade(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, from: number, to: number, start = 0.62) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (pc.get(x, y) !== from) continue;
      const t = (x - x0) / w;
      if (t > start && ditherAt(x, y, (t - start) / (1 - start))) pc.set(x, y, to);
    }
  }
}

/** Colours for round shapes lit from the upper left. */
export interface Ramp {
  hi: number;
  lit: number;
  mid: number;
  shade: number;
  dark: number;
}

export const CONCRETE: Ramp = { hi: C.white, lit: C.ink9, mid: C.ink8, shade: C.ink7, dark: C.ink6 };
export const OLD_CONCRETE: Ramp = { hi: C.ink9, lit: C.rck6, mid: C.ink8, shade: C.rck5, dark: C.rck4 };
export const STEEL: Ramp = { hi: C.white, lit: C.ink8, mid: C.ink7, shade: C.ink6, dark: C.ink5 };

/** Colour for a point on a cylinder of half-width r at horizontal offset dx (-r..r). */
export function roundShade(r: Ramp, dx: number, half: number, x: number, y: number): number {
  const t = (dx + half) / Math.max(1, half * 2); // 0 left … 1 right
  if (t < 0.12) return r.lit;
  if (t < 0.3) return ditherAt(x, y, (t - 0.12) / 0.18) ? r.hi : r.lit;
  if (t < 0.55) return r.mid;
  if (t < 0.78) return ditherAt(x, y, (t - 0.55) / 0.23) ? r.shade : r.mid;
  if (t < 0.92) return r.shade;
  return r.dark;
}

/**
 * Hyperbolic cooling tower. (cx, baseY) is the bottom centre; returns the y of the rim and its
 * half-width so callers can hang beacons and steam on it.
 */
export function coolingTower(pc: PixelCanvas, cx: number, baseY: number, height: number, baseHalf: number, ramp: Ramp = CONCRETE, opts: { stain?: boolean; band?: number } = {}) {
  const top = baseY - height;
  const waistAt = 0.72;
  const waist = baseHalf * 0.62;
  const topHalf = baseHalf * 0.7;
  const halfAt = (y: number) => {
    const t = (y - top) / height;
    if (t < waistAt) {
      const k = (waistAt - t) / waistAt;
      return waist + (topHalf - waist) * k * k;
    }
    const k = (t - waistAt) / (1 - waistAt);
    return waist + (baseHalf - waist) * Math.pow(k, 1.7);
  };
  for (let y = top; y < baseY; y++) {
    const half = halfAt(y);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    for (let x = x0; x <= x1; x++) {
      let c = roundShade(ramp, x - cx, half, x, y);
      // weathering streaks running down from the rim
      if (opts.stain && y - top < height * 0.45 && hash2(x, 3, 77) < 0.22 && bayer(x, y) < 9 - ((y - top) / height) * 14) c = ramp.shade;
      pc.set(x, y, c);
    }
    pc.set(x0, y, ramp.mid);
    pc.set(x1, y, ramp.dark);
  }
  // rim lip
  const th = halfAt(top);
  pc.hline(Math.round(cx - th) - 1, top, Math.round(th * 2) + 3, ramp.mid);
  pc.hline(Math.round(cx - th), top + 1, Math.round(th * 2) + 1, ramp.shade);
  // painted band (restarts and new builds get a fresh stripe)
  if (opts.band) {
    for (let y = top + 4; y < top + 7; y++) {
      const half = halfAt(y);
      for (let x = Math.round(cx - half) + 1; x < Math.round(cx + half); x++) pc.set(x, y, (x - cx) / half > 0.55 && ditherAt(x, y, 0.5) ? C.red1 : opts.band);
    }
  }
  // air-inlet legs along the bottom
  for (let x = Math.round(cx - baseHalf) + 1; x < Math.round(cx + baseHalf); x++) {
    const leg = (x + Math.round(cx)) % 3 === 0;
    pc.set(x, baseY - 1, leg ? ramp.shade : C.ink2);
    pc.set(x, baseY - 2, leg ? ramp.shade : C.ink3);
    pc.set(x, baseY - 3, leg ? ramp.mid : (x % 2 ? C.ink3 : ramp.shade));
  }
  return { top, half: th };
}

/** Containment building: a cylinder with a hemispherical dome. Returns the dome's top y. */
export function containment(pc: PixelCanvas, x: number, baseY: number, w: number, bodyH: number, ramp: Ramp = CONCRETE) {
  const half = w / 2;
  const cx = x + half;
  const bodyTop = baseY - bodyH;
  const domeH = Math.round(w * 0.42);
  for (let y = bodyTop - domeH; y < baseY; y++) {
    for (let xx = x; xx < x + w; xx++) {
      const dx = xx + 0.5 - cx;
      if (y < bodyTop) {
        const dy = (bodyTop - y - 0.5) / domeH;
        if ((dx / half) ** 2 + dy * dy > 1) continue;
        // dome: extra highlight toward the top left
        const c = dy > 0.55 && dx < 0 ? (ditherAt(xx, y, 0.6) ? ramp.hi : ramp.lit) : roundShade(ramp, dx, half, xx, y);
        pc.set(xx, y, c);
      } else pc.set(xx, y, roundShade(ramp, dx, half, xx, y));
    }
  }
  // ring beam where the dome meets the wall
  pc.hline(x, bodyTop, w, ramp.shade);
  for (let xx = x; xx < x + w; xx += 3) pc.set(xx, bodyTop + 1, ramp.dark);
  return bodyTop - domeH;
}

/** Vertical storage tank with a shallow domed roof and a caged ladder. */
export function tank(pc: PixelCanvas, x: number, baseY: number, w: number, h: number, ramp: Ramp, ladder = true, band?: number) {
  const half = w / 2;
  const cx = x + half;
  const top = baseY - h;
  for (let y = top; y < baseY; y++) for (let xx = x; xx < x + w; xx++) pc.set(xx, y, roundShade(ramp, xx + 0.5 - cx, half, xx, y));
  for (let xx = x + 1; xx < x + w - 1; xx++) pc.set(xx, top - 1, ramp.lit);
  pc.hline(x + 2, top - 2, w - 4, ramp.mid);
  for (let y = top + 3; y < baseY - 1; y += 5) pc.hline(x, y, w, ramp.shade);
  if (band) pc.rect(x, top + 2, w, 2, band);
  if (ladder) {
    pc.vline(x + w - 3, top - 1, h, C.ink4);
    for (let y = top; y < baseY; y += 2) pc.set(x + w - 2, y, C.ink4);
  }
}

/** Horizontal pressure vessel on saddles. */
export function vessel(pc: PixelCanvas, x: number, y: number, w: number, h: number, ramp: Ramp) {
  const r = h / 2;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const dy = yy + 0.5 - (y + r);
      const ex = xx < x + r ? x + r - xx - 0.5 : xx > x + w - r ? xx + 0.5 - (x + w - r) : 0;
      if (ex * ex + dy * dy > r * r) continue;
      const t = (dy + r) / h;
      pc.set(xx, yy, t < 0.25 ? ramp.lit : t < 0.6 ? ramp.mid : t < 0.85 ? (ditherAt(xx, yy, 0.5) ? ramp.shade : ramp.mid) : ramp.shade);
    }
  }
  pc.rect(x + 2, y + h, 2, 2, C.ink4);
  pc.rect(x + w - 4, y + h, 2, 2, C.ink4);
}

/** A pipe (horizontal) with a highlight on top and support posts down to the ground. */
export function pipe(pc: PixelCanvas, x: number, y: number, w: number, groundY: number | null, col = C.ink8, shade = C.ink6, every = 9) {
  pc.hline(x, y, w, col);
  pc.hline(x, y + 1, w, shade);
  if (groundY !== null) for (let xx = x + 3; xx < x + w; xx += every) pc.vline(xx, y + 2, groundY - y - 2, C.ink5);
}

/** Vertical pipe. */
export function vpipe(pc: PixelCanvas, x: number, y: number, h: number, col = C.ink8, shade = C.ink6) {
  pc.vline(x, y, h, col);
  pc.vline(x + 1, y, h, shade);
}

/** Lit windows in a grid: base gets dark glass (with the odd sky reflection), glow gets the lights. */
export function windowGrid(
  pc: PixelCanvas,
  g: PixelCanvas,
  x: number,
  y: number,
  cols: number,
  rows: number,
  opts: { ww?: number; wh?: number; gx?: number; gy?: number; seed?: number; lit?: number; glass?: number; lights?: number[] } = {},
) {
  const ww = opts.ww ?? 2;
  const wh = opts.wh ?? 2;
  const gx = opts.gx ?? 2;
  const gy = opts.gy ?? 3;
  const seed = opts.seed ?? 0;
  const lit = opts.lit ?? 0.6;
  const glass = opts.glass ?? C.ink1;
  const lights = opts.lights ?? [C.yel1, C.yel0, C.yel1, C.yel2];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + c * (ww + gx);
      const wy = y + r * (wh + gy);
      const refl = hash2(c, r, seed + 5) > 0.86;
      pc.rect(wx, wy, ww, wh, refl ? C.sky4 : glass);
      // lights cluster by floor so a building reads as "floors at work", not noise
      const floorOn = hash2(r, seed, 31) * 0.5 + 0.5;
      if (hash2(c, r, seed) < lit * floorOn * 1.4) g.rect(wx, wy, ww, wh, lights[Math.floor(hash2(c, r, seed + 9) * lights.length)]);
    }
  }
}

/** A blinking aviation beacon (glow follows `on`). */
export function beacon(pc: PixelCanvas, g: PixelCanvas, x: number, y: number, on: boolean, col = C.red3) {
  pc.set(x, y, on ? col : C.red1);
  if (on) g.set(x, y, col);
}

/** Simple chain-link fence. */
export function fence(pc: PixelCanvas, x: number, y: number, w: number, h = 5, col = C.ink6) {
  pc.hline(x, y, w, col);
  for (let xx = x; xx < x + w; xx += 3) pc.vline(xx, y, h, col);
  for (let xx = x + 1; xx < x + w; xx += 3) if (h > 3) pc.set(xx, y + 2, C.ink5);
}

/** A sign plate with text; the text glows at night. */
export function signPlate(pc: PixelCanvas, g: PixelCanvas, text: string, x: number, y: number, fg: number, bg = C.ink1, glow = true) {
  const tw = measureText(text);
  pc.rect(x, y, tw + 4, 7, bg);
  drawText(pc, text, x + 2, y + 1, fg);
  if (glow) drawText(g, text, x + 2, y + 1, fg);
  return tw + 4;
}

/** Chimney/exhaust stack with optional warning bands. */
export function stack(pc: PixelCanvas, g: PixelCanvas, x: number, top: number, bottom: number, w: number, bands = true, beaconOn = true) {
  pc.rect(x, top, w, bottom - top, C.ink8);
  pc.vline(x + w - 1, top, bottom - top, C.ink6);
  if (w > 3) pc.vline(x + w - 2, top, bottom - top, C.ink7);
  pc.vline(x, top, bottom - top, C.ink9);
  if (bands) for (let y = top + 1; y < top + 10 && y < bottom; y += 4) pc.rect(x, y, w, 2, C.red3);
  pc.hline(x - 1, top - 1, w + 2, C.ink6);
  beacon(pc, g, x + Math.floor(w / 2), top - 2, beaconOn);
}

/** Scaffolding grid over a region. */
export function scaffold(pc: PixelCanvas, x: number, y: number, w: number, h: number, col = C.ink6, step = 6) {
  for (let xx = x; xx <= x + w; xx += step) pc.vline(xx, y, h, col);
  for (let yy = y; yy <= y + h; yy += 5) pc.hline(x, yy, w + 1, col);
  // diagonal bracing on every other bay
  for (let xx = x; xx + step <= x + w; xx += step * 2) {
    for (let yy = y; yy + 5 <= y + h; yy += 5) pc.line(xx, yy + 5, xx + step, yy, C.ink5);
  }
}

/** Tower crane: mast at x from topY down to baseY, jib along topY. */
export function towerCrane(pc: PixelCanvas, x: number, topY: number, baseY: number, jibL: number, jibR: number, hook: number | null = null) {
  for (let y = topY; y < baseY; y += 2) {
    pc.set(x, y, C.yel0);
    pc.set(x + 2, y, C.yel0);
    pc.set(x + 1, y + 1, C.org1);
  }
  pc.vline(x, topY, baseY - topY, C.yel0);
  pc.vline(x + 2, topY, baseY - topY, C.org1);
  // jib + counter-jib
  pc.hline(x - jibL, topY, jibL + jibR + 3, C.yel0);
  pc.hline(x - jibL, topY + 1, jibL + jibR + 3, C.org1);
  for (let xx = x - jibL; xx < x + jibR + 3; xx += 3) pc.set(xx, topY + 1, C.yel0);
  // cab + counterweight + apex
  pc.rect(x - 1, topY + 2, 5, 3, C.ink5);
  pc.set(x, topY + 3, C.sky4);
  pc.rect(x + jibR - 2, topY + 2, 4, 3, C.ink3);
  pc.vline(x + 1, topY - 4, 4, C.yel0);
  pc.line(x + 1, topY - 4, x - jibL + 2, topY - 1, C.ink7);
  pc.line(x + 1, topY - 4, x + jibR, topY - 1, C.ink7);
  if (hook !== null) {
    const hx = x - Math.round(jibL * 0.6);
    pc.vline(hx, topY + 2, hook, C.ink7);
    pc.rect(hx - 1, topY + 2 + hook, 3, 2, C.ink3);
  }
}

/** Mobile crawler crane (for low structures). */
export function crawlerCrane(pc: PixelCanvas, x: number, baseY: number, boomLen: number) {
  pc.rect(x, baseY - 4, 12, 3, C.ink3);
  pc.hline(x, baseY - 2, 12, C.ink2);
  pc.rect(x + 2, baseY - 8, 7, 4, C.yel0);
  pc.rect(x + 7, baseY - 7, 2, 2, C.sky4);
  for (let i = 0; i < boomLen; i++) {
    const bx = x + 4 + Math.round(i * 0.55);
    const by = baseY - 9 - i;
    pc.set(bx, by, i % 2 ? C.org1 : C.yel0);
    pc.set(bx + 1, by, C.org1);
  }
  const tx = x + 4 + Math.round(boomLen * 0.55);
  pc.vline(tx + 1, baseY - 9 - boomLen, Math.round(boomLen * 0.5), C.ink7);
}

/**
 * Pixel bloom: a dithered 1–2px halo around every emissive pixel, in a darker shade of the same
 * hue. Drawn additively at night so dense windows merge into a glow without losing the grid.
 */
export function bloomOf(glow: PixelCanvas): PixelCanvas {
  const out = new PixelCanvas(glow.w, glow.h);
  const { w, h } = glow;
  const src = glow.data;
  const tone = (c: number): number => BLOOM_TONE.get(c) ?? C.ink4;
  // Splat each lit pixel's halo into its neighbours (glows are sparse: this is far cheaper than
  // scanning every pixel's 5×5 neighbourhood). Per output pixel keep the strongest neighbour,
  // ties going to the first one in raster order — exactly what a full scan would pick.
  const best = new Uint8Array(w * h);
  const bestIdx = new Uint8Array(w * h);
  const bestCol = new Uint8Array(w * h);
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const c = src[ly * w + lx];
      if (!c) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const y = ly - dy;
        if (y < 0 || y >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const x = lx - dx;
          if (x < 0 || x >= w) continue;
          const o = y * w + x;
          if (src[o]) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          const sc = d <= 1 ? 3 : d === 2 ? 2 : 1;
          const idx = (dy + 2) * 5 + (dx + 2);
          if (sc > best[o] || (sc === best[o] && idx < bestIdx[o])) {
            best[o] = sc;
            bestIdx[o] = idx;
            bestCol[o] = c;
          }
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      const s = best[o];
      if (!s) continue;
      const level = s === 3 ? 13 : s === 2 ? 7 : 2;
      if (bayer(x, y) < level) out.set(x, y, tone(bestCol[o]));
    }
  }
  return out;
}

export const BLOOM_TONE = new Map<number, number>([
  [C.yel2, C.org1],
  [C.yel1, C.org0],
  [C.yel0, C.org0],
  [C.org2, C.red2],
  [C.org1, C.red2],
  [C.org0, C.red1],
  [C.red3, C.red1],
  [C.red2, C.red0],
  [C.cyn6, C.cyn3],
  [C.cyn5, C.cyn2],
  [C.cyn4, C.cyn1],
  [C.blu6, C.blu3],
  [C.blu5, C.blu2],
  [C.blu4, C.blu1],
  [C.sky4, C.blu2],
  [C.sky5, C.blu3],
  [C.grn6, C.grn2],
  [C.grn5, C.grn1],
  [C.vio5, C.vio2],
  [C.vio4, C.vio1],
  [C.pnk0, C.vio2],
  [C.pnk1, C.vio3],
  [C.white, C.ink4],
  [C.ice2, C.ink3],
  [C.ice3, C.ink4],
]);

/** Copy of `src` showing only rows at or below `cut` (construction reveal). */
export function revealFrom(src: PixelCanvas, cut: number): PixelCanvas {
  const pc = new PixelCanvas(src.w, src.h);
  for (let y = Math.max(0, cut); y < src.h; y++) for (let x = 0; x < src.w; x++) pc.set(x, y, src.get(x, y));
  return pc;
}

/** A tiny flag on a pole. */
export function flag(pc: PixelCanvas, x: number, baseY: number, h: number, c1: number, c2: number, wave = 0) {
  pc.vline(x, baseY - h, h, C.ink7);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) pc.set(x + 1 + i, baseY - h + j + ((i + wave) % 4 === 0 ? 1 : 0), j < 2 ? c1 : c2);
}

/** Transformer yard: two or more transformers with bushings and a gantry. */
export function transformerYard(pc: PixelCanvas, x: number, baseY: number, n: number, gantry = true) {
  for (let i = 0; i < n; i++) {
    const tx = x + i * 12;
    pc.rect(tx, baseY - 9, 9, 9, C.ink5);
    for (let k = 1; k < 9; k += 2) pc.vline(tx + k, baseY - 8, 7, C.ink4);
    pc.hline(tx, baseY - 9, 9, C.ink7);
    pc.rect(tx + 2, baseY - 13, 1, 4, C.white);
    pc.rect(tx + 6, baseY - 13, 1, 4, C.white);
    pc.set(tx + 2, baseY - 14, C.ink6);
    pc.set(tx + 6, baseY - 14, C.ink6);
  }
  if (gantry) {
    const gw = n * 12;
    pc.vline(x - 1, baseY - 22, 22, C.ink6);
    pc.vline(x + gw - 2, baseY - 22, 22, C.ink6);
    pc.hline(x - 1, baseY - 22, gw, C.ink6);
    for (let xx = x + 2; xx < x + gw - 3; xx += 5) pc.line(xx, baseY - 21, xx + 2, baseY - 15, C.ink7);
  }
}

/** Small boxy rooftop unit with a spinning fan (frame-dependent). */
export function fanUnit(pc: PixelCanvas, x: number, y: number, w: number, f: number) {
  pc.rect(x, y, w, 4, C.ink6);
  pc.hline(x, y, w, C.ink8);
  pc.vline(x + w - 1, y, 4, C.ink5);
  for (let fx = x + 1; fx + 4 <= x + w; fx += 5) {
    pc.rect(fx, y - 2, 4, 2, C.ink3);
    const ph = (f + fx) % 2;
    pc.set(fx + 1 + ph, y - 2, C.ink7);
    pc.set(fx + 2 - ph, y - 1, C.ink7);
  }
}

/** Mechanical-draft cooling cells (a row of boxes with fan stacks). Returns the fan-top points. */
export function coolingCells(pc: PixelCanvas, x: number, baseY: number, cells: number, h: number, f: number): [number, number][] {
  const cw = 14;
  const tops: [number, number][] = [];
  const top = baseY - h;
  pc.rect(x, top, cells * cw, h, C.ink6);
  pc.hline(x, top, cells * cw, C.ink8);
  for (let i = 0; i < cells; i++) {
    const cx = x + i * cw;
    // louvres
    for (let y = top + 3; y < baseY - 1; y += 2) pc.hline(cx + 1, y, cw - 2, C.ink5);
    pc.vline(cx, top, h, C.ink7);
    // fan stack (a short flared cylinder)
    pc.rect(cx + 3, top - 4, 8, 4, C.ink7);
    pc.hline(cx + 2, top - 5, 10, C.ink8);
    pc.vline(cx + 10, top - 4, 4, C.ink5);
    const ph = (f + i) % 2;
    pc.set(cx + 5 + ph * 2, top - 5, C.ink4);
    tops.push([cx + 7, top - 6]);
  }
  facadeShade(pc, x, top, cells * cw, h, C.ink6, C.ink5, 0.5);
  return tops;
}

/** Text width helper re-export (for callers that only import draw). */
export { measureText, drawText };

/** A round puff of steam/smoke/spray (radius 1..6) lit from the upper left. */
export function puffArt(r: number, kind: 'steam' | 'smoke' | 'vapor' | 'mist' | 'exhaust'): PixelCanvas {
  const s = r * 2 + 1;
  const pc = new PixelCanvas(s, s);
  const [hi, mid, lo] =
    kind === 'smoke'
      ? [C.ink8, C.ink7, C.ink6]
      : kind === 'vapor'
        ? [C.ice3, C.ice2, C.ice1]
        : kind === 'mist'
          ? [C.white, C.foam, C.ice2]
          : kind === 'exhaust'
            ? [C.white, C.ink9, C.ink8]
            : [C.white, C.ice3, C.ice2];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x - r;
      const dy = y - r;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.35) continue;
      const l = (-dx - dy) / Math.max(1, r);
      let c = l > 0.5 ? hi : l > -0.5 ? mid : lo;
      if (d > r - 0.6 && r > 1 && bayer(x, y) < 6) continue; // ragged edge
      if (l > 0 && l <= 0.5 && ditherAt(x, y, l * 2)) c = hi;
      pc.set(x, y, c);
    }
  }
  return pc;
}

/**
 * Floodlit surface at night: a dithered wash of lit pixels on whatever is drawn in the rect,
 * strongest at the bottom (lights on the ground pointing up). Goes into the glow canvas.
 */
export function floodWash(pc: PixelCanvas, g: PixelCanvas, x0: number, y0: number, w: number, h: number, strength = 0.45, warm = true) {
  for (let y = y0; y < y0 + h; y++) {
    const t = ((y - y0) / Math.max(1, h)) ** 1.4 * strength;
    for (let x = x0; x < x0 + w; x++) {
      if (!pc.get(x, y) || g.get(x, y)) continue;
      if (bayer(x, y) < t * 16) g.set(x, y, warm ? (t > strength * 0.55 ? C.rck5 : C.rck4) : t > strength * 0.55 ? C.ink7 : C.ink6);
    }
  }
}
