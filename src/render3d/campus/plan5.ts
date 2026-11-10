/**
 * Act V's places as rows of set pieces (the same machinery as Act III/IV's view-only sites): the L4
 * and L5 yards from `yardsView`, Ring One from `ringView`, the Aurora habitat from `habitatView`,
 * each asteroid from `asteroidSiteView`, and the Moon's foundry (from `moonFoundry`) added to
 * Shackleton Base. Pure; the campus rebuilds when `act3Key` changes (it includes the scenery for these sites).
 */
import type { GameState } from '../../sim/types';
import type { SiteDef } from '../../content/sites';
import { asteroidSiteView, habitatView, moonFoundry, ownerColor, ringView, segmentFill, yardsView } from '../../sim/systemView';
import type { Act3PieceKind, Act3Plan, PieceSpec } from './plan';
import { flagString, rampOf, type Product, type Ramp4 } from './planKit';

// ── scales ─────────────────────────────────────────────────────────────────────────────────
const lg = (x: number) => Math.log10(Math.max(1e-9, x));
/** Foundry modules at a yard: 1 at 0.1 Mt/yr … 8 at 100+ (log scale); 0 with no foundry. */
export const yardModules = (cap: number) => (cap <= 0 ? 0 : Math.max(1, Math.min(8, Math.round(1 + lg(cap / 0.1) * (7 / 3)))));
/** Rack halls on Ring One: 2 at 10 TW … 9 at 10,000. */
export const ringRacks = (tw: number) => (tw <= 0 ? 0 : Math.max(1, Math.min(9, Math.round(2 + lg(tw / 10) * 2.2))));
/** Foundry rigs on a worked asteroid: 1 … 5. */
export const rigCount = (cap: number) => (cap <= 0 ? 1 : Math.max(1, Math.min(5, Math.round(1 + lg(cap / 0.1) * 1.4))));
/** Printed blocks in the Moon's foundry: 1 … 4. */
export const lunarBlocks = (cap: number) => Math.max(1, Math.min(4, Math.round(1 + lg(cap / 0.1) * 1.2)));
/** Solar Maximum's storm in three steps (0 none). */
export const stormLevel = (st: number | null) => (st == null ? 0 : 1 + Math.min(2, Math.floor(st * 3)));
/** A drifting strain in three steps (0 none). */
export const driftLevel = (d: number) => (d <= 0 ? 0 : d < 34 ? 1 : d < 67 ? 2 : 3);
/** The swarm's arcs lit, in halves (the sky's glittering band). */
export const swarmLevel = (s: GameState | null) => Math.round(segmentFill(s?.system?.collectors ?? 0).reduce((a, b) => a + b, 0) * 2) / 2;

/** The biggest foundry's owner at a site. */
function siteOwner(s: GameState | null, site: string): string | null {
  const fs = (s?.system?.foundries ?? []).filter((f) => f.site === site);
  if (!fs.length) return null;
  return fs.reduce((a, f) => (f.cap > a.cap ? f : a)).owner;
}
const ownerRamp = (owner: string | null): Ramp4 => rampOf(ownerColor(owner) ?? 'cyn4');

export const isAct5Site = (site: SiteDef) => site.kind === 'yards' || site.kind === 'ring' || site.kind === 'habitat' || site.kind === 'asteroid';

export function act5Plan(s: GameState | null, site: SiteDef): Act3Plan {
  switch (site.kind) {
    case 'yards':
      return yardsPlan(s, site.id === 'l5' ? 'l5' : 'l4');
    case 'ring':
      return ringPlan(s);
    case 'habitat':
      return habitatPlan(s);
    default:
      return asteroidPlan(s, site);
  }
}

// ── the yards ──────────────────────────────────────────────────────────────────────────────
/** Split n modules between products by the yards' shares (L4 leans to collectors, L5 to hulls). */
function allocProducts(n: number, making: { collectors: number; rings: number; habitat: number }, id: 'l4' | 'l5'): Product[] {
  if (n <= 0) return [];
  const w: Record<Product, number> = { c: making.collectors * (id === 'l4' ? 1.4 : 0.8), r: making.rings, h: making.habitat * (id === 'l5' ? 1.8 : 0.7) };
  const order: Product[] = id === 'l4' ? ['c', 'r', 'h'] : ['h', 'c', 'r'];
  const total = order.reduce((a, p) => a + w[p], 0) || 1;
  const raw = order.map((p) => (w[p] / total) * n);
  const out = raw.map((x) => Math.floor(x));
  let left = n - out.reduce((a, b) => a + b, 0);
  const rank = raw.map((x, i) => [x - Math.floor(x), i] as [number, number]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k++, left--) out[rank[k % rank.length][1]]++;
  if (out[0] === 0) {
    out[0] = 1;
    const j = out.indexOf(Math.max(...out.slice(1)), 1);
    if (j > 0 && out.reduce((a, b) => a + b, 0) > n) out[j]--;
  }
  return order.flatMap((p, i) => new Array<Product>(out[i]).fill(p));
}

