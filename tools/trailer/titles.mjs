// Renders an edit's titles (plan.mjs) as a run of transparent PNGs, one a frame, drawn by titles.html in Chrome
// with the game's typeface and logo. Frames that repeat the one before are linked, not drawn again.
// usage: node titles.mjs <edit|all> [--fps 60] [--frame seconds  → one PNG to look at, over black]
import fs from 'node:fs';
import path from 'node:path';
import { openPage, BASE, sleep } from './cdp.mjs';
import { EDITS } from './plan.mjs';

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const FPS = +(flag('--fps') ?? 60);
const one = flag('--frame');
const HOME = path.join(process.env.HOME, '.cache/kardashev-marketing');
const names = args[0] === 'all' || !args[0] ? Object.keys(EDITS) : args[0].split(',');

/** The stretches where an interface shot is on screen (the read-out hides there). */
export const hudSpans = (ed) => ed.clips.filter((c) => c[0].startsWith('hud-')).map((c) => [c[1], c[2]]);

for (const name of names) {
  const ed = EDITS[name];
  const tall = ed.view === 'tall';
  const [w, h, scale] = tall ? [1080, 1920, 1] : [1920, 1080, 4 / 3];
  const page = await openPage({ width: w, height: h, scale, url: `${BASE}/tools/trailer/titles.html`, shim: false, transparent: !one });
  for (let i = 0; i < 100; i++) { await sleep(100); try { if (await page.js('typeof window.setup === "function"')) break; } catch {} }
  await page.js(`window.setup(${JSON.stringify({ titles: ed.titles, k: ed.k ?? null, length: ed.length, hud: hudSpans(ed) })}, ${tall})`);
  if (one !== null) {
    const times = one.split(',').map(Number);
    for (const t of times) {
      await page.js(`document.body.style.background = '#223'; window.draw(${t})`);
      const file = path.join(HOME, 'x', `title-${name}-${t}.jpg`);
      const r = await page.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: w, height: h, scale: tall ? 0.5 : 0.5 } });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log(file);
    }
    await page.close();
    continue;
  }
  const dir = path.join(HOME, 'titles', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(ed.length * FPS);
  const t0 = Date.now();
  let last = null, lastFile = null, drawn = 0, blank = null;
  for (let f = 0; f < n; f++) {
    const sig = await page.js(`window.draw(${f / FPS})`);
    const file = path.join(dir, String(f).padStart(5, '0') + '.png');
    if (sig === last && lastFile) { fs.linkSync(lastFile, file); continue; }
    if (sig === '' && blank) { fs.linkSync(blank, file); last = sig; lastFile = blank; continue; }
    const { data } = await page.cdp('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    drawn++;
    last = sig;
    lastFile = file;
    if (sig === '') blank = file;
  }
  console.log(`${name}: ${n} frames (${drawn} drawn) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.close();
}
process.exit(0);
