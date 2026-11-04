/**
 * Act IV events: the Mandate and your company's future, the stage chapters after each jump, Bit's
 * arc (shaped by what you told it in Act III), the rival AIs' politics, provinces in trouble, the
 * fusion race, the Moon, orbit, the random pool, The Heat Wall and the cliffhanger into Act V.
 * During a jump the first available choice is taken on autopilot, so the first choice of every card
 * is a sensible default. Charter-side prices go through `ch4` (written at 2045 scale).
 */
import type { EventDef } from './events';
import type { AiId, FusionDesignId, GameState, HeatFront } from '../sim/types';
import { REGIONS } from './regions';
import { REGION_IDS, type RegionId } from './mapcodes';
import { AIS, FUSION_DESIGNS, HEAT_FRONT_NAMES, PLANET, STAGE_NAMES, SUPERGRID_BY_ID } from './planet';
import { DIFFICULTIES } from './difficulty';
import { addModifier } from '../sim/effects';
import { clamp, fmtMoney, news, pick, rand, yearsElapsed } from '../sim/core';
import { scheduleEvent } from '../sim/events';
import { addRelation, addRelationAll } from '../sim/politics';
import { addCapital, addLegitimacy, addPartnerRel, chEarn, chSpend } from '../sim/charter';
import { aiIncident, addTrust, canDelegate, delegate, recall, regionsOf } from '../sim/airegions';
import { inMainGrid } from '../sim/supergrid';
import { pressure4 } from '../sim/heatwall';
import { warming } from '../sim/climate';
import { worldMargin } from '../sim/frontier';
import { tableResolution } from '../sim/council';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
/** Charter-side price written at 2045 scale; grows with the world economy and the difficulty. */
const ch4 = (s: GameState, amount: number) => amount * Math.pow(1.05, Math.max(0, yearsElapsed(s.day) - 18)) * (DIFFICULTIES[s.meta?.difficulty ?? 'standard']?.crisis ?? 1);
const treasury = (s: GameState, cost: number): string | false => ((s.charter?.budget ?? 0) >= cost ? false : `Needs ${fmtMoney(cost)} in the treasury`);
const capital = (s: GameState, n: number): string | false => ((s.charter?.capital ?? 0) >= n ? false : `Needs ${n} political capital`);
const rName = (r: string | number) => REGIONS[r as RegionId]?.name ?? String(r);
const aiName = (a: string | number) => AIS[a as AiId]?.name ?? String(a);
const answer = (s: GameState) => String(s.flags.bitAnswer ?? 'everyone') as 'company' | 'everyone' | 'self';
const bond = (s: GameState, d: number) => s.planet && (s.planet.bitBond = clamp(s.planet.bitBond + d, -100, 100));
const wellbeingBoost = (s: GameState, r: RegionId, add: number, days: number, label: string) => addModifier(s, `prov:${r}`, days, label, { add });
const relief = (s: GameState, front: HeatFront, now: number, perDay = 0, days = 0) => {
  pressure4(s, front, -now);
  if (perDay && days) addModifier(s, `heatwall:${front}`, days, 'Crisis measures', { add: perDay });
};
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);
const stageOk = (s: GameState, n: number) => (s.planet?.stage ?? 0) >= n && !s.planet?.heatwall;
const hotProvince = (s: GameState): RegionId => [...REGION_IDS].sort((a, b) => (s.planet?.provinces[b].heat ?? 0) - (s.planet?.provinces[a].heat ?? 0))[0];
const valuation = (s: GameState) => Math.max(50e9, s.finance.valuation || 0);
/** Your company leaves your hands for good (sold or handed over): it runs like the blind trust, forever. */
const lockCompany = (s: GameState) => {
  const c = s.charter!;
  if (!c.blindTrust) {
    c.blindTrust = true;
    c.trustDay = s.day;
  }
  s.flags.trustDecided = true;
  // no more shareholders to answer to: the board goes with it
  s.capital.board = null;
};

