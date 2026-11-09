/** Crisp DOM labels over the 3D view (the UI's own font), placed each frame without overlaps. */
const css = `
.g3-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.g3-label { position: absolute; transform: translate(-50%, -100%); white-space: nowrap; font-family: var(--font); font-size: 12px;
  font-weight: 600; letter-spacing: 0.02em; color: #f3ede4; padding: 1px 6px; border-radius: 5px; background: rgba(16, 14, 24, 0.55);
  text-shadow: 0 1px 2px rgba(0,0,0,0.6); transition: opacity 0.15s; }
.g3-label.home { color: #fbd46e; }
.g3-label.owned { color: #a3f0d6; }
.g3-label.supplier { color: #d9b6ec; }
.g3-label.hot { color: #0b0a12; background: #fde9a4; text-shadow: none; }
.g3-label.region { background: none; font-family: var(--font-label, var(--font)); font-size: 13px; font-weight: 700; letter-spacing: 0.22em;
  color: rgba(243, 237, 228, 0.42); text-shadow: 0 1px 3px rgba(0,0,0,0.7); transform: translate(-50%, -50%); }
.g3-label.hot-region { color: rgba(253, 233, 164, 0.95); }
@media (max-height: 520px) { .g3-label { font-size: 10px; } }
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
      const w = it.text.length * (it.tone.startsWith('region') ? 12 : 7) + 14, h = 18;
      const box = { x0: it.x - w / 2, y0: it.y - h, x1: it.x + w / 2, y1: it.y };
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
      el.style.left = `${Math.round(it.x)}px`;
      el.style.top = `${Math.round(it.y)}px`;
      el.style.opacity = String(opacity);
    }
    for (const [id, el] of this.els) if (!used.has(id)) { el.remove(); this.els.delete(id); }
  }

  destroy() {
    this.root.remove();
  }
}
