/**
 * What the globe's layers read from the game: which sites show in which act, landing stations and mines in use,
 * rival campuses, subsea cables and shipping lanes (sea routes from the router), the Charter's map view, the
 * station's orbit and the first launch. Pure data: the layers (layers2.ts, layers3.ts) draw it.
 */
import { CABLES } from '../../content/network';
import { siteOpen, type SiteDef } from '../../content/sites';
import { charterMapView, type CharterMapView, type MegaView } from '../../sim/charterView';
import type { ContractKind, GameState } from '../../sim/types';
import { routeBetween, type Router } from '../../world/routing';
import type { ColorKey } from '../../render/palette';

type LonLat = [number, number];

// ── Act II: which sites show ───────────────────────────────────────────────────────────────
export function actOf(s: GameState | null): { act: number; phase: number } {
  return { act: s?.act ?? 1, phase: s?.phase ?? 1 };
}

/**
 * Whether a site shows on the map (Act II sites appear as the act unfolds; Act III's launch
 * candidates wait for the Build-Out, but the chosen launch site always shows).
 */
export function siteVisible(site: SiteDef, s: GameState | null): boolean {
  const { act, phase } = actOf(s);
  if (site.kind === 'launch' && act >= 3) {
    // once a launch complex is contracted, the other candidates fold away
    const chosen = chosenLaunch(s);
    if (chosen) return chosen === site.id;
  }
  return siteOpen(site, act, phase, s?.charter?.phase ?? 0);
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

export function mineOwned(s: GameState | null, siteId: string): boolean {
  return (s?.stack?.stakes?.[siteId] ?? 0) > 0;
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

// ── Act III: the Charter on the map ────────────────────────────────────────────────────────
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

const RAD = Math.PI / 180;

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

/** Game days after liftoff during which the launch keeps replaying on the map. */
export const LIFTOFF_DAYS = 30;

export function liftoffActive(v: CharterMapView, day: number): boolean {
  return v.liftoff !== null && !!v.launch && day >= v.liftoff && day - v.liftoff <= LIFTOFF_DAYS;
}