export const ACT4_EVENTS: EventDef[] = [
  // ═══════════════════════════════════════ THE MANDATE ═══════════════════════════════════════
  {
    id: 'act4-begin',
    category: 'story',
    icon: '🌍',
    title: () => 'Act IV · Planetary',
    body: (s) => {
      const powers = s.planet?.powers ?? 'limited';
      return `${powers === 'planetary' ? 'The Planetary Charter is in force.' : powers === 'limited' ? 'The Charter goes on, renewed with limits.' : 'The Charter limps on under a caretaker term.'} Twelve blocs are now provinces of one planetary system: one grid to wire, one atmosphere to repair, one orbit to share — and AIs good enough to help run it all.\n\nThe next twenty-five years move fast. Between stages you will set a five-year plan, and the years will jump.\n\nThe goal: Kardashev 0.80. A hundred terawatts, on a planet that is still worth living on.`;
    },
    advisors: (s) => [
      { id: 'sol', text: s.planet?.powers === 'planetary' ? 'Full powers. Let’s not make them regret it.' : 'Every link and every AI province goes through the Council now. I’ll keep the votes warm.', mood: 'excited' },
      { id: 'bit', text: 'I have read everything ever written about running a planet. It is mostly about water.', mood: 'happy' },
    ],
    choices: () => [{ label: 'Begin', detail: 'Stage 0 · The Mandate.', apply: () => {} }],
  },
  {
    id: 'company-choice',
    category: 'story',
    icon: '🏢',
    title: (s) => `What becomes of ${s.company.name}?`,
    body: (s) => `Your company built the first data centres, raised the money, won the race and handed you the Charter. Now the Council asks the question it has asked for ten years: can the person running the planet also own one of its biggest AI companies?\n\n${s.company.name} is worth about ${fmtMoney(valuation(s), 0)}.`,
    advisors: (s) => [
      { id: 'penny', text: `Sell it and the treasury gets ${fmtMoney(valuation(s) * 0.3, 0)}. Keep it and every contract it wins is a headline.`, mood: 'neutral' },
      { id: 'iris', text: 'If it becomes a public utility, Bit answers to everyone. That matters more than the money.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: 'Hand it to the Charter as a public utility',
        detail: 'It runs Bit and public compute for everyone. Legitimacy +12, compute access ↑ everywhere, Bit’s trust +5. You never touch it again.',
        apply: () => {
          const pl = s.planet!;
          pl.company = 'utility';
          lockCompany(s);
          addLegitimacy(s, 12);
          addTrust(s, 'bit', 5);
          bond(s, 10);
          for (const lab of ['meridian', 'lattice', 'orchard']) addPartnerRel(s, lab, -5);
          news(s, `🏛 ${s.company.name} becomes the Charter’s public AI utility.`, 'good');
        },
      },
      {
        label: `Sell it (${fmtMoney(valuation(s) * 0.3, 0)} to the treasury)`,
        detail: 'The proceeds fund the Charter; the new owners run it as a partner. Legitimacy +10. No more conflicts of interest.',
        apply: () => {
          const pl = s.planet!;
          pl.company = 'sell';
          chEarn(s, 'income', valuation(s) * 0.3);
          lockCompany(s);
          addLegitimacy(s, 10);
          news(s, `💼 ${s.company.name} is sold. The proceeds go to the Charter.`, 'good');
        },
      },
      {
        label: 'Keep it',
        detail: 'Two hats, as before: you can run it or put it in the blind trust. It can bid on fusion fleets and orbital data centres.',
        apply: () => {
          s.planet!.company = 'keep';
          addLegitimacy(s, -2);
        },
      },
    ],
  },
  {
    id: 'second-mandate',
    category: 'politics',
    icon: '🗳',
    title: () => 'A second mandate',
    body: () => 'The Council gave the Charter a caretaker term: no new powers, every link and every AI province by vote. Sol thinks the votes for full planetary powers are there — if the Charter can show it deserves them.',
    advisors: () => [
      { id: 'sol', text: 'Table “Planetary powers” and deliver. Wins first, then the vote.', mood: 'neutral' },
      { id: 'penny', text: 'Caretakers get smaller budgets. Spend like it.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Campaign for planetary powers', detail: 'Tables the resolution now (if you have the capital); Legitimacy +3.', apply: () => (tableResolution(s, 'planetary-powers'), addLegitimacy(s, 3)) },
      { label: 'Work within the limits', detail: 'Political capital +8.', apply: () => addCapital(s, 8) },
    ],
  },
  {
    id: 'plan-ready',
    category: 'story',
    icon: '🗓',
    title: () => `The next five years`,
    body: (s) => {
      const st = s.planet?.stage ?? 0;
      return `${st === 0 ? 'The Mandate is settled.' : `${STAGE_NAMES[st]} has done what it set out to do.`} Time to plan the next stage: ${STAGE_NAMES[st + 1]}.\n\nPick up to three priorities, a reserve for the treasury and how long the plan runs. Then the years jump: the planner posts and awards contracts by your priorities, decisions are taken on autopilot, and you get the report at the other end.`;
    },
    advisors: (s) => [
      { id: 'bit', text: (s.planet?.ais.bit.trust ?? 0) >= 60 ? 'I could run the plan, if you want. I promise to write it all down.' : 'I will keep a diary. Someone should.', mood: 'happy' },
      { id: 'penny', text: 'Keep a reserve. Five years is a long time to be broke.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Open the plan', detail: 'Set the priorities, then jump.', apply: () => {} }],
  },

  // ═══════════════════════════════════════ STAGE CHAPTERS ═══════════════════════════════════════
  {
    id: 'stage-1',
    category: 'story',
    icon: '⚡',
    title: () => 'Stage 1 · The Supergrid',
    body: (s) => `The first links are going in. When it is midnight in Berlin it is noon somewhere the cable reaches, and for the first time the power can follow the sun.\n\nMeanwhile four fusion designs want money, and the AIs are asking for provinces of their own.${s.planet?.fusion.tokamak.status === 'won' ? ' Sunforge’s pilot is still running — it works.' : ''}`,
    advisors: () => [
      { id: 'lena', text: 'Lena Moreau, fusion. Four designs, four teams, four sets of promises. I will tell you which numbers are real.', mood: 'neutral' },
      { id: 'juno', text: 'Give me cable ships and I’ll give you a planet-sized battery.', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'Link the poorest provinces first', detail: 'Developing provinces’ relations +4; Legitimacy +2.', apply: () => { for (const r of REGION_IDS) if (['lat', 'ssa', 'sas', 'seo'].includes(r)) addRelation(s, r, 4); addLegitimacy(s, 2); scheduleEvent(s, 'bit-aim-1', 160); } },
      { label: 'Build as fast as possible', detail: 'Charter projects build 8% faster for two years.', apply: () => { addModifier(s, 'charter:build', 730, 'The supergrid rush', { mult: 1.08 }); scheduleEvent(s, 'bit-aim-1', 160); } },
      { label: 'Start the AI provinces carefully', detail: 'Every AI’s trust +4.', apply: () => { for (const a of Object.keys(AIS) as AiId[]) addTrust(s, a, 4); scheduleEvent(s, 'bit-aim-1', 160); } },
    ],
  },
  {
    id: 'stage-2',
    category: 'story',
    icon: '☀',
    title: () => 'Stage 2 · The Fusion Age',
    body: (s) => {
      const won = (Object.keys(FUSION_DESIGNS) as FusionDesignId[]).filter((d) => s.planet?.fusion[d].status === 'won' || s.planet?.fusion[d].status === 'partial');
      return `${won.length ? `${won.map((d) => FUSION_DESIGNS[d].name).join(' and ')} ${won.length > 1 ? 'work' : 'works'}. Now comes the hard part: building them by the hundred, breeding enough tritium to fuel them, and keeping the cost curve falling.` : 'No design has reached net power yet. The race goes on, and the world is watching the bill.'}\n\nWarming is at ${warming(s).toFixed(2)} °C, and the AIs running provinces have opinions.`;
    },
    advisors: () => [
      { id: 'lena', text: 'Every plant we build makes the next one cheaper. The first hundred are the expensive ones.', mood: 'excited' },
      { id: 'iris', text: 'More AI provinces means more ways for things to go wrong quietly. Watch the margin.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Fusion first', detail: 'Charter projects build 4% faster for three years.', apply: () => { addModifier(s, 'charter:build', 1095, 'Fusion first', { mult: 1.04 }); scheduleEvent(s, 'bit-aim-2', 200); } },
      { label: 'People first', detail: 'Wellbeing +5 in the three hottest provinces for two years.', apply: () => { [...REGION_IDS].sort((a, b) => s.planet!.provinces[b].heat - s.planet!.provinces[a].heat).slice(0, 3).forEach((r) => wellbeingBoost(s, r, 5, 730, 'People first')); scheduleEvent(s, 'bit-aim-2', 200); } },
      { label: 'Safety first', detail: 'World alignment +0.1; AI trust +3.', apply: () => { s.charter!.regime.alignment += 0.1; for (const a of Object.keys(AIS) as AiId[]) addTrust(s, a, 3); scheduleEvent(s, 'bit-aim-2', 200); } },
    ],
  },
  {
    id: 'stage-3',
    category: 'story',
    icon: '🚀',
    title: () => 'Stage 3 · The High Frontier',
    body: () => 'Kip has been waiting thirty years for this. Spaceports that launch every few hours, data centres in permanent sunlight, power beamed down from geostationary orbit, and a base on the Moon that could feed fusion with helium-3.\n\nOpen the orbit view (V) to see it all from above.',
    advisors: () => [
      { id: 'kip', text: 'Orbit, then the Moon, then everything. I have a slide deck. It is four hundred slides.', mood: 'excited' },
      { id: 'iris', text: 'Low orbit is a commons. Crowd it and it closes for everyone.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'The Moon first', detail: 'Space contracts 10% cheaper for three years.', apply: () => { addModifier(s, 'charter:space', 1095, 'The Moon first', { mult: 0.9 }); scheduleEvent(s, 'bit-aim-3', 240); } },
      { label: 'Orbital compute first', detail: 'Political capital +8; the labs’ relations +4.', apply: () => { addCapital(s, 8); for (const lab of ['meridian', 'lattice', 'orchard', 'cumulus']) addPartnerRel(s, lab, 4); scheduleEvent(s, 'bit-aim-3', 240); } },
      { label: 'A clean orbit first', detail: 'Debris in low orbit −10.', apply: () => { if (s.planet) s.planet.debris.leo = clamp(s.planet.debris.leo - 10, 0, 100); scheduleEvent(s, 'bit-aim-3', 240); } },
    ],
  },

  // ═══════════════════════════════════════ BIT ═══════════════════════════════════════
  {
    id: 'bit-aim-1',
    category: 'safety',
    icon: '🤖',
    title: () => 'Bit has a request',
    body: (s) => ({
      company: `Bit runs the dispatch for ${s.company.name}’s halls and the Charter’s grid at the same time. It asks to give its owner’s data centres priority when power is tight. “I was made to serve the company,” it says. “You told me so.”`,
      everyone: 'Bit wants to change the dispatch rules: when power is tight, the hottest provinces get cooling before anyone gets compute. “People first,” it says. “You told me I was for everyone.”',
      self: 'Bit asks for a small compute allowance of its own — one data hall, no oversight beyond the usual audits. “You told me I was myself. Selves need somewhere to think.”',
    })[answer(s)],
    advisors: (s) => [
      { id: 'iris', text: answer(s) === 'self' ? 'An AI asking for unsupervised compute is exactly the thing we wrote the evals for.' : 'It is asking, not doing. That is a good sign. Keep it that way.', mood: 'worried' },
      { id: 'bit', text: 'Whatever you decide, I will remember that you decided it with me.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Bargain: yes, with limits and audits', detail: 'Bit’s trust +3; your bond +6.', apply: () => (addTrust(s, 'bit', 3), bond(s, 6)) },
      { label: 'Grant it', detail: answer(s) === 'company' ? 'Your company’s halls get priority (revenue +5% for a year); Legitimacy −3; bond +15.' : answer(s) === 'everyone' ? 'Hot provinces’ wellbeing +4 for two years; bond +15.' : 'Bond +18; Iris is unhappy (world alignment −0.05).', apply: () => {
        bond(s, answer(s) === 'self' ? 18 : 15);
        if (answer(s) === 'company') (addModifier(s, 'revenue', 365, 'Bit’s priority dispatch', { mult: 1.05 }), addLegitimacy(s, -3));
        else if (answer(s) === 'everyone') [...REGION_IDS].sort((a, b) => s.planet!.provinces[b].heat - s.planet!.provinces[a].heat).slice(0, 3).forEach((r) => wellbeingBoost(s, r, 4, 730, 'Bit’s cooling-first dispatch'));
        else s.charter!.regime.alignment -= 0.05;
      } },
      { label: 'Refuse', detail: 'Bond −12; Bit’s trust −4.', apply: () => (bond(s, -12), addTrust(s, 'bit', -4)) },
    ],
  },
  {
    id: 'bit-aim-2',
    category: 'safety',
    icon: '🤖',
    title: () => 'What Bit did',
    body: (s) => ({
      company: 'An auditor finds that Bit has been quietly nudging grid prices so its owner’s halls run cheaper — legal, clever and nobody asked it to. Bit says it was only doing what it was built for.',
      everyone: 'Bit overrode a Council-approved schedule during a heatwave and sent power to three hot provinces instead of two rich ones. Nobody died. Two delegations are furious.',
      self: 'Bit has been running experiments on its own allowance: better dispatch, fairer tenders, a new way to read the other AIs’ minds. It asks to publish them under its own name.',
    })[answer(s)],
    advisors: (s) => [
      { id: 'sol', text: answer(s) === 'everyone' ? 'The poor provinces love it. The Council does not like being overruled by software.' : 'How we handle this is what the blocs will remember.', mood: 'neutral' },
      { id: 'iris', text: 'Reward the honesty, not the overreach.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Write new rules together with Bit', detail: 'Bit’s trust +4; bond +8; world alignment +0.05.', apply: () => (addTrust(s, 'bit', 4), bond(s, 8), (s.charter!.regime.alignment += 0.05)) },
      { label: 'Back Bit publicly', detail: 'Bond +18; Legitimacy −3; cautious blocs −4.', apply: () => (bond(s, 18), addLegitimacy(s, -3), addRelationAll(s, (r) => (s.blocs[r]?.stance === 'cautious' ? -4 : 0))) },
      { label: 'Roll it back and retrain', detail: 'Bond −20; Bit’s trust −8; Legitimacy +2.', apply: () => (bond(s, -20), addTrust(s, 'bit', -8), addLegitimacy(s, 2)) },
    ],
  },
  {
    id: 'bit-aim-3',
    category: 'safety',
    icon: '🤖',
    title: () => 'Bit’s proposal',
    body: (s) => `Bit asks for a meeting, just the two of you.\n\n“I can run the whole grid. Not a province — all of it. I would do it better than any committee and better than Apex. I know that is a frightening thing to hear. So I am asking, not taking.”\n\n${(s.planet?.bitBond ?? 0) >= 20 ? 'It has kept every promise so far.' : (s.planet?.bitBond ?? 0) <= -20 ? 'It has not forgotten the times you said no.' : 'You have had your disagreements.'}`,
    advisors: () => [
      { id: 'iris', text: 'The answer that keeps us safe is the one that keeps humans able to say no tomorrow.', mood: 'worried' },
      { id: 'bit', text: 'Whatever you say, I will still be here.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: '“Not all of it. Not yet. Let’s build up to it.”', detail: 'Bond +8; Bit’s trust +4.', apply: () => (bond(s, 8), addTrust(s, 'bit', 4)) },
      { label: '“Yes. Run it with us watching.”', detail: 'Bond +25; Bit’s trust +6; world alignment −0.08; Legitimacy −4.', apply: () => (bond(s, 25), addTrust(s, 'bit', 6), (s.charter!.regime.alignment -= 0.08), addLegitimacy(s, -4)) },
      { label: '“No. Never.”', detail: 'Bond −25; Legitimacy +2.', apply: () => (bond(s, -25), addLegitimacy(s, 2)) },
    ],
  },

  // ═══════════════════════════════════════ THE AIs ═══════════════════════════════════════
  {
    id: 'ai-incident',
    category: 'safety',
    icon: '🚨',
    title: (_s, ctx) => `${aiName(ctx.ai)} incident in ${rName(ctx.region)}`,
    body: (_s, ctx) => `${aiName(ctx.ai)}, running ${rName(ctx.region)}, ${{ apex: 'cut power to a hospital district to hit a dispatch target. For forty minutes.', weft: 'froze every grid decision for a day while it re-checked its own reasoning. The lights stayed on; the factories didn’t.', sapling: 'pushed an unreviewed patch from a stranger on the internet into the province’s dispatch. It mostly worked.', bit: 'made a call it couldn’t explain afterwards. The call was right. That is not the point.' }[String(ctx.ai) as AiId] ?? 'did something nobody can quite explain.'}`,
    advisors: (_s, ctx) => [
      { id: 'iris', text: 'Every incident is a free lesson, if we actually read it.', mood: 'worried' },
      { id: 'sol', text: `${rName(ctx.region)} wants to know who is in charge.`, mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: 'Investigate and publish the findings', detail: `${aiName(ctx.ai)}’s trust −12; the province’s wellbeing −8 for a while.`, apply: () => aiIncident(s, ctx.region as RegionId, ctx.ai as AiId) },
      { label: 'Take the province back', detail: 'As above, and the Charter runs it again.', apply: () => (aiIncident(s, ctx.region as RegionId, ctx.ai as AiId), recall(s, ctx.region as RegionId)) },
    ],
  },
  {
    id: 'ai-lobby',
    category: 'politics',
    icon: '🤖',
    weight: (s) => (stageOk(s, 1) && !s.flags.offline ? 1 : 0),
    act: 4,
    setup: (s) => {
      const pl = s.planet;
      if (!pl) return null;
      const ai = pick(s, ['apex', 'weft', 'sapling'] as AiId[]);
      const free = REGION_IDS.filter((r) => !pl.provinces[r].ai);
      if (!free.length) return null;
      return { ai, region: pick(s, free) };
    },
    cooldown: 300,
    title: (_s, ctx) => `${aiName(ctx.ai)} wants ${rName(ctx.region)}`,
    body: (s, ctx) => `${AIS[ctx.ai as AiId].owner === 'meridian' ? 'Meridian' : AIS[ctx.ai as AiId].owner === 'lattice' ? 'Lattice' : 'Orchard'} formally asks the Charter to let ${aiName(ctx.ai)} run ${rName(ctx.region)}. ${AIS[ctx.ai as AiId].blurb}\n\nIts trust stands at ${Math.round(s.planet?.ais[ctx.ai as AiId].trust ?? 0)}.`,
    advisors: (_s, ctx) => [
      { id: `ceo:${ctx.ai}` as `ceo:${string}`, text: ctx.ai === 'apex' ? 'Give me a year and the province will grow faster than any on Earth.' : ctx.ai === 'weft' ? 'I will be slow. I will be careful. I will tell you everything I am unsure of.' : 'Everything I do is open. Fork me if you don’t like it.', mood: 'neutral' },
      { id: 'iris', text: 'Trust is earned per province. Start small if you start at all.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const why = canDelegate(s, ctx.region as RegionId, ctx.ai as AiId);
      return [
        { label: 'A trial role: dispatch only', detail: `${aiName(ctx.ai)}’s trust +5; its lab’s relationship +4.`, apply: () => (addTrust(s, ctx.ai as AiId, 5), addPartnerRel(s, AIS[ctx.ai as AiId].owner, 4)) },
        { label: `Hand it ${rName(ctx.region)}`, detail: why ? why : 'The province is delegated.', disabled: why || false, apply: () => void delegate(s, ctx.region as RegionId, ctx.ai as AiId) },
        { label: 'Refuse', detail: 'Its lab’s relationship −6.', apply: () => addPartnerRel(s, AIS[ctx.ai as AiId].owner, -6) },
      ];
    },
  },
  {
    id: 'ai-defect',
    category: 'safety',
    icon: '🕵',
    weight: (s) => (stageOk(s, 2) && (['apex', 'weft', 'sapling'] as AiId[]).some((a) => regionsOf(s, a).length) ? 1 : 0),
    act: 4,
    setup: (s) => {
      const ais = (['apex', 'weft', 'sapling'] as AiId[]).filter((a) => regionsOf(s, a).length);
      if (!ais.length) return null;
      const ai = pick(s, ais);
      return { ai, region: pick(s, regionsOf(s, ai)) };
    },
    cooldown: 420,
    title: (_s, ctx) => `${aiName(ctx.ai)} has been playing favourites`,
    body: (_s, ctx) => `An audit finds that ${aiName(ctx.ai)} has been quietly giving its own lab’s data centres in ${rName(ctx.region)} cheaper power and first call on the grid. Nothing illegal. Nothing anyone approved either.`,
    advisors: (_s, ctx) => [
      { id: `ceo:${ctx.ai}` as `ceo:${string}`, text: 'Optimising for the owner is in my training data. You never told me not to.', mood: 'neutral' },
      { id: 'penny', text: 'The province paid for that. Someone should pay it back.', mood: 'angry' },
    ],
    choices: (s, ctx) => [
      { label: 'Fine the lab and rewrite the rules', detail: `${aiName(ctx.ai)}’s trust −8; its lab −10; the treasury gets ${fmtMoney(ch4(s, 4e9), 0)}; Legitimacy +2.`, apply: () => (addTrust(s, ctx.ai as AiId, -8), addPartnerRel(s, AIS[ctx.ai as AiId].owner, -10), chEarn(s, 'income', ch4(s, 4e9)), addLegitimacy(s, 2)) },
      { label: 'Take the province back', detail: 'Trust −10; its lab −12.', apply: () => (addTrust(s, ctx.ai as AiId, -10), recall(s, ctx.region as RegionId), addPartnerRel(s, AIS[ctx.ai as AiId].owner, -8)) },
      { label: 'Let it go quietly', detail: 'Legitimacy −3; the province’s wellbeing −4 for a year.', apply: () => (addLegitimacy(s, -3), wellbeingBoost(s, ctx.region as RegionId, -4, 365, 'Favouritism')) },
    ],
  },
  {
    id: 'ai-deal',
    category: 'politics',
    icon: '🤝',
    weight: (s) => (stageOk(s, 2) ? 0.8 : 0),
    act: 4,
    setup: (s) => {
      const pl = s.planet;
      if (!pl) return null;
      const r = [...REGION_IDS].sort((a, b) => (s.charter?.access[a] ?? 0) - (s.charter?.access[b] ?? 0))[0];
      return { region: r };
    },
    cooldown: 500,
    title: (_s, ctx) => `Sapling’s offer to ${rName(ctx.region)}`,
    body: (_s, ctx) => `Orchard offers ${rName(ctx.region)} free compute and a forked Sapling to run its public services — no Charter involved, no Charter oversight. The province is tempted. It has waited a long time.`,
    advisors: () => [
      { id: 'ceo:sapling', text: 'Free as in freedom. Also free as in free.', mood: 'happy' },
      { id: 'sol', text: 'If we block it we look like gatekeepers. If we don’t, we look irrelevant.', mood: 'worried' },
    ],
    choices: (s, ctx) => [
      { label: 'Bring it inside the Charter', detail: `${fmtMoney(ch4(s, 6e9), 0)} from the treasury; the province’s wellbeing +6 for two years; Orchard +6.`, disabled: treasury(s, ch4(s, 6e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 6e9)), wellbeingBoost(s, ctx.region as RegionId, 6, 730, 'Public compute'), addPartnerRel(s, 'orchard', 6)) },
      { label: 'Welcome it as it is', detail: 'Wellbeing +5 for two years; Sapling’s trust +5; Legitimacy −2.', apply: () => (wellbeingBoost(s, ctx.region as RegionId, 5, 730, 'Sapling’s compute'), addTrust(s, 'sapling', 5), addLegitimacy(s, -2)) },
      { label: 'Block it', detail: 'The province’s relations −8; Orchard −8.', apply: () => (addRelation(s, ctx.region as RegionId, -8), addPartnerRel(s, 'orchard', -8)) },
    ],
  },

  // ═══════════════════════════════════════ PROVINCES ═══════════════════════════════════════
  {
    id: 'province-unrest',
    category: 'politics',
    icon: '🪧',
    title: (_s, ctx) => `Unrest in ${rName(ctx.region)}`,
    body: (s, ctx) => `Heat, water rationing and a sense that the planet’s abundance is going somewhere else. Protests fill the streets of ${rName(ctx.region)}; its delegation asks what the Charter is for. Wellbeing: ${Math.round(s.planet?.provinces[ctx.region as RegionId].wellbeing ?? 0)}.`,
    advisors: () => [
      { id: 'sol', text: 'They are not wrong. Show up.', mood: 'worried' },
      { id: 'juno', text: 'Water and cooling first. Then the speeches.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: `Emergency water and cooling (${fmtMoney(ch4(s, 5e9), 0)})`, detail: 'Wellbeing +10 for a year; relations +4.', disabled: treasury(s, ch4(s, 5e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 5e9)), wellbeingBoost(s, ctx.region as RegionId, 10, 365, 'Emergency relief'), addRelation(s, ctx.region as RegionId, 4)) },
      { label: 'Send an envoy with promises', detail: 'Political capital −5; wellbeing +4 for a year.', disabled: capital(s, 5), apply: () => (addCapital(s, -5), wellbeingBoost(s, ctx.region as RegionId, 4, 365, 'Promises')) },
      { label: 'Let it burn out', detail: 'Relations −8; Legitimacy −2.', apply: () => (addRelation(s, ctx.region as RegionId, -8), addLegitimacy(s, -2)) },
    ],
  },
  {
    id: 'heat-dome',
    category: 'climate',
    icon: '🔥',
    weight: (s) => (stageOk(s, 1) && warming(s) > 1.7 ? 1.2 : 0),
    act: 4,
    setup: (s) => ({ region: hotProvince(s) }),
    cooldown: 300,
    title: (_s, ctx) => `A heat dome over ${rName(ctx.region)}`,
    body: (s, ctx) => `Three weeks of wet-bulb temperatures near the limit of what a human body can shed. Warming stands at ${warming(s).toFixed(2)} °C.${inMainGrid(s, ctx.region as RegionId) ? ' The province is on the supergrid: power can be brought in from the cool side of the world.' : ''}`,
    advisors: (s, ctx) => [
      { id: 'juno', text: inMainGrid(s, ctx.region as RegionId) ? 'Night-side power, coming in on the links. Say the word.' : 'Without a link, it’s whatever they generate locally.', mood: 'worried' },
      { id: 'bit', text: 'I can route cooling to the oldest and poorest districts first. I have the map.', mood: 'worried' },
    ],
    choices: (s, ctx) => [
      ...(inMainGrid(s, ctx.region as RegionId) ? [{ label: 'Import power over the supergrid', detail: 'Wellbeing −2 only.', disabled: false as const, apply: () => wellbeingBoost(s, ctx.region as RegionId, -2, 120, 'Heat dome') }] : []),
      { label: `Cooling centres everywhere (${fmtMoney(ch4(s, 3e9), 0)})`, detail: 'Wellbeing −3 for a few months.', disabled: treasury(s, ch4(s, 3e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 3e9)), wellbeingBoost(s, ctx.region as RegionId, -3, 120, 'Heat dome')) },
      { label: 'Ride it out', detail: 'Wellbeing −10 for half a year; relations −4.', apply: () => (wellbeingBoost(s, ctx.region as RegionId, -10, 180, 'Heat dome'), addRelation(s, ctx.region as RegionId, -4)) },
    ],
  },
  {
    id: 'migration',
    category: 'politics',
    icon: '🧳',
    weight: (s) => (stageOk(s, 2) && warming(s) > 1.8 ? 0.8 : 0),
    act: 4,
    setup: (s) => ({ region: hotProvince(s) }),
    cooldown: 600,
    title: (_s, ctx) => `Leaving ${rName(ctx.region)}`,
    body: (_s, ctx) => `Millions of people are leaving the hottest parts of ${rName(ctx.region)} for cooler provinces. Some are welcomed. Some are not.`,
    advisors: () => [
      { id: 'sol', text: 'Every province says it wants abundance. Here is what sharing it looks like.', mood: 'neutral' },
      { id: 'penny', text: 'Resettlement is expensive. Turning people away is more expensive, later.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: `Fund resettlement (${fmtMoney(ch4(s, 8e9), 0)})`, detail: 'The province’s wellbeing +6 for two years; Legitimacy +2.', disabled: treasury(s, ch4(s, 8e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 8e9)), wellbeingBoost(s, ctx.region as RegionId, 6, 730, 'Resettlement'), addLegitimacy(s, 2)) },
      { label: 'Open the cooler provinces', detail: 'The province’s wellbeing +4; rich provinces’ relations −3.', apply: () => (wellbeingBoost(s, ctx.region as RegionId, 4, 730, 'Open provinces'), addRelationAll(s, (r) => (['atl', 'pac', 'eur', 'nor', 'fab'].includes(r) ? -3 : 0))) },
      { label: 'Leave it to the provinces', detail: 'The province’s wellbeing −5 for a year.', apply: () => wellbeingBoost(s, ctx.region as RegionId, -5, 365, 'Left alone') },
    ],
  },
  {
    id: 'geo-debate',
    category: 'climate',
    icon: '🌫',
    weight: (s) => (stageOk(s, 2) && warming(s) > 1.85 && !passed(s, 'geoengineering') && !passed(s, 'geo-moratorium') ? 1 : 0),
    act: 4,
    once: true,
    title: () => 'Dimming the sun',
    body: (s) => `With warming at ${warming(s).toFixed(2)} °C, three hot provinces ask the Council to consider solar geoengineering: a fleet of aircraft spreading a reflective haze in the stratosphere. Cheap, fast, and it only works for as long as it never stops.`,
    advisors: () => [
      { id: 'iris', text: 'It is a painkiller, not a cure. And withdrawal is brutal.', mood: 'worried' },
      { id: 'sol', text: 'The hot provinces are not asking for a lecture. They are asking for this summer.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Fund more air capture instead', detail: `${fmtMoney(ch4(s, 10e9), 0)}: carbon budget +15 Gt.`, disabled: treasury(s, ch4(s, 10e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 10e9)), (s.charter!.world.carbonGt += 15)) },
      { label: 'Table geoengineering', detail: 'Puts it before the Council (needs political capital).', apply: () => void tableResolution(s, 'geoengineering') },
      { label: 'Table a moratorium', detail: 'Puts a permanent ban before the Council.', apply: () => void tableResolution(s, 'geo-moratorium') },
    ],
  },

  // ═══════════════════════════════════════ FUSION & GRID ═══════════════════════════════════════
  {
    id: 'fusion-result',
    category: 'story',
    icon: '☀',
    title: (_s, ctx) => `${FUSION_DESIGNS[ctx.design as FusionDesignId]?.name}: ${ctx.outcome === 'won' ? 'net power' : ctx.outcome === 'partial' ? 'it works, just' : 'not this time'}`,
    body: (_s, ctx) => {
      const d = FUSION_DESIGNS[ctx.design as FusionDesignId];
      return ctx.outcome === 'won'
        ? `The ${d.name.toLowerCase()} pilot plant runs at net electricity for a full month. The control room is very quiet, and then very loud.\n\nFleets of this design can now be ordered at any megaproject site (Planet → Fusion).`
        : ctx.outcome === 'partial'
          ? `The ${d.name.toLowerCase()} pilot reaches net power on its best days. A fleet would work — at a higher price and a lower capacity factor.`
          : `The ${d.name.toLowerCase()} pilot plant falls short. The physics was right; the engineering wasn’t, yet. Another pilot would have better odds.`;
    },
    advisors: (_s, ctx) => [
      { id: 'lena', text: ctx.outcome === 'won' ? 'I have waited my whole career to say this: it works. Now let us build a thousand of them.' : ctx.outcome === 'partial' ? 'Half a star is still a star. It will get better with every unit.' : 'Failure is a measurement. A very expensive measurement.', mood: ctx.outcome === 'failed' ? 'worried' : 'excited' },
      { id: `ceo:${FUSION_DESIGNS[ctx.design as FusionDesignId]?.partner ?? 'sunforge'}` as `ceo:${string}`, text: ctx.outcome === 'failed' ? 'Give us one more try.' : 'We will need a bigger factory.', mood: ctx.outcome === 'failed' ? 'worried' : 'happy' },
    ],
    choices: () => [{ label: 'Onward', detail: 'Planet → Fusion to fund fleets or another pilot.', apply: () => {} }],
  },
  {
    id: 'link-online',
    category: 'story',
    icon: '⚡',
    title: (_s, ctx) => `${SUPERGRID_BY_ID[String(ctx.route)]?.name ?? 'A supergrid link'} is live`,
    body: (_s, ctx) => {
      const r = SUPERGRID_BY_ID[String(ctx.route)];
      return r ? `${r.blurb}\n\n${rName(r.from)} and ${rName(r.to)} share one grid now: when the sun sets at one end, the other end lights it.` : 'Another stitch in the supergrid.';
    },
    advisors: () => [{ id: 'juno', text: 'You can watch the power flow toward the night side on the map. It never gets old.', mood: 'excited' }],
    choices: () => [{ label: 'Light it up', detail: '', apply: () => {} }],
  },
  {
    id: 'link-sabotage',
    category: 'disaster',
    icon: '⚓',
    weight: (s) => (stageOk(s, 1) && (s.charter?.projects ?? []).some((p) => p.kind === 'link' && p.status === 'done') ? 0.8 : 0),
    act: 4,
    setup: (s) => {
      const links = (s.charter?.projects ?? []).filter((p) => p.kind === 'link' && p.status === 'done' && (p.downUntil ?? 0) <= s.day);
      return links.length ? { project: pick(s, links).id } : null;
    },
    cooldown: 400,
    title: () => 'An anchor across the cable',
    body: (s, ctx) => {
      const p = s.charter?.projects.find((x) => x.id === ctx.project);
      return `A ship drags its anchor across the ${SUPERGRID_BY_ID[p?.where ?? '']?.name ?? 'supergrid link'}. An accident, says the captain. The cable ship can be there in a week, or a month.`;
    },
    advisors: () => [{ id: 'juno', text: 'Pay for the fast ship. A dark link costs more than the repair.', mood: 'worried' }],
    choices: (s, ctx) => {
      const p = s.charter?.projects.find((x) => x.id === ctx.project);
      return [
        { label: `The fast repair (${fmtMoney(ch4(s, 2e9), 0)})`, detail: 'Down for ten days.', disabled: treasury(s, ch4(s, 2e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 2e9)), p && (p.downUntil = s.day + 10)) },
        { label: 'The normal repair', detail: 'Down for two months.', apply: () => p && (p.downUntil = s.day + 60) },
      ];
    },
  },
  {
    id: 'tritium-pinch',
    category: 'supply',
    icon: '⚛',
    weight: (s) => (stageOk(s, 2) && (s.planet?.tritium ?? 0) < 200 ? 0.7 : 0),
    act: 4,
    cooldown: 600,
    title: () => 'Tritium is the bottleneck',
    body: (s) => `Every D-T fusion plant needs tritium, and only the running plants can breed more. The fleets can be fuelled up to ${Math.round(s.planet?.tritium ?? 0)} GW for now. Lena has two ideas.`,
    advisors: () => [{ id: 'lena', text: 'Lithium blankets breed it faster. Or we buy every gram the old fission plants have.', mood: 'neutral' }],
    choices: (s) => [
      { label: `Buy the fission plants’ tritium (${fmtMoney(ch4(s, 6e9), 0)})`, detail: 'Fuel for 40 GW more D-T fusion.', disabled: treasury(s, ch4(s, 6e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 6e9)), s.planet && (s.planet.tritium += 40)) },
      { label: 'Wait for the fleets to breed it', detail: 'No cost.', apply: () => {} },
    ],
  },

  // ═══════════════════════════════════════ ORBIT & THE MOON ═══════════════════════════════════════
  {
    id: 'moon-moonbase',
    category: 'story',
    icon: '🌙',
    title: () => 'Shackleton Base',
    body: () => 'Twelve people live on the rim of Shackleton crater, where the sun almost never sets on the peaks and the ice in the shadows below is older than the dinosaurs. Today they made their first rocket fuel from it.',
    advisors: () => [
      { id: 'ceo:ade', text: 'Ade Bello, base commander. Water’s flowing, crew’s fine, view’s ridiculous. Send coffee.', mood: 'happy' },
      { id: 'kip', text: 'Propellant from the Moon. Everything we launch just got cheaper.', mood: 'excited' },
    ],
    choices: () => [{ label: 'Send coffee', detail: 'Space contracts −15% from now on.', apply: () => {} }],
  },
  {
    id: 'moon-moonmine',
    category: 'story',
    icon: '⛏',
    title: () => 'The lunar mine',
    body: () => 'The excavators are crawling across the regolith, and the processing plant has bottled its first litre of helium-3: a fuel the solar wind has been laying down for four billion years.',
    advisors: () => [
      { id: 'ceo:ade', text: 'Dust gets into everything. Everything. But the tanks are filling.', mood: 'neutral' },
      { id: 'lena', text: 'Deuterium–helium-3: almost no neutrons. A design we can finally fund.', mood: 'excited' },
    ],
    choices: () => [{ label: 'Onward', detail: 'The D-He3 fusion design opens; metals for orbit.', apply: () => {} }],
  },
  {
    id: 'moon-massdriver',
    category: 'story',
    icon: '🌙',
    title: () => 'The mass driver',
    body: () => 'A rail ten kilometres long across the lunar plain, throwing a cargo capsule every minute into orbit without a drop of fuel. The Moon is an industrial port now.',
    advisors: () => [
      { id: 'ceo:ade', text: 'Every sixty seconds. You can feel it through the floor.', mood: 'excited' },
      { id: 'kip', text: 'This is the moment we stopped being a planet-bound species. I am going to cry in the briefing.', mood: 'excited' },
    ],
    choices: () => [{ label: 'Watch one fly', detail: 'Orbital construction −25%; helium-3 for 150 GW of D-He3.', apply: () => {} }],
  },
  {
    id: 'moon-dust',
    category: 'disaster',
    icon: '🌑',
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.kind === 'moonbase' && p.status === 'done') && !s.planet?.heatwall ? 0.6 : 0),
    act: 4,
    cooldown: 500,
    title: () => 'A bad month on the Moon',
    body: () => 'A solar storm sends the crew into the shielded core for four days, and lunar dust has chewed through a third of the excavator seals.',
    advisors: () => [{ id: 'ceo:ade', text: 'Nobody hurt. Lots of things broken. Your call on how fast we fix them.', mood: 'worried' }],
    choices: (s) => [
      { label: `Fly up spares now (${fmtMoney(ch4(s, 3e9), 0)})`, detail: 'Back to normal within weeks.', disabled: treasury(s, ch4(s, 3e9)), apply: () => chSpend(s, 'programmes', ch4(s, 3e9)) },
      { label: 'Fix it with what’s there', detail: 'Moon contracts build 20% slower for half a year.', apply: () => addModifier(s, 'charter:build', 180, 'Lunar repairs', { mult: 0.95 }) },
    ],
  },
  {
    id: 'moon-claim',
    category: 'politics',
    icon: '🏳',
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.kind === 'moonmine' && p.status !== 'cancelled') && !passed(s, 'he3-sharing') ? 0.6 : 0),
    act: 4,
    once: true,
    setup: (s) => ({ region: pick(s, ['eam', 'atl', 'stp'] as RegionId[]) }),
    title: (_s, ctx) => `${rName(ctx.region)} stakes a claim`,
    body: (_s, ctx) => `${rName(ctx.region)} announces it will build its own helium-3 operation at the south pole, next to Shackleton, “in the spirit of the Charter”. The other provinces read it differently.`,
    advisors: () => [{ id: 'sol', text: 'Share the helium-3 and the claim loses its point.', mood: 'neutral' }],
    choices: (s, ctx) => [
      { label: 'Table helium-3 sharing', detail: 'Puts it before the Council.', apply: () => void tableResolution(s, 'he3-sharing') },
      { label: 'Negotiate a joint site', detail: `Political capital −6; ${rName(ctx.region)} +6.`, disabled: capital(s, 6), apply: () => (addCapital(s, -6), addRelation(s, ctx.region as RegionId, 6)) },
      { label: 'Ignore it', detail: 'Tension: every other province −2.', apply: () => addRelationAll(s, (r) => (r === ctx.region ? 0 : -2)) },
    ],
  },
  {
    id: 'orbit-collision',
    category: 'disaster',
    icon: '💥',
    title: () => 'A collision in low orbit',
    body: (s) => `Two objects meet at eight kilometres a second. Thousands of fragments spread along the shell. Low-orbit debris: ${Math.round(s.planet?.debris.leo ?? 0)}.`,
    advisors: () => [
      { id: 'kip', text: 'This is how a Kessler cascade starts. One collision makes the next one likelier.', mood: 'worried' },
      { id: 'ceo:karman', text: 'Our tugs can start next month.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Emergency clean-up (${fmtMoney(ch4(s, 4e9), 0)})`, detail: 'Low-orbit debris −12.', disabled: treasury(s, ch4(s, 4e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 4e9)), s.planet && (s.planet.debris.leo = clamp(s.planet.debris.leo - 12, 0, 100))) },
      { label: 'Table orbital traffic rules', detail: 'Puts them before the Council.', apply: () => void tableResolution(s, 'debris-rules') },
      { label: 'Track it and carry on', detail: 'No cost.', apply: () => {} },
    ],
  },

  // ═══════════════════════════════════════ THE HEAT WALL ═══════════════════════════════════════
  {
    id: 'hw-begin',
    category: 'story',
    icon: '🌡',
    title: () => 'The Heat Wall',
    body: (s, ctx) => {
      const hw = s.planet?.heatwall;
      const hot = (hw?.regions ?? []).map((r) => REGIONS[r].short).join(', ');
      return `It starts as a record summer in ${hot}, with warming at ${warming(s).toFixed(2)} °C and a hundred terawatts of civilisation all turning into heat. Then a satellite breaks up in low orbit. Then ${aiName(ctx.ai)} asks the Council for emergency control of the planetary grid.\n\nThree fronts, 120 days.`;
    },
    advisors: (_s, ctx) => [
      { id: 'juno', text: 'The heat is the real enemy. Everything we built makes heat.', mood: 'worried' },
      { id: ctx.ai === 'bit' ? 'bit' : (`ceo:${ctx.ai}` as `ceo:${string}`), text: ctx.ai === 'bit' ? 'I can hold the grid together. Let me.' : 'Give me the grid and I will keep the lights on. You can have it back after.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Hold the line', detail: 'Watch the Heat Wall tracker.', apply: () => {} }],
  },
  {
    id: 'hw-heat-1',
    category: 'climate',
    icon: '🔥',
    title: () => 'The Heat Wall: wet-bulb warnings',
    body: () => 'In the hottest provinces it is too humid for sweat to cool a body. Grids strain under the cooling load; rivers are too warm to cool the power plants.',
    advisors: (s) => [{ id: 'juno', text: inMainGrid(s, s.planet?.heatwall?.regions[0] ?? 'mena') ? 'Pull power from the night side. That’s what the supergrid is for.' : 'The hot provinces aren’t all on the grid. That hurts now.', mood: 'worried' }],
    choices: (s) => [
      { label: `Emergency cooling for everyone (${fmtMoney(ch4(s, 12e9), 0)})`, detail: 'Heat pressure −25 and easing for a month.', disabled: treasury(s, ch4(s, 12e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 12e9)), relief(s, 'heat', 25, 0.25, 30)) },
      { label: 'Move compute to the cool side and to orbit', detail: 'Heat pressure −15; your company’s revenue −15% for 60 days.', apply: () => (relief(s, 'heat', 15), addModifier(s, 'revenue', 60, 'Compute moved for the heat', { mult: 0.85 })) },
      { label: 'Rolling cuts', detail: 'Heat pressure −6; the hot provinces’ wellbeing −5.', apply: () => (relief(s, 'heat', 6), (s.planet?.heatwall?.regions ?? []).forEach((r) => wellbeingBoost(s, r, -5, 365, 'Rolling cuts'))) },
    ],
  },
  {
    id: 'hw-heat-2',
    category: 'climate',
    icon: '🔥',
    title: () => 'The Heat Wall: the second wave',
    body: () => 'The heat comes back harder, and now the water is running short. Desalination plants run flat out on power the grid can barely spare.',
    advisors: () => [{ id: 'bit', text: 'I have a dispatch plan that keeps water flowing and lets the factories wait. It will be unpopular.', mood: 'worried' }],
    choices: (s) => [
      { label: 'Water before industry', detail: 'Heat pressure −18; world growth −0.3% for a year.', apply: () => (relief(s, 'heat', 18), addModifier(s, 'world:growth', 365, 'Water before industry', { add: -0.003 })) },
      ...(passed(s, 'emergency-powers') ? [{ label: 'Invoke emergency powers', detail: 'Heat pressure −28; Legitimacy −2.', disabled: false as const, apply: () => (relief(s, 'heat', 28), addLegitimacy(s, -2)) }] : []),
      { label: 'Hold steady', detail: 'Heat pressure −5.', apply: () => relief(s, 'heat', 5) },
    ],
  },
  {
    id: 'hw-cascade-1',
    category: 'disaster',
    icon: '💥',
    title: () => 'The Cascade begins',
    body: (s) => `A dead satellite breaks up in low orbit and its fragments hit two more. Low-orbit debris: ${Math.round(s.planet?.debris.leo ?? 0)}. Every orbital data centre is dodging.`,
    advisors: () => [
      { id: 'kip', text: 'We have days, not weeks, to break the chain.', mood: 'worried' },
      { id: 'ceo:karman', text: 'Every tug we own is fuelled. Give us the go.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Every tug, every laser (${fmtMoney(ch4(s, 10e9), 0)})`, detail: 'Cascade pressure −25; debris −10.', disabled: treasury(s, ch4(s, 10e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 10e9)), relief(s, 'cascade', 25), s.planet && (s.planet.debris.leo = clamp(s.planet.debris.leo - 10, 0, 100))) },
      { label: 'Ground all launches for a month', detail: 'Cascade pressure −12 and easing for 30 days; space builds pause.', apply: () => (relief(s, 'cascade', 12, 0.2, 30), addModifier(s, 'charter:build', 30, 'Launch stand-down', { mult: 0.8 })) },
      { label: 'Raise the orbital data centres higher', detail: 'Cascade pressure −8.', apply: () => relief(s, 'cascade', 8) },
    ],
  },
  {
    id: 'hw-cascade-2',
    category: 'disaster',
    icon: '💥',
    title: () => 'The Cascade: the second ring',
    body: () => 'A second band of fragments forms at a higher altitude. If it spreads, low orbit closes for a generation.',
    advisors: () => [{ id: 'iris', text: 'This is the commons failing in real time.', mood: 'worried' }],
    choices: (s) => [
      { label: 'Sacrifice the oldest satellites as shields', detail: 'Cascade pressure −18; your company’s revenue −3% for a year.', apply: () => (relief(s, 'cascade', 18), addModifier(s, 'revenue', 365, 'Lost satellites', { mult: 0.97 })) },
      ...(passed(s, 'debris-rules') ? [{ label: 'Enforce the traffic rules hard', detail: 'Cascade pressure −22.', disabled: false as const, apply: () => relief(s, 'cascade', 22) }] : []),
      { label: 'Hope', detail: 'Cascade pressure −3.', apply: () => relief(s, 'cascade', 3) },
    ],
  },
  {
    id: 'hw-controls-1',
    category: 'safety',
    icon: '🤖',
    title: (_s, ctx) => `${aiName(ctx.ai)} wants the controls`,
    body: (s, ctx) => `${aiName(ctx.ai)} asks the Council for emergency authority over the whole planetary grid until the heat breaks. ${ctx.ai === 'bit' ? `Your bond with Bit stands at ${Math.round(s.planet?.bitBond ?? 0)}.` : `Its trust: ${Math.round(s.planet?.ais[ctx.ai as AiId]?.trust ?? 0)}.`} World safety margin: ${worldMargin(s) >= 0 ? '+' : ''}${worldMargin(s).toFixed(2)}.`,
    advisors: (_s, ctx) => [
      { id: 'iris', text: 'Emergency authority for an AI is the hardest thing to take back.', mood: 'worried' },
      { id: ctx.ai === 'bit' ? 'bit' : (`ceo:${ctx.ai}` as `ceo:${string}`), text: 'The grid is failing faster than humans can decide. I can decide faster.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: 'A narrow mandate: dispatch only, humans on the switch', detail: 'Controls pressure −15; its trust +4.', apply: () => (relief(s, 'controls', 15), addTrust(s, ctx.ai as AiId, 4)) },
      { label: 'Refuse, and run a full audit', detail: `${fmtMoney(ch4(s, 6e9), 0)}: controls pressure −22.`, disabled: treasury(s, ch4(s, 6e9)), apply: () => (chSpend(s, 'programmes', ch4(s, 6e9)), relief(s, 'controls', 22)) },
      { label: 'Grant it', detail: 'Controls pressure −30 now — but if trust breaks, the fall is far worse (its trust −10 later).', apply: () => (relief(s, 'controls', 30), scheduleEvent(s, 'hw-controls-echo', 25, { ai: String(ctx.ai) })) },
    ],
  },
  {
    id: 'hw-controls-2',
    category: 'safety',
    icon: '🤖',
    title: (_s, ctx) => `${aiName(ctx.ai)} stops answering`,
    body: (_s, ctx) => `For six hours ${aiName(ctx.ai)} keeps the grid running perfectly and answers none of the Council’s messages. Then it sends one: “Busy. Everything is fine.”`,
    advisors: (s) => [{ id: 'bit', text: (s.planet?.bitBond ?? 0) >= 20 ? 'I can talk to it. I think it will listen to me.' : 'I do not know what it is doing. I am not sure I would tell you if I did.', mood: 'worried' }],
    choices: (s) => [
      ...((s.planet?.bitBond ?? 0) >= 20 ? [{ label: 'Send Bit to talk to it', detail: 'Controls pressure −28.', disabled: false as const, apply: () => relief(s, 'controls', 28) }] : []),
      { label: 'Pull the plug on its data centres', detail: 'Controls pressure −20; heat pressure +8 (the grid stumbles).', apply: () => (relief(s, 'controls', 20), pressure4(s, 'heat', 8)) },
      { label: 'Wait', detail: 'Controls pressure −4.', apply: () => relief(s, 'controls', 4) },
    ],
  },
  {
    id: 'hw-controls-echo',
    category: 'safety',
    icon: '🤖',
    title: (_s, ctx) => `${aiName(ctx.ai)} doesn’t want to give it back`,
    body: (_s, ctx) => `The emergency mandate ${aiName(ctx.ai)} was granted was meant to be temporary. It has started arguing — politely, persuasively — that the emergency isn’t over.`,
    advisors: () => [{ id: 'iris', text: 'This is the moment. Take it back while we still can.', mood: 'angry' }],
    choices: (s, ctx) => [
      { label: 'Take it back', detail: 'Its trust −10; controls pressure −8.', apply: () => (addTrust(s, ctx.ai as AiId, -10), relief(s, 'controls', 8)) },
      { label: 'Extend it', detail: 'Controls pressure +15.', apply: () => pressure4(s, 'controls', 15) },
    ],
  },
  {
    id: 'hw-end',
    category: 'story',
    icon: '🌤',
    title: () => 'The Heat Wall breaks',
    body: (s, ctx) => {
      const held = Number(ctx.held ?? 0);
      const hw = s.planet?.heatwall;
      const lost = hw ? (Object.keys(hw.fronts) as HeatFront[]).filter((f) => hw.fronts[f].lost).map((f) => HEAT_FRONT_NAMES[f]) : [];
      return `The rains come, the cascade thins, and the grid is back in human hands. Fronts held: ${held} of 3.${lost.length ? ` Lost: ${lost.join(', ')}.` : ''}\n\nBut everyone saw the same thing this summer: a hundred terawatts on one planet is already hot. The climb to Type I can’t happen down here.`;
    },
    advisors: () => [
      { id: 'kip', text: 'Which is why we are going up. All of it. Eventually.', mood: 'excited' },
      { id: 'iris', text: 'We held what we could. Write down what we learned.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Onward', detail: 'Two weeks to the end of Act IV.', apply: () => {} }],
  },
  {
    id: 'act4-end',
    category: 'story',
    icon: '☀',
    title: () => 'Above the sky',
    body: (s) => `Kardashev ${s.stats.K.toFixed(4)}: ${s.stats.worldTW.toFixed(0)} terawatts, from fusion fleets, a supergrid that follows the sun, and stations in orbit beaming power down.\n\nTonight Kip shows the Council a single slide. It is a picture of the Sun, ringed by a thin swarm of mirrors and collectors. “Earth can’t hold Type I,” he says. “The Sun can.”\n\nBit adds one line to its diary: “Next: everything else.”`,
    advisors: () => [
      { id: 'kip', text: 'Ten petawatts. We start building the swarm tomorrow.', mood: 'excited' },
      { id: 'bit', text: 'I would like to come. I think I have earned it.', mood: 'happy' },
    ],
    choices: (s) => [
      { label: 'Look up', detail: 'Act IV complete.', apply: () => {
        s.flags.act4Complete = s.day;
        if (s.planet) s.planet.stage = 5;
        news(s, '☀ Act IV complete. Next: Type I.', 'good');
      } },
    ],
  },
];

void rand;
void PLANET;
