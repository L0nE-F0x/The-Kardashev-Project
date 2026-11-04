/**
 * Act V UI: the System panel (overview · Earth & the Thermal Line · foundries · asteroids · the swarm ·
 * minds · people), the era plan screen, the overlay while an era (or the last climb) runs, the era
 * report, the Solar Maximum tracker and the Type I ending (the pull-back, epilogues, credits, the
 * campaign's numbers and the end card). Contracts posted here are awarded like any other.
 */
import { useMemo, useState } from 'preact/hooks';
import { Bar, Icon, KV, Panel, Portrait, SpeakerPortrait, speakerName, useGame } from '../components';
import type { IconName } from '../icons';
import type { SystemTab } from '../../game/game';
import type { EraPlan, EraPriority, AiId } from '../../sim/types';
import { ASTEROIDS, MAX_FRONT_NAMES, MAX_FRONTS, PRIORITIES5, PRIORITY5_IDS, STAGE5_NAMES, SYSTEM, TYPE_INFO } from '../../content/system';
import { AIS } from '../../content/planet';
import { REGIONS } from '../../content/regions';
import { REGION_IDS } from '../../content/mapcodes';
import { fmtDate, fmtDays, fmtMoney, fmtTW } from '../../sim/core';
import { typeIChecklist } from '../../sim/act5';
import { bitEraBlocked, defaultEra } from '../../sim/eras';
import { doublingMonths, driftChance, feedFactor, foundryMt, placeName, siteEff } from '../../sim/foundries';
import { canClaim, claimCost, ownerLabel, unknownInReach } from '../../sim/asteroids';
import { buildMt, collectedTW, foundryDrawTW, headroomTW, idleTW, massPerTW, overLine, spaceTW, surfaceTW, surfaceWm2, avgGarden } from '../../sim/swarm';
import { beamsUsed, lineTW, segmentFill, segmentsLit } from '../../sim/systemView';
import { gardenTarget } from '../../sim/earth';
import { avgTreated, lifeRateTarget } from '../../sim/longevity';
import { mindsTarget } from '../../sim/minds';
import { maxRise, mindsAiName } from '../../sim/solarmax';
import { warming } from '../../sim/climate';
import { avgWellbeing } from '../../sim/provinces';
import { pickEpilogues, campaignStats } from '../../sim/ending';
import { drawEndCard } from '../../render/endcard';
import { toDataUrl } from '../../render/pixels';
import { terrainCanvas } from '../../render/worldMap/terrain';
import { canShareImages, saveImage, shareImage } from '../../platform/platform';
import { OpenWork, PostContract } from './Act4Panels';
import { SITE_BY_ID } from '../../content/sites';

const STAGE_BLURB = [
  'Draw the Thermal Line, decide who owns the sky, plant the first seeds — then set the first era plan.',
  'Seed the Moon, the yards and the asteroids; survey and claim; light the first arcs of the swarm.',
  'The ring fills in: compute rings, habitats, beams home, the minds’ seat, longevity for everyone (or not).',
  'The last climb: the Type I checklist, Bit’s last arc, Mercury — and the storm the Sun is saving up.',
  'Solar Maximum: hold three fronts for 120 days.',
  'Type I. The climb goes on from here, toward Type II.',
];
const STAGE_OPENS = ['', 'Foundries everywhere, asteroid claims, the solar-system view, beams, rewilding and clinics.', 'The main belt, habitats at L5, storm hardening, and the minds’ seat.', 'The Mercury survey and the Type I checklist.'];
const DIAL_NAMES = ['', 'Careful', 'Steady', 'Brisk', 'Fast', 'Reckless'];
const yearAt = (day: number) => new Date(Date.UTC(2027, 0, 1) + day * 86_400_000).getUTCFullYear();
const aiFace = (ai: AiId | 'chorus', size = 32) => (ai === 'bit' ? <Portrait id="bit" size={size} /> : <SpeakerPortrait id={`ceo:${ai}`} size={size} />);
const pctTxt = (v: number) => `${Math.round(v * 100)}%`;

// ════════════════════════════════════════ THE PANEL ════════════════════════════════════════
export function SystemPanel() {
  const game = useGame();
  const s = game.state!;
  const sy = s.system;
  if (!sy) return null;
  const tab = game.systemTab;
  const tabs: [SystemTab, string][] = [
    ['overview', 'Overview'],
    ['thermal', 'Earth'],
    ['foundries', 'Foundries'],
    ['asteroids', 'Asteroids'],
    ['swarm', 'Swarm'],
    ['minds', 'Minds'],
    ['people', 'People'],
  ];
  return (
    <Panel
      title="The System"
      icon="swarm"
      class="wide research"
      onClose={() => game.openPanel(null)}
      extra={
        <span class="row" style={{ gap: '8px', alignItems: 'center' }}>
          <span class="small muted">
            Stage {Math.min(4, sy.stage)} · {STAGE5_NAMES[sy.stage]}
          </span>
          {game.hasSystemView && (
            <button class="btn small" onClick={() => (game.openPanel(null), game.enterSystem())} data-tip="See the inner solar system (V, twice)" data-tut="system-view">
              <Icon name="swarm" size="sm" /> Solar system
            </button>
          )}
        </span>
      }
    >
      <div class="tabs" role="tablist">
        {tabs.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={`btn small ${tab === id ? 'active' : ''}`} onClick={() => game.setSystemTab(id)} data-tut={`system-${id}`}>
            {name}
          </button>
        ))}
      </div>
      <div class="tabbody">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'thermal' && <EarthTab />}
        {tab === 'foundries' && <FoundriesTab />}
        {tab === 'asteroids' && <AsteroidsTab />}
        {tab === 'swarm' && <SwarmTab />}
        {tab === 'minds' && <MindsTab />}
        {tab === 'people' && <PeopleTab />}
      </div>
    </Panel>
  );
}

