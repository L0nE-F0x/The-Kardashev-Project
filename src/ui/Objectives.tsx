import { useState } from 'preact/hooks';
import { Icon, Portrait, useGame } from './components';
import { visibleObjectives } from '../content/objectives';

/** The floating "what next" tracker: the first few unlocked, unfinished goals. */
export function Objectives() {
  const game = useGame();
  const [open, setOpen] = useState(true);
  const s = game.state!;
  if (!game.settings.tutorialHints) return null;
  // on phones the inspector and panels share the screen with this card — get out of the way
  if (window.innerWidth <= 820 && (game.selection || game.panel)) return null;
  const list = visibleObjectives(s).slice(0, 3);
  if (!list.length) return null;
  return (
    <div class="objectives frame interactive">
      <div class="row between">
        <span class="label">
          <Icon name="goals" size="sm" /> Next up
        </span>
        <button class="btn ghost small" onClick={() => setOpen(!open)} aria-label="Toggle goals">
          {open ? '–' : '+'}
        </button>
      </div>
      {open &&
        list.map((o) => (
          <div class="objective" key={o.id}>
            <Portrait id={o.advisor} size={32} />
            <div>
              <div class="t">{o.title}</div>
              <div class="h">{o.hint}</div>
            </div>
          </div>
        ))}
    </div>
  );
}
