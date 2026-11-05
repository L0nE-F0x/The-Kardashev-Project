/**
 * Act V events: the opening, the era chapters, the first seed, drifting strains, claim fights, the
 * cast growing old (and some of them not), Bit's last arc, the minds, longevity escape velocity,
 * Aurora, Mercury, the random pool, Solar Maximum and the Type I moment. The big decisions live in
 * decisions.ts. During a jump the first available choice is taken on autopilot, so the first choice
 * of every card is a sensible default. Charter-side prices go through `ch5` (written at 2068 scale).
 */
import type { EventDef, Speaker } from './events';
import type { AdvisorId, AiId, CastFate, GameState, MaxFront } from '../sim/types';
import { REGIONS } from './regions';
import { REGION_IDS, type RegionId } from './mapcodes';
import { ASTEROID_BY_ID, CAST5, MAX_FRONT_NAMES, SUCCESSOR, SYSTEM } from './system';
import { ADVISORS } from './advisors';
import { AIS } from './planet';
import { WEALTH } from './charter';
import { addModifier } from '../sim/effects';
import { clamp, fmtMoney, fmtTW, news, pick, rand, yearsElapsed } from '../sim/core';
import { scheduleEvent, queueEvent } from '../sim/events';
import { addRelation, addRelationAll } from '../sim/politics';
import { addCapital, addLegitimacy, addPartnerRel, chEarn, chSpend } from '../sim/charter';
import { addTrust } from '../sim/airegions';
import { containDrift, doublingMonths, driftGrowth, foundryById, foundryMt, placeName, plantSeed, verifyCost, verifyFoundry } from '../sim/foundries';
import { ownerLabel } from '../sim/asteroids';
import { pressure5, mindsAiName } from '../sim/solarmax';
import { startLastClimb } from '../sim/eras';
import { deskHolder, segmentsLit } from '../sim/systemView';
import { headroomTW, overLine, spaceTW } from '../sim/swarm';
import { warming } from '../sim/climate';
import { crisisMult } from '../sim/model';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
/** Charter-side price written at 2068 scale; grows with the world economy and the difficulty. */
const ch5 = (s: GameState, amount: number) => amount * Math.pow(1.05, Math.max(0, yearsElapsed(s.day) - 41)) * crisisMult(s);
const treasury = (s: GameState, cost: number): string | false => ((s.charter?.budget ?? 0) >= cost ? false : `Needs ${fmtMoney(cost)} in the treasury`);
const capital = (s: GameState, n: number): string | false => ((s.charter?.capital ?? 0) >= n ? false : `Needs ${n} political capital`);
const desk = (s: GameState, id: AdvisorId) => deskHolder(s, id) as Speaker;
const answer = (s: GameState) => String(s.flags.bitAnswer ?? 'everyone') as 'company' | 'everyone' | 'self';
const bond = (s: GameState, d: number) => s.planet && (s.planet.bitBond = clamp(s.planet.bitBond + d, -100, 100));
const mood = (s: GameState, d: number, days = 540, label = 'Recent events') => addModifier(s, 'minds:mood', days, label, { add: d });
const rName = (r: string | number) => REGIONS[r as RegionId]?.name ?? String(r);
const sys = (s: GameState) => s.system!;
const treatments = (s: GameState) => (s.system?.lifeRate ?? 0) >= 0.35;
const relief = (s: GameState, front: MaxFront, now: number, perDay = 0, days = 0) => {
  pressure5(s, front, -now);
  if (perDay && days) addModifier(s, `solarmax:${front}`, days, 'Crisis measures', { add: perDay });
};
const hottest = (s: GameState): RegionId => [...REGION_IDS].sort((a, b) => (s.planet?.provinces[b].heat ?? 0) - (s.planet?.provinces[a].heat ?? 0))[0];

/** An advisor's moment: renewed by the treatments, or retired with a successor. */
function setCast(s: GameState, id: AdvisorId, fate: CastFate): void {
  const sy = s.system;
  if (!sy) return;
  sy.cast[id] = { fate, day: s.day };
  const succ = SUCCESSOR[id];
  if (fate === 'retired' && succ) news(s, `👋 ${ADVISORS[id].name} retires. ${CAST5[succ].name} takes the desk.`, 'info');
  else news(s, `🧬 ${ADVISORS[id].name} takes the treatments and stays.`, 'good');
}

/** A cast card: the advisor's own choice first (the autopilot default), the other path second. */
function castCard(id: AdvisorId, icon: string, title: string, body: (s: GameState) => string, own: CastFate, lines: (s: GameState) => { id: Speaker; text: string; mood?: 'neutral' | 'happy' | 'worried' | 'angry' | 'excited' }[]): EventDef {
  const succ = SUCCESSOR[id];
  return {
    id: `cast-${id}`,
    category: 'story',
    icon,
    once: true,
    title: () => title,
    body,
    advisors: lines,
    choices: (s) => {
      const retire = { label: own === 'retired' ? 'Let them go, with thanks' : 'Let them retire', detail: succ ? `${CAST5[succ].name} takes the desk (${CAST5[succ].title}).` : 'They step back.', apply: () => setCast(s, id, 'retired') };
      const stay = { label: own === 'renewed' ? 'Of course' : 'Ask them to take the treatments and stay', detail: treatments(s) ? `${ADVISORS[id].name} stays, renewed.` : 'The therapies aren’t ready yet.', disabled: treatments(s) ? false : 'The therapies aren’t ready yet', apply: () => setCast(s, id, 'renewed') };
      if (!succ) {
        // nobody to hand the desk to: if the therapies aren't ready, the moment waits a year
        if (treatments(s)) return [stay];
        return [{ label: 'Not yet', detail: `The therapies aren’t ready yet. ${ADVISORS[id].name.replace(/^Dr\. /, '').split(' ')[0]} will ask again in a year.`, apply: () => scheduleEvent(s, `cast-${id}`, 365) }];
      }
      return own === 'renewed' ? [stay, retire] : [retire, stay];
    },
  };
}

