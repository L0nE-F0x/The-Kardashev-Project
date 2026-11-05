import type { AdvisorId, GameState } from '../sim/types';
import { currentCapability, facilityMW, frontier } from '../sim/model';
import { fmtDays, fmtMoney } from '../sim/core';
import { FACILITIES, FIRM, GENERATORS } from './facilities';
import { megaStage } from './charter';
import { MEGA_SITES } from './sites';
import { planetChecklist as planetChecklistOf } from '../sim/act4';
import { typeIChecklist as typeIChecklistOf } from '../sim/act5';

const MEGA_IDS = MEGA_SITES.map((m) => m.id);

export interface ObjectiveDef {
  id: string;
  title: string;
  hint: string;
  advisor: AdvisorId;
  done: (s: GameState) => boolean;
  /** Shown only after these are complete. */
  after?: string[];
  reward?: { cash?: number; rp?: number; text: string };
  /** Part of the act's goal checklist. */
  goal?: boolean;
  /** Act this objective belongs to (default 1). */
  act?: number;
  /** Act II phase it appears in (Act III: the Charter's phase; Act IV: the planet's stage). */
  phase?: number;
  /** A condition that must hold, not a milestone: never ticked off, always shown live (Act IV checklist). */
  live?: boolean;
  /** How far along a numeric goal is: the goal card and the Goals panel draw it as a bar with the numbers. */
  progress?: (s: GameState) => ObjectiveProgress | null;
}

export interface ObjectiveProgress {
  /** 0..1 */
  frac: number;
  /** The numbers, short: "$1.2M / $5M a month". */
  text: string;
}

const prog = (now: number, of: number, text: string): ObjectiveProgress => ({ frac: of > 0 && Number.isFinite(now) ? Math.max(0, Math.min(1, now / of)) : 0, text });
const monthly = (now: number, of: number) => prog(now, of, `${fmtMoney(now, now < 1e8 ? 1 : 0)} / ${fmtMoney(of, 0)} a month`);
/** The run for model generation `gen`, while it trains. */
const training = (gen: number) => (s: GameState) => {
  const run = s.training;
  if (!run || run.gen !== gen) return null;
  const rate = s.stats.trainPFd;
  const eta = rate > 0 ? ` · ~${fmtDays((run.target - run.done) / rate)} at today’s compute` : ' · stalled: give training some compute';
  return prog(run.done, run.target, `${run.name}: ${Math.floor((run.done / run.target) * 100)}% trained${eta}`);
};
const mw = (now: number, of: number) => prog(now, of, of >= 1000 ? `${(now / 1000).toFixed(2)} / ${of / 1000} GW` : `${Math.round(now)} / ${of} MW`);
/** A Kardashev goal, in the power it takes (K is a log scale, power is what grows). */
const kGoal = (k: number) => (s: GameState) => prog(s.stats.worldTW, 10 ** (k * 10 + 6) / 1e12, `K ${s.stats.K.toFixed(4)} / ${k.toFixed(2)}`);
const hallChips = (f: { racks?: { qty: number }[] }) => (f.racks ?? []).reduce((a, r) => a + r.qty, 0);

const dcOnlineWithChips = (s: GameState) =>
  s.facilities.some((f) => f.type === 'datacenter' && f.status === 'online' && (f.racks ?? []).reduce((a, r) => a + r.qty, 0) >= 1000);
/** The first hall: how far it's built, then how full it is. */
const firstHallProgress = (s: GameState): ObjectiveProgress | null => {
  const halls = s.facilities.filter((f) => f.type === 'datacenter');
  const live = halls.filter((f) => f.status === 'online');
  if (live.length) {
    const chips = Math.max(...live.map(hallChips));
    return prog(chips, 1000, `${chips.toLocaleString()} / 1,000 chips installed`);
  }
  const b = halls.reduce<(typeof halls)[number] | null>((best, f) => (!best || f.progress / f.buildDays > best.progress / best.buildDays ? f : best), null);
  if (!b) return null;
  const months = Math.max(0, Math.ceil((b.buildDays - b.progress) / 30.4));
  return prog(b.progress, b.buildDays, `Data Center ${Math.floor((b.progress / b.buildDays) * 100)}% built${months ? ` · ${months} mo to go` : ''}`);
};

