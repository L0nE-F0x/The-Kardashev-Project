// The build menu's pictures: every facility type as the game's own 3D piece, shot in the piece lab in warm
// morning light and saved as a small WebP in src/assets/build/ (ui/buildArt.ts hands them to the interface).
//
//   node tools/thumbs.mjs [type…]        (all types when none is named)
//
// Needs the dev server and the headless Chrome of CLAUDE.md's "QA" (CDP= / BASE= point elsewhere) and ImageMagick.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openPage, sleep, BASE } from './trailer/cdp.mjs';

const OUT = fileURLToPath(new URL('../src/assets/build/', import.meta.url));
// [plot columns, plot rows] a type takes (a plot is 28 × 26 with a gap of 4), and how the camera stands
const PLOTS = { reactor: [1, 2], fab: [1, 2], campus: [2, 2] };
const VIEW = { wind: { k: 0.82, y: 12 }, reactor: { k: 0.8, y: 9 }, restart: { k: 0.92, y: 7 }, fab: { k: 0.8, y: 4 }, campus: { k: 0.86, y: 5 }, solar: { y: 0 }, battery: { y: 0 } };
const ALL = ['hq', 'datacenter', 'solar', 'wind', 'battery', 'gas', 'lab', 'hydro', 'geothermal', 'restart', 'smr', 'reactor', 'packaging', 'fab', 'campus'];
const types = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const W = 420, H = 280;

const page = await openPage({ width: W, height: H, scale: 2, shim: false, url: `${BASE}/play/lab.html?piece=lab&noperson=1&backdrop=temperate` });
for (let i = 0; i < 300; i++) { await sleep(100); if (await page.js('!!window.labReady').catch(() => false)) break; }
fs.mkdirSync(OUT, { recursive: true });
for (const type of types) {
  const [cols, rows] = PLOTS[type] ?? [1, 1];
  const w = cols * 28 + (cols - 1) * 4, d = rows * 26 + (rows - 1) * 4;
  const v = VIEW[type] ?? {};
  const size = await page.js(`lab.show({ piece: ${JSON.stringify(type)}, w: ${w}, d: ${d}, backdrop: 'temperate', alt: 30, az: -58 })`);
  if (!size) { console.error('no piece for', type); continue; }
  // stand back far enough for the plot, look a little above the ground for a tall piece
  const dist = Math.max(w, d * 1.15, size.h * 2.4) * 1.72 * (v.k ?? 1);
  await page.js(`(() => { const { camera, controls } = lab; controls.target.set(0, ${v.y ?? Math.min(8, size.h * 0.32)}, ${d > 30 ? 2 : 1}); camera.position.setFromSphericalCoords(${dist}, 0.98, -0.62).add(controls.target); controls.update(); return 1; })()`);
  await sleep(1600);
  const png = await page.shot('png');
  const webp = execFileSync('magick', ['-', '-resize', `${W}x${H}`, '-quality', '84', 'webp:-'], { input: png, maxBuffer: 1 << 28 });
  fs.writeFileSync(`${OUT}${type}.webp`, webp);
  console.log(type, `${w}x${d}`, 'h', size.h.toFixed(1), `${(webp.length / 1024).toFixed(1)} KB`);
}
await page.close();
process.exit(0);
