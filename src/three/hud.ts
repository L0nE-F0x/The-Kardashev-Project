/** A light DOM HUD for the look test: the sim's headline numbers, the build bar, and the view controls. */
import '../ui/base.css';
import { FACILITIES } from '../content/facilities';
import { fmtDate, fmtMoney } from '../sim/core';
import { canBuild } from '../sim/actions';
import { buildCost } from '../sim/model';
import type { FacilityType } from '../sim/types';
import type { SimRun } from './simrun';

export interface HudHooks {
  site(id: 'bay-area' | 'west-texas'): void;
  look(l: 'model' | 'pixel'): void;
  time(t: number | 'cycle'): void;
  pixelSize(n: number): void;
  tilt(on: boolean): void;
  build(t: FacilityType): void;
  speed(n: number): void;
  autopilot(on: boolean): void;
  hide(): void;
}

const BUILD: FacilityType[] = ['solar', 'wind', 'battery', 'gas', 'datacenter', 'lab'];

const css = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: var(--font); color: #f3ede4; font-size: 14px; }
#hud.off > *:not(.always) { display: none; }
#hud .card { position: absolute; pointer-events: auto; background: rgba(22, 20, 31, 0.72); backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 10px; padding: 10px 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
#hud .title { font-family: var(--font-pixel); font-size: 12px; letter-spacing: 0.08em; color: #fbd46e; }
#hud .sub { font-size: 11px; opacity: 0.6; margin-top: 2px; }
#hud .stats { display: grid; grid-template-columns: auto auto; gap: 2px 14px; margin-top: 8px; font-variant-numeric: tabular-nums; }
#hud .stats b { font-weight: 600; text-align: right; }
#hud .row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
#hud .row + .row { margin-top: 6px; }
#hud .lbl { font-size: 11px; opacity: 0.6; width: 46px; text-transform: uppercase; letter-spacing: 0.06em; }
#hud button { font: inherit; font-size: 12px; color: #f3ede4; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px; padding: 4px 9px; cursor: pointer; }
#hud button:hover { background: rgba(255,255,255,0.14); }
#hud button.on { background: #2fae9b; border-color: #5fd3b5; color: #0b0a12; font-weight: 600; }
#hud button:disabled { opacity: 0.35; cursor: default; }
#hud .build { bottom: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; padding: 8px; }
#hud .build button { display: flex; flex-direction: column; align-items: center; min-width: 76px; padding: 6px 8px; }
#hud .build button span { font-size: 10px; opacity: 0.7; }
#hud .news:empty { display: none; }
#hud .news { left: 14px; bottom: 14px; max-width: 26vw; font-size: 12px; opacity: 0.9; }
#hud .toast { left: 50%; top: 16px; transform: translateX(-50%); font-size: 13px; transition: opacity 0.4s; opacity: 0; }
@media (max-width: 900px) { #hud .news { display: none; } #hud .build button { min-width: 0; } }
`;

export class Hud {
  private el: HTMLElement;
  private stats!: HTMLElement;
  private news!: HTMLElement;
  private toastEl!: HTMLElement;
  private buildBtns = new Map<FacilityType, HTMLButtonElement>();
  private toastTimer = 0;

  constructor(private run: SimRun, private hooks: HudHooks) {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.append(st);
    this.el = document.getElementById('hud')!;
    this.el.innerHTML = `
      <div class="card" style="left:14px;top:14px;min-width:220px">
        <div class="title">THE KARDASHEV PROJECT</div>
        <div class="sub">3D look test · Act I on the real sim</div>
        <div class="stats"></div>
      </div>
      <div class="card ctl" style="right:14px;top:14px">
        <div class="row"><span class="lbl">Site</span><button data-site="bay-area">The Garage</button><button data-site="west-texas" class="on">West Texas</button></div>
        <div class="row"><span class="lbl">Look</span><button data-look="model" class="on">Model</button><button data-look="pixel">Pixel</button>
          <button data-px="2">2×</button><button data-px="3" class="on">3×</button><button data-px="4">4×</button></div>
        <div class="row"><span class="lbl">Time</span><button data-time="0.3">Dawn</button><button data-time="0.5">Noon</button>
          <button data-time="0.62" class="on">Afternoon</button><button data-time="0.735">Golden</button><button data-time="0.9">Night</button><button data-time="cycle">Cycle</button></div>
        <div class="row"><span class="lbl">Sim</span><button data-speed="0">❚❚</button><button data-speed="1">1</button><button data-speed="4" class="on">4</button>
          <button data-speed="15">15</button><button data-speed="40">40</button><span style="font-size:11px;opacity:.6">days/s</span>
          <button data-auto class="on">Autopilot</button></div>
        <div class="row"><span class="lbl">View</span><button data-tilt class="on">Tilt-shift</button><button data-hide>Hide HUD (H)</button></div>
      </div>
      <div class="card news"></div>
      <div class="card build"></div>
      <div class="card toast always"></div>`;
    this.stats = this.el.querySelector('.stats')!;
    this.news = this.el.querySelector('.news')!;
    this.toastEl = this.el.querySelector('.toast')!;
    const bar = this.el.querySelector('.build')!;
    for (const t of BUILD) {
      const b = document.createElement('button');
      b.innerHTML = `${FACILITIES[t].name.replace(' Storage', '').replace('Data Center', 'Data Hall')}<span></span>`;
      b.onclick = () => hooks.build(t);
      bar.append(b);
      this.buildBtns.set(t, b);
    }
    const group = (sel: string, fn: (b: HTMLButtonElement) => void) => {
      const bs = [...this.el.querySelectorAll<HTMLButtonElement>(sel)];
      for (const b of bs) b.onclick = () => { bs.forEach((x) => x.classList.toggle('on', x === b)); fn(b); };
    };
    group('[data-site]', (b) => hooks.site(b.dataset.site as 'bay-area' | 'west-texas'));
    group('[data-look]', (b) => hooks.look(b.dataset.look as 'model' | 'pixel'));
    group('[data-px]', (b) => hooks.pixelSize(Number(b.dataset.px)));
    group('[data-time]', (b) => hooks.time(b.dataset.time === 'cycle' ? 'cycle' : Number(b.dataset.time)));
    group('[data-speed]', (b) => hooks.speed(Number(b.dataset.speed)));
    const auto = this.el.querySelector<HTMLButtonElement>('[data-auto]')!;
    auto.onclick = () => { auto.classList.toggle('on'); hooks.autopilot(auto.classList.contains('on')); };
    const tilt = this.el.querySelector<HTMLButtonElement>('[data-tilt]')!;
    tilt.onclick = () => { tilt.classList.toggle('on'); hooks.tilt(tilt.classList.contains('on')); };
    this.el.querySelector<HTMLButtonElement>('[data-hide]')!.onclick = () => this.toggle();
    addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') this.toggle(); });
  }

  toggle() {
    this.el.classList.toggle('off');
    this.hooks.hide();
  }

  setSite(id: string) {
    this.el.querySelectorAll<HTMLButtonElement>('[data-site]').forEach((b) => b.classList.toggle('on', b.dataset.site === id));
  }

  toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), 3200);
  }

  refresh() {
    const s = this.run.s;
    const st = s.stats;
    const model = s.models[s.models.length - 1];
    const research = s.research.current ? `${Math.round((s.research.progress ?? 0))} RP` : '—';
    this.stats.innerHTML = [
      ['Date', fmtDate(s.day)],
      ['Cash', fmtMoney(s.finance.cash)],
      ['Compute', `${st.computeEF.toFixed(2)} EF`],
      ['Accelerators', `${st.installedAccel.toLocaleString()} + ${st.rentedAccel.toLocaleString()} rented`],
      ['Power', `${st.powerServed.toFixed(1)} / ${st.powerLoad.toFixed(1)} MW`],
      ['Model', model ? `${model.name} (${model.capability.toFixed(2)})` : s.training ? 'training Bit-1…' : '—'],
      ['Research', research],
      ['Kardashev', `K ${st.K.toFixed(4)}`],
    ].map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
    this.news.innerHTML = s.news.slice(0, 3).map((n) => `<div style="margin:2px 0">${fmtDate(n.day)} · ${escape(n.text)}</div>`).join('');
    for (const [t, b] of this.buildBtns) {
      const why = canBuild(s, 'west-texas', t);
      b.disabled = !!why;
      b.title = why ?? FACILITIES[t].blurb;
      (b.lastChild as HTMLElement).textContent = fmtMoney(buildCost(s, t));
    }
  }
}

const escape = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
