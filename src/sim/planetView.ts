/**
 * Read-only views of Act IV for the renderers (world map layers, the orbit view, dioramas) and the UI.
 * Pure functions of GameState — no Pixi, no DOM — so headless previews can use them too.
 */
import { ANCHORS, CONTRACT_KINDS } from '../content/charter';
import { AIS, PROVINCE0, SUPERGRID_ROUTES, type SupergridRoute } from '../content/planet';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { ColorKey } from '../render/palette';
import type { AiId, ContractKind, FusionDesignId, GameState, Project, Shell } from './types';


const live = (p: Project) => p.status !== 'cancelled';
const frac = (p: Project) => (p.status === 'done' ? 1 : Math.max(0, Math.min(1, p.progress / Math.max(1, p.days))));
const units = (p: Project) => CONTRACT_KINDS[p.kind].sizes[p.size - 1];
const projects = (s: GameState | null, kind: ContractKind) => (s?.charter?.projects ?? []).filter((p) => p.kind === kind && live(p));

export interface LinkView {
  route: SupergridRoute;
  /** 'planned' = not started (draw faint and dashed once the supergrid opens), 'down' = a fault. */
  status: 'planned' | 'building' | 'online' | 'down';
  progress: number;
  builder: string | null;
  gw: number;
}

export interface FusionPlantView {
  /** Megaproject site it stands at. */
  siteId: string;
  design: FusionDesignId;
  gw: number;
  status: 'building' | 'online';
  progress: number;
  builder: string;
}

export interface DacView {
  siteId: string;
  /** Gt CO₂ per year. */
  gt: number;
  status: 'building' | 'online';
  progress: number;
}

export interface RectennaView {
  region: RegionId;
  lat: number;
  lon: number;
  gw: number;
  status: 'building' | 'online';
  progress: number;
}

export interface ProvinceView {
  region: RegionId;
  /** A point inside the province for labels, banners and haze. */
  lat: number;
  lon: number;
  heat: number;
  water: number;
  wellbeing: number;
  /** The AI running it, and its colour (for banners/tints), or null. */
  ai: AiId | null;
  aiColor: ColorKey | null;
  /** Waste heat from all the power used there (W/m²). */
  wasteHeat: number;
}

export interface PlanetMapView {
  /** Act IV is under way. */
  active: boolean;
  stage: number;
  links: LinkView[];
  fusion: FusionPlantView[];
  dac: DacView[];
  rectennas: RectennaView[];
  provinces: ProvinceView[];
  /** Show waste-heat haze (stage 3 on). */
  showHeat: boolean;
}

export interface OrbitView {
  active: boolean;
  stage: number;
  /** Launches per day (drives launch-arc animation density). */
  cadence: number;
  /** The spaceport (launch site id) and its pads. */
  spaceport: string | null;
  pads: number;
  /** Orbital data centres: GW IT online and builds under way (0..1 each). */
  odcGW: number;
  odcBuilding: number[];
  /** Space-solar stations: GW beamed, one entry per station with its rectenna province. */
  sps: { region: RegionId; gw: number; status: 'building' | 'online'; progress: number }[];
  /** Debris per shell (0..100). */
  debris: Record<Shell, number>;
  /** The Act III test satellite and demonstrator are up. */
  orbitalTest: boolean;
  spaceSolarDemo: boolean;
  moon: MoonView;
  /** The finale's debris cascade is running (0..100 pressure), or null. */
  cascade: number | null;
}

export interface MoonView {
  /** 0 nothing · 1 outpost · 2 mine · 3 mass driver. */
  stage: number;
  /** What is being built next, and how far along. */
  building: { kind: 'moonbase' | 'moonmine' | 'massdriver'; progress: number; builder: string } | null;
  /** Helium-3 is flowing. */
  he3: boolean;
}

/** GW of Charter energy (and baseline) used in a province, TW. */
function provinceTW(s: GameState, r: RegionId): number {
  const c = s.charter;
  if (!c) return 0;
  let gw = 0;
  for (const p of c.projects) if (p.status === 'done' && p.region === r && p.gw) gw += p.gw;
  return c.world.blocs[r].tw + gw / 1000;
}

/** Waste heat per province, W/m² (every watt used ends up as heat). */
export function wasteHeat(s: GameState, r: RegionId): number {
  return provinceTW(s, r) / PROVINCE0[r].area;
}

