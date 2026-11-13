import { Bar, Icon, Panel, useGame } from '../components';
import { Tile, Tiles } from '../kit';
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
      <Tiles class="res-top">
        <Tile label="Research" icon="research" tone="cyan" value={<>{rp.toFixed(1)}<small>a day</small></>} sub={s.research.pool > 0.5 ? `${Math.floor(s.research.pool)} points banked` : 'from labs, talent and compute'} />
        <Tile label="Done" icon="check" tone="good" value={<>{s.research.done.length}<small>of {open}</small></>} sub="open to you so far">
          <div class="bar" style={{ marginTop: '6px' }}>
            <i style={{ width: `${(s.research.done.length / Math.max(1, open)) * 100}%` }} />
          </div>
        </Tile>
        <Tile wide label={cur ? 'Researching now' : 'Lab'} icon="lab" tone={cur ? 'violet' : nothingLeft ? 'good' : 'warn'} value={cur ? cur.name : nothingLeft ? 'All caught up' : 'Pick a project'} sub={cur ? `${Math.floor(s.research.progress)} / ${cur.cost} points · about ${fmtDays((cur.cost - s.research.progress) / Math.max(0.01, rp))} left` : nothingLeft ? 'Until more opens up, move the Research share to Training (Compute).' : 'The lab is idle: at most 80 points can be banked.'}>
          {cur && (
            <div class="bar violet" style={{ marginTop: '6px' }}>
              <i style={{ width: `${(s.research.progress / cur.cost) * 100}%` }} />
            </div>
          )}
        </Tile>
      </Tiles>
      <div class="techgrid">
        {(Object.keys(TECH_CATEGORIES) as TechCategory[]).map((cat) => {
          const list = TECHS.filter((t) => t.cat === cat && (t.act ?? 1) <= Math.max(2, s.act ?? 1));
          return (
            <div class="techcol" key={cat} data-cat={cat}>
              <h4>
                <Icon name={TECH_CATEGORIES[cat].icon} size="sm" /> <span class="grow">{TECH_CATEGORIES[cat].name}</span>
                <span class="n">
                  {list.filter((t) => s.research.done.includes(t.id)).length}/{list.length}
                </span>
              </h4>
              {list.map((t) => {
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
                    data-tip={`${t.name}\n${t.blurb}${notYet ? `\nOpens ${(t.act ?? 1) > (s.act ?? 1) ? `in Act ${ACT_NAMES[t.act ?? 1]}` : 'later in this act'}.` : locked ? `\nRequires: ${(t.requires ?? []).map((r) => TECH_BY_ID[r].name).join(', ')}` : ''}`}
                  >
                    <span class="t">
                      {done ? <Icon name="check" size="sm" /> : locked ? <Icon name="lock" size="sm" /> : null} {t.name}
                    </span>
                    {!done && <span class="e">{t.effect}</span>}
                    {!done && (
                      <span class="f">
                        <span class="cost">{t.cost} RP</span>
                        {notYet && <span class="label">{(t.act ?? 1) > (s.act ?? 1) ? `Act ${ACT_NAMES[t.act ?? 1]}` : 'later'}</span>}
                        {current && <span class="label now">in the lab</span>}
                      </span>
                    )}
                    {current && <Bar value={s.research.progress / t.cost} kind="violet" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
