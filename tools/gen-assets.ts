/**
 * Renders the brand assets from the game's own pixel code:
 *   public/favicon.ico, public/icons/*.png (Pixel Earth app icons), public/og-image.png,
 *   public/logo.png, public/globe.png, the desktop app icons in src-tauri/icons/ and the Android app's
 *   launcher and adaptive icons in android/app/src/main/res/.
 * Every size is drawn natively (or scaled by a whole number) so the pixels stay crisp —
 * `tauri icon` would resample with a smoothing filter.
 *
 *   npm run gen:assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWorldMap } from '../src/world/mapData';
import { terrainCanvas } from '../src/render/worldMap/terrain';
import { drawGlobe, drawStars } from '../src/render/globe';
import { C, paletteTable } from '../src/render/palette';
import { bayer, PixelCanvas } from '../src/render/pixels';
import { drawText, measureText } from '../src/render/font';
import { logoCanvas } from '../src/ui/logo';
import { facilityArt, rotorFrames, TURBINE_LAYOUT } from '../src/render/diorama/art';
import { encodePngRgba } from './lib/png';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const TAURI_ICONS = path.join(ROOT, 'src-tauri/icons');
const ANDROID_RES = path.join(ROOT, 'android/app/src/main/res');
fs.mkdirSync(path.join(PUBLIC, 'icons'), { recursive: true });
fs.mkdirSync(TAURI_ICONS, { recursive: true });

const buf = fs.readFileSync(path.join(ROOT, 'src/content/generated/worldmap.bin'));
const lods = decodeWorldMap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const T0 = terrainCanvas(lods[0]);
const T1 = terrainCanvas(lods[1]);

/** Indexed canvas → RGBA, scaled by an integer, transparent where empty (or filled with bg). */
function rgba(pc: PixelCanvas, scale: number): { w: number; h: number; data: Uint8Array } {
  const pal = paletteTable();
  const w = pc.w * scale;
  const h = pc.h * scale;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pc.data[Math.floor(y / scale) * pc.w + Math.floor(x / scale)];
      if (!c) continue;
      const o = (y * w + x) * 4;
      out[o] = pal[c * 4];
      out[o + 1] = pal[c * 4 + 1];
      out[o + 2] = pal[c * 4 + 2];
      out[o + 3] = 255;
    }
  }
  return { w, h, data: out };
}

function pngOf(pc: PixelCanvas, scale: number): Buffer {
  const img = rgba(pc, scale);
  return Buffer.from(encodePngRgba(img.w, img.h, img.data));
}

function writePng(file: string, pc: PixelCanvas, scale: number, dir = PUBLIC): Buffer {
  const png = pngOf(pc, scale);
  fs.writeFileSync(path.join(dir, file), png);
  console.log(`  ${path.relative(ROOT, path.join(dir, file))}  ${pc.w * scale}×${pc.h * scale}`);
  return png;
}

/** Windows .ico holding PNG images (Vista and later). */
function icoOf(entries: [size: number, png: Buffer][]): Buffer {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(([size, png], i) => {
    const o = 6 + i * 16;
    header[o] = size >= 256 ? 0 : size;
    header[o + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(png.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e[1])]);
}

/** macOS .icns holding PNG images, keyed by OSType. */
function icnsOf(entries: [type: string, png: Buffer][]): Buffer {
  const parts = entries.map(([type, png]) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([h, png]);
  });
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii');
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

/** Deep-space background with a dithered gradient and stars. */
function space(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, rounded = 0) {
  const cols = [C.night1, C.night2, C.night3, C.vio0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rounded) {
        const cx = x < rounded ? rounded - x - 0.5 : x >= w - rounded ? x - (w - rounded) + 0.5 : 0;
        const cy = y < rounded ? rounded - y - 0.5 : y >= h - rounded ? y - (h - rounded) + 0.5 : 0;
        if (cx && cy && cx * cx + cy * cy > rounded * rounded) continue;
      }
      const t = (y / Math.max(1, h - 1)) * (cols.length - 1);
      const i = Math.min(cols.length - 2, Math.floor(t));
      const f = t - i;
      pc.set(x0 + x, y0 + y, bayer(x, y) < f * 16 ? cols[i + 1] : cols[i]);
    }
  }
}

// ── Pixel Earth icon ──────────────────────────────────────────────────────────────────────
const VIEW = { lon0: 12, lat0: 16 };
const SUN = { lat: 12, lon: VIEW.lon0 - 48 };

