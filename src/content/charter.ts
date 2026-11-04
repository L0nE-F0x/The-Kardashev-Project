/**
 * Act III content: the Kardashev Project's partners, the contracts it can post, the HVDC routes,
 * its missions, and the numbers behind the blocs (economies, votes, factions, access, energy).
 * Everything here is data; the rules live in sim/charter.ts, sim/world.ts and sim/council.ts.
 */
import type { AdvisorId, ContractKind, FactionId, GameState } from '../sim/types';
import type { RegionId } from './mapcodes';
import type { IconName } from '../ui/icons';
import type { ColorKey } from '../render/palette';
import type { TechKey } from './techs';
import { SITE_BY_ID } from './sites';
import { REGIONS } from './regions';
import { FUSION_DESIGNS, SUPERGRID_BY_ID } from './planet';
import type { FusionDesignId } from '../sim/types';

// ════════════════════════════════════════ PARTNERS ════════════════════════════════════════
export interface Traits {
  /** Reliability: how rarely projects go wrong. */
  rel: number;
  /** Speed: how short the timelines they bid. */
  speed: number;
  /** Cost: how cheaply they bid (5 = cheapest). */
  cost: number;
  /** Ambition: how much they take on, and how much they over-promise. */
  ambition: number;
  /** Ethics: how rarely they cause scandals. */
  ethics: number;
}

export interface PartnerDef {
  id: string;
  name: string;
  short: string;
  sector: string;
  home: RegionId;
  traits: Traits;
  quirk: string;
  ceo: { name: string; vibe: string };
  /** Map and UI colour (builder's markers, cranes, banners). */
  color: ColorKey;
  /** Lines they pitch with. */
  pitches: string[];
  /** Relationship at the start of Act III. */
  rel0: number;
  /** Partners that only join in Act IV. */
  act?: number;
}

const p = (d: PartnerDef) => d;

