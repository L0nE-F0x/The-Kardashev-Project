import { DIFFICULTIES } from '../../content/difficulty';
import { Icon, Panel, useGame } from '../components';
import { Card, Cols, Spark, SplitBar, Tile, Tiles, type Tone } from '../kit';
import { BoardSection } from './Act2Panels';
import { fmtMoney } from '../../sim/core';
import type { Ledger } from '../../sim/types';

const COST_KEYS: [keyof Ledger, string, Tone][] = [
  ['debt', 'Loan payments', 'bad'],
  ['rental', 'Cloud rental', 'cyan'],
  ['power', 'Grid power', 'yellow'],
  ['fuel', 'Gas fuel', 'warn'],
  ['opex', 'Operations', 'plain'],
  ['staff', 'Salaries', 'violet'],
  ['capex', 'Construction', 'gold'],
  ['chips', 'Chips', 'blue'],
  ['shipping', 'Freight', 'good'],
  ['other', 'Other', 'plain'],
];

export function FinancePanel() {
  const game = useGame();
  const s = game.state!;
  const f = s.finance;
  const hist = f.history.slice(-24);
  const points = [...hist.map((h) => h.cashEnd), f.cash];
  const m = f.month;
  const spent = COST_KEYS.reduce((a, [k]) => a + ((m[k] as number) || 0), 0);
  const net = s.stats.revenueMonth - s.stats.costMonth;
  const runway = net < 0 ? f.cash / -net : Infinity;
  const costs = COST_KEYS.filter(([k]) => Math.abs(m[k] as number) > 1);
  return (
    <Panel title="Finance" icon="finance" class="wide" onClose={() => game.openPanel(null)}>
      <Tiles>
        <Tile label="Cash" icon="cash" tone="gold" value={fmtMoney(f.cash)} sub={f.round === 'seed' ? 'Seed round' : f.round === 'IPO' ? 'Public company' : `Series ${f.round}`} chart={points} />
        <Tile
          label="Net a month"
          icon="chart"
          tone={net >= 0 ? 'good' : 'bad'}
          value={`${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}`}
          sub={`${fmtMoney(s.stats.revenueMonth)} in · ${fmtMoney(s.stats.costMonth)} out`}
          tip="Revenue run-rate minus running costs. Construction and chip orders come on top: they are one-off spending."
        />
        <Tile label="Runway" icon="clock" tone={runway < 6 ? 'bad' : runway < 14 ? 'warn' : 'plain'} value={Number.isFinite(runway) ? `${runway < 10 ? runway.toFixed(1) : Math.round(runway)} mo` : 'Growing'} sub={Number.isFinite(runway) ? 'until the cash runs out' : 'in profit every month'} />
        <Tile label="Valuation" icon="finance" value={fmtMoney(f.valuation)} sub={f.bridgeLoans ? `${f.bridgeLoans} bridge loan${f.bridgeLoans > 1 ? 's' : ''} taken` : 'no bridge loans'} />
      </Tiles>
      <Cols>
        <Card title={`Cash, last ${points.length} months`} icon="chart">
          {points.length > 1 ? (
            <>
              <Spark points={points} class="cashchart" height={96} />
              <div class="row between small muted" style={{ marginTop: '4px' }}>
                <span>{hist[0]?.label ?? ''}</span>
                <span>
                  low {fmtMoney(Math.min(...points))} · high {fmtMoney(Math.max(...points))}
                </span>
                <span>now</span>
              </div>
            </>
          ) : (
            <div class="small muted">The first month is not over yet.</div>
          )}
        </Card>
        <Card title="This month so far" icon="finance">
          {costs.length > 0 && <SplitBar parts={costs.map(([k, label, tone]) => ({ label, value: Math.abs(m[k] as number), tone, text: fmtMoney(m[k] as number) }))} legend={false} />}
          <div style={{ marginTop: costs.length ? '8px' : 0 }}>
            <div class="lrow">
              <span>Revenue</span>
              <b class="good">+{fmtMoney(m.revenue)}</b>
            </div>
            {m.funding ? (
              <div class="lrow">
                <span>Funding</span>
                <b class="gold">+{fmtMoney(m.funding)}</b>
              </div>
            ) : null}
            {costs.map(([k, label, tone]) => (
              <div class="lrow" key={k}>
                <span class={`sw t-${tone}`}>{label}</span>
                <span class="num">{fmtMoney(m[k] as number)}</span>
              </div>
            ))}
            <div class="lrow total">
              <span>Total spent</span>
              <b>{fmtMoney(spent)}</b>
            </div>
          </div>
        </Card>
      </Cols>
      <BoardSection />
      {hist.length > 0 && (
        <Card title="Monthly history" icon="news">
          <div class="scrolly" style={{ maxHeight: '170px' }}>
            {[...hist].reverse().map((h) => {
              const out = COST_KEYS.reduce((a, [k]) => a + ((h[k] as number) || 0), 0);
              return (
                <div class="lrow small" key={h.label}>
                  <span class="muted">{h.label}</span>
                  <span>
                    <span class="good num">+{fmtMoney(h.revenue)}</span> <span class="muted">·</span> <span class="bad num">−{fmtMoney(out)}</span>
                    {h.funding ? <span class="gold num"> · +{fmtMoney(h.funding)} raised</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <div class="small muted section">
        <Icon name="warn" size="sm" />{' '}
        {DIFFICULTIES[s.meta.difficulty].broke === 'bankrupt' && !s.charter
          ? 'On Hard, cash hitting zero ends the company (a rescue that drops you to Standard is the only way out). Penny warns when the runway gets short.'
          : 'If cash hits zero, Penny will find a bridge loan: expensive, but you won’t go bust.'}
      </div>
    </Panel>
  );
}
