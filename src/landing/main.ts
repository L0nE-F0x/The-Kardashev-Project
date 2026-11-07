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
import { canPromptInstall, initInstallPrompt, installHelp, isAndroid, isStandalone, onInstallChange, promptInstall, registerServiceWorker } from '../platform/platform';

const REPO = 'L0nE-F0x/The-Kardashev-Project';

syncCssVars();
// scroll reveals and the other progressive touches only switch on when the script runs
document.documentElement.classList.add('js');

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

// ── what's new: the latest release open (its first few changes, the rest a click away), two before it folded ──
{
  const box = document.getElementById('changelog');
  if (box) {
    const head = (r: (typeof RELEASES)[number]) =>
      `<div class="release-head"><span class="ver">v${escapeHtml(r.version)}</span><h3>${escapeHtml(r.title)}</h3>${r.date ? `<span class="date">${escapeHtml(r.date)}</span>` : ''}</div>`;
    const list = (items: string[]) => `<ul>${items.map((i) => `<li>${escapeHtml(i).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('')}</ul>`;
    const [latest, ...older] = RELEASES;
    const SHOW = 6;
    const latestHtml = latest
      ? `<article class="release latest">${head(latest)}${list(latest.items.slice(0, SHOW))}${
          latest.items.length > SHOW ? `<details><summary>Show all ${latest.items.length} changes</summary>${list(latest.items.slice(SHOW))}</details>` : ''
        }</article>`
      : '';
    box.innerHTML = latestHtml + older.slice(0, 2).map((r) => `<details class="release"><summary>${head(r)}</summary>${list(r.items)}</details>`).join('');
  }
  const v = document.getElementById('foot-version');
  if (v) v.textContent = `v${APP_VERSION}`;
}

// ── reveal on scroll ─────────────────────────────────────────────────────────────────────────
{
  const els = document.querySelectorAll<HTMLElement>('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('in'));
}

// ── the nav: a glass bar once you scroll, and the section you're in lit ─────────────────────
{
  const nav = document.getElementById('nav');
  const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav nav a[href^="#"]')];
  const sections = links.map((a) => document.querySelector<HTMLElement>(a.getAttribute('href')!)).filter((x): x is HTMLElement => !!x);
  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          for (const a of links) a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((sec) => io.observe(sec));
  }
}

// ── screenshots: click for full size, arrows to step through ────────────────────────────────
{
  const lb = document.getElementById('lightbox');
  const shots = [...document.querySelectorAll<HTMLButtonElement>('.shot')];
  if (lb && shots.length) {
    const img = lb.querySelector('img')!;
    const cap = lb.querySelector('figcaption')!;
    let at = 0;
    let opener: HTMLElement | null = null;
    // while it's open, the page behind it can't take focus or clicks
    const behind = [...document.querySelectorAll<HTMLElement>('#nav, #main, .foot')];
    const show = (i: number) => {
      at = (i + shots.length) % shots.length;
      const b = shots[at];
      img.src = b.dataset.full ?? b.querySelector('img')!.src;
      img.alt = b.querySelector('img')!.alt;
      cap.textContent = b.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
    };
    const open = (i: number, from: HTMLElement) => {
      opener = from;
      show(i);
      lb.hidden = false;
      behind.forEach((el) => (el.inert = true));
      document.body.style.overflow = 'hidden';
      lb.querySelector<HTMLButtonElement>('.lb-close')!.focus();
    };
    const close = () => {
      lb.hidden = true;
      behind.forEach((el) => (el.inert = false));
      document.body.style.overflow = '';
      opener?.focus();
    };
    shots.forEach((b, i) => b.addEventListener('click', () => open(i, b)));
    lb.querySelector('.lb-close')!.addEventListener('click', close);
    lb.querySelector('.lb-prev')!.addEventListener('click', () => show(at - 1));
    lb.querySelector('.lb-next')!.addEventListener('click', () => show(at + 1));
    // a click anywhere but the picture and the buttons closes it
    lb.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('img, button')) close();
    });
    // phones: swipe sideways for the next shot (the arrow buttons are hidden there)
    let x0: number | null = null;
    lb.addEventListener('touchstart', (e) => (x0 = e.touches.length === 1 ? e.touches[0].clientX : null), { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
    });
    window.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(at - 1);
      else if (e.key === 'ArrowRight') show(at + 1);
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ── install as an app ────────────────────────────────────────────────────────────────────────
initInstallPrompt();
const installBtn = document.getElementById('install-btn') as HTMLButtonElement | null;
const installHelpBox = document.getElementById('install-help');
const androidBtn = document.getElementById('android-btn');
// Android visitors: the app download is the main way in
if (androidBtn && isAndroid()) {
  androidBtn.classList.add('primary');
  const cta = document.getElementById('cta-get');
  if (cta) cta.textContent = 'Get the Android app';
}
function refreshInstall() {
  if (!installBtn || !installHelpBox) return;
  if (isStandalone()) {
    installBtn.hidden = true;
    if (androidBtn) androidBtn.hidden = true;
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
        : how === 'android'
          ? 'Or in Chrome: open the game, then menu ⋮ → <b>Install app</b>.'
          : 'Open the game, then use your browser’s menu → <b>Install app</b> (Chrome, Edge).';
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
        .map(([label, plat, a]) => `<a class="button ${plat === os ? 'primary' : ''}" href="${a!.browser_download_url}"><span aria-hidden="true">⬇</span> ${label} <span class="size">${(a!.size / 1e6).toFixed(0)} MB</span></a>`)
        .join('') + `<a class="hint" href="${rel.html_url}">${escapeHtml(rel.tag_name)} release notes</a>`;
  } catch {
    // the GitHub API is rate-limited (60 requests/hour per address): fall back to the Releases page
    box.innerHTML = `<a class="button primary" href="https://github.com/${REPO}/releases/latest"><span aria-hidden="true">⬇</span> Download for Windows, macOS or Linux</a><span class="hint">Opens the latest release on GitHub.</span>`;
  }
}
void desktopLinks();

void registerServiceWorker(() => {
  /* the landing page simply picks up new versions on the next visit */
});