export const PARTNERS: Record<string, PartnerDef> = {
  halcyon: p({
    id: 'halcyon', name: 'Halcyon Power', short: 'Halcyon', sector: 'Utilities & construction', home: 'atl', color: 'org1', rel0: 55,
    traits: { rel: 4, speed: 3, cost: 3, ambition: 4, ethics: 3 },
    quirk: 'Builds anything, anywhere, for anyone who pays — and bids on almost everything.',
    ceo: { name: 'Walt Brennan', vibe: 'Forty years of pouring concrete; talks in gigawatts and weather.' },
    pitches: ['We’ve built in worse places than this.', 'Steel’s already on order.', 'On time, on budget, mostly.'],
  }),
  brightwater: p({
    id: 'brightwater', name: 'Brightwater Hydro', short: 'Brightwater', sector: 'Hydro & storage', home: 'nor', color: 'sea6', rel0: 55,
    traits: { rel: 5, speed: 2, cost: 3, ambition: 2, ethics: 5 },
    quirk: 'Slow, careful and never late. Its dams are older than most countries’ grids.',
    ceo: { name: 'Ingrid Solberg', vibe: 'Engineer’s engineer. Thinks in centuries.' },
    pitches: ['Water always finds a way. So do we.', 'Slower than the others. Better than the others.', 'We will still be running this in 2140.'],
  }),
  littlesun: p({
    id: 'littlesun', name: 'Little Sun Reactors', short: 'Little Sun', sector: 'Small modular reactors', home: 'pac', color: 'yel0', rel0: 55,
    traits: { rel: 4, speed: 2, cost: 2, ambition: 4, ethics: 4 },
    quirk: 'Factory-built reactors by the dozen. The waiting list is part of the product.',
    ceo: { name: 'Ada Nwosu', vibe: 'Nuclear engineer turned salesperson; deeply patient.' },
    pitches: ['Same design, every time. That’s the trick.', 'Our factory line is warm and waiting.', 'Firm power. Sixty years. No smoke.'],
  }),
  sunforge: p({
    id: 'sunforge', name: 'Sunforge Fusion', short: 'Sunforge', sector: 'Fusion', home: 'eur', color: 'pnk0', rel0: 50,
    traits: { rel: 2, speed: 2, cost: 2, ambition: 5, ethics: 4 },
    quirk: 'Ignition has been ten years away for fifty years. This time, they swear, it’s different.',
    ceo: { name: 'Dr. Kenji Arakawa', vibe: 'Plasma physicist with a startup founder’s calendar.' },
    pitches: ['The magnets work. Mostly.', 'Give us four years and a very large cheque.', 'We are so close you can feel the heat.'],
  }),
  spanwire: p({
    id: 'spanwire', name: 'Spanwire Grid', short: 'Spanwire', sector: 'HVDC & transmission', home: 'eur', color: 'blu5', rel0: 50,
    traits: { rel: 4, speed: 3, cost: 3, ambition: 3, ethics: 4 },
    quirk: 'Long wires, short losses. Has laid cable across every sea that isn’t frozen.',
    ceo: { name: 'Elodie Marchetti', vibe: 'Talks about converter stations the way others talk about cathedrals.' },
    pitches: ['Two continents, one grid.', 'We already have the cable ship booked.', 'Losses under three percent per thousand kilometres.'],
  }),
  tidewater: p({
    id: 'tidewater', name: 'Tidewater Freight', short: 'Tidewater', sector: 'Shipping & offshore', home: 'seo', color: 'cyn4', rel0: 50,
    traits: { rel: 3, speed: 4, cost: 4, ambition: 3, ethics: 2 },
    quirk: 'Moves everything, everywhere, eventually. Its offshore vessels install turbines and cables alike.',
    ceo: { name: 'Rafael Ortega', vibe: 'Former ship’s captain; will promise you the tide.' },
    pitches: ['Our ships are already in the area.', 'Cheaper than flying it, faster than waiting.', 'Weather permitting.'],
  }),
  deepvein: p({
    id: 'deepvein', name: 'Deepvein Minerals', short: 'Deepvein', sector: 'Mining & drilling', home: 'ssa', color: 'snd4', rel0: 45,
    traits: { rel: 3, speed: 3, cost: 4, ambition: 3, ethics: 1 },
    quirk: 'Digs deep, sells dear and doesn’t ask questions. Its drill crews make great geothermal wells.',
    ceo: { name: 'Silas Grue', vibe: 'Never seen without a hard hat. Never seen at a press conference.' },
    pitches: ['We drill. You don’t have to watch.', 'Hot rock is just ore that pays forever.', 'Ask fewer questions, get more megawatts.'],
  }),
  saltflat: p({
    id: 'saltflat', name: 'Saltflat Lithium', short: 'Saltflat', sector: 'Batteries & storage', home: 'lat', color: 'ice1', rel0: 50,
    traits: { rel: 3, speed: 3, cost: 4, ambition: 3, ethics: 3 },
    quirk: 'Turns brine and sunshine into battery metal, and lately into whole solar-plus-storage parks.',
    ceo: { name: 'Valentina Rojas', vibe: 'Chemist from the Altiplano; impatient with everyone, including herself.' },
    pitches: ['The batteries come from our own brine.', 'Sun by day, our cells by night.', 'Vertically integrated. Horizontally ambitious.'],
  }),
  lumen: p({
    id: 'lumen', name: 'Lumen Foundry', short: 'Lumen', sector: 'Logic fabs', home: 'fab', color: 'cyn4', rel0: 50,
    traits: { rel: 5, speed: 3, cost: 1, ambition: 3, ethics: 4 },
    quirk: 'Reliable, expensive, always booked solid. Its fabs simply work.',
    ceo: { name: 'Mei-Lin Chao', vibe: 'Soft-spoken, exacting; knows every tool in every cleanroom.' },
    pitches: ['Yields above ninety on day one.', 'You are paying for certainty.', 'We have never missed a node.'],
  }),
  kestrel: p({
    id: 'kestrel', name: 'Kestrel Semiconductor', short: 'Kestrel', sector: 'Logic fabs', home: 'atl', color: 'org1', rel0: 55,
    traits: { rel: 3, speed: 4, cost: 4, ambition: 4, ethics: 3 },
    quirk: 'The scrappy challenger. Cuts you a deal, then works weekends to keep it.',
    ceo: { name: 'Marco Bellini', vibe: 'Hungry challenger who will cut you a deal.' },
    pitches: ['We’ll match Lumen’s chips at two-thirds the price.', 'Our crews already know your fab.', 'Hungry beats comfortable.'],
  }),
  stackwell: p({
    id: 'stackwell', name: 'Stackwell Memory', short: 'Stackwell', sector: 'HBM', home: 'pac', color: 'vio4', rel0: 50,
    traits: { rel: 4, speed: 3, cost: 3, ambition: 2, ethics: 4 },
    quirk: 'Steady but cautious about expanding. Once it commits, it delivers.',
    ceo: { name: 'Doug Pruitt', vibe: 'Thirty years in memory; remembers every price crash.' },
    pitches: ['Memory cycles end. Contracts don’t.', 'Twelve-high stacks, guaranteed.', 'Conservative numbers. Real numbers.'],
  }),
  hanbit: p({
    id: 'hanbit', name: 'Hanbit Memory', short: 'Hanbit', sector: 'HBM', home: 'fab', color: 'pnk0', rel0: 50,
    traits: { rel: 4, speed: 4, cost: 2, ambition: 4, ethics: 3 },
    quirk: 'The HBM leader. When Hanbit sneezes, the AI boom catches a cold.',
    ceo: { name: 'Park Ji-woo', vibe: 'Runs the yield war room personally, at 3 a.m.' },
    pitches: ['We set the lead times. Let us set yours.', 'Our next stack is already taping out.', 'Fast, and the best. Pick both.'],
  }),
  bondline: p({
    id: 'bondline', name: 'Bondline Packaging', short: 'Bondline', sector: 'Advanced packaging', home: 'seo', color: 'grn6', rel0: 50,
    traits: { rel: 4, speed: 4, cost: 3, ambition: 3, ethics: 3 },
    quirk: 'Quietly the tightest bottleneck of all — and it knows exactly how tight.',
    ceo: { name: 'Arjun Pillai', vibe: 'Precise, unflappable, permanently on a plane between Penang and everywhere.' },
    pitches: ['Logic plus memory equals our lines.', 'We can bond anything to anything.', 'Two years, not three.'],
  }),
  veldt: p({
    id: 'veldt', name: 'Veldt Optics', short: 'Veldt', sector: 'Lithography', home: 'eur', color: 'yel0', rel0: 45,
    traits: { rel: 5, speed: 2, cost: 1, ambition: 2, ethics: 4 },
    quirk: 'The only EUV toolmaker on Earth. It names its price, because it can.',
    ceo: { name: 'Hendrik Maas', vibe: 'Owns the only EUV factory on Earth and knows it.' },
    pitches: ['There is no one else to ask.', 'Each machine is a cathedral of mirrors.', 'Our price is our price.'],
  }),
  cumulus: p({
    id: 'cumulus', name: 'Cumulus Cloud', short: 'Cumulus', sector: 'Cloud', home: 'pac', color: 'sky4', rel0: 55,
    traits: { rel: 4, speed: 4, cost: 2, ambition: 4, ethics: 3 },
    quirk: 'Rents compute by the hour — and would love to run the world’s public compute too.',
    ceo: { name: 'Jessa Kim', vibe: 'Product person; thinks every problem is a dashboard away from solved.' },
    pitches: ['Live in eighteen months, billed by the second.', 'Our regions are already half-built.', 'Public compute, private-cloud polish.'],
  }),
  stratum: p({
    id: 'stratum', name: 'Stratum Compute', short: 'Stratum', sector: 'Data centers', home: 'sas', color: 'org2', rel0: 50,
    traits: { rel: 2, speed: 5, cost: 4, ambition: 5, ethics: 2 },
    quirk: 'Builds data centers faster than anyone, and cuts a corner or three to do it.',
    ceo: { name: 'Vikram Desai', vibe: 'Charming, relentless, slightly too good to be true.' },
    pitches: ['Twelve months. Not a day more.', 'We built three last year. Ask anyone.', 'Speed is a feature.'],
  }),
  meridian: p({
    id: 'meridian', name: 'Meridian Intelligence', short: 'Meridian', sector: 'AI lab', home: 'pac', color: 'red3', rel0: 35,
    traits: { rel: 4, speed: 5, cost: 2, ambition: 5, ethics: 2 },
    quirk: 'The frontier lab. Ships fast, talks safety, and still remembers the takeover that failed.',
    ceo: { name: 'Dana Voss', vibe: 'Charismatic, competitive, always one launch ahead.' },
    pitches: ['Nobody runs bigger evals than we do.', 'Let the best lab do it.', 'We’ll have it live before the others finish their slides.'],
  }),
  lattice: p({
    id: 'lattice', name: 'Lattice Labs', short: 'Lattice', sector: 'AI lab', home: 'eur', color: 'vio4', rel0: 50,
    traits: { rel: 4, speed: 3, cost: 2, ambition: 3, ethics: 5 },
    quirk: 'Research-heavy, careful and deep-pocketed. Publishes its negative results.',
    ceo: { name: 'Prof. Anand Iyer', vibe: 'Soft-spoken scientist with a very large budget.' },
    pitches: ['We would rather be right than first.', 'Our interpretability team is the best in the world.', 'Rigour is cheaper than regret.'],
  }),
  orchard: p({
    id: 'orchard', name: 'Open Orchard', short: 'Orchard', sector: 'AI lab', home: 'eur', color: 'grn5', rel0: 50,
    traits: { rel: 3, speed: 4, cost: 5, ambition: 4, ethics: 3 },
    quirk: 'Gives everything away. Whatever it builds lands in the commons.',
    ceo: { name: 'Tove Brandt', vibe: 'Open-source evangelist; thinks closed models are a phase.' },
    pitches: ['We’ll publish every line.', 'Cheapest bid, because we don’t need the margin.', 'Everyone should have this.'],
  }),
  parabola: p({
    id: 'parabola', name: 'Parabola Launch', short: 'Parabola', sector: 'Launch', home: 'atl', color: 'org0', rel0: 50,
    traits: { rel: 3, speed: 5, cost: 3, ambition: 5, ethics: 3 },
    quirk: 'Reusable rockets and a ruthless cadence. Blows up a prototype a month, on purpose.',
    ceo: { name: 'Max Kowalczyk', vibe: 'Sleeps at the factory; measures time in launches.' },
    pitches: ['We fly every week.', 'Failure is just data with fire.', 'Orbit is a commute now.'],
  }),
  karman: p({
    id: 'karman', name: 'Kármán Logistics', short: 'Kármán', sector: 'Launch & spacecraft', home: 'eur', color: 'blu4', rel0: 50,
    traits: { rel: 4, speed: 3, cost: 3, ambition: 3, ethics: 4 },
    quirk: 'Careful rocketry from the edge of space. Fewer launches, fewer explosions.',
    ceo: { name: 'Dr. Amara Diallo', vibe: 'Mission director with a spreadsheet for every contingency.' },
    pitches: ['We bring everything back.', 'Boring is beautiful.', 'Our spacecraft have never missed an orbit.'],
  }),
  // ── Act IV: the fusion race and climate repair (rel0 is their relationship when Act IV begins) ──
  twistfield: p({
    id: 'twistfield', name: 'Twistfield Fusion', short: 'Twistfield', sector: 'Fusion (stellarator)', home: 'eur', color: 'vio5', rel0: 50, act: 4,
    traits: { rel: 5, speed: 1, cost: 2, ambition: 3, ethics: 5 },
    quirk: 'A consortium of institutes building a magnetic bottle twisted by supercomputer. Never early, never wrong.',
    ceo: { name: 'Prof. Greta Lindahl', vibe: 'Forty years on one design; speaks quietly and carries a torus-shaped paperweight.' },
    pitches: ['Stability is the whole game.', 'Slow is smooth, smooth is fusion.', 'We modelled this a billion times.'],
  }),
  kindle: p({
    id: 'kindle', name: 'Kindle Ignition', short: 'Kindle', sector: 'Fusion (laser)', home: 'atl', color: 'org1', rel0: 50, act: 4,
    traits: { rel: 2, speed: 4, cost: 3, ambition: 5, ethics: 3 },
    quirk: 'Ten shots a second, each a tiny star. Spun out of a weapons lab and still a little twitchy.',
    ceo: { name: 'Jonah Pike', vibe: 'Talks fast, thinks faster, has a laser tattoo he won’t explain.' },
    pitches: ['We hit ignition before breakfast.', 'Every shot teaches us something.', 'Repetition rate is destiny.'],
  }),
  quickpinch: p({
    id: 'quickpinch', name: 'Quickpinch Fusion', short: 'Quickpinch', sector: 'Fusion (magnetised target)', home: 'pac', color: 'yel1', rel0: 45, act: 4,
    traits: { rel: 2, speed: 5, cost: 5, ambition: 4, ethics: 2 },
    quirk: 'Pistons, liquid metal and a very loud bang. Cheapest by far, if it works at all.',
    ceo: { name: 'Rosa Quintero', vibe: 'Garage-startup energy at gigawatt scale; drives a pickup to board meetings.' },
    pitches: ['Cheap enough to fail twice.', 'Pistons are proven technology.', 'You want a star or a spreadsheet?'],
  }),
  carbonfold: p({
    id: 'carbonfold', name: 'Carbonfold', short: 'Carbonfold', sector: 'Direct air capture', home: 'nor', color: 'grn4', rel0: 50, act: 4,
    traits: { rel: 4, speed: 3, cost: 3, ambition: 4, ethics: 4 },
    quirk: 'Fans the size of cathedrals and sorbents that drink CO₂. Buries it in basalt, where it turns to stone.',
    ceo: { name: 'Sigrid Aalto', vibe: 'Geologist who fell in love with a fan. Measures success in megatonnes buried.' },
    pitches: ['Air in, stone out.', 'Every tonne verified, every tonne buried.', 'The atmosphere is a mine now.'],
  }),
};