export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'rent', title: 'Rent compute from Cumulus Cloud', hint: 'Open Compute (🧮) and rent at least 500 accelerators.', advisor: 'bit', done: (s) => s.rental.units >= 500 || s.models.length > 0 },
  { id: 'train1', title: 'Train Bit-1', hint: 'In Compute, start the Bit-1 training run and give it some of your compute.', advisor: 'bit', done: (s) => s.models.length >= 1, after: ['rent'], reward: { rp: 10, text: '+10 research' } },
  { id: 'research', title: 'Research your first technology', hint: 'Open Research (🔬) and pick a project. Research flows from your HQ and labs.', advisor: 'iris', done: (s) => s.research.done.length >= 1 },
  { id: 'dc', title: 'Start building a data center', hint: 'Click a site on the map — somewhere with cheap power and space — and build a Data Center.', advisor: 'juno', done: (s) => s.facilities.some((f) => f.type === 'datacenter'), after: ['train1'] },
  { id: 'power', title: 'Line up power for your data center', hint: 'At the same site: request a grid connection, or build solar + batteries, wind or gas.', advisor: 'juno', done: (s) => s.facilities.some((f) => f.type === 'datacenter' && (s.sites[f.siteId].grid.mw + s.sites[f.siteId].grid.pending.reduce((a, p) => a + p.mw, 0) >= 5 || s.facilities.some((g) => g.siteId === f.siteId && ['solar', 'wind', 'gas'].includes(g.type)))), after: ['dc'] },
  { id: 'order', title: 'Order accelerators', hint: 'Open Orders (📦) and fill the hall: a half-empty one makes Bit-2 take years. Lumen ships sooner; Kestrel is cheaper.', advisor: 'mira', done: (s) => s.orders.length > 0 || s.shipments.length > 0 || s.facilities.some((f) => (f.racks ?? []).length > 0), after: ['dc'] },
  { id: 'safety', title: 'Put compute into safety research', hint: 'In Compute, give Safety at least 8%. Iris recommends ~10% as much as you spend on training.', advisor: 'iris', done: (s) => s.alloc.safety >= 0.08, after: ['train1'] },
  { id: 'online', progress: firstHallProgress, title: 'Bring your data center online with 1,000+ chips', hint: 'Once built, delivered accelerators install automatically. Make sure it has power!', advisor: 'juno', done: dcOnlineWithChips, after: ['order', 'power'], goal: true },
  { id: 'train2', progress: training(2), title: 'Train Bit-2 (2×10²⁶ FLOP)', hint: 'Start the Bit-2 run in Compute. It needs a lot more compute than Bit-1.', advisor: 'bit', done: (s) => s.models.length >= 2, after: ['train1'], goal: true, reward: { rp: 25, text: '+25 research' } },
  { id: 'revenue', progress: (s) => monthly(s.stats.revenueMonth, 5e6), title: 'Reach $5M/month revenue', hint: 'Inference revenue grows with model quality and how much compute you serve with.', advisor: 'penny', done: (s) => s.stats.revenueMonth >= 5e6, after: ['train1'], goal: true },
  { id: 'margin', title: 'Keep the safety margin ≥ −0.25', hint: 'Investors will check. Safety research raises your alignment level.', advisor: 'iris', done: (s) => s.models.length >= 2 && s.stats.margin >= -0.25, after: ['train2'], goal: true },
  { id: 'seriesA', title: 'Raise your Series A', hint: 'With the goals above met, Penny will bring you term sheets.', advisor: 'penny', done: (s) => !!s.flags.act1Complete, after: ['online', 'train2', 'revenue', 'margin'], goal: true },
];

// ════════════════════════════════════ ACT II ════════════════════════════════════════════
const a2 = (o: Omit<ObjectiveDef, 'act'>): ObjectiveDef => ({ ...o, act: 2 });
const hasFirm = (s: GameState) => s.facilities.some((f) => FIRM.includes(f.type));
const genNameplate = (s: GameState, cleanOnly = false) =>
  s.facilities.filter((f) => f.status === 'online' && GENERATORS.includes(f.type) && (!cleanOnly || FACILITIES[f.type].clean)).reduce((a, f) => a + facilityMW(f), 0);

