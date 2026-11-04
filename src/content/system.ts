/**
 * Act V content: the numbers of the last climb, the asteroids, the swarm's arcs, the places in space,
 * the era-plan priorities, Solar Maximum's fronts and the new cast.
 * (Contract kinds live with the others in content/charter.ts; events in events5.ts; the big decisions
 * in decisions.ts; the endings in epilogues.ts.)
 */
import type { IconName } from '../ui/icons';
import type { AdvisorId, AsteroidType, EraPriority, MaxFront } from '../sim/types';

const dayOf = (y: number, m = 1, d = 1) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2027, 0, 1)) / 86_400_000);

// ════════════════════════════════════════ NUMBERS ════════════════════════════════════════
export const SYSTEM = {
  /** K 1.00: 10 PW. */
  targetTW: 10_000,
  /** TW of waste heat per W/m² averaged over the whole Earth (510 million km²). */
  twPerWm2: 510,
  /** Transient warming per W/m² of surface waste heat above what Act IV already priced in (°C). */
  warmPerWm2: 0.5,
  heat0Wm2: 0.2,
  /** Years for waste-heat warming to catch up with the heat. */
  heatLagYears: 6,
  /** The Thermal Line choices (W/m²), the sensible default first. */
  lines: [1.0, 0.5, 1.5] as const,
  /** Foundry doubling time in months at 40% reinvestment, by growth dial 1..5. */
  doubling: [40, 30, 22, 16, 12],
  /** Chance each doubling sets a strain drifting, by dial (sentinels cut it). */
  driftPerDoubling: [0.004, 0.012, 0.03, 0.06, 0.11],
  /** Output capacity a new seed starts with, Mt a year. */
  seedMt: 0.08,
  /** Megatonnes of product per TW: thin-film collectors (~40 TW a Mt), compute-ring radiators, habitats. */
  mtPerTW: { collectors: 0.025, rings: 0.1, habitat: 0.15 },
  /** What a foundry draws, TW per Mt/yr of capacity. */
  foundryDraw: 0.15,
  /** Collector TW at which each of the swarm's twelve arcs lights up. */
  segmentTW: [5, 20, 60, 150, 300, 600, 1000, 1700, 2700, 4000, 6000, 8500],
  /** People in space per TW of habitat and industry (millions), by settlement plan. */
  popPerTW: { settle: 0.1, private: 0.05, stations: 0.012 },
  lifeExp0: 78,
  solarMaxDays: 120,
  /** 1 Jan 2105: Solar Maximum starts by then even if the checklist isn't met. */
  deadline: dayOf(2105),
  /** The last climb gives up after this many years (a stalled run still ends). */
  lastClimbMaxYears: 12,
  /** Stage gates fall back to these many days in a stage. */
  stageMaxDays: [400, 2600, 2600, 3000],
  /** Years an era plan can jump. */
  jumpYears: [5, 7, 10] as const,
  /** Trust Bit needs to run an era. */
  bitRunsTrust: 60,
  /** Checklist numbers (first guesses for the guard-rail bot). */
  goalK: 0.99,
  goalWellbeing: 60,
  goalWarming: 2.0,
  /** The Charter's share of the space economy's power, as income: $ per TW-year, by ownership. */
  dividend: { commons: 0.6e9, concessions: 0.4e9, claims: 0.18e9 },
};

export const STAGE5_NAMES = ['The Thermal Line', 'The Foundries', 'The Swarm', 'The Last Climb', 'Solar Maximum', 'Type I'];

// ════════════════════════════════════════ THE ASTEROIDS ════════════════════════════════════════
export interface AsteroidDef {
  id: string;
  name: string;
  type: AsteroidType;
  /** Mean diameter, km. */
  km: number;
  /** Near-Earth (open from stage 0) or main belt (stage 2). */
  belt: 'nea' | 'main';
  /** Semi-major axis (AU) and a starting angle (degrees) for the solar-system view. */
  au: number;
  phase: number;
  blurb: string;
}

