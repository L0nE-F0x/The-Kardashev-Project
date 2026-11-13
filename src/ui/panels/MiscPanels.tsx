import { useState } from 'preact/hooks';
import { Icon, Panel, Portrait, useGame } from '../components';
import { OBJECTIVES, actObjectives, type ObjectiveDef } from '../../content/objectives';
import { ObjectiveBar } from '../Objectives';
import { Tile, Tiles } from '../kit';
import type { AdvisorId, GameState } from '../../sim/types';

/** A numeric goal's bar, while it's open. */
function GoalProgress({ o, s }: { o: ObjectiveDef; s: GameState }) {
  const p = o.progress?.(s);
  return p ? <ObjectiveBar p={p} /> : null;
}
import { PHASE_NAMES } from '../../sim/actions';
import { CHARTER_PHASES } from '../../content/charter';
import { dateOf, fmtDate } from '../../sim/core';
import { rich } from '../emoji';

export function NewsPanel() {
  const game = useGame();
  const [tab, setTab] = useState<'news' | 'messages'>(game.missedMessages ? 'messages' : 'news');
  if (tab === 'messages') game.markMessagesSeen();
  const missed = game.missedMessages;
  return (
    <Panel
      title="News"
      icon="news"
      class="wide"
      onClose={() => game.openPanel(null)}
      extra={
        <div class="seg">
          <button class={`btn small ${tab === 'news' ? 'active' : ''}`} onClick={() => setTab('news')}>
            News
          </button>
          <button class={`btn small ${tab === 'messages' ? 'active' : ''}`} onClick={() => setTab('messages')}>
            Messages{missed ? ` (${missed})` : ''}
          </button>
        </div>
      }
    >
      {tab === 'messages' ? <Messages /> : <NewsList />}
    </Panel>
  );
}

/** Advisors' pop-ups this session, newest first — the ones that flew by while fast-forwarding are marked. */
function Messages() {
  const game = useGame();
  const list = [...game.messages].reverse();
  if (!list.length) return <div class="small muted">No messages yet this session. Advisors’ pop-ups land here, so nothing gets lost while you fast-forward.</div>;
  return (
    <>
      {list.map((m) => (
        <div key={m.id} class={`msg row ${m.kind}`}>
          {m.advisor ? <Portrait id={m.advisor as AdvisorId} size={28} /> : <span class="msgdot" />}
          <span class="muted msgday">{fmtDate(m.day)}</span>
          <span class="grow">{rich(m.text)}</span>
          {m.fast && <span class="label cyan" data-tip="Arrived while the clock was running fast">fast</span>}
        </div>
      ))}
    </>
  );
}

function NewsList() {
  const game = useGame();
  const s = game.state!;
  return (
    <>
      {s.news.length === 0 && <div class="small muted">Quiet so far.</div>}
      {s.news.map((n, i) => (
        <div key={i} class="row small" style={{ alignItems: 'flex-start', marginBottom: '4px' }}>
          <span class="muted" style={{ minWidth: '90px' }}>
            {fmtDate(n.day)}
          </span>
          <span class={n.kind === 'good' ? 'good' : n.kind === 'bad' ? 'warn' : ''}>{rich(n.text)}</span>
        </div>
      ))}
    </>
  );
}

/**
 * The Goals panels' first row: how many of the listed goals are done, how many are open to work on, the act's
 * checklist goals (the ones marked "goal"), and where the act stands (its phase or stage; Act I: its side goals).
 * `list` = the goals the panel lists under it.
 */
