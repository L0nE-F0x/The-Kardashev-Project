import type { IconName } from '../ui/icons';

/**
 * How to Play: the player's handbook (menu → How to play, the ? button in the dock, F1 or ? in game).
 * The Field Guide explains the real world; this explains the game: the loop, what a normal session looks like in
 * each act, every panel and the common mistakes.
 *
 * Text format (rendered by ui/menu/HowToPlay.tsx): blank line = new paragraph; lines starting with "- " are a
 * bullet list, "1. " a numbered list, "> " a tip box; **bold**; [Key] is a key cap.
 */

export interface HowToTopic {
  id: string;
  title: string;
  icon: IconName;
  /** Shown from this act on (default 1). */
  act?: number;
  /** A special block rendered above the text. */
  special?: 'loop' | 'acts' | 'screen' | 'panels' | 'keys' | 'day';
  body: string;
}

export const ACT_NAMES = ['The Garage', 'The Scale-Up', 'The Charter', 'Planetary', 'Type I'] as const;

/** One line per act for the overview: the goal and how it ends. */
export const ACT_GOALS: string[] = [
  'Train your first models, build your own data center and raise a Series A.',
  'Grow to gigawatts: bigger halls, firm power, supply deals, governments and markets — then survive The Crunch and IPO.',
  'Run the Kardashev Project for the whole world: contracts, partners, the Council and a safety regime. Hold The Threshold.',
  'Govern a planet: five-year plans, a supergrid, fusion, orbit and the Moon. Hold The Heat Wall.',
  'Build a swarm around the Sun while Earth keeps cool. Survive Solar Maximum and reach Kardashev 1.0000.',
];

/** The core loop, drawn as a ring (Act I–II). */
export const LOOP: { icon: IconName; title: string; text: string }[] = [
  { icon: 'cash', title: 'Cash', text: 'Seed money, then revenue' },
  { icon: 'datacenter', title: 'Build', text: 'Data halls + power plants' },
  { icon: 'orders', title: 'Chips', text: 'Order, ship, install' },
  { icon: 'compute', title: 'Compute', text: 'Split it four ways' },
  { icon: 'brain', title: 'Models', text: 'Train Bit-1, Bit-2…' },
  { icon: 'infer', title: 'Customers', text: 'Serve the model → revenue' },
];