OBJECTIVES.push(
  // ── Phase 1 · Gigawatts ──
  a2({ id: 'a2-tier', phase: 1, title: 'Expand a data center to a 50 MW hall', hint: 'Select a site with a data center and press Upgrade. It keeps running while the crews work.', advisor: 'juno', done: (s) => s.facilities.some((f) => f.type === 'datacenter' && ((f.tier ?? 1) >= 2 || (f.upgrade?.to ?? 0) >= 2)) }),
  a2({ id: 'a2-firm', phase: 1, title: 'Start building firm clean power', hint: 'Hydro on a river site, geothermal on volcanic rock, or restart a retired reactor.', advisor: 'juno', done: hasFirm }),
  a2({ id: 'a2-fiber', phase: 1, title: 'Reach a second market', hint: 'Draw fiber between sites in two regions, or lease a subsea cable from a landing station.', advisor: 'sol', done: (s) => s.network.fiber.length > 0 || s.network.leases.length > 0 || s.network.own.length > 0 }),
  a2({ id: 'a2-team', phase: 1, title: 'Give an advisor a job', hint: 'Open the Team panel and switch on Mira, Juno, Iris or Bit.', advisor: 'mira', done: (s) => Object.values(s.jobs).some((j) => j?.on) }),
  a2({ id: 'a2-relations', progress: (s) => { const best = Math.max(0, ...Object.values(s.blocs).map((b) => b.relation)); return prog(best, 65, `best relations ${Math.round(best)} / 65`); }, phase: 1, title: 'Win a friend in government', hint: 'Open the Blocs screen. Lobby, sign a treaty or build locally until a bloc’s relations reach 65.', advisor: 'sol', done: (s) => Object.values(s.blocs).some((b) => b.relation >= 65) }),
  a2({ id: 'a2-it100', progress: (s) => mw(s.stats.itMW, 100), phase: 1, title: 'Bring 100 MW of IT capacity online', hint: 'Bigger halls (upgrade to 50 MW) and more of them.', advisor: 'juno', goal: true, done: (s) => s.stats.itMW >= 100 }),
  a2({ id: 'a2-bit3', progress: training(3), phase: 1, title: 'Train Bit-3', hint: 'Start the Bit-3 run in Compute. It wants about 10× Bit-2’s compute.', advisor: 'bit', goal: true, done: (s) => s.models.length >= 3, reward: { rp: 40, text: '+40 research' } }),
  a2({ id: 'a2-rev75', progress: (s) => monthly(s.stats.revenueMonth, 75e6), phase: 1, title: 'Reach $75M/month revenue', hint: 'More chips serving customers, better models, more markets.', advisor: 'penny', goal: true, done: (s) => s.stats.revenueMonth >= 75e6 }),
  a2({ id: 'a2-seriesB', phase: 1, title: 'Raise your Series B', hint: 'Meet the three goals above and Penny will bring the term sheets.', advisor: 'penny', goal: true, after: ['a2-it100', 'a2-bit3', 'a2-rev75'], done: (s) => s.finance.round === 'B' || s.finance.round === 'IPO' }),
  // ── Phase 2 · The Stack ──
  a2({ id: 'a2-deal', phase: 2, title: 'Sign a supply deal', hint: 'Deals → Supply: reserve wafers, lock in HBM or book packaging slots.', advisor: 'mira', done: (s) => s.stack.deals.length > 0 }),
  a2({ id: 'a2-pkg', phase: 2, title: 'Build a packaging plant or start a fab', hint: 'Both are new facilities. The fab needs water, firm power and Veldt’s tools.', advisor: 'mira', done: (s) => s.facilities.some((f) => f.type === 'packaging' || f.type === 'fab') }),
  a2({ id: 'a2-contract', phase: 2, title: 'Win an enterprise contract', hint: 'Deals → Customers. Guaranteed revenue, as long as you deliver.', advisor: 'penny', done: (s) => s.capital.contracts.length > 0 }),
  a2({ id: 'a2-stake', phase: 2, title: 'Take a stake in a mine', hint: 'Click a mine on the map. A stake hedges the price swings of what it digs up.', advisor: 'mira', done: (s) => Object.values(s.stack.stakes).some((v) => v > 0) }),
  a2({ id: 'a2-review', phase: 2, title: 'Pass a board review', hint: 'Grow revenue by the board’s target each quarter. Finance → Board.', advisor: 'penny', done: (s) => !!s.flags.boardPassed }),
  a2({ id: 'a2-sovereign', phase: 2, title: 'Accept a sovereign deal', hint: 'Blocs make offers on the Blocs screen: build there, get grants and cheap power.', advisor: 'sol', done: (s) => s.capital.sovereign.some((d) => d.status === 'active' || d.status === 'done') }),
  // ── Phase 3 · The Race (the IPO checklist) ──
  a2({ id: 'a2-gw-it', progress: (s) => mw(s.stats.itMW, 1000), phase: 3, title: '1 GW of IT capacity online', hint: '200 MW halls and the Gigawatt Campus get you there.', advisor: 'juno', goal: true, done: (s) => s.stats.itMW >= 1000 }),
  a2({ id: 'a2-gw-gen', progress: (s) => { const g = genNameplate(s); const c = g > 0 ? genNameplate(s, true) / g : 0; return prog(Math.min(g / 1000, c / 0.6), 1, `${(g / 1000).toFixed(2)} / 1 GW · ${Math.round(c * 100)}% clean`); }, phase: 3, title: '1 GW of your own generation, 60% carbon-free', hint: 'Nameplate capacity of your plants. Solar, wind, hydro, geothermal and nuclear count as clean.', advisor: 'juno', goal: true, done: (s) => genNameplate(s) >= 1000 && genNameplate(s, true) >= 0.6 * genNameplate(s) }),
  a2({ id: 'a2-bit4', progress: training(4), phase: 3, title: 'Train Bit-4', hint: 'The big one. Every gigawatt helps.', advisor: 'bit', goal: true, done: (s) => s.models.length >= 4, reward: { rp: 60, text: '+60 research' } }),
  a2({ id: 'a2-rev1b', progress: (s) => monthly(s.stats.revenueMonth, 1e9), phase: 3, title: 'Reach $1B/month revenue', hint: 'Markets, contracts and a model near the frontier.', advisor: 'penny', goal: true, done: (s) => s.stats.revenueMonth >= 1e9 }),
  a2({ id: 'a2-frontier', progress: (s) => prog(currentCapability(s), frontier(s), `Bit ${currentCapability(s).toFixed(2)} · Meridian ${frontier(s).toFixed(2)}`), phase: 3, title: 'Match Meridian at the frontier', hint: 'Release a model at least as capable as Meridian’s best.', advisor: 'bit', goal: true, done: (s) => !!s.flags.reachedFrontier }),
  a2({ id: 'a2-safe', phase: 3, title: 'A clean safety record', hint: 'Safety margin ≥ −0.25 and no major incident in the last 12 months.', advisor: 'iris', goal: true, done: (s) => s.stats.margin >= -0.25 && s.models.length >= 3 && s.day - Number(s.flags.lastMajorIncident ?? -9999) > 365 }),
  a2({ id: 'a2-crunch', phase: 4, title: 'Come through The Crunch', hint: 'Hold the grid, the supply chain and public trust for 90 days.', advisor: 'sol', goal: true, done: (s) => !!s.finale?.done }),
  a2({ id: 'a2-ipo', phase: 4, title: 'Ring the bell: IPO', hint: 'Penny has the bankers on speed dial.', advisor: 'penny', goal: true, after: ['a2-crunch'], done: (s) => !!s.flags.act2Complete }),
);

