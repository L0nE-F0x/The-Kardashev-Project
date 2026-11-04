/**
 * Act IV map layers that don't need Pixi: the supergrid (planned, building, online, down), the
 * fusion plants and air-capture banks gathered at megaproject sites, rectenna fields, the
 * provinces' heat haze and greening, and AI-region banners. Everything here paints into
 * PixelCanvases or returns plain numbers, so the MapScene and the headless previews share it.
 */
import { BIOME, CODE_BY_REGION, REGION_IDS, type RegionId } from '../../content/mapcodes';
import { siteDef } from '../../content/sites';
import { builderColor } from '../../sim/charterView';
import { planetMapView, type LinkView, type PlanetMapView, type ProvinceView, type RectennaView } from '../../sim/planetView';
import type { FusionDesignId, GameState } from '../../sim/types';
import type { MapLod } from '../../world/mapData';
import { sunAltitude, subsolar } from '../../world/sun';
import { C, type ColorKey } from '../palette';
import { bayer, hash2, PixelCanvas } from '../pixels';
import { rectennaCanvas } from '../sprites/act4Icons';
import type { Px } from './act2Layers';
import { hvdcTrack, type HvdcTrack } from './act3Layers';

// ── the view, memoised on a cheap key ────────────────────────────────────────────────────────
let memo: { s: GameState | null; key: string; view: PlanetMapView } | null = null;

/** Act IV layers are on (the planet exists). */
export function act4On(s: GameState | null): boolean {
  return !!s?.planet;
}

/** A cheap fingerprint of everything the planet map view reads (changes at most once a game day). */
export function planetKey(s: GameState | null): string {
  const pl = s?.planet;
  if (!s || !pl) return '';
  let h = 7;
  for (const p of s.charter?.projects ?? []) h = (Math.imul(h, 31) + p.id.length * 3 + (p.status === 'done' ? 1 : p.status === 'cancelled' ? 2 : 5) + p.size + Math.floor(p.progress / 20)) | 0;
  for (const r of REGION_IDS) {
    const pr = pl.provinces[r];
    h = (Math.imul(h, 17) + Math.round(pr.heat) * 3 + Math.round(pr.wellbeing) + (pr.ai ? pr.ai.length * 101 : 0)) | 0;
  }
  return `${s.day}|${pl.stage}|${h}`;
}

/** The planet's map view, recomputed only when its key changes. */
export function planetView(s: GameState | null): PlanetMapView {
  const key = planetKey(s);
  if (memo && memo.s === s && memo.key === key) return memo.view;
  const view = planetMapView(s);
  memo = { s, key, view };
  return view;
}

// ── the supergrid ────────────────────────────────────────────────────────────────────────────
export interface SgDraw {
  id: string;
  track: HvdcTrack;
  status: LinkView['status'];
  /** 0..1 built. */
  progress: number;
  builder: ColorKey;
}

/** Fingerprint of the supergrid layer (progress in 40ths). */
export function sgKey(v: PlanetMapView): string {
  return v.links.map((l) => `${l.route.id}:${l.status}:${Math.floor(l.progress * 40)}`).join(',');
}

export function sgDraws(v: PlanetMapView, lod: MapLod, track: (l: LinkView) => HvdcTrack = (l) => hvdcTrack(l.route, lod)): SgDraw[] {
  return v.links.map((l) => ({
    id: l.route.id,
    track: track(l),
    status: l.status,
    progress: l.status === 'online' || l.status === 'down' ? 1 : l.status === 'planned' ? 0 : l.progress,
    builder: builderColor(l.builder ?? 'halcyon'),
  }));
}

/** Perpendicular offset for a thick line at track index i: (0,1) for flat stretches, (1,0) for steep ones. */
function perp(pts: Px[], i: number): [number, number] {
  const a = pts[Math.max(0, i - 2)];
  const b = pts[Math.min(pts.length - 1, i + 2)];
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? [0, 1] : [1, 0];
}

/**
 * Paint the supergrid into a full-map canvas (x wraps). Online links are a white-hot
 * superconducting core with a violet glow either side (a pale glow in the water where they run
 * subsea); building ones are an unlit grey line up to their progress, dashed beyond; planned
 * ones a faint violet dash; a link that's down is a dark red line (the scene blinks a bright
 * copy on top, see `sgDownPixels`). The coarse LOD (> 0.3°/px) gets single-pixel lines.
 */