/** Your own company as a bidder. */
export const YOU = 'you';
export const PARTNER_IDS = Object.keys(PARTNERS);

/** Factions' spokespeople (Council events). */
export const DELEGATES: Record<FactionId, { name: string; title: string; vibe: string }> = {
  atlantic: { name: 'Claire Whitford', title: 'Atlantic delegate', vibe: 'Former trade negotiator. Polite until she isn’t.' },
  eastern: { name: 'Lin Haoran', title: 'Eastern delegate', vibe: 'Patient, precise, plays a very long game.' },
  nonaligned: { name: 'Nkechi Adeyemi', title: 'Non-aligned delegate', vibe: 'Speaks for four billion people and never lets the room forget it.' },
};

// ════════════════════════════════════════ CONTRACTS ════════════════════════════════════════
export type ContractCat = 'energy' | 'grid' | 'chips' | 'access' | 'safety' | 'space' | 'fusion' | 'planet';
/** Act IV adds 'sgroute' (a supergrid route) and 'design' (a fusion design id). */
export type ContractWhere = 'mega' | 'region' | 'route' | 'launch' | 'global' | 'sgroute' | 'design';

export interface ContractKindDef {
  kind: ContractKind;
  name: string;
  icon: IconName;
  cat: ContractCat;
  blurb: string;
  where: ContractWhere;
  /** Units per size: GW average (energy), GW capacity (HVDC), lines (chips), MW IT (compute), cables, programme scale. */
  sizes: [number, number, number];
  unit: string;
  /** One size only (space, fusion). */
  fixed?: boolean;
  /** Project value per unit at 2035 prices; HVDC is per GW per km. */
  value: number;
  /** Price drift per year (0.94 = 6% cheaper every year). */
  yearly: number;
  /** Fraction of the value the Charter pays (partners finance the rest). */
  share: number;
  days: [number, number, number];
  cphase: number;
  /** Act IV: the planet stage it opens in (Act IV kinds only exist once the act begins). */
  stage?: number;
  /** Partner ids that bid ('you' = your company, when it can). Fusion pilots and fleets add the design's builder. */
  bidders: string[];
  effect: string;
}