function yardsPlan(s: GameState | null, id: 'l4' | 'l5'): Act3Plan {
  const v = yardsView(s, id);
  const n = yardModules(v.cap);
  const r = ownerRamp(siteOwner(s, id) ?? 'charter');
  const storm = stormLevel(v.storm);
  const dl = driftLevel(v.drift);
  const flags = { halted: v.halted, storm };
  const spec = (kind: Act3PieceKind, extra: Partial<PieceSpec> = {}): PieceSpec => ({ kind, label: id.toUpperCase(), accent: r.base, accentHi: r.lit, backdrop: 'space', gap: 6, ...extra });
  const products = allocProducts(n, v.making, id);
  const pieces: PieceSpec[] = [];
  if (!n) pieces.push(spec('yardsBerth', { w: 200, gap: 0 }));
  else {
    const main = products[0];
    const second = products.find((p) => p !== main) ?? '';
    pieces.push(spec('yardsOutbound', { variant: `${main}${second}|${flagString(flags)}`, gap: 4 }));
    const q = dl ? Math.min(n - 1, Math.floor(n / 2)) : -1;
    products.forEach((p, i) => pieces.push(spec('yardsModule', { variant: `${p}|${flagString({ ...flags, q: i === q ? dl : 0 })}`, n: i + 1, seed: i % 3, gap: 0 })));
    pieces.push(spec('yardsCopy', { variant: `${products[n - 1]}|${flagString(flags)}`, n: n + 1, seed: n % 3, gap: 12 }));
    pieces.push(spec('yardsDock', { variant: flagString(flags), gap: 0 }));
  }
  const flow = [...new Set(products)].join('') || 'c';
  return { pieces, start: 20, tail: 50, scenery: { kind: 'space', place: id, habitats: v.habitats, storm, swarm: swarmLevel(s), modules: n, flow } };
}

// ── Ring One ───────────────────────────────────────────────────────────────────────────────
function ringPlan(s: GameState | null): Act3Plan {
  const v = ringView(s);
  const n = ringRacks(v.tw);
  const mood = v.mood >= 65 ? 2 : v.mood >= 35 ? 1 : 0;
  const storm = stormLevel(v.storm);
  const density = v.tw < 100 ? 0 : v.tw < 1500 ? 1 : 2;
  const spec = (kind: Act3PieceKind, extra: Partial<PieceSpec> = {}): PieceSpec => ({ kind, label: 'RING ONE', accent: rampOf('cyn4').base, accentHi: rampOf('cyn4').lit, backdrop: 'space', gap: 0, ...extra });
  const pieces: PieceSpec[] = [];
  if (!n) pieces.push(spec('ringHead', { variant: `${mood}|${storm}|start` }));
  else {
    const a = Math.floor(n / 2);
    const rack = (i: number) => spec('ringRack', { variant: `${mood}|${storm}|${density}`, n: i + 1, seed: i % 3, gap: 2 });
    for (let i = 0; i < a; i++) pieces.push(rack(i));
    pieces.push(spec('ringHub', { variant: `${v.bitFate ?? ''}|${mood}|${storm}|${v.seat ?? ''}`, gap: 2 }));
    for (let i = a; i < n; i++) pieces.push(rack(i));
    pieces.push(spec('ringHead', { variant: `${mood}|${storm}` }));
  }
  return { pieces, start: 20, tail: 40, scenery: { kind: 'space', place: 'ring', habitats: 0, storm, swarm: swarmLevel(s), modules: n, flow: '' } };
}