// ════════════════════════════════════ ACT III ════════════════════════════════════════════
const a3 = (o: Omit<ObjectiveDef, 'act'>): ObjectiveDef => ({ ...o, act: 3 });
const ch = (s: GameState) => s.charter;
const chDone = (s: GameState, kind: string) => (ch(s)?.projects ?? []).some((p) => p.kind === kind && p.status === 'done');
const chAny = (s: GameState, kinds: string[]) => (ch(s)?.projects ?? []).some((p) => kinds.includes(p.kind) && p.status !== 'cancelled');

OBJECTIVES.push(
  // ── Phase 1 · The Founding ──
  a3({ id: 'a3-tender', phase: 1, title: 'Post your first Charter contract', hint: 'Open the Charter (H) → Contracts. Pick what to build, where, and how big; partners bid within three weeks.', advisor: 'mira', done: (s) => (ch(s)?.projects.length ?? 0) > 0 || (ch(s)?.tenders.length ?? 0) > 0 }),
  a3({ id: 'a3-award', phase: 1, title: 'Award a contract', hint: 'When the bids are in, pick one. Cheap, fast or reliable — and think twice before picking your own company.', advisor: 'mira', after: ['a3-tender'], done: (s) => (ch(s)?.projects.length ?? 0) > 0 }),
  a3({ id: 'a3-resolution', phase: 1, title: 'Pass a resolution in the Council', hint: 'Open the Council (U). Table a resolution with political capital, check the forecast, lean on the waverers.', advisor: 'sol', done: (s) => !!ch(s)?.council.history.some((h) => h.passed) }),
  a3({ id: 'a3-trust', phase: 1, title: 'Decide what to do about your company', hint: 'Keep running it yourself, or put it in a blind trust (Charter → Overview).', advisor: 'penny', done: (s) => !!s.flags.trustDecided || !!ch(s)?.blindTrust }),
  a3({ id: 'a3-desk', phase: 1, title: 'Give an advisor a Charter desk job', hint: 'Team (T) → Charter desk. Mira can award tenders for you; Sol can whip votes.', advisor: 'bit', done: (s) => Object.values(ch(s)?.desk ?? {}).some((j) => j?.on) }),
  // ── Phase 2 · The Build-Out ──
  a3({ id: 'a3-mega1', phase: 2, title: 'Bring a megaproject to stage 1', hint: '20 GW of average output at one megaproject site.', advisor: 'juno', done: (s) => MEGA_IDS.some((id) => megaStage(s, id) >= 1) }),
  a3({ id: 'a3-hvdc', phase: 2, title: 'Start an intercontinental HVDC link', hint: 'Contracts → HVDC link. Megaprojects behind a link deliver more.', advisor: 'juno', done: (s) => chAny(s, ['hvdc']) }),
  a3({ id: 'a3-commons', phase: 2, title: 'Fund a Chip Commons line', hint: 'A fab, HBM or packaging line in a bloc that needs one.', advisor: 'mira', done: (s) => chAny(s, ['fab', 'hbm', 'pkg']) }),
  a3({ id: 'a3-launch', phase: 2, title: 'Give Kip a launch complex', hint: 'Contracts → Launch complex, at one of five candidate sites.', advisor: 'kip', done: (s) => chAny(s, ['launch']) }),
  a3({ id: 'a3-access', phase: 2, title: 'Lift a developing bloc’s access to 40', hint: 'Public compute campuses and open cables raise compute access.', advisor: 'sol', done: (s) => (['lat', 'ssa', 'sas', 'seo'] as const).some((r) => (ch(s)?.access[r] ?? 0) >= 40) }),
  // ── Phase 3 · The Frontier (the Charter Mandate) ──
  a3({ id: 'a3-k075', progress: kGoal(0.75), phase: 3, title: 'Reach Kardashev 0.75', hint: '31.6 TW. Charter energy adds directly, and every project speeds the world’s own growth.', advisor: 'bit', goal: true, done: (s) => s.stats.K >= 0.75 }),
  a3({ id: 'a3-clean', phase: 3, title: 'Complete Clean Power for All', hint: '600 GW of Charter clean power and three megaprojects at stage 2.', advisor: 'juno', goal: true, done: (s) => !!ch(s)?.missions['clean-power'] }),
  a3({ id: 'a3-chips', phase: 3, title: 'Complete The Chip Commons', hint: 'Three fabs, two HBM lines and two packaging lines across three blocs.', advisor: 'mira', goal: true, done: (s) => !!ch(s)?.missions['chip-commons'] }),
  a3({ id: 'a3-access40', progress: (s) => { const low = Math.min(...Object.values(ch(s)?.access ?? { x: 0 })); return prog(low, 40, `lowest access ${Math.round(low)} / 40`); }, phase: 3, title: 'Every bloc’s compute access ≥ 40', hint: 'Find the bloc furthest behind and build there.', advisor: 'sol', goal: true, done: (s) => Object.values(ch(s)?.access ?? { x: 0 }).every((v) => v >= 40) }),
  a3({ id: 'a3-regime', phase: 3, title: 'A working safety regime', hint: 'Run licensing in force, an evals programme completed and a positive world safety margin.', advisor: 'iris', goal: true, done: (s) => !!ch(s)?.council.passed.includes('run-licensing') && chDone(s, 'evals') && (ch(s)!.regime.alignment - Math.max(s.stats.capability, ...s.market.rivals.map((r) => r.capability))) >= 0 }),
  a3({ id: 'a3-legit', progress: (s) => prog(ch(s)?.legitimacy ?? 0, 50, `Legitimacy ${Math.round(ch(s)?.legitimacy ?? 0)} / 50`), phase: 3, title: 'Legitimacy ≥ 50', hint: 'Deliver projects, spread them fairly, keep your hands off your own company’s bids.', advisor: 'penny', goal: true, done: (s) => (ch(s)?.legitimacy ?? 0) >= 50 }),
  a3({ id: 'a3-orbital', phase: 3, title: 'Kip’s orbital compute test', hint: 'A launch complex first, then the test satellite.', advisor: 'kip', goal: true, done: (s) => !!s.flags.orbitalTest }),
  // ── Phase 4–5 ──
  a3({ id: 'a3-threshold', phase: 4, title: 'Come through The Threshold', hint: 'Hold the grid, the frontier and the Council for 120 days.', advisor: 'sol', goal: true, done: (s) => !!ch(s)?.threshold?.done }),
  a3({ id: 'a3-renewal', phase: 5, title: 'The renewal vote', hint: 'The Council decides whether the Charter gets planetary powers.', advisor: 'sol', goal: true, after: ['a3-threshold'], done: (s) => !!ch(s)?.renewal }),
);

