/**
 * Act III: the Kardashev Project. The treasury and dues, partners and their bids, the projects they
 * build, missions, compute access, Legitimacy and political capital, plus the Steward's actions.
 * Conflict of interest lives here too: your own company bids, and awarding it costs Legitimacy.
 */
import {
  ACCESS0,
  CHARTER,
  CONTRACT_KINDS,
  ECON,
  HVDC_BY_ID,
  MISSION_BY_ID,
  MISSIONS,
  missionProgress,
  PARTNERS,
  WEALTH,
  whereName,
  YOU,
  type ContractKindDef,
  type Traits,
} from '../content/charter';
import { REGIONS } from '../content/regions';
import { LAUNCH_SITES, SITE_BY_ID } from '../content/sites';
import { HALLS } from '../content/facilities';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import type { Bid, CharterLedger, ContractKind, ContractSize, GameState, Project, Tender } from './types';
import { clamp, fmtMoney, fmtMW, monthKey, monthLabelOfKey, news, nextId, pick, rand, randInt, yearsElapsed } from './core';
import { addModifier, modMult, techMult } from './effects';
import { earn, spend } from './economy';
import { queueEvent, scheduleEvent } from './events';
import { facilityIT, facilityMW, DAYS_PER_MONTH, alignmentOf } from './model';
import { addRelation, addRelationAll, blocIT } from './politics';
import { emptyCharterLedger } from './charterInit';
import { FUSION_DESIGNS, PLANET, SUPERGRID_BY_ID } from '../content/planet';
import { fleetBlocked, fleetCF, fleetValuePerGW, pilotBlocked, resolvePilot, startPilot } from './fusion';
import { canLaunch, cleanUp, moonStage, orbitGW, spaceCostMult } from './orbit';
import { aiAccessBonus } from './airegions';

export type Result = { ok: true } | { ok: false; reason: string };
import { plantSeed, seedOwner, seedPlaces } from './foundries';
import { completeSurvey, unknownInReach } from './asteroids';

const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

// ════════════════════════════════════════ HELPERS ════════════════════════════════════════
export const act3 = (s: GameState) => (s.act ?? 1) >= 3 && !!s.charter;
const passed = (s: GameState, id: string) => !!s.charter?.council.passed.includes(id);

export function chSpend(s: GameState, cat: keyof CharterLedger, amount: number): void {
  const c = s.charter!;
  c.budget -= amount;
  c.month[cat] += amount;
}

export function chEarn(s: GameState, cat: 'dues' | 'income', amount: number): void {
  const c = s.charter!;
  c.budget += amount;
  c.month[cat] += amount;
}

export function addLegitimacy(s: GameState, d: number): void {
  const c = s.charter;
  if (!c) return;
  c.legitimacy = clamp(c.legitimacy + (d > 0 ? d * techMult(s, 'legitGain') : d), 0, 100);
}

export function addCapital(s: GameState, d: number): void {
  const c = s.charter;
  if (!c) return;
  c.capital = clamp(c.capital + d, 0, 100);
}

export function addPartnerRel(s: GameState, id: string, d: number): void {
  const p = s.charter?.partners[id];
  if (!p) return;
  p.rel = clamp(p.rel + d, 0, 100);
}

/** Your company's traits as a bidder (its safety record sets its ethics). */
export function yourTraits(s: GameState): Traits {
  const m = s.stats.margin;
  return { rel: 4, speed: 4, cost: 4, ambition: 4, ethics: m >= 0.25 ? 5 : m >= 0 ? 4 : m >= -0.25 ? 3 : 2 };
}

export function traitsOf(s: GameState, id: string): Traits {
  return id === YOU ? yourTraits(s) : PARTNERS[id]?.traits ?? { rel: 3, speed: 3, cost: 3, ambition: 3, ethics: 3 };
}

export function partnerName(s: GameState, id: string): string {
  return id === YOU ? s.company.name : PARTNERS[id]?.name ?? id;
}

/** How many contracts a partner can run at once. */
export const partnerCapacity = (t: Traits) => 2 + Math.floor(t.ambition / 2);

export function activeProjects(s: GameState, partner: string): number {
  return (s.charter?.projects ?? []).filter((p) => p.builder === partner && p.status === 'building').length;
}

// ════════════════════════════════════════ PRICING ════════════════════════════════════════
const yearsSince2035 = (s: GameState) => Math.max(0, yearsElapsed(s.day) - 8);

/** Units of the thing being built at a size. */
export const unitsOf = (def: ContractKindDef, size: ContractSize) => def.sizes[size - 1];

/** Total project value of a contract (the Charter pays `share` of it). */
export function contractValue(s: GameState, kind: ContractKind, size: ContractSize, where: string, opt?: string): number {
  const def = CONTRACT_KINDS[kind];
  let v = def.value * unitsOf(def, size) * Math.pow(def.yearly, yearsSince2035(s));
  if (kind === 'hvdc') v *= HVDC_BY_ID[where]?.km ?? 2000;
  // Act IV
  if (kind === 'link') v *= SUPERGRID_BY_ID[where]?.km ?? 3000;
  if (kind === 'fpilot') v = FUSION_DESIGNS[where as keyof typeof FUSION_DESIGNS]?.pilot ?? 30e9;
  if (kind === 'ffleet') v = unitsOf(def, size) * fleetValuePerGW(s, (opt ?? 'tokamak') as keyof typeof FUSION_DESIGNS);
  if (s.planet && def.cat === 'space' && (def.stage || def.vstage !== undefined)) v *= spaceCostMult(s);
  if (kind === 'odc' || kind === 'sps') v *= moonStage(s) >= 2 ? 0.85 : 1;
  if (where === 'mega-northsea') v *= 1.25;
  if (where === 'mega-siberia') v *= 1.15;
  if (def.cat === 'space' && passed(s, 'orbital-commons')) v *= 0.8;
  if (kind === 'launch') v *= modMult(s, 'charter:launch-study');
  return v * techMult(s, 'charterCost');
}

