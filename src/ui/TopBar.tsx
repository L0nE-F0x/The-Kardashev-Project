import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Eased, Icon, useGame } from './components';
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
  // The later acts add stats and the numbers grow: when they stop fitting, the bar tightens in steps (`data-fit`:
  // 1 = closer together, the K meter without its label; 2 = icons without plates, smaller type; 3 = without the
  // Charter's treasury and the safety margin, which their panels show; 4 = a last squeeze). What still doesn't fit scrolls sideways
  // under a fade on the right.
  const barRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const fit = useRef(0);
  const markMore = () => {
    const el = statsRef.current;
    if (el) el.classList.toggle('more', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  const refit = (from: number) => {
    const bar = barRef.current;
    const el = statsRef.current;
    if (!bar || !el) return;
    let level = from;
    for (;;) {
      bar.dataset.fit = String(level);
      if (level >= 4 || el.scrollWidth <= el.clientWidth + 1) break;
      level++;
    }
    fit.current = level;
    markMore();
  };
  // every render may only tighten (a number got wider); a new set of stats, a new window or interface size starts over
  const shown = (s.charter ? 1 : 0) + (s.planet ? 1 : 0) + (s.system ? 1 : 0);
  useLayoutEffect(() => refit(fit.current));
  useLayoutEffect(() => refit(0), [shown, game.settings.uiScale]);
  useEffect(() => {
    const again = () => refit(0);
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, []);
  const paused = game.speed === 0;
  // where K stands between 0.70 and Type I (the tape measure and the arc of light are drawn to this)
  const kOnScale = Math.max(0, Math.min(1, (st.K - 0.7) / 0.3));
  return (
    <div class="topbar" ref={barRef}>
      <div class={`clock frame ${paused ? 'paused' : ''}`}>
        <div class="speed" data-tut="speed">
          {speeds.map(([sp, , tip], i) => (
            <button key={sp} class={`btn small ${game.speed === sp ? 'active' : ''}`} onClick={() => game.setSpeed(sp)} data-tip={tip} aria-label={tip}>
              <SpeedGlyph n={i} />
            </button>
          ))}
          {game.settings.playtestNotes && (
            <button class="btn small" onClick={() => game.openNote()} data-tip="Playtest note (J)" aria-label="Playtest note">
              ✎
            </button>
          )}
        </div>
        <div class={`date ${s.meta.sandbox ? 'has-badge' : ''}`} data-tip={`Day ${s.day} of the campaign.\nAt 1× speed one day passes per second.`}>
          {s.meta.sandbox && (
            <button class="btnless sandbox-badge" onClick={() => game.openPanel(game.panel === 'sandbox' ? null : 'sandbox')} data-tip="Sandbox: change the switches" aria-label="Sandbox switches">
              <Icon name="lab" size="sm" />
            </button>
          )}
          <span class="label">{paused ? 'Paused' : s.company.name}</span>
          <span class="d">{fmtDate(s.day)}</span>
        </div>
      </div>
      <div class="stats frame" data-tut="stats" ref={statsRef} onScroll={markMore}>
        <div class="stat" data-hue="gold" data-tip={`Cash on hand.\nRevenue ${fmtMoney(st.revenueMonth)}/mo · running costs ${fmtMoney(st.costMonth)}/mo.\nRound: ${s.finance.round === 'seed' ? 'Seed' : 'Series ' + s.finance.round}`}>
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
          <button class="stat btnless hide-mobile" data-hue="gold" onClick={() => game.openPanel('charter')} data-tut="charter-stat" data-tip={`The Kardashev Project's treasury (separate from your company's cash).\nLegitimacy ${Math.round(s.charter.legitimacy)}/100 · political capital ${Math.round(s.charter.capital)}.\nClick to open the Charter (H).`}>
            <Icon name="charter" />
            <div class="col">
              <span class="v gold">{fmtMoney(s.charter.budget)}</span>
              <span class={`s ${s.charter.legitimacy < 35 ? 'bad' : ''}`}>legit {Math.round(s.charter.legitimacy)}</span>
            </div>
          </button>
        )}
        {s.planet && (
          <button class="stat btnless" data-hue="orange" onClick={() => game.openPlanet('climate')} data-tut="planet-stat" data-tip={`Warming ${warming(s).toFixed(2)} °C (the checklist needs it under 2.0).\nAverage wellbeing across the provinces: ${Math.round(avgWellbeing(s))}.\nClick to open the Planet (Y).`}>
            <Icon name="warming" />
            <div class="col">
              <span class={`v ${warming(s) >= 2 ? 'bad' : warming(s) > 1.8 ? 'warn' : ''}`}>{warming(s).toFixed(2)} °C</span>
              <span class="s">wellbeing {Math.round(avgWellbeing(s))}</span>
            </div>
          </button>
        )}
        {s.system && (
          <button class="stat btnless" data-hue="orange" onClick={() => game.openSystem('thermal')} data-tut="system-stat" data-tip={`Earth’s surface uses ${fmtTW(surfaceTW(s))} of the ${fmtTW(lineTW(s))} the Thermal Line allows${overLine(s) > 0 ? ` — ${Math.round(overLine(s) * 100)}% over` : ''}.
Healthy life expectancy ${s.system.lifeExp.toFixed(1)} years, rising ${s.system.lifeRate.toFixed(2)} a year${s.system.escape ? ' (escape velocity)' : ''}.
Click to open the System (X).`}>
            <Icon name="thermal" />
            <div class="col">
              <span class={`v ${overLine(s) > 0 ? 'bad' : surfaceTW(s) > lineTW(s) * 0.92 ? 'warn' : ''}`}>{s.system.thermalLine ? `${Math.round((surfaceTW(s) / Math.max(1, lineTW(s))) * 100)}% of line` : 'no line yet'}</span>
              <span class="s">{s.system.lifeExp.toFixed(0)} healthy years</span>
            </div>
          </button>
        )}
        <div class="stat" data-hue="yellow" data-tip={`Power served to your sites vs. what they need.\nGeneration you own: ${fmtMW(st.playerGenMW)} average.`}>
          <Icon name="power" />
          <div class="col">
            <span class="v">{fmtMW(st.powerServed)}</span>
            <span class={`s ${st.powerLoad > 0 && st.powerServed < st.powerLoad * 0.98 ? 'bad' : ''}`}>of {fmtMW(st.powerLoad)} needed</span>
          </div>
        </div>
        <div class="stat" data-hue="cyan" data-tip={`Total compute: ${st.computeEF.toFixed(2)} exaFLOP/s peak.\n${st.installedAccel.toLocaleString()} accelerators installed, ${st.rentedAccel.toLocaleString()} rented.`}>
          <Icon name="compute" />
          <div class="col">
            <span class="v cyan">{st.computeEF < 10 ? st.computeEF.toFixed(2) : st.computeEF < 1000 ? st.computeEF.toFixed(1) : Math.round(st.computeEF).toLocaleString('en-US')} EF</span>
            <span class="s">{(st.installedAccel + st.rentedAccel).toLocaleString()} chips</span>
          </div>
        </div>
        <div class="stat" data-hue="violet" data-tip={`Your best model's capability: ${st.capability.toFixed(2)}.\nFrontier (Meridian/Lattice): ${st.frontier.toFixed(2)}.\nTiers: ${CAPABILITY_TIERS.slice(1).join(' → ')}`}>
          <Icon name="brain" />
          <div class="col">
            <span class="v">{model ? model.name : 'No model'}</span>
            <span class="s">{model ? `${st.capability.toFixed(2)} · ${CAPABILITY_TIERS[tierOf(st.capability)]}` : 'train Bit-1'}</span>
          </div>
        </div>
        <div class="stat hide-mobile" data-hue="blue" data-tip={`Safety margin = alignment − capability.\nAlignment ${st.alignment.toFixed(2)} · capability ${st.capability.toFixed(2)}.\nBelow 0, safety incidents become likely.`}>
          <Icon name="shield" />
          <div class="col">
            <span class={`v ${marginCls}`}>{st.margin >= 0 ? '+' : ''}{st.margin.toFixed(2)}</span>
            <span class="s">safety margin</span>
          </div>
        </div>
      </div>
      <div class="kmeter frame" data-tut="kmeter" data-tip={`Kardashev scale: K = (log₁₀ watts − 6) / 10.\nCivilisation uses ${st.worldTW.toFixed(2)} TW.\nNext milestone: K ${next.k.toFixed(2)} — ${next.label}.\nType I = 10 PW = K 1.00.`}>
        <div class="kring">
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle class="track" cx="22" cy="22" r="19" pathLength="100" />
            <circle class="arc" cx="22" cy="22" r="19" pathLength="100" style={{ strokeDasharray: `${Math.max(1.5, Math.min(100, kProgress * 100))} 100` }} />
          </svg>
          <Icon name="k" />
        </div>
        <div class="col">
          <span class="klabel">Kardashev</span>
          <span class={`kv ${st.K >= 0.99 ? 'gold' : ''}`}>
            <Eased value={st.K} format={(k) => k.toFixed(st.K >= 0.95 ? 4 : 5)} />
          </span>
        </div>
        <div class="knext" aria-hidden="true">
          <span class="klabel">Next</span>
          <span class="kn">{next.k.toFixed(2)}</span>
        </div>
        {/* the garage's way of showing the scale (look 1): a tape measure from 0.70 to Type I, a marker where we stand */}
        <div class="ktape" aria-hidden="true">
          <i style={{ left: `${kOnScale * 100}%` }} />
          <span>0.70</span>
          <span>0.80</span>
          <span>0.90</span>
          <span>Type I</span>
        </div>
      </div>
      <KArc f={kOnScale} K={st.K} left={Math.max(0, 1 - st.K)} />
    </div>
  );
}

