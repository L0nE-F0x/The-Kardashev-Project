import { useState } from 'preact/hooks';
import { Panel, useGame } from '../components';
import type { ChartPoint } from '../../sim/types';
import { fmtDate, fmtMoney, fmtMW } from '../../sim/core';

type Range = 'act' | '5y' | 'all';

interface Series {
  label: string;
  color: string;
  get: (p: ChartPoint) => number;
}

interface ChartDef {
  id: string;
  title: string;
  fmt: (v: number) => string;
  series: Series[];
  /** Log scale when the data spans more than ~50× (compute, power, money grow by orders of magnitude). */
  log?: boolean;
  /** Draw a line at zero (the safety margin). */
  zero?: boolean;
  /** Only when some point has a value. */
  optional?: boolean;
}

const fmtEF = (v: number) => (v >= 100 ? `${v.toFixed(0)} EF` : v >= 1 ? `${v.toFixed(1)} EF` : `${v.toFixed(2)} EF`);
const fmtNum = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(0));

const CHARTS: ChartDef[] = [
  { id: 'cash', title: 'Cash', fmt: (v) => fmtMoney(v), log: true, series: [{ label: 'Cash', color: 'var(--gold)', get: (p) => p.cash }] },
  {
    id: 'money',
    title: 'Revenue vs running costs',
    fmt: (v) => `${fmtMoney(v)}/mo`,
    log: true,
    series: [
      { label: 'Revenue', color: 'var(--good)', get: (p) => p.rev },
      { label: 'Costs', color: 'var(--warn)', get: (p) => p.cost },
    ],
  },
  { id: 'compute', title: 'Compute', fmt: fmtEF, log: true, series: [{ label: 'Compute', color: 'var(--cyan)', get: (p) => p.ef }] },
  {
    id: 'power',
    title: 'Power',
    fmt: (v) => fmtMW(v),
    log: true,
    series: [
      { label: 'Served', color: 'var(--c-yel1, #f2c14e)', get: (p) => p.mw },
      { label: 'Needed', color: 'var(--muted)', get: (p) => p.load },
    ],
  },
  { id: 'chips', title: 'Accelerators', fmt: fmtNum, log: true, series: [{ label: 'Chips', color: 'var(--blue)', get: (p) => p.chips }] },
  {
    id: 'models',
    title: 'Capability vs the frontier',
    fmt: (v) => v.toFixed(2),
    series: [
      { label: 'Yours', color: 'var(--violet)', get: (p) => p.cap },
      { label: 'Frontier', color: 'var(--muted)', get: (p) => p.frontier },
    ],
  },
  { id: 'margin', title: 'Safety margin', fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`, zero: true, series: [{ label: 'Margin', color: 'var(--blue)', get: (p) => p.margin }] },
  { id: 'k', title: 'Kardashev scale', fmt: (v) => `K ${v.toFixed(4)}`, series: [{ label: 'K', color: 'var(--cyan)', get: (p) => p.k }] },
  { id: 'charter', title: 'Charter treasury', fmt: (v) => fmtMoney(v), optional: true, series: [{ label: 'Treasury', color: 'var(--gold)', get: (p) => p.charter ?? NaN }] },
  { id: 'warm', title: 'Warming', fmt: (v) => `${v.toFixed(2)} °C`, optional: true, series: [{ label: 'Warming', color: 'var(--warn)', get: (p) => p.warm ?? NaN }] },
];

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const W = 300;
const H = 96;

function Chart({ def, pts }: { def: ChartDef; pts: ChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = def.series.flatMap((s) => pts.map(s.get)).filter(ok);
  if (!vals.length || pts.length < 2) {
    return (
      <div class="chart frame">
        <div class="row between">
          <span class="label">{def.title}</span>
        </div>
        <div class="chart-empty small muted">Not enough history yet — check back in a month or two.</div>
      </div>
    );
  }
  const pos = vals.filter((v) => v > 0);
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const useLog = !!def.log && lo0 > 0 && pos.length === vals.length && hi0 / Math.max(1e-12, Math.min(...pos)) > 50;
  const f = (v: number) => (useLog ? Math.log10(v) : v);
  let lo = f(useLog ? Math.min(...pos) : Math.min(lo0, def.zero ? 0 : lo0));
  let hi = f(hi0);
  if (def.zero) hi = Math.max(hi, 0);
  if (!useLog && !def.zero && lo > 0 && lo < hi * 0.6) lo = 0;
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= useLog ? 1 : 0;
  }
  const d0 = pts[0].d;
  const d1 = pts[pts.length - 1].d;
  const x = (d: number) => ((d - d0) / Math.max(1, d1 - d0)) * W;
  const y = (v: number) => H - 4 - ((f(v) - lo) / (hi - lo)) * (H - 8);
  const lines = def.series.map((s) => {
    let path = '';
    let pen = false;
    for (const p of pts) {
      const v = s.get(p);
      if (!ok(v) || (useLog && v <= 0)) {
        pen = false;
        continue;
      }
      path += `${pen ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    }
    return { s, path };
  });
  const last = pts[pts.length - 1];
  const hp = hover !== null ? pts[hover] : null;
  const shown = hp ?? last;
  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const fx = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(pts[i].d) - fx) < Math.abs(x(pts[best].d) - fx)) best = i;
    setHover(best);
  };
  return (
    <div class="chart frame">
      <div class="row between chart-head">
        <span class="label">{def.title}</span>
        <span class="small muted">{hp ? fmtDate(hp.d) : 'now'}</span>
      </div>
      <div class="chart-vals">
        {def.series.map((s) => {
          const v = s.get(shown);
          return (
            <span key={s.label} class="cv">
              <i style={{ background: s.color }} />
              {def.series.length > 1 && <span class="muted">{s.label} </span>}
              <b>{ok(v) ? def.fmt(v) : '—'}</b>
            </span>
          );
        })}
      </div>
      <svg class="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={0} x2={W} y1={H * t} y2={H * t} class="grid" />
        ))}
        {def.zero && lo < 0 && hi > 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} class="zero" />}
        {lines.map(({ s, path }) => (
          <path key={s.label} d={path} fill="none" stroke={s.color} stroke-width={2} vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        ))}
        {hp && <line x1={x(hp.d)} x2={x(hp.d)} y1={0} y2={H} class="cross" />}
      </svg>
      <div class="row between chart-foot small muted">
        <span>{fmtDate(d0)}</span>
        <span>{useLog ? 'log scale · ' : ''}max {def.fmt(useLog ? 10 ** hi : hi)}</span>
        <span>{fmtDate(d1)}</span>
      </div>
    </div>
  );
}

