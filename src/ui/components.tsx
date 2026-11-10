import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game/game';
import type { AdvisorId } from '../sim/types';
import type { Mood } from '../content/events';
import { iconUrl, type IconName } from './icons';
import { ceoPortraitUrl, portraitUrl } from '../render/sprites/portraits';
import type { Speaker } from '../content/events';
import { DELEGATES, PARTNERS } from '../content/charter';
import { CAST4 } from '../content/planet';
import { CEOS } from '../content/companies';
import { CAST5 } from '../content/system';
import { bitForm, castAge, deskHolder } from '../sim/systemView';
import { isAndroidApp, openExternal } from '../platform/platform';

export const GameCtx = createContext<Game>(null as unknown as Game);

/**
 * The 3D edition wearing its own interface look (render3d/ui/*.css; main3d.ts marks the page before the UI renders,
 * and the Classic look turns it off): a few screens carry extra markup for it.
 */
export const is3d = (): boolean => {
  const c = document.documentElement.classList;
  return c.contains('edition-3d') && !c.contains('ui-classic');
};

/** Subscribe to game updates; returns the game. */
export function useGame(): Game {
  const game = useContext(GameCtx);
  const [, set] = useState(0);
  useEffect(() => game.subscribe(() => set((v) => v + 1)), [game]);
  return game;
}

/**
 * A number that glides to its new value instead of stepping (the 3D edition's money and K meter). Text only, so the
 * markup is the same in both editions; the pixel edition and reduced motion show the value as it is.
 */
export function Eased({ value, format }: { value: number; format: (v: number) => string }) {
  const game = useContext(GameCtx);
  const on = is3d() && !game.settings.reducedMotion;
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  from.current = shown;
  useEffect(() => {
    if (!on || from.current === value) return;
    const a = from.current;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - t0) / 420);
      setShown(a + (value - a) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, on]);
  return <>{format(on ? shown : value)}</>;
}

export function Icon({ name, size, title }: { name: IconName; size?: 'sm' | 'lg'; title?: string }) {
  return <img class={`px ${size ?? ''}`} src={iconUrl(name)} alt={title ?? name} title={title} draggable={false} />;
}

export function Portrait({ id, mood, size, bitGen }: { id: AdvisorId; mood?: Mood; size?: number; bitGen?: number }) {
  const game = useContext(GameCtx);
  const s = game?.view ?? game?.state ?? null;
  const gen = bitGen ?? (s ? bitForm(s) : 0);
  // Act V: the cast greys (or is renewed); a retired advisor's desk shows their successor
  const holder = s ? deskHolder(s, id) : id;
  if (holder !== id) return <img class="portrait" src={ceoPortraitUrl(holder.slice(4), mood ?? 'neutral')} style={size ? { width: `${size}px`, height: `${size}px` } : undefined} alt={holder} draggable={false} />;
  return <img class="portrait" src={portraitUrl(id, mood ?? 'neutral', gen, s ? castAge(s, id) : 0)} style={size ? { width: `${size}px`, height: `${size}px` } : undefined} alt={id} draggable={false} />;
}

const ADVISOR_TITLES: Record<string, string> = { juno: 'Juno · Engineering', penny: 'Penny · Finance', mira: 'Mira · Supply chain', sol: 'Sol · Diplomacy', iris: 'Iris · Safety', kip: 'Kip · Space', bit: 'Bit', lena: 'Lena · Fusion' };

/** The name line for an event-card speaker (advisor, partner CEO or faction delegate). */
export function speakerName(id: Speaker, s?: import('../sim/types').GameState | null): string {
  if (!id.startsWith('ceo:')) {
    const holder = s ? deskHolder(s, id as AdvisorId) : id;
    if (holder === id) return ADVISOR_TITLES[id] ?? id;
    id = holder as Speaker;
  }
  const key = id.slice(4);
  const p = PARTNERS[key];
  if (p) return `${p.ceo.name} · ${p.short}`;
  const d = DELEGATES[key as keyof typeof DELEGATES];
  if (d) return `${d.name} · ${d.title}`;
  const c4 = CAST4[key];
  if (c4) return `${c4.name} · ${c4.title}`;
  const c5 = CAST5[key];
  if (c5) return `${c5.name} · ${c5.title}`;
  const c = CEOS[key];
  return c ? `${c.name} · ${c.company}` : key;
}

