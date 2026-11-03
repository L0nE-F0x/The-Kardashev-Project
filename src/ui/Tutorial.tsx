import { useEffect, useState } from 'preact/hooks';
import { Portrait, useGame } from './components';
import { TUTORIAL } from '../game/tutorial';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
}

/** Find the step's target on screen: a [data-tut] element or a map marker. */
function locateTarget(target: string | null | undefined, game: ReturnType<typeof useGame>): Box | null {
  if (!target) return null;
  if (target.startsWith('site:')) {
    const p = game.locate(target);
    return p ? { x: p.x - 24, y: p.y - 24, w: 48, h: 48, round: true } : null;
  }
  const el = document.querySelector(`[data-tut="${target}"]`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12, round: false };
}

/** Bit's walkthrough: a spotlight on the real UI and a speech bubble with what to do. */
export function TutorialOverlay() {
  const game = useGame();
  const s = game.state;
  const [box, setBox] = useState<Box | null>(null);
  const stepIndex = s?.meta.tutorialStep ?? -1;
  const step = stepIndex >= 0 ? TUTORIAL[stepIndex] : null;
  const hidden = !s || !step || !!s.events.active || !!game.awayReport || game.showActComplete || game.mode !== 'map' || !!game.confirm;

  // follow the target every frame (panels open, the map pans)
  useEffect(() => {
    if (hidden || !step) return;
    let raf = 0;
    const loop = () => {
      const b = locateTarget(step.target?.(game), game);
      setBox((prev) => (prev && b && prev.x === b.x && prev.y === b.y && prev.w === b.w && prev.h === b.h ? prev : b));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hidden, stepIndex]);

  if (hidden || !step) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bubbleW = Math.min(360, vw - 16);
  let bx = (vw - bubbleW) / 2;
  let by = vh * 0.62;
  if (box) {
    bx = Math.max(8, Math.min(vw - bubbleW - 8, box.x + box.w / 2 - bubbleW / 2));
    const below = box.y + box.h + 12;
    by = below + 150 < vh ? below : Math.max(8, box.y - 160);
    // keep clear of the left dock and the inspector when pointing at them
    if (box.x < 80 && box.w < 80) {
      bx = box.x + box.w + 12;
      by = Math.max(8, Math.min(vh - 170, box.y - 10));
    }
  }
  return (
    <div class="tutorial" aria-live="polite">
      {box && <div class={`spot ${box.round ? 'round' : ''}`} style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }} />}
      {!box && <div class="spot-dim" />}
      <div class="tut-bubble frame interactive" style={{ left: `${bx}px`, top: `${by}px`, width: `${bubbleW}px` }}>
        <div class="row" style={{ alignItems: 'flex-start', gap: '10px' }}>
          <Portrait id="bit" mood={step.mood ?? 'happy'} size={48} />
          <div class="grow">
            <div class="label">
              Bit · {stepIndex + 1}/{TUTORIAL.length}
            </div>
            <div class="tut-text">{step.text(game)}</div>
          </div>
        </div>
        <div class="row between" style={{ marginTop: '8px' }}>
          <button class="btn ghost small" onClick={() => game.tutorialSkip()}>
            Skip tutorial
          </button>
          {step.next && (
            <button class="btn small primary" onClick={() => game.tutorialNext()}>
              {step.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
