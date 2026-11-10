import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Icon, useGame } from '../components';
import { ACT_GOALS, ACT_NAMES, ACT_RHYTHM, LOOP, PANEL_GUIDE, howToTopics, type HowToTopic } from '../../content/howToPlay';
import { KEYS } from './SettingsScreen';
import { DockIcon } from '../DockIcon';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** **bold** and [Key] inside a line of handbook text. */
function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]{1,8})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <b key={m.index}>{m[1]}</b> : <kbd key={m.index}>{m[2]}</kbd>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs, "- " bullets, "1. " steps and "> " tips. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- ')))
          return (
            <ul key={i} class="ht-list">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => /^\d+\. /.test(l)))
          return (
            <ol key={i} class="ht-steps">
              {lines.map((l, j) => (
                <li key={j}>
                  <span class="n">{j + 1}</span>
                  <span>{inline(l.replace(/^\d+\. /, ''))}</span>
                </li>
              ))}
            </ol>
          );
        if (block.startsWith('> '))
          return (
            <p key={i} class="ht-tip">
              <Icon name="check" size="sm" /> <span>{inline(block.slice(2))}</span>
            </p>
          );
        // a lead-in line followed by a list
        if (lines.length > 1 && lines.slice(1).every((l) => l.startsWith('- ')))
          return (
            <div key={i}>
              <p>{inline(lines[0])}</p>
              <ul class="ht-list">
                {lines.slice(1).map((l, j) => (
                  <li key={j}>{inline(l.slice(2))}</li>
                ))}
              </ul>
            </div>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </>
  );
}

function LoopDiagram() {
  return (
    <div class="ht-loop" aria-label="The core loop">
      {LOOP.map((n, i) => (
        <div class="ht-node" key={n.title} style={{ '--i': i }}>
          <Icon name={n.icon} size="lg" />
          <b>{n.title}</b>
          <span>{n.text}</span>
          <i class="ht-arrow" aria-hidden="true">
            {i === LOOP.length - 1 ? '↺' : '→'}
          </i>
        </div>
      ))}
      <div class="ht-side">
        <span>
          <Icon name="research" size="sm" /> Research makes every step cheaper and faster
        </span>
        <span>
          <Icon name="shield" size="sm" /> Safety keeps the models trustworthy
        </span>
      </div>
    </div>
  );
}

function Acts({ act }: { act: number }) {
  return (
    <div class="ht-acts">
      {ACT_NAMES.map((name, i) => (
        <div class={`ht-act ${i + 1 === act ? 'now' : ''} ${i + 1 < act ? 'done' : ''}`} key={name}>
          <span class="r">{ROMAN[i]}</span>
          <span class="grow">
            <b>{name}</b>
            <span class="small muted">{i + 1 <= act + 1 ? ACT_GOALS[i] : 'Unlocks as you play.'}</span>
          </span>
          {i + 1 === act && <span class="pill">You are here</span>}
        </div>
      ))}
    </div>
  );
}