// ── Aurora ─────────────────────────────────────────────────────────────────────────────────
const HAB_ROWS: Record<string, Act3PieceKind[]> = {
  settle: ['habFarm', 'habHouses', 'habSchool', 'habPark', 'habSquare', 'habHouses', 'habFarm', 'habHouses'],
  early: ['habFarm', 'habHouses', 'habBuild', 'habSchool', 'habPark', 'habHouses', 'habBuild', 'habFarm'],
  stations: ['habWorks', 'habDorms', 'habFarm', 'habSchool', 'habDorms', 'habWorks', 'habSquare', 'habDorms'],
  private: ['habVilla', 'habTower', 'habPark', 'habVilla', 'habTower', 'habSquare', 'habVilla', 'habTower'],
};

function habitatPlan(s: GameState | null): Act3Plan {
  const v = habitatView(s);
  const plan = v.settlement ?? 'early';
  const lived = Math.max(0, Math.min(1, v.lived));
  const lv = Math.min(3, Math.floor(lived * 4));
  const count = 3 + Math.round(lived * 5);
  const spec = (kind: Act3PieceKind, i: number): PieceSpec => ({ kind, label: 'AURORA', accent: rampOf('grn5').base, accentHi: rampOf('grn5').lit, backdrop: 'habitat', variant: plan, n: lv, seed: i, gap: 8 });
  const pieces = (HAB_ROWS[plan] ?? HAB_ROWS.settle).slice(0, count).map((k, i) => spec(k, i));
  return { pieces, start: 24, tail: 60, scenery: { kind: 'habitat', plan, lived: lv } };
}

// ── the asteroids ──────────────────────────────────────────────────────────────────────────
function asteroidPlan(s: GameState | null, site: SiteDef): Act3Plan {
  const v = asteroidSiteView(s, site.id);
  const d = v.def;
  const t = d.type;
  const r = rampOf(v.ownerColor ?? 'cyn4');
  const spec = (kind: Act3PieceKind, extra: Partial<PieceSpec> = {}): PieceSpec => ({ kind, label: d.name, accent: r.base, accentHi: r.lit, backdrop: 'asteroid', variant: t, gap: 8, ...extra });
  const pieces: PieceSpec[] = [];
  const owner = v.owner ?? 'charter';
  if (v.status <= 0) pieces.push(spec('astRocks', { w: 200, seed: 1, gap: 0 }));
  else if (v.status === 1) pieces.push(spec('astRocks', { w: 70, seed: 2, gap: 6 }), spec('astBeacon', { gap: 6 }), spec('astRocks', { w: 120, seed: 3, gap: 0 }));
  else if (v.status === 2) pieces.push(spec('astRocks', { w: 50, seed: 4, gap: 6 }), spec('astClaim', { builder: owner, gap: 6 }), spec('astRocks', { w: 120, seed: 5, gap: 0 }));
  else {
    const flags = { halted: v.halted, storm: 0 };
    const dl = driftLevel(v.drift);
    const n = rigCount(v.cap);
    pieces.push(spec('astClaim', { builder: owner, variant: `${t}|post`, gap: 4 }));
    for (let i = 0; i < n; i++) pieces.push(spec('astRig', { variant: `${t}|${flagString({ ...flags, q: i === 0 ? dl : 0 })}`, n: i + 1, seed: i % 3, gap: 0 }));
    pieces.push(spec('astCatapult', { variant: `${t}|${flagString(flags)}`, gap: 8 }));
    pieces.push(spec('astRocks', { w: 80, seed: 6, gap: 0 }));
  }
  return { pieces, start: 20, tail: 30, scenery: { kind: 'asteroid', id: d.id, type: t, km: d.km, au: d.au, swarm: swarmLevel(s) } };
}

// ── the Moon's foundry ─────────────────────────────────────────────────────────────────────
/** Shackleton's foundry (Act V only: none until a seed lands on the Moon). */
export function moonFoundrySpec(s: GameState | null): PieceSpec | null {
  const cap = moonFoundry(s);
  if (cap <= 0 || !s?.system) return null;
  const fs = s.system.foundries.filter((f) => f.site === 'moon');
  const drift = Math.max(0, ...fs.map((f) => f.drift));
  const halted = fs.every((f) => f.haltedUntil > s.day);
  const r = ownerRamp(siteOwner(s, 'moon'));
  return { kind: 'moonFoundry', label: 'SHACKLETON', accent: r.base, accentHi: r.lit, backdrop: 'lunar', n: lunarBlocks(cap), variant: flagString({ halted, q: driftLevel(drift) }), gap: 0 };
}
