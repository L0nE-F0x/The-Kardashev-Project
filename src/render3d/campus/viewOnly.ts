/**
 * Places you visit but don't build on (suppliers, the cloud provider, mines, cable landing
 * stations): which set pieces stand there, left to right (as the pixel game's `sitePieces`), and
 * where. Pure, no three.js.
 */
import type { SiteDef } from '../../content/sites';
import type { GameState } from '../../sim/types';
import type { SetPieceKind } from './industry';
import { FRONT_Z, type Rect } from './layout';
import { act3Plan, type Act3PieceKind } from '../../render/diorama/act3Pieces';
import { ACT3_SIZE } from './act3sets';
import { PALETTE } from '../../render/palette';

export interface SetSpec {
  kind: SetPieceKind | Act3PieceKind;
  brand: string;
  label: string;
  variant?: string;
  // the Act III–V planner's extras
  accent?: string;
  hi?: string;
  n?: number;
  p?: number;
  builder?: string;
  vseed?: number;
  backdrop?: string;
  offshore?: boolean;
}

const PAL_HEX = Object.values(PALETTE) as string[];
/** A palette index (the pixel planner's colours) as hex. */
export const paletteHex = (idx: number | undefined, fallback = '#f7b258') => (idx ? PAL_HEX[idx - 1] ?? fallback : fallback);

export const sizeOf = (kind: string): [number, number] => (SET_SIZE as Record<string, [number, number]>)[kind] ?? ACT3_SIZE[kind as Act3PieceKind] ?? [30, 24];

/** Sites drawn from the shared Act III–V planner (Geneva, megaprojects, launch sites, the Moon). */
export const isPlanSite = (site: SiteDef) => site.kind === 'charter' || site.kind === 'mega' || site.kind === 'launch' || site.kind === 'moon';

export interface PlanSet { specs: SetSpec[]; scenery: string; offshore: boolean; lakeAt?: number }

export function planSpecs(s: GameState | null, site: SiteDef): PlanSet {
  const plan = act3Plan(s, site, 0);
  const specs = plan.pieces.map((p): SetSpec => ({
    kind: p.kind as Act3PieceKind, brand: p.builder ?? 'charter', label: p.label, variant: p.variant,
    accent: paletteHex(p.accent), hi: paletteHex(p.accentHi, '#fbd46e'), n: p.n, p: p.p, builder: p.builder, vseed: p.seed, backdrop: p.backdrop, offshore: p.offshore,
  }));
  return { specs, scenery: plan.scenery.kind, offshore: !!plan.offshore, lakeAt: plan.lakeAt };
}

/** The planner's pieces in rows (wrapping at `maxW`), rows stepping back from the road. */
export function planLayout(specs: SetSpec[], maxW = 260): { items: SetItem[]; bounds: Rect; accessX: number } {
  const GAP = 6;
  const rows: SetSpec[][] = [[]];
  let w = 0;
  for (const spec of specs) {
    const [sw] = sizeOf(spec.kind);
    if (w > 0 && w + sw > maxW) { rows.push([]); w = 0; }
    rows[rows.length - 1].push(spec);
    w += sw + GAP;
  }
  const items: SetItem[] = [];
  let front = FRONT_Z - 5;
  let minX = 0, maxX = 0;
  for (const row of rows) {
    const total = row.reduce((a, s) => a + sizeOf(s.kind)[0], 0) + GAP * Math.max(0, row.length - 1);
    let x = -total / 2;
    const depth = Math.max(0, ...row.map((s) => sizeOf(s.kind)[1]));
    for (const spec of row) {
      const [sw, sd] = sizeOf(spec.kind);
      items.push({ spec, rect: { x0: x, z0: front - sd, x1: x + sw, z1: front } });
      x += sw + GAP;
    }
    minX = Math.min(minX, -total / 2);
    maxX = Math.max(maxX, total / 2);
    front -= depth + 8;
  }
  const accessX = minX - 10;
  return { items, accessX, bounds: { x0: accessX - 26, z0: front - 4, x1: maxX + 10, z1: FRONT_Z + 22 } };
}