/** The Charter's share of a contract before bids (the "estimate" the UI shows). */
export function contractEstimate(s: GameState, kind: ContractKind, size: ContractSize, where: string, opt?: string): { value: number; share: number; days: number } {
  const def = CONTRACT_KINDS[kind];
  const value = contractValue(s, kind, size, where, opt);
  let days = def.days[size - 1];
  if (kind === 'fpilot') days = FUSION_DESIGNS[where as keyof typeof FUSION_DESIGNS]?.pilotDays ?? days;
  if (kind === 'ffleet') days /= FUSION_DESIGNS[(opt ?? 'tokamak') as keyof typeof FUSION_DESIGNS]?.speed ?? 1;
  return { value, share: value * def.share, days: Math.round(days * techMult(s, 'charterSpeed') * (def.cat === 'space' && passed(s, 'orbital-commons') ? 0.8 : 1)) };
}

/** What each partner would bid, before noise (also used by the UI to explain traits). */
function makeBid(s: GameState, t: Tender, partner: string): Bid {
  const tr = traitsOf(s, partner);
  const est = contractEstimate(s, t.kind, t.size, t.where, t.opt);
  const rel = partner === YOU ? 50 : s.charter!.partners[partner]?.rel ?? 50;
  let price = est.share * (1.25 - 0.08 * tr.cost) * (rel >= 70 ? 0.92 : rel < 35 ? 1.06 : 1) * (0.92 + rand(s) * 0.16);
  let days = est.days * (1.3 - 0.09 * tr.speed) * (1 - 0.03 * (tr.ambition - 3)) * (0.93 + rand(s) * 0.14);
  if (partner === 'veldt') price *= 1.3; // the only toolmaker on Earth
  if (partner === 'orchard') price *= 0.92;
  if (partner === 'kestrel') price *= 0.95;
  if (partner === 'stratum') days *= 0.88;
  if (partner === 'meridian') days *= 0.92;
  if (partner === 'brightwater') days *= 1.08;
  if (partner === YOU) price *= 0.95;
  const def = PARTNERS[partner];
  const pitch = partner === YOU ? 'Your own company’s bid. Everyone will be watching how you judge it.' : def ? pick(s, def.pitches) : '';
  return { partner, price: Math.round(price / 1e6) * 1e6, days: Math.max(60, Math.round(days)), pitch };
}

/** Best-value score of a bid: lower is better (price, time and reliability). */
export function bidScore(s: GameState, t: Tender, b: Bid): number {
  const est = contractEstimate(s, t.kind, t.size, t.where, t.opt);
  const tr = traitsOf(s, b.partner);
  return (b.price / Math.max(1, est.share)) * Math.sqrt(b.days / Math.max(1, est.days)) * (1.2 - 0.05 * tr.rel);
}

// ════════════════════════════════════════ WHO CAN BID ════════════════════════════════════════
/** Whether your own company has the know-how to bid on this kind. */
export function youCanBid(s: GameState, kind: ContractKind): boolean {
  if (!CONTRACT_KINDS[kind].bidders.includes(YOU)) return false;
  if (s.finance.cash < 0) return false;
  // Act IV: a company you sold or handed over isn't yours to bid with
  if (s.planet?.company === 'sell' || s.planet?.company === 'utility') return false;
  const nameplate = (types: string[]) => s.facilities.filter((f) => types.includes(f.type) && f.status === 'online').reduce((a, f) => a + facilityMW(f), 0);
  switch (kind) {
    case 'solar': return nameplate(['solar']) >= 300;
    case 'wind': return nameplate(['wind']) >= 200;
    case 'pkg': return s.facilities.some((f) => f.type === 'packaging' && f.status === 'online');
    case 'compute': return s.stats.itMW >= 100;
    case 'cable': return s.network.own.length > 0 || s.network.leases.length > 0;
    case 'orbital': return s.models.length >= 4;
    case 'odc': return s.stats.itMW >= 500;
    case 'evals':
    case 'interp': return s.alloc.safety >= 0.05;
    default: return true;
  }
}

/** Partners (not your company) able and willing to bid on this kind right now. */
export function partnerBidders(s: GameState, kind: ContractKind, where = '', opt?: string): string[] {
  return eligible(s, kind, where, opt).filter((x) => x !== YOU);
}

/** Who bids: the kind's usual bidders, plus (Act IV) the fusion design's own builder. */
export function biddersFor(kind: ContractKind, where: string, opt?: string): string[] {
  const def = CONTRACT_KINDS[kind];
  if (kind === 'fpilot') return [FUSION_DESIGNS[where as keyof typeof FUSION_DESIGNS]?.partner ?? 'sunforge'];
  if (kind === 'ffleet') return [FUSION_DESIGNS[(opt ?? 'tokamak') as keyof typeof FUSION_DESIGNS]?.partner ?? 'sunforge', ...def.bidders];
  return def.bidders;
}

function eligible(s: GameState, kind: ContractKind, where = '', opt?: string): string[] {
  const out: string[] = [];
  const list = biddersFor(kind, where, opt);
  for (const id of list) {
    if (id === YOU) {
      if (youCanBid(s, kind)) out.push(id);
      continue;
    }
    const p = s.charter!.partners[id];
    const sole = list.filter((x) => x !== YOU).length === 1;
    if (!p || p.rel < (sole ? 10 : 25)) continue;
    if (activeProjects(s, id) >= partnerCapacity(PARTNERS[id].traits)) continue;
    out.push(id);
  }
  return out;
}

