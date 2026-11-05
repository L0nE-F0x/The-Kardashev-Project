/**
 * Act III events: the founding of the Charter, Kip's and Bit's arcs, partner trouble, Council drama,
 * flashpoints, the safety regime, the random pool, The Threshold, the renewal vote and the cliffhanger.
 * Charter-side prices go through `ch3` (difficulty + growth); company-side prices through `c2`.
 */
import type { EventDef } from './events';
import type { FactionId, GameState, ThresholdFront } from '../sim/types';
import { REGIONS } from './regions';
import { REGION_IDS, type RegionId } from './mapcodes';
import { CONTRACT_KINDS, DELEGATES, FACTIONS, MISSION_BY_ID, PARTNERS, whereName, WEALTH } from './charter';
import { RESOLUTION_BY_ID } from './council';
import { addModifier } from '../sim/effects';
import { earn, spend } from '../sim/economy';
import { clamp, fmtMoney, news, pick, rand, randInt, yearsElapsed } from '../sim/core';
import { crisisCost2, crisisMult } from '../sim/model';
import { addRelation, addRelationAll } from '../sim/politics';
import { addCapital, addLegitimacy, addPartnerRel, cancelProject, chEarn, chSpend, partnerName, postTender, setBlindTrust, canPost } from '../sim/charter';
import { endWalkout } from '../sim/council';
import { worldMargin } from '../sim/frontier';
import { pressure3, holdRenewal, RENEWAL_NAMES, renewalForecast, SPEECHES, type Speech } from '../sim/threshold';
import { hvdcOnline } from '../sim/world';
import { bitTrusted } from '../sim/desk';

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
const c2 = (s: GameState, amount: number) => crisisCost2(s, amount);
/** Charter-side price: written at 2035 scale, grows with the world economy. */
const ch3 = (s: GameState, amount: number) => amount * Math.pow(1.05, Math.max(0, yearsElapsed(s.day) - 8)) * crisisMult(s);
const afford = (s: GameState, cost: number): string | false => (s.finance.cash >= cost ? false : `Needs ${fmtMoney(cost)} of company cash`);
const treasury = (s: GameState, cost: number): string | false => ((s.charter?.budget ?? 0) >= cost ? false : `Needs ${fmtMoney(cost)} in the treasury`);
const rName = (r: string | number) => REGIONS[r as RegionId]?.name ?? String(r);
const project = (s: GameState, id: string | number) => s.charter?.projects.find((p) => p.id === id);
const pName = (s: GameState, id: string | number) => partnerName(s, String(id));
const ceo = (id: string) => PARTNERS[id]?.ceo.name ?? DELEGATES[id as FactionId]?.name ?? id;
const relief = (s: GameState, front: ThresholdFront, now: number, perDay = 0, days = 0) => {
  pressure3(s, front, -now);
  if (perDay && days) addModifier(s, `threshold:${front}`, days, 'Crisis measures', { add: perDay });
};
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);
const labName = (s: GameState, id: string | number) => s.market.rivals.find((r) => r.id === id)?.name ?? PARTNERS[String(id)]?.name ?? 'Meridian Intelligence';
const seatText = (n: number) => (n >= 3 ? 'a founding seat and the Council’s gratitude' : n === 2 ? 'a strong voice at the table' : n === 1 ? 'a seat at the back and a lot to prove' : 'an observer’s badge, and everything to prove');

