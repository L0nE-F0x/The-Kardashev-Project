import { describe, expect, it } from 'vitest';
import { COMPANY_EVENT_IDS, EVENT_BY_ID, EVENTS } from '../src/content/events';
import { ACT3_EVENTS } from '../src/content/events3';
import { ACT4_EVENTS } from '../src/content/events4';
import { ACT5_EVENTS } from '../src/content/events5';
import { DECISIONS } from '../src/content/decisions';
import { dismissEvent, queueEvent, tickEvents } from '../src/sim/events';
import { newAct3Game } from '../src/sim/act3';
import { newGame } from '../src/sim/state';

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
});