/** Why a contract can't be posted here right now, or null. */
export function canPost(s: GameState, kind: ContractKind, size: ContractSize, where: string, opt?: string): string | null {
  const c = s.charter;
  if (!c) return 'The Charter doesn’t exist yet.';
  const def = CONTRACT_KINDS[kind];
  if (c.phase < def.cphase) return `Opens in phase ${def.cphase}.`;
  if (def.stage !== undefined) {
    if (!s.planet) return 'Opens in Act IV.';
    if (s.planet.stage < def.stage) return `Opens in stage ${def.stage}.`;
  }
  if (def.vstage !== undefined) {
    if (!s.system) return 'Opens in Act V.';
    if (s.system.stage < def.vstage) return `Opens in stage ${def.vstage}.`;
    if (s.system.typeI && def.cat === 'space' && kind === 'mercury') return 'Mercury is already surveyed.';
  }
  if (def.fixed && size !== 1) return 'This contract comes in one size.';
  switch (def.where) {
    case 'mega': {
      const site = SITE_BY_ID[where];
      if (!site || site.kind !== 'mega') return 'Pick a megaproject site.';
      if (!site.mega?.includes(kind) && kind !== 'ffleet' && kind !== 'dac') return `${site.name} can’t host this.`;
      break;
    }
    case 'sgroute':
      if (!SUPERGRID_BY_ID[where]) return 'Pick a supergrid route.';
      if (c.projects.some((p) => p.kind === 'link' && p.where === where && p.status !== 'cancelled')) return 'That route already has a link.';
      if (s.planet && s.planet.powers !== 'planetary' && c.capital < PLANET.approvalCapital) return `Your powers are limited: the Council has to approve each link (${PLANET.approvalCapital} political capital).`;
      break;
    case 'design': {
      if (!FUSION_DESIGNS[where as keyof typeof FUSION_DESIGNS]) return 'Pick a fusion design.';
      const why = pilotBlocked(s, where as keyof typeof FUSION_DESIGNS);
      if (why) return why;
      break;
    }
    case 'route':
      if (!HVDC_BY_ID[where]) return 'Pick an HVDC route.';
      if (c.projects.some((p) => p.kind === 'hvdc' && p.where === where && p.status !== 'cancelled')) return 'That route already has a link.';
      break;
    case 'launch':
      if (!LAUNCH_SITES.some((x) => x.id === where)) return 'Pick a launch site.';
      if (c.projects.some((p) => p.kind === 'launch' && p.status !== 'cancelled')) return 'The Charter already has a launch complex.';
      break;
    case 'region':
      if (!REGION_IDS.includes(where as RegionId)) return 'Pick a bloc.';
      if (c.council.walkouts[where as RegionId]) return `${REGIONS[where as RegionId].name} has walked out of the Charter.`;
      break;
    case 'global':
      break;
    case 'space':
      if (!seedPlaces(s).some((p) => p.id === where)) return 'Pick the Moon, a Lagrange yard or an asteroid the Charter may work.';
      break;
  }
  if (kind === 'orbital' || kind === 'spacesolar') {
    if (!c.projects.some((p) => p.kind === 'launch' && p.status === 'done')) return 'Needs a finished launch complex.';
    if (c.projects.some((p) => p.kind === kind && p.status !== 'cancelled')) return 'Already under way.';
  }
  if (kind === 'fusion' && c.projects.some((p) => p.kind === 'fusion' && p.status !== 'cancelled')) return 'Sunforge already has its grant.';
  // Act IV
  if (kind === 'ffleet') {
    if (!opt || !FUSION_DESIGNS[opt as keyof typeof FUSION_DESIGNS]) return 'Pick a fusion design.';
    const why = fleetBlocked(s, opt as keyof typeof FUSION_DESIGNS, unitsOf(def, size));
    if (why) return why;
  }
  if ((kind === 'odc' || kind === 'sps' || kind === 'cleanup' || kind === 'moonbase') && !canLaunch(s)) return 'Needs a launch complex or a spaceport first.';
  const liveKind = (k: ContractKind) => c.projects.some((p) => p.kind === k && p.status !== 'cancelled');
  const doneKind = (k: ContractKind) => c.projects.some((p) => p.kind === k && p.status === 'done');
  if (kind === 'moonbase' && liveKind('moonbase')) return 'The Moon outpost is already under way.';
  if (kind === 'moonmine' && (!doneKind('moonbase') || liveKind('moonmine'))) return liveKind('moonmine') ? 'The lunar mine is already under way.' : 'Needs the Moon outpost first.';
  if (kind === 'massdriver' && (!doneKind('moonmine') || liveKind('massdriver'))) return liveKind('massdriver') ? 'The mass driver is already under way.' : 'Needs the lunar mine first.';
  // Act V
  if (kind === 'survey') {
    if (!unknownInReach(s).length) return (s.system?.stage ?? 0) < 2 ? 'Every near-Earth asteroid in reach is mapped; the main belt opens in stage 2.' : 'Every asteroid in reach is mapped.';
    if (liveKind('survey') && c.projects.some((p) => p.kind === 'survey' && p.status === 'building')) return 'A survey is already under way.';
  }
  if (kind === 'mercury' && liveKind('mercury')) return 'The Mercury survey is already under way.';
  if ((kind === 'seed' || kind === 'habitat' || kind === 'harden' || kind === 'mercury' || kind === 'survey') && !canLaunch(s)) return 'Needs a launch complex or a spaceport first.';
  if (kind === 'seed' && c.projects.filter((p) => p.kind === 'seed' && p.status === 'building').length >= 4) return 'Four seeds are already on their way.';
  if (c.tenders.some((t) => t.kind === kind && t.where === where && (t.opt ?? '') === (opt ?? ''))) return 'A tender for this is already open.';
  if (c.tenders.length >= 8) return 'Eight tenders are already open. Award or close one first.';
  if (!eligible(s, kind, where, opt).length) return 'No partner is able or willing to bid right now.';
  return null;
}

// ════════════════════════════════════════ ACTIONS ════════════════════════════════════════
export function postTender(s: GameState, kind: ContractKind, size: ContractSize, where: string, opt?: string): Result {
  const why = canPost(s, kind, size, where, opt);
  if (why) return fail(why);
  const c = s.charter!;
  const def = CONTRACT_KINDS[kind];
  const region: RegionId =
    def.where === 'region' ? (where as RegionId)
    : def.where === 'route' ? HVDC_BY_ID[where].from
    : def.where === 'sgroute' ? SUPERGRID_BY_ID[where].from
    : def.where === 'design' ? PARTNERS[FUSION_DESIGNS[where as keyof typeof FUSION_DESIGNS].partner]?.home ?? 'eur'
    : def.where === 'global' || def.where === 'space' ? 'eur'
    : SITE_BY_ID[where].region;
  if (kind === 'link' && s.planet && s.planet.powers !== 'planetary') addCapital(s, -PLANET.approvalCapital);
  const bidders = eligible(s, kind, where, opt);
  // the four keenest (relationship, then a little luck); your company always gets a look in
  const ranked = bidders
    .filter((x) => x !== YOU)
    .map((id) => ({ id, w: (c.partners[id]?.rel ?? 50) + rand(s) * 30 }))
    .sort((a, b) => b.w - a.w)
    .slice(0, bidders.includes(YOU) ? 3 : 4)
    .map((x) => x.id);
  if (bidders.includes(YOU)) ranked.push(YOU);
  const t: Tender = {
    id: nextId(s, 'tn'),
    kind,
    size,
    where,
    region,
    value: contractValue(s, kind, size, where, opt),
    postedDay: s.day,
    closesDay: s.day + CHARTER.tenderDays,
    bids: [],
    pending: ranked.map((partner) => ({ partner, day: s.day + randInt(s, 2, 14) })),
    opt,
  };
  c.tenders.push(t);
  news(s, `📜 Tender posted: ${def.name}${opt && FUSION_DESIGNS[opt as keyof typeof FUSION_DESIGNS] ? ` (${FUSION_DESIGNS[opt as keyof typeof FUSION_DESIGNS].name})` : ''} (${sizeText(def, size)}) at ${whereName(where)}. ${ranked.length} bidders interested.`, 'info');
  return OK;
}

