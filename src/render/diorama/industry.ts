/**
 * View-only dioramas (suppliers, mines, landing stations) and rival campuses. A view-only site is
 * a row of "pieces" (fab block, offices, gas yard, ponds, pit…) laid out like plots but with no
 * build slots. Rival campuses are data halls in the owner's colours with a flag and logo.
 */
import type { SiteDef } from '../../content/sites';
import type { GameState } from '../../sim/types';
import { C } from '../palette';
import { bayer, ditherAt, hash2, PixelCanvas } from '../pixels';
import { drawText, measureText } from '../font';
import { datacenter, type Emitter, type FacilityArt, type Mover } from './art';
import { bigText, fab, hallBlock, packaging } from './plants';
import {
  beacon,
  CONCRETE,
  facadeShade,
  fanUnit,
  fence,
  flag,
  pipe,
  revealFrom,
  scaffold,
  signPlate,
  stack,
  STEEL,
  tank,
  towerCrane,
  transformerYard,
} from './draw';
import { act3PieceArt, act3Plan, isAct3Piece, pieceKeyOf, type Act3PieceKind } from './act3Pieces';

type LegacyPieceKind =
  | 'logicFab'
  | 'memFab'
  | 'euvHall'
  | 'pkgLines'
  | 'cloudHall'
  | 'admin'
  | 'gasYard'
  | 'warehouse'
  | 'crateYard'
  | 'brinePonds'
  | 'saltPlant'
  | 'openPit'
  | 'crusher'
  | 'gasWorks'
  | 'cableHut'
  | 'manhole';

/** Set-piece kinds: suppliers, mines, landing stations, plus Act III's Charter HQ, megaprojects and launch sites. */
export type PieceKind = LegacyPieceKind | Act3PieceKind;

export interface PieceSpec {
  kind: PieceKind;
  /** Sign text (company name). */
  label: string;
  accent: number;
  accentHi: number;
  /** Variant flag (copper vs lithium pit, helium vs neon works…). */
  variant?: string;
  // ── Act III pieces ──
  /** A count or size class (unit number, contract size). */
  n?: number;
  /** Construction progress bucket 0..1. */
  p?: number;
  /** Small variety seed (alternating tiles). */
  seed?: number;
  /** Space after this piece in the row (default GAP). */
  gap?: number;
  /** The site's backdrop (ground colours under the kit). */
  backdrop?: string;
  /** Partner id building it (colours, signs). */
  builder?: string;
  /** Width of stretchable pieces (survey land). */
  w?: number;
  /** Built out at sea. */
  offshore?: boolean;
}

/** Brand colours per supplier (match the world-map marker colours). */
const BRAND: Record<string, { name: string; accent: number; accentHi: number }> = {
  lumen: { name: 'LUMEN', accent: C.cyn4, accentHi: C.cyn5 },
  kestrel: { name: 'KESTREL', accent: C.org0, accentHi: C.org1 },
  stackwell: { name: 'STACKWELL', accent: C.vio3, accentHi: C.vio4 },
  hanbit: { name: 'HANBIT', accent: C.pnk0, accentHi: C.pnk1 },
  veldt: { name: 'VELDT', accent: C.yel0, accentHi: C.yel1 },
  bondline: { name: 'BONDLINE', accent: C.grn5, accentHi: C.grn6 },
  cumulus: { name: 'CUMULUS', accent: C.blu4, accentHi: C.blu6 },
};

/** The set pieces a non-build site shows, left to right. */
export function sitePieces(site: SiteDef, s: GameState | null = null): PieceSpec[] {
  if (site.kind === 'charter' || site.kind === 'mega' || site.kind === 'launch') return act3Plan(s, site, 0).pieces;
  const b = BRAND[site.supplier ?? ''] ?? { name: site.name.split(/[ ·]/)[0].toUpperCase(), accent: C.cyn4, accentHi: C.cyn5 };
  const p = (kind: PieceKind, variant?: string, label = b.name): PieceSpec => ({ kind, label, accent: b.accent, accentHi: b.accentHi, variant });
  if (site.kind === 'landing') return [p('cableHut', undefined, 'CLS'), p('manhole')];
  if (site.kind === 'mine') {
    switch (site.id) {
      case 'mine-atacama':
        return [{ ...p('saltPlant', 'lithium', 'SALTFLAT'), accent: C.cyn4, accentHi: C.cyn5 }, { ...p('brinePonds', undefined, 'SALTFLAT'), accent: C.cyn4, accentHi: C.cyn5 }];
      case 'mine-pilbara':
        return [{ ...p('crusher', 'lithium', 'PILBARA LI'), accent: C.org1, accentHi: C.yel0 }, { ...p('openPit', 'red'), accent: C.org1, accentHi: C.yel0 }];
      case 'mine-copperbelt':
        return [{ ...p('crusher', 'copper', 'DEEPVEIN'), accent: C.org0, accentHi: C.org2 }, { ...p('openPit', 'copper'), accent: C.org0, accentHi: C.org2 }];
      case 'mine-helium':
        return [{ ...p('gasWorks', 'helium', 'HELIUM'), accent: C.blu4, accentHi: C.blu6 }];
      case 'mine-neon':
        return [{ ...p('gasWorks', 'neon', 'CLEARAIR'), accent: C.pnk0, accentHi: C.pnk1 }];
      default:
        return [p('openPit', 'red'), p('crusher', 'lithium')];
    }
  }
  switch (site.supplier) {
    case 'lumen':
    case 'kestrel':
      return [p('gasYard'), p('logicFab', site.supplier), p('admin')];
    case 'stackwell':
    case 'hanbit':
      return [p('admin'), p('memFab', site.supplier), p('gasYard')];
    case 'veldt':
      return [p('admin'), p('euvHall'), p('crateYard')];
    case 'bondline':
      return [p('pkgLines'), p('warehouse')];
    case 'cumulus':
      return [p('cloudHall'), p('cloudHall', 'b'), p('cloudHall', 'c'), p('warehouse')];
    default:
      return [p('admin'), p('warehouse')];
  }
}