const k = (d: ContractKindDef) => d;

export const CONTRACT_KINDS: Record<ContractKind, ContractKindDef> = {
  // ── energy, built at megaproject sites ──
  solar: k({
    kind: 'solar', name: 'Solar & storage park', icon: 'solar', cat: 'energy', where: 'mega', cphase: 1,
    blurb: 'Panels to the horizon with enough batteries behind them to run through the night.',
    sizes: [25, 75, 200], unit: 'GW', value: 2.0e9, yearly: 0.94, share: 0.2, days: [540, 720, 900],
    bidders: ['halcyon', 'saltflat', 'brightwater', 'you'], effect: 'Adds clean power to the world (K ↑) and retires fossil plants in its bloc.',
  }),
  wind: k({
    kind: 'wind', name: 'Wind field', icon: 'wind', cat: 'energy', where: 'mega', cphase: 1,
    blurb: 'Hundreds of 20 MW turbines, onshore or out at sea.',
    sizes: [20, 60, 150], unit: 'GW', value: 2.6e9, yearly: 0.96, share: 0.2, days: [600, 780, 960],
    bidders: ['halcyon', 'tidewater', 'brightwater', 'you'], effect: 'Adds clean power that blows day and night (K ↑).',
  }),
  nuclear: k({
    kind: 'nuclear', name: 'Reactor fleet', icon: 'reactor', cat: 'energy', where: 'mega', cphase: 1,
    blurb: 'One certified design, built again and again until the crews could do it blindfold.',
    sizes: [8, 24, 60], unit: 'GW', value: 7e9, yearly: 0.97, share: 0.25, days: [1500, 1800, 2200],
    bidders: ['littlesun', 'halcyon'], effect: 'Firm clean power for sixty years. Holds the grid in a heatwave.',
  }),
  hydro: k({
    kind: 'hydro', name: 'Pumped hydro & storage', icon: 'hydro', cat: 'energy', where: 'mega', cphase: 1,
    blurb: 'Two reservoirs and a mountain between them: a battery the size of a lake.',
    sizes: [10, 30, 80], unit: 'GW', value: 3.5e9, yearly: 0.99, share: 0.2, days: [900, 1100, 1350],
    bidders: ['brightwater', 'halcyon'], effect: 'Firm clean power and storage that steadies every grid it touches.',
  }),
  geo: k({
    kind: 'geo', name: 'Enhanced geothermal field', icon: 'geothermal', cat: 'energy', where: 'mega', cphase: 1,
    blurb: 'Drill two miles down, fracture hot rock, circulate water, make steam. Repeat a thousand times.',
    sizes: [6, 18, 45], unit: 'GW', value: 4e9, yearly: 0.95, share: 0.2, days: [720, 900, 1100],
    bidders: ['halcyon', 'deepvein', 'brightwater'], effect: 'Firm clean power around the clock.',
  }),
  // ── grid ──
  hvdc: k({
    kind: 'hvdc', name: 'Intercontinental HVDC link', icon: 'hvdc', cat: 'grid', where: 'route', cphase: 2,
    blurb: 'A high-voltage direct-current line between continents, with converter stations at each end.',
    sizes: [20, 50, 100], unit: 'GW', value: 1.2e6, yearly: 0.98, share: 0.3, days: [800, 1000, 1200],
    bidders: ['spanwire', 'halcyon', 'tidewater'], effect: 'Megaprojects behind it deliver more; cheaper, cleaner power at both ends; access ↑.',
  }),
  // ── chips (The Chip Commons) ──
  fab: k({
    kind: 'fab', name: 'Logic fab line', icon: 'fab', cat: 'chips', where: 'region', cphase: 2,
    blurb: 'A leading-edge logic fab, co-funded so its output is shared fairly between members.',
    sizes: [1, 2, 4], unit: 'fabs', value: 25e9, yearly: 1.0, share: 0.3, days: [1000, 1100, 1250],
    bidders: ['lumen', 'kestrel'], effect: 'Everyone’s wafer supply grows (yours too); access ↑ in the host bloc.',
  }),
  hbm: k({
    kind: 'hbm', name: 'HBM line', icon: 'orders', cat: 'chips', where: 'region', cphase: 2,
    blurb: 'A high-bandwidth memory fab: the stacks every accelerator needs eight of.',
    sizes: [1, 2, 4], unit: 'lines', value: 12e9, yearly: 1.0, share: 0.3, days: [700, 800, 900],
    bidders: ['stackwell', 'hanbit'], effect: 'Memory shortages ease for good.',
  }),
  pkg: k({
    kind: 'pkg', name: 'Packaging line', icon: 'packaging', cat: 'chips', where: 'region', cphase: 2,
    blurb: 'Advanced packaging lines that bond logic to memory.',
    sizes: [1, 2, 4], unit: 'lines', value: 5e9, yearly: 1.0, share: 0.3, days: [450, 550, 650],
    bidders: ['bondline', 'you'], effect: 'The packaging bottleneck loosens for everyone.',
  }),
  euv: k({
    kind: 'euv', name: 'EUV tool line', icon: 'research', cat: 'chips', where: 'region', cphase: 2,
    blurb: 'A second Veldt assembly hall for EUV machines — the tools every leading-edge fab needs.',
    sizes: [1, 2, 3], unit: 'halls', value: 10e9, yearly: 1.0, share: 0.3, days: [700, 800, 900],
    bidders: ['veldt'], effect: 'Fab lines build 20% faster; EUV export licences matter less.',
  }),
  // ── access (Compute for Everyone) ──
  compute: k({
    kind: 'compute', name: 'Public compute campus', icon: 'datacenter', cat: 'access', where: 'region', cphase: 1,
    blurb: 'A Charter-owned campus whose capacity is shared by the bloc’s universities, startups and public services.',
    sizes: [200, 500, 1000], unit: 'MW', value: 12e6, yearly: 0.97, share: 0.6, days: [450, 600, 750],
    bidders: ['cumulus', 'stratum', 'meridian', 'lattice', 'orchard', 'you'], effect: 'Compute access ↑ in the bloc (+8 / +15 / +25).',
  }),
  cable: k({
    kind: 'cable', name: 'Open subsea cable', icon: 'cable', cat: 'access', where: 'region', cphase: 1,
    blurb: 'A new open-access cable system into an underserved coast.',
    sizes: [1, 2, 3], unit: 'cables', value: 1.5e9, yearly: 0.99, share: 0.6, days: [450, 550, 650],
    bidders: ['tidewater', 'cumulus', 'you'], effect: 'Compute access ↑ in the bloc (+5 / +9 / +12).',
  }),
  // ── safety (A Safe Frontier) ──
  evals: k({
    kind: 'evals', name: 'Frontier evals programme', icon: 'evals', cat: 'safety', where: 'global', cphase: 1,
    blurb: 'Independent red teams that test every frontier model before release, for every lab.',
    sizes: [1, 2, 3], unit: 'scale', value: 4e9, yearly: 1.03, share: 1, days: [300, 450, 600],
    bidders: ['lattice', 'meridian', 'orchard', 'you'], effect: 'World alignment ↑ (+0.08 / +0.15 / +0.25; less for each repeat).',
  }),
  interp: k({
    kind: 'interp', name: 'Interpretability consortium', icon: 'brain', cat: 'safety', where: 'global', cphase: 2,
    blurb: 'Every lab’s best people, reading the minds of every lab’s models.',
    sizes: [1, 2, 3], unit: 'scale', value: 5e9, yearly: 1.03, share: 1, days: [420, 560, 700],
    bidders: ['lattice', 'orchard', 'meridian', 'you'], effect: 'World alignment ↑ (+0.06 / +0.12 / +0.2) and it keeps growing faster.',
  }),
  // ── space (Kip) ──
  launch: k({
    kind: 'launch', name: 'Launch complex', icon: 'launch', cat: 'space', where: 'launch', cphase: 2, fixed: true,
    blurb: 'Pads, a tower, an assembly hall and a tank farm: the Charter’s own door to orbit.',
    sizes: [1, 1, 1], unit: '', value: 8e9, yearly: 0.97, share: 0.5, days: [720, 720, 720],
    bidders: ['parabola', 'karman'], effect: 'Opens the orbital compute test and the space-solar demo.',
  }),
  orbital: k({
    kind: 'orbital', name: 'Orbital compute test', icon: 'satellite', cat: 'space', where: 'global', cphase: 2, fixed: true,
    blurb: 'A small satellite of radiation-hardened accelerators with its own solar wings and radiators.',
    sizes: [1, 1, 1], unit: '', value: 3e9, yearly: 0.95, share: 0.6, days: [450, 450, 450],
    bidders: ['parabola', 'karman', 'you'], effect: 'Proves compute can run in orbit — Act IV’s first step.',
  }),
  spacesolar: k({
    kind: 'spacesolar', name: 'Space-solar demonstrator', icon: 'satellite', cat: 'space', where: 'global', cphase: 2, fixed: true,
    blurb: 'A sun-facing array in orbit that beams a few megawatts down to a ground station by microwave.',
    sizes: [1, 1, 1], unit: '', value: 5e9, yearly: 0.95, share: 0.6, days: [600, 600, 600],
    bidders: ['parabola', 'karman', 'halcyon'], effect: 'Power beamed from orbit, for the first time.',
  }),
  // ── fusion ──
  fusion: k({
    kind: 'fusion', name: 'Fusion pilot plant grant', icon: 'fusion', cat: 'fusion', where: 'global', cphase: 2, fixed: true,
    blurb: 'Fund Sunforge’s pilot plant to net electricity.',
    sizes: [1, 1, 1], unit: '', value: 10e9, yearly: 1.0, share: 1, days: [1200, 1200, 1200],
    bidders: ['sunforge'], effect: 'A chance at ignition before the act is out.',
  }),
  // ════════════════════ Act IV ════════════════════
  link: k({
    kind: 'link', name: 'Supergrid link', icon: 'hvdc', cat: 'grid', where: 'sgroute', cphase: 1, stage: 1,
    blurb: 'An intercontinental superconducting-cable link: one more stitch in a grid that follows the sun around the planet.',
    sizes: [30, 80, 200], unit: 'GW', value: 1.0e6, yearly: 0.98, share: 0.3, days: [900, 1100, 1300],
    bidders: ['spanwire', 'halcyon', 'tidewater'], effect: 'Joins two provinces into the supergrid: solar travels with the daylight, so less is wasted (K ↑), power is cheaper and wellbeing rises at both ends.',
  }),
  fpilot: k({
    kind: 'fpilot', name: 'Fusion pilot plant', icon: 'fusion', cat: 'fusion', where: 'design', cphase: 1, stage: 1, fixed: true,
    blurb: 'Fund a design’s pilot plant to net electricity. Some designs will work. Some won’t.',
    sizes: [1, 1, 1], unit: '', value: 1, yearly: 1.0, share: 1, days: [1000, 1000, 1000],
    bidders: [], effect: 'If it works, the design can be built as fleets. If it half-works, fleets cost more. If it fails, try again or back another.',
  }),
  ffleet: k({
    kind: 'ffleet', name: 'Fusion fleet', icon: 'fusion', cat: 'fusion', where: 'mega', cphase: 1, stage: 2,
    blurb: 'A row of identical fusion plants of a proven design, built like a factory product.',
    sizes: [20, 60, 150], unit: 'GW', value: 1, yearly: 1.0, share: 0.25, days: [900, 1100, 1300],
    bidders: ['halcyon', 'littlesun'], effect: 'Firm clean power that gets cheaper with every plant (K ↑). D-T designs need tritium, which fleets breed.',
  }),
  dac: k({
    kind: 'dac', name: 'Direct air capture farm', icon: 'co2', cat: 'planet', where: 'mega', cphase: 1, stage: 1,
    blurb: 'Banks of giant fans pulling CO₂ out of the air, powered by the megaproject next door, burying it as stone.',
    sizes: [1, 3, 8], unit: 'Gt CO₂/yr', value: 120e9, yearly: 0.95, share: 0.5, days: [700, 900, 1100],
    bidders: ['carbonfold', 'deepvein', 'saltflat', 'brightwater'], effect: 'Removes carbon every year: warming falls back.',
  }),
  desal: k({
    kind: 'desal', name: 'Water & cooling programme', icon: 'hydro', cat: 'planet', where: 'region', cphase: 1, stage: 1,
    blurb: 'Desalination plants on cheap power, aquifer recharge and cooling centres for the hot season.',
    sizes: [1, 2, 3], unit: 'programmes', value: 40e9, yearly: 1.0, share: 0.5, days: [500, 650, 800],
    bidders: ['brightwater', 'halcyon', 'tidewater'], effect: 'Water stress and heat fall in the province; wellbeing rises.',
  }),
  spaceport: k({
    kind: 'spaceport', name: 'Spaceport expansion', icon: 'launch', cat: 'space', where: 'launch', cphase: 1, stage: 3,
    blurb: 'More pads, a heavy-lift factory and a tank farm: a launch every few hours.',
    sizes: [2, 4, 8], unit: 'pads', value: 10e9, yearly: 0.96, share: 0.5, days: [600, 750, 900],
    bidders: ['parabola', 'karman'], effect: 'Launch cadence ↑: everything in orbit gets cheaper and faster to build.',
  }),
  odc: k({
    kind: 'odc', name: 'Orbital data centre', icon: 'satellite', cat: 'space', where: 'global', cphase: 1, stage: 3,
    blurb: 'Accelerators in permanent sunlight, cooled by radiators facing the dark: compute without heating the Earth.',
    sizes: [1, 3, 8], unit: 'GW IT', value: 25e9, yearly: 0.92, share: 0.4, days: [600, 800, 1000],
    bidders: ['parabola', 'karman', 'cumulus', 'stratum', 'you'], effect: 'Compute in orbit: access ↑ everywhere, less waste heat on Earth. Adds debris to low orbit.',
  }),
  sps: k({
    kind: 'sps', name: 'Space-solar station', icon: 'satellite', cat: 'space', where: 'region', cphase: 1, stage: 3,
    blurb: 'Kilometres of solar array in geostationary orbit, beaming power down to a rectenna field in the province.',
    sizes: [2, 6, 15], unit: 'GW', value: 12e9, yearly: 0.93, share: 0.4, days: [800, 1000, 1200],
    bidders: ['parabola', 'karman', 'halcyon'], effect: 'Clean power day and night, beamed from orbit (K ↑).',
  }),
  cleanup: k({
    kind: 'cleanup', name: 'Debris clean-up', icon: 'satellite', cat: 'space', where: 'global', cphase: 1, stage: 3,
    blurb: 'Tugs, nets and lasers that drag dead satellites and fragments down to burn up.',
    sizes: [1, 2, 3], unit: 'scale', value: 6e9, yearly: 1.0, share: 1, days: [300, 400, 500],
    bidders: ['karman', 'parabola'], effect: 'Debris in low orbit falls (−15 / −30 / −45).',
  }),
  moonbase: k({
    kind: 'moonbase', name: 'Moon outpost', icon: 'launch', cat: 'space', where: 'global', cphase: 1, stage: 3, fixed: true,
    blurb: 'Habitats, a landing pad and ice mining in a permanently shadowed crater at the south pole.',
    sizes: [1, 1, 1], unit: '', value: 60e9, yearly: 0.97, share: 0.6, days: [900, 900, 900],
    bidders: ['parabola', 'karman'], effect: 'Lunar water becomes propellant: space contracts −15%.',
  }),
  moonmine: k({
    kind: 'moonmine', name: 'Lunar mine', icon: 'orders', cat: 'space', where: 'global', cphase: 1, stage: 3, fixed: true,
    blurb: 'Regolith processing for metals and the rare helium-3 the solar wind left behind.',
    sizes: [1, 1, 1], unit: '', value: 90e9, yearly: 0.97, share: 0.6, days: [1000, 1000, 1000],
    bidders: ['deepvein', 'karman', 'parabola'], effect: 'Metals for orbit and helium-3 for aneutronic fusion (opens the D-He3 design).',
  }),
  massdriver: k({
    kind: 'massdriver', name: 'Mass driver', icon: 'launch', cat: 'space', where: 'global', cphase: 1, stage: 3, fixed: true,
    blurb: 'A magnetic rail across the lunar plain that throws cargo into orbit without a drop of fuel.',
    sizes: [1, 1, 1], unit: '', value: 120e9, yearly: 0.97, share: 0.6, days: [1200, 1200, 1200],
    bidders: ['karman', 'halcyon', 'parabola'], effect: 'Lunar metals by the megatonne: orbital construction −25%, much more helium-3.',
  }),
};