export function paintSupergrid(pc: PixelCanvas, lod: { W: number; H: number; res?: number }, draws: SgDraw[]): void {
  const W = lod.W;
  const thin = (lod.res ?? 0.25) > 0.3;
  const set = (x: number, y: number, c: number) => pc.set(((x % W) + W) % W, y, c);
  // planned first (faint), so built links paint over where they cross
  for (const d of draws) {
    if (d.status !== 'planned') continue;
    d.track.pts.forEach((p, i) => {
      if (i % (thin ? 4 : 6) < 2) set(p.x, p.y, d.track.sea[i] ? C.vio3 : C.vio4);
    });
  }
  // glows and shadows
  for (const d of draws) {
    if (d.status === 'planned') continue;
    const { pts, sea } = d.track;
    const built = Math.floor(d.progress * (pts.length - 1));
    pts.forEach((p, i) => {
      const done = i <= built;
      const [px, py] = perp(pts, i);
      if (!done) return;
      if (d.status !== 'online') {
        if (!sea[i]) set(p.x + 1, p.y + 1, C.ink0);
        return;
      }
      if (thin) {
        if (sea[i]) {
          if (i % 2 === 0) set(p.x + px, p.y + py, C.vio2);
        } else set(p.x + 1, p.y + 1, C.ink0);
        return;
      }
      if (sea[i]) {
        // a dithered violet glow in the water either side of the cable
        if (bayer(p.x, p.y) < 8) set(p.x - px, p.y - py, C.vio2);
        if (bayer(p.x + 1, p.y) < 8) set(p.x + px * 2, p.y + py * 2, C.vio2);
        return;
      }
      set(p.x - px, p.y - py, bayer(p.x, p.y) < 10 ? C.vio3 : C.vio2);
      set(p.x + px * 2, p.y + py * 2, C.ink0);
      set(p.x + px + 1, p.y + py + 1, C.ink0);
    });
  }
  // cores
  for (const d of draws) {
    if (d.status === 'planned') continue;
    const { pts, sea } = d.track;
    const built = Math.floor(d.progress * (pts.length - 1));
    pts.forEach((p, i) => {
      const done = i <= built;
      const [px, py] = perp(pts, i);
      if (!done) {
        if (i % 4 < 2) set(p.x, p.y, sea[i] ? C.vio3 : C.ink8);
        return;
      }
      if (d.status === 'down') {
        set(p.x, p.y, C.red1);
        if (!thin && !sea[i]) set(p.x + px, p.y + py, C.red0);
        return;
      }
      if (d.status === 'building') {
        set(p.x, p.y, sea[i] ? (i % 2 ? C.ink8 : C.ink6) : C.ink9);
        if (!thin && !sea[i]) set(p.x + px, p.y + py, C.ink6);
        return;
      }
      if (thin) {
        set(p.x, p.y, sea[i] ? C.ice1 : C.ice3);
        return;
      }
      if (sea[i]) {
        set(p.x, p.y, i % 4 === 0 ? C.white : C.ice2);
        return;
      }
      set(p.x, p.y, C.white);
      set(p.x + px, p.y + py, C.ice1);
      // a violet node every few pixels: the cryogenic stations along the line
      if (i % 8 === 0) set(p.x + px, p.y + py, C.vio5);
    });
  }
}

/** The core pixels of links that are down (blinked bright red by the scene). */
export function sgDownPixels(draws: SgDraw[]): Px[] {
  const out: Px[] = [];
  for (const d of draws) if (d.status === 'down') out.push(...d.track.pts);
  return out;
}

/**
 * Which way power flows along a link right now: out of the sunlit end toward the dark one
 * (+1 = from a to b, -1 = from b to a), and how strongly (0..1, 1 when one end is in full day
 * and the other in night).
 */
export function sgFlow(route: { a: [number, number]; b: [number, number] }, date: Date = new Date()): { dir: 1 | -1; strength: number } {
  const sub = subsolar(date);
  const alt = (p: [number, number]) => sunAltitude(p[0], p[1], sub);
  const da = alt(route.a);
  const db = alt(route.b);
  const light = (deg: number) => Math.max(0, Math.min(1, (deg + 6) / 24));
  return { dir: da >= db ? 1 : -1, strength: Math.abs(light(da) - light(db)) };
}

// ── fusion plants and air capture at megaproject sites ───────────────────────────────────────
export type SiteGlyph4 =
  | { kind: 'fusion'; design: FusionDesignId; building: boolean; progress: number }
  | { kind: 'dac'; building: boolean; progress: number };