const PIECE_SIZE: Record<LegacyPieceKind, [number, number]> = {
  logicFab: [272, 92],
  memFab: [244, 86],
  euvHall: [196, 72],
  pkgLines: [220, 50],
  cloudHall: [172, 84],
  admin: [70, 52],
  gasYard: [64, 44],
  warehouse: [92, 36],
  crateYard: [72, 30],
  brinePonds: [260, 34],
  saltPlant: [108, 50],
  openPit: [272, 66],
  crusher: [96, 58],
  gasWorks: [236, 84],
  cableHut: [78, 40],
  manhole: [40, 14],
};

export function pieceSize(spec: PieceSpec): [number, number] {
  const a = pieceArt(spec);
  return [a.base[0].w, a.base[0].h];
}

const pieceCache = new Map<string, FacilityArt>();

export function pieceArt(spec: PieceSpec): FacilityArt {
  const key = pieceKey(spec);
  let art = pieceCache.get(key);
  if (!art) {
    art = makePiece(spec);
    pieceCache.set(key, art);
    // megaproject construction steps churn as projects progress: keep the cache bounded
    if (pieceCache.size > 240) pieceCache.delete(pieceCache.keys().next().value as string);
  } else if (isAct3Piece(spec.kind)) {
    // recently used pieces stay (Map order = insertion order)
    pieceCache.delete(key);
    pieceCache.set(key, art);
  }
  return art;
}

export function pieceKey(spec: PieceSpec): string {
  return isAct3Piece(spec.kind) ? pieceKeyOf(spec) : `${spec.kind}|${spec.label}|${spec.accent}|${spec.variant ?? ''}`;
}

function makePiece(spec: PieceSpec): FacilityArt {
  if (isAct3Piece(spec.kind)) return act3PieceArt(spec);
  const kind = spec.kind as LegacyPieceKind;
  const [W, H] = PIECE_SIZE[kind];
  switch (kind) {
    case 'logicFab':
      return fab('', { W, H, accent: spec.accent, accentHi: spec.accentHi, sign: spec.label });
    case 'memFab':
      return fab('', { W, H, accent: spec.accent, accentHi: spec.accentHi, sign: spec.label, variant: 'memory' });
    case 'pkgLines':
      return packaging('', 3, { W, accent: spec.accent, accentHi: spec.accentHi, sign: spec.label });
    case 'cloudHall':
      return datacenter('', spec.variant === 'b' ? 2 : 3, { sign: spec.variant === 'b' ? '' : spec.label, accent: spec.accent });
    case 'euvHall':
      return euvHall(spec, W, H);
    case 'admin':
      return admin(spec, W, H);
    case 'gasYard':
      return gasYard(spec, W, H);
    case 'warehouse':
      return warehouse(spec, W, H);
    case 'crateYard':
      return crateYard(spec, W, H);
    case 'brinePonds':
      return brinePonds(W, H);
    case 'saltPlant':
      return saltPlant(spec, W, H);
    case 'openPit':
      return openPit(spec, W, H);
    case 'crusher':
      return crusher(spec, W, H);
    case 'gasWorks':
      return gasWorks(spec, W, H);
    case 'cableHut':
      return cableHut(spec, W, H);
    case 'manhole':
      return manhole(W, H);
  }
}

const ground = (pc: PixelCanvas, W: number, H: number) => {
  pc.rect(0, H - 3, W, 3, C.ink3);
  pc.hline(0, H - 3, W, C.ink5);
};

