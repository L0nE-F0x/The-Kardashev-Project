/**
 * Act III–V view-only sites as rows of set pieces: the Charter HQ in Geneva, the twelve megaproject
 * sites (laid out from `megaView`: stage, kinds online, projects building, an HVDC link) and the
 * launch-complex candidates (survey, building, online, liftoff). Act IV adds fusion fleets and
 * air-capture farms at the megaprojects, the spaceport's extra pads, and the Moon base (from
 * `moonView`); Act V's places come from plan5.ts. Pure: the campus (viewOnly.ts turns the row into a
 * place) rebuilds whenever `act3Key` changes.
 */
import type { AsteroidType, ContractKind, FusionDesignId, GameState, Project } from '../../sim/types';
import type { SiteDef } from '../../content/sites';
import { CONTRACT_KINDS, HVDC_ROUTES } from '../../content/charter';
import { megaView } from '../../sim/charterView';
import { moonView, orbitView } from '../../sim/planetView';
import { builderRamp, builderSign, CHARTER_ACCENT, dacBlocks, DESIGN_BUILDER } from './planKit';
import { act5Plan, isAct5Site, moonFoundrySpec } from './plan5';

export const ACT3_PIECES = [
  'secretariat',
  'council',
  'plaza',
  'jetty',
  'survey',
  'seaSurvey',
  'megaOffice',
  'megaSub',
  'converter',
  'solarField',
  'cspTower',
  'storageYard',
  'windField',
  'windSea',
  'seaSub',
  'jackup',
  'reactorUnit',
  'pumpedHydro',
  'geoPad',
  'binaryPlant',
  'megaBuild',
  'vab',
  'launchPad',
  'tankFarm',
  'launchSurvey',
  // Act IV
  'fusionPlant',
  'dacFarm',
  'moonSurvey',
  'moonHab',
  'moonPad',
  'rimSolar',
  'iceRig',
  'regolithMine',
  'he3Plant',
  'he3Tanks',
  'massDriver',
  'moonBuild',
  // Act V
  'moonFoundry',
  'yardsModule',
  'yardsCopy',
  'yardsOutbound',
  'yardsDock',
  'yardsBerth',
  'ringRack',
  'ringHub',
  'ringHead',
  'habHouses',
  'habSchool',
  'habPark',
  'habFarm',
  'habSquare',
  'habDorms',
  'habWorks',
  'habTower',
  'habVilla',
  'habBuild',
  'astRocks',
  'astBeacon',
  'astClaim',
  'astRig',
  'astCatapult',
] as const;
export type Act3PieceKind = (typeof ACT3_PIECES)[number];
const KINDS = new Set<string>(ACT3_PIECES);
export const isAct3Piece = (k: string): k is Act3PieceKind => KINDS.has(k);

/** One set piece in a site's row. */
export interface PieceSpec {
  kind: Act3PieceKind;
  /** Sign text (the site, the Charter, a builder). */
  label: string;
  /** Livery, as palette indices (render/palette.ts). */
  accent: number;
  accentHi: number;
  /** Variant flag (a fusion design, a construction kind, a launch cycle, a yard's flags…). */
  variant?: string;
  /** A count or size class (unit number, contract size). */
  n?: number;
  /** Construction progress bucket 0..1. */
  p?: number;
  /** Small variety seed (alternating tiles). */
  seed?: number;
  /** Space after this piece in the row. */
  gap?: number;
  /** The site's backdrop (ground colours under the kit). */
  backdrop?: string;
  /** Partner id building it (colours, signs). */
  builder?: string;
  /** Width of open-land pieces (survey land, bare rock). */
  w?: number;
  /** Built out at sea (offshore wind under construction). */
  offshore?: boolean;
}

/** Open space: the L4/L5 yards and Ring One. */
export interface SpaceScenery {
  kind: 'space';
  place: 'l4' | 'l5' | 'ring';
  /** Habitat cylinders hanging in the distance (L5). */
  habitats: number;
  /** Solar Maximum's storm: 0 none, 1..3. */
  storm: number;
  /** The swarm's arcs lit (0..12, halves). */
  swarm: number;
  /** Foundry modules at the yards (for the far row behind them). */
  modules: number;
  /** Products in flight: any of c (collectors), r (radiator rings), h (hull sections). */
  flow: string;
}

/** An asteroid's surface. */
export interface AsteroidScenery {
  kind: 'asteroid';
  id: string;
  type: AsteroidType;
  /** Mean diameter, km (sets how sharply the horizon curves). */
  km: number;
  /** Semi-major axis, AU (how small the sun looks). */
  au: number;
  /** The swarm's arcs lit (0..12): it glitters around the sun even from out here. */
  swarm: number;
}