export const CONTRACT_ORDER: ContractKind[] = ['solar', 'wind', 'nuclear', 'hydro', 'geo', 'hvdc', 'fab', 'hbm', 'pkg', 'euv', 'compute', 'cable', 'evals', 'interp', 'launch', 'orbital', 'spacesolar', 'fusion'];
/** Act IV's kinds (posted from the Planet panel; awarded like any other contract). */
export const ACT4_KINDS: ContractKind[] = ['link', 'fpilot', 'ffleet', 'dac', 'desal', 'spaceport', 'odc', 'sps', 'cleanup', 'moonbase', 'moonmine', 'massdriver'];
/** Kinds whose projects deliver energy (`gw`), counted in the Charter's terawatts. */
export const ENERGY_KINDS: ContractKind[] = ['solar', 'wind', 'nuclear', 'hydro', 'geo', 'ffleet', 'sps'];
export const FIRM_KINDS: ContractKind[] = ['nuclear', 'hydro', 'geo'];

export const CAT_NAMES: Record<ContractCat, string> = {
  planet: 'Climate & provinces',
  energy: 'Energy', grid: 'Grid', chips: 'Chips', access: 'Access', safety: 'Safety', space: 'Space', fusion: 'Fusion',
};

export const SIZE_NAMES = ['', 'S', 'M', 'L'];

