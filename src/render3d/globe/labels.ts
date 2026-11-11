/**
 * Crisp DOM labels over the 3D view (the UI's own font), placed each frame without overlaps. A dark glass pill
 * with a dot in the site's colour: it reads over sunlit desert, cloud and the night side alike.
 *
 * Labels keep clear of the interface: one whose spot lies under a panel is not drawn (the panels are glass: it
 * showed through them as ghost text), one beside a panel or at the screen's edge slides along to stay whole (its
 * stem stays on the spot). They fade in and out rather than pop as the view turns.
 */
const css = `
.g3-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.g3-label { position: absolute; transform: translate(-50%, -100%); white-space: nowrap; font-family: var(--font); font-size: 12px; line-height: 16px;
  font-weight: 600; letter-spacing: 0.015em; color: #f6f1e8; padding: 1px 8px 1px 7px; border-radius: 9px; background: rgba(10, 11, 22, 0.66);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.09), 0 2px 10px rgba(0, 0, 0, 0.35); text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
  transition: opacity 0.16s, background-color 0.12s, color 0.12s; --dot: #c3bcc7; --stem: 0px; }
.g3-label::before { content: ''; display: inline-block; width: 6px; height: 6px; margin: 0 6px 1px 0; border-radius: 50%; background: var(--dot);
  box-shadow: 0 0 6px var(--dot); }
.g3-label::after { content: ''; position: absolute; left: calc(50% + var(--stem)); top: 100%; width: 1px; height: 5px; background: linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0)); }
.g3-label.home { --dot: #fbd46e; color: #fde9a4; }
.g3-label.owned { --dot: #5fd3b5; color: #c9f5e6; }
.g3-label.build { --dot: #e9e1d2; }
.g3-label.supplier { --dot: #a862c4; color: #ead7f5; }
.g3-label.cloud { --dot: #6c9fd2; }
.g3-label.landing { --dot: #2fae9b; }
.g3-label.mine { --dot: #d4a862; }
.g3-label.charter { --dot: #f7b258; color: #fde9a4; }
.g3-label.mega { --dot: #f08a46; }
.g3-label.launch { --dot: #e6e0e3; }
.g3-label.hot { color: #0b0a12; background: #fde9a4; text-shadow: none; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 0 16px rgba(253, 233, 164, 0.45); --dot: #0b0a12; }
.g3-label.hot::before { box-shadow: none; }
.g3-label.region { background: none; box-shadow: none; padding: 0; font-family: var(--font-label, var(--font)); font-size: 13px; font-weight: 700; letter-spacing: 0.3em;
  color: rgba(243, 237, 228, 0.5); text-shadow: 0 0 10px rgba(4, 6, 14, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8); transform: translate(-50%, -50%); }
.g3-label.region::before, .g3-label.region::after { display: none; }
.g3-label.hot-region { color: rgba(253, 233, 164, 0.96); }
@media (max-height: 520px) { .g3-label { font-size: 10px; line-height: 14px; } }
`;
let injected = false;

export interface LabelItem { id: string; text: string; x: number; y: number; pri: number; tone: string }

interface Box { x0: number; y0: number; x1: number; y1: number }

/** How long a label takes to fade (the CSS transition above), and how often the interface's panels are measured. */
const FADE_MS = 170, PANELS_MS = 350;
/** Room kept between a label and the screen's edge or a panel. */
const GAP = 4;

/**
 * Whether this engine reports an element's box already scaled by its CSS `zoom` (the standard) or in its own
 * unzoomed pixels (WebKit, older Chromium): the interface's panels are zoomed by the player's UI size.
 */
let zoomedRects: boolean | null = null;
function rectsAreZoomed() {
  if (zoomedRects !== null) return zoomedRects;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none;zoom:2';
  document.body.append(d);
  zoomedRects = d.getBoundingClientRect().width > 15;
  d.remove();
  return zoomedRects;
}

/** The zoom an element is drawn at (its own and its ancestors'), for engines that report unzoomed boxes. */
function zoomOf(el: Element) {
  let z = 1;
  for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
    const v = parseFloat((getComputedStyle(e) as CSSStyleDeclaration & { zoom?: string }).zoom ?? '1');
    if (v > 0 && Number.isFinite(v)) z *= v;
  }
  return z;
}

export class Labels {
  private root: HTMLDivElement;
  private els = new Map<string, { el: HTMLDivElement; on: boolean; goneAt: number; fresh: boolean }>();
  private panels: Box[] = [];
  private panelsAt = -Infinity;

  constructor(host: HTMLElement = document.getElementById('game') ?? document.body) {
    if (!injected) {
      const st = document.createElement('style');
      st.textContent = css;
      document.head.append(st);
      injected = true;
    }
    this.root = document.createElement('div');
    this.root.className = 'g3-labels';
    host.append(this.root);
  }

