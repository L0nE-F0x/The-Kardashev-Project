/**
 * Act V finale: Solar Maximum. At the peak of the Sun's cycle, a Carrington-class storm. 120 days on
 * three fronts, each holding / at risk / lost:
 *  - The Storm: the swarm, the beams and the grid take the hit.
 *  - The Thermal Line: with the swarm dark, Earth's own plants run flat out and the surface heats up.
 *  - The Minds: in the chaos a foundry strain breaks loose, and the AIs ask for (or take) the authority
 *    to stop it.
 * Pressure rises daily from the world's state; systems and event choices push back. Afterwards the
 * last climb runs to Kardashev 1.0000.
 */
import { AIS } from '../content/planet';
import { MAX_FRONT_NAMES, MAX_FRONTS, SYSTEM } from '../content/system';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { AiId, GameState, MaxFront, SolarMaxState } from './types';
import { clamp, news } from './core';
import { addModifier, modAdd, techMult } from './effects';
import { queueEvent, scheduleEvent } from './events';
import { addLegitimacy } from './charter';
import { worldMargin } from './frontier';
import { warming } from './climate';
import { allJoined } from './supergrid';
import { regionsOf } from './airegions';
import { avgGarden, headroomTW, overLine } from './swarm';

const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

/** The AI that reaches for authority over the foundries: Bit if things went badly between you, else the least-trusted AI with provinces, else Chorus. */
function mindsAi(s: GameState): AiId | 'chorus' {
  const pl = s.planet!;
  const sy = s.system!;
  if (sy.bitFate === 'leash' || pl.bitBond < -20) return 'bit';
  const running = (Object.keys(AIS) as AiId[]).filter((a) => a !== 'bit' && regionsOf(s, a).length);
  if (running.length) return running.sort((a, b) => pl.ais[a].trust - pl.ais[b].trust)[0];
  return 'chorus';
}

export const mindsAiName = (ai: string) => (ai === 'chorus' ? 'Chorus' : AIS[ai as AiId]?.name ?? ai);

export function startSolarMax(s: GameState): void {
  const sy = s.system;
  if (!sy || sy.solarmax) return;
  sy.stage = 4;
  sy.stageDay = s.day;
  s.flags.vstage4Day = s.day;
  const ai = mindsAi(s);
  // the strain breaks loose at the biggest foundry
  const big = [...sy.foundries].sort((a, b) => b.cap - a.cap)[0];
  const sm: SolarMaxState = {
    startDay: s.day,
    endDay: s.day + SYSTEM.solarMaxDays,
    fronts: { storm: { pressure: 20, lost: false }, thermal: { pressure: 15, lost: false }, minds: { pressure: 15, lost: false } },
    ai,
    foundry: big?.id ?? null,
    done: false,
  };
  sy.solarmax = sm;
  // the first wave knocks out part of the swarm (hardening shrugs off some)
  sy.damage = clamp(sy.damage + 0.35 * (1 - sy.hardening) * techMult(s, 'stormDamage'), 0, 0.9);
  if (big) big.drift = Math.max(big.drift, 25);
  queueEvent(s, 'sm-begin', { ai });
  scheduleEvent(s, 'sm-storm-1', 8, {});
  scheduleEvent(s, 'sm-minds-1', 20, { ai });
  scheduleEvent(s, 'sm-thermal-1', 34, {});
  scheduleEvent(s, 'sm-storm-2', 55, {});
  scheduleEvent(s, 'sm-minds-2', 76, { ai });
  scheduleEvent(s, 'sm-thermal-2', 92, {});
  news(s, '☀ Solar Maximum: a storm like nothing since 1859 is on its way. The swarm, the Thermal Line and the minds — all at once.', 'bad');
}

export function pressure5(s: GameState, front: MaxFront, d: number): void {
  const sm = s.system?.solarmax;
  if (!sm || sm.done) return;
  const fr = sm.fronts[front];
  if (fr.lost) return;
  fr.pressure = clamp(fr.pressure + d, 0, 100);
}

