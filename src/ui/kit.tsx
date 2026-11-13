import type { ComponentChildren } from 'preact';
import { Icon } from './components';
import type { IconName } from './icons';

/**
 * The panels' richer parts (v0.14): what a panel says first goes in a row of tiles (a big figure, its label, a line
 * under it, sometimes a small chart), shares go in a split bar, a level against a limit in a meter, a value on a
 * scale with a danger end in a gauge. Styles: render3d/ui/kit.css. Tones name the game's colours by meaning:
 * gold = money and the score, cyan = compute and things you run, violet = models and research, yellow = power,
 * blue = safety, green / orange / red = good / careful / bad.
 */
export type Tone = 'gold' | 'cyan' | 'violet' | 'yellow' | 'blue' | 'good' | 'warn' | 'bad' | 'plain';

/** A row of tiles; they share the width and wrap when it runs out. */
export function Tiles({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return <div class={`tiles ${cls ?? ''}`}>{children}</div>;
}

/** One big figure with its label. `sub` = the line under it; `chart` = points for a small line behind the figure. */
export function Tile({ label, value, sub, tone, icon, tip, chart, children, wide, onClick, tut }: { label: string; value: ComponentChildren; sub?: ComponentChildren; tone?: Tone; icon?: IconName; tip?: string; chart?: number[]; children?: ComponentChildren; wide?: boolean; onClick?: () => void; tut?: string }) {
  const body = (
    <>
      {chart && chart.length > 1 && <Spark points={chart} class="tile-chart" />}
      <span class="tile-l">
        {icon && <Icon name={icon} size="sm" />}
        {label}
      </span>
      <span class="tile-v">{value}</span>
      {sub != null && sub !== false && <span class="tile-s">{sub}</span>}
      {children}
    </>
  );
  const cls = `tile ${tone ? `t-${tone}` : ''} ${wide ? 'wide' : ''}`;
  return onClick ? (
    <button class={`${cls} btnless press`} data-tip={tip} data-tut={tut} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div class={cls} data-tip={tip} data-tut={tut}>
      {body}
    </div>
  );
}

/** A small line chart with a soft fill under it; it takes its colour from the text colour around it. */
export function Spark({ points, class: cls, height = 40 }: { points: number[]; class?: string; height?: number }) {
  if (points.length < 2) return null;
  const W = 200;
  const H = height;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return (
    <svg class={`spark2 ${cls ?? ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path class="area" d={`${line}L${W} ${H}L0 ${H}Z`} />
      <path class="line" d={line} vector-effect="non-scaling-stroke" />
    </svg>
  );
}

export interface Part {
  label: string;
  value: number;
  tone?: Tone;
  /** What the legend shows for this part (default: its share in percent). */
  text?: string;
  tip?: string;
}

/** Shares of a whole as one bar in parts, with a legend under it. */
export function SplitBar({ parts, legend = true, total }: { parts: Part[]; legend?: boolean; total?: number }) {
  const sum = total ?? parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div class="split">
      <div class="split-bar">
        {shown.map((p) => (
          <i key={p.label} class={`t-${p.tone ?? 'plain'}`} style={{ flexGrow: Math.max(0.0001, p.value / (sum || 1)) }} data-tip={p.tip ?? `${p.label}: ${p.text ?? `${Math.round((p.value / (sum || 1)) * 100)}%`}`} />
        ))}
        {total !== undefined && sum > 0 && parts.reduce((a, p) => a + Math.max(0, p.value), 0) < sum && <i class="rest" style={{ flexGrow: 1 - parts.reduce((a, p) => a + Math.max(0, p.value), 0) / sum }} />}
      </div>
      {legend && (
        <div class="split-legend">
          {shown.map((p) => (
            <span key={p.label} class={`t-${p.tone ?? 'plain'}`} data-tip={p.tip}>
              <i />
              {p.label}
              <b>{p.text ?? `${Math.round((p.value / (sum || 1)) * 100)}%`}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A level against a limit: label and reading on a line, the bar under them, an optional mark on the bar. */
export function Meter({ label, text, value, tone, mark, tip, tall }: { label: ComponentChildren; text?: ComponentChildren; value: number; tone?: Tone; mark?: number; tip?: string; tall?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div class={`meter t-${tone ?? 'cyan'} ${tall ? 'tall' : ''}`} data-tip={tip}>
      <div class="meter-top">
        <span class="meter-l">{label}</span>
        {text != null && <span class="meter-t">{text}</span>}
      </div>
      <div class="meter-bar">
        <i style={{ width: `${pct}%` }} />
        {mark !== undefined && <u style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%` }} />}
      </div>
    </div>
  );
}

/**
 * A half-dial: `value` between `min` and `max`, the stretch below `danger` drawn in the warning colour. The
 * reading stands in the middle of the dial.
 */
export function Gauge({ value, min, max, danger, text, label, tone }: { value: number; min: number; max: number; danger?: number; text: string; label?: string; tone?: Tone }) {
  const f = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const d = danger === undefined ? 0 : Math.max(0, Math.min(1, (danger - min) / (max - min || 1)));
  // a half circle of radius 40 around (50, 50), drawn left to right; pathLength 100 makes the dashes percentages
  const arc = 'M10 50A40 40 0 0 1 90 50';
  const a = Math.PI * (1 - f);
  return (
    <div class={`gauge t-${tone ?? 'cyan'}`}>
      <svg viewBox="0 0 100 58" aria-hidden="true">
        <path class="g-track" d={arc} pathLength="100" />
        {d > 0 && <path class="g-danger" d={arc} pathLength="100" style={{ strokeDasharray: `${d * 100} 100` }} />}
        <path class="g-fill" d={arc} pathLength="100" style={{ strokeDasharray: `${Math.max(0.5, f * 100)} 100` }} />
        <circle class="g-knob" cx={50 + 40 * Math.cos(a)} cy={50 - 40 * Math.sin(a)} r="4.2" />
      </svg>
      <div class="g-text">
        <b>{text}</b>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

/** A card inside a panel: a titled block on its own plate. */
export function Card({ title, icon, extra, children, class: cls, tut }: { title?: string; icon?: IconName; extra?: ComponentChildren; children: ComponentChildren; class?: string; tut?: string }) {
  return (
    <div class={`kcard ${cls ?? ''}`} data-tut={tut}>
      {title && (
        <div class="kcard-h">
          <h4>
            {icon && <Icon name={icon} size="sm" />}
            {title}
          </h4>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

/** Two cards side by side (one column when the panel is narrow). */
export function Cols({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return <div class={`kcols ${cls ?? ''}`}>{children}</div>;
}
