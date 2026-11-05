import { Bar, Icon, Panel, useGame } from '../components';
import { TECHS, TECH_BY_ID, TECH_CATEGORIES, type TechCategory } from '../../content/techs';
import { fmtDays } from '../../sim/core';
import { researchable, techAvailable } from '../../sim/actions';

const ACT_NAMES = ['', 'I', 'II', 'III', 'IV', 'V'];

export function ResearchPanel() {
  const game = useGame();
  const s = game.state!;
  const cur = s.research.current ? TECH_BY_ID[s.research.current] : null;
  const rp = s.stats.rpPerDay;
  // what's open to you so far (later acts' techs show, locked, as a preview)
  const open = TECHS.filter((t) => s.research.done.includes(t.id) || techAvailable(s, t.id)).length;
  const nothingLeft = !cur && researchable(s).length === 0;
  return (
    <Panel title="Research" icon="research" class="wide research" onClose={() => game.openPanel(null)}>
      <div class="row between wrap small" style={{ marginBottom: '8px' }}>
        <span>
          <b class="cyan">{rp.toFixed(1)}</b> research/day · {s.research.done.length}/{open} done
          {s.research.pool > 0.5 && <span class="muted"> · {Math.floor(s.research.pool)} banked</span>}
        </span>
        {cur ? (
          <span>
            Researching <b>{cur.name}</b> — {Math.floor(s.research.progress)}/{cur.cost} · ~{fmtDays((cur.cost - s.research.progress) / Math.max(0.01, rp))}
          </span>
        ) : nothingLeft ? (
          <span class="good">Everything open to you is researched. Until more opens up, move the Research share to Training (Compute).</span>
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
            {TECHS.filter((t) => t.cat === cat && (t.act ?? 1) <= Math.max(2, s.act ?? 1)).map((t) => {
              const done = s.research.done.includes(t.id);
              const notYet = !done && !techAvailable(s, t.id);
              const locked = notYet || (t.requires ?? []).some((r) => !s.research.done.includes(r));
              const current = s.research.current === t.id;
              return (
                <button
                  key={t.id}
                  class={`btn tech ${done ? 'done' : ''} ${current ? 'current' : ''} ${locked ? 'locked' : ''}`}
                  data-tut={t.id === 'moe' ? 'tech-first' : undefined}
                  disabled={done || locked}
                  onClick={() => game.setResearch(t.id)}
                  data-tip={`${t.blurb}${notYet ? `\nOpens ${(t.act ?? 1) > (s.act ?? 1) ? `in Act ${ACT_NAMES[t.act ?? 1]}` : 'later in this act'}.` : locked ? `\nRequires: ${(t.requires ?? []).map((r) => TECH_BY_ID[r].name).join(', ')}` : ''}`}
                >
                  <span class="t">
                    {done ? <Icon name="check" size="sm" /> : null} {t.name}
                    {notYet && <span class="label"> · {(t.act ?? 1) > (s.act ?? 1) ? `Act ${ACT_NAMES[t.act ?? 1]}` : 'later'}</span>}
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
