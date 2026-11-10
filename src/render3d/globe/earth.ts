/**
 * The 3D Earth, painted from the game's own world raster (worldmap.bin) in the pixel map's palette: biome ramps,
 * continental shelves in the sea's depth bands, ridged relief, an Arctic ice cap, city lights on the night side,
 * weather (bake.ts) and the atmosphere.
 *
 * Nothing here may shimmer while the globe turns: every edge the shader draws (coasts, the surf line, region
 * borders, the limb) is anti-aliased from its own screen-space derivative, and all fine detail comes from
 * mipmapped textures (never from procedural noise evaluated per pixel), so it fades out smoothly with distance
 * instead of aliasing.
 *
 * Three levels of shader (quality.ts): `high` adds a third octave of detail, fine relief, smooth (bicubic) coasts
 * close up, ripples in the sun's glint, twinkling lights and the towns' glow under cloud; `low` drops the cloud
 * shadows' second lookup. The space views and the website's hero borrow all of it.
 */
import * as THREE from 'three';
import type { MapLod } from '../../world/mapData';
import { BIOME } from '../../content/mapcodes';
import { PALETTE, type ColorKey } from '../../render/palette';
import { quality, type QualityLevel } from '../quality';
import { boxBlur, cityLights, clamp01, cloudNoise, dataTex, detailMaps, fbm3, hash3, noise3, RAD, sstep, WEATHER_WARP, weatherMap } from './bake';

export const R = 100;