// ── Veldt: the EUV cleanroom with a window onto the machine ───────────────────────────────
function euvHall(spec: PieceSpec, W: number, H: number): FacilityArt {
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const top = 12;
  const wx = 26;
  const wy = 26;
  const ww = 122;
  const wh = 34;
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // hall shell: dark glass + steel
    pc.rect(0, top, W, H - 3 - top, C.ink3);
    pc.hline(0, top, W, C.ink6);
    pc.rect(0, top + 1, W, 3, spec.accent);
    pc.hline(0, top + 4, W, C.ink2);
    for (let x = 6; x < W; x += 12) pc.vline(x, top + 5, H - 8 - top, C.ink4);
    facadeShade(pc, 0, top, W, H - 3 - top, C.ink3, C.ink2, 0.6);
    // roof plant
    for (let x = 6; x + 14 < W; x += 26) fanUnit(pc, x, top - 4, 14, f + x);
    // the cleanroom window: a lithography bay under yellow light
    pc.rect(wx - 2, wy - 2, ww + 4, wh + 4, C.ink6);
    pc.rect(wx, wy, ww, wh, C.yel2);
    pc.rect(wx, wy + wh - 5, ww, 5, C.snd8);
    pc.hline(wx, wy + wh - 5, ww, C.snd7);
    for (let x = wx + 4; x < wx + ww; x += 8) pc.vline(x, wy, wh - 5, C.yel1);
    // ceiling filter units
    for (let x = wx + 2; x < wx + ww - 4; x += 10) pc.rect(x, wy, 8, 2, C.ice2);
    // the EUV machine: source vessel, illuminator, reticle stage, wafer stage — a bus-sized silhouette
    const mx = wx + 12;
    const my = wy + 5;
    pc.rect(mx, my + 8, 30, wh - 18, C.ink4); // source
    pc.circle(mx + 12, my + 16, 6, C.ink5);
    pc.circle(mx + 12, my + 16, 3, C.ink3);
    pc.rect(mx + 30, my + 2, 46, wh - 12, C.ink5); // main body
    pc.hline(mx + 30, my + 2, 46, C.ink7);
    pc.rect(mx + 34, my + 6, 14, 8, C.ink4);
    pc.rect(mx + 52, my + 6, 18, 5, C.ink4);
    pc.rect(mx + 50, my - 3, 12, 5, C.ink4); // illuminator turret
    pc.rect(mx + 76, my + 10, 22, wh - 20, C.ink4); // wafer handler
    pc.rect(mx + 80, my + 13, 6, 4, C.blu3);
    pc.hline(mx + 30, my + 18, 46, spec.accent);
    // the window glows with the room's light; the machine stays a silhouette against it
    for (let y = wy; y < wy + wh; y++) {
      for (let x = wx; x < wx + ww; x++) {
        const c = pc.get(x, y);
        if (c === C.yel2 || c === C.yel1 || c === C.ice2) g.set(x, y, C.yel2);
        else if (c === C.snd8 || c === C.snd7) g.set(x, y, C.yel1);
      }
    }
    // tin-plasma source flash and the machine's lights
    const flash = f % 2 === 0;
    pc.set(mx + 12, my + 16, flash ? C.pnk1 : C.vio4);
    g.set(mx + 12, my + 16, flash ? C.pnk1 : C.vio4);
    if (flash) {
      g.set(mx + 11, my + 16, C.vio4);
      g.set(mx + 13, my + 16, C.vio4);
      g.set(mx + 12, my + 15, C.vio4);
    }
    g.rect(mx + 80, my + 13, 6, 4, C.blu5);
    for (let k = 0; k < 5; k++) {
      const on = (k + f) % 3 !== 0;
      pc.set(mx + 36 + k * 3, my + 22, on ? C.grn6 : C.ink3);
      if (on) g.set(mx + 36 + k * 3, my + 22, C.grn6);
    }
    // two engineers in bunny suits, one shuffles
    for (const [k, px] of [[0, mx + 46 + (f % 2) * 2], [1, mx + 104]] as [number, number][]) {
      const py = wy + wh - 12;
      pc.rect(px, py, 3, 7, C.white);
      pc.set(px + 1, py + 1, C.blu3);
      pc.set(px + (k ? 0 : 2), py + 7, C.ink7);
      g.rect(px, py, 3, 7, 0);
    }
    // window mullions
    for (let x = wx; x < wx + ww; x += 30) {
      pc.vline(x, wy, wh, C.ink6);
      g.vline(x, wy, wh, 0);
    }
    // sign
    const lw = bigText(pc, g, spec.label, W - 14 - measureText(spec.label) * 2, top + 8, spec.accentHi);
    void lw;
    drawText(pc, 'EUV', wx, wy - 9, C.ink7);
    // entrance
    pc.rect(W - 34, H - 14, 16, 11, C.cyn1);
    g.rect(W - 33, H - 13, 14, 10, C.cyn4);
    ground(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 14, H] }, fps: 3 };
}

// ── offices ────────────────────────────────────────────────────────────────────────────────
function admin(spec: PieceSpec, W: number, H: number): FacilityArt {
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const top = 12;
  pc.rect(4, top, W - 8, H - 3 - top, C.ink6);
  pc.hline(4, top, W - 8, C.ink8);
  for (let fl = 0; fl < 4; fl++) {
    const y = top + 4 + fl * 9;
    for (let x = 7; x < W - 8; x += 5) {
      for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) pc.set(x + i, y + j, (i + j + fl) % 6 === 0 ? C.sky4 : j < 2 ? C.blu4 : C.blu3);
      if (hash2(x, fl, 77) > 0.4) g.rect(x, y + 1, 4, 4, hash2(x, fl, 78) > 0.5 ? C.yel1 : C.yel0);
    }
    pc.hline(4, y + 7, W - 8, C.ink8);
  }
  facadeShade(pc, 4, top, W - 8, H - 3 - top, C.blu3, C.blu2, 0.55);
  // name on the parapet
  const tw = measureText(spec.label);
  pc.rect(W / 2 - tw / 2 - 2, top - 8, tw + 4, 7, C.ink1);
  drawText(pc, spec.label, W / 2 - tw / 2, top - 7, spec.accentHi);
  drawText(g, spec.label, W / 2 - tw / 2, top - 7, spec.accentHi);
  // flags
  flag(pc, 0, H - 3, 22, spec.accent, spec.accentHi);
  pc.rect(W / 2 - 6, H - 10, 12, 7, C.cyn1);
  g.rect(W / 2 - 5, H - 9, 10, 6, C.cyn4);
  ground(pc, W, H);
  return { base: [pc], glow: [g], points: {} };
}

// ── bulk gas yard ──────────────────────────────────────────────────────────────────────────
function gasYard(spec: PieceSpec, W: number, H: number): FacilityArt {
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  tank(pc, 2, H - 3, 12, 38, CONCRETE, true, spec.accent);
  tank(pc, 16, H - 3, 12, 34, CONCRETE, false, spec.accent);
  tank(pc, 30, H - 3, 10, 28, CONCRETE, true);
  drawText(pc, 'N2', 4, H - 30, C.ink6);
  drawText(pc, 'AR', 18, H - 26, C.ink6);
  // vaporisers (finned)
  for (let x = 44; x < W - 2; x += 5) {
    pc.vline(x, H - 22, 19, C.ink8);
    pc.vline(x + 1, H - 22, 19, C.ink6);
    for (let y = H - 21; y < H - 4; y += 2) pc.set(x + 2, y, C.ink7);
  }
  pipe(pc, 2, H - 8, W - 4, null, C.ink8, C.ink6);
  fence(pc, 0, H - 8, W);
  ground(pc, W, H);
  beacon(pc, g, 8, H - 42, true, C.red3);
  return { base: [pc], glow: [g], points: {}, emitters: [{ x: 52, y: H - 22, kind: 'mist', rate: 3, spread: 6 }] };
}

