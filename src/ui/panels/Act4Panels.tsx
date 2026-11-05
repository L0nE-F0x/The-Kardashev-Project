/**
 * Act IV UI: the Planet panel (overview · provinces · grid · fusion · space · climate), the five-year
 * plan screen, the time-lapse overlay while the years jump, the jump report, the Heat Wall tracker
 * and the Act IV complete screen. Contracts posted here are awarded like any other (Charter → Contracts).
 */
import { useState } from 'preact/hooks';
import { Bar, Icon, KV, Panel, Portrait, SpeakerPortrait, useGame } from '../components';
import type { IconName } from '../icons';
import type { PlanetTab } from '../../game/game';
import type { AiId, ContractKind, ContractSize, FivePlan, Priority, Project } from '../../sim/types';
import { CONTRACT_KINDS, PARTNERS, SIZE_NAMES, YOU } from '../../content/charter';
import { AI_IDS, AIS, DESIGN_IDS, FUSION_DESIGNS, GOVERNORS, HEAT_FRONT_NAMES, HEAT_FRONTS, PLANET, PRIORITIES, PRIORITY_IDS, SHELLS, STAGE_NAMES, SUPERGRID_ROUTES } from '../../content/planet';
import { REGIONS } from '../../content/regions';
import { REGION_IDS, type RegionId } from '../../content/mapcodes';
import { canPost, contractEstimate, sizeText, biddersFor, youCanBid } from '../../sim/charter';
import { fmtDate, fmtDays, fmtMoney, fmtMW } from '../../sim/core';
import { planetChecklist } from '../../sim/act4';
import { aiRegionCount, canDelegate, regionsOf } from '../../sim/airegions';
import { avgWellbeing, wellbeingTarget } from '../../sim/provinces';
import { allJoined, gridSpan, linksBuilt, mainGrid } from '../../sim/supergrid';
import { designGW, dtGW, fleetBlocked, fleetValuePerGW, fusionTW, he3Cap, pilotBlocked, pilotOdds } from '../../sim/fusion';
import { cadence, moonStage, orbitGW, padsBuilt, spsGW } from '../../sim/orbit';
import { dacGt, rawWarming, warming } from '../../sim/climate';
import { worldMargin } from '../../sim/frontier';
import { bitPlanBlocked, defaultPlan } from '../../sim/plans';
import { heatRise } from '../../sim/heatwall';
import { worldClean } from '../../sim/world';
import { Face, ProjectRow, TenderCard, whereOptions } from './Act3Panels';
import { governorPortraitUrl } from '../../render/sprites/portraits';

const STAGE_BLURB = [
  'Settle the company question and set the first five-year plan.',
  'Lay the intercontinental links, fund fusion pilots, hand the first provinces to AIs, help the provinces in trouble.',
  'Build fleets of the fusion designs that worked; keep warming and the AIs in check.',
  'Spaceports, orbital data centres, space solar, the Moon base — and the planetary checklist.',
  'The Heat Wall: hold three fronts for 120 days.',
  'Act IV is complete.',
];

/** What opens when a stage begins (shown on the plan screen). */
const STAGE_OPENS = ['', 'Supergrid links, fusion pilots, AI provinces, carbon capture, water & cooling.', 'Fusion fleets of the designs that worked.', 'Spaceports, orbital data centres, space-solar stations, debris clean-up and the Moon.'];

const oddsWord = (p: number) => (p < 0.45 ? 'a long shot' : p < 0.6 ? 'a coin toss' : p < 0.78 ? 'likely' : 'very likely');
const aiFace = (ai: AiId, size = 32) => (ai === 'bit' ? <Portrait id="bit" size={size} /> : <SpeakerPortrait id={`ceo:${ai}`} size={size} />);

// ════════════════════════════════════════ THE PANEL ════════════════════════════════════════
export function PlanetPanel() {
  const game = useGame();
  const s = game.state!;
  const pl = s.planet;
  if (!pl) return null;
  const tab = game.planetTab;
  const tabs: [PlanetTab, string][] = [
    ['overview', 'Overview'],
    ['provinces', 'Provinces'],
    ['grid', 'Grid'],
    ['fusion', 'Fusion'],
    ['space', 'Space'],
    ['climate', 'Climate'],
  ];
  return (
    <Panel
      title="The Planet"
      icon="globe"
      class="wide research"
      onClose={() => game.openPanel(null)}
      extra={
        <span class="row" style={{ gap: '8px', alignItems: 'center' }}>
          <span class="small muted">
            Stage {Math.min(4, pl.stage)} · {STAGE_NAMES[pl.stage]}
          </span>
          {game.hasOrbitView && (
            <button class="btn small" onClick={() => (game.openPanel(null), game.enterOrbit())} data-tip="See the planet from orbit (V)">
              <Icon name="orbit" size="sm" /> Orbit
            </button>
          )}
        </span>
      }
    >
      <div class="tabs" role="tablist">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={`btn small ${tab === id ? 'active' : ''}`} onClick={() => game.setPlanetTab(id)} data-tut={`planet-${id}`}>
            {name}
          </button>
        ))}
      </div>
      <div class="tabbody">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'provinces' && <ProvincesTab />}
        {tab === 'grid' && <GridTab />}
        {tab === 'fusion' && <FusionTab />}
        {tab === 'space' && <SpaceTab />}
        {tab === 'climate' && <ClimateTab />}
      </div>
    </Panel>
  );
}

