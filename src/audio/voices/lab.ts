/**
 * What an instrument demo receives (tools/audio/render.mjs `fn` mode renders `demoX(lab)` exports): a context, strips
 * on the game's music bus (its hall and echo sends as a track's), a seeded random and a hook for stopping LFOs.
 * Demos are dev-only; nothing in the game imports them, so the build leaves them out.
 */
import type { Setup } from '../cinematic';

export interface Lab {
  ctx: BaseAudioContext;
  r: () => number;
  strip: Setup['strip'];
  onStop: Setup['onStop'];
  /** Where the demo may start (seconds of render time). */
  t0: number;
}