/**
 * bg 'rounded' = full-bleed rounded tile (web/Android), 'mac' = Big Sur-style tile with the
 * standard transparent margin (824/1024), 'square' = full bleed, 'none' = just the globe.
 */
function icon(base: number, opts: { bg: 'rounded' | 'mac' | 'square' | 'none'; r: number }): PixelCanvas {
  const pc = new PixelCanvas(base, base);
  if (opts.bg !== 'none') {
    const inset = opts.bg === 'mac' ? Math.round(base * 0.1) : 0;
    const side = base - inset * 2;
    const radius = opts.bg === 'mac' ? Math.round(side * 0.225) : opts.bg === 'rounded' ? Math.round(base * 0.16) : 0;
    space(pc, inset, inset, side, side, radius);
    const stars = new PixelCanvas(base, base);
    drawStars(stars, 7, Math.round(base * base * 0.006));
    for (let i = 0; i < stars.data.length; i++) if (stars.data[i] && pc.data[i]) pc.data[i] = stars.data[i];
  }
  drawGlobe(pc, { terrain: T0, res: lods[0].res, ...VIEW, cx: base / 2, cy: base / 2, r: opts.r, sun: SUN, lights: true, atmosphere: opts.r >= 8, smooth: true });
  return pc;
}

console.log('icons');
const i16 = icon(16, { bg: 'none', r: 7.5 });
const i32 = icon(32, { bg: 'none', r: 15 });
const i48 = icon(48, { bg: 'none', r: 22.5 });
const png16 = writePng('icons/icon-16.png', i16, 1);
const png32 = writePng('icons/icon-32.png', i32, 1);
const png48 = writePng('icons/icon-48.png', i48, 1);
writePng('icons/apple-touch-icon.png', icon(60, { bg: 'square', r: 23 }), 3);
writePng('icons/icon-192.png', icon(64, { bg: 'rounded', r: 25 }), 3);
writePng('icons/icon-512.png', icon(64, { bg: 'rounded', r: 25 }), 8);
writePng('icons/icon-maskable-512.png', icon(64, { bg: 'square', r: 19 }), 8);

fs.writeFileSync(
  path.join(PUBLIC, 'favicon.ico'),
  icoOf([
    [16, png16],
    [32, png32],
    [48, png48],
  ]),
);
console.log('  public/favicon.ico');

// ── desktop app icons (Tauri) ─────────────────────────────────────────────────────────────
// Small sizes are the bare globe (legible in taskbars and lists); big ones get the space tile.
console.log('desktop icons');
{
  const i24 = icon(24, { bg: 'none', r: 11 });
  const i64 = icon(64, { bg: 'none', r: 30 });
  const tile = icon(64, { bg: 'rounded', r: 25 });
  const mac = icon(64, { bg: 'mac', r: 20 });
  writePng('32x32.png', i32, 1, TAURI_ICONS);
  writePng('64x64.png', i64, 1, TAURI_ICONS);
  writePng('128x128.png', tile, 2, TAURI_ICONS);
  writePng('128x128@2x.png', tile, 4, TAURI_ICONS);
  writePng('icon.png', tile, 8, TAURI_ICONS);
  fs.writeFileSync(
    path.join(TAURI_ICONS, 'icon.ico'),
    icoOf([
      [16, png16],
      [24, pngOf(i24, 1)],
      [32, png32],
      [48, png48],
      [64, pngOf(i64, 1)],
      [256, pngOf(tile, 4)],
    ]),
  );
  console.log('  src-tauri/icons/icon.ico');
  fs.writeFileSync(
    path.join(TAURI_ICONS, 'icon.icns'),
    icnsOf([
      ['icp4', png16],
      ['ic11', png32],
      ['icp5', png32],
      ['ic12', pngOf(i64, 1)],
      ['icp6', pngOf(i64, 1)],
      ['ic07', pngOf(mac, 2)],
      ['ic13', pngOf(mac, 4)],
      ['ic08', pngOf(mac, 4)],
      ['ic14', pngOf(mac, 8)],
      ['ic09', pngOf(mac, 8)],
      ['ic10', pngOf(mac, 16)],
    ]),
  );
  console.log('  src-tauri/icons/icon.icns');
}

