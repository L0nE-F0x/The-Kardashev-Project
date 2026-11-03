import { Icon, Panel, Portrait, useGame } from '../components';
import { OBJECTIVES, actObjectives } from '../../content/objectives';
import { PHASE_NAMES } from '../../sim/actions';
import { fmtDate } from '../../sim/core';

export function NewsPanel() {
  const game = useGame();
  const s = game.state!;
  return (
    <Panel title="News" icon="news" class="wide" onClose={() => game.openPanel(null)}>
      {s.news.length === 0 && <div class="small muted">Quiet so far.</div>}
      {s.news.map((n, i) => (
        <div key={i} class="row small" style={{ alignItems: 'flex-start', marginBottom: '4px' }}>
          <span class="muted" style={{ minWidth: '90px' }}>
            {fmtDate(n.day)}
          </span>
          <span class={n.kind === 'good' ? 'good' : n.kind === 'bad' ? 'warn' : ''}>{n.text}</span>
        </div>
      ))}
    </Panel>
  );
}

export function GoalsPanel() {
  const game = useGame();
  const s = game.state!;
  if ((s.act ?? 1) >= 2) return <Act2Goals />;
  return (
    <Panel title="Act I · The Garage" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <p class="small muted" style={{ marginTop: 0 }}>
        Grow from a garage startup into a real AI company: your own model, your own compute, safely — then raise a Series A. Acts II–V (hyperscaler → steward of the Kardashev Project → Type I) are on the roadmap.
      </p>
      {OBJECTIVES.filter((o) => (o.act ?? 1) === 1).map((o) => {
        const done = s.objectives.done.includes(o.id);
        const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
        return (
          <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
            <Portrait id={o.advisor} size={32} />
            <div class="grow">
              <div class="t">
                {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
              </div>
              <div class="h">{o.hint}</div>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function Act2Goals() {
  const game = useGame();
  const s = game.state!;
  const list = actObjectives(s);
  const phases = [1, 2, 3, 4].filter((p) => p <= Math.max(1, Math.min(4, s.phase)));
  return (
    <Panel title="Act II · The Scale-Up" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <p class="small muted" style={{ marginTop: 0 }}>
        From a Series-A startup to a hyperscaler. Phase {Math.min(4, s.phase)} of 4: {PHASE_NAMES[Math.min(4, s.phase)]}. The IPO checklist in phase 3 starts The Crunch; by mid-2034 it starts anyway.
      </p>
      {phases.map((p) => (
        <div key={p} class="section">
          <h4>
            Phase {p} · {PHASE_NAMES[p]}
          </h4>
          {list
            .filter((o) => (o.phase ?? 1) === p)
            .map((o) => {
              const done = s.objectives.done.includes(o.id);
              const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
              return (
                <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
                  <Portrait id={o.advisor} size={32} />
                  <div class="grow">
                    <div class="t">
                      {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
                    </div>
                    <div class="h">{o.hint}</div>
                  </div>
                </div>
              );
            })}
        </div>
      ))}
      {s.phase < 4 && <div class="small muted">More goals appear as each phase opens.</div>}
    </Panel>
  );
}