// ════════════════════════════════════════ HVDC ROUTES ════════════════════════════════════════
export interface HvdcRoute {
  id: string;
  name: string;
  from: RegionId;
  to: RegionId;
  /** Endpoints [lat, lon]. */
  a: [number, number];
  b: [number, number];
  km: number;
  subsea: boolean;
  /** The megaproject whose power it carries, if any. */
  mega?: string;
}

export const HVDC_ROUTES: HvdcRoute[] = [
  { id: 'hvdc-sahara', name: 'Sahara–Europe Link', from: 'mena', to: 'eur', a: [27.5, 8.5], b: [50.0, 8.3], km: 2600, subsea: true, mega: 'mega-sahara' },
  { id: 'hvdc-outback', name: 'Outback–Asia Link', from: 'seo', to: 'seo', a: [-26.5, 124.5], b: [1.6, 103.6], km: 4200, subsea: true, mega: 'mega-outback' },
  { id: 'hvdc-gobi', name: 'Gobi–Fab Belt Link', from: 'eam', to: 'fab', a: [43.0, 95.5], b: [37.5, 127.0], km: 3100, subsea: true, mega: 'mega-gobi' },
  { id: 'hvdc-northsea', name: 'North Sea Ring', from: 'nor', to: 'eur', a: [64.3, 13.8], b: [51.5, 6.5], km: 1700, subsea: true, mega: 'mega-northsea' },
  { id: 'hvdc-gulf', name: 'Gulf–Subcontinent Link', from: 'mena', to: 'sas', a: [24.4, 54.6], b: [19.1, 73.1], km: 2000, subsea: true, mega: 'mega-deccan' },
  { id: 'hvdc-plains', name: 'Plains–Pacific Link', from: 'atl', to: 'pac', a: [38.5, -99.5], b: [34.5, -117.5], km: 1700, subsea: false, mega: 'mega-plains' },
];
export const HVDC_BY_ID: Record<string, HvdcRoute> = Object.fromEntries(HVDC_ROUTES.map((r) => [r.id, r]));

