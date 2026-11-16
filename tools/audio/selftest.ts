/** The render tool's self-test: `node tools/audio/render.mjs fn /tools/audio/selftest.ts demo --secs 4 --out x.wav`. */
import { makePluck } from '../../src/audio/synth';
import type { Lab } from '../../src/audio/voices/lab';

export function demo(lab: Lab): void {
  const p = makePluck(lab.ctx, lab.strip('pluck', { gain: 1, rev: 0.2 }), { cut: 2600, decay: 0.4 });
  [60, 64, 67, 72, 67, 64, 60].forEach((m, i) => p(lab.t0 + i * 0.3, m, 0.8));
}
