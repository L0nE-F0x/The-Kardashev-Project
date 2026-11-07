import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Portrait, useGame } from './components';
import { TUTORIAL } from '../game/tutorial';
import { BRIEFINGS } from '../game/briefings';
import { ADVISORS } from '../content/advisors';
import type { AdvisorId } from '../sim/types';
import type { Mood } from '../content/events';
import { placeBubble, type Area, type Box } from './placeBubble';

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

/** The safe part of the screen (clear of a phone's camera cutout), with a small margin. */
function safeArea(): Area {
  const r = document.getElementById('ui')?.getBoundingClientRect();
  const m = 6;
  return r && r.width > 0 ? { left: r.left + m, top: r.top + m, right: r.right - m, bottom: r.bottom - m } : { left: m, top: m, right: window.innerWidth - m, bottom: window.innerHeight - m };
}

/** A step's target, followed every frame (panels open, the map pans), brought on screen once per target. */
function useTarget(hidden: boolean, target: (() => string | null) | null, key: unknown): Box | null {
  const game = useGame();
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (hidden) return;
    let raf = 0;
    let revealed: string | null = null;
    const loop = () => {
      const t = target?.() ?? null;
      if (t && t !== revealed && revealTarget(t)) revealed = t;
      const b = locateTarget(t, game);
      setBox((prev) => (prev && b && prev.x === b.x && prev.y === b.y && prev.w === b.w && prev.h === b.h ? prev : b));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hidden, key]);
  return hidden ? null : box;
}

/**
 * The spotlight and the speech bubble. The bubble measures itself after every render and takes the first spot that
 * fits (placeBubble); a long text on a short screen scrolls inside it, and its buttons always stay on screen.
 */
function SpotBubble({ box, advisor, mood, label, text, buttons }: { box: Box | null; advisor: AdvisorId; mood: Mood; label: ComponentChildren; text: ComponentChildren; buttons: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = safeArea();
    el.style.maxHeight = `${Math.max(120, a.bottom - a.top)}px`;
    const p = placeBubble(box, el.offsetWidth, el.offsetHeight, a);
    el.style.left = `${Math.round(p.left)}px`;
    el.style.top = `${Math.round(p.top)}px`;
  });
  const compact = window.innerHeight <= 520;
  return (
    <div class="tutorial" aria-live="polite">
      {box && <div class={`spot ${box.round ? 'round' : ''}`} style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }} />}
      {!box && <div class="spot-dim" />}
      <div class="tut-bubble frame interactive" ref={ref}>
        <div class="tut-main">
          <Portrait id={advisor} mood={mood} size={compact ? 40 : 48} />
          <div class="grow">
            <div class="label">{label}</div>
            <div class="tut-text">{text}</div>
          </div>
        </div>
        <div class="row between tut-buttons">{buttons}</div>
      </div>
    </div>
  );
}

/** Bit's walkthrough: a spotlight on the real UI and a speech bubble with what to do. */
export function TutorialOverlay() {
  const game = useGame();
  const s = game.state;
  const stepIndex = s?.meta.tutorialStep ?? -1;
  const step = stepIndex >= 0 ? TUTORIAL[stepIndex] : null;
  const hidden = !s || !step || !!s.events.active || !!game.awayReport || game.showActComplete || game.mode !== 'map' || !!game.confirm;
  const box = useTarget(hidden, step?.target ? () => step.target!(game) ?? null : null, stepIndex);
  if (hidden || !step) return null;
  return (
    <SpotBubble
      box={box}
      advisor="bit"
      mood={step.mood ?? 'happy'}
      label={`Bit · ${stepIndex + 1}/${TUTORIAL.length}`}
      text={step.text(game)}
      buttons={
        <>
          <button class="btn ghost small" onClick={() => game.tutorialSkip()}>
            Skip tutorial
          </button>
          {step.next && (
            <button class="btn small primary" onClick={() => game.tutorialNext()}>
              {step.next}
            </button>
          )}
        </>
      }
    />
  );
}

/** Act II–V unlock briefings: the same spotlight, with the advisor who owns the system. */
export function BriefingOverlay() {
  const game = useGame();
  const s = game.state;
  const b = game.briefing;
  const def = b ? BRIEFINGS.find((x) => x.id === b.id) : null;
  const step = def && b ? def.steps[b.step] : null;
  const hidden = !s || !step || !!s.events.active || game.showActComplete || game.mode !== 'map' || !!game.confirm;
  const box = useTarget(hidden, step?.target ? () => step.target!(game) ?? null : null, `${b?.id}:${b?.step}`);
  if (hidden || !step || !def || !b) return null;
  const last = b.step + 1 >= def.steps.length;
  return (
    <SpotBubble
      box={box}
      advisor={def.advisor}
      mood={step.mood ?? 'happy'}
      label={`${ADVISORS[def.advisor].name.replace(/^Dr\.\s*/, '').split(' ')[0]} · ${def.title} ${def.steps.length > 1 ? `${b.step + 1}/${def.steps.length}` : ''}`}
      text={step.text(game)}
      buttons={
        <>
          <button class="btn ghost small" onClick={() => game.briefingSkip()}>
            Skip
          </button>
          <button class="btn small primary" onClick={() => game.briefingNext()}>
            {last ? 'Got it' : 'Next'}
          </button>
        </>
      }
    />
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
