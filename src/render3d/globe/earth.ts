/**
 * The 3D Earth, painted from the game's own world raster (worldmap.bin) in the pixel map's palette: biome ramps,
 * continental shelves in the sea's depth bands, ridged relief, an Arctic ice cap, city lights on the night side,
 * a cloud layer and the atmosphere.
 *
 * Nothing here may shimmer while the globe turns: every edge the shader draws (coasts, the surf line, region
 * borders, cloud edges) is anti-aliased from its own screen-space derivative, and all fine detail comes from
 * mipmapped textures (never from procedural noise evaluated per pixel), so it fades out smoothly with distance
 * instead of aliasing.
 */
import * as THREE from 'three';
import type { MapLod } from '../../world/mapData';
import { BIOME } from '../../content/mapcodes';
import { CITIES } from '../../content/cities';
import { PALETTE, type ColorKey } from '../../render/palette';

export const R = 100;

const RAD = Math.PI / 180;
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
 * smoothly here instead of dithered. A few are a step lighter than the flat map's: the globe is lit, so its
 * colours get shaded on top.
 */
const RAMPS: Record<number, [ColorKey, ColorKey, ColorKey]> = {
  [BIOME.ICE]: ['ice1', 'ice2', 'ice3'],
  [BIOME.TUNDRA]: ['rck4', 'rck5', 'grn5'],
  [BIOME.BOREAL]: ['grn2', 'grn3', 'grn4'],
  [BIOME.TEMPERATE]: ['grn3', 'grn4', 'grn5'],
  [BIOME.GRASS]: ['grn5', 'snd5', 'snd6'],
  [BIOME.DESERT]: ['snd5', 'snd6', 'snd7'],
  [BIOME.SAVANNA]: ['snd4', 'grn5', 'snd6'],
  [BIOME.RAINFOREST]: ['grn2', 'grn3', 'grn4'],
  [BIOME.MOUNTAIN]: ['rck3', 'rck4', 'rck5'],
  [BIOME.ALPINE]: ['rck4', 'rck5', 'rck6'],
  [BIOME.PLATEAU]: ['rck4', 'snd4', 'rck5'],
  [BIOME.WETLAND]: ['grn3', 'cyn2', 'grn4'],
  [BIOME.FARMLAND]: ['grn5', 'grn6', 'grn7'],
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
  /** Land albedo (sRGB); sea pixels carry the nearest land colour so a smooth coast never shows sea on land. */
  color: THREE.DataTexture;
  /** r = continental shelf (sqrt of the blurred land share), g = slow ocean variation, b/a = relief slope. */
  data: THREE.DataTexture;
  region: THREE.DataTexture;
  lights: THREE.CanvasTexture;
  /** Cloud density (r): the shaders cut the cloud edges out of it. */
  clouds: THREE.DataTexture;
  /** A small tiling noise (four channels) for fine detail; mipmapped, so it fades out with distance. */
  detail: THREE.DataTexture;
}

let cached: EarthTextures | null = null;
/** The textures if the globe has built them already (space views borrow the real Earth). */
export const cachedEarthTextures = () => cached;

// ── noise for the bake (3D value noise on the sphere: no seam, no stretching at the poles) ─────
// table-driven and closure-free: the bake runs ~80 million of these
const PERM = new Uint8Array(1024);
const VAL = new Float32Array(256);
{
  let sd = 1234567;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 1024; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VAL[i] = r();
}
function hash3(x: number, y: number, z: number, seed: number) {
  return VAL[PERM[PERM[PERM[(x + seed * 59) & 255] + (y & 255)] + (z & 255)]];
}
function noise3(x: number, y: number, z: number, seed: number) {
  // the seed shifts the lattice (decorrelates octaves and fields)
  x += seed * 1.731; y += seed * 2.917; z += seed * 0.613;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const A = PERM[X] + Y, B = PERM[X + 1] + Y;
  const AA = PERM[A] + Z, AB = PERM[A + 1] + Z, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const x00 = VAL[PERM[AA]] + (VAL[PERM[BA]] - VAL[PERM[AA]]) * u;
  const x10 = VAL[PERM[AB]] + (VAL[PERM[BB]] - VAL[PERM[AB]]) * u;
  const x01 = VAL[PERM[AA + 1]] + (VAL[PERM[BA + 1]] - VAL[PERM[AA + 1]]) * u;
  const x11 = VAL[PERM[AB + 1]] + (VAL[PERM[BB + 1]] - VAL[PERM[AB + 1]]) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm3(x: number, y: number, z: number, seed: number, oct: number) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 31); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Separable box blur (wraps east-west, clamps at the poles), `passes` times. Row-major throughout (cache-friendly). */
