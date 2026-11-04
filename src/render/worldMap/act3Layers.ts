/**
 * Act III map layers that don't need Pixi: the Charter's sites (HQ, megaprojects, launch pads),
 * megaproject ground patches that grow with each stage, intercontinental HVDC links, the orbital
 * test's ground track and the liftoff animation's timing. Everything here paints into
 * PixelCanvases or returns plain numbers, so the MapScene and the headless previews share it.
 */
import { CONTRACT_KINDS } from '../../content/charter';
import { BIOME } from '../../content/mapcodes';
import type { SiteDef } from '../../content/sites';
import { builderColor, charterMapView, type AnchorView, type CharterMapView, type HvdcView, type MegaView } from '../../sim/charterView';
import type { ContractKind, GameState } from '../../sim/types';
import type { MapLod } from '../../world/mapData';
import { C, type ColorKey } from '../palette';
import { bayer, fbm, hash2, PixelCanvas } from '../pixels';
import { charterHqCanvas, launchCandidateCanvas, launchPadCanvas, megaMarkerCanvas } from '../sprites/charterIcons';
import { trackPixels, type Px } from './act2Layers';

// ── the view, memoised on a cheap key ────────────────────────────────────────────────────────
let memo: { s: GameState | null; key: string; view: CharterMapView } | null = null;

/** A cheap fingerprint of everything the Charter map view reads (changes at most once a game day, or on awards and cancellations). */
export function charterKey(s: GameState | null): string {
  const c = s?.charter;
  if (!s || !c) return '';
  let h = 7;
  for (const p of c.projects) h = (Math.imul(h, 31) + p.id.length * 3 + (p.status === 'done' ? 1 : p.status === 'cancelled' ? 2 : 5) + p.size) | 0;
  return `${s.day}|${c.projects.length}|${h}|${c.phase}|${s.flags.liftoff ?? ''}`;
}

/** The Charter's map view, recomputed only when its key changes. */
export function charterView(s: GameState | null): CharterMapView {
  const key = charterKey(s);
  if (memo && memo.s === s && memo.key === key) return memo.view;
  const view = charterMapView(s);
  memo = { s, key, view };
  return view;
}

/** Act III layers are on (the Charter exists). */
export function act3On(s: GameState | null): boolean {
  return !!s && (s.act ?? 1) >= 3 && !!s.charter;
}

// ── sites ────────────────────────────────────────────────────────────────────────────────────
/** The launch site with a launch-complex contract (building or done), if any. */
export function chosenLaunch(s: GameState | null): string | null {
  for (const p of s?.charter?.projects ?? []) if (p.kind === 'launch' && p.status !== 'cancelled') return p.where;
  return null;
}

export function isAct3Site(site: SiteDef): boolean {
  return site.kind === 'charter' || site.kind === 'mega' || site.kind === 'launch';
}

/** The kind a megaproject site is known for: the most GW online, else what is being built, else its first suitable kind. */
export function mainKind(mv: MegaView): ContractKind {
  let best: ContractKind | null = null;
  let gw = 0;
  for (const [k, v] of Object.entries(mv.gwByKind) as [ContractKind, number][]) {
    if (v > gw) {
      gw = v;
      best = k;
    }
  }
  return best ?? mv.building[0]?.kind ?? mv.kinds[0] ?? 'solar';
}

export interface Act3Marker {
  key: string;
  make: () => PixelCanvas;
  lift: boolean;
}