// ── warehouse ──────────────────────────────────────────────────────────────────────────────
function warehouse(spec: PieceSpec, W: number, H: number): FacilityArt {
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const top = 10;
  pc.rect(0, top, W, H - 3 - top, C.ink7);
  for (let x = 2; x < W; x += 3) pc.vline(x, top + 2, H - 5 - top, C.ink6);
  pc.hline(0, top, W, C.ink9);
  pc.rect(0, top + 1, W, 2, spec.accent);
  for (let k = 0; k < 4; k++) {
    const dx = 6 + k * 21;
    pc.rect(dx, H - 15, 14, 12, C.ink4);
    for (let y = H - 14; y < H - 3; y += 2) pc.hline(dx + 1, y, 12, C.ink3);
    pc.set(dx + 7, H - 17, C.yel1);
    g.set(dx + 7, H - 17, C.yel1);
  }
  facadeShade(pc, 0, top, W, H - 3 - top, C.ink7, C.ink6);
  signPlate(pc, g, spec.label, 4, top + 4, spec.accentHi);
  ground(pc, W, H);
  return { base: [pc], glow: [g], points: { dock: [W - 20, H] } };
}

// ── crates waiting to ship (Veldt) ─────────────────────────────────────────────────────────
function crateYard(spec: PieceSpec, W: number, H: number): FacilityArt {
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  const crates: [number, number, number, number][] = [[2, 12, 22, 15], [26, 6, 26, 21], [54, 14, 16, 13], [8, 0, 14, 12]];
  for (const [x, y, w, h] of crates) {
    pc.rect(x, y, w, h, C.snd4);
    pc.box(x, y, w, h, C.snd2);
    pc.hline(x + 1, y + 1, w - 2, C.snd5);
    for (let xx = x + 4; xx < x + w - 2; xx += 5) pc.vline(xx, y + 1, h - 2, C.snd3);
    pc.line(x, y + h - 1, x + w - 1, y, C.snd3);
  }
  drawText(pc, 'EUV', 31, 12, C.ink1);
  pc.rect(48, 9, 4, 4, spec.accent);
  // "this way up" arrows
  pc.vline(60, 17, 4, C.ink1);
  pc.set(59, 18, C.ink1);
  pc.set(61, 18, C.ink1);
  ground(pc, W, H);
  return { base: [pc], glow: [g], points: { dock: [W - 10, H] } };
}

// ── lithium brine ponds ────────────────────────────────────────────────────────────────────
function brinePonds(W: number, H: number): FacilityArt {
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  // evaporation stages, fresh brine → concentrated
  const stages = [
    [C.sea6, C.sea7],
    [C.cyn3, C.cyn4],
    [C.cyn4, C.cyn5],
    [C.cyn5, C.cyn6],
    [C.grn6, C.grn7],
    [C.grn7, C.yel1],
  ];
  const rows = [
    { y: 2, h: 3, n: 7, x0: 22 },
    { y: 7, h: 4, n: 6, x0: 14 },
    { y: 13, h: 5, n: 6, x0: 7 },
    { y: 20, h: 7, n: 5, x0: 0 },
  ];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // salt crust around the ponds
    for (let y = 0; y < H - 3; y++) {
      for (let x = Math.max(0, 22 - Math.round(y * 1.0)); x < W; x++) pc.set(x, y, bayer(x, y) < 3 ? C.snd7 : C.snd8);
    }
    for (const [ri, r] of rows.entries()) {
      const pw = Math.floor((W - r.x0 - 4) / r.n);
      for (let i = 0; i < r.n; i++) {
        const st = stages[(i + ri) % stages.length];
        const x = r.x0 + i * pw;
        for (let j = 0; j < r.h; j++) {
          for (let k = 2; k < pw - 1; k++) {
            const sparkle = (k + j * 3 + f * 5 + i) % 23 === 0;
            pc.set(x + k, r.y + j, sparkle ? C.white : j === 0 ? st[1] : ditherAt(x + k, r.y + j, 0.3) ? st[1] : st[0]);
          }
        }
        // berm (salt wall)
        pc.hline(x + 1, r.y + r.h, pw - 1, C.white);
        pc.vline(x + 1, r.y, r.h, C.ice2);
      }
    }
    // pump houses and a pipe along the front
    pipe(pc, 0, H - 5, W, null, C.ink7, C.ink5);
    for (let x = 20; x < W; x += 64) {
      pc.rect(x, H - 9, 6, 6, C.ink6);
      pc.hline(x, H - 9, 6, C.ink8);
      pc.set(x + 2, H - 7, C.grn6);
      g.set(x + 2, H - 7, C.grn6);
    }
    pc.rect(0, H - 3, W, 3, C.snd6);
    pc.hline(0, H - 3, W, C.snd7);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 2 };
}

function saltPlant(spec: PieceSpec, W: number, H: number): FacilityArt {
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // product stockpile (lithium carbonate, white)
    for (let x = 0; x < 44; x++) {
      const top = H - 3 - Math.round(Math.max(0, 22 - Math.abs(x - 22) * 1.05));
      for (let y = top; y < H - 3; y++) pc.set(x, y, x < 18 ? (bayer(x, y) < 4 ? C.ice2 : C.white) : bayer(x, y) < 8 ? C.ice1 : C.ice2);
    }
    // conveyor to the top of the pile
    for (let i = 0; i < 34; i++) {
      const x = 22 + i;
      const y = H - 25 + Math.round(i * 0.55);
      pc.set(x, y, C.ink6);
      pc.set(x, y + 1, C.ink4);
      if ((i + f * 2) % 6 === 0) pc.set(x, y - 1, C.white);
      if (i % 8 === 0) pc.vline(x, y + 2, H - 3 - y - 2, C.ink5);
    }
    // processing plant
    const px = 50;
    pc.rect(px, H - 30, 40, 27, C.ink8);
    pc.hline(px, H - 30, 40, C.white);
    pc.rect(px, H - 29, 40, 2, spec.accent);
    for (let x = px + 3; x < px + 37; x += 5) {
      pc.rect(x, H - 23, 3, 3, C.ink2);
      if (hash2(x, 1, 9) > 0.3) g.rect(x, H - 23, 3, 3, C.yel1);
    }
    facadeShade(pc, px, H - 30, 40, 27, C.ink8, C.ink7);
    signPlate(pc, g, spec.label, px + 2, H - 15, spec.accentHi);
    // reaction tanks and a dryer stack
    tank(pc, px + 42, H - 3, 9, 22, STEEL, true, spec.accent);
    tank(pc, px + 52, H - 3, 9, 18, STEEL, false, spec.accent);
    stack(pc, g, px + 30, H - 46, H - 30, 3, false, f % 2 === 0);
    ground(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 20, H] }, emitters: [{ x: 81, y: H - 49, kind: 'vapor', rate: 1.5 }], fps: 4 };
}

