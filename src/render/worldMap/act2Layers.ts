/**
 * Act II map layers that don't need Pixi: which sites are visible, their markers, subsea cables,
 * fiber and cosmetic shipping lanes. Everything here paints into PixelCanvases or returns pixel
 * tracks, so the MapScene and the headless preview tests share it.
 */
import { CABLES } from '../../content/network';
import { MINE_BY_ID } from '../../content/stack';
import { siteDef, siteOpen, type SiteDef } from '../../content/sites';
import type { FacilityType, GameState } from '../../sim/types';
import { routeBetween, type Router } from '../../world/routing';
import { C, type ColorKey } from '../palette';
import type { PixelCanvas } from '../pixels';
import {
  candidateCanvas,
  cloudMarkCanvas,
  homeCanvas,
  landingCanvas,
  megasiteCanvas,
  mineCanvas,
  restartSiteCanvas,
  sitePinCanvas,
  supplierCanvas,
} from '../sprites/mapIcons';

export interface Px {
  x: number;
  y: number;
}
export interface LodLike {
  W: number;
  H: number;
  res: number;
}
type LonLat = [number, number];

export const SUPPLIER_COLOR: Record<string, ColorKey> = {
  lumen: 'cyn4',
  kestrel: 'org1',
  stackwell: 'vio4',
  hanbit: 'pnk0',
  veldt: 'yel0',
  bondline: 'grn6',
};

// ── visibility ───────────────────────────────────────────────────────────────────────────────
export function actOf(s: GameState | null): { act: number; phase: number } {
  return { act: s?.act ?? 1, phase: s?.phase ?? 1 };
}

/** Whether a site shows on the map (Act II sites appear as the act unfolds). */
export function siteVisible(site: SiteDef, s: GameState | null): boolean {
  const { act, phase } = actOf(s);
  return siteOpen(site, act, phase);
}

// ── markers ──────────────────────────────────────────────────────────────────────────────────
export interface SiteMarker {
  /** Texture cache key. */
  key: string;
  make: () => PixelCanvas;
  /** Anchored by its bottom pixel (pins), so it sits above the site. */
  lift: boolean;
}

/** Is a landing station part of your network (a leased or own cable ends there)? */
export function landingActive(s: GameState | null, siteId: string): boolean {
  const net = s?.network;
  if (!net) return false;
  for (const id of net.leases) {
    const c = CABLES.find((x) => x.id === id);
    if (c && (c.a === siteId || c.b === siteId)) return true;
  }
  return net.own.some((c) => c.a === siteId || c.b === siteId);
}

export function mineMaterial(siteId: string): string {
  return MINE_BY_ID[siteId]?.material ?? 'copper';
}

export function mineOwned(s: GameState | null, siteId: string): boolean {
  return (s?.stack?.stakes?.[siteId] ?? 0) > 0;
}

/** The marker for a site. `title` = the main-menu tour (no home marker). */
export function siteMarker(site: SiteDef, s: GameState | null, hovered: boolean, title: boolean): SiteMarker {
  if (site.kind === 'supplier') {
    const col = SUPPLIER_COLOR[site.supplier ?? 'lumen'] ?? 'ink8';
    return { key: `chip:${col}`, make: () => supplierCanvas(col), lift: false };
  }
  if (site.kind === 'cloud') return { key: 'cloudmark', make: cloudMarkCanvas, lift: false };
  if (site.kind === 'landing') {
    const active = landingActive(s, site.id);
    return { key: `landing:${active}:${hovered}`, make: () => landingCanvas(active, hovered), lift: false };
  }
  if (site.kind === 'mine') {
    const mat = mineMaterial(site.id);
    const owned = mineOwned(s, site.id);
    return { key: `mine:${mat}:${owned}:${hovered}`, make: () => mineCanvas(mat, owned, hovered), lift: false };
  }
  if (s && s.company.homeSite === site.id && !title) return { key: 'home', make: homeCanvas, lift: true };
  if (s && (s.facilities.some((f) => f.siteId === site.id) || s.sites[site.id]?.grid.mw > 0 || s.sites[site.id]?.grid.pending.length))
    return { key: 'pin:cyn4', make: () => sitePinCanvas('cyn4'), lift: true };
  if (site.reactorMW) return { key: `restartsite:${hovered}`, make: () => restartSiteCanvas(hovered), lift: false };
  if (site.megasite) return { key: `megasite:${hovered}`, make: () => megasiteCanvas(hovered), lift: false };
  return { key: `cand:${hovered}`, make: () => candidateCanvas(hovered), lift: false };
}

export interface FacGlyph {
  type: FacilityType;
  building: boolean;
  upgrade: boolean;
  tier: number;
  n: number;
}

/** Facility glyphs under a site marker, grouped by type and state. */
export function siteGlyphs(s: GameState | null, siteId: string): FacGlyph[] {
  if (!s) return [];
  const groups = new Map<string, FacGlyph>();
  for (const f of s.facilities) {
    if (f.siteId !== siteId || f.type === 'hq') continue;
    const building = f.status === 'building';
    const upgrade = !building && !!f.upgrade;
    const tier = f.tier ?? 1;
    const k = `${f.type}|${building}|${upgrade}|${tier}`;
    const g = groups.get(k) ?? { type: f.type, building, upgrade, tier, n: 0 };
    g.n++;
    groups.set(k, g);
  }
  return [...groups.values()];
}