/** Markers for the Charter HQ, megaproject sites and launch sites. `flying` hides the rocket on the pad while it lifts off. */
export function act3Marker(site: SiteDef, s: GameState | null, hovered: boolean, opts: { flying?: boolean } = {}): Act3Marker {
  if (site.kind === 'charter') return { key: `charterhq:${hovered}`, make: () => charterHqCanvas(hovered), lift: false };
  const v = charterView(s);
  if (site.kind === 'mega') {
    const mv = v.megas.find((m) => m.siteId === site.id);
    const stage = mv?.stage ?? 0;
    const kind = mv ? mainKind(mv) : (site.mega?.[0] ?? 'solar');
    return { key: `megamark:${kind}:${stage}:${hovered}`, make: () => megaMarkerCanvas(kind, stage, hovered), lift: false };
  }
  // launch sites
  if (v.launch?.siteId === site.id) {
    const building = v.launch.status === 'building';
    const rocket = !building && !opts.flying;
    const builder = builderColor(v.launch.builder);
    return { key: `launchpad:${building}:${rocket}:${hovered}:${builder}`, make: () => launchPadCanvas({ building, rocket, hover: hovered, builder }), lift: true };
  }
  return { key: `launchcand:${hovered}`, make: () => launchCandidateCanvas(hovered), lift: false };
}

/** Megaproject sites get a name label at close zoom once something is online there. */
export function act3Label(site: SiteDef, s: GameState | null): boolean {
  if (site.kind !== 'mega') return false;
  return (charterView(s).megas.find((m) => m.siteId === site.id)?.stage ?? 0) >= 1;
}

/** Builders with something under construction at a megaproject (one crane each, at most three). */
export function megaCranes(mv: MegaView): ColorKey[] {
  const out: ColorKey[] = [];
  for (const b of mv.building) {
    const col = builderColor(b.builder);
    if (!out.includes(col)) out.push(col);
  }
  return out.slice(0, 3);
}

// ── megaproject ground patches ───────────────────────────────────────────────────────────────
/** Patch radius (px at 0.25°/px) for a number of GW average: 20 GW ≈ 5 px, 80 ≈ 8.5, 200 ≈ 12. */
const patchRadius = (gw: number, res: number) => ((2.2 + 0.7 * Math.sqrt(Math.max(0, gw))) * 0.25) / res;

const ASPECT: Partial<Record<ContractKind, [number, number]>> = {
  solar: [1.45, 0.75],
  wind: [1.15, 0.9],
  nuclear: [1.2, 0.7],
  hydro: [1.0, 0.85],
  geo: [1.1, 0.85],
  ffleet: [1.2, 0.8],
};

interface Blob {
  kind: ContractKind;
  cx: number;
  cy: number;
  r: number;
  /** Planned (under construction): a dotted outline only. */
  planned: boolean;
}

function megaBlobs(mv: MegaView, res: number): Blob[] {
  const online = (Object.entries(mv.gwByKind) as [ContractKind, number][]).filter(([, gw]) => gw > 0).sort((a, b) => b[1] - a[1]);
  const blobs: Blob[] = [];
  // the main kind sits on the site; others gather round it (east, then south-west, then north-west)
  const angles = [0, 2.3, 4.0, 5.2];
  online.forEach(([kind, gw], i) => {
    const r = Math.max(2, patchRadius(gw, res));
    if (i === 0) blobs.push({ kind, cx: 0, cy: 0, r, planned: false });
    else {
      const d = blobs[0].r * 0.85 + r * 0.75;
      blobs.push({ kind, cx: Math.cos(angles[i - 1]) * d * 1.2, cy: Math.sin(angles[i - 1]) * d * 0.8, r, planned: false });
    }
  });
  // planned extents for what's being built (kinds not online yet; online kinds just grow)
  const plannedKinds = new Map<ContractKind, number>();
  for (const b of mv.building) {
    const def = CONTRACT_KINDS[b.kind];
    plannedKinds.set(b.kind, (plannedKinds.get(b.kind) ?? 0) + (def?.sizes[b.size - 1] ?? 20));
  }
  for (const [kind, gw] of plannedKinds) {
    const have = mv.gwByKind[kind] ?? 0;
    const existing = blobs.find((b) => b.kind === kind && !b.planned);
    const r = Math.max(2, patchRadius(have + gw, res));
    if (existing) blobs.push({ ...existing, r, planned: true });
    else if (!blobs.length) blobs.push({ kind, cx: 0, cy: 0, r, planned: true });
    else {
      // the next free spot round the main blob
      const spots = new Set(blobs.map((b) => `${Math.round(b.cx)},${Math.round(b.cy)}`)).size;
      const d = blobs[0].r * 0.85 + r * 0.75;
      const a = angles[(spots - 1) % angles.length];
      blobs.push({ kind, cx: Math.cos(a) * d * 1.2, cy: Math.sin(a) * d * 0.8, r, planned: true });
    }
  }
  return blobs;
}