export const sizeText = (def: ContractKindDef, size: ContractSize) => (def.fixed ? '' : `${def.sizes[size - 1].toLocaleString()} ${def.unit}`.trim());

export function closeTender(s: GameState, tenderId: string): Result {
  const c = s.charter;
  const t = c?.tenders.find((x) => x.id === tenderId);
  if (!c || !t) return fail('No such tender.');
  c.tenders = c.tenders.filter((x) => x !== t);
  for (const b of t.bids) if (b.partner !== YOU) addPartnerRel(s, b.partner, -2);
  news(s, `📜 Tender withdrawn: ${CONTRACT_KINDS[t.kind].name} at ${whereName(t.where)}.`);
  return OK;
}

/** Legitimacy it would cost to award this bid (conflict of interest), 0 for partners. */
export function conflictCost(s: GameState, t: Tender, b: Bid): number {
  if (b.partner !== YOU) return 0;
  const mine = bidScore(s, t, b);
  const others = t.bids.filter((x) => x.partner !== YOU).map((x) => bidScore(s, t, x));
  const best = others.length ? Math.min(...others) : Infinity;
  let hit = mine <= best * 0.97 ? 1.5 : Math.min(20, 5 + 25 * Math.max(0, mine / Math.max(1e-9, best) - 1));
  if (!others.length) hit = 1;
  if (s.flags.dualClass) hit *= 1.25;
  if (s.charter!.blindTrust) hit *= 0.3;
  return Math.round(hit * 10) / 10;
}

export function canAward(s: GameState, tenderId: string, bidIndex: number): string | null {
  const c = s.charter;
  const t = c?.tenders.find((x) => x.id === tenderId);
  if (!c || !t) return 'No such tender.';
  const b = t.bids[bidIndex];
  if (!b) return 'No such bid.';
  const down = b.price * CHARTER.upfront;
  if (c.budget < down) return `The treasury can’t cover the ${fmtMoney(down)} down payment.`;
  return null;
}

export function awardBid(s: GameState, tenderId: string, bidIndex: number): Result {
  const why = canAward(s, tenderId, bidIndex);
  if (why) return fail(why);
  const c = s.charter!;
  const t = c.tenders.find((x) => x.id === tenderId)!;
  const b = t.bids[bidIndex];
  const def = CONTRACT_KINDS[t.kind];
  const conflict = conflictCost(s, t, b);
  const down = b.price * CHARTER.upfront;
  chSpend(s, 'payments', down);
  if (b.partner === YOU) earn(s, 'revenue', down * CHARTER.yourMargin);
  const p: Project = {
    id: nextId(s, 'cp'),
    kind: t.kind,
    size: t.size,
    where: t.where,
    region: t.region,
    builder: b.partner,
    value: t.value,
    price: b.price,
    paid: down,
    arrears: 0,
    startDay: s.day,
    days: b.days,
    promised: b.days,
    progress: 0,
    status: 'building',
    troubles: 0,
    gw: def.cat === 'energy' ? unitsOf(def, t.size) : t.kind === 'ffleet' ? unitsOf(def, t.size) * fleetCF(s, (t.opt ?? 'tokamak') as keyof typeof FUSION_DESIGNS) : t.kind === 'sps' ? unitsOf(def, t.size) * 0.95 : undefined,
    opt: t.opt,
  };
  c.projects.push(p);
  if (t.kind === 'fpilot') startPilot(s, t.where as keyof typeof FUSION_DESIGNS);
  c.tenders = c.tenders.filter((x) => x !== t);
  // relationships: the winner is happy; a cheaper loser remembers
  if (b.partner !== YOU) {
    addPartnerRel(s, b.partner, 6);
    c.partners[b.partner].won += 1;
  }
  const cheapest = Math.min(...t.bids.map((x) => x.price));
  for (const x of t.bids) {
    if (x === b || x.partner === YOU) continue;
    if (x.price <= cheapest + 1 && x.price < b.price * 0.97) {
      c.partners[x.partner].snubs += 1;
      addPartnerRel(s, x.partner, -3);
    } else addPartnerRel(s, x.partner, -1);
  }
  if (conflict > 0) {
    addLegitimacy(s, -conflict);
    s.flags.selfAwards = Number(s.flags.selfAwards ?? 0) + 1;
    if (conflict >= 4 && rand(s) < 0.45 && s.day - Number(s.events.last['conflict-expose'] ?? -9999) > 540) scheduleEvent(s, 'conflict-expose', randInt(s, 30, 90), { project: p.id });
  }
  news(s, `✍ ${partnerName(s, b.partner)} wins ${def.name} at ${whereName(t.where)}: ${fmtMoney(b.price)}, ${Math.round(b.days / 30.4)} months.${conflict > 0 ? ` Legitimacy −${conflict}.` : ''}`, conflict > 4 ? 'bad' : 'good');
  return OK;
}