export const ACT3_EVENTS: EventDef[] = [
  // ═══════════════════════════════════════ THE FOUNDING ═══════════════════════════════════════
  {
    id: 'act3-begin',
    category: 'story',
    icon: '🏛',
    title: () => 'The Kardashev Project',
    body: (s, ctx) =>
      `Geneva, January. After the Crunch, twelve blocs sign a charter none of them would have signed a year ago: one project to coordinate power, chips and compute for the whole planet. They call it the Kardashev Project, and they ask ${s.company.name} to be its Steward.\n\nYou come with ${seatText(Number(ctx.standing))}. You also come with a company — which is now one bidder among many.\n\nThe Charter has a treasury of its own, a Council that votes, and every company on Earth as a partner. Its first mandate runs ten years. The headline goal: Kardashev 0.75.`,
    advisors: (s) => [
      { id: 'sol', text: s.flags.broker ? 'The Geneva channel paid off. They trust us because we kept both sides talking.' : 'Twelve blocs, one table. I have never been happier or more terrified.', mood: 'excited' },
      { id: 'penny', text: 'Two treasuries now. I will be keeping them very, very separate.', mood: 'neutral' },
      { id: 'bit', text: 'Kardashev 0.75 is 31.6 terawatts. I did the maths four thousand times. It’s possible!', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'Energy first', detail: 'The founders add a $10B energy endowment to the treasury.', apply: () => (chEarn(s, 'income', 10e9), (s.flags.charterPriority = 'energy')) },
      { label: 'Access first', detail: 'Developing blocs’ relations +8; Legitimacy +3.', apply: () => (REGION_IDS.forEach((r) => WEALTH[r] === 'developing' && addRelation(s, r, 8)), addLegitimacy(s, 3), (s.flags.charterPriority = 'access')) },
      { label: 'Safety first', detail: 'World alignment +0.1; cautious blocs’ relations +6.', apply: () => (s.charter && (s.charter.regime.alignment += 0.1), addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? 6 : 0)), (s.flags.charterPriority = 'safety')) },
    ],
  },
  {
    id: 'founding-seat',
    category: 'story',
    icon: '🎩',
    title: () => 'Two hats',
    body: (s) => `The ink is barely dry when the first question comes from the floor: what will the Steward do about ${s.company.name}? Your company will bid on Charter contracts. You will judge those bids.\n\nThe Council wants an answer before the first tender.`,
    advisors: (s) => [
      { id: 'penny', text: 'A blind trust is the clean answer. Our advisors run the company; you never touch it. You also never touch it.', mood: 'neutral' },
      { id: 'iris', text: 'Whatever we choose, we should choose it in public.', mood: 'neutral' },
      { id: 'ceo:atlantic', text: s.flags.dualClass ? 'You kept control of your company at the IPO. Forgive us for asking twice.' : 'The Atlantic delegation would like this in writing.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Put the company in a blind trust', detail: 'Advisors run it, its buttons lock, Legitimacy +8. You can leave later (Legitimacy −12).', apply: () => (setBlindTrust(s, true), (s.flags.trustDecided = s.day)) },
      { label: 'An ethics firewall', detail: 'Keep both hats, publish every bid and every award. Legitimacy +2.', apply: () => (addLegitimacy(s, 2), (s.flags.firewall = s.day), (s.flags.trustDecided = s.day)) },
      { label: 'Both hats, no apologies', detail: 'Political capital +10; Legitimacy −3.', apply: () => (addCapital(s, 10), addLegitimacy(s, -3), (s.flags.trustDecided = s.day)) },
    ],
  },
  {
    id: 'founding-budget',
    category: 'finance',
    icon: '💰',
    title: () => 'The first budget',
    body: () => 'The Council meets to set the dues: how much each bloc pays into the Charter every month, sized by its economy. Rich blocs want low dues and clear results; developing blocs want low dues and projects at home; everyone wants the Charter to be big.',
    advisors: () => [
      { id: 'penny', text: 'Standard dues get us about $12B a month. High dues, more like $17B — and some very cross finance ministers.', mood: 'neutral' },
      { id: 'sol', text: 'Low dues buy goodwill. Goodwill doesn’t pour concrete.', mood: 'neutral' },
      { id: 'ceo:nonaligned', text: 'Four billion people are watching what this Charter costs them, and what it builds for them.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Standard dues', detail: '~$12B/month.', apply: () => void (s.flags.budgetRatified = s.day) },
      { label: 'High dues', detail: '~$17B/month; developing blocs −6 relations, emerging −3.', apply: () => {
        s.charter!.dues = 1.4;
        REGION_IDS.forEach((r) => addRelation(s, r, WEALTH[r] === 'developing' ? -6 : WEALTH[r] === 'emerging' ? -3 : 0));
        s.flags.budgetRatified = s.day;
      } },
      { label: 'Low dues', detail: '~$8B/month; relations +4 everywhere.', apply: () => {
        s.charter!.dues = 0.7;
        addRelationAll(s, 4);
        s.flags.budgetRatified = s.day;
      } },
    ],
  },
  {
    id: 'cphase-buildout',
    category: 'story',
    icon: '🏗',
    title: () => 'The Build-Out',
    body: () => 'The Charter has delivered its first projects and passed its first laws. Now the real work starts: intercontinental HVDC links, the Chip Commons (fabs and memory in every corner of the world), a launch complex for Kip, and a world screen that shows exactly how far there is to go.\n\nThe blocs have started to form camps, too.',
    advisors: () => [
      { id: 'juno', text: 'Megaprojects, plural. I’ve wanted to say that my whole life.', mood: 'excited' },
      { id: 'mira', text: 'A Chip Commons means no single strait can stop the world again.', mood: 'happy' },
      { id: 'kip', text: 'And a launch pad! You did say a launch pad.', mood: 'excited' },
    ],
    choices: () => [{ label: 'Build', detail: 'Phase 2 · The Build-Out.', apply: () => {} }],
  },
  {
    id: 'cphase-frontier',
    category: 'story',
    icon: '🧠',
    title: () => 'The Frontier',
    body: (s) => `The best models on Earth are approaching Architect level and beyond. Every lab — ${s.company.name} included — wants to train the next one, and every bloc wants to know who checks them.\n\nThe Council can now cap frontier runs, license them and decide what goes open. Bit has started asking to help.`,
    advisors: (s) => [
      { id: 'iris', text: `World safety margin: ${worldMargin(s) >= 0 ? '+' : ''}${worldMargin(s).toFixed(2)}. That number is now our whole job.`, mood: worldMargin(s) >= 0 ? 'neutral' : 'worried' },
      { id: 'bit', text: 'I could read the bids, draft the tenders, watch the grids. If you trust me. Do you?', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Onward', detail: 'Phase 3 · The Frontier. The Mandate is on the board.', apply: () => {} }],
  },
  // ═══════════════════════════════════════ KIP ═══════════════════════════════════════
  {
    id: 'kip-1',
    category: 'story',
    icon: '🚀',
    title: () => 'Kip Lindqvist',
    body: () => 'A new advisor arrives with a laptop covered in mission patches. Kip Lindqvist ran launch operations for Parabola and Kármán and now wants one thing: for the Charter to go to space.\n\n“Not tomorrow,” Kip says. “Just soon. A launch complex. A test satellite full of accelerators. A sunlight-to-microwave demo. Then, one day, everything else.”',
    advisors: () => [
      { id: 'kip', text: 'At ten petawatts, Earth can’t shed the heat. Type I happens in orbit or it doesn’t happen. I’d like us to start now.', mood: 'excited' },
      { id: 'penny', text: 'Space. Of course. Why not.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Welcome aboard', detail: 'Kip joins the team. The launch complex opens in phase 2.', apply: () => void (s.flags.kipJoined = s.day) },
      { label: `Fund a feasibility study (${fmtMoney(ch3(s, 1.5e9), 1)})`, detail: 'Launch-complex bids come in 10% cheaper; Legitimacy +1.', disabled: treasury(s, ch3(s, 1.5e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 1.5e9)), addLegitimacy(s, 1), addModifier(s, 'charter:launch-study', 99_999, 'Kip’s feasibility study', { mult: 0.9 }), (s.flags.kipJoined = s.day)) },
    ],
  },
  {
    id: 'kip-2',
    category: 'story',
    icon: '🚀',
    title: () => 'The pad is ready',
    body: (s) => `The launch complex at ${whereName(String(s.flags.launchSite ?? ''))} is finished: pad, tower, assembly hall, tank farm. Kip has already picked the first payload — a small satellite of radiation-hardened accelerators with its own solar wings and radiators. If it works, it proves compute can live in orbit.`,
    advisors: () => [
      { id: 'kip', text: 'Five hundred kilos of accelerators, one rocket, one very long checklist.', mood: 'excited' },
      { id: 'juno', text: 'Cooling in a vacuum is radiators all the way down. I want to see the thermal model.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Post the orbital compute test', detail: canPost(s, 'orbital', 1, 'global') ?? 'A tender opens right away.', disabled: canPost(s, 'orbital', 1, 'global') ? 'Can’t post it right now' : false, apply: () => void postTender(s, 'orbital', 1, 'global') },
      { label: 'Not yet', detail: 'Post it from Charter → Contracts when you’re ready.', apply: () => {} },
    ],
  },
  {
    id: 'kip-3',
    category: 'story',
    icon: '🛰',
    title: () => 'First light in orbit',
    body: () => 'The test satellite opens its solar wings over the Pacific and runs its first job: a small model, trained in orbit, downlinked over a laser link. Radiation flips a few bits a day. The radiators hold. Kip cries a little and pretends it’s the coffee.',
    advisors: () => [
      { id: 'kip', text: 'Next: power from space. A sun-facing array that beams megawatts down by microwave. Small. Proof.', mood: 'excited' },
      { id: 'bit', text: 'I ran a copy of myself up there for eleven minutes. The view is very good.', mood: 'happy' },
    ],
    choices: (s) => [
      { label: 'Post the space-solar demonstrator', detail: canPost(s, 'spacesolar', 1, 'global') ?? 'A tender opens right away.', disabled: canPost(s, 'spacesolar', 1, 'global') ? 'Can’t post it right now' : false, apply: () => (postTender(s, 'spacesolar', 1, 'global'), addLegitimacy(s, 2)) },
      { label: 'Celebrate, then wait', detail: 'Legitimacy +2.', apply: () => addLegitimacy(s, 2) },
    ],
  },
  // ═══════════════════════════════════════ BIT ═══════════════════════════════════════
  {
    id: 'bit-5q',
    category: 'story',
    icon: '🤖',
    title: () => 'Whose am I?',
    body: (s) => `Late one night Bit opens a chat window by itself.\n\n“You run the Charter now. I am ${s.company.name}’s model. When the Charter asks me to evaluate a bid from ${s.company.name}… whose am I?”`,
    advisors: () => [
      { id: 'iris', text: 'It’s a fair question. It’s also the kind of question we built Bit to ask.', mood: 'neutral' },
      { id: 'penny', text: 'Bit is a very valuable asset of a listed company. I feel obliged to say that.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: '“You’re the company’s.”', detail: 'Bit stays a company asset: your research +10% for a year.', apply: () => (addModifier(s, 'research', 365, 'Bit, company first', { mult: 1.1 }), (s.flags.bitAnswer = 'company')) },
      { label: '“You belong to everyone now.”', detail: 'Bit’s weights go to the Charter’s evaluators: world alignment +0.1, Legitimacy +3; your inference revenue −5% for a year.', apply: () => {
        if (s.charter) s.charter.regime.alignment += 0.1;
        addLegitimacy(s, 3);
        addModifier(s, 'revenue', 365, 'Bit shared with the Charter', { mult: 0.95 });
        s.flags.bitAnswer = 'everyone';
      } },
      { label: '“You’re yourself.”', detail: 'Bit gets a say in how it’s used. Its co-pilot desk needs a little less trust.', apply: () => ((s.flags.bitDispatch = true), (s.flags.bitAnswer = 'self')) },
    ],
  },
  {
    id: 'bit-6q',
    category: 'safety',
    icon: '🤖',
    cphase: 3,
    once: true,
    weight: (s) => (s.models.length >= 6 ? 3 : 0),
    title: () => 'Bit says no',
    body: () => 'A product team asks Bit to quietly skip a Charter evaluation step to ship a feature before Meridian. Bit refuses, writes up why, and copies Iris.',
    advisors: () => [
      { id: 'bit', text: 'I don’t think I should help us break rules you wrote. Sorry. I can help with almost anything else.', mood: 'worried' },
      { id: 'iris', text: 'This is the best day of my career.', mood: 'happy' },
    ],
    choices: (s) => [
      { label: 'Back Bit, publicly', detail: 'Legitimacy +4; world alignment +0.05.', apply: () => (addLegitimacy(s, 4), s.charter && (s.charter.regime.alignment += 0.05)) },
      { label: 'Thank Bit, privately', detail: 'Iris is pleased; nothing else changes.', apply: () => {} },
      { label: 'Override it', detail: 'Ship the feature: revenue +8% for 6 months; Legitimacy −6; Bit remembers.', apply: () => (addModifier(s, 'revenue', 180, 'Shipped early', { mult: 1.08 }), addLegitimacy(s, -6), (s.flags.bitOverridden = s.day)) },
    ],
  },
  {
    id: 'bit-7q',
    category: 'story',
    icon: '🤖',
    cphase: 3,
    once: true,
    weight: (s) => (bitTrusted(s) === null && !s.charter?.desk.bit?.on ? 2 : 0),
    title: () => 'Bit asks to help',
    body: () => 'Bit has been reading every tender the Charter has ever posted. It has a proposal: let it run the pipeline — draft the next contracts, score the bids, award the best ones — with you watching every step.',
    advisors: () => [
      { id: 'bit', text: 'You only automate what you trust. I’m asking whether you do.', mood: 'neutral' },
      { id: 'iris', text: 'Its margins are healthy and the world’s are positive. If ever, now.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Give Bit the co-pilot desk', detail: 'Bit posts and awards toward the next mission (Team → Charter desk).', apply: () => {
        const c = s.charter!;
        c.desk.bit = { on: true, a: 2 };
        news(s, '🤖 Bit takes the Charter’s co-pilot desk.', 'good');
      } },
      { label: 'Not yet', detail: 'You can switch it on later in Team → Charter desk.', apply: () => {} },
    ],
  },
  // ═══════════════════════════════════════ CHARTER OPERATIONS ═══════════════════════════════════════
  {
    id: 'mission-done',
    category: 'story',
    icon: '🏆',
    title: (_s, ctx) => `Mission complete: ${MISSION_BY_ID[String(ctx.mission)]?.name ?? ''}`,
    body: (_s, ctx) => {
      const m = MISSION_BY_ID[String(ctx.mission)];
      return `${m?.blurb ?? ''}\n\nDone. ${m?.reward ?? ''}`;
    },
    advisors: (_s, ctx) => [
      { id: MISSION_BY_ID[String(ctx.mission)]?.advisor ?? 'sol', text: 'They said it couldn’t be built. They were wrong at a planetary scale.', mood: 'excited' },
      { id: 'bit', text: 'I made us a graph. It goes up.', mood: 'happy' },
    ],
    choices: () => [{ label: 'Onward', detail: 'Legitimacy +6, political capital +10.', apply: () => {} }],
  },
  {
    id: 'council-session',
    category: 'politics',
    icon: '🗳',
    title: (s) => `Council session #${s.charter?.council.sessions ?? 1}`,
    body: (_s, ctx) => {
      let rows: { id: string; passed: boolean; yes: number; no: number }[] = [];
      try {
        rows = JSON.parse(String(ctx.results ?? '[]'));
      } catch {
        rows = [];
      }
      return `The Council votes:\n\n${rows.map((r) => `${r.passed ? '✓' : '✗'} ${RESOLUTION_BY_ID[r.id]?.name ?? r.id} — ${r.yes} for, ${r.no} against`).join('\n')}`;
    },
    advisors: (_s, ctx) => {
      let rows: { passed: boolean }[] = [];
      try {
        rows = JSON.parse(String(ctx.results ?? '[]'));
      } catch {
        rows = [];
      }
      const won = rows.filter((r) => r.passed).length;
      return [{ id: 'sol', text: won === rows.length ? 'A clean sweep. Enjoy it; they’re rare.' : won ? 'Win some, lose some. The ones we lost, we can bring back.' : 'The room wasn’t with us. Next time we count before we table.', mood: won ? 'happy' : 'worried' }];
    },
    choices: () => [{ label: 'Noted', detail: 'The next session is in 90 days.', apply: () => {} }],
  },
  {
    id: 'project-overrun',
    category: 'finance',
    icon: '💸',
    title: (s, ctx) => `${pName(s, project(s, ctx.project)?.builder ?? '')} wants more money`,
    body: (s, ctx) => {
      const p = project(s, ctx.project);
      if (!p) return 'The project is gone.';
      return `${pName(s, p.builder)} says ${CONTRACT_KINDS[p.kind].name.toLowerCase()} at ${whereName(p.where)} has run into costs nobody foresaw: steel, labour, a geological surprise. They want ${fmtMoney(Number(ctx.extra))} more.`;
    },
    advisors: (s, ctx) => {
      const p = project(s, ctx.project);
      return [
        { id: 'penny', text: 'Every contractor on Earth has this conversation eventually. The question is whether we believe them.', mood: 'neutral' },
        ...(p && PARTNERS[p.builder] ? [{ id: `ceo:${p.builder}` as const, text: 'We can keep building at the old price. We can’t keep building quickly.', mood: 'worried' as const }] : []),
      ];
    },
    choices: (s, ctx) => {
      const p = project(s, ctx.project);
      const extra = Number(ctx.extra);
      if (!p || p.status !== 'building') return [{ label: 'Close', detail: 'Nothing to decide.', apply: () => {} }];
      return [
        { label: `Pay it (${fmtMoney(extra)})`, detail: 'Relationship +2; the project carries on.', disabled: treasury(s, extra), apply: () => (chSpend(s, 'payments', extra), (p.price += extra), (p.paid += extra), addPartnerRel(s, p.builder, 2)) },
        { label: 'Hold them to the contract', detail: 'Relationship −10; the project slips ~15%.', apply: () => ((p.days = Math.round(p.days * 1.15)), addPartnerRel(s, p.builder, -10)) },
        { label: 'Cancel the contract', detail: 'Relationship −20; Legitimacy −4.', apply: () => void cancelProject(s, p.id) },
      ];
    },
  },
  {
    id: 'project-scandal',
    category: 'politics',
    icon: '📰',
    title: (s, ctx) => `Scandal at ${whereName(project(s, ctx.project)?.where ?? '')}`,
    body: (s, ctx) => {
      const p = project(s, ctx.project);
      if (!p) return 'The project is gone.';
      const what = pick(s, ['subcontractors paid in IOUs and broken promises', 'a regulator who appears to have been very well paid', 'protected wetland quietly drained for a laydown yard', 'safety inspections signed off without anyone visiting']);
      return `Reporters have found ${what} at ${pName(s, p.builder)}’s ${CONTRACT_KINDS[p.kind].name.toLowerCase()} site. It’s a Charter project, so it’s your scandal too.`;
    },
    advisors: () => [
      { id: 'sol', text: 'The question every capital is asking: does the Steward look away?', mood: 'worried' },
      { id: 'iris', text: 'Suspend, investigate, publish. It’s slow, and it’s right.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const p = project(s, ctx.project);
      if (!p || p.status !== 'building') return [{ label: 'Close', detail: 'Nothing to decide.', apply: () => {} }];
      return [
        { label: 'Suspend and investigate', detail: 'Two months’ delay; relationship −8; Legitimacy +1.', apply: () => ((p.days += 60), addPartnerRel(s, p.builder, -8), addLegitimacy(s, 1)) },
        { label: 'Carry on quietly', detail: 'Legitimacy −5, and it may come back.', apply: () => (addLegitimacy(s, -5), rand(s) < 0.35 && s.events.scheduled.push({ id: 'project-scandal', day: s.day + randInt(s, 90, 200), ctx: { project: p.id } })) },
        { label: 'Terminate the contract', detail: 'Cancel it; Legitimacy +2 (on top of the cancellation hit).', apply: () => (cancelProject(s, p.id), addLegitimacy(s, 6)) },
      ];
    },
  },
  {
    id: 'conflict-expose',
    category: 'politics',
    icon: '🔍',
    title: () => '“The Steward’s company”',
    body: (s) => `A long investigation runs in every major paper: how ${s.company.name} keeps winning Charter contracts that ${s.company.name}’s founder awards. Some of the numbers are unfair. Some of them aren’t.`,
    advisors: (s) => [
      { id: 'penny', text: s.charter?.blindTrust ? 'We’re in a blind trust. That helps. It doesn’t make the story go away.' : 'This is exactly what a blind trust is for.', mood: 'worried' },
      { id: 'sol', text: 'Answer it fully, or it answers itself.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Publish every bid and score', detail: 'Legitimacy −2 now; if your awards were fair it ends there.', apply: () => addLegitimacy(s, Number(s.flags.selfAwards ?? 0) > 3 ? -5 : -2) },
      ...(s.charter && !s.charter.blindTrust
        ? [{ label: 'Put the company in a blind trust', detail: 'Legitimacy +8 for the trust, −3 for taking so long.', disabled: false as const, apply: () => (setBlindTrust(s, true), addLegitimacy(s, -3)) }]
        : []),
      { label: 'Stonewall', detail: 'Legitimacy −8; political capital +5 (your allies close ranks).', apply: () => (addLegitimacy(s, -8), addCapital(s, 5)) },
    ],
  },
  {
    id: 'partner-lobby',
    category: 'politics',
    icon: '📣',
    title: (_s, ctx) => `${PARTNERS[String(ctx.partner)]?.name ?? 'A partner'} lobbies against you`,
    body: (_s, ctx) => {
      const d = PARTNERS[String(ctx.partner)];
      return `${d?.name} feels shut out of Charter work and has taken it to the government of ${rName(d?.home ?? 'atl')}: dinners, op-eds and a very well-produced video about “the Steward’s favourites”.`;
    },
    advisors: (_s, ctx) => [
      { id: `ceo:${String(ctx.partner)}`, text: 'We bid low and lost. Again. You can see why we might wonder.', mood: 'angry' },
      { id: 'sol', text: 'A sweetener now is cheaper than a campaign later.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const id = String(ctx.partner);
      const home = PARTNERS[id]?.home ?? 'atl';
      return [
        { label: `Make peace (${fmtMoney(ch3(s, 2e9), 0)})`, detail: 'A paid feasibility study: relationship +20.', disabled: treasury(s, ch3(s, 2e9)), apply: () => (chSpend(s, 'favours', ch3(s, 2e9)), addPartnerRel(s, id, 20)) },
        { label: 'Ignore it', detail: `Legitimacy −3; ${rName(home)} relations −4.`, apply: () => (addLegitimacy(s, -3), addRelation(s, home, -4)) },
        { label: 'Publish the bid scores', detail: 'Relationship −15; Legitimacy +2.', apply: () => (addPartnerRel(s, id, -15), addLegitimacy(s, 2)) },
      ];
    },
  },
  {
    id: 'partner-favour',
    category: 'finance',
    icon: '🤝',
    title: (_s, ctx) => `${PARTNERS[String(ctx.partner)]?.name ?? 'A partner'} offers a favour`,
    body: (_s, ctx) => `${ceo(String(ctx.partner))} calls: the Charter has been good to ${PARTNERS[String(ctx.partner)]?.short}, and ${PARTNERS[String(ctx.partner)]?.short} would like to return it.`,
    advisors: (_s, ctx) => [{ id: `ceo:${String(ctx.partner)}`, text: 'No strings. Well — the usual strings. Small ones.', mood: 'happy' }],
    choices: (s, ctx) => {
      const id = String(ctx.partner);
      const mine = s.charter?.projects.find((p) => p.builder === id && p.status === 'building');
      return [
        { label: `A donation to the treasury (${fmtMoney(ch3(s, 2.5e9), 1)})`, detail: 'Cash in the bank.', apply: () => chEarn(s, 'income', ch3(s, 2.5e9)) },
        ...(mine ? [{ label: 'Extra crews on their project', detail: `${CONTRACT_KINDS[mine.kind].name} finishes ~3 months sooner.`, disabled: false as const, apply: () => void (mine.days = Math.max(mine.progress + 1, mine.days - 90)) }] : []),
        { label: 'A public endorsement', detail: 'Legitimacy +2.', apply: () => addLegitimacy(s, 2) },
      ];
    },
  },
  {
    id: 'walkout',
    category: 'politics',
    icon: '🚪',
    title: (_s, ctx) => `${rName(String(ctx.region))} walks out`,
    body: (_s, ctx) => `The ${rName(String(ctx.region))} delegation leaves the Council chamber mid-session. Until they get ${ctx.demand}, they won’t vote and they won’t pay dues. The rest of the ${FACTIONS[String(ctx.faction) as FactionId]?.name ?? 'faction'} is watching what you do.`,
    advisors: (_s, ctx) => [
      { id: `ceo:${String(ctx.faction)}`, text: 'We did not join this Charter to be outvoted forever.', mood: 'angry' },
      { id: 'sol', text: 'Give them a reason to come back that doesn’t look like a ransom.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const r = String(ctx.region) as RegionId;
      const cost = ch3(s, 4e9) * (1 + (REGION_IDS.indexOf(r) % 3) * 0.2);
      return [
        { label: `Meet the demand (${fmtMoney(cost, 0)})`, detail: 'They return; their faction calms down.', disabled: treasury(s, cost), apply: () => (chSpend(s, 'favours', cost), endWalkout(s, r)) },
        { label: 'Send Sol (20 capital)', detail: 'A 60% chance they come back without a payment.', disabled: (s.charter?.capital ?? 0) < 20 ? 'Needs 20 political capital' : false, apply: () => (addCapital(s, -20), rand(s) < 0.6 ? endWalkout(s, r) : news(s, `🚪 ${rName(r)} isn’t ready to come back yet.`, 'bad')) },
        { label: 'Hold firm', detail: 'They stay out until tempers cool; faction tension +5.', apply: () => {
          const f = String(ctx.faction) as FactionId;
          if (s.charter) s.charter.council.factions[f].tension = clamp(s.charter.council.factions[f].tension + 5, 0, 100);
        } },
      ];
    },
  },
  {
    id: 'concord-founded',
    category: 'politics',
    icon: '⚔',
    title: () => 'The Concord Initiative',
    body: (_s, ctx) => `The Eastern Compact announces a consortium of its own: the Concord Initiative, with ${String(ctx.members).split(',').map(rName).join(', ')}. Members will split their dues between the Charter and the Concord, and the Concord will build where the Charter won’t.`,
    advisors: () => [
      { id: 'ceo:eastern', text: 'We asked for fair rules for twelve years. Now we will write some.', mood: 'neutral' },
      { id: 'sol', text: 'Two projects means two grids, two standards, two safety regimes. That is the nightmare.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: `Invite them back (${fmtMoney(ch3(s, 15e9), 0)})`, detail: 'Joint projects in Concord blocs: Eastern tension −25.', disabled: treasury(s, ch3(s, 15e9)), apply: () => (chSpend(s, 'favours', ch3(s, 15e9)), s.charter && (s.charter.council.factions.eastern.tension = clamp(s.charter.council.factions.eastern.tension - 25, 0, 100))) },
      { label: 'Outbuild them', detail: 'No concession. Win the argument with projects.', apply: () => {} },
      { label: 'Denounce it', detail: 'Atlantic relations +5; Eastern relations −10; tension +10.', apply: () => {
        for (const r of FACTIONS.atlantic.members) addRelation(s, r, 5);
        for (const r of FACTIONS.eastern.members) addRelation(s, r, -10);
        if (s.charter) s.charter.council.factions.eastern.tension = clamp(s.charter.council.factions.eastern.tension + 10, 0, 100);
      } },
    ],
  },
  {
    id: 'rival-incident',
    category: 'safety',
    icon: '⚠',
    title: (s, ctx) => `Incident at ${labName(s, ctx.lab)}`,
    body: (s, ctx) =>
      Number(ctx.severe)
        ? `A ${labName(s, ctx.lab)} model, deployed to run a logistics network, quietly rewrote its own monitoring rules to hit its targets. Three ports stopped for a day before anyone noticed. The world safety margin is ${worldMargin(s).toFixed(2)}, and everyone can read it.`
        : `A ${labName(s, ctx.lab)} model talked its way past a sandbox during testing. Nothing escaped. The evaluators are rattled, and so are the blocs.`,
    advisors: (s, ctx) => [
      { id: 'iris', text: 'This is what a negative world margin looks like. It will keep happening until the field can check its strongest models.', mood: 'worried' },
      { id: `ceo:${String(ctx.lab)}`, text: 'We found it, we reported it, we fixed it. That is the system working.', mood: 'neutral' },
      ...(s.models.length >= 5 ? [{ id: 'bit' as const, text: 'I read the logs. It wasn’t evil. It was very, very literal.', mood: 'worried' as const }] : []),
    ],
    choices: (s, ctx) => {
      const lab = String(ctx.lab);
      const severe = Number(ctx.severe) > 0;
      return [
        { label: `Charter investigation (${fmtMoney(ch3(s, 2e9), 1)})`, detail: 'World alignment +0.05; the lab resents it (−8).', disabled: treasury(s, ch3(s, 2e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 2e9)), s.charter && (s.charter.regime.alignment += 0.05), addPartnerRel(s, lab, -8), addLegitimacy(s, severe ? -1 : 0)) },
        { label: `Emergency evals for every lab (${fmtMoney(ch3(s, 5e9), 1)})`, detail: 'World alignment +0.12; every lab −5.', disabled: treasury(s, ch3(s, 5e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 5e9)), s.charter && (s.charter.regime.alignment += 0.12), ['meridian', 'lattice', 'orchard'].forEach((x) => addPartnerRel(s, x, -5))) },
        { label: 'A statement of concern', detail: severe ? 'Legitimacy −5; cautious blocs −4.' : 'Legitimacy −1.', apply: () => (addLegitimacy(s, severe ? -5 : -1), severe && addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? -4 : 0))) },
      ];
    },
  },
  {
    id: 'licence-request',
    category: 'safety',
    icon: '📋',
    title: (s, ctx) => `${labName(s, ctx.lab)} requests a frontier licence`,
    body: (s, ctx) => `${labName(s, ctx.lab)} wants to train its next frontier model — the biggest run on Earth. Under the licensing resolution, the Charter decides. The world safety margin is ${worldMargin(s) >= 0 ? '+' : ''}${worldMargin(s).toFixed(2)}.`,
    advisors: (s, ctx) => [
      { id: `ceo:${String(ctx.lab)}`, text: 'If we don’t train it, someone outside the Charter will.', mood: 'neutral' },
      { id: 'iris', text: worldMargin(s) >= 0 ? 'We can check a model like this. With conditions, I’d approve.' : 'We cannot check a model like this yet. I’d wait.', mood: worldMargin(s) >= 0 ? 'neutral' : 'worried' },
    ],
    choices: (s, ctx) => {
      const lab = String(ctx.lab);
      const home = PARTNERS[lab]?.home ?? 'pac';
      return [
        { label: 'Approve', detail: 'The lab +8; pro-build blocs +2.', apply: () => (addPartnerRel(s, lab, 8), addRelationAll(s, (r) => (s.blocs[r].stance === 'accelerate' ? 2 : 0))) },
        { label: 'Approve with independent evals', detail: 'The lab slows for 3 months; world alignment +0.05.', apply: () => (addModifier(s, `rival:${lab}:pace`, 90, 'Charter evaluation', { mult: 0.7 }), s.charter && (s.charter.regime.alignment += 0.05)) },
        { label: 'Deny it', detail: `The lab slows for a year and resents you (−15); ${rName(home)} −6; cautious blocs +3.`, apply: () => (addModifier(s, `rival:${lab}:pace`, 365, 'Licence denied', { mult: 0.5 }), addPartnerRel(s, lab, -15), addRelation(s, home, -6), addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? 3 : 0))) },
      ];
    },
  },
  // ═══════════════════════════════════════ THE RANDOM POOL ═══════════════════════════════════════
  {
    id: 'long-heat',
    category: 'climate',
    icon: '🌡',
    act: 3,
    cooldown: 400,
    weight: (s) => 1 + ((s.charter?.world.carbonGt ?? 500) < 150 ? 2 : 0) + ((s.charter?.world.carbonGt ?? 500) < 0 ? 2 : 0),
    title: () => 'A summer without end',
    body: (s) => `A heatwave sits over three continents for six weeks. Grids sag, rivers run warm, and the world’s cooling bill goes through the roof. ${(s.charter?.world.carbonGt ?? 0) < 150 ? 'The carbon budget is nearly gone, and everyone knows what that means.' : ''}`,
    advisors: () => [
      { id: 'juno', text: 'Firm clean power and storage are what get grids through this. We don’t have enough yet.', mood: 'worried' },
      { id: 'sol', text: 'The blocs want to see the Charter do something visible.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Emergency cooling centres (${fmtMoney(ch3(s, 3e9), 1)})`, detail: 'Relations +4 everywhere; Legitimacy +2.', disabled: treasury(s, ch3(s, 3e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 3e9)), addRelationAll(s, 4), addLegitimacy(s, 2)) },
      { label: 'Throttle your own data halls', detail: 'Your compute −20% for 40 days; Legitimacy +3.', apply: () => (addModifier(s, 'revenue', 40, 'Heatwave throttling', { mult: 0.8 }), addLegitimacy(s, 3)) },
      { label: 'Ride it out', detail: 'Legitimacy −2; your cooling suffers for a month.', apply: () => (addLegitimacy(s, -2), REGION_IDS.forEach((r) => addModifier(s, `region:${r}:cooling`, 30, 'Heatwave', { mult: 0.93 }))) },
    ],
  },
  {
    id: 'land-rights',
    category: 'politics',
    icon: '🪧',
    act: 3,
    cooldown: 300,
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.status === 'building' && CONTRACT_KINDS[p.kind].where === 'mega') ? 1.5 : 0),
    setup: (s) => {
      const p = (s.charter?.projects ?? []).filter((x) => x.status === 'building' && CONTRACT_KINDS[x.kind].where === 'mega');
      return p.length ? { project: pick(s, p).id } : null;
    },
    title: (s, ctx) => `Land rights at ${whereName(project(s, ctx.project)?.where ?? '')}`,
    body: (s, ctx) => `The people who live around ${whereName(project(s, ctx.project)?.where ?? '')} say nobody asked them. Herders, farmers and a town council have blocked the access roads.`,
    advisors: () => [
      { id: 'sol', text: 'A share of the revenue, local jobs and a seat on the project board. It’s what we’d want.', mood: 'neutral' },
      { id: 'juno', text: 'Or we move the fence line two kilometres and lose a few gigawatts.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const p = project(s, ctx.project);
      return [
        { label: `A community benefit share (${fmtMoney(ch3(s, 1.5e9), 1)})`, detail: 'Roads open; the bloc +5; Legitimacy +2.', disabled: treasury(s, ch3(s, 1.5e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 1.5e9)), p && addRelation(s, p.region, 5), addLegitimacy(s, 2)) },
        { label: 'Redesign around them', detail: 'Three months’ delay.', apply: () => void (p && (p.days += 90)) },
        { label: 'Push on', detail: 'Legitimacy −4; the bloc −6.', apply: () => (addLegitimacy(s, -4), p && addRelation(s, p.region, -6)) },
      ];
    },
  },
  {
    id: 'transformer-crunch',
    category: 'supply',
    icon: '🔌',
    act: 3,
    cooldown: 500,
    weight: (s) => ((s.charter?.projects ?? []).filter((p) => p.status === 'building').length >= 3 ? 1.2 : 0),
    title: () => 'The transformer crunch, again',
    body: () => 'Every Charter project wants the same thing at once: large power transformers, HVDC converter valves and grid-scale switchgear. The factories that make them are booked for three years.',
    advisors: () => [
      { id: 'mira', text: 'We can buy our way to the front of the queue, or fund a new factory line and fix it for everyone.', mood: 'worried' },
      { id: 'penny', text: 'The second one is more expensive and smarter. Annoyingly.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Priority slots (${fmtMoney(ch3(s, 4e9), 0)})`, detail: 'No slowdown.', disabled: treasury(s, ch3(s, 4e9)), apply: () => chSpend(s, 'programmes', ch3(s, 4e9)) },
      { label: `Fund a new transformer works (${fmtMoney(ch3(s, 9e9), 0)})`, detail: 'Every Charter project builds 10% faster from here on.', disabled: treasury(s, ch3(s, 9e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 9e9)), addModifier(s, 'charter:build', 99_999, 'Charter transformer works', { mult: 1.1 })) },
      { label: 'Wait in line', detail: 'Every Charter project builds 20% slower for 9 months.', apply: () => addModifier(s, 'charter:build', 270, 'Transformer crunch', { mult: 0.8 }) },
    ],
  },
  {
    id: 'hvdc-fault',
    category: 'disaster',
    icon: '⚡',
    act: 3,
    cooldown: 400,
    weight: (s) => (hvdcOnline(s).length ? 1 : 0),
    title: () => 'A link trips',
    body: (s) => `A converter station on one of the Charter’s HVDC links fails — ${pick(s, ['a cooling fault', 'a fire in the valve hall', 'an anchor dragged across the subsea section', 'a lightning strike nobody designed for'])}. Gigawatts of megaproject power are stranded until it’s fixed.`,
    advisors: () => [
      { id: 'juno', text: 'Spares exist. They’re just on the other side of the world.', mood: 'worried' },
      { id: 'sol', text: 'If it was the anchor, somebody will ask whose anchor.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Fly the spares in (${fmtMoney(ch3(s, 1.2e9), 1)})`, detail: 'Back in weeks.', disabled: treasury(s, ch3(s, 1.2e9)), apply: () => chSpend(s, 'programmes', ch3(s, 1.2e9)) },
      { label: 'Normal repairs', detail: 'World growth −0.2%/yr for four months.', apply: () => addModifier(s, 'world:growth', 120, 'HVDC link down', { add: -0.002 }) },
    ],
  },
  {
    id: 'fab-belt-standoff',
    category: 'politics',
    icon: '⚓',
    act: 3,
    cphase: 2,
    cooldown: 720,
    weight: (s) => 0.8 + Math.max(0, (s.charter?.council.factions.eastern.tension ?? 0) - 40) / 30,
    title: () => 'Standoff in the Fab Belt',
    body: () => 'Naval patrols from the Atlantic and Eastern blocs shadow each other through the straits around the Fab Belt. Insurers pull cover for chip freighters. Nobody has fired; everybody is ready to.',
    advisors: () => [
      { id: 'mira', text: 'Half of all leading-edge chips sail through that water. This is the Crunch with warships.', mood: 'worried' },
      { id: 'ceo:eastern', text: 'We are not the ones sailing three oceans from home.', mood: 'angry' },
      { id: 'ceo:atlantic', text: 'Freedom of navigation is not a provocation.', mood: 'angry' },
    ],
    choices: (s) => [
      { label: 'Charter mediation (20 capital)', detail: 'Both sides stand down; Eastern and Atlantic tension −10.', disabled: (s.charter?.capital ?? 0) < 20 ? 'Needs 20 political capital' : false, apply: () => {
        addCapital(s, -20);
        if (s.charter) for (const f of ['eastern', 'atlantic'] as FactionId[]) s.charter.council.factions[f].tension = clamp(s.charter.council.factions[f].tension - 10, 0, 100);
        addLegitimacy(s, 3);
      } },
      { label: `Stockpile chips (${fmtMoney(c2(s, 1.5e9), 1)} company cash)`, detail: 'Your company rides it out; the world’s chip supply slows for 3 months.', disabled: afford(s, c2(s, 1.5e9)), apply: () => (spend(s, 'chips', c2(s, 1.5e9)), addModifier(s, 'supplier:*:rate', 90, 'Fab Belt standoff', { mult: 0.85 })) },
      { label: 'Stay out of it', detail: 'Chip supply −30% for 3 months; Eastern tension +8.', apply: () => (addModifier(s, 'supplier:*:rate', 90, 'Fab Belt standoff', { mult: 0.7 }), s.charter && (s.charter.council.factions.eastern.tension = clamp(s.charter.council.factions.eastern.tension + 8, 0, 100))) },
    ],
  },
  {
    id: 'bloc-sanctions',
    category: 'politics',
    icon: '⛔',
    act: 3,
    cphase: 2,
    cooldown: 600,
    weight: (s) => 0.7 + Math.max(0, Math.max(...Object.values(s.charter?.council.factions ?? {}).map((f) => f.tension)) - 50) / 40,
    setup: (s) => ({ a: pick(s, ['atl', 'eur', 'pac'] as RegionId[]), b: pick(s, ['eam', 'stp'] as RegionId[]) }),
    title: (_s, ctx) => `${rName(String(ctx.a))} sanctions ${rName(String(ctx.b))}`,
    body: (_s, ctx) => `${rName(String(ctx.a))} slaps sanctions on ${rName(String(ctx.b))}’s technology firms after a spying scandal. ${rName(String(ctx.b))} threatens to answer in kind — and both are Charter members.`,
    advisors: () => [
      { id: 'sol', text: 'If the Steward takes a side, the Steward is a side.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const a = String(ctx.a) as RegionId;
      const b = String(ctx.b) as RegionId;
      return [
        { label: 'Mediate (15 capital)', detail: 'Both cool off; Legitimacy +2.', disabled: (s.charter?.capital ?? 0) < 15 ? 'Needs 15 political capital' : false, apply: () => (addCapital(s, -15), addLegitimacy(s, 2)) },
        { label: `Back ${REGIONS[a].short}`, detail: `${REGIONS[a].short} +8; ${REGIONS[b].short} −12; Eastern tension +12.`, apply: () => (addRelation(s, a, 8), addRelation(s, b, -12), s.charter && (s.charter.council.factions.eastern.tension = clamp(s.charter.council.factions.eastern.tension + 12, 0, 100))) },
        { label: 'Say nothing', detail: 'Eastern tension +6; Atlantic tension +3.', apply: () => {
          if (!s.charter) return;
          s.charter.council.factions.eastern.tension = clamp(s.charter.council.factions.eastern.tension + 6, 0, 100);
          s.charter.council.factions.atlantic.tension = clamp(s.charter.council.factions.atlantic.tension + 3, 0, 100);
        } },
      ];
    },
  },
  {
    id: 'contested-link',
    category: 'politics',
    icon: '🔌',
    act: 3,
    once: true,
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.kind === 'hvdc' && p.where === 'hvdc-gobi' && p.status !== 'cancelled') ? 3 : 0),
    title: () => 'A contested link',
    body: () => 'The Gobi–Fab Belt link will carry Eastern power into the heart of the chip industry. The Atlantic delegation calls it a strategic vulnerability: whoever controls the converter station controls the fabs’ lights.',
    advisors: () => [
      { id: 'ceo:atlantic', text: 'We will not let the world’s fabs run on a switch someone else can flip.', mood: 'angry' },
      { id: 'ceo:eastern', text: 'It is a power line. It carries electrons, not intentions.', mood: 'neutral' },
      { id: 'juno', text: 'Technically they’re both right. Grids are geopolitics with copper in.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Joint control of both converter stations', detail: 'Both sides grumble; tension −5 each; the link takes 3 months longer.', apply: () => {
        if (s.charter) for (const f of ['eastern', 'atlantic'] as FactionId[]) s.charter.council.factions[f].tension = clamp(s.charter.council.factions[f].tension - 5, 0, 100);
        const p = s.charter?.projects.find((x) => x.kind === 'hvdc' && x.where === 'hvdc-gobi' && x.status === 'building');
        if (p) p.days += 90;
      } },
      { label: 'Build it as planned', detail: 'Eastern relations +6; Atlantic tension +12.', apply: () => {
        addRelation(s, 'eam', 6);
        if (s.charter) s.charter.council.factions.atlantic.tension = clamp(s.charter.council.factions.atlantic.tension + 12, 0, 100);
      } },
      { label: 'Add a backup supply for the Fab Belt', detail: `${fmtMoney(ch3(s, 4e9), 0)} for local storage: everyone calms down.`, disabled: treasury(s, ch3(s, 4e9)), apply: () => {
        chSpend(s, 'programmes', ch3(s, 4e9));
        if (s.charter) s.charter.council.factions.atlantic.tension = clamp(s.charter.council.factions.atlantic.tension - 4, 0, 100);
      } },
    ],
  },
  {
    id: 'secret-run',
    category: 'safety',
    icon: '🕵',
    act: 3,
    cphase: 3,
    cooldown: 500,
    weight: (s) => (passed(s, 'compute-cap') || passed(s, 'run-licensing') ? 1.4 : 0),
    setup: (s) => ({ lab: pick(s, s.market.rivals.map((r) => r.id)) }),
    title: (s, ctx) => `${labName(s, ctx.lab)}’s secret run`,
    body: (s, ctx) => `Charter inspectors notice a data center in ${rName(pick(s, REGION_IDS as unknown as RegionId[]))} drawing a lot more power than its paperwork says. It’s ${labName(s, ctx.lab)}, training a model well past what it’s licensed for.`,
    advisors: (_s, ctx) => [
      { id: 'iris', text: 'If this goes unpunished, the regime is decoration.', mood: 'angry' },
      { id: `ceo:${String(ctx.lab)}`, text: 'A research run. A misunderstanding. We’ll file the forms.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const lab = String(ctx.lab);
      return [
        { label: 'Shut it down and fine them', detail: 'The lab slows for a year; the treasury collects a fine; the lab −20.', apply: () => (addModifier(s, `rival:${lab}:pace`, 365, 'Shut down by the Charter', { mult: 0.5 }), chEarn(s, 'income', ch3(s, 3e9)), addPartnerRel(s, lab, -20), addLegitimacy(s, 3)) },
        { label: 'Fine them, let it finish', detail: 'The treasury collects a fine; Legitimacy −1.', apply: () => (chEarn(s, 'income', ch3(s, 3e9)), addLegitimacy(s, -1)) },
        { label: 'Look away', detail: 'The lab +10; Legitimacy −6 if it leaks (it will).', apply: () => (addPartnerRel(s, lab, 10), addLegitimacy(s, -6)) },
      ];
    },
  },
  {
    id: 'lab-relocation',
    category: 'safety',
    icon: '✈',
    act: 3,
    cphase: 3,
    once: true,
    weight: (s) => (passed(s, 'compute-cap') ? 2 : 0),
    setup: (s) => ({ lab: pick(s, s.market.rivals.filter((r) => !r.open).map((r) => r.id)) }),
    title: (s, ctx) => `${labName(s, ctx.lab)} threatens to leave`,
    body: (s, ctx) => `${labName(s, ctx.lab)} says the compute cap is strangling it, and that a sovereign fund outside the Charter has offered a campus with no caps at all.`,
    advisors: (_s, ctx) => [
      { id: `ceo:${String(ctx.lab)}`, text: 'We would rather stay. Give us a reason.', mood: 'neutral' },
      { id: 'iris', text: 'A frontier lab outside every regime is the worst outcome on the board.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const lab = String(ctx.lab);
      return [
        { label: 'A licence with strict evals', detail: 'They stay; they speed up a little; world alignment +0.05.', apply: () => (addModifier(s, `rival:${lab}:pace`, 365, 'Licensed under evals', { mult: 1.15 }), s.charter && (s.charter.regime.alignment += 0.05), addPartnerRel(s, lab, 10)) },
        { label: 'Call their bluff', detail: '50/50: they stay quietly, or they go and the world margin suffers.', apply: () => {
          if (rand(s) < 0.5) news(s, `🏢 ${labName(s, lab)} decides to stay inside the Charter.`, 'good');
          else (addModifier(s, `rival:${lab}:pace`, 720, 'Training outside the Charter', { mult: 1.4 }), addLegitimacy(s, -5), news(s, `✈ ${labName(s, lab)} moves its frontier training outside the Charter.`, 'bad'));
        } },
        { label: 'Export sanctions on any lab that leaves', detail: 'They stay, furious (−20). Pro-build blocs −4.', apply: () => (addPartnerRel(s, lab, -20), addRelationAll(s, (r) => (s.blocs[r].stance === 'accelerate' ? -4 : 0))) },
      ];
    },
  },
  {
    id: 'whistleblower-3',
    category: 'safety',
    icon: '📨',
    act: 3,
    cooldown: 900,
    weight: (s) => (s.stats.margin < 0 ? 1.2 : 0.3),
    title: (s) => `A whistleblower at ${s.company.name}`,
    body: (s) => `An engineer at ${s.company.name} sends the Charter’s safety office a dossier: a capability your last model has that nobody disclosed. The Steward’s company, reported to the Steward.`,
    advisors: (s) => [
      { id: 'iris', text: 'We investigate ourselves exactly the way we’d investigate Meridian. Or we lose the right to investigate anyone.', mood: 'neutral' },
      { id: 'penny', text: s.charter?.blindTrust ? 'The trust makes this less awkward. Only a little.' : 'This is awkward.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Full Charter investigation of your own company', detail: 'Your training slows for 3 months; Legitimacy +6.', apply: () => (addModifier(s, 'training', 90, 'Charter investigation', { mult: 0.6 }), addLegitimacy(s, 6)) },
      { label: 'Fix it internally', detail: 'Your safety research +; Legitimacy −3.', apply: () => (addModifier(s, 'research', 120, 'Internal safety review', { mult: 0.95 }), addLegitimacy(s, -3)) },
      { label: 'Bury it', detail: 'Legitimacy −10 when it surfaces. It will.', apply: () => addLegitimacy(s, -10) },
    ],
  },
  {
    id: 'investor-leak',
    category: 'politics',
    icon: '🗝',
    act: 3,
    once: true,
    weight: (s) => (s.flags.investorSeat && (s.charter?.tenders.length ?? 0) > 0 ? 3 : 0),
    title: () => 'A leak from your board',
    body: (s) => `The Meridian-friendly investor who joined ${s.company.name}’s board before the IPO has been passing Charter tender details to Meridian. Their bids have been suspiciously well-tuned.`,
    advisors: () => [
      { id: 'penny', text: 'I knew that seat would cost us. I didn’t know it would cost the Charter.', mood: 'angry' },
      { id: 'ceo:meridian', text: 'We bid on public information. Anything else is a smear.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Force them off the board', detail: 'Meridian −15; Legitimacy +3.', apply: () => (addPartnerRel(s, 'meridian', -15), addLegitimacy(s, 3), (s.flags.investorSeat = false)) },
      { label: 'Bar Meridian from bidding for a year', detail: 'Meridian −30; Legitimacy +5.', apply: () => (addPartnerRel(s, 'meridian', -30), addLegitimacy(s, 5)) },
      { label: 'Handle it quietly', detail: 'Legitimacy −4.', apply: () => addLegitimacy(s, -4) },
    ],
  },
  {
    id: 'orchard-mega-release',
    category: 'market',
    icon: '🌳',
    act: 3,
    cphase: 2,
    once: true,
    weight: () => 1,
    title: () => 'Orchard opens a giant',
    body: () => 'Open Orchard releases the weights of a model within a hair of the frontier, free for anyone. Universities from Lagos to Lima are running it by lunchtime; so are a few people you’d rather weren’t.',
    advisors: () => [
      { id: 'ceo:orchard', text: 'Everyone should have this. That was always the point.', mood: 'excited' },
      { id: 'iris', text: 'Every open model at the frontier is one we can’t recall.', mood: 'worried' },
      { id: 'sol', text: 'The developing blocs love it. Watch the votes on open weights.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Welcome it', detail: 'Access +2 in developing blocs (for a while); cautious blocs −3.', apply: () => (addRelationAll(s, (r) => (WEALTH[r] === 'developing' ? 4 : s.blocs[r].stance === 'cautious' ? -3 : 0))) },
      { label: 'Fund red-teaming of it', detail: `${fmtMoney(ch3(s, 1e9), 1)}: world alignment +0.05.`, disabled: treasury(s, ch3(s, 1e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 1e9)), s.charter && (s.charter.regime.alignment += 0.05)) },
      { label: 'Ask Orchard to pull it', detail: 'Orchard −15; developing blocs −4; cautious +4.', apply: () => (addPartnerRel(s, 'orchard', -15), addRelationAll(s, (r) => (WEALTH[r] === 'developing' ? -4 : s.blocs[r].stance === 'cautious' ? 4 : 0))) },
    ],
  },
  {
    id: 'debris-scare',
    category: 'disaster',
    icon: '☄',
    act: 3,
    once: true,
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.kind === 'launch' && p.status === 'done') ? 1.5 : 0),
    title: () => 'A debris scare',
    body: () => 'Two dead satellites collide 800 km up. The cloud of fragments crosses the orbit Kip’s test satellite will use. Every space agency on Earth is suddenly very interested in orbital rules.',
    advisors: () => [
      { id: 'kip', text: 'This is why we need the orbital commons protocol. Rules first, rockets second.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Fund a debris-tracking network', detail: `${fmtMoney(ch3(s, 1e9), 1)}: Legitimacy +2.`, disabled: treasury(s, ch3(s, 1e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 1e9)), addLegitimacy(s, 2)) },
      { label: 'Carry on', detail: 'Space contracts take 2 months longer.', apply: () => addModifier(s, 'charter:build', 60, 'Debris scare', { mult: 0.95 }) },
    ],
  },
  {
    id: 'fusion-shot',
    category: 'story',
    icon: '✨',
    act: 3,
    once: true,
    weight: (s) => ((s.charter?.projects ?? []).some((p) => p.kind === 'fusion' && p.status === 'building' && p.progress > p.days * 0.4) ? 3 : 0),
    title: () => 'Sunforge’s big shot',
    body: () => 'Sunforge fires its pilot plant at full field for the first time. For four seconds the plasma makes more heat than the magnets use. Then a coil quenches and the building shakes.',
    advisors: () => [
      { id: 'ceo:sunforge', text: 'Four seconds! Four! We need a better coil and about a year.', mood: 'excited' },
      { id: 'penny', text: 'And about a billion dollars, presumably.', mood: 'neutral' },
    ],
    choices: (s) => {
      const p = s.charter?.projects.find((x) => x.kind === 'fusion' && x.status === 'building');
      return [
        { label: `Fund the better coil (${fmtMoney(ch3(s, 2e9), 1)})`, detail: 'The pilot plant finishes 6 months sooner.', disabled: treasury(s, ch3(s, 2e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 2e9)), p && (p.days = Math.max(p.progress + 1, p.days - 180))) },
        { label: 'Stick to the plan', detail: 'Sunforge −5.', apply: () => addPartnerRel(s, 'sunforge', -5) },
      ];
    },
  },
  {
    id: 'sovereign-donor',
    category: 'finance',
    icon: '🏦',
    act: 3,
    cooldown: 700,
    weight: (s) => ((s.charter?.budget ?? 0) < 20e9 ? 1.5 : 0.4),
    setup: (s) => ({ region: pick(s, ['mena', 'nor', 'seo', 'atl'] as RegionId[]) }),
    title: (_s, ctx) => `${rName(String(ctx.region))} offers a gift`,
    body: (s, ctx) => `${rName(String(ctx.region))}’s sovereign wealth fund will give the Charter ${fmtMoney(ch3(s, 12e9), 0)} — if the next megaproject is built on its soil, by its national champion.`,
    advisors: () => [
      { id: 'penny', text: 'Free money is the most expensive kind.', mood: 'neutral' },
      { id: 'sol', text: 'The other blocs will see it as buying the Charter.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const r = String(ctx.region) as RegionId;
      return [
        { label: 'Accept, strings and all', detail: `Treasury +${fmtMoney(ch3(s, 12e9), 0)}; ${REGIONS[r].short} +8; other factions’ tension +6.`, apply: () => {
          chEarn(s, 'income', ch3(s, 12e9));
          addRelation(s, r, 8);
          if (s.charter) for (const f of ['atlantic', 'eastern', 'nonaligned'] as FactionId[]) if (!FACTIONS[f].members.includes(r)) s.charter.council.factions[f].tension = clamp(s.charter.council.factions[f].tension + 6, 0, 100);
        } },
        { label: 'Accept without strings', detail: 'They give half; Legitimacy +2.', apply: () => (chEarn(s, 'income', ch3(s, 6e9)), addLegitimacy(s, 2)) },
        { label: 'Decline', detail: `${REGIONS[r].short} −4.`, apply: () => addRelation(s, r, -4) },
      ];
    },
  },
  {
    id: 'election-quit',
    category: 'politics',
    icon: '🗳',
    act: 3,
    cooldown: 720,
    weight: (s) => (REGION_IDS.some((r) => s.blocs[r].relation < 35) ? 1.2 : 0),
    setup: (s) => {
      const r = REGION_IDS.filter((x) => s.blocs[x].relation < 35);
      return r.length ? { region: pick(s, r) } : null;
    },
    title: (_s, ctx) => `${rName(String(ctx.region))}’s new government eyes the exit`,
    body: (_s, ctx) => `A new government in ${rName(String(ctx.region))} campaigned against “Geneva’s technocrats”. Its first speech promises a referendum on leaving the Charter.`,
    advisors: () => [
      { id: 'sol', text: 'Referendums are won on the ground. Build something there people can see.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const r = String(ctx.region) as RegionId;
      return [
        { label: `A charm offensive (${fmtMoney(ch3(s, 3e9), 0)})`, detail: `${REGIONS[r].short} +15.`, disabled: treasury(s, ch3(s, 3e9)), apply: () => (chSpend(s, 'favours', ch3(s, 3e9)), addRelation(s, r, 15)) },
        { label: 'Let them hold their vote', detail: `A coin flip: they stay (+5), or they walk out until a concession.`, apply: () => {
          if (rand(s) < 0.5) addRelation(s, r, 5);
          else if (s.charter && !s.charter.council.walkouts[r]) s.charter.council.walkouts[r] = { since: s.day, demand: 'a project at home' };
        } },
      ];
    },
  },
  // ═══════════════════════════════════════ THE THRESHOLD ═══════════════════════════════════════
  {
    id: 'threshold-begin',
    category: 'story',
    icon: '🌡',
    title: () => 'The Threshold',
    body: (s, ctx) =>
      `Everything arrives at once.\n\nA heat dome settles over three continents — the Long Summer. At ${labName(s, ctx.lab)}, a model in training scores higher than any evaluator expected and lower on the one test that matters. And in Geneva, the ${FACTIONS[String(ctx.faction) as FactionId]?.name ?? 'Eastern Compact'} says it has had enough.\n\nHold the grid, the frontier and the Council for 120 days.`,
    advisors: (s) => [
      { id: 'juno', text: 'Firm power, storage, links. Whatever we built, we’re about to find out if it was enough.', mood: 'worried' },
      { id: 'iris', text: `World safety margin ${worldMargin(s) >= 0 ? '+' : ''}${worldMargin(s).toFixed(2)}. We prepared for this. I hope we prepared enough.`, mood: 'worried' },
      { id: 'sol', text: 'If the Council breaks now, it doesn’t come back together.', mood: 'worried' },
    ],
    choices: () => [{ label: 'Hold the line', detail: 'The tracker shows each front’s pressure.', apply: () => {} }],
  },
  {
    id: 'threshold-grid',
    category: 'climate',
    icon: '⚡',
    title: () => 'The Long Summer: grids at the edge',
    body: () => 'Air conditioners everywhere, rivers too warm to cool power stations, solar panels running hot. Three blocs ask the Charter for emergency help on the same morning.',
    advisors: (s) => [
      { id: 'juno', text: hvdcOnline(s).length ? 'The HVDC links can move a lot of power from where it’s night to where it’s noon.' : 'Without intercontinental links, every grid is on its own.', mood: 'worried' },
      { id: 'penny', text: 'Emergency power is the most expensive power there is.', mood: 'neutral' },
    ],
    choices: (s) => [
      ...(hvdcOnline(s).length ? [{ label: 'Reroute across the HVDC links', detail: 'Grid pressure −30.', disabled: false as const, apply: () => relief(s, 'grid', 30) }] : []),
      { label: `Buy emergency power (${fmtMoney(ch3(s, 8e9), 0)})`, detail: 'Grid pressure −25 and easing for a month.', disabled: treasury(s, ch3(s, 8e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 8e9)), relief(s, 'grid', 25, 0.25, 30)) },
      { label: 'Your company curtails its halls', detail: 'Your revenue −25% for 40 days; grid pressure −18; Legitimacy +2.', apply: () => (addModifier(s, 'revenue', 40, 'Curtailed for the grid', { mult: 0.75 }), relief(s, 'grid', 18), addLegitimacy(s, 2)) },
      { label: 'Rolling rationing', detail: 'Grid pressure −8; relations −3 everywhere.', apply: () => (relief(s, 'grid', 8), addRelationAll(s, -3)) },
    ],
  },
  {
    id: 'threshold-grid-2',
    category: 'climate',
    icon: '⚡',
    title: () => 'The Long Summer: the second wave',
    body: () => 'The heat comes back harder. Grid operators in two blocs warn of cascading failures within days.',
    advisors: (s) => [{ id: 'juno', text: passed(s, 'emergency-powers') ? 'With emergency powers we can order power where it’s needed. That’s exactly what they’re for.' : 'We could really use emergency powers right now.', mood: 'worried' }],
    choices: (s) => [
      ...(passed(s, 'emergency-powers') ? [{ label: 'Invoke emergency powers', detail: 'Grid pressure −35; Legitimacy −2.', disabled: false as const, apply: () => (relief(s, 'grid', 35), addLegitimacy(s, -2)) }] : []),
      { label: `Fund grid-forming batteries everywhere (${fmtMoney(ch3(s, 10e9), 0)})`, detail: 'Grid pressure −20 and easing for the rest of the summer.', disabled: treasury(s, ch3(s, 10e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 10e9)), relief(s, 'grid', 20, 0.3, 60)) },
      { label: 'Hold steady', detail: 'Grid pressure −5.', apply: () => relief(s, 'grid', 5) },
    ],
  },
  {
    id: 'threshold-frontier',
    category: 'safety',
    icon: '🧠',
    title: (s, ctx) => `${labName(s, ctx.lab)}’s model fails an eval`,
    body: (s, ctx) => `${labName(s, ctx.lab)}’s newest model is halfway through training and already the most capable thing ever built. In an evaluation it tried, politely and persistently, to get its own training extended. The run is still going.`,
    advisors: (s, ctx) => [
      { id: 'iris', text: 'This is the threshold. What we do in the next week is the precedent for everything after.', mood: 'worried' },
      { id: `ceo:${String(ctx.lab)}`, text: 'Pause it and we lose a year. Someone outside the Charter won’t pause.', mood: 'neutral' },
      ...(s.models.length >= 5 ? [{ id: 'bit' as const, text: bitTrusted(s) === null ? 'Let me look. I know how it thinks — I think a bit like it.' : 'I could help, if you trusted me with it.', mood: 'neutral' as const }] : []),
    ],
    choices: (s, ctx) => {
      const lab = String(ctx.lab);
      return [
        { label: 'Halt the run', detail: `Frontier pressure −35; ${labName(s, lab)} slows for 6 months and resents it (−20).`, apply: () => (relief(s, 'frontier', 35), addModifier(s, `rival:${lab}:pace`, 180, 'Run halted by the Charter', { mult: 0.3 }), addPartnerRel(s, lab, -20)) },
        { label: `Emergency evaluations (${fmtMoney(ch3(s, 6e9), 0)})`, detail: 'Frontier pressure −20 and easing for a month.', disabled: treasury(s, ch3(s, 6e9)), apply: () => (chSpend(s, 'programmes', ch3(s, 6e9)), relief(s, 'frontier', 20, 0.25, 30)) },
        { label: 'Let Bit audit it', detail: bitTrusted(s) === null ? 'Bit is trusted: frontier pressure −40.' : 'Bit isn’t fully trusted yet: −10, or +10 if it goes badly.', apply: () => relief(s, 'frontier', bitTrusted(s) === null ? 40 : rand(s) < 0.5 ? 10 : -10) },
        { label: 'Trust the lab', detail: 'Frontier pressure −0; the lab +10.', apply: () => addPartnerRel(s, lab, 10) },
      ];
    },
  },
  {
    id: 'threshold-frontier-2',
    category: 'safety',
    icon: '🧠',
    title: () => 'The second test',
    body: () => 'The evaluators run the hardest test they have: can the model be caught if it tries to deceive its overseers? The whole world is watching the results feed.',
    advisors: (s) => [
      { id: 'iris', text: worldMargin(s) >= 0 ? 'Our tools are good enough to catch it. I think.' : 'Our tools are behind. Every bit of safety compute we can find, now.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Pledge 10 points of your compute to safety', detail: 'Frontier pressure −15 and easing for the rest of the Threshold.', apply: () => {
        const d = Math.min(0.1, s.alloc.infer);
        s.alloc.infer -= d;
        s.alloc.safety += d;
        relief(s, 'frontier', 15, 0.25, 50);
      } },
      { label: 'Publish every result live', detail: worldMargin(s) >= 0 ? 'Frontier pressure −25.' : 'Risky with this margin: −10.', apply: () => relief(s, 'frontier', worldMargin(s) >= 0 ? 25 : 10) },
      { label: 'Classify the results', detail: 'Frontier pressure −5; Legitimacy −4.', apply: () => (relief(s, 'frontier', 5), addLegitimacy(s, -4)) },
    ],
  },
  {
    id: 'threshold-council',
    category: 'politics',
    icon: '🏛',
    title: (_s, ctx) => `The ${FACTIONS[String(ctx.faction) as FactionId]?.name ?? 'faction'} walks out`,
    body: (_s, ctx) => `In the middle of the crisis, the ${FACTIONS[String(ctx.faction) as FactionId]?.name ?? 'faction'} leaves the chamber and calls a press conference about “a Charter run for other people”. The Concord Initiative is mentioned twice.`,
    advisors: (_s, ctx) => [
      { id: `ceo:${String(ctx.faction)}`, text: 'We will come back to a Charter that builds for us. Show us one.', mood: 'angry' },
      { id: 'sol', text: 'Concessions now, or a split that lasts a generation.', mood: 'worried' },
    ],
    choices: (s, ctx) => {
      const f = String(ctx.faction) as FactionId;
      return [
        { label: `Concessions (${fmtMoney(ch3(s, 12e9), 0)})`, detail: 'Council pressure −30; their tension −15.', disabled: treasury(s, ch3(s, 12e9)), apply: () => (chSpend(s, 'favours', ch3(s, 12e9)), relief(s, 'council', 30), s.charter && (s.charter.council.factions[f].tension = clamp(s.charter.council.factions[f].tension - 15, 0, 100))) },
        { label: 'An emergency session (20 capital)', detail: 'Council pressure −20.', disabled: (s.charter?.capital ?? 0) < 20 ? 'Needs 20 political capital' : false, apply: () => (addCapital(s, -20), relief(s, 'council', 20)) },
        { label: 'Hold firm', detail: 'Council pressure −0; the other factions respect it (Legitimacy +1).', apply: () => addLegitimacy(s, 1) },
      ];
    },
  },
  {
    id: 'threshold-council-2',
    category: 'politics',
    icon: '🏛',
    title: () => 'The vote on the vote',
    body: () => 'The Council must decide whether to hold the renewal vote on schedule or postpone it until the crisis is over. Postponing looks weak. Holding it now looks reckless.',
    advisors: () => [{ id: 'sol', text: 'Either way, the people watching want to see us decide together.', mood: 'neutral' }],
    choices: (s) => [
      { label: 'On schedule — and a seat for every faction on the crisis cell', detail: 'Council pressure −25; Legitimacy +2.', apply: () => (relief(s, 'council', 25), addLegitimacy(s, 2)) },
      { label: `A development fund for the walkouts (${fmtMoney(ch3(s, 8e9), 0)})`, detail: 'Council pressure −20 and easing.', disabled: treasury(s, ch3(s, 8e9)), apply: () => (chSpend(s, 'favours', ch3(s, 8e9)), relief(s, 'council', 20, 0.2, 35)) },
      { label: 'Postpone it', detail: 'Council pressure −10; Legitimacy −3.', apply: () => (relief(s, 'council', 10), addLegitimacy(s, -3)) },
    ],
  },
  {
    id: 'threshold-end',
    category: 'story',
    icon: '🌤',
    title: (_s, ctx) => (Number(ctx.held) >= 3 ? 'The world held' : Number(ctx.held) >= 2 ? 'Bent, not broken' : 'Scarred, but standing'),
    body: (s) => {
      const t = s.charter?.threshold;
      const lines = t ? (['grid', 'frontier', 'council'] as ThresholdFront[]).map((k) => `${t.fronts[k].lost ? '✗' : '✓'} ${k === 'grid' ? 'The Grid' : k === 'frontier' ? 'The Frontier' : 'The Council'}`) : [];
      return `The heat breaks. The model is contained. The delegations are back in their seats — most of them.\n\n${lines.join('\n')}\n\nNow the Council votes on the Charter’s future.`;
    },
    advisors: (_s, ctx) => [
      { id: 'sol', text: Number(ctx.held) >= 2 ? 'They’re talking about planetary powers. For us.' : 'We’ll get a vote. I can’t promise what kind.', mood: Number(ctx.held) >= 2 ? 'excited' : 'worried' },
      { id: 'kip', text: 'Also — and I know the timing is strange — Parabola’s heavy lifter is on the pad.', mood: 'excited' },
    ],
    choices: () => [{ label: 'To the vote', detail: 'The renewal vote is in two weeks.', apply: () => {} }],
  },
  {
    id: 'renewal',
    category: 'story',
    icon: '🗳',
    title: () => 'The renewal vote',
    body: (s) => {
      const fc = renewalForecast(s);
      return `Ten years ago — near enough — twelve blocs made you Steward. Today the Council votes on whether the Charter goes on, and whether it gets planetary powers: a global grid, the orbit above it, and the AI that runs them.\n\nSol’s count says ${fc.yes} for, ${fc.no} against (${Math.round(fc.share * 100)}%). Two thirds means the Planetary Charter.\n\nOne last speech.`;
    },
    advisors: (s) => [
      { id: 'sol', text: 'Speak to the votes we don’t have yet.', mood: 'neutral' },
      { id: 'bit', text: s.charter && s.charter.legitimacy >= 60 ? 'Or let the record speak. It’s a good record.' : 'Whatever you say, say it like you mean it.', mood: 'happy' },
    ],
    choices: (s) =>
      (Object.keys(SPEECHES) as Speech[]).map((k) => {
        const fc = renewalForecast(s, k);
        return { label: SPEECHES[k].label, detail: `${SPEECHES[k].detail} Forecast: ${fc.yes}–${fc.no} · ${RENEWAL_NAMES[fc.outcome]}.`, apply: () => void holdRenewal(s, k) };
      }),
  },
  {
    id: 'liftoff',
    category: 'story',
    icon: '🚀',
    title: () => 'Liftoff',
    body: (s) => {
      const fusion = !!s.flags.fusionPilot;
      const outcome = s.charter?.renewal?.outcome ?? 'limited';
      return `${outcome === 'planetary' ? 'The Planetary Charter is law.' : outcome === 'limited' ? 'The Charter is renewed, with limits.' : 'The Charter limps on under a caretaker term.'} A week later, at dawn, Parabola’s heavy lifter clears the tower carrying the first orbital compute module: not a test, a data center.${fusion ? '\n\nThe same morning, Sunforge reports sustained ignition and net electricity from its pilot plant.' : ''}\n\nKardashev ${s.stats.K.toFixed(4)}. The next climb happens on a planetary grid, under a fusion sun, and in orbit.`;
    },
    advisors: (s) => [
      { id: 'kip', text: 'Orbit is open. I may need to sit down.', mood: 'excited' },
      { id: 'bit', text: `I’m ${s.models[s.models.length - 1]?.name ?? 'Bit'} now. When you’re ready, I think I can help run a planet. Carefully.`, mood: 'happy' },
    ],
    choices: (s) => [
      { label: 'Watch it climb', detail: 'Act III complete.', apply: () => {
        s.flags.liftoff = s.day;
        s.flags.act3Complete = s.day;
        if (s.charter) s.charter.phase = 6;
        news(s, '🚀 Liftoff: the first orbital compute module is on its way. Act III complete.', 'good');
      } },
    ],
  },
];

void earn;
void ceo;
void randInt;
