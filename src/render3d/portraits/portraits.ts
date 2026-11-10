/**
 * Portraits: every face in the interface, rendered live as a small 3D bust (see art3d/INTERFACE.md).
 *
 *   looks.ts     who everyone is (data only; the tests and the sim may import it)
 *   bust.ts      a person from a `Look`: head.ts (skull, face, moods), hair.ts, dress.ts, backdrop.ts
 *   bit.ts       Bit's six bodies · avatars.ts: the four AIs that are not people
 *   studio.ts    the one small WebGL renderer the portraits own, made on first use
 *
 * The functions here are called while a panel renders and their result goes straight into `<img src>`. They answer
 * at once, always: a portrait already made comes from memory; a new one is rendered on the spot and read back as a
 * data URL (10–30 ms each, measured in the game on the dev laptop), as long as this pass of rendering has spent
 * less than `budget` on new faces. Past that (a list of twenty partners opening for the first time) the answer is
 * a stand-in, the look's backdrop as a tiny picture, and the bust is rendered a moment later, a few milliseconds at
 * a time, and put into every `<img>` that shows the stand-in. So nothing freezes and nothing stays blank.
 *
 * Importing this module creates nothing; without a DOM (Node, tests) every URL is ''.
 */
import type { AdvisorId } from '../../sim/types';
import type { Mood } from '../../content/events';
import { C } from '../../render/palette';
import { avatarShot } from './avatars';
import { bitShot } from './bit';
import { personShot } from './bust';
import { bitModel, ceoLook, governorLook, isAvatar, lookAt, type BitFamily, type Look, type PortraitAge } from './looks';
import { hexOf, type Shot } from './parts';
import { shoot } from './studio';

export { CEO_IDS, type CeoId, type PortraitAge } from './looks';

const MOODS: readonly Mood[] = ['neutral', 'happy', 'worried', 'angry', 'excited'];
const moodOf = (m: Mood | undefined): Mood => (m && MOODS.includes(m) ? m : 'neutral');

/** Backdrop colours, darkest first (the stand-in's two tones). */
type Tones = [number, number];
const tonesOf = (L: Look): Tones => L.bg;
const BIT_TONES: Record<BitFamily, Tones> = { classic: [C.ink2, C.ink3], next: [C.blu0, C.blu1], oracle: [C.dusk0, C.dusk1], planetary: [C.night0, C.night2], steward: [C.vio0, C.dusk2], free: [C.ink0, C.night1] };
const AVATAR_TONES: Record<string, Tones> = { apex: [C.ink0, C.red0], weft: [C.vio1, C.vio2], sapling: [C.grn1, C.grn2], chorus: [C.blu0, C.blu1] };

/** Finished pictures, by key. */
const cache = new Map<string, string>();
/** Faces asked for but not rendered yet, in the order they were asked for. */
const waiting = new Map<string, { make: () => Shot; standIn: string }>();
/** Milliseconds one pass of rendering may spend on new faces before the rest wait their turn. */
let budget = 16;
let spent = 0;
let fresh = true;
let timer: ReturnType<typeof setTimeout> | null = null;
const now = () => performance.now();

/** The look's backdrop as a picture a few bytes long (unique per key, so the `<img>`s showing it can be found again). */
function standInFor(key: string, [dark, light]: Tones): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><linearGradient id="g" x2="0" y2="1"><stop stop-color="${hexOf(light)}"/><stop offset="1" stop-color="${hexOf(dark)}"/></linearGradient><rect width="8" height="8" fill="url(#g)"/><!--${key}--></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function picture(key: string, make: () => Shot, tones: () => Tones): string {
  const done = cache.get(key);
  if (done) return done;
  if (typeof document === 'undefined') return '';
  const queued = waiting.get(key);
  if (queued) return queued.standIn;
  if (spent < budget) {
    // the budget is per pass: it comes back as soon as the code that is rendering now has returned
    if (fresh) {
      fresh = false;
      queueMicrotask(() => { spent = 0; fresh = true; });
    }
    const t = now();
    const url = shoot(make);
    spent += now() - t;
    if (url) {
      cache.set(key, url);
      return url;
    }
    // nothing to render with just now (WebGL off, the context lost for a moment): the backdrop, and try again next time
    return standInFor(key, tones());
  }
  const standIn = standInFor(key, tones());
  waiting.set(key, { make, standIn });
  timer ??= setTimeout(develop, 0);
  return standIn;
}

/** Render waiting faces for a few milliseconds, hand each to the `<img>`s showing its stand-in, and come back for the rest. */
function develop() {
  timer = null;
  const t = now();
  for (const [key, job] of waiting) {
    waiting.delete(key);
    const url = shoot(job.make);
    if (url) {
      cache.set(key, url);
      for (const img of document.querySelectorAll<HTMLImageElement>('img[src^="data:image/svg+xml"]')) if (img.getAttribute('src') === job.standIn) img.src = url;
    }
    if (now() - t > 8) break;
  }
  if (waiting.size) timer = setTimeout(develop, 4);
}

/**
 * How long one pass of rendering may spend making new portraits before the rest get a stand-in and are filled in
 * a moment later (milliseconds; default 16). `Infinity`: every portrait is rendered before its URL is returned.
 */
export function setPortraitBudget(ms: number) {
  budget = ms;
}
/** How many portraits are still to be rendered (stand-ins on screen). */
export function portraitsPending(): number {
  return waiting.size;
}

/**
 * An advisor's portrait as a data URL. `bitGen` picks Bit's body (see `bitModel`); `age` (Act V, see `castAge`):
 * 0 as in Acts I–IV · 1 greying · 2 elder · 3 renewed by the treatments. Bit does not age.
 */
export function portraitUrl(id: AdvisorId, mood: Mood = 'neutral', bitGen = 1, age: PortraitAge | number = 0): string {
  const m = moodOf(mood);
  const key = portraitKey(id, m, bitGen, age);
  if (id === 'bit') return picture(key, () => bitShot(bitModel(bitGen), m), () => BIT_TONES[bitModel(bitGen).family]);
  return picture(key, () => personShot(lookAt(id, ageOf(age)), m), () => tonesOf(lookAt(id, 0)));
}

const ageOf = (age: number): PortraitAge => (age === 1 || age === 2 || age === 3 ? age : 0);
/** What an advisor's picture is remembered under: Bit by its body (it does not age), the others by their age. */
export function portraitKey(id: AdvisorId, mood: Mood, bitGen: number, age: number): string {
  const m = moodOf(mood);
  return id === 'bit' ? `bit:${bitModel(bitGen).gen}:${m}` : `adv:${id}:${m}:${ageOf(age)}`;
}

/** A partner CEO's, delegate's, cast member's or rival AI's portrait (`ceo:<id>` speakers); unknown ids get a generic executive. */
export function ceoPortraitUrl(id: string, mood: Mood = 'neutral'): string {
  const m = moodOf(mood);
  return picture(`ceo:${id}:${m}`, () => (isAvatar(id) ? avatarShot(id, m) : personShot(ceoLook(id), m)), () => AVATAR_TONES[id] ?? tonesOf(ceoLook(id)));
}

/** A province governor's portrait (Act IV). */
export function governorPortraitUrl(region: string, mood: Mood = 'neutral'): string {
  const m = moodOf(mood);
  return picture(`gov:${region}:${m}`, () => personShot(governorLook(region), m), () => tonesOf(governorLook(region)));
}

/** Forget every rendered portrait (a dev tool: the contact sheet re-renders after a hot reload). */
export function clearPortraits() {
  cache.clear();
  waiting.clear();
}
