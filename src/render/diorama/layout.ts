/**
 * Where everything stands in a campus diorama. Pure (no Pixi), so the scene and the headless
 * preview test lay sites out identically.
 *
 * Build sites: substation · HQ · your facilities (tier-sized, multi-plot ones wider) · empty
 * plots · rival campuses behind a property line. Other sites (suppliers, mines, landing
 * stations) are view-only rows of set pieces.
 */
import { siteDef, type SiteDef } from '../../content/sites';
import { FACILITIES } from '../../content/facilities';
import type { Facility, GameState, RivalBuild } from '../../sim/types';
import { facilitySize, type ArtType } from './sizes';
import { EMPTY_H } from './art';
import { pieceSize, rivalSize, sitePieces, type PieceSpec } from './industry';
import { act3Plan, type Scenery } from './act3Pieces';

export const GAP = 10;
export const EMPTY_W = 70;
export const EDGE = 24;

export interface LayoutItem {
  kind: 'facility' | 'empty' | 'substation' | 'rival' | 'piece';
  x: number;
  w: number;
  h: number;
  type?: ArtType;
  facility?: Facility;
  rival?: RivalBuild;
  piece?: PieceSpec;
  /** Tier the art is drawn at (an upgrade under way draws at the target size). */
  tier: number;
  /** Ordinal among empty plots. */
  emptyIndex?: number;
}

export interface CampusLayout {
  items: LayoutItem[];
  /** Scene width in pixels (at least the viewport). */
  width: number;
  /** No plots, no building: suppliers, mines, landing stations. */
  viewOnly: boolean;
  /** Distant skyline density behind the campus (0 = none … 3 = gigawatt). */
  skyline: number;
  /** Landing stations: the ground turns into a beach from this x. */
  beachFrom?: number;
  cableX?: number;
  /** x of the fence between your land and a rival's. */
  propertyLine?: number;
  // ── Act III ──
  /** What the bands behind the pieces show (Geneva, a megaproject to the horizon, a launch site). */
  scenery?: Scenery;
  /** Charter HQ: the promenade ends at a quay and Lake Geneva begins at this x. */
  lakeFrom?: number;
  /** Offshore megaproject: open sea instead of land (no road, no lamps, no walkers). */
  offshore?: boolean;
}

export const tierOf = (f: Facility) => f.tier ?? 1;

/** Top of an item's sprite for a ground line at groundY (empty plots dip into the ground strip). */
export const itemTop = (it: LayoutItem, groundY: number) => groundY + 1 - it.h + (it.kind === 'empty' ? 4 : 0);

/** Plots a facility takes (HQ none; reactor and fab two; campus four). */
export const plotsOf = (f: Facility) => (f.type === 'hq' ? 0 : FACILITIES[f.type]?.slots ?? 1);

/** Layout for a site as seen in `state` (null state = empty site). */
export function campusLayout(s: GameState | null, siteId: string, viewW: number): CampusLayout {
  const site = siteDef(siteId);
  if (site.kind === 'charter' || site.kind === 'mega' || site.kind === 'launch' || site.kind === 'moon') return act3Layout(s, site, viewW);
  // Act V: the yards, Ring One, the Aurora habitat and the asteroids
  if (site.kind === 'yards' || site.kind === 'ring' || site.kind === 'habitat' || site.kind === 'asteroid') return act3Layout(s, site, viewW);
  if (site.kind !== 'build') return viewOnlyLayout(site, viewW);
  const items: LayoutItem[] = [];
  let x = EDGE;
  const push = (it: Omit<LayoutItem, 'x'>) => {
    items.push({ ...it, x });
    x += it.w + GAP;
  };
  const facs = s ? s.facilities.filter((f) => f.siteId === siteId) : [];
  const ss = s?.sites[siteId];
  const grid = ss ? ss.grid.mw + ss.grid.pending.length : 0;
  if (grid > 0) {
    const [w, h] = facilitySize('substation');
    push({ kind: 'substation', type: 'substation', w, h, tier: 1 });
  }
  const hq = facs.find((f) => f.type === 'hq');
  if (hq) {
    const [w, h] = facilitySize('hq');
    push({ kind: 'facility', type: 'hq', facility: hq, w, h, tier: 1 });
  }
  let used = 0;
  let campus = false;
  for (const f of facs) {
    if (f.type === 'hq') continue;
    const tier = Math.max(tierOf(f), f.upgrade?.to ?? 0);
    const [w, h] = facilitySize(f.type, tier);
    // a multi-plot facility never looks narrower than the plots it uses
    const plots = plotsOf(f);
    push({ kind: 'facility', type: f.type, facility: f, w: Math.max(w, plots * EMPTY_W + (plots - 1) * GAP), h, tier });
    used += plots;
    if (f.type === 'campus') campus = true;
  }
  const rivals = (s?.rivalBuilds ?? []).filter((b) => b.siteId === siteId);
  for (const b of rivals) used += b.slots;
  const total = site.slots + (ss?.extraSlots ?? 0);
  for (let i = 0; used + i < total; i++) push({ kind: 'empty', w: EMPTY_W, h: EMPTY_H, tier: 1, emptyIndex: i });
  let propertyLine: number | undefined;
  if (rivals.length) {
    propertyLine = x - Math.round(GAP / 2);
    x += 6;
    for (const b of rivals) {
      const [w, h] = rivalSize(b.slots);
      push({ kind: 'rival', rival: b, w, h, tier: 1 });
    }
  }
  const width = Math.max(viewW, x - GAP + EDGE);
  const bigPlots = used + (campus ? 4 : 0);
  const skyline = campus || bigPlots >= 12 ? 3 : bigPlots >= 9 || site.megasite ? 2 : bigPlots >= 6 ? 1 : 0;
  return { items, width, viewOnly: false, skyline, propertyLine };
}

