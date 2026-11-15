import { useState } from 'preact/hooks';
import { BuiltBy, Portrait, Window, fmtRealDate, useGame } from '../components';
import { rich } from '../emoji';
import { RELEASES } from '../../content/changelog';

/** A changelog line's **bold** runs (the rest is plain text); emoji markers become the interface's icons. */
function boldSpans(text: string) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <b key={i}>{rich(part)}</b> : rich(part)));
}

/** How many releases What's New shows before "Older versions". */
const RECENT = 3;

function Release({ r }: { r: (typeof RELEASES)[number] }) {
  return (
    <section class="release">
      <h3>
        v{r.version} — {r.title}
      </h3>
      {r.date && <div class="small muted">{fmtRealDate(r.date)}</div>}
      <ul>
        {r.items.map((it, i) => (
          <li key={i}>{boldSpans(it)}</li>
        ))}
      </ul>
    </section>
  );
}

export function WhatsNew() {
  const game = useGame();
  const [older, setOlder] = useState(false);
  return (
    <Window title="What’s new" icon="news" onClose={() => game.openMenuScreen('main')}>
      {RELEASES.slice(0, RECENT).map((r) => (
        <Release r={r} key={r.version} />
      ))}
      {RELEASES.length > RECENT &&
        (older ? (
          RELEASES.slice(RECENT).map((r) => <Release r={r} key={r.version} />)
        ) : (
          <button class="btn ghost small" onClick={() => setOlder(true)}>
            Older versions ({RELEASES.length - RECENT})
          </button>
        ))}
    </Window>
  );
}

export function Credits() {
  const game = useGame();
  return (
    <Window title="Credits" icon="people" onClose={() => game.openMenuScreen('main')}>
      <div class="quote">
        <Portrait id="bit" mood="happy" size={56} bitGen={2} />
        <div class="bubble">
          <b>Bit</b>
          The Kardashev Project is a cozy-but-real game about the AI boom: power, chips, compute and supply lines on a real Earth, and the long climb toward a Type I civilisation.
        </div>
      </div>
      <h4 class="section">Made by</h4>
      <p>Lone Fox — design, direction and vibes. Built with Claude.</p>
      <p>
        <BuiltBy />
      </p>
      <h4 class="section">Thanks to</h4>
      <ul class="credits">
        <li>Natural Earth — public-domain map data (coastlines, regions, rivers, lakes).</li>
        <li>Atkinson Hyperlegible Next (Braille Institute) for the text, Saira (Omnibus-Type) for titles and figures, Inter (Rasmus Andersson) for the logo, and Caveat, Playfair Display and Share Tech Mono (Carrois Type Design) in the interface's looks — typefaces under the SIL Open Font License.</li>
        <li>Permanent Marker (Font Diner) and Special Elite (Astigmatic) — typefaces under the Apache License 2.0.</li>
        <li>three.js, Preact, Vite and Tauri — the open-source tools underneath.</li>
        <li>Nikolai Kardashev and Carl Sagan — for the scale that gives the game its goal.</li>
      </ul>
      <p class="small muted">The people, trees and rocks were modelled with Meshy; the rest of the world, the interface art and the sound are generated in code. Companies, people and events are fictional; the geography and physics are real.</p>
    </Window>
  );
}
