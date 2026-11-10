/**
 * Crisp DOM labels over the 3D view (the UI's own font), placed each frame without overlaps. A dark glass pill
 * with a dot in the site's colour: it reads over sunlit desert, cloud and the night side alike.
 */
const css = `
.g3-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.g3-label { position: absolute; transform: translate(-50%, -100%); white-space: nowrap; font-family: var(--font); font-size: 12px; line-height: 16px;
  font-weight: 600; letter-spacing: 0.015em; color: #f6f1e8; padding: 1px 8px 1px 7px; border-radius: 9px; background: rgba(10, 11, 22, 0.66);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.09), 0 2px 10px rgba(0, 0, 0, 0.35); text-shadow: 0 1px 1px rgba(0, 0, 0, 0.5);
  transition: opacity 0.15s, background-color 0.12s, color 0.12s; --dot: #c3bcc7; }
.g3-label::before { content: ''; display: inline-block; width: 6px; height: 6px; margin: 0 6px 1px 0; border-radius: 50%; background: var(--dot);
  box-shadow: 0 0 6px var(--dot); }
.g3-label::after { content: ''; position: absolute; left: 50%; top: 100%; width: 1px; height: 5px; background: linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0)); }
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

export class Labels {
  private root: HTMLDivElement;
  private els = new Map<string, HTMLDivElement>();

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

  show(items: LabelItem[], opacity = 1) {
    items.sort((a, b) => b.pri - a.pri);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const used = new Set<string>();
    for (const it of items) {
      const region = it.tone.startsWith('region');
      const w = it.text.length * (region ? 13 : 7) + (region ? 14 : 30), h = region ? 18 : 24;
      const box = { x0: it.x - w / 2, y0: it.y - (region ? h / 2 : h), x1: it.x + w / 2, y1: it.y + (region ? h / 2 : 0) };
      if (placed.some((b) => b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0)) continue;
      placed.push(box);
      used.add(it.id);
      let el = this.els.get(it.id);
      if (!el) {
        el = document.createElement('div');
        this.root.append(el);
        this.els.set(it.id, el);
      }
      if (el.textContent !== it.text) el.textContent = it.text;
      const cls = `g3-label ${it.tone}`;
      if (el.className !== cls) el.className = cls;
      // (region names sit on their spot; a site's pill stands off it on its stem)
      el.style.left = `${Math.round(it.x)}px`;
      el.style.top = `${Math.round(it.y - (region ? 0 : 5))}px`;
      el.style.opacity = String(opacity);
    }
    for (const [id, el] of this.els) if (!used.has(id)) { el.remove(); this.els.delete(id); }
  }

  destroy() {
    this.root.remove();
  }
}
