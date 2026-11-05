import { C, paletteTable, TRANSPARENT, type ColorKey } from './palette';
import { drawText, measureText } from './font';

/** 4×4 Bayer matrix, values 0..15 — the backbone of every dithered gradient. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];
/** True if a pixel should take the "upper" colour at blend t (0..1). */
export const ditherAt = (x: number, y: number, t: number) => bayer(x, y) < t * 16;

export type Col = number; // palette index (use C.xxx); 0 = transparent

/** Deterministic integer hash → 0..1, for pixel-level variation. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

export function fbm(x: number, y: number, seed = 0, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x * f, y * f, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/**
 * An indexed-colour pixel buffer. All art is drawn into these with palette indices, then
 * baked to RGBA with the current era's palette. Re-baking after an era change recolours it.
 */
export class PixelCanvas {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h);
  }

  static from(rows: string, map: Record<string, ColorKey | null>): PixelCanvas {
    const lines = rows.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim().length > 0);
    const indent = Math.min(...lines.map((l) => l.length - l.trimStart().length));
    const clean = lines.map((l) => l.slice(indent));
    const w = Math.max(...clean.map((l) => l.length));
    const pc = new PixelCanvas(w, clean.length);
    clean.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        const ch = line[x];
        if (ch === '.' || ch === ' ') continue;
        const key = map[ch];
        if (key) pc.set(x, y, C[key]);
      }
    });
    return pc;
  }

  get(x: number, y: number): Col {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return TRANSPARENT;
    return this.data[y * this.w + x];
  }

  set(x: number, y: number, c: Col) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  /** Only paint where something is already drawn. */
  setIfOpaque(x: number, y: number, c: Col) {
    if (this.get(x, y) !== TRANSPARENT) this.set(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: Col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  hline(x: number, y: number, w: number, c: Col) {
    for (let i = 0; i < w; i++) this.set(x + i, y, c);
  }

  vline(x: number, y: number, h: number, c: Col) {
    for (let j = 0; j < h; j++) this.set(x, y + j, c);
  }

  /** Outline rectangle. */
  box(x: number, y: number, w: number, h: number, c: Col) {
    this.hline(x, y, w, c);
    this.hline(x, y + h - 1, w, c);
    this.vline(x, y, h, c);
    this.vline(x + w - 1, y, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Filled ellipse centred on (cx, cy) using pixel-centre sampling. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
  }

  circle(cx: number, cy: number, r: number, c: Col) {
    this.ellipse(cx, cy, r, r, c);
  }

  /** Ring of the given radius (1px). */
  ring(cx: number, cy: number, r: number, c: Col) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d > r - 1) this.set(x, y, c);
      }
    }
  }

  /** Ordered-dither fill: paints pixels whose Bayer value is below level (0..16). */
  dither(x: number, y: number, w: number, h: number, c: Col, level: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(x + i, y + j) < level) this.set(x + i, y + j, c);
  }

  /** Vertical gradient across a list of colours, dithered between bands. */
  vgradient(x: number, y: number, w: number, h: number, cols: Col[]) {
    const n = cols.length - 1;
    for (let j = 0; j < h; j++) {
      const t = (j / Math.max(1, h - 1)) * n;
      const i0 = Math.min(n, Math.floor(t));
      const f = t - i0;
      for (let i = 0; i < w; i++) {
        const c = i0 < n && ditherAt(x + i, y + j, f) ? cols[i0 + 1] : cols[i0];
        this.set(x + i, y + j, c);
      }
    }
  }

  /**
   * A banded vertical gradient: solid bands of each colour with short dithered seams between them
   * (`seam` rows), instead of dithering the whole height. Reads calmer than vgradient at game scale.
   */
  vbands(x: number, y: number, w: number, h: number, cols: Col[], seam = 6) {
    const n = cols.length - 1;
    const band = h / Math.max(1, n);
    const k = Math.min(0.5, seam / 2 / Math.max(1, band));
    for (let j = 0; j < h; j++) {
      const t = (j / Math.max(1, h - 1)) * n;
      const i0 = Math.min(n, Math.floor(t));
      const f = t - i0;
      const g = f < 0.5 - k ? 0 : f > 0.5 + k ? 1 : (f - (0.5 - k)) / (2 * k);
      for (let i = 0; i < w; i++) {
        const c = i0 < n && ditherAt(x + i, y + j, g) ? cols[i0 + 1] : cols[i0];
        this.set(x + i, y + j, c);
      }
    }
  }

  blit(src: PixelCanvas, dx: number, dy: number, flipX = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + (flipX ? src.w - 1 - x : x)];
        if (c !== TRANSPARENT) this.set(dx + x, dy + y, c);
      }
    }
  }

  /** Recolour every pixel of one index to another. */
  replace(from: Col, to: Col) {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === from) this.data[i] = to;
  }

  /** Add a 1px outline around opaque pixels (4-neighbourhood). */
  outline(c: Col, diagonal = false) {
    const src = this.data.slice();
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) !== 0) continue;
        let edge = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
        if (!edge && diagonal) edge = at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1);
        if (edge) this.data[y * this.w + x] = c;
      }
    }
  }

  text(str: string, x: number, y: number, c: Col) {
    drawText(this, str, x, y, c);
  }

  clone(): PixelCanvas {
    const pc = new PixelCanvas(this.w, this.h);
    pc.data.set(this.data);
    return pc;
  }
}

/** Bake an indexed canvas to RGBA pixels using the current era palette. */
export function bakeInto(pc: PixelCanvas, canvas: HTMLCanvasElement | OffscreenCanvas, alpha = 255): void {
  if (canvas.width !== pc.w) canvas.width = pc.w;
  if (canvas.height !== pc.h) canvas.height = pc.h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return;
  const img = ctx.createImageData(pc.w, pc.h);
  const out = img.data;
  const pal = paletteTable();
  const d = pc.data;
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === TRANSPARENT) continue;
    const o = i * 4;
    const p = c * 4;
    out[o] = pal[p];
    out[o + 1] = pal[p + 1];
    out[o + 2] = pal[p + 2];
    out[o + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

export function bake(pc: PixelCanvas): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  bakeInto(pc, canvas);
  return canvas;
}

/** A data: URL for DOM usage (portraits, icons in the UI). */
export function toDataUrl(pc: PixelCanvas): string {
  return bake(pc).toDataURL('image/png');
}

export { measureText };
