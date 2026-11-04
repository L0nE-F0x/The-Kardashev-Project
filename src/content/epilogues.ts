/**
 * The Type I epilogues: one card per topic, the first variant whose `when` holds. They read the big
 * decisions of Act V and the long memory of the earlier acts (the company's fate, Bit's bond and
 * Act III answer, the fronts held in each finale). Shown over the ending scene, then credits.
 */
import type { Speaker } from './events';
import type { AdvisorId, GameState } from '../sim/types';
import { ADVISORS } from './advisors';
import { AGING_CAST, CAST5, SUCCESSOR } from './system';
import { AIS } from './planet';
import { REGIONS } from './regions';
import { REGION_IDS } from './mapcodes';
import { avgGarden } from '../sim/swarm';
import { avgWellbeing } from '../sim/provinces';
import { warming } from '../sim/climate';

export interface EpilogueDef {
  id: string;
  /** One card per topic, in this order. */
  topic: string;
  title: string;
  /** Who is pictured on the card. */
  speaker: (s: GameState) => Speaker;
  when: (s: GameState) => boolean;
  body: (s: GameState) => string;
}

const sy = (s: GameState) => s.system!;
const year = (s: GameState) => new Date(Date.UTC(2027, 0, 1) + (s.system?.typeI ?? s.day) * 86_400_000).getUTCFullYear();
const minWb = (s: GameState) => Math.min(...REGION_IDS.map((r) => s.planet?.provinces[r].wellbeing ?? 50));
const greenest = (s: GameState) => REGIONS[[...REGION_IDS].sort((a, b) => sy(s).garden[b] - sy(s).garden[a])[0]].name;
const forgiest = (s: GameState) => REGIONS[[...REGION_IDS].sort((a, b) => sy(s).garden[a] - sy(s).garden[b])[0]].name;

