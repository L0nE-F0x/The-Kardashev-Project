import '../ui/base.css';
import './landing.css';
import mapUrl from '../content/generated/worldmap.bin?url';
import { syncCssVars } from '../render/palette';
import { decodeWorldMap } from '../world/mapData';
import { subsolar } from '../world/sun';
import { iconUrl, type IconName } from '../ui/icons';
import { RELEASES, APP_VERSION } from '../content/changelog';

const REPO = 'L0nE-F0x/The-Kardashev-Project';

syncCssVars();
// scroll reveals and the other progressive touches only switch on when the script runs
document.documentElement.classList.add('js');

// ── the game's own icons in the feature cards ────────────────────────────────────────────────
document.querySelectorAll<HTMLImageElement>('img[data-icon]').forEach((img) => {
  img.src = iconUrl(img.dataset.icon as IconName);
});

// ── starfield background: a tile of soft points, a few of them warm ───────────────────────────
{
  const W = 640;
  const H = 480;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (g) {
    let h = 1977;
    const rnd = () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
    for (let i = 0; i < 150; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const k = rnd();
      const r = k > 0.94 ? 1.25 : k > 0.6 ? 0.85 : 0.6;
      g.globalAlpha = k > 0.94 ? 0.95 : k > 0.6 ? 0.6 : 0.34;
      g.fillStyle = k > 0.94 ? '#fff1c9' : k > 0.6 ? '#d7e6ff' : '#9a94b8';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    document.body.style.setProperty('--stars', `url(${c.toDataURL()})`);
  }
}

// ── the spinning Earth: the game's own globe, with the sun where it really is right now ───────
// (baking its textures takes a second or so of the main thread, so it waits until the page is idle; until then a
// dark planet stands in its place, and the lit one fades in over it. Without WebGL: a still of the same globe.)
async function spinGlobe() {
  const canvas = document.getElementById('globe') as HTMLCanvasElement | null;
  const shade = document.getElementById('globe-shade');
  if (!canvas) return;
  const still = () => {
    const img = new Image();
    img.className = 'globe-still';
    img.alt = 'The Earth from space: the game’s globe';
    img.src = './globe.png';
    canvas.replaceWith(img);
    shade?.remove();
  };
  try {
    const buf = await (await fetch(mapUrl)).arrayBuffer();
    const lods = decodeWorldMap(buf);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = { lon: subsolar(new Date()).lon + 40 }; // start with the terminator in view
    await new Promise<void>((done) => ('requestIdleCallback' in window ? window.requestIdleCallback(() => done(), { timeout: 1200 }) : setTimeout(done, 300)));
    const { spinGlobe3d } = await import('./globe3d');
    // the coarser map is plenty at this size and bakes in half the time
    if (!spinGlobe3d(canvas, lods[0], reduced, view)) return still();
    const done = () => shade?.remove();
    canvas.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 2000);
  } catch {
    still();
  }
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

// ── downloads from the latest GitHub release: one card per system, yours lit ─────────────────────
interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}
type Os = 'windows' | 'mac' | 'linux';

function osOf(): Os | null {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return null;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua) && navigator.maxTouchPoints < 2) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return null;
}

const OS_NAME: Record<Os, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

async function desktopLinks() {
  const boxes = [...document.querySelectorAll<HTMLElement>('[data-links]')];
  if (!boxes.length) return;
  const os = osOf();
  const releases = `https://github.com/${REPO}/releases/latest`;
  if (os) document.querySelector(`.get-card[data-os="${os}"]`)?.classList.add('featured');
  const cta = document.getElementById('cta-get') as HTMLAnchorElement | null;
  const ctaLabel = document.getElementById('cta-get-label');
  if (os && ctaLabel) ctaLabel.textContent = `Download for ${OS_NAME[os]}`;
  const note = document.getElementById('release-note');
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(String(res.status));
    const rel = (await res.json()) as { tag_name: string; assets: Asset[]; html_url: string };
    const pick = (re: RegExp) => rel.assets.find((a) => re.test(a.name));
    const items: Record<Os, [string, Asset | undefined][]> = {
      windows: [['Installer (.exe)', pick(/\.exe$/i) ?? pick(/\.msi$/i)]],
      mac: [['Disk image (.dmg)', pick(/\.dmg$/i)]],
      linux: [
        ['AppImage', pick(/\.AppImage$/i)],
        ['.deb package', pick(/\.deb$/i)],
      ],
    };
    if (!Object.values(items).some((list) => list.some((i) => i[1]))) throw new Error('no assets');
    for (const box of boxes) {
      const plat = box.dataset.links as Os;
      const avail = items[plat].filter((i) => i[1]);
      box.innerHTML = avail.length
        ? avail
            .map(([label, a], i) => `<a class="button ${i === 0 && plat === os ? 'primary' : ''}" href="${a!.browser_download_url}"><span aria-hidden="true">⬇</span> ${label} <span class="size">${(a!.size / 1e6).toFixed(0)} MB</span></a>`)
            .join('')
        : `<a class="button" href="${rel.html_url}">See the release on GitHub</a>`;
    }
    if (note) note.innerHTML = `Latest: <a href="${rel.html_url}">${escapeHtml(rel.tag_name)} release notes</a>`;
    // the hero's button goes straight to your system's download
    const mine = os ? items[os].find((i) => i[1])?.[1] : undefined;
    if (cta && mine) cta.href = mine.browser_download_url;
  } catch {
    // the GitHub API is rate-limited (60 requests/hour per address): fall back to the Releases page
    for (const box of boxes) box.innerHTML = `<a class="button ${box.dataset.links === os ? 'primary' : ''}" href="${releases}"><span aria-hidden="true">⬇</span> Download</a>`;
    if (note) note.textContent = 'The buttons open the latest release on GitHub.';
  }
}
void desktopLinks();

// ── the web game is gone (v0.12): drop what its installable app left in this browser ──────────────
// (public/sw.js replaces the old service worker and removes itself; this covers a visit that comes here first)
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((rs) => rs.forEach((r) => void r.unregister()))
    .catch(() => {});
  if ('caches' in window) void caches.keys().then((ks) => ks.forEach((k) => void caches.delete(k))).catch(() => {});
}
