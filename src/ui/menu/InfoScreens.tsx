import { BuiltBy, Portrait, Window, useGame } from '../components';
import { RELEASES } from '../../content/changelog';

/** A changelog line's **bold** runs (the rest is plain text). */
function boldSpans(text: string) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

export function WhatsNew() {
  const game = useGame();
  return (
    <Window title="What’s new" icon="news" onClose={() => game.openMenuScreen('main')}>
      {RELEASES.map((r) => (
        <section class="release" key={r.version}>
          <h3>
            v{r.version} — {r.title}
          </h3>
          {r.date && <div class="small muted">{r.date}</div>}
          <ul>
            {r.items.map((it, i) => (
              <li key={i}>{boldSpans(it)}</li>
            ))}
          </ul>
        </section>
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
        <li>Atkinson Hyperlegible Next (Braille Institute), Silkscreen and Pixelify Sans — fonts under the SIL Open Font License.</li>
        <li>three.js, Preact, Vite and Tauri — the open-source tools underneath.</li>
        <li>Nikolai Kardashev and Carl Sagan — for the scale that gives the game its goal.</li>
      </ul>
      <p class="small muted">The people, trees and rocks were modelled with Meshy; the rest of the world, the interface art and the sound are generated in code. Companies, people and events are fictional; the geography and physics are real.</p>
    </Window>
  );
}