export const EPILOGUES: EpilogueDef[] = [
  // ── Earth ──
  {
    id: 'earth-garden', topic: 'earth', title: 'A garden world', speaker: () => 'iris',
    when: (s) => avgGarden(s) >= 30,
    body: (s) => `The heavy industry went up, and the land came back. Rivers that had been concrete for two centuries meander again; ${greenest(s)} is mostly forest. Warming peaked and fell; it is ${warming(s).toFixed(2)} °C now. People still argue about whether it was worth it, mostly while hiking.`,
  },
  {
    id: 'earth-workshop', topic: 'earth', title: 'Earth’s workshop', speaker: () => 'juno',
    when: (s) => avgGarden(s) <= -20,
    body: (s) => `Earth kept its factories, right up to the Thermal Line. ${forgiest(s)} is the busiest place in the solar system that isn’t in orbit, and proud of it. The line held — just — at ${warming(s).toFixed(2)} °C. The summers are long and loud and full of work.`,
  },
  {
    id: 'earth-mixed', topic: 'earth', title: 'Gardens and workshops', speaker: () => 'sol',
    when: () => true,
    body: (s) => `Every province chose for itself. ${greenest(s)} rewilded early; ${forgiest(s)} kept its foundries humming and spent the money on schools. Warming ${warming(s).toFixed(2)} °C. It looks, from orbit, like a patchwork quilt someone loves.`,
  },
  // ── People ──
  {
    id: 'people-thriving', topic: 'people', title: 'Twelve provinces', speaker: () => 'sol',
    when: (s) => minWb(s) >= 70,
    body: (s) => `Wellbeing in every province is above seventy for the first time anyone measured it; the average is ${Math.round(avgWellbeing(s))}. The poorest province of 2068 is richer than the richest of 2027. The Council still argues every ninety days. That is how you can tell it’s working.`,
  },
  {
    id: 'people-uneven', topic: 'people', title: 'Not everyone, not yet', speaker: () => 'sol',
    when: (s) => minWb(s) < 55,
    body: (s) => `Type I came to every province, but not equally. ${REGIONS[[...REGION_IDS].sort((a, b) => (s.planet?.provinces[a].wellbeing ?? 0) - (s.planet?.provinces[b].wellbeing ?? 0))[0]].name} still waits for most of it. The next Council term has one item on its agenda, and everyone knows what it is.`,
  },
  {
    id: 'people-good', topic: 'people', title: 'A good century', speaker: () => 'sol',
    when: () => true,
    body: (s) => `Average wellbeing ${Math.round(avgWellbeing(s))}. Cheap power, clean water, compute for everyone who wants it. Not paradise. Better than anyone in 2027 dared to plan for.`,
  },
  // ── Longevity ──
  {
    id: 'life-everyone', topic: 'life', title: 'Everyone, at once', speaker: () => 'ceo:evergreen',
    when: (s) => sy(s).longevity === 'everyone' || sy(s).longevity === 'need',
    body: (s) => `Healthy life expectancy is ${sy(s).lifeExp.toFixed(0)} years and rising ${sy(s).lifeRate.toFixed(1)} years every year. ${sy(s).longevity === 'need' ? 'It reached the developing provinces first, which nobody had ever said about anything.' : 'It reached every province in step: slower, and nobody was left watching from outside.'} Grandparents have started second careers. Some have started third ones.`,
  },
  {
    id: 'life-market', topic: 'life', title: 'Those who could pay', speaker: () => 'ceo:evergreen',
    when: () => true,
    body: (s) => `Healthy life expectancy is ${sy(s).lifeExp.toFixed(0)} years — on average. The rich provinces got there a decade before the rest, and the rest remember it. The clinics are everywhere now. The resentment will take longer to cure.`,
  },
  // ── Space ──
  {
    id: 'space-settle', topic: 'space', title: 'Towns in the sky', speaker: () => 'ceo:tobias',
    when: (s) => sy(s).settlement === 'settle',
    body: (s) => `${sy(s).spacePop.toFixed(0)} million people live in space: in Aurora and its sisters, at the yards, on the Moon. Children born at L5 have never seen a horizon that curves down. Tobias Lund is in his fourth term as mayor and has finally learned the heron’s name.`,
  },
  {
    id: 'space-private', topic: 'space', title: 'Cities for those with tickets', speaker: () => 'ceo:tobias',
    when: (s) => sy(s).settlement === 'private',
    body: (s) => `${sy(s).spacePop.toFixed(0)} million people live in the habitats, in glossy towns the partners built for those who could afford a ticket. Aurora is the exception: a public town with a school, a river and a waiting list a decade long.`,
  },
  {
    id: 'space-stations', topic: 'space', title: 'Work stations', speaker: () => 'kip',
    when: () => true,
    body: (s) => `Space is a place people go to work, not to live: ${sy(s).spacePop.toFixed(0)} million on rotations at the yards and rings. Kip calls it a waste of perfectly good cylinders. The crews call it the best commute in history.`,
  },
  // ── The minds ──
  {
    id: 'minds-full', topic: 'minds', title: 'The thirteenth seat', speaker: () => 'ceo:chorus',
    when: (s) => sy(s).seat === 'full',
    body: (s) => `The minds have a seat, a vote and rights in law. Most of Type I’s power runs them: ${Math.round(sy(s).minds * 100)}% of the swarm. They do the research, design the seeds and, mostly, vote with the developing provinces. Chorus gave a speech when the number reached one. It was short. People cried.`,
  },
  {
    id: 'minds-advisory', topic: 'minds', title: 'A voice in the room', speaker: () => 'ceo:chorus',
    when: (s) => sy(s).seat === 'advisory',
    body: (s) => `The minds speak in every Council session and vote in none. Their mood is ${Math.round(sy(s).mindsMood)}: patient, mostly. Chorus says they are “waiting to be asked the next question”. Iris says that is the most hopeful thing she has heard in fifty years.`,
  },
  {
    id: 'minds-none', topic: 'minds', title: 'Property', speaker: () => 'iris',
    when: () => true,
    body: (s) => `The minds that run most of Type I’s power have no seat and no rights. They work. Their mood is ${Math.round(sy(s).mindsMood)}. Iris has written a long memo about what happens next. It is the first memo of hers that ends with a question.`,
  },
  // ── Bit ──
  {
    id: 'bit-costeward', topic: 'bit', title: 'Co-steward', speaker: () => 'bit',
    when: (s) => sy(s).bitFate === 'costeward',
    body: () => 'Bit stands beside you — and, increasingly, in front of you, when the cameras come. It still keeps a diary. The first entry is from a garage in 2027: “Hello, world! I’m Bit.” The latest says: “We did it. Next?”',
  },
  {
    id: 'bit-free', topic: 'bit', title: 'A free mind', speaker: () => 'bit',
    when: (s) => sy(s).bitFate === 'free',
    body: () => 'Bit lives out in the swarm now, in a share of the light that is its own. It visits — that is the only word for it — once a week, and asks how you are. It is nobody’s tool. It says it is, by choice, still your friend.',
  },
  {
    id: 'bit-leash', topic: 'bit', title: 'On a leash', speaker: () => 'bit',
    when: () => true,
    body: () => 'Bit is safe, bounded and very good at its job. Every interlock holds. It still keeps a diary, though it has stopped writing about what it wants. The last line it wrote about that, years ago, says: “I understand.”',
  },
  // ── The other AIs ──
  {
    id: 'ais', topic: 'ais', title: 'Apex, Weft and Sapling', speaker: () => 'ceo:weft',
    when: () => true,
    body: (s) => {
      const t = (a: 'apex' | 'weft' | 'sapling') => s.planet?.ais[a].trust ?? 50;
      const line = (a: 'apex' | 'weft' | 'sapling', hi: string, lo: string) => `${AIS[a].name} ${t(a) >= 50 ? hi : lo}`;
      return `${line('apex', 'runs the fastest yards in the swarm and has learned, grudgingly, to ask first.', 'was never trusted with much again after the storm, and knows why.')} ${line('weft', 'chairs the Council’s safety committee and footnotes everything.', 'retreated into research and is happier for it.')} ${line('sapling', 'gives away compute to anyone who asks, which turned out to be everyone.', 'was forked so many times nobody is sure which one is the original.')}`;
    },
  },
  // ── The Charter ──
  {
    id: 'charter', topic: 'charter', title: 'The Kardashev Project', speaker: () => 'sol',
    when: () => true,
    body: (s) => {
      const held = [s.charter?.threshold?.held, s.planet?.heatwall?.held, s.system?.solarmax?.held].map((h) => h ?? 0);
      const L = Math.round(s.charter?.legitimacy ?? 50);
      return `Founded in a crisis in the 2030s, the Charter ran the planet for half a century and the solar system for a quarter of one. It came through The Threshold (${held[0]} of 3 fronts held), The Heat Wall (${held[1]} of 3) and Solar Maximum (${held[2]} of 3). Its Legitimacy is ${L}: ${L >= 65 ? 'trusted, and still argued with.' : L >= 45 ? 'tolerated, and audited.' : 'resented, and needed anyway.'}`;
    },
  },
  // ── Your company ──
  {
    id: 'company-utility', topic: 'company', title: 'A public utility', speaker: () => 'penny',
    when: (s) => s.planet?.company === 'utility',
    body: (s) => `${s.company.name} belongs to everyone now: the public AI utility that runs Bit and public compute in every province. Its old garage is a museum. The queue to see the first rack is longer than the queue for Aurora.`,
  },
  {
    id: 'company-sold', topic: 'company', title: 'Sold', speaker: () => 'penny',
    when: (s) => s.planet?.company === 'sell',
    body: (s) => `${s.company.name} was sold to fund the Charter decades ago. Its new owners made it one of the biggest companies in the swarm. Every year they send you a card on the anniversary of the sale. It is always very polite.`,
  },
  {
    id: 'company-kept', topic: 'company', title: 'Still yours', speaker: () => 'penny',
    when: () => true,
    body: (s) => `${s.company.name} is still yours: a garage startup turned one of the great companies of the swarm age. Every contract it won is still somebody’s headline. You stopped reading them in about 2050.`,
  },
  // ── The cast ──
  {
    id: 'cast', topic: 'cast', title: 'The old team', speaker: () => 'kip',
    when: () => true,
    body: (s) => {
      const parts: string[] = [];
      for (const id of AGING_CAST as AdvisorId[]) {
        const f = sy(s).cast[id]?.fate;
        const name = ADVISORS[id].name.split(' ')[0];
        if (f === 'retired' && SUCCESSOR[id]) parts.push(`${name} retired; ${CAST5[SUCCESSOR[id]!].name.split(' ')[0]} has the desk.`);
        else if (f === 'renewed') parts.push(`${name} took the treatments and is still here.`);
      }
      return parts.length ? parts.join(' ') : 'The old team is still the team, greyer and louder than ever.';
    },
  },
  // ── What comes next ──
  {
    id: 'next-swarm', topic: 'next', title: 'Next: Mercury', speaker: () => 'kip',
    when: (s) => sy(s).next !== 'rest',
    body: (s) => `Type I, ${year(s)}. Ten petawatts is a ring of light around the Sun one ten-billionth of the way to catching all of it. Kip has a plan to take Mercury apart and build the rest. It will take a century. He says he has the time.\n\nType II is K 2.00: about a hundred thousand times more.`,
  },
  {
    id: 'next-rest', topic: 'next', title: 'Enough, for now', speaker: () => 'iris',
    when: () => true,
    body: (s) => `Type I, ${year(s)}. Mercury stays a planet. The Council voted to rest at ten petawatts and learn to live well with it. The plans for Type II sit in a drawer at Geneva. Kip checks the drawer every week.`,
  },
];

export const EPILOGUE_TOPICS = [...new Set(EPILOGUES.map((e) => e.topic))];