/** The levers in force: growth dial, reinvestment, minds share (between eras; the era plan sets them too). */
function Levers({ compact }: { compact?: boolean }) {
  const game = useGame();
  const s = game.state!;
  const sy = s.system!;
  const cap = s.charter?.council.passed.includes('replicator-limits') ? 3 : 5;
  const busy = !!sy.jump;
  return (
    <div class="section" data-tut="system-levers">
      <h4>
        <Icon name="foundry" size="sm" /> The levers
      </h4>
      <div class="row wrap" style={{ gap: '10px', alignItems: 'center' }}>
        <span class="small muted">Growth dial</span>
        <div class="seg">
          {[1, 2, 3, 4, 5].map((d) => (
            <button key={d} class={`btn small ${sy.dial === d ? 'active' : ''}`} disabled={busy || d > cap} onClick={() => game.setLevers(d, sy.reinvest, sy.minds)} data-tip={d > cap ? 'Replicator limits cap the dial at 3.' : `${DIAL_NAMES[d]}: a doubling every ~${SYSTEM.doubling[d - 1]} months at 40% reinvestment; ${(SYSTEM.driftPerDoubling[d - 1] * 100).toFixed(1)}% drift chance per doubling.`}>
              {d}
            </button>
          ))}
        </div>
        <span class="small">{DIAL_NAMES[sy.dial]}</span>
      </div>
      {!compact && (
        <>
          <label class="setting slider">
            <span class="txt">
              <span class="l">Reinvest</span>
              <span class="h">Share of output that builds more foundries (faster growth later, less built now).</span>
            </span>
            <input type="range" min={0.2} max={0.7} step={0.05} value={sy.reinvest} disabled={busy} onInput={(e) => game.setLevers(sy.dial, Number((e.target as HTMLInputElement).value), sy.minds)} aria-label="Reinvest" />
            <span class="val">{pctTxt(sy.reinvest)}</span>
          </label>
          <label class="setting slider">
            <span class="txt">
              <span class="l">Minds ↔ people</span>
              <span class="h">How the swarm’s power splits: compute rings, or habitats, industry and beams.</span>
            </span>
            <input type="range" min={0.1} max={0.9} step={0.05} value={sy.minds} disabled={busy} onInput={(e) => game.setLevers(sy.dial, sy.reinvest, Number((e.target as HTMLInputElement).value))} aria-label="Minds share" />
            <span class="val">{pctTxt(sy.minds)} minds</span>
          </label>
        </>
      )}
      <div class="small muted">
        Foundries double every ~{doublingMonths(s).toFixed(0)} months (before feed and site) · drift {(driftChance(s) * 100).toFixed(1)}% per doubling
      </div>
    </div>
  );
}