/** Inside the Aurora habitat. */
export interface HabitatScenery {
  kind: 'habitat';
  /** 'settle' | 'stations' | 'private' | 'early' (no plan yet). */
  plan: string;
  /** How lived-in, 0..3. */
  lived: number;
}

/** What surrounds the pieces. */
export type Scenery =
  | { kind: 'geneva' }
  | { kind: 'mega'; kinds: string[]; stage: number; offshore: boolean }
  | { kind: 'launch' }
  | { kind: 'moon'; stage: number }
  // Act V: open space (the yards, Ring One), an asteroid's surface, inside the Aurora habitat
  | SpaceScenery
  | AsteroidScenery
  | HabitatScenery;

export interface Act3Plan {
  pieces: PieceSpec[];
  /** Left margin before the first piece (pieces are centred when the set is narrow). */
  start: number;
  /** Open land after the last piece. */
  tail: number;
  scenery: Scenery;
  offshore?: boolean;
  /** Index of the piece Lake Geneva begins at (the HQ's jetty). */
  lakeAt?: number;
}

/** Construction progress in visible steps (quarter by quarter). */
const step4 = (p: number) => Math.floor(Math.max(0, Math.min(1, p)) * 4) / 4;

/** Company initials for signs ('Little Sun Labs' → 'LSL'), as the scene labels your campus. */
export function companyInitials(s: GameState | null): string {
  const name = s?.company?.name ?? 'Kardashev Project';
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : name).slice(0, 3).toUpperCase();
}

export function act3Plan(s: GameState | null, site: SiteDef): Act3Plan {
  if (site.kind === 'charter') return charterPlan();
  if (site.kind === 'mega') return megaPlan(s, site);
  if (site.kind === 'moon') return moonPlan(s);
  if (isAct5Site(site)) return act5Plan(s, site);
  return launchPlan(s, site);
}

/** Everything about the state that changes how an Act III site looks (the scene's rebuild key). */
export function act3Key(s: GameState | null, site: SiteDef): string {
  if (site.kind !== 'mega' && site.kind !== 'launch' && site.kind !== 'moon' && !isAct5Site(site)) return '';
  const plan = act3Plan(s, site);
  const key = plan.pieces.map((p) => pieceKeyOf(p)).join(',');
  // Act V: the bands change too (the swarm in the sky, habitats in the distance, the storm)
  return isAct5Site(site) ? `${key}#${JSON.stringify(plan.scenery)}` : key;
}

export function pieceKeyOf(p: PieceSpec): string {
  return `${p.kind}|${p.label}|${p.accent}|${p.accentHi}|${p.variant ?? ''}|${p.n ?? ''}|${p.p ?? ''}|${p.seed ?? ''}|${p.backdrop ?? ''}|${p.builder ?? ''}|${p.w ?? ''}|${p.offshore ? 1 : ''}`;
}

// ── Geneva ─────────────────────────────────────────────────────────────────────────────────
function charterPlan(): Act3Plan {
  const p = (kind: Act3PieceKind, gap: number): PieceSpec => ({ kind, label: 'CHARTER', ...CHARTER_ACCENT, gap });
  return { pieces: [p('secretariat', 10), p('council', 6), p('plaza', 0), p('jetty', 0)], start: 18, tail: 96, scenery: { kind: 'geneva' }, lakeAt: 3 };
}

// ── megaprojects ───────────────────────────────────────────────────────────────────────────
/** Blocks shown per stage (stage 3 is "a sea of kit"). */
const BLOCKS = [0, 3, 6, 10];

/** Split n blocks between kinds by their GW (largest remainder, at least one each). */
function allocate(n: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / total) * n);
  const out = raw.map((r) => Math.max(1, Math.floor(r)));
  let sum = out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as [number, number]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; sum < n && k < order.length * 4; k++) {
    out[order[k % order.length][1]]++;
    sum++;
  }
  while (sum > n) {
    const i = out.indexOf(Math.max(...out));
    if (out[i] <= 1) break;
    out[i]--;
    sum--;
  }
  return out;
}

function hvdcAt(s: GameState | null, siteId: string): { status: 'building' | 'online'; builder: string; progress: number; name: string } | null {
  const route = HVDC_ROUTES.find((r) => r.mega === siteId);
  if (!route || !s?.charter) return null;
  const p = s.charter.projects.find((x) => x.kind === 'hvdc' && x.where === route.id && x.status !== 'cancelled');
  if (!p) return null;
  const short = route.name.replace(/ Link$| Ring$/, '').toUpperCase().replace('–', '-');
  return { status: p.status === 'done' ? 'online' : 'building', builder: p.builder, progress: p.status === 'done' ? 1 : p.progress / Math.max(1, p.days), name: short };
}

