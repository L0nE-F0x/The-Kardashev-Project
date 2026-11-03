import type { MapLod } from '../world/mapData';
import { siteDef } from '../content/sites';
import { terrainCanvas } from '../render/worldMap/terrain';
import { C } from '../render/palette';
import { PixelCanvas, toDataUrl } from '../render/pixels';

const cache = new Map<string, string>();

/** A small pixel-map crop centred on a site, with a marker (data URL). */
export function sitePreviewUrl(lod: MapLod, siteId: string, w = 72, h = 40): string {
  const key = `${siteId}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const site = siteDef(siteId);
  const terrain = terrainCanvas(lod);
  const cx = Math.floor((site.lon + 180) / lod.res);
  const cy = Math.floor((90 - site.lat) / lod.res);
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (((cx - (w >> 1) + x) % lod.W) + lod.W) % lod.W;
      const sy = Math.max(0, Math.min(lod.H - 1, cy - (h >> 1) + y));
      pc.data[y * w + x] = terrain.data[sy * lod.W + sx];
    }
  }
  const mx = w >> 1;
  const my = h >> 1;
  for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [0, -3], [0, 3], [-3, 0], [3, 0]]) pc.set(mx + dx, my + dy, C.ink0);
  pc.set(mx, my, C.yel1);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) pc.set(mx + dx, my + dy, C.yel0);
  const url = toDataUrl(pc);
  cache.set(key, url);
  return url;
}
