import type { Game } from './game';
import type { AdvisorId, GameState } from '../sim/types';
import type { Mood } from '../content/events';

/**
 * Act II unlock briefings: when a system first opens, the advisor who owns it gives a short
 * spotlight tour (1–3 steps) using the tutorial's overlay. Shown once; replayable from the Field Guide.
 */
export interface BriefingStep {
  text: (g: Game) => string;
  target?: (g: Game) => string | null;
  enter?: (g: Game) => void;
  mood?: Mood;
}

export interface Briefing {
  id: string;
  advisor: AdvisorId;
  title: string;
  when: (s: GameState) => boolean;
  steps: BriefingStep[];
}

const since = (s: GameState, days: number) => s.day - Number(s.flags.act2Started ?? s.day) >= days;
const firstHallSite = (g: Game) => g.state!.facilities.find((f) => f.type === 'datacenter' && f.status === 'online')?.siteId ?? null;

export const BRIEFINGS: Briefing[] = [
  {
    id: 'b-scale',
    advisor: 'juno',
    title: 'Gigawatts',
    when: (s) => s.act >= 2 && s.phase >= 1 && !s.events.active,
    steps: [
      { text: () => 'Act II, finally! Everything we own can get bigger now: data halls go from 10 to 50 MW, and later 200 MW. Power plants grow too.', mood: 'excited' },
      {
        text: () => 'Select a site and press the expand arrow next to a facility. It keeps running while the crews work.',
        enter: (g) => {
          const id = firstHallSite(g);
          if (id) g.select({ kind: 'site', id });
        },
        target: (g) => (g.state!.facilities.some((f) => f.type === 'datacenter' && f.status === 'online') ? 'upgrade-datacenter' : null),
      },
      { text: () => 'Out of plots? The “+plot” button buys the land next door. Each one costs more than the last.', target: () => 'buy-land' },
    ],
  },
  {
    id: 'b-team',
    advisor: 'mira',
    title: 'Advisor jobs',
    when: (s) => s.act >= 2 && since(s, 10),
    steps: [
      { text: () => 'You don’t have to place every chip order yourself any more. Give us standing jobs: I keep the halls stocked, Juno keeps the power ahead of them, Iris guards the safety margin, Bit starts the next run.', target: () => 'dock-team' },
      { text: () => 'Penny’s cash floor pauses everyone’s automatic spending when money gets tight. Start with Penny and me.', enter: (g) => g.panel !== 'team' && g.openPanel('team'), target: () => 'job-mira' },
    ],
  },
  {
    id: 'b-blocs',
    advisor: 'sol',
    title: 'Governments',
    when: (s) => s.act >= 2 && since(s, 30),
    steps: [
      { text: () => 'We’re big enough that governments have opinions about us now. Each bloc has two meters: Trust (the people) and Relations (the government).', target: () => 'dock-blocs' },
      { text: () => 'Relations decide export licences, reactor approvals and the deals they offer us. Lobbying helps — until a journalist notices. Treaties help in bigger ways.', enter: (g) => g.panel !== 'blocs' && g.openPanel('blocs'), target: () => 'lobby' },
    ],
  },
  {
    id: 'b-markets',
    advisor: 'bit',
    title: 'Regional markets',
    when: (s) => s.act >= 2 && since(s, 50),
    steps: [
      { text: () => 'People use me from everywhere, but I answer fastest to people near my data halls. Each region is its own market now.', mood: 'excited' },
      { text: () => 'Lay fiber between your sites, or lease a subsea cable at a landing station on the coast, and halls in one region can sell into another at low latency. Training doesn’t care where it runs!', target: () => 'dock-fiber' },
    ],
  },
  {
    id: 'b-firm',
    advisor: 'juno',
    title: 'Firm power',
    when: (s) => s.act >= 2 && since(s, 80),
    steps: [
      { text: () => 'Solar and wind are cheap but they come and go. Firm power runs all night: hydro on river sites, geothermal on hot rock, and the big one — nuclear.' },
      { text: () => 'Three nuclear paths: restart a retired reactor (about two years), order small modular reactors from Little Sun (a long queue), or build a full plant (most of a decade). Reactors need the government on side.', mood: 'excited' },
    ],
  },
  {
    id: 'b-stack',
    advisor: 'mira',
    title: 'The Stack',
    when: (s) => s.act >= 2 && s.phase >= 2,
    steps: [
      { text: () => 'Every accelerator needs a logic die, eight HBM stacks and an advanced package. The slowest of the three sets how fast chips reach us.', target: () => 'dock-deals' },
      { text: () => 'These bars show the three pools for each supplier. Deals shield part of our volume: reserve wafers, lock in HBM, book packaging. Or build our own packaging plant.', enter: (g) => g.panel !== 'deals' && g.openPanel('deals'), target: () => 'deals-supply' },
    ],
  },
  {
    id: 'b-board',
    advisor: 'penny',
    title: 'The board',
    when: (s) => s.act >= 2 && !!s.capital.board,
    steps: [
      { text: () => 'We have a board now. Every quarter they check revenue against a growth target. Hit it and confidence rises; miss it and things get… political.', target: () => 'dock-finance' },
      { text: () => 'Finance also has project finance: we can borrow against our plants and halls. That is how every hyperscaler builds this fast.', enter: (g) => g.panel !== 'finance' && g.openPanel('finance'), target: () => 'debt' },
    ],
  },
  {
    id: 'b-race',
    advisor: 'bit',
    title: 'The Race',
    when: (s) => s.act >= 2 && s.phase >= 3,
    steps: [
      { text: () => 'Meridian says they’ll reach the next tier first. The megasites are open — huge empty land with lots of grid — and so are 200 MW halls and the Gigawatt Campus.', mood: 'excited' },
      { text: () => 'The IPO checklist is in Goals: a gigawatt of halls, a gigawatt of our own power, Bit-4, a billion a month, the frontier and a clean safety record. When it’s done, something big happens.', target: () => 'dock-goals' },
    ],
  },
  {
    id: 'b-crunch',
    advisor: 'sol',
    title: 'The Crunch',
    when: (s) => !!s.finale && !s.finale.done,
    steps: [
      { text: () => 'This tracker shows the three fronts. Pressure rises every day from what’s happening in the world. At 100 a front is lost.', target: () => 'crunch', mood: 'worried' },
      { text: () => 'Batteries, firm power, chip stockpiles, our own fab and a strong safety record all ease the pressure on their own. Event cards let us act directly. Ninety days. Let’s hold.' },
    ],
  },
];