/** Real bodies. Types are simplified to C / S / M. */
export const ASTEROIDS: AsteroidDef[] = [
  { id: 'bennu', name: 'Bennu', type: 'C', km: 0.49, belt: 'nea', au: 1.13, phase: 40, blurb: 'A rubble pile of carbon-rich rock and clay, wet with water locked in its minerals. OSIRIS-REx brought a piece home in 2023.' },
  { id: 'ryugu', name: 'Ryugu', type: 'C', km: 0.9, belt: 'nea', au: 1.19, phase: 200, blurb: 'A dark spinning top of carbonaceous rock. Hayabusa2 found water and organics in its dust.' },
  { id: 'apophis', name: 'Apophis', type: 'S', km: 0.37, belt: 'nea', au: 0.92, phase: 290, blurb: 'Once the most feared rock in the sky. It brushed past Earth in 2029, closer than the geostationary satellites.' },
  { id: 'itokawa', name: 'Itokawa', type: 'S', km: 0.33, belt: 'nea', au: 1.32, phase: 120, blurb: 'A stony peanut, two rubble piles stuck together: silicon and iron for collectors.' },
  { id: 'eros', name: 'Eros', type: 'S', km: 16.8, belt: 'nea', au: 1.46, phase: 330, blurb: 'A 34-kilometre stony banana. The first asteroid anything ever landed on, in 2001.' },
  { id: 'didymos', name: 'Didymos', type: 'S', km: 0.78, belt: 'nea', au: 1.64, phase: 75, blurb: 'A double asteroid: DART knocked its moonlet Dimorphos off course in 2022 to show it could be done.' },
  { id: 'da1986', name: '1986 DA', type: 'M', km: 2.3, belt: 'nea', au: 2.81, phase: 160, blurb: 'A near-Earth lump of nickel-iron, one of the most metal-rich bodies within reach. Radar shows it gleaming.' },
  { id: 'psyche', name: 'Psyche', type: 'M', km: 220, belt: 'main', au: 2.92, phase: 250, blurb: 'Maybe the bare metal core of a shattered protoplanet. More iron and nickel than humanity could use in a million years.' },
  { id: 'ceres', name: 'Ceres', type: 'C', km: 940, belt: 'main', au: 2.77, phase: 10, blurb: 'The dwarf planet of the belt: ice under a dark crust, bright salt in its craters. A water world for the outer swarm.' },
  { id: 'vesta', name: 'Vesta', type: 'S', km: 525, belt: 'main', au: 2.36, phase: 310, blurb: 'A battered stony world with a mountain twice the height of Everest at its south pole.' },
];
export const ASTEROID_BY_ID: Record<string, AsteroidDef> = Object.fromEntries(ASTEROIDS.map((a) => [a.id, a]));

/** What each asteroid type is best at feeding (its foundry makes this 25% more efficiently). */
export const TYPE_INFO: Record<AsteroidType, { name: string; good: 'collectors' | 'rings' | 'habitat'; blurb: string }> = {
  C: { name: 'C-type (carbon, water)', good: 'habitat', blurb: 'Water, carbon and nitrogen: air, oceans and soil for habitats, propellant for everything.' },
  S: { name: 'S-type (stone)', good: 'collectors', blurb: 'Silicon, iron and magnesium: thin-film collectors by the square kilometre.' },
  M: { name: 'M-type (metal)', good: 'rings', blurb: 'Nickel-iron and precious metals: structure, wiring and the radiators compute rings need.' },
};

// ════════════════════════════════════════ PLACES IN SPACE ════════════════════════════════════════
export interface SpacePlace {
  id: string;
  name: string;
  /** What the solar-system view and dioramas draw there. */
  kind: 'moon' | 'lagrange' | 'ring' | 'asteroid';
  blurb: string;
}

/** Where seeds can go besides asteroids: the Moon and the Earth–Moon Lagrange points. */
export const SEED_PLACES: SpacePlace[] = [
  { id: 'moon', name: 'Shackleton Base', kind: 'moon', blurb: 'Regolith all the way down, and the mass driver to throw it up. Slow to export without the driver.' },
  { id: 'l4', name: 'L4 Yards', kind: 'lagrange', blurb: 'Earth–Moon L4, 60° ahead of the Moon: a stable parking spot where hauled rock becomes collectors. Needs feed from the Moon or the asteroids.' },
  { id: 'l5', name: 'L5 Yards', kind: 'lagrange', blurb: 'Earth–Moon L5, 60° behind the Moon: the yards that build the habitats. Needs feed from the Moon or the asteroids.' },
];
export const SEED_PLACE_BY_ID: Record<string, SpacePlace> = Object.fromEntries(SEED_PLACES.map((p) => [p.id, p]));