/** Texture key for a site's patch at a resolution (radii quantised to whole pixels). */
export function megaPatchKey(mv: MegaView, res: number): string {
  return megaBlobs(mv, res)
    .map((b) => `${b.kind}${b.planned ? 'p' : ''}${Math.round(b.r)}@${Math.round(b.cx)},${Math.round(b.cy)}`)
    .join(';');
}

export interface MegaPatch {
  pc: PixelCanvas;
  /** Offset from the site's pixel to the canvas's top-left corner. */
  ox: number;
  oy: number;
}

/**
 * Paint a megaproject's footprint around its site: rows of panels on the sand, a grid of
 * turbines (out at sea for offshore fields), reactor domes, a reservoir behind its dam, well pads
 * with steam. Planned extents get a dotted survey line. Only land pixels are painted (only sea
 * pixels for an offshore site). Null when there's nothing to show.
 */
export function megaPatchCanvas(site: SiteDef, mv: MegaView, lod: MapLod): MegaPatch | null {
  const blobs = megaBlobs(mv, lod.res);
  if (!blobs.length) return null;
  const sx = Math.floor((site.lon + 180) / lod.res);
  const sy = Math.floor((90 - site.lat) / lod.res);
  const ext = Math.ceil(Math.max(...blobs.map((b) => Math.max(Math.abs(b.cx), Math.abs(b.cy)) + b.r * 1.6))) + 2;
  const size = ext * 2 + 1;
  const pc = new PixelCanvas(size, size);
  const W = lod.W;
  const biomeAt = (x: number, y: number) => (y < 0 || y >= lod.H ? BIOME.OCEAN : lod.biome[y * W + (((x % W) + W) % W)]);
  const offshore = biomeAt(sx, sy) === BIOME.OCEAN;
  const ok = (x: number, y: number) => {
    const b = biomeAt(sx + x - ext, sy + y - ext);
    return offshore ? b === BIOME.OCEAN : b !== BIOME.OCEAN && b !== BIOME.LAKE && b !== BIOME.ICE;
  };
  const seed = site.id.length * 13 + Math.floor(site.lon);
  /** 0 inside the blob's core … 1 at its edge (noisy), > 1 outside. */
  const field = (b: Blob, x: number, y: number) => {
    const [ax, ay] = ASPECT[b.kind] ?? [1, 1];
    const dx = (x - ext - b.cx) / (b.r * ax);
    const dy = (y - ext - b.cy) / (b.r * ay);
    const n = fbm((sx + x) / 3.1, (sy + y) / 3.1, seed + 5, 2) - 0.5;
    return Math.sqrt(dx * dx + dy * dy) + n * 0.45;
  };
  // planned extents first, so finished ground paints over them
  for (const b of blobs) {
    if (!b.planned) continue;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!ok(x, y)) continue;
        const f = field(b, x, y);
        if (f > 1 || f < 0.82) continue;
        if ((x + y) % 3 === 0) pc.set(x, y, offshore ? C.sea8 : C.snd8);
        else if ((x + y) % 3 === 1 && !pc.get(x, y)) pc.set(x, y, offshore ? C.sea4 : C.snd3);
      }
    }
    // cleared ground inside the line
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!ok(x, y) || pc.get(x, y)) continue;
        if (field(b, x, y) < 0.8 && bayer(x, y) < 3) pc.set(x, y, offshore ? C.sea5 : C.snd7);
      }
    }
  }
  for (const b of blobs) {
    if (b.planned) continue;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!ok(x, y)) continue;
        const f = field(b, x, y);
        if (f > 1) continue;
        const c = patchPixel(b.kind, x, y, f, offshore, seed);
        if (c >= 0) pc.set(x, y, c);
      }
    }
    if (b.kind === 'hydro') damWall(pc, b, ext, ok);
  }
  return { pc, ox: -ext, oy: -ext };
}

