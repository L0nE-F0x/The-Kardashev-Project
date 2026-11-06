import { useEffect, useState } from 'preact/hooks';
import { Portrait, useGame } from './components';
import { TUTORIAL } from '../game/tutorial';
import { BRIEFINGS } from '../game/briefings';
import { ADVISORS } from '../content/advisors';

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

/**
 * Bring a step's target on screen once: on a phone the button Bit points at can sit below the fold of a panel
 * (Compute → Start Bit-1 at 780×360). True once the element exists (it may render a frame after the step starts).
 */
function revealTarget(target: string | null | undefined): boolean {
  if (!target || target.startsWith('site:')) return true;
  const el = document.querySelector(`[data-tut="${target}"]`) as HTMLElement | null;
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  else el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
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
    let revealed: string | null = null;
    const loop = () => {
      const t = step.target?.(game) ?? null;
      if (t && t !== revealed && revealTarget(t)) revealed = t;
      const b = locateTarget(t, game);
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

/** Act II unlock briefings: the same spotlight, with the advisor who owns the system. */
export function BriefingOverlay() {
  const game = useGame();
  const s = game.state;
  const [box, setBox] = useState<Box | null>(null);
  const b = game.briefing;
  const def = b ? BRIEFINGS.find((x) => x.id === b.id) : null;
  const step = def && b ? def.steps[b.step] : null;
  const hidden = !s || !step || !!s.events.active || game.showActComplete || game.mode !== 'map' || !!game.confirm;
  useEffect(() => {
    if (hidden || !step) return;
    let raf = 0;
    let revealed: string | null = null;
    const loop = () => {
      const t = step.target?.(game) ?? null;
      if (t && t !== revealed && revealTarget(t)) revealed = t;
      const nb = locateTarget(t, game);
      setBox((prev) => (prev && nb && prev.x === nb.x && prev.y === nb.y && prev.w === nb.w && prev.h === nb.h ? prev : nb));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hidden, b?.id, b?.step]);
  if (hidden || !step || !def || !b) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bubbleW = Math.min(360, vw - 16);
  let bx = (vw - bubbleW) / 2;
  let by = vh * 0.6;
  if (box) {
    bx = Math.max(8, Math.min(vw - bubbleW - 8, box.x + box.w / 2 - bubbleW / 2));
    const below = box.y + box.h + 12;
    by = below + 150 < vh ? below : Math.max(8, box.y - 170);
    if (box.x < 80 && box.w < 80) {
      bx = box.x + box.w + 12;
      by = Math.max(8, Math.min(vh - 180, box.y - 10));
    }
  }
  const last = b.step + 1 >= def.steps.length;
  return (
    <div class="tutorial" aria-live="polite">
      {box && <div class={`spot ${box.round ? 'round' : ''}`} style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }} />}
      {!box && <div class="spot-dim" />}
      <div class="tut-bubble frame interactive" style={{ left: `${bx}px`, top: `${by}px`, width: `${bubbleW}px` }}>
        <div class="row" style={{ alignItems: 'flex-start', gap: '10px' }}>
          <Portrait id={def.advisor} mood={step.mood ?? 'happy'} size={48} />
          <div class="grow">
            <div class="label">
              {ADVISORS[def.advisor].name.replace(/^Dr\.\s*/, '').split(' ')[0]} · {def.title} {def.steps.length > 1 ? `${b.step + 1}/${def.steps.length}` : ''}
            </div>
            <div class="tut-text">{step.text(game)}</div>
          </div>
        </div>
        <div class="row between" style={{ marginTop: '8px' }}>
          <button class="btn ghost small" onClick={() => game.briefingSkip()}>
            Skip
          </button>
          <button class="btn small primary" onClick={() => game.briefingNext()}>
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** An advisor's one-off tip (game/tips.ts): a small card above the ticker. It never stops the clock. */
export function AdvisorTip() {
  const game = useGame();
  const t = game.tip;
  const s = game.state;
  if (!t || !s || s.meta.tutorialStep >= 0 || game.briefing || s.events.active || game.ending || (game.mode !== 'map' && game.mode !== 'diorama')) return null;
  const name = ADVISORS[t.advisor]?.name.replace(/^Dr\.\s*/, '').split(' ')[0] ?? 'Bit';
  return (
    <div class="advisor-tip frame interactive" role="status" aria-live="polite">
      <Portrait id={t.advisor} mood="neutral" size={40} />
      <div class="grow">
        <div class="label">
          {name} · {t.kind === 'moment' ? 'on site' : 'tip'}
        </div>
        <div class="tip-text">{t.text}</div>
        <div class="row wrap tip-actions">
          {t.action && (
            <button class="btn small primary" onClick={() => game.tipAction()}>
              {t.action.label}
            </button>
          )}
          {t.learn && (
            <button
              class="btn small"
              onClick={() => {
                game.openHowTo(t.learn);
                game.dismissTip();
              }}
            >
              Learn more
            </button>
          )}
          <button class="btn small ghost" onClick={() => game.dismissTip()}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
