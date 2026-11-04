/**
 * Read-only views of the Charter for the renderers (world map layers, dioramas) and the UI.
 * Pure functions of GameState — no Pixi, no DOM — so headless previews can use them too.
 */
import { siteFusion } from './planetView';
import { ANCHORS, CONTRACT_KINDS, HVDC_ROUTES, MEGA_STAGES, megaGW, PARTNERS, type HvdcRoute } from '../content/charter';
import { LAUNCH_SITES, MEGA_SITES } from '../content/sites';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { ColorKey } from '../render/palette';
import type { ContractKind, GameState, Project, FusionDesignId } from './types';

export interface BuildView {
  builder: string;
  kind: ContractKind;
  /** 0..1 */
  progress: number;
  size: number;
  /** Act IV: a fusion fleet's design. */
  opt?: string;
}

export interface MegaView {
  siteId: string;
  /** 0 = surveyed only … 3 = at full scale. */
  stage: number;
  /** GW average online. */
  gw: number;
  /** Kinds with something online here (what the diorama shows). */
  online: ContractKind[];
  /** GW online per kind. */
  gwByKind: Partial<Record<ContractKind, number>>;
  building: BuildView[];
  /** Energy kinds this site accepts. */
  kinds: ContractKind[];
  /** Act IV: fusion GW online here by design ('ffleet' projects), and Gt CO₂/yr of air capture online. */
  fusion: Partial<Record<FusionDesignId, number>>;
  dacGt: number;
}

export interface HvdcView {
  route: HvdcRoute;
  status: 'building' | 'online';
  progress: number;
  builder: string;
  gw: number;
}

export interface LaunchView {
  siteId: string;
  status: 'building' | 'online';
  progress: number;
  builder: string;
}

export interface AnchorItem {
  kind: ContractKind;
  status: 'building' | 'online';
  builder: string;
  size: number;
  progress: number;
}

export interface AnchorView {
  region: RegionId;
  lat: number;
  lon: number;
  items: AnchorItem[];
}

export interface CharterMapView {
  /** The Charter exists (Act III): show the Geneva HQ marker. */
  hq: boolean;
  megas: MegaView[];
  hvdc: HvdcView[];
  /** The launch complex, once a contract for it is awarded. */
  launch: LaunchView | null;
  /** Candidate launch sites to show faintly before one is chosen. */
  launchCandidates: string[];
  /** Public compute campuses, cables and Commons lines, gathered at each bloc's anchor. */
  anchors: AnchorView[];
  /** The orbital compute test satellite is up (draw it crossing the map). */
  orbitalTest: boolean;
  /** The space-solar demonstrator is up. */
  spaceSolar: boolean;
  /** Day of the Act III cliffhanger launch (rocket animation), or null. */
  liftoff: number | null;
}

const live = (p: Project) => p.status !== 'cancelled';
const frac = (p: Project) => (p.status === 'done' ? 1 : Math.max(0, Math.min(1, p.progress / Math.max(1, p.days))));

/** A partner's colour (your company uses gold). */
export function builderColor(id: string): ColorKey {
  if (id === 'you') return 'yel0';
  return PARTNERS[id]?.color ?? 'ink7';
}

export function megaView(s: GameState | null, siteId: string): MegaView {
  const site = MEGA_SITES.find((x) => x.id === siteId);
  const kinds = site?.mega ?? [];
  const projects = (s?.charter?.projects ?? []).filter((p) => p.where === siteId && live(p));
  const gwByKind: Partial<Record<ContractKind, number>> = {};
  for (const p of projects) if (p.status === 'done') gwByKind[p.kind] = (gwByKind[p.kind] ?? 0) + (p.gw ?? 0);
  const gw = s ? megaGW(s, siteId) : 0;
  return {
    siteId,
    stage: MEGA_STAGES.filter((t) => gw >= t).length,
    gw,
    online: Object.keys(gwByKind) as ContractKind[],
    gwByKind,
    building: projects.filter((p) => p.status === 'building').map((p) => ({ builder: p.builder, kind: p.kind, progress: frac(p), size: p.size, opt: p.opt })),
    kinds,
    fusion: siteFusion(s, siteId),
    dacGt: projects.filter((p) => p.kind === 'dac' && p.status === 'done').reduce((a, p) => a + CONTRACT_KINDS.dac.sizes[p.size - 1], 0),
  };
}

export function charterMapView(s: GameState | null): CharterMapView {
  const c = s?.charter ?? null;
  const out: CharterMapView = { hq: !!c, megas: [], hvdc: [], launch: null, launchCandidates: [], anchors: [], orbitalTest: false, spaceSolar: false, liftoff: null };
  if (!s || !c) return out;
  out.megas = MEGA_SITES.map((m) => megaView(s, m.id));
  for (const p of c.projects) {
    if (!live(p)) continue;
    const def = CONTRACT_KINDS[p.kind];
    if (p.kind === 'hvdc') {
      const route = HVDC_ROUTES.find((r) => r.id === p.where);
      if (route) out.hvdc.push({ route, status: p.status === 'done' ? 'online' : 'building', progress: frac(p), builder: p.builder, gw: def.sizes[p.size - 1] });
    } else if (p.kind === 'launch') {
      out.launch = { siteId: p.where, status: p.status === 'done' ? 'online' : 'building', progress: frac(p), builder: p.builder };
    } else if (p.kind === 'orbital' && p.status === 'done') out.orbitalTest = true;
    else if (p.kind === 'spacesolar' && p.status === 'done') out.spaceSolar = true;
  }
  if (!out.launch && c.phase >= 2) out.launchCandidates = LAUNCH_SITES.map((x) => x.id);
  for (const r of REGION_IDS) {
    const items: AnchorItem[] = c.projects
      .filter((p) => live(p) && p.where === r)
      .map((p) => ({ kind: p.kind, status: p.status === 'done' ? 'online' : 'building', builder: p.builder, size: p.size, progress: frac(p) }));
    if (items.length) out.anchors.push({ region: r, lat: ANCHORS[r][0], lon: ANCHORS[r][1], items });
  }
  const lift = s.flags.liftoff;
  out.liftoff = typeof lift === 'number' ? lift : null;
  return out;
}
