import type { AdvisorId, GameState } from '../sim/types';
import { currentCapability } from '../sim/model';

export interface ObjectiveDef {
  id: string;
  title: string;
  hint: string;
  advisor: AdvisorId;
  done: (s: GameState) => boolean;
  /** Shown only after these are complete. */
  after?: string[];
  reward?: { cash?: number; rp?: number; text: string };
  /** Part of the Act I goal checklist. */
  goal?: boolean;
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

export const OBJECTIVE_BY_ID: Record<string, ObjectiveDef> = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

export function visibleObjectives(s: GameState): ObjectiveDef[] {
  return OBJECTIVES.filter((o) => !s.objectives.done.includes(o.id) && (o.after ?? []).every((a) => s.objectives.done.includes(a)));
}

export function goalsMetForSeriesA(s: GameState): boolean {
  return ['online', 'train2', 'revenue', 'margin'].every((id) => s.objectives.done.includes(id)) && currentCapability(s) > 0;
}