/** Unit vector for a longitude/latitude (matches SphereGeometry's uv mapping). */
export function dir(lon: number, lat: number, out = new THREE.Vector3()) {
  const phi = (lon + 180) * RAD, th = (90 - lat) * RAD;
  return out.set(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
}
export function lonLatOf(p: THREE.Vector3): { lon: number; lat: number } {
  const n = p.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, n.y))) / RAD;
  let lon = Math.atan2(n.z, -n.x) / RAD - 180;
  if (lon < -180) lon += 360;
  return { lon, lat };
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const P = (k: ColorKey) => hex(PALETTE[k]);
/** A palette colour as a linear-light GLSL vec3 (the shaders work in linear light). */
function lin(k: ColorKey | string) {
  const c = new THREE.Color(k in PALETTE ? PALETTE[k as ColorKey] : k);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

/**
 * Biome ramps [shadow, base, light] from the pixel map's terrain painter (render/worldMap/terrain.ts), blended
 * smoothly here instead of dithered. The forests sit a step darker than the flat map's and the dry lands a step
 * lighter: seen from space it's that contrast (dark forest, bright desert, white ice) that reads as a planet.
 */
const RAMPS: Record<number, [ColorKey, ColorKey, ColorKey]> = {
  [BIOME.ICE]: ['ice1', 'ice2', 'ice3'],
  [BIOME.TUNDRA]: ['rck4', 'rck5', 'grn5'],
  [BIOME.BOREAL]: ['grn1', 'grn2', 'grn3'],
  [BIOME.TEMPERATE]: ['grn2', 'grn3', 'grn4'],
  [BIOME.GRASS]: ['grn5', 'snd5', 'snd6'],
  [BIOME.DESERT]: ['snd5', 'snd6', 'snd7'],
  [BIOME.SAVANNA]: ['snd4', 'grn5', 'snd6'],
  [BIOME.RAINFOREST]: ['grn1', 'grn2', 'grn3'],
  [BIOME.MOUNTAIN]: ['rck3', 'rck4', 'rck5'],
  [BIOME.ALPINE]: ['rck4', 'rck5', 'rck6'],
  [BIOME.PLATEAU]: ['rck4', 'snd4', 'rck5'],
  [BIOME.WETLAND]: ['grn2', 'cyn2', 'grn4'],
  [BIOME.FARMLAND]: ['grn3', 'grn4', 'grn6'],
  [BIOME.LAKE]: ['sea5', 'sea6', 'sea6'],
  [BIOME.RIVER]: ['sea5', 'sea6', 'sea6'],
};
/** Relief per biome (0..1), before smoothing and the ridges. */
const HEIGHT: Record<number, number> = { [BIOME.MOUNTAIN]: 0.72, [BIOME.ALPINE]: 1, [BIOME.PLATEAU]: 0.42, [BIOME.ICE]: 0.28, [BIOME.TUNDRA]: 0.16, [BIOME.BOREAL]: 0.08 };
/** How much each biome's relief is broken into ridges. */
const RIDGED: Record<number, number> = { [BIOME.MOUNTAIN]: 1, [BIOME.ALPINE]: 1, [BIOME.PLATEAU]: 0.5, [BIOME.TUNDRA]: 0.4 };

export interface EarthTextures {
  /** Land (1) vs sea (0), blurred at twice the raster's size: the shader cuts coasts out of it. */
  land: THREE.DataTexture;
  /** Land albedo (sRGB; sea pixels carry the nearest land colour so a smooth coast never shows sea on land); a = how rugged. */
  color: THREE.DataTexture;
  /** r = continental shelf (sqrt of the blurred land share), g = slow ocean variation, b/a = relief slope. */
  data: THREE.DataTexture;
  region: THREE.DataTexture;
  /** City lights: r = amber, g = white. */
  lights: THREE.DataTexture;
  /** The noise that streams through the weather (r); the shaders threshold it by the climate. */
  clouds: THREE.DataTexture;
  /** The climate, static on the globe: r = how overcast, g/b = a warp for the noise, a = how deep the cloud stands. */
  weather: THREE.DataTexture;
  /** A small tiling noise (four channels) for fine detail; mipmapped, so it fades out with distance. */
  detail: THREE.DataTexture;
  /** Its companion: a tiling ridged height field's slope (r, g) and height (b), and billows (a). */
  relief: THREE.DataTexture;
}

let cached: EarthTextures | null = null;
/** The textures if the globe has built them already (space views borrow the real Earth). */
export const cachedEarthTextures = () => cached;

/**
 * The land field at twice the raster's size, smoothed (three box blurs of the doubled field, worked out straight
 * from the raster: each doubled sample is a fixed mix of four cells per axis), so the coast cut from it is smooth.
 */
function landField(isLand: Uint8Array, W: number, H: number): Uint8Array {
  const W2 = W * 2, H2 = H * 2;
  const tmp = new Uint8Array(W2 * H);
  for (let y = 0; y < H; y++) {
    const r = y * W, o = y * W2;
    for (let k = 0; k < W; k++) {
      const a = isLand[r + (k >= 2 ? k - 2 : k - 2 + W)], b = isLand[r + (k >= 1 ? k - 1 : W - 1)], c = isLand[r + k];
      const d = isLand[r + (k + 1 < W ? k + 1 : 0)], e = isLand[r + (k + 2 < W ? k + 2 : k + 2 - W)];
      tmp[o + k * 2] = a + 9 * b + 13 * c + 4 * d;
      tmp[o + k * 2 + 1] = 4 * b + 13 * c + 9 * d + e;
    }
  }
  const out = new Uint8Array(W2 * H2);
  const s = 255 / 729;
  for (let j = 0; j < H; j++) {
    const a = Math.max(0, j - 2) * W2, b = Math.max(0, j - 1) * W2, c = j * W2, d = Math.min(H - 1, j + 1) * W2, e = Math.min(H - 1, j + 2) * W2;
    const o0 = j * 2 * W2, o1 = o0 + W2;
    for (let x = 0; x < W2; x++) {
      out[o0 + x] = (tmp[a + x] + 9 * tmp[b + x] + 13 * tmp[c + x] + 4 * tmp[d + x]) * s + 0.5;
      out[o1 + x] = (4 * tmp[b + x] + 13 * tmp[c + x] + 9 * tmp[d + x] + tmp[e + x]) * s + 0.5;
    }
  }
  return out;
}

/** Build the textures once (a second or two on a laptop). Rows run north → south. */
export function earthTextures(lod: MapLod): EarthTextures {
  if (cached) return cached;
  const { W, H } = lod;
  const N = W * H;
  // land, with the Arctic pack ice as land (the pixel map paints it too, with the same wobbly edge)
  const isLand = new Uint8Array(N);
  const ice = new Uint8Array(N);
  const iceLine = new Float32Array(W);
  for (let x = 0; x < W; x++) iceLine[x] = 80.5 + (fbm3(Math.cos(x / W * Math.PI * 2) * 3, 3.3, Math.sin(x / W * Math.PI * 2) * 3, 41, 3) - 0.5) * 8;
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * lod.res;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = lod.biome[i];
      if (b !== BIOME.OCEAN && b !== BIOME.LAKE) isLand[i] = 1;
      else if (b === BIOME.OCEAN && lat > iceLine[x]) { isLand[i] = 1; ice[i] = 1; }
    }
  }

  // relief: biome heights, smoothed into massifs, broken into ridges
  const hgt = new Float32Array(N);
  // (lakes sit at lowland height: as pits they drew a dark ring round every small lake)
  for (let i = 0; i < N; i++) hgt[i] = isLand[i] ? (ice[i] ? 0.12 : HEIGHT[lod.biome[i]] ?? 0.04) : lod.biome[i] === BIOME.LAKE ? 0.04 : 0;
  boxBlur(hgt, W, H, 2, 2);
  const ridge = new Float32Array(N);
  for (let i = 0; i < N; i++) ridge[i] = isLand[i] && !ice[i] ? RIDGED[lod.biome[i]] ?? 0 : 0;
  boxBlur(ridge, W, H, 1, 1);
  // unit vectors per cell (as dir(): trig per row and per column, not per cell)
  const unit = new Float32Array(N * 3);
  const cphi = new Float32Array(W), sphi = new Float32Array(W);
  for (let x = 0; x < W; x++) { const phi = (x + 0.5) * lod.res * RAD; cphi[x] = Math.cos(phi); sphi[x] = Math.sin(phi); }
  for (let y = 0; y < H; y++) {
    const th = (y + 0.5) * lod.res * RAD, st = Math.sin(th), ct = Math.cos(th);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      unit[o] = -cphi[x] * st; unit[o + 1] = ct; unit[o + 2] = sphi[x] * st;
    }
  }
  for (let i = 0; i < N; i++) {
    if (hgt[i] < 0.02) continue;
    const px = unit[i * 3], py = unit[i * 3 + 1], pz = unit[i * 3 + 2];
    // a gentle broad swell and low hills everywhere, ridged noise (~1.4° ridges, with finer spurs) over the ranges
    const sw = noise3(px * 9, py * 9 + 7, pz * 9, 63);
    const rk = ridge[i];
    if (rk < 0.01) { hgt[i] = hgt[i] * (0.7 + sw * 0.6) + (noise3(px * 31, py * 31, pz * 31, 52) - 0.5) * 0.035; continue; }
    const rn = 1 - Math.abs(fbm3(px * 42 + 3, py * 42, pz * 42, 61, 3) * 2 - 1);
    const spur = 1 - Math.abs(noise3(px * 104, py * 104, pz * 104, 83) * 2 - 1);
    hgt[i] *= (1 - rk) * (0.7 + sw * 0.6) + rk * (0.22 + rn * rn * 0.95 + spur * rn * 0.22);
  }
  boxBlur(hgt, W, H, 1, 1);

  // continental shelves: the land share over ~2.5° (the pixel map's shelf field), at half size (it's that smooth)
  const SW = W >> 1, SH = H >> 1;
  const shelf = new Float32Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    let s = 0;
    for (let q = 0; q < 4; q++) { const i = (y * 2 + (q >> 1)) * W + x * 2 + (q & 1); if (isLand[i] && !ice[i]) s++; }
    shelf[y * SW + x] = s / 4;
  }
  boxBlur(shelf, SW, SH, Math.max(1, Math.round(1.25 / lod.res)), 2);
  // slow variation over the open sea (deep currents), on a coarse grid
  const CW = W >> 3, CH = (H >> 3) + 1;
  const coarse = new Float32Array(CW * CH);
  const v = new THREE.Vector3();
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    dir((x / CW) * 360 - 180, 90 - (y / (CH - 1)) * 180, v);
    coarse[y * CW + x] = fbm3(v.x * 5 + 11, v.y * 5, v.z * 5, 71, 3);
  }
  /** Bilinear lookup in one of those grids (it wraps east-west); x, y in its cells. */
  const grid = (g: Float32Array, gw: number, gh: number, x: number, y: number) => {
    const x0f = Math.floor(x), y0 = Math.max(0, Math.min(gh - 2, Math.floor(y))), tx = x - x0f, ty = Math.max(0, Math.min(1, y - y0));
    const x0 = (x0f + gw) % gw, x1 = x0 + 1 === gw ? 0 : x0 + 1;
    const a = g[y0 * gw + x0], b = g[y0 * gw + x1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  const color = new Uint8Array(N * 4);
  const data = new Uint8Array(N * 4);
  const ramps: Record<number, [number, number, number][]> = {};
  for (const k of Object.keys(RAMPS)) ramps[Number(k)] = RAMPS[Number(k)].map(P);
  const fieldCols = (['grn4', 'grn5', 'grn6', 'snd5', 'grn5', 'snd6', 'grn3'] as ColorKey[]).map(P);
  const snow = P('ice3'), snowShade = P('ice1'), river = P('sea5'), rock = P('rck4');
  const olive = hex('#9a9548'), rust = hex('#b8683c'), pale = P('snd8'), pine = P('grn0');
  const GS = 6; // slope → byte
  // ── pass 1: the data texture, and each land cell's base colour from its biome's ramp
  for (let y = 0; y < H; y++) {
    const aLat = Math.abs(90 - (y + 0.5) * lod.res);
    const warm = 1 - sstep(16, 52, aLat);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      // the slope of the relief (east, north), baked so the shader needs one fetch and mipmaps filter it
      const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1, yu = y === 0 ? 0 : y - 1, yd = y === H - 1 ? y : y + 1;
      const gx = (hgt[y * W + xr] - hgt[y * W + xl]) * 0.5, gy = (hgt[yu * W + x] - hgt[yd * W + x]) * 0.5;
      data[o] = Math.round(Math.sqrt(clamp01(grid(shelf, SW, SH, x * 0.5 - 0.25, y * 0.5 - 0.25))) * 255);
      data[o + 2] = Math.round(clamp01(0.5 + gx * GS) * 255);
      data[o + 3] = Math.round(clamp01(0.5 + gy * GS) * 255);
      if (!isLand[i]) {
        // water: alpha 0 (the colour is filled from the land nearby below)
        data[o + 1] = Math.round(clamp01(grid(coarse, CW, CH, (x / W) * CW, (y / (H - 1)) * (CH - 1))) * 255);
        continue;
      }
      data[o + 1] = 128;
      const b = lod.biome[i];
      const px = unit[i * 3], py = unit[i * 3 + 1], pz = unit[i * 3 + 2];
      const ramp = ice[i] ? ramps[BIOME.ICE] : ramps[b] ?? ramps[BIOME.TEMPERATE];
      // broad painterly patches pick the tone along the ramp
      const t = clamp01(fbm3(px * 14, py * 14, pz * 14, 3, 3) * 1.7 - 0.35);
      const lo = t < 0.5 ? 0 : 1;
      const c0 = ramp[lo], c1 = ramp[lo + 1];
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      let r = c0[0] + (c1[0] - c0[0]) * k, g = c0[1] + (c1[1] - c0[1]) * k, bl = c0[2] + (c1[2] - c0[2]) * k;
      // the climate within a biome: slow drifts of hue, so no two countries share one green
      const clim = fbm3(px * 4.5 + 9, py * 4.5, pz * 4.5, 27, 2);
      let tint: [number, number, number] | null = null, tk = 0;
      if (b === BIOME.TEMPERATE || b === BIOME.FARMLAND || b === BIOME.GRASS || b === BIOME.SAVANNA) { tint = olive; tk = warm * (0.1 + clim * 0.3); } // sun-bleached towards the tropics
      else if (b === BIOME.BOREAL) { tint = pine; tk = sstep(52, 68, aLat) * 0.3 + (clim - 0.5) * 0.3; }
      else if (b === BIOME.DESERT) {
        // red deserts and pale ones
        tint = clim > 0.5 ? rust : pale;
        tk = clim > 0.5 ? sstep(0.5, 0.72, clim) * 0.6 : sstep(0.5, 0.3, clim) * 0.4;
      }
      if (tint && tk > 0) { r += (tint[0] - r) * tk; g += (tint[1] - g) * tk; bl += (tint[2] - bl) * tk; }
      color[o] = r; color[o + 1] = g; color[o + 2] = bl; color[o + 3] = 255;
    }
  }
  // ── soften the biomes' edges: two 3×3 passes over the land cells near a change of biome (water stays as it is)
  const soft: number[] = [];
  for (let y = 2; y < H - 2; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = lod.biome[i];
    if (!isLand[i] || b === BIOME.RIVER) continue;
    const l1 = y * W + (x >= 1 ? x - 1 : W - 1), l2 = y * W + (x >= 2 ? x - 2 : x - 2 + W), r1 = y * W + (x + 1 < W ? x + 1 : 0), r2 = y * W + (x + 2 < W ? x + 2 : x + 2 - W);
    if (lod.biome[l1] !== b || lod.biome[r1] !== b || lod.biome[i - W] !== b || lod.biome[i + W] !== b || lod.biome[l2] !== b || lod.biome[r2] !== b || lod.biome[i - 2 * W] !== b || lod.biome[i + 2 * W] !== b) soft.push(i);
  }
  const mixed = new Uint8Array(soft.length * 3);
  for (let pass = 0; pass < 2; pass++) {
    for (let q = 0; q < soft.length; q++) {
      const i = soft[q], x = i % W;
      const xl = x === 0 ? W - 1 : -1, xr = x === W - 1 ? 1 - W : 1;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -W; dy <= W; dy += W) {
        const wy = dy === 0 ? 2 : 1;
        for (let dx = 0; dx < 3; dx++) {
          const j = (i + dy + (dx === 0 ? xl : dx === 1 ? 0 : xr)) * 4;
          if (color[j + 3] < 200) continue;
          const wgt = dx === 1 ? wy * 2 : wy;
          r += color[j] * wgt; g += color[j + 1] * wgt; b += color[j + 2] * wgt; n += wgt;
        }
      }
      mixed[q * 3] = r / n; mixed[q * 3 + 1] = g / n; mixed[q * 3 + 2] = b / n;
    }
    for (let q = 0; q < soft.length; q++) { const o = soft[q] * 4; color[o] = mixed[q * 3]; color[o + 1] = mixed[q * 3 + 1]; color[o + 2] = mixed[q * 3 + 2]; }
  }
  // ── pass 2: what lies on the land (kept crisp: it goes on after the softening)
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * lod.res;
    const polar = sstep(48, 70, Math.abs(lat));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isLand[i]) continue;
      const o = i * 4;
      const b = lod.biome[i], h = hgt[i];
      const px = unit[i * 3], py = unit[i * 3 + 1], pz = unit[i * 3 + 2];
      let r = color[o], g = color[o + 1], bl = color[o + 2];
      if (b === BIOME.FARMLAND) {
        // a hint of patchwork: field colours by blocks, mixed in lightly
        const f = fieldCols[Math.floor(hash3(x >> 1, Math.floor(y / 1.5), 0, 11) * fieldCols.length)];
        r = r * 0.62 + f[0] * 0.38; g = g * 0.62 + f[1] * 0.38; bl = bl * 0.62 + f[2] * 0.38;
      } else if (b === BIOME.DESERT) {
        // dune seas: long east-west streaks
        const dn = fbm3(px * 30, py * 95, pz * 30, 21, 2);
        const lift = (sstep(0.55, 0.7, dn) - sstep(0.25, 0.4, 1 - dn) * 0.6) * 0.1;
        r *= 1 + lift; g *= 1 + lift; bl *= 1 + lift * 0.6;
      }
      // bare rock where the high ground isn't a mountain biome already
      if (h > 0.34 && !ice[i] && b !== BIOME.MOUNTAIN && b !== BIOME.ALPINE && b !== BIOME.ICE) {
        const k = sstep(0.34, 0.6, h) * 0.6;
        r += (rock[0] - r) * k; g += (rock[1] - g) * k; bl += (rock[2] - bl) * k;
      }
      // mottling: two sizes of it
      const m = (noise3(px * 70, py * 70, pz * 70, 9) - 0.5) * 0.18 + (noise3(px * 160, py * 160, pz * 160, 14) - 0.5) * 0.1;
      r *= 1 + m; g *= 1 + m; bl *= 1 + m;
      // snow on the high ranges (and more of it towards the poles)
      const snowAt = 0.9 - polar * 0.3;
      const snowK = ice[i] || h < snowAt - 0.16 ? 0 : sstep(snowAt, snowAt + 0.12, h + (fbm3(px * 60, py * 60, pz * 60, 13, 2) - 0.5) * 0.3);
      if (snowK > 0) {
        const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1, yu = y === 0 ? 0 : y - 1, yd = y === H - 1 ? y : y + 1;
        const sc = hgt[y * W + xr] - hgt[y * W + xl] + hgt[yu * W + x] - hgt[yd * W + x] > 0 ? snowShade : snow;
        r += (sc[0] - r) * snowK; g += (sc[1] - g) * snowK; bl += (sc[2] - bl) * snowK;
      }
      // the valleys a touch darker, the high ground a touch lighter (reads at any distance, whatever the sun)
      const cav = 1 + (h - 0.3) * 0.14;
      color[o] = Math.max(0, Math.min(255, r * cav));
      color[o + 1] = Math.max(0, Math.min(255, g * cav));
      color[o + 2] = Math.max(0, Math.min(255, bl * cav));
      // rivers and inland water in the land layer stay the map's blue
      if (b === BIOME.RIVER) { color[o] = (color[o] + river[0]) / 2; color[o + 1] = (color[o + 1] + river[1]) / 2; color[o + 2] = (color[o + 2] + river[2]) / 2; }
    }
  }
  // spread land colours three cells out over the water (alpha stays low), so a smooth coast or lake shore never
  // shows the water's (empty) colour on land: ring by ring out from the shore
  let ring: number[] = [];
  for (let i = 0; i < N; i++) if (isLand[i]) ring.push(i);
  for (let pass = 0; pass < 3; pass++) {
    const next: number[] = [], cols: number[] = [];
    for (const i of ring) {
      const x = i % W, y = (i / W) | 0;
      for (let q = 0; q < 4; q++) {
        const j = q === 0 ? y * W + (x === W - 1 ? 0 : x + 1) : q === 1 ? y * W + (x === 0 ? W - 1 : x - 1) : q === 2 ? (y === 0 ? i : i - W) : y === H - 1 ? i : i + W;
        if (color[j * 4 + 3] !== 0) continue;
        // the mean of its coloured neighbours (land, or water coloured on an earlier ring)
        const jx = j % W, jy = (j / W) | 0;
        let r = 0, g = 0, b = 0, n = 0;
        for (let p = 0; p < 4; p++) {
          const m = (p === 0 ? jy * W + (jx === W - 1 ? 0 : jx + 1) : p === 1 ? jy * W + (jx === 0 ? W - 1 : jx - 1) : p === 2 ? (jy === 0 ? j : j - W) : jy === H - 1 ? j : j + W) * 4;
          if (color[m + 3] === 255 || color[m + 3] === 1) { r += color[m]; g += color[m + 1]; b += color[m + 2]; n++; }
        }
        color[j * 4 + 3] = 2; // claimed this ring; coloured (alpha 1) once the ring is done
        next.push(j);
        cols.push(r / n, g / n, b / n);
      }
    }
    for (let q = 0; q < next.length; q++) { const o = next[q] * 4; color[o] = cols[q * 3]; color[o + 1] = cols[q * 3 + 1]; color[o + 2] = cols[q * 3 + 2]; color[o + 3] = 1; }
    ring = next;
  }
  // alpha's job is done: it now says how rugged the land is (fine relief in the shader)
  for (let i = 0; i < N; i++) color[i * 4 + 3] = isLand[i] && !ice[i] ? Math.round(clamp01(hgt[i] * 1.2) * 255) : 0;

  // the big textures at full size for the game's map, half size for the coarse one (the website's hero)
  const big = W >= 1440;
  const { detail, relief } = detailMaps();
  cached = {
    land: dataTex(landField(isLand, W, H), W * 2, H * 2, THREE.RedFormat),
    color: dataTex(color, W, H, THREE.RGBAFormat, { srgb: true }),
    data: dataTex(data, W, H, THREE.RGBAFormat),
    region: dataTex(lod.region, W, H, THREE.RedFormat, { nearest: true }),
    lights: cityLights(lod, isLand, big),
    clouds: cloudNoise(big ? 2048 : 1024, big ? 1024 : 512),
    weather: weatherMap(lod),
    detail,
    relief,
  };
  // the globe, the orbit view and space views all borrow these: never freed with a scene
  for (const t of Object.values(cached)) (t as THREE.Texture).userData.shared = true;
  return cached;
}

