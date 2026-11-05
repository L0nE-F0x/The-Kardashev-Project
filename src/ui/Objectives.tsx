import { useState } from 'preact/hooks';
import { Bar, Icon, Portrait, useGame } from './components';
import { visibleObjectives, type ObjectiveProgress } from '../content/objectives';

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
  if (!list.length) return null;
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
    </div>
  );
}