export function linkViews(s: GameState | null): LinkView[] {
  const pl = s?.planet;
  if (!s || !pl) return [];
  return SUPERGRID_ROUTES.map((route) => {
    const p = projects(s, 'link').find((x) => x.where === route.id);
    if (!p) return { route, status: 'planned', progress: 0, builder: null, gw: 0 };
    const down = p.status === 'done' && (p.downUntil ?? 0) > s.day;
    return { route, status: down ? 'down' : p.status === 'done' ? 'online' : 'building', progress: frac(p), builder: p.builder, gw: units(p) };
  });
}

export function moonView(s: GameState | null): MoonView {
  const done = (k: ContractKind) => projects(s, k).some((p) => p.status === 'done');
  const stage = done('massdriver') ? 3 : done('moonmine') ? 2 : done('moonbase') ? 1 : 0;
  const next = (['moonbase', 'moonmine', 'massdriver'] as const).map((k) => projects(s, k).find((p) => p.status === 'building')).find(Boolean);
  return {
    stage,
    building: next ? { kind: next.kind as 'moonbase' | 'moonmine' | 'massdriver', progress: frac(next), builder: next.builder } : null,
    he3: stage >= 2,
  };
}

export function planetMapView(s: GameState | null): PlanetMapView {
  const pl = s?.planet ?? null;
  const out: PlanetMapView = { active: !!pl, stage: pl?.stage ?? 0, links: [], fusion: [], dac: [], rectennas: [], provinces: [], showHeat: (pl?.stage ?? 0) >= 3 };
  if (!s || !pl) return out;
  out.links = pl.stage >= 1 ? linkViews(s) : linkViews(s).filter((l) => l.status !== 'planned');
  for (const p of projects(s, 'ffleet')) out.fusion.push({ siteId: p.where, design: (p.opt ?? 'tokamak') as FusionDesignId, gw: units(p), status: p.status === 'done' ? 'online' : 'building', progress: frac(p), builder: p.builder });
  for (const p of projects(s, 'dac')) out.dac.push({ siteId: p.where, gt: units(p), status: p.status === 'done' ? 'online' : 'building', progress: frac(p) });
  for (const p of projects(s, 'sps')) {
    const r = p.where as RegionId;
    const [lat, lon] = ANCHORS[r] ?? [0, 0];
    out.rectennas.push({ region: r, lat: lat - 2.5, lon: lon + 3, gw: units(p), status: p.status === 'done' ? 'online' : 'building', progress: frac(p) });
  }
  for (const r of REGION_IDS) {
    const pr = pl.provinces[r];
    const [lat, lon] = ANCHORS[r];
    out.provinces.push({ region: r, lat, lon, heat: pr.heat, water: pr.water, wellbeing: pr.wellbeing, ai: pr.ai, aiColor: pr.ai ? AIS[pr.ai].color : null, wasteHeat: wasteHeat(s, r) });
  }
  return out;
}

export function orbitView(s: GameState | null): OrbitView {
  const pl = s?.planet ?? null;
  const ports = projects(s, 'spaceport');
  const pads = ports.filter((p) => p.status === 'done').reduce((a, p) => a + units(p), 0);
  const launch = s?.charter?.projects.find((p) => p.kind === 'launch' && p.status === 'done');
  const odc = projects(s, 'odc');
  return {
    active: !!pl,
    stage: pl?.stage ?? 0,
    cadence: (launch ? 0.5 : 0) + pads * 0.6,
    spaceport: ports[0]?.where ?? launch?.where ?? null,
    pads,
    odcGW: odc.filter((p) => p.status === 'done').reduce((a, p) => a + units(p), 0),
    odcBuilding: odc.filter((p) => p.status === 'building').map(frac),
    sps: projects(s, 'sps').map((p) => ({ region: p.where as RegionId, gw: units(p), status: p.status === 'done' ? 'online' : 'building', progress: frac(p) })),
    debris: pl?.debris ?? { leo: 0, geo: 0, cis: 0 },
    orbitalTest: !!s?.flags.orbitalTest,
    spaceSolarDemo: !!s?.flags.spaceSolar,
    moon: moonView(s),
    cascade: pl?.heatwall && !pl.heatwall.done ? pl.heatwall.fronts.cascade.pressure : null,
  };
}

/** Fusion GW online at a megaproject site, by design (the megaproject diorama draws these). */
export function siteFusion(s: GameState | null, siteId: string): Partial<Record<FusionDesignId, number>> {
  const out: Partial<Record<FusionDesignId, number>> = {};
  for (const p of projects(s, 'ffleet')) if (p.where === siteId && p.status === 'done') out[(p.opt ?? 'tokamak') as FusionDesignId] = (out[(p.opt ?? 'tokamak') as FusionDesignId] ?? 0) + units(p);
  return out;
}
