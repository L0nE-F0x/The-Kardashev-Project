/**
 * The procedural halves of the Earth's textures, baked once on the CPU: the weather (a static climate the clouds
 * form in, and the noise that streams through it), the city lights and the tiling detail noise. Everything is
 * worked out on the sphere (3D noise), so nothing shows a seam or pinches at the poles.
 */
import * as THREE from 'three';
import type { MapLod } from '../../world/mapData';
import { ANTARCTICA_CODE, BIOME, REGION_IDS, type RegionId } from '../../content/mapcodes';
import { CITIES } from '../../content/cities';

export const RAD = Math.PI / 180;

// ── noise (3D value noise: table-driven and closure-free, the bake runs millions of these) ───────
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
export function hash3(x: number, y: number, z: number, seed: number) {
  return VAL[PERM[PERM[PERM[(x + seed * 59) & 255] + (y & 255)] + (z & 255)]];
}
export function noise3(x: number, y: number, z: number, seed: number) {
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
export function fbm3(x: number, y: number, z: number, seed: number, oct: number) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 31); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Separable box blur (wraps east-west, clamps at the poles), `passes` times. Row-major throughout (cache-friendly). */
export function boxBlur(a: Float32Array, W: number, H: number, r: number, passes: number) {
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

/** A data texture as the Earth's shaders want it: wrapping east-west, mipmapped (or nearest for lookups by code). */
export function dataTex(arr: Uint8Array, w: number, h: number, fmt: THREE.PixelFormat, o: { srgb?: boolean; nearest?: boolean; tile?: boolean; aniso?: number } = {}) {
  const t = new THREE.DataTexture(arr, w, h, fmt);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = o.tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = o.nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = o.nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !o.nearest;
  t.anisotropy = o.nearest ? 1 : o.aniso ?? 8;
  if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Bilinear lookup in a grid that wraps east-west (x in cells, y in cells, clamped at the poles). */
function gridAt(g: Float32Array, gw: number, gh: number, x: number, y: number) {
  const x0f = Math.floor(x), y0 = Math.max(0, Math.min(gh - 2, Math.floor(y)));
  const tx = x - x0f, ty = Math.max(0, Math.min(1, y - y0));
  const x0 = ((x0f % gw) + gw) % gw, x1 = x0 + 1 === gw ? 0 : x0 + 1;
  const a = g[y0 * gw + x0], b = g[y0 * gw + x1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// ── the weather ──────────────────────────────────────────────────────────────────────────────────
/** How much cloud a biome's sky carries (0 dry … 1 wet): deserts stay clear, the rainforests don't. */
const WET: Record<number, number> = {
  [BIOME.OCEAN]: 0.5, [BIOME.LAKE]: 0.5, [BIOME.RIVER]: 0.45, [BIOME.ICE]: 0.4, [BIOME.TUNDRA]: 0.42, [BIOME.BOREAL]: 0.5,
  [BIOME.TEMPERATE]: 0.48, [BIOME.GRASS]: 0.3, [BIOME.DESERT]: 0.0, [BIOME.SAVANNA]: 0.3, [BIOME.RAINFOREST]: 0.9,
  [BIOME.MOUNTAIN]: 0.42, [BIOME.ALPINE]: 0.45, [BIOME.PLATEAU]: 0.18, [BIOME.WETLAND]: 0.6, [BIOME.FARMLAND]: 0.4,
};

/**
 * Storm systems [lon, lat, radius°, tropical]: the lows that march along the storm tracks (a comma of cloud with
 * a long trailing front) and a few tropical cyclones (tight spirals round a clear eye).
 */
const STORMS: [number, number, number, boolean][] = [
  [-30, 55, 15, false], [-150, 51, 14, false], [166, 47, 14, false], [-64, 59, 9, false], [96, 60, 10, false],
  [-136, -52, 15, false], [-84, -58, 12, false], [-24, -50, 15, false], [36, -54, 14, false], [96, -50, 15, false], [152, -56, 13, false], [-172, -44, 10, false],
  [137, 17, 6.5, true], [-53, 22, 6, true], [-117, 15, 5, true], [73, -16, 6, true],
];

const WEATHER_W = 512, WEATHER_H = 256;
/** How far the weather texture's warp channels can push the noise lookup (in uv; ±half of this). */
export const WEATHER_WARP = 0.07;

/**
 * The climate the clouds form in, static on the globe (512 × 256): r = how overcast (the ITCZ, the dry subtropics
 * and deserts, the storm tracks, the storms' spirals), g/b = a warp for the noise lookup (jet-stream meanders, the
 * storms' twist), a = how deep the cloud stands (storms and the tropics tower; the rest is thin).
 */
export function weatherMap(lod: MapLod): THREE.DataTexture {
  const gw = WEATHER_W, gh = WEATHER_H;
  // wetness from the land's biomes on a 2° grid, blurred: the dry air reaches out past the deserts' edges
  const mw = 180, mh = 90, step = Math.round(2 / lod.res);
  const wet = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let s = 0;
    for (let dy = 0; dy < step; dy += 2) for (let dx = 0; dx < step; dx += 2) s += WET[lod.biome[(y * step + dy) * lod.W + x * step + dx]] ?? 0.5;
    wet[y * mw + x] = s / (Math.ceil(step / 2) ** 2);
  }
  boxBlur(wet, mw, mh, 2, 2);
  // the storms' own frames (centre, east, north) for the spirals
  const storms = STORMS.map(([lon, lat, r, tropical]) => {
    const cl = Math.cos(lat * RAD), c = [cl * Math.cos(lon * RAD), Math.sin(lat * RAD), cl * Math.sin(lon * RAD)];
    const el = Math.hypot(c[2], c[0]), e = [-c[2] / el, 0, c[0] / el];
    const n = [c[1] * e[2] - c[2] * e[1], c[2] * e[0] - c[0] * e[2], c[0] * e[1] - c[1] * e[0]];
    return { c, e, n: lat >= 0 ? n : n.map((v) => -v), r: r * RAD, tropical, cosMax: Math.cos(Math.min(3, r * RAD * 2.4)), spin: lat >= 0 ? 1 : -1 };
  });
  const out = new Uint8Array(gw * gh * 4);
  for (let y = 0; y < gh; y++) {
    const lat = 90 - ((y + 0.5) / gh) * 180, aLat = Math.abs(lat);
    const cl = Math.cos(lat * RAD), sl = Math.sin(lat * RAD);
    const dryBelt = Math.exp(-(((aLat - 24) / 9) ** 2)), track = Math.exp(-(((aLat - 52) / 13) ** 2)), polar = sstep(66, 84, aLat);
    for (let x = 0; x < gw; x++) {
      const lon = ((x + 0.5) / gw) * 360 - 180;
      const px = cl * Math.cos(lon * RAD), pz = cl * Math.sin(lon * RAD), py = sl;
      // the ITCZ wanders north and south of the equator as it goes round
      const itcz = Math.exp(-(((lat - 5 - 4 * Math.sin(lon * RAD * 2 + 1)) / 6.5) ** 2));
      const moist = gridAt(wet, mw, mh, ((lon + 180) / 360) * mw - 0.5, ((90 - lat) / 180) * mh - 0.5);
      // weather on top of the climate: big wet and dry patches, and long fronts along the storm tracks
      const big = fbm3(px * 2.4 + 5, py * 2.4, pz * 2.4, 81, 3) - 0.5;
      let cov = 0.33 + 0.34 * itcz - 0.24 * dryBelt + 0.2 * track + 0.1 * polar + (moist - 0.5) * 0.66 + big * 0.9;
      let deep = 0.3 + 0.45 * itcz + 0.2 * track + big * 0.5;
      // jet-stream meanders and eddies: a warp at two sizes
      let wu = (fbm3(px * 3 + 2, py * 3, pz * 3, 91, 2) - 0.5) * 0.05 + (noise3(px * 8, py * 8 + 3, pz * 8, 93) - 0.5) * 0.016;
      let wv = (fbm3(px * 3, py * 3 + 4, pz * 3, 95, 2) - 0.5) * 0.034 + (noise3(px * 8 + 6, py * 8, pz * 8, 97) - 0.5) * 0.012;
      for (const s of storms) {
        const dot = px * s.c[0] + py * s.c[1] + pz * s.c[2];
        if (dot < s.cosMax) continue;
        const d = Math.acos(Math.min(1, dot)), q = d / s.r;
        const ex = px * s.e[0] + pz * s.e[2], ny = px * s.n[0] + py * s.n[1] + pz * s.n[2];
        // one arm winding in (anticlockwise in the north, clockwise in the south: `n` is mirrored there)
        const th = Math.atan2(ny, ex);
        const arm = 0.5 + 0.5 * Math.cos(th + (s.tropical ? 3.4 : 2.6) * Math.log(q + 0.06) + (s.c[0] + s.c[2]) * 5);
        const env = Math.exp(-q * q * (s.tropical ? 1.0 : 0.75));
        const spiral = sstep(0.42, 0.9, arm) * (0.55 + 0.45 * Math.exp(-q * 1.2));
        let want = 0.06 + spiral * 1.0;
        if (s.tropical) want = Math.max(want, Math.exp(-((q / 0.42) ** 2)) * 1.05) * sstep(0.035, 0.1, q); // the overcast heart, the eye
        else want = Math.max(want, Math.exp(-((q / 0.26) ** 2)) * 0.95);
        cov += (want - cov) * env * (s.tropical ? 0.97 : 0.85);
        deep += env * (0.25 + spiral * 0.5);
        // the twist: look the noise up from back round the centre, more so near it, so its streaks wind in with the arm
        const ang = -s.spin * (s.tropical ? 2.0 : 1.1) * Math.exp(-q * 1.5), ca = Math.cos(ang) - 1, sa = Math.sin(ang);
        const rx = px * ca + (s.c[1] * pz - s.c[2] * py) * sa - s.c[0] * dot * ca;
        const ry = py * ca + (s.c[2] * px - s.c[0] * pz) * sa - s.c[1] * dot * ca;
        const rz = pz * ca + (s.c[0] * py - s.c[1] * px) * sa - s.c[2] * dot * ca;
        // that move in longitude / latitude (east = (−z, 0, x) / cos, north = the rest)
        wu += (-rx * pz + rz * px) / Math.max(cl * cl, 0.02) / (2 * Math.PI);
        wv -= (ry * cl - (rx * px + rz * pz) * sl / Math.max(cl, 0.05)) / Math.PI;
      }
      const o = (y * gw + x) * 4;
      out[o] = Math.round(clamp01(cov) * 255);
      out[o + 1] = Math.round(clamp01(0.5 + wu / WEATHER_WARP) * 255);
      out[o + 2] = Math.round(clamp01(0.5 + wv / WEATHER_WARP) * 255);
      out[o + 3] = Math.round(clamp01(deep) * 255);
    }
  }
  return dataTex(out, gw, gh, THREE.RGBAFormat, { aniso: 4 });
}

/**
 * The noise that streams through the weather (it only ever slides east-west, so it tiles round the globe):
 * billows stretched along the wind, leaning into long streaks away from the equator the way fronts trail.
 */
export function cloudNoise(w: number, h: number): THREE.DataTexture {
  const arr = new Uint8Array(w * h);
  const cosL = new Float32Array(w), sinL = new Float32Array(w);
  for (let x = 0; x < w; x++) { const lon = ((x + 0.5) / w) * Math.PI * 2 - Math.PI; cosL[x] = Math.cos(lon); sinL[x] = Math.sin(lon); }
  // the two broad octaves on a half-size grid (interpolated below), the two fine ones per texel
  const lw = w >> 1, lh = (h >> 1) + 1;
  const low = new Float32Array(lw * lh);
  const F = 5.5, SQ = 1.35;
  const frame = (lat: number) => {
    // the lean: features sit further east the further they are from the equator (none on it)
    const a = (Math.sqrt(lat * lat + 14 * 14) - 14) * 0.8 * RAD;
    return { cl: Math.cos(lat * RAD), sl: Math.sin(lat * RAD), ca: Math.cos(a), sa: Math.sin(a) };
  };
  for (let y = 0; y < lh; y++) {
    const f = frame(90 - (y / (lh - 1)) * 180);
    for (let x = 0; x < lw; x++) {
      const c = cosL[x * 2], s = sinL[x * 2];
      const qx = f.cl * (c * f.ca - s * f.sa) * F, qz = f.cl * (s * f.ca + c * f.sa) * F, qy = f.sl * F * SQ;
      const n1 = noise3(qx, qy, qz, 5), n2 = noise3(qx * 2.07, qy * 2.07, qz * 2.07, 36);
      // a ridge through the broadest octave draws filaments rather than blobs
      low[y * lw + x] = (n1 * 0.75 + (1 - Math.abs(n1 * 2 - 1)) * 0.25) * 0.44 + n2 * 0.26;
    }
  }
  for (let y = 0; y < h; y++) {
    const f = frame(90 - ((y + 0.5) / h) * 180);
    const ly = ((y + 0.5) / h) * (lh - 1), ly0 = Math.min(lh - 2, Math.floor(ly)), ty = ly - ly0;
    const r0 = ly0 * lw, r1 = r0 + lw;
    for (let x = 0; x < w; x++) {
      const c = cosL[x], s = sinL[x];
      const qx = f.cl * (c * f.ca - s * f.sa) * F * 4.3, qz = f.cl * (s * f.ca + c * f.sa) * F * 4.3, qy = f.sl * F * SQ * 4.3;
      const lx0 = x >> 1, tx = (x & 1) * 0.5, lx1 = lx0 + 1 === lw ? 0 : lx0 + 1;
      const a0 = low[r0 + lx0] + (low[r0 + lx1] - low[r0 + lx0]) * tx, a1 = low[r1 + lx0] + (low[r1 + lx1] - low[r1 + lx0]) * tx;
      const v = a0 + (a1 - a0) * ty + noise3(qx, qy, qz, 67) * 0.18 + noise3(qx * 2.1, qy * 2.1, qz * 2.1, 98) * 0.12;
      // spread over the whole byte: the shader's threshold then maps evenly to how much sky is covered
      arr[y * w + x] = Math.round(clamp01(0.5 + (v - 0.52) * 2.3) * 255);
    }
  }
  return dataTex(arr, w, h, THREE.RedFormat);
}

// ── city lights ──────────────────────────────────────────────────────────────────────────────────
/** How many people a biome carries (lights per cell, before the region's own weight). */
const SETTLED: Record<number, number> = {
  [BIOME.FARMLAND]: 1, [BIOME.TEMPERATE]: 0.62, [BIOME.RIVER]: 0.9, [BIOME.GRASS]: 0.4, [BIOME.SAVANNA]: 0.3, [BIOME.WETLAND]: 0.26,
  [BIOME.RAINFOREST]: 0.1, [BIOME.PLATEAU]: 0.1, [BIOME.MOUNTAIN]: 0.1, [BIOME.BOREAL]: 0.07, [BIOME.DESERT]: 0.03, [BIOME.ALPINE]: 0.02, [BIOME.TUNDRA]: 0.012,
};
/** Each region's light: how densely it's lit [0], and how much of it is white LED rather than amber sodium [1]. */
const LIT: Record<RegionId, [number, number]> = {
  pac: [0.75, 0.55], atl: [1.05, 0.5], lat: [0.6, 0.3], eur: [1.15, 0.5], nor: [0.6, 0.6], stp: [0.45, 0.3],
  mena: [0.55, 0.4], ssa: [0.3, 0.25], sas: [1.2, 0.25], eam: [1.0, 0.45], fab: [1.3, 0.7], seo: [0.6, 0.4],
};

/**
 * The night side's lights (r = amber, g = white): every metro a bright heart in a thinning sprawl, towns scattered
 * where people live (farmland, river valleys, coasts, near the metros; clumped, never even), and threads of light
 * along the roads between neighbouring cities.
 */
export function cityLights(lod: MapLod, isLand: Uint8Array, big: boolean): THREE.DataTexture {
  const w = big ? 4096 : 2048, h = w >> 1;
  const px = new Uint8ClampedArray(w * h * 2); // clamped: lights pile up where they overlap
  const k = w / 2048; // sizes below are in 2048-wide texels
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const landAt = (lon: number, lat: number) => {
    const x = Math.floor(((lon + 540) % 360) / lod.res), y = Math.floor((90 - lat) / lod.res);
    return y >= 0 && y < lod.H && isLand[y * lod.W + (x % lod.W)] === 1;
  };
  /** A soft dot (sigma in texels) of amber and white light. */
  const gx = new Float32Array(64);
  const dot = (lon: number, lat: number, sigma: number, amber: number, white: number) => {
    const fx = ((lon + 180) / 360) * w - 0.5, fy = ((90 - lat) / 180) * h - 0.5;
    // lights keep their size on the ground: wider in texels towards the poles
    const sx = sigma / Math.max(0.25, Math.cos(lat * RAD));
    const rx = Math.min(31, Math.ceil(sx * 2.4)), ry = Math.ceil(sigma * 2.4);
    const x0 = Math.round(fx), y0 = Math.round(fy);
    for (let dx = -rx; dx <= rx; dx++) { const ex = (x0 + dx - fx) / sx; gx[dx + rx] = Math.exp(-ex * ex * 0.5); }
    for (let dy = -ry; dy <= ry; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= h) continue;
      const ey = (y - fy) / sigma, gy = Math.exp(-ey * ey * 0.5);
      for (let dx = -rx; dx <= rx; dx++) {
        const g = gx[dx + rx] * gy;
        if (g < 0.03) continue;
        const o = (y * w + ((x0 + dx + w) % w)) * 2;
        px[o] += amber * g;
        px[o + 1] += white * g;
      }
    }
  };
  // how near the metros a place is (1° grid): the towns thicken towards them
  const mw = 360, mh = 180;
  const metro = new Float32Array(mw * mh);
  for (const [lat, lon, size] of CITIES) {
    const cx = Math.floor(lon + 180), cy = Math.floor(90 - lat);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -8; dx <= 8; dx++) {
      const y = cy + dy;
      if (y < 0 || y >= mh) continue;
      const d2 = dy * dy + (dx * Math.cos(lat * RAD)) ** 2;
      metro[y * mw + ((cx + dx + mw) % mw)] += size * Math.exp(-d2 / 7);
    }
  }
  // towns: a chance per land cell, by who lives there
  const cells = lod.res * lod.res * 16; // per 0.25° cell
  for (let y = 0; y < lod.H; y++) {
    const lat = 90 - (y + 0.5) * lod.res;
    if (lat > 72 || lat < -56) continue;
    const cl = Math.cos(lat * RAD), sl = Math.sin(lat * RAD);
    for (let x = 0; x < lod.W; x++) {
      const i = y * lod.W + x;
      const settled = SETTLED[lod.biome[i]];
      const code = lod.region[i];
      if (!settled || !isLand[i] || code === 0 || code >= ANTARCTICA_CODE) continue;
      const lit = LIT[REGION_IDS[code - 1]];
      const lon = (x + 0.5) * lod.res - 180;
      const near = metro[Math.floor(90 - lat) * mw + Math.floor(lon + 180)];
      const coast = 1 - sstep(0.3, 1.6, lod.coast[i] * lod.res);
      let lam = settled * lit[0] * (0.2 + Math.min(2.2, near) * 0.9 + coast * 0.5) * cells * cl;
      if (lam < 0.02) continue;
      // clumps: most of the country is dark, the lit parts are busy
      const px3 = cl * Math.cos(lon * RAD) * 55, pz3 = cl * Math.sin(lon * RAD) * 55;
      lam *= 0.15 + 2.4 * sstep(0.46, 0.7, noise3(px3, sl * 55, pz3, 17) * 0.65 + noise3(px3 * 2.3, sl * 126, pz3 * 2.3, 23) * 0.35);
      const tries = Math.ceil(lam);
      for (let n = tries; n > 0; n--) {
        if (rnd() > lam / tries) continue;
        const b = 30 + rnd() * rnd() * 190, white = rnd() < lit[1] ? 0.75 : 0.12;
        dot(lon + (rnd() - 0.5) * lod.res, lat + (rnd() - 0.5) * lod.res, (0.3 + rnd() * 0.22) * k, b * (1 - white), b * white);
      }
    }
  }
  // the metros: a white-hot heart, a glow, and suburbs thinning out along a few arms
  for (const [lat, lon, size] of CITIES) {
    const cl = Math.max(0.3, Math.cos(lat * RAD));
    dot(lon, lat, (0.5 + size * 0.3) * k, 130, 140 + size * 35);
    dot(lon, lat, (1.3 + size * 0.8) * k, 22 + size * 5, 8 + size * 3);
    const arms = 3 + Math.floor(rnd() * 3), a0 = rnd() * 6.28;
    for (let n = 0; n < 40 + size * 55; n++) {
      const arm = a0 + (Math.floor(rnd() * arms) / arms) * 6.28 + (rnd() - 0.5) * 1.1;
      const d = Math.pow(rnd(), 1.7) * (0.5 + size * 0.75);
      const tlon = lon + (Math.cos(arm) * d) / cl, tlat = lat + Math.sin(arm) * d * 0.9;
      if (!landAt(tlon, tlat)) continue;
      const b = 40 + rnd() * 130, white = rnd() < 0.4 ? 0.7 : 0.15;
      dot(tlon, tlat, (0.3 + rnd() * 0.25) * k, b * (1 - white), b * white);
    }
  }
  // roads: dotted threads to each metro's two nearest neighbours (on land; the sea swallows the rest)
  const unit = CITIES.map(([lat, lon]) => { const cl = Math.cos(lat * RAD); return [cl * Math.cos(lon * RAD), Math.sin(lat * RAD), cl * Math.sin(lon * RAD)]; });
  for (let a = 0; a < CITIES.length; a++) {
    const near: [number, number][] = [];
    for (let b = 0; b < CITIES.length; b++) {
      if (a === b) continue;
      const d = unit[a][0] * unit[b][0] + unit[a][1] * unit[b][1] + unit[a][2] * unit[b][2];
      if (d > 0.974) near.push([d, b]); // within ~13°
    }
    near.sort((p, q) => q[0] - p[0]);
    for (const [d, b] of near.slice(0, 2)) {
      if (b < a && near.length > 1) continue; // (the pair's other end draws it too)
      const steps = Math.ceil(Math.acos(d) / (0.11 * RAD));
      const bend = (rnd() - 0.5) * 0.12;
      for (let s = 1; s < steps; s++) {
        if (rnd() < 0.45) continue;
        const t = s / steps, sag = Math.sin(t * Math.PI) * bend;
        const x = unit[a][0] + (unit[b][0] - unit[a][0]) * t + (unit[b][2] - unit[a][2]) * sag;
        const y = unit[a][1] + (unit[b][1] - unit[a][1]) * t;
        const z = unit[a][2] + (unit[b][2] - unit[a][2]) * t - (unit[b][0] - unit[a][0]) * sag;
        const lat = Math.asin(y / Math.hypot(x, y, z)) / RAD, lon = Math.atan2(z, x) / RAD;
        if (landAt(lon, lat)) dot(lon, lat, 0.3 * k, 14 + rnd() * 30, rnd() * 8);
      }
    }
  }
  return dataTex(new Uint8Array(px.buffer), w, h, THREE.RGFormat);
}

/**
 * A tile of pin-point lights (r; g = each one's own number, for its twinkle): close up the shaders break a city's
 * glow into the lamps it's made of, and the Milky Way's haze into stars. Mipmapped: from far out it's an even grey.
 */
export function sparkleMap(): THREE.DataTexture {
  const n = 128;
  const px = new Uint8ClampedArray(n * n * 2);
  let seed = 31;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n * n; i++) px[i * 2 + 1] = hash3((i % n) >> 2, ((i / n) | 0) >> 2, 3, 5) * 255;
  for (let k = 0; k < 420; k++) {
    const cx = rnd() * n, cy = rnd() * n, b = 90 + rnd() * rnd() * 400, s = 0.55 + rnd() * 0.35;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
      const g = Math.exp(-((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (2 * s * s));
      px[((((y % n) + n) % n) * n + (((x % n) + n) % n)) * 2] += b * g;
    }
  }
  return dataTex(new Uint8Array(px.buffer), n, n, THREE.RGFormat, { tile: true, aniso: 4 });
}

// ── tiling detail ────────────────────────────────────────────────────────────────────────────────
/** A tiling fbm (n × n): value noise on wrapping lattices of 8, 16, 32 and 64 cells. */
function tileFbm(n: number, seed: number): Float32Array {
  const out = new Float32Array(n * n);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < 4; o++) {
    const p = 8 << o, cell = n / p;
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = hash3(i % p, (i / p) | 0, o * 7 + 1, seed);
    for (let y = 0; y < n; y++) {
      const fy = y / cell, y0 = Math.floor(fy), v = fy - y0, sv = v * v * (3 - 2 * v), r0 = y0 * p, r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < n; x++) {
        const fx = x / cell, x0 = Math.floor(fx), u = fx - x0, su = u * u * (3 - 2 * u), x1 = (x0 + 1) % p;
        const a = lat[r0 + x0], b = lat[r0 + x1], c = lat[r1 + x0], d = lat[r1 + x1];
        out[y * n + x] += amp * (a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv);
      }
    }
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/**
 * Two small tiling textures for the shaders' fine detail (mipmapped, so it fades out with distance instead of
 * aliasing). `detail`: four independent fbm channels. `relief`: a ridged height field's slope (r, g) and height
 * (b) for fine relief and waves, and billows (a) for the clouds.
 */
export function detailMaps(): { detail: THREE.DataTexture; relief: THREE.DataTexture } {
  const n = 256;
  const a = new Uint8Array(n * n * 4), b = new Uint8Array(n * n * 4);
  for (let ch = 0; ch < 4; ch++) {
    const f = tileFbm(n, ch * 13);
    for (let i = 0; i < f.length; i++) a[i * 4 + ch] = Math.round(clamp01(0.5 + (f[i] - 0.5) * 1.6) * 255);
  }
  // ridges where one fbm crosses its middle, broken up by another
  const f1 = tileFbm(n, 61), f2 = tileFbm(n, 77), f3 = tileFbm(n, 89);
  const hgt = new Float32Array(n * n);
  for (let i = 0; i < hgt.length; i++) { const r = 1 - Math.abs(f1[i] * 2 - 1) * 2.2; hgt[i] = Math.max(0, r) * (0.55 + f2[i] * 0.9) + f2[i] * 0.35; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, o = i * 4;
    const gx = hgt[y * n + ((x + 1) % n)] - hgt[y * n + ((x + n - 1) % n)], gy = hgt[((y + n - 1) % n) * n + x] - hgt[((y + 1) % n) * n + x];
    b[o] = Math.round(clamp01(0.5 + gx * 4) * 255);
    b[o + 1] = Math.round(clamp01(0.5 + gy * 4) * 255);
    b[o + 2] = Math.round(clamp01(hgt[i] * 0.8) * 255);
    // billows: puffs with creases between them
    b[o + 3] = Math.round(clamp01(1.15 - Math.abs(f3[i] * 2 - 1) * 2.6 - Math.abs(f2[i] * 2 - 1) * 0.5) * 255);
  }
  return { detail: dataTex(a, n, n, THREE.RGBAFormat, { tile: true, aniso: 4 }), relief: dataTex(b, n, n, THREE.RGBAFormat, { tile: true, aniso: 4 }) };
}
