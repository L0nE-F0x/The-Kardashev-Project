import { BIOME, REGION_BY_CODE } from '../../content/mapcodes';
import { CITIES } from '../../content/cities';
import type { RegionId } from '../../content/mapcodes';
import type { MapLod } from '../../world/mapData';
import { subsolar } from '../../world/sun';
import { C } from '../palette';
import { bayer, hash2, PixelCanvas } from '../pixels';

const RAD = Math.PI / 180;
const SIN_TWILIGHT = Math.sin(-6 * RAD);
const SIN_NIGHT = Math.sin(-12 * RAD);

/**
 * Multiply-blend overlay for the real-time terminator: transparent by day, dithered blue
 * through twilight, deep blue at night.
 */
export function renderNight(lod: MapLod, date: Date, pc?: PixelCanvas): PixelCanvas {
  const { W, H, res } = lod;
  const out = pc ?? new PixelCanvas(W, H);
  const sub = subsolar(date);
  const sd = Math.sin(sub.lat * RAD);
  const cd = Math.cos(sub.lat * RAD);
  const cosLon = new Float32Array(W);
  for (let x = 0; x < W; x++) cosLon[x] = Math.cos((-180 + (x + 0.5) * res - sub.lon) * RAD);
  for (let y = 0; y < H; y++) {
    const lat = (90 - (y + 0.5) * res) * RAD;
    const a = Math.sin(lat) * sd;
    const b = Math.cos(lat) * cd;
    for (let x = 0; x < W; x++) {
      const s = a + b * cosLon[x];
      let c = 0;
      if (s <= SIN_NIGHT) c = s < Math.sin(-18 * RAD) ? C.blu3 : bayer(x, y) < 8 ? C.blu3 : C.blu4;
      else if (s <= SIN_TWILIGHT) {
        const t = (s - SIN_NIGHT) / (SIN_TWILIGHT - SIN_NIGHT); // 0 night → 1 twilight edge
        c = bayer(x, y) < t * 16 ? C.blu5 : C.blu4;
      } else if (s <= 0) {
        const t = (s - SIN_TWILIGHT) / -SIN_TWILIGHT; // 0 twilight → 1 day edge
        c = bayer(x, y) < t * 16 ? 0 : C.blu6;
      }
      out.data[y * W + x] = c;
    }
  }
  return out;
}

/** Population density of procedural town lights per region (per 1000 land pixels at 0.25°). */
const DENSITY: Partial<Record<RegionId, number>> = {
  eur: 60, atl: 34, pac: 22, lat: 18, nor: 10, stp: 9, mena: 14, ssa: 6, sas: 70, eam: 48, fab: 110, seo: 22,
};

export interface LightPoint {
  x: number;
  y: number;
  c: number;
}

/** Static list of light pixels (cities + scattered towns) for a LOD. */
export function lightPoints(lod: MapLod): LightPoint[] {
  const { W, H, res, region, biome } = lod;
  const pts: LightPoint[] = [];
  const scale = (res / 0.25) ** 2; // fewer, bigger pixels at the coarse LOD
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = biome[i];
      if (b === BIOME.OCEAN || b === BIOME.ICE || b === BIOME.LAKE || b === BIOME.ALPINE || b === BIOME.DESERT || b === BIOME.TUNDRA) continue;
      const r = REGION_BY_CODE[region[i]];
      if (!r) continue;
      let d = (DENSITY[r] ?? 5) / 1000;
      if (b === BIOME.FARMLAND || b === BIOME.RIVER) d *= 1.8;
      if (b === BIOME.BOREAL || b === BIOME.RAINFOREST || b === BIOME.MOUNTAIN) d *= 0.35;
      const lat = 90 - (y + 0.5) * res;
      if (r === 'atl' && lat > 50) d *= 0.15;
      if (r === 'pac' && lat > 50) d *= 0.1;
      if (r === 'stp' && (y * res > 40 || (-180 + x * res > 90 && lat > 55))) d *= 0.3;
      if (hash2(x, y, 99) < d * scale) pts.push({ x, y, c: hash2(x, y, 98) < 0.5 ? C.org2 : C.yel0 });
    }
  }
  for (const [lat, lon, size] of CITIES) {
    const cx = Math.floor((lon + 180) / res);
    const cy = Math.floor((90 - lat) / res);
    pts.push({ x: cx, y: cy, c: C.yel2 });
    if (size >= 2) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pts.push({ x: cx + dx, y: cy + dy, c: C.yel1 });
    }
    if (size >= 3 && res <= 0.25) {
      for (const [dx, dy] of [[1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [1, -1], [-1, 1], [0, -2]]) pts.push({ x: cx + dx, y: cy + dy, c: hash2(cx + dx, cy + dy, 7) < 0.5 ? C.yel0 : C.org2 });
    }
  }
  return pts;
}

/** Draw the lights that are currently on the night side. */
export function renderLights(lod: MapLod, night: PixelCanvas, pts: LightPoint[], pc?: PixelCanvas): PixelCanvas {
  const out = pc ?? new PixelCanvas(lod.W, lod.H);
  out.data.fill(0);
  for (const p of pts) {
    const x = ((p.x % lod.W) + lod.W) % lod.W;
    if (p.y < 0 || p.y >= lod.H) continue;
    const n = night.data[p.y * lod.W + x];
    if (n === C.blu3 || n === C.blu4) out.data[p.y * lod.W + x] = p.c;
  }
  return out;
}