/** Fusion fleets (one glyph per design) and air capture at each megaproject site, online first. */
export function siteGlyphs4(v: PlanetMapView): Map<string, SiteGlyph4[]> {
  const out = new Map<string, SiteGlyph4[]>();
  const push = (site: string, g: SiteGlyph4) => {
    const list = out.get(site) ?? [];
    list.push(g);
    out.set(site, list);
  };
  const seen = new Set<string>();
  for (const f of [...v.fusion].sort((a, b) => (a.status === b.status ? 0 : a.status === 'online' ? -1 : 1))) {
    const k = `${f.siteId}|${f.design}`;
    if (seen.has(k)) continue;
    seen.add(k);
    push(f.siteId, { kind: 'fusion', design: f.design, building: f.status === 'building', progress: f.progress });
  }
  for (const d of [...v.dac].sort((a, b) => (a.status === b.status ? 0 : a.status === 'online' ? -1 : 1))) {
    const k = `${d.siteId}|dac`;
    if (seen.has(k)) continue;
    seen.add(k);
    push(d.siteId, { kind: 'dac', building: d.status === 'building', progress: d.progress });
  }
  for (const [k, list] of out) out.set(k, list.slice(0, 4));
  return out;
}

export function siteGlyphs4Key(v: PlanetMapView): string {
  const parts: string[] = [];
  for (const [site, list] of siteGlyphs4(v)) parts.push(`${site}:${list.map((g) => (g.kind === 'fusion' ? g.design : 'dac') + (g.building ? `b${Math.round(g.progress * 8)}` : '')).join('.')}`);
  return parts.join(',');
}

/**
 * Where the Act IV glyphs go for a megaproject site at pixel (x, y): a row centred under the
 * site's marker (height `markerH`), tops just below it.
 */
export function glyphRow4(x: number, y: number, markerH: number, sizes: { w: number; h: number }[]): Px[] {
  const total = sizes.reduce((n, s) => n + s.w - 1, 0) + 1;
  let cx = x - Math.floor(total / 2);
  const top = y + Math.ceil(markerH / 2);
  return sizes.map((s) => {
    const p = { x: cx, y: top };
    cx += s.w - 1;
    return p;
  });
}

// ── rectennas ────────────────────────────────────────────────────────────────────────────────
export interface Patch {
  pc: PixelCanvas;
  /** Offset from the rectenna's pixel to the canvas's top-left corner. */
  ox: number;
  oy: number;
}

/** A rectenna field centred on its spot, at a LOD. */
export function rectennaPatch(r: RectennaView, lod: { res: number }): Patch {
  const pc = rectennaCanvas(lod.res <= 0.3, r.status === 'building', r.progress);
  return { pc, ox: -Math.floor(pc.w / 2), oy: -Math.floor(pc.h / 2) };
}

export function rectennaKey(v: PlanetMapView): string {
  return v.rectennas.map((r) => `${r.region}:${r.status}:${Math.round(r.progress * 8)}`).join(',');
}

// ── provinces: heat haze and greening ────────────────────────────────────────────────────────
/** 0..1: how hard the heat shimmers over a province (heat index and waste heat together). */
export function hazeLevel(p: ProvinceView): number {
  return Math.max(0, Math.min(1, (p.heat - 58) / 34 + p.wasteHeat * 0.12));
}

/** 0..1: how green a province is getting (wellbeing over 55). */
export function greenLevel(p: ProvinceView): number {
  return Math.max(0, Math.min(1, (p.wellbeing - 55) / 40));
}

export function provinceKey(v: PlanetMapView): string {
  return `${v.showHeat}|${v.provinces.map((p) => `${p.region}${Math.round(hazeLevel(p) * 10)}.${Math.round(greenLevel(p) * 10)}`).join(',')}`;
}

/**
 * The provinces overlay at a LOD for one shimmer phase (0 or 1): sparse new green where
 * wellbeing is high (fields, woods, irrigated desert edges) and, once waste heat shows (stage 3),
 * wavy heat-haze squiggles over the hot provinces, denser the hotter they run. The two phases
 * put the squiggles in different places, so swapping them shimmers. Only land is painted.
 * Rows outside [latTop, latBottom] are left empty.
 */
