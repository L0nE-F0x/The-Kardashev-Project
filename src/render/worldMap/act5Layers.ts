/**
 * Act V map layers that don't need Pixi: what Earth becomes. Each province's garden ↔ forge value
 * tints its land (gardens lusher, with woods of tiny dotted trees, wildflowers and restored ponds;
 * forges a grey-orange industrial haze with factory chimneys that glow at night), and the rectenna
 * fields where the swarm's beams come down near each province's anchor. Everything here paints
 * into PixelCanvases or returns plain numbers, so the MapScene and the headless previews share it.
 */
import { ANCHORS } from '../../content/charter';
import { BIOME, CODE_BY_REGION, type RegionId } from '../../content/mapcodes';
import { earthView, type EarthProvinceView, type EarthView } from '../../sim/systemView';
import type { GameState } from '../../sim/types';
import type { MapLod } from '../../world/mapData';
import { C } from '../palette';
import { bayer, fbm, hash2, PixelCanvas } from '../pixels';
import { beamFieldCanvas } from '../sprites/act5Icons';
import type { Px } from './act2Layers';

// ── the view, memoised on a cheap key ────────────────────────────────────────────────────────
let memo: { s: GameState | null; key: string; view: EarthView } | null = null;

/** Act V layers are on (the system exists). */
export function act5On(s: GameState | null): boolean {
  return !!s?.system;
}

/** A cheap fingerprint of everything the Earth view reads. */
function stateKey(s: GameState | null): string {
  const sy = s?.system;
  if (!s || !sy) return '';
  let h = 11;
  for (const p of s.charter?.projects ?? []) if (p.kind === 'beam') h = (Math.imul(h, 31) + p.id.length * 7 + (p.status === 'done' ? 1 : p.status === 'cancelled' ? 2 : 5) + p.size * 3 + Math.floor(p.progress / 10)) | 0;
  for (const r of Object.keys(sy.garden)) h = (Math.imul(h, 17) + Math.round(sy.garden[r as RegionId])) | 0;
  return `${s.day}|${h}`;
}

/** The Earth view, recomputed only when its key changes. */
export function earthMapView(s: GameState | null): EarthView {
  const key = stateKey(s);
  if (memo && memo.s === s && memo.key === key) return memo.view;
  const view = earthView(s);
  memo = { s, key, view };
  return view;
}

// ── garden ↔ forge ───────────────────────────────────────────────────────────────────────────
/** −1 (forge) … +1 (garden), with a small dead zone round 0 so a neutral province stays as it is. */
export function gardenLevel(p: Pick<EarthProvinceView, 'garden'>): number {
  const g = Math.max(-100, Math.min(100, p.garden)) / 100;
  return Math.abs(g) < 0.06 ? 0 : g;
}

/** Fingerprint of the ground layer (garden values in steps of 10). */
export function earthGroundKey(v: EarthView): string {
  return v.active ? v.provinces.map((p) => `${p.region}${Math.round(p.garden / 10)}`).join(',') : '';
}

/**
 * World-anchored fields per LOD, worked out once (0..255): `woods` (where gardens grow forest) and
 * `industry` (where forges build: noisy industrial belts, pulled toward coasts and rivers).
 */
const NOISE = new WeakMap<MapLod, { woods: Uint8Array; industry: Uint8Array }>();
function noiseOf(lod: MapLod): { woods: Uint8Array; industry: Uint8Array } {
  let n = NOISE.get(lod);
  if (n) return n;
  const { W, H, res, biome, coast } = lod;
  const woods = new Uint8Array(W * H);
  const industry = new Uint8Array(W * H);
  // rivers and lakes within ~1° (a box blur of a 0/1 mask, rows then columns)
  const reach = Math.max(1, Math.round(1 / res));
  const wet = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) wet[i] = biome[i] === BIOME.RIVER || biome[i] === BIOME.LAKE ? 1 : 0;
  const rows = new Uint16Array(W * H);
  const at = (y: number, x: number) => wet[y * W + (((x % W) + W) % W)];
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let k = -reach; k <= reach; k++) acc += at(y, k);
    for (let x = 0; x < W; x++) {
      rows[y * W + x] = acc;
      acc += at(y, x + reach + 1) - at(y, x - reach);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = biome[i];
      if (b === BIOME.OCEAN || b === BIOME.LAKE || b === BIOME.ICE) continue;
      // in degrees, so both zoom levels share the same woods and belts
      const u = x * res;
      const v = y * res;
      woods[i] = Math.round(fbm(u / 2.6, v / 2.6, 501, 3) * 255);
      let river = 0;
      for (let dy = -reach; dy <= reach && !river; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < H && rows[yy * W + x] > 0) river = 1;
      }
      const shore = coast[i] >= 0 ? Math.max(0, 1 - (coast[i] * res) / 2.5) : 0;
      const belt = fbm(u / 3.4 + 40, v / 3.4, 707, 3);
      industry[i] = Math.round(Math.min(1, belt * 0.85 + shore * 0.3 + river * 0.22) * 255);
    }
  }
  n = { woods, industry };
  NOISE.set(lod, n);
  return n;
}