/** Today's pressure rise per front and what makes it up (the tracker explains it). */
export function maxRise(s: GameState, front: MaxFront): { v: number; parts: [string, number][] } {
  const sy = s.system!;
  const sm = sy.solarmax!;
  const parts: [string, number][] = [['The storm', 0.35]];
  if (front === 'storm') {
    parts.push(['Exposed collectors', (1 - sy.hardening) * 0.55 * techMult(s, 'stormDamage')]);
    if (sy.damage > 0.2) parts.push(['Arcs already dark', (sy.damage - 0.2) * 0.8]);
    if (sy.hardening > 0.2) parts.push(['Storm hardening', -Math.min(0.4, sy.hardening * 0.45)]);
    if (allJoined(s)) parts.push(['The supergrid reroutes', -0.15]);
    if (passed(s, 'storm-watch')) parts.push(['The storm watch', -0.12]);
  } else if (front === 'thermal') {
    const over = overLine(s);
    const head = headroomTW(s);
    parts.push(over > 0 ? ['Over the Thermal Line', 0.2 + over * 3] : ['Headroom under the line', -Math.min(0.3, head / 400)]);
    parts.push(['Earth’s plants running flat out', sy.damage * 0.6]);
    const w = warming(s);
    if (w > 1.7) parts.push([`Warming ${w.toFixed(2)} °C`, (w - 1.7) * 0.8]);
    const g = avgGarden(s);
    if (g > 10) parts.push(['Gardens and wild places', -Math.min(0.25, g / 250)]);
    if (sy.rings > 100) parts.push(['Compute already in orbit', -Math.min(0.25, Math.log10(sy.rings / 100) * 0.12)]);
  } else {
    const strain = sm.foundry ? sy.foundries.find((f) => f.id === sm.foundry)?.drift ?? 0 : 0;
    if (strain > 0) parts.push(['The loose strain', strain / 220]);
    parts.push(['The minds’ mood', (50 - sy.mindsMood) / 150]);
    const m = worldMargin(s);
    parts.push(m < 0 ? ['Negative world safety margin', 0.25 - m * 0.5] : ['Safety margin', -Math.min(0.2, m * 0.35)]);
    if (sy.seat === 'full') parts.push(['The minds have a seat', -0.2]);
    else if (sy.seat === 'advisory') parts.push(['The minds have a voice', -0.08]);
    else if (sy.seat === 'none') parts.push(['The minds have no say', 0.15]);
    if (sy.sentinels > 0.2) parts.push(['Drift sentinels', -Math.min(0.3, sy.sentinels * 0.35)]);
    if (sm.ai === 'bit') parts.push(['Your bargains with Bit', -(s.planet?.bitBond ?? 0) / 220]);
    else if (sy.bitFate === 'costeward' || sy.bitFate === 'free') parts.push(['Bit stands with you', -0.15]);
  }
  const relief = modAdd(s, `solarmax:${front}`);
  if (relief) parts.push(['Your crisis measures', -relief]);
  return { v: parts.reduce((a, [, x]) => a + x, 0), parts };
}

export function tickSolarMax(s: GameState): void {
  const sy = s.system;
  const sm = sy?.solarmax;
  if (!sy || !sm || sm.done) return;
  for (const f of MAX_FRONTS) pressure5(s, f, maxRise(s, f).v);
  // the storm keeps battering the swarm while it lasts
  sy.damage = clamp(sy.damage + 0.0035 * (1 - sy.hardening) * techMult(s, 'stormDamage'), 0, 0.9);
  for (const f of MAX_FRONTS) {
    const fr = sm.fronts[f];
    if (fr.lost || fr.pressure < 100) continue;
    fr.lost = true;
    loseMaxFront(s, f);
  }
  if (s.day >= sm.endDay) {
    sm.done = true;
    sm.held = MAX_FRONTS.filter((f) => !sm.fronts[f].lost).length;
    news(s, `🌤 Solar Maximum passes. Fronts held: ${sm.held} of 3.`, sm.held >= 2 ? 'good' : 'bad');
  }
}

function loseMaxFront(s: GameState, f: MaxFront): void {
  const sy = s.system!;
  const sm = sy.solarmax!;
  if (f === 'storm') {
    sy.collectors *= 0.8;
    sy.damage = clamp(sy.damage + 0.25, 0, 0.9);
    addLegitimacy(s, -6);
    news(s, `⚫ Front lost — ${MAX_FRONT_NAMES.storm}: a fifth of the swarm is burned out. The arcs go dark one by one.`, 'bad');
  } else if (f === 'thermal') {
    const hot = [...REGION_IDS].sort((a: RegionId, b: RegionId) => (s.planet?.provinces[b].heat ?? 0) - (s.planet?.provinces[a].heat ?? 0)).slice(0, 4);
    for (const r of hot) addModifier(s, `prov:${r}`, 720, 'Solar Maximum: the hot summer', { add: -14 });
    addLegitimacy(s, -10);
    news(s, `⚫ Front lost — ${MAX_FRONT_NAMES.thermal}: with the swarm dark, Earth burns through its heat budget. A summer of brownouts in the hottest provinces.`, 'bad');
  } else {
    const fd = sm.foundry ? sy.foundries.find((x) => x.id === sm.foundry) : undefined;
    if (fd) sy.foundries = sy.foundries.filter((x) => x !== fd);
    sy.mindsMood = clamp(sy.mindsMood - 15, 0, 100);
    if (sm.ai !== 'chorus' && s.planet) {
      const ai = sm.ai as AiId;
      for (const r of REGION_IDS) if (s.planet.provinces[r].ai === ai) s.planet.provinces[r].ai = null;
      s.planet.ais[ai].trust = clamp(s.planet.ais[ai].trust - 25, 0, 100);
    }
    addLegitimacy(s, -10);
    news(s, `⚫ Front lost — ${MAX_FRONT_NAMES.minds}: ${mindsAiName(sm.ai)} takes the foundries' controls to stop the strain, and stops it by destroying the whole yard. Nobody gave it that authority.`, 'bad');
  }
}
