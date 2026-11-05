/** Act II panels: Team (advisor jobs), Deals (supply · customers · companies), Blocs (diplomacy), Board & debt, the Crunch tracker. */
import { useState } from 'preact/hooks';
import { Bar, Choice, Icon, KV, Panel, Portrait, Slider, Toggle, pct, useGame } from '../components';
import { JOBS } from '../../content/jobs';
import { DEALS } from '../../content/stack';
import { MATERIALS, MINES } from '../../content/stack';
import { REGIONS } from '../../content/regions';
import { REGION_IDS, type RegionId } from '../../content/mapcodes';
import { EXPORT_RULES, RULE_BY_ID, SOVEREIGN_BY_ID, TREATIES, LOBBY } from '../../content/politics';
import { STARTUP_BY_ID } from '../../content/rivals';
import { CHIP_SUPPLIERS } from '../../content/companies';
import { ADVISORS } from '../../content/advisors';
import { siteDef } from '../../content/sites';
import { fmtDays, fmtMoney, fmtMW, fmtNum } from '../../sim/core';
import { canApplyLicence, canSignDeal, PHASE_NAMES, TREATY_REJOIN_DAYS } from '../../sim/actions';
import { blocIT, licencePending, sovereignBuilt } from '../../sim/politics';
import { CONTRACT_MIN_SIGN, CONTRACT_SLA, contractDeliverable } from '../../sim/network';
import { boardGrowth, boardTarget, creditLeft, debtTotal, IPO_FLOOR, ipoBreakdown, ipoValuation, loanRate } from '../../sim/capital';
import { inferPriceTrend } from '../../sim/model';
import { crunchRise, FRONT_NAMES } from '../../sim/finale';
import type { FrontId, GameState, Materials, SupplierId } from '../../sim/types';
import { jobSpendHint } from '../../sim/jobs';
import { techMult } from '../../sim/effects';
import { CharterDeskSection } from './Act3Panels';

const phaseLabel = (n: number) => `phase ${n} · ${PHASE_NAMES[n]}`;
/** Supply partners by id ("stackwell" → "Stackwell Memory"), for deals signed here or through events. */
const PARTNER_NAMES: Record<string, string> = Object.fromEntries(DEALS.map((d) => [d.partner, d.partnerName]));

// ════════════════════════════════════════ TEAM ════════════════════════════════════════
export function TeamPanel() {
  const game = useGame();
  const s = game.state!;
  return (
    <Panel title="Team · advisor jobs" icon="team" class="wide" onClose={() => game.openPanel(null)}>
      <p class="small muted" style={{ marginTop: 0 }}>
        Give each advisor a standing order. They act once a week and report in the news. Penny’s cash floor pauses everyone else’s automatic spending.
      </p>
      <div class="cardgrid">
        {JOBS.map((j) => {
          const job = s.jobs[j.advisor];
          const open = s.phase >= j.phase;
          const fmt = (v: number) =>
            j.a.fmt === 'money' ? fmtMoney(v) : j.a.fmt === 'pct' ? `${Math.round(v * 100)}%` : j.a.fmt === 'margin' ? (v >= 0 ? '+' : '') + v.toFixed(2) : j.a.fmt === 'mw' ? fmtMW(v) : `${v}`;
          return (
            <div class="frame" key={j.advisor} style={{ padding: '8px', opacity: open ? 1 : 0.5 }} data-tut={`job-${j.advisor}`}>
              <div class="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
                <Portrait id={j.advisor} size={40} mood={job?.on ? 'happy' : 'neutral'} />
                <div class="grow">
                  <div>
                    <b>{ADVISORS[j.advisor].name.replace(/^Dr\.\s*/, '').split(' ')[0]}</b> · {j.title}
                  </div>
                  <div class="small muted">{j.blurb}</div>
                </div>
              </div>
              {open ? (
                <>
                  <Toggle label={job?.on ? 'On the job' : 'Off'} hint={job?.on ? jobSpendHint(s, j.advisor) || undefined : undefined} value={!!job?.on} onChange={(v) => game.setJob(j.advisor, { on: v })} />
                  <Slider label={j.a.label} value={job?.a ?? j.a.def} min={j.a.min} max={j.a.max} step={j.a.step} format={fmt} onChange={(v) => game.setJob(j.advisor, { a: v })} />
                  {j.b && <Choice label={j.b.label} value={job?.b ?? j.b.def} options={j.b.options} onChange={(v) => game.setJob(j.advisor, { b: v })} />}
                  {job?.last !== undefined && <div class="small muted">Last acted {fmtDays(s.day - job.last)} ago.</div>}
                  {j.minMargin !== undefined && s.stats.margin < j.minMargin && <div class="small warn">Needs a safety margin ≥ {j.minMargin} to switch on.</div>}
                </>
              ) : (
                <div class="small muted">Opens in {phaseLabel(j.phase)}.</div>
              )}
            </div>
          );
        })}
      </div>
      <CharterDeskSection />
    </Panel>
  );
}