// ── open pit with haul trucks ──────────────────────────────────────────────────────────────
function haulTruck(full: boolean): PixelCanvas[] {
  return [0, 1].map((f) => {
    const pc = PixelCanvas.from(
      `
      .....aaaaaaa.
      ..bbbaaaaaaa.
      ..bcbaaaaaaa.
      ddbbbaaaaaaa.
      .eee.eee.eee.
    `,
      { a: 'yel0', b: 'yel0', c: 'sky4', d: 'org1', e: 'ink1' },
    );
    for (let x = 5; x < 12; x++) pc.set(x, 4 - 1 - 3, C.org1);
    if (full) for (let x = 6; x < 12; x++) pc.set(x, 0, C.rck2);
    if (f) {
      pc.set(1, 4, C.ink3);
      pc.set(6, 4, C.ink3);
      pc.set(10, 4, C.ink3);
    }
    // movers face right (the scene mirrors them when they drive left)
    const out = new PixelCanvas(pc.w, pc.h);
    out.blit(pc, 0, 0, true);
    return out;
  });
}

/** An open-cut mine: a hill benched into terraces on the near side, haul road zig-zagging up it. */
function openPit(spec: PieceSpec, W: number, H: number): FacilityArt {
  const copper = spec.variant === 'copper';
  const faces = copper ? [C.rck3, C.rck4, C.rck2] : [C.snd2, C.red1, C.snd1];
  const ledge = copper ? C.rck5 : C.snd4;
  const scrub = copper ? [C.grn3, C.grn4] : [C.snd3, C.grn3];
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const top = 8;
  const benches = 6;
  const bh = Math.floor((H - 3 - top) / benches);
  const step = 15;
  const plateauL = 18 + benches * step;
  const plateauR = W - 92;
  // the untouched far side of the hill
  const slope = (W - 6 - plateauR) / Math.pow(H - 3 - top, 1.25);
  const natural = (y: number) => Math.round(plateauR + Math.pow(Math.max(0, y - top), 1.25) * slope + (hash2(y >> 1, 7, 3) - 0.5) * 3);
  const benchL = (k: number) => plateauL - k * step;
  const ramp: [number, number][] = [];
  for (let k = benches - 1; k >= 0; k--) {
    const y = top + k * bh + 1;
    const l = benchL(k) + 4;
    const r = Math.min(W - 8, natural(y) - 12);
    if ((benches - 1 - k) % 2 === 0) ramp.push([l, y], [r, y]);
    else ramp.push([r, y], [l, y]);
  }
  ramp.unshift([benchL(benches - 1) - 8, H - 4]);
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    for (let k = 0; k < benches; k++) {
      const y0 = top + k * bh;
      for (let y = y0; y < y0 + bh && y < H - 3; y++) {
        const xr = natural(y);
        for (let x = benchL(k); x < Math.min(W, xr); x++) {
          let c: number;
          if (y - y0 < 2) c = ledge;
          else {
            c = faces[(k + (hash2(x >> 3, k, 5) > 0.8 ? 1 : 0)) % 2];
            if ((y + (x >> 4)) % 4 === 0 && bayer(x, y) < 8) c = faces[2]; // blast-hole strata
            if (copper && hash2(x, y, 9) < 0.05) c = C.cyn3; // malachite stains
          }
          // the cut face fades into the natural slope on the far side
          if (x > xr - 14) c = bayer(x, y) < (x - (xr - 14)) * 1.1 ? scrub[hash2(x, y, 4) > 0.5 ? 1 : 0] : c;
          pc.set(x, y, c);
        }
        pc.set(benchL(k), y, y - y0 < 2 ? ledge : faces[2]);
      }
      // a scrubby crest above the top bench
      if (k === 0) for (let x = benchL(0); x < natural(top); x++) if (hash2(x, 1, 8) < 0.3) pc.set(x, top - 1, scrub[1]);
    }
    // haul road
    for (let i = 0; i + 1 < ramp.length; i++) pc.line(ramp[i][0], ramp[i][1], ramp[i + 1][0], ramp[i + 1][1], copper ? C.snd6 : C.snd5);
    // electric shovel working the middle bench
    const sx = benchL(3) + 30;
    const sy = top + 3 * bh - 5;
    pc.rect(sx, sy, 10, 5, C.yel0);
    pc.rect(sx + 1, sy + 5, 8, 1, C.ink2);
    pc.line(sx, sy, sx - 7, sy - 5 + f, C.org1);
    pc.rect(sx - 9, sy - 5 + f, 3, 3, C.ink3);
    pc.set(sx + 7, sy + 1, C.sky4);
    // floodlight towers
    for (const [lx, ly] of [[benchL(benches - 1) + 6, H - 3], [benchL(1) + 10, top + bh * 2]] as [number, number][]) {
      pc.vline(lx, ly - 14, 14, C.ink6);
      pc.rect(lx - 2, ly - 16, 5, 2, C.ink8);
      g.rect(lx - 2, ly - 16, 5, 2, C.yel2);
    }
    drawText(pc, copper ? 'CU' : 'LI', benchL(benches - 1) + 4, H - 10, C.ink1);
    frames.push(pc);
    glows.push(g);
  }
  const movers: Mover[] = [
    { frames: haulTruck(true), path: ramp, speed: 9, phase: 0.1, pingpong: true },
    { frames: haulTruck(false), path: ramp, speed: 9, phase: 0.55, pingpong: true },
    { frames: haulTruck(true), path: ramp, speed: 8, phase: 0.85, pingpong: true },
  ];
  return { base: frames, glow: glows, points: {}, movers, emitters: [{ x: benchL(3) + 24, y: top + 3 * bh - 8, kind: 'mist', rate: 1.5, spread: 6 }], fps: 1.5 };
}