/** What each dock button is for, and when to open it. */
export const PANEL_GUIDE: { icon: IconName; name: string; key: string; act: number; what: string; when: string }[] = [
  { icon: 'compute', name: 'Compute & models', key: 'C', act: 1, what: 'Rent cloud chips, start training runs, and split your compute between training, customers (inference), research and safety.', when: 'When a run finishes (start the next one) and when you change strategy.' },
  { icon: 'orders', name: 'Orders', key: 'O', act: 1, what: 'Buy accelerators from Lumen (ships sooner) or Kestrel (cheaper). They sail to a site and install themselves in its data hall.', when: 'Whenever a hall has empty racks — ideally before it finishes building.' },
  { icon: 'research', name: 'Research', key: 'R', act: 1, what: 'The tech tree. Research points come from your HQ, labs and the compute you give research.', when: 'Every time a project finishes. The button shows a badge when research is idle.' },
  { icon: 'finance', name: 'Finance', key: 'F', act: 1, what: 'Income, costs and the cash trend. From Act II: the board, debt and project finance.', when: 'When the cash arrow in the top bar points down.' },
  { icon: 'chart', name: 'Stats', key: 'K', act: 1, what: 'Charts of your whole run, one point a month: cash, revenue vs costs, compute, power, chips, capability vs the frontier, the safety margin and K.', when: 'After a long skip, or whenever you want to see the curve bend.' },
  { icon: 'team', name: 'Team', key: 'T', act: 2, what: 'Standing jobs for your advisors: Mira keeps halls stocked, Juno keeps power ahead of load, Iris guards safety, Bit starts the next run, Penny keeps a cash floor.', when: 'Once, early in Act II — then they work for you every week.' },
  { icon: 'deal', name: 'Deals', key: 'E', act: 2, what: 'Supply deals (wafers, HBM, packaging), enterprise customers and startups for sale.', when: 'When chip deliveries slow down or you want guaranteed revenue.' },
  { icon: 'blocs', name: 'Blocs', key: 'P', act: 2, what: 'Governments: trust, relations, lobbying, treaties and sovereign deals. Relations decide export licences and reactors.', when: 'Before you build in a new bloc, or when an export rule bites.' },
  { icon: 'charter', name: 'The Charter', key: 'H', act: 3, what: 'The world project: treasury, contracts and bids, missions, partners and the world’s energy.', when: 'All the time in Act III — this is where you build.' },
  { icon: 'council', name: 'The Council', key: 'U', act: 3, what: 'Resolutions and votes. Sessions every 90 days; table up to three, whip the waverers.', when: 'Before each session (the button shows a badge).' },
  { icon: 'globe', name: 'The Planet', key: 'Y', act: 4, what: 'Provinces, the supergrid, fusion, space and the climate — and the act’s checklist.', when: 'Between jumps: set the five-year plan, check what holds the checklist back.' },
  { icon: 'swarm', name: 'The System', key: 'X', act: 5, what: 'The Thermal Line, foundries, asteroids, the swarm, the minds and the people.', when: 'Between eras: set the era plan and answer the big decisions.' },
  { icon: 'goals', name: 'Goals', key: 'G', act: 1, what: 'Every goal of the act with progress bars and hints. The headline goals end the act; side goals are optional and pay research. 📌 pins one to the top of the goal card.', when: 'When you wonder what the act wants from you.' },
  { icon: 'guide', name: 'Field Guide', key: 'B', act: 1, what: 'The real world behind the game: energy, chips, scaling laws, safety. New entries unlock as you meet them.', when: 'When the dot appears, or when you’re curious.' },
  { icon: 'news', name: 'News', key: 'N', act: 1, what: 'Everything that happened, newest first, plus Messages: every advisor pop-up this session.', when: 'After a fast-forward or a skip — a badge counts the pop-ups you may have missed.' },
  { icon: 'link', name: 'Power line tool', key: 'L', act: 1, what: 'Draw a transmission line between two of your sites to pool their power.', when: 'When one site has spare power and another is short.' },
  { icon: 'fiber', name: 'Fiber tool', key: 'I', act: 2, what: 'Lay fiber between your sites so halls in one region can sell into another.', when: 'When you want a second market.' },
];

