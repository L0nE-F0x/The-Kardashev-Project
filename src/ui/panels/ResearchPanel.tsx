import { Bar, Icon, Panel, useGame } from '../components';
import { TECHS, TECH_BY_ID, TECH_CATEGORIES, type TechCategory } from '../../content/techs';
import { fmtDays } from '../../sim/core';

export function ResearchPanel() {
  const game = useGame();
  const s = game.state!;
  const cur = s.research.current ? TECH_BY_ID[s.research.current] : null;
  const rp = s.stats.rpPerDay;
  return (
    <Panel title="Research" icon="research" class="wide research" onClose={() => game.openPanel(null)}>
      <div class="row between wrap small" style={{ marginBottom: '8px' }}>
        <span>
          <b class="cyan">{rp.toFixed(1)}</b> research/day · {s.research.done.length}/{TECHS.length} done
          {s.research.pool > 0.5 && <span class="muted"> · {Math.floor(s.research.pool)} banked</span>}
        </span>
        {cur ? (
          <span>
            Researching <b>{cur.name}</b> — {Math.floor(s.research.progress)}/{cur.cost} · ~{fmtDays((cur.cost - s.research.progress) / Math.max(0.01, rp))}
          </span>
        ) : (
          <span class="warn">Pick a project — at most 80 RP can be banked.</span>
        )}
      </div>
      {cur && <Bar value={s.research.progress / cur.cost} kind="violet" />}
      <div class="techgrid section">
        {(Object.keys(TECH_CATEGORIES) as TechCategory[]).map((cat) => (
          <div class="techcol" key={cat}>
            <h4>
              {TECH_CATEGORIES[cat].icon} {TECH_CATEGORIES[cat].name}
            </h4>
            {TECHS.filter((t) => t.cat === cat).map((t) => {
              const done = s.research.done.includes(t.id);
              const locked = (t.requires ?? []).some((r) => !s.research.done.includes(r));
              const current = s.research.current === t.id;
              return (
                <button
                  key={t.id}
                  class={`btn tech ${done ? 'done' : ''} ${current ? 'current' : ''} ${locked ? 'locked' : ''}`}
                  data-tut={t.id === 'moe' ? 'tech-first' : undefined}
                  disabled={done || locked}
                  onClick={() => game.setResearch(t.id)}
                  data-tip={`${t.blurb}${locked ? `\nRequires: ${(t.requires ?? []).map((r) => TECH_BY_ID[r].name).join(', ')}` : ''}`}
                >
                  <span class="t">
                    {done ? <Icon name="check" size="sm" /> : null} {t.name}
                  </span>
                  <span class="e">{t.effect}</span>
                  {!done && <span class="e">{t.cost} RP</span>}
                  {current && <Bar value={s.research.progress / t.cost} kind="violet" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}
