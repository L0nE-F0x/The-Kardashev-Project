/**
 * The shell both editions share (the pixel game in main.ts, the 3D edition in main3d.ts): the
 * frame loop with its pacing, the keyboard shortcuts and the back gesture.
 */
import type { Game } from './game';
import { onHostBack } from '../platform/platform';

/** What the keyboard can ask of the current scene (map scenes pan and zoom). */
interface PanZoom {
  pan?(dx: number, dy: number): void;
  zoomIn?(): void;
  zoomOut?(): void;
}

/** Start the frame loop and bind the keys and the back gesture. */
export function startShell(game: Game) {
  bindKeys(game);
  // Frame pacing: at most 60 frames a second (30 with the battery saver), and 30 while nothing moves,
  // so 90–144 Hz screens and idle phones don't draw flat out. dt is real time, so nothing animates
  // faster or slower than before; any key, wheel or touch wakes the loop at once.
  let lastDraw = performance.now();
  let nextDraw = 0;
  let lastInput = lastDraw;
  const wake = () => {
    lastInput = performance.now();
    // out of the calm rate at once, but never past the cap (a moving mouse sends events faster than frames)
    nextDraw = Math.min(nextDraw, lastDraw + 1000 / (game.settings.batterySaver ? 30 : 60));
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'touchstart']) window.addEventListener(type, wake, { capture: true, passive: true });
  const loop = (now: number) => {
    if (now >= nextDraw - 1.5) {
      const fps = game.settings.batterySaver || calm(game, now - lastInput) ? 30 : 60;
      const budget = 1000 / fps;
      // keep to the average rate on screens that aren't a multiple of it, but never catch up in a burst
      nextDraw = Math.max(nextDraw + budget, now + budget * 0.75);
      // (never negative: a frame's timestamp can come from before the loop started, after a long first build)
      const dt = Math.max(0, Math.min(0.25, (now - lastDraw) / 1000));
      lastDraw = now;
      game.frame(dt, now);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // handy in the console while iterating
  (window as unknown as { game: Game }).game = game;
}

/**
 * Nothing on screen needs a smooth frame rate: the clock is stopped (paused, or a card waits), no
 * input for a couple of seconds, the camera is still, and no tour, time-lapse, ending or fade.
 */
function calm(game: Game, idleMs: number): boolean {
  if (idleMs < 2000 || game.mode === 'title' || game.ending || game.stage.fade > 0) return false;
  const s = game.state;
  if (!s || s.planet?.jump || s.system?.jump) return false;
  if (game.speed !== 0 && !game.blocked) return false;
  return !game.stage.getScene()?.busy?.();
}

/** Escape and the Android back gesture: close the topmost thing. False when nothing was open. */
function back(game: Game): boolean {
  // the menu: a sub-screen (Settings, Load, New company, the Field Guide…) goes back to the main menu
  if (game.mode === 'title' || !game.state) {
    if (game.menuScreen === 'main') return false;
    game.openMenuScreen('main');
    return true;
  }
  // the topmost overlay first: a dialog, a note, a report — and a card waits for its answer (back never answers it)
  if (game.photo) game.togglePhoto(false);
  else if (game.confirm) game.cancelConfirm();
  else if (game.noteOpen) game.closeNote();
  else if (game.awayReport) game.dismissAway();
  else if (game.showActComplete) game.dismissActComplete();
  else if (game.jumpReport) game.dismissJumpReport();
  else if (game.eraReport) game.dismissEraReport();
  else if (game.briefing) game.briefingSkip();
  else if (game.state.events.active && game.blocked) return true;
  else if (game.tool) game.setTool(null);
  else if (game.panel) game.openPanel(null);
  else if (game.ending) return true;
  else if (game.mode === 'diorama' || game.mode === 'orbit' || game.mode === 'system') game.enterMap();
  else if (game.selection) game.select(null);
  else return false;
  return true;
}

function bindKeys(game: Game) {
  onHostBack(() => back(game));
  window.addEventListener('keydown', (e) => {
    // typing in a text field (a name, a seed, a playtest note) never fires game shortcuts
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (game.mode === 'title' || !game.state) {
      if (e.key === 'Escape') back(game);
      else if (e.key === '?' || e.key === 'F1') {
        e.preventDefault();
        game.openHowTo();
      }
      return;
    }
    const scene = game.stage.getScene();
    const pan = (dx: number, dy: number) => (scene as PanZoom | null)?.pan?.(dx, dy);
    switch (e.key) {
      case ' ':
        e.preventDefault();
        game.togglePause();
        break;
      case '1':
        game.setSpeed(1);
        break;
      case '2':
        game.setSpeed(2);
        break;
      case '3':
        game.setSpeed(4);
        break;
      case '4':
        game.setSpeed(8);
        break;
      case 'c':
        game.openPanel('compute');
        break;
      case 'o':
        game.openPanel('orders');
        break;
      case 'r':
        game.openPanel('research');
        break;
      case 'f':
        game.openPanel('finance');
        break;
      case 'k':
        game.openPanel('stats');
        break;
      case 'g':
        game.openPanel('goals');
        break;
      case 'n':
        game.openPanel('news');
        break;
      case 'b':
        game.openPanel('guide');
        break;
      case 'l':
        game.setTool(game.tool?.kind === 'link' ? null : { kind: 'link', from: null });
        break;
      case 'i':
        if ((game.state?.act ?? 1) >= 2) game.setTool(game.tool?.kind === 'fiber' ? null : { kind: 'fiber', from: null });
        break;
      case 't':
        if ((game.state?.act ?? 1) >= 2) game.openPanel('team');
        break;
      case 'e':
        if ((game.state?.act ?? 1) >= 2) game.openPanel('deals');
        break;
      case 'p':
        if ((game.state?.act ?? 1) >= 2) game.openPanel('blocs');
        break;
      case 'h':
        if ((game.state?.act ?? 1) >= 3) game.openPanel('charter');
        break;
      case 'u':
        if ((game.state?.act ?? 1) >= 3) game.openPanel('council');
        break;
      case 'y':
        if ((game.state?.act ?? 1) >= 4) game.openPanel('planet');
        break;
      case 'v':
        if (game.ending) break;
        game.cycleView();
        break;
      case 'm':
        if (game.mode === 'diorama' || game.mode === 'orbit' || game.mode === 'system') game.enterMap();
        break;
      case 'x':
        if ((game.state?.act ?? 1) >= 5) game.openPanel('system');
        break;
      case 'j':
        // a playtest note (when Settings → Gameplay → Playtest notes is on)
        e.preventDefault();
        game.openNote();
        break;
      case '?':
      case 'F1':
        e.preventDefault();
        if (game.ending) break;
        game.openHowTo();
        break;
      case 'Escape':
        back(game);
        break;
      case 'ArrowLeft':
      case 'a':
        pan(-12, 0);
        break;
      case 'ArrowRight':
      case 'd':
        pan(12, 0);
        break;
      case 'ArrowUp':
      case 'w':
        pan(0, -12);
        break;
      case 'ArrowDown':
      case 's':
        pan(0, 12);
        break;
      case '+':
      case '=':
        (scene as PanZoom | null)?.zoomIn?.();
        break;
      case '-':
        (scene as PanZoom | null)?.zoomOut?.();
        break;
    }
  });
}