/** The clock's buttons: pause, then one to four arrowheads. Drawn in the text colour, so the picked one lights. */
function SpeedGlyph({ n }: { n: number }) {
  if (n === 0)
    return (
      <svg class="sg" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="5" y="4" width="3.6" height="12" rx="1.2" />
        <rect x="11.4" y="4" width="3.6" height="12" rx="1.2" />
      </svg>
    );
  const w = 5.2;
  const step = n === 1 ? 0 : n === 2 ? 5.4 : n === 3 ? 4.3 : 3.5;
  const total = w + step * (n - 1);
  const x0 = (20 - total) / 2 + (n === 1 ? 0.6 : 0);
  return (
    <svg class="sg" viewBox="0 0 20 20" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const x = x0 + i * step;
        const k = n === 1 ? 1.5 : 1;
        return <path key={i} d={`M${x} ${10 - 4.6 * k * 0.8}L${x + w * k} 10L${x} ${10 + 4.6 * k * 0.8}Z`} stroke-linejoin="round" stroke-width="1.4" />;
      })}
    </svg>
  );
}

/**
 * The last look's way of showing the scale (look 5): an arc of light across the top of the screen from 0.70 to
 * Type I, with the Sun where the civilisation stands. Drawn always, shown only in that look (looks/look5.css).
 */