// ── materials ────────────────────────────────────────────────────────────────────────────────
/** Unit-sphere frame for a surface normal: east (towards higher longitude) and north. */
const FRAME = `
  vec3 eastOf(vec3 n){ vec3 e = vec3(n.z, 0.0, -n.x); float l = length(e); return l > 1e-5 ? e / l : vec3(1.0, 0.0, 0.0); }`;

/**
 * Smooth (B-spline) sampling of a one-channel field in four bilinear taps: contours cut from it are smooth curves,
 * not the little squares a plain bilinear lookup gives when it's magnified.
 */
const BICUBIC = `
  vec4 bsW(float v){ vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v; vec4 s = n * n * n; float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
    return vec4(x, y, z, 6.0 - x - y - z) / 6.0; }
  float bicubicR(sampler2D t, vec2 uv){
    vec2 size = vec2(textureSize(t, 0)); vec2 gx = dFdx(uv), gy = dFdy(uv);
    vec2 p = uv * size - 0.5; vec2 f = fract(p); p -= f;
    vec4 xc = bsW(f.x), yc = bsW(f.y);
    vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
    vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
    vec4 o = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
    float s0 = textureGrad(t, o.xz, gx, gy).r, s1 = textureGrad(t, o.yz, gx, gy).r, s2 = textureGrad(t, o.xw, gx, gy).r, s3 = textureGrad(t, o.yw, gx, gy).r;
    float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
    return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
  }`;

