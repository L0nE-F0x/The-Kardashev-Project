import { Icon, Panel, Portrait, useGame } from '../components';
import { OBJECTIVES } from '../../content/objectives';
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
  return (
    <Panel title="Act I · The Garage" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <p class="small muted" style={{ marginTop: 0 }}>
        Grow from a garage startup into a real AI company: your own model, your own compute, safely — then raise a Series A. Acts II–V (hyperscaler → steward of the Kardashev Project → Type I) are on the roadmap.
      </p>
      {OBJECTIVES.map((o) => {
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