function KArc({ f, K, left }: { f: number; K: number; left: number }) {
  const R = 1500;
  const cx = 480;
  const cy = 1524;
  const at = (t: number, r = R): [number, number] => {
    const a = ((-90 + (t - 0.5) * 36) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x0, y0] = at(0);
  const [x1, y1] = at(1);
  const [xs, ys] = at(f);
  const labels = ['0.70', '0.75', '0.80', '0.85', '0.90', '0.95', 'Type I'];
  return (
    <div class="karc" aria-hidden="true">
      <svg viewBox="0 0 960 150">
        <defs>
          <linearGradient id="karc-line" x1="0" x2="1">
            <stop offset="0" stop-color="#5ff5e0" />
            <stop offset={Math.max(0.01, f - 0.01)} stop-color="#ffd98a" />
            <stop offset={Math.min(1, f + 0.005)} stop-color="rgba(190,255,246,0.3)" />
            <stop offset="1" stop-color="rgba(190,255,246,0.3)" />
          </linearGradient>
          <radialGradient id="karc-sun">
            <stop offset="0" stop-color="#fff" />
            <stop offset="0.3" stop-color="#ffe6a8" />
            <stop offset="1" stop-color="rgba(255,170,80,0)" />
          </radialGradient>
        </defs>
        <path d={`M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`} fill="none" stroke="url(#karc-line)" stroke-width="3" />
        {Array.from({ length: 31 }, (_, i) => {
          const [ax, ay] = at(i / 30);
          const [bx, by] = at(i / 30, R - (i % 5 === 0 ? 18 : 9));
          return <line key={i} x1={ax.toFixed(1)} y1={ay.toFixed(1)} x2={bx.toFixed(1)} y2={by.toFixed(1)} stroke={`rgba(190,255,246,${i % 5 === 0 ? 0.9 : 0.45})`} stroke-width={i % 5 === 0 ? 1.6 : 1} />;
        })}
        {labels.map((t, i) => {
          const [lx, ly] = at(i / 6);
          return (
            <text key={t} x={lx.toFixed(1)} y={(ly - 12).toFixed(1)} text-anchor="middle" class={i === 6 ? 'end' : ''}>
              {t}
            </text>
          );
        })}
        <circle cx={xs.toFixed(1)} cy={ys.toFixed(1)} r="30" fill="url(#karc-sun)" />
        <circle cx={xs.toFixed(1)} cy={ys.toFixed(1)} r="7" fill="#fffbe8" />
      </svg>
      <span class="klabel">{K >= 1 ? 'Kardashev scale · Type I' : `Kardashev scale · ${(left * 100).toFixed(1)}% to Type I`}</span>
      <b>
        <Eased value={K} format={(k) => k.toFixed(4)} />
      </b>
    </div>
  );
}