function Rhythm({ act }: { act: number }) {
  const r = ACT_RHYTHM.find((x) => x.act === act) ?? ACT_RHYTHM[0];
  return (
    <div class="ht-rhythm">
      <span class="label">The shape of Act {ROMAN[r.act - 1]}</span>
      <div class="ht-beats">
        {r.beats.map(([when, what]) => (
          <div class="ht-beat" key={when}>
            <b>{when}</b>
            <span>{what}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SCREEN_PARTS: [string, string][] = [
  ['Top left', 'The clock: pause and four speeds, then your company and the date.'],
  ['Top bar', 'Cash (and its monthly trend), power served vs needed, compute, your best model, the safety margin. Later acts add the Charter treasury, warming and the Thermal Line.'],
  ['Top right', 'The Kardashev meter — the score of the whole game.'],
  ['Left', 'The dock: one button per panel. A red badge means something there is waiting for you.'],
  ['Next up', 'The goal card: the next few goals with progress bars (hover one for a hint), one optional side goal, and Coming up — what you’re waiting for, with ⏭ to skip ahead to it. Pin a goal to the top from the Goals panel (📌).'],
  ['Right', 'The inspector: whatever you clicked on the map — a site, a region, a ship.'],
  ['Bottom', 'The news ticker. Click it for the full feed; its Messages tab keeps every advisor pop-up, including the ones that flew by while you fast-forwarded.'],
];

function Screen() {
  return (
    <div class="ht-screen">
      {SCREEN_PARTS.map(([where, what]) => (
        <div class="ht-part" key={where}>
          <b>{where}</b>
          <span>{what}</span>
        </div>
      ))}
    </div>
  );
}

function Panels({ act }: { act: number }) {
  // the same icons as the dock buttons
  const classic = false;
  return (
    <div class="ht-panels">
      {PANEL_GUIDE.filter((p) => p.act <= act).map((p) => (
        <div class="ht-panel" key={p.name}>
          <span class="ht-ic">
            <DockIcon name={p.icon} classic={classic} />
          </span>
          <div class="grow">
            <div class="row between">
              <b>{p.name}</b>
              <kbd>{p.key}</kbd>
            </div>
            <span>{p.what}</span>
            <span class="when">
              <b>Open it:</b> {p.when.charAt(0).toLowerCase() + p.when.slice(1)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Keys() {
  return (
    <div class="ht-keys">
      {KEYS.map(([k, what]) => (
        <div key={k} class="row">
          <kbd>{k}</kbd>
          <span>{what}</span>
        </div>
      ))}
    </div>
  );
}

function Special({ t, act }: { t: HowToTopic; act: number }) {
  if (t.special === 'loop') return <LoopDiagram />;
  if (t.special === 'acts') return <Acts act={act} />;
  if (t.special === 'screen') return <Screen />;
  if (t.special === 'panels') return <Panels act={act} />;
  if (t.special === 'keys') return <Keys />;
  return null;
}

/** The handbook: topics on the left, the page on the right. Later acts' topics appear as you reach them. */
export function HowToPlayBody({ initial }: { initial?: string }) {
  const game = useGame();
  // in the menu: the act of the latest company
  const act = game.state?.act ?? game.slots()[0]?.act ?? 1;
  const topics = howToTopics(act);
  const [sel, setSel] = useState(initial && topics.some((t) => t.id === initial) ? initial : topics[0].id);
  const t = topics.find((x) => x.id === sel) ?? topics[0];
  const i = topics.indexOf(t);
  return (
    <div class="guide howto">
      <nav class="guide-list" aria-label="How to play topics">
        {topics.map((x) => (
          <button key={x.id} class={`btn small guide-item ${sel === x.id ? 'active' : ''}`} onClick={() => setSel(x.id)}>
            <Icon name={x.icon} size="sm" />
            <span class="grow">{x.title}</span>
          </button>
        ))}
        {game.state && game.mode !== 'title' && (
          <button
            class="btn small"
            style={{ marginTop: '8px' }}
            onClick={() => {
              game.tutorialRestart();
              game.openPanel(null);
            }}
            data-tip="Bit walks you through the first steps again, on this company."
          >
            <Icon name="restart" size="sm" /> Replay Bit’s tutorial
          </button>
        )}
      </nav>
      <article class="guide-entry ht-page" key={t.id}>
        <h2>
          <Icon name={t.icon} size="lg" /> {t.title}
        </h2>
        {t.special !== 'panels' && t.special !== 'screen' && t.special !== 'keys' && <Special t={t} act={act} />}
        <Prose text={t.body} />
        {(t.special === 'panels' || t.special === 'screen' || t.special === 'keys') && <Special t={t} act={act} />}
        {t.special === 'day' && <Rhythm act={act} />}
        <div class="row between ht-nav">
          {i > 0 ? (
            <button class="btn small" onClick={() => setSel(topics[i - 1].id)}>
              ← {topics[i - 1].title}
            </button>
          ) : (
            <span />
          )}
          {i < topics.length - 1 && (
            <button class="btn small primary" onClick={() => setSel(topics[i + 1].id)}>
              {topics[i + 1].title} →
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
