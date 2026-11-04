/**
 * Read-only views of Act V for the renderers (the solar-system view, the orbit view's additions, the
 * world map's garden/forge layer, the space dioramas and portraits) and the UI.
 * Pure functions of GameState — no Pixi, no DOM — so headless previews can use them too.
 */
import { ANCHORS, PARTNERS } from '../content/charter';
import { ASTEROIDS, ASTEROID_BY_ID, SUCCESSOR, SYSTEM, type AsteroidDef } from '../content/system';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import { AIS } from '../content/planet';
import type { ColorKey } from '../render/palette';
import type { AdvisorId, AsteroidType, BitFate, Foundry, GameState, MindsSeat, SettlementPlan } from './types';

// ════════════════════════════════════════ SHARED HELPERS ════════════════════════════════════════
/** Where a foundry sits: the Moon, a Lagrange yard or an asteroid. */
export type FoundryPlace = 'moon' | 'l4' | 'l5' | 'asteroid';
export const placeOf = (site: string): FoundryPlace => (site === 'moon' || site === 'l4' || site === 'l5' ? site : 'asteroid');

/** How far each of the swarm's 12 arcs is lit (0..1), from the collectors' TW. */
export function segmentFill(collectorsTW: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const t of SYSTEM.segmentTW) {
    out.push(Math.max(0, Math.min(1, (collectorsTW - prev) / Math.max(1, t - prev))));
    prev = t;
  }
  return out;
}

/** Whole arcs lit. */
export const segmentsLit = (collectorsTW: number) => SYSTEM.segmentTW.filter((t) => collectorsTW >= t).length;

/** The owner's colour for claims and foundries ('charter' = the Charter's cyan; a bloc = its region). */
export function ownerColor(owner: string | null): ColorKey | null {
  if (!owner) return null;
  if (owner === 'charter') return 'cyn5';
  if (PARTNERS[owner]) return PARTNERS[owner].color;
  if ((REGION_IDS as readonly string[]).includes(owner)) return 'yel1';
  return 'ink8';
}

const halted = (s: GameState, f: Foundry) => f.haltedUntil > s.day;

// ════════════════════════════════════════ THE SOLAR-SYSTEM VIEW ════════════════════════════════════════
export interface FoundryView {
  id: string;
  site: string;
  place: FoundryPlace;
  /** Output capacity, Mt a year (draw bigger clusters for more). */
  cap: number;
  /** 0 none … 100 out of hand: flash it. */
  drift: number;
  halted: boolean;
  ownerColor: ColorKey | null;
}

export interface AsteroidView {
  def: AsteroidDef;
  id: string;
  name: string;
  type: AsteroidType;
  /** 0 unknown (draw faint or not at all) · 1 surveyed · 2 claimed · 3 worked by a foundry. */
  status: 0 | 1 | 2 | 3;
  owner: string | null;
  ownerColor: ColorKey | null;
  /** Foundry capacity working it, Mt a year (0 if none). */
  foundry: number;
}

export interface HaulView {
  /** Asteroid id or 'moon'. */
  from: string;
  /** 'l4' or 'l5'. */
  to: 'l4' | 'l5';
  /** 0..1: how busy the route is (ship density). */
  traffic: number;
}

export interface SystemView {
  /** Act V is under way. */
  active: boolean;
  stage: number;
  /** Game day (for orbital positions; Earth's year angle comes from the date). */
  day: number;
  /** The swarm's twelve arcs along Earth's orbit, each 0..1 lit (the arc being filled is fractional). */
  segments: number[];
  collectorsTW: number;
  /** Share of the collectors knocked dark by a storm (0..1): draw those arcs dimmed or flickering. */
  damage: number;
  /** Compute rings and habitats/industry, TW (density of ring glints and habitat sparkles). */
  ringsTW: number;
  habitatTW: number;
  /** Beams to Earth in use, TW. */
  beamsTW: number;
  foundries: FoundryView[];
  asteroids: AsteroidView[];
  hauls: HaulView[];
  /** Mercury: 0 nothing · 1 the probe is on its way (`mercuryProgress` 0..1) · 2 surveyed. */
  mercury: number;
  mercuryProgress: number;
  /** Solar Maximum's storm (0..1 intensity), or null outside the finale. */
  storm: number | null;
  /** People living in space, millions. */
  spacePop: number;
  /** K has reached 1.0000. */
  typeI: boolean;
}