// ── a compact contract poster ──────────────────────────────────────────────────────────────
export function PostContract({ kind, opt, where: fixedWhere, label }: { kind: ContractKind; opt?: string; where?: string; label?: string }) {
  const game = useGame();
  const s = game.state!;
  const def = CONTRACT_KINDS[kind];
  const options = fixedWhere ? [] : whereOptions(s, kind);
  const [whereSel, setWhere] = useState<string>('');
  const [size, setSize] = useState<ContractSize>(2);
  const where = fixedWhere ?? options.find((o) => o.id === whereSel)?.id ?? options[0]?.id ?? 'global';
  const sz: ContractSize = def.fixed ? 1 : size;
  const est = contractEstimate(s, kind, sz, where, opt);
  const why = canPost(s, kind, sz, where, opt);
  const bidders = biddersFor(kind, where, opt).filter((b) => b !== YOU || youCanBid(s, kind));
  return (
    <div class="postrow row wrap" style={{ gap: '8px', alignItems: 'center', margin: '4px 0' }}>
      {!fixedWhere && options.length > 1 && (
        <select class="select" value={where} onChange={(e) => setWhere((e.target as HTMLSelectElement).value)} aria-label="Where" style={{ maxWidth: '260px' }}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.note ? ` — ${o.note}` : ''}
            </option>
          ))}
        </select>
      )}
      {!def.fixed && (
        <div class="seg">
          {([1, 2, 3] as ContractSize[]).map((n) => (
            <button key={n} class={`btn small ${sz === n ? 'active' : ''}`} onClick={() => setSize(n)} data-tip={sizeText(def, n)}>
              {SIZE_NAMES[n]}
            </button>
          ))}
        </div>
      )}
      <span
        class="small muted"
        data-tip={`Project value ${fmtMoney(est.value)}; the Charter pays ${Math.round(def.share * 100)}% (20% on award, the rest over the build). Bids come in above or below.\nBidders: ${bidders.map((b) => (b === YOU ? s.company.name : PARTNERS[b]?.short ?? b)).join(', ')}`}
      >
        {sizeText(def, sz)} · ~<span class="gold">{fmtMoney(est.share)}</span> · ~{fmtDays(est.days)}
      </span>
      <button class="btn small primary" disabled={!!why} onClick={() => game.postTender(kind, sz, where, opt)} data-tip={why ?? `${def.blurb}\n${def.effect}`}>
        <Icon name="tender" size="sm" /> {label ?? 'Post tender'}
      </button>
      {why && <span class="small warn">{why}</span>}
    </div>
  );
}

export function OpenWork({ kinds }: { kinds: ContractKind[] }) {
  const game = useGame();
  const c = game.state!.charter!;
  const tenders = c.tenders.filter((t) => kinds.includes(t.kind));
  const building = c.projects.filter((p) => p.status === 'building' && kinds.includes(p.kind));
  if (!tenders.length && !building.length) return null;
  return (
    <div class="section">
      {tenders.length > 0 && <h4>Open tenders ({tenders.length})</h4>}
      {tenders.map((t) => (
        <TenderCard key={t.id} t={t} />
      ))}
      {building.length > 0 && <h4 style={{ marginTop: '6px' }}>Under construction ({building.length})</h4>}
      {building.map((p) => (
        <ProjectRow key={p.id} p={p} />
      ))}
    </div>
  );
}

