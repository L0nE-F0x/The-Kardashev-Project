import { Bar, Icon, KV, Panel, pct, useGame } from './components';
import { SITE_BY_ID, siteDef } from '../content/sites';
import { REGIONS, STANCE_LABEL } from '../content/regions';
import { FACILITIES, BUILDABLE } from '../content/facilities';
import { CHIP_SUPPLIERS, COMPANIES, RENTAL } from '../content/companies';
import type { RegionId } from '../content/mapcodes';
import type { FacilityType } from '../sim/types';
import { fmtDays, fmtMoney, fmtMW, fmtNum } from '../sim/core';
import { buildCost, buildDays, chipSpec, dcCapacityUnits, facilityIT, facilityMW, facilityPkgUnits, tierMult, gridHeadroomLeft, gridLeadDays, gridPrice, GRID_FEE_PER_MW, landCost, nextTier, pueAt, siteSlots, supplierDailyRate, upgradeCost, upgradeDays } from '../sim/model';
import { canBuild, canBuyLand, canUpgrade, gridOptions, slotsUsed, stakePrice } from '../sim/actions';
import { CABLES } from '../content/network';
import { MINE_BY_ID, MATERIALS } from '../content/stack';
import { RULE_BY_ID } from '../content/politics';
import { cableCut } from '../sim/network';
import { useState } from 'preact/hooks';
import { LANDING_SITES } from '../content/sites';
import { inventoryCount } from '../sim/supply';
import { BUILD_SITES } from '../content/sites';
import type { IconName } from './icons';
import { CharterHqInspector, LaunchInspector, MegaInspector } from './panels/Act3Panels';

export const FAC_ICON: Record<FacilityType, IconName> = {
  datacenter: 'datacenter', solar: 'solar', wind: 'wind', gas: 'gas', battery: 'battery', lab: 'lab', hq: 'hq',
  hydro: 'hydro', geothermal: 'geothermal', restart: 'restart', smr: 'smr', reactor: 'reactor', packaging: 'packaging', fab: 'fab', campus: 'campus',
};

const RIVAL_COLOR: Record<string, string> = { meridian: 'var(--c-red5, #c44)', lattice: 'var(--c-vio5, #96c)', orchard: 'var(--c-grn5, #5a5)' };

/** Act II types whose geography this site can never satisfy (hidden instead of greyed out). */
function impossibleHere(type: FacilityType, id: string): boolean {
  const site = siteDef(id);
  const need = FACILITIES[type].needs;
  if (need === 'hydro') return !site.hydro;
  if (need === 'geo') return (site.geo ?? 0) < 0.3;
  if (need === 'reactor') return !site.reactorMW;
  return false;
}

import { SpaceInspector } from './panels/Act5Panels';

export function Inspector() {
  const game = useGame();
  const sel = game.selection;
  if (!sel) return null;
  if (sel.kind === 'region') return <RegionInspector id={sel.id} />;
  const site = SITE_BY_ID[sel.id];
  if (!site) return null;
  if (site.kind === 'build') return <SiteInspector id={sel.id} />;
  if (site.kind === 'landing') return <LandingInspector id={sel.id} />;
  if (site.kind === 'mine') return <MineInspector id={sel.id} />;
  if (site.kind === 'charter') return <CharterHqInspector id={sel.id} />;
  if (site.kind === 'mega') return <MegaInspector id={sel.id} />;
  if (site.kind === 'launch') return <LaunchInspector id={sel.id} />;
  if (site.kind === 'yards' || site.kind === 'ring' || site.kind === 'habitat' || site.kind === 'asteroid' || (site.kind === 'moon' && game.state?.system)) return <SpaceInspector id={sel.id} />;
  return <SupplierInspector id={sel.id} />;
}

function waterLabel(w: number) {
  return w >= 0.8 ? 'plenty' : w >= 0.5 ? 'ok' : w >= 0.25 ? 'scarce' : 'parched';
}

function SiteInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const site = siteDef(id);
  const region = REGIONS[site.region];
  const facs = s.facilities.filter((f) => f.siteId === id);
  const sp = s.stats.sitePower[id];
  const grid = s.sites[id].grid;
  const inv = inventoryCount(s, id);
  const used = slotsUsed(s, id);
  const license = s.regions[site.region].license;
  const hasDC = facs.some((f) => f.type === 'datacenter' || f.type === 'campus');
  const act2 = (s.act ?? 1) >= 2;
  const slots = siteSlots(s, id);
  const rivals = s.rivalBuilds.filter((b) => b.siteId === id);

  return (
    <Panel
      title={site.name}
      icon={s.company.homeSite === id ? 'hq' : 'map'}
      onClose={() => game.select(null)}
      extra={
        <button class="btn small primary" onClick={() => game.enterDiorama(id)} data-tip="View this campus up close (or double-click the site)">
          View
        </button>
      }
    >
      <div class="row between small">
        <span class="muted">{region.name}</span>
        <span data-tip="Local trust (social license). Low trust slows permits; below 15 they freeze.">
          <Icon name="trust" size="sm" /> {Math.round(license)}
        </span>
      </div>
      <p class="small muted" style={{ margin: '4px 0 6px' }}>
        {site.blurb}
      </p>
      <div class="traits">
        <span class="trait" data-tip="Average solar capacity factor">
          <Icon name="solar" size="sm" /> {pct(site.solarCF)}
        </span>
        <span class="trait" data-tip="Average wind capacity factor">
          <Icon name="wind" size="sm" /> {pct(site.windCF)}
        </span>
        <span class="trait" data-tip={`Cooling water: ${waterLabel(site.water)}. Mean temperature ${site.climateC}°C.\nData center PUE here: ${pueAt(s, id).toFixed(2)}`}>
          💧 {waterLabel(site.water)} · {site.climateC}°C
        </span>
        <span class="trait" data-tip="Research talent multiplier for labs here">
          <Icon name="people" size="sm" /> ×{site.talent.toFixed(1)}
        </span>
        <span class="trait" data-tip="Grid electricity price here">
          <Icon name="grid" size="sm" /> ${Math.round(gridPrice(s, id))}/MWh
        </span>
        {act2 && site.hydro ? (
          <span class="trait" data-tip={`River site: room for ${site.hydro} hydro plant${site.hydro > 1 ? 's' : ''}.`}>
            <Icon name="hydro" size="sm" /> river ×{site.hydro}
          </span>
        ) : null}
        {act2 && (site.geo ?? 0) >= 0.3 ? (
          <span class="trait" data-tip={site.geo! >= 0.6 ? 'Hot rock close to the surface: geothermal works here.' : 'Hot rock, but deep: needs Enhanced Geothermal research.'}>
            <Icon name="geothermal" size="sm" /> {site.geo! >= 0.6 ? 'geothermal' : 'hot rock (EGS)'}
          </span>
        ) : null}
        {act2 && site.reactorMW ? (
          <span class="trait" data-tip={`A retired ${fmtMW(site.reactorMW)} reactor that can be restarted.`}>
            <Icon name="restart" size="sm" /> {fmtMW(site.reactorMW)} reactor
          </span>
        ) : null}
      </div>

      {sp && sp.load > 0 && (
        <div class="section">
          <h4>Power</h4>
          <PowerStrip id={id} />
          <div class="small muted" style={{ marginTop: '3px' }}>
            Load {fmtMW(sp.load)} · served <span class={sp.frac < 0.98 ? 'bad' : 'good'}>{pct(sp.frac)}</span>
            {sp.curtailed > 0.5 && ` · ${fmtMW(sp.curtailed)} curtailed`}
          </div>
          {sp.frac < 0.98 && <div class="small bad">⚠ Not enough power — compute here is throttled.</div>}
        </div>
      )}

      <div class="section">
        <h4>
          Facilities · {used}/{slots} plots
          {act2 && (
            <button class="btn ghost small" style={{ marginLeft: '6px' }} disabled={!!canBuyLand(s, id)} onClick={() => game.buyLand(id)} data-tip={`Buy the neighbouring land: +1 plot (max +3).
${fmtMoney(landCost(s, id))}${canBuyLand(s, id) ? `\n✗ ${canBuyLand(s, id)}` : ''}`} data-tut="buy-land">
              <Icon name="land" size="sm" /> +plot
            </button>
          )}
        </h4>
        {facs.length === 0 && !rivals.length && <div class="small muted">Nothing here yet.</div>}
        {facs.map((f) => {
          const def = FACILITIES[f.type];
          const installed = (f.racks ?? []).reduce((a, r) => a + r.qty, 0);
          const isHall = f.type === 'datacenter' || f.type === 'campus';
          const cap = dcCapacityUnits(f.racks?.[0]?.kw ?? chipSpec(s, 'lumen').kw, facilityIT(f));
          const tier = f.tier ?? 1;
          const nt = act2 ? nextTier(f) : null;
          const upWhy = nt ? canUpgrade(s, f.id) : null;
          const tierLabel = tier > 1 ? def.tiers?.[tier - 2]?.label : null;
          return (
            <div class="fac" key={f.id}>
              <Icon name={FAC_ICON[f.type]} />
              <div>
                <div class="name">
                  {def.name}
                  {tierLabel ? <span class="label gold"> · {tierLabel}</span> : null}
                </div>
                <div class="sub">
                  {f.status === 'building'
                    ? f.blocked
                      ? `⛔ Waiting on EUV tools — export licence needed`
                      : `Building · ${fmtDays(f.buildDays - f.progress)} left`
                    : isHall
                      ? `${installed.toLocaleString()} / ~${cap.toLocaleString()} chips · ${fmtMW(facilityIT(f))} IT`
                      : def.mw && f.type !== 'battery'
                        ? `${fmtMW(facilityMW(f))} nameplate${def.cf ? ` · firm ${Math.round(def.cf * 100)}%` : ''}`
                        : f.type === 'battery'
                          ? `${fmtMW(facilityMW(f))} / ${fmtNum((def.mwh ?? 0) * (facilityMW(f) / (def.mw ?? 1)), 0)} MWh`
                          : f.type === 'packaging'
                            ? `${fmtNum(facilityPkgUnits(s, f), 0)} chips/month packaged`
                            : f.type === 'fab'
                              ? `~${fmtNum(def.fabUnits ?? 0, 0)} accelerators/month at cost`
                              : f.type === 'lab' || f.type === 'hq'
                                ? `+${((def.rp ?? 0) * (f.type === 'hq' ? Math.sqrt(site.talent) : site.talent * tierMult(f))).toFixed(1)} research/day base`
                                : ''}
                  {f.upgrade && ` · expanding: ${fmtDays(f.upgrade.buildDays - f.upgrade.progress)} left`}
                </div>
              </div>
              <span class="small muted">
                {f.status === 'online' ? (
                  nt ? (
                    <button
                      class="btn small"
                      disabled={!!upWhy}
                      onClick={() => game.upgrade(f.id)}
                      data-tut={`upgrade-${f.type}`}
                      data-tip={`Expand to ${nt.def.label}.
${fmtMoney(upgradeCost(s, f))} · ${fmtDays(upgradeDays(s, f))}. Keeps running meanwhile.${upWhy ? `\n✗ ${upWhy}` : ''}`}
                    >
                      <Icon name="upgrade" size="sm" />
                    </button>
                  ) : (
                    'online'
                  )
                ) : (
                  pct(f.progress / f.buildDays)
                )}
              </span>
              {f.status === 'building' && <Bar value={f.progress / f.buildDays} kind="warn" />}
              {f.upgrade && <Bar value={f.upgrade.progress / f.upgrade.buildDays} kind="violet" />}
              {f.status === 'online' && isHall && !f.upgrade && <Bar value={installed / Math.max(1, cap)} />}
            </div>
          );
        })}
        {rivals.map((b) => (
          <div class="fac" key={b.id} style={{ opacity: 0.85 }}>
            <span style={{ color: RIVAL_COLOR[b.owner] }}>
              <Icon name="rival" />
            </span>
            <div>
              <div class="name" style={{ color: RIVAL_COLOR[b.owner] }}>
                {s.market.rivals.find((r) => r.id === b.owner)?.name ?? b.owner}
              </div>
              <div class="sub">
                {fmtMW(b.itMW)} campus · {b.slots} plot{b.slots > 1 ? 's' : ''} · {b.status === 'online' ? 'online' : `opens in ${fmtDays(b.readyDay - s.day)}`}
              </div>
            </div>
          </div>
        ))}
        {inv > 0 && (
          <div class="small warn" style={{ marginTop: '4px' }}>
            📦 {inv.toLocaleString()} accelerators waiting{' '}
            {!hasDC
              ? '— build a data center here'
              : !facs.some((f) => (f.type === 'datacenter' || f.type === 'campus') && f.status === 'online')
                ? `for the hall to open (${fmtDays(Math.min(...facs.filter((f) => f.type === 'datacenter' || f.type === 'campus').map((f) => f.buildDays - f.progress)))})`
                : 'for rack space: expand the hall or build another'}
            .
          </div>
        )}
      </div>

      <div class="section">
        <h4>Grid connection</h4>
        <div class="small">
          {grid.mw > 0 ? (
            <>
              Connected: <b>{fmtMW(grid.mw)}</b>
            </>
          ) : (
            <span class="muted">Not connected.</span>
          )}
          {grid.pending.map((p, i) => (
            <div key={i} class="muted">
              ⏳ +{fmtMW(p.mw)} in {fmtDays(p.readyDay - s.day)}
            </div>
          ))}
        </div>
        <div class="row wrap" style={{ marginTop: '5px' }}>
          {gridOptions(s, id).map((mw) => (
            <button key={mw} class="btn small" disabled={s.finance.cash < mw * GRID_FEE_PER_MW} onClick={() => game.requestGrid(id, mw)} data-tip={`Ask the utility for ${mw} MW.\nFee ${fmtMoney(mw * GRID_FEE_PER_MW)} · ready in ~${fmtDays(gridLeadDays(s, id))}.\nThen pay ~$${Math.round(gridPrice(s, id))}/MWh for what you use.`}>
              <Icon name="grid" size="sm" /> +{mw} MW
            </button>
          ))}
          {gridHeadroomLeft(s, id) < 5 && <span class="small muted">The local grid is tapped out.</span>}
        </div>
      </div>

      <div class="section">
        <h4>Build</h4>
        <div class="buildgrid">
          {BUILDABLE.filter((type) => (FACILITIES[type].act ?? 1) <= (s.act ?? 1) && !impossibleHere(type, id)).map((type) => {
            const def = FACILITIES[type];
            const why = canBuild(s, id, type);
            return (
              <button
                key={type}
                data-tut={`build-${type}`}
                class="btn buildcard"
                disabled={!!why}
                onClick={() => game.build(id, type)}
                data-tip={`${def.blurb}${def.leadNote ? `\n⏳ ${def.leadNote}` : ''}\nRunning cost: ${fmtMoney(def.opex)} a month${type === 'lab' ? ' (researchers’ salaries)' : ''}.${why ? `\n✗ ${why}` : ''}`}
              >
                <span class="t">
                  <Icon name={FAC_ICON[type]} size="sm" /> {def.name}
                </span>
                <span class="m">
                  {fmtMoney(buildCost(s, type))} · {fmtDays(buildDays(s, id, type))}
                  {def.opex >= 1e6 ? ` · ${fmtMoney(def.opex)}/mo` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div class="section row wrap">
        <button class="btn small" onClick={() => game.setTool({ kind: 'link', from: id })} disabled={!facs.length} data-tip="Draw a transmission line from here to another of your sites.">
          <Icon name="link" size="sm" /> Power line from here
        </button>
        {act2 && (
          <button class="btn small" onClick={() => game.setTool({ kind: 'fiber', from: id })} disabled={!facs.length} data-tut="fiber-from" data-tip="Lay fiber from here to another of your sites (max 5,000 km). Lets this region's halls sell into the other's market at low latency.">
            <Icon name="fiber" size="sm" /> Fiber from here
          </button>
        )}
        {hasDC && (
          <button class="btn small" onClick={() => game.openPanel('orders')}>
            <Icon name="orders" size="sm" /> Order chips
          </button>
        )}
      </div>
    </Panel>
  );
}

function PowerStrip({ id }: { id: string }) {
  const game = useGame();
  const sp = game.state!.stats.sitePower[id];
  if (!sp) return null;
  const firm = sp.firm ?? 0;
  const total = Math.max(sp.load, sp.solar + sp.wind + sp.gas + firm + game.state!.sites[id].grid.mw, 0.001);
  const seg = (v: number, color: string, tip: string) => (v > 0 ? <i style={{ width: `${(v / total) * 100}%`, background: color }} data-tip={tip} /> : null);
  return (
    <div class="powerbal" data-tip="Average supply available at this site, by source">
      {seg(firm, 'var(--c-grn4, #4b8)', `Firm clean (hydro, geothermal, nuclear) ${fmtMW(firm)} avg`)}
      {seg(sp.solar, 'var(--c-yel0)', `Solar ${fmtMW(sp.solar)} avg`)}
      {seg(sp.wind, 'var(--c-ice1)', `Wind ${fmtMW(sp.wind)} avg`)}
      {seg(sp.gas, 'var(--c-org1)', `Gas ${fmtMW(sp.gas)} firm (${fmtMW(sp.gasUsed)} used)`)}
      {seg(game.state!.sites[id].grid.mw, 'var(--c-blu4)', `Grid ${fmtMW(game.state!.sites[id].grid.mw)} (${fmtMW(sp.gridUsed)} used)`)}
    </div>
  );
}

function SupplierInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const site = siteDef(id);
  const key = site.supplier ?? 'lumen';
  const company = COMPANIES[key as keyof typeof COMPANIES];
  const chip = key === 'lumen' || key === 'kestrel' ? CHIP_SUPPLIERS[key] : null;
  return (
    <Panel title={site.name.split('·')[0].trim()} icon={site.kind === 'cloud' ? 'compute' : 'orders'} onClose={() => game.select(null)} extra={<ViewButton id={id} />}>
      <div class="small muted">
        {company?.sector} · {REGIONS[site.region].name}
      </div>
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb}
      </p>
      <p class="small muted">{company?.quirk}</p>
      {chip && (
        <div class="section">
          <h4>Accelerators</h4>
          <KV
            rows={[
              ['Price', fmtMoney(chipSpec(s, chip.id).price, 0)],
              ['Performance', `${chipSpec(s, chip.id).perf.toFixed(1)} PFLOP/s`],
              ['Power', `${(chipSpec(s, chip.id).kw * 1000).toFixed(0)} W`],
              ['Your allocation', `${fmtNum(supplierDailyRate(s, chip.id) * 30.4, 0)} / month`],
              ['Queue ahead', `${s.orders.filter((o) => !o.done && o.supplier === chip.id).reduce((a, o) => a + o.qty - o.produced, 0).toLocaleString()} chips`],
            ]}
          />
          <button class="btn primary" style={{ marginTop: '8px' }} onClick={() => game.openPanel('orders')}>
            <Icon name="orders" size="sm" /> Order chips
          </button>
        </div>
      )}
      {site.kind === 'cloud' && (
        <div class="section">
          <KV rows={[['Renting', `${s.rental.units.toLocaleString()} accelerators`], ['Price', `${fmtMoney(RENTAL.pricePerMonth, 0)} per chip-month`]]} />
          <button class="btn primary" style={{ marginTop: '8px' }} onClick={() => game.openPanel('compute')}>
            <Icon name="compute" size="sm" /> Manage rental
          </button>
        </div>
      )}
      {key === 'stackwell' || key === 'hanbit' ? (
        <div class="section small">
          HBM supply index: <b class={s.market.hbm < 0.85 ? 'bad' : 'good'}>{(s.market.hbm * 100).toFixed(0)}%</b>
          <div class="muted">Every accelerator needs 8 stacks of high-bandwidth memory. When HBM is short, every chip order slows.</div>
        </div>
      ) : null}
    </Panel>
  );
}

function ViewButton({ id }: { id: string }) {
  const game = useGame();
  return (
    <button class="btn small primary" onClick={() => game.enterDiorama(id)} data-tip="Visit this site up close">
      View
    </button>
  );
}

function LandingInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const site = siteDef(id);
  const cables = CABLES.filter((c) => c.a === id || c.b === id);
  const [to, setTo] = useState('');
  const others = LANDING_SITES.filter((x) => x.id !== id);
  const target = others.find((x) => x.id === to) ?? others[0];
  return (
    <Panel title={site.name} icon="cable" onClose={() => game.select(null)} extra={<ViewButton id={id} />}>
      <div class="small muted">Cable landing station · {REGIONS[site.region].name}</div>
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb} Lease capacity on a cable to join this region to another in your private network: your halls then sell into both markets at low latency.
      </p>
      <div class="section">
        <h4>Cable systems</h4>
        {cables.map((c) => {
          const other = siteDef(c.a === id ? c.b : c.a);
          const leased = s.network.leases.includes(c.id);
          const cut = cableCut(s, c.id);
          return (
            <div class="fac" key={c.id}>
              <Icon name="cable" />
              <div>
                <div class="name">{c.name}</div>
                <div class="sub">
                  ⇄ {other.name} ({REGIONS[other.region].short}) · {fmtMoney(c.lease)}/mo
                  {cut ? <span class="bad"> · ✂ cut, repairs in {fmtDays((s.network.cuts[c.id] ?? s.day) - s.day)}</span> : null}
                </div>
              </div>
              {leased ? (
                <button class="btn small" onClick={() => game.dropLease(c.id)} data-tip="Stop leasing capacity on this cable.">
                  Drop
                </button>
              ) : (
                <button class="btn small primary" disabled={(s.act ?? 1) < 2} onClick={() => game.leaseCable(c.id)} data-tut="lease-cable" data-tip={`Lease capacity: ${fmtMoney(c.lease)} now and every month.`}>
                  Lease
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div class="section">
        <h4>Lay your own cable</h4>
        <p class="small muted" style={{ marginTop: 0 }}>
          About {fmtMoney(1.2e9)} and two years. Yours alone — leases can’t be bid away, and a second route keeps you online when a cable is cut.
        </p>
        <div class="row wrap">
          <select value={target?.id} onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button class="btn small" disabled={(s.act ?? 1) < 2 || !target} onClick={() => target && game.buildOwnCable(id, target.id)}>
            <Icon name="cable" size="sm" /> Commission
          </button>
        </div>
        {s.network.own.filter((c) => c.a === id || c.b === id).map((c) => (
          <div key={c.id} class="small" style={{ marginTop: '4px' }}>
            Your cable ⇄ {siteDef(c.a === id ? c.b : c.a).name}: {c.status === 'online' ? (cableCut(s, c.id) ? <span class="bad">cut</span> : <span class="good">online</span>) : `building, ${fmtDays(c.buildDays - c.progress)} left`}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MineInspector({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const site = siteDef(id);
  const m = MINE_BY_ID[id];
  const mat = MATERIALS[m.material];
  const have = s.stack.stakes[id] ?? 0;
  const price = s.market.materials[m.material];
  const company = COMPANIES[m.company as keyof typeof COMPANIES];
  return (
    <Panel title={site.name.split('·')[0].trim()} icon="mine" onClose={() => game.select(null)} extra={<ViewButton id={id} />}>
      <div class="small muted">
        {company?.name} · {REGIONS[site.region].name}
      </div>
      <p class="small" style={{ margin: '6px 0' }}>
        {site.blurb}
      </p>
      <div class="section">
        <KV
          rows={[
            [`${mat.icon} ${mat.name} price`, <span class={price > 1.15 ? 'bad' : price < 0.9 ? 'good' : ''}>{Math.round(price * 100)}% of normal</span>, `Affects: ${mat.uses}`],
            ['Your stake', `${Math.round(have * 100)}% (max ${Math.round(m.max * 100)}%)`],
            ['Dividend', `${fmtMoney(((m.income * have) / 0.1) * price)}/month`],
          ]}
        />
        <p class="small muted">Each 10% you own pays a dividend that rises with the price, and shields you from part of the price swings in what it digs up.</p>
        <button class="btn primary" disabled={(s.act ?? 1) < 2 || s.phase < 2 || have + 0.1 > m.max + 1e-9} onClick={() => game.buyStake(id)} data-tut="buy-stake" data-tip={s.phase < 2 ? 'Opens in phase 2 · The Stack' : `Buy 10%: ${fmtMoney(stakePrice(s, id))}`}>
          <Icon name="mine" size="sm" /> Buy 10% ({fmtMoney(stakePrice(s, id))})
        </button>
      </div>
    </Panel>
  );
}

function RegionInspector({ id }: { id: RegionId }) {
  const game = useGame();
  const s = game.state!;
  const r = REGIONS[id];
  const license = s.regions[id].license;
  const sites = BUILD_SITES.filter((x) => x.region === id);
  return (
    <Panel title={r.name} icon="globe" onClose={() => game.select(null)}>
      <p class="small" style={{ marginTop: 0 }}>
        {r.blurb}
      </p>
      <div class="section">
        <h4>Local trust</h4>
        <Bar value={license / 100} kind={license < 30 ? 'warn' : 'gold'} tall tip="Social license: how welcome you are here." />
        <div class="small muted" style={{ marginTop: '3px' }}>
          {Math.round(license)} / 100 · stance: {STANCE_LABEL[(s.act ?? 1) >= 2 ? s.blocs[id].stance : r.stance]}
        </div>
      </div>
      {(s.act ?? 1) >= 2 && (
        <div class="section">
          <h4>Government relations</h4>
          <Bar value={s.blocs[id].relation / 100} kind="violet" tall tip="How the bloc's government sees you: licences, reactor approvals, sovereign deals." />
          <div class="small muted" style={{ marginTop: '3px' }}>
            {Math.round(s.blocs[id].relation)} / 100 · next election in {fmtDays(s.blocs[id].nextElection - s.day)}
          </div>
          {s.politics.rules.filter((rid) => RULE_BY_ID[rid]?.to.includes(id)).map((rid) => (
            <div key={rid} class="small warn">
              ⛔ {RULE_BY_ID[rid].name}
              {s.blocs[id].licences.includes(rid) ? <span class="good"> · licensed</span> : null}
            </div>
          ))}
          <button class="btn small" style={{ marginTop: '6px' }} onClick={() => game.openPanel('blocs')}>
            <Icon name="blocs" size="sm" /> Blocs screen
          </button>
        </div>
      )}
      <div class="section">
        <KV
          rows={[
            ['Permits', `${r.permit < 0.9 ? 'fast' : r.permit > 1.15 ? 'slow' : 'normal'} (×${r.permit.toFixed(2)})`],
            ['Grid price', `$${r.gridPrice}/MWh`],
            ['Grid carbon', `${r.gridCarbon.toFixed(2)} t/MWh`],
            ['New grid connections', `~${r.interconnectMonths} months`],
            ['Inference demand', `×${r.demand.toFixed(2)}`],
            ['Hazards', Object.entries(r.hazards).filter(([, v]) => v >= 0.4).map(([k]) => k).join(', ') || 'mild'],
          ]}
        />
      </div>
      <div class="section">
        <h4>Sites</h4>
        {sites.map((x) => (
          <button key={x.id} class="btn small" style={{ width: '100%', marginBottom: '4px', justifyContent: 'space-between' }} onClick={() => game.select({ kind: 'site', id: x.id })}>
            <span>{x.name}</span>
            <span class="muted">
              ☀{pct(x.solarCF)} 🌬{pct(x.windCF)}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
