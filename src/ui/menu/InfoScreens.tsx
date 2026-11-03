import { Icon, Portrait, Window, useGame } from '../components';
import { RELEASES } from '../../content/changelog';
import { canPromptInstall, installHelp, isDesktopApp, promptInstall } from '../../platform/platform';

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
              <li key={i}>{it}</li>
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
      <h4 class="section">Thanks to</h4>
      <ul class="credits">
        <li>Natural Earth — public-domain map data (coastlines, regions, rivers, lakes).</li>
        <li>Pixelify Sans and Silkscreen — pixel fonts under the SIL Open Font License.</li>
        <li>PixiJS, Preact, Vite and Tauri — the open-source tools underneath.</li>
        <li>Nikolai Kardashev and Carl Sagan — for the scale that gives the game its goal.</li>
      </ul>
      <p class="small muted">All art and sound is generated in code. Companies, people and events are fictional; the geography and physics are real.</p>
    </Window>
  );
}

export function InstallHelp() {
  const game = useGame();
  const how = installHelp();
  return (
    <Window title="Get the app" icon="arrow" onClose={() => game.openMenuScreen('main')}>
      {isDesktopApp ? (
        <p>You’re already playing the desktop app. 🎉</p>
      ) : (
        <>
          <p>Install The Kardashev Project as an app: its own icon, full screen, and it works offline.</p>
          {canPromptInstall() && (
            <button class="btn primary" onClick={() => void promptInstall()}>
              <Icon name="arrow" size="sm" /> Install now
            </button>
          )}
          {how === 'ios' && (
            <ol class="steps">
              <li>
                Tap the <b>Share</b> button in Safari’s toolbar.
              </li>
              <li>
                Choose <b>Add to Home Screen</b>.
              </li>
              <li>Open it from your home screen and turn your phone sideways.</li>
            </ol>
          )}
          {how === 'safari-mac' && (
            <ol class="steps">
              <li>
                In Safari, open the <b>File</b> menu.
              </li>
              <li>
                Choose <b>Add to Dock…</b>
              </li>
            </ol>
          )}
          {how === 'menu' && !canPromptInstall() && (
            <ol class="steps">
              <li>
                Open your browser’s menu (⋮ or ⋯) and choose <b>Install app</b> or <b>Add to Home screen</b>.
              </li>
              <li>Chrome, Edge and Android browsers support this.</li>
            </ol>
          )}
          <h4 class="section">Desktop downloads</h4>
          <p class="small">
            Prefer a classic download? Windows, macOS and Linux builds are on the{' '}
            <a class="link" href="../#download">
              home page
            </a>
            .
          </p>
        </>
      )}
    </Window>
  );
}