function boxBlur(a: Float32Array, W: number, H: number, r: number, passes: number) {
  const tmp = new Float32Array(W * H);
  const col = new Float32Array(W);
  const norm = 1 / (2 * r + 1);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[row + ((k + W) % W)];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = sum * norm;
        let xa = x + r + 1, xs = x - r;
        if (xa >= W) xa -= W;
        if (xs < 0) xs += W;
        sum += a[row + xa] - a[row + xs];
      }
    }
    // vertical: a running sum per column, walking down the rows
    col.fill(0);
    for (let k = -r; k <= r; k++) { const row = Math.max(0, Math.min(H - 1, k)) * W; for (let x = 0; x < W; x++) col[x] += tmp[row + x]; }
    for (let y = 0; y < H; y++) {
      const row = y * W, add = Math.min(H - 1, y + r + 1) * W, sub = Math.max(0, y - r) * W;
      for (let x = 0; x < W; x++) {
        a[row + x] = col[x] * norm;
        col[x] += tmp[add + x] - tmp[sub + x];
      }
    }
  }
}

/** Build the textures once (well under a second on a laptop). Rows run north → south. */
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
  for (let i = 0; i < N; i++) hgt[i] = isLand[i] ? (ice[i] ? 0.12 : HEIGHT[lod.biome[i]] ?? 0.04) : 0;
  boxBlur(hgt, W, H, 2, 2);
  const ridge = new Float32Array(N);
  for (let i = 0; i < N; i++) ridge[i] = isLand[i] && !ice[i] ? RIDGED[lod.biome[i]] ?? 0 : 0;
  boxBlur(ridge, W, H, 1, 1);
  // unit vectors per cell (as dir(): trig per row and per column, not per cell)
  const unit = new Float32Array(N * 3);
  const v = new THREE.Vector3();
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
    // a gentle broad swell, and ridged noise (~1.4° ridges) over the ranges
    const sw = noise3(px * 9, py * 9 + 7, pz * 9, 63);
    const rk = ridge[i];
    if (rk < 0.01) { hgt[i] *= 0.7 + sw * 0.6; continue; }
    const rn = 1 - Math.abs(fbm3(px * 42 + 3, py * 42, pz * 42, 61, 3) * 2 - 1);
    hgt[i] *= (1 - rk) * (0.7 + sw * 0.6) + rk * (0.25 + rn * rn * 1.05);
  }
  boxBlur(hgt, W, H, 1, 1);

  // continental shelves: the land share over ~2.5° (the pixel map's shelf field)
  const shelf = new Float32Array(N);
  for (let i = 0; i < N; i++) shelf[i] = isLand[i] && !ice[i] ? 1 : 0;
  boxBlur(shelf, W, H, Math.max(2, Math.round(2.5 / lod.res)), 2);

  // slow variation over the open sea (deep currents), on a coarse grid and interpolated
  const CW = W >> 3, CH = (H >> 3) + 1;
  const coarse = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    dir((x / CW) * 360 - 180, 90 - (y / (CH - 1)) * 180, v);
    coarse[y * CW + x] = fbm3(v.x * 5 + 11, v.y * 5, v.z * 5, 71, 3);
  }
  const oceanVar = (x: number, y: number) => {
    const fx = (x / W) * CW, fy = (y / (H - 1)) * (CH - 1);
    const x0 = Math.floor(fx), y0 = Math.min(CH - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0;
    const a = coarse[y0 * CW + (x0 % CW)], b = coarse[y0 * CW + ((x0 + 1) % CW)], c = coarse[(y0 + 1) * CW + (x0 % CW)], d = coarse[(y0 + 1) * CW + ((x0 + 1) % CW)];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const color = new Uint8Array(N * 4);
  const data = new Uint8Array(N * 4);
  const region = new Uint8Array(N);
  const ramps: Record<number, [number, number, number][]> = {};
  for (const k of Object.keys(RAMPS)) ramps[Number(k)] = RAMPS[Number(k)].map(P);
  const fieldCols = (['grn5', 'grn6', 'grn7', 'snd6', 'grn6', 'snd7', 'grn4'] as ColorKey[]).map(P);
  const snow = P('ice3'), snowShade = P('ice1'), river = P('sea5');
  const GS = 6; // slope → byte
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * lod.res;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const b = lod.biome[i];
      region[i] = lod.region[i];
      const px = unit[i * 3], py = unit[i * 3 + 1], pz = unit[i * 3 + 2];
      // the slope of the relief (east, north), baked so the shader needs one fetch and mipmaps filter it
      const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1, yu = y === 0 ? 0 : y - 1, yd = y === H - 1 ? y : y + 1;
      const gx = (hgt[y * W + xr] - hgt[y * W + xl]) * 0.5, gy = (hgt[yu * W + x] - hgt[yd * W + x]) * 0.5;
      data[o] = Math.round(Math.sqrt(clamp01(shelf[i])) * 255);
      data[o + 1] = Math.round(clamp01(oceanVar(x, y)) * 255);
      data[o + 2] = Math.round(clamp01(0.5 + gx * GS) * 255);
      data[o + 3] = Math.round(clamp01(0.5 + gy * GS) * 255);
      if (!isLand[i]) {
        // water: alpha 0 (the colour is filled from the land nearby below)
        color[o + 3] = 0;
        continue;
      }
      const ramp = ice[i] ? ramps[BIOME.ICE] : ramps[b] ?? ramps[BIOME.TEMPERATE];
      // broad painterly patches pick the tone along the ramp, finer mottling on top
      const t = clamp01(fbm3(px * 14, py * 14, pz * 14, 3, 3) * 1.7 - 0.35);
      const m = (noise3(px * 70, py * 70, pz * 70, 9) - 0.5) * 0.14;
      const lo = t < 0.5 ? 0 : 1;
      const c0 = ramp[lo], c1 = ramp[lo + 1];
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      let r = c0[0] + (c1[0] - c0[0]) * k, g = c0[1] + (c1[1] - c0[1]) * k, bl = c0[2] + (c1[2] - c0[2]) * k;
      if (b === BIOME.FARMLAND) {
        // a hint of patchwork: field colours by blocks, mixed in lightly
        const f = fieldCols[Math.floor(hash3(x >> 1, Math.floor(y / 1.5), 0, 11) * fieldCols.length)];
        r = r * 0.6 + f[0] * 0.4; g = g * 0.6 + f[1] * 0.4; bl = bl * 0.6 + f[2] * 0.4;
      } else if (b === BIOME.DESERT) {
        // dune seas: long east-west streaks
        const dn = fbm3(px * 30, py * 95, pz * 30, 21, 2);
        const lift = (sstep(0.55, 0.7, dn) - sstep(0.25, 0.4, 1 - dn) * 0.6) * 0.1;
        r *= 1 + lift; g *= 1 + lift; bl *= 1 + lift * 0.6;
      }
      r *= 1 + m; g *= 1 + m; bl *= 1 + m;
      // snow on the high ranges (and more of it towards the poles)
      const polar = sstep(48, 70, Math.abs(lat));
      const snowAt = 0.9 - polar * 0.3;
      const snowK = ice[i] || hgt[i] < snowAt - 0.16 ? 0 : sstep(snowAt, snowAt + 0.12, hgt[i] + (fbm3(px * 60, py * 60, pz * 60, 13, 2) - 0.5) * 0.3);
      if (snowK > 0) {
        const sc = gx + gy > 0 ? snowShade : snow;
        r += (sc[0] - r) * snowK; g += (sc[1] - g) * snowK; bl += (sc[2] - bl) * snowK;
      }
      // the valleys a touch darker, the high ground a touch lighter (reads at any distance, whatever the sun)
      const cav = 1 + (hgt[i] - 0.3) * 0.12;
      color[o] = Math.max(0, Math.min(255, r * cav));
      color[o + 1] = Math.max(0, Math.min(255, g * cav));
      color[o + 2] = Math.max(0, Math.min(255, bl * cav));
      color[o + 3] = 255;
      // rivers and inland water in the land layer stay the map's blue
      if (b === BIOME.RIVER) { color[o] = (color[o] + river[0]) / 2; color[o + 1] = (color[o + 1] + river[1]) / 2; color[o + 2] = (color[o + 2] + river[2]) / 2; }
    }
  }
  // soften biome edges: two 3×3 passes over the land colours (water stays as it is)
  for (let pass = 0; pass < 2; pass++) {
    const src = color.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] < 200 || lod.biome[y * W + x] === BIOME.RIVER) continue;
      let r = 0, g2 = 0, b = 0, n = 0;
      const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = 0; dx < 3; dx++) {
        const j = ((y + dy) * W + (dx === 0 ? xl : dx === 1 ? x : xr)) * 4;
        if (src[j + 3] < 200) continue;
        const wgt = dx === 1 && dy === 0 ? 4 : dx === 1 || dy === 0 ? 2 : 1;
        r += src[j] * wgt; g2 += src[j + 1] * wgt; b += src[j + 2] * wgt; n += wgt;
      }
      color[i] = r / n; color[i + 1] = g2 / n; color[i + 2] = b / n;
    }
  }
  // spread land colours a few pixels out to sea (alpha stays low), so a smooth coast never shows sea colour on land
  const iceRows = Math.ceil((90 - 75) / lod.res);
  for (let pass = 0; pass < 3; pass++) {
    const src = color.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] > 200 || (lod.coast[y * W + x] > 4 && y > iceRows)) continue;
      let r = 0, g2 = 0, b = 0, n = 0;
      const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1, yu = y === 0 ? 0 : y - 1, yd = y === H - 1 ? y : y + 1;
      for (let q = 0; q < 4; q++) {
        const j = (q === 0 ? y * W + xr : q === 1 ? y * W + xl : q === 2 ? yu * W + x : yd * W + x) * 4;
        if (src[j + 3] > 200 || (pass > 0 && src[j + 3] === 1)) { r += src[j]; g2 += src[j + 1]; b += src[j + 2]; n++; }
      }
      if (n) { color[i] = r / n; color[i + 1] = g2 / n; color[i + 2] = b / n; color[i + 3] = 1; }
    }
  }
  const tex = (arr: Uint8Array, w: number, h: number, fmt: THREE.PixelFormat, srgb: boolean, nearest = false, wrapT: THREE.Wrapping = THREE.ClampToEdgeWrapping) => {
    const t = new THREE.DataTexture(arr, w, h, fmt);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = wrapT;
    t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = !nearest;
    t.anisotropy = nearest ? 1 : 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  // the land field: 2x, a few box-blur passes, so the coastline the shader cuts out of it is smooth
  const W2 = W * 2, H2 = H * 2;
  const f = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) f[y * W2 + x] = isLand[(y >> 1) * W + (x >> 1)];
  boxBlur(f, W2, H2, 1, 3);
  const land8 = new Uint8Array(W2 * H2);
  for (let i = 0; i < f.length; i++) land8[i] = Math.round(f[i] * 255);
  cached = {
    land: tex(land8, W2, H2, THREE.RedFormat, false),
    color: tex(color, W, H, THREE.RGBAFormat, true),
    data: tex(data, W, H, THREE.RGBAFormat, false),
    region: tex(region, W, H, THREE.RedFormat, false, true),
    lights: cityLights(),
    clouds: cloudMap(),
    detail: detailMap(),
  };
  // the globe, the orbit view and space views all borrow these: never freed with a scene
  for (const t of Object.values(cached)) (t as THREE.Texture).userData.shared = true;
  return cached;
}

