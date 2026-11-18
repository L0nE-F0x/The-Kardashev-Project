// One long-lived game page in the QA Chrome, driven by a script read from stdin. The script is the body of an async
// function with these in hand:
//   page            Playwright's page (real clicks and keys: page.click, page.keyboard.press, …)
//   ev(fn, arg)     page.evaluate
//   shot(name, o)   a PNG in OUT (default: the OS temp dir)/<name>.png
//   sleep(ms)
//   days(n, { bot, stopOnCard })   tick n game days in the page, with the test bots as the player's hands if asked
//   SCAN            the source of scan.js (page.evaluate(SCAN) → what is wrong on screen)
//   OUT             where pictures and logs go
// Whatever it returns is printed; page errors are printed after it.
//
//   PLAYWRIGHT=<playwright's index.mjs> node tools/qa/ui/page.mjs [--fresh] [--size 1920x1080] < script.js
//   CDP=http://127.0.0.1:9222 (the headless Chrome of CLAUDE.md's "QA") · BASE=http://127.0.0.1:5317 (the dev server)
//
// The page is kept between runs (--fresh opens a new one): a script can build on the state the last one left. A change
// to a .ts file does not reach an open page's modules: use --fresh after editing the game.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const size = (args.includes('--size') ? args[args.indexOf('--size') + 1] : '1920x1080').split('x').map(Number);
const BASE = process.env.BASE ?? 'http://127.0.0.1:5317';
const OUT = process.env.OUT ?? path.join(os.tmpdir(), 'kardashev-qa');
fs.mkdirSync(OUT, { recursive: true });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCAN = fs.readFileSync(path.join(HERE, 'scan.js'), 'utf8');
const code = fs.readFileSync(0, 'utf8');

const b = await chromium.connectOverCDP(process.env.CDP ?? 'http://127.0.0.1:9222');
const ctx = b.contexts()[0];
let page = ctx.pages().find((p) => p.url().startsWith(BASE + '/play/') && !p.url().includes('.html'));
if (fresh && page) {
  await page.close();
  page = null;
}
const errs = [];
const hook = (p) => {
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 400));
  });
  p.on('pageerror', (e) => errs.push('pageerror: ' + String(e.stack || e).slice(0, 600)));
};
const ready = () => page.waitForFunction(() => !!window.game && !!window.game.stage && !document.getElementById('boot'), null, { timeout: 120000 });
if (!page) {
  page = await ctx.newPage();
  hook(page);
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.goto(BASE + '/play/', { waitUntil: 'load' });
  await ready();
  await page.waitForTimeout(1500);
} else {
  hook(page);
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.bringToFront();
  await ready();
}
const shot = async (name, opts = {}) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  return file;
};
const sleep = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
/** Tick game days in the page (an automated window's own clock is too slow to wait for). */
const days = (n, opts = {}) =>
  page.evaluate(
    async ({ n, bot, stopOnCard }) => {
      const { tick } = await import('/src/sim/tick.ts');
      const g = window.game;
      const s = g.state;
      const b1 = bot ? (await import('/tests/helpers/act1bot.ts')).botDay1 : null;
      const b4 = bot ? (await import('/tests/helpers/act4bot.ts')).botDay4 : null;
      const b5 = bot ? (await import('/tests/helpers/act5bot.ts')).botDay5 : null;
      let i = 0;
      for (; i < n; i++) {
        if (stopOnCard && s.events.active) break;
        if (bot) {
          if (s.act <= 1) b1(s, g.ctx);
          else if (!s.system) b4(s, g.ctx);
          else b5(s, g.ctx);
        }
        tick(s, g.ctx);
        if (s.meta.gameOver || s.flags.typeI) break;
      }
      g.notify();
      return { ran: i, day: s.day, act: s.act, card: s.events.active?.id ?? null };
    },
    { n, bot: opts.bot ?? false, stopOnCard: opts.stopOnCard ?? false },
  );
try {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const out = await new AsyncFunction('page', 'shot', 'sleep', 'ev', 'days', 'SCAN', 'OUT', code)(page, shot, sleep, ev, days, SCAN, OUT);
  if (out !== undefined) console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
} catch (e) {
  console.log('SCRIPT ERROR', e.stack?.split('\n').slice(0, 6).join('\n'));
}
if (errs.length) console.log('PAGE ERRORS:\n' + [...new Set(errs)].join('\n'));
await b.close();