  /** The interface's panels (every `.frame` in #ui), in the labels' own coordinates; measured a few times a second. */
  private measurePanels(now: number) {
    if (now - this.panelsAt < PANELS_MS) return;
    this.panelsAt = now;
    this.panels = [];
    const ui = document.getElementById('ui');
    if (!ui) return;
    const o = this.root.getBoundingClientRect();
    const zoomed = rectsAreZoomed();
    for (const el of ui.querySelectorAll('.frame')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      // (a panel that is laid out but not shown hides nothing)
      const seen = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
      if (seen && !seen.call(el, { visibilityProperty: true, opacityProperty: true })) continue;
      const z = zoomed ? 1 : zoomOf(el);
      this.panels.push({ x0: r.left * z - o.left, y0: r.top * z - o.top, x1: r.right * z - o.left, y1: r.bottom * z - o.top });
    }
  }

  show(items: LabelItem[], opacity = 1) {
    const now = performance.now();
    this.measurePanels(now);
    const W = this.root.clientWidth, H = this.root.clientHeight;
    // where each label could go: on its spot, or slid along clear of a panel or the screen's edge
    const cands: { it: LabelItem; cx: number; box: Box; region: boolean }[] = [];
    for (const it of items) {
      const region = it.tone.startsWith('region'), space = it.tone.startsWith('sp');
      const w = it.text.length * (region ? 13 : space ? 9.6 : 7) + (region ? 14 : space ? 18 : 30), h = region ? 18 : 24;
      // the spot itself off the screen: nothing to label
      if (it.x < 0 || it.x > W || it.y < 0 || it.y > H + h) continue;
      const y0 = it.y - (region ? h / 2 : h), y1 = it.y + (region ? h / 2 : 0);
      let cx = it.x;
      if (region) {
        // a region's name sits on its spot or not at all
        if (this.panels.some((p) => p.x0 < cx + w / 2 && p.x1 > cx - w / 2 && p.y0 < y1 && p.y1 > y0)) continue;
      } else {
        // the room either side of the spot, between the screen's edges and any panels level with the label
        let left = GAP, right = W - GAP, under = false;
        for (const p of this.panels) {
          if (p.y0 >= y1 + 5 || p.y1 <= y0) continue;
          if (p.x0 <= it.x && p.x1 >= it.x) { under = true; break; }
          if (p.x1 < it.x) left = Math.max(left, p.x1 + GAP);
          else right = Math.min(right, p.x0 - GAP);
        }
        if (under || right - left < w) continue;
        cx = Math.max(left + w / 2, Math.min(right - w / 2, it.x));
        // (slid so far that its stem would leave the pill: better gone)
        if (Math.abs(cx - it.x) > w / 2 - 9) continue;
      }
      cands.push({ it, cx, box: { x0: cx - w / 2, y0, x1: cx + w / 2, y1 }, region });
    }
    // the important ones first; among equals, the ones that sit on their spot before the ones that had to slide
    cands.sort((a, b) => b.it.pri - a.it.pri || Math.abs(a.cx - a.it.x) - Math.abs(b.cx - b.it.x));
    const placed: Box[] = [];
    const used = new Set<string>();
    for (const { it, cx, box, region } of cands) {
      if (placed.some((b) => b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0)) continue;
      placed.push(box);
      used.add(it.id);
      let e = this.els.get(it.id);
      if (!e) {
        const el = document.createElement('div');
        el.style.opacity = '0';
        this.root.append(el);
        e = { el, on: true, goneAt: 0, fresh: true };
        this.els.set(it.id, e);
      }
      const el = e.el;
      e.on = true;
      if (el.textContent !== it.text) el.textContent = it.text;
      const cls = `g3-label ${it.tone}`;
      if (el.className !== cls) el.className = cls;
      // (region names sit on their spot; a site's pill stands off it on its stem)
      el.style.left = `${Math.round(cx)}px`;
      el.style.top = `${Math.round(it.y - (region ? 0 : 5))}px`;
      el.style.setProperty('--stem', `${Math.round(it.x) - Math.round(cx)}px`);
      // a new label waits a frame at nothing, so it fades in
      if (e.fresh) e.fresh = false;
      else el.style.opacity = String(opacity);
    }
    // the ones that lost their place fade out, then go
    for (const [id, e] of this.els) {
      if (used.has(id)) continue;
      if (e.on) { e.on = false; e.goneAt = now; e.el.style.opacity = '0'; }
      else if (now - e.goneAt > FADE_MS) { e.el.remove(); this.els.delete(id); }
    }
  }

  destroy() {
    this.root.remove();
  }
}