const fineOf = (lod: { res: number }) => lod.res <= 0.3;
/** How readily each biome takes the garden (desert greens only round its irrigated edges). */
function gardenMul(b: number): number {
  if (b === BIOME.DESERT) return 0.32;
  if (b === BIOME.TUNDRA || b === BIOME.ALPINE) return 0.25;
  if (b === BIOME.MOUNTAIN || b === BIOME.PLATEAU) return 0.6;
  return 1;
}
/** Where industry sits (not on mountains or the open desert). */
function forgeMul(b: number): number {
  if (b === BIOME.DESERT) return 0.35;
  if (b === BIOME.TUNDRA || b === BIOME.ALPINE || b === BIOME.MOUNTAIN) return 0.2;
  if (b === BIOME.RAINFOREST || b === BIOME.WETLAND) return 0.5;
  return 1;
}

const land = (b: number) => b !== BIOME.OCEAN && b !== BIOME.LAKE && b !== BIOME.ICE;

/** Per region code: the garden level (−1..1). */
function levels(v: EarthView): Float32Array {
  const lvl = new Float32Array(256);
  for (const p of v.provinces) {
    const code = CODE_BY_REGION[p.region as RegionId];
    if (code !== undefined) lvl[code] = gardenLevel(p);
  }
  return lvl;
}

/** Factory spots in the forge provinces (map pixels): a grid sampled inside the industrial belts. */
export function factorySpots(lod: MapLod, v: EarthView, band: [number, number] = [84, -62]): Px[] {
  const out: Px[] = [];
  if (!v.active) return out;
  const { W, H, res, region, biome } = lod;
  const lvl = levels(v);
  const { industry } = noiseOf(lod);
  const cell = fineOf(lod) ? 4 : 3;
  const y0 = Math.max(1, Math.floor((90 - band[0]) / res));
  const y1 = Math.min(H - 1, Math.ceil((90 - band[1]) / res));
  for (let cy = Math.floor(y0 / cell); cy * cell < y1; cy++) {
    for (let cx = 0; cx * cell < W; cx++) {
      // jitter inside the cell
      const x = cx * cell + Math.floor(hash2(cx, cy, 811) * (cell - 1));
      const y = cy * cell + Math.floor(hash2(cx, cy, 812) * (cell - 1)) + 1;
      if (y < y0 || y >= y1 || x >= W) continue;
      const i = y * W + x;
      const b = biome[i];
      if (!land(b)) continue;
      const f = -lvl[region[i]];
      if (f <= 0) continue;
      const ind = industry[i] / 255;
      if (ind < 0.5) continue;
      if (hash2(cx, cy, 813) < f * forgeMul(b) * (ind - 0.42) * 3) out.push({ x, y });
    }
  }
  return out;
}

/**
 * The garden ↔ forge overlay at a LOD. Gardens: a green wash over the land, deeper in woods of
 * tiny dotted trees (a light crown over a dark pixel), wildflowers and a few restored ponds once a
 * province is mostly garden. Forges: a grey-orange haze, thicker along industrial belts, with
 * little factories (a dark roof, a chimney, a puff of smoke). Only land is painted; rows outside
 * the band are left empty.
 */