function GoalTiles({ list, stage }: { list: ObjectiveDef[]; stage?: { label: string; n: number; of: number; name: string } }) {
  const game = useGame();
  const s = game.state!;
  const isDone = (o: ObjectiveDef) => (o.live ? o.done(s) : s.objectives.done.includes(o.id));
  const done = list.filter(isDone).length;
  const open = list.filter((o) => !isDone(o) && (o.after ?? []).every((a) => s.objectives.done.includes(a)));
  const checklist = list.filter((o) => o.goal);
  const checked = checklist.filter(isDone).length;
  const side = OBJECTIVES.filter((o) => o.side && (o.act ?? 1) === (s.act ?? 1));
  const sideDone = side.filter((o) => s.objectives.done.includes(o.id)).length;
  return (
    <Tiles>
      <Tile
        label="Done"
        icon="check"
        tone="good"
        value={
          <>
            {done}
            <small>of {list.length}</small>
          </>
        }
        sub={stage ? `in the ${stage.label.toLowerCase()}s opened so far` : 'the act’s main goals'}
        tip={'Goals done\nThe goals on this list that are ticked off, or that hold right now.'}
      />
      <Tile
        label="Open now"
        icon="play"
        tone="cyan"
        value={open.length}
        sub={open.length ? open[0].title : done === list.length ? 'everything listed is done' : 'waiting on earlier goals'}
        tip={'Open now\nGoals you can work on today: every step before them is done.'}
      />
      {checklist.length > 0 && (
        <Tile
          label="Checklist"
          icon="goals"
          tone="gold"
          value={
            <>
              {checked}
              <small>of {checklist.length}</small>
            </>
          }
          sub="marked “goal” below"
          tip={'The act’s checklist\nThe goals marked “goal” are the ones that move the act on.'}
        />
      )}
      {stage ? (
        <Tile
          label={stage.label}
          icon="plan"
          value={
            <>
              {stage.n}
              <small>of {stage.of}</small>
            </>
          }
          sub={stage.name}
          tip={`${stage.label} ${stage.n} of ${stage.of}\n${stage.name}.${stage.n < stage.of ? ` More goals appear as each ${stage.label.toLowerCase()} opens.` : ''}`}
        />
      ) : side.length > 0 ? (
        <Tile
          label="Side goals"
          icon="research"
          tone="violet"
          value={
            <>
              {sideDone}
              <small>of {side.length}</small>
            </>
          }
          sub="optional, with rewards"
          tip={'Side goals\nOptional goals for this act. Each one pays a small reward.'}
        />
      ) : null}
    </Tiles>
  );
}

