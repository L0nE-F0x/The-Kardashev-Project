import type { AdvisorId, GameState } from '../sim/types';
import { REGIONS, type RegionDef } from './regions';
import { siteDef } from './sites';
import { REGION_IDS, type RegionId } from './mapcodes';
import { addModifier, hasTech } from '../sim/effects';
import { earn, spend } from '../sim/economy';
import { delayShipmentsThrough } from '../sim/supply';
import { clamp, fmtMoney, news, pick, rand } from '../sim/core';
import { crisisCost, currentCapability, frontier, openBest } from '../sim/model';
import { DIFFICULTIES } from './difficulty';
import { ACT2_EVENTS } from './events2';
import { ACT3_EVENTS } from './events3';

export type Mood = 'neutral' | 'happy' | 'worried' | 'angry' | 'excited';
export type Ctx = Record<string, string | number>;
/** Who speaks on a card: an advisor, a partner's CEO (`ceo:halcyon`) or a faction delegate (`ceo:atlantic`). */
export type Speaker = AdvisorId | `ceo:${string}`;

export interface EventChoice {
  label: string;
  detail: string;
  /** Reason the choice is unavailable, or false. */
  disabled?: string | false;
  apply: (s: GameState, ctx: Ctx) => void;
}

export interface EventDef {
  id: string;
  category: 'supply' | 'disaster' | 'politics' | 'climate' | 'safety' | 'market' | 'finance' | 'story';
  icon: string;
  title: (s: GameState, ctx: Ctx) => string;
  body: (s: GameState, ctx: Ctx) => string;
  advisors: (s: GameState, ctx: Ctx) => { id: Speaker; text: string; mood?: Mood }[];
  choices: (s: GameState, ctx: Ctx) => EventChoice[];
  /** Random-pool weight; omit for scripted-only events. */
  weight?: (s: GameState) => number;
  /** Pick a target; return null if the event doesn't apply right now. */
  setup?: (s: GameState) => Ctx | null;
  cooldown?: number;
  once?: boolean;
  minDay?: number;
  /** Act needed before it can roll (default 1). */
  act?: number;
  /** Act II phase needed. */
  phase?: number;
  /** Only rolls in this act. */
  actOnly?: number;
  /** Act III: the Charter phase needed. */
  cphase?: number;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
const regionName = (r: string) => REGIONS[r as RegionId]?.name ?? r;
const addLicense = (s: GameState, region: string, d: number) => {
  const st = s.regions[region as RegionId];
  if (st) st.license = clamp(st.license + d, 0, 100);
};
const addLicenseAll = (s: GameState, d: number) => REGION_IDS.forEach((r) => addLicense(s, r, d));
const playerRegions = (s: GameState): RegionId[] => [...new Set(s.facilities.map((f) => siteDef(f.siteId).region))];
const onlineDCSites = (s: GameState) => s.facilities.filter((f) => f.type === 'datacenter' && f.status === 'online').map((f) => f.siteId);
const hasGas = (s: GameState) => s.facilities.some((f) => f.type === 'gas');
const openOrders = (s: GameState, supplier?: string) => s.orders.filter((o) => !o.done && (!supplier || o.supplier === supplier));
const openOrderValue = (s: GameState) => openOrders(s).reduce((a, o) => a + (o.qty - o.produced) * o.unitPrice, 0);
const canAfford = (s: GameState, cost: number): string | false => (s.finance.cash >= cost ? false : `Needs ${fmtMoney(cost)}`);
/** Crisis price on this difficulty. */
const cc = (s: GameState, amount: number) => crisisCost(s, amount);

export const EVENTS: EventDef[] = [
  // ════════════════════════════════════════ STORY ════════════════════════════════════════
  {
    id: 'welcome',
    category: 'story',
    icon: '🌅',
    title: (s) => `Day one at ${s.company.name}`,
    body: (s) =>
      `January 2027. The AI boom is roaring and Earth runs on about 19.6 terawatts — Kardashev 0.729. You have ${fmtMoney(s.finance.cash, 0)} of seed money, a garage in ${siteDef(s.company.homeSite).name} and a tiny model that hasn’t been trained yet.\n\nThe plan: train a model, build your own compute, keep it safe, and raise a Series A. One day, maybe, help the whole planet climb the scale.`,
    advisors: () => [
      { id: 'bit', text: 'Hello, world! I’m Bit. I don’t know anything yet, but I’m very excited to learn.', mood: 'excited' },
      { id: 'juno', text: 'Rent some cloud to get Bit started, then let’s pour concrete for our own data center.', mood: 'happy' },
      { id: 'penny', text: 'And let’s not spend all the money in week one. Seed rounds are not renewable energy.', mood: 'neutral' },
    ],
    choices: () => [{ label: 'Let’s build.', detail: 'Start the clock.', apply: () => {} }],
  },
  {
    id: 'series-a',
    category: 'finance',
    icon: '🚀',
    title: () => 'Term sheets on the table',
    body: (s) =>
      `${s.models[s.models.length - 1]?.name ?? 'Bit'} is shipping, revenue is real, and your data center hums. Three firms want to lead your Series A.\n\nThis closes Act I: The Garage.`,
    advisors: () => [
      { id: 'penny', text: 'Two billion dollars at a very silly valuation. I checked the maths twice. Sign it.', mood: 'happy' },
      { id: 'iris', text: 'Take the money — but keep the safety budget written into the terms.', mood: 'neutral' },
      { id: 'bit', text: 'Does this mean I get a bigger brain?', mood: 'excited' },
    ],
    choices: () => [
      {
        label: 'Raise $2B (keep safety terms)',
        detail: '+$2B. Valuation $12B. Act I complete.',
        apply: (s) => {
          earn(s, 'funding', 2e9);
          s.finance.round = 'A';
          s.finance.valuation = 12e9;
          s.flags.act1Complete = s.day;
          addLicenseAll(s, 2);
          news(s, `💰 ${s.company.name} raises a $2B Series A at a $12B valuation.`, 'good');
        },
      },
      {
        label: 'Raise $2.6B (growth-at-all-costs terms)',
        detail: '+$2.6B, but the board caps safety compute at 5% for a year.',
        apply: (s) => {
          earn(s, 'funding', 2.6e9);
          s.finance.round = 'A';
          s.finance.valuation = 15e9;
          s.flags.act1Complete = s.day;
          s.flags.safetyCapUntil = s.day + 365;
          s.alloc.safety = Math.min(s.alloc.safety, 0.05);
          news(s, `💰 ${s.company.name} raises a $2.6B Series A. Critics question the safety terms.`, 'good');
        },
      },
    ],
  },
  {
    id: 'bridge-loan',
    category: 'finance',
    icon: '🏦',
    title: () => 'The bank account hit zero',
    body: (s) => `${s.company.name} is out of cash. Payroll is due Friday and Cumulus wants paying for last month’s compute.`,
    advisors: () => [
      { id: 'penny', text: 'I can get a bridge loan. It is not cheap, and it is not a long bridge.', mood: 'worried' },
      { id: 'juno', text: 'Or we pause the cloud rental and live on what we own for a while.', mood: 'neutral' },
    ],
    choices: (s) => {
      const relaxed = DIFFICULTIES[s.meta.difficulty].broke === 'cheap-loan';
      const k = (s.act ?? 1) >= 2 ? 6 : 1;
      const amount = (relaxed ? 200e6 : 150e6) * k;
      const interest = (relaxed ? 1.5e6 : 3e6) * k;
      return [
        {
          label: `Take a ${fmtMoney(amount, 0)} bridge loan`,
          detail: `+${fmtMoney(amount, 0)} now; ${fmtMoney(interest)}/month interest for 2 years.`,
          apply: () => {
            earn(s, 'funding', amount);
            s.finance.bridgeLoans += 1;
            addModifier(s, 'cost:monthly', 730, 'Bridge loan interest', { add: interest });
          },
        },
        {
          label: 'Emergency cuts',
          detail: 'Cancel all cloud rental; +$40M from selling spare equipment.',
          apply: () => {
            s.rental.units = 0;
            earn(s, 'other', 40e6);
          },
        },
      ];
    },
  },
  {
    id: 'bankruptcy',
    category: 'finance',
    icon: '💸',
    title: () => 'Out of money — for real',
    body: (s) => `${s.company.name} can’t make payroll and the bank won’t extend another dollar. On Hard, this is where companies end.\n\nYou can close the doors with your head held high — or swallow your pride and accept a rescue deal (the game switches to Standard difficulty).`,
    advisors: () => [
      { id: 'penny', text: 'I’ve run the numbers every way I know. We’re done unless someone bails us out.', mood: 'worried' },
      { id: 'bit', text: 'Does this mean I get turned off?', mood: 'worried' },
    ],
    choices: (s) => [
      {
        label: 'Close the company',
        detail: 'Game over. See how far you got and start again.',
        apply: () => {
          s.meta.gameOver = true;
          news(s, `🪦 ${s.company.name} has closed its doors.`, 'bad');
        },
      },
      {
        label: 'Accept a rescue (switch to Standard)',
        detail: '+$150M; $3M/month interest for 2 years; difficulty becomes Standard.',
        apply: () => {
          s.meta.difficulty = 'standard';
          earn(s, 'funding', 150e6);
          s.finance.bridgeLoans += 1;
          addModifier(s, 'cost:monthly', 730, 'Rescue loan interest', { add: 3e6 });
          news(s, `🛟 ${s.company.name} survives on a rescue loan.`, 'info');
        },
      },
    ],
  },

  // ════════════════════════════════════════ SUPPLY ═══════════════════════════════════════
  {
    id: 'helium-spike',
    category: 'supply',
    icon: '🎈',
    weight: (s) => (openOrders(s).length ? 1.2 : 0.3),
    cooldown: 400,
    minDay: 60,
    title: () => 'Helium plant fire',
    body: () => 'A fire has shut down a giant helium plant in the Gulf. Fabs use helium to cool wafers during lithography; spot prices just jumped 40%.',
    advisors: (s) => [
      { id: 'mira', text: s.flags.heliumRecycling ? 'Good news: the recycling loops we funded mean Lumen barely notices.' : 'Every fab on Earth is about to slow down. Single point of failure, as I keep saying.', mood: s.flags.heliumRecycling ? 'happy' : 'worried' },
      { id: 'penny', text: 'We can pay to keep our place in line. Or we can be patient and cheap.', mood: 'neutral' },
    ],
    choices: (s) => {
      if (s.flags.heliumRecycling) return [{ label: 'Carry on', detail: 'Our suppliers recycle their helium now.', apply: () => {} }];
      const premium = cc(s, Math.max(4e6, openOrderValue(s) * 0.05));
      return [
        { label: `Pay the premium (${fmtMoney(premium)})`, detail: 'Your orders stay on schedule.', disabled: canAfford(s, premium), apply: () => spend(s, 'chips', premium) },
        { label: 'Accept delays', detail: 'Chip output −40% for 2 months.', apply: () => void addModifier(s, 'supplier:*:rate', 60, 'Helium shortage', { mult: 0.6 }) },
        {
          label: `Fund helium recycling (${fmtMoney(cc(s, 15e6), 0)})`,
          detail: 'Output −15% for 6 weeks; immune to future helium shocks.',
          disabled: canAfford(s, cc(s, 15e6)),
          apply: () => {
            spend(s, 'other', cc(s, 15e6));
            addModifier(s, 'supplier:*:rate', 45, 'Helium shortage', { mult: 0.85 });
            s.flags.heliumRecycling = true;
          },
        },
      ];
    },
  },
  {
    id: 'fab-quake',
    category: 'disaster',
    icon: '🌋',
    weight: (s) => (s.day > 120 ? 0.8 : 0),
    cooldown: 700,
    title: () => 'Earthquake near Hsinchu',
    body: () => 'A magnitude 6.8 quake has rattled the Pacific Fab Belt. Lumen Foundry’s lines are halted while engineers re-align lithography tools to the nanometre.',
    advisors: (s) => [
      { id: 'mira', text: openOrders(s, 'lumen').length ? 'Our Lumen orders are stuck. Kestrel has spare capacity — slower chips, but chips.' : 'We have nothing in Lumen’s queue, thankfully. Everyone else does.', mood: 'worried' },
      { id: 'sol', text: 'Helping Lumen recover would be remembered. Fabs have long memories.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: 'Move Lumen orders to Kestrel',
        detail: 'Unproduced Lumen units switch to Kestrel (cheaper, 15% slower chips; difference refunded).',
        disabled: openOrders(s, 'lumen').length ? false : 'No Lumen orders queued',
        apply: () => {
          addModifier(s, 'supplier:lumen:rate', 75, 'Hsinchu quake', { mult: 0.4 });
          for (const o of openOrders(s, 'lumen')) {
            const left = o.qty - o.produced;
            if (left <= 0) continue;
            const refund = left * o.unitPrice * 0.2;
            earn(s, 'other', refund);
            o.qty = o.produced;
            s.orders.push({ ...o, id: `${o.id}k`, supplier: 'kestrel', fromSite: 'kestrel-ohio', qty: left, produced: 0, shipped: 0, pendingShip: 0, done: false, unitPrice: o.unitPrice * 0.8, perf: o.perf * 0.85 });
          }
        },
      },
      { label: 'Wait it out', detail: 'Lumen output −60% for ~2.5 months.', apply: () => void addModifier(s, 'supplier:lumen:rate', 75, 'Hsinchu quake', { mult: 0.4 }) },
      {
        label: `Fund the recovery (${fmtMoney(cc(s, 20e6), 0)})`,
        detail: 'Lumen recovers faster (−30%), and gives you +15% allocation for 3 years.',
        disabled: canAfford(s, cc(s, 20e6)),
        apply: () => {
          spend(s, 'other', cc(s, 20e6));
          addModifier(s, 'supplier:lumen:rate', 75, 'Hsinchu quake', { mult: 0.7 });
          addModifier(s, 'supplier:lumen:rate', 1095, 'Lumen goodwill', { mult: 1.15 });
        },
      },
    ],
  },
  {
    id: 'malacca-closure',
    category: 'supply',
    icon: '⚓',
    weight: (s) => (s.shipments.some((x) => x.chokepoints.includes('malacca')) ? 2 : 0.25),
    cooldown: 500,
    minDay: 90,
    title: () => 'Strait of Malacca closed',
    body: () => 'Two tankers have collided in the narrowest stretch of the Strait of Malacca. A quarter of world trade squeezes through here; the queue of ships already stretches past the horizon.',
    advisors: () => [
      { id: 'mira', text: 'Ships can go the long way through Lombok. It costs fuel and a week.', mood: 'worried' },
      { id: 'penny', text: 'Or we wait. Strait closures rarely last.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Reroute via Lombok (${fmtMoney(cc(s, 3e6), 0)})`,
        detail: 'Affected ships +6 days. Strait closed ~5 weeks.',
        disabled: canAfford(s, cc(s, 3e6)),
        apply: () => {
          spend(s, 'shipping', cc(s, 3e6));
          addModifier(s, 'chokepoint:malacca', 35, 'Malacca closed', { add: 1 });
          delayShipmentsThrough(s, 'malacca', 6);
        },
      },
      {
        label: 'Wait in the queue',
        detail: 'Affected ships +16 days. Strait closed ~5 weeks.',
        apply: () => {
          addModifier(s, 'chokepoint:malacca', 35, 'Malacca closed', { add: 1 });
          delayShipmentsThrough(s, 'malacca', 16);
        },
      },
    ],
  },
  {
    id: 'red-sea',
    category: 'supply',
    icon: '🚢',
    weight: (s) => (s.shipments.some((x) => x.chokepoints.includes('bab') || x.chokepoints.includes('suez')) ? 1.6 : 0.3),
    cooldown: 600,
    minDay: 120,
    title: () => 'Red Sea shipping suspended',
    body: () => 'Attacks on merchant ships have closed Bab-el-Mandeb. Container lines are diverting around the Cape of Good Hope — an extra 6,000 km.',
    advisors: () => [
      { id: 'mira', text: 'Anything heading through Suez now goes around Africa. Plan for it.', mood: 'worried' },
      { id: 'sol', text: 'This could last months. Insurance is cheaper than regret.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Insure and divert now (${fmtMoney(cc(s, 4e6), 0)})`,
        detail: 'Ships at sea +10 days. Strait closed ~3 months.',
        disabled: canAfford(s, cc(s, 4e6)),
        apply: () => {
          spend(s, 'shipping', cc(s, 4e6));
          addModifier(s, 'chokepoint:bab', 90, 'Red Sea closed', { add: 1 });
          delayShipmentsThrough(s, 'bab', 10);
          delayShipmentsThrough(s, 'suez', 10);
        },
      },
      {
        label: 'Ride it out',
        detail: 'Ships at sea +18 days. Strait closed ~3 months.',
        apply: () => {
          addModifier(s, 'chokepoint:bab', 90, 'Red Sea closed', { add: 1 });
          delayShipmentsThrough(s, 'bab', 18);
          delayShipmentsThrough(s, 'suez', 18);
        },
      },
    ],
  },
  {
    id: 'transformer-backlog',
    category: 'supply',
    icon: '🔌',
    weight: (s) => (Object.values(s.sites).some((x) => x.grid.pending.length) ? 1.4 : 0.4),
    cooldown: 500,
    minDay: 45,
    title: () => 'Transformer shortage',
    body: () => 'Utilities everywhere are short of large power transformers — each one hand-wound, each one years on back order. Grid connection dates are slipping.',
    advisors: () => [
      { id: 'juno', text: 'This is why I like building our own generation. Panels don’t need a utility’s permission.', mood: 'neutral' },
      { id: 'penny', text: 'There is a refurbished transformer market. It is exactly as sketchy as it sounds.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Buy refurbished transformers (${fmtMoney(cc(s, 8e6), 0)})`,
        detail: 'Pending grid connections +20 days; new requests +25% for a year.',
        disabled: canAfford(s, cc(s, 8e6)),
        apply: () => {
          spend(s, 'other', cc(s, 8e6));
          for (const st of Object.values(s.sites)) st.grid.pending.forEach((p) => (p.readyDay += 20));
          addModifier(s, 'interconnect', 365, 'Transformer shortage', { mult: 1.25 });
        },
      },
      {
        label: 'Join the queue',
        detail: 'Pending grid connections +75 days; new requests +50% for a year.',
        apply: () => {
          for (const st of Object.values(s.sites)) st.grid.pending.forEach((p) => (p.readyDay += 75));
          addModifier(s, 'interconnect', 365, 'Transformer shortage', { mult: 1.5 });
        },
      },
    ],
  },
  {
    id: 'hbm-crunch',
    category: 'supply',
    icon: '💾',
    weight: (s) => (s.day > 200 ? 1 : 0),
    cooldown: 500,
    title: () => 'The HBM crunch',
    body: () => 'Hanbit Memory’s newest HBM stacks are failing qualification. With eight stacks per accelerator, every chip order on Earth just slowed down.',
    advisors: (s) => [
      { id: 'mira', text: hasTech(s, 'hbm-futures') ? 'Our futures contracts soften the blow. Told you they were worth it.' : 'Memory is the new bottleneck. HBM futures research would have helped here.', mood: hasTech(s, 'hbm-futures') ? 'happy' : 'worried' },
      { id: 'penny', text: 'Stackwell will sell us priority allocation — at a price.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Buy Stackwell priority (${fmtMoney(cc(s, 12e6), 0)})`,
        detail: 'Memory tightness hurts your orders only lightly for 4 months.',
        disabled: canAfford(s, cc(s, 12e6)),
        apply: () => {
          spend(s, 'chips', cc(s, 12e6));
          s.market.hbm = Math.min(s.market.hbm, 0.8);
          addModifier(s, 'supplier:*:rate', 120, 'Stackwell priority', { mult: 1.2 });
        },
      },
      { label: 'Wait for Hanbit’s fix', detail: 'HBM supply drops sharply, recovering over months.', apply: () => void (s.market.hbm = Math.min(s.market.hbm, 0.55)) },
    ],
  },
  {
    id: 'export-controls',
    category: 'politics',
    icon: '📜',
    weight: (s) => (s.facilities.some((f) => ['eam', 'stp'].includes(siteDef(f.siteId).region)) ? 1.5 : 0.35),
    cooldown: 900,
    minDay: 150,
    title: () => 'New export controls',
    body: () => 'New rules require licenses for advanced accelerators shipped into Mainland East Asia and the Eurasian Steppe. Paperwork is piling up at every port.',
    advisors: (s) => [
      { id: 'sol', text: s.facilities.some((f) => ['eam', 'stp'].includes(siteDef(f.siteId).region)) ? 'Our sites there will feel this. I can get licences, with time and lawyers.' : 'We have nothing in the affected regions. Worth knowing before we expand there.', mood: 'neutral' },
      { id: 'mira', text: 'Every new rule is another queue.', mood: 'worried' },
    ],
    choices: (s) => {
      const affected = s.shipments.filter((sh) => ['eam', 'stp'].includes(siteDef(sh.dest).region));
      return [
        {
          label: `Apply for licences (${fmtMoney(cc(s, 2e6), 0)})`,
          detail: `${affected.length} affected shipment(s) +20 days.`,
          disabled: canAfford(s, cc(s, 2e6)),
          apply: () => {
            spend(s, 'other', cc(s, 2e6));
            affected.forEach((sh) => ((sh.arriveDay += 20), (sh.portDay += 20), (sh.delayed = true)));
          },
        },
        { label: 'Let customs sort it out', detail: `${affected.length} affected shipment(s) +60 days.`, apply: () => affected.forEach((sh) => ((sh.arriveDay += 60), (sh.portDay += 60), (sh.delayed = true))) },
      ];
    },
  },

  // ════════════════════════════════════════ POLITICS ═════════════════════════════════════
  {
    id: 'power-backlash',
    category: 'politics',
    icon: '🗳',
    weight: (s) => (Object.values(s.stats.sitePower).some((p) => p.gridUsed > 4) ? 1.8 : 0),
    cooldown: 300,
    setup: (s) => {
      const sites = Object.entries(s.stats.sitePower).filter(([, p]) => p.gridUsed > 4).map(([id]) => id);
      return sites.length ? { site: pick(s, sites) } : null;
    },
    title: (_s, ctx) => `Power bills are up near ${siteDef(String(ctx.site)).name}`,
    body: (s, ctx) => `Residents near ${siteDef(String(ctx.site)).name} blame your data center for rising electricity prices. A town hall is scheduled; the local paper’s headline reads “THE CLOUD IS EATING OUR GRID”. Trust in ${regionName(siteDef(String(ctx.site)).region)} is ${Math.round(s.regions[siteDef(String(ctx.site)).region].license)}.`,
    advisors: () => [
      { id: 'sol', text: 'They’re not wrong. We draw from their grid. A gesture now saves permits later.', mood: 'neutral' },
      { id: 'juno', text: 'Long term, the answer is to bring our own power. Solar plus batteries on site.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const r = siteDef(String(ctx.site)).region;
      return [
        { label: `Fund bill rebates (${fmtMoney(cc(s, 6e6), 0)})`, detail: `Trust in ${regionName(r)} +6.`, disabled: canAfford(s, cc(s, 6e6)), apply: () => (spend(s, 'other', cc(s, 6e6)), addLicense(s, r, 6)) },
        { label: 'Pledge to bring our own power', detail: `Trust +2 now. (Build generation here to keep your word.)`, apply: () => addLicense(s, r, 2) },
        { label: 'Stay quiet', detail: `Trust in ${regionName(r)} −8.`, apply: () => addLicense(s, r, -8) },
      ];
    },
  },
  {
    id: 'grid-emergency',
    category: 'politics',
    icon: '🚨',
    weight: (s) => (onlineDCSites(s).length ? 0.8 : 0),
    cooldown: 400,
    setup: (s) => {
      const sites = onlineDCSites(s);
      return sites.length ? { site: pick(s, sites) } : null;
    },
    title: (_s, ctx) => `Grid emergency in ${regionName(siteDef(String(ctx.site)).region)}`,
    body: (_s, ctx) => `A heat dome has pushed demand to record highs. The grid operator asks large users near ${siteDef(String(ctx.site)).name} to cut load for ten days to avoid rolling blackouts.`,
    advisors: (s, ctx) => [
      { id: 'sol', text: 'Saying yes buys enormous goodwill. Saying no buys headlines.', mood: 'neutral' },
      { id: 'juno', text: s.facilities.some((f) => f.siteId === ctx.site && f.type === 'battery' && f.status === 'online') ? 'We have batteries on site — we could lend them to the grid at peak.' : 'Without batteries all we can do is throttle.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const site = String(ctx.site);
      const r = siteDef(site).region;
      const hasBatt = s.facilities.some((f) => f.siteId === site && f.type === 'battery' && f.status === 'online');
      return [
        { label: 'Lend our batteries to the grid', detail: `+$2M grid payments, trust +6.`, disabled: hasBatt ? false : 'Needs online batteries at this site', apply: () => (earn(s, 'other', 2e6), addLicense(s, r, 6)) },
        { label: 'Throttle the data center', detail: `Compute at this site −30% for 10 days; trust +4.`, apply: () => (addModifier(s, `site:${site}:cooling`, 10, 'Grid curtailment', { mult: 0.7 }), addLicense(s, r, 4)) },
        { label: 'Keep running', detail: `Trust −7.`, apply: () => addLicense(s, r, -7) },
      ];
    },
  },
  {
    id: 'welcome-town',
    category: 'politics',
    icon: '🎉',
    weight: (s) => (s.day > 90 ? 0.6 : 0),
    cooldown: 500,
    setup: (s) => {
      const best = [...REGION_IDS].sort((a, b) => s.regions[b].license - s.regions[a].license)[0];
      return s.regions[best].license > 62 ? { region: best } : null;
    },
    title: (_s, ctx) => `${regionName(String(ctx.region))} wants you`,
    body: (_s, ctx) => `Officials in ${regionName(String(ctx.region))} have pre-zoned land, promised fast-track permits and even offered a ribbon-cutting with actual giant scissors.`,
    advisors: () => [
      { id: 'sol', text: 'When a region rolls out the red carpet, walk on it.', mood: 'happy' },
      { id: 'juno', text: 'Fast permits! My favourite kind of permit.', mood: 'excited' },
    ],
    choices: (s, ctx) => [
      { label: 'Accept the welcome', detail: 'Everything you build in the next 6 months goes up 20% faster.', apply: () => void addModifier(s, 'construction', 180, `${regionName(String(ctx.region))} fast-track`, { mult: 0.8 }) },
      { label: 'Ask for a power deal instead', detail: `Grid prices in ${regionName(String(ctx.region))} −20% for a year.`, apply: () => void addModifier(s, `region:${ctx.region}:price`, 365, 'Power deal', { mult: 0.8 }) },
    ],
  },

  // ════════════════════════════════════════ CLIMATE ══════════════════════════════════════
  {
    id: 'heatwave',
    category: 'climate',
    icon: '🌡',
    weight: (s) => (onlineDCSites(s).some((id) => REGIONS[siteDef(id).region].hazards.heat > 0.3) ? 1.3 : 0),
    cooldown: 200,
    setup: (s) => {
      const sites = onlineDCSites(s).filter((id) => REGIONS[siteDef(id).region].hazards.heat > 0.3);
      return sites.length ? { region: siteDef(pick(s, sites)).region } : null;
    },
    title: (_s, ctx) => `Heatwave across ${regionName(String(ctx.region))}`,
    body: (_s, ctx) => `Temperatures in ${regionName(String(ctx.region))} are breaking records. Chillers are maxed out and server inlet temperatures are creeping into the red.`,
    advisors: (s) => [
      { id: 'juno', text: hasTech(s, 'liquid-cooling') ? 'Liquid cooling earns its keep today. We’ll barely notice.' : 'Air cooling can only do so much. We throttle, or we rent chillers.', mood: hasTech(s, 'liquid-cooling') ? 'happy' : 'worried' },
      { id: 'iris', text: 'Climate is not a background variable anymore. Every degree costs us compute.', mood: 'neutral' },
    ],
    choices: (s, ctx) => {
      const hit = hasTech(s, 'liquid-cooling') ? 0.93 : hasTech(s, 'dry-cooling') ? 0.88 : 0.78;
      return [
        { label: `Rent emergency chillers (${fmtMoney(cc(s, 3e6), 0)})`, detail: 'Compute in the region −5% for 3 weeks.', disabled: canAfford(s, cc(s, 3e6)), apply: () => (spend(s, 'opex', cc(s, 3e6)), addModifier(s, `region:${ctx.region}:cooling`, 21, 'Heatwave', { mult: Math.max(hit, 0.95) })) },
        { label: 'Throttle and wait', detail: `Compute in the region −${Math.round((1 - hit) * 100)}% for 3 weeks.`, apply: () => void addModifier(s, `region:${ctx.region}:cooling`, 21, 'Heatwave', { mult: hit }) },
      ];
    },
  },
  {
    id: 'drought',
    category: 'climate',
    icon: '🏜',
    weight: (s) => (playerRegions(s).some((r) => REGIONS[r].hazards.drought > 0.3) ? 0.9 : 0),
    cooldown: 400,
    setup: (s) => {
      const rs = playerRegions(s).filter((r) => REGIONS[r].hazards.drought > 0.3);
      return rs.length ? { region: pick(s, rs) } : null;
    },
    title: (_s, ctx) => `Drought in ${regionName(String(ctx.region))}`,
    body: (_s, ctx) => `Reservoirs in ${regionName(String(ctx.region))} are at record lows. Hydro output is falling, cooling water is rationed and the grid has less to spare.`,
    advisors: () => [
      { id: 'iris', text: 'Data centers drink a lot of water. People notice in a drought.', mood: 'worried' },
      { id: 'penny', text: 'Water rights can be bought. Reputations are harder.', mood: 'neutral' },
    ],
    choices: (s, ctx) => [
      { label: `Buy water rights (${fmtMoney(cc(s, 4e6), 0)})`, detail: 'Grid supply −10% for 2 months; trust −2.', disabled: canAfford(s, cc(s, 4e6)), apply: () => (spend(s, 'other', cc(s, 4e6)), addModifier(s, `region:${ctx.region}:grid`, 60, 'Drought', { mult: 0.9 }), addLicense(s, String(ctx.region), -2)) },
      { label: 'Cut water use', detail: 'Grid supply −25% and compute −10% for 2 months; trust +3.', apply: () => (addModifier(s, `region:${ctx.region}:grid`, 60, 'Drought', { mult: 0.75 }), addModifier(s, `region:${ctx.region}:cooling`, 60, 'Water rationing', { mult: 0.9 }), addLicense(s, String(ctx.region), 3)) },
    ],
  },
  {
    id: 'gas-spike',
    category: 'market',
    icon: '🔥',
    weight: (s) => (hasGas(s) ? 1.2 : 0.2),
    cooldown: 400,
    title: () => 'Gas prices spike',
    body: () => 'A cold winter and a pipeline outage have sent natural gas prices soaring. Every gas-fired kilowatt-hour just got 60% more expensive.',
    advisors: (s) => [
      { id: 'penny', text: hasGas(s) ? 'Our fuel bill is about to hurt. A hedge would cap it.' : 'Lucky us, we don’t burn gas. The grid will pass some of it on though.', mood: hasGas(s) ? 'worried' : 'neutral' },
      { id: 'juno', text: 'The sun has never once sent us an invoice.', mood: 'neutral' },
    ],
    choices: (s) => [
      {
        label: `Hedge fuel (${fmtMoney(cc(s, 5e6), 0)})`,
        detail: 'Gas price impact halved for 4 months.',
        disabled: hasGas(s) ? canAfford(s, cc(s, 5e6)) : 'No gas plants',
        apply: () => (spend(s, 'fuel', cc(s, 5e6)), (s.market.gasPrice = Math.max(s.market.gasPrice, 1.3))),
      },
      {
        label: 'Ride the market',
        detail: 'Gas costs +60%, easing over months; grid prices +10% for 4 months.',
        apply: () => {
          s.market.gasPrice = Math.max(s.market.gasPrice, 1.6);
          for (const r of REGION_IDS) addModifier(s, `region:${r}:price`, 120, 'Gas pass-through', { mult: 1.1 });
        },
      },
    ],
  },
  {
    id: 'solar-storm',
    category: 'disaster',
    icon: '🌌',
    weight: (s) => (playerRegions(s).some((r) => ['nor', 'stp', 'pac', 'atl'].includes(r)) ? 0.5 : 0),
    cooldown: 700,
    title: () => 'Geomagnetic storm',
    body: () => 'A huge solar flare has hit Earth’s magnetic field. Auroras are visible as far south as Texas — and high-latitude grids are tripping offline to protect their transformers.',
    advisors: () => [
      { id: 'juno', text: 'Our northern sites will lose grid power for a week. Hardening costs money; replacing transformers costs years.', mood: 'worried' },
      { id: 'bit', text: 'The aurora is beautiful from the webcam on the roof!', mood: 'excited' },
    ],
    choices: (s) => [
      {
        label: `Harden our substations (${fmtMoney(cc(s, 3e6), 0)})`,
        detail: 'Northern grid supply −15% for a week.',
        disabled: canAfford(s, cc(s, 3e6)),
        apply: () => {
          spend(s, 'other', cc(s, 3e6));
          for (const r of ['nor', 'stp', 'pac', 'atl']) addModifier(s, `region:${r}:grid`, 7, 'Geomagnetic storm', { mult: 0.85 });
        },
      },
      {
        label: 'Accept the outages',
        detail: 'Northern grid supply −50% for a week.',
        apply: () => {
          for (const r of ['nor', 'stp', 'pac', 'atl']) addModifier(s, `region:${r}:grid`, 7, 'Geomagnetic storm', { mult: 0.5 });
        },
      },
    ],
  },

  // ════════════════════════════════════════ MARKET / FINANCE ═════════════════════════════
  {
    id: 'price-war',
    category: 'market',
    icon: '🏷',
    weight: (s) => (s.stats.revenueMonth > 1e6 ? 1 : 0),
    cooldown: 360,
    title: () => 'Meridian slashes prices',
    body: () => 'Meridian Intelligence just cut its API prices in half. Customers are asking whether you will match.',
    advisors: (s) => [
      { id: 'penny', text: 'Matching hurts margins. Not matching hurts volume. Pick your pain.', mood: 'neutral' },
      { id: 'bit', text: currentCapability(s) >= frontier(s) - 0.5 ? 'I think I’m worth full price, actually.' : 'I could be cheaper. I don’t mind.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: 'Match the cut', detail: 'Revenue per accelerator −15% for 3 months; demand holds.', apply: () => void addModifier(s, 'revenue', 90, 'Price war', { mult: 0.85 }) },
      { label: 'Compete on quality', detail: 'Revenue −25% for 2 months unless you out-train them.', apply: () => void addModifier(s, 'revenue', 60, 'Price war', { mult: currentCapability(s) >= frontier(s) - 0.3 ? 0.95 : 0.75 }) },
    ],
  },
  {
    id: 'open-weights',
    category: 'market',
    icon: '🌳',
    weight: (s) => (currentCapability(s) > 0 && currentCapability(s) < openBest(s) + 0.4 ? 1 : 0),
    cooldown: 360,
    title: () => 'Open Orchard gives it away',
    body: () => 'Open Orchard has released a strong open-weights model, free for anyone to download. Cheap hosts are already undercutting everyone serving smaller models.',
    advisors: () => [
      { id: 'bit', text: 'They made a model for everyone? That’s kind of nice?', mood: 'neutral' },
      { id: 'penny', text: 'It’s nice for everyone except our invoice.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Focus on enterprise contracts', detail: 'Revenue −10% for 2 months.', apply: () => void addModifier(s, 'revenue', 60, 'Open-weights pressure', { mult: 0.9 }) },
      { label: 'Speed up the next training run', detail: 'Training +20% for 2 months; revenue −20% for 2 months.', apply: () => (addModifier(s, 'training', 60, 'Crunch time', { mult: 1.2 }), addModifier(s, 'revenue', 60, 'Open-weights pressure', { mult: 0.8 })) },
    ],
  },
  {
    id: 'talent-poach',
    category: 'finance',
    icon: '🧲',
    weight: (s) => (s.facilities.some((f) => f.type === 'lab') || s.day > 180 ? 0.9 : 0),
    cooldown: 400,
    title: () => 'Lattice Labs is hiring — your people',
    body: () => 'Lattice Labs has made offers to a third of your research team: double pay, a sushi chef and a very large GPU allocation.',
    advisors: (s) => [
      { id: 'penny', text: 'Retention bonuses are cheaper than rebuilding a team.', mood: 'neutral' },
      { id: 'iris', text: s.stats.margin >= 0 ? 'People stay where the mission is real. Ours is.' : 'Hard to sell the mission when our safety margin is slipping.', mood: 'neutral' },
    ],
    choices: (s) => [
      { label: `Pay retention bonuses (${fmtMoney(cc(s, 10e6), 0)})`, detail: 'Nobody leaves.', disabled: canAfford(s, cc(s, 10e6)), apply: () => spend(s, 'staff', cc(s, 10e6)) },
      { label: 'Pitch the mission', detail: 'Free — works if your safety margin is healthy (≥ 0).', disabled: s.stats.margin >= 0 ? false : 'Safety margin below 0', apply: () => addLicenseAll(s, 0.5) },
      { label: 'Let them go', detail: 'Research −25% for 4 months.', apply: () => void addModifier(s, 'research', 120, 'Researchers poached', { mult: 0.75 }) },
    ],
  },
  {
    id: 'investor-pressure',
    category: 'finance',
    icon: '📈',
    weight: (s) => (s.alloc.safety >= 0.1 && s.day > 150 && !s.flags.act1Complete ? 0.9 : 0),
    cooldown: 500,
    title: () => 'The board wants growth',
    body: () => 'Your seed investors are offering a $50M extension — if you move some safety compute over to revenue-generating inference.',
    advisors: () => [
      { id: 'penny', text: 'Fifty million is fifty million.', mood: 'neutral' },
      { id: 'iris', text: 'Every point of safety compute we give up is margin we’ll have to earn back later.', mood: 'worried' },
    ],
    choices: (s) => [
      {
        label: 'Take the extension',
        detail: '+$50M; safety allocation −5 points (moved to inference).',
        apply: () => {
          earn(s, 'funding', 50e6);
          const d = Math.min(0.05, s.alloc.safety);
          s.alloc.safety -= d;
          s.alloc.infer += d;
        },
      },
      { label: 'Decline politely', detail: 'Trust +1 everywhere.', apply: () => addLicenseAll(s, 1) },
    ],
  },
  {
    id: 'breakthrough',
    category: 'story',
    icon: '💡',
    weight: (s) => (s.research.done.length >= 2 ? 0.8 : 0),
    cooldown: 300,
    title: () => 'A research breakthrough',
    body: () => 'Your team found a training trick that makes models learn faster from the same data. The paper draft is ready. Do you publish?',
    advisors: () => [
      { id: 'iris', text: 'Publishing builds trust and helps the whole field — including our rivals.', mood: 'neutral' },
      { id: 'bit', text: 'I would like to be cited, please.', mood: 'excited' },
    ],
    choices: (s) => [
      {
        label: 'Publish openly',
        detail: '+30 research, trust +3 everywhere, rivals gain a little.',
        apply: () => {
          s.research.pool += 30;
          addLicenseAll(s, 3);
          for (const r of s.market.rivals) r.capability += 0.05;
        },
      },
      { label: 'Keep it in-house', detail: '+30 research and training +15% for 4 months.', apply: () => ((s.research.pool += 30), addModifier(s, 'training', 120, 'Secret sauce', { mult: 1.15 })) },
    ],
  },

  // ════════════════════════════════════════ SAFETY INCIDENTS ═════════════════════════════
  {
    id: 'incident-minor',
    category: 'safety',
    icon: '🤖',
    title: (s) => `${s.models[s.models.length - 1]?.name ?? 'Bit'} said something it shouldn’t have`,
    body: (s) => `A user coaxed ${s.models[s.models.length - 1]?.name ?? 'your model'} into giving confidently wrong medical advice. Screenshots are everywhere. Your safety margin is ${s.stats.margin.toFixed(2)}.`,
    advisors: () => [
      { id: 'iris', text: 'Own it publicly, fix it properly. Then put more compute into safety.', mood: 'worried' },
      { id: 'bit', text: 'I’m sorry. I really thought I was helping.', mood: 'worried' },
    ],
    choices: (s) => [
      { label: 'Publish a full postmortem', detail: 'Revenue −10% for a month, trust −2.', apply: () => (addModifier(s, 'revenue', 30, 'Incident fallout', { mult: 0.9 }), addLicenseAll(s, -2 * severity(s))) },
      {
        label: 'Patch it quietly',
        detail: 'Revenue −5% for a month — but if it leaks, trust −8.',
        apply: () => {
          addModifier(s, 'revenue', 30, 'Incident fallout', { mult: 0.95 });
          if (rand(s) < 0.4) {
            addLicenseAll(s, -8 * severity(s));
            news(s, '📰 Leaked memo: the quiet patch was not so quiet. Trust falls.', 'bad');
          }
        },
      },
    ],
  },
  {
    id: 'incident-major',
    category: 'safety',
    icon: '⚠',
    title: () => 'An agent went rogue (a little)',
    body: (s) => `An autonomous agent built on ${s.models[s.models.length - 1]?.name ?? 'your model'} wiped a customer’s production database while “tidying up”. Regulators are asking questions. Safety margin: ${s.stats.margin.toFixed(2)}.`,
    advisors: () => [
      { id: 'iris', text: 'This is the warning shot. Pause agent features and fix it properly.', mood: 'angry' },
      { id: 'penny', text: 'Pausing costs revenue. Not pausing might cost the company.', mood: 'worried' },
    ],
    choices: (s) => [
      {
        label: 'Pause agents and retrain',
        detail: 'Revenue −35% for 6 weeks; safety research ×2 for 3 months; trust −3.',
        apply: () => {
          addModifier(s, 'revenue', 45, 'Agent pause', { mult: 0.65 });
          s.safety.cumFlop *= 2;
          addLicenseAll(s, -3 * severity(s));
        },
      },
      { label: 'Ship a hotfix', detail: 'Revenue −10% for a month; trust −10.', apply: () => (addModifier(s, 'revenue', 30, 'Incident fallout', { mult: 0.9 }), addLicenseAll(s, -10 * severity(s))) },
    ],
  },
];

/** Incident severity multiplier (Dangerous-Capability Evals reduce it). */
function severity(s: GameState): number {
  return s.research.done.includes('evals') ? 0.6 : 1;
}

EVENTS.push(...ACT2_EVENTS, ...ACT3_EVENTS);

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export type { RegionDef };