/** One pixel of a kind's ground pattern (-1 = leave the terrain showing; 0 = clear it). */
function patchPixel(kind: ContractKind, x: number, y: number, f: number, offshore: boolean, seed: number): number {
  switch (kind) {
    case 'solar': {
      // blocks of panel rows (two pixels of panel, one of sand) between service roads; glints catch the sun
      if (x % 8 === 4) return f < 0.7 ? C.snd7 : -1;
      const row = y % 3;
      if (row === 2) return f < 0.6 && x % 8 === 0 && y % 6 === 2 ? C.grn5 : -1;
      if (row === 1) return C.blu2;
      return hash2(x, y, seed) < 0.12 ? C.sky4 : C.blu3;
    }
    case 'wind': {
      // turbines on a staggered grid: a white rotor over its dark tower shadow
      const gx = (x + (Math.floor(y / 3) % 2) * 2) % 4;
      const gy = y % 3;
      if (gx === 0 && gy === 0) return C.white;
      if (gx === 0 && gy === 1) return offshore ? C.sea8 : C.ink3;
      if (gx === 1 && gy === 1) return offshore ? C.sea3 : -1;
      return -1;
    }
    case 'nuclear': {
      // reactor domes in neat rows with the Little Sun band, cooling ponds between
      const gx = x % 5;
      const gy = y % 4;
      if (gy === 0 && (gx === 1 || gx === 2)) return gx === 1 ? C.ink9 : C.ink8;
      if (gy === 1 && gx >= 1 && gx <= 2) return gx === 1 ? C.yel0 : C.ink6;
      if (gy === 2 && gx === 4 && f < 0.8) return C.sea6;
      if (gy === 3 && gx >= 1 && gx <= 3) return f < 0.95 ? C.ink7 : -1;
      return -1;
    }
    case 'hydro': {
      // the reservoir: deep in the middle, rippled near the edge
      if (f > 0.85) return C.sea5;
      if (bayer(x, y) < 2) return C.sea7;
      return f < 0.5 ? C.sea4 : C.sea5;
    }
    case 'geo': {
      // well pads joined by pipes, steam curling from each
      const gx = x % 4;
      const gy = y % 4;
      if (gy === 2 && gx <= 1) return C.snd3;
      if (gy === 2 && gx === 2) return C.org1;
      if (gy === 1 && gx === 1) return C.white;
      if (gy === 0 && gx === 2 && hash2(x, y, seed + 1) < 0.6) return C.ice2;
      if (gy === 3) return f < 0.9 ? C.ink6 : -1;
      return -1;
    }
    case 'ffleet': {
      // Act IV: fusion halls in rows, a plasma window in each, coolant channels between
      const gx = x % 5;
      const gy = y % 4;
      if (gy === 0 && gx <= 2) return C.ink9;
      if (gy === 1 && gx <= 2) return gx === 1 ? C.pnk1 : C.ink6;
      if (gy === 1 && gx === 4 && f < 0.85) return C.cyn5;
      if (gy === 3 && gx <= 3) return f < 0.9 ? C.ink7 : -1;
      return -1;
    }
    default:
      return -1;
  }
}