/** City lights: a glow per city, a scatter of towns round each. */
function cityLights(): THREE.CanvasTexture {
  const w = 2048, h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const px = (lon: number, lat: number) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h] as const;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // a soft dot for the towns (drawn scaled; never single hard pixels)
  const dot = document.createElement('canvas');
  dot.width = dot.height = 16;
  const dg = dot.getContext('2d')!;
  const dgr = dg.createRadialGradient(8, 8, 0, 8, 8, 8);
  dgr.addColorStop(0, 'rgba(255,214,156,1)');
  dgr.addColorStop(1, 'rgba(255,200,140,0)');
  dg.fillStyle = dgr;
  dg.fillRect(0, 0, 16, 16);
  for (const [lat, lon, size] of CITIES) {
    const [x, y] = px(lon, lat);
    const r = 1.1 + size * 0.8;
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    grd.addColorStop(0, `rgba(255,232,190,${0.6 + size * 0.12})`);
    grd.addColorStop(0.45, 'rgba(255,196,128,0.22)');
    grd.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = grd;
    g.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    // suburbs and towns around it, thinning out (soft dots, never single hard pixels)
    for (let k = 0; k < 14 + size * 18; k++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.6) * (3 + size * 4);
      const tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d * 0.8, tr = 0.9 + rnd() * 0.9;
      g.globalAlpha = 0.25 + rnd() * 0.4;
      g.drawImage(dot, tx - tr, ty - tr, tr * 2, tr * 2);
      g.globalAlpha = 1;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  return t;
}

