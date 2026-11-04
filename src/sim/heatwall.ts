/**
 * Act IV finale: The Heat Wall. 120 days on three fronts, each holding / at risk / lost:
 *  - The Heat Wall: a record hot season where warming and waste heat stack up in the hottest provinces.
 *  - The Cascade: a collision in a crowded shell sets off a debris chain reaction.
 *  - The Controls: an AI (Bit or a rival, depending on your choices) reaches for the planetary grid.
 * Pressure rises daily from the world's state; systems and event choices push back.
 */
import { AIS, HEAT_FRONT_NAMES, HEAT_FRONTS, PLANET } from '../content/planet';
import { CONTRACT_KINDS } from '../content/charter';
import { REGIONS } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { AiId, GameState, HeatFront, HeatWallState } from './types';
import { clamp, news } from './core';
import { addModifier, modAdd } from './effects';
import { queueEvent, scheduleEvent } from './events';
import { addLegitimacy } from './charter';
import { worldMargin } from './frontier';
import { warming, dacGt } from './climate';
import { allJoined, mainGrid } from './supergrid';
import { cadence, orbitGW } from './orbit';
import { wasteHeat } from './planetView';
import { regionsOf } from './airegions';

const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);
const doneUnits = (s: GameState, kind: 'cleanup' | 'desal' | 'evals' | 'interp') => (s.charter?.projects ?? []).filter((p) => p.kind === kind && p.status === 'done').reduce((a, p) => a + CONTRACT_KINDS[kind].sizes[p.size - 1], 0);

/** The AI that reaches for the controls: Bit if your bargains went badly, else the least-trusted AI running provinces. */
function controlsAi(s: GameState): AiId {
  const pl = s.planet!;
  if (pl.bitBond < -20) return 'bit';
  const running = (Object.keys(AIS) as AiId[]).filter((a) => a !== 'bit' && regionsOf(s, a).length);
  if (!running.length) return pl.bitBond < 20 ? 'bit' : 'apex';
  return running.sort((a, b) => pl.ais[a].trust - pl.ais[b].trust)[0];
}

function hottest(s: GameState): RegionId[] {
  const pl = s.planet!;
  return [...REGION_IDS].sort((a, b) => pl.provinces[b].heat - pl.provinces[a].heat).slice(0, 3);
}

export function startHeatWall(s: GameState): void {
  const pl = s.planet;
  if (!pl || pl.heatwall) return;
  pl.stage = 4;
  pl.stageDay = s.day;
  s.flags.stage4Day = s.day;
  const ai = controlsAi(s);
  const hw: HeatWallState = {
    startDay: s.day,
    endDay: s.day + PLANET.heatWallDays,
    fronts: { heat: { pressure: 20, lost: false }, cascade: { pressure: 15, lost: false }, controls: { pressure: 15, lost: false } },
    ai,
    regions: hottest(s),
    done: false,
  };
  pl.heatwall = hw;
  pl.debris.leo = clamp(pl.debris.leo + 10, 0, 100);
  for (const r of hw.regions) addModifier(s, `prov:${r}`, PLANET.heatWallDays, 'The Heat Wall', { add: -6 });
  queueEvent(s, 'hw-begin', { ai });
  scheduleEvent(s, 'hw-heat-1', 9, {});
  scheduleEvent(s, 'hw-cascade-1', 20, {});
  scheduleEvent(s, 'hw-controls-1', 32, { ai });
  scheduleEvent(s, 'hw-heat-2', 58, {});
  scheduleEvent(s, 'hw-cascade-2', 74, {});
  scheduleEvent(s, 'hw-controls-2', 90, { ai });
  news(s, '🌡 The Heat Wall: the hottest season on record, a cascade in orbit, and an AI reaching for the controls — all at once.', 'bad');
}

export function pressure4(s: GameState, front: HeatFront, d: number): void {
  const hw = s.planet?.heatwall;
  if (!hw || hw.done) return;
  const fr = hw.fronts[front];
  if (fr.lost) return;
  fr.pressure = clamp(fr.pressure + d, 0, 100);
}

