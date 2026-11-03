import { Icon, useGame } from './components';
import { fmtDate, fmtMoney, fmtMW } from '../sim/core';
import { CAPABILITY_TIERS, K_MILESTONES, tierOf } from '../sim/model';
import type { Speed } from '../game/game';
import type { IconName } from './icons';

export function TopBar() {
  const game = useGame();
  const s = game.state!;
  const st = s.stats;
  const net = st.revenueMonth - st.costMonth;
  const next = K_MILESTONES.find((m) => m.k > st.K) ?? K_MILESTONES[K_MILESTONES.length - 1];
  const kStart = 0.729;
  const kProgress = (st.K - kStart) / (next.k - kStart);
  const model = s.models[s.models.length - 1];
  const speeds: [Speed, IconName, string][] = [
    [0, 'pause', 'Pause (Space)'],
    [1, 'play', 'Normal speed (1)'],
    [2, 'ff', 'Fast (2)'],
    [4, 'fff', 'Faster (3)'],
    [8, 'fff', 'Fastest (4)'],
  ];
  const marginCls = st.margin >= 0.25 ? 'good' : st.margin >= 0 ? '' : st.margin >= -0.5 ? 'warn' : 'bad';
  return (
    <div class="topbar">
      <div class="speed frame">
        {speeds.map(([sp, icon, tip]) => (
          <button key={sp} class={`btn small ${game.speed === sp ? 'active' : ''}`} onClick={() => game.setSpeed(sp)} data-tip={tip} aria-label={tip}>
            <Icon name={icon} size="sm" />
            {sp === 8 && <span style={{ fontSize: '10px', marginLeft: '-4px' }}>+</span>}
          </button>
        ))}
      </div>
      <div class="date frame" data-tip={`Day ${s.day} of the campaign.\nAt 1× speed one day passes per second.`}>
        <span class="label">{s.company.name}</span>
        <span class="d">{fmtDate(s.day)}</span>
      </div>
      <div class="stats frame">
        <div class="stat" data-tip={`Cash on hand.\nRevenue ${fmtMoney(st.revenueMonth)}/mo · running costs ${fmtMoney(st.costMonth)}/mo.\nRound: ${s.finance.round === 'seed' ? 'Seed' : 'Series ' + s.finance.round}`}>
          <Icon name="cash" />
          <div class="col">
            <span class="v gold">{fmtMoney(s.finance.cash)}</span>
            <span class={`s ${net >= 0 ? 'good' : 'bad'}`}>
              {net >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(net))}/mo
            </span>
          </div>
        </div>
        <div class="stat" data-tip={`Power served to your sites vs. what they need.\nGeneration you own: ${fmtMW(st.playerGenMW)} average.`}>
          <Icon name="power" />
          <div class="col">
            <span class="v">{fmtMW(st.powerServed)}</span>
            <span class={`s ${st.powerLoad > 0 && st.powerServed < st.powerLoad * 0.98 ? 'bad' : ''}`}>of {fmtMW(st.powerLoad)} needed</span>
          </div>
        </div>
        <div class="stat" data-tip={`Total compute: ${st.computeEF.toFixed(2)} exaFLOP/s peak.\n${st.installedAccel.toLocaleString()} accelerators installed, ${st.rentedAccel.toLocaleString()} rented.`}>
          <Icon name="compute" />
          <div class="col">
            <span class="v cyan">{st.computeEF < 10 ? st.computeEF.toFixed(2) : st.computeEF.toFixed(1)} EF</span>
            <span class="s">{(st.installedAccel + st.rentedAccel).toLocaleString()} chips</span>
          </div>
        </div>
        <div class="stat" data-tip={`Your best model's capability: ${st.capability.toFixed(2)}.\nFrontier (Meridian/Lattice): ${st.frontier.toFixed(2)}.\nTiers: ${CAPABILITY_TIERS.slice(1).join(' → ')}`}>
          <Icon name="brain" />
          <div class="col">
            <span class="v">{model ? model.name : 'No model'}</span>
            <span class="s">{model ? `${st.capability.toFixed(2)} · ${CAPABILITY_TIERS[tierOf(st.capability)]}` : 'train Bit-1'}</span>
          </div>
        </div>
        <div class="stat hide-mobile" data-tip={`Safety margin = alignment − capability.\nAlignment ${st.alignment.toFixed(2)} · capability ${st.capability.toFixed(2)}.\nBelow 0, safety incidents become likely.`}>
          <Icon name="shield" />
          <div class="col">
            <span class={`v ${marginCls}`}>{st.margin >= 0 ? '+' : ''}{st.margin.toFixed(2)}</span>
            <span class="s">safety margin</span>
          </div>
        </div>
      </div>
      <div class="kmeter frame" data-tip={`Kardashev scale: K = (log₁₀ watts − 6) / 10.\nCivilisation uses ${st.worldTW.toFixed(2)} TW.\nNext milestone: K ${next.k.toFixed(2)} — ${next.label}.\nType I = 10 PW = K 1.00.`}>
        <Icon name="k" />
        <div class="col" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span class="kv">K {st.K.toFixed(5)}</span>
          <div class="kbar">
            <i style={{ width: `${Math.max(1, Math.min(100, kProgress * 100))}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