/** A dam across the bottom of a reservoir blob, with foam below it. */
function damWall(pc: PixelCanvas, b: Blob, ext: number, ok: (x: number, y: number) => boolean) {
  for (let x = 0; x < pc.w; x++) {
    // lowest water pixel in this column
    let bottom = -1;
    for (let y = pc.h - 1; y >= 0; y--) {
      const c = pc.get(x, y);
      if (c === C.sea4 || c === C.sea5 || c === C.sea7) {
        bottom = y;
        break;
      }
    }
    if (bottom < 0 || Math.abs(x - ext - b.cx) > b.r * 0.6) continue;
    if (ok(x, bottom + 1)) pc.set(x, bottom + 1, C.ink8);
    if (ok(x, bottom + 2) && x % 2) pc.set(x, bottom + 2, C.foam);
  }
}

/**
 * Night lights for a painted megaproject patch: red aviation lights on every turbine, warm
 * lights at reactor domes, battery yards, dams and well heads. Coordinates are relative to the
 * patch canvas; the renderer only shows them on the night side.
 */
export function megaPatchLights(pc: PixelCanvas): { x: number; y: number; c: number }[] {
  const out: { x: number; y: number; c: number }[] = [];
  for (let y = 0; y < pc.h; y++) {
    for (let x = 0; x < pc.w; x++) {
      const c = pc.get(x, y);
      if (c === C.white) out.push({ x, y, c: C.red3 });
      else if (c === C.ink9) out.push({ x, y, c: C.yel1 });
      else if (c === C.grn5 || c === C.org1) out.push({ x, y, c: C.yel0 });
      else if (c === C.foam) out.push({ x, y, c: C.yel2 });
      else if (c === C.pnk1) out.push({ x, y, c: C.pnk1 });
    }
  }
  return out;
}

// ── HVDC links ───────────────────────────────────────────────────────────────────────────────
export interface HvdcTrack {
  pts: Px[];
  /** Per pixel: over the sea (subsea cable) rather than land. */
  sea: boolean[];
}

const RAD = Math.PI / 180;

/** Great-circle polyline between two [lat, lon] points, longitudes unwrapped to stay continuous. */
export function greatCircle(a: [number, number], b: [number, number]): [number, number][] {
  const v = ([lat, lon]: [number, number]) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
  const A = v(a);
  const B = v(b);
  const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const om = Math.acos(dot);
  const n = Math.max(2, Math.ceil(om / RAD / 2));
  const out: [number, number][] = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s0 = om < 1e-6 ? 1 - t : Math.sin((1 - t) * om) / Math.sin(om);
    const s1 = om < 1e-6 ? t : Math.sin(t * om) / Math.sin(om);
    const x = A[0] * s0 + B[0] * s1;
    const y = A[1] * s0 + B[1] * s1;
    const z = A[2] * s0 + B[2] * s1;
    const lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
    let lon = Math.atan2(y, x) / RAD;
    if (prevLon !== null) {
      while (lon - prevLon > 180) lon -= 360;
      while (prevLon - lon > 180) lon += 360;
    }
    prevLon = lon;
    out.push([lon, lat]);
  }
  return out;
}

/** An HVDC route's pixels at a LOD, with which stretches run under the sea. */
export function hvdcTrack(route: { a: [number, number]; b: [number, number] }, lod: MapLod): HvdcTrack {
  const pts = trackPixels(greatCircle(route.a, route.b), lod);
  const W = lod.W;
  const sea = pts.map((p) => {
    const y = Math.max(0, Math.min(lod.H - 1, p.y));
    const b = lod.biome[y * W + (((p.x % W) + W) % W)];
    return b === BIOME.OCEAN;
  });
  // ignore one-pixel slivers of land or sea (islands, inlets) so the style doesn't flicker
  for (let i = 1; i < sea.length - 1; i++) if (sea[i - 1] === sea[i + 1] && sea[i] !== sea[i - 1]) sea[i] = sea[i - 1];
  return { pts, sea };
}

