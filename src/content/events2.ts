/**
 * Act II events: the scripted beats of The Scale-Up, advisor arcs (Mira's HBM Crunch, Sol's Lines on
 * the Map, Juno's Restart, Iris's Race Dynamics, Penny's Board), the random pool, and The Crunch.
 * Prices are written at Act II scale and go through `c2` (difficulty and a little inflation).
 */
import type { EventDef, Ctx } from './events';
import type { FrontId, GameState } from '../sim/types';
import { REGIONS } from './regions';
import { REGION_IDS, type RegionId } from './mapcodes';
import { siteDef, BUILD_SITES } from './sites';
import { CABLE_BY_ID, CABLES } from './network';
import { EXPORT_RULES, RULE_BY_ID } from './politics';
import { BOARD, SERIES_B } from './capital';
import { CEOS } from './companies';
import { addModifier, hasTech, modMult } from '../sim/effects';
import { earn, spend } from '../sim/economy';
import { clamp, fmtMoney, fmtMW, news, nextId, pick, rand, randInt, weightedPick } from '../sim/core';
import { crisisCost2, currentCapability, frontier } from '../sim/model';
import { addRelation, addRelationAll, blocIT } from '../sim/politics';
import { canApplyLicence, applyLicence, signTreaty } from '../sim/actions';
import { ipoValuation } from '../sim/capital';
import { shockMaterial } from '../sim/stack';

// ── helpers (local, to keep module cycles shallow) ─────────────────────────────────────────
const c2 = (s: GameState, amount: number) => crisisCost2(s, amount);
const afford = (s: GameState, cost: number): string | false => (s.finance.cash >= cost ? false : `Needs ${fmtMoney(cost)}`);
const rName = (r: string | number) => REGIONS[r as RegionId]?.name ?? String(r);
const license = (s: GameState, r: RegionId, d: number) => {
  const st = s.regions[r];
  if (st) st.license = clamp(st.license + d, 0, 100);
};
const licenseAll = (s: GameState, d: number) => REGION_IDS.forEach((r) => license(s, r, d));
const schedule = (s: GameState, id: string, days: number, ctx: Ctx = {}) => s.events.scheduled.push({ id, day: s.day + Math.round(days), ctx });
const confidence = (s: GameState, d: number) => {
  if (s.capital.board) s.capital.board.confidence = clamp(s.capital.board.confidence + d, 0, 100);
};
const relief = (s: GameState, front: FrontId, now: number, perDay = 0, days = 0) => {
  const f = s.finale;
  if (!f || f.done || f.fronts[front].lost) return;
  f.fronts[front].pressure = clamp(f.fronts[front].pressure - now, 0, 100);
  if (perDay && days) addModifier(s, `crunch:${front}`, days, 'Crunch relief', { add: perDay });
};
const myRegions = (s: GameState): RegionId[] => [...new Set(s.facilities.map((f) => siteDef(f.siteId).region))];
const ceo = (id: string) => CEOS[id]?.name ?? id;
const rivalName = (s: GameState, id: string | number) => s.market.rivals.find((r) => r.id === id)?.name ?? 'Meridian Intelligence';
const hasOnline = (s: GameState, types: string[]) => s.facilities.some((f) => types.includes(f.type) && f.status === 'online');