// ── Android app icons (the WebView app in android/) ───────────────────────────────────────
// One game pixel per dp where the density allows (mdpi ×1, xhdpi ×2, xxhdpi ×3, xxxhdpi ×4);
// hdpi (×1.5) is drawn natively at its own size instead of being resampled.
if (fs.existsSync(ANDROID_RES)) {
  console.log('android icons');
  const densities: [dir: string, mult: number][] = [
    ['mdpi', 1],
    ['hdpi', 1.5],
    ['xhdpi', 2],
    ['xxhdpi', 3],
    ['xxxhdpi', 4],
  ];
  const dpIcon = (dir: string, file: string, dp: number, mult: number, draw: (base: number) => PixelCanvas) => {
    const whole = Number.isInteger(mult);
    const out = path.join(ANDROID_RES, dir);
    fs.mkdirSync(out, { recursive: true });
    writePng(file, draw(whole ? dp : dp * mult), whole ? mult : 1, out);
  };
  for (const [d, mult] of densities) {
    // legacy launcher icon (48 dp): the rounded space tile
    dpIcon(`mipmap-${d}`, 'ic_launcher.png', 48, mult, (b) => icon(b, { bg: 'rounded', r: b * 0.39 }));
    // adaptive icon layer (82 dp inside the 108 dp canvas): full-bleed tile, globe inside the safe zone
    dpIcon(`mipmap-${d}`, 'ic_maskable.png', 82, mult, (b) => icon(b, { bg: 'square', r: b * 0.3 }));
  }
  writePng('store_icon.png', icon(64, { bg: 'rounded', r: 25 }), 8, path.join(ROOT, 'android'));
}

// ── logo + standalone globe ───────────────────────────────────────────────────────────────
console.log('logo & globe');
writePng('logo.png', logoCanvas(), 4);
{
  const g = new PixelCanvas(180, 180);
  drawGlobe(g, { terrain: T1, res: lods[1].res, lon0: 10, lat0: 18, cx: 90, cy: 90, r: 86, sun: { lat: 14, lon: -30 }, lights: true, atmosphere: true });
  writePng('globe.png', g, 3);
}

// ── Open Graph card (1200×630 = 400×210 × 3) ─────────────────────────────────────────────
console.log('og image');
{
  const W = 400;
  const H = 210;
  const pc = new PixelCanvas(W, H);
  space(pc, 0, 0, W, H);
  drawStars(pc, 42, 160);
  drawGlobe(pc, { terrain: T1, res: lods[1].res, lon0: 8, lat0: 20, cx: 300, cy: 104, r: 86, sun: { lat: 14, lon: -35 }, lights: true, atmosphere: true });
  const logo = logoCanvas();
  pc.blit(logo, 14, 34);
  const lines = ['A COZY-BUT-REAL PIXEL SIM', 'OF THE AI BOOM.', '', 'BUILD POWER, CHIPS & COMPUTE.', 'CLIMB THE KARDASHEV SCALE.'];
  lines.forEach((t, i) => drawText(pc, t, 22, 86 + i * 8, i < 2 ? C.white : C.cyn5));
  // a little campus at dusk along the bottom
  const ground = 200;
  pc.rect(0, ground, 210, H - ground, C.ink2);
  pc.hline(0, ground, 210, C.ink4);
  const dc = facilityArt('datacenter', 'KP');
  const solar = facilityArt('solar', 'KP');
  const wind = facilityArt('wind', 'KP');
  const wx = 128;
  const wy = ground - wind.base[0].h + 1;
  pc.blit(wind.base[0], wx, wy);
  TURBINE_LAYOUT.forEach((tb, i) => pc.blit(rotorFrames(tb.size, tb.col)[(i * 3) % 8], wx + tb.x - tb.size - 1, wy + tb.top - tb.size - 1));
  pc.blit(solar.base[0], 78, ground - solar.base[0].h + 1);
  pc.blit(dc.base[0], 2, ground - dc.base[0].h + 1);
  pc.blit(dc.glow[0], 2, ground - dc.base[0].h + 1);
  // fade the campus strip into the night with a dither
  for (let y = 150; y < ground; y++) for (let x = 0; x < 230; x++) if (pc.get(x, y) && bayer(x, y) < ((ground - y) / 50) * 3) pc.set(x, y, C.night2);
  drawText(pc, 'THEKARDASHEVPROJECT.NETLIFY.APP', W - 6 - measureText('THEKARDASHEVPROJECT.NETLIFY.APP'), H - 9, C.ink7);
  writePng('og-image.png', pc, 3);
}
console.log('done');