export const HOWTO: HowToTopic[] = [
  {
    id: 'start',
    title: 'Start here',
    icon: 'k',
    special: 'acts',
    body: `You run an AI company in 2027 — and, if it goes well, much more than that. The game is measured on the **Kardashev scale** (top right): how much power civilisation commands. Earth today is K 0.73. Type I is K 1.00, about five hundred times more.

AI is how you climb; energy is how you’re measured. Every act widens what you’re in charge of, from one garage to the whole Solar System.

> You can’t really lose by playing slowly. The acts end on goals, and every finale can be survived with preparation. Experiment.`,
  },
  {
    id: 'loop',
    title: 'The core loop',
    icon: 'restart',
    special: 'loop',
    body: `Everything in Acts I and II feeds this ring. Money builds **data halls** and the **power** to run them; halls hold **chips**; chips are **compute**; compute **trains models**; a better model **earns more** from customers; and the money builds more halls.

Two side loops make the ring turn faster:
- **Research** (Research panel) — cheaper builds, smarter models, faster training. Fed by your HQ, labs and the compute share you give it.
- **Safety** (the safety margin, top bar) — alignment research keeps your models trustworthy. Below 0, incidents get likely; investors and governments notice.

Your compute is split four ways in the Compute panel: **training** (the next model), **inference** (serving customers = revenue), **research** and **safety**. With no training run going, the training share serves customers too.`,
  },
  {
    id: 'day',
    title: 'A typical day',
    icon: 'clock',
    special: 'day',
    body: `Building takes months, so most of the game is **setting things in motion, then letting time run**. A good rhythm, whatever the act:

1. **Read the goal card** (Next up, top left). It always shows the next concrete step and how far along you are.
2. **Scan the top bar.** Red or orange text is trouble: power short of what your sites need, cash falling, safety margin below zero. Hover any number for the breakdown.
3. **Look for badges** on the dock buttons: a red number means something there is waiting for you (research idle, a run to start, an offer).
4. **Queue the next thing before the last one finishes:** research, the next training run, chips for a hall that’s still being built, power for a hall you’re about to build.
5. **Speed up.** Press [3] or [4] (or the ▶▶ buttons), or press **⏭ Skip to next** under the goal card to jump straight to the next thing you’re waiting for. The game stops the clock by itself when an event card needs you, so you won’t miss anything.
6. **Answer event cards** (the pop-ups with choices). Each one is a trade-off; the advisors’ lines hint at the angle. The highlighted choice is the safe default.

> If nothing on screen needs you, ▶▶▶ is the right speed. Most of the waiting is concrete setting and chips at sea.`,
  },
  {
    id: 'screen',
    title: 'Reading the screen',
    icon: 'map',
    special: 'screen',
    body: `**The map** is the world: click a site (a marker) to see it in the **inspector** on the right — its sun, wind, power price and the plots you can build on. Your own sites have a **View** button that opens the campus (or press [V]). Drag to pan, scroll or pinch to zoom.

**The ticker** along the bottom is the news feed; click it for the full News panel. **Toasts** (small pop-ups, bottom right) are your advisors flagging something.

Almost everything has a tooltip: hover with a mouse, long-press on a phone.`,
  },
  {
    id: 'panels',
    title: 'The panels',
    icon: 'guide',
    special: 'panels',
    body: `The dock on the left opens one panel at a time. Each act adds a button or two. Here is what they’re for, and when you’ll want them:`,
  },
  {
    id: 'time',
    title: 'Time & speed',
    icon: 'ff',
    body: `At 1× one game day passes every second. [2] is twice as fast, [3] four times, [4] eight times. [Space] pauses.

- **Coming up** (under the goal card) lists what you’re waiting for — builds, chips at sea, grid connections, the training run, research — with how long each takes. **⏭ Skip to next** runs the clock flat out until the first one lands; the small ⏭ on each line skips further. A card or any speed button stops a skip.
- **Event cards stop the clock** while they’re on screen (Settings → Gameplay → Pause for decisions), then it carries on at your speed.
- **Builds take months:** a data hall about ten, a solar farm about nine, a gas plant over two years. Start long things early and run the clock fast while they build.
- **Slow down** when you’re juggling a finale (The Crunch and later ones) or want to watch a campus.
- **Offline progress:** in Acts I–III the world keeps running a little while you’re away, if the clock was running when you left.
- From Act IV, years pass in **jumps**: you set a plan, then the years fly by in a time-lapse and you get a report.`,
  },
  {
    id: 'power',
    title: 'Power 101',
    icon: 'power',
    body: `Every data hall needs power around the clock. The top bar shows **power served vs needed**; the inspector shows each site’s balance.

- **Grid connection:** cheap, but there’s a queue of months to years. Request it early.
- **Solar:** quick and cheap, but only by day — on its own it covers about half of a 24/7 load. Pair it with **batteries** to carry the night.
- **Wind:** less sun-dependent, needs less storage; best on windy plains and coasts.
- **Gas:** firm (runs any hour) but slow to build, costs fuel and emits CO₂.
- **Power lines** ([L]) pool power between your sites.
- From Act II: **hydro, geothermal and nuclear** — firm and clean, but they need the right site and government support.

> A brownout (served < needed) slows everything on that site. Build power before the hall finishes, not after.`,
  },
  {
    id: 'chips',
    title: 'Chips & compute',
    icon: 'compute',
    body: `**Renting** from Cumulus Cloud is instant but expensive — a bridge until your own hall opens. Turn rentals down once your chips are installed.

**Owning:** order accelerators in Orders. They’re made, shipped by sea to your site and installed automatically once the hall is online. A 10 MW hall holds about 8,300 chips.

- **Fill the hall.** Training speed comes from total compute; a half-empty hall makes the next model take years.
- **Lead times are long.** Order while the hall is still being built so the chips land when it opens.
- **Lumen** ships sooner; **Kestrel** is cheaper. From Act II, supply deals keep your chips coming when the market is tight.`,
  },
  {
    id: 'models',
    title: 'Models, money & safety',
    icon: 'brain',
    body: `Each model (Bit-1, Bit-2…) needs a training run of a certain size in FLOP; the Compute panel shows how many days are left at your current training share. A finished model replaces the last one and **earns more per chip** from customers.

- **Revenue** = how good your model is × how much compute serves customers × how much demand there is. More chips on inference = more money now; more on training = a better model sooner.
- **Research** unlocks better architectures, cheaper builds and new facilities. Keep it running.
- **Safety margin** = alignment − capability. Every new model raises capability; safety research raises alignment. Iris wants at least 8% of your compute on safety. Below 0, incidents become likely; below −0.25, investors balk.`,
  },
  {
    id: 'act2',
    title: 'Act II: the scale-up',
    icon: 'team',
    act: 2,
    body: `Act II is about **scale and delegation**. You can’t place every order by hand any more — and you don’t have to.

1. **Give the team jobs** (Team, [T]): Mira stocks the halls, Juno builds power ahead of load, Iris guards the margin, Bit starts the next run, Penny holds a cash floor.
2. **Upgrade halls** to 50 MW (and later 200 MW) from the inspector, and buy neighbouring plots.
3. **Firm clean power:** hydro, geothermal, nuclear restarts and small reactors.
4. **Reach more markets:** fiber between your sites ([I]), leased subsea cables from landing stations.
5. **Keep chips flowing** with supply deals; watch the three pools (wafers, HBM, packaging) in Deals.
6. **Mind the blocs:** relations decide export licences and reactor approvals.

The board checks your sales growth every quarter. The act ends with **The Crunch** — three fronts (grid, supply, trust) to hold for 90 days — and the IPO.`,
  },
  {
    id: 'act3',
    title: 'Act III: the Charter',
    icon: 'charter',
    act: 3,
    body: `You now steward the **Kardashev Project** for the whole world. The Charter has its own treasury, separate from your company.

1. **Post contracts** (Charter → Contracts): what to build, where and how big. Partners bid within a few weeks.
2. **Award bids:** cheap partners overrun, fast ones cut corners, reliable ones cost more. Awarding your own company costs Legitimacy.
3. **Missions** chain contracts into world-changing goals.
4. **The Council** ([U]) votes every 90 days. Table resolutions with political capital; whip the waverers.
5. **Delegate:** Team → Charter desk lets advisors award tenders and whip votes for you.

Keep **Legitimacy** up (deliver projects, spread them fairly). The Mandate goals lead to **The Threshold** and the renewal vote.`,
  },
  {
    id: 'act4',
    title: 'Act IV: planetary',
    icon: 'globe',
    act: 4,
    body: `The blocs are **provinces** of one planet, and time moves in **five-year plans**.

1. **Set the plan** (Planet, [Y]): up to three priorities and a reserve. Then the years **jump** in a time-lapse.
2. **Between jumps,** the planner posts and awards contracts by your priorities (you can switch autopilot off and do it yourself). Decisions on autopilot take the first, sensible choice.
3. **Read the report**, check the checklist on the Planet overview and fix what lags: a supergrid link, a fusion pilot, a province in trouble, warming.

When the whole checklist holds, **The Heat Wall** begins.`,
  },
  {
    id: 'act5',
    title: 'Act V: Type I',
    icon: 'swarm',
    act: 5,
    body: `Earth can only shed so much heat, so almost all of Type I has to be caught and used **in space**.

1. **Draw the Thermal Line** and decide who owns the sky — big decisions that shape the act.
2. **Plant seed foundries** (System, [X]) on the Moon, the Lagrange yards and claimed asteroids. The growth dial trades speed for drift.
3. **Set an era plan,** then jump. The swarm grows arc by arc.
4. **Keep the minds at peace** and Earth within its line.

The checklist leads to **Solar Maximum**, then the last climb to Kardashev 1.0000.`,
  },
  {
    id: 'tips',
    title: 'Tips & common mistakes',
    icon: 'warn',
    body: `- **Playing everything at 1×.** Most of Act I is waiting for builds. Use [3] or [4], or ⏭ Skip to next under the goal card; cards stop the clock for you.
- **A hall with no power.** Line up grid, solar + batteries or gas at the same site before the hall opens.
- **Solar without batteries.** Your hall goes dark every night.
- **A half-empty hall.** Order enough chips to fill it — training speed is total compute.
- **Renting forever.** Cumulus is a bridge. Turn it down once your own chips are in.
- **Idle research.** A finished project leaves the lab idle until you pick the next one (watch for the badge).
- **Ignoring safety.** Every model pushes capability up. Keep some compute on safety.
- **Spending the seed money in week one.** Penny is right: halls take ten months, and you need to pay for chips and power too.
- **Not reading the inspector.** Sites differ a lot: sun, wind, power price, water, how many plots.`,
  },
  {
    id: 'keys',
    title: 'Controls',
    icon: 'settings',
    special: 'keys',
    body: `Mouse: click to select, drag to pan, wheel to zoom (Settings → Controls can switch the wheel to pan). Touch: tap, drag and pinch; long-press for tooltips.`,
  },
];