export function paintEarth(lod: MapLod, v: EarthView, pc?: PixelCanvas, band: [number, number] = [84, -62]): PixelCanvas {
  const { W, H, res, region, biome } = lod;
  const out = pc ?? new PixelCanvas(W, H);
  out.data.fill(0);
  if (!v.active) return out;
  const lvl = levels(v);
  const { woods, industry } = noiseOf(lod);
  const fine = fineOf(lod);
  const y0 = Math.max(0, Math.floor((90 - band[0]) / res));
  const y1 = Math.min(H, Math.ceil((90 - band[1]) / res));
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = biome[i];
      if (!land(b)) continue;
      const g = lvl[region[i]];
      if (!g) continue;
      if (g > 0) {
        const wood = woods[i] / 255;
        const k = gardenMul(b);
        const r = hash2(x, y, 601);
        // woods: a dense dark canopy dotted with light crowns
        const inWood = wood > 0.53 - g * 0.06;
        if (inWood) {
          const p = g * k * (0.3 + (wood - 0.5) * 2.2);
          if (r < p) out.data[i] = r < p * 0.4 ? C.grn2 : C.grn3;
          // trees on a jittered grid: a light crown with a dark pixel under it
          const cell = fine ? 3 : 2;
          if (x % cell === (y >> 1) % cell && y % 2 === 0 && hash2(x, y, 603) < g * k * 1.1) {
            out.data[i] = hash2(x, y, 604) < 0.3 ? C.grn7 : C.grn6;
            if (fine && y + 1 < H && land(biome[i + W])) out.data[i + W] = C.grn1;
          }
        } else {
          // meadows and fields: a lighter green wash, thinner in dry country
          const p = g * k * 0.2;
          if (r < p) out.data[i] = b === BIOME.DESERT || b === BIOME.GRASS || b === BIOME.SAVANNA ? (r < p * 0.5 ? C.grn5 : C.grn4) : r < p * 0.5 ? C.grn6 : C.grn5;
          else if (g > 0.55 && fine && hash2(x, y, 605) < (g - 0.55) * 0.03) out.data[i] = hash2(x, y, 606) < 0.5 ? C.yel1 : C.pnk1;
        }
        // restored ponds and wetlands, here and there
        if (g > 0.5 && fine && b !== BIOME.DESERT && hash2(x >> 1, y >> 1, 607) < (g - 0.5) * 0.012) {
          out.data[i] = C.sea6;
          if (x + 1 < W && land(biome[i + 1])) out.data[i + 1] = C.sea7;
        }
        continue;
      }
      // forge: a grey-orange haze over the whole province, thick along the industrial belts
      const f = -g;
      const ind = industry[i] / 255;
      const k = forgeMul(b);
      const level = f * (0.42 * k + Math.max(0, ind - 0.42) * 2.3);
      // an ordered dither, broken up a little so thin smog isn't a grid
      if (bayer(x, y) < level * 20 && hash2(x, y, 703) < 0.8) {
        // smog reads pale over dark green country, sooty over pale sand and steppe
        const r = hash2(x, y, 702);
        const pale = b === BIOME.DESERT || b === BIOME.GRASS || b === BIOME.SAVANNA || b === BIOME.PLATEAU || b === BIOME.FARMLAND;
        if (r < 0.12 * f) out.data[i] = pale ? C.org0 : C.org1;
        else if (pale) out.data[i] = ind > 0.6 && r < 0.45 ? C.ink5 : r < 0.7 ? C.rck4 : C.rck3;
        else out.data[i] = ind > 0.6 && r < 0.4 ? C.ink7 : r < 0.75 ? C.rck5 : C.snd5;
      }
    }
  }
  // factories: a dark roof, a chimney and a puff of smoke drifting east
  for (const p of factorySpots(lod, v, band)) {
    const set = (dx: number, dy: number, c: number) => {
      const x = (((p.x + dx) % W) + W) % W;
      const y = p.y + dy;
      if (y < 0 || y >= H || !land(biome[y * W + x])) return;
      out.data[y * W + x] = c;
    };
    if (fine) {
      set(0, 0, C.ink2);
      set(1, 0, C.ink3);
      set(1, -1, C.ink1);
      set(2, -2, C.rck5);
      if (hash2(p.x, p.y, 814) < 0.5) set(3, -2, C.ink6);
    } else {
      set(0, 0, C.ink2);
      set(1, -1, C.rck5);
    }
  }
  return out;
}

// ── beams to Earth: rectenna fields ──────────────────────────────────────────────────────────
/**
 * Where each province's beam rectennas go: open land (desert, steppe, plains) near its anchor,
 * clear of Act IV's space-solar rectenna (at the anchor, 2.5° south and 3° east).
 */
export const BEAM_AT: Record<RegionId, [number, number]> = {
  pac: [35.2, -116.2], // the Mojave
  atl: [32.0, -101.5], // west Texas
  lat: [-12.5, -44.5], // the cerrado
  eur: [39.4, -3.2], // La Mancha
  nor: [63.5, 25.5], // the Finnish lakeland
  stp: [51.2, 57.0], // the steppe
  mena: [26.4, 27.6], // the Western Desert
  ssa: [12.4, 8.6], // the Sahel, northern Nigeria
  sas: [26.6, 71.6], // the Thar
  eam: [36.0, 115.0], // the North China Plain
  fab: [36.2, 128.2], // inland Korea
  seo: [15.6, 102.8], // the Khorat plateau
};

