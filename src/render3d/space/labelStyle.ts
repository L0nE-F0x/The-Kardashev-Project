/**
 * How labels read over the space views (tones for globe/labels.ts's `Labels`): small tracked capitals
 * floating on the dark with a short tick down to their body, quiet for the planets, mint for the
 * places you can visit. The hovered one keeps the globe's bright pill.
 */
const css = `
.g3-label.sp { background: none; box-shadow: none; padding: 0 0 7px; border-radius: 0; font-family: var(--font-label, var(--font)); font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase; color: rgba(238, 231, 220, 0.62); text-shadow: 0 0 8px rgba(3, 4, 10, 0.95), 0 1px 2px rgba(0, 0, 0, 0.9); }
.g3-label.sp::after { content: ''; position: absolute; left: calc(50% + var(--stem)); bottom: 0; width: 1px; height: 5px; background: currentColor; opacity: 0.55; }
.g3-label.sp.place { color: rgba(163, 240, 214, 0.92); }
.g3-label.sp.gold { color: rgba(251, 212, 110, 0.95); }
.g3-label.sp.hot { color: #0b0a12; background: #fde9a4; padding: 2px 8px 2px 10px; margin-top: -7px; border-radius: 5px; text-shadow: none; }
.g3-label.sp.hot::after { display: none; }
@media (max-height: 520px) { .g3-label.sp { font-size: 9px; } }
`;
let injected = false;

export function spaceLabelStyle() {
  if (injected) return;
  injected = true;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.append(st);
}