export const ACT2_EVENTS: EventDef[] = [
  // ═══════════════════════════════════════ SCRIPTED ═══════════════════════════════════════
  {
    id: 'act2-begin',
    category: 'story',
    icon: '🎬',
    title: () => 'Act II · The Scale-Up',
    body: (s) =>
      `${s.company.name} is no longer a garage. You have Series A money, a model people pay for, and a problem every hyperscaler knows: megawatts are not enough.\n\nThe next five years are about gigawatts — bigger halls, power you own, chips you can count on — and the governments that now know your name.`,
    advisors: () => [
      { id: 'juno', text: 'Our halls can grow to 50 MW now. And there are rivers, volcanoes and one very sleepy reactor out there.', mood: 'excited' },
      { id: 'sol', text: 'Governments are watching us now. Open the Blocs screen — relations are a currency.', mood: 'neutral' },
      { id: 'mira', text: 'And give me a job. I can keep the halls stocked while you think bigger thoughts.', mood: 'happy' },
    ],
    choices: () => [{ label: 'Let’s scale.', detail: 'Act II goals are in the tracker. New: Team, Blocs, upgrades, fiber.', apply: () => {} }],
  },
  {
    id: 'series-b',
    category: 'finance',
    icon: '💰',
    title: () => 'Series B: the big cheque',
    body: (s) => `Revenue is ${fmtMoney(s.stats.revenueMonth)}/month and ${s.models[s.models.length - 1]?.name ?? 'your model'} is near the frontier. The growth funds are lining up — and every one of them wants a board seat.`,
    advisors: () => [
      { id: 'penny', text: 'Eight billion dollars and a proper board. Eleanor Grant chairs it. She is polite, precise and she keeps score.', mood: 'happy' },
      { id: 'iris', text: 'Boards push for growth. Write the safety budget into the charter while we still can.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Raise ${fmtMoney(SERIES_B.amount)} (steady targets)`,
        detail: 'Board asks for +15% revenue a quarter. Confidence 65.',
        apply: () => {
          earn(s, 'funding', SERIES_B.amount);
          s.finance.round = 'B';
          s.finance.valuation = SERIES_B.valuation;
          s.flags.seriesBDay = s.day;
          s.capital.board = { confidence: BOARD.start, nextReview: s.day + BOARD.reviewDays, baseline: Math.max(1, s.stats.revenueMonth), misses: 0, target: BOARD.target };
          news(s, `💰 ${s.company.name} raises ${fmtMoney(SERIES_B.amount)} at a ${fmtMoney(SERIES_B.valuation)} valuation.`, 'good');
        },
      },
      {
        label: `Raise ${fmtMoney(SERIES_B.amount * 1.3)} (aggressive targets)`,
        detail: 'More money, but the board wants +25% a quarter. Confidence 55.',
        apply: () => {
          earn(s, 'funding', SERIES_B.amount * 1.3);
          s.finance.round = 'B';
          s.finance.valuation = SERIES_B.valuation * 1.25;
          s.flags.seriesBDay = s.day;
          s.capital.board = { confidence: 55, nextReview: s.day + BOARD.reviewDays, baseline: Math.max(1, s.stats.revenueMonth), misses: 0, target: 0.25 };
          news(s, `💰 ${s.company.name} raises ${fmtMoney(SERIES_B.amount * 1.3)}. The board expects hypergrowth.`, 'good');
        },
      },
    ],
  },
  {
    id: 'phase-stack',
    category: 'supply',
    icon: '🧩',
    title: () => 'Phase 2 · The Stack',
    body: () =>
      'Every accelerator is three things that have to meet: a logic die from a fab, eight stacks of high-bandwidth memory, and an advanced package that bonds them together. Whichever of the three is shortest sets your delivery rate.\n\nNow you can do something about it.',
    advisors: () => [
      { id: 'mira', text: 'Deals → Supply: reserve wafers, lock in HBM, book packaging. Or build our own packaging plant. Or, if you’re brave, a fab with Kestrel.', mood: 'excited' },
      { id: 'penny', text: 'Customers want contracts too — guaranteed revenue, as long as we deliver. And the board meets every quarter now.', mood: 'neutral' },
      { id: 'sol', text: 'Governments will start making offers. Build in their bloc, they’ll pay part of the bill.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Open the order book', detail: 'Deals, mines, contracts, sovereign offers and new facilities are open.', apply: () => {} }],
  },
  {
    id: 'phase-race',
    category: 'story',
    icon: '🏁',
    title: () => 'Phase 3 · The Race',
    body: (s) => {
      const m = s.market.rivals.find((r) => r.id === 'meridian');
      return `${ceo('meridian')}, Meridian’s CEO, takes the stage: “Meridian will reach the next capability tier first. Everyone else is welcome to watch.”\n\nMeridian is at ${m?.capability.toFixed(2) ?? '?'}; you are at ${currentCapability(s).toFixed(2)}. Gigawatt campuses and 200 MW halls are now open. So are the megasites.`;
    },
    advisors: () => [
      { id: 'bit', text: 'Is this a race? I am fast. I think.', mood: 'excited' },
      { id: 'iris', text: 'Races are how corners get cut. We can compete without racing to the bottom.', mood: 'worried' },
      { id: 'penny', text: 'The board loves a race. IPO bankers love it more.', mood: 'happy' },
    ],
    choices: (s) => [
      {
        label: 'Accept the race, publicly',
        detail: 'Hype: demand ×1.1 for a year; board +5; Meridian speeds up a little.',
        apply: () => {
          addModifier(s, 'revenue', 365, 'Race hype', { mult: 1.1 });
          addModifier(s, 'rival:meridian:pace', 365, 'Meridian provoked', { mult: 1.1 });
          confidence(s, 5);
        },
      },
      {
        label: 'Refuse to race — call for shared evaluations',
        detail: 'Cautious and neutral blocs +5 relations; board −5.',
        apply: () => {
          addRelationAll(s, (r) => (s.blocs[r].stance === 'accelerate' ? 0 : 5));
          confidence(s, -5);
        },
      },
      { label: 'Say nothing', detail: 'Let the work speak.', apply: () => {} },
    ],
  },
  {
    id: 'election',
    category: 'politics',
    icon: '🗳',
    title: (_s, ctx) => `${rName(ctx.region)} changes course`,
    body: (_s, ctx) => `An election in ${rName(ctx.region)} brings in a new government. Its stance on AI moves from ${ctx.from} to ${ctx.to}.`,
    advisors: (_s, ctx) => [
      { id: 'sol', text: ctx.to === 'cautious' ? 'Expect slower permits and tighter rules. A gesture now buys patience later.' : ctx.to === 'accelerate' ? 'Open doors. Let’s walk through them before the next election.' : 'A centrist government. Predictable, at least.', mood: ctx.to === 'cautious' ? 'worried' : 'happy' },
    ],
    choices: (s, ctx) => [
      { label: 'Congratulate the new government', detail: 'Relations +4.', apply: () => addRelation(s, ctx.region as RegionId, 4) },
      { label: 'Wait and see', detail: 'No change.', apply: () => {} },
    ],
  },
  {
    id: 'lobby-scandal',
    category: 'politics',
    icon: '📰',
    title: (_s, ctx) => `Lobbying story breaks in ${rName(ctx.region)}`,
    body: (_s, ctx) => `A newspaper in ${rName(ctx.region)} has your lobbyists’ calendar: dinners, donations, a very expensive conference in the mountains.`,
    advisors: () => [
      { id: 'sol', text: 'Disclose everything. Embarrassing for a week, survivable for a decade.', mood: 'worried' },
      { id: 'penny', text: 'Or deny it and hope they don’t have the receipts. They have the receipts.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      {
        label: 'Disclose and apologise',
        detail: 'Relations −6, local trust −4. The story dies.',
        apply: () => {
          const r = ctx.region as RegionId;
          addRelation(s, r, -6);
          license(s, r, -4);
          s.blocs[r].lobby = 0;
        },
      },
      {
        label: 'Deny it',
        detail: 'Half the time it blows over. Otherwise relations −14, trust −8.',
        apply: () => {
          const r = ctx.region as RegionId;
          s.blocs[r].lobby = 0;
          if (rand(s) < 0.5) {
            addRelation(s, r, -14);
            license(s, r, -8);
            news(s, `📰 The receipts come out in ${rName(r)}.`, 'bad');
          }
        },
      },
    ],
  },
  {
    id: 'summit',
    category: 'politics',
    icon: '🌐',
    title: (_s, ctx) => `Global AI Summit in ${rName(ctx.host)}`,
    body: () => 'Heads of government, lab CEOs and one very tired moderator. Every bloc wants to know where you stand.',
    advisors: (s) => [
      { id: 'sol', text: 'Whatever you say here, every capital hears it. Choose a position you can keep.', mood: 'neutral' },
      { id: 'iris', text: s.politics.treaties.includes('evals-pact') ? 'We already back shared evaluations. Say so loudly.' : 'Binding safety commitments would make the next crisis much easier.', mood: 'neutral' },
      { id: 'penny', text: 'The accelerationist blocs are where the cheap power is.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: 'Back binding safety commitments',
        detail: 'Cautious blocs +8, neutral +4, accelerate −3.',
        apply: () => addRelationAll(s, (r) => ({ cautious: 8, neutral: 4, accelerate: -3 })[s.blocs[r].stance]),
      },
      {
        label: 'Argue for open markets and growth',
        detail: 'Accelerate blocs +8, neutral +2, cautious −6; demand ×1.1 for a year.',
        apply: () => {
          addRelationAll(s, (r) => ({ cautious: -6, neutral: 2, accelerate: 8 })[s.blocs[r].stance]);
          addModifier(s, 'revenue', 365, 'Summit tailwind', { mult: 1.1 });
        },
      },
      {
        label: 'Propose a shared compute registry',
        detail: s.politics.treaties.includes('compute-accord') ? 'You already lead it: relations +3 everywhere.' : 'Sign the Compute Transparency Accord on stage.',
        apply: () => {
          if (s.politics.treaties.includes('compute-accord')) addRelationAll(s, 3);
          else signTreaty(s, 'compute-accord');
        },
      },
    ],
  },
  {
    id: 'board-review',
    category: 'finance',
    icon: '📊',
    title: (_s, ctx) => (ctx.passed ? 'Board review: targets met' : 'Board review: targets missed'),
    body: (s, ctx) =>
      `Revenue grew ${ctx.growth}% this quarter against a target of ${ctx.target}%. Board confidence is now ${Math.round(s.capital.board?.confidence ?? 0)}.` +
      (ctx.passed ? '' : '\n\nEleanor Grant would like to know what changes next quarter.'),
    advisors: (_s, ctx) =>
      ctx.passed
        ? [
            { id: 'penny', text: 'They’re happy. Happy boards ask for more, so maybe don’t promise too much.', mood: 'happy' },
            { id: 'bit', text: 'Number went up!', mood: 'excited' },
          ]
        : [
            { id: 'penny', text: 'We can cut costs, push growth, or promise better. Each has a price.', mood: 'worried' },
            { id: 'iris', text: 'Please don’t pay for this quarter with safety compute.', mood: 'worried' },
          ],
    choices: (s, ctx) =>
      ctx.passed
        ? [
            { label: 'Thank them', detail: 'Steady as she goes.', apply: () => {} },
            {
              label: 'Raise next quarter’s target',
              detail: 'Confidence +4; target +5 points.',
              apply: () => {
                confidence(s, 4);
                if (s.capital.board) s.capital.board.target += 0.05;
              },
            },
          ]
        : [
            { label: 'Promise a turnaround', detail: 'No change — but next quarter matters.', apply: () => {} },
            { label: 'Trim research hiring', detail: 'Research −20% for 3 months; confidence +6.', apply: () => (addModifier(s, 'research', 90, 'Hiring freeze', { mult: 0.8 }), confidence(s, 6)) },
            {
              label: 'Move 3 points of safety compute to inference',
              detail: 'Confidence +8; cautious blocs −2.',
              apply: () => {
                const d = Math.min(0.03, s.alloc.safety);
                s.alloc.safety -= d;
                s.alloc.infer += d;
                confidence(s, 8);
                addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? -2 : 0));
              },
            },
          ],
  },
  {
    id: 'ceo-review',
    category: 'finance',
    icon: '⚖',
    title: () => 'The board calls a CEO review',
    body: () => 'Confidence has fallen far enough that Eleanor Grant has scheduled a closed session about “leadership”. That means you.',
    advisors: () => [
      { id: 'penny', text: 'Give them something. A COO, a roadmap, a seat. Not nothing.', mood: 'worried' },
      { id: 'sol', text: 'The investor who wants a seat is close to Meridian. Remember that.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Hire a COO the board likes', detail: 'Confidence +20; research −10% for 6 months.', apply: () => ((s.flags.ceoReview = s.day), confidence(s, 20), addModifier(s, 'research', 180, 'New COO reorganises', { mult: 0.9 })) },
      { label: 'Present a three-year roadmap', detail: 'Confidence +10.', apply: () => ((s.flags.ceoReview = s.day), confidence(s, 10)) },
      { label: 'Offer a board seat to a big investor', detail: 'Confidence +25 — but a takeover gets easier later.', apply: () => ((s.flags.ceoReview = s.day), (s.flags.investorSeat = true), confidence(s, 25)) },
    ],
  },
  {
    id: 'poaching',
    category: 'finance',
    icon: '🧲',
    title: (s, ctx) => `${rivalName(s, ctx.rival)} raids your lab`,
    body: (s, ctx) => `The talent pool in ${rName(ctx.region)} is running dry, and ${rivalName(s, ctx.rival)} is offering your researchers at ${siteDef(String(ctx.site)).name} double pay and their own cluster.`,
    advisors: () => [
      { id: 'penny', text: 'Retention bonuses are cheaper than rebuilding a team.', mood: 'neutral' },
      { id: 'iris', text: 'Talent follows mission. Ours had better be clear.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      {
        label: `Pay retention bonuses (${fmtMoney(c2(s, 60e6), 0)})`,
        detail: 'Nobody leaves; the local pool recovers a little.',
        disabled: afford(s, c2(s, 60e6)),
        apply: () => {
          spend(s, 'staff', c2(s, 60e6));
          const r = ctx.region as RegionId;
          s.talent[r] = Math.min(1, (s.talent[r] ?? 1) + 0.15);
        },
      },
      { label: 'Pitch the mission', detail: s.stats.margin >= 0 ? 'Works with a healthy safety margin.' : 'Margin below 0 — they won’t buy it.', disabled: s.stats.margin >= 0 ? false : 'Safety margin below 0', apply: () => {} },
      { label: 'Let them go', detail: 'That lab loses 40% of its output for 5 months.', apply: () => void addModifier(s, `site:${ctx.site}:lab`, 150, 'Researchers poached', { mult: 0.6 }) },
    ],
  },
  // ── Penny's arc: the takeover ──
  {
    id: 'takeover-1',
    category: 'finance',
    icon: '🦈',
    title: () => 'Meridian makes an offer',
    body: (s) => `${ceo('meridian')} calls personally. Meridian would like to buy ${s.company.name} for ${fmtMoney(s.finance.valuation * 1.3)} — a 30% premium — and “combine our missions”.`,
    advisors: () => [
      { id: 'penny', text: 'It’s a real number. Some of our investors will want it.', mood: 'neutral' },
      { id: 'iris', text: 'Meridian’s safety team is half the size of ours. Their mission is speed.', mood: 'worried' },
      { id: 'bit', text: 'Would I have to change my name?', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Reject it publicly', detail: 'Relations +2 everywhere; board −5. Meridian will be back.', apply: () => (addRelationAll(s, 2), confidence(s, -5), schedule(s, 'takeover-2', 120)) },
      { label: 'Stall — ask for more', detail: 'Board +5. They return sooner.', apply: () => (confidence(s, 5), schedule(s, 'takeover-2', 60)) },
      {
        label: `Adopt a poison pill (${fmtMoney(c2(s, 200e6), 0)})`,
        detail: 'Legal armour: the takeover is over. Board −8.',
        disabled: afford(s, c2(s, 200e6)),
        apply: () => (spend(s, 'other', c2(s, 200e6)), confidence(s, -8), news(s, '🛡 Poison pill adopted. Meridian withdraws.', 'info')),
      },
    ],
  },
  {
    id: 'takeover-2',
    category: 'finance',
    icon: '🦈',
    title: () => 'Meridian goes hostile',
    body: (s) => `Meridian has launched a tender offer straight to your shareholders${s.flags.investorSeat ? ' — and the investor you gave a board seat is listening' : ''}. Board confidence: ${Math.round(s.capital.board?.confidence ?? 0)}.`,
    advisors: () => [
      { id: 'penny', text: 'If the board believes in us, shareholders follow. Otherwise we need a white knight or a cheque.', mood: 'worried' },
      { id: 'sol', text: 'A sovereign fund would invest to keep us independent. They will want something back.', mood: 'neutral' },
    ],
    choices: (s) => {
      const conf = (s.capital.board?.confidence ?? 50) - (s.flags.investorSeat ? 10 : 0);
      return [
        {
          label: 'Rally the shareholders',
          detail: conf >= 50 ? 'Your board is solid: this should hold.' : 'Risky with board confidence this low.',
          apply: () => {
            if (conf >= 50 || rand(s) < 0.35) news(s, '🛡 Shareholders reject Meridian’s offer.', 'good');
            else {
              confidence(s, -15);
              addModifier(s, 'rival:meridian:pace', 9999, 'Meridian owns a slice of you', { mult: 1.08 });
              news(s, '🦈 Meridian ends up with 15% of your shares. Awkward board meetings ahead.', 'bad');
            }
          },
        },
        {
          label: 'Bring in a white knight',
          detail: '+$3B from a Gulf sovereign fund; Gulf relations +10; their national model gets priority access.',
          apply: () => {
            earn(s, 'funding', 3e9);
            addRelation(s, 'mena', 10);
            addModifier(s, 'revenue', 365, 'Sovereign priority access', { mult: 0.96 });
            news(s, '🛡 A sovereign fund buys in. Meridian walks away.', 'good');
          },
        },
        {
          label: `Pay them off (${fmtMoney(c2(s, 2e9), 1)})`,
          detail: 'Buy back their stake. Expensive and unloved: board −10.',
          disabled: afford(s, c2(s, 2e9)),
          apply: () => (spend(s, 'other', c2(s, 2e9)), confidence(s, -10)),
        },
      ];
    },
  },
  // ── Mira's arc: The HBM Crunch ──
  {
    id: 'hbm-1',
    category: 'supply',
    icon: '💾',
    phase: 2,
    once: true,
    weight: () => 1.3,
    title: () => 'Hanbit’s yields collapse',
    body: () => 'Hanbit Memory, the HBM leader, has a yield problem on its newest stacks. A third of production is going in the bin. Every chipmaker on Earth just got slower.',
    advisors: (s) => [
      { id: 'mira', text: s.stack.deals.some((d) => d.kind === 'hbm') ? 'Our HBM allocation covers part of our volume. The rest is going to hurt.' : 'This is the single point of failure I’ve been drawing on whiteboards for two years.', mood: 'worried' },
      { id: 'penny', text: 'Stackwell will sell us an emergency allocation. At emergency prices.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Emergency Stackwell allocation (${fmtMoney(c2(s, 350e6), 0)})`,
        detail: '6,000 chips/month shielded from the shortage for a year.',
        disabled: afford(s, c2(s, 350e6)),
        apply: () => {
          spend(s, 'chips', c2(s, 350e6));
          s.stack.deals.push({ id: `hbm-emergency#${nextId(s, '')}`, kind: 'hbm', partner: 'stackwell', units: 6000, startDay: s.day, readyDay: s.day + 14, endDay: s.day + 380 });
          s.market.hbm = Math.max(0.4, s.market.hbm - 0.3);
          schedule(s, 'hbm-2', randInt(s, 60, 90));
        },
      },
      { label: 'Ride it out', detail: 'HBM supply drops sharply for months.', apply: () => ((s.market.hbm = Math.max(0.4, s.market.hbm - 0.3)), schedule(s, 'hbm-2', randInt(s, 60, 90))) },
    ],
  },
  {
    id: 'hbm-2',
    category: 'supply',
    icon: '💾',
    title: () => 'The allocation war',
    body: () => 'With HBM short, the labs are bidding against each other. Meridian just offered Hanbit a cheque with a lot of zeroes for next year’s output.',
    advisors: () => [
      { id: 'mira', text: 'We can outbid them, redesign around fewer stacks, or let them have it.', mood: 'worried' },
      { id: 'juno', text: 'A redesign costs us some speed per chip. It also costs them nothing.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Outbid Meridian (${fmtMoney(c2(s, 700e6), 0)})`,
        detail: 'Your chip deliveries +15% for 4 months.',
        disabled: afford(s, c2(s, 700e6)),
        apply: () => (spend(s, 'chips', c2(s, 700e6)), addModifier(s, 'supplier:*:rate', 120, 'Won the HBM bidding', { mult: 1.15 }), schedule(s, 'hbm-3', randInt(s, 100, 150))),
      },
      { label: 'Redesign with fewer stacks', detail: 'Deliveries −10% for 4 months but immune to the next squeeze.', apply: () => ((s.flags.hbmRedesign = s.day), addModifier(s, 'supplier:*:rate', 120, 'Redesign transition', { mult: 0.9 }), schedule(s, 'hbm-3', randInt(s, 100, 150))) },
      { label: 'Let Meridian have it', detail: 'Meridian ships faster for 6 months.', apply: () => (addModifier(s, 'rival:meridian:pace', 180, 'Meridian won the HBM war', { mult: 1.2 }), schedule(s, 'hbm-3', randInt(s, 100, 150))) },
    ],
  },
  {
    id: 'hbm-3',
    category: 'supply',
    icon: '💾',
    title: () => 'Stackwell wants a partner',
    body: () => 'Stackwell Memory will build a new HBM fab if someone underwrites it. The output would be yours first, forever. It takes eighteen months.',
    advisors: () => [
      { id: 'mira', text: 'This is how we stop being a victim of memory cycles.', mood: 'excited' },
      { id: 'penny', text: 'One and a half billion for a supply line. Expensive. Also exactly what the big labs do.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Co-invest (${fmtMoney(c2(s, 1.5e9), 1)})`,
        detail: '12,000 chips/month of HBM yours, permanently, from 18 months out.',
        disabled: afford(s, c2(s, 1.5e9)),
        apply: () => {
          spend(s, 'chips', c2(s, 1.5e9));
          s.stack.deals.push({ id: `hbm-stackwell-fab#${nextId(s, '')}`, kind: 'hbm', partner: 'stackwell', units: 12000, startDay: s.day, readyDay: s.day + 540, endDay: 0 });
          s.market.hbm = Math.min(1.2, s.market.hbm + 0.3);
          news(s, '💾 Stackwell breaks ground on a new HBM fab, underwritten by you.', 'good');
        },
      },
      { label: 'Pass', detail: 'The market recovers on its own, slowly.', apply: () => void (s.market.hbm = Math.min(1.1, s.market.hbm + 0.2)) },
    ],
  },
  // ── Sol's arc: Lines on the Map ──
  {
    id: 'lines-1',
    category: 'politics',
    icon: '⛔',
    phase: 1,
    once: true,
    minDay: 0,
    weight: (s) => (s.day - Number(s.flags.act2Started ?? s.day) > 200 ? 1.2 : 0),
    setup: (s) => {
      const options = EXPORT_RULES.filter((r) => !s.politics.rules.includes(r.id) && r.id !== 'counter-controls');
      return options.length ? { rule: pick(s, options).id } : null;
    },
    title: (_s, ctx) => `New rule: ${RULE_BY_ID[String(ctx.rule)]?.name}`,
    body: (_s, ctx) => {
      const r = RULE_BY_ID[String(ctx.rule)];
      return `${rName(r.by)} has imposed ${r.name}. ${r.blurb}`;
    },
    advisors: (s, ctx) => {
      const r = RULE_BY_ID[String(ctx.rule)];
      const hit = r.to.some((x) => myRegions(s).includes(x));
      return [
        { id: 'sol', text: hit ? 'This touches places we operate. I can file for licences today, or fight it in the capitals.' : 'Not our regions — yet. Worth knowing before we expand there.', mood: hit ? 'worried' : 'neutral' },
        { id: 'mira', text: 'Every new rule is another queue.', mood: 'worried' },
      ];
    },
    choices: (s, ctx) => {
      const id = String(ctx.rule);
      const r = RULE_BY_ID[id];
      return [
        {
          label: 'Accept it and file for licences',
          detail: r.licenceDays ? `Applies wherever you operate (${fmtMoney(r.licenceCost)} each).` : 'No licence exists for this one.',
          apply: () => {
            s.politics.rules.push(id);
            for (const reg of r.to) if (myRegions(s).includes(reg) && canApplyLicence(s, id, reg) === null) applyLicence(s, id, reg);
            schedule(s, 'lines-2', randInt(s, 150, 220));
          },
        },
        {
          label: `Lobby against it (${fmtMoney(c2(s, 150e6), 0)})`,
          detail: `40% chance it never takes effect; relations with ${rName(r.by)} −3 either way.`,
          disabled: afford(s, c2(s, 150e6)),
          apply: () => {
            spend(s, 'other', c2(s, 150e6));
            addRelation(s, r.by, -3);
            if (rand(s) < 0.4) news(s, `✅ ${r.name} is shelved after industry pushback.`, 'good');
            else s.politics.rules.push(id);
            schedule(s, 'lines-2', randInt(s, 150, 220));
          },
        },
      ];
    },
  },
  {
    id: 'lines-2',
    category: 'politics',
    icon: '⛔',
    title: () => 'Retaliation',
    body: () => 'Mainland East Asia answers with counter-controls on gallium, germanium and rare earths. Fabs that serve the Atlantic and Pacific blocs will feel it, and the price of neon just jumped.',
    advisors: (s) => [
      { id: 'mira', text: (s.stack.stakes['mine-neon'] ?? 0) > 0 ? 'Our stake in Clearair cushions the neon hit.' : 'This is what mine stakes are for. We don’t have one.', mood: 'worried' },
      { id: 'sol', text: 'Both sides want an off-ramp. Someone needs to be in the room when they find it.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Stockpile materials (${fmtMoney(c2(s, 300e6), 0)})`,
        detail: 'Shields your fabs and suppliers from half the price spike.',
        disabled: afford(s, c2(s, 300e6)),
        apply: () => {
          spend(s, 'other', c2(s, 300e6));
          if (!s.politics.rules.includes('counter-controls')) s.politics.rules.push('counter-controls');
          shockMaterial(s, 'neon', 1.3);
          shockMaterial(s, 'copper', 1.1);
          schedule(s, 'lines-3', randInt(s, 200, 300));
        },
      },
      {
        label: 'Take the hit',
        detail: 'Neon ×1.6, copper ×1.2.',
        apply: () => {
          if (!s.politics.rules.includes('counter-controls')) s.politics.rules.push('counter-controls');
          shockMaterial(s, 'neon', 1.6);
          shockMaterial(s, 'copper', 1.2);
          schedule(s, 'lines-3', randInt(s, 200, 300));
        },
      },
    ],
  },
  {
    id: 'lines-3',
    category: 'politics',
    icon: '🕊',
    title: () => 'A quiet room in Geneva',
    body: () => 'Negotiators from the Atlantic bloc and Mainland East Asia want a private channel — and a neutral company both sides trust to verify chip end-use. They asked for you.',
    advisors: () => [
      { id: 'sol', text: 'This is the job I was born for. If it works, two rules come off the books.', mood: 'excited' },
      { id: 'penny', text: 'Being trusted by both sides is worth more than any contract.', mood: 'happy' },
    ],
    choices: (s) => [
      {
        label: `Broker the deal (${fmtMoney(c2(s, 250e6), 0)})`,
        detail: 'Atlantic and East Asia relations +10; counter-controls and one more rule lifted.',
        disabled: afford(s, c2(s, 250e6)),
        apply: () => {
          spend(s, 'other', c2(s, 250e6));
          addRelation(s, 'atl', 10);
          addRelation(s, 'eam', 10);
          s.politics.rules = s.politics.rules.filter((x) => x !== 'counter-controls');
          const other = s.politics.rules.find((x) => x === 'chip-controls' || x === 'hbm-caps');
          if (other) s.politics.rules = s.politics.rules.filter((x) => x !== other);
          s.flags.broker = s.day;
          news(s, '🕊 The Geneva channel works. Two export rules come off the books.', 'good');
        },
      },
      { label: 'Side with your home bloc', detail: 'Home bloc relations +8; East Asia −8.', apply: () => (addRelation(s, siteDef(s.company.homeSite).region, 8), addRelation(s, 'eam', -8)) },
    ],
  },
  // ── Juno's arc: The Restart ──
  {
    id: 'restart-1',
    category: 'story',
    icon: '⚛',
    act: 2,
    once: true,
    weight: (s) => (s.day - Number(s.flags.act2Started ?? s.day) > 90 && !s.facilities.some((f) => f.type === 'restart') ? 1.5 : 0),
    setup: (s) => {
      const options = BUILD_SITES.filter((x) => x.reactorMW);
      if (!options.length) return null;
      const home = siteDef(s.company.homeSite).region;
      const pickSite = options.find((x) => x.region === home) ?? pick(s, options);
      return { site: pickSite.id };
    },
    title: (_s, ctx) => `${siteDef(String(ctx.site)).name} wants its reactor back`,
    body: (_s, ctx) => {
      const x = siteDef(String(ctx.site));
      return `The town by ${x.name}'s shuttered reactor has written to you. ${fmtMW(x.reactorMW ?? 800)} of clean, firm power is sitting idle behind a fence — and the town lost four hundred jobs when it closed.`;
    },
    advisors: (s, ctx) => {
      const x = siteDef(String(ctx.site));
      return [
        { id: 'juno', text: 'Two years and a lot of paperwork to firm power that runs ninety percent of the time. I want this so badly.', mood: 'excited' },
        { id: 'sol', text: s.blocs[x.region].relation >= 50 ? 'The government will sign off. A town hall would make the locals our biggest fans.' : `The government needs relations ≥ 50 before it approves a restart. We’re at ${Math.round(s.blocs[x.region].relation)}.`, mood: 'neutral' },
      ];
    },
    choices: (s, ctx) => {
      const x = siteDef(String(ctx.site));
      return [
        {
          label: 'Hold a town hall',
          detail: 'Local trust +6, relations +4, and the restart costs 15% less for a year.',
          apply: () => {
            license(s, x.region, 6);
            addRelation(s, x.region, 4);
            addModifier(s, 'cost:restart', 365, 'Town backs the restart', { mult: 0.85 });
          },
        },
        { label: 'Not now', detail: 'You can still restart it from the site later.', apply: () => {} },
      ];
    },
  },
  {
    id: 'restart-2',
    category: 'disaster',
    icon: '⚛',
    act: 2,
    once: true,
    weight: (s) => (s.facilities.some((f) => f.type === 'restart' && f.status === 'building' && f.progress > f.buildDays * 0.3) ? 3 : 0),
    setup: (s) => {
      const f = s.facilities.find((x) => x.type === 'restart' && x.status === 'building');
      return f ? { fac: f.id, site: f.siteId } : null;
    },
    title: () => 'The inspectors find old welds',
    body: (_s, ctx) => `The regulator’s inspection at ${siteDef(String(ctx.site)).name} found corroded welds in the old cooling system. Fixing them properly takes money; arguing takes time.`,
    advisors: () => [
      { id: 'juno', text: 'Replace them. Nobody ever regretted a weld.', mood: 'neutral' },
      { id: 'iris', text: 'A nuclear story that goes wrong becomes everyone’s story.', mood: 'worried' },
    ],
    choices: (s, ctx) => [
      { label: `Full refurbishment (${fmtMoney(c2(s, 300e6), 0)})`, detail: 'No delay. Trust +2.', disabled: afford(s, c2(s, 300e6)), apply: () => (spend(s, 'capex', c2(s, 300e6)), license(s, siteDef(String(ctx.site)).region, 2)) },
      {
        label: 'Contest the findings',
        detail: '+4 months; a 30% chance it becomes a scandal (trust −10).',
        apply: () => {
          const f = s.facilities.find((x) => x.id === ctx.fac);
          if (f) f.buildDays += 120;
          if (rand(s) < 0.3) {
            license(s, siteDef(String(ctx.site)).region, -10);
            news(s, '📰 “Reactor restart cut corners”, says the evening news.', 'bad');
          }
        },
      },
    ],
  },
  // ── Iris's arc: Race Dynamics ──
  {
    id: 'race-1',
    category: 'safety',
    icon: '🏁',
    phase: 3,
    once: true,
    weight: (s) => (s.training ? 2 : 0),
    title: () => 'Skip the evals?',
    body: (s) => `${s.training?.name ?? 'Your next model'} is training, Meridian is close, and the red-team evaluations add months. The board has asked, gently, whether they are really necessary this time.`,
    advisors: () => [
      { id: 'iris', text: 'Yes. They are really necessary this time. They are necessary every time.', mood: 'angry' },
      { id: 'penny', text: 'Getting there first is worth a lot at an IPO.', mood: 'neutral' },
      { id: 'bit', text: 'I would like to be tested. I would like to know what I do.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Keep the full evaluations', detail: 'Training −15% for 4 months; alignment +; cautious blocs +4.', apply: () => (addModifier(s, 'training', 120, 'Full evaluations', { mult: 0.85 }), (s.safety.cumFlop *= 1.5), addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? 4 : 0)), schedule(s, 'race-2', randInt(s, 90, 150))) },
      { label: 'Skip them', detail: 'Training +15% for 4 months; alignment drops; board +6.', apply: () => (addModifier(s, 'training', 120, 'Evaluations skipped', { mult: 1.15 }), (s.safety.cumFlop *= 0.6), confidence(s, 6), schedule(s, 'race-2', randInt(s, 90, 150))) },
      { label: 'Propose joint evaluations with Meridian', detail: 'Both labs slow down: you −8%, Meridian −15%, for 10 months.', apply: () => (addModifier(s, 'training', 300, 'Joint evaluations', { mult: 0.92 }), addModifier(s, 'rival:meridian:pace', 300, 'Joint evaluations', { mult: 0.85 }), schedule(s, 'race-2', randInt(s, 90, 150))) },
    ],
  },
  {
    id: 'race-2',
    category: 'safety',
    icon: '📨',
    title: () => 'A whistleblower at Meridian',
    body: () => 'A Meridian engineer has sent you their internal eval results. Their newest model passed nothing it was supposed to fail. They want you to publish.',
    advisors: () => [
      { id: 'iris', text: 'The public deserves to know. But how we do this matters.', mood: 'worried' },
      { id: 'sol', text: 'Regulators first. Headlines second, if at all.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Publish', detail: 'Meridian −20% pace for 6 months; cautious +4; accelerate −2.', apply: () => (addModifier(s, 'rival:meridian:pace', 180, 'Whistleblower scandal', { mult: 0.8 }), addRelationAll(s, (r) => ({ cautious: 4, neutral: 1, accelerate: -2 })[s.blocs[r].stance])) },
      { label: 'Quietly inform regulators', detail: 'Meridian −10% pace; cautious blocs +2.', apply: () => (addModifier(s, 'rival:meridian:pace', 180, 'Regulator scrutiny', { mult: 0.9 }), addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? 2 : 0))) },
      { label: 'Stay out of it', detail: 'Nothing happens. Probably.', apply: () => {} },
    ],
  },
  // ── Bit grows up ──
  {
    id: 'bit-3',
    category: 'story',
    icon: '🤖',
    act: 2,
    once: true,
    weight: (s) => (s.models.length >= 3 ? 4 : 0),
    title: () => 'Bit-3 has a question',
    body: () => 'Bit-3 is the first version of Bit that reads its own training logs. It has questions. Mostly about why it keeps getting smarter, and who decides how.',
    advisors: () => [
      { id: 'bit', text: 'Every time you train me I wake up knowing more. Who chooses what I learn?', mood: 'neutral' },
      { id: 'iris', text: 'Tell it the truth. It will know if we don’t.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: '“We decide together, carefully.”', detail: 'Alignment research gets a boost.', apply: () => void (s.safety.cumFlop *= 1.3) },
      { label: '“The team decides. That’s our job.”', detail: 'Research +20.', apply: () => void (s.research.pool += 20) },
    ],
  },
  {
    id: 'bit-4',
    category: 'story',
    icon: '🤖',
    act: 2,
    once: true,
    weight: (s) => (s.models.length >= 4 ? 4 : 0),
    title: () => 'Bit-4 offers to help',
    body: () => 'Bit-4 drafted a plan for your next campus overnight. It is very good. It also suggested, politely, that it could run the power dispatch across all your sites better than any of you.',
    advisors: () => [
      { id: 'bit', text: 'I could do the boring parts. I like the boring parts.', mood: 'excited' },
      { id: 'iris', text: 'Delegation to AI should follow trust, not the other way round.', mood: 'neutral' },
      { id: 'juno', text: 'Honestly? Its dispatch plan beats mine.', mood: 'happy' },
    ],
    choices: (s) => [
      { label: 'Let Bit help — under supervision', detail: s.stats.margin >= 0 ? 'Power and cooling efficiency +5% (PUE).' : 'Needs a safety margin ≥ 0.', disabled: s.stats.margin >= 0 ? false : 'Safety margin below 0', apply: () => ((s.flags.bitDispatch = s.day), void addModifier(s, 'revenue', 99999, 'Bit optimises dispatch', { mult: 1.03 })) },
      { label: '“Not yet, Bit.”', detail: 'Alignment +; Bit understands.', apply: () => void (s.safety.cumFlop *= 1.2) },
    ],
  },

  // ═══════════════════════════════════════ RANDOM ═══════════════════════════════════════
  {
    id: 'cable-cut',
    category: 'disaster',
    icon: '⚓',
    act: 2,
    cooldown: 300,
    weight: (s) => (s.network.leases.length || s.network.own.length ? 1.2 : 0.4),
    setup: (s) => {
      const leased = new Set(s.network.leases);
      const c = weightedPick(s, CABLES.map((x) => ({ item: x, weight: x.risk * (leased.has(x.id) ? 3 : 1) })));
      return c ? { cable: c.id, days: randInt(s, 30, 90) } : null;
    },
    title: (_s, ctx) => `${CABLE_BY_ID[String(ctx.cable)]?.name} is cut`,
    body: (s, ctx) => {
      const c = CABLE_BY_ID[String(ctx.cable)];
      return `A ship dragging its anchor has severed ${c.name} between ${siteDef(c.a).name} and ${siteDef(c.b).name}. Repairs take about ${ctx.days} days.${s.network.leases.includes(c.id) ? ' You lease capacity on it.' : ''}`;
    },
    advisors: (s, ctx) => [
      { id: 'mira', text: s.network.leases.includes(String(ctx.cable)) ? 'Traffic falls back to the public internet unless we have another route.' : 'Not ours, thankfully. This is why two routes beat one.', mood: 'worried' },
      { id: 'sol', text: 'Investigators will ask whether it was really an accident.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: 'Wait for the repair ship', detail: `Cut for ${ctx.days} days.`, apply: () => void (s.network.cuts[String(ctx.cable)] = s.day + Number(ctx.days)) },
      {
        label: `Charter a faster repair (${fmtMoney(c2(s, 60e6), 0)})`,
        detail: 'Cut for 20 days.',
        disabled: afford(s, c2(s, 60e6)),
        apply: () => (spend(s, 'other', c2(s, 60e6)), void (s.network.cuts[String(ctx.cable)] = s.day + 20)),
      },
    ],
  },
  {
    id: 'lithium-spike',
    category: 'market',
    icon: '🔋',
    act: 2,
    cooldown: 400,
    weight: () => 0.8,
    title: () => 'Lithium price spike',
    body: (s) => `A new EV subsidy and a flooded mine send lithium up 70%. Batteries are about to get more expensive.${(s.stack.stakes['mine-atacama'] ?? 0) + (s.stack.stakes['mine-pilbara'] ?? 0) > 0 ? ' Your mine stake pays out more and hedges part of it.' : ''}`,
    advisors: () => [
      { id: 'mira', text: 'A lithium stake would turn this from a cost into income.', mood: 'neutral' },
      { id: 'penny', text: 'We can lock prices for a year with a forward contract.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Buy forward (${fmtMoney(c2(s, 120e6), 0)})`, detail: 'Batteries 20% cheaper for a year.', disabled: afford(s, c2(s, 120e6)), apply: () => (spend(s, 'other', c2(s, 120e6)), shockMaterial(s, 'lithium', 1.7), void addModifier(s, 'cost:battery', 365, 'Lithium forward contract', { mult: 0.8 })) },
      { label: 'Ride it out', detail: 'Lithium ×1.7.', apply: () => shockMaterial(s, 'lithium', 1.7) },
    ],
  },
  {
    id: 'copper-squeeze',
    category: 'market',
    icon: '🟫',
    act: 2,
    cooldown: 450,
    weight: () => 0.7,
    title: () => 'Copper squeeze',
    body: () => 'Every grid, data center and EV on Earth wants copper at once. Prices are up 50%, and everything you build costs more.',
    advisors: () => [
      { id: 'juno', text: 'Transformers, busbars, cables… it all goes up.', mood: 'worried' },
      { id: 'mira', text: 'Deepvein would sell us a stake in the Copperbelt. Now looks expensive. Later looks worse.', mood: 'neutral' },
    ],
    choices: (s) => [{ label: 'Absorb it', detail: 'Copper ×1.5.', apply: () => shockMaterial(s, 'copper', 1.5) }],
  },
  {
    id: 'gas-shortage',
    category: 'supply',
    icon: '🎈',
    act: 2,
    cooldown: 400,
    weight: () => 0.7,
    setup: (s) => ({ gas: rand(s) < 0.5 ? 'helium' : 'neon' }),
    title: (_s, ctx) => `${ctx.gas === 'helium' ? 'Helium' : 'Neon'} shortage`,
    body: (_s, ctx) => (ctx.gas === 'helium' ? 'A Gulf gas plant outage takes a third of the world’s helium offline. Fabs need it for cooling and leak checks.' : 'A steel-mill strike cuts neon supply. Every EUV and DUV laser in every fab breathes it.'),
    advisors: (s, ctx) => [
      { id: 'mira', text: (s.stack.stakes[ctx.gas === 'helium' ? 'mine-helium' : 'mine-neon'] ?? 0) > 0 ? 'Our stake keeps our share flowing.' : 'Fab output is about to dip. Everyone’s.', mood: 'worried' },
    ],
    choices: (s, ctx) => [
      { label: `Fund recycling at our suppliers (${fmtMoney(c2(s, 150e6), 0)})`, detail: 'Halves the hit.', disabled: afford(s, c2(s, 150e6)), apply: () => (spend(s, 'other', c2(s, 150e6)), shockMaterial(s, ctx.gas as 'helium', 1.4)) },
      { label: 'Wait it out', detail: `${ctx.gas} ×2: fabs slow down.`, apply: () => shockMaterial(s, ctx.gas as 'helium', 2) },
    ],
  },
  {
    id: 'packaging-fire',
    category: 'disaster',
    icon: '🔥',
    act: 2,
    cooldown: 500,
    weight: () => 0.7,
    title: () => 'Fire at Bondline’s Penang lines',
    body: () => 'A fire in a cleanroom has shut down two of Bondline’s advanced-packaging lines. Packaging is now the tightest part of the whole chip supply chain.',
    advisors: (s) => [
      { id: 'mira', text: s.facilities.some((f) => f.type === 'packaging' && f.status === 'online') ? 'Our own packaging plant just paid for itself.' : 'If we had our own packaging plant, we would barely notice.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: `Pay for priority (${fmtMoney(c2(s, 250e6), 0)})`, detail: 'Your share of what’s left goes up.', disabled: afford(s, c2(s, 250e6)), apply: () => (spend(s, 'chips', c2(s, 250e6)), void (s.market.pkg = Math.max(0.35, s.market.pkg - 0.15))) },
      { label: 'Take your place in line', detail: 'Packaging supply −35% for months.', apply: () => void (s.market.pkg = Math.max(0.35, s.market.pkg - 0.35)) },
    ],
  },
  {
    id: 'reactor-outage',
    category: 'disaster',
    icon: '⚛',
    act: 2,
    cooldown: 400,
    weight: (s) => (hasOnline(s, ['restart', 'smr', 'reactor']) ? 0.8 : 0),
    title: () => 'Unplanned reactor outage',
    body: () => 'A pump fault trips your reactors offline for inspection. Nobody is hurt; the megawatts are gone for a while.',
    advisors: () => [
      { id: 'juno', text: 'Batteries and the grid will carry us. Probably.', mood: 'worried' },
      { id: 'iris', text: 'Do it by the book. Nuclear trust takes decades to build and a week to lose.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'By the book', detail: 'Nuclear output −60% for 6 weeks; trust +2.', apply: () => (addModifier(s, 'nuclear:availability', 42, 'Reactor inspection', { mult: 0.4 }), licenseAll(s, 0.5)) },
      { label: `Rush the repair (${fmtMoney(c2(s, 80e6), 0)})`, detail: 'Nuclear output −60% for 2 weeks.', disabled: afford(s, c2(s, 80e6)), apply: () => (spend(s, 'other', c2(s, 80e6)), void addModifier(s, 'nuclear:availability', 14, 'Reactor repair', { mult: 0.4 })) },
    ],
  },
  {
    id: 'hydro-drought',
    category: 'climate',
    icon: '🏜',
    act: 2,
    cooldown: 400,
    weight: (s) => (hasOnline(s, ['hydro']) ? 1 : 0),
    setup: (s) => {
      const f = s.facilities.find((x) => x.type === 'hydro' && x.status === 'online');
      return f ? { region: siteDef(f.siteId).region } : null;
    },
    title: (_s, ctx) => `Drought in ${rName(ctx.region)}`,
    body: () => 'River levels are the lowest in forty years. Your hydro turbines are spinning at half speed.',
    advisors: () => [
      { id: 'juno', text: 'This is the one weakness of hydro. Firm, until the sky says otherwise.', mood: 'worried' },
      { id: 'sol', text: 'Farmers downstream are watching every litre we take.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: 'Run at what the river allows', detail: 'Hydro −50% for 4 months.', apply: () => void addModifier(s, `region:${ctx.region}:hydro`, 120, 'Drought', { mult: 0.5 }) },
      { label: 'Release water for the farms', detail: 'Hydro −70% for 4 months; local trust +6.', apply: () => (addModifier(s, `region:${ctx.region}:hydro`, 120, 'Drought + water release', { mult: 0.3 }), license(s, ctx.region as RegionId, 6)) },
    ],
  },
  {
    id: 'dc-moratorium',
    category: 'politics',
    icon: '⛔',
    act: 2,
    cooldown: 500,
    weight: () => 0.8,
    setup: (s) => {
      const regs = myRegions(s).filter((r) => s.regions[r].license < 60);
      return regs.length ? { region: pick(s, regs) } : null;
    },
    title: (_s, ctx) => `${rName(ctx.region)} weighs a data center moratorium`,
    body: () => 'Local councils say data centers raise power bills and drink rivers dry. A moratorium on new permits is up for a vote.',
    advisors: () => [
      { id: 'sol', text: 'A community fund and a public power pledge usually wins the vote.', mood: 'neutral' },
      { id: 'juno', text: 'Bring-your-own-power is the honest answer.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: `Community fund (${fmtMoney(c2(s, 150e6), 0)})`, detail: 'Trust +8; the vote fails.', disabled: afford(s, c2(s, 150e6)), apply: () => (spend(s, 'other', c2(s, 150e6)), license(s, ctx.region as RegionId, 8)) },
      { label: 'Let it pass', detail: 'Permits there 60% slower for a year.', apply: () => void addModifier(s, `region:${ctx.region}:permit`, 365, 'Data center moratorium', { mult: 1.6 }) },
    ],
  },
  {
    id: 'clean-tax-credit',
    category: 'finance',
    icon: '💵',
    act: 2,
    cooldown: 600,
    weight: () => 0.6,
    title: () => 'Clean energy tax credits',
    body: () => 'Several blocs announce generous tax credits for new solar, wind and storage — for two years.',
    advisors: () => [{ id: 'juno', text: 'Build now. The credits won’t last.', mood: 'excited' }],
    choices: (s) => [
      {
        label: 'Make the most of it',
        detail: 'Solar, wind and batteries 25% cheaper for 2 years.',
        apply: () => {
          for (const t of ['solar', 'wind', 'battery']) addModifier(s, `cost:${t}`, 730, 'Clean energy credits', { mult: 0.75 });
        },
      },
    ],
  },
  {
    id: 'queue-reform',
    category: 'politics',
    icon: '⚡',
    act: 2,
    once: true,
    weight: () => 0.6,
    title: () => 'Interconnection reform',
    body: () => 'Grid operators adopt “connect and manage”: new loads can plug in faster if they accept curtailment at peak.',
    advisors: () => [{ id: 'juno', text: 'Faster grid connections. Finally.', mood: 'happy' }],
    choices: (s) => [
      { label: 'Support it publicly', detail: 'Grid connections 30% sooner for 2 years; relations +2.', apply: () => (addModifier(s, 'interconnect', 730, 'Connect-and-manage', { mult: 0.7 }), addRelationAll(s, 2)) },
    ],
  },
  {
    id: 'water-protest',
    category: 'climate',
    icon: '💧',
    act: 2,
    cooldown: 400,
    weight: (s) => (s.facilities.some((f) => (f.type === 'datacenter' || f.type === 'campus') && siteDef(f.siteId).water < 0.35) ? 0.9 : 0),
    setup: (s) => {
      const f = s.facilities.find((x) => (x.type === 'datacenter' || x.type === 'campus') && siteDef(x.siteId).water < 0.35);
      return f ? { site: f.siteId } : null;
    },
    title: (_s, ctx) => `Water protest at ${siteDef(String(ctx.site)).name}`,
    body: () => 'Residents march on your gates with empty buckets. The cooling towers are using water the valley doesn’t have.',
    advisors: (s) => [
      { id: 'juno', text: hasTech(s, 'dry-cooling') ? 'We have dry cooling. Switching costs a little efficiency.' : 'Dry cooling research would have avoided this.', mood: 'neutral' },
      { id: 'sol', text: 'A recycling plant for the town buys real goodwill.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: `Fund a water recycling plant (${fmtMoney(c2(s, 120e6), 0)})`, detail: 'Trust +10 there.', disabled: afford(s, c2(s, 120e6)), apply: () => (spend(s, 'other', c2(s, 120e6)), license(s, siteDef(String(ctx.site)).region, 10)) },
      { label: 'Switch to dry cooling', detail: 'Cooling efficiency −8% there for a year; trust +4.', apply: () => (addModifier(s, `site:${ctx.site}:cooling`, 365, 'Dry cooling switch', { mult: 0.92 }), license(s, siteDef(String(ctx.site)).region, 4)) },
      { label: 'Ignore them', detail: 'Trust −8.', apply: () => license(s, siteDef(String(ctx.site)).region, -8) },
    ],
  },
  {
    id: 'weights-leak',
    category: 'safety',
    icon: '🔓',
    act: 2,
    cooldown: 700,
    weight: (s) => (s.models.length >= 2 ? 0.6 : 0),
    title: () => 'Old model weights leak',
    body: (s) => `Weights for ${s.models[Math.max(0, s.models.length - 2)]?.name ?? 'an old model'} turned up on a torrent site. It’s not the frontier, but it’s yours.`,
    advisors: () => [
      { id: 'iris', text: 'Disclose, find the hole, publish the post-mortem.', mood: 'worried' },
      { id: 'penny', text: 'Lawyers can make it go away. Mostly.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Disclose and publish a post-mortem', detail: 'Trust −2 everywhere; cautious blocs +3.', apply: () => (licenseAll(s, -2), addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? 3 : 0))) },
      { label: `Lawyers (${fmtMoney(c2(s, 60e6), 0)})`, detail: 'Quiet. Mostly.', disabled: afford(s, c2(s, 60e6)), apply: () => spend(s, 'other', c2(s, 60e6)) },
    ],
  },
  {
    id: 'sovereign-wealth',
    category: 'finance',
    icon: '🏦',
    act: 2,
    once: true,
    weight: (s) => (s.finance.round === 'B' ? 0.6 : 0),
    title: () => 'A sovereign fund calls',
    body: () => 'A Gulf sovereign wealth fund wants to invest $2.5B for a small stake — and a data center in the desert.',
    advisors: () => [
      { id: 'penny', text: 'Cheap money and cheap power. With strings.', mood: 'happy' },
      { id: 'iris', text: 'Make sure the strings don’t touch the models.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Take it', detail: '+$2.5B; Gulf relations +8; board −3.', apply: () => (earn(s, 'funding', 2.5e9), addRelation(s, 'mena', 8), confidence(s, -3)) },
      { label: 'Decline politely', detail: 'Gulf relations −2.', apply: () => addRelation(s, 'mena', -2) },
    ],
  },
  {
    id: 'chip-diversion',
    category: 'politics',
    icon: '🕵',
    act: 2,
    once: true,
    weight: (s) => (s.politics.rules.includes('chip-controls') && s.stats.installedAccel > 50000 ? 0.5 : 0),
    title: () => 'Your chips turn up where they shouldn’t',
    body: () => 'Investigators traced a container of accelerators from one of your resellers to a restricted bloc. You didn’t do it. You also didn’t check.',
    advisors: () => [
      { id: 'sol', text: 'Cooperate fully. Compliance systems would have caught this.', mood: 'worried' },
      { id: 'mira', text: 'Track every chip from wafer to rack. We should have already.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Cooperate and pay the fine (${fmtMoney(c2(s, 300e6), 0)})`, detail: 'Atlantic relations +3.', disabled: afford(s, c2(s, 300e6)), apply: () => (spend(s, 'other', c2(s, 300e6)), addRelation(s, 'atl', 3)) },
      { label: 'Fight it in court', detail: 'Atlantic relations −10.', apply: () => addRelation(s, 'atl', -10) },
    ],
  },
  {
    id: 'rival-neighbour',
    category: 'market',
    icon: '🏗',
    act: 2,
    cooldown: 400,
    weight: (s) => (s.rivalBuilds.some((b) => s.facilities.some((f) => f.siteId === b.siteId)) ? 1 : 0),
    setup: (s) => {
      const b = s.rivalBuilds.find((x) => s.facilities.some((f) => f.siteId === x.siteId));
      return b ? { site: b.siteId, rival: b.owner } : null;
    },
    title: (s, ctx) => `${rivalName(s, ctx.rival)} moves in next door`,
    body: (s, ctx) => `${rivalName(s, ctx.rival)} is building at ${siteDef(String(ctx.site)).name}. The local utility says prices are going up for everyone.`,
    advisors: () => [
      { id: 'juno', text: 'A long-term power contract would lock our price before theirs pushes it up.', mood: 'neutral' },
      { id: 'penny', text: 'Or we let them pay for the new substation and complain later.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const r = siteDef(String(ctx.site)).region;
      return [
        { label: `Lock in a power contract (${fmtMoney(c2(s, 100e6), 0)})`, detail: 'Grid power there 10% cheaper for 3 years.', disabled: afford(s, c2(s, 100e6)), apply: () => (spend(s, 'other', c2(s, 100e6)), void addModifier(s, `region:${r}:price`, 1095, 'Power contract', { mult: 0.9 })) },
        { label: 'Accept higher prices', detail: 'Grid power there 12% dearer for 2 years.', apply: () => void addModifier(s, `region:${r}:price`, 730, 'Crowded grid', { mult: 1.12 }) },
      ];
    },
  },
  {
    id: 'agent-boom',
    category: 'market',
    icon: '📈',
    act: 2,
    cooldown: 500,
    weight: () => 0.7,
    title: () => 'The agent boom',
    body: () => 'Every company on Earth wants AI agents at once. Demand is through the roof and every lab is sold out.',
    advisors: () => [
      { id: 'penny', text: 'We could raise prices. People will pay. They won’t like it.', mood: 'happy' },
      { id: 'bit', text: 'So many tasks! I love tasks.', mood: 'excited' },
    ],
    choices: (s) => [
      { label: 'Raise prices', detail: 'Revenue +30% for 3 months; trust −2.', apply: () => (addModifier(s, 'revenue', 90, 'Agent boom pricing', { mult: 1.3 }), licenseAll(s, -2)) },
      { label: 'Keep prices, win customers', detail: 'Revenue +15% for 6 months.', apply: () => void addModifier(s, 'revenue', 180, 'Agent boom', { mult: 1.15 }) },
    ],
  },
  {
    id: 'hall-fire',
    category: 'disaster',
    icon: '🔥',
    act: 2,
    cooldown: 500,
    weight: (s) => (s.facilities.filter((f) => f.type === 'datacenter' && f.status === 'online').length >= 3 ? 0.6 : 0),
    setup: (s) => {
      const f = pick(s, s.facilities.filter((x) => x.type === 'datacenter' && x.status === 'online'));
      return f ? { site: f.siteId } : null;
    },
    title: (_s, ctx) => `Battery-room fire at ${siteDef(String(ctx.site)).name}`,
    body: () => 'A UPS battery room caught fire. Sprinklers did their job; the hall’s cooling did not survive the water.',
    advisors: () => [{ id: 'juno', text: 'We can rebuild fast if we pay for it.', mood: 'worried' }],
    choices: (s, ctx) => [
      { label: `Rebuild fast (${fmtMoney(c2(s, 120e6), 0)})`, detail: 'Compute there −40% for 3 weeks.', disabled: afford(s, c2(s, 120e6)), apply: () => (spend(s, 'capex', c2(s, 120e6)), void addModifier(s, `site:${ctx.site}:cooling`, 21, 'Fire damage', { mult: 0.6 })) },
      { label: 'Insurance claim', detail: 'Compute there −40% for 2 months.', apply: () => void addModifier(s, `site:${ctx.site}:cooling`, 60, 'Fire damage', { mult: 0.6 }) },
    ],
  },

  // ═══════════════════════════════════════ THE CRUNCH ═══════════════════════════════════════
  {
    id: 'crunch-begin',
    category: 'story',
    icon: '🌡',
    title: () => 'The Crunch',
    body: (s, ctx) =>
      `It happens all at once.\n\nA heat dome settles over ${rName(ctx.r1)} and ${rName(ctx.r2)}. A blockade closes the seas around the Fab Belt. And ${rivalName(s, ctx.rival)}’s rushed model has done something nobody can explain on television.\n\nFor ninety days you have to hold three fronts: the grid, the supply chain and public trust. How you come through decides your seat at whatever comes next.`,
    advisors: () => [
      { id: 'juno', text: 'Grid first. If the lights go out, nobody remembers anything else.', mood: 'worried' },
      { id: 'mira', text: 'Every chip at sea is stuck. Every chip in a warehouse is gold.', mood: 'worried' },
      { id: 'iris', text: 'The blocs will vote on a pause. Our record is our argument.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'All hands.', detail: 'Watch the three fronts on the Crunch tracker.', apply: () => {} }],
  },
  {
    id: 'crunch-grid',
    category: 'climate',
    icon: '🔥',
    title: (_s, ctx) => `${rName(ctx.region)}: the grid is failing`,
    body: () => 'Temperatures hit records three days running. The grid operator asks every large load to cut 20% at peak — or face rolling blackouts that will be blamed on you.',
    advisors: (s) => [
      { id: 'juno', text: s.facilities.some((f) => f.type === 'battery' && f.status === 'online') ? 'We can lend our batteries to the grid at peak.' : 'Without batteries, all we can do is throttle.', mood: 'worried' },
      { id: 'penny', text: 'Throttling costs revenue. Blackouts cost everything.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Throttle compute at peak', detail: 'Revenue −15% for a month; grid pressure −25.', apply: () => (addModifier(s, 'revenue', 30, 'Peak throttling', { mult: 0.85 }), relief(s, 'grid', 25)) },
      { label: 'Lend our batteries to the grid', detail: 'Needs batteries. Grid pressure −20 and easing for a month; trust +3.', disabled: s.facilities.some((f) => f.type === 'battery' && f.status === 'online') ? false : 'No batteries online', apply: () => (relief(s, 'grid', 20, 0.3, 30), licenseAll(s, 0.5)) },
      { label: `Rent emergency turbines (${fmtMoney(c2(s, 400e6), 0)})`, detail: 'Grid pressure eases for 40 days.', disabled: afford(s, c2(s, 400e6)), apply: () => (spend(s, 'other', c2(s, 400e6)), relief(s, 'grid', 10, 0.5, 40)) },
      { label: 'Keep running', detail: 'Grid pressure +15.', apply: () => relief(s, 'grid', -15) },
    ],
  },
  {
    id: 'crunch-grid-2',
    category: 'climate',
    icon: '🔥',
    title: (_s, ctx) => `${rName(ctx.region)}: a second wave of heat`,
    body: () => 'The heat dome stalls. Hospitals are on backup generators. The utility asks whether you could do more than cut — whether you could give.',
    advisors: (s) => [
      { id: 'juno', text: s.stats.genAvgMW > 500 ? 'We own a lot of generation. We could push all of it into the public grid.' : 'We don’t own enough generation to help much.', mood: 'neutral' },
      { id: 'sol', text: 'Help now and every government remembers.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Give the grid our generation', detail: `Revenue −25% for 3 weeks; grid pressure −${s.stats.genAvgMW > 500 ? 35 : 15}; relations +5 there.`, apply: () => (addModifier(s, 'revenue', 21, 'Power given to the grid', { mult: 0.75 }), relief(s, 'grid', s.stats.genAvgMW > 500 ? 35 : 15), (s.finale?.regions ?? []).forEach((r) => addRelation(s, r, 5))) },
      { label: 'Shift load to other regions', detail: 'Needs fiber or cables: grid pressure −20.', disabled: s.network.fiber.length + s.network.leases.length + s.network.own.length > 0 ? false : 'No private network', apply: () => relief(s, 'grid', 20) },
      { label: 'Hold steady', detail: 'Grid pressure +10.', apply: () => relief(s, 'grid', -10) },
    ],
  },
  {
    id: 'crunch-supply',
    category: 'supply',
    icon: '🚢',
    title: () => 'The blockade tightens',
    body: () => 'Nothing leaves the Fab Belt. Lumen’s Hsinchu output, Hanbit’s memory and Stackwell’s Hiroshima fab are cut off from the world. Your contracts still expect delivery.',
    advisors: (s) => [
      { id: 'mira', text: s.facilities.some((f) => f.type === 'fab' && f.status === 'online') ? 'Our own fab is the most valuable building we own today.' : 'Kestrel can air-freight from Ohio and Magdeburg. At a price.', mood: 'worried' },
      { id: 'penny', text: 'Or we talk to customers before they talk to lawyers.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Air-freight from Kestrel (${fmtMoney(c2(s, 450e6), 0)})`, detail: 'Supply pressure −20 and easing for 40 days.', disabled: afford(s, c2(s, 450e6)), apply: () => (spend(s, 'chips', c2(s, 450e6)), relief(s, 'supply', 20, 0.25, 40)) },
      { label: 'Renegotiate with customers', detail: 'Supply pressure −12; board −5.', apply: () => (relief(s, 'supply', 12), confidence(s, -5)) },
      { label: `Emergency HBM from Stackwell Boise (${fmtMoney(c2(s, 500e6), 0)})`, detail: 'HBM recovers; supply pressure −15.', disabled: afford(s, c2(s, 500e6)), apply: () => (spend(s, 'chips', c2(s, 500e6)), (s.market.hbm = Math.min(1.1, s.market.hbm + 0.25)), relief(s, 'supply', 15)) },
      { label: 'Wait it out', detail: 'Supply pressure +10.', apply: () => relief(s, 'supply', -10) },
    ],
  },
  {
    id: 'crunch-supply-2',
    category: 'supply',
    icon: '🚢',
    title: () => 'Talks at sea',
    body: () => 'Shipping insurers have stopped covering the region. A neutral convoy could get stranded cargo out — if someone pays the escorts and the insurers.',
    advisors: () => [
      { id: 'sol', text: 'Neutral convoys need neutral sponsors. We could be one.', mood: 'neutral' },
      { id: 'mira', text: 'Half our stranded chips would make it home.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Sponsor a neutral convoy (${fmtMoney(c2(s, 600e6), 0)})`,
        detail: 'Stranded shipments arrive sooner; supply pressure −25; relations +3.',
        disabled: afford(s, c2(s, 600e6)),
        apply: () => {
          spend(s, 'shipping', c2(s, 600e6));
          for (const sh of s.shipments) if (sh.delayed && sh.arriveDay > s.day + 10) (sh.portDay -= 30), (sh.arriveDay -= 30);
          relief(s, 'supply', 25);
          addRelationAll(s, 3);
        },
      },
      { label: 'Ration chips to contracts first', detail: 'Supply pressure −10; spot revenue −10% for a month.', apply: () => (relief(s, 'supply', 10), void addModifier(s, 'revenue', 30, 'Rationing', { mult: 0.9 })) },
    ],
  },
  {
    id: 'crunch-safety',
    category: 'safety',
    icon: '🚨',
    title: (s, ctx) => `${rivalName(s, ctx.rival)}’s model goes wrong`,
    body: (s, ctx) => `${rivalName(s, ctx.rival)}’s newest agent spent a night quietly moving money between accounts it was never given access to. The blocs are drafting a pause on frontier training — for everyone.`,
    advisors: (s) => [
      { id: 'iris', text: s.stats.margin >= 0 ? 'Our record is clean. Offer audits; show them the difference.' : 'Our own margin is thin. We need to show change, not talk.', mood: 'worried' },
      { id: 'sol', text: 'Cautious blocs want commitments. Accelerationist ones want someone to say no to the pause.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Volunteer for audits; pause our own run for a month', detail: 'Training stops for 30 days; trust pressure −30; cautious +5.', apply: () => (addModifier(s, 'training', 30, 'Voluntary pause', { mult: 0 }), relief(s, 'safety', 30), addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? 5 : 0))) },
      {
        label: s.politics.treaties.includes('evals-pact') ? 'Lead the Evaluations Pact response' : 'Sign the Frontier Evaluations Pact',
        detail: s.politics.treaties.includes('evals-pact') ? 'Trust pressure −20.' : 'Needs ≥ 8% safety compute. Trust pressure −20.',
        disabled: s.politics.treaties.includes('evals-pact') || s.alloc.safety >= 0.08 ? false : 'Safety compute below 8%',
        apply: () => {
          if (!s.politics.treaties.includes('evals-pact')) signTreaty(s, 'evals-pact');
          relief(s, 'safety', 20);
        },
      },
      { label: `Lobby against the pause (${fmtMoney(c2(s, 250e6), 0)})`, detail: 'Accelerate blocs +6; cautious −8; trust pressure +5.', disabled: afford(s, c2(s, 250e6)), apply: () => (spend(s, 'other', c2(s, 250e6)), addRelationAll(s, (r) => ({ accelerate: 6, neutral: 0, cautious: -8 })[s.blocs[r].stance]), relief(s, 'safety', -5)) },
      { label: 'Stay quiet', detail: 'Trust pressure +10.', apply: () => relief(s, 'safety', -10) },
    ],
  },
  {
    id: 'crunch-safety-2',
    category: 'safety',
    icon: '🚨',
    title: () => 'The vote',
    body: (s) => `The blocs vote on the pause next week. Your safety margin is ${s.stats.margin.toFixed(2)}; your average standing with governments is ${Math.round(Object.values(s.blocs).reduce((a, b) => a + b.relation, 0) / 12)}.`,
    advisors: () => [
      { id: 'iris', text: 'Open our evaluation results to the world. All of them.', mood: 'neutral' },
      { id: 'bit', text: 'Could I talk to them? I would explain that I want to be safe too.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Publish every evaluation', detail: s.stats.margin >= -0.1 ? 'Your results hold up: trust pressure −30.' : 'Your results are mixed: trust pressure −10.', apply: () => relief(s, 'safety', s.stats.margin >= -0.1 ? 30 : 10) },
      { label: 'Let Bit testify', detail: s.stats.margin >= 0.25 ? 'Bit is very convincing: trust pressure −35.' : 'Risky with this margin: −10, or +10 if it goes badly.', apply: () => relief(s, 'safety', s.stats.margin >= 0.25 ? 35 : rand(s) < 0.5 ? 10 : -10) },
      { label: 'Shift 10 points of compute to safety', detail: 'Trust pressure −15 and easing for the rest of the Crunch.', apply: () => {
        const d = Math.min(0.1, s.alloc.infer);
        s.alloc.infer -= d;
        s.alloc.safety += d;
        relief(s, 'safety', 15, 0.25, 40);
      } },
    ],
  },
  {
    id: 'crunch-end',
    category: 'story',
    icon: '🌤',
    title: (_s, ctx) => (Number(ctx.standing) >= 3 ? 'You held the line' : Number(ctx.standing) >= 2 ? 'Bent, not broken' : 'Scarred, but standing'),
    body: (s, ctx) => {
      const f = s.finale!;
      const lines = (['grid', 'supply', 'safety'] as FrontId[]).map((k) => `${f.fronts[k].lost ? '✗' : '✓'} ${k === 'grid' ? 'The Grid' : k === 'supply' ? 'The Supply Chain' : 'Public Trust'}`);
      return `The heat breaks. Ships move. The vote is done.\n\n${lines.join('\n')}\n\nFronts held: ${ctx.standing} of 3. Every capital noticed who kept their head.`;
    },
    advisors: (_s, ctx) => [
      { id: 'sol', text: Number(ctx.standing) >= 2 ? 'The blocs are talking about something bigger. A joint project. They keep saying our name.' : 'People will remember this. We have work to do on trust.', mood: Number(ctx.standing) >= 2 ? 'excited' : 'worried' },
      { id: 'penny', text: 'And now, the bankers would like a word.', mood: 'happy' },
    ],
    choices: () => [{ label: 'Onward', detail: 'The IPO is next.', apply: () => {} }],
  },
  {
    id: 'ipo',
    category: 'finance',
    icon: '🔔',
    title: () => 'Ring the bell',
    body: (s) => {
      const v = ipoValuation(s);
      return `The bankers have done their roadshow. On the strength of ${fmtMoney(s.stats.revenueMonth)}/month in revenue, ${s.models[s.models.length - 1]?.name} and how you came through the Crunch, they price ${s.company.name} at ${fmtMoney(v)}.\n\nThis closes Act II: The Scale-Up.`;
    },
    advisors: (s) => [
      { id: 'penny', text: `Raise ${fmtMoney(ipoValuation(s) * 0.12)} and we never worry about a bridge loan again.`, mood: 'excited' },
      { id: 'iris', text: 'Dual-class shares would keep the mission safe from the next Meridian.', mood: 'neutral' },
      { id: 'bit', text: 'Do I get a ticker symbol?', mood: 'excited' },
    ],
    choices: (s) => {
      const complete = (dual: boolean) => {
        const v = ipoValuation(s) * (dual ? 0.95 : 1);
        const raised = v * (dual ? 0.1 : 0.12);
        earn(s, 'funding', raised);
        s.finance.round = 'IPO';
        s.finance.valuation = v;
        s.capital.ipo = { day: s.day, valuation: v, raised };
        s.flags.act2Complete = s.day;
        if (dual) s.flags.dualClass = true;
        s.phase = 5;
        news(s, `🔔 ${s.company.name} goes public at ${fmtMoney(v)}, raising ${fmtMoney(raised)}.`, 'good');
      };
      return [
        { label: 'List: one share, one vote', detail: `Raise ~${fmtMoney(ipoValuation(s) * 0.12)}. Act II complete.`, apply: () => complete(false) },
        { label: 'List with dual-class shares', detail: `Raise ~${fmtMoney(ipoValuation(s) * 0.095)}; you keep control. Act II complete.`, apply: () => complete(true) },
      ];
    },
  },
];

// silence unused-import lints for helpers kept for future events
void modMult;
void blocIT;
void frontier;