/** Footprints (w × d) the set pieces are built to. */
export const SET_SIZE: Record<SetPieceKind, [number, number]> = {
  logicFab: [60, 40], memFab: [54, 38], euvHall: [44, 30], pkgLines: [48, 28], cloudHall: [36, 28], admin: [18, 16],
  gasYard: [16, 14], warehouse: [24, 16], crateYard: [18, 14], brinePonds: [70, 40], saltPlant: [26, 20], openPit: [70, 50],
  crusher: [26, 20], gasWorks: [50, 36], cableHut: [14, 12], manhole: [6, 6], rival: [28, 26],
};

const BRAND_NAME: Record<string, string> = {
  lumen: 'LUMEN', kestrel: 'KESTREL', stackwell: 'STACKWELL', hanbit: 'HANBIT', veldt: 'VELDT', bondline: 'BONDLINE', cumulus: 'CUMULUS',
};

export function setPiecesFor(site: SiteDef): SetSpec[] {
  const brand = site.supplier ?? site.id;
  const name = BRAND_NAME[site.supplier ?? ''] ?? site.name.split(/[ ·]/)[0].toUpperCase();
  const p = (kind: SetPieceKind, variant?: string, label = name, b = brand): SetSpec => ({ kind, brand: b, label, variant });
  if (site.kind === 'landing') return [p('cableHut', undefined, 'CLS'), p('manhole')];
  if (site.kind === 'mine') {
    switch (site.id) {
      case 'mine-atacama': return [p('saltPlant', 'lithium', 'SALTFLAT'), p('brinePonds', undefined, 'SALTFLAT')];
      case 'mine-pilbara': return [p('crusher', 'lithium', 'PILBARA LI'), p('openPit', 'red', 'PILBARA LI')];
      case 'mine-copperbelt': return [p('crusher', 'copper', 'DEEPVEIN'), p('openPit', 'copper', 'DEEPVEIN')];
      case 'mine-helium': return [p('gasWorks', 'helium', 'HELIUM')];
      case 'mine-neon': return [p('gasWorks', 'neon', 'CLEARAIR')];
      default: return [p('openPit', 'red'), p('crusher', 'lithium')];
    }
  }
  switch (site.supplier) {
    case 'lumen':
    case 'kestrel': return [p('gasYard'), p('logicFab', site.supplier), p('admin')];
    case 'stackwell':
    case 'hanbit': return [p('admin'), p('memFab', site.supplier), p('gasYard')];
    case 'veldt': return [p('admin'), p('euvHall'), p('crateYard')];
    case 'bondline': return [p('pkgLines'), p('warehouse')];
    case 'cumulus': return [p('cloudHall'), p('cloudHall', 'b'), p('cloudHall', 'c'), p('warehouse')];
    default: return [p('admin'), p('warehouse')];
  }
}

export interface SetItem { spec: SetSpec; rect: Rect }


/** The pieces in a row behind the frontage road, centred, fronts aligned. */
export function setLayout(specs: SetSpec[]): { items: SetItem[]; bounds: Rect; accessX: number } {
  const GAP = 6;
  const total = specs.reduce((a, s) => a + sizeOf(s.kind)[0], 0) + GAP * Math.max(0, specs.length - 1);
  let x = -total / 2;
  const front = FRONT_Z - 5;
  const items: SetItem[] = [];
  for (const spec of specs) {
    const [w, d] = sizeOf(spec.kind);
    items.push({ spec, rect: { x0: x, z0: front - d, x1: x + w, z1: front } });
    x += w + GAP;
  }
  const depth = Math.max(26, ...specs.map((s) => sizeOf(s.kind)[1]));
  const accessX = -total / 2 - 10;
  return { items, accessX, bounds: { x0: accessX - 26, z0: front - depth - 8, x1: total / 2 + 10, z1: FRONT_Z + 22 } };
}
