import { BIOME } from '../../content/mapcodes';
import type { MapLod } from '../../world/mapData';
import { C } from '../palette';
import { bayer, ditherAt, fbm, hash2, PixelCanvas } from '../pixels';

const B = BIOME;

/** Three-tone ramps per biome: [shadow, base, light]. */
const RAMPS: Record<number, [number, number, number]> = {
  [B.ICE]: [C.ice1, C.ice2, C.ice3],
  [B.TUNDRA]: [C.rck3, C.rck4, C.grn4],
  [B.BOREAL]: [C.grn1, C.grn2, C.grn3],
  [B.TEMPERATE]: [C.grn3, C.grn4, C.grn5],
  [B.GRASS]: [C.grn5, C.snd5, C.snd6],
  [B.DESERT]: [C.snd5, C.snd6, C.snd7],
  [B.SAVANNA]: [C.snd4, C.grn5, C.snd6],
  [B.RAINFOREST]: [C.grn1, C.grn2, C.grn3],
  [B.MOUNTAIN]: [C.rck2, C.rck3, C.rck4],
  [B.ALPINE]: [C.rck3, C.rck4, C.rck5],
  [B.PLATEAU]: [C.rck4, C.snd4, C.rck5],
  [B.WETLAND]: [C.grn3, C.cyn2, C.grn4],
  [B.FARMLAND]: [C.grn5, C.grn6, C.grn7],
  [B.LAKE]: [C.sea5, C.sea6, C.sea6],
  [B.RIVER]: [C.sea6, C.sea6, C.sea7],
};

const FIELD_COLS = [C.grn5, C.grn6, C.grn7, C.snd6, C.grn6, C.snd7, C.grn4];

/**
 * Paint a LOD of the world map as indexed pixel art: dithered ocean depth, biome ramps with
 * noise, raised coastlines, farmland patchwork, forests and mountain peaks.
 */
export function renderTerrain(lod: MapLod): PixelCanvas {
  return drain(paintTerrain(lod));
}

/** Run a sliced job to the end. */
function drain<T>(job: Generator<void, T>): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** The terrain painting, a few rows at a time (it pauses between slices so it can run in idle moments). */
function* paintTerrain(lod: MapLod): Generator<void, PixelCanvas> {
  const { W, H, biome, coast, res } = lod;
  const pc = new PixelCanvas(W, H);
  const shelf = shelfField(lod);
  yield;
  const fine = res <= 0.25;
  const isLand = (x: number, y: number) => {
    if (y < 0 || y >= H) return false;
    const xi = ((x % W) + W) % W;
    return biome[y * W + xi] !== B.OCEAN;
  };
  // the Arctic pack ice's wobbly edge depends only on the longitude: once per column
  const iceLine = new Float64Array(W);
  for (let x = 0; x < W; x++) iceLine[x] = 80.5 + (fbm((-180 + (x + 0.5) * res) / 16, 3.3, 41, 3) - 0.5) * 8;

  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * res;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = biome[i];
      const lon = -180 + (x + 0.5) * res;
      if (b === B.OCEAN) {
        pc.data[i] = oceanColour(x, y, coast[i], shelf[i], lat, lon, isLand(x - 1, y - 1) || isLand(x, y - 1), iceLine[x]);
        continue;
      }
      const ramp = RAMPS[b] ?? RAMPS[B.TEMPERATE];
      const n = fbm(lon / 4, lat / 4, 3, 3);
      const t = n * 1.6 - 0.3 + (bayer(x, y) / 16 - 0.5) * 0.55;
      let c = t < 0.33 ? ramp[0] : t < 0.72 ? ramp[1] : ramp[2];

      if (b === B.FARMLAND) {
        const bx = Math.floor((x + Math.floor(hash2(0, y >> 1, 9) * 3)) / (fine ? 4 : 2));
        const by = Math.floor(y / (fine ? 3 : 2));
        c = FIELD_COLS[Math.floor(hash2(bx, by, 11) * FIELD_COLS.length)];
      } else if (b === B.DESERT) {
        const r = fbm(lon * 1.7, lat * 5, 21, 2);
        if (r > 0.62 && bayer(x, y) < 8) c = C.snd7;
        else if (r < 0.3 && bayer(x, y) < 6) c = C.snd5;
      } else if (b === B.ICE) {
        if (hash2(x, y, 5) < 0.025) c = C.ice0;
      } else if (b === B.TUNDRA) {
        if (hash2(x, y, 6) < 0.06) c = C.ice2;
      } else if (b === B.RIVER) {
        c = C.sea6;
      }

      // raised coast: highlight edges facing the light (top-left), shade those facing away
      const d = coast[i];
      if (d === 1 && b !== B.ICE && b !== B.RIVER && b !== B.LAKE) {
        const seaUL = !isLand(x - 1, y) || !isLand(x, y - 1);
        const seaDR = !isLand(x + 1, y) || !isLand(x, y + 1);
        if (seaDR && !seaUL) c = ramp[0];
        else if (seaUL && !seaDR) c = ramp[2];
      }
      pc.data[i] = c;
    }
    if ((y & 7) === 7) yield;
  }

  yield* decorate(pc, lod);
  return pc;
}

