// A small Chrome DevTools client for the marketing capture: one page, a virtual clock, screenshots.
// The Chrome it talks to is the headless one on the real GPU (see CLAUDE.md, "QA"); CDP= points elsewhere.
import fs from 'node:fs';

export const CDP = process.env.CDP ?? 'http://127.0.0.1:9333';
export const BASE = process.env.BASE ?? 'http://127.0.0.1:5317';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The page's clock, replaced before any script runs: requestAnimationFrame, performance.now and the Date only move
 * when `__step(ms)` is called, so every recorded frame is exactly one frame of game time however long it took.
 */
const SHIM = `(() => {
  let vt = 0, ids = 0, q = new Map();
  window.__dateBase = Date.now();
  performance.now = () => vt;
  const Real = Date;
  Real.now = () => window.__dateBase + vt;
  // (a bare "new Date()" too: the globe and the orbit view read where the Sun stands from it)
  window.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now()); } };
  window.requestAnimationFrame = (cb) => { q.set(++ids, cb); return ids; };
  window.cancelAnimationFrame = (id) => { q.delete(id); };
  window.__vt = () => vt;
  window.__step = (ms) => { vt += ms; const cbs = [...q.values()]; q = new Map(); for (const cb of cbs) { try { cb(vt); } catch (e) { window.__errs = (window.__errs ?? 0) + 1; window.__lastErr = String(e?.stack ?? e).slice(0, 600); console.error('frame', e); } } };
})();`;

export async function openPage({ width = 1920, height = 1080, scale = 1, url = `${BASE}/play/`, shim = true, transparent = false, attach = null } = {}) {
  // attach = the id of a tab opened earlier (kept open between runs while directing shots)
  const t = attach ? (await (await fetch(`${CDP}/json/list`)).json()).find((x) => x.id === attach) : await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  if (!t) throw new Error('no such tab: ' + attach);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let mid = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails?.exception?.description?.slice(0, 300);
      errors.push(d);
      if (!process.env.QUIET) console.error('page exception:', d);
    }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++mid; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 120)} → ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  const size = (w, h, s = 1) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s, mobile: false });
  if (!attach) await size(width, height, scale);
  if (transparent) await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  if (!attach) {
    if (shim) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
    await cdp('Page.navigate', { url });
  }
  const shot = async (format = 'jpeg', quality = 96) => Buffer.from((await cdp('Page.captureScreenshot', format === 'png' ? { format: 'png', optimizeForSpeed: true } : { format, quality })).data, 'base64');
  const save = async (file, format = file.endsWith('.png') ? 'png' : 'jpeg', quality = 92) => fs.writeFileSync(file, await shot(format, quality));
  const step = (n = 1, ms = 1000 / 60) => js(`for (let i = 0; i < ${n}; i++) __step(${ms})`);
  const close = async () => { try { await fetch(`${CDP}/json/close/${t.id}`); } catch {} ws.close(); };
  const detach = () => ws.close();
  return { cdp, js, shot, save, step, size, close, detach, errors, id: t.id };
}

/** Wait for the game to be on its title screen with the tour running, then load the modules the shots use. */
export async function bootGame(page, { quality = 'high' } = {}) {
  const { js, step } = page;
  for (let i = 0; i < 600; i++) {
    await sleep(100);
    try { await step(1); if (await js('!!(window.game && window.game.tour && window.game.mode === "title")')) break; } catch {}
    if (i === 599) throw new Error('the game did not start');
  }
  await js(`(async () => {
    const g = window.game;
    g.updateSettings({ tips: false, fps: false, quality3d: ${JSON.stringify(quality)}, dayNight: true, master: 0 });
    const [sc, st, tk, sites, a4, a5] = await Promise.all([
      import('/src/game/showcase.ts'), import('/src/sim/state.ts'), import('/src/sim/tick.ts'), import('/src/content/sites.ts'),
      import('/src/sim/planetPreview.ts'), import('/src/sim/systemPreview.ts'),
    ]);
    window.__mods = { sc, st, tk, sites, a4, a5 };
    return true;
  })()`);
  await step(20);
}
