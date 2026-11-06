import { useState } from 'preact/hooks';
import { Bar, Icon, Portrait, useGame } from './components';
import { visibleObjectives, type ObjectiveProgress } from '../content/objectives';
import { upcoming, type UpcomingItem } from '../sim/upcoming';
import { fmtDays } from '../sim/core';
import { FAC_ICON } from './Inspector';
import type { FacilityType } from '../sim/types';
import type { IconName } from './icons';
import type { Game } from '../game/game';

/** How far along a numeric goal is: a bar and the numbers (the hint moves to the Goals panel). */
export function ObjectiveBar({ p }: { p: ObjectiveProgress }) {
  return (
    <div class="oprog">
      <Bar value={p.frac} kind="gold" />
      <span class="small muted">{p.text}</span>
    </div>
  );
}

/** The floating "what next" tracker: the first few unlocked, unfinished goals. */
export function Objectives() {
  const game = useGame();
  const [open, setOpen] = useState(true);
  const s = game.state!;
  if (!game.settings.goalTracker) return null;
  // on phones the inspector and panels share the screen with this card — get out of the way
  if (window.innerWidth <= 820 && (game.selection || game.panel)) return null;
  const list = visibleObjectives(s).slice(0, 3);
  const soon = upcoming(s).slice(0, 4);
  if (!list.length && !soon.length) return null;
  return (
    <div class="objectives frame interactive" data-tut="objectives">
      <div class="row between">
        <span class="label">
          <Icon name="goals" size="sm" /> Next up
        </span>
        <button class="btn ghost small" onClick={() => setOpen(!open)} aria-label="Toggle goals">
          {open ? '–' : '+'}
        </button>
      </div>
      {open &&
        list.map((o) => {
          const p = o.progress?.(s);
          return (
            <div class="objective" key={o.id} data-tip={p ? o.hint : undefined}>
              <Portrait id={o.advisor} size={32} />
              <div class="grow">
                <div class="t">{o.title}</div>
                {p ? <ObjectiveBar p={p} /> : <div class="h">{o.hint}</div>}
              </div>
            </div>
          );
        })}
      {open && <ComingUp game={game} items={soon} />}
    </div>
  );
}

export function upIcon(icon: string): IconName {
  return (icon.startsWith('fac:') ? FAC_ICON[icon.slice(4) as FacilityType] : icon) as IconName;
}

/** What we're waiting for, soonest first, with skip-ahead buttons (Acts I–III). */
function ComingUp({ game, items }: { game: Game; items: UpcomingItem[] }) {
  const s = game.state!;
  if (!items.length) return null;
  const canSkip = s.meta.tutorialStep < 0 && !game.skip && !game.blocked;
  const go = (it: UpcomingItem) => game.skipTo(it.day, it.text);
  return (
    <div class="comingup" data-tut="comingup">
      <div class="row between">
        <span class="label">Coming up</span>
        {canSkip && (
          <button class="btn small primary skipnext" onClick={() => go(items[0])} data-tip={`Run the clock flat out until: ${items[0].text}.\nAny event card stops it, and so does any speed button.`}>
            ⏭ Skip to next
          </button>
        )}
      </div>
      {items.map((it) => (
        <div class="up row" key={it.key}>
          <Icon name={upIcon(it.icon)} size="sm" />
          <span class="grow ut">{it.text}</span>
          <span class="uw">{fmtDays(it.day - s.day)}</span>
          {canSkip && (
            <button class="btn ghost small upskip" onClick={() => go(it)} data-tip={`Skip ahead to this (${fmtDays(it.day - s.day)}). A card stops it sooner.`} aria-label={`Skip to: ${it.text}`}>
              ⏭
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** While skipping ahead: where to and how far, with a Stop button. */
export function SkipBar() {
  const game = useGame();
  const sk = game.skip;
  const s = game.state;
  if (!sk || !s) return null;
  return (
    <div class="skipbar frame interactive" role="status">
      <span class="skipicon">⏭</span>
      <span class="grow">
        <span class="label">Skipping ahead</span>
        <span class="st">
          {sk.label} · {fmtDays(Math.max(0, sk.until - s.day))} to go
        </span>
      </span>
      <button class="btn small" onClick={() => game.stopSkip()}>
        Stop
      </button>
    </div>
  );
}