/** Ocean depth bands, shallow to deep: [lower limit of the shelf value, colour]. */
const BANDS: [number, number][] = [
  [0.34, C.sea5],
  [0.19, C.sea4],
  [0.085, C.sea3],
  [0.025, C.sea2],
];

function oceanColour(x: number, y: number, d: number, shelf: number, lat: number, lon: number, landAbove: boolean, iceLine: number): number {
  // Arctic pack ice: solid cap with a dithered, wobbly edge
  if (lat > iceLine) return hash2(x, y, 44) < 0.04 ? C.ice1 : C.ice2;
  if (lat > iceLine - 1.5 && ditherAt(x, y, (lat - iceLine + 1.5) / 1.5)) return C.ice1;
  if (d <= 1) return landAbove ? C.sea5 : C.sea7;
  if (d <= 2) return C.sea6;
  const n = fbm(lon / 7, lat / 7, 77, 2);
  const v = shelf + (n - 0.5) * 0.08;
  let upper = 1;
  for (const [limit, col] of BANDS) {
    if (v > limit) {
      // dither toward the shallower band near the top of this band
      const t = (v - limit) / (upper - limit);
      return t > 0.75 && bayer(x, y) < (t - 0.75) * 40 ? shallower(col) : col;
    }
    upper = limit;
  }
  return n > 0.7 && bayer(x, y) < 3 ? C.sea2 : C.sea1;
}

function shallower(col: number): number {
  if (col === C.sea2) return C.sea3;
  if (col === C.sea3) return C.sea4;
  if (col === C.sea4) return C.sea5;
  return C.sea6;
}

/** Land fraction blurred over ~1.5° — gives round continental shelves instead of BFS diamonds. */
function shelfField(lod: MapLod): Float32Array {
  const { W, H, biome } = lod;
  const r = Math.max(2, Math.round(2.5 / lod.res));
  let a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = biome[i] !== B.OCEAN ? 1 : 0;
  const tmp = new Float32Array(W * H);
  const norm = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    // horizontal (wraps)
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[y * W + (((k % W) + W) % W)];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = sum * norm;
        sum += a[y * W + ((x + r + 1) % W)] - a[y * W + (((x - r) % W) + W) % W];
      }
    }
    // vertical (clamps)
    const out = new Float32Array(W * H);
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.max(0, Math.min(H - 1, k)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = sum * norm;
        sum += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    a = out;
  }
  return a;
}

// ── decorations ─────────────────────────────────────────────────────────────────────────────
const PEAK_FINE = [
  '...h...',
  '..hlm..',
  '.hllmm.',
  'hllmmms',
];
const PEAK_FINE_SNOW = [
  '...w...',
  '..wwm..',
  '.hlwmm.',
  'hllmmms',
  'llmmmms',
];
const PEAK_COARSE = ['.h.', 'hlm', 'lms'];
const PEAK_COARSE_SNOW = ['.w.', 'wwm', 'lms'];

function stamp(pc: PixelCanvas, rows: string[], x: number, y: number, map: Record<string, number>) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch !== '.') pc.set(x + i, y + j, map[ch]);
    }
  }
}

