/**
 * Portraits: every face in the interface, rendered live as a small 3D bust (see art3d/INTERFACE.md).
 *
 *   looks.ts     who everyone is (data only; the tests and the sim may import it)
 *   bust.ts      a person from a `Look`: head.ts (skull, face, moods), hair.ts, dress.ts, backdrop.ts
 *   bit.ts       Bit's six bodies · avatars.ts: the four AIs that are not people
 *   studio.ts    the one small WebGL renderer the portraits own, made on first use
 *
 * The functions here are called while a panel renders and their result goes straight into `<img src>`: they
 * render at once, read the picture back as a data URL and keep it. Importing this module creates nothing; without a
 * DOM (Node, tests) every URL is ''.
 */
import type { AdvisorId } from '../../sim/types';
import type { Mood } from '../../content/events';
import { avatarShot } from './avatars';
import { bitShot } from './bit';
import { personShot } from './bust';
import { bitModel, ceoLook, governorLook, isAvatar, lookAt, type PortraitAge } from './looks';
import type { Shot } from './parts';
import { shoot } from './studio';

export { CEO_IDS, type CeoId, type PortraitAge } from './looks';

const MOODS: readonly Mood[] = ['neutral', 'happy', 'worried', 'angry', 'excited'];
const moodOf = (m: Mood | undefined): Mood => (m && MOODS.includes(m) ? m : 'neutral');

const cache = new Map<string, string>();
function picture(key: string, make: () => Shot): string {
  let url = cache.get(key);
  if (url) return url;
  url = shoot(make);
  // nothing to render with (no DOM, the context lost for a moment): don't remember the blank
  if (url) cache.set(key, url);
  return url;
}

/**
 * An advisor's portrait as a data URL. `bitGen` picks Bit's body (see `bitModel`); `age` (Act V, see `castAge`):
 * 0 as in Acts I–IV · 1 greying · 2 elder · 3 renewed by the treatments. Bit does not age.
 */
export function portraitUrl(id: AdvisorId, mood: Mood = 'neutral', bitGen = 1, age: PortraitAge | number = 0): string {
  const m = moodOf(mood);
  if (id === 'bit') {
    const bit = bitModel(bitGen);
    return picture(`bit:${bit.gen}:${m}`, () => bitShot(bit, m));
  }
  const a = age === 1 || age === 2 || age === 3 ? age : 0;
  return picture(`adv:${id}:${m}:${a}`, () => personShot(lookAt(id, a), m));
}

/** A partner CEO's, delegate's, cast member's or rival AI's portrait (`ceo:<id>` speakers); unknown ids get a generic executive. */
export function ceoPortraitUrl(id: string, mood: Mood = 'neutral'): string {
  const m = moodOf(mood);
  return picture(`ceo:${id}:${m}`, () => (isAvatar(id) ? avatarShot(id, m) : personShot(ceoLook(id), m)));
}

/** A province governor's portrait (Act IV). */
export function governorPortraitUrl(region: string, mood: Mood = 'neutral'): string {
  const m = moodOf(mood);
  return picture(`gov:${region}:${m}`, () => personShot(governorLook(region), m));
}

/** Forget every rendered portrait (a dev tool: the contact sheet re-renders after a hot reload). */
export function clearPortraits() {
  cache.clear();
}
