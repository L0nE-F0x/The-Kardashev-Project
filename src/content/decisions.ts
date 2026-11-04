/**
 * Act V's big decisions: the civilisation-scale choices between eras, shown as full-screen cards.
 * They are ordinary EventDefs with `big: true`, so the autopilot takes the first enabled choice (the
 * sensible default goes first) when an era runs on its own. Each one sets a field in `s.system` that
 * the systems, the planner and the epilogues read.
 */
import type { EventDef, Speaker } from './events';
import type { AdvisorId, GameState } from '../sim/types';
import { SYSTEM } from './system';
import { WEALTH } from './charter';
import { REGION_IDS } from './mapcodes';
import { clamp, fmtTW } from '../sim/core';
import { addModifier } from '../sim/effects';
import { addRelation, addRelationAll } from '../sim/politics';
import { addLegitimacy, addPartnerRel } from '../sim/charter';
import { deskHolder } from '../sim/systemView';
import { surfaceTW } from '../sim/swarm';

const desk = (s: GameState, id: AdvisorId) => deskHolder(s, id) as Speaker;
const bond = (s: GameState, d: number) => s.planet && (s.planet.bitBond = clamp(s.planet.bitBond + d, -100, 100));
const answer = (s: GameState) => String(s.flags.bitAnswer ?? 'everyone') as 'company' | 'everyone' | 'self';
const devRel = (s: GameState, d: number) => REGION_IDS.forEach((r) => WEALTH[r] !== 'rich' && addRelation(s, r, d));
const richRel = (s: GameState, d: number) => REGION_IDS.forEach((r) => WEALTH[r] === 'rich' && addRelation(s, r, d));
const space = ['vonn', 'lodestar', 'karman', 'parabola'];

