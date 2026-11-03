import { Bar, Icon, KV, Panel, pct, useGame } from './components';
import { SITE_BY_ID, siteDef } from '../content/sites';
import { REGIONS, STANCE_LABEL } from '../content/regions';
import { FACILITIES, BUILDABLE } from '../content/facilities';
import { CHIP_SUPPLIERS, COMPANIES, RENTAL } from '../content/companies';
import type { RegionId } from '../content/mapcodes';
import type { FacilityType } from '../sim/types';
import { fmtDays, fmtMoney, fmtMW, fmtNum } from '../sim/core';
import { buildCost, buildDays, chipSpec, dcCapacityUnits, gridHeadroomLeft, gridLeadDays, gridPrice, GRID_FEE_PER_MW, pueAt, supplierDailyRate } from '../sim/model';
import { canBuild, gridOptions, slotsUsed } from '../sim/actions';
import { inventoryCount } from '../sim/supply';
import { BUILD_SITES } from '../content/sites';
import type { IconName } from './icons';

const FAC_ICON: Record<FacilityType, IconName> = { datacenter: 'datacenter', solar: 'solar', wind: 'wind', gas: 'gas', battery: 'battery', lab: 'lab', hq: 'hq' };

export function Inspector() {
  const game = useGame();
  const sel = game.selection;
  if (!sel) return null;
  if (sel.kind === 'region') return <RegionInspector id={sel.id} />;
  const site = SITE_BY_ID[sel.id];
  if (!site) return null;
  if (site.kind === 'build') return <SiteInspector id={sel.id} />;
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
  const hasDC = facs.some((f) => f.type === 'datacenter');

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
          Facilities · {used}/{site.slots} plots
        </h4>
        {facs.length === 0 && <div class="small muted">Nothing here yet.</div>}
        {facs.map((f) => {
          const def = FACILITIES[f.type];
          const installed = (f.racks ?? []).reduce((a, r) => a + r.qty, 0);
          const cap = dcCapacityUnits((f.racks?.[0]?.kw ?? chipSpec(s, 'lumen').kw));
          return (
            <div class="fac" key={f.id}>
              <Icon name={FAC_ICON[f.type]} />
              <div>
                <div class="name">{def.name}</div>
                <div class="sub">
                  {f.status === 'building'
                    ? `Building · ${fmtDays(f.buildDays - f.progress)} left`
                    : f.type === 'datacenter'
                      ? `${installed.toLocaleString()} / ~${cap.toLocaleString()} chips`
                      : f.type === 'solar' || f.type === 'wind' || f.type === 'gas'
                        ? `${def.mw} MW nameplate`
                        : f.type === 'battery'
                          ? `${def.mw} MW / ${def.mwh} MWh`
                          : f.type === 'lab' || f.type === 'hq'
                            ? `+${((def.rp ?? 0) * (f.type === 'hq' ? Math.sqrt(site.talent) : site.talent)).toFixed(1)} research/day base`
                            : ''}
                </div>
              </div>
              <span class="small muted">{f.status === 'online' ? 'online' : pct(f.progress / f.buildDays)}</span>
              {f.status === 'building' && <Bar value={f.progress / f.buildDays} kind="warn" />}
              {f.status === 'online' && f.type === 'datacenter' && <Bar value={installed / Math.max(1, cap)} />}
            </div>
          );
        })}
        {inv > 0 && (
          <div class="small warn" style={{ marginTop: '4px' }}>
            📦 {inv.toLocaleString()} accelerators waiting {hasDC ? 'for rack space' : '— build a data center here'}.
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
          {BUILDABLE.map((type) => {
            const def = FACILITIES[type];
            const why = canBuild(s, id, type);
            return (
              <button
                key={type}
                class="btn buildcard"
                disabled={!!why}
                onClick={() => game.build(id, type)}
                data-tip={`${def.blurb}${def.leadNote ? `\n⏳ ${def.leadNote}` : ''}${why ? `\n✗ ${why}` : ''}`}
              >
                <span class="t">
                  <Icon name={FAC_ICON[type]} size="sm" /> {def.name}
                </span>
                <span class="m">
                  {fmtMoney(buildCost(s, type))} · {fmtDays(buildDays(s, id, type))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div class="section row wrap">
        <button class="btn small" onClick={() => game.setTool({ kind: 'link', from: id })} disabled={!facs.length} data-tip="Draw a transmission line from here to another of your sites (max 1,500 km).">
          <Icon name="link" size="sm" /> Power line from here
        </button>
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
  const total = Math.max(sp.load, sp.solar + sp.wind + sp.gas + game.state!.sites[id].grid.mw, 0.001);
  const seg = (v: number, color: string, tip: string) => (v > 0 ? <i style={{ width: `${(v / total) * 100}%`, background: color }} data-tip={tip} /> : null);
  return (
    <div class="powerbal" data-tip="Average supply available at this site, by source">
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
    <Panel title={site.name.split('·')[0].trim()} icon={site.kind === 'cloud' ? 'compute' : 'orders'} onClose={() => game.select(null)}>
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
          {Math.round(license)} / 100 · stance: {STANCE_LABEL[r.stance]}
        </div>
      </div>
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