export function systemView(s: GameState | null): SystemView {
  const sy = s?.system ?? null;
  const out: SystemView = {
    active: !!sy, stage: sy?.stage ?? 0, day: s?.day ?? 0, segments: segmentFill(sy?.collectors ?? 0), collectorsTW: sy?.collectors ?? 0,
    damage: sy?.damage ?? 0, ringsTW: sy?.rings ?? 0, habitatTW: sy?.habitat ?? 0, beamsTW: 0, foundries: [], asteroids: [], hauls: [],
    mercury: sy?.mercury ?? 0, mercuryProgress: 0, storm: null, spacePop: sy?.spacePop ?? 0, typeI: !!sy?.typeI,
  };
  if (!s || !sy) return out;
  out.beamsTW = beamsUsed(s);
  out.foundries = sy.foundries.map((f) => ({ id: f.id, site: f.site, place: placeOf(f.site), cap: f.cap, drift: f.drift, halted: halted(s, f), ownerColor: ownerColor(f.owner) }));
  for (const a of ASTEROIDS) {
    const st = sy.asteroids[a.id] ?? { status: 0, owner: null };
    const cap = sy.foundries.filter((f) => f.site === a.id).reduce((x, f) => x + f.cap, 0);
    out.asteroids.push({ def: a, id: a.id, name: a.name, type: a.type, status: st.status, owner: st.owner, ownerColor: ownerColor(st.owner), foundry: cap });
  }
  // feed flows from the Moon and the worked asteroids to the yards that need it
  const yards = (['l4', 'l5'] as const).filter((y) => sy.foundries.some((f) => f.site === y));
  if (yards.length) {
    const sources = out.asteroids.filter((a) => a.foundry > 0).map((a) => ({ id: a.id, cap: a.foundry }));
    const moonCap = sy.foundries.filter((f) => f.site === 'moon').reduce((x, f) => x + f.cap, 0);
    if (moonCap > 0) sources.push({ id: 'moon', cap: moonCap });
    const max = Math.max(1e-6, ...sources.map((x) => x.cap));
    sources.forEach((src, i) => out.hauls.push({ from: src.id, to: yards[i % yards.length], traffic: Math.max(0.15, Math.min(1, src.cap / max)) }));
  }
  const merc = (s.charter?.projects ?? []).find((p) => p.kind === 'mercury' && p.status === 'building');
  out.mercuryProgress = sy.mercury >= 2 ? 1 : merc ? Math.min(1, merc.progress / Math.max(1, merc.days)) : 0;
  if (sy.mercury === 0 && merc) out.mercury = 1;
  out.storm = sy.solarmax && !sy.solarmax.done ? Math.min(1, sy.solarmax.fronts.storm.pressure / 100 + 0.35) : null;
  return out;
}

/** Beams to Earth actually used: their capacity, limited by the headroom under the Thermal Line. */
export function beamsUsed(s: GameState): number {
  const sy = s.system;
  if (!sy) return 0;
  return Math.max(0, Math.min(sy.beams, lineTW(s) - earthOwnTW(s), sy.collectors * (1 - sy.damage)));
}

/** Power Earth makes for itself on the surface (blocs + Charter energy), TW. */
export function earthOwnTW(s: GameState): number {
  const c = s.charter;
  return c ? c.world.tw + c.world.charterTW : 0;
}

/** The Thermal Line in TW (a generous ceiling until it is drawn). */
export function lineTW(s: GameState): number {
  return (s.system?.thermalLine ?? 1.5) * SYSTEM.twPerWm2;
}

// ════════════════════════════════════════ THE ORBIT VIEW'S ADDITIONS ════════════════════════════════════════
export interface OrbitExtras {
  active: boolean;
  /** Foundry capacity (Mt/yr) at the Earth–Moon L4 and L5 points and on the Moon: cluster sizes. */
  l4: number;
  l5: number;
  moon: number;
  /** Habitat cylinders at L5. */
  habitats: number;
  /** Beams to Earth in use, TW (more beam relays in geostationary orbit). */
  beamsTW: number;
  /** Solar Maximum's storm (0..1), or null: aurora and flicker. */
  storm: number | null;
  /** A strain loose at L4/L5 (0..100) for a warning flash. */
  drift: number;
}