/** Megaproject sites built out at sea (open water instead of land, no road, no walkers). */
export const isOffshore = (site: SiteDef) => site.id === 'mega-northsea';

function megaPlan(s: GameState | null, site: SiteDef): Act3Plan {
  const v = megaView(s, site.id);
  const off = isOffshore(site);
  const bd = site.backdrop;
  const name = site.name.toUpperCase();
  const you = companyInitials(s);
  const pieces: PieceSpec[] = [];
  const spec = (kind: Act3PieceKind, extra: Partial<PieceSpec> = {}): PieceSpec => ({ kind, label: name, ...CHARTER_ACCENT, backdrop: bd, gap: 10, ...extra });
  const hv = hvdcAt(s, site.id);
  // Act IV: fusion fleets stand as plants of their design (a fleet alone still opens the site up),
  // air capture as its own row of fan walls
  const designs = (Object.keys(v.fusion) as FusionDesignId[]).filter((d) => (v.fusion[d] ?? 0) > 0);
  const stage = v.stage === 0 && designs.length ? 1 : v.stage;
  if (stage === 0) {
    pieces.push(off ? spec('seaSurvey', { w: 236, gap: 14 }) : spec('survey', { variant: 'board', w: 250, gap: 14 }));
  } else {
    if (off) pieces.push(spec('seaSub', { variant: hv ? 'hvdc' : '', gap: 18 }));
    else {
      pieces.push(spec('megaOffice', { gap: 8 }));
      if (hv) {
        const r = builderRamp(hv.builder);
        pieces.push(spec('converter', { label: hv.name, variant: hv.status, p: hv.status === 'building' ? step4(hv.progress) : 1, builder: hv.builder, accent: r.base, accentHi: r.lit, gap: 10 }));
      } else pieces.push(spec('megaSub', { gap: 10 }));
    }
    const blocks: { kind: ContractKind; design?: FusionDesignId; gw: number }[] = [];
    const fusionTotal = designs.reduce((a, d) => a + (v.fusion[d] ?? 0), 0) || 1;
    for (const k of v.online) {
      if (k === 'dac') continue;
      if (k === 'ffleet') designs.forEach((d) => blocks.push({ kind: k, design: d, gw: ((v.gwByKind.ffleet ?? 0) * (v.fusion[d] ?? 0)) / fusionTotal }));
      else blocks.push({ kind: k, gw: v.gwByKind[k] ?? 0 });
    }
    blocks.sort((a, b) => b.gw - a.gw);
    const counts = allocate(BLOCKS[stage], blocks.map((b) => b.gw));
    let unit = 1;
    const fusionUnit: Partial<Record<FusionDesignId, number>> = {};
    blocks.forEach(({ kind, design }, ki) => {
      // a pumped-hydro mountain is a big piece of scenery: one per two blocks
      const n = kind === 'hydro' ? Math.max(1, Math.round(counts[ki] / 2)) : counts[ki];
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        switch (kind) {
          case 'solar':
            // deserts get a solar tower (with molten-salt storage) every few blocks
            if (bd === 'desert' && i % 4 === 2) pieces.push(spec('cspTower', { gap: 0 }));
            else pieces.push(spec('solarField', { seed: i % 3, gap: 0 }));
            if (i % 2 === 1 && !last) pieces.push(spec('storageYard', { gap: 0 }));
            if (last) pieces[pieces.length - 1].gap = 10;
            break;
          case 'wind':
            pieces.push(spec(off ? 'windSea' : 'windField', { seed: i % 3, gap: last ? 10 : 0 }));
            break;
          case 'nuclear':
            pieces.push(spec('reactorUnit', { n: unit++, gap: 8 }));
            break;
          case 'hydro':
            pieces.push(spec('pumpedHydro', { seed: i % 3, gap: 2 }));
            break;
          case 'geo':
            pieces.push(spec(i % 2 ? 'binaryPlant' : 'geoPad', { seed: i % 4 === 0 ? 1 : 0, gap: last ? 10 : 0 }));
            break;
          case 'ffleet': {
            const d = design ?? 'tokamak';
            fusionUnit[d] = (fusionUnit[d] ?? 0) + 1;
            pieces.push(spec('fusionPlant', { variant: d, n: fusionUnit[d], builder: DESIGN_BUILDER[d], gap: last ? 12 : 6 }));
            break;
          }
        }
      }
    });
  }
  // air capture: a row of fan walls and wellheads, more of them the more carbon it pulls down
  const dacN = dacBlocks(v.dacGt);
  if (dacN) {
    const builder = s?.charter?.projects.find((p) => p.kind === 'dac' && p.where === site.id && p.status === 'done')?.builder ?? 'carbonfold';
    for (let i = 0; i < dacN; i++) pieces.push(spec('dacFarm', { seed: i % 3, builder, gap: i === dacN - 1 ? 12 : 4 }));
  }
  // the build-out's frontier: sites under construction in the builder's colours
  v.building.forEach((b) => {
    const r = builderRamp(b.builder);
    const sign = b.builder === 'you' ? you : builderSign(b.builder);
    const variant = b.kind === 'ffleet' ? `ffleet:${b.opt ?? 'tokamak'}` : b.kind;
    // a pumped-hydro scheme is built at its own size (its mountain, dam and powerhouse at a build site's footprint
    // came out half scale beside full-size trucks and crews)
    if (b.kind === 'hydro') pieces.push(spec('pumpedHydro', { variant: 'build', n: b.size, p: step4(b.progress), builder: b.builder, label: sign, accent: r.base, accentHi: r.lit, gap: 12 }));
    else pieces.push(spec('megaBuild', { variant, n: b.size, p: step4(b.progress), builder: b.builder, label: sign, accent: r.base, accentHi: r.lit, offshore: off && b.kind === 'wind', gap: 12 }));
  });
  // out at sea an installation vessel is always at work on the next turbine
  if (off && stage > 0 && !v.building.some((b) => b.kind === 'wind')) pieces.push(spec('jackup', { label: 'TIDEWATER', builder: 'tidewater', gap: 14 }));
  // room to grow (at stage 0 the surveyed land already is)
  if (stage > 0 && stage < 3) pieces.push(off ? spec('seaSurvey', { w: 200, gap: 0 }) : spec('survey', { w: 180, gap: 0 }));
  const kinds = (v.online.length ? v.online : stage === 0 ? [] : v.kinds).flatMap((k): string[] => (k === 'ffleet' ? designs.map((d) => `ffleet:${d}`) : [k]));
  return { pieces, start: 20, tail: 40, scenery: { kind: 'mega', kinds, stage, offshore: off }, offshore: off };
}