export interface HvdcDraw {
  id: string;
  track: HvdcTrack;
  online: boolean;
  /** 0..1 built. */
  progress: number;
  builder: ColorKey;
}

/** Fingerprint of the HVDC layer (progress in 40ths). */
export function hvdcKey(v: CharterMapView): string {
  return v.hvdc.map((h) => `${h.route.id}:${h.status}:${Math.floor(h.progress * 40)}`).join(',');
}

export function hvdcDraws(v: CharterMapView, lod: MapLod, track: (h: HvdcView) => HvdcTrack = (h) => hvdcTrack(h.route, lod)): HvdcDraw[] {
  return v.hvdc.map((h) => ({ id: h.route.id, track: track(h), online: h.status === 'online', progress: h.status === 'online' ? 1 : h.progress, builder: builderColor(h.builder) }));
}

/** Perpendicular offset for a thick line at track index i: (0,1) for flat stretches, (1,0) for steep ones. */
function perp(pts: Px[], i: number): [number, number] {
  const a = pts[Math.max(0, i - 2)];
  const b = pts[Math.min(pts.length - 1, i + 2)];
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? [0, 1] : [1, 0];
}

/**
 * Paint HVDC links into a full-map canvas (x wraps). Overland stretches are thick gold lines
 * over a drop shadow, with bright pylon pips; subsea stretches a bright core with a pale glow in
 * the water.
 * Under construction: the built part is an unlit grey line, the rest dashes. The coarse LOD
 * (> 0.3°/px) gets single-pixel lines with a drop shadow.
 */
export function paintHvdc(pc: PixelCanvas, lod: { W: number; H: number; res?: number }, draws: HvdcDraw[]): void {
  const W = lod.W;
  const thin = (lod.res ?? 0.25) > 0.3;
  const set = (x: number, y: number, c: number) => pc.set(((x % W) + W) % W, y, c);
  // pass 1: dark edges and glows
  for (const d of draws) {
    const { pts, sea } = d.track;
    const built = Math.floor(d.progress * (pts.length - 1));
    pts.forEach((p, i) => {
      const [px, py] = perp(pts, i);
      const done = i <= built;
      if (sea[i]) {
        if (done && d.online && !thin) {
          set(p.x - px, p.y - py, C.sea8);
          if (i % 2 === 0) set(p.x + px, p.y + py, C.sea7);
        }
        return;
      }
      if (thin) {
        if (done || i % 4 < 2) set(p.x + 1, p.y + 1, C.ink0);
        return;
      }
      // a drop shadow under the two-pixel band (no top edge: it reads lighter on busy terrain)
      if (!done) {
        if (i % 4 < 2) set(p.x + 1, p.y + 1, C.ink0);
        return;
      }
      set(p.x + px * 2, p.y + py * 2, C.ink0);
      set(p.x + px + 1, p.y + py + 1, C.ink0);
    });
  }
  // pass 2: cores
  for (const d of draws) {
    const { pts, sea } = d.track;
    const built = Math.floor(d.progress * (pts.length - 1));
    pts.forEach((p, i) => {
      const [px, py] = perp(pts, i);
      const done = i <= built;
      if (sea[i]) {
        if (done) set(p.x, p.y, d.online ? (i % 4 === 0 ? C.yel2 : C.yel1) : i % 2 ? C.ink8 : C.ink6);
        else if (i % 3 === 0) set(p.x, p.y, C.sea7);
        return;
      }
      if (!done) {
        if (i % 4 < 2) set(p.x, p.y, C.ink8);
        return;
      }
      if (thin) {
        set(p.x, p.y, d.online ? C.yel1 : C.ink8);
        return;
      }
      if (d.online) {
        set(p.x, p.y, C.yel1);
        set(p.x + px, p.y + py, C.org1);
        // pylons: a bright insulator pip every few pixels
        if (i % 6 === 0) set(p.x, p.y, C.white);
      } else {
        set(p.x, p.y, C.ink9);
        set(p.x + px, p.y + py, C.ink6);
        if (i % 6 === 0) set(p.x, p.y, C.ink7);
      }
    });
  }
}