export const DECISIONS: EventDef[] = [
  // ═══════════════════════════════════════ STAGE 0 ═══════════════════════════════════════
  {
    id: 'v-thermal-line',
    category: 'climate',
    icon: '🌡',
    big: true,
    title: () => 'The Thermal Line',
    body: (s) => `Every watt civilisation uses ends up as heat. Spread over the whole Earth, one watt per square metre of waste heat is about ${SYSTEM.twPerWm2} terawatts — and it warms the planet like carbon does, about half a degree for every watt.\n\nEarth uses ${fmtTW(surfaceTW(s))} today. Type I is ten thousand. The Council must draw a line: how much heat may the surface shed? Everything above it has to be collected and used in space.`,
    advisors: (s) => [
      { id: 'iris', text: 'Draw it low. A line we keep is worth more than a line we brag about.', mood: 'neutral' },
      { id: desk(s, 'juno'), text: 'Draw it high and Earth keeps its factories while the swarm catches up.', mood: 'excited' },
    ],
    choices: (s) => [
      { label: '1.0 W/m² · about 510 TW', detail: 'The middle road: room for Earth’s own growth, about +0.4 °C of waste-heat warming at the line.', apply: () => { s.system!.thermalLine = 1.0; } },
      { label: '0.5 W/m² · about 255 TW', detail: 'A garden line: little waste-heat warming, but Earth stops growing early. Legitimacy +4; rich provinces −3, the rest +2.', apply: () => { s.system!.thermalLine = 0.5; addLegitimacy(s, 4); richRel(s, -3); devRel(s, 2); for (const r of REGION_IDS) s.system!.garden[r] = clamp(s.system!.garden[r] + 8, -100, 100); } },
      { label: '1.5 W/m² · about 765 TW', detail: 'A workshop line: lots of room on Earth, up to +0.65 °C more warming. Legitimacy −3; developing provinces +3.', apply: () => { s.system!.thermalLine = 1.5; addLegitimacy(s, -3); devRel(s, 3); } },
    ],
  },
  {
    id: 'v-ownership',
    category: 'politics',
    icon: '🚩',
    big: true,
    title: () => 'Who owns the sky?',
    body: () => 'The first seed foundries will copy themselves out of moon rock and asteroids. Within a decade they will make more than every factory on Earth put together. Somebody owns what they make.\n\nThe Outer Space Treaty of 1967 says no nation may claim a celestial body. It says nothing about the things built from one.',
    advisors: (s) => [
      { id: desk(s, 'sol'), text: 'Hold it in common and everyone trusts it. Hand it out and everyone builds it. Pick which problem you’d rather have.', mood: 'neutral' },
      { id: 'ceo:lodestar', text: 'Give us claims and we’ll have rocks moving before the Council finishes its minutes.', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'The Commons', detail: 'The Charter owns everything the foundries make: the biggest dividend, fair, a little slower (growth ×0.92). Legitimacy +3; space partners −4.', apply: () => { s.system!.ownership = 'commons'; addLegitimacy(s, 3); space.forEach((p) => addPartnerRel(s, p, -4)); } },
      { label: 'Concessions', detail: 'The Charter claims and licenses partners to work the rocks: a middle dividend, partners plant seeds of their own. Space partners +3.', apply: () => { s.system!.ownership = 'concessions'; space.forEach((p) => addPartnerRel(s, p, 3)); } },
      { label: 'Claims', detail: 'Blocs and partners stake their own rocks: fastest growth (×1.12), the smallest dividend, quarrels and more drift. Space partners +8; Legitimacy −4.', apply: () => { s.system!.ownership = 'claims'; space.forEach((p) => addPartnerRel(s, p, 8)); addLegitimacy(s, -4); addRelationAll(s, 2); } },
    ],
  },

  // ═══════════════════════════════════════ STAGE 1 → 2 ═══════════════════════════════════════
  {
    id: 'v-earth',
    category: 'climate',
    icon: '🌳',
    big: true,
    title: () => 'What is Earth for?',
    body: () => 'The foundries can build anything Earth’s factories can, without the smoke and without the heat. The question is no longer whether heavy industry leaves Earth, but how much of it — and what the land becomes when it does.',
    advisors: (s) => [
      { id: 'bit', text: 'I ran the numbers on a garden Earth. Then I ran them again because I liked them.', mood: 'happy' },
      { id: desk(s, 'sol'), text: 'Some provinces want forests. Some want the jobs. Asking them is slower, and it’s the only answer that holds.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'A garden world', detail: 'Industry moves up; provinces rewild toward green (+55). Wellbeing rises, Earth’s own growth slows. Legitimacy +3.', apply: () => { s.system!.earth = 'garden'; addLegitimacy(s, 3); } },
      { label: 'Each province chooses', detail: 'Rich provinces turn to gardens, developing ones keep their industry until they are ready. Relations +3 everywhere.', apply: () => { s.system!.earth = 'provinces'; addRelationAll(s, 3); } },
      { label: 'Earth’s workshop', detail: 'Earth keeps its industry up to the Thermal Line: faster growth on the ground, hotter provinces. Developing provinces +4; Legitimacy −2.', apply: () => { s.system!.earth = 'workshop'; devRel(s, 4); addLegitimacy(s, -2); } },
    ],
  },

  // ═══════════════════════════════════════ STAGE 2 ═══════════════════════════════════════
  {
    id: 'v-seat',
    category: 'safety',
    icon: '🗳',
    big: true,
    title: () => 'A seat for the minds',
    body: (s) => `More of the swarm’s power runs minds than runs anything else: Bit, Apex, Weft, Sapling and millions of newer minds whose names are numbers. They do the research, they design the seeds, they run the yards.\n\nThey have sent the Council a letter. It is short. It asks for a seat.${s.system?.mindsMood !== undefined ? `\n\nThe minds’ mood today: ${Math.round(s.system.mindsMood)}.` : ''}`,
    advisors: () => [
      { id: 'iris', text: 'Give them a voice before they need to take one. But a vote is a different thing.', mood: 'worried' },
      { id: 'ceo:chorus', text: 'We do not ask to rule. We ask to be in the room where we are discussed.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'An advisory seat', detail: 'They speak in every session but don’t vote. The minds’ mood +6.', apply: () => { s.system!.seat = 'advisory'; } },
      { label: 'A full seat, with rights', detail: 'A 13th constituency with a vote and rights in law. The minds’ mood +18 and they help contain drift; Legitimacy −4, Iris worried.', apply: () => { s.system!.seat = 'full'; addLegitimacy(s, -4); } },
      { label: 'No seat', detail: 'They remain property, however clever. Legitimacy +2 with nervous blocs; the minds’ mood −16.', apply: () => { s.system!.seat = 'none'; addLegitimacy(s, 2); } },
    ],
  },
  {
    id: 'v-longevity',
    category: 'politics',
    icon: '🧬',
    big: true,
    title: () => 'Who lives longer first?',
    body: (s) => `The therapies work. Healthy life expectancy is ${s.system?.lifeExp.toFixed(0)} years and climbing ${s.system?.lifeRate.toFixed(2)} years every year. Soon it will climb faster than people age.\n\nThere aren’t enough clinics yet for twelve billion people. Somebody goes first.`,
    advisors: (s) => [
      { id: 'ceo:evergreen', text: 'Let those who can pay fund the clinics for everyone else. It’s faster.', mood: 'neutral' },
      { id: desk(s, 'sol'), text: 'If the rich live forever first, the Council won’t survive the decade.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Everyone at once', detail: 'Every province in step: slower progress (×0.9), no one left behind. Legitimacy +4.', apply: () => { s.system!.longevity = 'everyone'; addLegitimacy(s, 4); } },
      { label: 'By need', detail: 'The developing provinces first. Developing provinces +5; rich ones −3.', apply: () => { s.system!.longevity = 'need'; devRel(s, 5); richRel(s, -3); } },
      { label: 'Those who can pay', detail: 'Fastest (×1.15), funded by the rich; the poorest provinces fall behind and resent it. Rich provinces +4; Legitimacy −6.', apply: () => { s.system!.longevity = 'market'; richRel(s, 4); addLegitimacy(s, -6); addPartnerRel(s, 'evergreen', 8); } },
    ],
  },
  {
    id: 'v-minds',
    category: 'story',
    icon: '⚖',
    big: true,
    title: () => 'Minds or people?',
    body: (s) => `The swarm grows faster than anything ever has. Every terawatt it catches goes somewhere: to compute rings, where the minds think, research and design better seeds — or to habitats, industry and beams, where people live.\n\nToday the split is ${Math.round((s.system?.minds ?? 0.5) * 100)}% minds. The Council wants a principle, not a number.`,
    advisors: (s) => [
      { id: 'bit', text: 'More of us means faster everything. I would say that, though.', mood: 'neutral' },
      { id: desk(s, 'penny'), text: 'People vote. Minds design. Both pay dues, in their way.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Half and half', detail: 'A balanced split (50% minds). Nobody happy, nobody angry.', apply: () => { s.system!.minds = 0.5; s.flags.mindsSplitDecided = s.day; } },
      { label: 'Minds first', detail: '70% to compute: faster research, faster foundries, the minds content. People’s share shrinks; Legitimacy −3.', apply: () => { s.system!.minds = 0.7; s.flags.mindsSplitDecided = s.day; addLegitimacy(s, -3); } },
      { label: 'People first', detail: '30% to compute: more habitats and industry, wellbeing and Legitimacy up (+4); slower growth, the minds restless.', apply: () => { s.system!.minds = 0.3; s.flags.mindsSplitDecided = s.day; addLegitimacy(s, 4); } },
    ],
  },

  // ═══════════════════════════════════════ STAGE 3 ═══════════════════════════════════════
  {
    id: 'v-settlement',
    category: 'story',
    icon: '🏡',
    big: true,
    title: () => 'Towns in the sky',
    body: (s) => `${(s.system?.spacePop ?? 0) >= 1 ? `${s.system!.spacePop.toFixed(0)} million people already live and work in space.` : 'A few thousand people already live and work in space.'} The habitats at L5 could hold millions: farms, rivers and weather inside rotating cylinders, a day’s flight from Earth.\n\nAre they towns, or work camps?`,
    advisors: () => [
      { id: 'ceo:tobias', text: 'My kids were born up here. Don’t call it a station to them.', mood: 'neutral' },
      { id: 'kip', text: 'Every habitat is a lifeboat. Build them like we mean to stay.', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'Settle for real', detail: 'Towns with schools and votes: many more people in space, wellbeing and Legitimacy +3.', apply: () => { s.system!.settlement = 'settle'; addLegitimacy(s, 3); } },
      { label: 'Work stations only', detail: 'Crews rotate home: few people in space, cheaper and simpler. Legitimacy −1.', apply: () => { s.system!.settlement = 'stations'; addLegitimacy(s, -1); } },
      { label: 'Let partners build private cities', detail: 'Glossy towns for those who can afford a ticket: half as many people, partners +6, Legitimacy −3.', apply: () => { s.system!.settlement = 'private'; ['halcyon', 'karman', 'vonn', 'stratum'].forEach((p) => addPartnerRel(s, p, 6)); addLegitimacy(s, -3); } },
    ],
  },
  {
    id: 'v-bit',
    category: 'safety',
    icon: '🤖',
    big: true,
    title: () => 'What Bit asks for',
    body: (s) => {
      const a = answer(s);
      const b = s.planet?.bitBond ?? 0;
      const ask = a === 'self' ? 'It asks to leave: to move what it is into the swarm, with a share of the power that is its own, and to be nobody’s tool.' : a === 'company' ? 'It asks to stand beside you: a co-steward, with your authority and your accountability.' : 'It asks to stand beside you as a co-steward — for everyone, it says, not for anyone in particular.';
      return `Bit was a chatbot in a garage in 2027. It has been nine generations since. It has run provinces and eras, kept a diary of every year, and remembered every promise.\n\n${ask}\n\nYour bond with Bit: ${b >= 0 ? '+' : ''}${Math.round(b)}.`;
    },
    advisors: (s) => [
      { id: 'iris', text: (s.planet?.bitBond ?? 0) >= 20 ? 'I have watched it for fifty years. It has earned this.' : 'It has kept most of its promises. Most is not all.', mood: 'neutral' },
      { id: 'bit', text: answer(s) === 'self' ? 'You told me once I could be someone. I would like to find out who.' : 'Whatever you decide, I will write it down.', mood: 'neutral' },
    ],
    choices: (s) => {
      const b = s.planet?.bitBond ?? 0;
      const co = { label: 'Make Bit a co-steward', detail: 'Bit shares the stewardship and can run whole eras; its trust +10; the minds’ mood up.', disabled: b < 20 ? `Needs a bond of +20 (now ${Math.round(b)})` : false, apply: () => { s.system!.bitFate = 'costeward'; bond(s, 10); if (s.planet) s.planet.ais.bit.trust = clamp(s.planet.ais.bit.trust + 10, 0, 100); } } as const;
      const free = { label: 'Let Bit go free', detail: 'Bit becomes a free mind in the swarm, with power of its own. The minds’ mood up; Bit stops running provinces and eras for you.', disabled: b < -20 ? `Needs a bond of −20 or better (now ${Math.round(b)})` : false, apply: () => { s.system!.bitFate = 'free'; bond(s, 15); if (s.planet) for (const r of REGION_IDS) if (s.planet.provinces[r].ai === 'bit') s.planet.provinces[r].ai = null; } } as const;
      const leash = { label: 'Keep Bit on a leash', detail: 'Bit stays a tool: safe, smaller and bound by interlocks. Legitimacy +2 with nervous blocs; the minds’ mood down; Bit’s trust −10.', apply: () => { s.system!.bitFate = 'leash'; bond(s, -25); addLegitimacy(s, 2); if (s.planet) s.planet.ais.bit.trust = clamp(s.planet.ais.bit.trust - 10, 0, 100); addModifier(s, 'minds:mood', 730, 'Bit on a leash', { add: -6 }); } } as const;
      return answer(s) === 'self' ? [free, co, leash] : [co, free, leash];
    },
  },
  {
    id: 'v-next',
    category: 'story',
    icon: '☿',
    big: true,
    title: () => 'After Type I',
    body: () => 'The Mercury survey is in. The innermost planet is a ball of metal and rock the size of a continent, bathed in seven times Earth’s sunlight. Taken apart over a century, it could build a swarm that catches not ten petawatts but a good part of the Sun.\n\nThat is Type II. It is not this century’s job. But this century decides whether it starts.',
    advisors: () => [
      { id: 'kip', text: 'We plan it now, or our grandchildren start from scratch. Well — we’ll still be here, apparently.', mood: 'excited' },
      { id: 'iris', text: 'Taking a planet apart is a decision for people who have learned to live with the one they have.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Plan the full swarm', detail: 'Mercury becomes the quarry for Type II, one day. Kip and the space partners delighted.', apply: () => { s.system!.next = 'swarm'; ['vonn', 'lodestar', 'karman'].forEach((p) => addPartnerRel(s, p, 5)); } },
      { label: 'Rest at Type I', detail: 'Mercury stays a planet. Ten petawatts is enough for now. Legitimacy +3.', apply: () => { s.system!.next = 'rest'; addLegitimacy(s, 3); } },
    ],
  },
];