// ── the Moon ───────────────────────────────────────────────────────────────────────────────
/** Shackleton Base, grown stage by stage from `moonView`, with the next stage under construction. */
function moonPlan(s: GameState | null): Act3Plan {
  const mv = moonView(s);
  const pieces: PieceSpec[] = [];
  const spec = (kind: Act3PieceKind, extra: Partial<PieceSpec> = {}): PieceSpec => ({ kind, label: 'SHACKLETON', ...CHARTER_ACCENT, backdrop: 'lunar', gap: 10, ...extra });
  const builderOf = (kind: ContractKind) => s?.charter?.projects.find((p) => p.kind === kind && p.status === 'done')?.builder ?? 'karman';
  const livery = (b: string) => {
    const r = builderRamp(b);
    return { builder: b, accent: r.base, accentHi: r.lit };
  };
  if (mv.stage === 0) pieces.push(spec('moonSurvey', { variant: 'board', w: 250, gap: 14 }));
  else {
    const outpost = livery(builderOf('moonbase'));
    pieces.push(spec('moonSurvey', { variant: 'monument', w: 116, gap: 6 }));
    pieces.push(spec('rimSolar', { gap: 4 }));
    pieces.push(spec('moonHab', { ...outpost, gap: 8 }));
    pieces.push(spec('moonPad', { ...outpost, gap: 10 }));
    pieces.push(spec('iceRig', { gap: 12 }));
    if (mv.stage >= 2) {
      const mine = livery(builderOf('moonmine'));
      pieces.push(spec('regolithMine', { gap: 0 }), spec('he3Plant', { ...mine, gap: 6 }), spec('he3Tanks', { gap: 14 }));
    }
    // Act V: the Moon's own foundry, printing itself, feeding the mass driver
    const foundry = moonFoundrySpec(s);
    if (foundry) pieces.push(foundry);
    if (mv.stage >= 3) pieces.push(spec('massDriver', { ...livery(builderOf('massdriver')), gap: 0 }));
  }
  if (mv.building) {
    const b = mv.building;
    pieces.push(spec('moonBuild', { ...livery(b.builder), variant: b.kind, p: step4(b.progress), label: builderSign(b.builder), gap: 12 }));
  }
  if (mv.stage < 3) pieces.push(spec('moonSurvey', { variant: 'plain', w: 150, gap: 0 }));
  return { pieces, start: 20, tail: mv.stage >= 3 ? 70 : 40, scenery: { kind: 'moon', stage: mv.stage } };
}

