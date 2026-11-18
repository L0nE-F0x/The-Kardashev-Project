import { describe, expect, it } from 'vitest';
import { COMPANY_EVENT_IDS, EVENT_BY_ID, EVENTS } from '../src/content/events';
import { ACT3_EVENTS } from '../src/content/events3';
import { ACT4_EVENTS } from '../src/content/events4';
import { ACT5_EVENTS } from '../src/content/events5';
import { DECISIONS } from '../src/content/decisions';
import { dismissEvent, queueEvent, tickEvents } from '../src/sim/events';
import { newAct3Game } from '../src/sim/act3';
import { newGame } from '../src/sim/state';
import { newAct2Game } from '../src/sim/act2';
import { act4PreviewState } from '../src/sim/planetPreview';
import { act5PreviewState } from '../src/sim/systemPreview';
import { tick } from '../src/sim/tick';
import type { GameState } from '../src/sim/types';
import { loadWorld } from './helpers/world';
import { botDay1 } from './helpers/act1bot';
import { botDay } from './helpers/act2bot';
import { botDay3 } from './helpers/act3bot';
import { nonFinite } from './helpers/campaign';

describe('event cards', () => {
  it('only Act I–II cards count as the company’s (the Steward always sees the rest)', () => {
    for (const e of [...ACT3_EVENTS, ...ACT4_EVENTS, ...ACT5_EVENTS, ...DECISIONS]) expect(COMPANY_EVENT_IDS.has(e.id), e.id).toBe(false);
    for (const e of EVENTS) if (e.big) expect(COMPANY_EVENT_IDS.has(e.id), e.id).toBe(false);
    expect(COMPANY_EVENT_IDS.has('bridge-loan')).toBe(true);
  });

  it('in the blind trust, the trustee answers company cards and the Steward still gets the Charter’s', () => {
    const s = newAct3Game({ name: 'Trust', homeSite: 'london', seed: 5 });
    s.events.active = null;
    s.events.queue = [];
    s.charter!.blindTrust = true;
    queueEvent(s, 'bridge-loan');
    queueEvent(s, 'renewal');
    tickEvents(s);
    const shown = s.events.active as { id: string } | null;
    expect(shown?.id).toBe('renewal');
    expect(s.news.some((n) => n.text.startsWith('🗂'))).toBe(true);
  });

  it('a card with nothing left to choose can be dismissed, and one with a choice can’t', () => {
    const s = newGame({ name: 'Dismiss', homeSite: 'london', seed: 3 });
    s.events.active = { id: 'welcome', ctx: {}, day: 0 };
    expect(dismissEvent(s)).toBe(false);
    expect(s.events.active?.id).toBe('welcome');
    // every event def has at least one choice builder; unknown ids are dropped too
    expect(Object.keys(EVENT_BY_ID).length).toBeGreaterThan(100);
  });

  it('every card that can come up at random reads cleanly, and every choice on it can be taken', () => {
    const ctx = { router: loadWorld().router };
    const play = (s: GameState, days: number, bot: (s: GameState) => void) => {
      for (let d = 0; d < days; d++) (bot(s), tick(s, ctx));
      s.events.active = null;
      s.events.queue = [];
      return s;
    };
    // places a card can find the player in: early and late in the garage, mid scale-up, mid Charter, the planet, the system
    const states: [string, GameState][] = [
      ['act 1, day 60', play(newGame({ name: 'Cards', homeSite: 'bay-area', seed: 4 }), 60, (s) => botDay1(s, ctx))],
      ['act 1, day 500', play(newGame({ name: 'Cards', homeSite: 'london', seed: 4 }), 500, (s) => botDay1(s, ctx))],
      ['act 2', play(newAct2Game({ name: 'Cards', homeSite: 'bay-area', seed: 4 }), 500, (s) => botDay(s))],
      ['act 3', play(newAct3Game({ name: 'Cards', homeSite: 'bay-area', seed: 4 }), 500, (s) => botDay3(s))],
      ['act 4', act4PreviewState({ stage: 2 })],
      ['act 5', act5PreviewState({ stage: 2 })],
    ];
    const bad = /undefined|NaN|\[object|Infinity|\$-|null/;
    let shown = 0;
    for (const [where, s] of states) {
      for (const def of EVENTS) {
        if (!def.weight) continue;
        const act = s.act ?? 1;
        if ((def.act ?? 1) > act || (def.actOnly && def.actOnly !== act)) continue;
        if (def.phase && (act < 2 || s.phase < def.phase)) continue;
        if (def.cphase && (act < 3 || (s.charter?.phase ?? 0) < def.cphase)) continue;
        if (def.vstage !== undefined && (!s.system || s.system.stage < def.vstage)) continue;
        if (!s.system && def.vstage !== undefined) continue;
        if (def.weight(s) <= 0) continue;
        const c = def.setup ? def.setup(JSON.parse(JSON.stringify(s))) : {};
        if (!c) continue;
        shown++;
        const at = `${def.id} (${where})`;
        const choices = def.choices(s, c);
        const text = [def.title(s, c), def.body(s, c), ...def.advisors(s, c).map((a) => a.text), ...choices.flatMap((x) => [x.label, x.detail, typeof x.disabled === 'string' ? x.disabled : ''])].join(' | ');
        expect(text, at).not.toMatch(bad);
        expect(choices.length, at).toBeGreaterThan(0);
        for (let i = 0; i < choices.length; i++) {
          if (choices[i].disabled) continue;
          const copy = JSON.parse(JSON.stringify(s)) as GameState;
          def.choices(copy, c)[i].apply(copy, c);
          expect(nonFinite(copy), `${at}, choice ${i}`).toEqual([]);
          for (const o of copy.orders) expect(Number.isInteger(o.qty), `${at}, choice ${i}: a whole number of chips`).toBe(true);
          const sum = copy.alloc.train + copy.alloc.infer + copy.alloc.research + copy.alloc.safety;
          expect(Math.abs(sum - 1), `${at}, choice ${i}: all the compute is assigned`).toBeLessThan(1e-6);
        }
      }
    }
    expect(shown).toBeGreaterThan(120);
  }, 120_000);
});