export function cancelProject(s: GameState, projectId: string): Result {
  const p = s.charter?.projects.find((x) => x.id === projectId);
  if (!p || p.status !== 'building') return fail('Nothing to cancel.');
  p.status = 'cancelled';
  if (p.kind === 'fpilot' && s.planet) {
    const st = s.planet.fusion[p.where as keyof typeof FUSION_DESIGNS];
    if (st?.status === 'pilot') st.status = 'idle';
  }
  if (p.builder !== YOU) addPartnerRel(s, p.builder, -20);
  addLegitimacy(s, -4);
  news(s, `✗ The Charter cancels ${CONTRACT_KINDS[p.kind].name} at ${whereName(p.where)}. ${partnerName(s, p.builder)} is furious.`, 'bad');
  return OK;
}

export const expediteCost = (p: Project) => Math.max(0, (p.price - p.paid) * 0.25);

export function expediteProject(s: GameState, projectId: string): Result {
  const c = s.charter;
  const p = c?.projects.find((x) => x.id === projectId);
  if (!c || !p || p.status !== 'building') return fail('Nothing to expedite.');
  if (s.flags[`expedited:${p.id}`]) return fail('Already expedited once.');
  const cost = expediteCost(p);
  if (c.budget < cost) return fail(`Needs ${fmtMoney(cost)} in the treasury.`);
  chSpend(s, 'payments', cost);
  if (p.builder === YOU) earn(s, 'revenue', cost * CHARTER.yourMargin);
  p.price += cost;
  p.paid += cost;
  const left = p.days - p.progress;
  p.days = Math.round(p.progress + left * 0.8);
  s.flags[`expedited:${p.id}`] = true;
  news(s, `⏩ Overtime crews on ${CONTRACT_KINDS[p.kind].name} at ${whereName(p.where)}.`);
  return OK;
}

export function isLate(s: GameState, p: Project): boolean {
  return p.status === 'building' && s.day > p.startDay + p.promised;
}

export function claimDamages(s: GameState, projectId: string): Result {
  const c = s.charter;
  const p = c?.projects.find((x) => x.id === projectId);
  if (!c || !p) return fail('No such project.');
  if (!isLate(s, p)) return fail('The project isn’t late.');
  if (p.claimed) return fail('Damages already claimed.');
  if (p.builder === YOU) return fail('You can’t sue your own company. Well, you can, but nobody would believe it.');
  const amt = p.price * 0.1;
  chEarn(s, 'income', amt);
  p.claimed = true;
  addPartnerRel(s, p.builder, -10);
  news(s, `⚖ The Charter claims ${fmtMoney(amt)} in damages from ${partnerName(s, p.builder)}.`);
  return OK;
}

export function donate(s: GameState, amount: number): Result {
  if (!act3(s)) return fail('The Charter doesn’t exist yet.');
  if (s.finance.cash < amount) return fail(`Needs ${fmtMoney(amount)} of company cash.`);
  spend(s, 'other', amount);
  chEarn(s, 'income', amount);
  addLegitimacy(s, Math.min(6, amount / 2e9));
  news(s, `🎁 ${s.company.name} gives ${fmtMoney(amount)} to the Charter.`, 'good');
  return OK;
}

export const TRUST_COOLDOWN = 365;

export function canSetBlindTrust(s: GameState, on: boolean): string | null {
  const c = s.charter;
  if (!c) return 'The Charter doesn’t exist yet.';
  if (c.blindTrust === on) return null;
  if (!on && (s.planet?.company === 'sell' || s.planet?.company === 'utility')) return s.planet.company === 'sell' ? 'You sold your company.' : 'Your company belongs to the Charter now.';
  if (on && s.day - c.trustDay < TRUST_COOLDOWN && c.trustDay > 0) return `You left the trust recently — the blocs won’t believe you for another ${Math.ceil((TRUST_COOLDOWN - (s.day - c.trustDay)) / 30.4)} months.`;
  return null;
}

export function setBlindTrust(s: GameState, on: boolean): Result {
  const why = canSetBlindTrust(s, on);
  if (why) return fail(why);
  const c = s.charter!;
  if (c.blindTrust === on) return OK;
  c.blindTrust = on;
  c.trustDay = s.day;
  if (on) {
    addLegitimacy(s, 8);
    news(s, `🔒 ${s.company.name} goes into a blind trust. Your advisors run it now; you run the Charter.`, 'good');
  } else {
    addLegitimacy(s, -12);
    news(s, `🔓 You take ${s.company.name} back out of the blind trust. The Council notices.`, 'bad');
  }
  return OK;
}

// ════════════════════════════════════════ ACCESS ════════════════════════════════════════
const ACCESS_GAIN: Partial<Record<ContractKind, [number, number, number]>> = {
  compute: [8, 15, 25],
  cable: [5, 9, 12],
  fab: [4, 7, 12],
  hbm: [2, 4, 6],
  pkg: [2, 4, 6],
  euv: [1, 2, 3],
};

/** Compute access per bloc, recomputed from everything that feeds it. */
export function computeAccess(s: GameState): Record<RegionId, number> {
  const c = s.charter!;
  const years = yearsElapsed(s.day - c.founded);
  const pledge = passed(s, 'access-pledge');
  const gain: Record<string, number> = {};
  const add = (r: RegionId, v: number) => (gain[r] = (gain[r] ?? 0) + v);
  for (const p of c.projects) {
    if (p.status !== 'done') continue;
    const g = ACCESS_GAIN[p.kind];
    if (g) add(p.region, g[p.size - 1]);
    if (p.kind === 'hvdc') {
      const r = HVDC_BY_ID[p.where];
      if (r) {
        add(r.from, 3);
        if (r.to !== r.from) add(r.to, 3);
      }
    }
  }
  // megaprojects: each stage at a bloc's site helps (cheap power, jobs)
  for (const r of REGION_IDS) {
    const site = Object.values(SITE_BY_ID).find((x) => x.kind === 'mega' && x.region === r);
    if (!site) continue;
    const gw = c.projects.filter((p) => p.where === site.id && p.status === 'done').reduce((a, p) => a + (p.gw ?? 0), 0);
    add(r, (gw >= 20 ? 2 : 0) + (gw >= 80 ? 2 : 0) + (gw >= 200 ? 2 : 0));
  }
  const out = {} as Record<RegionId, number>;
  for (const r of REGION_IDS) {
    let v = ACCESS0[r] + (gain[r] ?? 0) * (pledge && WEALTH[r] === 'developing' ? 1.5 : 1) * techMult(s, 'accessGain');
    v += Math.min(10, blocIT(s, r) / 100);
    if (passed(s, 'open-weights')) v += 5;
    if (passed(s, 'staged-release')) v += 2;
    if (passed(s, 'closed-frontier') && WEALTH[r] === 'developing') v -= 3;
    // the frontier keeps moving: standing still means falling behind (it slows once the world catches up)
    v -= 1.2 * Math.min(years, 12) + (years > 12 ? 0.5 * (years - 12) : 0);
    // Act IV: compute in orbit reaches everyone, and AIs open up the provinces they run
    if (s.planet) v += Math.min(15, 1.5 * orbitGW(s)) + aiAccessBonus(s, r);
    out[r] = clamp(v, 0, 100);
  }
  return out;
}