// ── the launch complex ─────────────────────────────────────────────────────────────────────
function launchPlan(s: GameState | null, site: SiteDef): Act3Plan {
  // the launch contract (the same reading as charterMapView, without building the whole map view)
  let p0: Project | undefined;
  for (const x of s?.charter?.projects ?? []) if (x.kind === 'launch' && x.status !== 'cancelled') p0 = x;
  const lv = p0 && p0.where === site.id ? { status: p0.status === 'done' ? 'online' : 'building', progress: p0.status === 'done' ? 1 : p0.progress / Math.max(1, p0.days), builder: p0.builder } : null;
  const lift = s?.flags?.liftoff;
  const view = { liftoff: typeof lift === 'number' ? lift : null };
  const bd = site.backdrop;
  if (!lv) return { pieces: [{ kind: 'launchSurvey', label: 'SURVEY', ...CHARTER_ACCENT, backdrop: bd, w: 230 }], start: 20, tail: 60, scenery: { kind: 'launch' } };
  const r = builderRamp(lv.builder);
  const name = builderSign(lv.builder);
  const building = lv.status === 'building';
  const p = building ? step4(lv.progress) : undefined;
  const base = { label: name, accent: r.base, accentHi: r.lit, backdrop: bd, builder: lv.builder, p };
  const liftoff = !building && view.liftoff !== null;
  // Act IV: the spaceport — more pads with rockets in both liveries, launching every few hours
  const ports = building ? [] : (s?.charter?.projects ?? []).filter((x) => x.kind === 'spaceport' && x.where === site.id && x.status !== 'cancelled');
  const pads = ports.filter((x) => x.status === 'done').reduce((a, x) => a + CONTRACT_KINDS.spaceport.sizes[x.size - 1], 0);
  const portBuild = ports.find((x) => x.status === 'building');
  const extra = Math.min(MAX_EXTRA_PADS, pads);
  let cycle = (_k: number): string => (liftoff ? 'liftoff' : '');
  if (extra > 0) {
    const nPads = 1 + extra;
    const interval = Math.max(4, Math.min(14, 16 / Math.max(0.1, orbitView(s).cadence)));
    const period = Math.max(22, Math.round(interval * nPads));
    cycle = (k: number) => `cycle:${period}:${Math.round((k * period) / nPads) % period}`;
  }
  const pieces: PieceSpec[] = [
    { kind: 'vab', ...base, variant: building ? 'building' : '', gap: 14 },
    { kind: 'launchPad', ...base, variant: building ? 'building' : cycle(0), gap: 6 },
    { kind: 'tankFarm', ...base, variant: building ? 'building' : '', gap: 10 },
  ];
  const other = lv.builder === 'parabola' ? 'karman' : 'parabola';
  for (let k = 1; k <= extra; k++) {
    const b = k % 2 ? (ports[0]?.builder ?? lv.builder) : other;
    const rr = builderRamp(b);
    pieces.push({ kind: 'launchPad', label: builderSign(b), accent: rr.base, accentHi: rr.lit, backdrop: bd, builder: b, variant: cycle(k), n: k + 1, gap: 6 });
    if (k % 3 === 0 && k < extra) pieces.push({ kind: 'tankFarm', ...base, n: k, gap: 10 });
  }
  if (pads >= 4) {
    // the heavy-lift factory next door
    const rr = builderRamp(other);
    pieces.push({ kind: 'vab', label: builderSign(other), accent: rr.base, accentHi: rr.lit, backdrop: bd, builder: other, variant: 'factory', gap: 12 });
  }
  if (portBuild) {
    const rr = builderRamp(portBuild.builder);
    const n = Math.min(2, CONTRACT_KINDS.spaceport.sizes[portBuild.size - 1]);
    for (let k = 0; k < n; k++) {
      pieces.push({ kind: 'launchPad', label: builderSign(portBuild.builder), accent: rr.base, accentHi: rr.lit, backdrop: bd, builder: portBuild.builder, variant: 'building', p: step4(portBuild.progress / Math.max(1, portBuild.days)), n: 2 + extra + k, gap: 6 });
    }
  }
  return { pieces, start: 20, tail: 70, scenery: { kind: 'launch' } };
}

/** Pads a spaceport shows beside the first (more than this and the camera would never see them all). */
const MAX_EXTRA_PADS = 8;
