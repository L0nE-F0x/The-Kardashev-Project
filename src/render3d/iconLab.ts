/**
 * The icon sheet (play/icons.html, dev only): every interface icon, dock icon and medal by name, at the sizes the
 * game shows them, on the interface's panel colour. This is how icons are checked (art3d/INTERFACE.md).
 *
 *   /play/icons.html                 everything, by family
 *   …?only=cash,power,dock:compute   just these (a `dock:` prefix picks the dock's drawing)
 *   …?group=power                    one family (the start of its title; `dock`, `medals`)
 *   …?mag=6                          also what a 16 px and a 20 px icon really look like, magnified 6× pixel for pixel
 *   …?bg=hud | gold | light          the icons on the top bar's plate, on a gold button, on a light surface
 */
import { ICON_GROUPS, iconUrl, type IconName } from '../ui/icons';
import { DOCK_ICON_NAMES, dockIconUrl, type DockIconName } from '../ui/dockIcons';
import { MEDAL_TIERS, medalUrl } from '../ui/medals';

const q = new URLSearchParams(location.search);
const only = (q.get('only') ?? '').split(',').filter(Boolean);
const group = (q.get('group') ?? '').toLowerCase();
const mag = Math.max(0, Math.min(12, Number(q.get('mag')) || 0));
const BG: Record<string, string> = { hud: '#2a2637', gold: '#fbd46e', light: '#e6e0e3' };
const bg = BG[q.get('bg') ?? ''] ?? 'linear-gradient(180deg, #211d2d, #17151f)';

const style = document.createElement('style');
style.textContent = `
  html, body { margin: 0; background: #0b0a12; color: #c3bcc7; font: 12px/1.3 system-ui, sans-serif; }
  main { padding: 14px 16px 40px; }
  h2 { margin: 18px 0 8px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #5fd3b5; }
  h2 small { color: #7a7186; font-weight: 400; letter-spacing: 0; text-transform: none; margin-left: 8px; }
  .cells { display: flex; flex-wrap: wrap; gap: 6px; }
  .cell { display: flex; flex-direction: column; gap: 5px; padding: 8px 10px 6px; border-radius: 9px;
    background: ${bg}; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }
  .cell .row { display: flex; align-items: center; gap: 9px; min-height: 48px; }
  .cell span { color: #9d95a6; font-size: 11px; }
  .cell img { display: block; flex: none; }
  .cell canvas { display: block; flex: none; image-rendering: pixelated; border-radius: 2px; background: rgb(255 255 255 / 0.03); }
`;
document.head.append(style);

const main = document.createElement('main');
document.body.append(main);

function section(title: string, note: string) {
  const h = document.createElement('h2');
  h.textContent = title;
  const s = document.createElement('small');
  s.textContent = note;
  h.append(s);
  const box = document.createElement('div');
  box.className = 'cells';
  main.append(h, box);
  return box;
}

/** The picture drawn at `px` device pixels, then shown `mag` times larger with hard pixels: what a player's screen shows. */
function magnified(url: string, px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  cv.style.width = cv.style.height = `${px * mag}px`;
  const img = new Image();
  img.onload = () => cv.getContext('2d')?.drawImage(img, 0, 0, px, px);
  img.src = url;
  return cv;
}

function cell(box: HTMLElement, name: string, url: string, sizes: number[], magSizes: number[]) {
  const c = document.createElement('div');
  c.className = 'cell';
  c.dataset.name = name;
  const row = document.createElement('div');
  row.className = 'row';
  for (const px of sizes) {
    const img = new Image(px, px);
    img.src = url;
    img.alt = name;
    row.append(img);
  }
  if (mag) for (const px of magSizes) row.append(magnified(url, px));
  const label = document.createElement('span');
  label.textContent = name;
  c.append(row, label);
  box.append(c);
}

const wants = (title: string, key: string) => (only.length ? only.includes(key) : !group || title.toLowerCase().startsWith(group));

for (const [title, names] of Object.entries(ICON_GROUPS) as [string, IconName[]][]) {
  const list = names.filter((nm) => wants(title, nm));
  if (!list.length) continue;
  const box = section(title, `${list.length} · 16, 20, 27, 48 px`);
  for (const nm of list) cell(box, nm, iconUrl(nm), [16, 20, 27, 48], [16, 20]);
}

const dock = DOCK_ICON_NAMES.filter((nm) => wants('dock', `dock:${nm}`));
if (dock.length) {
  const box = section('Dock', `${dock.length} · 16, 20, 27, 48 px (the dock shows them at 24–34)`);
  for (const nm of dock) cell(box, `dock:${nm}`, dockIconUrl(nm as DockIconName), [16, 20, 27, 48], [24, 30]);
}

const medals = MEDAL_TIERS.filter((t) => wants('medals', `medal:${t}`));
if (medals.length) {
  const box = section('Medals', '24, 36, 48, 72 px');
  for (const t of medals) cell(box, `medal:${t}`, medalUrl(t), [24, 36, 48, 72], [24]);
}
