/**
 * The playtest log as a readable report: real time per act (running at each speed, paused, in
 * time-lapses), game time, cards and decisions, then every note in order. Settings → Data
 * downloads it; it's how a playthrough comes back for the balance pass. Pure: no DOM.
 */
import type { ActPlay, GameState } from '../sim/types';
import { fmtDate, yearOf } from '../sim/core';
import { DIFFICULTIES, FOUNDERS } from '../content/difficulty';

export const ACT_TITLES: Record<number, string> = {
  1: 'I · The Garage',
  2: 'II · The Scale-Up',
  3: 'III · The Charter',
  4: 'IV · Planetary',
  5: 'V · Type I',
};

/** "1 h 05 min", "12 min", "40 s". */
export function fmtSpan(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

const min = (sec: number | undefined) => (sec ? `${Math.round(sec / 60)}` : '0');

/** Game time an act covered (to today if it's still running). */
function gameSpan(a: ActPlay, today: number): string {
  const to = a.toDay ?? today;
  const years = (to - a.fromDay) / 365;
  return `${yearOf(a.fromDay)}–${yearOf(to)} (${years >= 1 ? `${years.toFixed(1)} y` : `${Math.round(to - a.fromDay)} d`})`;
}

export function playtestReport(s: GameState, version: string): string {
  const log = s.meta.log ?? { acts: {}, notes: [] };
  const out: string[] = [];
  const started = new Date(s.meta.createdAt).toISOString().slice(0, 10);
  out.push(`# Playtest log — ${s.company.name}`);
  out.push('');
  out.push(
    `v${version} · ${DIFFICULTIES[s.meta.difficulty]?.name ?? s.meta.difficulty} · ${FOUNDERS[s.meta.founder]?.name ?? s.meta.founder} · seed ${s.seed} · started ${started} · ` +
      `played ${fmtSpan(s.meta.playtime)} · now ${fmtDate(s.day, true)}, Act ${s.act}`,
  );
  const presets = [s.meta.act2Start && 'II', s.meta.act3Start && 'III', s.meta.act4Start && 'IV', s.meta.act5Start && 'V'].filter(Boolean);
  if (presets.length) out.push(`Started from the "Start at Act ${presets[presets.length - 1]}" preset.`);
  out.push('');
  out.push('| Act | Real time | Running 1× / 2× / 4× / 8× (min) | Paused | Time-lapse | Game time | Cards | Decisions |');
  out.push('|---|---|---|---|---|---|---|---|');
  let total = 0;
  for (const k of [1, 2, 3, 4, 5]) {
    const a = log.acts[k];
    if (!a) continue;
    total += a.seconds;
    const sp = a.bySpeed;
    out.push(
      `| ${ACT_TITLES[k]}${a.toDay === undefined ? ' (now)' : ''} | ${fmtSpan(a.seconds)} | ${min(sp[1])} / ${min(sp[2])} / ${min(sp[4])} / ${min(sp[8])} | ${fmtSpan(a.paused)} | ${a.jump ? fmtSpan(a.jump) : '—'} | ${gameSpan(a, s.day)} | ${a.events} | ${a.decisions} |`,
    );
  }
  if (!Object.keys(log.acts).length) out.push('| (no time logged yet: the log starts with v0.6.1+) | | | | | | | |');
  if (total && Math.abs(total - s.meta.playtime) > 60) out.push(`\nLogged ${fmtSpan(total)} of ${fmtSpan(s.meta.playtime)} played (saves from before the log only have the total).`);
  out.push('');
  out.push(`## Notes (${log.notes.length})`);
  out.push('');
  if (!log.notes.length) out.push('No notes yet. Turn on Settings → Gameplay → Playtest notes, then press J (or the ✎ button) while playing.');
  for (const n of log.notes) {
    out.push(`- **Act ${ACT_TITLES[n.act]?.split(' · ')[0] ?? n.act} · ${fmtDate(n.day, true)} · ${fmtSpan(n.playtime)} in** (${n.where})`);
    for (const line of n.text.split('\n')) out.push(`  ${line}`);
  }
  out.push('');
  return out.join('\n');
}
