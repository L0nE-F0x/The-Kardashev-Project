import * as A from '../../src/sim/actions';
import { resolveEvent } from '../../src/sim/events';
import { TECHS } from '../../src/content/techs';
import { EVENT_BY_ID } from '../../src/content/events';
import { DEALS } from '../../src/content/stack';
import { BUILD_SITES, siteOpen } from '../../src/content/sites';
import { CABLES } from '../../src/content/network';
import type { GameState } from '../../src/sim/types';
import { buildCost, siteSlots } from '../../src/sim/model';
import { creditLeft } from '../../src/sim/capital';
import { exportBlock } from '../../src/sim/politics';
import { CONTRACT_SLA, contractDeliverable } from '../../src/sim/network';

const require_credit = (s: GameState) => creditLeft(s) * 0.8;

export function autoResolve(s: GameState) {
  let guard = 0;
  while (s.events.active && guard++ < 20) {
    const def = EVENT_BY_ID[s.events.active.id];
    const choices = def.choices(s, s.events.active.ctx);
    const idx = Math.max(0, choices.findIndex((c) => !c.disabled));
    resolveEvent(s, idx);
  }
}

/** A competent-but-simple Act II player: delegates to advisors, grows halls, signs the obvious deals. */
/**
 * The Act II bot: delegates to the advisors' jobs and expands where it can. `careful` (the balance
 * report) scales the advisors' budgets and its cash reserve to the money it started the act with.
 */
export function botDay(s: GameState, careful = false) {
  autoResolve(s);
  if (s.act < 2) return;
  if (careful && s.flags.botCash === undefined) s.flags.botCash = s.finance.cash;
  const k = careful ? Math.min(1, Number(s.flags.botCash) / 2e9) : 1;
  if (!s.jobs.mira?.on) {
    A.setJob(s, 'mira', { on: true, a: 400e6 * k });
    A.setJob(s, 'penny', { on: true, a: 250e6 * k });
    A.setJob(s, 'juno', { on: true, a: 0.25, b: 0 });
    A.setJob(s, 'iris', { on: true, a: 0.05 });
    A.setJob(s, 'bit', { on: true, a: 0.45 });
    A.setJob(s, 'sol', { on: true, a: 30e6 });
  }
  if (!s.research.current) {
    const next = TECHS.find((t) => !s.research.done.includes(t.id) && A.techAvailable(s, t.id) && (t.requires ?? []).every((r) => s.research.done.includes(r)));
    if (next) A.setResearch(s, next.id);
  }
  if (s.day % 30 !== 0) return;
  // markets: lease the cables touching where we are
  if (s.network.leases.length < 2) {
    const c = CABLES.find((x) => !s.network.leases.includes(x.id));
    if (c) A.leaseCable(s, c.id);
  }
  // halls: upgrade first, then new halls, then land
  const reserve = (s.phase >= 2 ? 600e6 : 300e6) / (careful ? Math.max(0.5, k) : 1);
  for (const f of s.facilities) {
    const fillNow = s.stats.installedAccel / Math.max(1, (s.stats.itMW * 1000) / 1.3);
    if ((f.type === 'lab' || (f.type === 'datacenter' && fillNow > 0.45)) && A.canUpgrade(s, f.id) === null && s.finance.cash > reserve * 2) {
      A.upgradeFacility(s, f.id);
      break;
    }
  }
  const hallSites = [...new Set(s.facilities.filter((f) => f.type === 'datacenter').map((f) => f.siteId))];
  // a new hall only where there's room left for power next to it, and the existing halls are mostly full
  const fill = s.stats.installedAccel / Math.max(1, (s.stats.itMW * 1000) / 1.3);
  for (const id of hallSites) {
    if (s.finance.cash < reserve * 2 || fill < 0.55) break;
    if (siteSlots(s, id) - A.slotsUsed(s, id) >= 2 && A.canBuild(s, id, 'datacenter') === null) A.build(s, id, 'datacenter');
  }
  // spread out: one more campus per phase, where the grid has room and power is cheap — and chips can be shipped
  // (a player reads the export-rule warning on the site before building there)
  if (s.day % 90 === 0 && hallSites.length < s.phase + 1 && s.finance.cash > 1e9) {
    const used = new Set(s.facilities.map((f) => f.siteId));
    const pickSite = BUILD_SITES.filter((x) => !used.has(x.id) && siteOpen(x, s.act, s.phase) && x.slots >= 4 && A.canBuild(s, x.id, 'datacenter') === null && exportBlock(s, x.id) === null)
      .sort((a, b) => b.gridHeadroom / b.priceMult - a.gridHeadroom / a.priceMult)[0];
    if (pickSite) {
      A.build(s, pickSite.id, 'datacenter');
      A.requestGrid(s, pickSite.id, 50);
    }
  }
  // phase 2: the stack, contracts, sovereign deals
  if (s.phase >= 2) {
    for (const d of DEALS) if (s.finance.cash > reserve * 3 && A.canSignDeal(s, d.id) === null) A.signDeal(s, d.id);
    // a careful player only signs what the preview says it can deliver in full
    for (const o of [...s.capital.offers]) if (o.units < s.stats.installedAccel * 0.15 && contractDeliverable(s, o).frac >= CONTRACT_SLA) A.acceptContract(s, o.id);
    for (const d of s.capital.sovereign) if (d.status === 'offer') A.acceptSovereign(s, d.id);
    if (!s.facilities.some((f) => f.type === 'packaging') && s.finance.cash > 3e9) {
      const site = hallSites.find((id) => A.canBuild(s, id, 'packaging') === null);
      if (site) A.build(s, site, 'packaging');
    }
  }
  // phase 3: a megasite campus, financed with debt if needed
  if (s.phase >= 3 && !s.facilities.some((f) => f.type === 'campus')) {
    const mega = BUILD_SITES.filter((x) => x.megasite && siteOpen(x, s.act, s.phase)).sort((a, b) => b.solarCF + b.windCF - a.solarCF - a.windCF)[0];
    if (mega) {
      const cost = buildCost(s, 'campus');
      if (s.finance.cash < cost * 1.15 && s.finance.cash + creditLeft(s) > cost * 1.3) A.borrow(s, Math.min(creditLeft(s), cost * 1.2 - s.finance.cash));
      if (A.canBuild(s, mega.id, 'campus') === null) {
        A.build(s, mega.id, 'campus');
        A.requestGrid(s, mega.id, 50);
      }
    }
  }
  // borrow against assets when it's cheap growth
  if (s.finance.cash < 1e9 && s.capital.loans.length < 6) A.borrow(s, Math.min(1.5e9, Math.max(0, require_credit(s))));
}