// ── overview ───────────────────────────────────────────────────────────────────────────────
function OverviewTab() {
  const game = useGame();
  const s = game.state!;
  const pl = s.planet!;
  const checks = planetChecklist(s);
  const co = pl.company;
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="plan" size="sm" /> Stage {Math.min(4, pl.stage)} · {STAGE_NAMES[pl.stage]}
          </h4>
          <p class="small" style={{ margin: '4px 0 8px' }}>
            {STAGE_BLURB[pl.stage]}
          </p>
          <KV
            rows={[
              ['Powers', pl.powers === 'planetary' ? <span class="good">Planetary</span> : pl.powers === 'limited' ? 'Limited — links and AI provinces need Council approval' : <span class="warn">Caretaker</span>, 'From Act III’s renewal vote. The “Planetary powers” resolution can upgrade them.'],
              ['Your company', co === 'utility' ? 'A public utility (the Charter’s)' : co === 'sell' ? 'Sold' : co === 'keep' ? 'Yours (two hats)' : <span class="warn">Undecided</span>],
              ['Kardashev', `${s.stats.K.toFixed(4)} · ${s.stats.worldTW.toFixed(1)} / ${PLANET.targetTW} TW`],
              ['Wellbeing', `${Math.round(avgWellbeing(s))} average`],
              ['Warming', `${warming(s).toFixed(2)} °C`],
            ]}
          />
          {pl.planOpen && (
            <button class="btn primary" style={{ marginTop: '6px' }} onClick={() => game.openPanel(null)} data-tip="The plan screen is waiting">
              <Icon name="plan" size="sm" /> Plan the next five years
            </button>
          )}
        </div>
        <div class="grow" style={{ minWidth: '260px' }} data-tut="planet-checklist">
          <h4>
            <Icon name="goals" size="sm" /> The planetary checklist
          </h4>
          <div class="small muted" style={{ marginBottom: '4px' }}>
            When every item holds at once, The Heat Wall begins — or in 2070 at the latest.
          </div>
          {checks.map((g) => (
            <div key={g.id} class="row small" style={{ gap: '6px', alignItems: 'center' }}>
              <span class={g.done ? 'good' : 'muted'}>{g.done ? '✓' : '○'}</span>
              <span class="grow">{g.label}</span>
              {g.note && <span class="muted">{g.note}</span>}
            </div>
          ))}
        </div>
      </div>
      {pl.jumps.length > 0 && (
        <div class="section">
          <h4>
            <Icon name="jump" size="sm" /> The years so far
          </h4>
          {pl.jumps
            .slice()
            .reverse()
            .map((j) => (
              <div key={j.from} class="row small" style={{ gap: '8px', alignItems: 'center' }}>
                <span class="grow">
                  {fmtDate(j.from)} → {fmtDate(j.to)} · into {STAGE_NAMES[j.stage]} · K {j.before.K.toFixed(4)} → {j.after.K.toFixed(4)}
                </span>
                <button class="btn small" onClick={() => game.showJumpReport(j)}>
                  Read the report
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

// ── provinces & AIs ────────────────────────────────────────────────────────────────────────
function ProvincesTab() {
  const game = useGame();
  const s = game.state!;
  const pl = s.planet!;
  const [pick, setPick] = useState<Partial<Record<RegionId, AiId>>>({});
  const margin = worldMargin(s);
  return (
    <>
      <div class="section">
        <h4>
          <Icon name="province" size="sm" /> Provinces
        </h4>
        <div class="small muted" style={{ marginBottom: '4px' }}>
          Hover a wellbeing bar for what drives it. AIs can run a province once their trust is {PLANET.aiTrustToDelegate}+ and the world safety margin is ≥ 0 (now {margin >= 0 ? '+' : ''}
          {margin.toFixed(2)}).
        </div>
        <div class="provtable">
          {REGION_IDS.map((r) => {
            const p = pl.provinces[r];
            const t = wellbeingTarget(s, r);
            const sel = pick[r] ?? AI_IDS.find((a) => canDelegate(s, r, a) === null) ?? 'bit';
            const why = canDelegate(s, r, sel);
            return (
              <div key={r} class="row small provrow" style={{ gap: '8px', alignItems: 'center' }}>
                <span data-tip={p.ai ? `${AIS[p.ai].name} runs ${REGIONS[r].name}.` : `${GOVERNORS[r].name}: “${GOVERNORS[r].line}”`}>
                  {p.ai ? aiFace(p.ai, 24) : <img class="portrait" src={governorPortraitUrl(r, p.wellbeing < 35 ? 'worried' : p.wellbeing > 70 ? 'happy' : 'neutral')} style={{ width: '24px', height: '24px' }} alt={GOVERNORS[r].name} draggable={false} />}
                </span>
                <span style={{ width: '128px' }}>
                  <b>{REGIONS[r].name}</b>
                  <div class="muted">{p.pop.toFixed(2)} bn people</div>
                </span>
                <span style={{ width: '56px' }} class={p.heat > 75 ? 'bad' : p.heat > 60 ? 'warn' : ''} data-tip="Heat index (0–100): warming, waste heat, cooling programmes.">
                  <Icon name="heat" size="sm" /> {Math.round(p.heat)}
                </span>
                <span style={{ width: '56px' }} class={p.water > 70 ? 'bad' : p.water > 50 ? 'warn' : ''} data-tip="Water stress (0–100): warming, desalination, the supergrid.">
                  <Icon name="desal" size="sm" /> {Math.round(p.water)}
                </span>
                <div class="grow" style={{ minWidth: '110px' }} data-tip={`Wellbeing ${Math.round(p.wellbeing)}, heading for ${Math.round(t.v)}:\n${t.parts.map(([l, v]) => `${l === 'Baseline' ? '' : v >= 0 ? '+' : ''}${v.toFixed(0)} ${l}`).join('\n')}`}>
                  <Bar value={p.wellbeing / 100} kind={p.wellbeing < 35 ? 'warn' : 'gold'} />
                </div>
                <span style={{ width: '160px' }} class="row" data-tip={p.ai ? `${AIS[p.ai].name} (${AIS[p.ai].temperament}) since ${fmtDate(p.aiSince)}` : 'Run by the Charter'}>
                  {p.ai ? (
                    <>
                      {aiFace(p.ai, 18)} <span style={{ marginLeft: '4px' }}>{AIS[p.ai].name}</span>
                      <button class="btn small ghost" onClick={() => game.recallProvince(r)} data-tip="Take it back (its trust −3)">
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <select class="select" value={sel} onChange={(e) => setPick({ ...pick, [r]: (e.target as HTMLSelectElement).value as AiId })} aria-label="AI" style={{ width: '82px' }}>
                        {AI_IDS.map((a) => (
                          <option key={a} value={a}>
                            {AIS[a].name}
                          </option>
                        ))}
                      </select>
                      <button class="btn small" disabled={!!why} onClick={() => game.delegateProvince(r, sel)} data-tip={why ?? `Hand ${REGIONS[r].name} to ${AIS[sel].name}.`}>
                        <Icon name="ai" size="sm" />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div class="section">
        <h4>
          <Icon name="ai" size="sm" /> The AIs ({aiRegionCount(s)} provinces delegated)
        </h4>
        <div class="cardgrid two">
          {AI_IDS.map((a) => {
            const def = AIS[a];
            const st = pl.ais[a];
            return (
              <div key={a} class="card frame" style={{ padding: '8px' }}>
                <div class="row" style={{ gap: '8px', alignItems: 'center' }}>
                  {aiFace(a, 32)}
                  <div class="grow">
                    <b>{def.name}</b> <span class="small muted">· {def.temperament}</span>
                    <Bar value={st.trust / 100} kind={st.trust < PLANET.aiTrustToDelegate ? 'warn' : 'violet'} tip={`Trust ${Math.round(st.trust)} / 100. Needs ${PLANET.aiTrustToDelegate} to run a province; below ${PLANET.aiTrustRevert} it loses them all.`} />
                  </div>
                </div>
                <div class="small" style={{ marginTop: '4px' }}>
                  {def.blurb}
                </div>
                <div class="small muted" style={{ marginTop: '2px' }}>
                  Runs: {regionsOf(s, a).map((r) => REGIONS[r].short).join(', ') || 'nothing yet'} · incidents {st.incidents}
                  {a === 'bit' ? ` · your bond ${pl.bitBond >= 0 ? '+' : ''}${Math.round(pl.bitBond)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div class="section">
        <h4>
          <Icon name="desal" size="sm" /> Water & cooling
        </h4>
        <PostContract kind="desal" />
      </div>
      <OpenWork kinds={['desal']} />
    </>
  );
}

// ── the supergrid ──────────────────────────────────────────────────────────────────────────
function GridTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const main = mainGrid(s);
  const span = gridSpan(s);
  return (
    <>
      <div class="section">
        <h4>
          <Icon name="supergrid" size="sm" /> The supergrid
        </h4>
        <KV
          rows={[
            ['Links built', `${linksBuilt(s)} of ${SUPERGRID_ROUTES.length}`],
            ['The main grid', main.length ? main.map((r) => REGIONS[r].short).join(', ') : 'Not yet: no two provinces are linked', 'Act IV links plus Act III’s HVDC routes. All twelve provinces in one grid is on the checklist.'],
            ['Daylight span', `${Math.round(span * 100)}%`, 'How much of the day some part of the main grid is in sunlight. Charter solar and wind on the grid deliver up to 25% more as the span grows (less is wasted).'],
            ['Every province joined', allJoined(s) ? <span class="good">Yes</span> : 'Not yet'],
          ]}
        />
      </div>
      <div class="section">
        <h4>Routes</h4>
        {SUPERGRID_ROUTES.map((r) => {
          const p = c.projects.find((x) => x.kind === 'link' && x.where === r.id && x.status !== 'cancelled');
          const down = p?.status === 'done' && (p.downUntil ?? 0) > s.day;
          return (
            <div key={r.id} class="row wrap small" style={{ gap: '8px', alignItems: 'center', borderTop: '1px solid var(--line)', padding: '4px 0' }}>
              <span style={{ minWidth: '170px' }} data-tip={r.blurb}>
                <b>{r.name}</b>
                <div class="muted">
                  {REGIONS[r.from].short}–{REGIONS[r.to].short} · {r.km.toLocaleString()} km{r.subsea ? ' · subsea' : ''}
                </div>
              </span>
              {p ? (
                <span class={down ? 'bad' : p.status === 'done' ? 'good' : ''}>
                  {down ? `fault — back ${fmtDate(p.downUntil ?? s.day)}` : p.status === 'done' ? `online · ${CONTRACT_KINDS.link.sizes[p.size - 1]} GW` : `building · ${Math.round((p.progress / Math.max(1, p.days)) * 100)}%`}
                </span>
              ) : (
                <PostContract kind="link" where={r.id} />
              )}
            </div>
          );
        })}
      </div>
      <OpenWork kinds={['link']} />
    </>
  );
}

// ── fusion ─────────────────────────────────────────────────────────────────────────────────
function FusionTab() {
  const game = useGame();
  const s = game.state!;
  const pl = s.planet!;
  return (
    <>
      <div class="section">
        <h4>
          <Icon name="fusion" size="sm" /> The fusion race
        </h4>
        <KV
          rows={[
            ['Fusion power', `${fmtMW(fusionTW(s) * 1e6)} average`],
            ['Tritium', `${Math.round(dtGW(s))} of ${Math.round(pl.tritium)} GW of D-T fusion fuelled`, 'D-T fleets (built and building) are capped by the tritium supply. Running fleets breed more every year.'],
            ['Helium-3', he3Cap(s) ? `${Math.round(designGW(s, 'dhe3'))} of ${he3Cap(s)} GW of D-He3 fuelled` : 'None yet — needs a lunar mine'],
          ]}
        />
      </div>
      {DESIGN_IDS.map((d) => {
        const def = FUSION_DESIGNS[d];
        const st = pl.fusion[d];
        const working = st.status === 'won' || st.status === 'partial';
        const pilotWhy = pilotBlocked(s, d);
        const odds = pilotOdds(s, d);
        return (
          <div key={d} class="card frame" style={{ padding: '8px', margin: '6px 0' }}>
            <div class="row" style={{ gap: '8px', alignItems: 'center' }}>
              <Face id={def.partner} size={28} />
              <div class="grow">
                <b>{def.name}</b> <span class="small muted">· {PARTNERS[def.partner]?.name}</span>
                <div class="small">{def.blurb}</div>
              </div>
              <span class={`label ${working ? 'good' : st.status === 'failed' ? 'bad' : ''}`}>
                {{ idle: 'unproven', pilot: 'pilot running', won: 'works', partial: 'half-works', failed: 'failed' }[st.status]}
              </span>
            </div>
            <div class="small muted" style={{ marginTop: '4px' }}>
              {working
                ? `Fleets: ${Math.round(designGW(s, d, true))} GW running, ${Math.round(designGW(s, d) - designGW(s, d, true))} GW building · ~${fmtMoney(fleetValuePerGW(s, d))} per GW · capacity factor ${Math.round(def.cf * (st.status === 'partial' ? 85 : 100))}%`
                : st.status === 'pilot'
                  ? `The pilot plant is being built (try ${st.tries}).`
                  : `A pilot is ${oddsWord(odds)} to work${st.tries ? ` (try ${st.tries + 1})` : ''} · ${fmtMoney(def.pilot)} · ~${fmtDays(def.pilotDays)}`}
            </div>
            {!working && st.status !== 'pilot' && pilotWhy && <div class="small warn">{pilotWhy}</div>}
            {working ? (
              <>
                <PostContract kind="ffleet" opt={d} label="Order a fleet" />
                {fleetBlocked(s, d, CONTRACT_KINDS.ffleet.sizes[0]) && <div class="small warn">{fleetBlocked(s, d, CONTRACT_KINDS.ffleet.sizes[0])}</div>}
              </>
            ) : st.status !== 'pilot' && !pilotWhy ? (
              <PostContract kind="fpilot" where={d} label="Fund a pilot" />
            ) : null}
          </div>
        );
      })}
      <OpenWork kinds={['fpilot', 'ffleet']} />
    </>
  );
}

// ── orbit & the Moon ───────────────────────────────────────────────────────────────────────
function SpaceTab() {
  const game = useGame();
  const s = game.state!;
  const pl = s.planet!;
  const m = moonStage(s);
  const nextMoon: ContractKind | null = m === 0 ? 'moonbase' : m === 1 ? 'moonmine' : m === 2 ? 'massdriver' : null;
  const open = pl.stage >= 3;
  return (
    <>
      {!open && <div class="small warn">Orbit and the Moon open in stage 3 · The High Frontier.</div>}
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="spaceport" size="sm" /> Launch
          </h4>
          <KV
            rows={[
              ['Cadence', `${cadence(s).toFixed(1)} launches a day`],
              ['Spaceport pads', `${padsBuilt(s)}`],
            ]}
          />
          {open && <PostContract kind="spaceport" />}
          <h4 style={{ marginTop: '8px' }}>
            <Icon name="odc" size="sm" /> In orbit
          </h4>
          <KV
            rows={[
              ['Orbital data centres', `${orbitGW(s)} GW IT`, 'Compute in permanent sunlight, cooled by space: access ↑ everywhere, less waste heat on Earth. Adds debris.'],
              ['Space-solar stations', `${spsGW(s)} GW beamed`],
            ]}
          />
          {open && (
            <>
              <div class="small muted">Orbital data centre</div>
              <PostContract kind="odc" />
              <div class="small muted">Space-solar station (the rectenna’s province)</div>
              <PostContract kind="sps" />
            </>
          )}
        </div>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="debris" size="sm" /> Debris
          </h4>
          {(['leo', 'geo', 'cis'] as const).map((k) => (
            <div key={k} class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={SHELLS[k].blurb}>
              <span style={{ width: '96px' }}>{SHELLS[k].name}</span>
              <div class="grow">
                <Bar value={pl.debris[k] / 100} kind={pl.debris[k] > 40 ? 'warn' : 'violet'} />
              </div>
              <span style={{ width: '28px', textAlign: 'right' }}>{Math.round(pl.debris[k])}</span>
            </div>
          ))}
          <div class="small muted">Above 40 in low orbit, collisions start — and each makes the next likelier.</div>
          {open && <PostContract kind="cleanup" />}
          <h4 style={{ marginTop: '8px' }}>
            <Icon name="moon" size="sm" /> The Moon
          </h4>
          <div class="small">{['No base yet.', 'Shackleton Base: an outpost making propellant from ice (space contracts −15%).', 'Outpost + lunar mine: metals and helium-3 (the D-He3 design opens).', 'Outpost, mine and mass driver: a lunar industrial port (orbital construction −25%).'][m]}</div>
          {open && nextMoon && <PostContract kind={nextMoon} label={`Post: ${CONTRACT_KINDS[nextMoon].name}`} />}
          {m > 0 && (
            <button class="btn small" style={{ marginTop: '4px' }} onClick={() => (game.openPanel(null), game.enterDiorama('moon'))}>
              <Icon name="moon" size="sm" /> Visit the Moon base
            </button>
          )}
        </div>
      </div>
      <OpenWork kinds={['spaceport', 'odc', 'sps', 'cleanup', 'moonbase', 'moonmine', 'massdriver', 'launch']} />
    </>
  );
}

// ── climate ────────────────────────────────────────────────────────────────────────────────
function ClimateTab() {
  const game = useGame();
  const s = game.state!;
  const c = s.charter!;
  const pl = s.planet!;
  const w = warming(s);
  return (
    <>
      <div class="section">
        <h4>
          <Icon name="warming" size="sm" /> Warming
        </h4>
        <KV
          rows={[
            ['Warming', <span class={w >= PLANET.goalWarming ? 'bad' : w > 1.8 ? 'warn' : 'good'}>{w.toFixed(2)} °C</span>, `The checklist needs it under ${PLANET.goalWarming.toFixed(1)} °C.`],
            ['Carbon budget left (2 °C)', `${Math.round(c.world.carbonGt)} Gt CO₂`, 'Below zero, warming is past 2 °C until carbon is pulled back out of the air.'],
            ['Emissions', `${c.world.co2Gt.toFixed(1)} Gt CO₂ / year`],
            ['Air capture', `${dacGt(s).toFixed(1)} Gt CO₂ / year`],
            ['World clean share', `${Math.round(worldClean(s) * 100)}%`],
            ...(pl.mask > 0.001 ? ([['Geoengineering mask', `−${pl.mask.toFixed(2)} °C (without it: ${rawWarming(s).toFixed(2)} °C)`, 'If the programme stops, this comes back within a couple of years.']] as [string, string, string][]) : []),
          ]}
        />
      </div>
      <div class="section">
        <h4>
          <Icon name="dac" size="sm" /> Direct air capture
        </h4>
        <PostContract kind="dac" />
      </div>
      <OpenWork kinds={['dac']} />
    </>
  );
}

// ════════════════════════════════════════ THE PLAN ════════════════════════════════════════
export function PlanModal() {
  const game = useGame();
  const s = game.state;
  const pl = s?.planet;
  const [plan, setPlan] = useState<FivePlan | null>(null);
  if (!s || !pl?.planOpen || s.events.active || game.mode === 'title') return null;
  const p = plan ?? defaultPlan(s);
  const next = pl.stage + 1;
  const bitWhy = bitPlanBlocked(s);
  const toggle = (x: Priority) => {
    const has = p.priorities.includes(x);
    const pri = has ? p.priorities.filter((y) => y !== x) : p.priorities.length >= 3 ? p.priorities : [...p.priorities, x];
    setPlan({ ...p, priorities: pri });
  };
  const to = new Date(Date.UTC(2027, 0, 1) + (s.day + p.years * 365.25) * 86_400_000).getUTCFullYear();
  return (
    <div class="scrim">
      <div class="modal frame planmodal" style={{ width: 'min(640px, 100%)' }} role="dialog" aria-label="Five-year plan" data-tut="plan">
        <div class="head">
          <Icon name="plan" size="lg" />
          <div class="grow">
            <div class="label">{fmtDate(s.day, true)} · the next stage</div>
            <h2>{STAGE_NAMES[next]}</h2>
          </div>
        </div>
        <div class="body">
          <p class="small" style={{ marginTop: 0 }}>
            <b>Opens:</b> {STAGE_OPENS[next]} Pick up to three priorities and how long the plan runs; the planner posts and awards contracts by your priorities while the years jump, and decisions are taken on autopilot.
          </p>
          <h4>Priorities ({p.priorities.length} / 3)</h4>
          <div class="cardgrid three">
            {PRIORITY_IDS.map((x) => (
              <button key={x} class={`btn buildcard ${p.priorities.includes(x) ? 'active' : ''}`} onClick={() => toggle(x)} data-tip={PRIORITIES[x].blurb}>
                <span class="t">
                  <Icon name={PRIORITIES[x].icon} size="sm" /> {PRIORITIES[x].name}
                </span>
                <span class="m">{p.priorities.includes(x) ? `#${p.priorities.indexOf(x) + 1}` : PRIORITIES[x].blurb}</span>
              </button>
            ))}
          </div>
          <div class="row wrap" style={{ gap: '16px', marginTop: '8px' }}>
            <div>
              <div class="small muted">Length</div>
              <div class="seg">
                {PLANET.jumpYears.map((y) => (
                  <button key={y} class={`btn small ${p.years === y ? 'active' : ''}`} onClick={() => setPlan({ ...p, years: y })}>
                    {y} years
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div class="small muted">Treasury reserve</div>
              <div class="seg">
                {[0, 0.25, 0.5].map((r) => (
                  <button key={r} class={`btn small ${p.reserve === r ? 'active' : ''}`} onClick={() => setPlan({ ...p, reserve: r })} data-tip={r ? `Keep ${Math.round(r * 12)} months of dues in the treasury.` : 'Spend freely.'}>
                    {r ? `${Math.round(r * 12)} months` : 'none'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div class="small muted">Who runs it</div>
              <div class="seg">
                <button class={`btn small ${!p.bitRuns ? 'active' : ''}`} onClick={() => setPlan({ ...p, bitRuns: false })}>
                  The planner
                </button>
                <button class={`btn small ${p.bitRuns ? 'active' : ''}`} disabled={!!bitWhy} onClick={() => setPlan({ ...p, bitRuns: true })} data-tip={bitWhy ?? 'Bit runs the plan: projects build 8% faster and its trust grows.'}>
                  Bit
                </button>
              </div>
            </div>
          </div>
          <div class="quote" style={{ marginTop: '10px' }}>
            <Portrait id="penny" size={40} />
            <div class="bubble">
              <b>Penny · Finance</b>
              Treasury {fmtMoney(s.charter?.budget ?? 0)}. Whatever we do, we’ll see the bill in {to}.
            </div>
          </div>
          <div class="choices">
            <button class="btn primary choice" disabled={!p.priorities.length} onClick={() => game.confirmPlan(p)}>
              <span class="t">
                <Icon name="jump" size="sm" /> Begin the plan — to {to}
              </span>
              <span class="d">The years run on autopilot; you’ll get the report at the other end.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** While the years jump: a year counter over the map's time-lapse. */
export function JumpOverlay() {
  const game = useGame();
  const s = game.state;
  const j = s?.planet?.jump;
  if (!s || !j) return null;
  const frac = (s.day - j.from) / Math.max(1, j.to - j.from);
  const year = new Date(Date.UTC(2027, 0, 1) + s.day * 86_400_000).getUTCFullYear();
  return (
    <div class="jump frame interactive" role="status">
      <div class="row between" style={{ alignItems: 'center', gap: '10px' }}>
        <span class="label">
          <Icon name="jump" size="sm" /> {STAGE_NAMES[j.stage]}
        </span>
        <span class="jumpyear">{year}</span>
        <button class="btn small" onClick={() => game.skipJump()}>
          Skip ⏭
        </button>
      </div>
      <Bar value={frac} kind="gold" />
      <div class="small muted">
        K {s.stats.K.toFixed(4)} · {s.stats.worldTW.toFixed(1)} TW · warming {warming(s).toFixed(2)} °C
      </div>
    </div>
  );
}

/** The report at the end of a jump: Bit's diary, before → after, what got built, what happened. */
export function JumpReportModal() {
  const game = useGame();
  const rec = game.jumpReport;
  const s = game.state;
  if (!rec || !s) return null;
  const a = rec.before;
  const b = rec.after;
  const delta = (label: string, va: string, vb: string, good?: boolean) => (
    <div class="delta" key={label}>
      <div class="label">{label}</div>
      <div class={`v ${good === undefined ? '' : good ? 'good' : 'warn'}`}>{vb}</div>
      <div class="small muted">from {va}</div>
    </div>
  );
  return (
    <div class="scrim">
      <div class="modal frame" style={{ width: 'min(680px, 100%)' }} role="dialog" aria-label="Jump report">
        <div class="head">
          <Icon name="jump" size="lg" />
          <div class="grow">
            <div class="label">
              {fmtDate(rec.from)} → {fmtDate(rec.to)}
            </div>
            <h2>{STAGE_NAMES[rec.stage]}</h2>
          </div>
        </div>
        <div class="body">
          <div class="quote">
            <Portrait id="bit" size={56} />
            <div class="bubble">
              <b>Bit’s diary</b>
              {rec.diary.map((l, i) => (
                <div key={i} style={{ marginTop: i ? '4px' : 0 }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
          <div class="deltas">
            {delta('Kardashev', a.K.toFixed(4), b.K.toFixed(4), b.K > a.K)}
            {delta('World power', `${a.tw.toFixed(1)} TW`, `${b.tw.toFixed(1)} TW`, b.tw > a.tw)}
            {delta('Warming', `${a.warming.toFixed(2)} °C`, `${b.warming.toFixed(2)} °C`, b.warming <= a.warming)}
            {delta('Wellbeing', `${Math.round(a.wellbeing)}`, `${Math.round(b.wellbeing)}`, b.wellbeing >= a.wellbeing)}
            {delta('Fusion', fmtMW(a.fusionGW * 1000), fmtMW(b.fusionGW * 1000))}
            {delta('Legitimacy', `${Math.round(a.legitimacy)}`, `${Math.round(b.legitimacy)}`, b.legitimacy >= a.legitimacy - 2)}
          </div>
          {rec.built.length > 0 && (
            <>
              <h4>Built</h4>
              <div class="small">{rec.built.join(' · ')}</div>
            </>
          )}
          {rec.highlights.length > 0 && (
            <>
              <h4 style={{ marginTop: '6px' }}>The headlines</h4>
              <ul class="small" style={{ margin: '2px 0', paddingLeft: '18px' }}>
                {rec.highlights.slice(0, 8).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </>
          )}
          {rec.auto.length > 0 && (
            <details class="small" style={{ marginTop: '4px' }}>
              <summary>Decisions taken on autopilot ({rec.auto.length})</summary>
              <ul style={{ margin: '2px 0', paddingLeft: '18px' }}>
                {rec.auto.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          )}
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.dismissJumpReport()}>
              <span class="t">
                <Icon name="play" size="sm" /> Into {STAGE_NAMES[rec.stage]}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════ THE HEAT WALL ════════════════════════════════════════
export function HeatWallTracker() {
  const game = useGame();
  const s = game.state!;
  const hw = s.planet?.heatwall;
  if (!hw || hw.done || game.mode !== 'map') return null;
  const icon: Record<string, IconName> = { heat: 'heat', cascade: 'debris', controls: 'ai' };
  return (
    <div class="crunch frame" data-tut="heatwall">
      <div class="row between">
        <span class="label warn">
          <Icon name="heat" size="sm" /> The Heat Wall
        </span>
        <span class="small muted">{fmtDays(hw.endDay - s.day)} to hold</span>
      </div>
      {HEAT_FRONTS.map((k) => {
        const fr = hw.fronts[k];
        const rise = heatRise(s, k);
        const tip = `${HEAT_FRONT_NAMES[k]}: pressure ${Math.round(fr.pressure)}/100 (${rise.v >= 0 ? '+' : ''}${rise.v.toFixed(2)}/day). At 100 the front is lost.\n${rise.parts.map(([l, v]) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${l}`).join('\n')}`;
        return (
          <div key={k} class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={tip}>
            <Icon name={icon[k]} size="sm" />
            <span style={{ width: '96px' }} class={fr.lost ? 'bad' : fr.pressure > 70 ? 'warn' : ''}>
              {HEAT_FRONT_NAMES[k]}
            </span>
            <div class="grow">{fr.lost ? <span class="bad">lost</span> : <Bar value={fr.pressure / 100} kind={fr.pressure > 70 ? 'warn' : 'violet'} />}</div>
          </div>
        );
      })}
      <div class="small muted">{AIS[hw.ai].name} wants the controls.</div>
    </div>
  );
}

// ════════════════════════════════════════ ACT IV COMPLETE ════════════════════════════════════════
export function Act4CompleteModal() {
  const game = useGame();
  const s = game.state!;
  const pl = s.planet!;
  const held = pl.heatwall?.held ?? 0;
  const st = s.stats;
  const doneProjects = (k: ContractKind) => (s.charter?.projects ?? []).filter((p: Project) => p.kind === k && p.status === 'done').length;
  return (
    <div class="scrim">
      <div class="modal frame">
        <div class="head">
          <span class="ico">☀</span>
          <div class="grow">
            <div class="label">{fmtDate(s.day, true)}</div>
            <h2>Act IV complete — Planetary</h2>
          </div>
        </div>
        <div class="body">
          <div class="story">
            A quarter-century as the planet’s operator: {doneProjects('link')} supergrid links, fusion from {[...new Set((s.charter?.projects ?? []).filter((p) => p.kind === 'ffleet' && p.status === 'done').map((p) => p.opt))].length} designs, {orbitGW(s)} GW of compute in orbit and a Moon base that is {['still a plan', 'an outpost', 'a mine', 'an industrial port'][moonStage(s)]}. The Heat Wall showed the limit: the climb to Type I continues above the sky.
          </div>
          <div class="deltas">
            <div class="delta">
              <div class="label">Kardashev</div>
              <div class={`v ${st.K >= 0.8 ? 'gold' : 'cyan'}`}>{st.K.toFixed(4)}</div>
              <div class="small muted">{st.worldTW.toFixed(0)} TW</div>
            </div>
            <div class="delta">
              <div class="label">The Heat Wall</div>
              <div class={`v ${held >= 2 ? 'good' : 'warn'}`}>{held} / 3</div>
              <div class="small muted">fronts held</div>
            </div>
            <div class="delta">
              <div class="label">Warming</div>
              <div class={`v ${warming(s) < 2 ? 'good' : 'warn'}`}>{warming(s).toFixed(2)} °C</div>
            </div>
            <div class="delta">
              <div class="label">Wellbeing</div>
              <div class="v">{Math.round(avgWellbeing(s))}</div>
            </div>
            <div class="delta">
              <div class="label">Fusion</div>
              <div class="v">{fusionTW(s).toFixed(2)} TW</div>
            </div>
            <div class="delta">
              <div class="label">AI provinces</div>
              <div class="v">{aiRegionCount(s)}</div>
              <div class="small muted">Bit’s bond {pl.bitBond >= 0 ? '+' : ''}{Math.round(pl.bitBond)}</div>
            </div>
          </div>
          <div class="quote">
            <Portrait id="kip" mood="excited" size={56} />
            <div class="bubble">
              <b>Kip · Space</b>
              Earth can’t hold Type I. The Sun can. Let’s go and get it.
            </div>
          </div>
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.dismissActComplete()}>
              <span class="t">
                <Icon name="play" size="sm" /> On to Act V · Type I
              </span>
              <span class="d">The Thermal Line, the foundries, the swarm — and the last climb to Kardashev 1.0000.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