export const minAccess = (s: GameState) => Math.min(...Object.values(s.charter?.access ?? { x: 0 }));

// ════════════════════════════════════════ DUES ════════════════════════════════════════
/** A bloc's willingness to pay (0 when it walked out). */
export function willingness(s: GameState, r: RegionId): number {
  const c = s.charter!;
  if (c.council.walkouts[r]) return 0;
  if (c.council.concord?.members.includes(r)) return 0.5;
  const rel = s.blocs[r]?.relation ?? 50;
  return clamp(0.6 + (rel - 50) / 100 + (c.legitimacy - 50) / 150, 0.3, 1.2);
}

/** Monthly dues a bloc owes at today's level. */
export function duesOf(s: GameState, r: RegionId): number {
  const c = s.charter!;
  const growth = Math.pow(1 + CHARTER.duesGrowth, yearsElapsed(s.day - c.founded));
  let level = c.dues;
  if (passed(s, 'dues-relief')) level *= WEALTH[r] === 'developing' ? 0.5 : 1.05;
  return CHARTER.duesMonthly * ECON[r] * level * growth;
}

export function duesMonthly(s: GameState): number {
  return REGION_IDS.reduce((a, r) => a + duesOf(s, r) * willingness(s, r), 0);
}

/** Monthly payments the treasury is committed to on projects under way. */
export function committedMonthly(s: GameState): number {
  return (s.charter?.projects ?? []).filter((p) => p.status === 'building').reduce((a, p) => a + ((p.price * (1 - CHARTER.upfront)) / Math.max(1, p.days)) * DAYS_PER_MONTH, 0);
}

/** Whether the treasury can carry a new contract's payments without falling into arrears. */
export function affordable(s: GameState, price: number, days: number): boolean {
  const c = s.charter!;
  const extra = ((price * (1 - CHARTER.upfront)) / Math.max(1, days)) * DAYS_PER_MONTH;
  return c.budget >= price * CHARTER.upfront && committedMonthly(s) + extra <= duesMonthly(s) * 1.05 + Math.max(0, c.budget - price * CHARTER.upfront) / 18;
}

// ════════════════════════════════════════ THE DAILY TICK ════════════════════════════════════════
export function tickCharter(s: GameState, revenueDay: number): void {
  const c = s.charter;
  if (!c) return;
  const perDay = 1 / DAYS_PER_MONTH;

  // dues come in every day; late blocs pay half and the rest piles up
  for (const r of REGION_IDS) {
    const owed = duesOf(s, r) * perDay;
    const w = willingness(s, r);
    if (w <= 0) continue;
    const late = (c.council.late[r] ?? 0) > 0;
    const paid = owed * w * (late ? 0.5 : 1);
    chEarn(s, 'dues', paid);
    if (late) c.council.late[r] = (c.council.late[r] ?? 0) + owed * w * 0.5;
  }
  // the windfall levy: every lab pays 2% of revenue, yours included
  if (passed(s, 'windfall-levy')) {
    const yours = Math.max(0, revenueDay) * 0.02;
    if (yours > 0) {
      spend(s, 'other', yours);
      chEarn(s, 'income', yours);
    }
    const rivals = s.market.rivals.length * 120e6 * Math.pow(1.25, yearsElapsed(s.day - c.founded)) * perDay;
    chEarn(s, 'income', rivals);
  }

  // tenders: bids arrive, tenders close
  for (const t of c.tenders) {
    const due = t.pending.filter((x) => x.day <= s.day);
    if (!due.length) continue;
    t.pending = t.pending.filter((x) => x.day > s.day);
    for (const d of due) {
      if (d.partner !== YOU && activeProjects(s, d.partner) >= partnerCapacity(PARTNERS[d.partner].traits)) continue;
      t.bids.push(makeBid(s, t, d.partner));
    }
    t.bids.sort((a, b) => a.price - b.price);
    if (!t.pending.length) {
      const low = t.bids[0];
      news(s, t.bids.length ? `📬 Bids are in for ${CONTRACT_KINDS[t.kind].name} at ${whereName(t.where)}: ${t.bids.length}, lowest ${fmtMoney(low.price)} from ${partnerName(s, low.partner)}. Award one in Charter → Contracts.` : `📭 Nobody bid for ${CONTRACT_KINDS[t.kind].name} at ${whereName(t.where)}.`, 'event');
    }
  }
  const expired = c.tenders.filter((t) => s.day >= t.closesDay && !t.pending.length);
  if (expired.length) {
    for (const t of expired) {
      for (const b of t.bids) if (b.partner !== YOU) addPartnerRel(s, b.partner, -2);
      news(s, `📜 The tender for ${CONTRACT_KINDS[t.kind].name} at ${whereName(t.where)} closed without an award.`);
    }
    c.tenders = c.tenders.filter((t) => !expired.includes(t));
  }

  // projects: progress, payments, trouble, completion
  for (const p of c.projects) {
    if (p.status !== 'building') continue;
    const due = (p.price * (1 - CHARTER.upfront)) / Math.max(1, p.days);
    // pay what's owed first
    if (p.arrears > 0 && c.budget > p.arrears) {
      chSpend(s, 'payments', p.arrears);
      if (p.builder === YOU) earn(s, 'revenue', p.arrears * CHARTER.yourMargin);
      p.paid += p.arrears;
      p.arrears = 0;
    }
    if (c.budget >= due) {
      chSpend(s, 'payments', due);
      if (p.builder === YOU) earn(s, 'revenue', due * CHARTER.yourMargin);
      p.paid += due;
    } else p.arrears += due;
    const speed = (p.arrears > 0 ? 0.5 : 1) * modMult(s, 'charter:build') * (p.kind === 'fab' && s.charter!.projects.some((x) => x.kind === 'euv' && x.status === 'done') ? 1.25 : 1);
    p.progress += speed;
    if ((s.day - p.startDay) % 30 === 29) troubleRoll(s, p);
    if (p.progress >= p.days) completeProject(s, p);
  }

  // missions
  if (s.day % 7 === 0) checkMissions(s);

  // access
  c.access = computeAccess(s);

  // monthly: ledger, Legitimacy, capital, partners
  const mk = monthKey(s.day);
  if (mk !== c.monthKey) {
    c.history.push({ ...c.month, label: monthLabelOfKey(c.monthKey), budgetEnd: c.budget });
    if (c.history.length > 36) c.history.shift();
    c.month = emptyCharterLedger();
    c.monthKey = mk;
    monthly(s);
  }
}

