import type { AdvisorId, GameState } from '../sim/types';
import { currentCapability, facilityMW } from '../sim/model';
import { FACILITIES, FIRM, GENERATORS } from './facilities';

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
  /** Act II phase it appears in. */
  phase?: number;
}

const dcOnlineWithChips = (s: GameState) =>
  s.facilities.some((f) => f.type === 'datacenter' && f.status === 'online' && (f.racks ?? []).reduce((a, r) => a + r.qty, 0) >= 1000);

export const OBJECTIVES: ObjectiveDef[] = [
  { id: 'rent', title: 'Rent compute from Cumulus Cloud', hint: 'Open Compute (🧮) and rent at least 500 accelerators.', advisor: 'bit', done: (s) => s.rental.units >= 500 || s.models.length > 0 },
  { id: 'train1', title: 'Train Bit-1', hint: 'In Compute, start the Bit-1 training run and give it some of your compute.', advisor: 'bit', done: (s) => s.models.length >= 1, after: ['rent'], reward: { rp: 10, text: '+10 research' } },
  { id: 'research', title: 'Research your first technology', hint: 'Open Research (🔬) and pick a project. Research flows from your HQ and labs.', advisor: 'iris', done: (s) => s.research.done.length >= 1 },
  { id: 'dc', title: 'Start building a data center', hint: 'Click a site on the map — somewhere with cheap power and space — and build a Data Center.', advisor: 'juno', done: (s) => s.facilities.some((f) => f.type === 'datacenter'), after: ['train1'] },
  { id: 'power', title: 'Line up power for your data center', hint: 'At the same site: request a grid connection, or build solar + batteries, wind or gas.', advisor: 'juno', done: (s) => s.facilities.some((f) => f.type === 'datacenter' && (s.sites[f.siteId].grid.mw + s.sites[f.siteId].grid.pending.reduce((a, p) => a + p.mw, 0) > 0 || s.facilities.some((g) => g.siteId === f.siteId && ['solar', 'wind', 'gas'].includes(g.type)))), after: ['dc'] },
  { id: 'order', title: 'Order accelerators', hint: 'Open Orders (📦). Lumen chips are faster; Kestrel’s queue is shorter. Ship to your data center site.', advisor: 'mira', done: (s) => s.orders.length > 0 || s.shipments.length > 0 || s.facilities.some((f) => (f.racks ?? []).length > 0), after: ['dc'] },
  { id: 'safety', title: 'Put compute into safety research', hint: 'In Compute, give Safety at least 8%. Iris recommends ~10% as much as you spend on training.', advisor: 'iris', done: (s) => s.alloc.safety >= 0.08, after: ['train1'] },
  { id: 'online', title: 'Bring your data center online with 1,000+ chips', hint: 'Once built, delivered accelerators install automatically. Make sure it has power!', advisor: 'juno', done: dcOnlineWithChips, after: ['order', 'power'], goal: true },
  { id: 'train2', title: 'Train Bit-2 (2×10²⁶ FLOP)', hint: 'Start the Bit-2 run in Compute. It needs a lot more compute than Bit-1.', advisor: 'bit', done: (s) => s.models.length >= 2, after: ['train1'], goal: true, reward: { rp: 25, text: '+25 research' } },
  { id: 'revenue', title: 'Reach $5M/month revenue', hint: 'Inference revenue grows with model quality and how much compute you serve with.', advisor: 'penny', done: (s) => s.stats.revenueMonth >= 5e6, after: ['train1'], goal: true },
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
  a2({ id: 'a2-relations', phase: 1, title: 'Win a friend in government', hint: 'Open the Blocs screen. Lobby, sign a treaty or build locally until a bloc’s relations reach 65.', advisor: 'sol', done: (s) => Object.values(s.blocs).some((b) => b.relation >= 65) }),
  a2({ id: 'a2-it100', phase: 1, title: 'Bring 100 MW of IT capacity online', hint: 'Bigger halls (upgrade to 50 MW) and more of them.', advisor: 'juno', goal: true, done: (s) => s.stats.itMW >= 100 }),
  a2({ id: 'a2-bit3', phase: 1, title: 'Train Bit-3', hint: 'Start the Bit-3 run in Compute. It wants about 10× Bit-2’s compute.', advisor: 'bit', goal: true, done: (s) => s.models.length >= 3, reward: { rp: 40, text: '+40 research' } }),
  a2({ id: 'a2-rev75', phase: 1, title: 'Reach $75M/month revenue', hint: 'More chips serving customers, better models, more markets.', advisor: 'penny', goal: true, done: (s) => s.stats.revenueMonth >= 75e6 }),
  a2({ id: 'a2-seriesB', phase: 1, title: 'Raise your Series B', hint: 'Meet the three goals above and Penny will bring the term sheets.', advisor: 'penny', goal: true, after: ['a2-it100', 'a2-bit3', 'a2-rev75'], done: (s) => s.finance.round === 'B' || s.finance.round === 'IPO' }),
  // ── Phase 2 · The Stack ──
  a2({ id: 'a2-deal', phase: 2, title: 'Sign a supply deal', hint: 'Deals → Supply: reserve wafers, lock in HBM or book packaging slots.', advisor: 'mira', done: (s) => s.stack.deals.length > 0 }),
  a2({ id: 'a2-pkg', phase: 2, title: 'Build a packaging plant or start a fab', hint: 'Both are new facilities. The fab needs water, firm power and Veldt’s tools.', advisor: 'mira', done: (s) => s.facilities.some((f) => f.type === 'packaging' || f.type === 'fab') }),
  a2({ id: 'a2-contract', phase: 2, title: 'Win an enterprise contract', hint: 'Deals → Customers. Guaranteed revenue, as long as you deliver.', advisor: 'penny', done: (s) => s.capital.contracts.length > 0 }),
  a2({ id: 'a2-stake', phase: 2, title: 'Take a stake in a mine', hint: 'Click a mine on the map. A stake hedges the price swings of what it digs up.', advisor: 'mira', done: (s) => Object.values(s.stack.stakes).some((v) => v > 0) }),
  a2({ id: 'a2-review', phase: 2, title: 'Pass a board review', hint: 'Grow revenue by the board’s target each quarter. Finance → Board.', advisor: 'penny', done: (s) => !!s.flags.boardPassed }),
  a2({ id: 'a2-sovereign', phase: 2, title: 'Accept a sovereign deal', hint: 'Blocs make offers on the Blocs screen: build there, get grants and cheap power.', advisor: 'sol', done: (s) => s.capital.sovereign.some((d) => d.status === 'active' || d.status === 'done') }),
  // ── Phase 3 · The Race (the IPO checklist) ──
  a2({ id: 'a2-gw-it', phase: 3, title: '1 GW of IT capacity online', hint: '200 MW halls and the Gigawatt Campus get you there.', advisor: 'juno', goal: true, done: (s) => s.stats.itMW >= 1000 }),
  a2({ id: 'a2-gw-gen', phase: 3, title: '1 GW of your own generation, 60% carbon-free', hint: 'Nameplate capacity of your plants. Solar, wind, hydro, geothermal and nuclear count as clean.', advisor: 'juno', goal: true, done: (s) => genNameplate(s) >= 1000 && genNameplate(s, true) >= 0.6 * genNameplate(s) }),
  a2({ id: 'a2-bit4', phase: 3, title: 'Train Bit-4', hint: 'The big one. Every gigawatt helps.', advisor: 'bit', goal: true, done: (s) => s.models.length >= 4, reward: { rp: 60, text: '+60 research' } }),
  a2({ id: 'a2-rev1b', phase: 3, title: 'Reach $1B/month revenue', hint: 'Markets, contracts and a model near the frontier.', advisor: 'penny', goal: true, done: (s) => s.stats.revenueMonth >= 1e9 }),
  a2({ id: 'a2-frontier', phase: 3, title: 'Match Meridian at the frontier', hint: 'Release a model at least as capable as Meridian’s best.', advisor: 'bit', goal: true, done: (s) => !!s.flags.reachedFrontier }),
  a2({ id: 'a2-safe', phase: 3, title: 'A clean safety record', hint: 'Safety margin ≥ −0.25 and no major incident in the last 12 months.', advisor: 'iris', goal: true, done: (s) => s.stats.margin >= -0.25 && s.models.length >= 3 && s.day - Number(s.flags.lastMajorIncident ?? -9999) > 365 }),
  a2({ id: 'a2-crunch', phase: 4, title: 'Come through The Crunch', hint: 'Hold the grid, the supply chain and public trust for 90 days.', advisor: 'sol', goal: true, done: (s) => !!s.finale?.done }),
  a2({ id: 'a2-ipo', phase: 4, title: 'Ring the bell: IPO', hint: 'Penny has the bankers on speed dial.', advisor: 'penny', goal: true, after: ['a2-crunch'], done: (s) => !!s.flags.act2Complete }),
);

/** The IPO checklist that starts The Crunch. */
export const IPO_GOALS = ['a2-gw-it', 'a2-gw-gen', 'a2-bit4', 'a2-rev1b', 'a2-frontier', 'a2-safe'];
export const SERIES_B_GOALS = ['a2-it100', 'a2-bit3', 'a2-rev75'];

export const OBJECTIVE_BY_ID: Record<string, ObjectiveDef> = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

/** Objectives that belong to the current act and phase. */
export function actObjectives(s: GameState): ObjectiveDef[] {
  const act = s.act ?? 1;
  return OBJECTIVES.filter((o) => (o.act ?? 1) === act && (act !== 2 || (o.phase ?? 1) <= s.phase));
}

export function visibleObjectives(s: GameState): ObjectiveDef[] {
  return actObjectives(s).filter((o) => !s.objectives.done.includes(o.id) && (o.after ?? []).every((a) => s.objectives.done.includes(a)));
}

export function goalsMetForSeriesA(s: GameState): boolean {
  return ['online', 'train2', 'revenue', 'margin'].every((id) => s.objectives.done.includes(id)) && currentCapability(s) > 0;
}