/** The topics this act can see (later acts stay hidden). */
export function howToTopics(act: number): HowToTopic[] {
  return HOWTO.filter((t) => (t.act ?? 1) <= act);
}

/** Per-act shape of a session: a few beats, shown under "A typical day" for the act you're in. */
export const ACT_RHYTHM: { act: number; beats: [string, string][] }[] = [
  {
    act: 1,
    beats: [
      ['Day 1', 'Rent chips, start Bit-1, put a little compute on safety, pick a research project.'],
      ['First weeks', 'Pick a site with cheap power and space. Start a data hall and its power (grid, or solar + batteries). Order chips to fill it.'],
      ['Months 1–10', 'Concrete is setting. Skip ahead (⏭) or speed up; answer cards; keep research going; Bit-1 earns a little.'],
      ['Hall online', 'Chips install, turn rentals down, start the big Bit-2 run. Revenue climbs.'],
      ['The long run', 'Bit-2 trains for most of a year: a good time for the side goals — a second site, a lab, wind, a full hall, clean power.'],
      ['Year 2', 'Bit-2, $5M/month and a safe margin: Penny brings the Series A term sheets.'],
    ],
  },
  {
    act: 2,
    beats: [
      ['Start', 'Switch on advisor jobs. Upgrade your hall to 50 MW, start firm power.'],
      ['Phase 1', '100 MW of halls, Bit-3, $75M a month → Series B.'],
      ['Phases 2–3', 'Supply deals, a packaging plant or fab, contracts, the board — then gigawatts and Bit-4.'],
      ['Phase 4', 'The Crunch: 90 days on three fronts, then the IPO.'],
    ],
  },
  {
    act: 3,
    beats: [
      ['Founding', 'Post and award your first contracts, pass a resolution, decide about your company.'],
      ['Build-out', 'Megaprojects, HVDC links, the Chip Commons, a launch complex.'],
      ['Frontier', 'The Mandate checklist: K 0.75, missions, access, the safety regime.'],
      ['Threshold', '120 days on three fronts, then the renewal vote.'],
    ],
  },
  {
    act: 4,
    beats: [
      ['Each plan', 'Pick priorities → jump five years → read the report → fix what lags.'],
      ['Stages', 'Supergrid → Fusion Age → High Frontier → The Heat Wall.'],
    ],
  },
  {
    act: 5,
    beats: [
      ['Each era', 'Set the era plan → jump → read the report and Bit’s diary → answer the big decisions.'],
      ['Stages', 'Foundries → Swarm → Last Climb → Solar Maximum → Type I.'],
    ],
  },
];