function crusher(spec: PieceSpec, W: number, H: number): FacilityArt {
  const copper = spec.variant === 'copper';
  const ore = copper ? [C.rck3, C.cyn2] : [C.red2, C.snd3];
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // ore stockpile
    for (let x = 52; x < W; x++) {
      const top = H - 3 - Math.round(Math.max(0, 24 - Math.abs(x - 74) * 1.0));
      for (let y = top; y < H - 3; y++) pc.set(x, y, bayer(x, y) < (x < 70 ? 5 : 10) ? ore[1] : ore[0]);
    }
    // crusher house (tall) + conveyor to the pile
    pc.rect(6, H - 48, 26, 45, C.ink6);
    pc.hline(6, H - 48, 26, C.ink8);
    pc.rect(6, H - 47, 26, 2, spec.accent);
    for (let y = H - 42; y < H - 8; y += 7) {
      pc.rect(10, y, 4, 3, C.ink2);
      if (hash2(y, 1, 5) > 0.3) g.rect(10, y, 4, 3, C.yel1);
    }
    facadeShade(pc, 6, H - 48, 26, 45, C.ink6, C.ink5);
    pc.rect(32, H - 22, 14, 19, C.ink5);
    for (let i = 0; i < 44; i++) {
      const x = 30 + i;
      const y = H - 44 + Math.round(i * 0.38);
      pc.set(x, y, C.ink7);
      pc.set(x, y + 1, C.ink5);
      if ((i + f * 2) % 5 === 0) pc.set(x, y - 1, ore[0]);
      if (i % 10 === 0) pc.vline(x, y + 2, H - 3 - y - 2, C.ink5);
    }
    signPlate(pc, g, spec.label, 2, H - 14, spec.accentHi);
    beacon(pc, g, 19, H - 50, f % 2 === 0);
    ground(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [W - 30, H] }, emitters: [{ x: 74, y: H - 28, kind: 'mist', rate: 1.2, spread: 6 }], fps: 4 };
}

// ── gas works (helium / neon) ──────────────────────────────────────────────────────────────
function sphereTank(pc: PixelCanvas, cx: number, cy: number, r: number) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      const l = (-dx - dy) / r; // light from upper left
      let c = l > 0.6 ? C.white : l > 0.1 ? C.ink9 : l > -0.4 ? C.ink8 : C.ink7;
      if (l > 0.1 && l <= 0.6 && ditherAt(x, y, (l - 0.1) * 2)) c = C.white;
      if (d > 0.9 && dy > 0) c = C.ink6;
      pc.set(x, y, c);
    }
  }
  // legs + equator ring
  for (let k = -2; k <= 2; k++) pc.vline(Math.round(cx + k * r * 0.4), Math.round(cy), Math.round(r) + 6, C.ink5);
  pc.hline(Math.round(cx - r), Math.round(cy), Math.round(r * 2) + 1, C.ink7);
}