export interface BeamCluster {
  region: RegionId;
  lat: number;
  lon: number;
  /** Finished fields (more TW, more of them). */
  fields: number;
  /** Fields under construction, 0..1 each. */
  building: number[];
}

/** Finished fields for the TW beamed into a province (one per ~40 TW, up to five). */
export const beamFieldCount = (tw: number) => (tw > 0 ? Math.max(1, Math.min(5, Math.round(tw / 40))) : 0);

export function beamClusters(v: EarthView): BeamCluster[] {
  if (!v.active) return [];
  const out: BeamCluster[] = [];
  for (const p of v.provinces) {
    const fields = beamFieldCount(p.beamTW);
    if (!fields && !p.beamBuilding.length) continue;
    const [lat, lon] = BEAM_AT[p.region] ?? ANCHORS[p.region];
    out.push({ region: p.region, lat, lon, fields, building: p.beamBuilding.slice(0, 3).map((b) => Math.round(b * 8) / 8) });
  }
  return out;
}

/** Fingerprint of the rectenna fields (progress in 8ths). */
export function beamKey(v: EarthView): string {
  return beamClusters(v).map((c) => `${c.region}:${c.fields}:${c.building.join('.')}`).join(',');
}

export interface BeamPatch {
  pc: PixelCanvas;
  /** Offset from the cluster's pixel to the canvas's top-left corner. */
  ox: number;
  oy: number;
  /** Receiver masts of the finished fields (canvas pixels), for the night lights. */
  masts: Px[];
}

/** A cluster of fields in a staggered honeycomb, finished ones first, centred on its spot. */
export function beamPatch(c: BeamCluster, lod: { res: number }): BeamPatch {
  const fine = fineOf(lod);
  const kinds: { building: boolean; progress: number }[] = [
    ...Array.from({ length: c.fields }, () => ({ building: false, progress: 1 })),
    ...c.building.map((p) => ({ building: true, progress: p })),
  ];
  const sample = beamFieldCanvas(fine);
  const fw = sample.w;
  const fh = sample.h;
  const spots = kinds.map((_, i) => {
    const col = Math.floor(i / 2);
    const row = i % 2;
    return { x: col * (fw + 1) + (row ? Math.ceil(fw / 2) : 0), y: row * (fh - (fine ? 1 : 0)) };
  });
  const w = Math.max(...spots.map((s) => s.x)) + fw;
  const h = Math.max(...spots.map((s) => s.y)) + fh;
  const pc = new PixelCanvas(w, h);
  const masts: Px[] = [];
  kinds.forEach((k, i) => {
    const f = beamFieldCanvas(fine, k.building, k.progress);
    pc.blit(f, spots[i].x, spots[i].y);
    if (!k.building) masts.push({ x: spots[i].x + Math.floor(fw / 2), y: spots[i].y + Math.floor(fh / 2) });
  });
  return { pc, ox: -Math.floor(w / 2), oy: -Math.floor(h / 2), masts };
}

// ── night lights ─────────────────────────────────────────────────────────────────────────────
export interface Light5 {
  x: number;
  y: number;
  c: number;
}

/** Night lights Act V adds: forge chimneys glowing orange, and the gold receiver masts of the beam fields. */
export function act5Lights(v: EarthView, lod: MapLod): Light5[] {
  const out: Light5[] = [];
  if (!v.active) return out;
  for (const p of factorySpots(lod, v)) {
    // a furnace glow at the chimney's foot, its flare above
    out.push({ x: p.x + 1, y: p.y - 1, c: hash2(p.x, p.y, 815) < 0.5 ? C.org1 : C.yel0 });
    if (fineOf(lod)) out.push({ x: p.x + 1, y: p.y - 2, c: hash2(p.x, p.y, 816) < 0.5 ? C.red3 : C.org0 });
    if (fineOf(lod) && hash2(p.x, p.y, 817) < 0.35) out.push({ x: p.x, y: p.y, c: C.org2 });
  }
  const px = (lat: number, lon: number) => ({ x: Math.floor((lon + 180) / lod.res), y: Math.floor((90 - lat) / lod.res) });
  for (const c of beamClusters(v)) {
    const patch = beamPatch(c, lod);
    const p = px(c.lat, c.lon);
    for (const m of patch.masts) out.push({ x: p.x + patch.ox + m.x, y: p.y + patch.oy + m.y, c: C.yel1 });
  }
  return out;
}
