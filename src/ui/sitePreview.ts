/**
 * The little picture of a home site on the New company screen: the place as the globe paints it (the same baked
 * land colours, coast, shelf seas and relief, lit from the upper left like a relief map), about 10° of latitude
 * tall, with a pin on the site. Drawn in 2D from the globe's textures at twice the size it is shown (the cards
 * show it about 300 px wide), with the globe shader's tricks in small: the lookups wander a little so the map's
 * cells never show, and a fine grain breaks the flat colour. Each takes some tens of milliseconds, once: they are
 * drawn ahead, one at a time, while the title screen idles (the foot of this file), and cached.
 */
import type { MapLod } from '../world/mapData';
import { HOME_SITES, siteDef } from '../content/sites';
import { PALETTE } from '../render/palette';
import { cachedEarthTextures, earthTextures, type EarthTextures } from '../render3d/globe/earth';

const cache = new Map<string, string>();

type RGB = [number, number, number];
const rgbOf = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const SEA = (['sea1', 'sea2', 'sea3', 'sea4', 'sea5'] as const).map((k) => rgbOf(PALETTE[k]));
const SHALLOWS = rgbOf('#3fa9b4');
const SURF = rgbOf(PALETTE.sea8);

function sstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Degrees of latitude from the top of the picture to the bottom. */
const SPAN = 10;