function viewOnlyLayout(site: SiteDef, viewW: number): CampusLayout {
  const pieces = sitePieces(site);
  const items: LayoutItem[] = [];
  const total = pieces.reduce((a, p) => a + pieceSize(p)[0], 0) + GAP * (pieces.length - 1);
  // centre the pieces when the set is narrower than the screen
  let x = Math.max(EDGE, Math.round((viewW - total) / 2));
  if (site.kind === 'landing') x = Math.max(EDGE, Math.round(viewW * 0.18));
  for (const p of pieces) {
    const [w, h] = pieceSize(p);
    items.push({ kind: 'piece', piece: p, x, w, h, tier: 1 });
    x += w + GAP;
  }
  const out: CampusLayout = { items, width: Math.max(viewW, x - GAP + EDGE), viewOnly: true, skyline: 0 };
  if (site.kind === 'landing') {
    const mh = items[items.length - 1];
    out.cableX = mh.x + 16;
    out.beachFrom = mh.x + mh.w - 6;
    out.width = Math.max(viewW, out.beachFrom + 120);
  }
  if (site.kind === 'supplier' && (site.supplier === 'lumen' || site.supplier === 'hanbit')) out.skyline = 2;
  else if (site.kind === 'supplier' || site.kind === 'cloud') out.skyline = 1;
  return out;
}

/** Act III view-only sites: a planned row of pieces with their own gaps (see act3Pieces.ts). */
function act3Layout(s: GameState | null, site: SiteDef, viewW: number): CampusLayout {
  const plan = act3Plan(s, site, viewW);
  const items: LayoutItem[] = [];
  const sizes = plan.pieces.map((p) => pieceSize(p));
  const total = sizes.reduce((a, [w], i) => a + w + (i < sizes.length - 1 ? plan.pieces[i].gap ?? GAP : 0), 0);
  let x = Math.max(plan.start, Math.round((viewW - total) / 2));
  let lakeFrom: number | undefined;
  plan.pieces.forEach((p, i) => {
    const [w, h] = sizes[i];
    if (i === plan.lakeAt) lakeFrom = x;
    items.push({ kind: 'piece', piece: p, x, w, h, tier: 1 });
    x += w + (p.gap ?? GAP);
  });
  const last = items[items.length - 1];
  const width = Math.max(viewW, last ? last.x + last.w + plan.tail : viewW);
  return { items, width, viewOnly: true, skyline: 0, scenery: plan.scenery, lakeFrom, offshore: plan.offshore };
}

/** Vertical layout of the parallax bands for a viewport. */
export function bands(vw: number, vh: number, sceneW: number) {
  const groundY = Math.max(90, Math.round(vh * 0.8));
  const farH = Math.round(vh * 0.32);
  const midH = Math.round(vh * 0.2);
  const backH = Math.round(vh * 0.16);
  return {
    groundY,
    farH,
    farY: groundY - farH - Math.round(vh * 0.08),
    farW: Math.ceil(vw + (sceneW - vw) * 0.25) + 4,
    midH,
    midY: groundY - midH + 2,
    midW: Math.ceil(vw + (sceneW - vw) * 0.55) + 4,
    backH,
    backY: groundY - backH + 1,
    backW: Math.ceil(vw + (sceneW - vw) * 0.75) + 4,
    groundH: vh - groundY + 2,
    fgH: 12,
  };
}

export const PARALLAX = { far: 0.25, mid: 0.55, back: 0.75 };
