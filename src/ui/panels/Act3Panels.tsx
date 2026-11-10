/** Act III panels: the Charter (overview · contracts · missions · partners · world), the Council, the Charter desk and the Threshold tracker. */
import { useEffect, useState } from 'preact/hooks';
import { Bar, Choice, Icon, KV, Panel, Portrait, Slider, Toggle, useGame } from '../components';
import { ceoPortraitUrl } from '../../render3d/portraits/portraits';
import {
  CAT_NAMES,
  CHARTER_PHASES,
  CONTRACT_KINDS,
  CONTRACT_ORDER,
  DELEGATES,
  FACTION_IDS,
  FACTIONS,
  HVDC_ROUTES,
  MEGA_STAGES,
  MISSIONS,
  missionProgress,
  PARTNER_IDS,
  PARTNERS,
  SIZE_NAMES,
  THRESHOLD_DEADLINE,
  VOTES,
  WEALTH,
  whereName,
  YOU,
  type ContractCat,
} from '../../content/charter';
import { DESIGN_IDS, FUSION_DESIGNS, SUPERGRID_ROUTES } from '../../content/planet';
import { RESOLUTIONS, RESOLUTION_BY_ID } from '../../content/council';
import { OBJECTIVE_BY_ID, MANDATE_GOALS } from '../../content/objectives';
import { REGIONS } from '../../content/regions';
import { LAUNCH_SITES, MEGA_SITES, SITE_BY_ID } from '../../content/sites';
import { REGION_IDS, type RegionId } from '../../content/mapcodes';
import { fmtDate, fmtDays, fmtMoney, fmtMW } from '../../sim/core';
import type { ContractKind, ContractSize, FactionId, GameState, Project, Tender, ThresholdFront } from '../../sim/types';
import {
  activeProjects,
  affordable,
  bidScore,
  canAward,
  canPost,
  canSetBlindTrust,
  committedMonthly,
  conflictCost,
  contractEstimate,
  duesMonthly,
  duesOf,
  expediteCost,
  isLate,
  legitimacyParts,
  minAccess,
  monthlyPayment,
  partnerCapacity,
  partnerName,
  sizeText,
  traitsOf,
  willingness,
  youCanBid,
  TRUST_COOLDOWN,
} from '../../sim/charter';
import { canFavour, canMeetDemand, canTable, canWhip, demandCost, demandHint, favourCost, forecast, type Vote } from '../../sim/council';
import { carbonYearsLeft, charterGWByRegion, growthParts, worldClean } from '../../sim/world';
import { PLANET } from '../../content/planet';
import { capInForce, COMPUTE_CAP, ownRunStatus, worldFrontier, worldMargin } from '../../sim/frontier';
import { DESKS, bitTrusted } from '../../sim/desk';
import { FRONT3_NAMES, frontRise, MANDATE_FRONT, RENEWAL_MEANS, RENEWAL_NAMES, renewalForecast, renewalRecord, THRESHOLD_FRONTS } from '../../sim/threshold';
import { nextPhaseText } from '../../sim/act3';
import { megaView } from '../../sim/charterView';
import { seedPlaces as seedOptions } from '../../sim/foundries';
import { nextModelPlan } from '../../sim/ai';
import { ADVISORS } from '../../content/advisors';
import type { IconName } from '../icons';

export type CharterTab = 'overview' | 'contracts' | 'missions' | 'partners' | 'world';

const sign = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
const pips = (n: number) => '●'.repeat(Math.max(0, Math.min(5, n))) + '○'.repeat(Math.max(0, 5 - n));

/** CEO or delegate portrait. */
export function Face({ id, size = 32, mood }: { id: string; size?: number; mood?: 'neutral' | 'happy' | 'worried' | 'angry' | 'excited' }) {
  if (id === YOU) return <Portrait id="bit" size={size} mood={mood} />;
  return <img class="portrait" src={ceoPortraitUrl(id, mood ?? 'neutral')} style={{ width: `${size}px`, height: `${size}px` }} alt={id} draggable={false} />;
}

function Traits({ s, id }: { s: GameState; id: string }) {
  const t = traitsOf(s, id);
  const rows: [string, number, string][] = [
    ['Reliability', t.rel, 'How rarely their projects slip, overrun or strike.'],
    ['Speed', t.speed, 'How short the timelines they bid.'],
    ['Cost', t.cost, 'How cheaply they bid (more dots = cheaper).'],
    ['Ambition', t.ambition, 'How much they take on — and how much they over-promise.'],
    ['Ethics', t.ethics, 'How rarely they cause scandals.'],
  ];
  return (
    <div class="traits small">
      {rows.map(([k, v, tip]) => (
        <span key={k} data-tip={`${k}: ${v}/5. ${tip}`}>
          {k[0]} <span class="pips">{pips(v)}</span>
        </span>
      ))}
    </div>
  );
}

// ════════════════════════════════════════ THE CHARTER ════════════════════════════════════════
export function CharterPanel() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter;
  const tab = game.charterTab;
  if (!c) return null;
  const tabs: [CharterTab, string][] = [
    ['overview', 'Overview'],
    ['contracts', `Contracts${c.tenders.some((t) => t.bids.length) ? ` (${c.tenders.length})` : ''}`],
    ['missions', 'Missions'],
    ['partners', 'Partners'],
    ['world', 'World'],
  ];
  const next = nextPhaseText(s);
  return (
    <Panel title="The Kardashev Project" icon="charter" class="wide research" onClose={() => game.openPanel(null)} extra={<span class="small muted" data-tip={next?.tip}>Phase {Math.min(5, c.phase)} · {CHARTER_PHASES[c.phase]}</span>}>
      <div class="tabs" role="tablist">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={`btn small ${tab === id ? 'active' : ''}`} onClick={() => game.setCharterTab(id)} data-tut={`charter-${id}`}>
            {name}
          </button>
        ))}
      </div>
      {next && (
        <div class="small muted" style={{ margin: '2px 0 4px' }} data-tip={next.tip}>
          {next.text}
        </div>
      )}
      <div class="tabbody">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'contracts' && <ContractsTab />}
        {tab === 'missions' && <MissionsTab />}
        {tab === 'partners' && <PartnersTab />}
        {tab === 'world' && <WorldTab />}
      </div>
    </Panel>
  );
}

function OverviewTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const dues = duesMonthly(s);
  const committed = committedMonthly(s);
  const [gift, setGift] = useState(2e9);
  const trustWhy = canSetBlindTrust(s, !c.blindTrust);
  const recent = c.history.slice(-6);
  const lparts = legitimacyParts(s);
  const legitDrift = lparts.reduce((a, [, v]) => a + v, 0);
  const legitTip = `The blocs’ confidence in your stewardship. It shapes every vote, the dues and the renewal; below 35 the Council gets restless.\n\nNext month:\n${lparts.map(([l, v]) => `${sign(v, 1)} ${l}`).join('\n')}\n\nOn top of that: finished projects (+0.6 each), missions, cards, awards to your own company and lost fronts.`;
  // from the Frontier on, what the renewal vote would say today
  const fc = c.phase >= 3 && c.phase < 5 ? renewalForecast(s) : null;
  const fcTip = fc
    ? `If the Council voted today (${fc.yes}–${fc.no}, ${Math.round(fc.share * 100)}%):\n${REGION_IDS.map((r) => `${fc.votes[r] === 'yes' ? '✓' : '✗'} ${REGIONS[r].short} (${VOTES[r]}) ${sign(fc.lean[r], 2)}`).join('\n')}\n\nEvery bloc weighs: ${renewalRecord(s).map(([l, v]) => `${l} ${sign(v, 2)}`).join(' · ')} — then its own access, relations, faction tension and stance.${c.threshold?.done ? '' : ' The Threshold counts once it has been faced.'}\n\n${RENEWAL_MEANS[fc.outcome]}`
    : '';
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }} data-tut="treasury">
          <h4>
            <Icon name="charter" size="sm" /> Treasury
          </h4>
          <div class="bigv gold">{fmtMoney(c.budget)}</div>
          <KV
            rows={[
              ['Dues coming in', `${fmtMoney(dues)}/month`, `What the twelve blocs pay at today’s dues level (×${c.dues.toFixed(2)}), each scaled by its willingness: relations, your Legitimacy, walkouts.`],
              ['Committed to projects', <span class={committed > dues ? 'warn' : ''}>{fmtMoney(committed)}/month</span>, 'Progress payments on everything under construction. Commit more than comes in and, once the treasury runs dry, projects fall into arrears: they build at half speed and Legitimacy falls every month.'],
              ['Political capital', `${Math.round(c.capital)} / 100`, 'The Council currency: table resolutions, whip votes, emergency sessions. Earned monthly from your standing and Legitimacy.'],
              ['Next Council session', fmtDays(c.council.nextSession - s.day)],
              ['Charter standing', `${c.standing} / 3`, 'Fronts you held in the Crunch — your clout when the Charter was founded.'],
            ]}
          />
        </div>
        <div class="grow" style={{ minWidth: '240px' }} data-tut="legitimacy">
          <h4>
            <Icon name="legit" size="sm" /> Legitimacy
          </h4>
          <Bar value={c.legitimacy / 100} kind={c.legitimacy < 35 ? 'warn' : 'gold'} tall tip={legitTip} />
          <div class="small" style={{ margin: '4px 0' }} data-tip={legitTip}>
            {Math.round(c.legitimacy)} / 100 — {c.legitimacy >= 70 ? 'the Council trusts you' : c.legitimacy >= 50 ? 'steady' : c.legitimacy >= 35 ? 'questions are being asked' : 'the knives are out'} · <span class={legitDrift >= 0 ? 'good' : 'bad'}>{sign(legitDrift, 1)}/month</span>
          </div>
          <div class="small muted">Rises with delivered projects, fair awards, missions and the blind trust. Falls with self-dealing, arrears, late projects, scandals, walkouts — and a Charter that sits on its money and builds nothing.</div>
        </div>
      </div>
      <div class="section" data-tut="mandate">
        <h4>
          <Icon name="goals" size="sm" /> The Charter Mandate
        </h4>
        <div class="small muted" style={{ marginBottom: '4px' }}>
          When it is met, The Threshold begins — or on {fmtDate(THRESHOLD_DEADLINE, true)} at the latest. A goal still unmet then leaves its front of the Threshold weaker.
        </div>
        <div class="cardgrid">
          {MANDATE_GOALS.map((id) => {
            const o = OBJECTIVE_BY_ID[id];
            const done = s.objectives.done.includes(id) || o.done(s);
            return (
              <div key={id} class="small mandate" data-tip={`${o.hint}${MANDATE_FRONT[id] ? `\nStill unmet when the Threshold comes, it adds pressure to ${FRONT3_NAMES[MANDATE_FRONT[id]]}.` : ''}`}>
                <span class={done ? 'good' : 'muted'}>{done ? '✓' : '○'}</span> {o.title}
              </div>
            );
          })}
        </div>
        {fc && (
          <div class="small" style={{ marginTop: '6px' }} data-tip={fcTip}>
            <Icon name="vote" size="sm" /> If the Council voted on renewal today: <b>{fc.yes}–{fc.no}</b> ({Math.round(fc.share * 100)}%) ·{' '}
            <span class={fc.outcome === 'planetary' ? 'good' : fc.outcome === 'limited' ? 'warn' : 'bad'}>{RENEWAL_NAMES[fc.outcome]}</span>
          </div>
        )}
      </div>
      <div class="row wrap section" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }} data-tut="blind-trust">
          <h4>
            <Icon name="lock" size="sm" /> Two hats
          </h4>
          <Toggle
            label={c.blindTrust ? `${s.company.name} is in a blind trust` : `You run ${s.company.name} yourself`}
            hint={c.blindTrust ? 'Your advisors run it on standing orders; its buttons are locked. Conflicts cost far less; Legitimacy drifts up. Leaving costs Legitimacy −12.' : `Put it in a blind trust: Legitimacy +8, conflicts cost 70% less, but you can’t touch it (re-entry cooldown ${Math.round(TRUST_COOLDOWN / 30.4)} months after leaving).`}
            value={c.blindTrust}
            onChange={(v) => game.setBlindTrust(v)}
          />
          {trustWhy && <div class="small warn">{trustWhy}</div>}
        </div>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="cash" size="sm" /> Give to the Charter
          </h4>
          <Slider label="From company cash" value={Math.min(gift, Math.max(1e9, s.finance.cash))} min={1e9} max={Math.max(1e9, Math.min(50e9, s.finance.cash))} step={1e9} format={(v) => fmtMoney(v, 0)} onChange={setGift} />
          <button class="btn small" disabled={s.finance.cash < gift || c.blindTrust} onClick={() => game.donate(gift)} data-tip="Company cash → treasury. Legitimacy up a little (+1 per $2B, up to +6).">
            Donate {fmtMoney(gift, 0)}
          </button>
          {c.blindTrust && <div class="small muted">The trust manages the company’s cash.</div>}
        </div>
      </div>
      {recent.length > 0 && (
        <div class="section">
          <h4>Recent months</h4>
          <table class="ledger small">
            <thead>
              <tr>
                <th />
                {recent.map((m) => (
                  <th key={m.label}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['dues', 'income', 'payments', 'programmes', 'favours'] as const).map((k) => (
                <tr key={k}>
                  <td class="muted">{k}</td>
                  {recent.map((m) => (
                    <td key={m.label} class={k === 'dues' || k === 'income' ? 'good' : ''}>
                      {m[k] ? fmtMoney(m[k], 1) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── contracts ────────────────────────────────────────────────────────────────────────────────
export function whereOptions(s: GameState, kind: ContractKind): { id: string; name: string; note?: string }[] {
  const def = CONTRACT_KINDS[kind];
  switch (def.where) {
    case 'mega':
      // Act IV's fusion fleets and carbon capture can go at any megaproject site
      return MEGA_SITES.filter((m) => m.mega?.includes(kind) || kind === 'ffleet' || kind === 'dac')
        .sort((a, b) => (kind === 'solar' ? b.solarCF - a.solarCF : kind === 'wind' ? b.windCF - a.windCF : 0))
        .map((m) => ({ id: m.id, name: m.name, note: `${REGIONS[m.region].short} · stage ${megaView(s, m.id).stage}${kind === 'solar' ? ` · sun ${Math.round(m.solarCF * 100)}%` : kind === 'wind' ? ` · wind ${Math.round(m.windCF * 100)}%` : ''}` }));
    case 'route':
      return HVDC_ROUTES.map((r) => ({ id: r.id, name: r.name, note: `${r.km.toLocaleString()} km${r.subsea ? ' · subsea' : ''}` }));
    case 'launch':
      return LAUNCH_SITES.map((l) => ({ id: l.id, name: l.name, note: REGIONS[l.region].short }));
    case 'region':
      return [...REGION_IDS].sort((a, b) => (s.charter!.access[a] ?? 0) - (s.charter!.access[b] ?? 0)).map((r) => ({ id: r, name: REGIONS[r].name, note: `access ${Math.round(s.charter!.access[r] ?? 0)}` }));
    case 'global':
      return [{ id: 'global', name: 'Worldwide' }];
    case 'sgroute':
      return SUPERGRID_ROUTES.map((r) => ({ id: r.id, name: r.name, note: `${REGIONS[r.from].short}–${REGIONS[r.to].short} · ${r.km.toLocaleString()} km${r.subsea ? ' · subsea' : ''}` }));
    case 'space':
      return seedOptions(s);
    case 'design':
      return DESIGN_IDS.map((d) => ({ id: d, name: FUSION_DESIGNS[d].name, note: PARTNERS[FUSION_DESIGNS[d].partner]?.short }));
  }
}

function ContractsTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const draft = game.charterDraft;
  const [cat, setCat] = useState<ContractCat>(draft?.kind ? CONTRACT_KINDS[draft.kind].cat : 'energy');
  const [kind, setKind] = useState<ContractKind>(draft?.kind ?? 'solar');
  const [where, setWhere] = useState<string>(draft?.where ?? '');
  const [size, setSize] = useState<ContractSize>(2);
  // "Post a contract here" while this tab is already open: take the new draft
  useEffect(() => {
    if (!draft) return;
    if (draft.kind) {
      setCat(CONTRACT_KINDS[draft.kind].cat);
      setKind(draft.kind);
    }
    if (draft.where) setWhere(draft.where);
  }, [draft]);
  const def = CONTRACT_KINDS[kind];
  const options = whereOptions(s, kind);
  const w = options.find((o) => o.id === where)?.id ?? options[0]?.id ?? 'global';
  const sz: ContractSize = def.fixed ? 1 : size;
  const est = contractEstimate(s, kind, sz, w);
  const why = canPost(s, kind, sz, w);
  const cats = [...new Set(CONTRACT_ORDER.map((k) => CONTRACT_KINDS[k].cat))];
  const bidders = def.bidders.filter((b) => b !== YOU || youCanBid(s, kind));
  const building = c.projects.filter((p) => p.status === 'building');
  const finished = c.projects.filter((p) => p.status === 'done');
  return (
    <>
      <div class="section" data-tut="post-contract">
        <h4>
          <Icon name="tender" size="sm" /> Post a contract
        </h4>
        <div class="seg" style={{ marginBottom: '6px' }}>
          {cats.map((x) => (
            <button key={x} class={`btn small ${cat === x ? 'active' : ''}`} onClick={() => (setCat(x), setKind(CONTRACT_ORDER.find((k) => CONTRACT_KINDS[k].cat === x)!))}>
              {CAT_NAMES[x]}
            </button>
          ))}
        </div>
        <div class="buildgrid">
          {CONTRACT_ORDER.filter((k) => CONTRACT_KINDS[k].cat === cat).map((k) => {
            const d = CONTRACT_KINDS[k];
            const locked = c.phase < d.cphase;
            return (
              <button key={k} class={`btn buildcard ${kind === k ? 'active' : ''}`} style={{ opacity: locked ? 0.5 : 1 }} onClick={() => setKind(k)} data-tip={`${d.blurb}\n${d.effect}${locked ? `\nOpens in phase ${d.cphase}.` : ''}`}>
                <span class="t">
                  <Icon name={d.icon} size="sm" /> {d.name}
                </span>
                <span class="m">{locked ? `phase ${d.cphase}` : d.effect}</span>
              </button>
            );
          })}
        </div>
        <div class="row wrap" style={{ gap: '12px', marginTop: '8px', alignItems: 'flex-start' }}>
          <div class="grow" style={{ minWidth: '220px' }}>
            <div class="small muted">Where</div>
            <select class="select" value={w} onChange={(e) => setWhere((e.target as HTMLSelectElement).value)} aria-label="Where">
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.note ? ` — ${o.note}` : ''}
                </option>
              ))}
            </select>
            {!def.fixed && (
              <div class="seg" style={{ marginTop: '6px' }}>
                {([1, 2, 3] as ContractSize[]).map((n) => (
                  <button key={n} class={`btn small ${sz === n ? 'active' : ''}`} onClick={() => setSize(n)}>
                    {SIZE_NAMES[n]} · {sizeText(def, n)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div class="grow" style={{ minWidth: '220px' }}>
            <KV
              rows={[
                ['Project value', fmtMoney(est.value), 'The whole project. Partners and private capital raise everything above the Charter’s share.'],
                ['Charter’s share', <span class="gold">~{fmtMoney(est.share)}</span>, `${Math.round(def.share * 100)}% of the value: 20% on award, the rest spread over the build. Bids come in above or below this.`],
                ['Build time', `~${fmtDays(est.days)}`],
                ['Bidders', bidders.map((b) => (b === YOU ? s.company.name : PARTNERS[b]?.short ?? b)).join(', ')],
              ]}
            />
            <button class="btn primary" disabled={!!why} onClick={() => game.postTender(kind, sz, w)} data-tip={why ?? 'Partners bid over the next two weeks; the tender stays open 21 days.'}>
              <Icon name="tender" size="sm" /> Post the tender
            </button>
            {why && <div class="small warn">{why}</div>}
          </div>
        </div>
      </div>
      <div class="section" data-tut="tenders">
        <h4>Open tenders ({c.tenders.length})</h4>
        {!c.tenders.length && <div class="small muted">None. Post a contract above.</div>}
        {c.tenders.map((t) => (
          <TenderCard key={t.id} t={t} />
        ))}
      </div>
      <div class="section" data-tut="projects">
        <h4>Under construction ({building.length})</h4>
        {!building.length && <div class="small muted">Nothing yet.</div>}
        {building.map((p) => (
          <ProjectRow key={p.id} p={p} />
        ))}
      </div>
      {finished.length > 0 && (
        <div class="section">
          <h4>Finished ({finished.length})</h4>
          <div class="small muted">
            {finished
              .slice(-12)
              .reverse()
              .map((p) => `${CONTRACT_KINDS[p.kind].name} · ${whereName(p.where)} (${partnerName(s, p.builder)})`)
              .join(' · ')}
          </div>
        </div>
      )}
    </>
  );
}

export function TenderCard({ t }: { t: Tender }) {
  const game = useGame();
  const s = game.state!;
  const def = CONTRACT_KINDS[t.kind];
  const best = t.bids.length ? Math.min(...t.bids.map((b) => bidScore(s, t, b))) : 0;
  const committed = committedMonthly(s);
  const dues = duesMonthly(s);
  /** Award, but first say so when the treasury can't carry the payments (projects would fall into arrears). */
  const award = (i: number) => {
    const b = t.bids[i];
    if (affordable(s, b.price, b.days)) {
      game.awardBid(t.id, i);
      return;
    }
    const extra = monthlyPayment(b.price, b.days);
    game.confirm = {
      title: 'The treasury can’t carry this',
      detail: `This award adds ${fmtMoney(extra)}/month for ${Math.round(b.days / 30.4)} months. Projects under way would then need ${fmtMoney(committed + extra)}/month against ${fmtMoney(dues)}/month of dues, with ${fmtMoney(s.charter!.budget)} in the treasury. When the money runs out, projects fall into arrears: they build at half speed and Legitimacy falls every month until it’s paid.`,
      onYes: () => {
        game.confirm = null;
        game.awardBid(t.id, i);
      },
    };
    game.notify();
  };
  return (
    <div class="frame tender">
      <div class="row between">
        <b>
          <Icon name={def.icon} size="sm" /> {def.name} {def.fixed ? '' : `· ${sizeText(def, t.size)}`} · {whereName(t.where)}
        </b>
        <span class="small muted">
          {t.pending.length ? `${t.pending.length} bid${t.pending.length > 1 ? 's' : ''} coming · ` : ''}closes in {fmtDays(t.closesDay - s.day)}
          <button class="btn ghost small" onClick={() => game.closeTender(t.id)} data-tip="Withdraw the tender (bidders are a little annoyed).">
            ✕
          </button>
        </span>
      </div>
      {!t.bids.length && <div class="small muted">Waiting for bids…</div>}
      {t.bids.map((b, i) => {
        const why = canAward(s, t.id, i);
        const conflict = conflictCost(s, t, b);
        const score = bidScore(s, t, b);
        const extra = monthlyPayment(b.price, b.days);
        const ok = affordable(s, b.price, b.days);
        return (
          <div class={`bid row ${b.partner === YOU ? 'you' : ''}`} key={b.partner}>
            <Face id={b.partner} size={28} />
            <div class="grow">
              <div class="small">
                <b>{partnerName(s, b.partner)}</b> · <span class="gold">{fmtMoney(b.price)}</span> · {fmtDays(b.days)}
                {score <= best + 1e-9 && <span class="good"> · best value</span>}
                {b.partner === YOU && <span class="warn"> · your company: Legitimacy −{conflict}</span>}
              </div>
              <div class={`small ${ok ? 'muted' : 'warn'}`} data-tip="What this award adds to the Charter’s monthly progress payments, and what everything under way would then need against the dues coming in. Past the dues, the treasury pays the gap until it runs dry; then projects fall into arrears.">
                +{fmtMoney(extra)}/month for {Math.round(b.days / 30.4)} months → committed {fmtMoney(committed + extra)} of {fmtMoney(dues)} dues{ok ? '' : ' · more than the treasury can carry'}
              </div>
              <div class="small muted">“{b.pitch}”</div>
              <Traits s={s} id={b.partner} />
            </div>
            <button class={`btn small ${b.partner === YOU ? '' : 'primary'}`} disabled={!!why} onClick={() => award(i)} data-tip={why ?? `Award: ${fmtMoney(b.price * 0.2)} now, the rest over the build.`}>
              Award
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectRow({ p }: { p: Project }) {
  const game = useGame();
  const s = game.state!;
  const def = CONTRACT_KINDS[p.kind];
  const late = isLate(s, p);
  const left = Math.max(0, p.days - p.progress);
  return (
    <div class="project row" style={{ gap: '8px', alignItems: 'center' }}>
      <Face id={p.builder} size={24} />
      <div class="grow">
        <div class="small">
          <b>{def.name}</b> {def.fixed ? '' : `· ${sizeText(def, p.size)}`} · {whereName(p.where)} · {partnerName(s, p.builder)}
          {late && <span class="warn"> · late</span>}
          {p.arrears > 0 && <span class="bad"> · in arrears {fmtMoney(p.arrears)}</span>}
        </div>
        <Bar value={p.progress / Math.max(1, p.days)} kind={p.arrears > 0 ? 'warn' : late ? 'violet' : 'gold'} tip={`${Math.round((p.progress / Math.max(1, p.days)) * 100)}% · ${fmtDays(left)} to go · ${fmtMoney(p.paid)} of ${fmtMoney(p.price)} paid · ${p.troubles} trouble${p.troubles === 1 ? '' : 's'}`} />
      </div>
      <span class="small muted" style={{ minWidth: '48px', textAlign: 'right' }}>
        {fmtDays(left)}
      </span>
      <button class="btn small ghost" disabled={!!s.flags[`expedited:${p.id}`]} onClick={() => game.expedite(p.id)} data-tip={`Overtime crews: ${fmtMoney(expediteCost(p))}, 20% less time left. Once per project.`}>
        ⏩
      </button>
      {late && !p.claimed && p.builder !== YOU && (
        <button class="btn small ghost" onClick={() => game.claimDamages(p.id)} data-tip="Claim 10% of the price in damages. The builder won’t like it.">
          ⚖
        </button>
      )}
      <button class="btn small ghost" onClick={() => game.cancelProject(p.id)} data-tip="Cancel the contract. What’s paid is gone; the builder is furious; Legitimacy −4.">
        ✕
      </button>
    </div>
  );
}

// ── missions ─────────────────────────────────────────────────────────────────────────────────
function MissionsTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  return (
    <div class="cardgrid two" data-tut="missions">
      {MISSIONS.map((m) => {
        const pr = missionProgress(s, m);
        const done = c.missions[m.id];
        const locked = c.phase < m.cphase;
        return (
          <div key={m.id} class={`frame mission ${done ? 'done' : ''}`} style={{ padding: '8px', opacity: locked ? 0.55 : 1 }}>
            <div class="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
              <Portrait id={m.advisor} size={36} mood={done ? 'happy' : 'neutral'} />
              <div class="grow">
                <b>
                  <Icon name={m.icon} size="sm" /> {m.name}
                </b>
                <div class="small muted">{m.blurb}</div>
              </div>
            </div>
            {m.goals.map((g, i) => {
              const [a, b] = pr.goals[i];
              return (
                <div key={g.label} class="small" style={{ marginTop: '4px' }}>
                  <div class="row between">
                    <span>{g.label}</span>
                    <span class={a >= b ? 'good' : 'muted'}>
                      {b >= 100 ? Math.floor(a).toLocaleString() : a.toFixed(b > 1 && a % 1 ? 1 : 0)} / {b.toLocaleString()}
                    </span>
                  </div>
                  <Bar value={a / b} kind={a >= b ? 'gold' : 'violet'} />
                </div>
              );
            })}
            <div class="small" style={{ marginTop: '6px' }}>
              {done ? <span class="good">✓ Done {fmtDate(done)}. </span> : locked ? <span class="muted">Opens in phase {m.cphase}. </span> : null}
              <span class="muted">Reward: {m.reward}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── partners ─────────────────────────────────────────────────────────────────────────────────
function PartnersTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const ids = [...PARTNER_IDS].filter((id) => c.partners[id]).sort((a, b) => c.partners[b].rel - c.partners[a].rel);
  return (
    <>
      <p class="small muted" style={{ marginTop: 0 }}>
        Every company on Earth is a partner now. Awards, prompt payments and finished projects win them over; cancellations, penalties and passing over the cheapest bid sour them. Below 30 they stop bidding and lobby against you; above 70 they bid lower and offer favours.
      </p>
      <div class="cardgrid two" data-tut="partners">
        {ids.map((id) => {
          const d = PARTNERS[id];
          const st = c.partners[id];
          return (
            <div key={id} class="frame partner" style={{ padding: '8px' }}>
              <div class="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
                <Face id={id} size={40} mood={st.rel >= 70 ? 'happy' : st.rel < 30 ? 'angry' : 'neutral'} />
                <div class="grow">
                  <b>{d.name}</b>
                  <div class="small muted">
                    {d.sector} · {REGIONS[d.home].short} · {d.ceo.name}
                  </div>
                </div>
              </div>
              <div class="small" style={{ margin: '4px 0' }}>
                {d.quirk}
              </div>
              <Traits s={s} id={id} />
              <div class="row small" style={{ gap: '6px', alignItems: 'center', marginTop: '4px' }} data-tip="Relationship with the Charter.">
                <span style={{ width: '64px' }} class={st.rel < 30 ? 'bad' : st.rel >= 70 ? 'good' : 'muted'}>
                  {Math.round(st.rel)}
                </span>
                <div class="grow">
                  <Bar value={st.rel / 100} kind={st.rel < 30 ? 'warn' : 'gold'} />
                </div>
              </div>
              <div class="small muted">
                Working on {activeProjects(s, id)} / {partnerCapacity(d.traits)} · won {st.won} · finished {st.done}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── world ────────────────────────────────────────────────────────────────────────────────────
function WorldTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const w = c.world;
  const parts = growthParts(s);
  // Act IV: the planetary goal, and the growth cap the parts can run into
  const act4 = !!s.planet && !s.system;
  const capped = act4 && parts.reduce((a, p) => a + p.v, 0) > PLANET.maxGrowth;
  const local = charterGWByRegion(s);
  const yrs = carbonYearsLeft(s);
  const wm = worldMargin(s);
  const labs = [...s.market.rivals.map((r) => ({ name: r.name, cap: r.capability, open: r.open })), { name: s.company.name, cap: s.stats.capability, open: false }].sort((a, b) => b.cap - a.cap);
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }} data-tut="world-k">
          <h4>
            <Icon name="k" size="sm" /> Toward Kardashev {act4 ? '0.80' : '0.75'}
          </h4>
          <Bar
            value={act4 ? (s.stats.worldTW - 31.62) / (PLANET.targetTW - 31.62) : (s.stats.worldTW - 22) / (31.62 - 22)}
            kind="gold"
            tall
            tip={act4 ? `${PLANET.targetTW} TW is K 0.80: grid-scale abundance, the planetary goal.` : '31.6 TW is K 0.75, the first Kardashev milestone.'}
          />
          <KV
            rows={[
              ['Kardashev', `K ${s.stats.K.toFixed(4)}`],
              ['World power', `${s.stats.worldTW.toFixed(2)} TW of ${act4 ? PLANET.targetTW : '31.62'}`],
              ['Built by the Charter', `${(w.charterTW * 1000).toFixed(0)} GW average`],
              ['Your own plants', fmtMW(s.stats.playerGenMW)],
              ['World clean share', `${Math.round(worldClean(s) * 100)}% · new builds ${Math.round(w.newClean * 100)}%`],
            ]}
          />
        </div>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="finance" size="sm" /> World growth: {(w.growth * 100).toFixed(2)}%/yr
            {capped && <span class="small muted" data-tip="The parts below add up to more, but the world can't grow faster than this: what's left over doesn't count."> · capped at {(PLANET.maxGrowth * 100).toFixed(1)}%</span>}
          </h4>
          {parts.map((p) => (
            <div key={p.label} class="row between small">
              <span class="muted">{p.label}</span>
              <span class={p.v < 0 ? 'bad' : 'good'}>{sign(p.v * 100, 2)}%</span>
            </div>
          ))}
        </div>
        <div class="grow" style={{ minWidth: '240px' }} data-tut="carbon">
          <h4>
            <Icon name="co2" size="sm" /> Carbon budget (2 °C)
          </h4>
          <Bar value={Math.max(0, w.carbonGt) / 500} kind={w.carbonGt < 150 ? 'warn' : 'violet'} tall />
          <KV
            rows={[
              ['Left', <span class={w.carbonGt < 0 ? 'bad' : w.carbonGt < 150 ? 'warn' : ''}>{Math.round(w.carbonGt)} Gt CO₂</span>],
              ['Emissions', `${w.co2Gt.toFixed(1)} Gt/yr`],
              ['At this rate', yrs === Infinity ? 'never runs out' : w.carbonGt <= 0 ? 'overshot — heatwaves and droughts are likelier' : `runs out in ${yrs.toFixed(0)} years`],
            ]}
          />
        </div>
      </div>
      <div class="row wrap section" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '260px' }} data-tut="world-margin">
          <h4>
            <Icon name="shield" size="sm" /> World safety margin: <span class={wm >= 0 ? 'good' : 'bad'}>{sign(wm)}</span>
          </h4>
          <div class="small muted">World alignment {c.regime.alignment.toFixed(2)} − the frontier {worldFrontier(s).toFixed(2)}. Below zero, labs have incidents. {c.regime.marginDays > 0 ? `Positive for ${fmtDays(c.regime.marginDays)}.` : ''}</div>
          {labs.map((l) => (
            <div key={l.name} class="row between small">
              <span>
                {l.name}
                {l.open ? ' (open)' : ''}
              </span>
              <span>{l.cap.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>
            <Icon name="world" size="sm" /> The blocs
          </h4>
          <table class="ledger small">
            <thead>
              <tr>
                <th>Bloc</th>
                <th data-tip="Average power used, TW (Charter projects not included).">TW</th>
                <th>Clean</th>
                <th data-tip="Charter clean power online in the bloc.">Charter</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {REGION_IDS.map((r) => (
                <tr key={r}>
                  <td>{REGIONS[r].short}</td>
                  <td>{w.blocs[r].tw.toFixed(2)}</td>
                  <td>{Math.round(w.blocs[r].clean * 100)}%</td>
                  <td>{local[r] ? fmtMW(local[r]! * 1000) : '—'}</td>
                  <td class={(c.access[r] ?? 0) < 40 ? 'warn' : ''}>{Math.round(c.access[r] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════ THE COUNCIL ════════════════════════════════════════
const VOTE_CLS: Record<Vote, string> = { yes: 'good', no: 'bad', abstain: 'muted', absent: 'muted' };
const VOTE_MARK: Record<Vote, string> = { yes: '✓', no: '✗', abstain: '–', absent: '∅' };

export function CouncilPanel() {
  const game = useGame();
  const [tab, setTab] = useState<'agenda' | 'blocs'>('agenda');
  const s = game.state!;
  if (!s.charter) return null;
  return (
    <Panel title="The Council" icon="council" class="wide research" onClose={() => game.openPanel(null)} extra={<span class="small muted">Next session in {fmtDays(s.charter.council.nextSession - s.day)} · capital {Math.round(s.charter.capital)}</span>}>
      <div class="tabs" role="tablist">
        {(
          [
            ['agenda', 'Agenda'],
            ['blocs', 'Blocs & factions'],
          ] as const
        ).map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={`btn small ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} data-tut={`council-${id}`}>
            {name}
          </button>
        ))}
      </div>
      <div class="tabbody">{tab === 'agenda' ? <AgendaTab /> : <BlocsTab />}</div>
    </Panel>
  );
}

function VoteChips({ votes }: { votes: Record<RegionId, Vote> }) {
  return (
    <div class="votes small">
      {REGION_IDS.map((r) => (
        <span key={r} class={VOTE_CLS[votes[r]]} data-tip={`${REGIONS[r].name} (${VOTES[r]} votes): ${votes[r]}`}>
          {REGIONS[r].short}
          {VOTE_MARK[votes[r]]}
        </span>
      ))}
    </div>
  );
}

function AgendaTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const k = c.council;
  const available = RESOLUTIONS.filter((r) => !k.passed.includes(r.id) && !k.agenda.includes(r.id) && (r.act ?? 3) <= (s.act ?? 3));
  return (
    <>
      <div class="section" data-tut="agenda">
        <h4>
          <Icon name="vote" size="sm" /> On the agenda ({k.agenda.length} / 3)
        </h4>
        {!k.agenda.length && <div class="small muted">Nothing tabled. Pick a resolution below.</div>}
        {k.agenda.map((id) => {
          const r = RESOLUTION_BY_ID[id];
          const fc = forecast(s, id);
          const leaning = REGION_IDS.filter((x) => fc.votes[x] === 'abstain' || fc.votes[x] === 'no');
          return (
            <div key={id} class="frame tender">
              <div class="row between">
                <b>
                  <Icon name={r.icon} size="sm" /> {r.name}
                </b>
                <span class={`small ${fc.passes ? 'good' : 'warn'}`}>
                  {fc.yes} for · {fc.no} against{r.supermajority ? ' (needs ⅔)' : ''} → {fc.passes ? 'passes' : 'fails'}
                  <button class="btn ghost small" onClick={() => game.withdrawResolution(id)} data-tip="Withdraw it (half the capital comes back).">
                    ✕
                  </button>
                </span>
              </div>
              <div class="small muted">{r.effect}</div>
              <VoteChips votes={fc.votes} />
              {leaning.length > 0 && (
                <div class="row wrap small" style={{ gap: '4px', marginTop: '4px' }}>
                  {leaning.map((x) => (
                    <span key={x} class="whip">
                      {REGIONS[x].short}
                      <button class="btn small ghost" disabled={!!canWhip(s, x)} onClick={() => game.whipBloc(x)} data-tip={canWhip(s, x) ?? `Lean on ${REGIONS[x].name}: 6 capital, a solid nudge toward yes.`}>
                        whip
                      </button>
                      <button class="btn small ghost" disabled={!!canFavour(s, x)} onClick={() => game.favourBloc(x)} data-tip={canFavour(s, x) ?? `A favour for ${REGIONS[x].name} from the treasury (${fmtMoney(favourCost(s, x), 1)}): a bigger nudge, relations +3.`}>
                        favour
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div class="section" data-tut="table-resolution">
        <h4>Table a resolution</h4>
        <div class="buildgrid">
          {available.map((r) => {
            const why = canTable(s, r.id);
            const fc = forecast(s, r.id);
            return (
              <button key={r.id} class="btn buildcard" disabled={!!why} onClick={() => game.tableResolution(r.id)} data-tip={`${r.blurb}\n${r.effect}\nForecast today: ${fc.yes} for, ${fc.no} against${r.supermajority ? ' (needs ⅔)' : ''}.${why ? `\n✗ ${why}` : ''}`}>
                <span class="t">
                  <Icon name={r.icon} size="sm" /> {r.name}
                </span>
                <span class="m">
                  {r.cost} capital · <span class={fc.passes ? 'good' : 'warn'}>{fc.yes}–{fc.no}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {k.passed.length > 0 && (
        <div class="section">
          <h4>In force</h4>
          <div class="small">
            {k.passed.map((id) => (
              <div key={id} data-tip={RESOLUTION_BY_ID[id]?.effect}>
                ✓ {RESOLUTION_BY_ID[id]?.name}
              </div>
            ))}
          </div>
        </div>
      )}
      {k.history.length > 0 && (
        <div class="section small muted">
          Recent votes: {k.history.slice(0, 8).map((h) => `${h.passed ? '✓' : '✗'} ${RESOLUTION_BY_ID[h.id]?.name} (${h.yes}–${h.no}, ${fmtDate(h.day)})`).join(' · ')}
        </div>
      )}
    </>
  );
}

function BlocsTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const k = c.council;
  const outs = REGION_IDS.filter((r) => k.walkouts[r]);
  return (
    <>
      <div class="cardgrid three" data-tut="factions">
        {FACTION_IDS.map((f) => {
          const fac = FACTIONS[f];
          const t = k.factions[f].tension;
          return (
            <div key={f} class="frame" style={{ padding: '8px' }}>
              <div class="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
                <Face id={f} size={36} mood={t > 60 ? 'angry' : t > 40 ? 'worried' : 'neutral'} />
                <div class="grow">
                  <b>{fac.name}</b>
                  <div class="small muted">
                    {DELEGATES[f as FactionId].name} · {fac.members.map((r) => REGIONS[r].short).join(' ')}
                  </div>
                </div>
              </div>
              <div class="small muted" style={{ margin: '4px 0' }}>
                {fac.blurb}
              </div>
              <Bar value={t / 100} kind={t > 60 ? 'warn' : 'violet'} tip="Tension: rises when votes go against them and when Charter spending skips them. High tension means walkouts; very high, the Concord." />
              <div class="small">Tension {Math.round(t)}</div>
            </div>
          );
        })}
      </div>
      {k.concord && (
        <div class="small warn section">
          ⚔ The Concord Initiative ({k.concord.members.map((r) => REGIONS[r].short).join(', ')}) since {fmtDate(k.concord.formed)}: members pay half their dues.
        </div>
      )}
      <div class="section">
        <h4>Seats</h4>
        <table class="ledger small">
          <thead>
            <tr>
              <th>Bloc</th>
              <th>Votes</th>
              <th>Stance</th>
              <th>Relations</th>
              <th>Access</th>
              <th>Dues/month</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {REGION_IDS.map((r) => {
              const out = k.walkouts[r];
              return (
                <tr key={r}>
                  <td data-tip={REGIONS[r].name}>{REGIONS[r].short}</td>
                  <td>{VOTES[r]}</td>
                  <td>{s.blocs[r].stance}</td>
                  <td>{Math.round(s.blocs[r].relation)}</td>
                  <td class={(c.access[r] ?? 0) < 40 ? 'warn' : ''}>{Math.round(c.access[r] ?? 0)}</td>
                  <td>{fmtMoney(duesOf(s, r) * willingness(s, r), 1)}</td>
                  <td class={out ? 'bad' : k.late[r] ? 'warn' : 'good'} data-tip={out ? demandHint(out.demand) : undefined}>
                    {out ? `walked out (wants ${out.demand})` : k.late[r] ? 'paying late' : WEALTH[r]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {outs.length > 0 && (
        <div class="section" data-tut="walkouts">
          <h4>Walked out</h4>
          <div class="small muted" style={{ marginBottom: '4px' }}>
            A bloc that walks out pays no dues and casts no votes. Give it what it asked for and it comes back by itself (checked monthly) — or buy it back with a development package.
          </div>
          {outs.map((r) => {
            const w = k.walkouts[r]!;
            const why = canMeetDemand(s, r);
            return (
              <div key={r} class="row wrap small" style={{ gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                <b>{REGIONS[r].name}</b>
                <span class="grow muted">
                  wants {w.demand}: {demandHint(w.demand)}
                </span>
                {w.demand === 'a project at home' && (
                  <button class="btn small" onClick={() => game.openCharter('contracts', { kind: 'compute', where: r })} data-tip={`Open Charter → Contracts with a public compute campus in ${REGIONS[r].name}.`}>
                    Post a contract there
                  </button>
                )}
                {w.demand !== 'the renewal vote' && (
                  <button class="btn small" disabled={!!why} onClick={() => game.meetDemand(r)} data-tip={why ?? `A development package from the treasury (${fmtMoney(demandCost(s, r), 1)}): they come back now and their faction calms down.`}>
                    Development package ({fmtMoney(demandCost(s, r), 0)})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════ CHARTER DESK (in the Team panel) ════════════════════════════════════════
export function CharterDeskSection() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter;
  if (!c) return null;
  return (
    <div class="section" data-tut="charter-desk">
      <h4>
        <Icon name="desk" size="sm" /> Charter desk
      </h4>
      <p class="small muted" style={{ marginTop: 0 }}>
        Standing orders for the Kardashev Project itself. Desks act once a week; Penny’s reserve stops the others committing treasury money below it.
      </p>
      <div class="cardgrid">
        {DESKS.map((d) => {
          const job = c.desk[d.advisor];
          const open = c.phase >= d.cphase;
          const fmt = (v: number) => (d.a.fmt === 'money' ? fmtMoney(v, 0) : d.advisor === 'kip' ? LAUNCH_SITES[Math.round(v)]?.name ?? '' : `${v}`);
          const trust = d.advisor === 'bit' ? bitTrusted(s) : null;
          return (
            <div class="frame" key={d.advisor} style={{ padding: '8px', opacity: open ? 1 : 0.5 }} data-tut={`desk-${d.advisor}`}>
              <div class="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
                <Portrait id={d.advisor} size={40} mood={job?.on ? 'happy' : 'neutral'} />
                <div class="grow">
                  <div>
                    <b>{ADVISORS[d.advisor].name.replace(/^Dr\.\s*/, '').split(' ')[0]}</b> · {d.title}
                  </div>
                  <div class="small muted">{d.blurb}</div>
                </div>
              </div>
              {open ? (
                <>
                  <Toggle label={job?.on ? 'On the desk' : 'Off'} value={!!job?.on} onChange={(v) => game.setDesk(d.advisor, { on: v })} />
                  <Slider label={d.a.label} value={job?.a ?? d.a.def} min={d.a.min} max={d.a.max} step={d.a.step} format={fmt} onChange={(v) => game.setDesk(d.advisor, { a: v })} />
                  {d.b && <Choice label={d.b.label} value={job?.b ?? d.b.def} options={d.b.options} onChange={(v) => game.setDesk(d.advisor, { b: v })} />}
                  {job?.last !== undefined && <div class="small muted">Last acted {fmtDays(s.day - job.last)} ago.</div>}
                  {job?.on && job.paused ? <div class="small warn">Paused until the margins recover ({trust ?? 'they nearly have'}); Bit picks the desk back up by itself.</div> : trust && <div class="small warn">{trust}.</div>}
                </>
              ) : (
                <div class="small muted">Opens in Charter phase {d.cphase}.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════ FRONTIER LICENCE (Compute panel) ════════════════════════════════════════
export function OwnLicenceBox() {
  const game = useGame();
  const s = game.state!;
  if (!s.charter || !capInForce(s) || s.training) return null;
  const plan = nextModelPlan(s);
  const st = ownRunStatus(s, plan.gen, plan.flop);
  if (st === 'free') return null;
  return (
    <div class="frame small" style={{ padding: '6px', margin: '6px 0' }} data-tut="own-licence">
      <b>Charter compute cap</b>: {plan.name} needs {plan.flop.toExponential(0)} FLOP, above the {COMPUTE_CAP.toExponential(0)} cap.
      {st === 'licensed' && <span class="good"> Licensed — you can start it.</span>}
      {st === 'pending' && <span class="muted"> With the evaluators — {fmtDays((s.charter.regime.ownLicence?.readyDay ?? s.day) - s.day)} to go.</span>}
      {st === 'needed' && (
        <div class="row" style={{ gap: '6px', marginTop: '4px' }}>
          <button class="btn small primary" onClick={() => game.requestOwnLicence(plan.gen, false)} data-tip="Independent evaluation: about three months, no Legitimacy cost.">
            Evals route (90 days)
          </button>
          <button class="btn small" onClick={() => game.requestOwnLicence(plan.gen, true)} data-tip="License your own run yourself. Instant. Legitimacy −8: everyone sees the Steward waving their own company through.">
            Fast-track (Legitimacy −8)
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════ THE THRESHOLD ════════════════════════════════════════
export function ThresholdTracker() {
  const game = useGame();
  const s = game.state!;
  const t = s.charter?.threshold;
  if (!t || t.done || game.mode !== 'map') return null;
  const icon: Record<ThresholdFront, IconName> = { grid: 'power', frontier: 'brain', council: 'council' };
  return (
    <div class="crunch frame" data-tut="threshold">
      <div class="row between">
        <span class="label warn">
          <Icon name="threshold" size="sm" /> The Threshold
        </span>
        <span class="small muted">{fmtDays(t.endDay - s.day)} to hold</span>
      </div>
      {THRESHOLD_FRONTS.map((k) => {
        const fr = t.fronts[k];
        const rise = frontRise(s, k);
        const tip = `${FRONT3_NAMES[k]}: pressure ${Math.round(fr.pressure)}/100 (${rise.v >= 0 ? '+' : ''}${rise.v.toFixed(2)}/day). At 100 the front is lost.\n${rise.parts.map(([l, v]) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${l}`).join('\n')}`;
        return (
          <div key={k} class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={tip}>
            <Icon name={icon[k]} size="sm" />
            <span style={{ width: '96px' }} class={fr.lost ? 'bad' : fr.pressure > 70 ? 'warn' : ''}>
              {FRONT3_NAMES[k]}
            </span>
            <div class="grow">{fr.lost ? <span class="bad">lost</span> : <Bar value={fr.pressure / 100} kind={fr.pressure > 70 ? 'warn' : 'violet'} />}</div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════ INSPECTORS ════════════════════════════════════════
export function CharterHqInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const c = s.charter;
  const site = SITE_BY_ID[id];
  return (
    <Panel title="Charter HQ · Geneva" icon="charter" onClose={() => game.select(null)} extra={<button class="btn small primary" onClick={() => game.enterDiorama(id)}>View</button>}>
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb}
      </p>
      {c ? (
        <>
          <KV
            rows={[
              ['Treasury', fmtMoney(c.budget)],
              ['Legitimacy', `${Math.round(c.legitimacy)} / 100`],
              ['Projects', `${c.projects.filter((p) => p.status === 'building').length} building · ${c.projects.filter((p) => p.status === 'done').length} done`],
              ['Missions', `${Object.keys(c.missions).length} / ${MISSIONS.length}`],
              ['Lowest access', `${Math.round(minAccess(s))}`],
            ]}
          />
          <div class="row" style={{ gap: '6px', marginTop: '6px' }}>
            <button class="btn small primary" onClick={() => game.openCharter('overview')}>
              <Icon name="charter" size="sm" /> The Charter
            </button>
            <button class="btn small" onClick={() => game.openPanel('council')}>
              <Icon name="council" size="sm" /> The Council
            </button>
          </div>
        </>
      ) : (
        <div class="small muted">Founded in Act III.</div>
      )}
    </Panel>
  );
}

export function MegaInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const site = SITE_BY_ID[id];
  const v = megaView(s, id);
  const next = MEGA_STAGES[v.stage];
  const projects = (s.charter?.projects ?? []).filter((p) => p.where === id && p.status !== 'cancelled');
  return (
    <Panel title={site.name} icon="mega" onClose={() => game.select(null)} extra={<button class="btn small primary" onClick={() => game.enterDiorama(id)}>View</button>}>
      <div class="small muted">
        Megaproject site · {REGIONS[site.region].name}
      </div>
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb}
      </p>
      <KV
        rows={[
          ['Stage', `${v.stage} / 3${next ? ` · next at ${next} GW` : ' · full scale'}`],
          ['Online', `${v.gw.toFixed(0)} GW average`],
          ['Can host', (site.mega ?? []).map((k) => CONTRACT_KINDS[k].name).join(', ')],
          ['Sun · wind', `${Math.round(site.solarCF * 100)}% · ${Math.round(site.windCF * 100)}%`],
        ]}
      />
      {projects.map((p) => (
        <div key={p.id} class="small row" style={{ gap: '6px', alignItems: 'center' }}>
          <Face id={p.builder} size={20} />
          <span class="grow">
            {CONTRACT_KINDS[p.kind].name} · {sizeText(CONTRACT_KINDS[p.kind], p.size)} · {partnerName(s, p.builder)}
          </span>
          <span class={p.status === 'done' ? 'good' : 'muted'}>{p.status === 'done' ? 'online' : `${Math.round((p.progress / p.days) * 100)}%`}</span>
        </div>
      ))}
      {s.charter ? (
        <button class="btn small primary" style={{ marginTop: '6px' }} onClick={() => game.openCharter('contracts', { kind: site.mega?.[0], where: id })} data-tut="mega-post">
          <Icon name="tender" size="sm" /> Post a contract here
        </button>
      ) : (
        <div class="small muted">Opens with the Charter in Act III.</div>
      )}
    </Panel>
  );
}

export function LaunchInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const site = SITE_BY_ID[id];
  const p = s.charter?.projects.find((x) => x.kind === 'launch' && x.status !== 'cancelled');
  const here = p?.where === id;
  return (
    <Panel title={site.name} icon="launch" onClose={() => game.select(null)} extra={<button class="btn small primary" onClick={() => game.enterDiorama(id)}>View</button>}>
      <div class="small muted">Launch-complex candidate · {REGIONS[site.region].name}</div>
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb}
      </p>
      {here && p ? (
        <div class="small">
          {p.status === 'done' ? <span class="good">The Charter’s launch complex is open.</span> : <span>Under construction by {partnerName(s, p.builder)}: {Math.round((p.progress / p.days) * 100)}%.</span>}
        </div>
      ) : p ? (
        <div class="small muted">The Charter’s launch complex is at {whereName(p.where)}.</div>
      ) : (
        <button class="btn small primary" disabled={!s.charter || s.charter.phase < 2} onClick={() => game.openCharter('contracts', { kind: 'launch', where: id })} data-tip={!s.charter || s.charter.phase < 2 ? 'Opens in Charter phase 2' : 'Build the launch complex here.'}>
          <Icon name="launch" size="sm" /> Build the launch complex here
        </button>
      )}
    </Panel>
  );
}

void WEALTH;
