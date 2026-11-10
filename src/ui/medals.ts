/**
 * The achievement medals: a metal ring round a dark plate (the achievement's icon sits on the plate), two ribbon
 * tails below. Vector art on a 48×48 grid, built with iconKit.ts; lit from the upper left like the icons.
 */
import { clip, o, p, ring, svg, svgUrl, type Shape, type Tone } from './iconKit';
import type { Tier } from '../content/achievements';

export type MedalTier = Tier | 'locked';
export const MEDAL_TIERS: MedalTier[] = ['bronze', 'silver', 'gold', 'locked'];

/** lit, base, shade, the plate's rim; then the two ribbons (each a face and its shaded fold). */
const LOOK: Record<MedalTier, { metal: [Tone, Tone, Tone, Tone]; ribbons: [Tone, Tone, Tone, Tone] }> = {
  bronze: { metal: ['snd7', 'snd5', 'snd3', 'snd2'], ribbons: ['red3', 'red2', 'blu4', 'blu3'] },
  silver: { metal: ['white', 'ink8', 'ink6', 'ink5'], ribbons: ['red3', 'red2', 'blu4', 'blu3'] },
  gold: { metal: ['yel2', 'yel0', 'org2', 'snd4'], ribbons: ['red3', 'red2', 'blu4', 'blu3'] },
  locked: { metal: ['ink5', 'ink4', 'ink3', 'ink2'], ribbons: ['ink4', 'ink3', 'ink4', 'ink3'] },
};

/** The grid the medal is drawn on, and where its plate sits: the achievement's icon is centred there. */
export const MEDAL_SIZE = 48;
export const MEDAL_PLATE = { cx: 24, cy: 21, r: 13 };

function medalShapes(tier: MedalTier): Shape[] {
  const { metal, ribbons } = LOOK[tier];
  const [lit, base, shade, rim] = metal;
  const { cx, cy, r } = MEDAL_PLATE;
  return [
    // the ribbon tails, swallow-tailed, each with a shaded inner fold
    p(ribbons[0], 'M11.5 30L20.5 34.5L15 46.5L12.6 41.8L7.4 42.6Z'),
    p(ribbons[1], 'M15.6 32L20.5 34.5L15 46.5L13.9 44.2Z'),
    p(ribbons[2], 'M36.5 30L27.5 34.5L33 46.5L35.4 41.8L40.6 42.6Z'),
    p(ribbons[3], 'M32.4 32L27.5 34.5L33 46.5L34.1 44.2Z'),
    // the ring: base, a shaded lower right, a lit upper left
    clip(o(base, cx, cy, 19), o(shade, cx, cy, 19), o(base, cx - 3, cy - 3.4, 19.4), o(lit, cx - 7.5, cy - 8.5, 13.5), o(base, cx - 4.6, cy - 5, 14.4)),
    // the plate, sunk into the ring: dark glass, the ring's shadow along its upper left
    o(rim, cx, cy, r + 1.4),
    clip(o('ink1', cx, cy, r), o('ink0', cx, cy, r), o('ink2', cx + 1.6, cy + 2, r)),
    ring(`${lit}/35` as Tone, 0.9, cx, cy, r + 0.9),
  ];
}

const cache = new Map<MedalTier, string>();

/** The medal's SVG markup. */
export const medalSvg = (tier: MedalTier): string => svg(MEDAL_SIZE, medalShapes(tier));

/** The medal as a `data:image/svg+xml` URL for an <img>. */
export function medalUrl(tier: MedalTier): string {
  let u = cache.get(tier);
  if (!u) {
    u = svgUrl(medalSvg(tier));
    cache.set(tier, u);
  }
  return u;
}
