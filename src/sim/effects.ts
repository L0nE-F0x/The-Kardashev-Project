import { TECH_BY_ID, type TechKey } from '../content/techs';
import { FOUNDERS } from '../content/difficulty';
import { TREATY_BY_ID } from '../content/politics';
import { STARTUP_BY_ID } from '../content/rivals';
import { RESOLUTION_BY_ID } from '../content/council';
import { MISSION_MODS } from '../content/charter';
import type { GameState, Modifier } from './types';
import { nextId } from './core';

/** Product of every completed tech's (and the founder perk's) multiplier for a key. */
export function techMult(s: GameState, key: TechKey): number {
  let m = FOUNDERS[s.meta?.founder ?? 'classic']?.mods[key] ?? 1;
  for (const id of s.research.done) {
    const v = TECH_BY_ID[id]?.mods[key];
    if (v !== undefined) m *= v;
  }
  for (const id of s.politics?.treaties ?? []) {
    const v = TREATY_BY_ID[id]?.mods[key];
    if (v !== undefined) m *= v;
  }
  for (const id of s.startups?.bought ?? []) {
    const v = STARTUP_BY_ID[id]?.mods?.[key];
    if (v !== undefined) m *= v;
  }
  if (s.charter) {
    for (const id of s.charter.council.passed) {
      const v = RESOLUTION_BY_ID[id]?.mods?.[key];
      if (v !== undefined) m *= v;
    }
    for (const id of Object.keys(s.charter.missions)) {
      const v = MISSION_MODS[id]?.[key];
      if (v !== undefined) m *= v;
    }
  }
  return m;
}

export function hasTech(s: GameState, id: string): boolean {
  return s.research.done.includes(id);
}

/** Product of active modifier multipliers for a key. */
export function modMult(s: GameState, key: string): number {
  let m = 1;
  for (const mod of s.modifiers) if (mod.key === key && mod.mult !== undefined && mod.until >= s.day) m *= mod.mult;
  return m;
}

export function modAdd(s: GameState, key: string): number {
  let a = 0;
  for (const mod of s.modifiers) if (mod.key === key && mod.add !== undefined && mod.until >= s.day) a += mod.add;
  return a;
}

export function hasMod(s: GameState, key: string): boolean {
  return s.modifiers.some((m) => m.key === key && m.until >= s.day);
}

export function addModifier(s: GameState, key: string, days: number, label: string, opts: { mult?: number; add?: number }): Modifier {
  const mod: Modifier = { id: nextId(s, 'm'), key, until: s.day + days, label, ...opts };
  s.modifiers.push(mod);
  return mod;
}

export function expireModifiers(s: GameState): void {
  s.modifiers = s.modifiers.filter((m) => m.until >= s.day);
}

/** Chokepoints currently closed by events. */
export function closedChokepoints(s: GameState): Set<string> {
  const out = new Set<string>();
  for (const m of s.modifiers) if (m.key.startsWith('chokepoint:') && m.until >= s.day) out.add(m.key.slice(11));
  return out;
}