/** Rival campuses at a site, one entry per owner (building only if all of theirs are). */
export function rivalsAt(s: GameState | null, siteId: string): { owner: string; building: boolean; itMW: number }[] {
  const out = new Map<string, { owner: string; building: boolean; itMW: number }>();
  for (const r of s?.rivalBuilds ?? []) {
    if (r.siteId !== siteId) continue;
    const e = out.get(r.owner) ?? { owner: r.owner, building: true, itMW: 0 };
    if (r.status === 'online') e.building = false;
    e.itMW += r.itMW;
    out.set(r.owner, e);
  }
  return [...out.values()];
}

// ── tracks ───────────────────────────────────────────────────────────────────────────────────
function plot(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** A lon/lat polyline as a continuous run of map pixels (x unwrapped). */
export function trackPixels(path: LonLat[], lod: LodLike): Px[] {
  const pts = path.map(([lon, lat]) => ({ x: (lon + 180) / lod.res, y: (90 - lat) / lod.res }));
  const out: Px[] = [];
  const push = (x: number, y: number) => {
    const l = out[out.length - 1];
    if (!l || l.x !== x || l.y !== y) out.push({ x, y });
  };
  if (pts.length === 1) push(Math.round(pts[0].x), Math.round(pts[0].y));
  for (let i = 1; i < pts.length; i++) plot(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, push);
  return out;
}

/** Straight track between two sites, the short way around. */
export function siteTrack(a: string, b: string, lod: LodLike): Px[] {
  const A = siteDef(a);
  const B = siteDef(b);
  let lonB = B.lon;
  if (lonB - A.lon > 180) lonB -= 360;
  else if (A.lon - lonB > 180) lonB += 360;
  return trackPixels([[A.lon, A.lat], [lonB, B.lat]], lod);
}

const pathCache = new Map<string, LonLat[]>();

/** Cached sea path between two port sites; `compute` false = only return it if already known. */
export function seaPath(router: Router, a: string, b: string, closed: ReadonlySet<string> = new Set(), compute = true): LonLat[] | null {
  const key = `${a}|${b}|${[...closed].sort().join(',')}`;
  let p = pathCache.get(key);
  if (!p) {
    if (!compute) return null;
    const r = routeBetween(router, a, b, 'sea', closed);
    p = [...r.path, ...r.overland.slice(1)];
    pathCache.set(key, p);
  }
  return p;
}

// ── cables ───────────────────────────────────────────────────────────────────────────────────
export interface CableDraw {
  id: string;
  a: string;
  b: string;
  kind: 'system' | 'leased' | 'own';
  /** 0..1 laid so far (own cables under construction). */
  built: number;
  cut: boolean;
}

export function cableDraws(s: GameState | null): CableDraw[] {
  const net = s?.network;
  const leased = new Set(net?.leases ?? []);
  const cuts = net?.cuts ?? {};
  const day = s?.day ?? 0;
  const out: CableDraw[] = CABLES.map((c) => ({ id: c.id, a: c.a, b: c.b, kind: leased.has(c.id) ? 'leased' : 'system', built: 1, cut: (cuts[c.id] ?? -1) >= day }));
  for (const c of net?.own ?? []) {
    out.push({ id: c.id, a: c.a, b: c.b, kind: 'own', built: c.status === 'online' ? 1 : Math.max(0, Math.min(1, c.progress / Math.max(1, c.buildDays))), cut: (cuts[c.id] ?? -1) >= day });
  }
  return out;
}

/** Point on a track at fraction t (0..1). */
export function trackAt(track: Px[], t: number): Px {
  return track[Math.max(0, Math.min(track.length - 1, Math.floor(t * (track.length - 1))))];
}

/**
 * Paint the network into a full-map canvas (x wraps): every cable system faint, leased and own
 * cables bright, cut ones dark red (the scene blinks a bright copy on top), your fiber glowing.
 * `track` returns a cable's pixels, or null while its route isn't computed yet.
 */
export function paintNetwork(pc: PixelCanvas, lod: LodLike, s: GameState | null, track: (c: CableDraw) => Px[] | null): void {
  const W = lod.W;
  const set = (x: number, y: number, c: number) => pc.set(((x % W) + W) % W, y, c);
  const cables = cableDraws(s);
  const tracks = new Map(cables.map((c) => [c.id, track(c)]));
  // faint systems you don't use (dotted, like a chart's cable lines)
  for (const c of cables) {
    if (c.kind !== 'system' || c.cut) continue;
    tracks.get(c.id)?.forEach((p, i) => i % 3 === 0 && set(p.x, p.y, C.sea7));
  }
  // leased: a solid bright line
  for (const c of cables) {
    if (c.kind !== 'leased' || c.cut) continue;
    tracks.get(c.id)?.forEach((p) => set(p.x, p.y, C.cyn5));
  }
  // your own: a doubled line; the unlaid stretch is dashed
  for (const c of cables) {
    if (c.kind !== 'own' || c.cut) continue;
    const t = tracks.get(c.id);
    if (!t) continue;
    const laid = Math.floor(c.built * (t.length - 1));
    t.forEach((p, i) => {
      if (i <= laid) {
        set(p.x, p.y + 1, C.cyn2);
        set(p.x, p.y, C.cyn6);
      } else if (i % 4 < 2) set(p.x, p.y, C.ink8);
    });
  }
  for (const c of cables) {
    if (!c.cut) continue;
    tracks.get(c.id)?.forEach((p) => set(p.x, p.y, C.red1));
  }
  paintFiber(pc, lod, s);
}

/** Your overland fiber: a glowing line (online) or dashes (being laid). */
export function paintFiber(pc: PixelCanvas, lod: LodLike, s: GameState | null): void {
  const W = lod.W;
  const set = (x: number, y: number, c: number) => pc.set(((x % W) + W) % W, y, c);
  const fiber = s?.network?.fiber ?? [];
  const online = fiber.filter((f) => f.status === 'online').map((f) => siteTrack(f.a, f.b, lod));
  // glow first so crossing lines keep their cores
  for (const t of online) {
    for (let i = 0; i < t.length; i++) {
      const p = t[i];
      const q = t[Math.min(t.length - 1, i + 1)];
      const r = t[Math.max(0, i - 1)];
      const flat = Math.abs(q.x - r.x) >= Math.abs(q.y - r.y);
      if (flat) {
        set(p.x, p.y - 1, C.vio3);
        set(p.x, p.y + 1, C.vio2);
      } else {
        set(p.x - 1, p.y, C.vio3);
        set(p.x + 1, p.y, C.vio2);
      }
    }
  }
  for (const t of online) for (const p of t) set(p.x, p.y, C.pnk1);
  for (const f of fiber) {
    if (f.status === 'online') continue;
    siteTrack(f.a, f.b, lod).forEach((p, i) => {
      if (i % 5 >= 3) return;
      set(p.x + 1, p.y + 1, C.ink0);
      set(p.x, p.y, C.vio4);
    });
  }
}

/** A cut cable's bright blink frame. */
export function paintCut(pc: PixelCanvas, lod: LodLike, t: Px[]): void {
  const W = lod.W;
  for (const p of t) pc.set(((p.x % W) + W) % W, p.y, C.red3);
}

// ── cosmetic shipping lanes (Act II) ─────────────────────────────────────────────────────────
export interface Lane {
  a: string;
  b: string;
  cargo: ColorKey;
  hull: ColorKey;
  /** Phase offset 0..1 so ships don't move in lockstep. */
  phase: number;
}

/** Busy lanes that get extra cargo traffic once the boom is on: suppliers, mines and rivals. */
export const LANES: Lane[] = [
  { a: 'lumen-hsinchu', b: 'cls-losangeles', cargo: 'cyn4', hull: 'ink4', phase: 0.1 },
  { a: 'bondline-penang', b: 'cls-marseille', cargo: 'grn6', hull: 'blu2', phase: 0.55 },
  { a: 'cls-singapore', b: 'cls-chikura', cargo: 'red3', hull: 'ink4', phase: 0.3 },
  { a: 'veldt-veldhoven', b: 'cls-virginia', cargo: 'yel0', hull: 'blu2', phase: 0.75 },
  { a: 'mine-pilbara', b: 'mine-neon', cargo: 'snd4', hull: 'red1', phase: 0.2 },
  { a: 'mine-helium', b: 'cls-singapore', cargo: 'sky4', hull: 'ink3', phase: 0.65 },
  { a: 'mine-atacama', b: 'hanbit-icheon', cargo: 'pnk0', hull: 'ink4', phase: 0.45 },
  { a: 'cls-losangeles', b: 'cls-sydney', cargo: 'vio4', hull: 'blu2', phase: 0.9 },
];

/** Sea part of a lane (port to port) — the first-mile overland leg is dropped. */
export function lanePath(router: Router, lane: Lane, closed: ReadonlySet<string>, compute = true): LonLat[] | null {
  const p = seaPath(router, lane.a, lane.b, closed, compute);
  if (!p) return null;
  // drop the site-to-port legs at both ends
  const sea = p.slice(1, p.length - 1);
  return sea.length >= 2 ? sea : p;
}

/** Position along a lane at game time `t` (days): out and back, ~700 km/day. */
export function laneShip(track: Px[], days: number, lane: Lane, kmPerPx: number): { p: Px; dir: number } | null {
  if (track.length < 2) return null;
  const legDays = Math.max(8, (track.length * kmPerPx) / 700);
  let f = (days / legDays + lane.phase * 2) % 2;
  let dir = 1;
  if (f > 1) {
    f = 2 - f;
    dir = -1;
  }
  const i = Math.max(0, Math.min(track.length - 1, Math.floor(f * (track.length - 1))));
  const a = track[Math.max(0, i - 2)];
  const b = track[Math.min(track.length - 1, i + 2)];
  const east = b.x >= a.x;
  return { p: track[i], dir: east === (dir > 0) ? 1 : -1 };
}