function gasWorks(spec: PieceSpec, W: number, H: number): FacilityArt {
  const helium = spec.variant !== 'neon';
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  let emitters: Emitter[] = [];
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    emitters = [];
    if (helium) {
      // LNG/helium: spheres, a cold box, flare
      sphereTank(pc, 24, H - 26, 18);
      sphereTank(pc, 64, H - 22, 14);
    } else {
      // air separation at a steel works: the mill's blast furnace and sheds behind
      pc.rect(0, H - 30, 46, 27, C.rck3);
      for (let x = 2; x < 46; x += 3) pc.vline(x, H - 28, 25, C.rck2);
      for (let x = 0; x < 46; x += 9) for (let k = 0; k < 9; k++) pc.set(x + k, H - 31 - Math.floor(k / 3), C.ink5);
      facadeShade(pc, 0, H - 30, 46, 27, C.rck3, C.rck2);
      for (let y = 14; y < H - 30; y++) {
        const half = 4 + Math.floor(((y - 14) / (H - 44)) * 3);
        for (let x = 16 - half; x <= 16 + half; x++) pc.set(x, y, x > 16 + half / 2 ? C.rck1 : x < 16 - half / 2 ? C.rck3 : C.rck2);
      }
      pc.rect(12, 10, 9, 4, C.ink4);
      pc.line(20, 11, 30, 24, C.ink5);
      pc.line(21, 11, 31, 24, C.ink4);
      pc.rect(28, 24, 7, 10, C.ink5);
      g.rect(14, H - 34, 4, 3, C.org1);
      pc.rect(14, H - 34, 4, 3, C.org1);
      stack(pc, g, 36, 4, H - 30, 4, true, f % 2 === 0);
      stack(pc, g, 42, 9, H - 30, 3, true, f % 2 === 1);
      emitters.push({ x: 38, y: 2, kind: 'smoke', rate: 3 }, { x: 43, y: 7, kind: 'smoke', rate: 2.5 });
      tank(pc, 50, H - 3, 12, 30, CONCRETE, true, spec.accent);
      tank(pc, 64, H - 3, 12, 26, CONCRETE, false, spec.accent);
    }
    // cold boxes (distillation columns)
    for (const [x, h, w] of [[86, 70, 12], [100, 58, 10], [112, 44, 9]] as [number, number, number][]) {
      pc.rect(x, H - 3 - h, w, h, C.ink9);
      pc.hline(x, H - 3 - h, w, C.white);
      pc.vline(x + w - 1, H - 3 - h, h, C.ink7);
      for (let y = H - h; y < H - 6; y += 8) pc.hline(x, y, w, C.ink8);
      pc.rect(x, H - h + 3, w, 2, spec.accent);
      facadeShade(pc, x, H - 3 - h, w, h, C.ink9, C.ink8, 0.6);
      pc.hline(x - 1, H - 3 - h - 1, w + 2, C.ink6);
      beacon(pc, g, x + 1, H - 3 - h - 2, (f + x) % 2 === 0);
    }
    // pipe rack
    for (const [y, c] of [[H - 26, C.ink8], [H - 22, C.yel0], [H - 18, C.blu5], [H - 14, C.ink7]] as [number, number][]) pipe(pc, 80, y, 74, null, c, C.ink5);
    for (let x = 84; x < 154; x += 12) pc.vline(x, H - 26, 23, C.ink5);
    // compressor house
    pc.rect(124, H - 26, 40, 23, C.ink7);
    pc.hline(124, H - 26, 40, C.ink9);
    for (let x = 127; x < 160; x += 5) {
      pc.rect(x, H - 21, 3, 4, C.ink2);
      if (hash2(x, 2, 2) > 0.3) g.rect(x, H - 21, 3, 4, C.yel1);
    }
    facadeShade(pc, 124, H - 26, 40, 23, C.ink7, C.ink6);
    signPlate(pc, g, spec.label, 126, H - 12, spec.accentHi);
    // product cylinders on trailers / bundles
    for (let k = 0; k < 6; k++) {
      const x = 170 + k * 5;
      pc.rect(x, H - 14, 3, 11, k % 2 ? spec.accent : spec.accentHi);
      pc.set(x + 1, H - 15, C.ink6);
    }
    // flare stack with a flickering flame
    const fx = W - 14;
    pc.rect(fx, 22, 3, H - 25, C.ink7);
    pc.vline(fx, 22, H - 25, C.ink8);
    for (let y = 30; y < H - 3; y += 10) pc.hline(fx - 2, y, 7, C.ink6);
    pc.line(fx - 6, H - 3, fx, 40, C.ink6);
    pc.line(fx + 8, H - 3, fx + 2, 40, C.ink6);
    const flame = [
      [0, -1, C.yel1], [1, -1, C.yel2], [0, -2, C.yel0], [1, -2, C.yel1], [2, -2, C.org1], [0, -3, C.org1], [1, -3, C.yel0], [1, -4, C.org1],
      [-1, -2, C.org1], [1, -5, f % 2 ? C.org0 : C.org1], [2, -4, f % 2 ? C.org0 : C.org2], [0, -5 - (f % 3), C.org0],
    ] as [number, number, number][];
    for (const [dx, dy, c] of flame) {
      const xx = fx + dx + (f === 3 && dy < -2 ? 1 : 0);
      pc.set(xx, 21 + dy, c);
      g.set(xx, 21 + dy, c);
    }
    emitters.push({ x: fx + 1, y: 14, kind: 'smoke', rate: 2 });
    ground(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: { dock: [176, H] }, emitters, fps: 6 };
}

// ── cable landing station ──────────────────────────────────────────────────────────────────
function cableHut(spec: PieceSpec, W: number, H: number): FacilityArt {
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  for (let f = 0; f < 2; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // windowless concrete station
    pc.rect(8, 14, 52, H - 17, C.ink8);
    pc.hline(8, 14, 52, C.white);
    pc.hline(8, 15, 52, C.ink9);
    for (let x = 18; x < 60; x += 10) pc.vline(x, 17, H - 21, C.ink7);
    facadeShade(pc, 8, 14, 52, H - 17, C.ink8, C.ink7);
    // steel door and a lit keypad
    pc.rect(14, H - 15, 8, 12, C.ink5);
    pc.set(23, H - 10, C.grn6);
    g.set(23, H - 10, C.grn6);
    // aircon units
    fanUnit(pc, 30, 10, 10, f);
    fanUnit(pc, 44, 10, 10, f + 1);
    // antenna mast with a beacon
    pc.vline(4, 2, H - 5, C.ink6);
    for (let y = 4; y < H - 4; y += 4) pc.line(2, y, 6, y + 3, C.ink7);
    beacon(pc, g, 4, 1, f === 0);
    signPlate(pc, g, `${spec.label}`, 30, H - 14, C.cyn5);
    // backup generator
    pc.rect(62, H - 11, 14, 8, C.ink6);
    pc.hline(62, H - 11, 14, C.ink8);
    pc.vline(72, H - 15, 4, C.ink5);
    fence(pc, 0, H - 8, W);
    ground(pc, W, H);
    frames.push(pc);
    glows.push(g);
  }
  return { base: frames, glow: glows, points: {}, fps: 1 };
}

function manhole(W: number, H: number): FacilityArt {
  const pc = new PixelCanvas(W, H);
  const g = new PixelCanvas(W, H);
  // beach manhole: concrete lid flush with the sand
  pc.rect(8, H - 5, 18, 3, C.ink7);
  pc.hline(8, H - 5, 18, C.ink9);
  pc.rect(12, H - 4, 10, 1, C.ink5);
  // warning marker post
  pc.vline(30, H - 13, 11, C.ink6);
  pc.rect(28, H - 14, 6, 6, C.yel0);
  pc.box(28, H - 14, 6, 6, C.ink1);
  pc.set(30, H - 12, C.ink1);
  pc.set(31, H - 12, C.ink1);
  pc.set(30, H - 11, C.ink1);
  g.set(31, H - 15, C.red3);
  pc.set(31, H - 15, C.red3);
  return { base: [pc], glow: [g], points: {} };
}

// ── rival campuses ─────────────────────────────────────────────────────────────────────────
export interface RivalLook {
  name: string;
  ramp: [number, number, number, number];
  light: number;
}

