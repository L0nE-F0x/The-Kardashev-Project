import { Icon, KV, Panel, useGame } from '../components';
import { fmtMoney } from '../../sim/core';
import type { Ledger } from '../../sim/types';

const COST_KEYS: [keyof Ledger, string][] = [
  ['rental', 'Cloud rental'],
  ['power', 'Grid power'],
  ['fuel', 'Gas fuel'],
  ['opex', 'Operations'],
  ['staff', 'Salaries'],
  ['capex', 'Construction'],
  ['chips', 'Chips'],
  ['shipping', 'Freight'],
  ['other', 'Other'],
];

export function FinancePanel() {
  const game = useGame();
  const s = game.state!;
  const f = s.finance;
  const hist = f.history.slice(-24);
  const points = [...hist.map((h) => h.cashEnd), f.cash];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const W = 300;
  const H = 60;
  const path = points.map((v, i) => `${(i / Math.max(1, points.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * H}`).join(' ');
  const m = f.month;
  const spent = COST_KEYS.reduce((a, [k]) => a + (m[k] as number), 0);
  return (
    <Panel title="Finance" icon="finance" class="wide" onClose={() => game.openPanel(null)}>
      <div class="row wrap" style={{ gap: '16px', alignItems: 'flex-start' }}>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>Company</h4>
          <KV
            rows={[
              ['Cash', <b class="gold">{fmtMoney(f.cash)}</b>],
              ['Round', f.round === 'seed' ? 'Seed' : `Series ${f.round}`],
              ['Valuation', fmtMoney(f.valuation)],
              ['Revenue (run-rate)', <span class="good">{fmtMoney(s.stats.revenueMonth)}/mo</span>],
              ['Running costs', <span class="bad">{fmtMoney(s.stats.costMonth)}/mo</span>],
              ['Bridge loans', String(f.bridgeLoans)],
            ]}
          />
          <div class="section">
            <h4>Cash, last {points.length} months</h4>
            <svg class="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" shape-rendering="crispEdges">
              <polyline points={path} fill="none" stroke="var(--c-yel0)" stroke-width="2" vector-effect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
        <div class="grow" style={{ minWidth: '240px' }}>
          <h4>This month so far</h4>
          <KV rows={[['Revenue', <span class="good">{fmtMoney(m.revenue)}</span>], ...(m.funding ? [['Funding', <span class="good">{fmtMoney(m.funding)}</span>] as [string, preact.ComponentChildren]] : []), ...COST_KEYS.filter(([k]) => Math.abs(m[k] as number) > 1).map(([k, label]) => [label, fmtMoney(m[k] as number)] as [string, string]), ['Total spent', <b>{fmtMoney(spent)}</b>]]} />
        </div>
      </div>
      {hist.length > 0 && (
        <div class="section">
          <h4>Monthly history</h4>
          <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
            {[...hist].reverse().map((h) => {
              const costs = COST_KEYS.reduce((a, [k]) => a + (h[k] as number), 0);
              return (
                <div class="row between small" key={h.label}>
                  <span class="muted">{h.label}</span>
                  <span>
                    <span class="good">+{fmtMoney(h.revenue)}</span> · <span class="bad">−{fmtMoney(costs)}</span>
                    {h.funding ? <span class="gold"> · +{fmtMoney(h.funding)} raised</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div class="small muted section">
        <Icon name="warn" size="sm" /> If cash hits zero, Penny will find a bridge loan — expensive, but you won't go bust.
      </div>
    </Panel>
  );
}