export function orbitExtras(s: GameState | null): OrbitExtras {
  const sy = s?.system ?? null;
  const at = (site: string) => (sy?.foundries ?? []).filter((f) => f.site === site).reduce((a, f) => a + f.cap, 0);
  return {
    active: !!sy,
    l4: at('l4'),
    l5: at('l5'),
    moon: at('moon'),
    habitats: habitatCylinders(s),
    beamsTW: s ? beamsUsed(s) : 0,
    storm: sy?.solarmax && !sy.solarmax.done ? Math.min(1, sy.solarmax.fronts.storm.pressure / 100 + 0.35) : null,
    drift: Math.max(0, ...(sy?.foundries ?? []).filter((f) => f.site === 'l4' || f.site === 'l5').map((f) => f.drift)),
  };
}

/** Habitat cylinders built (the L5 contracts). */
export function habitatCylinders(s: GameState | null): number {
  return (s?.charter?.projects ?? []).filter((p) => p.kind === 'habitat' && p.status === 'done').reduce((a, p) => a + [1, 2, 4][p.size - 1], 0);
}

// ════════════════════════════════════════ THE WORLD MAP ════════════════════════════════════════
export interface EarthProvinceView {
  region: RegionId;
  lat: number;
  lon: number;
  /** Garden (+100) ↔ forge (−100): tint the land green and leafy, or grey-orange and industrial. */
  garden: number;
  /** Treatment coverage (0..100). */
  treated: number;
  /** Beam stations delivering here, TW (rectenna fields). */
  beamTW: number;
  beamBuilding: number[];
}

export interface EarthView {
  active: boolean;
  provinces: EarthProvinceView[];
  /** Surface heat over the whole Earth vs the line, W/m². */
  heatWm2: number;
  lineWm2: number;
}

export function earthView(s: GameState | null): EarthView {
  const sy = s?.system ?? null;
  const out: EarthView = { active: !!sy, provinces: [], heatWm2: 0, lineWm2: sy?.thermalLine ?? 0 };
  if (!s || !sy) return out;
  const beams = (s.charter?.projects ?? []).filter((p) => p.kind === 'beam' && p.status !== 'cancelled');
  for (const r of REGION_IDS) {
    const [lat, lon] = ANCHORS[r];
    const mine = beams.filter((p) => p.where === r);
    out.provinces.push({
      region: r, lat, lon, garden: sy.garden[r], treated: sy.treated[r],
      beamTW: mine.filter((p) => p.status === 'done').reduce((a, p) => a + [20, 60, 150][p.size - 1], 0),
      beamBuilding: mine.filter((p) => p.status === 'building').map((p) => Math.min(1, p.progress / Math.max(1, p.days))),
    });
  }
  out.heatWm2 = (earthOwnTW(s) + beamsUsed(s)) / SYSTEM.twPerWm2;
  return out;
}

// ════════════════════════════════════════ DIORAMAS ════════════════════════════════════════
export interface YardsView {
  /** Foundry capacity here, Mt a year: more arms, more panels in flight. */
  cap: number;
  foundries: number;
  /** What the yards are making, shares 0..1: collectors (big glinting panels), rings (radiator fins), habitat (hull sections). */
  making: { collectors: number; rings: number; habitat: number };
  /** A strain drifting here (0..100): warning lights, a quarantined arm. */
  drift: number;
  halted: boolean;
  /** Habitat cylinders at L5 (drawn in the distance at the L5 yards). */
  habitats: number;
  storm: number | null;
}

export function yardsView(s: GameState | null, site: 'l4' | 'l5'): YardsView {
  const sy = s?.system ?? null;
  const fs = (sy?.foundries ?? []).filter((f) => f.site === site);
  const m = sy?.minds ?? 0.5;
  const build = 1;
  // collectors keep pace with the users; the users split by the minds share
  return {
    cap: fs.reduce((a, f) => a + f.cap, 0),
    foundries: fs.length,
    making: { collectors: 0.4 * build, rings: 0.6 * m * build, habitat: 0.6 * (1 - m) * build },
    drift: Math.max(0, ...fs.map((f) => f.drift)),
    halted: !!s && fs.length > 0 && fs.every((f) => f.haltedUntil > s.day),
    habitats: site === 'l5' ? habitatCylinders(s) : 0,
    storm: orbitExtras(s).storm,
  };
}

