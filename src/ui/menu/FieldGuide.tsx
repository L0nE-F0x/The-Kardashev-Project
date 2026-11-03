import { useState } from 'preact/hooks';
import { Icon, useGame } from '../components';
import { GUIDE, GUIDE_CATEGORIES, type GuideCategory } from '../../content/fieldGuide';
import { guideUnlocked, isGuideSeen, markGuideSeen } from '../../save/guide';

/** Two-pane Field Guide: entries by category on the left, the article on the right. */
export function FieldGuideBody() {
  const game = useGame();
  const unlocked = guideUnlocked();
  for (const g of GUIDE) if (g.unlock === 'start') unlocked.add(g.id);
  const first = GUIDE.find((g) => unlocked.has(g.id))?.id ?? GUIDE[0].id;
  const [sel, setSel] = useState(first);
  const entry = GUIDE.find((g) => g.id === sel)!;
  const open = unlocked.has(entry.id);
  if (open && !isGuideSeen(entry.id)) {
    markGuideSeen(entry.id);
    queueMicrotask(() => game.notify());
  }
  return (
    <div class="guide">
      <nav class="guide-list" aria-label="Field Guide entries">
        {(Object.keys(GUIDE_CATEGORIES) as GuideCategory[]).map((cat) => (
          <div key={cat}>
            <h4>{GUIDE_CATEGORIES[cat]}</h4>
            {GUIDE.filter((g) => g.cat === cat).map((g) => {
              const has = unlocked.has(g.id);
              return (
                <button key={g.id} class={`btn small guide-item ${sel === g.id ? 'active' : ''} ${has ? '' : 'locked'}`} onClick={() => setSel(g.id)}>
                  {has ? <Icon name={g.icon} size="sm" /> : <span class="lock">?</span>}
                  <span class="grow">{has ? g.title : '???'}</span>
                  {has && !isGuideSeen(g.id) && <span class="dot" />}
                </button>
              );
            })}
          </div>
        ))}
        <p class="small muted">
          {unlocked.size}/{GUIDE.length} discovered
        </p>
        {(game.state?.act ?? 1) >= 2 && game.mode !== 'title' && (
          <button class="btn small" onClick={() => game.replayBriefings()} data-tip="Show the advisors’ Act II briefings again as their systems come up.">
            Replay Act II briefings
          </button>
        )}
      </nav>
      <article class="guide-entry">
        {open ? (
          <>
            <h2>
              <Icon name={entry.icon} size="lg" /> {entry.title}
            </h2>
            {entry.body.split(/\n\s*\n/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <div class="ingame frame">
              <span class="label">In the game</span>
              <p>{entry.game}</p>
            </div>
          </>
        ) : (
          <>
            <h2>???</h2>
            <p class="muted">You haven’t run into this yet. Keep building — it unlocks when it first matters.</p>
          </>
        )}
      </article>
    </div>
  );
}