// ── the orbital test's ground track ──────────────────────────────────────────────────────────
const INCLINATION = 51.6 * RAD;
const ORBIT_LON0 = -40;

/** Ground point of the test satellite at orbit angle u (radians): a sinusoid across the map. */
export function orbitPoint(u: number): { lon: number; lat: number } {
  const lat = Math.asin(Math.sin(INCLINATION) * Math.sin(u)) / RAD;
  const lon = ORBIT_LON0 + Math.atan2(Math.cos(INCLINATION) * Math.sin(u), Math.cos(u)) / RAD;
  return { lon: ((((lon + 180) % 360) + 360) % 360) - 180, lat };
}

/** Orbit angle at a moment (seconds of real time): one lap every ~48 s. */
export function orbitAngle(seconds: number): number {
  return ((seconds / 48) % 1) * Math.PI * 2;
}

/** The faint dotted ground track, painted into a full-map canvas. */
export function paintOrbit(pc: PixelCanvas, lod: { W: number; H: number; res: number }): void {
  const W = lod.W;
  const steps = W * 3;
  let last = '';
  let n = 0;
  for (let i = 0; i < steps; i++) {
    const p = orbitPoint((i / steps) * Math.PI * 2);
    const x = Math.floor((p.lon + 180) / lod.res);
    const y = Math.floor((90 - p.lat) / lod.res);
    const k = `${x},${y}`;
    if (k === last) continue;
    last = k;
    // dashes (two on, three off) so it doesn't read as a cable route
    if (n++ % 5 < 2) pc.set(((x % W) + W) % W, y, C.ice1);
  }
}

// ── the liftoff ──────────────────────────────────────────────────────────────────────────────
/** Game days after liftoff during which the launch keeps replaying on the map. */
export const LIFTOFF_DAYS = 30;

export function liftoffActive(v: CharterMapView, day: number): boolean {
  return v.liftoff !== null && !!v.launch && day >= v.liftoff && day - v.liftoff <= LIFTOFF_DAYS;
}

export interface LaunchFrame {
  /** Rocket offset above the pad (px), or null when it's off the top / not shown. */
  rise: number | null;
  /** Flame frame. */
  flame: number;
  /** Smoke puffs and fire around/behind the rocket, relative to the pad's rocket base. */
  puffs: { dx: number; dy: number; c: number }[];
}

/** A liftoff loop (6 s): ignition, a climb that speeds up, the trail drifting away. */
export const LAUNCH_LOOP = 6;

export function launchFrame(t: number): LaunchFrame {
  const time = ((t % LAUNCH_LOOP) + LAUNCH_LOOP) % LAUNCH_LOOP;
  const puffs: LaunchFrame['puffs'] = [];
  const flame = Math.floor(time * 12) % 2;
  /** The exhaust cloud billowing out of the flame trench, k = 0..1 grown, fade = 0..1 thinned. */
  const cloud = (k: number, fade: number) => {
    const reach = 2 + Math.round(k * 7);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const edge = Math.abs(dx) / reach;
        const keep = hash2(dx + 20, dy + 5, Math.floor(time * 6)) < 0.9 - fade * 0.6 - edge * 0.35 - Math.abs(dy) * 0.2;
        if (!keep || (dy === -1 && Math.abs(dx) < 2)) continue;
        puffs.push({ dx, dy: dy + 1, c: fade > 0.6 ? C.ink7 : edge < 0.4 ? C.white : edge < 0.75 ? C.ink9 : C.ink8 });
      }
    }
  };
  if (time < 0.8) {
    cloud(time / 0.8, 0);
    puffs.push({ dx: 0, dy: 0, c: flame ? C.yel2 : C.yel1 });
    return { rise: 0, flame, puffs };
  }
  const fly = time - 0.8;
  const rise = Math.round(fly * fly * 9);
  // the cloud left at the pad drifts and thins out
  if (fly < 3.2) cloud(1, fly / 3.2);
  // the trail: fire under the rocket, then white smoke, wider and wavier the older it is
  for (let y = 0; y < Math.min(rise, 72); y++) {
    const age = y / Math.max(1, rise);
    const c = y < 2 ? C.yel2 : y < 4 ? C.yel1 : y < 7 ? C.org2 : age > 0.75 ? C.ink7 : C.ink9;
    const wobble = Math.round(Math.sin((rise - y) * 0.3 + time * 1.5) * Math.min(1.5, y / 18));
    if (y > 6 && hash2(y, Math.floor(time * 5), 5) > 0.92 - age * 0.5) continue;
    puffs.push({ dx: wobble, dy: -(rise - y) + 10, c });
    if (y > 14 && y % 3 === 0) puffs.push({ dx: wobble + (y % 2 ? 1 : -1), dy: -(rise - y) + 10, c: age > 0.75 ? C.ink6 : C.ink8 });
  }
  return { rise: rise < 110 ? rise : null, flame, puffs };
}

