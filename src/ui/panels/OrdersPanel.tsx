import { useMemo, useState } from 'preact/hooks';
import { Bar, Icon, KV, Panel, useGame } from '../components';
import { CHIP_SUPPLIERS, MARKET_SUPPLIERS } from '../../content/companies';
import { REGIONS } from '../../content/regions';
import { orderBlockedBy } from '../../sim/politics';
import { PoolBars } from './Act2Panels';
import { siteDef } from '../../content/sites';
import { CHOKEPOINT_BY_ID } from '../../world/routing';
import type { SupplierId } from '../../sim/types';
import { fmtDays, fmtMoney } from '../../sim/core';
import { quoteOrder } from '../../sim/actions';
import { chipSpec, supplierDailyRate } from '../../sim/model';
import { hallSpace } from '../../sim/supply';

export function OrdersPanel() {
  const game = useGame();
  const s = game.state!;
  const destOptions = useMemo(() => {
    const ids = new Set(s.facilities.filter((f) => f.type === 'datacenter' || f.type === 'campus').map((f) => f.siteId));
    return [...ids];
  }, [s.facilities.length]);
  const act2 = (s.act ?? 1) >= 2;
  const fabOnline = s.facilities.some((f) => f.type === 'fab' && f.status === 'online');
  const supplierIds: SupplierId[] = fabOnline ? ['own', ...MARKET_SUPPLIERS] : MARKET_SUPPLIERS;
  const maxQty = act2 ? 100000 : 10000;
  // an order sized to the free rack space: a half-empty hall is the slowest way to the next model
  const fitQty = (site: string | undefined, sup: SupplierId) => {
    if (!site) return 2000;
    const free = hallSpace(s, site, chipSpec(s, sup).kw).free;
    return free >= 500 ? Math.min(maxQty, Math.floor(free / 500) * 500) : 500;
  };
  const [supplier, setSupplier] = useState<SupplierId>('lumen');
  const [dest, setDest] = useState<string>(destOptions[0] ?? '');
  const [qty, setQty] = useState(() => fitQty(destOptions[0], 'lumen'));
  const [mode, setMode] = useState<'sea' | 'air'>('sea');
  const destId = destOptions.includes(dest) ? dest : destOptions[0];
  const quote = destId ? quoteOrder(s, game.ctx, supplier, qty, destId, mode) : null;
  const space = destId ? hallSpace(s, destId, chipSpec(s, supplier).kw) : null;
  const blocked = destId ? orderBlockedBy(s, supplier, siteDef(destId).region) : null;

  return (
    <Panel title="Chips & Shipping" icon="orders" class="wide" onClose={() => game.openPanel(null)}>
      {!destOptions.length ? (
        <div class="small">
          <Icon name="warn" size="sm" /> Build a <b>Data Center</b> first — chips ship to one of your data center sites. Click a site on the map to build.
        </div>
      ) : (
        <>
          <h4>New order</h4>
          <div class="row wrap" style={{ gap: '6px', marginBottom: '8px' }}>
            {supplierIds.map((id) => {
              const def = CHIP_SUPPLIERS[id];
              const spec = chipSpec(s, id);
              const ahead = s.orders.filter((o) => !o.done && o.supplier === id).reduce((a, o) => a + o.qty - o.produced, 0);
              return (
                <button key={id} class={`btn buildcard grow ${supplier === id ? 'active' : ''}`} onClick={() => setSupplier(id)} style={{ minWidth: '220px' }}>
                  <span class="t">
                    <Icon name="compute" size="sm" /> {def.name}
                  </span>
                  <span class="m">{def.blurb}</span>
                  <span class="m">
                    {fmtMoney(spec.price, 0)} · {spec.perf.toFixed(1)} PFLOP/s · {(spec.kw * 1000).toFixed(0)} W · {Math.round(supplierDailyRate(s, id) * 30.4).toLocaleString()}/mo
                    {ahead ? ` · ${ahead.toLocaleString()} queued` : ''}
                  </span>
                  {act2 && <PoolBars supplier={id} />}
                </button>
              );
            })}
          </div>
          <div class="row wrap" style={{ gap: '10px' }}>
            <label class="grow" style={{ minWidth: '200px' }}>
              <span class="label">Quantity: {qty.toLocaleString()}</span>
              <input type="range" min={500} max={maxQty} step={500} value={qty} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value))} />
              {space && (
                <span class="small muted">
                  Hall space here: {space.free.toLocaleString()} free of {space.cap.toLocaleString()}{' '}
                  {space.free >= 500 && qty !== fitQty(destId, supplier) && (
                    <button class="btn ghost small" onClick={(e) => (e.preventDefault(), setQty(fitQty(destId, supplier)))}>
                      Fill it
                    </button>
                  )}
                </span>
              )}
            </label>
            <label>
              <span class="label">Ship to</span>
              <br />
              <select value={destId} onChange={(e) => setDest((e.target as HTMLSelectElement).value)}>
                {destOptions.map((id) => (
                  <option value={id} key={id}>
                    {siteDef(id).name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span class="label">Freight</span>
              <br />
              <div class="seg">
                <button class={`btn small ${mode === 'sea' ? 'active' : ''}`} onClick={() => setMode('sea')} data-tip="Cheap ($150/chip). Weeks at sea, through chokepoints.">
                  <Icon name="ship" size="sm" /> Sea
                </button>
                <button class={`btn small ${mode === 'air' ? 'active' : ''}`} onClick={() => setMode('air')} data-tip="Fast ($900/chip). Days, not weeks.">
                  <Icon name="plane" size="sm" /> Air
                </button>
              </div>
            </div>
          </div>
          {quote && s.finance.cash < quote.total && (
            <div class="small warn section">
              Not enough cash for {qty.toLocaleString()} chips ({fmtMoney(quote.total)}, you have {fmtMoney(s.finance.cash)}): order fewer now and top the hall up later.
            </div>
          )}
          {space && qty > space.free && (
            <div class="small warn section">
              ⚠ Only {space.free.toLocaleString()} more chips fit in the halls at {siteDef(destId!).name}: the other {(qty - space.free).toLocaleString()} would wait in the warehouse until you build or expand a hall.
            </div>
          )}
          {destId && blocked && (
            <div class="small warn section">
              ⛔ {blocked.name}: {CHIP_SUPPLIERS[supplier].short} can’t ship to {REGIONS[siteDef(destId).region].name} without a licence. Ask Sol on the Blocs screen.
            </div>
          )}
          {quote && (
            <div class="row wrap between section" style={{ alignItems: 'flex-end' }}>
              <KV
                rows={[
                  ['Chips', fmtMoney(quote.chips)],
                  ['Freight', fmtMoney(quote.shipping)],
                  ['First delivery', `~${fmtDays(quote.firstDays)}`],
                  ['Last delivery', `~${fmtDays(quote.lastDays)}`],
                  ['Ships from', siteDef(quote.fromSite).name],
                ]}
              />
              <button class="btn gold" data-tut="order-button" disabled={s.finance.cash < quote.total || !!blocked} onClick={() => game.order(supplier, qty, destId!, mode)}>
                <Icon name="cash" size="sm" /> Order for {fmtMoney(quote.total)}
              </button>
            </div>
          )}
        </>
      )}

      {s.orders.some((o) => !o.done) && (
        <div class="section">
          <h4>In production</h4>
          {s.orders
            .filter((o) => !o.done)
            .map((o) => (
              <div key={o.id} style={{ marginBottom: '6px' }}>
                <div class="row between small">
                  <span>
                    {o.qty.toLocaleString()} × {CHIP_SUPPLIERS[o.supplier].short} → {siteDef(o.dest).name}
                  </span>
                  <span class="muted">
                    {Math.floor(o.produced).toLocaleString()} made · {o.shipped.toLocaleString()} shipped
                  </span>
                </div>
                <Bar value={o.produced / o.qty} />
              </div>
            ))}
        </div>
      )}

      {s.shipments.length > 0 && (
        <div class="section">
          <h4>In transit</h4>
          {s.shipments.map((sh) => (
            <div key={sh.id} class="row between small" style={{ marginBottom: '3px' }} onMouseEnter={() => game.setHover({ kind: 'shipment', id: sh.id, clientX: -1, clientY: -1 })}>
              <span>
                <Icon name={sh.mode === 'air' ? 'plane' : 'ship'} size="sm" /> {sh.batch.qty.toLocaleString()} → {siteDef(sh.dest).name}
                {sh.chokepoints.length ? <span class="muted"> via {sh.chokepoints.map((c) => CHOKEPOINT_BY_ID[c]?.name).join(', ')}</span> : null}
              </span>
              <span class={sh.delayed ? 'warn' : 'muted'}>
                {sh.delayed ? 'delayed · ' : ''}
                {fmtDays(sh.arriveDay - s.day)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div class="small muted section">
        HBM memory supply: <b class={s.market.hbm < 0.85 ? 'bad' : ''}>{Math.round(s.market.hbm * 100)}%</b>. Shortages slow every supplier's output.
      </div>
    </Panel>
  );
}
