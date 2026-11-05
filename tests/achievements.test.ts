import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { newAct3Game } from '../src/sim/act3';
import { ACHIEVEMENTS, earned } from '../src/content/achievements';
import { SANDBOX_DEFAULT } from '../src/sim/sandbox';

describe('achievements', () => {
  it('have unique ids and words (the icons are type-checked)', () => {
    const ids = new Set<string>();
    for (const a of ACHIEVEMENTS) {
      expect(ids.has(a.id), a.id).toBe(false);
      ids.add(a.id);
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(a.name.length && a.desc.length).toBeTruthy();
    }
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
  });

  it('a campaign earns campaign ones, a sandbox only sandbox ones', () => {
    const s = newGame({ name: 'A', homeSite: 'west-texas', seed: 1 });
    s.models.push({ name: 'Bit-1' } as never);
    expect(earned(s, {}).map((a) => a.id)).toContain('hello-world');
    expect(earned(s, { 'hello-world': 1 }).map((a) => a.id)).not.toContain('hello-world');
    const b = newGame({ name: 'B', homeSite: 'west-texas', seed: 1, sandbox: SANDBOX_DEFAULT });
    b.models.push({ name: 'Bit-1' } as never);
    expect(earned(b, {}).map((a) => a.id)).not.toContain('hello-world');
  });

  it('an act a preset skipped is not yours to collect', () => {
    const s = newAct3Game({ name: 'C', homeSite: 'bay-area', seed: 2 });
    const got = earned(s, {}).map((a) => a.id);
    expect(got).toContain('the-steward');
    expect(got).not.toContain('hello-world');
    expect(got).not.toContain('ring-the-bell');
  });
});