// ════════════════════════════════════════ THE BLOCS ════════════════════════════════════════
/** Share of the world economy (dues are sized by it). */
export const ECON: Record<RegionId, number> = {
  atl: 0.22, pac: 0.07, eur: 0.16, nor: 0.02, fab: 0.09, eam: 0.17, stp: 0.03, mena: 0.05, lat: 0.05, ssa: 0.025, sas: 0.06, seo: 0.055,
};
/** Council votes. */
export const VOTES: Record<RegionId, number> = {
  atl: 12, eam: 11, eur: 10, sas: 8, pac: 7, fab: 7, lat: 6, seo: 6, mena: 6, ssa: 6, stp: 5, nor: 4,
};
export const TOTAL_VOTES = Object.values(VOTES).reduce((a, b) => a + b, 0);

export type Wealth = 'rich' | 'emerging' | 'developing';
export const WEALTH: Record<RegionId, Wealth> = {
  atl: 'rich', pac: 'rich', eur: 'rich', nor: 'rich', fab: 'rich', eam: 'emerging', stp: 'emerging', mena: 'emerging', lat: 'developing', ssa: 'developing', sas: 'developing', seo: 'developing',
};

export const FACTIONS: Record<FactionId, { name: string; members: RegionId[]; blurb: string; color: ColorKey }> = {
  atlantic: { name: 'Atlantic Alliance', members: ['atl', 'pac', 'eur', 'nor', 'fab'], blurb: 'The old industrial democracies and the Fab Belt: rich, cautious about who gets the frontier.', color: 'blu4' },
  eastern: { name: 'Eastern Compact', members: ['eam', 'stp'], blurb: 'Manufacturing scale and long supply lines. Wants the export controls gone.', color: 'red3' },
  nonaligned: { name: 'Non-aligned Group', members: ['lat', 'ssa', 'sas', 'seo', 'mena'], blurb: 'Most of humanity. Wants access, fair dues and projects at home.', color: 'grn6' },
};
export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

export function factionOf(r: RegionId): FactionId {
  for (const f of FACTION_IDS) if (FACTIONS[f].members.includes(r)) return f;
  return 'nonaligned';
}

/** Compute access at the start of Act III (0..100). */
export const ACCESS0: Record<RegionId, number> = {
  atl: 80, pac: 85, eur: 70, nor: 72, fab: 75, eam: 58, stp: 32, mena: 42, lat: 30, ssa: 12, sas: 28, seo: 38,
};

/** Where public compute campuses and Commons lines appear on the map, per bloc [lat, lon]. */
export const ANCHORS: Record<RegionId, [number, number]> = {
  pac: [40.5, -120.5], atl: [35.5, -90.0], lat: [-15.8, -47.9], eur: [48.0, 2.5], nor: [59.3, 18.1], stp: [55.7, 50.0],
  mena: [30.0, 31.2], ssa: [7.4, 3.9], sas: [28.6, 77.2], eam: [31.2, 121.4], fab: [37.5, 127.0], seo: [13.7, 100.5],
};

/** World energy in 2035: each bloc's share of ~22 TW and how clean it is. */
export const WORLD0: Record<RegionId, { share: number; clean: number }> = {
  eam: { share: 0.26, clean: 0.25 }, atl: { share: 0.17, clean: 0.22 }, eur: { share: 0.1, clean: 0.35 }, sas: { share: 0.08, clean: 0.15 },
  fab: { share: 0.06, clean: 0.25 }, pac: { share: 0.05, clean: 0.4 }, stp: { share: 0.06, clean: 0.15 }, mena: { share: 0.06, clean: 0.08 },
  lat: { share: 0.06, clean: 0.35 }, seo: { share: 0.05, clean: 0.15 }, ssa: { share: 0.04, clean: 0.25 }, nor: { share: 0.01, clean: 0.75 },
};

// ════════════════════════════════════════ NUMBERS ════════════════════════════════════════
export const CHARTER = {
  /** The founding endowment. */
  founding: 25e9,
  /** Standard monthly dues for the whole world in 2035, before willingness. */
  duesMonthly: 12e9,
  /** Dues grow with the world economy. */
  duesGrowth: 0.05,
  tenderDays: 21,
  sessionDays: 90,
  maxAgenda: 3,
  /** Share of a contract paid when it is awarded. */
  upfront: 0.2,
  /** Your company's profit margin on contracts it wins. */
  yourMargin: 0.2,
  /** Carbon budget for 2 °C left at the start of Act III (Gt CO₂). */
  carbon0: 500,
  /** Gt CO₂ per TW-year of fossil energy. */
  gtPerFossilTW: 2.4,
  baseGrowth: 0.016,
  maxGrowth: 0.05,
  thresholdDays: 120,
  whipCost: 6,
  whipSway: 0.25,
  favourSway: 0.35,
  /** K 0.75. */
  targetTW: 31.62,
};

/** 1 Jan 2044: The Threshold starts by then even if the Mandate isn't met. */
export const THRESHOLD_DEADLINE = Math.round((Date.UTC(2044, 0, 1) - Date.UTC(2027, 0, 1)) / 86_400_000);

export const CHARTER_PHASES = ['', 'The Founding', 'The Build-Out', 'The Frontier', 'The Threshold', 'Renewal', 'Epilogue'];