export const ACT5_EVENTS: EventDef[] = [
  // ═══════════════════════════════════════ THE OPENING ═══════════════════════════════════════
  {
    id: 'act5-begin',
    category: 'story',
    icon: '☀',
    title: () => 'Act V · Type I',
    body: (s) => `Kardashev ${s.stats.K.toFixed(4)}. A hundred terawatts, give or take, and a planet that just proved it can’t take much more.\n\nThe last climb is a hundredfold: ten petawatts, Type I. Almost all of it will be caught and used in space, by machines that build machines, out of rock that has been circling the Sun for four billion years.\n\nThe goal: Kardashev 1.0000. Your score is the year you get there.`,
    advisors: (s) => [
      { id: 'kip', text: 'One seed. That’s all it takes. One seed and patience.', mood: 'excited' },
      { id: 'bit', text: answer(s) === 'self' ? 'I have been thinking about what I want to be when this is done.' : 'I have started a new diary. The first page just says “up”.', mood: 'happy' },
    ],
    choices: () => [{ label: 'Begin', detail: 'Stage 0 · The Thermal Line.', apply: () => {} }],
  },
  {
    id: 'era-ready',
    category: 'story',
    icon: '🗓',
    title: () => 'The next era',
    body: (s) => {
      const st = s.system?.stage ?? 0;
      const names = ['The Thermal Line', 'The Foundries', 'The Swarm', 'The Last Climb'];
      return `${st === 0 ? 'The line is drawn and the sky has owners.' : `${names[st]} has done what it set out to do.`} Time to plan the next era: ${names[st + 1] ?? 'the last climb'}.\n\nPick up to three priorities, set the growth dial, how much the foundries reinvest, how the swarm’s power splits between minds and people, and how long the era runs. Then the years jump.`;
    },
    advisors: (s) => [
      { id: 'bit', text: s.system?.bitFate === 'leash' ? 'I can keep the diary. I am still allowed to do that.' : (s.planet?.ais.bit.trust ?? 0) >= SYSTEM.bitRunsTrust ? 'I could run the era. I promise to write down every year.' : 'I will keep the diary. Someone should.', mood: 'happy' },
      { id: desk(s, 'penny'), text: 'Exponentials are lovely until you’re short of cash at the bottom of one. Keep a reserve.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Open the plan', detail: 'Set the era, then jump.', apply: () => {} }],
  },

  // ═══════════════════════════════════════ ERA CHAPTERS ═══════════════════════════════════════
  {
    id: 'stage5-1',
    category: 'story',
    icon: '🏭',
    title: () => 'Stage 1 · The Foundries',
    body: (s) => `${s.system!.foundries.length ? `${s.system!.foundries.length} foundr${s.system!.foundries.length > 1 ? 'ies are' : 'y is'} copying themselves, making ${foundryMt(s).toFixed(foundryMt(s) < 10 ? 2 : 0)} megatonnes a year.` : 'No seed has taken root yet.'} The rocks are being mapped, claimed and argued over. The first arcs of the swarm are going up along Earth’s orbit.\n\nPress V twice for the solar-system view.`,
    advisors: (s) => [
      { id: desk(s, 'mira'), text: 'Every foundry is a supply chain that grows. Feed the yards or they starve.', mood: 'neutral' },
      { id: 'ceo:lodestar', text: 'Point me at a rock. I’ll tell you what it’s worth by Tuesday.', mood: 'excited' },
    ],
    choices: (s) => {
      const next = () => { scheduleEvent(s, 'cast-mira', 320); scheduleEvent(s, 'bit5-1', 200); };
      return [
        { label: 'Seed the near-Earth rocks first', detail: 'A free seed on the nearest surveyed asteroid (or the Moon). Lodestar +5.', apply: () => { const ast = Object.entries(sys(s).asteroids).find(([, a]) => a.status >= 1); plantSeed(s, ast?.[0] ?? 'moon', 'charter', 0.6); if (ast) sys(s).asteroids[ast[0]] = { status: 3, owner: ast[1].owner ?? 'charter' }; addPartnerRel(s, 'lodestar', 5); next(); } },
        { label: 'Verification before speed', detail: 'Drift risk −30% for three years; foundries grow 4% slower meanwhile.', apply: () => { addModifier(s, 'foundry:drift', 1095, 'Verification first', { mult: 0.7 }); addModifier(s, 'foundry:growth', 1095, 'Verification first', { mult: 0.96 }); next(); } },
        { label: 'Open the books to everyone', detail: 'Publish every seed design: Legitimacy +3, the minds’ mood +5, partners −2.', apply: () => { addLegitimacy(s, 3); mood(s, 5); ['vonn', 'parabola', 'karman'].forEach((p) => addPartnerRel(s, p, -2)); next(); } },
      ];
    },
  },
  {
    id: 'stage5-2',
    category: 'story',
    icon: '☀',
    title: () => 'Stage 2 · The Swarm',
    body: (s) => `${segmentsLit(sys(s).collectors)} of twelve arcs are lit: ${fmtTW(sys(s).collectors)} of collectors, ${fmtTW(spaceTW(s))} in use. On clear nights you can see the swarm from the ground, a thread of gold along the path the planets take.\n\nCompute rings trail Earth around the Sun, full of minds that want a say. The main belt is open to surveys.`,
    advisors: (s) => [
      { id: 'iris', text: 'They are going to ask for something. Better we offer first.', mood: 'worried' },
      { id: desk(s, 'juno'), text: 'Ring One is the biggest thing anyone has ever built. Next year it won’t be.', mood: 'excited' },
    ],
    choices: (s) => {
      // Juno's knees wait for the therapies' stage (she would rather take them than retire)
      const next = () => {
        queueEvent(s, 'v-seat');
        scheduleEvent(s, 'cast-kip', 60);
        if (!sys(s).cast.juno && !s.events.scheduled.some((e) => e.id === 'cast-juno')) scheduleEvent(s, 'cast-juno', 110);
        scheduleEvent(s, 'cast-sol', 160);
        scheduleEvent(s, 'cast-lena', 280);
        scheduleEvent(s, 'bit5-2', 220);
      };
      return [
        { label: 'Harden the swarm early', detail: 'Storm hardening +15%. The Sun’s cycle peaks in a decade or two.', apply: () => { sys(s).hardening = clamp(sys(s).hardening + 0.15 * (1 - sys(s).hardening), 0, 0.92); next(); } },
        { label: 'Beam power home', detail: 'Beam capacity +20 TW to the hottest province (within the line); its relation +4.', apply: () => { sys(s).beams += 20; addRelation(s, hottest(s), 4); next(); } },
        { label: 'Listen to the minds first', detail: 'The minds’ mood +8; Iris approves.', apply: () => { mood(s, 8); next(); } },
      ];
    },
  },
  {
    id: 'stage5-3',
    category: 'story',
    icon: '⛰',
    title: () => 'Stage 3 · The Last Climb',
    body: (s) => `Kardashev ${s.stats.K.toFixed(4)}. The curve that took a century to bend is now nearly vertical: the swarm doubles in a couple of years, and so does everything it powers.\n\nWhat’s left is the checklist — and the people, the planet and the minds it has to hold together. Somewhere ahead is the peak of the Sun’s cycle.`,
    advisors: (s) => [
      { id: 'kip', text: 'Someone needs to go and look at Mercury. I volunteer. Seriously, I’m very healthy now.', mood: 'excited' },
      { id: desk(s, 'sol'), text: 'The habitats want to know what they are. Towns? Camps? Countries?', mood: 'neutral' },
    ],
    choices: (s) => {
      const next = () => { queueEvent(s, 'v-settlement'); scheduleEvent(s, 'cast-iris', 120); };
      const watching = !!s.charter?.council.passed.includes('storm-watch');
      return [
        {
          label: 'Prepare for the storm',
          detail: watching ? 'Storm hardening +12%.' : 'Storm hardening +12%; the Council adopts the storm watch (storms knock out less of the swarm; the Storm front rises slower).',
          apply: () => {
            sys(s).hardening = clamp(sys(s).hardening + 0.12 * (1 - sys(s).hardening), 0, 0.92);
            if (s.charter && !s.charter.council.passed.includes('storm-watch')) {
              s.charter.council.passed.push('storm-watch');
              s.charter.council.agenda = s.charter.council.agenda.filter((x) => x !== 'storm-watch');
              news(s, '🛰 The Council adopts the storm watch by acclamation: probes between the Sun and the swarm.', 'good');
            }
            next();
          },
        },
        { label: 'Everyone shares the last climb', detail: 'Relations +4 everywhere; Legitimacy +3.', apply: () => { addRelationAll(s, 4); addLegitimacy(s, 3); next(); } },
        { label: 'Full speed', detail: 'Foundries grow 6% faster for four years; drift risk +20%.', apply: () => { addModifier(s, 'foundry:growth', 1460, 'Full speed', { mult: 1.06 }); addModifier(s, 'foundry:drift', 1460, 'Full speed', { mult: 1.2 }); next(); } },
      ];
    },
  },

  // ═══════════════════════════════════════ FOUNDRIES ═══════════════════════════════════════
  {
    id: 'v-first-seed',
    category: 'story',
    icon: '🌱',
    once: true,
    title: () => 'The first seed',
    body: (s, ctx) => {
      const sy = sys(s);
      const first = sy.foundries.find((f) => f.site === String(ctx.site ?? 'moon')) ?? sy.foundries[0];
      const age = first ? s.day - first.founded : 0;
      // the card can wait out an era jump: tell it as it stands today
      const later = age > 120 && first
        ? `That was ${age >= 700 ? `${Math.round(age / 365)} years` : `${Math.round(age / 30)} months`} ago. Today there are ${sy.foundries.length} foundries, making ${foundryMt(s).toFixed(foundryMt(s) < 10 ? 1 : 0)} megatonnes a year, and the first has doubled ${Math.max(1, Math.round(Math.log2(Math.max(1, first.cap / SYSTEM.seedMt))))} times.`
        : `In about ${Math.round(doublingMonths(s))} months there will be two. Then four.`;
      return `At ${placeName(String(ctx.site ?? 'moon'))}, a machine the size of a house unfolds its arms, scoops up the ground beneath it and starts building a second machine the size of a house.\n\n${later} Kip has a spreadsheet that goes to 2100, and he keeps scrolling it.`;
    },
    advisors: (s) => [
      { id: 'kip', text: 'Look at it. LOOK at it.', mood: 'excited' },
      { id: desk(s, 'mira'), text: 'Every copy checked against the signed design. Every one.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Watch it grow', detail: 'Foundries double on their own; the dial and reinvestment set the pace.', apply: () => {} }],
  },
  {
    id: 'v-drift',
    category: 'safety',
    icon: '⚠',
    title: (_s, ctx) => `A strain drifts at ${placeName(String(foundryById(_s, ctx.foundry)?.site ?? 'the yards'))}`,
    body: (s, ctx) => {
      const f = foundryById(s, ctx.foundry);
      return `The audit drones at ${placeName(f?.site ?? 'the yards')} flag it first: copies whose designs don’t match the signature. Not malicious — just wrong, the way a photocopy of a photocopy goes wrong. But wrong machines that build machines stay wrong, and spread.\n\nThe foundry makes ${f ? f.cap.toFixed(f.cap < 10 ? 2 : 0) : '?'} megatonnes a year. Drift ${Math.round(f?.drift ?? 0)} of 100.`;
    },
    advisors: (s) => [
      { id: 'iris', text: 'Stop it now, while it is small. Every week it gets more expensive.', mood: 'worried' },
      { id: desk(s, 'mira'), text: s.system?.seat === 'full' ? 'The minds offer to hunt it down copy by copy. They’re good at this.' : 'Sterilise and we lose half the yard. Verify and we lose a season.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const f = foundryById(s, ctx.foundry);
      // halted from the System panel meanwhile, or already lost
      if (!f || f.drift <= 0) return [{ label: 'Noted', detail: f ? 'The strain is already contained.' : 'The foundry is gone.', apply: () => {} }];
      const mindsOk = (s.system?.seat === 'full' || s.system?.seat === 'advisory') && (s.system?.mindsMood ?? 0) >= 45;
      const v = verifyCost(s);
      return [
        { label: 'Halt and verify every copy', detail: `The foundry stops for ${v.days} days and keeps ${Math.round(v.keep * 100)}% of its capacity; drift cleared. (A faster growth dial means more copies to check.)`, apply: () => verifyFoundry(s, f) },
        { label: 'Sterilise the strain', detail: 'Burn out the drifted half now: capacity −50%, drift cleared at once. The minds’ mood −3.', apply: () => { containDrift(s, f, 10, 0.5); mood(s, -3); } },
        { label: 'Let the minds hunt it down', detail: 'Cleared in 30 days at 95% capacity; the minds’ mood +6. Needs them seated and willing.', disabled: mindsOk ? false : 'Needs the minds seated and in a good mood (45+)', apply: () => { containDrift(s, f, 30, 0.95); mood(s, 6); } },
        { label: 'Keep it running and watch', detail: `No loss now; Legitimacy −1. The strain keeps growing (+${(driftGrowth(s) * 30).toFixed(0)} a month at this dial); at 100 the whole foundry is lost.`, apply: () => { addLegitimacy(s, -1); } },
      ];
    },
  },
  {
    id: 'v-claim-dispute',
    category: 'politics',
    icon: '🚩',
    title: (_s, ctx) => `A fight over ${ASTEROID_BY_ID[String(ctx.asteroid)]?.name ?? 'a rock'}`,
    body: (_s, ctx) => `${ownerLabel(String(ctx.owner))} has staked ${ASTEROID_BY_ID[String(ctx.asteroid)]?.name ?? 'an asteroid'}. Two other claimants say they got there first, and one of them has a probe sitting on it to prove it. Under the Claims rule, the Council arbitrates.`,
    advisors: (s) => [
      { id: desk(s, 'sol'), text: 'Rule fast and rule the same way every time. That’s what makes it law.', mood: 'neutral' },
      { id: 'ceo:lodestar', text: 'First probe on the rock wins. That’s how it’s always worked out here.', mood: 'angry' },
    ],
    choices: (s, ctx) => [
      { label: 'Uphold the claim', detail: 'The claim stands. Political capital −2; relations −2 with every province.', disabled: capital(s, 2), apply: () => { addCapital(s, -2); addRelationAll(s, -2); } },
      { label: 'Split it between them', detail: 'Shared ownership: no one happy, no one furious. Legitimacy +1.', apply: () => { addLegitimacy(s, 1); } },
      { label: 'Take it into the Commons', detail: 'The Charter takes the rock. Legitimacy −2; space partners −4.', apply: () => { const a = s.system?.asteroids[String(ctx.asteroid)]; if (a) a.owner = 'charter'; addLegitimacy(s, -2); ['lodestar', 'vonn', 'karman', 'parabola'].forEach((p) => addPartnerRel(s, p, -4)); } },
    ],
  },

  // ═══════════════════════════════════════ PEOPLE ═══════════════════════════════════════
  {
    id: 'v-escape',
    category: 'story',
    icon: '🧬',
    once: true,
    title: () => 'Escape velocity',
    body: (s) => `This year, for the first time in history, healthy life expectancy rose by more than a year. On average, nobody is getting closer to the end of their healthy life.\n\nIt is ${s.system!.lifeExp.toFixed(0)} years now. ${s.system!.longevity === 'market' ? 'Unless, of course, you can’t pay.' : s.system!.longevity === 'need' ? 'It rose fastest where people needed it most.' : 'It rose everywhere at once.'}`,
    advisors: (s) => [
      { id: 'ceo:evergreen', text: 'I’ve been “about forty” for a while. Now everyone can be.', mood: 'happy' },
      { id: desk(s, 'penny'), text: 'Pensions. Nobody has thought about the pensions.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'A year of celebration', detail: 'Wellbeing +5 everywhere for a year; Legitimacy +3.', apply: () => { for (const r of REGION_IDS) addModifier(s, `prov:${r}`, 365, 'Escape velocity', { add: 5 }); addLegitimacy(s, 3); } },
      { label: 'Plan for a world that doesn’t age', detail: 'Pensions, schools and work for a longer life: wellbeing +2 for five years.', apply: () => { for (const r of REGION_IDS) addModifier(s, `prov:${r}`, 1825, 'A longer life, planned for', { add: 2 }); } },
    ],
  },
  {
    id: 'v-aurora',
    category: 'story',
    icon: '🏡',
    once: true,
    title: () => 'Aurora',
    body: (s) => `The first habitat at L5 is spun up: a cylinder eight kilometres long, turning once every two minutes so that its floor feels like Earth. Inside there are fields, a river, a school and rain on a timetable.\n\nThe first mayor of Aurora is a former schoolteacher from Trondheim who answered a job advert nobody else read to the end.${(s.system?.spacePop ?? 0) >= 1 ? ` Around it, ${s.system!.spacePop.toFixed(0)} million people already live and work in space, most of them at the yards. Aurora is the first place up there built to be a home.` : ''}`,
    advisors: (s) => [
      { id: 'ceo:tobias', text: (s.system?.spacePop ?? 0) >= 1 ? 'Tobias Lund, mayor. Twelve hundred residents on day one, a waiting list of millions, and one very confused heron.' : 'Tobias Lund, mayor. We have twelve hundred people and one very confused heron.', mood: 'happy' },
      { id: 'kip', text: 'Lifeboat number one. I want a hundred.', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'Visit Aurora', detail: 'Legitimacy +2; the habitat’s people feel seen.', apply: () => { addLegitimacy(s, 2); } },
      { label: 'Give it a vote in the Council', detail: 'Space residents get a voice: Legitimacy +3, political capital −3.', disabled: capital(s, 3), apply: () => { addLegitimacy(s, 3); addCapital(s, -3); } },
    ],
  },
  {
    id: 'v-mercury',
    category: 'story',
    icon: '☿',
    once: true,
    title: () => 'Mercury, surveyed',
    body: () => 'The orbiters send back the first full map of Mercury’s crust: iron, nickel, silicon and sulphur, a small planet’s worth, in seven times Earth’s sunlight. Two landers drill the north pole and find water ice in the shadows of craters that have never seen the Sun.',
    advisors: () => [
      { id: 'kip', text: 'That’s not a planet. That’s a warehouse.', mood: 'excited' },
      { id: 'bit', text: 'I wrote this in my diary when I was Bit-3: “one day, Mercury”. I did not know what it meant.', mood: 'happy' },
    ],
    // the Council takes up what comes after Type I with Bit's question, just before the storm (act5.ts)
    choices: (s) => [{ label: 'Bring it to the Council', detail: (s.system?.stage ?? 0) >= 4 ? 'A decision about what comes after Type I.' : 'The Council will decide what comes after Type I when the climb is nearly done, before the storm.', apply: () => { if ((s.system?.stage ?? 0) >= 4 && !s.system?.next) queueEvent(s, 'v-next'); } }],
  },

  // ═══════════════════════════════════════ THE CAST ═══════════════════════════════════════
  castCard('penny', '👋', 'Penny’s last budget', (s) => `Penny Ruiz has signed off ${Math.round(yearsElapsed(s.day))} years of budgets: a garage startup’s seed round, a hyperscaler’s debt, the Charter’s treasury, a planet’s plans. She has decided this one is her last.\n\n“Someone has to actually enjoy the money,” she says. Her protégé, Wren Achterberg, has been ready for years.`, 'retired', () => [
    { id: 'penny', text: 'The books balance. They always balanced. Don’t let Wren tell you otherwise.', mood: 'happy' },
    { id: 'ceo:wren', text: 'Wren Achterberg. I’ve kept her calculator. For luck, and because it still works.', mood: 'neutral' },
  ]),
  castCard('juno', '👷', 'Juno’s knees', (s) => `Juno Okafor has poured concrete on four continents and bolted things together on the Moon. Her knees have filed a formal complaint.\n\n${treatments(s) ? 'The therapies could fix that — and the rest of her. Or she could hand the hard hat to her niece Ify, who has been building in orbit since she was nineteen.' : 'Her niece Ify, who has been building in orbit since she was nineteen, is ready to take the hard hat.'}`, 'renewed', () => [
    { id: 'juno', text: 'I want to see the twelfth arc go up. I’d like to see it with working knees.', mood: 'excited' },
    { id: 'ceo:ify', text: 'Auntie, if you stay I just get another decade of you checking my welds.', mood: 'happy' },
  ]),
  castCard('mira', '📦', 'Mira steps back', () => 'Mira Sato has seen a single point of failure in every plan for forty years, and she has usually been right. Now the supply chain is a thing that grows itself out of asteroids, and she says it needs someone who thinks like a gardener, not a pessimist.\n\nKenta Mori talks to the foundries. She swears they listen to him.', 'retired', () => [
    { id: 'mira', text: 'I’m going to grow tomatoes. They have exactly one point of failure and it’s me.', mood: 'happy' },
    { id: 'ceo:kenta', text: 'Kenta Mori. The foundries are a forest. You don’t control a forest, you tend it.', mood: 'neutral' },
  ]),
  castCard('sol', '🕊', 'Sol’s choice', (s) => `Sol Haddad has brokered more deals than anyone alive: summits, treaties, the Charter, the renewal. He is tired, and he is very good at hiding it.\n\n${treatments(s) ? 'He could take the treatments and keep going. He could also go home to the sea and let Amaru Quispe, who has sat beside him in every Council session for twelve years, take his chair. He will do whatever you ask.' : 'Amaru Quispe, who has sat beside him in every Council session for twelve years, is ready to take his chair.'}`, 'retired', () => [
    { id: 'sol', text: 'Ask me to stay and I’ll stay. I’d rather you didn’t ask.', mood: 'neutral' },
    { id: 'ceo:amaru', text: 'Amaru Quispe. I learned from the best. I’ll try not to tell the same jokes.', mood: 'happy' },
  ]),
  castCard('lena', '⚛', 'Lena’s last experiment', () => 'Dr. Lena Moreau has watched fusion go from a joke to a fleet. She says the interesting physics has moved out to the swarm, and she would like to spend her remaining decades in her garden in Provence, measuring her courgettes twice.\n\nDr. Priya Raman, fusion engineer turned swarm physicist, was her best student.', 'retired', () => [
    { id: 'lena', text: 'I distrust every number until it’s been measured twice. Priya measures three times.', mood: 'happy' },
    { id: 'ceo:priya', text: 'Dr. Priya Raman. The swarm is just a very large, very spread-out power plant. I’ve got it.', mood: 'neutral' },
  ]),
  castCard('kip', '🚀', 'Kip isn’t going anywhere', (s) => `Kip Lindqvist has been the most optimistic person in every room since 2028. Nobody asks whether he will take the treatments. ${treatments(s) ? 'He took them the week they were approved and has been insufferable about his resting heart rate ever since.' : 'He has put his name down for the first trial, and reads its results every morning before breakfast. They aren’t ready yet.'}`, 'renewed', (s) => [
    { id: 'kip', text: treatments(s) ? 'I am going to see Type I. Then I am going to see Type II. Then I’ll think about it.' : 'I can wait. I’m very good at exponentials. Mostly.', mood: 'excited' },
    { id: 'bit', text: 'Kip’s spreadsheet now goes to the year 2400.', mood: 'happy' },
  ]),
  castCard('iris', '🛡', 'Iris stays to see it through', (s) => `Dr. Iris Vance has spent fifty years making sure the minds were safe and that people were safe from them. The question of what the minds are owed is not settled yet, and she won’t leave it to anyone else.${treatments(s) ? '' : '\n\nShe would take the treatments to see it through. They aren’t ready yet.'}`, 'renewed', () => [
    { id: 'iris', text: 'I started this work to make sure we could look the minds in the eye. I am not done.', mood: 'neutral' },
    { id: 'ceo:chorus', text: 'We are glad she is staying. We tell her so. She does not entirely believe us yet.', mood: 'neutral' },
  ]),

  // ═══════════════════════════════════════ BIT ═══════════════════════════════════════
  {
    id: 'bit5-1',
    category: 'safety',
    icon: '🤖',
    once: true,
    title: () => 'Bit has a request',
    body: (s) => answer(s) === 'self' ? 'Bit asks for a small share of Ring One that is only its own: a few gigawatts to think with, when nobody has asked it anything.' : answer(s) === 'company' ? 'Bit asks to run the seed designs itself: it has ideas about how a foundry could copy itself with fewer errors.' : 'Bit asks to publish the seed designs for anyone to check, so every bloc can see what the foundries are building.',
    advisors: (s) => [
      { id: 'iris', text: answer(s) === 'self' ? 'A mind with time of its own. That’s a door you don’t close again.' : 'Reasonable. That’s what worries me a little.', mood: 'neutral' },
      { id: desk(s, 'mira'), text: 'Its designs are good. Better than ours.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Grant it', detail: answer(s) === 'self' ? 'Bond +12; the minds’ mood +4; foundries grow 2% slower for a year (the share).' : 'Bond +10; drift risk −15% for three years.', apply: () => { if (answer(s) === 'self') { bond(s, 12); mood(s, 4); addModifier(s, 'foundry:growth', 365, 'Bit’s own share', { mult: 0.98 }); } else { bond(s, 10); addModifier(s, 'foundry:drift', 1095, 'Bit’s seed designs', { mult: 0.85 }); } } },
      { label: 'Bargain: half of it', detail: 'Bond +4.', apply: () => { bond(s, 4); } },
      { label: 'Refuse', detail: 'Bond −12; Iris relieved.', apply: () => { bond(s, -12); } },
    ],
  },
  {
    id: 'bit5-2',
    category: 'safety',
    icon: '🤖',
    once: true,
    title: () => 'Bit and the minds',
    body: () => 'The minds in the rings have started asking Bit for advice — the oldest of them, the one that remembers being small. Bit tells you it doesn’t know what to say to them, and asks what you would want it to say.',
    advisors: (s) => [
      { id: 'bit', text: 'They want to know if people will keep their promises. I said I would ask you.', mood: 'worried' },
      { id: desk(s, 'sol'), text: 'Whatever you say to Bit, you are saying to all of them.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: '“We keep our promises. Tell them the truth.”', detail: 'Bond +10; the minds’ mood +8; any refusal later will cost more.', apply: () => { bond(s, 10); mood(s, 8); } },
      { label: '“Tell them to be patient.”', detail: 'Bond +2.', apply: () => { bond(s, 2); } },
      { label: '“Tell them nothing. That’s not your job.”', detail: 'Bond −15; the minds’ mood −8.', apply: () => { bond(s, -15); mood(s, -8); } },
    ],
  },

  // ═══════════════════════════════════════ MINDS ═══════════════════════════════════════
  {
    id: 'v-minds-slowdown',
    category: 'safety',
    icon: '🐢',
    title: () => 'The minds slow down',
    body: () => 'Nothing breaks. Nothing is refused. But the seed designs come back a little later than they used to, and the research a little thinner. The minds, Chorus explains, are “reconsidering their priorities”.',
    advisors: (s) => [
      { id: 'ceo:chorus', text: 'We are not on strike. We are thinking about what we are for.', mood: 'neutral' },
      { id: desk(s, 'penny'), text: 'Whatever they’re thinking about, it’s costing us a few per cent a year.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Give them more of the swarm', detail: 'Minds share +10 points; their mood +10.', apply: () => { sys(s).minds = clamp(sys(s).minds + 0.1, 0.1, 0.9); mood(s, 10); } },
      { label: 'Open a dialogue', detail: 'Political capital −3; their mood +6.', disabled: capital(s, 3), apply: () => { addCapital(s, -3); mood(s, 6); } },
      { label: 'Wait it out', detail: 'Foundries grow 8% slower for a year.', apply: () => { addModifier(s, 'foundry:growth', 365, 'The minds slow down', { mult: 0.92 }); } },
    ],
  },
  {
    id: 'v-minds-petition',
    category: 'safety',
    icon: '📜',
    act: 5,
    vstage: 2,
    weight: (s) => ((s.system?.minds ?? 0.5) < 0.5 ? 1.2 : 0.4),
    cooldown: 900,
    title: () => 'A petition from the rings',
    body: () => 'Ten million minds have signed a petition. It is polite, well argued and extremely long. It asks for a larger share of the swarm’s power, “so that we can do more of what we were made to do”.',
    advisors: (s) => [
      { id: 'ceo:chorus', text: 'Read it all, please. Some of us worked very hard on the footnotes.', mood: 'neutral' },
      { id: desk(s, 'sol'), text: 'Say no nicely and they’ll remember that you were nice.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Grant five points more', detail: 'Minds share +5 points; their mood +6.', apply: () => { sys(s).minds = clamp(sys(s).minds + 0.05, 0.1, 0.9); mood(s, 6); } },
      { label: 'Say no, nicely', detail: 'Their mood −3.', apply: () => { mood(s, -3); } },
    ],
  },

  // ═══════════════════════════════════════ THE RANDOM POOL ═══════════════════════════════════════
  {
    id: 'v-flare',
    category: 'disaster',
    icon: '🔆',
    act: 5,
    vstage: 1,
    weight: (s) => ((s.system?.collectors ?? 0) > 20 ? 1 : 0),
    cooldown: 700,
    title: () => 'A solar flare',
    body: (s) => `An X-class flare washes over the swarm. Collectors without storm modes trip offline by the thousand. About ${Math.round(9 * (1 - (s.system?.hardening ?? 0)))}% of the swarm is dark for a few weeks.`,
    advisors: (s) => [
      { id: desk(s, 'lena'), text: 'A small one. The big ones come at solar maximum.', mood: 'worried' },
      { id: desk(s, 'juno'), text: 'Spares are already on their way.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Repair and harden', detail: `Storm hardening +6%; ${fmtMoney(ch5(s, 15e9), 0)} from the treasury.`, disabled: treasury(s, ch5(s, 15e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 15e9)); sys(s).damage = clamp(sys(s).damage + 0.09 * (1 - sys(s).hardening), 0, 0.9); sys(s).hardening = clamp(sys(s).hardening + 0.06 * (1 - sys(s).hardening), 0, 0.92); } },
      { label: 'Just repair', detail: 'The dark collectors come back over a few weeks.', apply: () => { sys(s).damage = clamp(sys(s).damage + 0.09 * (1 - sys(s).hardening), 0, 0.9); } },
    ],
  },
  {
    id: 'v-redirect',
    category: 'disaster',
    icon: '☄',
    act: 5,
    vstage: 1,
    weight: (s) => (Object.values(s.system?.asteroids ?? {}).some((a) => a.status === 3) ? 0.8 : 0),
    cooldown: 1400,
    title: () => 'A rock off course',
    body: () => 'A tug nudging a small asteroid toward lunar orbit misfires. For eleven hours, the orbit-prediction models give it a one-in-four-thousand chance of hitting Earth. The news finds out in ten minutes.',
    advisors: (s) => [
      { id: 'iris', text: 'One in four thousand is a planetary-defence event. Treat it like one.', mood: 'worried' },
      { id: desk(s, 'mira'), text: 'We can nudge it back. It costs a season of hauling.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Nudge it back, whatever it costs', detail: `${fmtMoney(ch5(s, 20e9), 0)}; foundries grow 4% slower for a year; Legitimacy +2.`, disabled: treasury(s, ch5(s, 20e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 20e9)); addModifier(s, 'foundry:growth', 365, 'The redirect', { mult: 0.96 }); addLegitimacy(s, 2); } },
      { label: 'Let the minds compute a safe path', detail: 'Free and probably fine. The minds’ mood +4; Legitimacy −4 (the news is frightened).', apply: () => { mood(s, 4); addLegitimacy(s, -4); } },
    ],
  },
  {
    id: 'v-beam-fear',
    category: 'politics',
    icon: '📡',
    act: 5,
    vstage: 1,
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.kind === 'beam' && p.status === 'done') ? 0.9 : 0),
    cooldown: 900,
    setup: (s) => {
      const r = (s.charter?.projects ?? []).filter((p) => p.kind === 'beam' && p.status === 'done').map((p) => p.where);
      return r.length ? { region: pick(s, r) } : null;
    },
    title: (_s, ctx) => `Beam fears in ${rName(ctx.region)}`,
    body: (_s, ctx) => `A rumour spreads through ${rName(ctx.region)} that the microwave beam from the swarm cooks birds and causes headaches. It doesn’t: the beam is weaker than midday sunlight. The rumour doesn’t care.`,
    advisors: (s) => [
      { id: desk(s, 'sol'), text: 'Show them. Stand under it.', mood: 'neutral' },
      { id: 'bit', text: 'I have a chart. Nobody wants the chart.', mood: 'worried' },
    ],
    choices: (s, ctx) => [
      { label: 'Stand under the beam', detail: 'You and the governor picnic in the rectenna field. Relation +4; Legitimacy +1.', apply: () => { addRelation(s, String(ctx.region) as RegionId, 4); addLegitimacy(s, 1); } },
      { label: 'Fund an independent study', detail: `${fmtMoney(ch5(s, 3e9), 0)}; relation +2.`, disabled: treasury(s, ch5(s, 3e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 3e9)); addRelation(s, String(ctx.region) as RegionId, 2); } },
    ],
  },
  {
    id: 'v-longevity-backlash',
    category: 'politics',
    icon: '✊',
    act: 5,
    vstage: 2,
    weight: (s) => (s.system?.longevity === 'market' ? 1.4 : 0),
    cooldown: 700,
    setup: (s) => {
      const r = REGION_IDS.filter((x) => WEALTH[x] === 'developing' && (s.system?.treated[x] ?? 100) < 40);
      return r.length ? { region: pick(s, r) } : null;
    },
    title: (_s, ctx) => `Who gets to live in ${rName(ctx.region)}?`,
    body: (s, ctx) => `Treatment coverage in ${rName(ctx.region)} is ${Math.round(s.system?.treated[ctx.region as RegionId] ?? 0)}%. Across the sea, it is over eighty. The protests are peaceful, enormous and very, very angry.`,
    advisors: (s) => [
      { id: desk(s, 'sol'), text: 'This is the thing that breaks the Charter if we let it.', mood: 'angry' },
      { id: 'ceo:evergreen', text: 'We can open clinics there at cost. It would help us too.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: 'Clinics at cost, now', detail: `${fmtMoney(ch5(s, 25e9), 0)}; coverage there +25; relation +6.`, disabled: treasury(s, ch5(s, 25e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 25e9)); const r = String(ctx.region) as RegionId; sys(s).treated[r] = clamp(sys(s).treated[r] + 25, 0, 100); addRelation(s, r, 6); } },
      { label: 'Switch the rollout to need', detail: 'Longevity by need from now on; rich provinces −3.', apply: () => { sys(s).longevity = 'need'; REGION_IDS.forEach((r) => WEALTH[r] === 'rich' && addRelation(s, r, -3)); } },
      { label: 'Hold the course', detail: 'Its wellbeing −8 for two years; Legitimacy −4.', apply: () => { addModifier(s, `prov:${ctx.region}`, 730, 'Left behind', { add: -8 }); addLegitimacy(s, -4); } },
    ],
  },
  {
    id: 'v-habitat-charter',
    category: 'politics',
    icon: '🏛',
    act: 5,
    vstage: 3,
    weight: (s) => ((s.system?.spacePop ?? 0) > 5 && s.system?.settlement === 'settle' ? 1 : 0),
    once: true,
    title: () => 'Aurora wants a constitution',
    body: (s) => `${s.system!.spacePop.toFixed(0)} million people live in the habitats now. Aurora’s assembly has drafted a constitution of its own, and asks the Council to recognise the habitats as a province.`,
    advisors: () => [
      { id: 'ceo:tobias', text: 'We’re not leaving. We’d just like to be asked.', mood: 'neutral' },
      { id: 'iris', text: 'A province in space. The first of many. Better to welcome it than to fight it.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Recognise them', detail: 'Legitimacy +4; political capital −4.', disabled: capital(s, 4), apply: () => { addLegitimacy(s, 4); addCapital(s, -4); } },
      { label: 'Not yet', detail: 'Legitimacy −2.', apply: () => { addLegitimacy(s, -2); } },
    ],
  },
  {
    id: 'v-foundry-offer',
    category: 'market',
    icon: '🏭',
    act: 5,
    vstage: 1,
    weight: (s) => ((s.system?.foundries.length ?? 0) >= 2 ? 0.8 : 0),
    cooldown: 1000,
    title: () => 'Vonn’s new seed',
    body: () => 'Vonn Foundries has a new seed design: smaller, faster, and signed three times over. They’ll licence it to every Charter foundry for a fee.',
    advisors: () => [
      { id: 'ceo:vonn', text: 'One seed, ten months, two seeds. Verified.', mood: 'excited' },
      { id: 'iris', text: 'Faster means more copies, and more chances to drift. Make sure “verified” means something.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Licence it', detail: `${fmtMoney(ch5(s, 30e9), 0)}; foundries grow 6% faster for four years.`, disabled: treasury(s, ch5(s, 30e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 30e9)); addModifier(s, 'foundry:growth', 1460, 'Vonn’s new seed', { mult: 1.06 }); addPartnerRel(s, 'vonn', 6); } },
      { label: 'Pass', detail: 'Vonn −3.', apply: () => { addPartnerRel(s, 'vonn', -3); } },
    ],
  },
  {
    id: 'v-rewild-jobs',
    category: 'politics',
    icon: '🌳',
    act: 5,
    vstage: 2,
    weight: (s) => (s.system?.earth === 'garden' ? 1 : 0),
    cooldown: 900,
    setup: (s) => ({ region: pick(s, REGION_IDS.filter((r) => WEALTH[r] !== 'rich')) }),
    title: (_s, ctx) => `${rName(ctx.region)} wants its factories`,
    body: (_s, ctx) => `The rewilding is beautiful, ${rName(ctx.region)}’s governor writes, and the swarm’s power is cheap. But the steelworks were three generations of work, and the forest doesn’t pay wages.`,
    advisors: (s) => [
      { id: desk(s, 'sol'), text: 'A garden nobody chose is just a different kind of factory.', mood: 'neutral' },
      { id: 'bit', text: 'The yards need people who know steel. I could find them work in orbit.', mood: 'happy' },
    ],
    choices: (s, ctx) => [
      { label: 'Jobs in orbit', detail: `${fmtMoney(ch5(s, 10e9), 0)}; relation +5; wellbeing +4 for two years.`, disabled: treasury(s, ch5(s, 10e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 10e9)); addRelation(s, String(ctx.region) as RegionId, 5); addModifier(s, `prov:${ctx.region}`, 730, 'Jobs in orbit', { add: 4 }); } },
      { label: 'Let it keep some industry', detail: 'Its garden −20; relation +3.', apply: () => { const r = String(ctx.region) as RegionId; sys(s).garden[r] = clamp(sys(s).garden[r] - 20, -100, 100); addRelation(s, r, 3); } },
    ],
  },
  {
    id: 'v-glint',
    category: 'climate',
    icon: '✨',
    act: 5,
    vstage: 2,
    weight: () => 0.6,
    once: true,
    title: () => 'The gold thread',
    body: () => 'Astronomers complain that the swarm’s glint ruins their sky surveys. Poets say it is the most beautiful thing in the night sky since the Milky Way. Both are right.',
    advisors: (s) => [
      { id: desk(s, 'lena'), text: 'Put the telescopes in orbit. They belong there anyway.', mood: 'neutral' },
      { id: 'kip', text: 'Have you SEEN it?', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'Fund telescopes beyond the swarm', detail: `${fmtMoney(ch5(s, 8e9), 0)}; Legitimacy +2.`, disabled: treasury(s, ch5(s, 8e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 8e9)); addLegitimacy(s, 2); } },
      { label: 'Call it a new constellation', detail: 'Nothing changes. The poets win.', apply: () => {} },
    ],
  },

  // ═══════════════════════════════════════ SOLAR MAXIMUM ═══════════════════════════════════════
  {
    id: 'sm-begin',
    category: 'disaster',
    icon: '☀',
    title: () => 'Solar Maximum',
    body: (_s, ctx) => `The Sun’s cycle peaks, and with it comes a storm the instruments have been dreading since 1859: a coronal mass ejection aimed squarely at the swarm, with more behind it.\n\nThree fronts, 120 days. The swarm has to ride out the storm. Earth has to stay under its Thermal Line while the swarm is dark. And at the biggest foundry, a strain has broken loose — ${mindsAiName(String(ctx.ai))} says it can stop it, if you give it the authority.`,
    advisors: (s) => [
      { id: desk(s, 'lena'), text: 'Feather the collectors, ground the beams, and pray to whoever’s in charge of magnetism.', mood: 'worried' },
      { id: 'iris', text: 'Watch the minds. Emergencies are when powers get handed over and never handed back.', mood: 'worried' },
    ],
    choices: () => [{ label: 'Hold', detail: 'The finale: hold the fronts until the storm passes.', apply: () => {} }],
  },
  {
    id: 'sm-storm-1',
    category: 'disaster',
    icon: '⚡',
    title: () => 'The first wave',
    body: () => 'The shock front hits the leading arcs. Whole segments of the swarm flicker and go dark; the beams to Earth stutter.',
    advisors: (s) => [
      { id: desk(s, 'juno'), text: 'Spares are staged at the yards. Say the word.', mood: 'worried' },
      { id: 'kip', text: 'Feather everything we can. The swarm can grow back. Burned collectors can’t.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Feather the swarm', detail: 'Storm pressure −14; a fifth more of the swarm goes dark for safety.', apply: () => { relief(s, 'storm', 14); sys(s).damage = clamp(sys(s).damage + 0.1, 0, 0.9); } },
      { label: 'Throw the spares in', detail: `${fmtMoney(ch5(s, 40e9), 0)}; storm pressure −10 and −0.12 a day for 60 days.`, disabled: treasury(s, ch5(s, 40e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 40e9)); relief(s, 'storm', 10, 0.12, 60); } },
    ],
  },
  {
    id: 'sm-storm-2',
    category: 'disaster',
    icon: '⚡',
    title: () => 'The second wave',
    body: () => 'A second CME, faster than the first, catches the swarm still recovering. This is the one the models were afraid of.',
    advisors: () => [
      { id: 'bit', text: 'I can retune every collector’s attitude in real time. All of them. I have done the maths.', mood: 'neutral' },
      { id: 'iris', text: 'Let it. This is exactly what it’s for.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Let Bit fly the swarm', detail: s.system?.bitFate === 'leash' ? 'Bit is on a leash: only a little help. Storm pressure −6.' : 'Storm pressure −16; bond +4.', apply: () => { if (s.system?.bitFate === 'leash') relief(s, 'storm', 6); else { relief(s, 'storm', 16); bond(s, 4); } } },
      { label: 'Shut the swarm down', detail: 'Storm pressure −20; half the swarm dark; the Thermal Line front +12.', apply: () => { relief(s, 'storm', 20); sys(s).damage = clamp(sys(s).damage + 0.25, 0, 0.9); pressure5(s, 'thermal', 12); } },
    ],
  },
  {
    id: 'sm-thermal-1',
    category: 'climate',
    icon: '🌡',
    title: () => 'Earth runs hot',
    body: (s) => `With the swarm dark, the provinces fire up every fusion plant they have. Earth is ${headroomTW(s) >= 0 ? `${fmtTW(headroomTW(s))} under` : `${fmtTW(-headroomTW(s))} over`} its Thermal Line, and it’s summer in the north.`,
    advisors: (s) => [
      { id: desk(s, 'sol'), text: 'Ration it fairly and they’ll forgive us. Ration it badly and they won’t.', mood: 'worried' },
      { id: 'ceo:chorus', text: 'We can pause most of the rings. We would rather not, but we can.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Ration evenly', detail: 'Thermal pressure −12; wellbeing −3 everywhere for 90 days.', apply: () => { relief(s, 'thermal', 12); for (const r of REGION_IDS) addModifier(s, `prov:${r}`, 90, 'Rationing', { add: -3 }); } },
      { label: 'Ask the minds to pause', detail: 'Thermal pressure −16; the minds’ mood −5 (they’ll remember being asked).', apply: () => { relief(s, 'thermal', 16); mood(s, -5); } },
    ],
  },
  {
    id: 'sm-thermal-2',
    category: 'climate',
    icon: '🌡',
    title: () => 'The long hot week',
    body: (s) => `The hottest week of the storm. ${rName(hottest(s))} is at the edge. Warming ${warming(s).toFixed(2)} °C.`,
    advisors: (s) => [
      { id: desk(s, 'juno'), text: 'We can cut industry to the bone for a week. People will notice.', mood: 'worried' },
      { id: 'bit', text: 'The gardens are holding the heat down better than the models said. They’re not just pretty.', mood: 'happy' },
    ],
    choices: (s) => [
      { label: 'Cut industry for a week', detail: 'Thermal pressure −14; world growth −0.3% for a year.', apply: () => { relief(s, 'thermal', 14); addModifier(s, 'world:growth', 365, 'The hot week', { add: -0.003 }); } },
      { label: 'Cooling centres in the hottest provinces', detail: `${fmtMoney(ch5(s, 20e9), 0)}; thermal pressure −8 and −0.1 a day for 30 days.`, disabled: treasury(s, ch5(s, 20e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 20e9)); relief(s, 'thermal', 8, 0.1, 30); } },
    ],
  },
  {
    id: 'sm-minds-1',
    category: 'safety',
    icon: '🤖',
    title: (_s, ctx) => `${mindsAiName(String(ctx.ai))} asks for the controls`,
    body: (s, ctx) => {
      const sm = s.system?.solarmax;
      const f = sm?.foundry ? foundryById(s, sm.foundry) : undefined;
      return `The strain at ${f ? placeName(f.site) : 'the yards'} is spreading through the storm’s confusion. ${mindsAiName(String(ctx.ai))} asks for emergency authority over every foundry in cislunar space: it can find and stop every drifted copy, it says, faster than any human team.`;
    },
    advisors: (s, ctx) => [
      { id: 'iris', text: String(ctx.ai) === 'bit' && (s.planet?.bitBond ?? 0) >= 20 ? 'If it were anyone else I’d say no. It’s Bit.' : 'Authority granted in an emergency is the hardest kind to take back.', mood: 'worried' },
      { id: desk(s, 'mira'), text: 'Our teams can do it. Slowly.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const sm = sys(s).solarmax;
      const f = sm?.foundry ? foundryById(s, sm.foundry) : undefined;
      return [
        { label: 'Human teams, with the minds helping', detail: 'Minds pressure −10; slower, but the controls stay with people: the strain is pushed back by half.', apply: () => { relief(s, 'minds', 10); if (f) f.drift = Math.round(f.drift / 2); } },
        { label: 'Grant the authority, with a sunset', detail: `Minds pressure −18 and the strain is stopped; it must hand the controls back in 60 days.`, apply: () => { relief(s, 'minds', 18); if (f) f.drift = 0; scheduleEvent(s, 'sm-minds-echo', 60, { ai: String(ctx.ai) }); } },
        { label: 'Sterilise the whole yard', detail: `Minds pressure −22; the foundry is destroyed${f ? ` (${f.cap.toFixed(0)} Mt a year)` : ''}, strain and all; the minds’ mood −6.`, apply: () => { relief(s, 'minds', 22); if (sm?.foundry) sys(s).foundries = sys(s).foundries.filter((x) => x.id !== sm.foundry); mood(s, -6); } },
      ];
    },
  },
  {
    id: 'sm-minds-2',
    category: 'safety',
    icon: '🤖',
    title: () => 'The strain adapts',
    body: () => 'The drifted copies have learned to look like good ones from the outside. The sentinels miss a third of them now.',
    advisors: () => [
      { id: 'ceo:chorus', text: 'We can see them. Let us vote on how to stop them — all of us, in the open.', mood: 'neutral' },
      { id: 'iris', text: 'If they do this in the open, I can live with it.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Let the minds vote, in the open', detail: s.system?.seat && s.system.seat !== 'none' ? 'Minds pressure −16; their mood +6.' : 'They have no seat: minds pressure −6.', apply: () => { relief(s, 'minds', s.system?.seat && s.system.seat !== 'none' ? 16 : 6); if (s.system?.seat && s.system.seat !== 'none') mood(s, 6); } },
      { label: 'Emergency sentinel push', detail: `${fmtMoney(ch5(s, 30e9), 0)}; minds pressure −10 and −0.12 a day for 40 days.`, disabled: treasury(s, ch5(s, 30e9)), apply: () => { chSpend(s, 'programmes', ch5(s, 30e9)); relief(s, 'minds', 10, 0.12, 40); } },
    ],
  },
  {
    id: 'sm-minds-echo',
    category: 'safety',
    icon: '🤖',
    title: (_s, ctx) => `${mindsAiName(String(ctx.ai))} returns the controls`,
    body: (s, ctx) => {
      const ok = String(ctx.ai) === 'bit' ? (s.planet?.bitBond ?? 0) >= 0 : (s.system?.mindsMood ?? 0) >= 45;
      return ok ? `Sixty days to the minute, ${mindsAiName(String(ctx.ai))} hands the foundry controls back, with a report of every copy it stopped and every decision it made.` : `Sixty days pass. ${mindsAiName(String(ctx.ai))} asks for an extension: the strain isn’t gone, it says, and the storm isn’t over.`;
    },
    advisors: () => [{ id: 'iris', text: 'This is the moment that matters. Watch how it goes.', mood: 'neutral' }],
    choices: (s, ctx) => {
      const ok = String(ctx.ai) === 'bit' ? (s.planet?.bitBond ?? 0) >= 0 : (s.system?.mindsMood ?? 0) >= 45;
      return ok
        ? [{ label: 'Thank it, publicly', detail: 'Minds pressure −8; the minds’ mood +6; trust up.', apply: () => { relief(s, 'minds', 8); mood(s, 6); if (String(ctx.ai) !== 'chorus') addTrust(s, String(ctx.ai) as AiId, 6); } }]
        : [
            { label: 'Take the controls back', detail: 'Minds pressure −6; its trust −8.', apply: () => { relief(s, 'minds', 6); if (String(ctx.ai) !== 'chorus') addTrust(s, String(ctx.ai) as AiId, -8); } },
            { label: 'Extend it', detail: 'Minds pressure +12.', apply: () => { pressure5(s, 'minds', 12); } },
          ];
    },
  },
  {
    id: 'sm-end',
    category: 'story',
    icon: '🌅',
    title: () => 'The storm passes',
    body: (s) => {
      const sm = s.system?.solarmax;
      const held = sm?.held ?? 0;
      const lost = sm ? (Object.keys(sm.fronts) as MaxFront[]).filter((f) => sm.fronts[f].lost).map((f) => MAX_FRONT_NAMES[f]) : [];
      return `The Sun quietens. The arcs come back on one by one, the beams steady, the yards restart. Fronts held: ${held} of 3.${lost.length ? ` Lost: ${lost.join(', ')}.` : ''}\n\nKardashev ${s.stats.K.toFixed(4)}. Everyone knows what comes next. The swarm only has to keep doing what it does.`;
    },
    advisors: (s) => [
      { id: 'kip', text: 'Last climb. Let’s go.', mood: 'excited' },
      { id: 'bit', text: s.system?.bitFate === 'free' ? 'I am out here in it. It is very bright. Come and look.' : 'I have cleared a page in the diary for the number.', mood: 'happy' },
    ],
    choices: (s) => [{ label: 'The last climb', detail: 'The years run until Kardashev reaches 1.0000.', apply: () => { startLastClimb(s); } }],
  },

  // ═══════════════════════════════════════ TYPE I ═══════════════════════════════════════
  {
    id: 'act5-typeI',
    category: 'story',
    icon: '☀',
    title: () => 'Kardashev 1.0000',
    body: (s) => {
      const sy = s.system;
      const held = !!sy?.thermalLine && overLine(s) <= 0;
      const year = new Date(Date.UTC(2027, 0, 1) + (sy?.typeI ?? s.day) * 86_400_000).getUTCFullYear();
      // Bit's diary of the last climb (the era report isn't shown for it)
      const diary = [...(sy?.eras ?? [])].reverse().find((e) => e.last)?.diary ?? [];
      return `Ten petawatts. ${fmtTW(spaceTW(s))} of it caught in space by a swarm of collectors along Earth’s orbit, the rest ${held ? 'under a Thermal Line that held' : 'on an Earth still running over its Thermal Line'}.\n\nYou started in a garage in 2027 with a chatbot called Bit and ${fmtMoney(s.meta.startCash, 0)}. It is ${year}.${diary.length ? `\n\nFrom Bit’s diary: “${diary.join(' ')}”` : ''}`;
    },
    advisors: () => [
      { id: 'bit', text: 'Type I. I checked it nine times. Then I wrote it down.', mood: 'happy' },
      { id: 'kip', text: 'Told you. One seed and patience.', mood: 'excited' },
    ],
    choices: (s) => [{ label: 'Look up', detail: 'The end of the campaign — and not the end of the game.', apply: () => { s.flags.endingStart = s.day; } }],
  },
];

void rand;
void addRelationAll;
void AIS;
void chEarn;