// ── anchors ──────────────────────────────────────────────────────────────────────────────────
export interface AnchorGlyph {
  kind: ContractKind;
  builder: ColorKey;
  building: boolean;
}

/** Glyphs for one bloc's anchor: one per kind, builder and state (most items are one of a kind anyway). */
export function anchorGlyphs(a: AnchorView): AnchorGlyph[] {
  const out: AnchorGlyph[] = [];
  const seen = new Set<string>();
  for (const it of a.items) {
    const g = { kind: it.kind, builder: builderColor(it.builder), building: it.status === 'building' };
    const k = `${g.kind}|${g.builder}|${g.building}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(g);
  }
  return out.slice(0, 6);
}

export function anchorKey(v: CharterMapView): string {
  return v.anchors.map((a) => `${a.region}:${anchorGlyphs(a).map((g) => `${g.kind}${g.builder}${g.building ? 'b' : ''}`).join('.')}`).join(',');
}


// ── layout shared by the scene and the previews ──────────────────────────────────────────────
/** Where a marker's top-left goes for a site pixel (x, y). */
export function markerOrigin(x: number, y: number, w: number, h: number, lift: boolean): Px {
  return { x: x - Math.floor(w / 2), y: y - (lift ? h - 1 : Math.floor(h / 2)) };
}

/** Builder cranes stand in a row just right of a megaproject's marker, feet level with its base. */
export function craneSpots(x: number, y: number, markerW: number, markerH: number, sizes: { w: number; h: number }[]): Px[] {
  const o = markerOrigin(x, y, markerW, markerH, false);
  let cx = o.x + markerW - 1;
  const base = o.y + markerH;
  return sizes.map((s) => {
    const p = { x: cx, y: base - s.h };
    cx += s.w - 2;
    return p;
  });
}

/** A row of glyphs centred on (x, y), bottoms aligned a little below the point. */
export function rowSpots(x: number, y: number, sizes: { w: number; h: number }[]): Px[] {
  const total = sizes.reduce((n, s) => n + s.w - 1, 0) + 1;
  let cx = x - Math.floor(total / 2);
  return sizes.map((s) => {
    const p = { x: cx, y: y + 4 - s.h };
    cx += s.w - 1;
    return p;
  });
}

/** Where the space-solar craft hangs over a ground station (top-left), and its beam (top, length). */
export function spaceSolarSpot(x: number, y: number, w: number, h: number, bob: number): { craft: Px; beam: { x: number; y: number; len: number } } {
  const top = y - 34 + bob;
  return { craft: { x: x - Math.floor(w / 2), y: top }, beam: { x: x - 1, y: top + h - 1, len: Math.max(4, y - 12 - (top + h - 1)) } };
}
