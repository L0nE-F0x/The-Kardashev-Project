import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { Game } from '../game/game';
import type { AdvisorId } from '../sim/types';
import type { Mood } from '../content/events';
import { iconUrl, type IconName } from './icons';
import { portraitUrl } from '../render/sprites/portraits';

export const GameCtx = createContext<Game>(null as unknown as Game);

/** Subscribe to game updates; returns the game. */
export function useGame(): Game {
  const game = useContext(GameCtx);
  const [, set] = useState(0);
  useEffect(() => game.subscribe(() => set((v) => v + 1)), [game]);
  return game;
}

export function Icon({ name, size, title }: { name: IconName; size?: 'sm' | 'lg'; title?: string }) {
  return <img class={`px ${size ?? ''}`} src={iconUrl(name)} alt={title ?? name} title={title} draggable={false} />;
}

export function Portrait({ id, mood, size, bitGen }: { id: AdvisorId; mood?: Mood; size?: number; bitGen?: number }) {
  const game = useContext(GameCtx);
  const gen = bitGen ?? (game?.state ? Math.min(3, game.state.models.length) : 0);
  return <img class="portrait" src={portraitUrl(id, mood ?? 'neutral', gen)} style={size ? { width: `${size}px`, height: `${size}px` } : undefined} alt={id} draggable={false} />;
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