function* decorate(pc: PixelCanvas, lod: MapLod): Generator<void, void> {
  const { W, H, biome, res } = lod;
  const fine = res <= 0.25;
  const at = (x: number, y: number) => (y < 0 || y >= H ? B.OCEAN : biome[y * W + (((x % W) + W) % W)]);
  const mountainous = (b: number) => b === B.MOUNTAIN || b === B.ALPINE;

  // forests (fine LOD only)
  if (fine) {
    for (let y = 1; y < H - 2; y++) {
      for (let x = 1; x < W - 2; x++) {
        const b = at(x, y);
        let p = 0;
        if (b === B.RAINFOREST) p = 0.07;
        else if (b === B.BOREAL) p = 0.05;
        else if (b === B.TEMPERATE) p = 0.025;
        else if (b === B.SAVANNA) p = 0.01;
        if (p === 0 || hash2(x, y, 13) > p) continue;
        if (at(x, y + 1) !== b || at(x + 1, y) !== b || at(x - 1, y) !== b) continue;
        if (b === B.BOREAL) {
          pc.set(x, y - 1, C.grn3);
          pc.set(x, y, C.grn2);
          pc.set(x - 1, y + 1, C.grn2);
          pc.set(x, y + 1, C.grn1);
          pc.set(x + 1, y + 1, C.grn0);
        } else if (b === B.SAVANNA) {
          pc.set(x - 1, y, C.grn4);
          pc.set(x, y, C.grn3);
          pc.set(x + 1, y, C.grn2);
          pc.set(x, y + 1, C.snd2);
        } else {
          const light = b === B.RAINFOREST ? C.grn4 : C.grn6;
          const mid = b === B.RAINFOREST ? C.grn2 : C.grn4;
          const dark = b === B.RAINFOREST ? C.grn0 : C.grn2;
          pc.set(x, y - 1, light);
          pc.set(x - 1, y, light);
          pc.set(x, y, mid);
          pc.set(x + 1, y, dark);
          pc.set(x, y + 1, dark);
        }
      }
      if ((y & 31) === 31) yield;
    }
  }
  yield;

  // mountain peaks on a jittered grid, drawn back-to-front
  const step = fine ? 5 : 4;
  for (let gy = 0; gy < H; gy += step - 1) {
    if (gy % 96 < step - 1) yield;
    for (let gx = 0; gx < W; gx += step) {
      const jx = gx + Math.floor(hash2(gx, gy, 31) * step);
      const jy = gy + Math.floor(hash2(gx, gy, 32) * (step - 1));
      const b = at(jx, jy);
      if (!mountainous(b)) continue;
      if (!mountainous(at(jx - 2, jy)) && !mountainous(at(jx + 2, jy))) continue;
      if (hash2(jx, jy, 33) < (fine ? 0.18 : 0.3)) continue;
      const alpine = b === B.ALPINE;
      const map = alpine
        ? { h: C.rck6, l: C.rck5, m: C.rck3, s: C.rck1, w: C.ice3 }
        : { h: C.rck5, l: C.rck4, m: C.rck2, s: C.rck1, w: C.ice2 };
      if (fine) {
        const rows = alpine ? PEAK_FINE_SNOW : PEAK_FINE;
        stamp(pc, rows, jx - 3, jy - rows.length + 1, map);
      } else {
        const rows = alpine ? PEAK_COARSE_SNOW : PEAK_COARSE;
        stamp(pc, rows, jx - 1, jy - rows.length + 1, map);
      }
    }
  }
}

/** Dotted region borders over land, as an overlay canvas. */
export function renderBorders(lod: MapLod, highlight: number | null = null): PixelCanvas {
  const { W, H, region, biome } = lod;
  const pc = new PixelCanvas(W, H);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = region[i];
      if (r === 0 || biome[i] === B.OCEAN) continue;
      const right = region[y * W + ((x + 1) % W)];
      const down = region[i + W];
      const border = (right !== 0 && right !== r) || (down !== 0 && down !== r);
      if (border && ((x + y) & 1) === 0) pc.data[i] = C.ink9;
      if (highlight !== null && r === highlight && !border && ((x + y) & 3) === 0 && biome[i] !== B.OCEAN) pc.data[i] = C.white;
    }
  }
  return pc;
}

const terrainMemo = new WeakMap<MapLod, PixelCanvas>();
/** A terrain painting under way in idle slices (terrainSlice), finished at once if someone needs it now. */
const terrainJobs = new WeakMap<MapLod, Generator<void, PixelCanvas>>();

/**
 * Memoised terrain painting for a LOD: one painting shared by the world map, the orbit globe, the
 * site previews, the Moon's Earth and the end card. Never mutate it (orbitTerrain clones it).
 */
