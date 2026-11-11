// A still of every menu-tour shot at three moments: the raw material, to choose the trailer's shots from.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, bootGame } from './cdp.mjs';
const OUT = path.resolve(process.argv[2] ?? 'survey');
fs.mkdirSync(OUT, { recursive: true });
const page = await openPage({ width: 1920, height: 1080 });
await bootGame(page);
const { js, step, save } = page;
await js(`document.getElementById('ui').style.visibility = 'hidden'`);
const n = await js(`(() => { const T = game.tour; let n = 0; const seen = new Set(); T.index = -1; return 23; })()`);
for (let i = 0; i < n; i++) {
  const t0 = Date.now();
  const info = await js(`(() => { const T = game.tour; T.index = ${i} - 1; T.nextShot(false); T.running = true; return game.tourCaption; })()`);
  for (const [k, frames] of [['a', 150], ['b', 210], ['c', 210]]) {
    await step(frames);
    await js('game.stage.fade = 0; game.stage.arrive = 0; __step(16.7)');
    await save(path.join(OUT, `${String(i).padStart(2, '0')}${k}.jpg`), 'jpeg', 88);
  }
  console.log(i, info, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await page.close();
process.exit(0);