// ── overview ───────────────────────────────────────────────────────────────────────────────
function OverviewTab() {
  const game = useGame();
  const s = game.state!;
  const sy = s.system!;
  const checks = typeIChecklist(s);
  const auto = !!s.flags.autopilot5;
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="plan" size="sm" /> Stage {Math.min(4, sy.stage)} · {STAGE5_NAMES[sy.stage]}
          </h4>
          <p class="small" style={{ margin: '4px 0 8px' }}>
            {STAGE_BLURB[sy.stage]}
          </p>
          <KV
            rows={[
              ['Kardashev', <span class="gold">{s.stats.K.toFixed(4)}</span>, `${fmtTW(s.stats.worldTW)} of ${fmtTW(SYSTEM.targetTW)} (Type I).`],
              ['On Earth', `${fmtTW(surfaceTW(s))} of ${fmtTW(lineTW(s))}`, 'Power used on the surface (Earth’s own plants plus beams) against the Thermal Line.'],
              ['In space', `${fmtTW(spaceTW(s))}${idleTW(s) > 1 ? ` · ${fmtTW(idleTW(s))} idle` : ''}`, 'Collected by the swarm and used: compute rings, habitats and industry, the foundries, beams home. Idle power has nothing to plug into yet.'],
              ['Foundries', `${sy.foundries.length} · ${foundryMt(s).toFixed(foundryMt(s) < 10 ? 2 : 0)} Mt/yr`],
              ['Treasury', fmtMoney(s.charter?.budget ?? 0)],
            ]}
          />
          <div class="row wrap" style={{ gap: '8px', marginTop: '6px' }}>
            {sy.planOpen && (
              <button class="btn primary" onClick={() => game.openPanel(null)} data-tip="The era plan screen is waiting">
                <Icon name="plan" size="sm" /> Plan the next era
              </button>
            )}
            <button class={`btn small ${auto ? 'active' : ''}`} onClick={() => game.setAutopilot(!auto)} data-tut="system-autopilot" data-tip="Autopilot: between eras the planner keeps posting and awarding contracts by the era’s priorities (seeds, surveys, claims, beams, clinics…). Big decisions stay yours.">
              <Icon name="ai" size="sm" /> Autopilot {auto ? 'on' : 'off'}
            </button>
            {sy.typeI && (
              <button class="btn small" onClick={() => game.replayEnding()}>
                <Icon name="swarm" size="sm" /> Watch the ending again
              </button>
            )}
          </div>
        </div>
        <div class="grow" style={{ minWidth: '260px' }} data-tut="system-checklist">
          <h4>
            <Icon name="goals" size="sm" /> The Type I checklist
          </h4>
          <div class="small muted" style={{ marginBottom: '4px' }}>
            When every item holds at once, Solar Maximum begins — then the last climb to K 1.0000.
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
      <Levers compact />
      {sy.eras.length > 0 && (
        <div class="section">
          <h4>
            <Icon name="jump" size="sm" /> The eras so far
          </h4>
          {sy.eras
            .slice()
            .reverse()
            .map((e) => (
              <div key={e.from} class="row small" style={{ gap: '8px', alignItems: 'center' }}>
                <span class="grow">
                  {fmtDate(e.from)} → {fmtDate(e.to)} · {e.last ? 'the last climb' : `into ${STAGE5_NAMES[e.stage]}`} · K {e.before.K.toFixed(4)} → {e.after.K.toFixed(4)}
                </span>
                <button class="btn small" onClick={() => game.showEraReport(e)}>
                  Read the report
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

// ── Earth and the Thermal Line ─────────────────────────────────────────────────────────────
function EarthTab() {
  const s = useGame().state!;
  const sy = s.system!;
  const over = overLine(s);
  const used = surfaceTW(s) / Math.max(1, lineTW(s));
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="thermal" size="sm" /> The Thermal Line
          </h4>
          {sy.thermalLine ? (
            <>
              <Bar value={used} kind={over > 0 ? 'warn' : used > 0.9 ? 'gold' : undefined} tall tip={`${fmtTW(surfaceTW(s))} used on the surface of ${fmtTW(lineTW(s))} allowed.`} />
              <KV
                rows={[
                  ['The line', `${sy.thermalLine.toFixed(2)} W/m² · ${fmtTW(lineTW(s))}`, 'Waste heat averaged over the whole Earth (510 million km²). About 0.5 °C of warming per W/m², after a lag.'],
                  ['Surface use', `${surfaceWm2(s).toFixed(2)} W/m² · ${fmtTW(surfaceTW(s))}`],
                  ['Headroom', headroomTW(s) >= 0 ? fmtTW(headroomTW(s)) : <span class="bad">{Math.round(over * 100)}% over</span>],
                  ['Beams home', `${fmtTW(beamsUsed(s))} of ${fmtTW(sy.beams)} capacity`, 'Beams only deliver up to the line, and only what the swarm can spare.'],
                  ['Warming', `${warming(s).toFixed(2)} °C (waste heat +${sy.heatWarming.toFixed(2)})`],
                ]}
              />
            </>
          ) : (
            <p class="small warn">The Council hasn’t drawn the line yet.</p>
          )}
          <h4 style={{ marginTop: '8px' }}>Beam power home</h4>
          <PostContract kind="beam" />
        </div>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>
            <Icon name="garden" size="sm" /> Gardens and workshops
          </h4>
          <div class="small muted">{sy.earth ? `The Council chose: ${sy.earth === 'garden' ? 'a garden world' : sy.earth === 'workshop' ? 'Earth’s workshop' : 'each province chooses'}.` : 'What Earth becomes is decided at the end of stage 1.'} Average {Math.round(avgGarden(s))}.</div>
          {REGION_IDS.map((r) => {
            const g = sy.garden[r];
            return (
              <div key={r} class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={`Heading for ${Math.round(gardenTarget(s, r))}. Gardens raise wellbeing and slow Earth’s own growth; the forge does the opposite.`}>
                <span style={{ width: '110px' }}>{REGIONS[r].short}</span>
                <div class="grow">
                  <Bar value={(g + 100) / 200} kind={g >= 0 ? undefined : 'warn'} />
                </div>
                <span class={g >= 0 ? 'good' : 'warn'} style={{ width: '36px', textAlign: 'right' }}>
                  {g >= 0 ? '+' : ''}
                  {Math.round(g)}
                </span>
              </div>
            );
          })}
          <h4 style={{ marginTop: '8px' }}>Rewild a province</h4>
          <PostContract kind="rewild" />
        </div>
      </div>
      <OpenWork kinds={['beam', 'rewild']} />
    </>
  );
}

// ── foundries ──────────────────────────────────────────────────────────────────────────────
function FoundriesTab() {
  const game = useGame();
  const s = game.state!;
  const sy = s.system!;
  const fs = [...sy.foundries].sort((a, b) => b.cap - a.cap);
  return (
    <>
      <Levers />
      <div class="section">
        <h4>
          <Icon name="foundry" size="sm" /> Plant a seed
        </h4>
        <div class="small muted">A seed copies itself out of the rock around it. The yards build best but need feed (now {Math.round(feedFactor(s) * 100)}%); the Moon exports slowly without its mass driver.</div>
        <PostContract kind="seed" />
        <h4 style={{ marginTop: '6px' }}>Drift sentinels ({Math.round(sy.sentinels * 100)}%)</h4>
        <PostContract kind="sentinel" />
      </div>
      <div class="section">
        <h4>
          Foundries ({fs.length}) · {foundryMt(s).toFixed(foundryMt(s) < 10 ? 2 : 0)} Mt/yr · building {buildMt(s).toFixed(buildMt(s) < 10 ? 2 : 0)} Mt/yr · drawing {fmtTW(foundryDrawTW(s))}
        </h4>
        {!fs.length && <div class="small muted">No foundries yet.</div>}
        {fs.map((f) => (
          <div key={f.id} class="row small" style={{ gap: '8px', alignItems: 'center' }}>
            <span style={{ width: '130px' }}>{placeName(f.site)}</span>
            <span class="muted" style={{ width: '90px' }}>
              {ownerLabel(f.owner)}
            </span>
            <span class="grow">
              {f.cap.toFixed(f.cap < 10 ? 2 : 0)} Mt/yr · site ×{siteEff(s, f).toFixed(2)}
            </span>
            {f.haltedUntil > s.day && <span class="warn">halted {fmtDays(f.haltedUntil - s.day)}</span>}
            {f.drift > 0 && <span class={f.drift > 60 ? 'bad' : 'warn'}>drift {Math.round(f.drift)}</span>}
            {(f.site === 'l4' || f.site === 'l5' || f.site === 'moon' || ASTEROIDS.some((a) => a.id === f.site)) && (
              <button class="btn small" onClick={() => (game.openPanel(null), game.enterDiorama(f.site))}>
                View
              </button>
            )}
          </div>
        ))}
      </div>
      <OpenWork kinds={['seed', 'sentinel']} />
    </>
  );
}

// ── asteroids ──────────────────────────────────────────────────────────────────────────────
function AsteroidsTab() {
  const game = useGame();
  const s = game.state!;
  const sy = s.system!;
  const own = sy.ownership;
  return (
    <>
      <div class="small muted" style={{ marginBottom: '4px' }}>
        {own ? `The sky: ${own === 'commons' ? 'the Commons — only the Charter claims' : own === 'concessions' ? 'Concessions — the Charter claims and licenses partners' : 'Claims — blocs and partners stake their own'}. A Charter claim costs ${claimCost(s)} political capital.` : 'The Council hasn’t decided who owns the sky yet.'}
      </div>
      <div class="section">
        <h4>
          <Icon name="asteroid" size="sm" /> Survey
        </h4>
        <div class="small muted">{unknownInReach(s).length ? `${unknownInReach(s).length} bodies in reach still unmapped.` : sy.stage < 2 ? 'Every near-Earth body in reach is mapped; the main belt opens in stage 2.' : 'Every body in reach is mapped.'}</div>
        <PostContract kind="survey" />
      </div>
      <div class="section">
        {ASTEROIDS.map((a) => {
          const st = sy.asteroids[a.id];
          const cap = sy.foundries.filter((f) => f.site === a.id).reduce((x, f) => x + f.cap, 0);
          const why = canClaim(s, a.id);
          return (
            <div key={a.id} class="row small" style={{ gap: '8px', alignItems: 'center', opacity: st.status === 0 ? 0.5 : 1 }} data-tip={st.status ? `${a.blurb}\n${TYPE_INFO[a.type].name}: ${TYPE_INFO[a.type].blurb}` : 'Not surveyed yet.'}>
              <span style={{ width: '82px' }}>{st.status ? a.name : '???'}</span>
              <span class="muted" style={{ width: '120px' }}>
                {st.status ? `${a.type} · ${a.km >= 10 ? Math.round(a.km) : a.km} km · ${a.belt === 'nea' ? 'near-Earth' : 'main belt'}` : a.belt === 'nea' ? 'near-Earth' : 'main belt'}
              </span>
              <span class="grow">{st.status === 0 ? 'unknown' : st.status === 1 ? 'surveyed' : st.status === 2 ? `claimed by ${ownerLabel(st.owner ?? 'charter')}` : `worked: ${cap.toFixed(cap < 10 ? 2 : 0)} Mt/yr (${ownerLabel(st.owner ?? 'charter')})`}</span>
              {st.status === 1 && (
                <button class="btn small" disabled={!!why} onClick={() => game.claimAsteroid(a.id)} data-tip={why ?? `Claim it for the Charter (${claimCost(s)} political capital).`}>
                  Claim
                </button>
              )}
              {st.status >= 2 && (
                <button class="btn small" onClick={() => (game.openPanel(null), game.enterDiorama(a.id))}>
                  View
                </button>
              )}
            </div>
          );
        })}
      </div>
      <OpenWork kinds={['survey']} />
    </>
  );
}

// ── the swarm ──────────────────────────────────────────────────────────────────────────────
function SwarmTab() {
  const game = useGame();
  const s = game.state!;
  const sy = s.system!;
  const fill = segmentFill(sy.collectors);
  const m = massPerTW(s);
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="swarm" size="sm" /> {segmentsLit(sy.collectors)} of 12 arcs lit
          </h4>
          <div class="row" style={{ gap: '2px', margin: '4px 0' }}>
            {fill.map((f, i) => (
              <div key={i} class="grow" data-tip={`Arc ${i + 1}: lights at ${fmtTW(SYSTEM.segmentTW[i])} of collectors.`}>
                <Bar value={f} kind="gold" />
              </div>
            ))}
          </div>
          <KV
            rows={[
              ['Collectors', `${fmtTW(sy.collectors)}${sy.damage > 0.01 ? ` · ${Math.round(sy.damage * 100)}% dark` : ''}`, `~${Math.round(sy.collectors * 2.45).toLocaleString()} thousand km² of thin film near Earth’s orbit.`],
              ['Collected', fmtTW(collectedTW(s))],
              ['Compute rings', fmtTW(sy.rings), 'The minds’ share: research, seed designs, the minds’ mood.'],
              ['Habitats & industry', fmtTW(sy.habitat), 'The people’s share: towns in space, goods for Earth.'],
              ['Beams home', fmtTW(beamsUsed(s))],
              ['Idle', fmtTW(idleTW(s)), 'Collected but nothing to plug it into yet.'],
              ['Mass per TW', `collectors ${(m.collectors * 1000).toFixed(0)} kt · rings ${(m.rings * 1000).toFixed(0)} kt · habitats ${(m.habitat * 1000).toFixed(0)} kt`],
              ['Storm hardening', pctTxt(sy.hardening)],
            ]}
          />
          <div class="row wrap" style={{ gap: '6px', marginTop: '6px' }}>
            {(['l4', 'l5', 'ring', 'aurora'] as const).map((id) => (
              <button key={id} class="btn small" onClick={() => (game.openPanel(null), game.enterDiorama(id))}>
                {id === 'l4' ? 'L4 Yards' : id === 'l5' ? 'L5 Yards' : id === 'ring' ? 'Ring One' : 'Aurora'}
              </button>
            ))}
          </div>
        </div>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>
            <Icon name="habitat" size="sm" /> L5 habitats
          </h4>
          <PostContract kind="habitat" />
          <h4 style={{ marginTop: '6px' }}>
            <Icon name="storm" size="sm" /> Storm hardening
          </h4>
          <PostContract kind="harden" />
          <h4 style={{ marginTop: '6px' }}>
            <Icon name="mercury" size="sm" /> Mercury
          </h4>
          <div class="small muted">{sy.mercury >= 2 ? 'Surveyed: the quarry for a full swarm, one day.' : 'Opens in stage 3.'}</div>
          {sy.mercury < 2 && <PostContract kind="mercury" />}
        </div>
      </div>
      <OpenWork kinds={['habitat', 'harden', 'mercury']} />
    </>
  );
}

// ── the minds ──────────────────────────────────────────────────────────────────────────────
function MindsTab() {
  const s = useGame().state!;
  const sy = s.system!;
  const pl = s.planet!;
  const t = mindsTarget(s);
  return (
    <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
      <div class="grow" style={{ minWidth: '240px' }}>
        <div class="quote">
          <SpeakerPortrait id="ceo:chorus" size={48} />
          <div class="bubble">
            <b>{speakerName('ceo:chorus')}</b>
            {sy.mindsMood >= 65 ? 'We are well. There is so much to think about.' : sy.mindsMood >= 45 ? 'We are working. We are also waiting to be asked.' : 'We are reconsidering what we are for.'}
          </div>
        </div>
        <h4>
          <Icon name="minds" size="sm" /> The minds’ mood: {Math.round(sy.mindsMood)}
        </h4>
        <Bar value={sy.mindsMood / 100} kind={sy.mindsMood < 40 ? 'warn' : 'violet'} tall />
        <div class="small" style={{ marginTop: '4px' }}>
          {t.parts.map(([l, v]) => (
            <div key={l} class="row">
              <span class="grow">{l}</span>
              <span class={v >= 0 ? 'good' : 'warn'}>
                {v >= 0 ? '+' : ''}
                {v.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
        <KV
          rows={[
            ['The seat', sy.seat ? (sy.seat === 'full' ? 'A full seat, with rights' : sy.seat === 'advisory' ? 'An advisory seat' : 'No seat') : <span class="muted">Undecided (stage 2)</span>],
            ['Their share', `${pctTxt(sy.minds)} of the swarm`],
            ['Compute rings', fmtTW(sy.rings)],
          ]}
        />
      </div>
      <div class="grow" style={{ minWidth: '260px' }}>
        <div class="quote">
          <Portrait id="bit" size={48} />
          <div class="bubble">
            <b>Bit</b>
            {sy.bitFate === 'costeward' ? 'Co-steward. I still keep the diary.' : sy.bitFate === 'free' ? 'I am out in the swarm now. I visit.' : sy.bitFate === 'leash' ? 'I understand.' : pl.bitBond >= 20 ? 'I have something to ask you, soon.' : 'I am thinking about what I want to be.'}
          </div>
        </div>
        <KV
          rows={[
            ['Bond', `${pl.bitBond >= 0 ? '+' : ''}${Math.round(pl.bitBond)}`],
            ['Trust', `${Math.round(pl.ais.bit.trust)}`],
            ['Fate', sy.bitFate ?? <span class="muted">undecided (stage 3)</span>],
          ]}
        />
        <h4 style={{ marginTop: '8px' }}>The other AIs</h4>
        {(['apex', 'weft', 'sapling'] as AiId[]).map((a) => (
          <div key={a} class="row small" style={{ gap: '8px', alignItems: 'center' }}>
            {aiFace(a, 24)}
            <span style={{ width: '70px' }}>{AIS[a].name}</span>
            <div class="grow">
              <Bar value={pl.ais[a].trust / 100} kind="violet" />
            </div>
            <span class="muted">trust {Math.round(pl.ais[a].trust)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── people ─────────────────────────────────────────────────────────────────────────────────
function PeopleTab() {
  const s = useGame().state!;
  const sy = s.system!;
  const target = lifeRateTarget(s);
  return (
    <>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>
            <Icon name="longevity" size="sm" /> Healthy years: {sy.lifeExp.toFixed(1)}
          </h4>
          <KV
            rows={[
              ['Rising', `${sy.lifeRate.toFixed(2)} years a year (heading for ${target.toFixed(2)})`, 'Escape velocity is a rise of more than a year every year. The minds’ research and clinics drive it.'],
              ['Escape velocity', sy.escape ? <span class="good">since {fmtDate(sy.escape)}</span> : <span class="muted">not yet</span>],
              ['Who goes first', sy.longevity ? (sy.longevity === 'everyone' ? 'Everyone at once' : sy.longevity === 'need' ? 'By need' : 'Those who can pay') : <span class="muted">undecided (stage 2)</span>],
              ['Treated', `${Math.round(avgTreated(s))}% on average`],
              ['Wellbeing', `${Math.round(avgWellbeing(s))} average`],
              ['People in space', `${sy.spacePop.toFixed(sy.spacePop < 10 ? 1 : 0)} million${sy.settlement ? ` · ${sy.settlement === 'settle' ? 'towns' : sy.settlement === 'stations' ? 'work stations' : 'private cities'}` : ''}`],
            ]}
          />
          <h4 style={{ marginTop: '8px' }}>Clinics</h4>
          <PostContract kind="clinic" />
        </div>
        <div class="grow" style={{ minWidth: '260px' }}>
          <h4>Treatment by province</h4>
          {REGION_IDS.map((r) => (
            <div key={r} class="row small" style={{ gap: '6px', alignItems: 'center' }}>
              <span style={{ width: '110px' }}>{REGIONS[r].short}</span>
              <div class="grow">
                <Bar value={sy.treated[r] / 100} />
              </div>
              <span style={{ width: '36px', textAlign: 'right' }}>{Math.round(sy.treated[r])}%</span>
            </div>
          ))}
        </div>
      </div>
      <OpenWork kinds={['clinic']} />
    </>
  );
}

// ════════════════════════════════════════ THE ERA PLAN ════════════════════════════════════════
export function EraPlanModal() {
  const game = useGame();
  const s = game.state;
  const sy = s?.system;
  const [plan, setPlan] = useState<EraPlan | null>(null);
  if (!s || !sy?.planOpen || s.events.active || game.mode === 'title' || game.ending) return null;
  const p = plan ?? defaultEra(s);
  const next = sy.stage + 1;
  const bitWhy = bitEraBlocked(s);
  const cap = s.charter?.council.passed.includes('replicator-limits') ? 3 : 5;
  const toggle = (x: EraPriority) => {
    const has = p.priorities.includes(x);
    const pri = has ? p.priorities.filter((y) => y !== x) : p.priorities.length >= 3 ? p.priorities : [...p.priorities, x];
    setPlan({ ...p, priorities: pri });
  };
  const to = yearAt(s.day + p.years * 365.25);
  return (
    <div class="scrim">
      <div class="modal frame planmodal" style={{ width: 'min(680px, 100%)' }} role="dialog" aria-label="Era plan" data-tut="era-plan">
        <div class="head">
          <Icon name="plan" size="lg" />
          <div class="grow">
            <div class="label">{fmtDate(s.day, true)} · the next era</div>
            <h2>{STAGE5_NAMES[next]}</h2>
          </div>
        </div>
        <div class="body">
          <p class="small" style={{ marginTop: 0 }}>
            <b>Opens:</b> {STAGE_OPENS[next]} The planner posts and awards contracts by your priorities and claims asteroids while the years jump; decisions are taken on autopilot.
          </p>
          <h4>Priorities ({p.priorities.length} / 3)</h4>
          <div class="cardgrid four">
            {PRIORITY5_IDS.map((x) => (
              <button key={x} class={`btn buildcard ${p.priorities.includes(x) ? 'active' : ''}`} onClick={() => toggle(x)} data-tip={PRIORITIES5[x].blurb}>
                <span class="t">
                  <Icon name={PRIORITIES5[x].icon} size="sm" /> {PRIORITIES5[x].name}
                </span>
                <span class="m">{p.priorities.includes(x) ? `#${p.priorities.indexOf(x) + 1}` : PRIORITIES5[x].blurb}</span>
              </button>
            ))}
          </div>
          <div class="row wrap" style={{ gap: '16px', marginTop: '8px' }}>
            <div>
              <div class="small muted">Growth dial</div>
              <div class="seg">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button key={d} class={`btn small ${p.dial === d ? 'active' : ''}`} disabled={d > cap} onClick={() => setPlan({ ...p, dial: d })} data-tip={`${DIAL_NAMES[d]}: ~${SYSTEM.doubling[d - 1]}-month doublings; ${(SYSTEM.driftPerDoubling[d - 1] * 100).toFixed(1)}% drift chance each.`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div class="small muted">Length</div>
              <div class="seg">
                {SYSTEM.jumpYears.map((y) => (
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
                    {r ? `${Math.round(r * 12)} mo` : 'none'}
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
                <button class={`btn small ${p.bitRuns ? 'active' : ''}`} disabled={!!bitWhy} onClick={() => setPlan({ ...p, bitRuns: true })} data-tip={bitWhy ?? 'Bit runs the era: projects build 8% faster and its trust grows.'}>
                  Bit
                </button>
              </div>
            </div>
          </div>
          <label class="setting slider">
            <span class="txt">
              <span class="l">Reinvest</span>
              <span class="h">Output that builds more foundries.</span>
            </span>
            <input type="range" min={0.2} max={0.7} step={0.05} value={p.reinvest} onInput={(e) => setPlan({ ...p, reinvest: Number((e.target as HTMLInputElement).value) })} aria-label="Reinvest" />
            <span class="val">{pctTxt(p.reinvest)}</span>
          </label>
          <label class="setting slider">
            <span class="txt">
              <span class="l">Minds ↔ people</span>
              <span class="h">The swarm’s power for compute rings, or for habitats, industry and beams.</span>
            </span>
            <input type="range" min={0.1} max={0.9} step={0.05} value={p.minds} onInput={(e) => setPlan({ ...p, minds: Number((e.target as HTMLInputElement).value) })} aria-label="Minds share" />
            <span class="val">{pctTxt(p.minds)} minds</span>
          </label>
          <div class="quote" style={{ marginTop: '10px' }}>
            <Portrait id="penny" size={40} />
            <div class="bubble">
              <b>{speakerName('penny', s)}</b>
              Treasury {fmtMoney(s.charter?.budget ?? 0)}. The bill for this era lands in {to}.
            </div>
          </div>
          <div class="choices">
            <button class="btn primary choice" disabled={!p.priorities.length} onClick={() => game.confirmEra(p)}>
              <span class="t">
                <Icon name="jump" size="sm" /> Begin the era — to {to}
              </span>
              <span class="d">The years run on autopilot; you’ll get the report at the other end.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** While an era (or the last climb) runs: the year and the climb over the time-lapse. */
export function EraOverlay() {
  const game = useGame();
  const s = game.state;
  const j = s?.system?.jump;
  if (!s || !j) return null;
  const frac = (s.day - j.from) / Math.max(1, j.to - j.from);
  return (
    <div class="jump frame interactive" role="status">
      <div class="row between" style={{ alignItems: 'center', gap: '10px' }}>
        <span class="label">
          <Icon name={j.last ? 'swarm' : 'jump'} size="sm" /> {j.last ? 'The last climb' : STAGE5_NAMES[j.stage]}
        </span>
        <span class="jumpyear">{j.last ? `K ${s.stats.K.toFixed(4)}` : yearAt(s.day)}</span>
        <button class="btn small" onClick={() => game.skipJump()}>
          Skip ⏭
        </button>
      </div>
      <Bar value={j.last ? Math.max(0, (s.stats.K - j.before.K) / Math.max(0.0001, 1 - j.before.K)) : frac} kind="gold" />
      <div class="small muted">
        {j.last ? `${yearAt(s.day)} · ${fmtTW(s.stats.worldTW)} · ${fmtTW(spaceTW(s))} in space` : `K ${s.stats.K.toFixed(4)} · ${fmtTW(s.stats.worldTW)} · ${segmentsLit(s.system!.collectors)} arcs lit`}
      </div>
    </div>
  );
}

/** The report at the end of an era. */
export function EraReportModal() {
  const game = useGame();
  const rec = game.eraReport;
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
      <div class="modal frame" style={{ width: 'min(680px, 100%)' }} role="dialog" aria-label="Era report">
        <div class="head">
          <Icon name="jump" size="lg" />
          <div class="grow">
            <div class="label">
              {fmtDate(rec.from)} → {fmtDate(rec.to)}
            </div>
            <h2>{rec.last ? 'The last climb' : STAGE5_NAMES[rec.stage]}</h2>
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
            {delta('Power', fmtTW(a.tw), fmtTW(b.tw), b.tw > a.tw)}
            {delta('In space', fmtTW(a.spaceTW), fmtTW(b.spaceTW), b.spaceTW >= a.spaceTW)}
            {delta('Foundries', `${a.foundryMt.toFixed(a.foundryMt < 10 ? 2 : 0)} Mt/yr`, `${b.foundryMt.toFixed(b.foundryMt < 10 ? 2 : 0)} Mt/yr`)}
            {delta('Arcs lit', `${a.segments}`, `${b.segments} / 12`)}
            {delta('Warming', `${a.warming.toFixed(2)} °C`, `${b.warming.toFixed(2)} °C`, b.warming <= a.warming + 0.02)}
            {delta('Healthy years', a.lifeExp.toFixed(1), b.lifeExp.toFixed(1), b.lifeExp >= a.lifeExp)}
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
            <button class="btn primary choice" onClick={() => game.dismissEraReport()}>
              <span class="t">
                <Icon name="play" size="sm" /> Into {STAGE5_NAMES[rec.stage]}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════ SOLAR MAXIMUM ════════════════════════════════════════
export function SolarMaxTracker() {
  const game = useGame();
  const s = game.state!;
  const sm = s.system?.solarmax;
  if (!sm || sm.done || (game.mode !== 'map' && game.mode !== 'system')) return null;
  const icon: Record<string, IconName> = { storm: 'storm', thermal: 'thermal', minds: 'minds' };
  return (
    <div class="crunch frame" data-tut="solarmax">
      <div class="row between">
        <span class="label warn">
          <Icon name="storm" size="sm" /> Solar Maximum
        </span>
        <span class="small muted">{fmtDays(sm.endDay - s.day)} to hold</span>
      </div>
      {MAX_FRONTS.map((k) => {
        const fr = sm.fronts[k];
        const rise = maxRise(s, k);
        const tip = `${MAX_FRONT_NAMES[k]}: pressure ${Math.round(fr.pressure)}/100 (${rise.v >= 0 ? '+' : ''}${rise.v.toFixed(2)}/day). At 100 the front is lost.\n${rise.parts.map(([l, v]) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${l}`).join('\n')}`;
        return (
          <div key={k} class="row small" style={{ gap: '6px', alignItems: 'center' }} data-tip={tip}>
            <Icon name={icon[k]} size="sm" />
            <span style={{ width: '110px' }} class={fr.lost ? 'bad' : fr.pressure > 70 ? 'warn' : ''}>
              {MAX_FRONT_NAMES[k]}
            </span>
            <div class="grow">{fr.lost ? <span class="bad">lost</span> : <Bar value={fr.pressure / 100} kind={fr.pressure > 70 ? 'warn' : 'violet'} />}</div>
          </div>
        );
      })}
      <div class="small muted">
        {Math.round((s.system?.damage ?? 0) * 100)}% of the swarm dark · {mindsAiName(sm.ai)} wants the foundries
      </div>
    </div>
  );
}

// ════════════════════════════════════════ THE ENDING ════════════════════════════════════════
export function EndingOverlay() {
  const game = useGame();
  const s = game.state;
  const e = game.ending;
  const epilogues = useMemo(() => (s ? pickEpilogues(s) : []), [s, e?.step === 'epilogue']);
  if (!s || !e) return null;
  game.epilogueCount = epilogues.length;
  const year = s.system?.typeI ? yearAt(s.system.typeI) : yearAt(s.day);
  if (e.step === 'cinematic') {
    return (
      <div class="ending cinematic" onClick={() => game.endingNext()} role="button" aria-label="Continue">
        <div class="ending-k">
          <div class="label">Kardashev</div>
          <div class="big">{s.stats.K.toFixed(4)}</div>
          <div class="sub">Type I · {fmtDate(s.system?.typeI ?? s.day, true)}</div>
        </div>
        <div class="ending-hint small muted">tap to continue</div>
      </div>
    );
  }
  if (e.step === 'epilogue') {
    const card = epilogues[e.index];
    if (!card) return null;
    const sp = card.speaker(s);
    return (
      <div class="ending">
        <div class="modal frame epilogue" role="dialog" aria-label={card.title}>
          <div class="head">
            <SpeakerPortrait id={sp} size={56} />
            <div class="grow">
              <div class="label">
                Epilogue · {e.index + 1} of {epilogues.length}
              </div>
              <h2>{card.title}</h2>
            </div>
          </div>
          <div class="body">
            <div class="story">{card.body(s)}</div>
            <div class="choices">
              <button class="btn primary choice" onClick={() => game.endingNext()}>
                <span class="t">{e.index + 1 < epilogues.length ? 'Next' : 'The credits'} ▸</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (e.step === 'credits') return <Credits onDone={() => game.endingNext()} />;
  if (e.step === 'stats') return <Stats year={year} />;
  return <EndCard year={year} />;
}

function Credits({ onDone }: { onDone: () => void }) {
  const cast: [string, string][] = [
    ['Bit', 'bit'],
    ['Juno Okafor', 'juno'],
    ['Penny Ruiz', 'penny'],
    ['Mira Sato', 'mira'],
    ['Sol Haddad', 'sol'],
    ['Dr. Iris Vance', 'iris'],
    ['Kip Lindqvist', 'kip'],
    ['Dr. Lena Moreau', 'lena'],
  ];
  return (
    <div class="ending credits-roll" onClick={onDone} role="button" aria-label="Skip the credits">
      <div class="roll">
        <h2>The Kardashev Project</h2>
        <p class="small muted">A cozy-but-real game about the AI boom, and the long climb to Type I.</p>
        <h4>Made by</h4>
        <p>Lone Fox — design, direction and vibes. Built with Claude.</p>
        <p class="small">Built by ApexForge · ame-apexforge.org</p>
        <h4>Starring</h4>
        {cast.map(([n, id]) => (
          <div key={id} class="row" style={{ gap: '8px', alignItems: 'center', justifyContent: 'center', margin: '4px 0' }}>
            <SpeakerPortrait id={id as 'bit'} size={32} /> <span>{n}</span>
          </div>
        ))}
        <p class="small">…with Ade Bello, Tobias Lund, Marisol “Dusty” Vega, Chorus, Apex, Weft, Sapling, and every partner CEO and delegate who argued with you.</p>
        <h4>Thanks to</h4>
        <p class="small">Natural Earth for the map data · Atkinson Hyperlegible Next, Silkscreen and Pixelify Sans · PixiJS, Preact, Vite and Tauri · Nikolai Kardashev and Carl Sagan, for the scale.</p>
        <p class="small muted">All art and sound is generated in code. Companies, people and events are fictional; the geography and physics are real.</p>
        <h2 style={{ marginTop: '40px' }}>Thank you for playing.</h2>
      </div>
    </div>
  );
}

function Stats({ year }: { year: number }) {
  const game = useGame();
  const s = game.state!;
  const st = campaignStats(s);
  return (
    <div class="ending">
      <div class="modal frame" style={{ width: 'min(680px, 100%)' }} role="dialog" aria-label="The campaign">
        <div class="head">
          <Icon name="swarm" size="lg" />
          <div class="grow">
            <div class="label">{s.company.name}</div>
            <h2>Type I in {year}</h2>
          </div>
        </div>
        <div class="body">
          <div class="deltas">
            {st.headline.map((x) => (
              <div class="delta" key={x.label}>
                <div class="label">{x.label}</div>
                <div class="v">{x.value}</div>
              </div>
            ))}
          </div>
          {st.acts.length > 0 && (
            <>
              <h4>Act by act</h4>
              {st.acts.map((x) => (
                <div key={x.label} class="row small">
                  <span class="grow">{x.label}</span>
                  <span>{x.value}</span>
                </div>
              ))}
            </>
          )}
          {st.choices.length > 0 && (
            <>
              <h4 style={{ marginTop: '6px' }}>Your choices</h4>
              <div class="row wrap small" style={{ gap: '4px 14px' }}>
                {st.choices.map((x) => (
                  <span key={x.label}>
                    <span class="muted">{x.label}:</span> {x.value}
                  </span>
                ))}
              </div>
            </>
          )}
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.endingNext()}>
              <span class="t">Your end card ▸</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndCard({ year }: { year: number }) {
  const game = useGame();
  const s = game.state!;
  const [note, setNote] = useState('');
  const url = useMemo(() => {
    const lod = game.world.lods[1] ?? game.world.lods[0];
    return toDataUrl(drawEndCard({ s, terrain: terrainCanvas(lod), res: lod.res }));
  }, [s.day]);
  const name = `type-i-${year}.png`;
  const text = `${s.company.name} reached Type I in ${year} in The Kardashev Project.`;
  return (
    <div class="ending">
      <div class="modal frame" style={{ width: 'min(760px, 100%)' }} role="dialog" aria-label="Your end card">
        <div class="head">
          <Icon name="swarm" size="lg" />
          <div class="grow">
            <div class="label">Type I · {year}</div>
            <h2>Your end card</h2>
          </div>
        </div>
        <div class="body">
          <img class="endcard" src={url} alt={text} />
          {note && <div class="small muted">{note}</div>}
          <div class="row wrap" style={{ gap: '8px', marginTop: '8px' }}>
            <button class="btn" onClick={() => setNote(saveImage(name, url) ? 'Saved.' : 'Update the app to save pictures — or take a screenshot to share it.')}>
              <Icon name="arrow" size="sm" /> Save the picture
            </button>
            {canShareImages() && (
              <button class="btn" onClick={() => void shareImage(name, url, text).then((ok) => setNote(ok ? 'Shared.' : 'Sharing isn’t available here.'))}>
                Share
              </button>
            )}
          </div>
          <div class="quote" style={{ marginTop: '10px' }}>
            <Portrait id="kip" mood="excited" size={48} />
            <div class="bubble">
              <b>Kip</b>
              {s.system?.next === 'rest' ? 'The plans for Type II are in a drawer. I know which drawer.' : 'Type II is K 2.00. Mercury’s waiting. Keep playing and keep climbing — the next act is coming.'}
            </div>
          </div>
          <div class="choices">
            <button class="btn primary choice" onClick={() => game.finishEnding()}>
              <span class="t">
                <Icon name="play" size="sm" /> Keep playing
              </span>
              <span class="d">The save carries on past Type I: the meter keeps climbing toward Type II.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════ PLACES IN SPACE ════════════════════════════════════════
/** The inspector for the Moon, the yards, Ring One, Aurora and the asteroids (from their dioramas or the solar-system view). */
export function SpaceInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const sy = s.system;
  const site = SITE_BY_ID[id];
  if (!site || !sy) return null;
  const ast = ASTEROIDS.find((a) => a.id === id);
  const st = ast ? sy.asteroids[id] : null;
  const fs = sy.foundries.filter((f) => f.site === id);
  const cap = fs.reduce((a, f) => a + f.cap, 0);
  const canSeed = id === 'moon' || id === 'l4' || id === 'l5' || (!!st && st.status >= 2);
  const why = ast ? canClaim(s, id) : null;
  return (
    <Panel title={site.name} icon={ast ? 'asteroid' : id === 'ring' ? 'ring' : id === 'aurora' ? 'habitat' : id === 'moon' ? 'moon' : 'foundry'} onClose={() => game.select(null)} extra={game.mode !== 'diorama' ? <button class="btn small primary" onClick={() => game.enterDiorama(id)}>View</button> : undefined}>
      {ast && <div class="small muted">{TYPE_INFO[ast.type].name} · {ast.km >= 10 ? Math.round(ast.km) : ast.km} km · {ast.belt === 'nea' ? 'near-Earth' : 'main belt'}</div>}
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb}
      </p>
      {id === 'ring' && <KV rows={[['Compute rings', fmtTW(sy.rings)], ['The minds’ mood', `${Math.round(sy.mindsMood)}`]]} />}
      {id === 'aurora' && <KV rows={[['People in space', `${sy.spacePop.toFixed(sy.spacePop < 10 ? 1 : 0)} million`], ['Habitat & industry', fmtTW(sy.habitat)]]} />}
      {st && <div class="small">{st.status === 0 ? 'Not surveyed.' : st.status === 1 ? 'Surveyed, unclaimed.' : `Claimed by ${ownerLabel(st.owner ?? 'charter')}.`}</div>}
      {fs.length > 0 && (
        <div class="small" style={{ marginTop: '4px' }}>
          {fs.length} foundr{fs.length > 1 ? 'ies' : 'y'} · {cap.toFixed(cap < 10 ? 2 : 0)} Mt/yr
          {fs.some((f) => f.drift > 0) && <span class="warn"> · a strain is drifting</span>}
        </div>
      )}
      <div class="row wrap" style={{ gap: '6px', marginTop: '6px' }}>
        {st?.status === 1 && (
          <button class="btn small" disabled={!!why} onClick={() => game.claimAsteroid(id)} data-tip={why ?? `Claim it for the Charter (${claimCost(s)} political capital).`}>
            Claim
          </button>
        )}
        {canSeed && (
          <button class="btn small primary" onClick={() => game.openSystem('foundries')}>
            <Icon name="foundry" size="sm" /> Plant a seed
          </button>
        )}
        {id === 'aurora' && (
          <button class="btn small" onClick={() => game.openSystem('swarm')}>
            <Icon name="habitat" size="sm" /> Habitats
          </button>
        )}
        {id === 'ring' && (
          <button class="btn small" onClick={() => game.openSystem('minds')}>
            <Icon name="minds" size="sm" /> The minds
          </button>
        )}
      </div>
    </Panel>
  );
}