export const RIVAL_LOOKS: Record<string, RivalLook> = {
  meridian: { name: 'MERIDIAN', ramp: [C.red1, C.red2, C.red3, C.org0], light: C.org1 },
  lattice: { name: 'LATTICE', ramp: [C.vio1, C.vio2, C.vio3, C.vio4], light: C.vio5 },
  orchard: { name: 'ORCHARD', ramp: [C.grn2, C.grn3, C.grn5, C.grn6], light: C.grn7 },
};

/** Small 7×7 brand marks. */
function rivalMark(pc: PixelCanvas, g: PixelCanvas, owner: string, x: number, y: number, look: RivalLook) {
  const c = look.ramp[3];
  const set = (dx: number, dy: number, col = c) => {
    pc.set(x + dx, y + dy, col);
    g.set(x + dx, y + dy, col);
  };
  if (owner === 'meridian') {
    // a globe with a meridian
    for (let a = 0; a < 24; a++) set(3 + Math.round(Math.cos((a / 24) * Math.PI * 2) * 3), 3 + Math.round(Math.sin((a / 24) * Math.PI * 2) * 3));
    for (let k = 0; k < 7; k++) set(3, k, look.light);
  } else if (owner === 'lattice') {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) set(i * 3, j * 3, (i + j) % 2 ? look.light : c);
    for (let k = 0; k < 7; k++) {
      set(k, 3, look.ramp[2]);
      set(3, k, look.ramp[2]);
    }
  } else {
    // an apple: round fruit, leaf on top
    for (let j = 2; j < 7; j++) for (let i = 0; i < 7; i++) if (Math.hypot(i - 3, j - 4.2) < 2.9) set(i, j, j < 4 ? look.light : c);
    set(3, 1, C.snd3);
    set(4, 0, look.light);
    set(5, 0, look.light);
  }
}

export function rivalSize(slots: number): [number, number] {
  const s = Math.max(1, slots);
  return [s * 96 - 10 + 30, 50 + Math.min(3, s) * 8];
}

const rivalCache = new Map<string, FacilityArt>();

/** A rival's campus: one hall per plot in the owner's colours, with flag and logo. */
export function rivalArt(owner: string, slots: number): FacilityArt {
  const key = `${owner}|${slots}`;
  let art = rivalCache.get(key);
  if (art) return art;
  const look = RIVAL_LOOKS[owner] ?? RIVAL_LOOKS.meridian;
  const [W, H] = rivalSize(slots);
  const frames: PixelCanvas[] = [];
  const glows: PixelCanvas[] = [];
  const n = Math.max(1, slots);
  for (let f = 0; f < 4; f++) {
    const pc = new PixelCanvas(W, H);
    const g = new PixelCanvas(W, H);
    // gatehouse + flag + logo pylon on the left (the property line)
    flag(pc, 3, H - 3, 30, look.ramp[2], look.ramp[3], f);
    pc.rect(10, H - 26, 10, 23, C.ink3);
    pc.hline(10, H - 26, 10, look.ramp[2]);
    rivalMark(pc, g, owner, 12, H - 22, look);
    pc.rect(9, H - 12, 12, 9, C.ink5);
    pc.rect(11, H - 10, 4, 3, C.ink1);
    g.rect(11, H - 10, 4, 3, C.yel1);
    for (let i = 0; i < n; i++) {
      const hx = 26 + i * 96;
      const hw = 82;
      const top = 12 + (i % 2) * 6;
      hallBlock(pc, g, hx, top, hw, H - 3, f, { floors: n > 2 ? 3 : 2, accent: look.ramp[2], accentLit: look.light, trim: look.ramp[3], seed: i * 5 + owner.length, core: true });
      // accent fascia across the top
      pc.rect(hx, top + 1, hw, 2, look.ramp[1]);
      pc.hline(hx, top + 1, hw, look.ramp[3]);
      // name plate
      if (i === 0) {
        const tw = measureText(look.name);
        pc.rect(hx + 4, top + 5, tw + 4, 7, C.ink1);
        drawText(pc, look.name, hx + 6, top + 6, look.light);
        drawText(g, look.name, hx + 6, top + 6, look.light);
      }
      // dock
      pc.rect(hx + hw - 30, H - 14, 13, 11, C.ink2);
      for (let y = H - 13; y < H - 3; y += 2) pc.hline(hx + hw - 29, y, 11, C.ink3);
      if (i < n - 1) transformerYard(pc, hx + hw + 2, H - 3, 1, false);
    }
    fence(pc, 0, H - 8, W, 5, look.ramp[1]);
    pc.rect(0, H - 3, W, 3, C.ink3);
    pc.hline(0, H - 3, W, C.ink5);
    frames.push(pc);
    glows.push(g);
  }
  art = { base: frames, glow: glows, points: { dock: [W - 40, H] }, fps: 3 };
  rivalCache.set(key, art);
  return art;
}

/** Rival campus under construction (bottom-up reveal, cranes in the owner's colours). */
export function rivalConstructionArt(owner: string, slots: number, progress: number): PixelCanvas {
  const look = RIVAL_LOOKS[owner] ?? RIVAL_LOOKS.meridian;
  const full = rivalArt(owner, slots).base[0];
  const { w: W, h: H } = full;
  const cut = Math.round(H - Math.max(0.15, progress) * H);
  const pc = revealFrom(full, cut);
  // keep the flag and the gatehouse (they put the sign up first)
  for (let y = 0; y < H; y++) for (let x = 0; x < 22; x++) pc.set(x, y, full.get(x, y));
  pc.rect(22, H - 3, W - 22, 3, C.ink4);
  scaffold(pc, 26, Math.max(4, cut - 8), W - 30, Math.min(H - 1, cut + 6) - Math.max(4, cut - 8));
  for (let i = 0; i < Math.max(1, slots); i++) towerCrane(pc, 26 + i * 96 + 60, 1, H, 40, 8, Math.max(2, cut - 12));
  for (let x = 22; x < W; x += 2) pc.set(x, H - 4, x % 4 ? look.ramp[2] : C.white);
  return pc;
}