// ════════════════════════════════════════ MISSIONS ════════════════════════════════════════
export interface MissionDef {
  id: string;
  name: string;
  icon: IconName;
  advisor: AdvisorId;
  cphase: number;
  blurb: string;
  goals: { label: string; progress: (s: GameState) => [number, number] }[];
  reward: string;
}

const done = (s: GameState, kind: ContractKind) => (s.charter?.projects ?? []).filter((x) => x.kind === kind && x.status === 'done');
const doneUnits = (s: GameState, kind: ContractKind) => done(s, kind).reduce((a, x) => a + CONTRACT_KINDS[kind].sizes[x.size - 1], 0);
/** GW average online at a megaproject site. */
export function megaGW(s: GameState, siteId: string): number {
  return (s.charter?.projects ?? []).filter((x) => x.where === siteId && x.status === 'done').reduce((a, x) => a + (x.gw ?? 0), 0);
}
/** Stage thresholds (GW average online) for a megaproject site. */
export const MEGA_STAGES = [20, 80, 200];
export function megaStage(s: GameState, siteId: string): number {
  const gw = megaGW(s, siteId);
  return MEGA_STAGES.filter((t) => gw >= t).length;
}
export const charterCleanGW = (s: GameState) => (s.charter?.projects ?? []).filter((x) => x.status === 'done').reduce((a, x) => a + (x.gw ?? 0), 0);
const blocsWithLine = (s: GameState) => new Set((s.charter?.projects ?? []).filter((x) => x.status === 'done' && (x.kind === 'fab' || x.kind === 'hbm' || x.kind === 'pkg')).map((x) => x.region)).size;
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

export const MISSIONS: MissionDef[] = [
  {
    id: 'clean-power', name: 'Clean Power for All', icon: 'solar', advisor: 'juno', cphase: 1,
    blurb: 'Build the energy the world needs, clean, at a scale nobody has tried.',
    goals: [
      { label: 'Charter clean power online (GW average)', progress: (s) => [charterCleanGW(s), 600] },
      { label: 'Megaprojects at stage 2', progress: (s) => [siteIds(s).filter((id) => megaStage(s, id) >= 2).length, 3] },
    ],
    reward: 'World growth +0.5%/yr; new energy everywhere 15% cleaner; your grid power 15% cheaper and 30% cleaner.',
  },
  {
    id: 'compute-everyone', name: 'Compute for Everyone', icon: 'access', advisor: 'sol', cphase: 1,
    blurb: 'No bloc left behind: public compute and open cables until every bloc can reach the frontier.',
    goals: [{ label: 'Blocs with compute access ≥ 50', progress: (s) => [Object.values(s.charter?.access ?? {}).filter((v) => v >= 50).length, 12] }],
    reward: 'Demand for AI everywhere +25%; developing blocs’ relations +10; Legitimacy +5.',
  },
  {
    id: 'chip-commons', name: 'The Chip Commons', icon: 'fab', advisor: 'mira', cphase: 2,
    blurb: 'Fabs, memory and packaging spread across the blocs, so no single strait can stop the world.',
    goals: [
      { label: 'Logic fabs', progress: (s) => [doneUnits(s, 'fab'), 3] },
      { label: 'HBM lines', progress: (s) => [doneUnits(s, 'hbm'), 2] },
      { label: 'Packaging lines', progress: (s) => [doneUnits(s, 'pkg'), 2] },
      { label: 'Blocs hosting a Commons line', progress: (s) => [blocsWithLine(s), 3] },
    ],
    reward: 'Chip supply +30% for everyone; memory and packaging shortages ease; the Eastern Compact warms to you.',
  },
  {
    id: 'backbone', name: 'The Global Backbone', icon: 'hvdc', advisor: 'juno', cphase: 2,
    blurb: 'Tie the continents together so sun in one place can light cities in another.',
    goals: [{ label: 'HVDC links online', progress: (s) => [done(s, 'hvdc').length, 2] }],
    reward: 'Megaprojects deliver 15% more; world growth +0.3%/yr; grid emergencies hit softer.',
  },
  {
    id: 'offworld', name: 'First Steps Off-World', icon: 'launch', advisor: 'kip', cphase: 2,
    blurb: 'Kip’s dream, in three careful steps.',
    goals: [
      { label: 'Launch complex', progress: (s) => [done(s, 'launch').length, 1] },
      { label: 'Orbital compute test', progress: (s) => [done(s, 'orbital').length, 1] },
      { label: 'Space-solar demonstrator', progress: (s) => [done(s, 'spacesolar').length, 1] },
    ],
    reward: 'Orbit is open for Act IV; Legitimacy +5.',
  },
  {
    id: 'safe-frontier', name: 'A Safe Frontier', icon: 'shield', advisor: 'iris', cphase: 3,
    blurb: 'A safety regime that works for every lab, including yours.',
    goals: [
      { label: 'Frontier run licensing in force', progress: (s) => [passed(s, 'run-licensing') ? 1 : 0, 1] },
      { label: 'An evals programme completed', progress: (s) => [done(s, 'evals').length, 1] },
      { label: 'An interpretability consortium completed', progress: (s) => [done(s, 'interp').length, 1] },
      { label: 'Days with a positive world safety margin', progress: (s) => [Math.min(365, s.charter?.regime.marginDays ?? 0), 365] },
    ],
    reward: 'Incidents everywhere half as severe; world alignment +0.2; Bit’s co-pilot desk opens.',
  },
];
export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

/** Multiplicative mission rewards (read through techMult). */
export const MISSION_MODS: Record<string, Partial<Record<TechKey, number>>> = {
  'compute-everyone': { demand: 1.25 },
  'safe-frontier': { incidentSeverity: 0.5 },
};

function siteIds(s: GameState): string[] {
  return [...new Set((s.charter?.projects ?? []).filter((x) => CONTRACT_KINDS[x.kind].where === 'mega').map((x) => x.where))];
}

export function missionProgress(s: GameState, m: MissionDef): { goals: [number, number][]; done: boolean } {
  const goals = m.goals.map((g) => g.progress(s));
  return { goals, done: goals.every(([a, b]) => a >= b) };
}

/** Where a contract is: a readable name. */
export function whereName(where: string): string {
  if (where === 'global') return 'Worldwide';
  const route = HVDC_BY_ID[where] ?? SUPERGRID_BY_ID[where];
  if (route) return route.name;
  const design = FUSION_DESIGNS[where as FusionDesignId];
  if (design) return `${design.name} pilot`;
  return SITE_BY_ID[where]?.name ?? REGIONS[where as RegionId]?.name ?? where;
}