/** Portrait for any speaker: advisors and Bit, or a CEO / delegate (`ceo:<id>`). */
export function SpeakerPortrait({ id, mood, size }: { id: Speaker; mood?: Mood; size?: number }) {
  if (!id.startsWith('ceo:')) return <Portrait id={id as AdvisorId} mood={mood} size={size} />;
  return <img class="portrait" src={ceoPortraitUrl(id.slice(4), mood ?? 'neutral')} style={size ? { width: `${size}px`, height: `${size}px` } : undefined} alt={id.slice(4)} draggable={false} />;
}

export function Bar({ value, kind, tall, tip }: { value: number; kind?: 'gold' | 'violet' | 'warn'; tall?: boolean; tip?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div class={`bar ${kind ?? ''} ${tall ? 'tall' : ''}`} data-tip={tip}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Panel({ title, icon, onClose, children, class: cls, extra }: { title: string; icon?: IconName; onClose?: () => void; children: ComponentChildren; class?: string; extra?: ComponentChildren }) {
  return (
    <div class={`panel frame ${cls ?? ''}`}>
      <div class="head">
        {icon && <Icon name={icon} />}
        <h2>{title}</h2>
        {extra}
        {onClose && (
          <button class="btn ghost small" onClick={onClose} aria-label="Close">
            <Icon name="close" size="sm" />
          </button>
        )}
      </div>
      <div class="body">{children}</div>
    </div>
  );
}

export function KV({ rows }: { rows: [ComponentChildren, ComponentChildren, string?][] }) {
  return (
    <div class="kv">
      {rows.map(([k, v, tip], i) => (
        <>
          <span class="k" key={`k${i}`} data-tip={tip}>
            {k}
          </span>
          <span class="v" key={`v${i}`}>
            {v}
          </span>
        </>
      ))}
    </div>
  );
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/** On/off switch with a label and an optional hint. */
export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class={`setting toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span class="sw" aria-hidden="true">
        <i />
      </span>
      <span class="txt">
        <span class="l">{label}</span>
        {hint && <span class="h">{hint}</span>}
      </span>
    </button>
  );
}

/** Labelled slider (0..1 shown as a percentage by default). */
export function Slider({ label, hint, value, min = 0, max = 1, step = 0.05, format, onChange }: { label: string; hint?: string; value: number; min?: number; max?: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label class="setting slider">
      <span class="txt">
        <span class="l">{label}</span>
        {hint && <span class="h">{hint}</span>}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} aria-label={label} />
      <span class="val">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
    </label>
  );
}

/** A row of mutually exclusive options. */
export function Choice<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="setting opt">
      <span class="txt">
        <span class="l">{label}</span>
        {hint && <span class="h">{hint}</span>}
      </span>
      <div class="seg">
        {options.map(([v, name]) => (
          <button key={String(v)} class={`btn small ${v === value ? 'active' : ''}`} onClick={() => onChange(v)} aria-pressed={v === value}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A centred modal window used by the menu screens. */
export function Window({ title, icon, onClose, children, wide }: { title: string; icon?: IconName; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  return (
    <div class="scrim menu-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`modal frame window ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div class="head">
          {icon && <Icon name={icon} size="lg" />}
          <h2 class="grow">{title}</h2>
          <button class="btn ghost small" onClick={onClose} aria-label="Close">
            <Icon name="close" size="sm" />
          </button>
        </div>
        <div class="body">{children}</div>
      </div>
    </div>
  );
}

export function fmtPlaytime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** A link to a page outside the game: a new tab in the browser, the system browser in the desktop and Android apps. */
export function ExtLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a
      href={href}
      class="link"
      target={isAndroidApp() ? undefined : '_blank'}
      rel="noopener"
      onClick={(e) => {
        if (openExternal(href)) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}

/** The studio behind the game (also in the website's footer, index.html). */
export const APEXFORGE_URL = 'https://ame-apexforge.org/';

export function BuiltBy() {
  return (
    <>
      Built by <ExtLink href={APEXFORGE_URL}>ApexForge</ExtLink>
    </>
  );
}