function monthly(s: GameState): void {
  const c = s.charter!;
  // Legitimacy drifts toward a baseline set by your standing; delivery, arrears and walkouts push it around
  const target = 48 + 3 * c.standing;
  let d = (target - c.legitimacy) * 0.05;
  if (c.blindTrust) d += 0.4;
  if (c.projects.some((p) => p.status === 'building' && p.arrears > 0)) d -= 1.5;
  const late = c.projects.filter((p) => isLate(s, p)).length;
  // Act IV runs hundreds of projects: what matters is the share that's late, not the count
  if (s.planet) d -= Math.min(2, (4 * late) / Math.max(4, c.projects.filter((p) => p.status === 'building').length));
  else d -= Math.min(3, late * 0.5);
  d -= Object.keys(c.council.walkouts).length;
  if (c.budget < 0) d -= 2;
  addLegitimacy(s, d);
  // political capital
  addCapital(s, Math.max(1, 3 + 0.75 * c.standing + (c.legitimacy - 50) / 20) * (c.desk.bit?.on ? 1.1 : 1));
  // partners drift home; very unhappy ones lobby against you
  for (const [id, st] of Object.entries(c.partners)) {
    const def = PARTNERS[id];
    st.rel += (def.rel0 - st.rel) * 0.02;
    if (st.rel < 25 && rand(s) < 0.4) {
      addRelation(s, def.home, -1.5);
      addLegitimacy(s, -0.4);
      if (rand(s) < 0.15 && s.day - Number(s.events.last['partner-lobby'] ?? -9999) > 365) queueEvent(s, 'partner-lobby', { partner: id });
    }
  }
  // loyal partners sometimes offer a favour
  const fans = Object.entries(c.partners).filter(([, st]) => st.rel >= 75).map(([id]) => id);
  if (fans.length && rand(s) < 0.12 && s.day - Number(s.events.last['partner-favour'] ?? -9999) > 300) queueEvent(s, 'partner-favour', { partner: pick(s, fans) });
  // late payers settle up when relations recover
  for (const r of REGION_IDS) {
    const owed = c.council.late[r] ?? 0;
    if (owed > 0 && (s.blocs[r]?.relation ?? 50) >= 45 && rand(s) < 0.35) {
      chEarn(s, 'dues', owed);
      delete c.council.late[r];
      news(s, `💸 ${REGIONS[r].name} pays its late dues (${fmtMoney(owed)}).`, 'good');
    } else if (!owed && (s.blocs[r]?.relation ?? 50) < 30 && rand(s) < 0.25 && !c.council.walkouts[r]) {
      c.council.late[r] = 1;
      news(s, `⏳ ${REGIONS[r].name} starts paying its dues late.`, 'bad');
    }
  }
}

// ════════════════════════════════════════ TROUBLE ════════════════════════════════════════
function troubleRoll(s: GameState, p: Project): void {
  const tr = traitsOf(s, p.builder);
  const chance = (0.025 * (6 - tr.rel)) * (p.builder === YOU && s.charter!.blindTrust ? 1.1 : 1);
  if (rand(s) >= chance) return;
  p.troubles += 1;
  const def = CONTRACT_KINDS[p.kind];
  const roll = rand(s);
  const who = partnerName(s, p.builder);
  if (roll < 0.4) {
    const extra = Math.round(p.days * (0.08 + rand(s) * 0.14) * (tr.ambition >= 4 ? 1.3 : 1));
    p.days += extra;
    news(s, `⏳ ${who}: ${def.name} at ${whereName(p.where)} slips ${Math.round(extra / 30.4)} months.`, 'bad');
  } else if (roll < 0.75) {
    // an overrun: the partner wants more money
    const extra = Math.round(p.price * (0.08 + rand(s) * 0.12) / 1e6) * 1e6;
    queueEvent(s, 'project-overrun', { project: p.id, extra });
  } else if (roll < 0.9 && tr.ethics <= 3) {
    queueEvent(s, 'project-scandal', { project: p.id });
  } else {
    const extra = Math.round(20 + rand(s) * 40);
    p.days += extra;
    news(s, `🪧 A strike at ${whereName(p.where)} halts ${who}’s crews for ${extra} days.`, 'bad');
  }
}