/**
 * The air, shared by the surface, the clouds and the halo so they agree where they meet: sunlight reddening as
 * the sun sinks, and the glow of the limb by height above the ground (in planet radii) and the sun's height there.
 */
const AIR = `
  vec3 sunTint(float dn){ return mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.97, 0.92), smoothstep(-0.06, 0.24, dn)); }
  vec3 airGlow(float dn){
    return mix(vec3(0.72, 0.30, 0.13), vec3(0.30, 0.58, 1.0), smoothstep(-0.03, 0.24, dn)) * smoothstep(-0.2, 0.04, dn);
  }
  // fwd = cos of the angle between the line of sight and the sun
  vec3 haloAt(float h, float dn, float fwd){
    float thin = exp(-h / 0.007), wide = exp(-h / 0.04);
    float dayK = smoothstep(-0.03, 0.24, dn), lit = smoothstep(-0.2, 0.04, dn);
    // by day a bright thin line under a wide soft blue; where the sun is setting the low air burns orange and
    // the high air goes violet
    vec3 c = airGlow(dn) * thin * 0.85 + mix(vec3(0.20, 0.17, 0.40), vec3(0.26, 0.52, 1.0), dayK) * lit * wide * 0.25
      + vec3(0.70, 0.86, 1.0) * thin * thin * dayK * 0.4;
    // looking towards the sun the air lights up: the bright arc of a sunrise seen from orbit
    c *= 1.0 + pow(max(fwd, 0.0), 6.0) * 2.4;
    // the night's airglow: a whisper of green just above the limb
    float g = (h - 0.012) / 0.007;
    return c + vec3(0.010, 0.026, 0.018) * exp(-g * g) * (1.0 - lit);
  }`;