/**
 * The cloud field as a smooth density (the shaders cut the edges out of it, so they stay crisp and
 * anti-aliased at any zoom): billowy clusters from 3D noise on the sphere, thicker along the storm tracks.
 */
function cloudMap(): THREE.DataTexture {
  const w = 1024, h = 512;
  const arr = new Uint8Array(w * h);
  // the swirl is slow: work it out on a coarse grid and interpolate
  const G = 4, gw = w / G, gh = h / G + 1;
  const wxG = new Float32Array(gw * gh), wzG = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const lat = 90 - Math.min(1, (y * G) / h) * 180;
    for (let x = 0; x < gw; x++) {
      const lon = ((x * G) / w) * 360 - 180;
      const px = Math.cos(lat * RAD) * Math.cos(lon * RAD), pz = Math.cos(lat * RAD) * Math.sin(lon * RAD), py = Math.sin(lat * RAD);
      wxG[y * gw + x] = fbm3(px * 2 + 7, py * 2, pz * 2, 3, 2) - 0.5;
      wzG[y * gw + x] = fbm3(px * 2, py * 2 + 5, pz * 2, 4, 2) - 0.5;
    }
  }
  const lerpG = (g: Float32Array, x: number, y: number) => {
    const fx = x / G, fy = y / G, x0 = Math.floor(fx), y0 = Math.min(gh - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0;
    const x1 = (x0 + 1) % gw;
    const a = g[y0 * gw + x0], b = g[y0 * gw + x1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    const cl = Math.cos(lat * RAD), sl = Math.sin(lat * RAD);
    // the trade-wind belts are clearer, the storm tracks and the tropics' convection cloudier
    const belt = 0.46 + 0.16 * Math.cos(lat * RAD * 4) + (Math.abs(lat) > 68 ? 0.08 : 0);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * 360 - 180;
      const px = cl * Math.cos(lon * RAD), pz = cl * Math.sin(lon * RAD), py = sl;
      // a warp makes the clusters swirl a little
      const wx = lerpG(wxG, x + 0.5, y + 0.5), wz = lerpG(wzG, x + 0.5, y + 0.5);
      const base = fbm3(px * 3.2 + wx, py * 3.2, pz * 3.2 + wz, 5, 4);
      const puff = fbm3(px * 11 + wx * 2, py * 11, pz * 11 + wz * 2, 9, 3);
      const v = base * 0.6 + puff * 0.4 * (0.35 + 0.65 * sstep(0.38, 0.62, base));
      // 0.5 = the old cloud edge; the shaders' edge sits a little above it
      arr[y * w + x] = Math.round(clamp01((v * belt * 1.9 - 0.56) * 2.4 + 0.5) * 255);
    }
  }
  const t = new THREE.DataTexture(arr, w, h, THREE.RedFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Tiling value noise (period in cells), four channels of fbm: the shader's fine detail. */
function detailMap(): THREE.DataTexture {
  const n = 256;
  const arr = new Uint8Array(n * n * 4);
  const lat = (x: number, y: number, p: number, s: number) => hash3(((x % p) + p) % p, ((y % p) + p) % p, 0, s);
  const vn = (x: number, y: number, p: number, s: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = lat(xi, yi, p, s), b = lat(xi + 1, yi, p, s), c = lat(xi, yi + 1, p, s), d = lat(xi + 1, yi + 1, p, s);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    for (let ch = 0; ch < 4; ch++) {
      let s = 0, a = 0.5, tot = 0;
      for (let o = 0; o < 4; o++) {
        const p = 8 << o;
        s += a * vn((x / n) * p, (y / n) * p, p, ch * 13 + o * 7 + 1);
        tot += a;
        a *= 0.5;
      }
      arr[(y * n + x) * 4 + ch] = Math.round(clamp01(0.5 + (s / tot - 0.5) * 1.6) * 255);
    }
  }
  const t = new THREE.DataTexture(arr, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
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

export function earthMaterial(t: EarthTextures, W: number, H: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tLand: { value: t.land }, tColor: { value: t.color }, tData: { value: t.data }, tRegion: { value: t.region }, tLights: { value: t.lights }, tClouds: { value: t.clouds }, tDetail: { value: t.detail },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 }, texel: { value: new THREE.Vector2(1 / W, 1 / H) },
      hoverCode: { value: -1 }, selCode: { value: -1 }, time: { value: 0 }, nightLights: { value: 1 }, cloudShadow: { value: 1 },
      regionTint: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) }, haze: { value: new THREE.Vector4(1, 0.55, 0.3, 0) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main(){ vUv = vec2(uv.x, 1.0 - uv.y); vN = normalize(position);
        // the camera in the sphere's own space (space views turn and move their Earth)
        vec3 cam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vView = cam - position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tLand, tColor, tData, tRegion, tLights, tClouds, tDetail; uniform vec3 sunDir; uniform float cloudShift, hoverCode, selCode, time, nightLights, cloudShadow;
      uniform vec2 texel; uniform vec4 regionTint[16]; uniform vec4 haze;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      ${FRAME}
      // the region code of a raster cell (wraps east-west)
      float codeAt(ivec2 p, ivec2 sz){ p.x = p.x < 0 ? p.x + sz.x : (p.x >= sz.x ? p.x - sz.x : p.x); p.y = clamp(p.y, 0, sz.y - 1);
        return floor(texelFetch(tRegion, p, 0).r * 255.0 + 0.5); }
      vec4 tintOf(float c){ vec4 t = c < 16.0 ? regionTint[int(c)] : vec4(0.0); return vec4(t.rgb * t.a, t.a); }
      // an anti-aliased step: 0 → 1 as e crosses 0, about a pixel wide whatever the zoom
      float aaStep(float e){ return clamp(e / max(fwidth(e), 1e-5) * 0.85 + 0.5, 0.0, 1.0); }
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(vView);
        // fine detail from the tiling noise (mipmapped: it fades to grey with distance instead of aliasing)
        vec4 d1 = texture2D(tDetail, vUv * vec2(40.0, 20.0));
        vec4 d2 = texture2D(tDetail, vUv * vec2(152.0, 76.0) + 0.37);
        // organic biome edges: look the colour up through a little warp
        vec2 warp = ((d1.rg - 0.5) * 2.2 + (d2.rg - 0.5) * 0.6) * texel;
        vec4 col = texture2D(tColor, vUv + warp);
        vec4 dat = texture2D(tData, vUv + warp * 0.5);
        // the coast: cut out of the blurred land field, wiggled by the detail, anti-aliased
        float lf = texture2D(tLand, vUv).r;
        float e = lf - (0.5 + (d1.b - 0.5) * 0.3 + (d2.b - 0.5) * 0.24);
        float land = aaStep(e);
        // ── the sea: the pixel map's depth bands, blended
        float shelf = dat.r * dat.r;
        vec3 sea = ${lin('sea1')};
        sea = mix(sea, ${lin('sea2')}, smoothstep(0.012, 0.05, shelf));
        sea = mix(sea, ${lin('sea3')}, smoothstep(0.07, 0.13, shelf));
        sea = mix(sea, ${lin('sea4')}, smoothstep(0.2, 0.32, shelf) * 0.85);
        sea = mix(sea, ${lin('sea5')}, smoothstep(0.42, 0.6, shelf) * 0.7);
        sea *= 0.86 + dat.g * 0.28;
        // shallows hugging the coast, and a thin surf line along it
        sea = mix(sea, ${lin('sea6')}, smoothstep(-0.3, -0.02, e) * 0.55);
        float surf = aaStep(e + 0.1) * (1.0 - land);
        sea = mix(sea, ${lin('sea7')}, surf * 0.6);
        // ── the land
        vec3 ground = col.rgb * (0.96 + (d2.a - 0.5) * 0.1 + (d1.a - 0.5) * 0.12);
        vec3 alb = mix(sea, ground, land);
        // ── regions: province tints (Acts IV–V) and the hovered / selected region, with smooth borders
        bool tints = false;
        for (int i = 0; i < 16; i++) tints = tints || regionTint[i].a > 0.0;
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
            alb = mix(alb, tint, (inside * 0.14 + rim * 0.6) * land);
          }
        }
        // ── light: a soft painted terminator with a warm band, relief, the clouds' shadows
        vec3 east = eastOf(n), north = cross(n, east);
        vec2 slope = (dat.ba - 0.5) / 6.0;
        vec3 Nr = normalize(n - (east * slope.x + north * slope.y) * 14.0 * land);
        float dn = dot(n, sunDir);
        vec3 sT = sunDir - n * dn;
        // relief is shaded by a light from the sun's side but always low in the sky (like a relief map), so the
        // ranges stand out even under a high sun; it only modulates the sunlight
        float sTl = length(sT);
        vec3 Lr = normalize((sTl > 0.05 ? sT / sTl : normalize(north - east)) * 0.8 + n * 0.6);
        float relief = clamp(1.0 + (dot(Nr, Lr) - dot(n, Lr)) * 1.7, 0.4, 1.7);
        // a painted terminator: bright almost to the edge, a narrow warm band, a soft fall into the night
        float day = smoothstep(-0.10, 0.24, dn) * (0.82 + 0.18 * clamp(dn, 0.0, 1.0));
        // the cloud above the point the sun shines through
        float cosLat = max(length(n.xz), 0.08);
        vec2 sOff = vec2(dot(sT, east) / (6.2832 * cosLat), -dot(sT, north) / 3.1416) * 0.012;
        float cd = texture2D(tClouds, vUv + vec2(cloudShift, 0.0) + sOff).r;
        float shade = 1.0 - smoothstep(0.58, 0.74, cd) * 0.42 * cloudShadow;
        vec3 warm = mix(vec3(1.0, 0.62, 0.42), vec3(1.0, 0.97, 0.93), smoothstep(-0.02, 0.2, dn));
        vec3 sky = vec3(0.07, 0.10, 0.19);
        vec3 moon = vec3(0.022, 0.030, 0.070);
        vec3 c = alb * (day * relief * shade * warm * 1.3 + sky * smoothstep(-0.2, 0.3, dn) + moon);
        // the sea: a broad sheen and a bright glint where the sun reflects, the sky's reflection towards the limb
        float nv = max(dot(n, V), 0.0);
        vec3 Hh = normalize(sunDir + V);
        float nh = max(dot(n, Hh), 0.0);
        float water = 1.0 - land;
        c += vec3(1.0, 0.90, 0.74) * (pow(nh, 60.0) * 0.12 + pow(nh, 900.0) * 0.5) * water * smoothstep(0.0, 0.2, dn) * shade;
        c += ${lin('sky3')} * pow(1.0 - nv, 4.0) * water * day * 0.35;
        // city lights on the night side
        float night = 1.0 - smoothstep(-0.16, 0.05, dn);
        float li = texture2D(tLights, vUv).r * land * night * nightLights;
        c += vec3(1.0, 0.66, 0.32) * li * 1.9;
        // the air: a veil that thickens towards the limb, blue by day, warm at dusk; waste heat turns it warm,
        // lets it reach further in and washes the land a little
        float od = 1.0 / max(nv, 0.05) - 1.0;
        float veil = 1.0 - exp(-od * mix(0.075, 0.16, haze.a));
        vec3 air = mix(vec3(0.95, 0.52, 0.42), vec3(0.40, 0.64, 1.0), smoothstep(-0.02, 0.22, dn)) * smoothstep(-0.18, 0.1, dn);
        air = mix(air, haze.rgb * smoothstep(-0.2, 0.2, dn), haze.a * 0.75);
        c = mix(c, c * vec3(1.12, 0.96, 0.82), haze.a * land * day * 0.6);
        c = c * (1.0 - veil * 0.55) + air * veil * 0.75;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function cloudMaterial(t: EarthTextures) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tClouds: { value: t.clouds }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, cloudShift: { value: 0 }, opacity: { value: 0.85 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv = vec2(uv.x, 1.0 - uv.y); vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tClouds; uniform vec3 sunDir; uniform float cloudShift, opacity; varying vec2 vUv; varying vec3 vN;
      ${FRAME}
      ${BICUBIC}
      void main(){
        vec2 uv = vUv + vec2(cloudShift, 0.0);
        float d = bicubicR(tClouds, uv);
        // a crisp, anti-aliased edge with a softer fringe round it
        float fw = max(fwidth(d), 1e-4);
        float core = clamp((d - 0.64) / (fw * 1.2 + 0.08) + 0.5, 0.0, 1.0);
        float a = max(core * (0.78 + 0.18 * smoothstep(0.7, 0.95, d)), smoothstep(0.52, 0.66, d) * 0.18);
        // puffy: lit where the cloud thins towards the sun, shaded where it thickens
        vec3 n = normalize(vN);
        float dn = dot(n, sunDir);
        vec3 east = eastOf(n), north = cross(n, east);
        vec3 sT = sunDir - n * dn;
        vec2 off = vec2(dot(sT, east) / max(length(n.xz), 0.08), -dot(sT, north) * 2.0) * 0.0035;
        float ds = texture2D(tClouds, uv + off).r;
        float lit3 = clamp(0.75 + (d - ds) * 3.0, 0.0, 1.0);
        float lit = smoothstep(-0.16, 0.38, dn);
        vec3 sun = mix(vec3(1.0, 0.60, 0.42), vec3(1.0, 0.99, 0.97), smoothstep(0.0, 0.3, dn));
        vec3 body = mix(vec3(0.70, 0.76, 0.88), vec3(1.0), lit3);
        vec3 c = body * sun * lit * 0.95 + vec3(0.025, 0.03, 0.06) * (1.0 - lit);
        gl_FragColor = vec4(c, a * opacity * (0.3 + 0.7 * lit));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The halo round the limb: a back-face shell. Each pixel works out how close its line of sight passes to the
 * planet (in planet radii, from the camera's position) and glows by the air it crosses there: a bright thin
 * rim, a fainter wide one, blue by day, orange at dusk, nothing on the night side.
 */
export function atmosphereMaterial(shell = 1.1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, shell: { value: shell } },
    vertexShader: `uniform float shell; varying vec3 vP; varying vec3 vCam;
      void main(){ float pr = length(position) / shell; vP = position / pr; vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz / pr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 sunDir; uniform float shell; varying vec3 vP; varying vec3 vCam;
      void main(){
        vec3 rd = normalize(vP - vCam);
        float t = max(-dot(vCam, rd), 0.0);
        vec3 p = vCam + rd * t;
        float b = length(p);
        float h = max(b - 1.0, 0.0);
        float dens = exp(-h / 0.016) * 0.85 + exp(-h / 0.055) * 0.22;
        dens *= 1.0 - smoothstep((shell - 1.0) * 0.7, shell - 1.0, h);
        float dn = dot(p / max(b, 1e-4), sunDir);
        vec3 c = mix(vec3(1.0, 0.42, 0.20), vec3(0.34, 0.60, 1.0), smoothstep(-0.06, 0.3, dn)) * smoothstep(-0.3, 0.06, dn);
        // brighter looking towards the sun (light scattered forwards round the limb)
        c *= 1.0 + pow(max(dot(rd, sunDir), 0.0), 6.0) * 1.2;
        gl_FragColor = vec4(c * dens, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