function hash(a: number, b: number): number {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1 (a hash on the whole-number grid, eased between). */
function noise(x: number, y: number): number {
  const xi = Math.floor(x) | 0;
  const yi = Math.floor(y) | 0;
  let tx = x - xi;
  let ty = y - yi;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const p = hash(xi, yi);
  const q = hash(xi + 1, yi);
  const r = hash(xi, yi + 1);
  const t = hash(xi + 1, yi + 1);
  return p + (q - p) * tx + (r - p) * ty + (p - q - r + t) * tx * ty;
}

const PREVIEW_W = 288;
const PREVIEW_H = 160;

/** A small smooth map centred on a site, with a pin (a data URL, drawn at twice `w`×`h`: the size it is shown at). */
export function sitePreviewUrl(lod: MapLod, siteId: string, w = PREVIEW_W, h = PREVIEW_H): string {
  const key = `${siteId}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // the globe behind the menu has baked these already (pass the globe's own map: the finest one)
  const url = draw(cachedEarthTextures() ?? earthTextures(lod), siteId, w, h);
  cache.set(key, url);
  return url;
}

function draw(tex: EarthTextures, siteId: string, w: number, h: number): string {
  const site = siteDef(siteId);
  const color = tex.color.image.data as Uint8Array;
  const data = tex.data.image.data as Uint8Array;
  const land = tex.land.image.data as Uint8Array;
  const TW = tex.color.image.width;
  const TH = tex.color.image.height;
  const LW = (TW * 2) | 0;
  const LH = (TH * 2) | 0;
  const res = 360 / TW;
  const W = w * 2;
  const H = h * 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const out = img.data;
  // degrees per picture pixel; east-west widened by the latitude so the shapes keep their proportions
  const dLat = SPAN / H;
  const dLon = dLat / Math.max(0.3, Math.cos((site.lat * Math.PI) / 180));
  // how fast the blurred land field crosses a picture pixel: the coast is cut about one pixel soft
  const aa = Math.max(0.03, (dLat / res) * 0.14);
  const s0 = SEA[0];
  const s1 = SEA[1];
  const s2 = SEA[2];
  const s3 = SEA[3];
  const s4 = SEA[4];
  // (the loop is written flat, without helpers that capture its variables: it runs 180,000 times a picture)
  for (let y = 0; y < H; y++) {
    const fy = (90 - (site.lat + (H / 2 - y - 0.5) * dLat)) / res - 0.5;
    for (let x = 0; x < W; x++) {
      const fx = (site.lon + (x + 0.5 - W / 2) * dLon + 180) / res - 0.5;
      // organic edges: look the colours up through a little wander (in map cells), as the globe's shader does
      const wx = (noise(fx * 0.9 + 17, fy * 0.9) - 0.5) * 1.5 + (noise(fx * 3.1, fy * 3.1 + 9) - 0.5) * 0.5;
      const wy = (noise(fx * 0.9 + 71, fy * 0.9 + 33) - 0.5) * 1.5 + (noise(fx * 3.1 + 5, fy * 3.1 + 41) - 0.5) * 0.5;
      const grain = noise(fx * 7.3, fy * 7.3);
      // the coast, from the blurred land field (twice the map's size), wandering half as far
      let gx = fx * 2 + 0.5 + wx * 0.5;
      let gy = fy * 2 + 0.5 + wy * 0.5;
      // (whole numbers kept as 32-bit integers: the remainder of a float is slow)
      let xf = Math.floor(gx) | 0;
      let y0 = Math.max(0, Math.min(LH - 2, Math.floor(gy) | 0));
      let tx = gx - xf;
      let ty = Math.max(0, Math.min(1, gy - y0));
      let x0 = xf % LW | 0;
      if (x0 < 0) x0 += LW;
      let x1 = x0 + 1 === LW ? 0 : x0 + 1;
      let i00 = y0 * LW + x0;
      let i10 = y0 * LW + x1;
      let i01 = i00 + LW;
      let i11 = i10 + LW;
      let w00 = (1 - tx) * (1 - ty);
      let w10 = tx * (1 - ty);
      let w01 = (1 - tx) * ty;
      let w11 = tx * ty;
      const e = (land[i00] * w00 + land[i10] * w10 + land[i01] * w01 + land[i11] * w11) / 255 - 0.5 + (grain - 0.5) * 0.05;
      const isLand = sstep(-aa, aa, e);
      // everything else at the map's own size: one set of weights for the eight channels
      gx = fx + wx;
      gy = fy + wy;
      xf = Math.floor(gx) | 0;
      y0 = Math.max(0, Math.min(TH - 2, Math.floor(gy) | 0));
      tx = gx - xf;
      ty = Math.max(0, Math.min(1, gy - y0));
      x0 = xf % TW | 0;
      if (x0 < 0) x0 += TW;
      x1 = x0 + 1 === TW ? 0 : x0 + 1;
      i00 = (y0 * TW + x0) * 4;
      i10 = (y0 * TW + x1) * 4;
      i01 = i00 + TW * 4;
      i11 = i10 + TW * 4;
      w00 = (1 - tx) * (1 - ty);
      w10 = tx * (1 - ty);
      w01 = (1 - tx) * ty;
      w11 = tx * ty;
      // the sea: the shelf's depth bands, slow currents, turquoise shallows and a line of surf at the coast
      const sr = (data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11) / 255;
      const shelf = sr * sr;
      let r = s0[0];
      let g = s0[1];
      let b = s0[2];
      let k = sstep(0.012, 0.05, shelf);
      r += (s1[0] - r) * k;
      g += (s1[1] - g) * k;
      b += (s1[2] - b) * k;
      k = sstep(0.07, 0.13, shelf);
      r += (s2[0] - r) * k;
      g += (s2[1] - g) * k;
      b += (s2[2] - b) * k;
      k = sstep(0.2, 0.32, shelf) * 0.85;
      r += (s3[0] - r) * k;
      g += (s3[1] - g) * k;
      b += (s3[2] - b) * k;
      k = sstep(0.42, 0.6, shelf) * 0.7;
      r += (s4[0] - r) * k;
      g += (s4[1] - g) * k;
      b += (s4[2] - b) * k;
      const mottle = 0.86 + ((data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11) / 255) * 0.3 + (grain - 0.5) * 0.05;
      r *= mottle;
      g *= mottle;
      b *= mottle;
      const sh = sstep(-0.5, 0.02, e);
      k = sh * sh * sh * (0.25 + shelf * 0.5);
      r += (SHALLOWS[0] - r) * k;
      g += (SHALLOWS[1] - g) * k;
      b += (SHALLOWS[2] - b) * k;
      k = sstep(-aa * 3, -aa, e) * (1 - isLand) * 0.35;
      r += (SURF[0] - r) * k;
      g += (SURF[1] - g) * k;
      b += (SURF[2] - b) * k;
      if (isLand > 0) {
        // the land: the globe's colour, its relief lit from the north-west (rugged ground, the colour's alpha,
        // gets more of the grain)
        const sx = ((data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11) / 255 - 0.5) / 6;
        const sy = ((data[i00 + 3] * w00 + data[i10 + 3] * w10 + data[i01 + 3] * w01 + data[i11 + 3] * w11) / 255 - 0.5) / 6;
        const rug = (color[i00 + 3] * w00 + color[i10 + 3] * w10 + color[i01 + 3] * w01 + color[i11 + 3] * w11) / 255;
        const relief = Math.max(0.45, Math.min(1.6, 1 + (sx * 0.7 - sy * 0.7) * 16 + (grain - 0.5) * (0.08 + rug * 0.3)));
        r += (Math.min(255, (color[i00] * w00 + color[i10] * w10 + color[i01] * w01 + color[i11] * w11) * relief) - r) * isLand;
        g += (Math.min(255, (color[i00 + 1] * w00 + color[i10 + 1] * w10 + color[i01 + 1] * w01 + color[i11 + 1] * w11) * relief) - g) * isLand;
        b += (Math.min(255, (color[i00 + 2] * w00 + color[i10 + 2] * w10 + color[i01 + 2] * w01 + color[i11 + 2] * w11) * relief) - b) * isLand;
      }
      const o = (y * W + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // a soft fall of light towards the corners, then the pin: a gold dot in a dark ring with a faint halo
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgb(8 8 20 / 0)');
  vg.addColorStop(1, 'rgb(8 8 20 / 0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  const px = W / 2;
  const py = H / 2;
  const u = H / 80;
  const halo = ctx.createRadialGradient(px, py, u * 2, px, py, u * 9);
  halo.addColorStop(0, 'rgb(253 233 164 / 0.4)');
  halo.addColorStop(1, 'rgb(253 233 164 / 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(px - u * 9, py - u * 9, u * 18, u * 18);
  ctx.beginPath();
  ctx.arc(px, py, u * 3.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgb(11 10 18 / 0.85)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, u * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.yel0;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px - u * 0.6, py - u * 0.6, u * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.yel2;
  ctx.fill();
  // (a JPEG: the picture is opaque and soft, and a PNG of it takes five times as long to make and is ten times the size)
  return canvas.toDataURL('image/jpeg', 0.92);
}

// Drawn ahead: once the globe has baked its textures, one preview per idle moment, so the New company screen
// opens without a hitch. (Nothing happens outside a browser, or if the globe never comes up.)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let tries = 0;
  const warm = () => {
    const tex = cachedEarthTextures();
    if (!tex) {
      if (++tries < 20) setTimeout(warm, 1500);
      return;
    }
    const next = HOME_SITES.find((s) => !cache.has(`${s.id}:${PREVIEW_W}x${PREVIEW_H}`));
    if (!next) return;
    try {
      cache.set(`${next.id}:${PREVIEW_W}x${PREVIEW_H}`, draw(tex, next.id, PREVIEW_W, PREVIEW_H));
    } catch {
      return; // no canvas here
    }
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 3000 });
    else setTimeout(warm, 300);
  };
  setTimeout(warm, 2500);
}