/**
 * The cloud over a point: the climate (static) thresholds the noise streaming through it (it slides east as
 * `cloudShift` runs 0 → 1, one turn of the globe). Returns the density (0.5 = the cloud's soft edge); `deep` =
 * how tall the cloud stands there.
 */
const CLOUD = `
  uniform sampler2D tClouds, tWeather; uniform float cloudShift;
  float cloudAt(vec2 uv, out float deep){
    vec4 w = texture2D(tWeather, uv);
    deep = w.a;
    float nz = texture2D(tClouds, uv + (w.gb - 0.5) * ${WEATHER_WARP.toFixed(3)} + vec2(cloudShift, 0.0)).r;
    return (nz - mix(1.0, 0.12, w.r)) * 2.0 + 0.5;
  }`;

const AMBER = 'vec3(1.0, 0.56, 0.22)', WHITE = 'vec3(1.0, 0.88, 0.70)';

const levelDefines = (level: QualityLevel) => (level === 'high' ? { HQ: '' } : level === 'low' ? { LQ: '' } : {});

export function earthMaterial(t: EarthTextures, W: number, H: number, level: QualityLevel = quality.level) {
  return new THREE.ShaderMaterial({
    defines: levelDefines(level),
    uniforms: {
      tLand: { value: t.land }, tColor: { value: t.color }, tData: { value: t.data }, tRegion: { value: t.region }, tLights: { value: t.lights },
      tClouds: { value: t.clouds }, tWeather: { value: t.weather }, tDetail: { value: t.detail }, tRelief: { value: t.relief },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 }, texel: { value: new THREE.Vector2(1 / W, 1 / H) },
      hoverCode: { value: -1 }, selCode: { value: -1 }, time: { value: 0 }, nightLights: { value: 1 }, cloudShadow: { value: 1 },
      // set when any regionTint has alpha (the globe does it each frame), so other pixels skip the region lookups
      tintOn: { value: 0 },
      regionTint: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) }, haze: { value: new THREE.Vector4(1, 0.55, 0.3, 0) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){ vUv = vec2(uv.x, 1.0 - uv.y); vN = normalize(position);
        // the camera in the sphere's own space (space views turn and move their Earth)
        vec3 cam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vView = cam - position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tLand, tColor, tData, tRegion, tLights, tDetail, tRelief; uniform vec3 sunDir; uniform float hoverCode, selCode, time, nightLights, cloudShadow, tintOn;
      uniform vec2 texel; uniform vec4 regionTint[16]; uniform vec4 haze;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      ${FRAME}
      ${BICUBIC}
      ${AIR}
      ${CLOUD}
      // the region code of a raster cell (wraps east-west)
      float codeAt(ivec2 p, ivec2 sz){ p.x = p.x < 0 ? p.x + sz.x : (p.x >= sz.x ? p.x - sz.x : p.x); p.y = clamp(p.y, 0, sz.y - 1);
        return floor(texelFetch(tRegion, p, 0).r * 255.0 + 0.5); }
      vec4 tintOf(float c){ vec4 t = c < 16.0 ? regionTint[int(c)] : vec4(0.0); return vec4(t.rgb * t.a, t.a); }
      // an anti-aliased step: 0 → 1 as e crosses 0, about a pixel wide whatever the zoom
      float aaStep(float e){ return clamp(e / max(fwidth(e), 1e-5) * 0.85 + 0.5, 0.0, 1.0); }
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(vView);
        float nv = dot(n, V), nvc = max(nv, 0.0);
        float dn = dot(n, sunDir);
        // fine detail from the tiling noise (mipmapped: it fades to grey with distance instead of aliasing)
        vec4 d1 = texture2D(tDetail, vUv * vec2(40.0, 20.0));
        vec4 d2 = texture2D(tDetail, vUv * vec2(152.0, 76.0) + 0.37);
        #ifdef HQ
          vec4 d3 = texture2D(tDetail, vUv * vec2(608.0, 304.0) + 0.71);
        #else
          vec4 d3 = vec4(0.5);
        #endif
        // organic biome edges: look the colour up through a little warp
        vec2 warp = ((d1.rg - 0.5) * 2.2 + (d2.rg - 0.5) * 0.6 + (d3.rg - 0.5) * 0.16) * texel;
        vec4 col = texture2D(tColor, vUv + warp);
        vec4 dat = texture2D(tData, vUv + warp * 0.5);
        // the coast: cut out of the blurred land field, wiggled by the detail, anti-aliased
        #ifdef HQ
          float lf = bicubicR(tLand, vUv);
        #else
          float lf = texture2D(tLand, vUv).r;
        #endif
        float e = lf - (0.5 + (d1.b - 0.5) * 0.3 + (d2.b - 0.5) * 0.24 + (d3.b - 0.5) * 0.1);
        float land = aaStep(e);
        // ── the sea: the pixel map's depth bands, blended
        float shelf = dat.r * dat.r;
        vec3 sea = ${lin('sea1')};
        sea = mix(sea, ${lin('sea2')}, smoothstep(0.012, 0.05, shelf));
        sea = mix(sea, ${lin('sea3')}, smoothstep(0.07, 0.13, shelf));
        sea = mix(sea, ${lin('sea4')}, smoothstep(0.2, 0.32, shelf) * 0.85);
        sea = mix(sea, ${lin('sea5')}, smoothstep(0.42, 0.6, shelf) * 0.7);
        // warm seas lean teal, cold ones steel; slow currents mottle both
        sea *= mix(vec3(0.84, 1.07, 1.02), vec3(1.0, 0.98, 1.04), smoothstep(0.25, 0.75, abs(n.y)));
        sea *= 0.84 + dat.g * 0.32;
        // turquoise shallows hugging the coast, and a thin line of surf along it (never wider than a few pixels)
        float sh = smoothstep(-0.5, 0.02, e);
        sea = mix(sea, ${lin('#3fa9b4')}, sh * sh * sh * (0.2 + shelf * 0.5) * (0.7 + 0.6 * d2.a));
        float surf = aaStep(e + min(0.05, fwidth(e) * 2.0)) * (1.0 - land);
        sea = mix(sea, ${lin('sea8')}, surf * 0.3);
        // ── the land, with a pale strand along its shores (not the ice's)
        vec3 ground = col.rgb * (0.95 + (d1.a - 0.5) * 0.14 + (d2.a - 0.5) * 0.12 + (d3.a - 0.5) * 0.1);
        float lum = dot(col.rgb, vec3(0.3, 0.6, 0.1));
        ground = mix(ground, ${lin('snd7')}, (1.0 - smoothstep(0.0, 0.05, e)) * 0.2 * (1.0 - smoothstep(0.3, 0.55, lum)));
        vec3 alb = mix(sea, ground, land);
        // ── regions: province tints (Acts IV–V) and the hovered / selected region, with smooth borders
        bool tints = tintOn > 0.5;
        if (tints || hoverCode > 0.0 || selCode > 0.0) {
          ivec2 sz = textureSize(tRegion, 0);
          vec2 rp = vUv * vec2(sz) - 0.5;
          ivec2 i0 = ivec2(floor(rp));
          vec2 fr = rp - floor(rp);
          float c00 = codeAt(i0, sz), c10 = codeAt(i0 + ivec2(1, 0), sz), c01 = codeAt(i0 + ivec2(0, 1), sz), c11 = codeAt(i0 + ivec2(1, 1), sz);
          vec4 w = vec4((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y), (1.0 - fr.x) * fr.y, fr.x * fr.y);
          if (tints) {
            vec4 tc = tintOf(c00) * w.x + tintOf(c10) * w.y + tintOf(c01) * w.z + tintOf(c11) * w.w;
            if (tc.a > 0.0) alb = mix(alb, tc.rgb / tc.a * (0.85 + (d2.a - 0.5) * 0.2), tc.a * land);
          }
          for (int k = 0; k < 2; k++) {
            float want = k == 0 ? hoverCode : selCode;
            if (want <= 0.0) continue;
            float mf = dot(w, vec4(c00 == want, c10 == want, c01 == want, c11 == want));
            float inside = aaStep(mf - 0.5);
            // a rim just inside the border: a couple of pixels from far out, a thin band close in
            float rim = inside * (1.0 - smoothstep(0.5, 0.5 + max(fwidth(mf) * 2.2, 0.16), mf));
            vec3 tint = k == 1 ? vec3(1.0, 0.80, 0.38) : vec3(1.0, 0.94, 0.80);
            alb = mix(alb, tint, (inside * (k == 1 ? 0.2 : 0.13) + rim * (k == 1 ? 0.85 : 0.6)) * land);
          }
        }
        // ── light: relief, a soft terminator with the sunset's colours along it, the clouds' shadows
        vec3 east = eastOf(n), north = cross(n, east);
        vec2 slope = (dat.ba - 0.5) / 6.0;
        #ifdef HQ
          // fine relief from the tiling slope map, by how rugged the land is here
          vec4 rA = texture2D(tRelief, vUv * vec2(152.0, 76.0) + 0.37);
          vec4 rB = texture2D(tRelief, vUv * vec2(608.0, 304.0) + 0.71);
          slope += ((rA.rg - 0.5) * 0.03 + (rB.rg - 0.5) * 0.014) * (0.1 + col.a * 1.6);
        #endif
        vec3 Nr = normalize(n - (east * slope.x + north * slope.y) * 14.0 * land);
        vec3 sT = sunDir - n * dn;
        // relief is shaded by a light from the sun's side but always low in the sky (like a relief map), so the
        // ranges stand out even under a high sun; near the terminator the real sun rakes them as well
        float sTl = length(sT);
        vec3 Lr = normalize((sTl > 0.05 ? sT / sTl : normalize(north - east)) * 0.8 + n * 0.6);
        float relief = 1.0 + (dot(Nr, Lr) - dot(n, Lr)) * 1.6 + (dot(Nr, sunDir) - dn) / max(dn + 0.25, 0.22) * 0.8 * smoothstep(-0.12, 0.08, dn);
        relief = clamp(relief, 0.3, 1.8);
        // a painted terminator: bright almost to the edge, then a soft fall into the night
        float day = smoothstep(-0.10, 0.26, dn) * (0.8 + 0.2 * clamp(dn, 0.0, 1.0));
        // the cloud above the point the sun shines through
        float cosLat = max(length(n.xz), 0.08);
        vec2 sOff = vec2(dot(sT, east) / (6.2832 * cosLat), -dot(sT, north) / 3.1416) * 0.012;
        float deep;
        float cd = cloudAt(vUv + sOff, deep);
        float shade = 1.0 - smoothstep(0.4, 0.8, cd) * (0.3 + deep * 0.25) * cloudShadow;
        vec3 sunC = sunTint(dn);
        vec3 sky = vec3(0.07, 0.10, 0.19) * smoothstep(-0.2, 0.3, dn);
        // moonlight: the land a shade lighter than the sea, so the night side keeps its shape
        vec3 moon = vec3(0.020, 0.029, 0.064) * (1.0 + land * (0.7 + (relief - 1.0) * 0.6));
        vec3 c = alb * (day * relief * shade * sunC * 1.3 + sky + moon);
        // the sea: a broad sheen and a bright glint where the sun reflects, the sky's reflection towards the limb
        float water = 1.0 - land;
        vec3 Nw = n;
        #ifdef HQ
          // wind on the water: two layers of ripples sliding across each other break the glint up
          vec2 rip = texture2D(tRelief, vUv * vec2(300.0, 150.0) + vec2(time * 0.004, time * 0.002)).rg + texture2D(tRelief, vUv * vec2(532.0, 266.0) - vec2(time * 0.003, -time * 0.005)).rg - 1.0;
          Nw = normalize(n + (east * rip.x + north * rip.y) * 0.2);
        #endif
        float nh = max(dot(Nw, normalize(sunDir + V)), 0.0);
        // calm water mirrors the sun, ruffled water spreads it
        float calm = 0.55 + dat.g * 0.9;
        float glint = pow(nh, 44.0) * 0.14 + pow(nh, 380.0 * calm) * 0.75 * calm + pow(nh, 2400.0) * 1.6;
        c += sunC * vec3(1.0, 0.93, 0.80) * glint * water * smoothstep(0.0, 0.2, dn) * shade;
        c += ${lin('sky3')} * pow(1.0 - nvc, 4.0) * water * day * 0.35;
        // city lights on the night side: amber sodium and white LED, brighter where the lookup shrinks many into one
        float night = 1.0 - smoothstep(-0.15, 0.05, dn);
        vec2 li = texture2D(tLights, vUv).rg;
        float many = clamp(log2(max(abs(dFdx(vUv.x)), abs(dFdy(vUv.x))) * float(textureSize(tLights, 0).x) + 1e-5), 0.0, 2.5);
        vec3 glow = (li.r * ${AMBER} + li.g * ${WHITE}) * (1.0 + many * 0.5);
        #ifdef HQ
          // and they twinkle (close up; from far out the noise averages away)
          glow *= 0.72 + 0.56 * texture2D(tDetail, vUv * vec2(1100.0, 550.0) + vec2(time * 0.011, time * 0.007)).r;
        #endif
        c += glow * land * night * nightLights * 1.5;
        // the air: a veil that thickens towards the limb, blue by day, warm at dusk; waste heat turns it warm,
        // lets it reach further in and washes the land a little
        float od = 1.0 / max(nvc, 0.05) - 1.0;
        float veil = 1.0 - exp(-od * mix(0.075, 0.16, haze.a));
        vec3 air = airGlow(dn);
        air = mix(air, haze.rgb * smoothstep(-0.2, 0.2, dn), haze.a * 0.75);
        c = mix(c, c * vec3(1.12, 0.96, 0.82), haze.a * land * day * 0.6);
        c = c * (1.0 - veil * 0.55) + air * veil * 0.75;
        // the last pixel melts into the halo beyond it, so the limb never stair-steps
        float edge = 1.0 - clamp(nvc / max(fwidth(nv) * 1.5, 1e-4), 0.0, 1.0);
        c = mix(c, haloAt(0.0, dn, -dot(V, sunDir)), edge);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function cloudMaterial(t: EarthTextures, level: QualityLevel = quality.level) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    defines: levelDefines(level),
    uniforms: {
      tClouds: { value: t.clouds }, tWeather: { value: t.weather }, tRelief: { value: t.relief }, tLights: { value: t.lights },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 }, opacity: { value: 0.85 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){ vUv = vec2(uv.x, 1.0 - uv.y); vN = normalize(position);
        vView = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tRelief, tLights; uniform vec3 sunDir; uniform float opacity; varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      ${FRAME}
      ${AIR}
      ${CLOUD}
      void main(){
        float deep;
        float d0 = cloudAt(vUv, deep);
        // clear sky stops here: nothing below can lift it to the cloud's edge
        if (d0 < 0.2) discard;
        // billows from the tiling detail, riding with the cloud (mipmapped: frilly up close, smooth from far out)
        vec2 uv = vUv + vec2(cloudShift, 0.0);
        float bA = texture2D(tRelief, uv * vec2(64.0, 32.0)).a, bB = texture2D(tRelief, uv * vec2(236.0, 118.0) + 0.5).a;
        float d = d0 + (bA - 0.55) * 0.24 + (bB - 0.55) * 0.12;
        // a crisp frilly edge to a thin veil, then thickening slowly to solid cloud (deep weather more so)
        float a = smoothstep(0.42, 0.53, d) * (0.38 + (0.42 + deep * 0.2) * smoothstep(0.5, 1.0, d));
        vec3 n = normalize(vN);
        float dn = dot(n, sunDir);
        // puffy: lit where the cloud thins towards the sun, shaded where it thickens; deep cloud stands taller
        float self = 0.5 + (bA - 0.5) * 0.3 + (bB - 0.5) * 0.2 + (d - 0.55) * 0.7;
        #ifndef LQ
          vec3 east = eastOf(n), north = cross(n, east);
          vec3 sT = sunDir - n * dn;
          vec2 off = vec2(dot(sT, east) / max(length(n.xz), 0.08), -dot(sT, north) * 2.0) * 0.004;
          float deep2;
          self += (d0 - cloudAt(vUv + off, deep2)) * (1.2 + deep * 2.4);
        #endif
        self = clamp(self, 0.0, 1.0);
        // clouds stand in the light a little after the ground below has lost it
        float lit = smoothstep(-0.16, 0.34, dn + 0.03);
        vec3 body = mix(vec3(0.60, 0.68, 0.84) * (1.0 - deep * 0.22), vec3(1.0), self);
        vec3 c = body * sunTint(dn + 0.05) * lit * 1.04 + vec3(0.020, 0.027, 0.052) * (1.0 - lit);
        #ifdef HQ
          // the towns' glow on the cloud's underside
          vec2 li = texture2D(tLights, vUv, 4.0).rg;
          c += (li.r * ${AMBER} + li.g * ${WHITE}) * (1.0 - smoothstep(-0.15, 0.05, dn)) * 0.3;
        #endif
        // edge-on at the limb the shell fades into the air
        a *= smoothstep(0.0, 0.2, dot(n, normalize(vView)));
        gl_FragColor = vec4(c, a * opacity * mix(0.6, 1.0, lit));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The halo round the limb: a back-face shell. Each pixel works out how close its line of sight passes to the
 * planet (in planet radii, from the camera's position) and glows by the air it crosses there (AIR above): a
 * bright thin line, a fainter wide blue, orange where the sun is setting, a whisper of airglow on the night side.
 */
export function atmosphereMaterial(shell = 1.1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, shell: { value: shell } },
    vertexShader: `uniform float shell; varying vec3 vP; varying vec3 vCam;
      void main(){ float pr = length(position) / shell; vP = position / pr; vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz / pr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 sunDir; uniform float shell; varying vec3 vP; varying vec3 vCam;
      ${AIR}
      void main(){
        vec3 rd = normalize(vP - vCam);
        float t = max(-dot(vCam, rd), 0.0);
        vec3 p = vCam + rd * t;
        float b = length(p);
        float h = max(b - 1.0, 0.0);
        vec3 c = haloAt(h, dot(p / max(b, 1e-4), sunDir), dot(rd, sunDir));
        c *= 1.0 - smoothstep((shell - 1.0) * 0.6, shell - 1.0, h);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
