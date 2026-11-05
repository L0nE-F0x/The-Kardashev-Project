import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/state';
import { playtestReport, fmtSpan } from '../src/game/playtest';
import { campaignStats } from '../src/sim/ending';

describe('playtest log', () => {
  it('reports real time per act and the notes, in order', () => {
    const s = newGame({ name: 'Little Sun Labs', homeSite: 'west-texas', seed: 7 });
    s.meta.playtime = 5400;
    s.meta.log = {
      acts: {
        1: { seconds: 4000, paused: 900, jump: 0, bySpeed: { 1: 1800, 2: 900, 4: 400 }, fromDay: 0, toDay: 812, events: 14, decisions: 13 },
        2: { seconds: 1400, paused: 200, jump: 0, bySpeed: { 4: 1200 }, fromDay: 812, events: 3, decisions: 3 },
      },
      notes: [
        { at: Date.now(), playtime: 1200, act: 1, day: 120, where: 'map · panel:orders', text: 'The HQ queue is confusing.' },
        { at: Date.now(), playtime: 5000, act: 2, day: 900, where: 'diorama · site:west-texas', text: 'Love the people!\nToo slow here though.' },
      ],
    };
    s.act = 2;
    s.day = 1000;
    const md = playtestReport(s, '0.6.1');
    expect(md).toContain('# Playtest log — Little Sun Labs');
    expect(md).toContain('| I · The Garage | 1 h 07 min | 30 / 15 / 7 / 0 | 15 min |');
    expect(md).toContain('II · The Scale-Up (now)');
    expect(md).toContain('## Notes (2)');
    expect(md.indexOf('HQ queue')).toBeLessThan(md.indexOf('Love the people'));
    expect(md).toContain('  Too slow here though.');
    expect(fmtSpan(42)).toBe('42 s');
    expect(fmtSpan(3660)).toBe('1 h 01 min');
  });

  it('says how long each act took in the campaign stats', () => {
    const s = newGame({ name: 'Little Sun Labs', homeSite: 'west-texas', seed: 7 });
    s.flags.act1Complete = 812;
    s.meta.log = { acts: { 1: { seconds: 4500, paused: 0, jump: 0, bySpeed: {}, fromDay: 0, toDay: 812, events: 0, decisions: 0 } }, notes: [] };
    const { acts } = campaignStats(s);
    expect(acts[0].value).toContain('1.3 h');
  });

  it('copes with a save from before the log', () => {
    const s = newGame({ name: 'Old Labs', homeSite: 'west-texas', seed: 7 });
    expect(playtestReport(s, '0.6.1')).toContain('No notes yet');
  });
});