export function GoalsPanel() {
  const game = useGame();
  const s = game.state!;
  if ((s.act ?? 1) >= 5 && s.system) return <Act5Goals />;
  if ((s.act ?? 1) >= 4 && s.planet) return <Act4Goals />;
  if ((s.act ?? 1) >= 3) return <Act3Goals />;
  if ((s.act ?? 1) >= 2) return <Act2Goals />;
  const list = OBJECTIVES.filter((o) => (o.act ?? 1) === 1 && !o.side);
  return (
    <Panel title="Act I · The Garage" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <GoalTiles list={list} />
      <p class="small muted" style={{ marginTop: 0 }}>
        Grow from a garage startup into a real AI company: your own model, your own compute, safely — then raise a Series A. Act II makes you a hyperscaler and Act III the steward of the Kardashev Project; Act IV runs the planet, and Act V climbs to Type I.
      </p>
      {list.map((o) => {
        const done = o.live ? o.done(s) : s.objectives.done.includes(o.id);
        const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
        return (
          <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
            <Portrait id={o.advisor} size={32} />
            <div class="grow">
              <div class="t">
                {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
                {!done && unlocked && !o.live && <PinButton id={o.id} />}
              </div>
              <div class="h">{rich(o.hint)}</div>
                    {!done && <GoalProgress o={o} s={s} />}
            </div>
          </div>
        );
      })}
      <SideGoals />
    </Panel>
  );
}

/** Optional goals for the act (Act I has five for the long wait), with their rewards. */
function SideGoals() {
  const game = useGame();
  const s = game.state!;
  const list = OBJECTIVES.filter((o) => o.side && (o.act ?? 1) === (s.act ?? 1));
  if (!list.length) return null;
  return (
    <div class="section">
      <h4>Side goals · optional</h4>
      {list.map((o) => {
        const done = s.objectives.done.includes(o.id);
        const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
        return (
          <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
            <Portrait id={o.advisor} size={32} />
            <div class="grow">
              <div class="t">
                {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.reward && <span class="label cyan">· {o.reward.text}</span>}
                {!done && unlocked && <PinButton id={o.id} />}
              </div>
              <div class="h">{rich(o.hint)}</div>
              {!done && <GoalProgress o={o} s={s} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pin a goal to the top of the goal card (one at a time). */
export function PinButton({ id }: { id: string }) {
  const game = useGame();
  const s = game.state!;
  const on = s.meta.pinnedGoal === id;
  return (
    <button
      class={`btn ghost small pin ${on ? 'on' : ''}`}
      onClick={() => {
        s.meta.pinnedGoal = on ? undefined : id;
        game.notify();
      }}
      data-tip={on ? 'Unpin from the goal card' : 'Pin to the top of the goal card'}
      aria-label={on ? 'Unpin goal' : 'Pin goal'}
      aria-pressed={on}
    >
      <Icon name="pin" size="sm" />
    </button>
  );
}

function Act2Goals() {
  const game = useGame();
  const s = game.state!;
  const list = actObjectives(s);
  const phases = [1, 2, 3, 4].filter((p) => p <= Math.max(1, Math.min(4, s.phase)));
  return (
    <Panel title="Act II · The Scale-Up" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <GoalTiles list={list.filter((o) => phases.includes(o.phase ?? 1))} stage={{ label: 'Phase', n: Math.max(1, Math.min(4, s.phase)), of: 4, name: PHASE_NAMES[Math.max(1, Math.min(4, s.phase))] }} />
      <p class="small muted" style={{ marginTop: 0 }}>
        From a Series-A startup to a hyperscaler. Any four of the six IPO goals in phase 3 start The Crunch; by mid-2034 it starts anyway.
      </p>
      {phases.map((p) => (
        <div key={p} class="section">
          <h4>
            Phase {p} · {PHASE_NAMES[p]}
          </h4>
          {list
            .filter((o) => (o.phase ?? 1) === p)
            .map((o) => {
              const done = o.live ? o.done(s) : s.objectives.done.includes(o.id);
              const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
              return (
                <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
                  <Portrait id={o.advisor} size={32} />
                  <div class="grow">
                    <div class="t">
                      {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
                {!done && unlocked && !o.live && <PinButton id={o.id} />}
                    </div>
                    <div class="h">{rich(o.hint)}</div>
                    {!done && <GoalProgress o={o} s={s} />}
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


const STAGE4 = ['The Mandate', 'The Supergrid', 'The Fusion Age', 'The High Frontier', 'The Heat Wall'];
function Act4Goals() {
  const game = useGame();
  const s = game.state!;
  const st = Math.min(4, s.planet?.stage ?? 0);
  const list = actObjectives(s);
  return (
    <Panel title="Act IV · Planetary" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <GoalTiles list={list.filter((o) => (o.phase ?? 0) <= st)} stage={{ label: 'Stage', n: st, of: 4, name: STAGE4[st] }} />
      <p class="small muted" style={{ marginTop: 0 }}>
        {s.flags.act4Complete
          ? 'The Heat Wall is behind you: the climb to Type I goes on in Act V.'
          : `Planetary operator. Five-year plans move the years; Planet → Overview shows what opens the next one. When the planetary checklist holds, the Heat Wall begins.`}
      </p>
      {[0, 1, 2, 3, 4].filter((p) => p <= st).map((p) => (
        <div key={p} class="section">
          <h4>
            Stage {p} · {STAGE4[p]}
          </h4>
          {list
            .filter((o) => (o.phase ?? 0) === p)
            .map((o) => {
              const done = o.live ? o.done(s) : s.objectives.done.includes(o.id);
              const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
              return (
                <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
                  <Portrait id={o.advisor} size={32} />
                  <div class="grow">
                    <div class="t">
                      {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
                {!done && unlocked && !o.live && <PinButton id={o.id} />}
                    </div>
                    <div class="h">{rich(o.hint)}</div>
                    {!done && <GoalProgress o={o} s={s} />}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </Panel>
  );
}

const STAGE5 = ['The Thermal Line', 'The Foundries', 'The Swarm', 'The Last Climb', 'Solar Maximum'];
function Act5Goals() {
  const game = useGame();
  const s = game.state!;
  const st = Math.min(4, s.system?.stage ?? 0);
  const list = actObjectives(s);
  return (
    <Panel title="Act V · Type I" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <GoalTiles list={list.filter((o) => (o.phase ?? 0) <= st)} stage={{ label: 'Stage', n: st, of: 4, name: STAGE5[st] }} />
      <p class="small muted" style={{ marginTop: 0 }}>
        {s.system?.typeI
          ? `Type I, ${dateOf(s.system.typeI).getUTCFullYear()}: Kardashev 1.0000. The climb goes on toward Type II (K 2.00).`
          : `Civilisation steward. When the Type I checklist holds (or in 2105), Solar Maximum begins; after it, the last climb runs until Kardashev reaches 1.0000 — your score is the year.`}
      </p>
      {[0, 1, 2, 3, 4].filter((p) => p <= st).map((p) => (
        <div key={p} class="section">
          <h4>
            Stage {p} · {STAGE5[p]}
          </h4>
          {list
            .filter((o) => (o.phase ?? 0) === p)
            .map((o) => {
              const done = o.live ? o.done(s) : s.objectives.done.includes(o.id);
              const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
              return (
                <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
                  <Portrait id={o.advisor} size={32} />
                  <div class="grow">
                    <div class="t">
                      {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
                {!done && unlocked && !o.live && <PinButton id={o.id} />}
                    </div>
                    <div class="h">{rich(o.hint)}</div>
                    {!done && <GoalProgress o={o} s={s} />}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
      {s.system?.typeI && (
        <button class="btn" onClick={() => (game.openPanel(null), game.replayEnding())}>
          Watch the ending again
        </button>
      )}
    </Panel>
  );
}

function Act3Goals() {
  const game = useGame();
  const s = game.state!;
  const cp = Math.min(5, s.charter?.phase ?? 1);
  const list = actObjectives(s);
  const phases = [1, 2, 3, 4, 5].filter((p) => p <= cp);
  return (
    <Panel title="Act III · The Charter" icon="goals" class="wide" onClose={() => game.openPanel(null)}>
      <GoalTiles list={list.filter((o) => phases.includes(o.phase ?? 1))} stage={{ label: 'Phase', n: cp, of: 5, name: CHARTER_PHASES[cp] }} />
      <p class="small muted" style={{ marginTop: 0 }}>
        Steward of the Kardashev Project. The Charter Mandate in phase 3 starts The Threshold; by 1 January 2044 it starts anyway. Then the Council votes on renewal.
      </p>
      {phases.map((p) => (
        <div key={p} class="section">
          <h4>
            Phase {p} · {CHARTER_PHASES[p]}
          </h4>
          {list
            .filter((o) => (o.phase ?? 1) === p)
            .map((o) => {
              const done = o.live ? o.done(s) : s.objectives.done.includes(o.id);
              const unlocked = (o.after ?? []).every((a) => s.objectives.done.includes(a));
              return (
                <div class="objective" key={o.id} style={{ opacity: unlocked || done ? 1 : 0.45 }}>
                  <Portrait id={o.advisor} size={32} />
                  <div class="grow">
                    <div class="t">
                      {done ? <Icon name="check" size="sm" /> : null} {o.title} {o.goal && <span class="label gold">· goal</span>}
                {!done && unlocked && !o.live && <PinButton id={o.id} />}
                    </div>
                    <div class="h">{rich(o.hint)}</div>
                    {!done && <GoalProgress o={o} s={s} />}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
      {cp < 5 && <div class="small muted">More goals appear as each phase opens. The whole Mandate is on Charter → Overview.</div>}
    </Panel>
  );
}
