/**
 * Act II bloc politics: government relations (separate from local trust), export rules and
 * licences, elections that can flip a bloc's stance, summits, treaties and sovereign deals.
 */
import { REGIONS, type Stance } from '../content/regions';
import { REGION_IDS, type RegionId } from '../content/mapcodes';
import { siteDef } from '../content/sites';
import { ELECTION_DAYS, EXPORT_RULES, RULE_BY_ID, SOVEREIGN, SOVEREIGN_BY_ID, TREATY_BY_ID } from '../content/politics';
import { HALLS } from '../content/facilities';
import type { GameState, SupplierId } from './types';
import { clamp, fmtMoney, news, nextId, pick, rand } from './core';
import { addModifier, techMult } from './effects';
import { earn } from './economy';
import { facilityIT } from './model';
import { queueEvent } from './events';

const STANCES: Stance[] = ['cautious', 'neutral', 'accelerate'];

/** Relation baseline for a bloc (what it drifts back to). */
export function relationBase(r: RegionId): number {
  return Math.round(40 + (REGIONS[r].license0 - 50) * 0.4);
}

export function addRelation(s: GameState, r: RegionId, d: number): void {
  const b = s.blocs[r];
  if (!b) return;
  b.relation = clamp(b.relation + (d > 0 ? d * techMult(s, 'relationGain') : d), 0, 100);
}

export function addRelationAll(s: GameState, d: number | ((r: RegionId) => number)): void {
  for (const r of REGION_IDS) addRelation(s, r, typeof d === 'number' ? d : d(r));
}

function ruleActive(s: GameState, id: string): boolean {
  return s.politics.rules.includes(id);
}

function licensed(s: GameState, rule: string, region: RegionId): boolean {
  return s.blocs[region]?.licences.includes(rule) ?? false;
}

/** The export rule that blocks shipping this supplier's accelerators into a region, if any. */
export function orderBlockedBy(s: GameState, supplier: SupplierId, dest: RegionId) {
  if ((s.act ?? 1) < 2) return null;
  for (const id of s.politics.rules) {
    const r = RULE_BY_ID[id];
    if (!r || (r.item !== 'accelerators' && r.item !== 'hbm')) continue;
    if (!r.to.includes(dest)) continue;
    if (r.suppliers && !r.suppliers.includes(supplier)) continue;
    if (supplier === 'own' && r.item === 'accelerators' && !r.suppliers?.includes('own')) continue;
    if (licensed(s, id, dest)) continue;
    return r;
  }
  return null;
}

/** Whether Veldt's EUV tools can't reach a fab in this region right now. */
export function euvBlocked(s: GameState, region: RegionId): boolean {
  if ((s.act ?? 1) < 2) return false;
  return ruleActive(s, 'euv-licensing') && RULE_BY_ID['euv-licensing'].to.includes(region) && !licensed(s, 'euv-licensing', region);
}

/** Licence applications in flight for a rule/region. */
export function licencePending(s: GameState, rule: string, region: RegionId): boolean {
  return s.politics.pending.some((p) => p.rule === rule && p.region === region);
}

/** IT MW you have online in a bloc. */
export function blocIT(s: GameState, r: RegionId): number {
  let mw = 0;
  for (const f of s.facilities) if (HALLS.includes(f.type) && f.status === 'online' && siteDef(f.siteId).region === r) mw += facilityIT(f);
  return mw;
}

/** Step a bloc's stance one notch toward accelerate (+1) or cautious (−1). */
function shiftStance(s: GameState, r: RegionId, dir: number): Stance {
  const b = s.blocs[r];
  const i = clamp(STANCES.indexOf(b.stance) + dir, 0, 2);
  b.stance = STANCES[i];
  return b.stance;
}

