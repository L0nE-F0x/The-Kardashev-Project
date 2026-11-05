import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { newAct3Game } from '../src/sim/act3';
import { tick } from '../src/sim/tick';
import { build } from '../src/sim/actions';
import { chipSpec, crisisCost } from '../src/sim/model';
import { SANDBOX_DEFAULT } from '../src/sim/sandbox';
import { TECHS } from '../src/content/techs';
import { loadWorld } from './helpers/world';

const ctx = { router: loadWorld().router };

describe('sandbox', () => {
  it('tops up money, builds overnight and knows every tech it can reach', () => {
    const s = newGame({ name: 'Box', homeSite: 'west-texas', seed: 3, sandbox: { ...SANDBOX_DEFAULT, research: 'all', instant: true } });
    expect(s.meta.sandbox?.unlimited).toBe(true);
    s.events.active = null;
    expect(build(s, 'west-texas', 'datacenter').ok).toBe(true);
    s.finance.cash = -5e6;
    for (let d = 0; d < 8; d++) tick(s, ctx);
    expect(s.finance.cash).toBeGreaterThan(1e9);
    expect(s.facilities.find((f) => f.type === 'datacenter')?.status).toBe('online');
    const act1 = TECHS.filter((t) => (t.act ?? 1) === 1 && !t.phase);
    expect(act1.every((t) => s.research.done.includes(t.id))).toBe(true);
  });

  it('keeps the Charter solvent from Act III and scales crises and chips by the sliders', () => {
    const s = newAct3Game({ name: 'Box', homeSite: 'bay-area', seed: 4, sandbox: { ...SANDBOX_DEFAULT, shocks: 2, chips: 0.5 } });
    const plain = newAct3Game({ name: 'Box', homeSite: 'bay-area', seed: 4 });
    expect(crisisCost(s, 10e6) / crisisCost(plain, 10e6)).toBeCloseTo(2, 5);
    expect(chipSpec(s, 'lumen').price / chipSpec(plain, 'lumen').price).toBeCloseTo(0.5, 5);
    s.charter!.budget = -1;
    tick(s, ctx);
    expect(s.charter!.budget).toBeGreaterThan(1e11);
  });

  it('leaves a campaign untouched', () => {
    const s = newGame({ name: 'Story', homeSite: 'west-texas', seed: 3 });
    expect(s.meta.sandbox).toBeUndefined();
  });
});
