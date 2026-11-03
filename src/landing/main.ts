import '../ui/base.css';
import './landing.css';
import mapUrl from '../content/generated/worldmap.bin?url';
import { syncCssVars } from '../render/palette';
import { bakeInto, PixelCanvas } from '../render/pixels';
import { drawGlobe, drawStars } from '../render/globe';
import { decodeWorldMap } from '../world/mapData';
import { terrainCanvas } from '../render/worldMap/terrain';
import { subsolar } from '../world/sun';
import { iconUrl, type IconName } from '../ui/icons';
import { RELEASES, APP_VERSION } from '../content/changelog';
import { canPromptInstall, initInstallPrompt, installHelp, isStandalone, onInstallChange, promptInstall, registerServiceWorker } from '../platform/platform';

const REPO = 'L0nE-F0x/The-Kardashev-Project';

syncCssVars();

// ── pixel icons in the feature cards ─────────────────────────────────────────────────────────
document.querySelectorAll<HTMLImageElement>('img[data-icon]').forEach((img) => {
  img.src = iconUrl(img.dataset.icon as IconName);
});

// ── starfield background ─────────────────────────────────────────────────────────────────────
{
  const pc = new PixelCanvas(320, 240);
  drawStars(pc, 1977, 140);
  const c = document.createElement('canvas');
  bakeInto(pc, c);
  document.body.style.setProperty('--stars', `url(${c.toDataURL()})`);
}

// ── the spinning Earth ───────────────────────────────────────────────────────────────────────
async function spinGlobe() {
  const canvas = document.getElementById('globe') as HTMLCanvasElement | null;
  if (!canvas) return;
  const buf = await (await fetch(mapUrl)).arrayBuffer();
  const lods = decodeWorldMap(buf);
  const lod = lods[1];
  const terrain = terrainCanvas(lod);
  const size = 200;
  const pc = new PixelCanvas(size, size);
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lon0 = subsolar(new Date()).lon + 40; // start with the terminator in view
  let visible = true;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(canvas);
  let last = performance.now();
  let acc = 0;
  const draw = () => {
    pc.data.fill(0);
    drawGlobe(pc, { terrain, res: lod.res, lon0, lat0: 18, cx: size / 2, cy: size / 2, r: 92, sun: subsolar(new Date()), lights: true, atmosphere: true });
    bakeInto(pc, canvas);
  };
  draw();
  canvas.classList.add('ready');
  if (still) return;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    if (visible && acc > 1 / 24) {
      lon0 -= acc * 6; // west → east rotation
      acc = 0;
      draw();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
void spinGlobe();

// ── what's new ───────────────────────────────────────────────────────────────────────────────
{
  const box = document.getElementById('changelog');
  if (box) {
    box.innerHTML = RELEASES.slice(0, 3)
      .map(
        (r) => `<article class="release frame"><h3>v${r.version} — ${escapeHtml(r.title)}</h3>${r.date ? `<div class="small muted">${escapeHtml(r.date)}</div>` : ''}<ul>${r.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></article>`,
      )
      .join('');
  }
  const v = document.getElementById('foot-version');
  if (v) v.textContent = `v${APP_VERSION}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ── install as an app ────────────────────────────────────────────────────────────────────────
initInstallPrompt();
const installBtn = document.getElementById('install-btn') as HTMLButtonElement | null;
const installHelpBox = document.getElementById('install-help');
function refreshInstall() {
  if (!installBtn || !installHelpBox) return;
  if (isStandalone()) {
    installBtn.hidden = true;
    installHelpBox.textContent = 'You’re already using the installed app. 🎉';
    return;
  }
  installBtn.hidden = !canPromptInstall();
  const how = installHelp();
  installHelpBox.innerHTML = canPromptInstall()
    ? ''
    : how === 'ios'
      ? 'On iPhone/iPad: open in <b>Safari</b>, tap <b>Share</b> → <b>Add to Home Screen</b>.'
      : how === 'safari-mac'
        ? 'In Safari on a Mac: <b>File → Add to Dock…</b>'
        : 'Open the game, then use your browser’s menu → <b>Install app</b> (Chrome, Edge, Android).';
}
installBtn?.addEventListener('click', () => void promptInstall());
onInstallChange(refreshInstall);
refreshInstall();

// ── desktop downloads from the latest GitHub release ───────────────────────────────────────
interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}

function osOf(): 'windows' | 'mac' | 'linux' | 'other' {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua) && navigator.maxTouchPoints < 2) return 'mac';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return 'other';
}

async function desktopLinks() {
  const box = document.getElementById('desktop-links');
  if (!box) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(String(res.status));
    const rel = (await res.json()) as { tag_name: string; assets: Asset[]; html_url: string };
    const pick = (re: RegExp) => rel.assets.find((a) => re.test(a.name));
    const items: [string, 'windows' | 'mac' | 'linux', Asset | undefined][] = [
      ['Windows installer', 'windows', pick(/\.exe$/i) ?? pick(/\.msi$/i)],
      ['macOS (.dmg)', 'mac', pick(/\.dmg$/i)],
      ['Linux AppImage', 'linux', pick(/\.AppImage$/i)],
      ['Linux .deb', 'linux', pick(/\.deb$/i)],
    ];
    const os = osOf();
    const avail = items.filter((i) => i[2]);
    if (!avail.length) throw new Error('no assets');
    box.innerHTML =
      avail
        .map(([label, plat, a]) => `<a class="btn ${plat === os ? 'primary' : ''}" href="${a!.browser_download_url}">⬇ ${label} <span class="small">${(a!.size / 1e6).toFixed(0)} MB</span></a>`)
        .join('') + `<a class="small link" href="${rel.html_url}">${escapeHtml(rel.tag_name)} release notes</a>`;
  } catch {
    box.innerHTML = '<span class="small muted">Desktop builds are on their way — play in the browser or install the app meanwhile.</span>';
  }
}
void desktopLinks();

void registerServiceWorker(() => {
  /* the landing page simply picks up new versions on the next visit */
});
