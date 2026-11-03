/**
 * Act III: the blind trust. While it is on, your company runs without you: every advisor is on the
 * job, and a trustee does what nobody else's job covers (research picks, new halls, safe contracts).
 * The UI locks the company's own buttons; the sim actions stay open for the advisors.
 */
import { JOBS } from '../content/jobs';
import { TECHS } from '../content/techs';
import { HALLS } from '../content/facilities';
import type { GameState } from './types';
import * as A from './actions';
import { siteSlots } from './model';
import { creditLeft } from './capital';
import { news } from './core';

export function tickTrustee(s: GameState): void {
  const c = s.charter;
  if (!c?.blindTrust || s.flags.offline === 'skip') return;
  if (s.day % 7 !== 3) return;
  // every advisor on the job (keep your own settings where you made them)
  for (const j of JOBS) {
    const cur = s.jobs[j.advisor];
    if (cur?.on) continue;
    A.setJob(s, j.advisor, { on: true, a: cur?.a ?? j.a.def, b: cur?.b ?? j.b?.def });
  }
  // research never sits idle
  if (!s.research.current) {
    const next = TECHS.find((t) => !s.research.done.includes(t.id) && A.techAvailable(s, t.id) && (t.requires ?? []).every((r) => s.research.done.includes(r)));
    if (next) A.setResearch(s, next.id);
  }
  if (s.day % 28 !== 3) return;
  const reserve = Math.max(2e9, (s.jobs.penny?.a ?? 1e9) * 1.5);
  // grow: expand a nearly full hall, or add a hall where there's room
  const capacity = (s.stats.itMW * 1000) / 1.3;
  const fill = s.stats.installedAccel / Math.max(1, capacity);
  if (fill > 0.6 && s.finance.cash > reserve * 2) {
    const hall = s.facilities.find((f) => HALLS.includes(f.type) && f.status === 'online' && A.canUpgrade(s, f.id) === null);
    if (hall && A.upgradeFacility(s, hall.id).ok) news(s, '🗂 Trustee: expanding a data hall.');
    else {
      const sites = [...new Set(s.facilities.filter((f) => HALLS.includes(f.type)).map((f) => f.siteId))];
      const site = sites.find((id) => siteSlots(s, id) - A.slotsUsed(s, id) >= 2 && A.canBuild(s, id, 'datacenter') === null);
      if (site && A.build(s, site, 'datacenter').ok) news(s, '🗂 Trustee: breaking ground on a new data hall.');
    }
  }
  // safe enterprise contracts
  for (const o of [...s.capital.offers]) if (o.units < s.stats.installedAccel * 0.15) A.acceptContract(s, o.id);
  // a little debt when cash runs thin and there's collateral
  if (s.finance.cash < reserve * 0.5 && creditLeft(s) > 1e9) A.borrow(s, Math.min(creditLeft(s) * 0.5, reserve), 'Trustee credit line');
}