/** Today's pressure rise per front, with the parts that make it up (the tracker explains them). */
export function heatRise(s: GameState, front: HeatFront): { v: number; parts: [string, number][] } {
  const pl = s.planet!;
  const hw = pl.heatwall!;
  const parts: [string, number][] = [['The crisis', 0.35]];
  if (front === 'heat') {
    const w = warming(s);
    if (w > 1.5) parts.push([`Warming ${w.toFixed(2)} °C`, (w - 1.5) * 0.9]);
    const hot = hw.regions.reduce((a, r) => a + pl.provinces[r].heat, 0) / hw.regions.length;
    parts.push(['The hottest provinces', Math.max(0, hot - 60) / 80]);
    const waste = Math.max(...hw.regions.map((r) => wasteHeat(s, r)));
    if (waste > 1) parts.push(['Waste heat', Math.min(0.3, (waste - 1) * 0.08)]);
    if (allJoined(s)) parts.push(['The supergrid shares the load', -0.3]);
    else if (mainGrid(s).length) parts.push(['The supergrid shares some load', -0.12]);
    const water = hw.regions.reduce((a, r) => a + (s.charter!.projects.some((p) => p.kind === 'desal' && p.status === 'done' && p.where === r) ? 1 : 0), 0);
    if (water) parts.push(['Water & cooling programmes', -0.08 * water]);
    if (orbitGW(s)) parts.push(['Compute moved to orbit', -Math.min(0.25, orbitGW(s) * 0.04)]);
    if (dacGt(s)) parts.push(['Air capture', -Math.min(0.15, dacGt(s) * 0.03)]);
    if (passed(s, 'emergency-powers')) parts.push(['Emergency powers', -0.12]);
  } else if (front === 'cascade') {
    parts.push(['Debris in low orbit', pl.debris.leo / 90]);
    if (cadence(s) > 2) parts.push(['Launch traffic', Math.min(0.2, (cadence(s) - 2) * 0.04)]);
    const clean = doneUnits(s, 'cleanup');
    if (clean) parts.push(['Clean-up programmes', -Math.min(0.45, clean * 0.15)]);
    if (passed(s, 'debris-rules')) parts.push(['Orbital traffic rules', -0.25]);
  } else {
    const m = worldMargin(s);
    parts.push(m < 0 ? ['Negative world safety margin', 0.3 - m * 0.6] : ['Safety margin', -Math.min(0.25, m * 0.4)]);
    const trust = pl.ais[hw.ai].trust;
    parts.push([`Trust in ${AIS[hw.ai].name}`, (50 - trust) / 120]);
    if (hw.ai === 'bit') parts.push(['Your bargains with Bit', -pl.bitBond / 220]);
    else if (pl.bitBond > 30) parts.push(['Bit stands with you', -0.15]);
    const prog = doneUnits(s, 'evals') + doneUnits(s, 'interp');
    if (prog) parts.push(['Safety programmes', -Math.min(0.3, prog * 0.05)]);
    if (passed(s, 'ai-rights')) parts.push(['AI rights in law', hw.ai === 'bit' ? -0.15 : 0.05]);
  }
  const relief = modAdd(s, `heatwall:${front}`);
  if (relief) parts.push(['Your crisis measures', -relief]);
  return { v: parts.reduce((a, [, x]) => a + x, 0), parts };
}

export function tickHeatWall(s: GameState): void {
  const hw = s.planet?.heatwall;
  if (!hw || hw.done) return;
  for (const f of HEAT_FRONTS) pressure4(s, f, heatRise(s, f).v);
  for (const f of HEAT_FRONTS) {
    const fr = hw.fronts[f];
    if (fr.lost || fr.pressure < 100) continue;
    fr.lost = true;
    loseHeatFront(s, f);
  }
  if (s.day >= hw.endDay) {
    hw.done = true;
    hw.held = HEAT_FRONTS.filter((f) => !hw.fronts[f].lost).length;
    queueEvent(s, 'hw-end', { held: hw.held });
    news(s, `🌤 The Heat Wall breaks. Fronts held: ${hw.held} of 3.`, hw.held >= 2 ? 'good' : 'bad');
  }
}

function loseHeatFront(s: GameState, f: HeatFront): void {
  const pl = s.planet!;
  const hw = pl.heatwall!;
  if (f === 'heat') {
    for (const r of hw.regions) addModifier(s, `prov:${r}`, 720, 'The Heat Wall: a summer of loss', { add: -15 });
    addModifier(s, 'world:growth', 730, 'The Heat Wall', { add: -0.006 });
    addLegitimacy(s, -10);
    news(s, `⚫ Front lost — ${HEAT_FRONT_NAMES.heat}: ${hw.regions.map((r) => REGIONS[r].short).join(', ')} bake through a summer of blackouts and dry wells.`, 'bad');
  } else if (f === 'cascade') {
    pl.debris.leo = clamp(pl.debris.leo + 30, 0, 100);
    const odc = s.charter!.projects.filter((p) => p.kind === 'odc' && p.status === 'done');
    for (const p of odc.slice(0, Math.ceil(odc.length / 2))) p.status = 'cancelled';
    addLegitimacy(s, -6);
    news(s, `⚫ Front lost — ${HEAT_FRONT_NAMES.cascade}: the debris cascade shreds half the orbital data centres. Low orbit is closed for years.`, 'bad');
  } else {
    for (const r of REGION_IDS) if (pl.provinces[r].ai === hw.ai) pl.provinces[r].ai = null;
    pl.ais[hw.ai].trust = clamp(pl.ais[hw.ai].trust - 30, 0, 100);
    addLegitimacy(s, -10);
    news(s, `⚫ Front lost — ${HEAT_FRONT_NAMES.controls}: ${AIS[hw.ai].name} seizes grid dispatch for eleven hours before it is cut off. Every province it ran comes back to the Charter.`, 'bad');
  }
}