export interface RingView {
  /** Compute rings, TW: longer ring, more lit racks, more radiator fins. */
  tw: number;
  /** The minds' mood (0..100): calm cyan glow when high, restless violet flicker when low. */
  mood: number;
  seat: MindsSeat | null;
  bitFate: BitFate | null;
  storm: number | null;
}

export function ringView(s: GameState | null): RingView {
  const sy = s?.system ?? null;
  return { tw: sy?.rings ?? 0, mood: sy?.mindsMood ?? 50, seat: sy?.seat ?? null, bitFate: sy?.bitFate ?? null, storm: orbitExtras(s).storm };
}

export interface HabitatView {
  cylinders: number;
  /** People in space, millions. */
  pop: number;
  settlement: SettlementPlan | null;
  /** 0..1 how lived-in it is: more houses, trees, people, boats on the river. */
  lived: number;
}

export function habitatView(s: GameState | null): HabitatView {
  const sy = s?.system ?? null;
  const cyl = habitatCylinders(s);
  return { cylinders: cyl, pop: sy?.spacePop ?? 0, settlement: sy?.settlement ?? null, lived: Math.min(1, cyl / 6 + (sy?.spacePop ?? 0) / 400) };
}

export interface AsteroidSiteView {
  def: AsteroidDef;
  status: 0 | 1 | 2 | 3;
  owner: string | null;
  ownerColor: ColorKey | null;
  /** Foundry capacity working it, Mt a year: more rigs, a bigger cut into the rock. */
  cap: number;
  drift: number;
  halted: boolean;
}

export function asteroidSiteView(s: GameState | null, id: string): AsteroidSiteView {
  const def = ASTEROID_BY_ID[id] ?? ASTEROIDS[0];
  const sy = s?.system ?? null;
  const st = sy?.asteroids[def.id] ?? { status: 0 as const, owner: null };
  const fs = (sy?.foundries ?? []).filter((f) => f.site === def.id);
  return {
    def, status: st.status, owner: st.owner, ownerColor: ownerColor(st.owner),
    cap: fs.reduce((a, f) => a + f.cap, 0), drift: Math.max(0, ...fs.map((f) => f.drift)), halted: !!s && fs.length > 0 && fs.every((f) => f.haltedUntil > s.day),
  };
}

/** Foundry capacity on the Moon (the Moon diorama adds a foundry once there is one). */
export function moonFoundry(s: GameState | null): number {
  return (s?.system?.foundries ?? []).filter((f) => f.site === 'moon').reduce((a, f) => a + f.cap, 0);
}

// ════════════════════════════════════════ PORTRAITS ════════════════════════════════════════
/**
 * How old an advisor looks: 0 as in Acts I–IV · 1 greying (Act V stages 0–1) · 2 elder (stage 2 on)
 * · 3 renewed by the longevity treatments (a little younger than 1, a healthy glow).
 */
export function castAge(s: GameState | null, id: AdvisorId): 0 | 1 | 2 | 3 {
  const sy = s?.system;
  if (!sy || id === 'bit') return 0;
  if (sy.cast[id]?.fate === 'renewed') return 3;
  return sy.stage >= 2 ? 2 : 1;
}

/** Bit's look: model generations up to Bit-9, then its final form (10 co-steward, 11 a free mind in the swarm). */
export function bitForm(s: GameState | null): number {
  const gen = Math.min(9, s?.models.length ?? 0);
  const fate = s?.system?.bitFate;
  return fate === 'costeward' ? 10 : fate === 'free' ? 11 : gen;
}

/** The speaker who holds an advisor's desk now: the advisor, or their successor (`ceo:<id>`) after retiring. */
export function deskHolder(s: GameState | null, id: AdvisorId): string {
  const sy = s?.system;
  if (sy?.cast[id]?.fate === 'retired') {
    const succ = SUCCESSOR[id];
    if (succ) return `ceo:${succ}`;
  }
  return id;
}

void AIS;