export function terrainCanvas(lod: MapLod): PixelCanvas {
  let pc = terrainMemo.get(lod);
  if (!pc) {
    const job = terrainJobs.get(lod) ?? paintTerrain(lod);
    terrainJobs.delete(lod);
    pc = drain(job);
    terrainMemo.set(lod, pc);
  }
  return pc;
}

/** Paint some more of a LOD's terrain, for about `ms` (idle-time builds). True once it's all painted. */
export function terrainSlice(lod: MapLod, ms: number): boolean {
  if (terrainMemo.has(lod)) return true;
  let job = terrainJobs.get(lod);
  if (!job) terrainJobs.set(lod, (job = paintTerrain(lod)));
  const t0 = performance.now();
  for (;;) {
    const r = job.next();
    if (r.done) {
      terrainJobs.delete(lod);
      terrainMemo.set(lod, r.value);
      return true;
    }
    if (performance.now() - t0 >= ms) return false;
  }
}

/**
 * Solarpunk Bloom (era 2 and later): the regreened world, painted over the terrain — the Great
 * Green Wall across the Sahel, the shelterbelts of northern China, woods regrown across the
 * temperate belt, and solar panels glinting among the fields. The terrain itself is untouched,
 * so earlier eras look exactly as they did.
 */
export function renderBloom(lod: MapLod): PixelCanvas {
  const { W, H, biome, res } = lod;
  const pc = new PixelCanvas(W, H);
  const fine = res <= 0.25;
  const at = (x: number, y: number) => (y < 0 || y >= H ? B.OCEAN : biome[y * W + (((x % W) + W) % W)]);
  const landish = (b: number) => b === B.GRASS || b === B.SAVANNA || b === B.DESERT || b === B.TEMPERATE || b === B.PLATEAU || b === B.FARMLAND;
  for (let y = 1; y < H - 2; y++) {
    const lat = 90 - (y + 0.5) * res;
    for (let x = 0; x < W; x++) {
      const b = at(x, y);
      if (!landish(b)) continue;
      const lon = -180 + (x + 0.5) * res;
      let p = 0;
      let sahel = false;
      // the Great Green Wall: a belt of trees from Senegal to Djibouti
      if (lat > 11 && lat < 18.6 && lon > -17.5 && lon < 43) {
        const band = Math.max(0, 1 - Math.abs(lat - 14.8) / 3.8) * (0.75 + fbm(lon / 3, lat / 3, 61, 2) * 0.5);
        if (b === B.GRASS || b === B.SAVANNA) p = 0.11 * band;
        else if (b === B.DESERT && lat < 16.8) p = 0.07 * band;
        sahel = p > 0;
      }
      // the Three-North shelterbelt along the edge of the Gobi
      if (lat > 35 && lat < 44 && lon > 95 && lon < 125 && (b === B.DESERT || b === B.GRASS || b === B.PLATEAU)) p = Math.max(p, 0.035);
      // woods regrown in the temperate belt and on the grasslands
      if (b === B.TEMPERATE) p = Math.max(p, 0.03);
      else if (b === B.GRASS && !sahel) p = Math.max(p, 0.012);
      if (p > 0 && hash2(x, y, 71) < p * (fine ? 1 : 0.7)) {
        if (!landish(at(x - 1, y)) || !landish(at(x + 1, y)) || !landish(at(x, y + 1))) continue;
        if (!fine) {
          pc.set(x, y, sahel ? C.grn3 : C.grn4);
          continue;
        }
        if (sahel || b === B.DESERT || b === B.PLATEAU) {
          // a young acacia: a flat crown on a short trunk
          pc.set(x - 1, y, C.grn5);
          pc.set(x, y, C.grn4);
          pc.set(x + 1, y, C.grn3);
          pc.set(x, y + 1, C.snd2);
        } else {
          pc.set(x, y - 1, C.grn6);
          pc.set(x - 1, y, C.grn6);
          pc.set(x, y, C.grn4);
          pc.set(x + 1, y, C.grn2);
          pc.set(x, y + 1, C.grn2);
        }
        continue;
      }
      // solar glinting among the fields
      if (fine && b === B.FARMLAND && at(x + 1, y) === B.FARMLAND && hash2(x, y, 73) < 0.006) {
        pc.set(x, y, C.blu3);
        pc.set(x + 1, y, C.sky4);
      }
    }
  }
  return pc;
}
