/**
 * Act IV: orbit and the Moon. Spaceports raise launch cadence; orbital data centres and space-solar
 * stations fill the shells; debris builds up with traffic and decays slowly (clean-up programmes and
 * traffic rules help). A crowded low orbit risks collisions. The Moon base grows outpost → mine →
 * mass driver, making everything in space cheaper and supplying helium-3.
 */
import { CONTRACT_KINDS } from '../content/charter';
import type { ContractKind, GameState } from './types';
import { clamp, news, rand } from './core';
import { queueEvent } from './events';
import { modMult, techMult } from './effects';

const done = (s: GameState, kind: ContractKind) => (s.charter?.projects ?? []).filter((p) => p.kind === kind && p.status === 'done');
const units = (s: GameState, kind: ContractKind) => done(s, kind).reduce((a, p) => a + CONTRACT_KINDS[kind].sizes[p.size - 1], 0);
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

/** 0 nothing · 1 outpost · 2 mine · 3 mass driver. */
export function moonStage(s: GameState): number {
  return done(s, 'massdriver').length ? 3 : done(s, 'moonmine').length ? 2 : done(s, 'moonbase').length ? 1 : 0;
}

export const padsBuilt = (s: GameState) => units(s, 'spaceport');
export const orbitGW = (s: GameState) => units(s, 'odc');
export const spsGW = (s: GameState) => units(s, 'sps');

/** Launches a day (the Act III complex counts for half a pad). */
export function cadence(s: GameState): number {
  return (done(s, 'launch').length ? 0.5 : 0) + 0.6 * padsBuilt(s);
}

/** Cost multiplier on space contracts: lunar propellant, lunar metals, launch cadence, research. */
export function spaceCostMult(s: GameState): number {
  const m = moonStage(s);
  return (m >= 1 ? 0.85 : 1) * (m >= 3 ? 0.75 : 1) * Math.max(0.7, 1 - 0.03 * padsBuilt(s)) * techMult(s, 'spaceCost') * modMult(s, 'charter:space');
}

/** Whether something can be launched at all (the Act III launch complex or a spaceport). */
export function canLaunch(s: GameState): boolean {
  return done(s, 'launch').length > 0 || done(s, 'spaceport').length > 0;
}

/** One day of orbit: debris grows with traffic, decays with drag and clean-up; crowded orbits collide. */
export function tickOrbit(s: GameState): void {
  const pl = s.planet;
  if (!pl) return;
  const rules = passed(s, 'debris-rules') ? 0.55 : 1;
  const growth = rules * techMult(s, 'debrisGrowth') * modMult(s, 'orbit:debris');
  const building = (s.charter?.projects ?? []).filter((p) => p.status === 'building' && (p.kind === 'odc' || p.kind === 'sps')).length;
  pl.debris.leo += ((0.012 * orbitGW(s) + 0.02 * building + 0.01 * cadence(s)) * growth) - pl.debris.leo * 0.0004;
  pl.debris.geo += (0.006 * spsGW(s) * growth) / 10 - pl.debris.geo * 0.0001;
  pl.debris.cis += (moonStage(s) >= 3 ? 0.004 : moonStage(s) >= 1 ? 0.0015 : 0) * growth - pl.debris.cis * 0.0002;
  for (const k of ['leo', 'geo', 'cis'] as const) pl.debris[k] = clamp(pl.debris[k], 0, 100);
  // a crowded low orbit: collisions now and then
  if (pl.debris.leo > 40 && s.day - pl.lastCollision > 120 && rand(s) < (pl.debris.leo - 40) / 40_000) {
    pl.lastCollision = s.day;
    pl.collisions += 1;
    pl.debris.leo = clamp(pl.debris.leo + 6, 0, 100);
    news(s, '💥 Two objects collide in low orbit. The fragments spread along the shell.', 'bad');
    if (s.day - Number(s.events.last['orbit-collision'] ?? -9999) > 365) queueEvent(s, 'orbit-collision');
  }
}

/** A debris clean-up programme finished. */
export function cleanUp(s: GameState, size: number): void {
  const pl = s.planet;
  if (!pl) return;
  pl.debris.leo = clamp(pl.debris.leo - 15 * size, 0, 100);
  pl.debris.geo = clamp(pl.debris.geo - 5 * size, 0, 100);
}