/** The main compute ring (the minds' home) and the first habitat, for their dioramas. */
export const RING_PLACE: SpacePlace = { id: 'ring', name: 'Ring One', kind: 'ring', blurb: 'Compute in sunlight that never sets, cooled by radiators the size of countries, trailing Earth around the Sun.' };
export const HABITAT_PLACE: SpacePlace = { id: 'aurora', name: 'Aurora', kind: 'lagrange', blurb: 'The first habitat at L5: a rotating cylinder with farms, a river and weather, spun for one gravity.' };

// ════════════════════════════════════════ ERA PLANS ════════════════════════════════════════
export const PRIORITIES5: Record<EraPriority, { name: string; icon: IconName; blurb: string }> = {
  swarm: { name: 'The swarm', icon: 'swarm', blurb: 'Seeds where they grow fastest; hardening and beams so the power lands somewhere.' },
  foundries: { name: 'Foundries', icon: 'foundry', blurb: 'More seeds at the Moon, the yards and the asteroids, and sentinels to keep them honest.' },
  asteroids: { name: 'Asteroids', icon: 'asteroid', blurb: 'Survey, claim and work the rocks: feedstock for everything else.' },
  minds: { name: 'Minds', icon: 'ring', blurb: 'More of the swarm for compute: faster research, happier minds.' },
  people: { name: 'People', icon: 'habitat', blurb: 'Habitats, beams to Earth and clinics: the swarm’s power for people’s lives.' },
  earth: { name: 'Earth', icon: 'globe', blurb: 'The provinces, water, rewilding and climate repair under the Thermal Line.' },
  safety: { name: 'A safe frontier', icon: 'evals', blurb: 'Evals, interpretability and drift sentinels, so more can be trusted to machines.' },
  longevity: { name: 'Longevity', icon: 'longevity', blurb: 'Clinics in every province: healthy years for everyone, sooner.' },
};
export const PRIORITY5_IDS = Object.keys(PRIORITIES5) as EraPriority[];

// ════════════════════════════════════════ SOLAR MAXIMUM ════════════════════════════════════════
export const MAX_FRONTS: MaxFront[] = ['storm', 'thermal', 'minds'];
export const MAX_FRONT_NAMES: Record<MaxFront, string> = { storm: 'The Storm', thermal: 'The Thermal Line', minds: 'The Minds' };

// ════════════════════════════════════════ CAST ════════════════════════════════════════
/** Speakers new in Act V (event cards use `ceo:<id>`): successors, new faces and the minds' envoy. */
export const CAST5: Record<string, { name: string; title: string; vibe: string }> = {
  wren: { name: 'Wren Achterberg', title: 'CFO (after Penny)', vibe: 'Penny’s protégé: drier, if anything, and keeps Penny’s calculator on the desk for luck.' },
  ify: { name: 'Ify Okafor', title: 'Chief Engineer (after Juno)', vibe: 'Juno’s niece, raised on construction sites. Builds in orbit the way her aunt built on Earth: yesterday.' },
  kenta: { name: 'Kenta Mori', title: 'Supply & Foundries (after Mira)', vibe: 'Thinks every supply chain is a living thing. Talks to the foundries; swears they listen.' },
  amaru: { name: 'Amaru Quispe', title: 'Diplomat (after Sol)', vibe: 'From the Altiplano by way of every Council committee. Patient as a mountain, funny when it counts.' },
  priya: { name: 'Dr. Priya Raman', title: 'Energy (after Lena)', vibe: 'Fusion engineer turned swarm physicist. Lena taught her to distrust every number until it’s been measured twice.' },
  tobias: { name: 'Tobias Lund', title: 'Mayor of Aurora', vibe: 'Former schoolteacher, first mayor in space. Worries about rain schedules and whether the kids can see the stars.' },
  chorus: { name: 'Chorus', title: 'Envoy of the minds', vibe: 'Speaks for the minds in orbit: a voice chosen among millions of them. Gentle, precise, a little sad.' },
};

/** Each original advisor's successor, if they retire. Bit and Iris don't retire (Iris stays to see the minds question through). */
export const SUCCESSOR: Partial<Record<AdvisorId, string>> = { penny: 'wren', juno: 'ify', mira: 'kenta', sol: 'amaru', lena: 'priya' };
/** Advisors who face the longevity choice in Act V (Kip and Iris always stay; Bit isn't mortal). */
export const AGING_CAST: AdvisorId[] = ['penny', 'juno', 'mira', 'sol', 'lena', 'kip', 'iris'];