// ── Act IV · Planetary (phase = the planet's stage) ──
const a4 = (o: Omit<ObjectiveDef, 'act'>): ObjectiveDef => ({ ...o, act: 4, live: o.goal && o.id !== 'a4-heatwall' ? true : undefined });
const pl = (s: GameState) => s.planet;
const chKinds = (s: GameState, kinds: string[], doneOnly = false) => (ch(s)?.projects ?? []).some((p) => kinds.includes(p.kind) && (doneOnly ? p.status === 'done' : p.status !== 'cancelled'));
const check = (s: GameState, id: string) => !!s.planet && planetChecklistOf(s).find((g) => g.id === id)?.done === true;
OBJECTIVES.push(
  a4({ id: 'a4-company', phase: 0, title: 'Decide your company’s future', hint: 'Keep it, sell it, or hand it to the Charter as a public utility.', advisor: 'penny', done: (s) => !!pl(s)?.company }),
  a4({ id: 'a4-plan', phase: 0, title: 'Set the first five-year plan', hint: 'Pick up to three priorities and a reserve; then the years jump.', advisor: 'bit', after: ['a4-company'], done: (s) => (pl(s)?.stage ?? 0) >= 1 }),
  // stage 1 · the supergrid
  a4({ id: 'a4-link', phase: 1, title: 'Lay a supergrid link', hint: 'Planet → Grid. A link joins two provinces; the wider the grid, the more of the day it sees the sun.', advisor: 'juno', done: (s) => chKinds(s, ['link']) }),
  a4({ id: 'a4-pilots', phase: 1, title: 'Fund two fusion pilots', hint: 'Planet → Fusion. Four designs, four sets of odds. Some will fail.', advisor: 'lena', done: (s) => Object.values(pl(s)?.fusion ?? {}).reduce((a, f) => a + f.tries, 0) >= 2 }),
  a4({ id: 'a4-ai', phase: 1, title: 'Hand a province to an AI', hint: 'Planet → AI provinces. Needs trust and a non-negative world safety margin.', advisor: 'iris', done: (s) => Object.values(pl(s)?.provinces ?? {}).some((p) => p.ai) }),
  a4({ id: 'a4-water', phase: 1, title: 'Help a province in trouble', hint: 'Planet → Provinces: a water & cooling programme where wellbeing is lowest.', advisor: 'sol', done: (s) => chKinds(s, ['desal', 'dac']) }),
  // stage 2 · the fusion age
  a4({ id: 'a4-fleet', phase: 2, title: 'Build a fusion fleet', hint: 'Planet → Fusion: once a design works, order fleets at megaproject sites.', advisor: 'lena', done: (s) => chKinds(s, ['ffleet'], true) }),
  a4({ id: 'a4-k077', progress: kGoal(0.77), phase: 2, title: 'Reach Kardashev 0.77', hint: '50 TW.', advisor: 'bit', done: (s) => s.stats.K >= 0.77 }),
  // stage 3 · the high frontier
  a4({ id: 'a4-spaceport', phase: 3, title: 'Expand a spaceport', hint: 'Planet → Space. More pads, more launches, cheaper orbit.', advisor: 'kip', done: (s) => chKinds(s, ['spaceport']) }),
  a4({ id: 'a4-moonbase', phase: 3, title: 'Found the Moon outpost', hint: 'Planet → Space → the Moon.', advisor: 'kip', done: (s) => chKinds(s, ['moonbase'], true) }),
  // the planetary checklist (live; the Heat Wall starts when every item holds at once)
  a4({ id: 'a4-k080', progress: kGoal(0.8), phase: 1, title: 'Kardashev 0.80', hint: '100 TW: fusion, a supergrid that follows the sun, power from orbit.', advisor: 'bit', goal: true, done: (s) => check(s, 'k80') }),
  a4({ id: 'a4-grid', phase: 1, title: 'A supergrid joining every province', hint: 'Links (and Act III’s HVDC routes) until all twelve provinces share one grid.', advisor: 'juno', goal: true, done: (s) => check(s, 'grid') }),
  a4({ id: 'a4-fusion', phase: 1, title: 'Fusion from two designs, 5 TW', hint: 'Two working designs, built as fleets.', advisor: 'lena', goal: true, done: (s) => check(s, 'fusion') }),
  a4({ id: 'a4-orbit', phase: 1, title: 'Orbital compute (2 GW)', hint: 'Orbital data centres: compute in permanent sunlight.', advisor: 'kip', goal: true, done: (s) => check(s, 'orbit') }),
  a4({ id: 'a4-moon', phase: 1, title: 'A Moon base with a mass driver', hint: 'Outpost, then a mine, then the mass driver.', advisor: 'kip', goal: true, done: (s) => check(s, 'moon') }),
  a4({ id: 'a4-wellbeing', phase: 1, title: 'Every province’s wellbeing ≥ 50', hint: 'Power, water, cooling, access — and keep the AIs honest.', advisor: 'sol', goal: true, done: (s) => check(s, 'wellbeing') }),
  a4({ id: 'a4-warming', phase: 1, title: 'Warming under 2.0 °C', hint: 'Clean the grid, retire fossil plants, capture carbon from the air.', advisor: 'iris', goal: true, done: (s) => check(s, 'warming') }),
  a4({ id: 'a4-aiprov', phase: 1, title: '4 AI provinces, safety margin ≥ 0', hint: 'Delegate to AIs you trust, and keep the world safety margin positive.', advisor: 'iris', goal: true, done: (s) => check(s, 'ai') }),
  a4({ id: 'a4-heatwall', phase: 4, title: 'Come through The Heat Wall', hint: 'Hold the heat, the cascade and the controls for 120 days.', advisor: 'sol', goal: true, done: (s) => !!pl(s)?.heatwall?.done }),
);
// ── Act V · Type I (phase = the system's stage) ──
const a5 = (o: Omit<ObjectiveDef, 'act'>): ObjectiveDef => ({ ...o, act: 5, live: o.goal && o.id !== 'a5-solarmax' && o.id !== 'a5-typei' ? true : undefined });
const sy5 = (s: GameState) => s.system;
const check5 = (s: GameState, id: string) => !!s.system && typeIChecklistOf(s).find((g) => g.id === id)?.done === true;
OBJECTIVES.push(
  a5({ id: 'a5-line', phase: 0, title: 'Draw the Thermal Line', hint: 'The Council decides how much waste heat Earth’s surface may shed.', advisor: 'iris', done: (s) => !!sy5(s)?.thermalLine }),
  a5({ id: 'a5-sky', phase: 0, title: 'Decide who owns the sky', hint: 'The Commons, Concessions or Claims.', advisor: 'sol', done: (s) => !!sy5(s)?.ownership }),
  a5({ id: 'a5-seed', phase: 0, title: 'Plant the first seed foundry', hint: 'System → Foundries: a seed at the Moon, a Lagrange yard or a claimed asteroid.', advisor: 'kip', done: (s) => (sy5(s)?.foundries.length ?? 0) > 0 }),
  a5({ id: 'a5-plan', phase: 0, title: 'Set the first era plan', hint: 'Priorities, the growth dial, reinvestment, minds or people, then jump.', advisor: 'bit', after: ['a5-line', 'a5-sky'], done: (s) => (sy5(s)?.stage ?? 0) >= 1 }),
  // stage 1 · the foundries
  a5({ id: 'a5-survey', phase: 1, title: 'Survey the asteroids', hint: 'System → Asteroids: a survey maps the rocks within reach.', advisor: 'mira', done: (s) => Object.values(sy5(s)?.asteroids ?? {}).some((a) => a.status >= 1) }),
  a5({ id: 'a5-claims', progress: (s) => { const n = Object.values(sy5(s)?.asteroids ?? {}).filter((a) => a.status >= 2).length; return prog(n, 3, `${n} / 3 claimed`); }, phase: 1, title: 'Three asteroids claimed', hint: 'Claim surveyed rocks for the Charter (or let the claimants race, under Claims).', advisor: 'sol', done: (s) => Object.values(sy5(s)?.asteroids ?? {}).filter((a) => a.status >= 2).length >= 3 }),
  a5({ id: 'a5-arcs', progress: (s) => prog(sy5(s)?.collectors ?? 0, 20, `${(sy5(s)?.collectors ?? 0).toFixed(1)} / 20 TW of collectors`), phase: 1, title: 'Light two arcs of the swarm', hint: 'The foundries build collectors as fast as there is something to use them.', advisor: 'kip', done: (s) => (sy5(s)?.collectors ?? 0) >= 20 }),
  // stage 2 · the swarm
  a5({ id: 'a5-pw', progress: kGoal(0.9), phase: 2, title: 'Reach Kardashev 0.90', hint: 'One petawatt: grid-scale abundance times ten.', advisor: 'bit', done: (s) => s.stats.K >= 0.9 }),
  a5({ id: 'a5-habitat', phase: 2, title: 'Build a habitat at L5', hint: 'System → Swarm: towns in rotating cylinders.', advisor: 'kip', done: (s) => (s.charter?.projects ?? []).some((p) => p.kind === 'habitat' && p.status === 'done') }),
  // stage 3 · the last climb: the Type I checklist (live; Solar Maximum starts when every item holds at once)
  a5({ id: 'a5-k99', progress: kGoal(0.99), phase: 3, title: 'Kardashev 0.99', hint: 'About 8 PW: almost all of it caught and used in space.', advisor: 'bit', goal: true, done: (s) => check5(s, 'k99') }),
  a5({ id: 'a5-under', phase: 3, title: 'Earth within its Thermal Line', hint: 'Surface power (Earth’s own plus beams) at or under the line.', advisor: 'iris', goal: true, done: (s) => check5(s, 'line') }),
  a5({ id: 'a5-wellbeing', phase: 3, title: 'Every province’s wellbeing ≥ 60', hint: 'Gardens, clinics, beams and the old Act IV levers.', advisor: 'sol', goal: true, done: (s) => check5(s, 'wellbeing') }),
  a5({ id: 'a5-warming', phase: 3, title: 'Warming under 2.0 °C', hint: 'Waste heat counts now: capture carbon to make room for it.', advisor: 'iris', goal: true, done: (s) => check5(s, 'warming') }),
  a5({ id: 'a5-escape', phase: 3, title: 'Longevity escape velocity', hint: 'Healthy life expectancy rising more than a year every year.', advisor: 'bit', goal: true, done: (s) => check5(s, 'escape') }),
  a5({ id: 'a5-minds', phase: 3, title: 'The minds at peace', hint: 'A seat settled and their mood at 50 or more.', advisor: 'iris', goal: true, done: (s) => check5(s, 'minds') }),
  a5({ id: 'a5-margin', phase: 3, title: 'World safety margin ≥ 0', hint: 'Evals, interpretability and drift sentinels.', advisor: 'iris', goal: true, done: (s) => check5(s, 'margin') }),
  a5({ id: 'a5-mercury', phase: 3, title: 'Mercury surveyed', hint: 'System → Swarm: the Mercury survey (stage 3).', advisor: 'kip', goal: true, done: (s) => check5(s, 'mercury') }),
  a5({ id: 'a5-solarmax', phase: 4, title: 'Come through Solar Maximum', hint: 'Hold the storm, the Thermal Line and the minds for 120 days.', advisor: 'sol', goal: true, done: (s) => !!sy5(s)?.solarmax?.done }),
  a5({ id: 'a5-typei', progress: kGoal(1), phase: 4, title: 'Kardashev 1.0000', hint: 'Ten petawatts. Type I.', advisor: 'bit', goal: true, done: (s) => !!sy5(s)?.typeI }),
);
/** Act V's Type I checklist ids (the gate itself is typeIChecklist in sim/act5.ts, checked live). */
export const TYPE_I_GOALS = ['a5-k99', 'a5-under', 'a5-wellbeing', 'a5-warming', 'a5-escape', 'a5-minds', 'a5-margin', 'a5-mercury'];

