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
const since3 = (s: GameState, days: number) => s.day - Number(s.flags.act3Started ?? s.day) >= days;
const firstHallSite = (g: Game) => g.state!.facilities.find((f) => f.type === 'datacenter' && f.status === 'online')?.siteId ?? null;

export const BRIEFINGS: Briefing[] = [
  {
    id: 'b-scale',
    advisor: 'juno',
    title: 'Gigawatts',
    when: (s) => s.act === 2 && s.phase >= 1 && !s.events.active,
    steps: [
      { text: () => 'Act II, finally! Everything we own can get bigger now: data halls go from 10 to 50 MW, and later 200 MW. Power plants grow too. How to play (the ? button) has a page on Act II whenever you want the big picture.', mood: 'excited' },
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
    when: (s) => s.act === 2 && since(s, 10),
    steps: [
      { text: () => 'You don’t have to place every chip order yourself any more. Give us standing jobs: I keep the halls stocked, Juno keeps the power ahead of them, Iris guards the safety margin, Bit starts the next run.', target: () => 'dock-team' },
      { text: () => 'Penny’s cash floor pauses everyone’s automatic spending when money gets tight. Start with Penny and me.', enter: (g) => g.panel !== 'team' && g.openPanel('team'), target: () => 'job-mira' },
    ],
  },
  {
    id: 'b-blocs',
    advisor: 'sol',
    title: 'Governments',
    when: (s) => s.act === 2 && since(s, 45),
    steps: [
      { text: () => 'We’re big enough that governments have opinions about us now. Each bloc has two meters: Trust (the people) and Relations (the government).', target: () => 'dock-blocs' },
      { text: () => 'Relations decide export licences, reactor approvals and the deals they offer us. Lobbying helps — until a journalist notices. Treaties help in bigger ways.', enter: (g) => g.panel !== 'blocs' && g.openPanel('blocs'), target: () => 'lobby' },
    ],
  },
  {
    id: 'b-markets',
    advisor: 'bit',
    title: 'Regional markets',
    when: (s) => s.act === 2 && since(s, 100),
    steps: [
      { text: () => 'People use me from everywhere, but I answer fastest to people near my data halls. Each region is its own market now.', mood: 'excited' },
      { text: () => 'Lay fiber between your sites, or lease a subsea cable at a landing station on the coast, and halls in one region can sell into another at low latency. Training doesn’t care where it runs!', target: () => 'dock-fiber' },
    ],
  },
  {
    id: 'b-firm',
    advisor: 'juno',
    title: 'Firm power',
    when: (s) => s.act === 2 && since(s, 160),
    steps: [
      { text: () => 'Solar and wind are cheap but they come and go. Firm power runs all night: hydro on river sites, geothermal on hot rock, and the big one — nuclear.' },
      { text: () => 'Three nuclear paths: restart a retired reactor (about two years), order small modular reactors from Little Sun (a long queue), or build a full plant (most of a decade). Reactors need the government on side.', mood: 'excited' },
    ],
  },
  {
    id: 'b-stack',
    advisor: 'mira',
    title: 'The Stack',
    when: (s) => s.act === 2 && s.phase >= 2,
    steps: [
      { text: () => 'Every accelerator needs a logic die, eight HBM stacks and an advanced package. The slowest of the three sets how fast chips reach us.', target: () => 'dock-deals' },
      { text: () => 'These bars show the three pools for each supplier. Deals shield part of our volume: reserve wafers, lock in HBM, book packaging. Or build our own packaging plant.', enter: (g) => g.panel !== 'deals' && g.openPanel('deals'), target: () => 'deals-supply' },
    ],
  },
  {
    id: 'b-board',
    advisor: 'penny',
    title: 'The board',
    // a few weeks after the Series B cards, before the first review
    when: (s) => s.act === 2 && !!s.capital.board && s.day - Number(s.flags.phase2Day ?? s.day) >= 30,
    steps: [
      { text: () => 'We have a board now. Every quarter they check our sales growth against a target — in volume, so falling prices don’t count against us. Hit it and confidence rises; miss it and things get… political.', target: () => 'dock-finance' },
      { text: () => 'Finance also has project finance: we can borrow against our plants and halls. That is how every hyperscaler builds this fast.', enter: (g) => g.panel !== 'finance' && g.openPanel('finance'), target: () => 'debt' },
    ],
  },
  {
    id: 'b-race',
    advisor: 'bit',
    title: 'The Race',
    when: (s) => s.act === 2 && s.phase >= 3,
    steps: [
      { text: () => 'Meridian says they’ll reach the next tier first. The megasites are open — huge empty land with lots of grid — and so are 200 MW halls and the Gigawatt Campus.', mood: 'excited' },
      { text: () => 'The IPO checklist is in Goals: a gigawatt of halls, a gigawatt of our own power, Bit-4, a billion a month, the frontier and a clean safety record. Any four of the six and something big happens. By mid-2034 it happens anyway.', target: () => 'dock-goals' },
    ],
  },
  {
    id: 'b-crunch',
    advisor: 'sol',
    title: 'The Crunch',
    when: (s) => s.act === 2 && !!s.finale && !s.finale.done,
    steps: [
      { text: () => 'This tracker shows the three fronts. Pressure rises every day from what’s happening in the world; hover a front to see what is pushing it and what is holding it back. At 100 a front is lost.', target: () => 'crunch', mood: 'worried' },
      { text: () => 'Batteries, firm power, chip stockpiles, our own fab and a strong safety record all ease the pressure on their own. Event cards let us act directly. Ninety days. Let’s hold.' },
    ],
  },

  // ════════════════════════════════════ ACT III ════════════════════════════════════════
  {
    id: 'c-charter',
    advisor: 'sol',
    title: 'The Kardashev Project',
    when: (s) => s.act === 3 && !!s.charter && since3(s, 2),
    steps: [
      { text: () => 'Welcome to Geneva, Steward. The Charter has its own treasury — the blocs pay dues into it every month — and it’s completely separate from our company’s cash. How to play (?) has a page on how the Charter works.', target: () => 'charter-stat', mood: 'excited' },
      { text: () => 'Legitimacy is the blocs’ confidence in you; political capital is what you spend in the Council. Deliver projects, spread them fairly, and keep your hands off our own company’s bids.', enter: (g) => g.openCharter('overview'), target: () => 'legitimacy' },
    ],
  },
  {
    id: 'c-contracts',
    advisor: 'mira',
    title: 'Contracts',
    when: (s) => s.act === 3 && !!s.charter && since3(s, 8),
    steps: [
      { text: () => 'The Charter doesn’t build anything itself. You post a contract — what, where, how big — and partners bid on it. The Charter pays its share; they raise the rest.', enter: (g) => g.openCharter('contracts'), target: () => 'post-contract' },
      { text: () => 'Bids come in over two weeks: a price, a timeline and the company’s traits. Cheap partners overrun, fast ones cut corners, reliable ones cost more. Our company bids too — award it and Legitimacy pays.', target: () => 'tenders' },
    ],
  },
  {
    id: 'c-trust',
    advisor: 'penny',
    title: 'Two hats',
    when: (s) => s.act === 3 && !!s.charter && !!s.flags.trustDecided,
    steps: [
      { text: (g) => (g.state?.charter?.blindTrust ? 'Our company is in a blind trust now. Your advisors run it on standing orders and its buttons are locked. You can take it back out here — at a price.' : 'You kept both hats. You can still put the company in a blind trust from here any time: Legitimacy up, conflicts much cheaper, but you can’t touch it.'), enter: (g) => g.openCharter('overview'), target: () => 'blind-trust' },
    ],
  },
  {
    id: 'c-council',
    advisor: 'sol',
    title: 'The Council',
    when: (s) => s.act === 3 && !!s.charter && since3(s, 30),
    steps: [
      { text: () => 'Twelve seats, weighted by size. Every ninety days they vote on whatever is on the agenda — up to three resolutions.', target: () => 'dock-council' },
      { text: () => 'Tabling costs political capital. The forecast shows how every bloc leans. Whip the waverers with capital, or offer a favour from the treasury.', enter: (g) => g.panel !== 'council' && g.openPanel('council'), target: () => 'table-resolution' },
    ],
  },
  {
    id: 'c-missions',
    advisor: 'juno',
    title: 'Missions',
    when: (s) => s.act === 3 && !!s.charter && since3(s, 60),
    steps: [
      { text: () => 'Missions are the big picture: chains of contracts that change the whole world when they’re done. Clean Power for All and Compute for Everyone are open now; more open as the Charter grows.', enter: (g) => g.openCharter('missions'), target: () => 'missions', mood: 'excited' },
      { text: () => 'Every energy contract is built at a megaproject site — one in every bloc. Click one on the map to see its stage and post a contract there.' },
    ],
  },
  {
    id: 'c-desk',
    advisor: 'bit',
    title: 'The Charter desk',
    when: (s) => s.act === 3 && !!s.charter && since3(s, 100),
    steps: [
      { text: () => 'You can delegate the Charter too. Mira can award tenders, Juno can chase late projects, Sol can whip votes, Penny keeps a reserve. And one day — if you trust me — I can run the pipeline.', enter: (g) => g.panel !== 'team' && g.openPanel('team'), target: () => 'charter-desk', mood: 'excited' },
    ],
  },
  {
    id: 'c-world',
    advisor: 'juno',
    title: 'The world',
    when: (s) => s.act === 3 && (s.charter?.phase ?? 0) >= 2,
    steps: [
      { text: () => 'Kardashev 0.75 is 31.6 terawatts. Charter power adds directly, and every project speeds up the world’s own growth.', enter: (g) => g.openCharter('world'), target: () => 'world-k' },
      { text: () => 'This is the carbon budget for two degrees. Burn through it and heatwaves and droughts come more often — and the grid gets much harder to hold.', target: () => 'carbon' },
      { text: () => 'And Iris’s number: the world safety margin. Every lab’s strongest model against how well the field can check it.', target: () => 'world-margin' },
    ],
  },
  {
    id: 'c-kip',
    advisor: 'kip',
    title: 'Launch',
    when: (s) => s.act === 3 && (s.charter?.phase ?? 0) >= 2 && !!s.flags.kipJoined,
    steps: [
      { text: () => 'Five places on Earth would make a good launch complex. Equatorial pads give rockets a free push; polar pads see the whole planet.', enter: (g) => g.select({ kind: 'site', id: 'launch-guiana' }), target: () => 'site:launch-guiana', mood: 'excited' },
      { text: () => 'Pick one and post the contract. Then a test satellite full of accelerators, then power from space. One careful step at a time. Mostly careful.' },
    ],
  },
  {
    id: 'c-frontier',
    advisor: 'iris',
    title: 'The Frontier',
    when: (s) => s.act === 3 && (s.charter?.phase ?? 0) >= 3,
    steps: [
      { text: () => 'The Council can now cap frontier training runs, license them and set open-weights policy. The cap applies to us too — our big runs will need a Charter licence.', enter: (g) => g.panel !== 'council' && g.openPanel('council'), target: () => 'table-resolution' },
      { text: () => 'The Mandate is on the board: Kardashev 0.75, the Chip Commons, clean power, access for every bloc, a working safety regime, Legitimacy and Kip’s satellite. When it’s done, the Threshold comes — and every goal still unmet then leaves us weaker on one of its fronts.', enter: (g) => g.openCharter('overview'), target: () => 'mandate' },
    ],
  },
  {
    id: 'c-threshold',
    advisor: 'sol',
    title: 'The Threshold',
    when: (s) => s.act === 3 && !!s.charter?.threshold && !s.charter.threshold.done,
    steps: [
      { text: () => 'Three fronts, a hundred and twenty days, and the crisis builds the whole way. Hover each bar to see what’s pushing it up — and what’s holding it down.', target: () => 'threshold', mood: 'worried' },
      { text: () => 'Firm power, HVDC links, the safety programmes, Bit, Legitimacy and access all ease the pressure on their own; Mandate goals we never met add to it. The event cards let us act directly. Then the vote — and the blocs will remember how we did.' },
    ],
  },  // ════════════════════ Act IV · Planetary ════════════════════
  {
    id: 'd-planet',
    advisor: 'bit',
    title: 'The planet',
    when: (s) => s.act === 4 && !!s.planet && !!s.planet.company && !s.planet.jump,
    steps: [
      { text: () => 'Act IV! The twelve blocs are provinces of one system now, and the Planet panel (Y) is where you run it: provinces, the supergrid, fusion, space and the climate. How to play (?) sums up the act.', target: () => 'dock-planet', mood: 'excited' },
      { text: () => 'The checklist on the Overview is the whole act: Kardashev 0.80, one grid, fusion, orbit, the Moon, thriving provinces, warming under 2 °C and AIs we can trust. When it all holds at once, the finale begins.', enter: (g) => g.openPlanet('overview'), target: () => 'planet-checklist' },
      { text: () => '“Next” shows what opens the next five-year plan, and the date it opens anyway. Between the jumps the planner keeps working the plan’s priorities on autopilot; switch it off here if you’d rather post and award every contract yourself.', target: () => 'planet-autopilot' },
    ],
  },
  {
    id: 'd-plan',
    advisor: 'bit',
    title: 'Five-year plans',
    when: (s) => s.act === 4 && !!s.planet?.planOpen && !s.events.active,
    steps: [
      { text: () => 'Between stages, the years jump. Pick up to three priorities and how long the plan runs. A planner posts and awards contracts by your priorities, and decisions are taken on autopilot. If the money runs out or a bloc walks out, I stop the clock. Want to look around first? “Not yet” — the plan waits.', target: () => 'plan' },
    ],
  },
  {
    id: 'd-grid',
    advisor: 'juno',
    title: 'The supergrid',
    when: (s) => s.act === 4 && (s.planet?.stage ?? 0) >= 1 && !s.planet?.jump && !s.planet?.planOpen,
    steps: [
      { text: () => 'Ten intercontinental routes. Every link joins two provinces into one grid — and the wider the grid stretches east to west, the longer the sun shines on part of it. Less solar wasted, cheaper power, happier provinces.', enter: (g) => g.openPlanet('grid'), target: () => 'planet-grid', mood: 'excited' },
    ],
  },
  {
    id: 'd-fusion',
    advisor: 'lena',
    title: 'The fusion race',
    when: (s) => s.act === 4 && (s.planet?.stage ?? 0) >= 1 && !s.planet?.jump && !s.planet?.planOpen && s.day - (s.planet?.stageDay ?? s.day) >= 20,
    steps: [
      { text: () => 'Four designs, four companies, four sets of odds. A pilot plant tells us if a design works; only then can we build fleets of it. Some will fail. That is what pilots are for.', enter: (g) => g.openPlanet('fusion'), target: () => 'planet-fusion' },
      { text: () => 'D-T fleets need tritium, and only running fleets breed more — so the first fleets are the slow ones. Later, helium-3 from the Moon opens a cleaner design.' },
    ],
  },
  {
    id: 'd-provinces',
    advisor: 'sol',
    title: 'Provinces and AIs',
    when: (s) => s.act === 4 && (s.planet?.stage ?? 0) >= 1 && !s.planet?.jump && !s.planet?.planOpen && s.day - (s.planet?.stageDay ?? s.day) >= 45,
    steps: [
      { text: () => 'Every bloc is a province now, with people, heat, water and wellbeing. Hover a wellbeing bar to see what drives it. Water and cooling programmes help the hottest ones.', enter: (g) => g.openPlanet('provinces'), target: () => 'planet-provinces' },
      { text: () => 'You can hand a province to an AI — Bit, or a rival lab’s model — once its trust is high enough and the world safety margin is positive. Each has its own temperament. Watch them.', mood: 'worried' },
    ],
  },
  {
    id: 'd-climate',
    advisor: 'iris',
    title: 'Warming',
    when: (s) => s.act === 4 && (s.planet?.stage ?? 0) >= 1 && !s.planet?.jump && !s.planet?.planOpen && s.day - (s.planet?.stageDay ?? s.day) >= 90,
    steps: [
      { text: () => 'Warming is in degrees now, and it is on the checklist: under 2 °C. Cleaner grids slow it; direct air capture pulls carbon back out. Some provinces will ask about dimming the sun. It is a painkiller, not a cure.', enter: (g) => g.openPlanet('climate'), target: () => 'planet-climate' },
    ],
  },
  {
    id: 'd-space',
    advisor: 'kip',
    title: 'The High Frontier',
    when: (s) => s.act === 4 && (s.planet?.stage ?? 0) >= 3 && !s.planet?.jump && !s.planet?.planOpen && !s.planet?.heatwall,
    steps: [
      { text: () => 'Spaceports, orbital data centres in permanent sunlight, space-solar stations beaming power down, and a base on the Moon. Watch the debris: crowd low orbit and it closes for everyone.', enter: (g) => g.openPlanet('space'), target: () => 'planet-space', mood: 'excited' },
      { text: () => 'Press V to see it all from orbit. Click the Moon to visit the base.' },
    ],
  },
  {
    id: 'd-heatwall',
    advisor: 'sol',
    title: 'The Heat Wall',
    when: (s) => s.act === 4 && !!s.planet?.heatwall && !s.planet.heatwall.done,
    steps: [
      { text: () => 'Three fronts, a hundred and twenty days: the heat, the debris cascade, and an AI that wants the controls. Hover each bar to see what pushes it — and what holds it back.', target: () => 'heatwall', mood: 'worried' },
    ],
  },
  // ── Act V: Type I ──
  {
    id: 'e-system',
    advisor: 'kip',
    title: 'The System',
    when: (s) => s.act === 5 && !!s.system?.thermalLine && !!s.system.ownership && !s.system.jump,
    steps: [
      { text: () => 'Act V! The System panel (X) is where the last climb happens: the Thermal Line, foundries, asteroids, the swarm, the minds and the people. How to play (?) sums up the act.', target: () => 'dock-system', mood: 'excited' },
      { text: () => 'Earth can only shed so much heat, so almost all of Type I has to be caught and used in space. The checklist on the Overview is the act; when it all holds, the Sun throws its worst at us — and anything still open makes its front of the storm harder. Then the last climb.', enter: (g) => g.openSystem('overview'), target: () => 'system-checklist' },
      { text: () => 'If you’d rather steer than drive, switch on Autopilot: the planner keeps posting and awarding contracts between eras. The big decisions stay yours.', target: () => 'system-autopilot' },
    ],
  },
  {
    id: 'e-foundries',
    advisor: 'mira',
    title: 'Seeds and the dial',
    when: (s) => s.act === 5 && (s.system?.foundries.length ?? 0) > 0 && !s.system?.jump && !s.system?.planOpen,
    steps: [
      { text: (g) => `${g.state?.system?.cast.mira?.fate === 'retired' ? 'Kenta here, Mira’s desk.' : ''} A seed foundry copies itself out of the rock around it. The growth dial sets how fast — and how often a copy comes out wrong, how fast a bad strain spreads and what checking costs. Reinvest more and the foundries grow faster but build less now. The forecast beside the dial says where it gets us.`, enter: (g) => g.openSystem('foundries'), target: () => 'system-levers' },
      { text: () => 'Plant seeds on claimed asteroids, the Moon and the L4/L5 yards. The yards build best, but only when rock reaches them from the Moon or the asteroids.' },
    ],
  },
  {
    id: 'e-view',
    advisor: 'kip',
    title: 'The solar system',
    when: (s) => s.act === 5 && (s.system?.stage ?? 0) >= 1 && !s.system?.jump && !s.system?.planOpen,
    steps: [
      { text: () => 'Press V twice — or the Solar system button — to zoom all the way out: the Sun, the swarm’s twelve arcs along Earth’s orbit, the asteroids we’ve claimed and the ships hauling their rock home. Click a rock or a yard to visit it.', enter: (g) => g.openSystem('swarm'), target: () => 'system-view', mood: 'excited' },
    ],
  },
  {
    id: 'e-minds',
    advisor: 'iris',
    title: 'The minds',
    when: (s) => s.act === 5 && (s.system?.stage ?? 0) >= 2 && !!s.system?.seat && !s.system.jump,
    steps: [
      { text: () => 'Most of the swarm’s power runs minds now. Their mood follows their share of the swarm, the seat we gave them and what we do with Bit. A happy constituency designs better seeds and helps contain drift. An unhappy one slows down.', enter: (g) => g.openSystem('minds'), target: () => 'system-minds' },
    ],
  },
  {
    id: 'e-solarmax',
    advisor: 'iris',
    title: 'Solar Maximum',
    when: (s) => s.act === 5 && !!s.system?.solarmax && !s.system.solarmax.done,
    steps: [
      { text: () => 'The storm is here. Three fronts for 120 days: the swarm itself, Earth’s Thermal Line while the swarm is dark, and the minds — a strain is loose and an AI wants the controls. Our preparation blunts the storm but can’t stop it; the cards are how we hold. Hover a front to see what pushes it.', target: () => 'solarmax', mood: 'worried' },
    ],
  },
];