/** Charts of the whole run, one point a month (game/chart.ts). */
export function StatsPanel() {
  const game = useGame();
  const s = game.state!;
  const [range, setRange] = useState<Range>('all');
  const all = s.meta.chart ?? [];
  const actStart = s.meta.log?.acts?.[s.act ?? 1]?.fromDay ?? 0;
  const from = range === 'all' ? -Infinity : range === '5y' ? s.day - 365 * 5 : actStart;
  const pts = all.filter((p) => p.d >= from);
  const charts = CHARTS.filter((c) => !c.optional || pts.some((p) => c.series.some((x) => ok(x.get(p)))));
  return (
    <Panel
      title="Stats"
      icon="chart"
      class="wide research"
      onClose={() => game.openPanel(null)}
      extra={
        <div class="seg">
          {(
            [
              ['act', 'This act'],
              ['5y', '5 years'],
              ['all', 'All'],
            ] as [Range, string][]
          ).map(([r, label]) => (
            <button key={r} class={`btn small ${range === r ? 'active' : ''}`} onClick={() => setRange(r)} aria-pressed={range === r}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      <p class="small muted" style={{ marginTop: 0 }}>
        One point a game month. Hover a chart to read any month. Money, compute, power and chips switch to a log scale when they’ve grown a lot.
      </p>
      <div class="charts">
        {charts.map((c) => (
          <Chart key={c.id} def={c} pts={pts} />
        ))}
      </div>
    </Panel>
  );
}
