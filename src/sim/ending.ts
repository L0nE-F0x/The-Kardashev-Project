/**
 * Act V: the ending. Picks the epilogue cards (one per topic, the first variant that holds), and
 * gathers the campaign's numbers for the stats screen and the end card.
 */
import { EPILOGUES, EPILOGUE_TOPICS, type EpilogueDef } from '../content/epilogues';
import { DIFFICULTIES, FOUNDERS } from '../content/difficulty';
import type { GameState } from './types';
import { dateOf, fmtDate, fmtTW } from './core';
import { avgWellbeing } from './provinces';
import { warming } from './climate';
import { spaceTW } from './swarm';

export function pickEpilogues(s: GameState): EpilogueDef[] {
  const out: EpilogueDef[] = [];
  for (const topic of EPILOGUE_TOPICS) {
    const e = EPILOGUES.find((x) => x.topic === topic && safe(() => x.when(s)));
    if (e) out.push(e);
  }
  return out;
}

const safe = (fn: () => boolean) => {
  try {
    return fn();
  } catch {
    return false;
  }
};

/** The year (and day) Kardashev reached 1.0000. */
export function typeIDay(s: GameState): number | null {
  return s.system?.typeI ?? null;
}
export const typeIYear = (s: GameState) => (s.system?.typeI ? dateOf(s.system.typeI).getUTCFullYear() : null);

export interface CampaignStat {
  label: string;
  value: string;
}

const yearAt = (day: unknown) => (typeof day === 'number' ? dateOf(day).getUTCFullYear() : null);

/** The campaign at a glance, act by act. */
export function campaignStats(s: GameState): { headline: CampaignStat[]; acts: CampaignStat[]; choices: CampaignStat[] } {
  const sy = s.system;
  const end = sy?.typeI ?? s.day;
  const acts: CampaignStat[] = [];
  const marks: [string, unknown][] = [
    ['I · The Garage', s.flags.act1Complete],
    ['II · The Scale-Up', s.flags.act2Complete],
    ['III · The Charter', s.flags.act3Complete],
    ['IV · Planetary', s.flags.act4Complete],
    ['V · Type I', sy?.typeI],
  ];
  let from = s.meta.act5Start ? yearAt(s.flags.act5Started) : s.meta.act4Start ? 2045 : s.meta.act3Start ? 2035 : s.meta.act2Start ? 2029 : 2027;
  for (const [name, day] of marks) {
    const y = yearAt(day);
    // acts a preset skipped are not part of this campaign
    if (y === null || from === null || y < from || (y === from && day !== sy?.typeI)) continue;
    acts.push({ label: name, value: `${from}–${y}` });
    from = y;
  }
  const hours = s.meta.playtime / 3600;
  const headline: CampaignStat[] = [
    { label: 'Type I', value: sy?.typeI ? fmtDate(sy.typeI, true) : 'not yet' },
    { label: 'Kardashev', value: s.stats.K.toFixed(4) },
    { label: 'Power', value: fmtTW(s.stats.worldTW) },
    { label: 'In space', value: fmtTW(spaceTW(s)) },
    { label: 'Models trained', value: `${s.models.length} (${s.models[s.models.length - 1]?.name ?? '—'})` },
    { label: 'Warming', value: `${warming(s).toFixed(2)} °C` },
    { label: 'Wellbeing', value: `${Math.round(avgWellbeing(s))}` },
    { label: 'Healthy years', value: sy ? `${sy.lifeExp.toFixed(0)}` : '—' },
    { label: 'People in space', value: sy ? `${sy.spacePop.toFixed(0)} million` : '—' },
    { label: 'Played', value: hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.max(1, Math.round(hours * 60))} minute${Math.round(hours * 60) > 1 ? 's' : ''}` },
    { label: 'Difficulty', value: `${DIFFICULTIES[s.meta.difficulty]?.name ?? s.meta.difficulty} · ${FOUNDERS[s.meta.founder]?.name ?? s.meta.founder}` },
  ];
  const choices: CampaignStat[] = sy
    ? [
        { label: 'Thermal Line', value: sy.thermalLine ? `${sy.thermalLine.toFixed(2)} W/m²` : '—' },
        { label: 'The sky', value: sy.ownership ?? '—' },
        { label: 'Earth', value: sy.earth ?? '—' },
        { label: 'Longevity', value: sy.longevity ?? '—' },
        { label: 'The minds', value: sy.seat ? `${sy.seat} seat` : '—' },
        { label: 'Bit', value: sy.bitFate ?? '—' },
        { label: 'Your company', value: s.planet?.company ?? 'kept' },
        { label: 'Fronts held', value: [s.charter?.threshold?.held, s.planet?.heatwall?.held, sy.solarmax?.held].map((h) => `${h ?? '–'}/3`).join(' · ') },
      ]
    : [];
  void end;
  return { headline, acts, choices };
}