// ════════════════════════════════════════ COMPLETION ════════════════════════════════════════
function completeProject(s: GameState, p: Project): void {
  const c = s.charter!;
  p.status = 'done';
  p.doneDay = s.day;
  p.progress = p.days;
  const def = CONTRACT_KINDS[p.kind];
  const late = s.day > p.startDay + p.promised + 15;
  if (p.builder !== YOU) {
    const st = c.partners[p.builder];
    st.done += 1;
    addPartnerRel(s, p.builder, late ? 2 : 6);
  }
  addLegitimacy(s, late ? 0.1 : 0.6);
  // developing blocs especially notice projects at home
  if (WEALTH[p.region] === 'developing') addRelation(s, p.region, 4);
  else addRelation(s, p.region, 1.5);
  const units = unitsOf(def, p.size);
  switch (p.kind) {
    case 'fab':
      addModifier(s, 'supplier:*:rate', 99_999, 'Chip Commons fab', { mult: 1 + 0.05 * units });
      break;
    case 'hbm':
      addModifier(s, 'market:hbm', 99_999, 'Chip Commons HBM line', { mult: 1 + 0.06 * units });
      break;
    case 'pkg':
      addModifier(s, 'market:pkg', 99_999, 'Chip Commons packaging line', { mult: 1 + 0.08 * units });
      break;
    case 'euv':
      s.flags.euvCommons = s.day;
      break;
    case 'hvdc': {
      const r = HVDC_BY_ID[p.where];
      if (r) for (const reg of new Set([r.from, r.to])) addModifier(s, `region:${reg}:price`, 99_999, `${r.name}: cheaper power`, { mult: 0.92 });
      break;
    }
    case 'evals':
    case 'interp': {
      // the first programmes of each kind teach the field the most
      const before = c.projects.filter((x) => x.kind === p.kind && x.status === 'done' && x !== p).length;
      const gain = (p.kind === 'evals' ? [0.08, 0.15, 0.25] : [0.06, 0.12, 0.2])[p.size - 1];
      c.regime.alignment += gain * Math.pow(0.6, before) * techMult(s, 'alignGain');
      break;
    }
    case 'launch':
      s.flags.launchSite = p.where;
      scheduleEvent(s, 'kip-2', 20);
      break;
    case 'orbital':
      s.flags.orbitalTest = s.day;
      scheduleEvent(s, 'kip-3', 15);
      break;
    case 'spacesolar':
      s.flags.spaceSolar = s.day;
      break;
    case 'fusion':
      s.flags.fusionPilot = s.day;
      break;
    // ── Act IV ──
    case 'link': {
      const r = SUPERGRID_BY_ID[p.where];
      if (r) {
        for (const reg of [r.from, r.to]) {
          addModifier(s, `region:${reg}:price`, 99_999, `${r.name}: cheaper power`, { mult: 0.94 });
          addRelation(s, reg, 4);
        }
        scheduleEvent(s, 'link-online', 3, { route: r.id });
      }
      break;
    }
    case 'fpilot':
      resolvePilot(s, p.where as keyof typeof FUSION_DESIGNS);
      break;
    case 'cleanup':
      cleanUp(s, p.size);
      break;
    case 'odc':
      if (s.planet) s.planet.debris.leo = clamp(s.planet.debris.leo + 2 * unitsOf(def, p.size), 0, 100);
      break;
    case 'moonbase':
    case 'moonmine':
    case 'massdriver':
      scheduleEvent(s, `moon-${p.kind}`, 5, {});
      break;
    // ── Act V ──
    case 'seed':
      if (s.system) {
        plantSeed(s, p.where, seedOwner(s, p.where, p.builder));
        if (s.system.foundries.length === 1) scheduleEvent(s, 'v-first-seed', 3, { site: p.where });
      }
      break;
    case 'survey':
      if (s.system) completeSurvey(s);
      break;
    case 'sentinel':
      if (s.system) s.system.sentinels = clamp(s.system.sentinels + [0.2, 0.35, 0.5][p.size - 1] * (1 - s.system.sentinels), 0, 0.92);
      break;
    case 'beam':
      if (s.system) s.system.beams += units;
      break;
    case 'harden':
      if (s.system) s.system.hardening = clamp(s.system.hardening + [0.15, 0.25, 0.35][p.size - 1] * (1 - s.system.hardening), 0, 0.92);
      break;
    case 'habitat':
      addLegitimacy(s, 2);
      if (s.system && !s.flags.firstHabitat) {
        s.flags.firstHabitat = s.day;
        scheduleEvent(s, 'v-aurora', 4, {});
      }
      break;
    case 'mercury':
      if (s.system) {
        s.system.mercury = 2;
        scheduleEvent(s, 'v-mercury', 3, {});
      }
      break;
  }
  const what = def.cat === 'energy' || p.kind === 'ffleet' || p.kind === 'sps' ? `${fmtMW((p.gw ?? 0) * 1000)} of clean power` : def.name.toLowerCase();
  news(s, `🎉 ${partnerName(s, p.builder)} finishes ${def.name} at ${whereName(p.where)}: ${what} online${late ? ' (late)' : ''}.`, 'good');
}

function checkMissions(s: GameState): void {
  const c = s.charter!;
  for (const m of MISSIONS) {
    if (c.missions[m.id] || c.phase < m.cphase) continue;
    if (!missionProgress(s, m).done) continue;
    c.missions[m.id] = s.day;
    completeMission(s, m.id);
  }
}

export function completeMission(s: GameState, id: string): void {
  const c = s.charter!;
  addLegitimacy(s, 6);
  addCapital(s, 10);
  switch (id) {
    case 'clean-power':
      addModifier(s, 'grid:price', 99_999, 'Clean Power for All', { mult: 0.85 });
      addModifier(s, 'grid:carbon', 99_999, 'Clean Power for All', { mult: 0.7 });
      break;
    case 'compute-everyone':
      for (const r of REGION_IDS) if (WEALTH[r] === 'developing') addRelation(s, r, 10);
      addLegitimacy(s, 5);
      break;
    case 'chip-commons':
      addModifier(s, 'supplier:*:rate', 99_999, 'The Chip Commons', { mult: 1.3 });
      addModifier(s, 'market:hbm', 99_999, 'The Chip Commons', { mult: 1.15 });
      addModifier(s, 'market:pkg', 99_999, 'The Chip Commons', { mult: 1.15 });
      addRelation(s, 'eam', 5);
      addRelation(s, 'stp', 5);
      break;
    case 'backbone':
      break;
    case 'offworld':
      s.flags.act4Space = s.day;
      addLegitimacy(s, 5);
      break;
    case 'safe-frontier':
      c.regime.alignment += 0.2;
      break;
  }
  queueEvent(s, 'mission-done', { mission: id });
  news(s, `🏆 Mission complete: ${MISSION_BY_ID[id].name}. ${MISSION_BY_ID[id].reward}`, 'good');
}

/** Your company's IT and generation shown in the Charter's books (for events). */
export function companyFootprint(s: GameState): { itMW: number; halls: number } {
  return { itMW: s.stats.itMW, halls: s.facilities.filter((f) => HALLS.includes(f.type)).length };
}

void facilityIT;
void alignmentOf;
void addRelationAll;