// ════════════════════════════════════════ DEALS ════════════════════════════════════════
type DealTab = 'supply' | 'customers' | 'companies';

export function DealsPanel() {
  const game = useGame();
  const [tab, setTab] = useState<DealTab>('supply');
  const tabs: [DealTab, string][] = [
    ['supply', 'Supply'],
    ['customers', 'Customers'],
    ['companies', 'Companies'],
  ];
  return (
    <Panel title="Deals" icon="deal" class="wide" onClose={() => game.openPanel(null)}>
      <div class="tabs" role="tablist">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={`btn small ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} data-tut={`deals-${id}`}>
            {name}
          </button>
        ))}
      </div>
      <div class="tabbody">
        {tab === 'supply' && <SupplyTab />}
        {tab === 'customers' && <CustomersTab />}
        {tab === 'companies' && <CompaniesTab />}
      </div>
    </Panel>
  );
}

/** Logic · HBM · packaging bars for one supplier; the lowest one glows. */
export function PoolBars({ supplier }: { supplier: SupplierId }) {
  const game = useGame();
  const p = game.state!.stats.pools?.[supplier];
  if (!p || p.logic <= 0) return null;
  const max = Math.max(p.logic, 1);
  const low = p.rate >= p.logic * 0.97 ? null : p.hbm <= p.pkg ? 'hbm' : 'pkg';
  const row = (key: 'logic' | 'hbm' | 'pkg', label: string, tip: string) => (
    <div class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={tip}>
      <span style={{ width: '64px' }} class={low === key ? 'warn' : 'muted'}>
        {low === key ? '▶ ' : ''}
        {label}
      </span>
      <div class="grow">
        <Bar value={p[key] / max} kind={low === key ? 'warn' : key === 'logic' ? 'gold' : 'violet'} />
      </div>
      <span style={{ width: '64px', textAlign: 'right' }}>{fmtNum(p[key], 0)}</span>
    </div>
  );
  return (
    <div style={{ margin: '4px 0' }}>
      {row('logic', 'Wafers', 'Logic dies you can get from the fab each month (your allocation, deals, competition from rival orders).')}
      {row('hbm', 'HBM', 'Accelerators per month with all eight memory stacks. HBM deals shield part of your volume from shortages.')}
      {row('pkg', 'Packaging', 'Accelerators per month that can be packaged. Your own plant and Bondline slots are not shared.')}
      <div class="small muted">
        Delivering <b>{fmtNum(p.rate, 0)}</b> / month{low ? ` — limited by ${low === 'hbm' ? 'memory' : 'packaging'}` : ''}.
      </div>
    </div>
  );
}

function SupplyTab() {
  const game = useGame();
  const s = game.state!;
  const live = s.stack.deals.filter((d) => d.endDay === 0 || d.endDay >= s.day);
  const suppliers: SupplierId[] = s.facilities.some((f) => f.type === 'fab' && f.status === 'online') ? ['lumen', 'kestrel', 'own'] : ['lumen', 'kestrel'];
  return (
    <>
      <h4>The three pools</h4>
      <div class="row wrap" style={{ gap: '12px' }}>
        {suppliers.map((id) => (
          <div class="grow" style={{ minWidth: '220px' }} key={id}>
            <b>{CHIP_SUPPLIERS[id].name}</b>
            <PoolBars supplier={id} />
          </div>
        ))}
      </div>
      <div class="small muted">
        Shared markets: HBM {Math.round(s.market.hbm * 100)}% · packaging {Math.round(s.market.pkg * 100)}% of normal. Rival campuses under construction tighten both.
      </div>
      <div class="section">
        <h4>Sign a deal</h4>
        <div class="buildgrid">
          {DEALS.map((d) => {
            const why = canSignDeal(s, d.id);
            return (
              <button key={d.id} class="btn buildcard" disabled={!!why} onClick={() => game.signDeal(d.id)} data-tip={`${d.blurb}${why ? `\n✗ ${why}` : ''}`}>
                <span class="t">
                  <Icon name="deal" size="sm" /> {d.name}
                </span>
                <span class="m">
                  {fmtMoney(d.cost)} · {fmtNum(d.units, 0)}/mo · {d.days ? `${Math.round(d.days / 30.4)} months` : 'permanent'}
                  {d.leadDays > 90 ? ` · from ${fmtDays(d.leadDays)}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {live.length > 0 && (
        <div class="section">
          <h4>Your deals</h4>
          {live.map((d) => (
            <div class="row between small" key={d.id}>
              <span>
                <Icon name="deal" size="sm" /> {d.kind === 'reserve' ? 'Wafer reservation' : d.kind === 'cofund' ? 'Co-funded line' : d.kind === 'hbm' ? 'HBM allocation' : 'Packaging slots'} · {PARTNER_NAMES[d.partner] ?? d.partner}
              </span>
              <span class="muted">
                {fmtNum(d.units, 0)}/mo · {s.day < d.readyDay ? `starts in ${fmtDays(d.readyDay - s.day)}` : d.endDay ? `${fmtDays(d.endDay - s.day)} left` : 'permanent'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div class="section">
        <h4>Raw materials</h4>
        <div class="row wrap" style={{ gap: '10px' }}>
          {(Object.keys(MATERIALS) as (keyof Materials)[]).map((k) => {
            const v = s.market.materials[k];
            const stake = MINES.filter((m) => m.material === k).reduce((a, m) => a + (s.stack.stakes[m.id] ?? 0), 0);
            return (
              <div key={k} class="trait" data-tip={`${MATERIALS[k].uses}.\nYour stakes: ${Math.round(stake * 100)}%.`}>
                <Icon name={k} size="sm" /> {MATERIALS[k].name} <b class={v > 1.15 ? 'bad' : v < 0.9 ? 'good' : ''}>{Math.round(v * 100)}%</b>
              </div>
            );
          })}
        </div>
        <div class="small muted" style={{ marginTop: '4px' }}>
          Mines: {MINES.map((m) => siteDef(m.id).name.split('·').pop()!.trim()).join(', ')}. Click one on the map to buy a stake.
        </div>
      </div>
    </>
  );
}

/** Ask before something with a real downside (the game's confirm dialog). */
function ask(game: ReturnType<typeof useGame>, title: string, detail: string, yes: () => void): void {
  game.confirm = {
    title,
    detail,
    onYes: () => {
      game.confirm = null;
      yes();
    },
  };
  game.notify();
}

function CustomersTab() {
  const game = useGame();
  const s = game.state!;
  const sov = s.capital.sovereign.filter((d) => d.status === 'offer').length;
  return (
    <>
      {s.phase < 2 && <div class="small muted">Enterprise contracts open in {phaseLabel(2)}.</div>}
      <h4>Contract offers</h4>
      {s.capital.offers.length === 0 && <div class="small muted">No offers right now. Customers call every few weeks.</div>}
      {s.capital.offers.map((o) => {
        // what you could deliver if you signed today, after the contracts you already serve
        const pv = contractDeliverable(s, o);
        const ok = pv.frac >= CONTRACT_SLA;
        const tooLow = pv.frac < CONTRACT_MIN_SIGN;
        const from = pv.from.length ? pv.from.map((x) => (x === 'cloud' ? 'Cumulus' : REGIONS[x].short)).join(' + ') : 'nowhere in reach';
        const sign = () =>
          ok
            ? void game.acceptContract(o.id)
            : ask(
                game,
                `Sign with ${o.customer}?`,
                `You could deliver about ${pct(pv.frac)} of it today (from ${from}). Under 95% the customer charges a penalty: you’d net about ${fmtMoney(pv.net)}/month instead of ${fmtMoney(o.monthly)}, until you add capacity in or near ${REGIONS[o.region].name}.`,
                () => void game.acceptContract(o.id),
              );
        return (
          <div class="fac" key={o.id}>
            <Icon name="contract" />
            <div>
              <div class="name">
                {o.customer} · {REGIONS[o.region].name}
              </div>
              <div class="sub">
                {o.units.toLocaleString()} accelerator-equivalents for {o.months} months · {fmtMoney(o.monthly)}/mo · penalty up to {fmtMoney(o.penalty)}/mo · expires in {fmtDays((o.expires ?? s.day) - s.day)}
              </div>
              <div
                class={`small ${ok ? 'good' : tooLow ? 'bad' : 'warn'}`}
                data-tip="If you signed today. Contracts are served first, from the halls with the best latency into their region: your own fiber and cables count almost fully; over the public internet the same continent counts 72%, a neighbouring one about 60%, across an ocean nothing. More chips, halls or links change the numbers."
              >
                {ok
                  ? `✓ You can deliver all of it today (from ${from}).`
                  : tooLow
                    ? `✗ Only ${pct(pv.frac)} deliverable today: build in ${REGIONS[o.region].short} or link to it first.`
                    : `⚠ About ${pct(pv.frac)} deliverable today (from ${from}): penalties leave ~${fmtMoney(pv.net)}/mo.`}
              </div>
            </div>
            <span class="row" style={{ gap: '4px' }}>
              <button class="btn small primary" disabled={tooLow} onClick={sign} data-tut="accept-contract" data-tip={tooLow ? `You can’t deliver at least ${pct(CONTRACT_MIN_SIGN)} of this yet.` : undefined}>
                Sign
              </button>
              <button class="btn small ghost" onClick={() => game.declineContract(o.id)}>
                ✕
              </button>
            </span>
          </div>
        );
      })}
      {s.capital.contracts.length > 0 && (
        <div class="section">
          <h4>Active contracts</h4>
          {s.capital.contracts.map((c) => (
            <div class="fac" key={c.id}>
              <Icon name="contract" />
              <div>
                <div class="name">
                  {c.customer} · {REGIONS[c.region].short}
                </div>
                <div class="sub">
                  {fmtMoney(c.monthly)}/mo · {fmtDays(c.endDay - s.day)} left · delivering {pct(c.delivered ?? 1)}
                </div>
              </div>
              <Bar value={c.delivered ?? 1} kind={(c.delivered ?? 1) < 0.95 ? 'warn' : 'gold'} />
            </div>
          ))}
          <div class="small muted">Contracts are served first, from the halls with the best latency into their region. Under 95% delivery costs a penalty.</div>
        </div>
      )}
      <div class="section small muted">
        Sovereign deals — governments paying you to build in their bloc — are on the Blocs screen{sov ? ` (${sov} open offer${sov === 1 ? '' : 's'})` : s.phase < 2 ? `, from ${phaseLabel(2)}` : ''}.
      </div>
    </>
  );
}

/** Sovereign deals: offers to accept and deals in progress (on the Blocs screen, where the dock badge points). */
function SovereignDeals() {
  const game = useGame();
  const s = game.state!;
  const sov = s.capital.sovereign.filter((d) => d.status === 'offer' || d.status === 'active');
  return (
    <div class="section" data-tut="sovereign">
      <h4>Sovereign deals</h4>
      {sov.length === 0 && <div class="small muted">{s.phase < 2 ? `Governments start making offers in ${phaseLabel(2)}.` : 'No offers right now. Blocs that like you (relations 40+) make them every few months.'}</div>}
      {sov.map((d) => {
        const def = SOVEREIGN_BY_ID[d.def];
        const built = sovereignBuilt(s, d);
        return (
          <div class="fac" key={d.id}>
            <Icon name="blocs" />
            <div>
              <div class="name">
                {REGIONS[d.region].name}: {def.title}
              </div>
              <div class="sub">
                Build {fmtMW(d.needMW)} of new IT there within {fmtDays(def.days)} → {def.reward}. Strings: {def.strings}
                {d.status === 'active' ? ` · ${fmtMW(built)} / ${fmtMW(d.needMW)} built, ${fmtDays(d.byDay - s.day)} left` : ` · offer expires in ${fmtDays(d.expires - s.day)}`}
              </div>
              {d.status === 'offer' && <div class="small muted">Accepting: relations +4 and the perks start now; only halls you build after signing count; missing the deadline costs relations −15.</div>}
            </div>
            {d.status === 'offer' ? (
              <span class="row" style={{ gap: '4px' }}>
                <button class="btn small primary" onClick={() => game.acceptSovereign(d.id)}>
                  Accept
                </button>
                <button class="btn small ghost" onClick={() => game.declineSovereign(d.id)}>
                  ✕
                </button>
              </span>
            ) : (
              <Bar value={built / d.needMW} kind="violet" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompaniesTab() {
  const game = useGame();
  const s = game.state!;
  const byOwner = s.market.rivals.map((r) => {
    const builds = s.rivalBuilds.filter((b) => b.owner === r.id);
    return { r, n: builds.length, mw: builds.filter((b) => b.status === 'online').reduce((a, b) => a + b.itMW, 0), building: builds.filter((b) => b.status === 'building').length };
  });
  return (
    <>
      <h4>For sale</h4>
      {s.startups.offers.length === 0 && <div class="small muted">No startups on the market right now.</div>}
      {s.startups.offers.map((o) => {
        const def = STARTUP_BY_ID[o.def];
        return (
          <div class="fac" key={o.id}>
            <Icon name="startup" />
            <div>
              <div class="name">{def.name}</div>
              <div class="sub">
                {def.blurb} <b>{def.gives}</b> · offer ends in {fmtDays(o.expires - s.day)}
              </div>
            </div>
            <button class="btn small primary" disabled={s.finance.cash < o.price} onClick={() => game.buyStartup(o.id)}>
              {fmtMoney(o.price)}
            </button>
          </div>
        );
      })}
      {s.startups.bought.length > 0 && <div class="small muted">Acquired: {s.startups.bought.map((id) => STARTUP_BY_ID[id]?.name).join(', ')}.</div>}
      <div class="section">
        <h4>Rival labs</h4>
        {byOwner.map(({ r, n, mw, building }) => (
          <div class="row between small" key={r.id}>
            <span>
              <Icon name="rival" size="sm" /> {r.name} {r.open ? '(open weights)' : ''}
            </span>
            <span class="muted">
              capability {r.capability.toFixed(2)} · {n} campus{n === 1 ? '' : 'es'} ({fmtMW(mw)} online{building ? `, ${building} building` : ''})
            </span>
          </div>
        ))}
      </div>
      <div class="section">
        <h4>Talent pools</h4>
        <div class="small muted" style={{ marginBottom: '4px' }}>
          Rival labs drain the researchers in their regions; your labs there produce less as pools run dry. Pools refill slowly.
        </div>
        <div class="cardgrid four">
          {REGION_IDS.map((r) => (
            <div key={r} class="small" data-tip={`${REGIONS[r].name}: ${Math.round((s.talent[r] ?? 1) * 100)}% of researchers still available.`}>
              {REGIONS[r].short} <Bar value={s.talent[r] ?? 1} kind={(s.talent[r] ?? 1) < 0.6 ? 'warn' : 'gold'} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════ BLOCS ════════════════════════════════════════
export function BlocsPanel() {
  const game = useGame();
  const s = game.state!;
  const [sel, setSel] = useState<RegionId>(REGION_IDS[0]);
  const b = s.blocs[sel];
  const rulesHere = s.politics.rules.filter((id) => RULE_BY_ID[id]?.to.includes(sel));
  return (
    <Panel title="Blocs · diplomacy" icon="blocs" class="wide research" onClose={() => game.openPanel(null)}>
      <p class="small muted" style={{ marginTop: 0 }}>
        Two meters per bloc: <b>Relations</b> (the government: licences, reactor approvals, sovereign deals) and <b>Trust</b> (the people: permits, protests). Next summit{' '}
        {s.politics.nextSummit > s.day && s.phase >= 2 ? `in ${fmtDays(s.politics.nextSummit - s.day)}` : `in ${phaseLabel(2)}`}.
      </p>
      <div class="cardgrid four" style={{ marginBottom: '8px' }}>
        {REGION_IDS.map((r) => {
          const x = s.blocs[r];
          return (
            <button key={r} class={`btn buildcard ${sel === r ? 'active' : ''}`} onClick={() => setSel(r)} data-tut={`bloc-${r}`}>
              <span class="t">
                {REGIONS[r].short} <span class={`small ${x.stance === 'accelerate' ? 'good' : x.stance === 'cautious' ? 'warn' : 'muted'}`}>{x.stance === 'accelerate' ? 'go' : x.stance === 'cautious' ? 'wary' : 'mid'}</span>
              </span>
              <Bar value={x.relation / 100} kind="violet" />
              <Bar value={s.regions[r].license / 100} kind={s.regions[r].license < 30 ? 'warn' : 'gold'} />
            </button>
          );
        })}
      </div>
      <div class="row wrap" style={{ gap: '14px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>{REGIONS[sel].name}</h4>
          <KV
            rows={[
              ['Stance', b.stance],
              ['Relations', `${Math.round(b.relation)} / 100`, 'The government’s view of you.'],
              ['Trust', `${Math.round(s.regions[sel].license)} / 100`, 'Local people’s view of you.'],
              ['Your IT here', fmtMW(blocIT(s, sel))],
              ['Next election', `${fmtDays(b.nextElection - s.day)} · leaning ${b.poll > 0.2 ? 'accelerate' : b.poll < -0.2 ? 'cautious' : 'steady'}`],
            ]}
          />
          <button class="btn small" style={{ marginTop: '6px' }} disabled={s.finance.cash < LOBBY.cost} onClick={() => game.lobby(sel)} data-tut="lobby" data-tip={`Spend ${fmtMoney(LOBBY.cost)} on lobbying: relations +${LOBBY.relation} (less each time).\nLobby too often and a scandal gets likelier.`}>
            <Icon name="blocs" size="sm" /> Lobby ({fmtMoney(LOBBY.cost)})
          </button>
          {b.lobby > 2 && <div class="small warn">Journalists are asking about your lobbying here.</div>}
        </div>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>Export rules into {REGIONS[sel].short}</h4>
          {rulesHere.length === 0 && <div class="small muted">None in force.</div>}
          {rulesHere.map((id) => {
            const r = RULE_BY_ID[id];
            const has = b.licences.includes(id);
            const pending = licencePending(s, id, sel);
            const why = canApplyLicence(s, id, sel);
            return (
              <div key={id} class="small" style={{ marginBottom: '6px' }}>
                <div>
                  ⛔ <b>{r.name}</b> <span class="muted">(by {REGIONS[r.by].short})</span>
                </div>
                <div class="muted">{r.blurb}</div>
                {has ? (
                  <span class="good">✓ Licensed</span>
                ) : pending ? (
                  <span class="muted">⏳ Licence in {fmtDays((s.politics.pending.find((p) => p.rule === id && p.region === sel)?.readyDay ?? s.day) - s.day)}</span>
                ) : r.licenceDays > 0 ? (
                  <button class="btn small" disabled={!!why} onClick={() => game.applyLicence(id, sel)} data-tip={why ?? `${fmtMoney(r.licenceCost)} · about ${fmtDays(Math.round(r.licenceDays * techMult(s, 'licenceDays')))}`}>
                    Apply for a licence
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div class="section">
        <h4>Treaties</h4>
        <div class="buildgrid">
          {TREATIES.map((t) => {
            const member = s.politics.treaties.includes(t.id);
            const rejoin = !member && s.day - Number(s.flags[`treatyLeft:${t.id}`] ?? -1e9) < TREATY_REJOIN_DAYS;
            const leave = () =>
              ask(
                game,
                `Leave the ${t.name}?`,
                `Cautious blocs’ relations fall by 8 and everyone else’s by 3, and if you rejoin within a year the capitals won’t thank you for it (no goodwill on signing again).`,
                () => void game.leaveTreaty(t.id),
              );
            return (
              <button
                key={t.id}
                class={`btn buildcard ${member ? 'active' : ''}`}
                onClick={() => (member ? leave() : game.signTreaty(t.id))}
                data-tip={`${t.blurb}\n✓ ${t.gives}\n⚠ ${t.asks}\n${member ? 'Click to leave (relations suffer).' : rejoin ? 'Click to rejoin (you left less than a year ago: no goodwill this time).' : 'Click to sign.'}`}
              >
                <span class="t">
                  <Icon name="treaty" size="sm" /> {t.name} {member ? '· member' : ''}
                </span>
                <span class="m">{t.gives}</span>
              </button>
            );
          })}
        </div>
      </div>
      <SovereignDeals />
      <div class="section small muted">
        Rules in force worldwide: {s.politics.rules.map((id) => RULE_BY_ID[id]?.name).join(' · ') || 'none'}. Possible: {EXPORT_RULES.filter((r) => !s.politics.rules.includes(r.id)).map((r) => r.name).join(' · ')}.
      </div>
    </Panel>
  );
}

/** How the IPO bankers get to their number (for tooltips). */
function ipoTip(s: GameState): string {
  const b = ipoBreakdown(s);
  return `A year of revenue × 18: ${fmtMoney(b.base)}\n${b.parts.map(([l, k]) => `×${k.toFixed(2)} ${l}`).join('\n')}${b.floor ? `\nBelow the bankers’ floor: ${fmtMoney(IPO_FLOOR)}` : ''}`;
}

// ════════════════════════════════════════ BOARD & DEBT (Finance) ════════════════════════════════════════
export function BoardSection() {
  const game = useGame();
  const s = game.state!;
  const [amount, setAmount] = useState(500e6);
  if ((s.act ?? 1) < 2) return null;
  const b = s.capital.board;
  const credit = creditLeft(s);
  return (
    <div class="row wrap section" style={{ gap: '16px', alignItems: 'flex-start' }}>
      <div class="grow" style={{ minWidth: '240px' }} data-tut="board">
        <h4>
          <Icon name="board" size="sm" /> Board
        </h4>
        {b ? (
          <>
            <Bar value={b.confidence / 100} kind={b.confidence < 35 ? 'warn' : 'gold'} tall tip="Board confidence. Below 30, the chair calls a CEO review." />
            <KV
              rows={[
                ['Confidence', `${Math.round(b.confidence)} / 100`],
                ['Next review', fmtDays(b.nextReview - s.day)],
                [
                  'Target',
                  `sales +${Math.round(boardTarget(b) * 100)}% this quarter${b.stretch ? ' (with the stretch you promised)' : ''} · ≈ ${fmtMoney((b.baseline * (1 + boardTarget(b)) * inferPriceTrend(s)) / (b.baseTrend ?? inferPriceTrend(s)))}/mo at today’s prices`,
                  'The board measures growth in volume: the ~5% a quarter that inference prices fall (everyone’s chips get faster) is not held against you.',
                ],
                ['So far this quarter', `${boardGrowth(s) >= 0 ? '+' : '−'}${Math.abs(Math.round(boardGrowth(s) * 100))}% in volume`],
                ['Missed reviews', String(b.misses)],
              ]}
            />
          </>
        ) : (
          <div class="small muted">The board forms with the Series B.</div>
        )}
        {s.capital.ipo ? (
          <div class="small good">🔔 Public since {Math.round(s.capital.ipo.day / 365.25 + 2027)} at {fmtMoney(s.capital.ipo.valuation)}.</div>
        ) : s.phase >= 3 ? (
          <div class="small muted" data-tip={ipoTip(s)}>
            IPO bankers’ estimate today: {fmtMoney(ipoValuation(s))}.
          </div>
        ) : null}
      </div>
      <div class="grow" style={{ minWidth: '240px' }} data-tut="debt">
        <h4>
          <Icon name="finance" size="sm" /> Project finance
        </h4>
        <KV
          rows={[
            ['Debt', fmtMoney(debtTotal(s))],
            ['You can borrow', fmtMoney(credit), 'Up to 70% of what your plants, halls and chips are worth, minus what you owe.'],
            ['Rate', `${(loanRate(s) * 100).toFixed(1)}% over 10 years`],
          ]}
        />
        <Slider label="Borrow" value={Math.min(amount, Math.max(100e6, credit))} min={100e6} max={Math.max(100e6, credit)} step={100e6} format={(v) => fmtMoney(v)} onChange={setAmount} />
        <button class="btn small primary" disabled={credit < 100e6} onClick={() => game.borrow(Math.min(amount, credit))}>
          Borrow {fmtMoney(Math.min(amount, credit))}
        </button>
        {s.capital.loans.map((l) => (
          <div class="row between small" key={l.id} style={{ marginTop: '4px' }}>
            <span>
              {l.label}: {fmtMoney(l.balance)} @ {(l.rate * 100).toFixed(1)}%
            </span>
            <button class="btn small ghost" disabled={s.finance.cash < l.balance} onClick={() => game.repayLoan(l.id)}>
              Repay
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════ THE CRUNCH ════════════════════════════════════════
export function CrunchTracker() {
  const game = useGame();
  const s = game.state!;
  const f = s.finale;
  if (!f || f.done || game.mode !== 'map') return null;
  const fronts: FrontId[] = ['grid', 'supply', 'safety'];
  const icon: Record<FrontId, 'power' | 'ship' | 'shield'> = { grid: 'power', supply: 'ship', safety: 'shield' };
  return (
    <div class="crunch frame" data-tut="crunch">
      <div class="row between">
        <span class="label warn">
          <Icon name="crunch" size="sm" /> The Crunch
        </span>
        <span class="small muted">{fmtDays(f.endDay - s.day)} to hold</span>
      </div>
      {fronts.map((k) => {
        const fr = f.fronts[k];
        const rise = crunchRise(s, k);
        const tip = fr.lost
          ? `${FRONT_NAMES[k]}: lost.`
          : `${FRONT_NAMES[k]}: pressure ${Math.round(fr.pressure)}/100 (${rise.v >= 0 ? '+' : ''}${rise.v.toFixed(2)}/day). At 100 the front is lost.\n${rise.parts.map(([l, v]) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${l}`).join('\n')}`;
        return (
          <div key={k} class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={tip}>
            <Icon name={icon[k]} size="sm" />
            <span style={{ width: '104px' }} class={fr.lost ? 'bad' : fr.pressure > 70 ? 'warn' : ''}>
              {FRONT_NAMES[k]}
            </span>
            <div class="grow">{fr.lost ? <span class="bad">lost</span> : <Bar value={fr.pressure / 100} kind={fr.pressure > 70 ? 'warn' : 'violet'} />}</div>
          </div>
        );
      })}
    </div>
  );
}