/** Act IV's planetary checklist ids (the gate itself is planetChecklist in sim/act4.ts, checked live). */
export const PLANET_GOALS = ['a4-k080', 'a4-grid', 'a4-fusion', 'a4-orbit', 'a4-moon', 'a4-wellbeing', 'a4-warming', 'a4-aiprov'];

/** The Charter Mandate: when it is met, The Threshold begins. */
export const MANDATE_GOALS = ['a3-k075', 'a3-clean', 'a3-chips', 'a3-access40', 'a3-regime', 'a3-legit', 'a3-orbital'];

/** The IPO checklist that starts The Crunch. */
export const IPO_GOALS = ['a2-gw-it', 'a2-gw-gen', 'a2-bit4', 'a2-rev1b', 'a2-frontier', 'a2-safe'];
export const SERIES_B_GOALS = ['a2-it100', 'a2-bit3', 'a2-rev75'];

export const OBJECTIVE_BY_ID: Record<string, ObjectiveDef> = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

/** Objectives that belong to the current act and phase. */
export function actObjectives(s: GameState): ObjectiveDef[] {
  const act = s.act ?? 1;
  const phase = act === 5 ? (s.system?.stage ?? 0) : act === 4 ? (s.planet?.stage ?? 0) : act === 3 ? (s.charter?.phase ?? 1) : s.phase;
  return OBJECTIVES.filter((o) => (o.act ?? 1) === act && (act === 1 || (o.phase ?? 1) <= phase));
}

export function visibleObjectives(s: GameState): ObjectiveDef[] {
  const open = actObjectives(s).filter((o) => !s.objectives.done.includes(o.id) && !(o.live && o.done(s)) && (o.after ?? []).every((a) => s.objectives.done.includes(a)));
  const act = s.act ?? 1;
  if (act !== 2 && act !== 3) return open;
  // Acts II–III: the phase's headline goals (the checklist that moves the story) before leftovers from earlier phases
  const phase = act === 3 ? (s.charter?.phase ?? 1) : s.phase;
  const rank = (o: ObjectiveDef) => ((o.phase ?? 1) === phase ? 0 : 2) + (o.goal ? 0 : 1);
  return open
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
}

export function goalsMetForSeriesA(s: GameState): boolean {
  return ['online', 'train2', 'revenue', 'margin'].every((id) => s.objectives.done.includes(id)) && currentCapability(s) > 0;
}
