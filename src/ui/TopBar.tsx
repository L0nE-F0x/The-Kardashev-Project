import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Eased, Icon, is3d, useGame } from './components';
import { warming } from '../sim/climate';
import { overLine, surfaceTW } from '../sim/swarm';
import { lineTW } from '../sim/systemView';
import { fmtTW } from '../sim/core';
import { avgWellbeing } from '../sim/provinces';
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
  // past Type I the bar measures the climb toward Type II
  const kStart = st.K >= 1 ? 1 : 0.729;
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
  // a phone can't show every stat of the later acts: they scroll sideways, and a fade on the right says there's more
  const statsRef = useRef<HTMLDivElement>(null);
  const markMore = () => {
    const el = statsRef.current;
    if (el) el.classList.toggle('more', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useLayoutEffect(markMore);
  useEffect(() => {
    window.addEventListener('resize', markMore);
    return () => window.removeEventListener('resize', markMore);
  }, []);
  return (
    <div class="topbar">
      <div class="speed frame" data-tut="speed">
        {speeds.map(([sp, icon, tip]) => (
          <button key={sp} class={`btn small ${game.speed === sp ? 'active' : ''}`} onClick={() => game.setSpeed(sp)} data-tip={tip} aria-label={tip}>
            <Icon name={icon} size="sm" />
            {sp === 8 && <span style={{ fontSize: '10px', marginLeft: '-4px' }}>+</span>}
          </button>
        ))}
        {game.settings.playtestNotes && (
          <button class="btn small" onClick={() => game.openNote()} data-tip="Playtest note (J)" aria-label="Playtest note">
            ✎
          </button>
        )}
      </div>
      <div class={`date frame ${s.meta.sandbox ? 'has-badge' : ''}`} data-tip={`Day ${s.day} of the campaign.\nAt 1× speed one day passes per second.`}>
        {s.meta.sandbox && (
          <button class="btnless sandbox-badge" onClick={() => game.openPanel(game.panel === 'sandbox' ? null : 'sandbox')} data-tip="Sandbox: change the switches" aria-label="Sandbox switches">
            🧪
          </button>
        )}
        <span class="label">{s.company.name}</span>
        <span class="d">{fmtDate(s.day)}</span>
      </div>
      <div class="stats frame" data-tut="stats" ref={statsRef} onScroll={markMore}>
        <div class="stat" data-tip={`Cash on hand.\nRevenue ${fmtMoney(st.revenueMonth)}/mo · running costs ${fmtMoney(st.costMonth)}/mo.\nRound: ${s.finance.round === 'seed' ? 'Seed' : 'Series ' + s.finance.round}`}>
          <Icon name="cash" />
          <div class="col">
            <span class="v gold">
              <Eased value={s.finance.cash} format={fmtMoney} />
            </span>
            <span class={`s ${net >= 0 ? 'good' : 'bad'}`}>
              {net >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(net))}/mo
            </span>
          </div>
        </div>
        {s.charter && (
          <button class="stat btnless hide-mobile" onClick={() => game.openPanel('charter')} data-tut="charter-stat" data-tip={`The Kardashev Project's treasury (separate from your company's cash).\nLegitimacy ${Math.round(s.charter.legitimacy)}/100 · political capital ${Math.round(s.charter.capital)}.\nClick to open the Charter (H).`}>
            <Icon name="charter" />
            <div class="col">
              <span class="v gold">{fmtMoney(s.charter.budget)}</span>
              <span class={`s ${s.charter.legitimacy < 35 ? 'bad' : ''}`}>legit {Math.round(s.charter.legitimacy)}</span>
            </div>
          </button>
        )}
        {s.planet && (
          <button class="stat btnless" onClick={() => game.openPlanet('climate')} data-tut="planet-stat" data-tip={`Warming ${warming(s).toFixed(2)} °C (the checklist needs it under 2.0).\nAverage wellbeing across the provinces: ${Math.round(avgWellbeing(s))}.\nClick to open the Planet (Y).`}>
            <Icon name="warming" />
            <div class="col">
              <span class={`v ${warming(s) >= 2 ? 'bad' : warming(s) > 1.8 ? 'warn' : ''}`}>{warming(s).toFixed(2)} °C</span>
              <span class="s">wellbeing {Math.round(avgWellbeing(s))}</span>
            </div>
          </button>
        )}
        {s.system && (
          <button class="stat btnless" onClick={() => game.openSystem('thermal')} data-tut="system-stat" data-tip={`Earth’s surface uses ${fmtTW(surfaceTW(s))} of the ${fmtTW(lineTW(s))} the Thermal Line allows${overLine(s) > 0 ? ` — ${Math.round(overLine(s) * 100)}% over` : ''}.
Healthy life expectancy ${s.system.lifeExp.toFixed(1)} years, rising ${s.system.lifeRate.toFixed(2)} a year${s.system.escape ? ' (escape velocity)' : ''}.
Click to open the System (X).`}>
            <Icon name="thermal" />
            <div class="col">
              <span class={`v ${overLine(s) > 0 ? 'bad' : surfaceTW(s) > lineTW(s) * 0.92 ? 'warn' : ''}`}>{s.system.thermalLine ? `${Math.round((surfaceTW(s) / Math.max(1, lineTW(s))) * 100)}% of line` : 'no line yet'}</span>
              <span class="s">{s.system.lifeExp.toFixed(0)} healthy years</span>
            </div>
          </button>
        )}
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
      <div class="kmeter frame" data-tut="kmeter" data-tip={`Kardashev scale: K = (log₁₀ watts − 6) / 10.\nCivilisation uses ${st.worldTW.toFixed(2)} TW.\nNext milestone: K ${next.k.toFixed(2)} — ${next.label}.\nType I = 10 PW = K 1.00.`}>
        <Icon name="k" />
        <div class="col" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span class={`kv ${st.K >= 0.99 ? 'gold' : ''}`}>
            K <Eased value={st.K} format={(k) => k.toFixed(st.K >= 0.95 ? 4 : 5)} />
          </span>
          <div class="kbar">
            <i style={{ width: `${Math.max(1, Math.min(100, kProgress * 100))}%` }} />
          </div>
          {is3d() && (
            <span class="knext" aria-hidden="true">
              {next.k.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
