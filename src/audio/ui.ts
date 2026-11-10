/**
 * The interface's own voice: every button clicks, and under a mouse it ticks faintly as the pointer arrives.
 * The game's handlers run first (this listens on the document, where events arrive last), so when the game already
 * made a sound for a press (a panel opening, a purchase), that sound is the click.
 */
import { lastSfxAt, sfx } from './sfx';

const PRESSABLE = 'button, [role="button"], [role="switch"], [role="tab"], a[href], summary, input[type="range"], input[type="checkbox"], select';

function pressable(e: Event): Element | null {
  const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
  return !el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' ? null : el;
}

export function installUiSounds(): void {
  let over: Element | null = null;
  document.addEventListener('click', (e) => {
    if (pressable(e) && performance.now() - lastSfxAt() > 60) sfx('click');
  });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = pressable(e);
    if (el === over) return;
    over = el;
    if (el) sfx('hover');
  });
}