export function tickPolitics(s: GameState): void {
  if ((s.act ?? 1) < 2) return;
  const p = s.politics;

  // licences come through
  if (p.pending.length) {
    const ready = p.pending.filter((x) => x.readyDay <= s.day);
    p.pending = p.pending.filter((x) => x.readyDay > s.day);
    for (const x of ready) {
      const b = s.blocs[x.region];
      if (!b.licences.includes(x.rule)) b.licences.push(x.rule);
      news(s, `📜 Licence granted: ${RULE_BY_ID[x.rule]?.name ?? x.rule} for ${REGIONS[x.region].name}.`, 'good');
    }
  }

  // elections
  for (const r of REGION_IDS) {
    const b = s.blocs[r];
    if (s.day < b.nextElection) continue;
    b.nextElection = s.day + ELECTION_DAYS;
    const swing = b.poll + (rand(s) - 0.5) * 0.6;
    const before = b.stance;
    const after = swing > 0.35 ? shiftStance(s, r, 1) : swing < -0.35 ? shiftStance(s, r, -1) : before;
    b.poll = 0;
    if (after !== before) queueEvent(s, 'election', { region: r, from: before, to: after });
    else news(s, `🗳 ${REGIONS[r].name} re-elects a ${after} government. Little changes.`);
    // a newly cautious government may tighten the rules it controls; an accelerating one may relax them
    for (const rule of EXPORT_RULES) {
      if (rule.by !== r) continue;
      if (after === 'cautious' && before !== 'cautious' && !p.rules.includes(rule.id) && rand(s) < 0.6) {
        p.rules.push(rule.id);
        news(s, `⛔ ${REGIONS[r].name} imposes ${rule.name}.`, 'bad');
      }
      if (after === 'accelerate' && before !== 'accelerate' && p.rules.includes(rule.id) && rand(s) < 0.4) {
        p.rules = p.rules.filter((x) => x !== rule.id);
        news(s, `✅ ${REGIONS[r].name} lifts ${rule.name}.`, 'good');
      }
    }
  }

  // monthly drift
  if (s.day % 30 === 0) {
    const margin = s.stats.margin;
    for (const r of REGION_IDS) {
      const b = s.blocs[r];
      const base = relationBase(r);
      let d = (base - b.relation) * 0.03;
      const it = blocIT(s, r);
      if (it > 0) d += Math.min(2, it / 120) * (b.stance === 'cautious' ? 0.6 : 1);
      if (b.stance === 'cautious') d += margin < -0.5 ? -1 : margin > 0.5 ? 0.5 : 0;
      if (b.stance === 'accelerate' && it > 200) d += 0.5;
      addRelation(s, r, d);
      b.lobby *= 0.8;
      b.poll = clamp(b.poll + (rand(s) - 0.5) * 0.12, -1, 1);
      if (b.lobby > 2.5 && rand(s) < 0.08 * (b.lobby - 2)) queueEvent(s, 'lobby-scandal', { region: r });
    }
    // treaty obligations
    for (const id of p.treaties) {
      const t = TREATY_BY_ID[id];
      if (t?.minSafety && s.alloc.safety + 1e-9 < t.minSafety) {
        s.flags[`breach:${id}`] = Number(s.flags[`breach:${id}`] ?? 0) + 1;
        addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? -3 : -1));
        news(s, `⚠ You are breaking the ${t.name} (safety below ${Math.round(t.minSafety * 100)}%).`, 'bad');
        if (Number(s.flags[`breach:${id}`]) >= 3) {
          p.treaties = p.treaties.filter((x) => x !== id);
          addRelationAll(s, (r) => (s.blocs[r].stance === 'cautious' ? -8 : -3));
          news(s, `❌ Expelled from the ${t.name}.`, 'bad');
        }
      } else s.flags[`breach:${id}`] = 0;
    }
    tickSovereign(s);
  }

  // summits (phase 2+)
  if (s.phase >= 2 && p.nextSummit > 0 && s.day >= p.nextSummit) {
    p.nextSummit = s.day + 540;
    queueEvent(s, 'summit', { host: pick(s, ['eur', 'fab', 'mena', 'sas', 'atl'] as RegionId[]) });
  }
}

function tickSovereign(s: GameState): void {
  const deals = s.capital.sovereign;
  // offers expire; active deals succeed or fail
  for (const d of deals) {
    if (d.status === 'offer' && s.day > d.expires) d.status = 'failed';
    if (d.status !== 'active') continue;
    const def = SOVEREIGN_BY_ID[d.def];
    if (blocIT(s, d.region) >= d.needMW) {
      d.status = 'done';
      if (def.cash) earn(s, 'funding', def.cash);
      addRelation(s, d.region, def.relation);
      if (def.power) addModifier(s, `region:${d.region}:price`, 99_999, `${def.title}: cheap power`, { mult: def.power });
      if (def.permit) addModifier(s, `region:${d.region}:permit`, 99_999, `${def.title}: fast permits`, { mult: def.permit });
      news(s, `🤝 ${REGIONS[d.region].name}: ${def.title} delivered${def.cash ? ` — ${fmtMoney(def.cash)} received` : ''}.`, 'good');
    } else if (s.day > d.byDay) {
      d.status = 'failed';
      addRelation(s, d.region, -15);
      news(s, `❌ You missed the deadline on ${REGIONS[d.region].name}'s ${def.title}. Relations sour.`, 'bad');
    }
  }
  s.capital.sovereign = deals.filter((d) => d.status !== 'failed' || s.day - d.byDay < 365);
  // new offers
  if (s.phase < 2) return;
  const open = deals.filter((d) => d.status === 'offer').length;
  if (open >= 2 || rand(s) > 0.3) return;
  const taken = new Set(deals.map((d) => d.def));
  const options = SOVEREIGN.filter((d) => !taken.has(d.id)).flatMap((d) => d.regions.filter((r) => s.blocs[r].relation >= 40).map((r) => ({ d, r })));
  if (!options.length) return;
  const { d, r } = pick(s, options);
  s.capital.sovereign.push({ id: nextId(s, 'sv'), def: d.id, region: r, status: 'offer', needMW: d.needMW, byDay: s.day + d.days, expires: s.day + 180 });
  news(s, `🏛 ${REGIONS[r].name} offers a ${d.title}: ${d.reward}.`, 'event');
}
