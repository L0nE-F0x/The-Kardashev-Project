/**
 * The portrait contact sheet (dev only: /play/portraits.html, not part of the build). Every face at the two sizes
 * the interface shows it, on the panel colour:
 *   ?set=advisors (five moods) · ages (0–3) · ceos · governors · bit (0–11 × moods) · ais · moods (everyone, five moods)
 *   &big=120&small=40 sizes · &only=juno,penny · &mood=happy
 * `window.portraitTimes` holds how long each render took (ms), first to last.
 */
import type { AdvisorId } from '../../sim/types';
import type { Mood } from '../../content/events';
import { AVATAR_IDS, CEO_LOOKS, GOVERNOR_LOOKS, LOOKS } from './looks';
import { ceoPortraitUrl, governorPortraitUrl, portraitUrl } from './portraits';

const q = new URLSearchParams(location.search);
const set = q.get('set') ?? 'advisors';
const big = Number(q.get('big') ?? 120);
const small = Number(q.get('small') ?? 40);
const only = q.get('only')?.split(',');
const oneMood = (q.get('mood') ?? 'neutral') as Mood;
const MOODS: Mood[] = ['neutral', 'happy', 'worried', 'angry', 'excited'];
const sheet = document.getElementById('sheet')!;
const times: number[] = [];
(window as unknown as { portraitTimes: number[] }).portraitTimes = times;

function timed(fn: () => string): string {
  const t = performance.now();
  const url = fn();
  times.push(performance.now() - t);
  return url;
}
function cell(row: HTMLElement, label: string, url: string) {
  const c = document.createElement('div');
  c.className = 'cell';
  const pair = document.createElement('div');
  pair.className = 'pair';
  for (const size of [big, small]) {
    if (!size) continue;
    const img = document.createElement('img');
    img.src = url;
    img.width = img.height = size;
    pair.append(img);
  }
  const s = document.createElement('span');
  s.textContent = label;
  c.append(pair, s);
  row.append(c);
}
function row(title: string): HTMLElement {
  const r = document.createElement('div');
  r.className = 'row';
  const b = document.createElement('b');
  b.textContent = title;
  r.append(b);
  sheet.append(r);
  return r;
}
const want = (id: string) => !only || only.includes(id);
const advisors = Object.keys(LOOKS) as Exclude<AdvisorId, 'bit'>[];
const ceos = Object.keys(CEO_LOOKS);
const governors = Object.keys(GOVERNOR_LOOKS);

if (set === 'advisors') {
  for (const id of advisors.filter(want)) {
    const r = row(id);
    for (const m of MOODS) cell(r, m, timed(() => portraitUrl(id, m)));
  }
} else if (set === 'ages') {
  for (const id of advisors.filter(want)) {
    const r = row(id);
    for (const age of [0, 1, 2, 3]) cell(r, ['as before', 'greying', 'elder', 'renewed'][age], timed(() => portraitUrl(id, oneMood, 1, age)));
  }
} else if (set === 'ceos' || set === 'governors') {
  const ids = (set === 'ceos' ? ceos : governors).filter(want);
  const per = Number(q.get('per') ?? 8);
  for (let i = 0; i < ids.length; i += per) {
    const r = row('');
    for (const id of ids.slice(i, i + per)) cell(r, id, timed(() => (set === 'ceos' ? ceoPortraitUrl(id, oneMood) : governorPortraitUrl(id, oneMood))));
  }
} else if (set === 'moods') {
  for (const id of [...ceos, ...governors.map((g) => `gov:${g}`)].filter(want)) {
    const r = row(id);
    for (const m of MOODS) cell(r, m, timed(() => (id.startsWith('gov:') ? governorPortraitUrl(id.slice(4), m) : ceoPortraitUrl(id, m))));
  }
} else if (set === 'bit') {
  for (let gen = 0; gen <= 11; gen++) {
    if (!want(String(gen))) continue;
    const r = row(`Bit-${gen}`);
    for (const m of MOODS) cell(r, m, timed(() => portraitUrl('bit', m, gen)));
  }
} else if (set === 'ais') {
  for (const id of AVATAR_IDS.filter(want)) {
    const r = row(id);
    for (const m of MOODS) cell(r, m, timed(() => ceoPortraitUrl(id, m)));
  }
}
(window as unknown as { portraitApi: unknown }).portraitApi = await import("./portraits");
document.title = `Portrait sheet: ${set} (${times.length})`;
document.body.dataset.ready = '1';