export function paintProvinces(lod: MapLod, v: PlanetMapView, phase: number, pc?: PixelCanvas, band: [number, number] = [84, -62]): PixelCanvas {
  const { W, H, res, region, biome } = lod;
  const out = pc ?? new PixelCanvas(W, H);
  out.data.fill(0);
  const haze = new Float32Array(256);
  const green = new Float32Array(256);
  for (const p of v.provinces) {
    const code = CODE_BY_REGION[p.region as RegionId];
    if (code === undefined) continue;
    haze[code] = v.showHeat ? hazeLevel(p) : 0;
    green[code] = greenLevel(p);
  }
  const fine = res <= 0.3;
  const y0 = Math.max(0, Math.floor((90 - band[0]) / res));
  const y1 = Math.min(H, Math.ceil((90 - band[1]) / res));
  const ph = phase % 2;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const b = biome[i];
      if (b === BIOME.OCEAN || b === BIOME.LAKE || b === BIOME.ICE) continue;
      const code = region[i];
      const g = green[code];
      const h = haze[code];
      if (!g && !h) continue;
      // greening: young trees and green fields, a little thinner in the desert
      if (g > 0) {
        const p = g * (b === BIOME.DESERT ? 0.045 : 0.09) * (fine ? 1 : 0.8);
        const r = hash2(x, y, 211);
        if (r < p) {
          out.data[i] = r < p * 0.35 ? C.grn6 : b === BIOME.DESERT ? C.grn4 : C.grn5;
          if (fine && r < p * 0.2 && y > 0) out.data[i - W] = out.data[i - W] || C.grn7;
        }
      }
      if (h > 0) {
        // a warm dither over the whole province, thicker the hotter it runs
        if (bayer(x + ph * 2, y + ph) < h * 1.2 && hash2(x >> 1, y >> 1, 229) < 0.6 && !out.data[i]) out.data[i] = C.org0;
      }
    }
  }
  // heat shimmer: little arches of hot air in a staggered grid, moved and flipped between phases
  const cw = fine ? 10 : 8;
  const ch = fine ? 6 : 5;
  const stroke = fine
    ? [[0, 0, C.org1], [1, -1, C.yel1], [2, -1, C.yel2], [3, -1, C.yel1], [4, 0, C.org1]]
    : [[0, 0, C.org1], [1, -1, C.yel2], [2, 0, C.org1]];
  for (let cy = Math.floor(y0 / ch); cy * ch < y1; cy++) {
    for (let cx = 0; cx * cw < W; cx++) {
      const sx = cx * cw + ((cy & 1) ? Math.floor(cw / 2) : 0) + ph * 3;
      const sy = cy * ch + 2 + ph * 2;
      if (sy < y0 || sy >= y1) continue;
      const i = sy * W + (((sx % W) + W) % W);
      const b = biome[i];
      if (b === BIOME.OCEAN || b === BIOME.LAKE || b === BIOME.ICE) continue;
      const h = haze[region[i]];
      if (!h || hash2(cx, cy, 227 + ph) > h * 0.6) continue;
      const flip = (cx + cy + ph) % 2 ? 1 : -1;
      for (const [dx, dy, c] of stroke) {
        const x = (((sx + dx) % W) + W) % W;
        const y = sy + dy * flip;
        const j = y * W + x;
        if (y < 0 || y >= H) continue;
        const bj = biome[j];
        if (bj === BIOME.OCEAN || bj === BIOME.LAKE || bj === BIOME.ICE) continue;
        out.data[j] = c;
      }
    }
  }
  return out;
}

// ── AI banners ───────────────────────────────────────────────────────────────────────────────
/** Provinces run by an AI, with the anchor they plant their banner at. */
export function aiBanners(v: PlanetMapView): { region: RegionId; ai: NonNullable<ProvinceView['ai']>; color: ColorKey; lat: number; lon: number }[] {
  return v.provinces.filter((p) => p.ai && p.aiColor).map((p) => ({ region: p.region, ai: p.ai!, color: p.aiColor!, lat: p.lat, lon: p.lon }));
}

/** A banner's top-left for an anchor pixel (x, y): planted just up and left of the anchor's glyph row. */
export function bannerSpot(x: number, y: number, w: number, h: number): Px {
  return { x: x - w - 3, y: y - h + 3 };
}

// ── night lights ─────────────────────────────────────────────────────────────────────────────
export interface Light4 {
  x: number;
  y: number;
  c: number;
}

/** Night lights the planet adds: fusion plants glowing pink, rectenna receivers, DAC banks (map pixels, unwrapped). */
export function act4Lights(v: PlanetMapView, lod: { res: number }): Light4[] {
  const out: Light4[] = [];
  const px = (lat: number, lon: number) => ({ x: Math.floor((lon + 180) / lod.res), y: Math.floor((90 - lat) / lod.res) });
  for (const f of v.fusion) {
    if (f.status !== 'online') continue;
    const s = siteDef(f.siteId);
    const p = px(s.lat, s.lon);
    out.push({ x: p.x - 1, y: p.y + 2, c: C.pnk1 }, { x: p.x + 1, y: p.y + 2, c: C.white });
  }
  for (const r of v.rectennas) {
    if (r.status !== 'online') continue;
    const p = px(r.lat, r.lon);
    out.push({ x: p.x, y: p.y, c: C.pnk1 });
  }
  return out;
}
